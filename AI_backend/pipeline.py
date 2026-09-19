"""
End-to-End Farmer -> Consumer Pricing Pipeline
==============================================
Chains the three standalone engines behind one callable so the FastAPI layer
can serve a single transparent breakdown:

    1. DEMAND FORECAST   demand_forecast_engine.py
         -> forecasted APMC modal price (base anchor) + market demand trend %
    2. LOGISTICS COST    pricing_engine.py
         -> freight quote (vehicle, operating cost, recommended freight,
            customer freight bill) for the order weight/distance
    3. CONSUMER PRICE    consumer_pricing_engine.py
         -> dynamic market crop price + logistics (pass-through, no markup)
            = final checkout price per kg and per order. The platform's
            commission is deducted from the farmer's crop-value share only,
            never added on top of the buyer's price and never taken from
            the logistics leg (that's a service fee paid to the driver).

The result is one JSON object that shows every rupee (farmer payout, platform
commission, freight) so the "middleman margin" is simply not in the chain.
"""

from __future__ import annotations

import math
import os
import queue
import threading
from typing import Dict, Any, List, Optional, Tuple

import pandas as pd

# --------------------------------------------------------------------------- #
# Dataset resolution
# --------------------------------------------------------------------------- #

AGMARKNET_RELATIVE_CANDIDATES = [
    # repo-root dataset (matches the checked-in folder layout)
    os.path.join("..", "agmarknet_data", "agmarknet-india-commodity-prices-2024-2025",
                 "agmarknet_india_historical_prices_2024_2025.csv"),
    os.path.join("agmarknet_data", "agmarknet-india-commodity-prices-2024-2025",
                 "agmarknet_india_historical_prices_2024_2025.csv"),
]

PINCODE_RELATIVE_CANDIDATES = [
    "all_india_pincode_directory_2025.csv",
]


def _dms_to_decimal(value) -> Optional[float]:
    """Convert DMS strings like ``17°57'17.7"`` to decimal degrees. Returns
    None when the value isn't a numeric/DMS coordinate."""
    import re
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    m = re.match(
        r"([+-]?\d+(?:\.\d+)?)\s*[°do]\s*(\d+(?:\.\d+)?)?\s*['′‘]?\s*(\d+(?:\.\d+)?)?\s*[\"″”]?",
        s,
    )
    if not m:
        try:
            return float(s)
        except (TypeError, ValueError):
            return None
    deg = float(m.group(1))
    minutes = float(m.group(2) or 0)
    seconds = float(m.group(3) or 0)
    decimal = abs(deg) + minutes / 60 + seconds / 3600
    return -decimal if deg < 0 else decimal


