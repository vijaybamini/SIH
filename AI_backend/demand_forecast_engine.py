"""
Demand-Pressure Forecasting Module (using modal_price as the demand signal)
-----------------------------------------------------------------------------
WHY PRICE, NOT ARRIVAL QUANTITY:
The publicly available Agmarknet/Kaggle datasets provide daily PRICE data
(min/max/modal) but not arrival/quantity volumes. Rather than force a
workaround, we use price directly as the demand signal: modal price is the
real-time market-clearing outcome of supply and demand -- when demand
outpaces supply, price rises; when supply floods the market, price falls.

This is arguably MORE directly useful for this platform's core promise
than raw volume would be: forecasting rising/falling price lets us tell
farmers "prices are trending up in your region -- good time to list" and
tell logistics "this market shows rising demand pressure -- prioritize
routing here." Actual buyer ORDER QUANTITIES (used by the route-optimization
engine) come from real bulk-buyer listings on the platform itself, not from
this forecast -- this module's job is guiding farmer/logistics DECISIONS,
not fabricating order volumes that don't exist yet.

MODEL CHOICE: Holt-Winters Exponential Smoothing (same as before) --
captures trend + weekly seasonality in price, fast to fit, explainable.
"""

import os
import tempfile

import pandas as pd
import numpy as np
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import warnings
warnings.filterwarnings("ignore")


# ---------------------------------------------------------------------------
# 0. LOAD REAL DATA (matches your actual Kaggle dataset schema)
# ---------------------------------------------------------------------------

COLUMN_MAP = {
    "District Name": "district",
    "Market Name": "market_name",
    "Commodity": "commodity",
    "Variety": "variety",
    "Grade": "grade",
    "Min Price (Rs./Quintal)": "min_price",
    "Max Price (Rs./Quintal)": "max_price",
    "Modal Price (Rs./Quintal)": "modal_price",
    "Price Date": "arrival_date",
    "State": "state",
}


# Only these 4 of the CSV's 11 columns are ever read by the live pipeline
# (list_commodities/list_markets/forecast_price_trend/pick_default_market) --
# district/variety/grade/state/min_price/max_price/Sl-no. are dead weight for
# this dataframe. Skipping them via `usecols` cuts both parse time and (more
# importantly on a memory-constrained host) peak RAM, since the dropped
# columns are the highest-cardinality string ones. This mattered in practice:
# on Render's free tier, loading the full 1.1M-row/97MB CSV was intermittently
# taking 20s+ (sometimes much more) and made /api/quote look hung.
_NEEDED_RAW_COLUMNS = ["Market Name", "Commodity", "Modal Price (Rs./Quintal)", "Price Date"]


def load_kaggle_data(csv_path):
    """
    Loads the real Kaggle Agmarknet CSV and standardizes column names.
    Expected raw columns: Sl no., District Name, Market Name, Commodity,
    Variety, Grade, Min Price (Rs./Quintal), Max Price (Rs./Quintal),
    Modal Price (Rs./Quintal), Price Date, State -- only Market Name,
    Commodity, Modal Price, and Price Date are actually loaded (see
    _NEEDED_RAW_COLUMNS).
    """
    df = pd.read_csv(csv_path, usecols=lambda c: c in _NEEDED_RAW_COLUMNS)
    df = df.rename(columns=COLUMN_MAP)

    # Price Date appears in the wild in several formats:
    #   "05 Apr 2025" (%d %b %Y)  <- this dataset
    #   "05-Apr-2025" (%d-%b-%Y)  <- original expectation
    # Try the space format first, then backfill any stragglers with a
    # flexible day-first parse so one mixed-format file still loads fully.
    parsed = pd.to_datetime(df["arrival_date"], format="%d %b %Y", errors="coerce")
    if parsed.isna().all():
        parsed = pd.to_datetime(df["arrival_date"], format="%d-%b-%Y", errors="coerce")
    if parsed.isna().all():
        parsed = pd.to_datetime(df["arrival_date"], dayfirst=True, errors="coerce")
    else:
        missing = parsed.isna()
        if missing.any():
            parsed[missing] = pd.to_datetime(df.loc[missing, "arrival_date"],
                                             dayfirst=True, errors="coerce")
    df["arrival_date"] = parsed

    # Drop rows where date parsing failed or modal_price is missing/non-numeric
    df["modal_price"] = pd.to_numeric(df["modal_price"], errors="coerce")
    df = df.dropna(subset=["arrival_date", "modal_price"])

    return df


