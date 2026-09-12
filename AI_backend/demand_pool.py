"""
In-process, short-lived pool of CONCURRENT buyer demand per commodity.

The old pricing model only ever looked at one buyer's order_demand_kg vs.
total_platform_supply_kg -- as if that buyer were the only one in the
market. Real scarcity comes from how many buyers are competing for the same
limited supply AT THE SAME TIME: five buyers each wanting 500kg of a
2000kg-supply commodity should all see a higher price than one buyer wanting
500kg alone, because collectively they'd consume all of it.

This tracks a rolling window of recent order_demand_kg values per
commodity, across every quote request this process has served (any buyer),
and consumer_pricing_engine.py sizes its scarcity multiplier off that pooled
total instead of the individual order.

Deliberately simple -- a dict guarded by a lock, not a new Supabase table --
because this is presentation-grade market-pressure modelling, not a real
order book: it only reflects demand seen by THIS running process. Multiple
uvicorn workers, or a restart, each start with an empty pool. That's an
acceptable trade-off for a demo; it would need to move to a shared store
(e.g. a Supabase table with a time-windowed aggregate function, the same
pattern as commodity_supply_kg) before this could drive real prices.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Dict, List, Tuple

DEMAND_WINDOW_SECONDS = 15 * 60  # an order counts as "live" competing demand for 15 min

_lock = threading.Lock()
_pool: Dict[str, List[Tuple[float, float]]] = defaultdict(list)  # commodity -> [(timestamp, kg), ...]
_heuristic_supply: Dict[str, Tuple[float, float]] = {}  # commodity -> (set_at, guessed_supply_kg)


def _key(commodity: str) -> str:
    return commodity.strip().lower()


def _prune(entries: List[Tuple[float, float]], now: float) -> List[Tuple[float, float]]:
    cutoff = now - DEMAND_WINDOW_SECONDS
    return [(t, kg) for (t, kg) in entries if t >= cutoff]


def register_and_get_pooled_demand_kg(commodity: str, order_demand_kg: float) -> float:
    """Records this order as live demand for `commodity` and returns the
    TOTAL pooled demand right now -- this order plus every other still-live
    order from any buyer, in this process -- after pruning anything older
    than DEMAND_WINDOW_SECONDS."""
    now = time.monotonic()
    key = _key(commodity)
    with _lock:
        entries = _prune(_pool[key], now)
        entries.append((now, order_demand_kg))
        _pool[key] = entries
        return sum(kg for _, kg in entries)


def current_pooled_demand_kg(commodity: str) -> float:
    """Read-only peek at the current pool for a commodity, without adding a
    new entry. Returns 0.0 if nobody has requested this commodity recently."""
    now = time.monotonic()
    key = _key(commodity)
    with _lock:
        entries = _prune(_pool[key], now)
        _pool[key] = entries
        return sum(kg for _, kg in entries)


def get_or_create_heuristic_supply_kg(commodity: str, seed_guess_kg: float) -> float:
    """For commodities with no real Supabase supply number: returns a supply
    guess that stays FIXED for one demand window, instead of being
    recomputed (and silently rescaled) on every request.

    This matters for the multi-buyer model: if the fallback guess were
    re-derived from pooled demand on every call, supply would grow in lockstep
    with demand and the scarcity ratio would never move, hiding the exact
    "more buyers -> higher price" effect this pool exists to show. Instead,
    the FIRST caller for a commodity in a given window seeds the guess
    (typically from that lone order's own demand -- see pipeline.py), and
    every other buyer competing for the same commodity within the window
    sees that same fixed number, so pooled demand rising against it actually
    moves the price. Once the window fully elapses with no activity, the
    next caller re-seeds fresh.
    """
    now = time.monotonic()
    key = _key(commodity)
    with _lock:
        cached = _heuristic_supply.get(key)
        if cached is not None and (now - cached[0]) < DEMAND_WINDOW_SECONDS:
            return cached[1]
        _heuristic_supply[key] = (now, seed_guess_kg)
        return seed_guess_kg
