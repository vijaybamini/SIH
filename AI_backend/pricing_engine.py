"""
Agri-Commodity Transport Pricing Engine (v3)
===============================================
An Uber/Ola-style freight pricing engine for agricultural transportation in
India. All tunables live in pricing_config.json; this module contains NO
unexplained hardcoded rupee values.

v3 commercial logic (see README.md for the full sourced-data table):

                 ROAD DISTANCE
                      |
               VEHICLE SELECTION            (max_payload_kg + 90% utilization
                      |                      ceiling; multi-trip fallback if
              CAPACITY / TRIPS               the shipment exceeds every class)
                      |
              OPERATING COST                 (fuel/driver/toll/maintenance/
                      |                       depreciation split forward vs.
          .-----------+-----------.           recovered-return, + handling +
          v                       v           overhead — all itemised)
    MARKET FREIGHT           COST FLOOR       market_benchmark = market MID
          |                       |           cost_floor = op.cost x (1+min%)
          '-----------+-----------'
                      v
            RECOMMENDED FREIGHT              = max(market_weight*benchmark
                      |                         + cost_weight*cost_floor,
                DRIVER PAYOUT                    cost_floor)   <- never below
                      |                        driver_payout = recommended_freight
              PLATFORM 10%                     commission = recommended_freight*10%
                      |
                CUSTOMER PRICE                 customer_pays = recommended_freight
                      |                                         + commission
        MARKET COMPETITIVENESS                 compares recommended_freight
                                                (NOT customer_pays) to the
                                                published market band.

Key v3 differences from v2 (see pricing_config.json meta.changelog_v3):
  - No more market_rate_position/adjustment deltas. market_benchmark is the
    configured mid rate x distance, directly, per the simplified formula.
  - Market-competitiveness comparison uses recommended_freight, not the
    customer-facing price — so platform commission can't distort the read on
    whether a quote is priced at, above, or below the market itself.
  - driver_payout = recommended_freight, full stop (still guaranteed >=
    cost_floor by construction) — no separate margin re-clamping.
  - cost_floor > market_freight_high triggers an explicit
    MARKET_BELOW_COST_FLOOR warning and market_vs_cost_status, rather than
    silently quoting cost-plus and calling it market-competitive.
  - Maintenance and depreciation are reported as two separate cost lines
    (previously combined); insurance and permits are reported separately too.
"""

from __future__ import annotations
import json
import math
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List


# --------------------------------------------------------------------------- #
# Data classes
# --------------------------------------------------------------------------- #

@dataclass
class VehicleSelection:
    vehicle_class: str
    label: str
    capacity_kg: float            # rated max payload
    usable_capacity_kg: float     # capacity_kg x maximum_utilization_pct
    utilization_pct: float
    is_reefer: bool
    reefer_type: str
    reefer_reason: str = ""
    trips_required: int = 1
    per_trip_kg: Optional[float] = None
    warnings: List[str] = field(default_factory=list)


