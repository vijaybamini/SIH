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
from typing import Optional, Tuple

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
    cfg = _supabase_config()
    if cfg is None:
        return None
    url, key = cfg
    try:
        resp = requests.post(
            f"{url}/rest/v1/rpc/commodity_supply_kg",
            json={"p_crop_type": commodity},
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        value = resp.json()
        supply_kg = float(value) if value is not None else 0.0
        return supply_kg if supply_kg > 0 else None
    except (requests.RequestException, ValueError, TypeError):
        return None
