# Agri-Commodity Transport Pricing System (India) — v3

Files:
- `pricing_engine.py` — the engine. No hardcoded rupee values; everything tunable lives in config.
- `pricing_config.json` — every parameter, each tagged `observed` / `researched_estimate` / `assumption` / `business_decision`, with source and date where applicable.
- `test_pricing_engine.py` — the 10 required validation tests + boundary tests + a results table + 12 automated correctness checks. Nothing in `pricing_engine.py` references these tests; run `python3 test_pricing_engine.py` any time to re-validate after a config change.

## Commercial logic (v3)

```
ROAD DISTANCE
     |
VEHICLE SELECTION      required_capacity_kg = shipment_weight_kg / 0.90
     |                 smallest class where max_payload_kg >= required_capacity_kg
CAPACITY / TRIPS        AND (max_payload_kg - shipment_weight_kg) >= 100kg headroom
     |                 -> if nothing fits, split into N trips, price ONE trip, warn
OPERATING COST         fuel + driver + toll + maintenance + depreciation, each split
     |                 forward (100%) vs. return (recovery_pct%, computed once)
     |                 + loading/unloading (capped vs. market) + insurance + permits
  .--+--.
  v     v
MARKET  COST_FLOOR     market_benchmark = market_mid_rate x distance (published band)
FREIGHT                cost_floor = operating_cost x (1 + minimum_driver_margin_pct)
  '--+--'
     v
RECOMMENDED FREIGHT    = max(market_weight*market_benchmark + cost_weight*cost_floor,
                              cost_floor)                          <- 0.70 / 0.30, never below floor
     |
DRIVER PAYOUT          = recommended_freight (margin reported, not re-clamped)
     |
PLATFORM 10%           platform_commission = recommended_freight x 10%
     |
CUSTOMER PRICE         customer_pays = recommended_freight + platform_commission
     |
MARKET COMPETITIVENESS compares recommended_freight/km (NOT customer_pays/km) to the
                        published market band — commission can't distort this read
```

## What changed from the previous version

