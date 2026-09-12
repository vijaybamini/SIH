import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from .pricing_engine import PricingEngine
except ImportError:
    from pricing_engine import PricingEngine


CONFIG_PATH = Path(__file__).resolve().parent / "pricing_config.json"
engine = PricingEngine(str(CONFIG_PATH))

app = FastAPI(
    title="FarmDirect AI Backend",
    description="Transport pricing + end-to-end farmer-to-consumer quote engine.",
    version="1.1.0",
)

# CORS: the React/Vite frontend runs on a different origin. Allow the origins in
# CORS_ORIGINS (comma separated), or everything for the demo when unset.
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _pipeline():
    """Lazy import so the web service only pays for pipeline deps when used."""
    try:
        from pipeline import get_consumer_quote, list_commodities, list_markets
        return get_consumer_quote, list_commodities, list_markets
    except Exception as exc:  # missing dataset/CSV or dependencies
        raise HTTPException(status_code=503, detail=f"Pipeline unavailable: {exc}")


@app.on_event("startup")
def _warm_dataset_cache():
    """Kicks off dataset parsing on a background thread at boot, instead of
    on whichever request happens to arrive first.

    MUST NOT block here: FastAPI/Starlette does not accept ANY HTTP
    requests -- including Render's own healthCheckPath: / -- until every
    startup handler returns. An earlier version of this called
    load_dataset() directly (synchronously) in this hook; on a slow/
    resource-constrained instance that risks the health check itself never
    succeeding, which would leave Render endlessly retrying a deploy that
    can never go live while silently continuing to serve the OLD instance
    on / -- exactly the kind of failure that looks like "the fix never
    shipped" from the outside. Returning immediately and warming in the
    background keeps startup (and the health check) fast regardless of how
    long the parse takes; a request arriving before it's done just falls
    through to the existing lazy-load-on-first-use path."""
    import threading

    def _warm():
        try:
            from pipeline import load_dataset
            load_dataset()
        except Exception as exc:  # noqa: BLE001 -- best-effort warmup, never blocks boot
            print(f"Dataset warmup failed (will retry lazily on first request): {exc}")

    threading.Thread(target=_warm, daemon=True).start()


@app.get("/")
def home():
    return {"message": "FarmDirect AI backend is running", "build": "dedup-single-fit-2026-09-13e"}


