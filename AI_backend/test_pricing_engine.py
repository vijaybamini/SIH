"""
Validation test suite for pricing_engine.py (v3).

Per the spec: these test cases exist ONLY to validate the engine — nothing here
is hardcoded into pricing_engine.py itself. The engine takes arbitrary
commodity/quantity/origin/destination/distance/backhaul/reefer inputs; this
script just exercises it with the 10 required scenarios plus boundary checks
and prints a summary table + a set of automated correctness checks.
"""
import math
from pricing_engine import PricingEngine

engine = PricingEngine("pricing_config.json")
results = []   # (test_name, Quote)


def run(name, **kwargs):
    q = engine.price_trip(**kwargs)
    results.append((name, q))
    return q


# ---------------------------------------------------------------------------
# Section 21 — the 10 required tests
# ---------------------------------------------------------------------------

run("T1 small veg", commodity="vegetables", shipment_weight_kg=500, distance_km=50,
    pickup="Village mandi", destination="Nearby town", corridor_type="established")

run("T2 2t veg (bug check)", commodity="vegetables", shipment_weight_kg=2000, distance_km=145,
    pickup="Warangal", destination="Hyderabad", corridor_type="established")

run("T3 5t fruit 200km", commodity="fruits", shipment_weight_kg=5000, distance_km=200,
    pickup="Origin", destination="Destination", corridor_type="established")

run("T4 8t fruit reefer", commodity="fruits", shipment_weight_kg=8000, distance_km=650,
    pickup="Anantapur", destination="Bengaluru", corridor_type="thin")

run("T5 rice+backhaul", commodity="rice", shipment_weight_kg=15000, distance_km=550,
    pickup="Karimnagar", destination="Chennai", backhaul_available=True, corridor_type="established")

run("T6 rice no-backhaul", commodity="rice", shipment_weight_kg=15000, distance_km=550,
    pickup="Karimnagar", destination="Chennai", backhaul_available=False, corridor_type="established")

# T7: exactly at each vehicle's safe capacity (max_util = 90%)
for vclass, payload in [("mini_lcv", 2500), ("medium_lcv", 9000), ("heavy_10w", 20000), ("multi_axle", 32000)]:
    safe_cap = payload * 0.90
    commodity = "rice" if vclass in ("medium_lcv", "heavy_10w", "multi_axle") else "vegetables"
    run(f"T7 @safe-cap {vclass}", commodity=commodity, shipment_weight_kg=safe_cap, distance_km=200,
        pickup="A", destination="B", corridor_type="established")

# T8: 1kg above the LARGEST class's safe capacity -> must trigger multi-trip
largest_safe_cap = 32000 * 0.90
run("T8 multi_axle+1kg", commodity="rice", shipment_weight_kg=largest_safe_cap + 1, distance_km=300,
    pickup="A", destination="B", corridor_type="established")

run("T9 long reefer", commodity="fruits", shipment_weight_kg=12000, distance_km=1200,
    pickup="Kashmir Valley", destination="Chennai", corridor_type="thin", backhaul_available=False)

# T10: force an economically-difficult route — tiny shipment, long distance, no backhaul,
# thin corridor -> operating cost (esp. driver/second-driver + full return recovery) should
# push cost_floor above market_freight_high for a small mini_lcv load.
run("T10 econ. difficult", commodity="vegetables", shipment_weight_kg=300, distance_km=900,
    pickup="Remote village", destination="Distant city", corridor_type="thin", backhaul_available=False)


# ---------------------------------------------------------------------------
# Section 22 — summary table
# ---------------------------------------------------------------------------

cols = ["Test", "Weight", "Distance", "Vehicle", "Capacity", "Util%", "Trips", "Reefer",
        "OpCost", "MktLow", "MktMid", "MktHigh", "CostFloor", "RecFreight",
        "DrvMargin%", "PlatFee", "CustPrice", "Price/km", "MktPos", "Warnings"]
widths = [18, 8, 9, 11, 9, 6, 5, 7, 9, 8, 8, 8, 9, 10, 10, 8, 10, 9, 24, 6]

def fmt_row(vals):
    return " | ".join(str(v).ljust(w)[:w] for v, w in zip(vals, widths))