def _coerce_coordinate(series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    dms = series.map(_dms_to_decimal).astype(float)
    return numeric.fillna(dms)


def _first_existing(candidates: List[str]) -> Optional[str]:
    for c in candidates:
        p = os.path.abspath(c)
        if os.path.exists(p):
            return p
    return None


def resolve_agmarknet_csv() -> Optional[str]:
    env = os.environ.get("AGMARKNET_CSV")
    if env and os.path.exists(env):
        return env
    base = os.path.dirname(os.path.abspath(__file__))
    for c in AGMARKNET_RELATIVE_CANDIDATES:
        for root in (base, os.path.dirname(base)):
            p = os.path.join(root, c)
            if os.path.exists(p):
                return os.path.abspath(p)
    return None


# --------------------------------------------------------------------------- #
# Dataset loading (cached — 1.1M rows is worth loading once)
# --------------------------------------------------------------------------- #

from demand_forecast_engine import load_kaggle_data

# Deliberately NOT functools.lru_cache: its internal lock serializes every
# caller on a cache miss, including callers running in their own timeout-
# guarded background thread elsewhere in this codebase -- if the underlying
# load_kaggle_data() call ever hangs (observed in production: a resource-
# constrained host made a 1.1M-row CSV parse intermittently take far longer
# than expected), EVERY other thread that touches this cache queues forever
# on that same lock with no way to time out, and each new request adds one
# more permanently-stuck thread. A plain dict has no such lock: at worst two
# threads redundantly parse the CSV once on a cold cache (wasted work, never
# a deadlock), and _load_dataset_with_timeout below still bounds each
# individual caller's own wait regardless of what other threads are doing.
_dataset_cache: Dict[str, pd.DataFrame] = {}

DATASET_LOAD_TIMEOUT_SECONDS = 25.0


def _load_dataset_with_timeout(path: str) -> pd.DataFrame:
    cached = _dataset_cache.get(path)
    if cached is not None:
        return cached

    result_queue: "queue.Queue" = queue.Queue(maxsize=1)

    def _worker():
        try:
            df = load_kaggle_data(path)
            _dataset_cache[path] = df  # populate cache even though this
            # thread's own caller may already have given up waiting -- a
            # later caller still benefits from not having to re-parse.
            result_queue.put(("ok", df))
        except Exception as exc:  # noqa: BLE001 -- reported back, not raised cross-thread
            result_queue.put(("error", exc))

    threading.Thread(target=_worker, daemon=True).start()

    try:
        status, payload = result_queue.get(timeout=DATASET_LOAD_TIMEOUT_SECONDS)
    except queue.Empty:
        raise TimeoutError(
            f"Loading the Agmarknet dataset took longer than "
            f"{DATASET_LOAD_TIMEOUT_SECONDS:.0f}s. The host may be under memory/CPU "
            f"pressure; try again shortly."
        )
    if status == "error":
        raise payload
    return payload


def load_dataset() -> pd.DataFrame:
    path = resolve_agmarknet_csv()
    if not path:
        raise FileNotFoundError(
            "Agmarknet CSV not found. Set AGMARKNET_CSV or place the dataset "
            "under agmarknet_data/agmarknet-india-commodity-prices-2024-2025/."
        )
    return _load_dataset_with_timeout(path)


# --------------------------------------------------------------------------- #
# Commodity -> pricing-profile mapping
# --------------------------------------------------------------------------- #

# Agmarknet commodity names -> pricing_engine commodity_profiles key.
# Anything unrecognised defaults to other_grain (safe freight handling class).
_COMMODITY_PROFILE_MAP: Dict[str, str] = {
    "apple": "fruits",
    "banana": "fruits",
    "mango": "fruits",
    "bhindi(ladies finger)": "vegetables",
    "brinjal": "vegetables",
    "cabbage": "vegetables",
    "carrot": "vegetables",
    "cauliflower": "vegetables",
    "garlic": "vegetables",
    "ginger(green)": "vegetables",
    "green chilli": "vegetables",
    "rice": "rice",
    "wheat": "other_grain",
    "maize": "other_grain",
    "bajra(pearl millet/cumbu)": "other_grain",
    "jowar(sorghum)": "other_grain",
    "green gram (moong)(whole)": "other_grain",
    "arhar (tur/red gram)(whole)": "other_grain",
    "lentil (masur)(whole)": "other_grain",
    "groundnut": "other_grain",
    "soyabean": "other_grain",
    "mustard": "other_grain",
    "gur(jaggery)": "other_grain",
    "cotton": "other_grain",
}

_QUINTAL_KG = 100  # Agmarknet prices are Rs./quintal == Rs./(100 kg)


def pricing_profile_for(commodity: str) -> str:
    key = commodity.strip().lower()
    return _COMMODITY_PROFILE_MAP.get(key, "other_grain")


def _match_commodity(df: pd.DataFrame, commodity: str) -> Optional[str]:
    """Case-insensitive match against CSV commodity names. Tries an exact
    match first; if that fails, falls back to substring containment either
    direction (e.g. farmer-form crop names like "Jowar" or "Bajra" need to
    resolve to the dataset's "Jowar(Sorghum)" / "Bajra(Pearl Millet/Cumbu)",
    which an exact match alone would never find)."""
    target = commodity.strip().lower()
    if not target:
        return None
    options = list(df["commodity"].dropna().unique())
    for c in options:
        if str(c).strip().lower() == target:
            return str(c)
    for c in options:
        c_lower = str(c).strip().lower()
        if target in c_lower or c_lower in target:
            return str(c)
    return None


# --------------------------------------------------------------------------- #
# Markets
# --------------------------------------------------------------------------- #

def list_commodities() -> List[str]:
    df = load_dataset()
    return sorted(df["commodity"].dropna().unique())


def list_markets(commodity: str) -> List[str]:
    df = load_dataset()
    real = _match_commodity(df, commodity)
    if real is None:
        return []
    rows = df[df["commodity"] == real]
    return sorted(rows["market_name"].dropna().unique())


def pick_default_market(df: pd.DataFrame, commodity: str) -> str:
    """Market with the most recent price history for this commodity."""
    rows = df[df["commodity"] == commodity][["market_name", "arrival_date"]]
    stats = rows.groupby("market_name")["arrival_date"].agg(["max", "count"])
    stats = stats.sort_values(["max", "count"], ascending=[False, False])
    return str(stats.index[0])


# --------------------------------------------------------------------------- #
# Distance resolution
# --------------------------------------------------------------------------- #

pincode_map = None

def _get_pincode_map():
    global pincode_map
    if pincode_map is not None:
        return pincode_map
    pincode_map = {}
    for c in PINCODE_RELATIVE_CANDIDATES:
        p = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), c))
        if not os.path.exists(p):
            continue
        try:
            df = pd.read_csv(p, low_memory=False)
            df.columns = [str(col).strip().lower() for col in df.columns]
            if not {"pincode", "latitude", "longitude"}.issubset(df.columns):
                continue
            df["pincode"] = df["pincode"].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
            df["latitude"] = _coerce_coordinate(df["latitude"])
            df["longitude"] = _coerce_coordinate(df["longitude"])
            valid = df.dropna(subset=["latitude", "longitude"])
            pincode_map = {}
            for pin, lat, lon in zip(valid["pincode"], valid["latitude"], valid["longitude"]):
                if pin not in pincode_map:
                    pincode_map[pin] = (lat, lon)
        except Exception:
            pincode_map = {}
        break
    return pincode_map