@dataclass
class Quote:
    # shipment
    commodity: str
    shipment_weight_kg: float
    pickup: str
    destination: str
    road_distance_km: float
    estimated_travel_time: str

    # vehicle
    vehicle_class: str
    vehicle_label: str
    vehicle_capacity_kg: float
    vehicle_utilization_pct: float
    trips_required: int
    is_reefer: bool
    reefer_type: str

    # forward/return transparency (Section 19)
    forward_fuel_cost: float = 0.0
    return_fuel_cost: float = 0.0
    forward_driver_cost: float = 0.0
    return_driver_cost: float = 0.0
    forward_toll_cost: float = 0.0
    return_toll_cost: float = 0.0
    forward_maintenance_cost: float = 0.0
    return_maintenance_cost: float = 0.0
    forward_depreciation_cost: float = 0.0
    return_depreciation_cost: float = 0.0
    return_recovery_fraction: float = 0.0

    # itemised operating cost (Section 18)
    fuel_cost: float = 0.0
    driver_cost: float = 0.0
    toll_cost: float = 0.0
    maintenance_cost: float = 0.0
    depreciation_cost: float = 0.0
    loading_unloading_cost: float = 0.0
    insurance_cost: float = 0.0
    permit_cost: float = 0.0
    other_operating_cost: float = 0.0
    overhead_cost: float = 0.0        # insurance + permit + other, for convenience
    forward_cost: float = 0.0         # sum of all forward-leg components
    return_cost: float = 0.0          # sum of recovered return-leg components (post recovery_frac)
    total_operating_cost: float = 0.0

    # market benchmark (Layer B)
    market_freight_low: float = 0.0
    market_freight_mid: float = 0.0
    market_freight_high: float = 0.0
    market_benchmark: float = 0.0     # = market_freight_mid

    # commercial quote (Layer C)
    cost_floor: float = 0.0
    recommended_freight: float = 0.0
    market_vs_cost_status: str = ""   # VIABLE | TIGHT | ABOVE_MARKET_REQUIRED

    driver_payout: float = 0.0
    driver_margin: float = 0.0
    driver_margin_pct: float = 0.0
    target_driver_margin_pct: float = 0.0      # reference only
    maximum_driver_margin_pct: float = 0.0     # reference only

    platform_commission: float = 0.0
    customer_pays: float = 0.0
    minimum_fare_applied: bool = False

    # metrics
    recommended_freight_per_km: float = 0.0
    customer_price_per_km: float = 0.0
    customer_price_per_kg: float = 0.0
    market_position: str = ""         # BELOW_MARKET | COMPETITIVE | ABOVE_MARKET | SIGNIFICANTLY_ABOVE_MARKET

    gst_note: str = ""
    toll_is_estimate: bool = True
    warnings: List[str] = field(default_factory=list)

    def render(self) -> str:
        L = []
        L.append(f"Commodity: {self.commodity.title()}  |  Weight: {self.shipment_weight_kg:,.0f} kg")
        L.append(f"Pickup: {self.pickup}  ->  Destination: {self.destination}")
        L.append(f"Distance: {self.road_distance_km:.0f} km  |  Est. travel time: {self.estimated_travel_time}")
        L.append(f"Vehicle: {self.vehicle_label}")
        L.append(f"  Capacity: {self.vehicle_capacity_kg:,.0f} kg rated  |  Utilization: {self.vehicle_utilization_pct:.1f}%"
                  + (f"  |  Trips required: {self.trips_required}" if self.trips_required > 1 else ""))
        L.append(f"  Reefer: {self.reefer_type if self.is_reefer else 'not required'}")
        L.append("")

        L.append("--- Operating cost (itemised) ---")
        L.append(f"Fuel:              ₹{self.fuel_cost:>10,.0f}   (fwd ₹{self.forward_fuel_cost:,.0f} + "
                  f"{self.return_recovery_fraction*100:.0f}% of return ₹{self.return_fuel_cost:,.0f})")
        L.append(f"Driver:            ₹{self.driver_cost:>10,.0f}   (fwd ₹{self.forward_driver_cost:,.0f} + "
                  f"{self.return_recovery_fraction*100:.0f}% of return ₹{self.return_driver_cost:,.0f})")
        L.append(f"Toll:              ₹{self.toll_cost:>10,.0f}   (fwd ₹{self.forward_toll_cost:,.0f} + "
                  f"{self.return_recovery_fraction*100:.0f}% of return ₹{self.return_toll_cost:,.0f})")
        L.append(f"Maintenance:       ₹{self.maintenance_cost:>10,.0f}   (fwd ₹{self.forward_maintenance_cost:,.0f} + "
                  f"{self.return_recovery_fraction*100:.0f}% of return ₹{self.return_maintenance_cost:,.0f})")
        L.append(f"Depreciation:      ₹{self.depreciation_cost:>10,.0f}   (fwd ₹{self.forward_depreciation_cost:,.0f} + "
                  f"{self.return_recovery_fraction*100:.0f}% of return ₹{self.return_depreciation_cost:,.0f})")
        L.append(f"Loading/unloading: ₹{self.loading_unloading_cost:>10,.0f}")
        L.append(f"Insurance:         ₹{self.insurance_cost:>10,.0f}   (amortised per trip)")
        L.append(f"Permits:           ₹{self.permit_cost:>10,.0f}   (amortised per trip)")
        L.append(f"Other overhead:    ₹{self.other_operating_cost:>10,.0f}")
        L.append(f"TOTAL OPERATING COST: ₹{self.total_operating_cost:,.0f}")
        L.append("")

        L.append("--- Market benchmark ---")
        L.append(f"Market freight — low ₹{self.market_freight_low:,.0f} | mid ₹{self.market_freight_mid:,.0f} "
                  f"| high ₹{self.market_freight_high:,.0f}   (market_benchmark = mid)")
        L.append("")

        L.append("--- Commercial quote ---")
        L.append(f"Cost floor (operating cost x (1 + min. driver margin)): ₹{self.cost_floor:,.0f}")
        L.append(f"Market vs. cost status: {self.market_vs_cost_status}")
        L.append(f"Recommended freight: ₹{self.recommended_freight:,.0f}")
        L.append(f"Driver payout: ₹{self.driver_payout:,.0f}  |  Driver margin: ₹{self.driver_margin:,.0f} "
                  f"({self.driver_margin_pct:.1f}%, target {self.target_driver_margin_pct:.0f}%, "
                  f"reference max {self.maximum_driver_margin_pct:.0f}%)")
        L.append(f"Platform commission: ₹{self.platform_commission:,.0f}")
        L.append(f"Customer pays: ₹{self.customer_pays:,.0f}" + (" (minimum fare applied)" if self.minimum_fare_applied else ""))
        L.append("")

        L.append("--- Metrics & market position ---")
        L.append(f"Recommended freight / km: ₹{self.recommended_freight_per_km:.1f}")
        L.append(f"Customer price / km: ₹{self.customer_price_per_km:.1f}")
        L.append(f"Customer price / kg: ₹{self.customer_price_per_kg:.2f}")
        L.append(f"Market position (recommended_freight vs. market band): {self.market_position}")

        if self.gst_note:
            L.append(f"\n{self.gst_note}")
        if self.toll_is_estimate:
            L.append("\nNote: toll figure is a researched fallback ESTIMATE, not a live routed toll.")
        for w in self.warnings:
            L.append(f"Warning: {w}")
        return "\n".join(L)

    def to_dict(self) -> Dict[str, Any]:
        d = dict(self.__dict__)
        d["warnings"] = list(self.warnings)
        return d


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #

class PricingEngine:

    NON_REEFER_SIZE_ORDER = ["mini_lcv", "medium_lcv", "heavy_10w", "multi_axle"]
    REEFER_SIZE_ORDER = ["reefer_medium", "reefer_heavy"]

    def __init__(self, config_path: str):
        with open(config_path, "r") as f:
            self.cfg = json.load(f)

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def _v(node):
        if isinstance(node, dict) and "value" in node:
            return node["value"]
        return node

    def _resolve_class(self, vclass: str) -> Dict[str, Any]:
        """Merge a reefer class onto its base_class, then layer the reefer
        maintenance/depreciation additions on top exactly once."""
        node = self.cfg["vehicle_classes"][vclass]
        if "base_class" not in node:
            return node
        base = dict(self.cfg["vehicle_classes"][node["base_class"]])
        merged = dict(base)
        merged.update(node)  # reefer-specific max_payload_kg / market_rate_per_km_range override the base
        reefer_cfg = self.cfg["reefer"]
        merged["maintenance_per_km"] = {
            "value": self._v(base["maintenance_per_km"]) + self._v(reefer_cfg["additional_maintenance_per_km"]),
            "type": "calculated",
        }
        merged["depreciation_per_km"] = {
            "value": self._v(base["depreciation_per_km"]) + self._v(reefer_cfg["additional_depreciation_per_km"]),
            "type": "calculated",
        }
        merged["mileage_loaded_kmpl"] = base["mileage_loaded_kmpl"]
        merged["mileage_empty_kmpl"] = base["mileage_empty_kmpl"]
        return merged

    def _max_single_day_distance_km(self) -> float:
        d = self.cfg["driver"]
        return self._v(d["average_speed_kmph"]) * self._v(d["average_driving_hours_per_day"])

    def _estimated_travel_time(self, distance_km: float) -> str:
        speed = self._v(self.cfg["driver"]["average_speed_kmph"])
        hours = distance_km / speed
        if hours <= self._v(self.cfg["driver"]["average_driving_hours_per_day"]):
            return f"{hours:.1f} hrs (one-way, same-day)"
        days = math.ceil(hours / self._v(self.cfg["driver"]["average_driving_hours_per_day"]))
        return f"{hours:.1f} hrs (one-way, ~{days} driving day(s))"

    # -- reefer decision ------------------------------------------------------

    def _reefer_required(self, commodity: str, distance_km: float, force_reefer: Optional[bool],
                          season: str) -> (bool, str):
        profile = self.cfg["commodity_profiles"][commodity]
        if profile.get("always_reefer", False):
            return True, "commodity is configured as always requiring refrigeration"
        if force_reefer is True:
            return True, "explicitly forced by caller (force_reefer=True)"
        if force_reefer is False:
            return False, ""
        rule = self.cfg["reefer_rules"].get(commodity, {})
        threshold = rule.get("hot_season_distance_threshold_km") if season == "summer" else rule.get("distance_threshold_km")
        if threshold is not None and distance_km > threshold:
            return True, (f"distance {distance_km:.0f}km exceeds the {season} reefer threshold "
                          f"({threshold}km) for {commodity}")
        return False, ""

    # -- vehicle selection ------------------------------------------------------

    def select_vehicle(self, commodity: str, shipment_weight_kg: float, distance_km: float,
                        force_reefer: Optional[bool] = None, season: str = "normal") -> VehicleSelection:
        """
        required_capacity_kg = shipment_weight_kg / maximum_utilization_pct   (e.g. / 0.90)
        A vehicle qualifies only if its RATED max_payload_kg >= required_capacity_kg
        (equivalently: shipment_weight_kg <= max_payload_kg x maximum_utilization_pct,
        i.e. the vehicle's "safe capacity"), AND at least minimum_headroom_kg of slack
        remains. The smallest qualifying class is selected — never the vehicle's
        default/typical payload figure used as a stand-in for its true maximum.
        """
        vsel_cfg = self.cfg["vehicle_selection"]
        max_util = self._v(vsel_cfg["maximum_utilization_pct"]) / 100.0
        min_headroom = self._v(vsel_cfg["minimum_headroom_kg"])

        is_reefer, reefer_reason = self._reefer_required(commodity, distance_km, force_reefer, season)
        candidate_order = self.REEFER_SIZE_ORDER if is_reefer else self.NON_REEFER_SIZE_ORDER
        reefer_type = "none"

        required_capacity_kg = shipment_weight_kg / max_util

        for vclass in candidate_order:
            vcfg = self._resolve_class(vclass)
            max_payload = self._v(vcfg["max_payload_kg"])
            safe_capacity = max_payload * max_util
            if shipment_weight_kg <= safe_capacity and (max_payload - shipment_weight_kg) >= min_headroom:
                utilization = (shipment_weight_kg / max_payload) * 100.0
                return VehicleSelection(
                    vehicle_class=vclass,
                    label=vcfg["label"],
                    capacity_kg=max_payload,
                    usable_capacity_kg=safe_capacity,
                    utilization_pct=utilization,
                    is_reefer=is_reefer,
                    reefer_type=(vclass if is_reefer else "none"),
                    reefer_reason=reefer_reason,
                )

        # Nothing in the candidate order can take it in one trip -> multi-trip fallback,
        # using the LARGEST class in the appropriate (reefer/non-reefer) ladder.
        largest_class = candidate_order[-1]
        vcfg = self._resolve_class(largest_class)
        max_payload = self._v(vcfg["max_payload_kg"])
        preferred_util = self._v(vsel_cfg["preferred_utilization_pct"]) / 100.0
        per_trip_capacity = max_payload * preferred_util
        n_trips = max(1, math.ceil(shipment_weight_kg / per_trip_capacity))
        per_trip_kg = shipment_weight_kg / n_trips
        warnings = [
            f"{shipment_weight_kg:,.0f}kg exceeds what a single {vcfg['label']} can safely carry "
            f"(safe capacity {max_payload * max_util:,.0f}kg at {self._v(vsel_cfg['maximum_utilization_pct'])}% "
            f"max utilization). Splitting into {n_trips} trips of ~{per_trip_kg:,.0f}kg each; "
            f"the quote below prices ONE such trip — multiply by {n_trips} for the full shipment."
        ]
        if is_reefer and largest_class == "reefer_heavy":
            warnings.append("No larger reefer class is configured — consider non-refrigerated transport with "
                             "faster transit/scheduling if further splitting isn't viable.")
        return VehicleSelection(
            vehicle_class=largest_class,
            label=vcfg["label"],
            capacity_kg=max_payload,
            usable_capacity_kg=max_payload * max_util,
            utilization_pct=(per_trip_kg / max_payload) * 100.0,
            is_reefer=is_reefer,
            reefer_type=(largest_class if is_reefer else "none"),
            reefer_reason=reefer_reason,
            trips_required=n_trips,
            per_trip_kg=per_trip_kg,
            warnings=warnings,
        )

    # -- main entrypoint ------------------------------------------------------

    def price_trip(
        self,
        commodity: str,
        shipment_weight_kg: float,
        distance_km: float,
        pickup: str,
        destination: str,
        backhaul_available: bool = False,
        corridor_type: str = "established",   # 'established' | 'thin'
        force_reefer: Optional[bool] = None,
        season: str = "normal",               # 'normal' | 'summer'
        actual_toll: Optional[float] = None,
        diesel_price_override: Optional[float] = None,
    ) -> Quote:
        cfg = self.cfg
        commodity = commodity.lower()
        if commodity not in cfg["commodity_profiles"]:
            raise ValueError(f"Unknown commodity '{commodity}'. Options: {list(cfg['commodity_profiles'])}")
        profile = cfg["commodity_profiles"][commodity]

        # ---- 1. vehicle selection --------------------------------------------
        vehicle = self.select_vehicle(commodity, shipment_weight_kg, distance_km, force_reefer, season)
        vcfg = self._resolve_class(vehicle.vehicle_class)
        priced_weight_kg = vehicle.per_trip_kg or shipment_weight_kg   # price ONE trip when split required
        tonnes = priced_weight_kg / 1000.0
        warnings = list(vehicle.warnings)

        # ---- 2. driver time (forward & return legs costed separately) -----------
        d_cfg = cfg["driver"]
        max_day_km = self._max_single_day_distance_km()
        leg_days = max(1, math.ceil(distance_km / max_day_km))
        is_multi_day = leg_days > 1 or distance_km > max_day_km / 2  # a same-day ROUND trip needs <= max_day_km total
        needs_second_driver = distance_km >= self._v(d_cfg["second_driver_distance_threshold_km"])

        if not is_multi_day:
            forward_driver_cost = self._v(d_cfg["local_day_rate"])
            return_driver_cost_full = 0.0  # same day, same driver, round trip already covered
        else:
            leg_nights = max(0, leg_days - 1)
            leg_cost = self._v(d_cfg["long_haul_day_rate"]) * leg_days + self._v(d_cfg["overnight_allowance"]) * leg_nights
            if needs_second_driver:
                leg_cost *= 2
            forward_driver_cost = leg_cost
            return_driver_cost_full = leg_cost   # symmetric one-way leg, recovered at recovery_frac below

        # ---- 3. fuel (forward + return computed separately, reefer penalty applied once per leg) --
        diesel_price = diesel_price_override or self._v(cfg["fuel"]["diesel_price_per_litre"])
        mileage_loaded = self._v(vcfg["mileage_loaded_kmpl"])
        mileage_empty = self._v(vcfg["mileage_empty_kmpl"])
        fuel_penalty = (1 + self._v(cfg["reefer"]["fuel_penalty_pct"]) / 100.0) if vehicle.is_reefer else 1.0

        forward_fuel_cost = (distance_km / mileage_loaded) * fuel_penalty * diesel_price
        return_fuel_cost = (distance_km / mileage_empty) * fuel_penalty * diesel_price

        # ---- 4. empty-return recovery fraction (Section 8) -----------------------
        er_cfg = cfg["empty_return"]
        if backhaul_available:
            recovery_frac = self._v(er_cfg["no_backhaul"])
        elif corridor_type == "established":
            recovery_frac = self._v(er_cfg["established_corridor"])
        elif corridor_type == "thin":
            recovery_frac = self._v(er_cfg["thin_corridor"])
        else:
            recovery_frac = self._v(er_cfg["default"])
        recovery_frac = min(recovery_frac, self._v(er_cfg["maximum_recovery_pct"]))  # hard safety clamp

        # ---- 5. toll (forward once, return once, recovered at recovery_frac) ----
        toll_cfg = cfg["toll"]
        toll_is_estimate = actual_toll is None
        if actual_toll is not None:
            forward_toll_cost = actual_toll
        else:
            per_plaza = (self._v(toll_cfg["fallback_truck_per_plaza"])
                         if vehicle.capacity_kg >= 7000
                         else self._v(toll_cfg["fallback_lcv_per_plaza"]))
            n_plazas = max(0, round(distance_km / self._v(toll_cfg["average_plaza_spacing_km"])))
            forward_toll_cost = n_plazas * per_plaza
        return_toll_cost = forward_toll_cost * (1 - self._v(toll_cfg["return_toll_recovery_pct"]) / 100.0)

        # ---- 6. maintenance & depreciation — SEPARATE lines, forward once + return once --
        maint_rate = self._v(vcfg["maintenance_per_km"])
        dep_rate = self._v(vcfg["depreciation_per_km"])
        forward_maintenance_cost = maint_rate * distance_km
        return_maintenance_cost = maint_rate * distance_km
        forward_depreciation_cost = dep_rate * distance_km
        return_depreciation_cost = dep_rate * distance_km

        # ---- 7. market benchmark (Layer B) — computed before handling cap, needed for it --
        low, mid, high = self._resolve_class(vehicle.vehicle_class)["market_rate_per_km_range"] \
            if "market_rate_per_km_range" in self._resolve_class(vehicle.vehicle_class) \
            else cfg["vehicle_classes"][vehicle.vehicle_class]["market_rate_per_km_range"]
        market_freight_low = low * distance_km
        market_freight_mid = mid * distance_km
        market_freight_high = high * distance_km
        market_benchmark = market_freight_mid

        # ---- 8. loading/unloading, capped vs. market benchmark -------------------
        lu_cfg = cfg["loading_unloading"]
        base_rate = self._v(lu_cfg["grain_rate_per_tonne"])
        mult_key = profile["handling_multiplier_key"]
        handling_mult = self._v(lu_cfg[mult_key])
        handling_cost_raw = max(self._v(lu_cfg["minimum_handling_fee"]), base_rate * handling_mult * tonnes)
        handling_cap = market_freight_mid * self._v(lu_cfg["maximum_fraction_of_freight"])
        loading_unloading_cost = min(handling_cost_raw, max(handling_cap, self._v(lu_cfg["minimum_handling_fee"])))
        if loading_unloading_cost < handling_cost_raw:
            warnings.append(f"Loading/unloading cost capped at {self._v(lu_cfg['maximum_fraction_of_freight'])*100:.0f}% "
                             f"of market freight (₹{handling_cost_raw:,.0f} -> ₹{loading_unloading_cost:,.0f}).")

        # ---- 9. overheads (fully config-driven) -----------------------------------
        oh_cfg = cfg["overheads"]
        trips_per_year = self._v(oh_cfg["trips_per_year"])
        insurance_cost = self._v(oh_cfg["annual_insurance"]) / trips_per_year
        permit_cost = self._v(oh_cfg["annual_permits"]) / trips_per_year
        other_operating_cost = 0.0   # reserved for future configured overhead components
        overhead_cost = insurance_cost + permit_cost + other_operating_cost

        # ---- assemble itemised totals (fwd fully charged, return at recovery_frac) --
        fuel_cost = forward_fuel_cost + return_fuel_cost * recovery_frac
        driver_cost = forward_driver_cost + return_driver_cost_full * recovery_frac
        toll_cost = forward_toll_cost + return_toll_cost * recovery_frac
        maintenance_cost = forward_maintenance_cost + return_maintenance_cost * recovery_frac
        depreciation_cost = forward_depreciation_cost + return_depreciation_cost * recovery_frac

        forward_cost = forward_fuel_cost + forward_driver_cost + forward_toll_cost + forward_maintenance_cost + forward_depreciation_cost
        return_cost = (return_fuel_cost + return_driver_cost_full + return_toll_cost +
                        return_maintenance_cost + return_depreciation_cost) * recovery_frac

        total_operating_cost = (fuel_cost + driver_cost + toll_cost + maintenance_cost + depreciation_cost +
                                 loading_unloading_cost + overhead_cost)

        # ---- LAYER C: commercial quote (Section 4-7) -------------------------------
        pm = cfg["pricing_model"]
        min_margin = self._v(pm["minimum_driver_margin_pct"]) / 100.0
        target_margin_pct = self._v(pm["target_driver_margin_pct"])
        max_margin_pct = self._v(pm["maximum_driver_margin_pct"])
        market_weight = self._v(pm["market_weight"])
        cost_weight = self._v(pm["cost_weight"])

        cost_floor = total_operating_cost * (1 + min_margin)
        recommended_freight_raw = market_weight * market_benchmark + cost_weight * cost_floor
        recommended_freight = max(recommended_freight_raw, cost_floor)

        # Section 5: economically difficult routes — never silently pretend competitiveness
        if cost_floor > market_freight_high:
            market_vs_cost_status = "ABOVE_MARKET_REQUIRED"
            warnings.append("MARKET_BELOW_COST_FLOOR: the minimum viable cost (cost_floor) exceeds even the top "
                             "of the published market band for this vehicle/route. This route cannot currently be "
                             "served profitably at normal market rates — the quote below is priced above market "
                             "out of economic necessity, not because it is market-competitive.")
        elif cost_floor > market_freight_low:
            market_vs_cost_status = "TIGHT"
        else:
            market_vs_cost_status = "VIABLE"

        driver_payout = recommended_freight
        driver_margin = driver_payout - total_operating_cost
        driver_margin_pct = (driver_margin / total_operating_cost * 100.0) if total_operating_cost > 0 else 0.0

        commission_pct = self._v(cfg["platform"]["commission_pct"])
        platform_commission = recommended_freight * (commission_pct / 100.0)
        customer_pays = recommended_freight + platform_commission

        min_fare = self._v(cfg["platform"]["minimum_fare"])
        minimum_fare_applied = customer_pays < min_fare
        if minimum_fare_applied:
            warnings.append(f"Computed price ₹{customer_pays:,.0f} is below the configured minimum fare "
                             f"₹{min_fare:,.0f}; minimum fare applied. (Vehicle selection above was not "
                             f"altered by this — the minimum fare adjusts price only, never hides an "
                             f"uneconomic vehicle choice.)")
            customer_pays = min_fare

        # ---- metrics & market-competitiveness (Section 17 — uses recommended_freight) --
        recommended_freight_per_km = recommended_freight / distance_km if distance_km else 0.0
        customer_price_per_km = customer_pays / distance_km if distance_km else 0.0
        customer_price_per_kg = customer_pays / priced_weight_kg if priced_weight_kg else 0.0

        mv_cfg = cfg["market_validation"]
        ratio = recommended_freight_per_km / mid if mid else 0.0
        if ratio < self._v(mv_cfg["below_market_max_ratio"]):
            market_position = "BELOW_MARKET"
        elif ratio <= self._v(mv_cfg["competitive_max_ratio"]):
            market_position = "COMPETITIVE"
        elif ratio <= self._v(mv_cfg["above_market_max_ratio"]):
            market_position = "ABOVE_MARKET"
        else:
            market_position = "SIGNIFICANTLY_ABOVE_MARKET"

        gst_rate = self._v(cfg["gst"]["gta_rate_without_itc_pct"])
        gst_note = (f"GST (GTA, no-ITC option): {gst_rate}% (₹{customer_pays * gst_rate / 100:,.0f}) is "
                    f"typically payable by a registered consignor under reverse charge and is shown "
                    f"separately, not folded into 'customer_pays' above.")

        return Quote(
            commodity=commodity, shipment_weight_kg=shipment_weight_kg, pickup=pickup, destination=destination,
            road_distance_km=distance_km, estimated_travel_time=self._estimated_travel_time(distance_km),

            vehicle_class=vehicle.vehicle_class, vehicle_label=vehicle.label,
            vehicle_capacity_kg=vehicle.capacity_kg, vehicle_utilization_pct=vehicle.utilization_pct,
            trips_required=vehicle.trips_required, is_reefer=vehicle.is_reefer, reefer_type=vehicle.reefer_type,

            forward_fuel_cost=forward_fuel_cost, return_fuel_cost=return_fuel_cost,
            forward_driver_cost=forward_driver_cost, return_driver_cost=return_driver_cost_full,
            forward_toll_cost=forward_toll_cost, return_toll_cost=return_toll_cost,
            forward_maintenance_cost=forward_maintenance_cost, return_maintenance_cost=return_maintenance_cost,
            forward_depreciation_cost=forward_depreciation_cost, return_depreciation_cost=return_depreciation_cost,
            return_recovery_fraction=recovery_frac,

            fuel_cost=fuel_cost, driver_cost=driver_cost, toll_cost=toll_cost,
            maintenance_cost=maintenance_cost, depreciation_cost=depreciation_cost,
            loading_unloading_cost=loading_unloading_cost,
            insurance_cost=insurance_cost, permit_cost=permit_cost, other_operating_cost=other_operating_cost,
            overhead_cost=overhead_cost, forward_cost=forward_cost, return_cost=return_cost,
            total_operating_cost=total_operating_cost,

            market_freight_low=market_freight_low, market_freight_mid=market_freight_mid,
            market_freight_high=market_freight_high, market_benchmark=market_benchmark,

            cost_floor=cost_floor, recommended_freight=recommended_freight, market_vs_cost_status=market_vs_cost_status,

            driver_payout=driver_payout, driver_margin=driver_margin, driver_margin_pct=driver_margin_pct,
            target_driver_margin_pct=target_margin_pct, maximum_driver_margin_pct=max_margin_pct,

            platform_commission=platform_commission, customer_pays=customer_pays,
            minimum_fare_applied=minimum_fare_applied,

            recommended_freight_per_km=recommended_freight_per_km,
            customer_price_per_km=customer_price_per_km, customer_price_per_kg=customer_price_per_kg,
            market_position=market_position,

            gst_note=gst_note, toll_is_estimate=toll_is_estimate, warnings=warnings,
        )