1. **Vehicle selection**: `required_capacity_kg = shipment_weight_kg / 0.90`; a class qualifies only if its *rated* `max_payload_kg` covers that, with a 100kg headroom check. A vehicle's capacity is never reported as smaller than what it's actually carrying. Verified against the exact 2,000kg case in the bug report — see "Verification" below.
2. **Reefer selection**: reefer vehicles go through the identical capacity math on their own size ladder (`reefer_medium` → `reefer_heavy`), so an 8-tonne fruit shipment correctly lands on `reefer_heavy` (required capacity 8,889kg > `reefer_medium`'s 8,500kg cap), not a 7T reefer used past its rated limit.
3. **Pricing formula**: replaced with the exact form specified — `market_benchmark` is the published mid rate × distance (no adjustment deltas), blended 70/30 with `cost_floor`, floored so it never drops below `cost_floor`. `driver_payout = recommended_freight` directly (margin is reported, not forced to a target or clamped to a max — those are now reference-only figures).
4. **Market-vs-cost transparency**: `cost_floor > market_freight_high` → `market_vs_cost_status = ABOVE_MARKET_REQUIRED` and an explicit `MARKET_BELOW_COST_FLOOR` warning. `cost_floor` between market low and high → `TIGHT`. Otherwise → `VIABLE`.
5. **Market comparison** now checks `recommended_freight_per_km` against the published band — not `customer_pays`, which includes the platform's 10% on top and would otherwise make every quote look more "above market" than the underlying freight price actually is.
6. **Cost line granularity**: maintenance and depreciation are now two separate reported lines (previously combined); insurance and permits are two separate lines (previously one "other" bucket); forward/return breakdown is exposed for fuel, driver, toll, maintenance, and depreciation individually, plus `return_recovery_fraction`.
7. **Empty-return keys renamed exactly as specified**: `no_backhaul` (0%, used when `backhaul_available=True`), `established_corridor` (15%), `thin_corridor` (30%, down from the old 50% assumption), `default` (30%), with a hard 50% safety clamp.
8. **Heavy-vehicle mileage revised upward**: `heavy_10w` loaded mileage moved from 3.5 to 4.5 km/l, `multi_axle` from 2.5 to 3.5 km/l, per the instruction that the single earlier source (BiggWheels, ~3.5 km/l) was on the pessimistic end of operator-reported ranges. Flagged in config as an adjusted assumption, not a newly-observed figure — I did not find a second independent source in this pass to fully corroborate 4.0-5.0 km/l for loaded 16-20T operation.
9. **Platform commission**: 12% → 10%, as instructed.

## Verification

```
$ python3 -c "
from pricing_engine import PricingEngine
engine = PricingEngine('pricing_config.json')
q = engine.price_trip(commodity='vegetables', shipment_weight_kg=2000, distance_km=145,
                       pickup='Warangal', destination='Hyderabad', corridor_type='established')
print(q.vehicle_class, q.vehicle_capacity_kg, q.vehicle_utilization_pct)
"
mini_lcv 2500 80.0
```
2,000kg requires 2,222kg of rated capacity (2,000 / 0.90); `mini_lcv`'s true rated capacity is 2,500kg, which covers that with an 80% utilization and a 500kg headroom — a legitimate, non-buggy fit. It is **not** the old bug, where the vehicle's *displayed* capacity (1,500kg) was smaller than what was actually being loaded onto it. If your mental model of "1.5T mini truck" expects a firm 1,500-2,000kg ceiling rather than 2,500kg, that's a vehicle-spec question (see `vehicle_classes.mini_lcv.max_payload_kg` source note) rather than a selection-logic bug — the logic itself is now capacity-correct given whatever rated figure the config holds.

## Known calibration gap (read before treating any number as final)

Running the 10 required tests, `market_vs_cost_status` comes back `ABOVE_MARKET_REQUIRED` (with a `MARKET_BELOW_COST_FLOOR` warning) in **all 10**, including the ones that should be the easiest to price competitively — e.g. Test 5 (15t rice, 550km, backhaul secured, a full heavy 10-wheeler). `recommended_freight` collapses to `cost_floor` every time because `cost_floor` exceeds `market_freight_high` in every test, not just `market_freight_mid`.

I checked this isn't a formula bug: a synthetic test with diesel artificially dropped to ₹20/L shows the 70/30 market/cost blend correctly lifts `recommended_freight` above `cost_floor` once `cost_floor` falls below `market_mid` (see `test_pricing_engine.py` check 7 and the diagnostic block at the end of its output). Under the real, sourced diesel price and cost parameters, that condition just never holds across these 10 scenarios. The two largest contributors, quantified on Test 5:

- **Fuel is ~45% of operating cost**, calculated at ₹104/L (the Hyderabad rate specifically, ~6-8% above the ~₹98/L national average the same day). Using the national-average price instead would close part of the gap but not all of it.
- **The second-driver doubling past 500km one-way is ~18% of operating cost.** This is applied on every long-haul test here (all are ≥550km), and in practice Indian long-haul trucking commonly runs single-driver with rest breaks rather than formally crewing two drivers past a fixed distance threshold — the 500km figure was carried over as a conservative planning assumption, not an observed industry norm (see `driver.second_driver_distance_threshold_km` in config).

I did not adjust either of these unilaterally — both were specified inputs — but they're the first two places I'd point real fleet-cost data at before trusting `recommended_freight` as a genuine market-anchored number rather than a cost-floor-driven one. Until then, every quote this engine produces is honestly telling you "the market band alone doesn't cover this trip's real cost" — which may reflect a genuine feature of thin-margin Indian trucking (informal operators often price below a fully-loaded formal cost model), or may mean the cost side needs retuning. The engine surfaces that ambiguity rather than resolving it silently in either direction.

## Sourced data table

| Parameter | Value used | Type | Source | Date |
|---|---|---|---|---|
| Diesel price, Hyderabad | ₹104.0/L | Observed | The Hans India fuel roundup | 11-Sep-2026 |
| Diesel price, national avg | ₹97.8/L | Observed | Goodreturns | 11-Sep-2026 |
| heavy_10w loaded mileage | 4.5 km/l (adjusted up from 3.5) | Researched estimate (adjusted) | BiggWheels TCO guide (3.5km/l base figure), instruction to use 4.0-5.0 range | 2026 |
| multi_axle loaded mileage | 3.5 km/l (adjusted up from 2.5) | Researched estimate (adjusted) | Same basis | 2026 |
| Truck driver monthly salary (avg) | ₹20,460/month | Observed | Indeed India | 25-May-2026 |
| Long-haul driver bata | ~₹800-1,200/day | Observed | assureshift.in | 2026 |
| Truck maintenance & tyres | ₹2-3/km | Observed | TruckGuru | 2026 |
| Truck EMI/depreciation | ₹20,000-50,000/month | Observed | TruckGuru | 2026 |
| NHAI toll, truck class per plaza | ₹250-400 | Observed (range) | assureshift.in | 2026 |
| Foodgrain hamali wage | ₹28/quintal = ₹280/tonne | Observed | The Hans India (AP Civil Supplies) | Sep-2026 |
| Commercial vehicle insurance | ₹30,000-80,000/yr | Observed (range) | TruckGuru | 2026 |
| Permits/fitness/national permit | ₹15,000-50,000/yr | Observed (range) | TruckGuru | 2026 |
| Platform commission benchmark (BlackBuck) | 10-20% | Observed | Multiple, 2026 | 2026 |
| Reefer fuel/cost premium | 10-15% over standard | Observed (range) | Okararoadways | 2026 |
| Cold-chain vehicle shortfall | ~10,000 in service vs ~62,000 needed | Observed | Rinac/NABCONS, cited in Rinac 2026 guide | 2026 |
| market_rate_per_km bands (all classes) | as supplied | Business decision | Supplied directly for this system | — |
| pricing_model weights, margin bands | as supplied | Business decision | Supplied directly for this system | — |
| empty_return recovery percentages | as supplied | Business decision / assumption | Supplied directly; established/thin corridor % are modelling assumptions | — |

Everything else (handling multipliers, reefer distance thresholds, second-driver threshold, average speed/driving-hours, overhead trip-count) is labelled `assumption` directly in `pricing_config.json` with a note on why no firm source was found.

## Deploy the FastAPI backend to Render

The backend is configured as a Render Web Service with `AI_backend` as its root directory. The repository includes a `render.yaml` Blueprint with the following settings:

```text
Root Directory: AI_backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
Health Check Path: /
```

The service exposes `GET /` for health checks and `POST /calculate-price` for quotes. The request body must include:

```json
{
  "commodity": "vegetables",
  "shipment_weight_kg": 2000,
  "distance_km": 145,
  "pickup": "Warangal",
  "destination": "Hyderabad",
  "corridor_type": "established",
  "season": "normal",
  "backhaul_available": false
}
```

Optional pricing inputs include `corridor_type`, `season`, `backhaul_available`, `force_reefer`, `actual_toll`, and `diesel_price_override`. The API returns the complete serialized `Quote` object.
