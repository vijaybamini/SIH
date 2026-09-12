from fastapi import FastAPI
from pricing_engine import calculate_price

app = FastAPI()


@app.get("/")
def home():
    return {"message": "FastAPI is running"}


@app.post("/calculate-price")
def calculate(data: dict):
    result = calculate_price(data)
    return result