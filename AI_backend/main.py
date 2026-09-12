from pathlib import Path

from fastapi import FastAPI

try:
    from .pricing_engine import PricingEngine
except ImportError:
    from pricing_engine import PricingEngine


CONFIG_PATH = Path(__file__).resolve().parent / "pricing_config.json"
engine = PricingEngine(str(CONFIG_PATH))

app = FastAPI()


@app.get("/")
def home():
    return {"message": "FastAPI is running"}


@app.post("/calculate-price")
def calculate(data: dict):
    quote = engine.price_trip(**data)
    return quote.to_dict()