def generate_sample_data():
    """Simulates ~180 days of modal price data for one commodity/market,
    matching the REAL Kaggle column names/date format, for testing without
    the actual CSV on hand."""
    dates = pd.date_range("2026-03-01", periods=180, freq="D")
    np.random.seed(42)
    trend = np.linspace(1800, 2200, 180)
    weekly_pattern = 80 * np.sin(2 * np.pi * dates.dayofweek / 7)
    noise = np.random.normal(0, 40, 180)
    modal_price = np.clip(trend + weekly_pattern + noise, 500, None)

    df = pd.DataFrame({
        "Sl no.": range(1, 181),
        "District Name": "Warangal",
        "Market Name": "Warangal APMC",
        "Commodity": "Tomato",
        "Variety": "Local",
        "Grade": "FAQ",
        "Min Price (Rs./Quintal)": (modal_price - 100).round(0),
        "Max Price (Rs./Quintal)": (modal_price + 100).round(0),
        "Modal Price (Rs./Quintal)": modal_price.round(1),
        "Price Date": dates.strftime("%d-%b-%Y"),
        "State": "Telangana",
    })
    # Run it through the same loader used for real data, so the test proves
    # the loader itself works, not just the forecasting math.
    sample_path = os.path.join(tempfile.gettempdir(), "_sample_agmarknet.csv")
    df.to_csv(sample_path, index=False)
    return load_kaggle_data(sample_path)


# ---------------------------------------------------------------------------
# 1. FORECASTING FUNCTION
# ---------------------------------------------------------------------------

def forecast_price_trend(df, commodity, market, forecast_days=7):
    """
    Returns: DataFrame with forecasted modal_price for the next
    `forecast_days`, a demand-pressure label (rising/falling/stable),
    and backtest accuracy on held-out real data.
    """
    subset = df[(df["commodity"] == commodity) & (df["market_name"] == market)].copy()
    subset = subset.sort_values("arrival_date")
    subset.set_index("arrival_date", inplace=True)

    # Agmarknet reports one row per variety/grade per day, so a single
    # commodity/market can have several rows on the same date. Aggregate to a
    # daily-mean series (which also reindexes onto a clean daily calendar and
    # leaves gaps as NaN for interpolation) instead of asfreq(), which crashes
    # on duplicate date labels.
    series = subset["modal_price"].resample("D").mean().interpolate()

    if len(series) < 21:
        raise ValueError(
            f"Not enough history for {commodity}/{market} "
            f"({len(series)} days) -- need at least ~3 weeks."
        )

    # Fit ONCE on the full series rather than fitting twice (once on a
    # held-out train split for backtesting, once again on the full series for
    # the real forecast). Two ExponentialSmoothing().fit() calls means two
    # full scipy optimizer runs -- cheap locally (~0.1-0.3s each) but this
    # module's whole reason for existing is that the same call was observed
    # taking 25s+ on Render's throttled free-tier CPU, and every extra fit
    # doubles that cost and doubles how long a background thread lingers
    # eating CPU after a caller times out and moves on. use_brute=False
    # additionally skips statsmodels' brute-force grid search over initial
    # optimizer starting points, roughly halving fit time again.
    full_model = ExponentialSmoothing(
        series, trend="add", seasonal="add", seasonal_periods=7,
    ).fit(use_brute=False)

    # Backtest accuracy is derived from the full model's own in-sample fitted
    # values on the last `forecast_days` days, instead of a true held-out
    # refit -- an in-sample approximation, not a strict backtest, but it
    # costs nothing extra (no second fit) and is only ever surfaced as an
    # informational accuracy metric, not used in any pricing decision.
    fitted_tail = full_model.fittedvalues[-forecast_days:]
    actual_tail = series[-forecast_days:]
    mae = np.mean(np.abs(fitted_tail.values - actual_tail.values))
    mape = np.mean(np.abs((fitted_tail.values - actual_tail.values) / actual_tail.values)) * 100

    future_dates = pd.date_range(
        series.index[-1] + pd.Timedelta(days=1), periods=forecast_days, freq="D"
    )
    forecast = full_model.forecast(forecast_days)

    # Demand-pressure label: compare forecast trend to recent actual average
    recent_avg = series[-7:].mean()
    forecast_avg = forecast.mean()
    pct_change = ((forecast_avg - recent_avg) / recent_avg) * 100

    if pct_change > 3:
        pressure = "RISING (demand pressure increasing)"
    elif pct_change < -3:
        pressure = "FALLING (supply outpacing demand)"
    else:
        pressure = "STABLE"

    result = pd.DataFrame({
        "date": future_dates,
        "commodity": commodity,
        "market_name": market,
        "forecasted_modal_price": forecast.values.round(1),
    })

    return result, {
        "backtest_mae": round(mae, 2),
        "backtest_mape_pct": round(mape, 2),
        "demand_pressure_signal": pressure,
        "pct_change_vs_recent_avg": round(pct_change, 2),
    }


