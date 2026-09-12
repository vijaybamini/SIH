"""
Read-only Supabase integration: pulls the REAL total platform supply (farmer
crop_details, stored in quintals -> converted to kg) so the consumer-pricing
scarcity multiplier in consumer_pricing_engine.py isn't working off a guessed
total_platform_supply_kg. Every failure mode here (missing config, network
error, RPC not deployed yet, no listings for this commodity) returns None so
the caller falls back to its existing heuristic -- same graceful-degradation
pattern as AGMARKNET_CSV / pincode resolution elsewhere in this pipeline.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

_ENV_LOADED = False


def _load_env_once() -> None:
    """Best-effort load of the repo-root .env.local (the same file the Vite
    frontend reads) so SUPABASE_URL/KEY don't need to be duplicated for the
    backend. No-op if python-dotenv isn't installed or no env file exists --
    real environment variables always take priority either way."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    root = Path(__file__).resolve().parent.parent
    for name in (".env.local", ".env"):
        p = root / name
        if p.exists():
            load_dotenv(p, override=False)


def _supabase_config() -> Optional[Tuple[str, str]]:
    _load_env_once()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    # Prefer a service-role key if the backend has one (bypasses RLS
    # entirely), otherwise fall back to the same anon/publishable key the
    # frontend already uses -- sufficient here since commodity_supply_kg()
    # is a security-definer function that only ever returns one aggregate
    # number, never row-level farmer data.
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
           or os.environ.get("SUPABASE_ANON_KEY")
           or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY"))
    if not url or not key:
        return None
    return url.rstrip("/"), key


def _call_rpc(fn_name: str, params: Dict[str, Any], timeout: float = 5.0) -> Optional[Any]:
    """POSTs to a Supabase RPC (PostgREST) function. Returns None on any
    failure -- missing config, network error, function not deployed yet, bad
    response -- so every caller degrades the same way instead of crashing a
    quote request over Supabase being unavailable."""
    cfg = _supabase_config()
    if cfg is None:
        return None
    url, key = cfg
    try:
        resp = requests.post(
            f"{url}/rest/v1/rpc/{fn_name}",
            json=params,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        return resp.json()
    except (requests.RequestException, ValueError, TypeError):
        return None


def fetch_real_supply_kg(commodity: str, timeout: float = 3.0) -> Optional[float]:
    """Total kg of `commodity` currently listed across all farmers in
    Supabase (harvested crops use crop_details.turnover, still-growing crops
    use expected_turnover -- both stored in quintals, converted to kg here).

    Returns None -- never 0 -- whenever real supply can't be determined
    (Supabase not configured, the commodity_supply_kg() migration hasn't
    been applied yet, a network error, or genuinely no listings for this
    commodity). Callers must treat None as "fall back to a heuristic",
    not as "supply is zero".
    """
    value = _call_rpc("commodity_supply_kg", {"p_crop_type": commodity}, timeout=timeout)
    if value is None:
        return None
    try:
        supply_kg = float(value)
    except (TypeError, ValueError):
        return None
    return supply_kg if supply_kg > 0 else None


def fetch_supply_listings(commodity: str, timeout: float = 5.0) -> Optional[List[Dict[str, Any]]]:
    """Per-farmer supply rows for `commodity` -- {farmer_id, crop_id,
    available_kg, pincode} -- via commodity_supply_listings(), for the
    multi-farmer routing/allocation path in route_optimization.py.

    Returns None when Supabase/the RPC is unavailable (caller should fall
    back to the single-shipment quote path), or a list (possibly empty, if
    the RPC works but nobody has listed this commodity) otherwise.
    """
    rows = _call_rpc("commodity_supply_listings", {"p_crop_type": commodity}, timeout=timeout)
    if rows is None or not isinstance(rows, list):
        return None
    return rows


def create_order(
    buyer_id: str,
    commodity: str,
    market: Optional[str],
    order_demand_kg: float,
    base_price_per_kg: float,
    market_crop_price_per_kg: float,
    logistics_cost_total: float,
    platform_commission_total: float,
    final_price_per_kg: float,
    grand_total: float,
    breakdown: Dict[str, Any],
    allocations: List[Dict[str, Any]],
    trips: List[Dict[str, Any]],
    timeout: float = 8.0,
) -> Optional[int]:
    """Persists a confirmed order via the create_order() SQL function (a
    security-definer RPC, since this backend calls Supabase with the anon
    key and has no authenticated auth.uid() of its own -- see the migration
    for why a plain insert would be rejected by RLS). Returns the new
    order's id, or None if the write failed for any reason."""
    result = _call_rpc("create_order", {
        "p_buyer_id": buyer_id,
        "p_commodity": commodity,
        "p_market": market,
        "p_order_demand_kg": order_demand_kg,
        "p_base_price_per_kg": base_price_per_kg,
        "p_market_crop_price_per_kg": market_crop_price_per_kg,
        "p_logistics_cost_total": logistics_cost_total,
        "p_platform_commission_total": platform_commission_total,
        "p_final_price_per_kg": final_price_per_kg,
        "p_grand_total": grand_total,
        "p_breakdown": breakdown,
        "p_allocations": allocations,
        "p_trips": trips,
    }, timeout=timeout)
    if result is None:
        return None
    try:
        return int(result)
    except (TypeError, ValueError):
        return None