print(fmt_row(cols))
print("-" * (sum(widths) + 3 * (len(widths) - 1)))
for name, q in results:
    print(fmt_row([
        name, f"{q.shipment_weight_kg:.0f}", f"{q.road_distance_km:.0f}", q.vehicle_class,
        f"{q.vehicle_capacity_kg:.0f}", f"{q.vehicle_utilization_pct:.1f}", q.trips_required,
        "Y" if q.is_reefer else "N", f"{q.total_operating_cost:.0f}",
        f"{q.market_freight_low:.0f}", f"{q.market_freight_mid:.0f}", f"{q.market_freight_high:.0f}",
        f"{q.cost_floor:.0f}", f"{q.recommended_freight:.0f}", f"{q.driver_margin_pct:.1f}",
        f"{q.platform_commission:.0f}", f"{q.customer_pays:.0f}", f"{q.customer_price_per_km:.1f}",
        q.market_position, len(q.warnings),
    ]))

print()
for name, q in results:
    if q.warnings:
        print(f"[{name}] warnings:")
        for w in q.warnings:
            print(f"    - {w}")


# ---------------------------------------------------------------------------
# Section 22 — the 12 automated validation checks
# ---------------------------------------------------------------------------

print("\n" + "=" * 78)
print("VALIDATION CHECKS")
print("=" * 78)

vsel_cfg = engine.cfg["vehicle_selection"]
max_util = engine._v(vsel_cfg["maximum_utilization_pct"]) / 100.0

check_results = []

def check(n, desc, ok):
    check_results.append(ok)
    print(f"{n:>2}. [{'PASS' if ok else 'FAIL'}] {desc}")

# 1. No shipment exceeds vehicle safe capacity
ok = all((q.trips_required > 1) or (q.shipment_weight_kg <= q.vehicle_capacity_kg * max_util + 1e-6)
         for _, q in results)
check(1, "No single-trip shipment exceeds its vehicle's safe capacity (90%)", ok)

# 2. No reefer shipment assigned to a non-reefer vehicle
ok = all((not q.is_reefer) or (q.vehicle_class in ("reefer_medium", "reefer_heavy")) for _, q in results)
check(2, "Every reefer-required shipment uses an actual reefer vehicle class", ok)

# 3. No return cost double-counted: return_cost should equal recovery_frac * (sum of full return legs)
ok = True
for _, q in results:
    full_return = (q.return_fuel_cost + q.return_driver_cost + q.return_toll_cost +
                   q.return_maintenance_cost + q.return_depreciation_cost)
    expected = full_return * q.return_recovery_fraction
    if abs(expected - q.return_cost) > 1.0:
        ok = False
check(3, "Return cost = recovery_fraction x (full return leg), computed once, not doubled", ok)

# 4. Reefer fuel penalty applied once (forward fuel / (distance/mileage_loaded x diesel) == expected penalty)
ok = True
diesel = engine._v(engine.cfg["fuel"]["diesel_price_per_litre"])
for _, q in results:
    if q.is_reefer:
        vcfg = engine._resolve_class(q.vehicle_class)
        mileage = engine._v(vcfg["mileage_loaded_kmpl"])
        base_fuel = (q.road_distance_km / mileage) * diesel
        implied_penalty = q.forward_fuel_cost / base_fuel if base_fuel else 1.0
        expected_penalty = 1 + engine._v(engine.cfg["reefer"]["fuel_penalty_pct"]) / 100.0
        if abs(implied_penalty - expected_penalty) > 0.01:
            ok = False
check(4, "Reefer fuel penalty applied exactly once (matches configured fuel_penalty_pct)", ok)

# 5. Platform commission applied once: customer_pays == recommended_freight + commission (or == minimum_fare)
ok = all(abs(q.customer_pays - (q.recommended_freight + q.platform_commission)) < 1.0 or q.minimum_fare_applied
         for _, q in results)
check(5, "Platform commission applied exactly once (customer_pays = recommended_freight + commission)", ok)

# 6. Driver margin never below configured minimum
min_margin_pct = engine._v(engine.cfg["pricing_model"]["minimum_driver_margin_pct"])
ok = all(q.driver_margin_pct >= min_margin_pct - 0.05 for _, q in results)
check(6, f"Driver margin % never falls below the configured minimum ({min_margin_pct}%)", ok)

# 7. Market pricing mechanism: prove the market_weight=0.70 blend CAN lift
#    recommended_freight above cost_floor when the underlying economics allow it
#    (isolated with a synthetic cheap-diesel override), separately from whether
#    any of the 10 REQUIRED tests above happen to land in that regime.
_synthetic = engine.price_trip(commodity="rice", shipment_weight_kg=15000, distance_km=550,
                                pickup="A", destination="B", backhaul_available=True,
                                corridor_type="established", diesel_price_override=20.0)