pincode_details_map = None

def _get_pincode_details_map():
    """Pincode -> (district, state), for validation/lookup (not routing --
    see _get_pincode_map for the lat/lon map the distance calc uses)."""
    global pincode_details_map
    if pincode_details_map is not None:
        return pincode_details_map
    pincode_details_map = {}
    for c in PINCODE_RELATIVE_CANDIDATES:
        p = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), c))
        if not os.path.exists(p):
            continue
        try:
            df = pd.read_csv(p, low_memory=False, usecols=lambda col: col.strip().lower() in ("pincode", "district", "statename"))
            df.columns = [str(col).strip().lower() for col in df.columns]
            if not {"pincode", "district", "statename"}.issubset(df.columns):
                continue
            df["pincode"] = df["pincode"].astype(str).str.replace(r"\.0$", "", regex=True).str.strip()
            details = {}
            for pin, district, state in zip(df["pincode"], df["district"], df["statename"]):
                if pin not in details:
                    details[pin] = (str(district).strip() if pd.notna(district) else None,
                                     str(state).strip() if pd.notna(state) else None)
            pincode_details_map = details
        except Exception:
            pincode_details_map = {}
        break
    return pincode_details_map


def validate_pincode(pincode: str):
    """Returns {"valid": bool, "district": str|None, "state": str|None}."""
    details = _get_pincode_details_map()
    match = details.get(str(pincode).strip())
    if not match:
        return {"valid": False, "district": None, "state": None}
    return {"valid": True, "district": match[0], "state": match[1]}


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


ROAD_FACTOR = 1.3  # straight-line distance understates real road distance


def resolve_distance(payload: Dict[str, Any]) -> Tuple[float, Optional[str], Optional[str]]:
    """Returns (distance_km, pickup, destination). Prefers an explicit
    distance_km; falls back to haversine(pincodes) * road factor."""
    distance = payload.get("distance_km")
    pickup = payload.get("pickup")
    destination = payload.get("destination")
    pickup_pin = payload.get("pickup_pincode")
    destination_pin = payload.get("destination_pincode")

    if distance is not None:
        try:
            return float(distance), pickup, destination
        except (TypeError, ValueError):
            pass

    if pickup_pin and destination_pin:
        pm = _get_pincode_map()
        a = pm.get(str(pickup_pin).strip())
        b = pm.get(str(destination_pin).strip())
        if a and b:
            return round(_haversine_km(a[0], a[1], b[0], b[1]) * ROAD_FACTOR, 1), pickup_pin, destination_pin

    raise ValueError(
        "Provide distance_km, or both pickup_pincode and destination_pincode "
        "(resolvable via the India pincode directory)."
    )


DEFAULT_FALLBACK_DISTANCE_KM = 150.0  # used only when neither real farmer
                                       # listings NOR a manual distance/pincode
                                       # pair are available -- keeps the demo
                                       # usable for commodities with no real
                                       # Supabase supply yet, clearly flagged
                                       # as an assumption in the warnings.


# --------------------------------------------------------------------------- #
# Forecast wrapper (with graceful fallback)
# --------------------------------------------------------------------------- #