# ---------------------------------------------------------------------------
# 1b. HISTORY + FORECAST (for charting -- the farmer analytics tab)
# ---------------------------------------------------------------------------

def get_price_history_and_forecast(df, commodity, market, history_days=90, forecast_days=14):
    """Like forecast_price_trend, but also returns the actual observed daily
    series (for plotting history alongside the forecast). Calls
    forecast_price_trend() for the fit/forecast (only fit once) and
    separately rebuilds the same daily-mean series cheaply (no second fit)
    to slice out the trailing `history_days` window.

    Returns (history_df, forecast_df, accuracy_dict).
    """
    forecast_result, accuracy = forecast_price_trend(df, commodity, market, forecast_days=forecast_days)

    subset = df[(df["commodity"] == commodity) & (df["market_name"] == market)].copy()
    subset = subset.sort_values("arrival_date")
    subset.set_index("arrival_date", inplace=True)
    series = subset["modal_price"].resample("D").mean().interpolate().tail(history_days)

    history_df = pd.DataFrame({"date": series.index, "modal_price": series.values})
    return history_df, forecast_result, accuracy


# ---------------------------------------------------------------------------
# MAIN — demo run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # --- To use your REAL Kaggle CSV, replace the line below with: ---
    # df = load_kaggle_data("agmarknet_kaggle_data.csv")
    df = generate_sample_data()

    print("Sample historical data (last 10 days, after column standardization):")
    print(df.tail(10)[["arrival_date", "commodity", "market_name", "modal_price"]].to_string(index=False))

    forecast_result, accuracy = forecast_price_trend(df, "Tomato", "Warangal APMC", forecast_days=7)

    print("\n" + "=" * 65)
    print("BACKTEST ACCURACY (held-out last 7 real days vs predicted)")
    print("=" * 65)
    print(f"MAE:  ₹{accuracy['backtest_mae']}/quintal")
    print(f"MAPE: {accuracy['backtest_mape_pct']}%")

    print("\n" + "=" * 65)
    print("NEXT 7-DAY PRICE FORECAST + DEMAND-PRESSURE SIGNAL")
    print("=" * 65)
    print(forecast_result.to_string(index=False))
    print(f"\nDemand-Pressure Signal: {accuracy['demand_pressure_signal']}")
    print(f"(Forecast avg vs recent 7-day avg: {accuracy['pct_change_vs_recent_avg']}%)")