@app.get("/api/commodities")
def commodities():
    try:
        return {"commodities": _pipeline()[1]()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/markets")
def markets(commodity: str):
    try:
        return {"commodity": commodity, "markets": _pipeline()[2](commodity)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/supply")
def supply(commodity: str):
    """Live total farmer-listed supply (kg) for a commodity, straight from
    Supabase — the same number /api/quote falls back on when
    total_platform_supply_kg isn't given in the request."""
    try:
        from pipeline import _match_commodity, load_dataset
        from supabase_integration import fetch_real_supply_kg
        df = load_dataset()
        real_commodity = _match_commodity(df, commodity)
        if real_commodity is None:
            raise HTTPException(status_code=400, detail=f"Unknown commodity '{commodity}'.")
        supply_kg = fetch_real_supply_kg(real_commodity)
        return {
            "commodity": real_commodity,
            "total_platform_supply_kg": supply_kg,
            "source": "supabase_live_listings" if supply_kg is not None else "no_live_listings_or_supabase_unavailable",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Pipeline unavailable: {exc}")


@app.get("/api/farmer-price")
def farmer_price(commodity: str, market: str = None):
    """What a farmer would net per kg for a commodity right now (forecast +
    demand trend + scarcity, before any buyer-specific logistics cost) —
    the same pricing math /api/quote uses, without needing a buyer order."""
    try:
        from pipeline import get_farmer_price_signal
        payload = {"commodity": commodity}
        if market:
            payload["market"] = market
        return get_farmer_price_signal(payload)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Pipeline unavailable: {exc}")


@app.get("/api/debug-quote")
def debug_quote(commodity: str = "Wheat"):
    """TEMPORARY diagnostic: times each stage of the /api/quote pipeline
    independently, with its own hard timeout per stage, so this endpoint
    itself can never hang even if one stage does -- used to find exactly
    where /api/quote is stalling in production without needing direct
    server log access. Safe to remove once the hang is diagnosed."""
    import queue
    import threading
    import time

    def run_staged(name, fn, timeout_s):
        t0 = time.time()
        q: "queue.Queue" = queue.Queue(maxsize=1)

        def _worker():
            try:
                q.put(("ok", fn()))
            except Exception as exc:  # noqa: BLE001
                q.put(("error", repr(exc)))

        threading.Thread(target=_worker, daemon=True).start()
        try:
            status, payload = q.get(timeout=timeout_s)
        except queue.Empty:
            return {"stage": name, "status": "TIMED_OUT", "seconds": round(time.time() - t0, 2)}
        return {"stage": name, "status": status, "seconds": round(time.time() - t0, 2),
                "result": payload if status == "ok" else None,
                "error": payload if status == "error" else None}

    stages = []

    import pipeline
    r1 = run_staged("load_dataset", lambda: len(pipeline.load_dataset()), 20)
    stages.append(r1)
    if r1["status"] != "ok":
        return {"stages": stages}

    df = pipeline.load_dataset()
    r2 = run_staged("match_commodity", lambda: pipeline._match_commodity(df, commodity), 5)
    stages.append(r2)
    real_commodity = r2.get("result") or commodity

    r3 = run_staged("pick_default_market", lambda: pipeline.pick_default_market(df, real_commodity), 10)
    stages.append(r3)
    market = r3.get("result")

    from supabase_integration import fetch_supply_listings, fetch_real_supply_kg
    r4 = run_staged("fetch_supply_listings", lambda: fetch_supply_listings(real_commodity), 10)
    stages.append(r4)

    r5 = run_staged("fetch_real_supply_kg", lambda: fetch_real_supply_kg(real_commodity), 10)
    stages.append(r5)

    if market:
        r6 = run_staged("forecast_with_fallback", lambda: pipeline.forecast_with_fallback(df, real_commodity, market, 7)[1] or "ok", 25)
        stages.append(r6)

    import demand_pool
    r7 = run_staged("demand_pool", lambda: demand_pool.register_and_get_pooled_demand_kg(real_commodity, 500), 5)
    stages.append(r7)

    from pricing_engine import PricingEngine
    eng = PricingEngine(str(CONFIG_PATH))
    r8 = run_staged("pricing_engine", lambda: eng.price_trip(
        commodity="fruits", shipment_weight_kg=500, distance_km=120, pickup="A", destination="B",
    ).customer_pays, 10)
    stages.append(r8)

    return {"commodity_resolved": real_commodity, "market": market, "stages": stages}


@app.post("/api/quote")
def quote(data: dict):
    """End-to-end farmer -> consumer quote.

    Chains demand forecast -> logistics freight -> consumer price, returning a
    full per-rupee breakdown (crop payout, freight, platform fee) with no
    middleman margin in the chain.
    """
    try:
        return _pipeline()[0](data)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/orders")
def place_order(data: dict):
    """Confirms a buyer's order: recomputes the exact same breakdown as
    /api/quote (same payload shape, plus a required buyer_id), then persists
    it -- the order, each farmer's allocation, and each vehicle trip -- via
    Supabase's create_order() RPC. The Python backend calls Supabase with
    the anon key and has no authenticated auth.uid() of its own, so a plain
    insert would be rejected by RLS; create_order() is a security-definer
    function that does the write on the backend's behalf (see the
    20260912160000 migration for why buyer_id is passed explicitly and
    trusted rather than read off a session)."""
    buyer_id = data.get("buyer_id")
    if not buyer_id:
        raise HTTPException(status_code=400, detail="buyer_id is required to place an order.")

    try:
        get_consumer_quote, _, _ = _pipeline()
        result = get_consumer_quote(data)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    from supabase_integration import create_order as save_order

    breakdown = result["consumer_breakdown"]
    trips_for_db = [
        {
            "vehicle_class": t.get("vehicle_class"),
            "total_weight_kg": t.get("shipment_weight_kg"),
            "distance_km": t.get("road_distance_km"),
            "cost": t.get("customer_pays"),
            "stops": t.get("stops", []),
        }
        for t in result["logistics"]["trips"]
    ]

    order_id = save_order(
        buyer_id=buyer_id,
        commodity=result["commodity"],
        market=result.get("market"),
        order_demand_kg=result["order_demand_kg"],
        base_price_per_kg=breakdown["per_kg_breakdown"]["base_apmc_anchor_price"],
        market_crop_price_per_kg=breakdown["per_kg_breakdown"]["market_crop_price"],
        logistics_cost_total=result["totals"]["logistics_cost"],
        platform_commission_total=result["totals"]["platform_commission"],
        final_price_per_kg=breakdown["per_kg_breakdown"]["final_checkout_price_per_kg"],
        grand_total=result["totals"]["consumer_pays"],
        breakdown=result,
        allocations=result["allocations"],
        trips=trips_for_db,
    )
    if order_id is None:
        raise HTTPException(
            status_code=503,
            detail="Order could not be saved (Supabase unavailable, or the "
                   "create_order migration hasn't been applied yet). The "
                   "price quote above is still accurate -- nothing was charged.",
        )

    return {"order_id": order_id, **result}


@app.post("/calculate-price")
def calculate(data: dict):
    """Legacy: transport-only freight quote (backwards compatible)."""
    try:
        quote = engine.price_trip(**data)
        return quote.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))