def forecast_for(df: pd.DataFrame, commodity: str, market: str,
                 forecast_days: int = 7) -> Dict[str, Any]:
    from demand_forecast_engine import forecast_price_trend

    result, accuracy = forecast_price_trend(df, commodity, market, forecast_days=forecast_days)
    mask = (df["commodity"] == commodity) & (df["market_name"] == market)
    recent_avg_per_quintal = float(df.loc[mask, "modal_price"].iloc[-1])

    forecast_avg_per_quintal = float(result["forecasted_modal_price"].mean())
    rows_out = result.copy()
    rows_out["date"] = rows_out["date"].dt.strftime("%Y-%m-%d")
    return {
        "market": market,
        "commodity": commodity,
        "forecast_days": forecast_days,
        "forecasted_prices_per_quintal": rows_out.round(1).to_dict(orient="records"),
        "base_price_per_kg": round(forecast_avg_per_quintal / _QUINTAL_KG, 2),
        "last_observed_price_per_kg": round(recent_avg_per_quintal / _QUINTAL_KG, 2),
        "market_demand_trend_pct": float(accuracy["pct_change_vs_recent_avg"]),
        "demand_pressure_signal": accuracy["demand_pressure_signal"],
        "backtest": {
            "mae_per_quintal": accuracy["backtest_mae"],
            "mape_pct": accuracy["backtest_mape_pct"],
        },
    }


def _recent_average_fallback(df: pd.DataFrame, commodity: str, market: str,
                              forecast_days: int, reason: str) -> Tuple[Dict[str, Any], str]:
    rows = df.loc[(df["commodity"] == commodity) & (df["market_name"] == market)]
    recent = float(rows["modal_price"].mean()) if len(rows) else 0.0
    return {
        "market": market,
        "commodity": commodity,
        "forecast_days": forecast_days,
        "forecasted_prices_per_quintal": [],
        "base_price_per_kg": round(recent / _QUINTAL_KG, 2),
        "last_observed_price_per_kg": round(recent / _QUINTAL_KG, 2),
        "market_demand_trend_pct": 0.0,
        "demand_pressure_signal": "STABLE",
        "backtest": {"mae_per_quintal": None, "mape_pct": None},
    }, reason


# Holt-Winters' .fit() runs a CPU-bound scipy optimization (~0.2-0.7s on a
# normal machine) that was observed taking 25s+ on Render's free-tier CPU,
# which is throttled far more aggressively for CPU-bound work than for I/O.
# Two defenses, mirroring the dataset cache above: (1) a short-TTL result
# cache so repeat requests for the same commodity/market during a demo are
# instant instead of re-fitting every time, and (2) a hard wall-clock
# ceiling via a background thread so a slow fit degrades to the fast
# recent-average fallback instead of hanging the whole /api/quote request.
def price_trend_for(df: pd.DataFrame, commodity: str, market: str,
                     history_days: int = 90, forecast_days: int = 14) -> Dict[str, Any]:
    from demand_forecast_engine import get_price_history_and_forecast

    history_df, forecast_result, accuracy = get_price_history_and_forecast(
        df, commodity, market, history_days=history_days, forecast_days=forecast_days,
    )
    quintal = _QUINTAL_KG

    return {
        "commodity": commodity,
        "market": market,
        "history": [
            {"date": d.strftime("%Y-%m-%d"), "price_per_kg": round(p / quintal, 2)}
            for d, p in zip(history_df["date"], history_df["modal_price"])
        ],
        "forecast": [
            {"date": row["date"].strftime("%Y-%m-%d"), "price_per_kg": round(row["forecasted_modal_price"] / quintal, 2)}
            for _, row in forecast_result.iterrows()
        ],
        "demand_pressure_signal": accuracy["demand_pressure_signal"],
        "pct_change_vs_recent_avg": accuracy["pct_change_vs_recent_avg"],
    }


_price_trend_cache: Dict[Tuple[str, str, int, int], Tuple[float, Dict[str, Any]]] = {}
PRICE_TREND_CACHE_TTL_SECONDS = 600.0


def price_trend_with_fallback(df: pd.DataFrame, commodity: str, market: str,
                               history_days: int = 90, forecast_days: int = 14) -> Dict[str, Any]:
    """Cached wrapper around price_trend_for; degrades to a history-only
    result (no forecast) if there isn't enough data for Holt-Winters.
    Simpler than forecast_with_fallback (no hard wall-clock timeout thread)
    since this feeds the analytics tab, not the live-quote critical path."""
    import time

    cache_key = (commodity, market, history_days, forecast_days)
    cached = _price_trend_cache.get(cache_key)
    if cached is not None and (time.monotonic() - cached[0]) < PRICE_TREND_CACHE_TTL_SECONDS:
        return cached[1]

    quintal = _QUINTAL_KG
    try:
        result = price_trend_for(df, commodity, market, history_days, forecast_days)
    except ValueError:
        subset = df[(df["commodity"] == commodity) & (df["market_name"] == market)].copy()
        subset = subset.sort_values("arrival_date").set_index("arrival_date")
        series = subset["modal_price"].resample("D").mean().interpolate().tail(history_days)
        result = {
            "commodity": commodity,
            "market": market,
            "history": [{"date": d.strftime("%Y-%m-%d"), "price_per_kg": round(p / quintal, 2)} for d, p in series.items()],
            "forecast": [],
            "demand_pressure_signal": "STABLE",
            "pct_change_vs_recent_avg": 0.0,
        }

    _price_trend_cache[cache_key] = (time.monotonic(), result)
    return result