ok = _synthetic.recommended_freight > _synthetic.cost_floor + 0.5
check(7, "Market blend formula is mechanically correct: lifts recommended_freight above "
         "cost_floor once cost_floor < market_mid (proven with a synthetic low-diesel case, "
         "since none of the 10 required tests reach that regime under real sourced costs — see summary)", ok)

# 8. Operating cost remains visible separately (not merged into customer_pays)
ok = all(q.total_operating_cost > 0 and q.total_operating_cost != q.customer_pays for _, q in results)
check(8, "Operating cost is reported as a distinct figure from customer_pays", ok)

# 9. Small shipments respect minimum fare
small = next(q for n, q in results if n == "T1 small veg")
min_fare = engine._v(engine.cfg["platform"]["minimum_fare"])
check(9, f"Small shipment (T1) respects minimum fare (customer_pays {small.customer_pays:.0f} >= {min_fare})",
      small.customer_pays >= min_fare - 0.5)

# 10. Oversized shipments create multiple trips
t8 = next(q for n, q in results if n == "T8 multi_axle+1kg")
check(10, f"Shipment 1kg over the largest vehicle's safe capacity triggers multi-trip (trips_required={t8.trips_required})",
      t8.trips_required > 1)

# 11. Market-vs-cost conflicts explicitly flagged
t10 = next(q for n, q in results if n == "T10 econ. difficult")
check(11, f"Economically difficult route (T10) flags ABOVE_MARKET_REQUIRED / MARKET_BELOW_COST_FLOOR "
          f"(status={t10.market_vs_cost_status})",
      t10.market_vs_cost_status == "ABOVE_MARKET_REQUIRED" and
      any("MARKET_BELOW_COST_FLOOR" in w for w in t10.warnings))

# 12. No test-specific hardcoded logic in the engine (structural check: engine module has no
#     literal references to the test pickup/destination strings or test-specific weights)
import inspect
engine_src = inspect.getsource(PricingEngine)
suspicious_tokens = ["Warangal", "Hyderabad", "Anantapur", "Bengaluru", "Karimnagar", "Chennai",
                      "Kashmir", "2000", "8000", "15000", "T1 ", "T2 ", "T3 ", "T4 ", "T5 ", "T10"]
ok = not any(tok in engine_src for tok in suspicious_tokens)
check(12, "pricing_engine.py contains no test-specific hardcoded values/locations", ok)

print("\n" + ("ALL CHECKS PASSED" if all(check_results) else
              f"{sum(check_results)}/{len(check_results)} CHECKS PASSED — see FAIL lines above"))

# ---------------------------------------------------------------------------
# Diagnostic: why does cost_floor exceed market_high in every one of the 10
# required tests? Quantify the two largest contributors on a representative case.
# ---------------------------------------------------------------------------
print("\n" + "=" * 78)
print("DIAGNOSTIC: why recommended_freight == cost_floor in all 10 required tests")
print("=" * 78)
rep = next(q for n, q in results if n == "T5 rice+backhaul")
print(f"Representative case (T5, 15t rice, 550km, backhaul available, heavy_10w):")
print(f"  Total operating cost: ₹{rep.total_operating_cost:,.0f}")
print(f"  Fuel:   ₹{rep.fuel_cost:>7,.0f}  ({rep.fuel_cost/rep.total_operating_cost*100:4.1f}% of cost) "
      f"— @ ₹{engine._v(engine.cfg['fuel']['diesel_price_per_litre']):.0f}/L (Hyderabad, ~6-8% above national avg)")
print(f"  Driver: ₹{rep.driver_cost:>7,.0f}  ({rep.driver_cost/rep.total_operating_cost*100:4.1f}% of cost) "
      f"— includes a second-driver doubling past {engine._v(engine.cfg['driver']['second_driver_distance_threshold_km'])}km one-way")
print(f"  Market mid for this vehicle/distance: ₹{rep.market_freight_mid:,.0f}  |  "
      f"cost_floor: ₹{rep.cost_floor:,.0f}  (+{(rep.cost_floor/rep.market_freight_mid-1)*100:.0f}% over market mid)")
print("  A synthetic low-diesel test (see check 7) confirms the 70/30 market/cost blend formula")
print("  is mechanically correct and WILL lift price above cost_floor once cost_floor < market_mid.")
print("  Under the real sourced parameters, it never does across these 10 tests — fuel cost (driven by")
print("  the regional diesel price) and the second-driver policy on any 500km+ leg are the two largest")
print("  levers pushing operating cost above the configured market bands. See README 'Known calibration")
print("  gap' section.")
