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


@app.get("/")
def home():
    return {"message": "FarmDirect AI backend is running"}


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