_forecast_cache: Dict[Tuple[str, str, int], Tuple[float, Dict[str, Any], Optional[str]]] = {}
FORECAST_CACHE_TTL_SECONDS = 600.0
FORECAST_TIMEOUT_SECONDS = 12.0

# In-flight registry so concurrent/rapid-repeat requests for the SAME
# (commodity, market, forecast_days) share one fit instead of each spawning
# its own background thread. This matters specifically because a timed-out
# fit is abandoned, not killed -- it keeps running and consuming CPU. On a
# severely CPU-throttled host (observed: Render free tier), every caller
# that piles on a redundant fit for the same key makes EVERY fit slower,
# including the earlier ones still in flight -- a self-reinforcing slowdown
# under exactly the kind of repeated-clicks load a live demo produces.
_forecast_inflight_lock = threading.Lock()
_forecast_inflight: Dict[Tuple[str, str, int], Tuple[threading.Event, List[Any]]] = {}


def forecast_with_fallback(df: pd.DataFrame, commodity: str, market: str,
                           forecast_days: int = 7) -> Tuple[Dict[str, Any], Optional[str]]:
    """Try the Holt-Winters forecast (cached, time-boxed, de-duplicated); if
    the market lacks enough history OR the fit doesn't finish within
    FORECAST_TIMEOUT_SECONDS, fall back to the recent observed mean
    (drawdown) with a warning instead of hanging the request."""
    import time

    cache_key = (commodity, market, forecast_days)
    cached = _forecast_cache.get(cache_key)
    if cached is not None and (time.monotonic() - cached[0]) < FORECAST_CACHE_TTL_SECONDS:
        return cached[1], cached[2]

    with _forecast_inflight_lock:
        existing = _forecast_inflight.get(cache_key)
        if existing is None:
            done_event = threading.Event()
            box: List[Any] = []
            _forecast_inflight[cache_key] = (done_event, box)

            def _worker():
                try:
                    box.append(("ok", forecast_for(df, commodity, market, forecast_days)))
                except ValueError as e:
                    box.append(("value_error", e))
                except Exception as exc:  # noqa: BLE001 -- reported back, not raised cross-thread
                    box.append(("error", exc))
                finally:
                    done_event.set()
                    with _forecast_inflight_lock:
                        # Only the owner of the current in-flight slot clears
                        # it; a slot may already belong to a NEWER attempt if
                        # this one timed out and TTL later expired.
                        if _forecast_inflight.get(cache_key) == (done_event, box):
                            del _forecast_inflight[cache_key]

            threading.Thread(target=_worker, daemon=True).start()
        else:
            done_event, box = existing

    finished = done_event.wait(timeout=FORECAST_TIMEOUT_SECONDS)
    if not finished:
        outcome = _recent_average_fallback(
            df, commodity, market, forecast_days,
            f"forecast fell back to recent average: took longer than "
            f"{FORECAST_TIMEOUT_SECONDS:.0f}s (host under CPU pressure)",
        )
        # Deliberately not cached: the in-flight fit is still running (and
        # every other waiter on this key is sharing it, not duplicating it)
        # and may populate the real cache moments later for the next caller.
        return outcome

    status, payload = box[0]
    if status == "ok":
        outcome = (payload, None)
    elif status == "value_error":
        outcome = _recent_average_fallback(
            df, commodity, market, forecast_days,
            f"forecast fell back to recent average: {payload}",
        )
    else:
        raise payload

    _forecast_cache[cache_key] = (time.monotonic(), outcome[0], outcome[1])
    return outcome


# --------------------------------------------------------------------------- #
# Main pipeline entrypoint
# --------------------------------------------------------------------------- #

