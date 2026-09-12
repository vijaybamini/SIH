"""
Matches a delivery trip to real registered logistics providers, so the
"notify the logistics guy with his payout quote" step has an actual
recipient -- not just the abstract vehicle_class (e.g. "mini_lcv") the
pricing engine used internally to cost the trip.

The only reliable, structured signal available on a provider's registered
fleet is numeric vehicle capacity (src/api/logistics.js writes each
vehicle as {type: <free text>, capacity: <number or null>} into
logistics_providers.fleet_details, a JSON-encoded string column). Vehicle
TYPE is free text a farmer/provider typed by hand ("Mini Truck", "Tempo",
"LCV", ...) with no fixed vocabulary shared with the pricing engine's
internal class keys, so matching on capacity -- can this vehicle actually
carry the shipment -- is the honest, reliable match; matching on type
string equality would silently match almost nobody.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List


def _parse_vehicles(fleet_details_raw: Any) -> List[Dict[str, Any]]:
    if not fleet_details_raw:
        return []
    try:
        parsed = json.loads(fleet_details_raw) if isinstance(fleet_details_raw, str) else fleet_details_raw
    except (TypeError, ValueError):
        return []
    vehicles = parsed.get("vehicles") if isinstance(parsed, dict) else None
    return vehicles if isinstance(vehicles, list) else []


def find_matching_providers(providers: List[Dict[str, Any]], required_capacity_kg: float) -> List[Dict[str, Any]]:
    """Returns one entry per provider that has at least one registered
    vehicle able to carry required_capacity_kg -- {profile_id,
    company_name, vehicle_type, vehicle_capacity_kg} for their best
    (smallest sufficient) matching vehicle. Providers with no vehicle big
    enough, or no parseable fleet data at all, are simply excluded --
    never a hard error, since a demo with zero registered providers should
    still complete the order, just with nothing to notify."""
    matches = []
    for provider in providers:
        vehicles = _parse_vehicles(provider.get("fleet_details"))
        candidates = []
        for vehicle in vehicles:
            try:
                capacity = float(vehicle.get("capacity"))
            except (TypeError, ValueError):
                continue
            if capacity >= required_capacity_kg:
                candidates.append((capacity, vehicle))
        if not candidates:
            continue
        candidates.sort(key=lambda pair: pair[0])  # smallest sufficient vehicle first
        best_capacity, best_vehicle = candidates[0]
        matches.append({
            "profile_id": provider.get("profile_id"),
            "company_name": provider.get("company_name") or "Logistics provider",
            "vehicle_type": best_vehicle.get("type") or "vehicle",
            "vehicle_capacity_kg": best_capacity,
        })
    return matches