def get_consumer_quote(payload: Dict[str, Any]) -> Dict[str, Any]:
    from pricing_engine import PricingEngine
    from consumer_pricing_engine import ConsumerPricingEngine

    df = load_dataset()

    commodity = str(payload.get("commodity", "")).strip()
    real_commodity = _match_commodity(df, commodity)
    if real_commodity is None:
        raise ValueError(
            f"Unknown commodity '{commodity}'. Options: {list_commodities()}"
        )

    market = str(payload.get("market") or "").strip()
    if not market:
        market = pick_default_market(df, real_commodity)
        uses_default_market = True
    else:
        if market not in set(list_markets(real_commodity)):
            raise ValueError(f"Market '{market}' not found for '{real_commodity}'. "
                             f"Options: {list_markets(real_commodity)[:20]}")
        uses_default_market = False

    order_demand_kg = float(payload.get("order_demand_kg"))
    if order_demand_kg <= 0:
        raise ValueError("order_demand_kg must be positive.")

    # ---- pooled demand: how much EVERY buyer currently wants of this
    # commodity, not just this one order -- registers this order into the
    # rolling pool and gets back the live total (see demand_pool.py). Done
    # before the supply fallback below so that heuristic, if needed, is
    # sized against total market pressure rather than just this one order. ----
    import demand_pool
    pooled_demand_kg = demand_pool.register_and_get_pooled_demand_kg(real_commodity, order_demand_kg)

    warnings: List[str] = []

    # ---- try real per-farmer listings first: these drive BOTH the supply
    # number (sum of real listings, not a guess) AND the multi-farmer
    # routing/allocation below, so they're fetched once up front. ----
    from supabase_integration import fetch_supply_listings
    listings = fetch_supply_listings(real_commodity)

    total_platform_supply_kg = payload.get("total_platform_supply_kg")
    if total_platform_supply_kg in (None, ""):
        if listings:
            total_platform_supply_kg = sum(float(l["available_kg"]) for l in listings)
        else:
            from supabase_integration import fetch_real_supply_kg
            real_supply_kg = fetch_real_supply_kg(real_commodity)
            if real_supply_kg is not None:
                total_platform_supply_kg = real_supply_kg
                warnings.append(f"total_platform_supply_kg not provided; used live farmer-listed "
                                 f"supply from Supabase ({real_supply_kg:.0f}kg for '{real_commodity}').")
            else:
                # Seed guess = 1.5x THIS order alone; cached per-commodity for
                # the rest of the demand window so it doesn't rescale itself
                # away as more buyers pile on (get_or_create_heuristic_supply_kg).
                total_platform_supply_kg = demand_pool.get_or_create_heuristic_supply_kg(
                    real_commodity, order_demand_kg * 1.5)
                warnings.append("total_platform_supply_kg not provided and no live Supabase listings "
                                 f"found for '{real_commodity}'; used a heuristic default "
                                 f"({total_platform_supply_kg:.0f}kg, fixed for this demand window).")
    total_platform_supply_kg = float(total_platform_supply_kg)
    if total_platform_supply_kg <= 0:
        raise ValueError("total_platform_supply_kg must be positive.")

    forecast_days = int(payload.get("forecast_days", 7))

    # ---- 1. forecast (base anchor + demand trend) ----
    forecast, forecast_warning = forecast_with_fallback(df, real_commodity, market, forecast_days)
    if forecast_warning:
        warnings.append(forecast_warning)
    if uses_default_market:
        warnings.append(f"No market specified; used '{market}' (most recent history "
                        f"for '{real_commodity}').")

    engine = PricingEngine(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pricing_config.json"))
    freight_kwargs = dict(
        backhaul_available=bool(payload.get("backhaul_available", False)),
        corridor_type=str(payload.get("corridor_type", "established")),
        season=str(payload.get("season", "normal")),
        force_reefer=payload.get("force_reefer"),
        diesel_price_override=payload.get("diesel_price_override"),
    )

    # ---- 2. logistics: multi-farmer routing when real listings exist,
    # otherwise a single-shipment fallback quote ----
    sourcing = None
    allocations: List[Dict[str, Any]] = []
    trip_quotes: List[Dict[str, Any]] = []
    logistics_freight_total = 0.0
    distance_km = None
    pickup = destination = None
    fulfilled_kg = order_demand_kg
    buyer_pincode = payload.get("buyer_pincode")

    if listings and buyer_pincode:
        import route_optimization as ro
        try:
            plan = ro.plan_multi_farmer_delivery(buyer_pincode, order_demand_kg, listings)
        except ValueError as exc:
            warnings.append(f"Multi-farmer routing unavailable ({exc}); falling back to a single-shipment quote.")
            plan = None

        if plan is not None:
            sourcing = "multi_farmer"
            warnings.extend(plan["warnings"])
            allocations = plan["allocations"]
            fulfilled_kg = plan["total_allocated_kg"]
            if fulfilled_kg < order_demand_kg - 0.01:
                warnings.append(f"Only {fulfilled_kg:.0f}kg of {order_demand_kg:.0f}kg requested could be "
                                f"sourced from real farmer listings; pricing and billing reflect the "
                                f"{fulfilled_kg:.0f}kg that's actually deliverable.")

            for trip in plan["trips"]:
                trip_quote = engine.price_trip(
                    commodity=pricing_profile_for(real_commodity),
                    shipment_weight_kg=trip["total_weight_kg"],
                    distance_km=trip["distance_km"],
                    pickup=" -> ".join(str(s) for s in trip["stops"][:-1]),
                    destination="Buyer",
                    **freight_kwargs,
                )
                trip_dict = trip_quote.to_dict()
                trip_dict["stops"] = trip["stops"]
                trip_dict["farmer_ids"] = trip["farmer_ids"]
                trip_quotes.append(trip_dict)
                logistics_freight_total += float(trip_dict["customer_pays"])
                warnings.extend(trip_dict.get("warnings", []))

            distance_km = round(sum(t["distance_km"] for t in plan["trips"]), 2)

    if sourcing is None:
        # ---- single-shipment fallback (no real farmer data to route across) ----
        sourcing = "single_shipment"
        try:
            distance_km, pickup, destination = resolve_distance(payload)
        except ValueError:
            if buyer_pincode:
                distance_km = DEFAULT_FALLBACK_DISTANCE_KM
                pickup, destination = "Nearby farms (unspecified)", buyer_pincode
                warnings.append(f"No real farmer listings and no distance/pincode provided; used an "
                                f"approximate default distance of {DEFAULT_FALLBACK_DISTANCE_KM:.0f}km.")
            else:
                raise

        quote = engine.price_trip(
            commodity=pricing_profile_for(real_commodity),
            shipment_weight_kg=order_demand_kg,
            distance_km=distance_km,
            pickup=pickup or real_commodity,
            destination=destination or market,
            **freight_kwargs,
        )
        logistics = quote.to_dict()
        logistics_freight_total = float(logistics["customer_pays"])
        trip_quotes = [logistics]
        warnings.extend(logistics.get("warnings", []))

    # ---- 3. consumer price (billed on fulfilled_kg, never on undeliverable demand) ----
    consumer = ConsumerPricingEngine(platform_fee_pct=float(payload.get("platform_fee_pct", 8.0)))
    consumer_quote = consumer.generate_consumer_price(
        historical_base_price_kg=forecast["base_price_per_kg"],
        market_demand_trend_pct=forecast["market_demand_trend_pct"],
        total_platform_supply_kg=total_platform_supply_kg,
        order_demand_kg=fulfilled_kg,
        total_logistics_cost=logistics_freight_total,
        pooled_demand_kg=pooled_demand_kg,
    )
    breakdown = consumer_quote.to_dict()

    # ---- per-farmer payout, now that the shared per-kg farmer price is known.
    # Uses the UNROUNDED consumer_quote value, not the display-rounded dict
    # entry, so individual payouts sum to the same total_farmer_payout the
    # breakdown reports (rounding the per-kg rate first would drift by a few
    # rupees across several allocations). ----
    farmer_net_price_per_kg = consumer_quote.farmer_net_price_per_kg
    for alloc in allocations:
        alloc["farmer_payout"] = round(alloc["allocated_kg"] * farmer_net_price_per_kg, 2)

    other_buyers_demand_kg = pooled_demand_kg - order_demand_kg
    if other_buyers_demand_kg > 0.01:
        window_min = int(demand_pool.DEMAND_WINDOW_SECONDS / 60)
        warnings.append(f"Price reflects pooled demand: your order is {order_demand_kg:.0f}kg of "
                        f"{pooled_demand_kg:.0f}kg total currently being requested for "
                        f"'{real_commodity}' across all buyers (last {window_min} min).")

    # sanity: middleman cut check — neither farmer payout nor freight includes
    # any commission line; only an explicit platform commission (deducted
    # from the farmer, never added for the buyer) is present.
    return {
        "commodity": real_commodity,
        "market": market,
        "requested_kg": order_demand_kg,
        "order_demand_kg": fulfilled_kg,
        "pooled_demand_kg": pooled_demand_kg,
        "total_platform_supply_kg": total_platform_supply_kg,
        "sourcing": sourcing,
        "allocations": allocations,
        "distance_km": distance_km,
        "pickup": pickup,
        "destination": destination,
        "forecast": forecast,
        "logistics": {
            "trips": trip_quotes,
            "total_logistics_cost": logistics_freight_total,
        },
        "consumer_breakdown": breakdown,
        "totals": {
            "farmer_payout": breakdown["order_totals"]["total_farmer_payout"],
            "logistics_cost": breakdown["order_totals"]["total_logistics_cost"],
            "platform_commission": breakdown["order_totals"]["total_platform_commission"],
            "consumer_pays": breakdown["order_totals"]["grand_total_to_pay"],
        },
        "middlemen_in_chain": False,
        "warnings": warnings,
    }


# --------------------------------------------------------------------------- #
# Farmer-facing price signal (no buyer/order involved)
# --------------------------------------------------------------------------- #

def get_farmer_price_signal(payload: Dict[str, Any]) -> Dict[str, Any]:
    """What a farmer would net per kg for a commodity RIGHT NOW, before any
    logistics cost (which is buyer/route-specific and doesn't exist until an
    actual order is placed). Reuses the exact same forecast + macro/micro
    pricing math the buyer-facing quote uses -- historical_base_price_kg from
    the Holt-Winters forecast, market_demand_trend_pct as the macro
    multiplier, and pooled_demand_kg (a read-only peek, NOT a new
    registration) vs. real/heuristic supply as the micro scarcity
    multiplier -- so a farmer sees the same number a buyer's quote would be
    built from, not a separately-invented figure.
    """
    from consumer_pricing_engine import ConsumerPricingEngine
    import demand_pool

    df = load_dataset()

    commodity = str(payload.get("commodity", "")).strip()
    real_commodity = _match_commodity(df, commodity)
    if real_commodity is None:
        raise ValueError(f"Unknown commodity '{commodity}'. Options: {list_commodities()}")

    market = str(payload.get("market") or "").strip()
    if not market:
        market = pick_default_market(df, real_commodity)
        uses_default_market = True
    else:
        uses_default_market = False

    forecast_days = int(payload.get("forecast_days", 7))
    forecast, forecast_warning = forecast_with_fallback(df, real_commodity, market, forecast_days)

    from supabase_integration import fetch_real_supply_kg
    supply_kg = fetch_real_supply_kg(real_commodity)
    supply_source = "supabase_live_listings"
    if supply_kg is None:
        # No order size to seed a heuristic from here (there's no buyer yet) --
        # a fixed, clearly-labeled placeholder is more honest than pretending
        # to derive one.
        supply_kg = demand_pool.get_or_create_heuristic_supply_kg(real_commodity, 1000.0)
        supply_source = "heuristic_placeholder"

    pooled_demand_kg = demand_pool.current_pooled_demand_kg(real_commodity)

    consumer = ConsumerPricingEngine(platform_fee_pct=float(payload.get("platform_fee_pct", 8.0)))
    quote = consumer.generate_consumer_price(
        historical_base_price_kg=forecast["base_price_per_kg"],
        market_demand_trend_pct=forecast["market_demand_trend_pct"],
        total_platform_supply_kg=supply_kg,
        order_demand_kg=1.0,       # no real order exists yet; only the per-kg rate is used below
        total_logistics_cost=0.0,  # logistics is buyer/route-specific, not known until an order exists
        pooled_demand_kg=pooled_demand_kg,
    )

    warnings = []
    if forecast_warning:
        warnings.append(forecast_warning)
    if uses_default_market:
        warnings.append(f"No market specified; used '{market}' (most recent history for '{real_commodity}').")
    if supply_source == "heuristic_placeholder":
        warnings.append(f"No live Supabase listings found for '{real_commodity}'; supply/scarcity is a placeholder.")

    return {
        "commodity": real_commodity,
        "market": market,
        "base_price_per_kg": forecast["base_price_per_kg"],
        "market_demand_trend_pct": forecast["market_demand_trend_pct"],
        "demand_pressure_signal": forecast["demand_pressure_signal"],
        "market_crop_price_per_kg": round(quote.market_crop_price_per_kg, 2),
        "farmer_net_price_per_kg": round(quote.farmer_net_price_per_kg, 2),
        "platform_commission_pct": round(quote.commission_pct * 100, 2),
        "total_platform_supply_kg": supply_kg,
        "supply_source": supply_source,
        "pooled_demand_kg": pooled_demand_kg,
        "warnings": warnings,
    }