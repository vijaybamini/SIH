"""
Mandi Modal Price Prediction — training & evaluation pipeline (v2)
=====================================================================
Leakage-safe chronological training pipeline for predicting
Modal Price (Rs./Quintal).

Run:
    python train.py

Expected input columns:
    State, District Name, Market Name, Commodity, Variety, Grade,
    Season, Price Date, Min Price, Max Price,
    Modal Price (Rs./Quintal), Source
"""

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import joblib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.ensemble import (
    HistGradientBoostingRegressor,
    RandomForestRegressor,
    ExtraTreesRegressor,
)
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore", category=FutureWarning)

# Optional stronger models
try:
    from xgboost import XGBRegressor
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    from lightgbm import LGBMRegressor
    HAS_LGBM = True
except ImportError:
    HAS_LGBM = False

try:
    from catboost import CatBoostRegressor
    HAS_CATBOOST = True
except ImportError:
    HAS_CATBOOST = False


# -------------------------------------------------------------------------
# CONFIG
# -------------------------------------------------------------------------

DATA_PATH = r"C:\Users\irfan\Downloads\india_mandi_prices_population_proportional.csv"

# Optional additional REAL datasets.
# Every file must contain Source='REAL' for every row.
EXTRA_REAL_DATA_PATHS = []

OUTPUT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_COL = "Modal Price (Rs./Quintal)"

GROUP_COLS = [
    "State",
    "District Name",
    "Market Name",
    "Commodity",
    "Variety",
    "Grade",
]

LOW_CARD_CATS = ["State", "Grade", "Season"]
HIGH_CARD_CATS = [
    "District Name",
    "Market Name",
    "Commodity",
    "Variety",
]

TRAIN_END = "2025-04-30"
VAL_END = "2025-06-30"

TE_SMOOTHING = 20
RANDOM_STATE = 42

# Optional inverse-state-frequency weighting.
STATE_SAMPLE_WEIGHTING = False


FEATURE_CLASSIFICATION = {
    "State / District / Market / Commodity / Variety / Grade": (
        "AVAILABLE BEFORE PREDICTION",
        "These describe the farmer/customer query and are known at prediction time.",
    ),
    "Season / Month / Quarter / WeekOfYear / DayOfYear / DOY_sin / DOY_cos": (
        "AVAILABLE BEFORE PREDICTION",
        "Calendar-derived features.",
    ),
    "Lag_1 / Lag_2 / Lag_3 / Lag_7": (
        "AVAILABLE BEFORE PREDICTION",
        "Strictly use previously observed prices.",
    ),
    "Rolling price features": (
        "AVAILABLE BEFORE PREDICTION",
        "All rolling calculations use shift(1), excluding the current target.",
    ),
    "Price_Change / Pct_Change / Trend_Slope": (
        "AVAILABLE BEFORE PREDICTION",
        "Derived only from historical prices.",
    ),
    "Target encoding": (
        "SAFE — TRAIN ONLY",
        "Fitted only using training rows.",
    ),
    "Frequency encoding": (
        "SAFE — TRAIN ONLY",
        "Category frequencies are calculated only from training rows.",
    ),
    "Commodity fallback median": (
        "SAFE — TRAIN ONLY",
        "Missing historical prices use commodity medians calculated from training rows.",
    ),
    "Same-day Min Price / Max Price": (
        "TARGET LEAKAGE — EXCLUDED",
        "These are not assumed to be known before the day's market closes.",
    ),
}


def print_feature_classification():
    print("\n" + "=" * 75)
    print("FEATURE CLASSIFICATION")
    print("=" * 75)

    for feature, (status, reason) in FEATURE_CLASSIFICATION.items():
        print(f"[{status}] {feature}")
        print(f"    -> {reason}")


# -------------------------------------------------------------------------
# DATA LOADING
# -------------------------------------------------------------------------

def load_data():
    print("\nLoading data...")

    df = pd.read_csv(DATA_PATH, low_memory=False)

    for path in EXTRA_REAL_DATA_PATHS:
        extra = pd.read_csv(path, low_memory=False)

        if "Source" not in extra.columns:
            raise ValueError(
                f"{path} does not contain a Source column. "
                "Additional datasets must explicitly contain Source='REAL'."
            )

        if not (extra["Source"] == "REAL").all():
            raise ValueError(
                f"{path} contains rows where Source is not REAL. "
                "Refusing to merge unverified rows."
            )

        df = pd.concat([df, extra], ignore_index=True)
        print(f"  Added {len(extra):,} REAL rows from {path}")

    required = GROUP_COLS + [
        "Season",
        "Price Date",
        TARGET_COL,
        "Source",
    ]

    missing = [c for c in required if c not in df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["Price Date"] = pd.to_datetime(
        df["Price Date"],
        dayfirst=True,
        errors="coerce",
    )

    if df["Price Date"].isna().any():
        raise ValueError("Some Price Date values could not be parsed.")

    df[TARGET_COL] = pd.to_numeric(
        df[TARGET_COL],
        errors="coerce",
    )

    df = df.dropna(subset=GROUP_COLS + ["Price Date", TARGET_COL]).copy()

    print(f"Loaded {len(df):,} rows.")

    return df


# -------------------------------------------------------------------------
# SAME-DAY DUPLICATE AUDIT
# -------------------------------------------------------------------------

def audit_and_dedupe_same_day(df):
    duplicate_mask = df.duplicated(
        subset=GROUP_COLS + ["Price Date"],
        keep=False,
    )

    duplicate_count = int(duplicate_mask.sum())

    if duplicate_count == 0:
        print("No duplicate group/date rows found.")
        return df

    print(
        f"WARNING: {duplicate_count:,} rows share the same "
        "(group, Price Date) key."
    )

    print(
        "Aggregating duplicates before lag/rolling calculations "
        "to prevent same-day blending."
    )

    aggregation = {TARGET_COL: "mean"}

    other_columns = [
        c
        for c in df.columns
        if c not in GROUP_COLS + ["Price Date", TARGET_COL]
    ]

    for c in other_columns:
        aggregation[c] = "first"

    df = (
        df.groupby(
            GROUP_COLS + ["Price Date"],
            as_index=False,
        )
        .agg(aggregation)
    )

    return df


# -------------------------------------------------------------------------
# CALENDAR FEATURES
# -------------------------------------------------------------------------

def add_calendar_features(df):
    df = df.copy()

    df["Month"] = df["Price Date"].dt.month
    df["Quarter"] = df["Price Date"].dt.quarter
    df["WeekOfYear"] = (
        df["Price Date"].dt.isocalendar().week.astype(int)
    )
    df["DayOfYear"] = df["Price Date"].dt.dayofyear

    df["DOY_sin"] = np.sin(
        2 * np.pi * df["DayOfYear"] / 365.25
    )

    df["DOY_cos"] = np.cos(
        2 * np.pi * df["DayOfYear"] / 365.25
    )

    return df


# -------------------------------------------------------------------------
# LAG / ROLLING FEATURES
# -------------------------------------------------------------------------

def _rolling_slope(values):
    series = pd.Series(values).dropna()

    if len(series) < 2:
        return np.nan

    x = np.arange(len(series))

    return np.polyfit(
        x,
        series.values,
        1,
    )[0]


def add_lag_rolling_features(df):
    df = (
        df.sort_values(GROUP_COLS + ["Price Date"])
        .reset_index(drop=True)
        .copy()
    )

    group_target = df.groupby(GROUP_COLS)[TARGET_COL]

    observations = df.groupby(GROUP_COLS).size()
    median_observations = observations.median()

    print(
        f"Median observations per group: "
        f"{median_observations:.0f}"
    )

    df["Lag_1"] = group_target.shift(1)
    df["Lag_2"] = group_target.shift(2)
    df["Lag_3"] = group_target.shift(3)

    if median_observations >= 10:
        df["Lag_7"] = group_target.shift(7)
        has_lag7 = True
    else:
        print("Skipping Lag_7 because typical group history is short.")
        has_lag7 = False

    # Critical leakage prevention:
    # shift first, then rolling.
    df["_shifted"] = group_target.shift(1)

    shifted_group = df.groupby(GROUP_COLS)["_shifted"]

    df["Roll3_Mean"] = shifted_group.transform(
        lambda s: s.rolling(3, min_periods=1).mean()
    )

    df["Roll7_Mean"] = shifted_group.transform(
        lambda s: s.rolling(7, min_periods=2).mean()
    )

    df["Roll14_Mean"] = shifted_group.transform(
        lambda s: s.rolling(14, min_periods=3).mean()
    )

    df["Roll7_Median"] = shifted_group.transform(
        lambda s: s.rolling(7, min_periods=2).median()
    )

    df["Roll7_Std"] = shifted_group.transform(
        lambda s: s.rolling(7, min_periods=2).std()
    )

    df["Price_Change"] = (
        df["Lag_1"] - df["Lag_2"]
    )

    df["Pct_Change"] = (
        (df["Lag_1"] - df["Lag_2"])
        / df["Lag_2"].replace(0, np.nan)
    )

    df["Trend_Slope"] = shifted_group.transform(
        lambda s: s.rolling(
            5,
            min_periods=2,
        ).apply(
            _rolling_slope,
            raw=True,
        )
    )

    df.drop(columns=["_shifted"], inplace=True)

    price_features = [
        "Lag_1",
        "Lag_2",
        "Lag_3",
    ]

    if has_lag7:
        price_features.append("Lag_7")

    price_features += [
        "Roll3_Mean",
        "Roll7_Mean",
        "Roll14_Mean",
        "Roll7_Median",
    ]

    variability_features = [
        "Roll7_Std",
        "Price_Change",
        "Pct_Change",
        "Trend_Slope",
    ]

    return (
        df,
        price_features,
        variability_features,
        has_lag7,
    )


# -------------------------------------------------------------------------
# TRAIN-ONLY FALLBACK
# -------------------------------------------------------------------------

def train_only_fallback_fill(
    train,
    val,
    test,
    price_features,
    variability_features,
):
    commodity_median = (
        train.groupby("Commodity")[TARGET_COL]
        .median()
    )

    global_median = train[TARGET_COL].median()

    for part in [train, val, test]:
        fallback = (
            part["Commodity"]
            .map(commodity_median)
            .fillna(global_median)
        )

        for feature in price_features:
            part[feature] = (
                part[feature]
                .fillna(fallback)
            )

        for feature in variability_features:
            part[feature] = (
                part[feature]
                .fillna(0.0)
            )

    return (
        train,
        val,
        test,
        commodity_median,
        global_median,
    )


# -------------------------------------------------------------------------
# TRAIN-ONLY TARGET / FREQUENCY ENCODING
# -------------------------------------------------------------------------

def fit_target_encoding(
    train,
    column,
    smoothing=TE_SMOOTHING,
):
    stats = (
        train.groupby(column)[TARGET_COL]
        .agg(["mean", "count"])
    )

    global_mean = train[TARGET_COL].mean()

    smoothed = (
        stats["count"] * stats["mean"]
        + smoothing * global_mean
    ) / (
        stats["count"] + smoothing
    )

    return smoothed, global_mean


def apply_encodings(train, val, test):
    encoding_maps = {}
    frequency_maps = {}

    global_mean = train[TARGET_COL].mean()

    for column in HIGH_CARD_CATS:
        target_map, _ = fit_target_encoding(
            train,
            column,
        )

        frequency_map = (
            train[column]
            .value_counts(normalize=True)
        )

        encoding_maps[column] = target_map
        frequency_maps[column] = frequency_map

        for part in [train, val, test]:
            part[column + "_TE"] = (
                part[column]
                .map(target_map)
                .fillna(global_mean)
            )

            part[column + "_Freq"] = (
                part[column]
                .map(frequency_map)
                .fillna(0.0)
            )

    for column in LOW_CARD_CATS:
        categories = list(
            pd.Categorical(train[column]).categories
        )

        categories.append("__unseen__")

        for part in [train, val, test]:
            part[column] = pd.Categorical(
                part[column],
                categories=categories,
            ).fillna("__unseen__")

            part[column] = part[column].astype("category")

    return (
        train,
        val,
        test,
        encoding_maps,
        frequency_maps,
        global_mean,
    )


# -------------------------------------------------------------------------
# METRICS
# -------------------------------------------------------------------------

def compute_metrics(y_true, y_pred):
    y_true = pd.Series(y_true)
    y_pred = np.asarray(y_pred)

    mae = mean_absolute_error(
        y_true,
        y_pred,
    )

    rmse = mean_squared_error(
        y_true,
        y_pred,
    ) ** 0.5

    r2 = r2_score(
        y_true,
        y_pred,
    )

    valid = y_true != 0

    if valid.sum() > 0:
        mape = (
            np.mean(
                np.abs(
                    (
                        y_true[valid].values
                        - y_pred[valid]
                    )
                    / y_true[valid].values
                )
            )
            * 100
        )
    else:
        mape = np.nan

    return {
        "MAE": float(mae),
        "RMSE": float(rmse),
        "R2": float(r2),
        "MAPE_%": float(mape),
        "n": int(len(y_true)),
    }


def evaluate(
    model,
    X,
    y,
    name,
    log_target=False,
):
    prediction = model.predict(X)

    if log_target:
        prediction = np.expm1(prediction)

    metrics = compute_metrics(
        y,
        prediction,
    )

    print(
        f"{name}: "
        f"MAE={metrics['MAE']:.1f}  "
        f"RMSE={metrics['RMSE']:.1f}  "
        f"R2={metrics['R2']:.4f}  "
        f"MAPE={metrics['MAPE_%']:.2f}%  "
        f"(n={metrics['n']})"
    )

    return metrics, prediction


# -------------------------------------------------------------------------
# PRICE RANGE BREAKDOWN
# -------------------------------------------------------------------------

def price_range_thresholds(train):
    q1, median, q3 = (
        train[TARGET_COL]
        .quantile([0.25, 0.50, 0.75])
        .values
    )

    thresholds = {
        "Low (<Q1)": (-np.inf, q1),
        "Medium (Q1-median)": (q1, median),
        "High (median-Q3)": (median, q3),
        "Very High (>Q3)": (q3, np.inf),
    }

    return thresholds, [q1, median, q3]


def price_range_breakdown(
    y_true,
    y_pred,
    thresholds,
):
    rows = []

    y_true = pd.Series(y_true)

    for label, (low, high) in thresholds.items():

        if high == np.inf:
            mask = y_true > low
        else:
            mask = (
                (y_true > low)
                & (y_true <= high)
            )

        if mask.sum() == 0:
            continue

        metrics = compute_metrics(
            y_true[mask],
            np.asarray(y_pred)[mask],
        )

        metrics["range"] = label
        rows.append(metrics)

    if not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows)[
        [
            "range",
            "n",
            "MAE",
            "RMSE",
            "R2",
            "MAPE_%",
        ]
    ]


# -------------------------------------------------------------------------
# GROUP BREAKDOWN
# -------------------------------------------------------------------------

def group_breakdown(
    df_eval,
    y_true,
    y_pred,
    group_column,
    min_n=30,
):
    temp = df_eval[[group_column]].copy()

    temp["_actual"] = np.asarray(y_true)
    temp["_prediction"] = np.asarray(y_pred)

    rows = []

    for key, group in temp.groupby(
        group_column,
        observed=True,
    ):
        if len(group) < min_n:
            continue

        metrics = compute_metrics(
            group["_actual"],
            group["_prediction"],
        )

        metrics[group_column] = key
        rows.append(metrics)

    if not rows:
        return pd.DataFrame()

    return (
        pd.DataFrame(rows)
        [
            [
                group_column,
                "n",
                "MAE",
                "RMSE",
                "R2",
                "MAPE_%",
            ]
        ]
        .sort_values(
            "MAPE_%",
            ascending=False,
        )
    )


# -------------------------------------------------------------------------
# MODELS
# -------------------------------------------------------------------------

def candidate_models():
    models = {
        "HistGB": lambda cat_idx: HistGradientBoostingRegressor(
            max_iter=300,
            learning_rate=0.08,
            max_depth=8,
            min_samples_leaf=20,
            categorical_features=cat_idx,
            random_state=RANDOM_STATE,
            early_stopping=True,
            validation_fraction=0.1,
        ),

        "RandomForest": lambda cat_idx: RandomForestRegressor(
            n_estimators=300,
            max_depth=16,
            min_samples_leaf=5,
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),

        "ExtraTrees": lambda cat_idx: ExtraTreesRegressor(
            n_estimators=300,
            max_depth=16,
            min_samples_leaf=5,
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),
    }

    if HAS_XGB:
        models["XGBoost"] = lambda cat_idx: XGBRegressor(
            n_estimators=400,
            learning_rate=0.06,
            max_depth=8,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )
    else:
        print("XGBoost not installed — skipped.")

    if HAS_LGBM:
        models["LightGBM"] = lambda cat_idx: LGBMRegressor(
            n_estimators=400,
            learning_rate=0.06,
            max_depth=8,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            verbosity=-1,
        )
    else:
        print("LightGBM not installed — skipped.")

    if HAS_CATBOOST:
        models["CatBoost"] = lambda cat_idx: CatBoostRegressor(
            iterations=400,
            learning_rate=0.06,
            depth=8,
            random_state=RANDOM_STATE,
            verbose=False,
        )
    else:
        print(
            "CatBoost not installed — skipped. "
            "It is worth testing separately because of the "
            "high-cardinality categorical features."
        )

    return models


HISTGB_GRID = [
    {
        "max_iter": 300,
        "learning_rate": 0.08,
        "max_depth": 8,
        "min_samples_leaf": 20,
        "l2_regularization": 0.0,
    },
    {
        "max_iter": 300,
        "learning_rate": 0.05,
        "max_depth": 6,
        "min_samples_leaf": 30,
        "l2_regularization": 1.0,
    },
    {
        "max_iter": 500,
        "learning_rate": 0.03,
        "max_depth": 6,
        "min_samples_leaf": 50,
        "l2_regularization": 1.0,
    },
    {
        "max_iter": 500,
        "learning_rate": 0.05,
        "max_depth": 10,
        "min_samples_leaf": 20,
        "l2_regularization": 0.5,
    },
]


def tune_histgb_on_validation(
    X_train,
    y_train,
    X_val,
    y_val,
    cat_idx,
    sample_weight=None,
):
    best_mae = np.inf
    best_params = None

    print("\n" + "=" * 75)
    print("HISTGB HYPERPARAMETER SEARCH")
    print("=" * 75)

    for params in HISTGB_GRID:

        model = HistGradientBoostingRegressor(
            categorical_features=cat_idx,
            random_state=RANDOM_STATE,
            early_stopping=True,
            validation_fraction=0.1,
            **params,
        )

        model.fit(
            X_train,
            y_train,
            sample_weight=sample_weight,
        )

        prediction = model.predict(X_val)

        mae = mean_absolute_error(
            y_val,
            prediction,
        )

        print(
            f"{params} -> "
            f"Validation MAE={mae:.1f}"
        )

        if mae < best_mae:
            best_mae = mae
            best_params = params

    print(
        f"\nBest parameters: {best_params}"
    )

    return best_params


# -------------------------------------------------------------------------
# EXPERIMENT
# -------------------------------------------------------------------------

def run_experiment(
    name,
    X_train,
    y_train,
    X_val,
    y_val,
    X_test,
    y_test,
    X_test_real,
    y_test_real,
    feature_cols,
    cat_idx,
    model=None,
    log_target=False,
    sample_weight=None,
):
    print("\n" + "=" * 75)
    print(f"EXPERIMENT: {name}")
    print("=" * 75)

    if model is None:
        model = HistGradientBoostingRegressor(
            max_iter=300,
            learning_rate=0.08,
            max_depth=8,
            min_samples_leaf=20,
            categorical_features=cat_idx,
            random_state=RANDOM_STATE,
            early_stopping=True,
            validation_fraction=0.1,
        )

    y_fit = (
        np.log1p(y_train)
        if log_target
        else y_train
    )

    model.fit(
        X_train,
        y_fit,
        sample_weight=sample_weight,
    )

    train_metrics, _ = evaluate(
        model,
        X_train,
        y_train,
        f"{name} | Train",
        log_target,
    )

    val_metrics, _ = evaluate(
        model,
        X_val,
        y_val,
        f"{name} | Validation",
        log_target,
    )

    test_metrics, test_prediction = evaluate(
        model,
        X_test,
        y_test,
        f"{name} | Test",
        log_target,
    )

    real_metrics, _ = evaluate(
        model,
        X_test_real,
        y_test_real,
        f"{name} | Test REAL only",
        log_target,
    )

    return {
        "name": name,
        "model": model,
        "feature_cols": feature_cols,
        "log_target": log_target,
        "metrics": {
            "train": train_metrics,
            "val": val_metrics,
            "test": test_metrics,
            "test_real_only": real_metrics,
        },
        "test_pred": test_prediction,
        "X_val": X_val,
        "y_val": y_val,
    }


def choose_best(experiments):
    return min(
        experiments,
        key=lambda x: x["metrics"]["val"]["MAE"],
    )


# -------------------------------------------------------------------------
# PLOTS
# -------------------------------------------------------------------------

def plot_actual_vs_predicted(
    y_true,
    y_pred,
    title,
    path,
):
    rng = np.random.RandomState(RANDOM_STATE)

    n = min(5000, len(y_true))

    indices = rng.choice(
        len(y_true),
        size=n,
        replace=False,
    )

    actual = np.asarray(y_true)[indices]
    predicted = np.asarray(y_pred)[indices]

    fig, ax = plt.subplots(
        figsize=(7, 7)
    )

    ax.scatter(
        actual,
        predicted,
        alpha=0.3,
        s=10,
    )

    upper = max(
        actual.max(),
        predicted.max(),
    )

    ax.plot(
        [0, upper],
        [0, upper],
        "r--",
    )

    ax.set_xlabel(
        "Actual Modal Price"
    )

    ax.set_ylabel(
        "Predicted Modal Price"
    )

    ax.set_title(title)

    fig.tight_layout()

    fig.savefig(
        path,
        dpi=120,
    )

    plt.close(fig)


def plot_error_distribution(
    y_true,
    y_pred,
    title,
    path,
):
    errors = (
        np.asarray(y_pred)
        - np.asarray(y_true)
    )

    fig, ax = plt.subplots(
        figsize=(7, 5)
    )

    ax.hist(
        errors,
        bins=80,
    )

    ax.axvline(
        0,
        color="r",
        linestyle="--",
    )

    ax.set_xlabel(
        "Prediction Error "
        "(Predicted - Actual, Rs./Quintal)"
    )

    ax.set_ylabel("Count")

    ax.set_title(title)

    fig.tight_layout()

    fig.savefig(
        path,
        dpi=120,
    )

    plt.close(fig)


def plot_feature_importance(
    importance_df,
    title,
    path,
    top_n=20,
):
    top = (
        importance_df
        .sort_values(
            "importance",
            ascending=False,
        )
        .head(top_n)
    )

    fig, ax = plt.subplots(
        figsize=(
            8,
            max(4, 0.3 * len(top)),
        )
    )

    ax.barh(
        top["feature"][::-1],
        top["importance"][::-1],
    )

    ax.set_xlabel(
        "Permutation importance"
    )

    ax.set_title(title)

    fig.tight_layout()

    fig.savefig(
        path,
        dpi=120,
    )

    plt.close(fig)


# -------------------------------------------------------------------------
# MAIN
# -------------------------------------------------------------------------

def run_all():

    print_feature_classification()

    df = load_data()

    df = audit_and_dedupe_same_day(df)

    df = add_calendar_features(df)

    (
        df,
        price_features,
        variability_features,
        has_lag7,
    ) = add_lag_rolling_features(df)

    # Chronological ordering
    df = (
        df.sort_values("Price Date")
        .reset_index(drop=True)
    )

    # Chronological split
    train = df[
        df["Price Date"]
        <= pd.Timestamp(TRAIN_END)
    ].copy()

    val = df[
        (df["Price Date"] > pd.Timestamp(TRAIN_END))
        & (df["Price Date"] <= pd.Timestamp(VAL_END))
    ].copy()

    test = df[
        df["Price Date"]
        > pd.Timestamp(VAL_END)
    ].copy()

    print(
        "\nTrain / Validation / Test:"
    )

    print(
        f"Train: {len(train):,}"
    )

    print(
        f"Validation: {len(val):,}"
    )

    print(
        f"Test: {len(test):,}"
    )

    # Fill lag/rolling missing values using TRAIN only
    (
        train,
        val,
        test,
        commodity_median_train,
        global_train_median,
    ) = train_only_fallback_fill(
        train,
        val,
        test,
        price_features,
        variability_features,
    )

    # Train-only categorical encodings
    (
        train,
        val,
        test,
        encoding_maps,
        frequency_maps,
        global_mean,
    ) = apply_encodings(
        train,
        val,
        test,
    )

    # Legacy-equivalent baseline features
    for part in [train, val, test]:
        part["Lag1_Modal_Price"] = part["Lag_1"]
        part["Roll3_Modal_Price"] = part["Roll3_Mean"]

    if "Source" in test.columns:
        test_real = test[
            test["Source"].astype(str).str.upper() == "REAL"
        ].copy()
    else:
        test_real = test.copy()

    if len(test_real) == 0:
        print(
            "WARNING: No REAL-only rows exist in test. "
            "Using the complete test set for REAL-only evaluation."
        )
        test_real = test.copy()

    # Optional state weighting
    sample_weight = None

    if STATE_SAMPLE_WEIGHTING:
        counts = train["State"].value_counts()

        weights = (
            1.0 / counts
        ) * counts.median()

        sample_weight = (
            train["State"]
            .map(weights)
            .values
        )

        print(
            "State sample weighting is ON."
        )

    encoded = [
        c + "_TE"
        for c in HIGH_CARD_CATS
    ]

    frequencies = [
        c + "_Freq"
        for c in HIGH_CARD_CATS
    ]

    lag_full = [
        "Lag_1",
        "Lag_2",
        "Lag_3",
    ]

    if has_lag7:
        lag_full.append("Lag_7")

    lag_full += [
        "Roll3_Mean",
        "Roll7_Mean",
        "Roll14_Mean",
        "Roll7_Median",
        "Roll7_Std",
        "Price_Change",
        "Pct_Change",
        "Trend_Slope",
    ]

    seasonal_basic = [
        "Month",
        "DayOfYear",
    ]

    seasonal_full = [
        "Month",
        "Quarter",
        "WeekOfYear",
        "DayOfYear",
        "DOY_sin",
        "DOY_cos",
    ]

    feature_sets = {
        "A_original_leakage_fixed":
            LOW_CARD_CATS
            + encoded
            + seasonal_basic
            + [
                "Lag1_Modal_Price",
                "Roll3_Modal_Price",
            ],

        "B_expanded_lag_features":
            LOW_CARD_CATS
            + encoded
            + seasonal_basic
            + lag_full,

        "C_plus_encoding_and_seasonal":
            LOW_CARD_CATS
            + encoded
            + frequencies
            + seasonal_full
            + lag_full,
    }

    experiments = []

    def build_xy(features):
        return (
            train[features],
            train[TARGET_COL],
            val[features],
            val[TARGET_COL],
            test[features],
            test[TARGET_COL],
            test_real[features],
            test_real[TARGET_COL],
        )

    # ---------------------------------------------------------------------
    # MODEL A
    # ---------------------------------------------------------------------

    features = feature_sets[
        "A_original_leakage_fixed"
    ]

    cat_idx = [
        features.index(c)
        for c in LOW_CARD_CATS
    ]

    data = build_xy(features)

    experiments.append(
        run_experiment(
            "A_original_leakage_fixed",
            *data,
            features,
            cat_idx,
            sample_weight=sample_weight,
        )
    )

    # ---------------------------------------------------------------------
    # MODEL B
    # ---------------------------------------------------------------------

    features = feature_sets[
        "B_expanded_lag_features"
    ]

    cat_idx = [
        features.index(c)
        for c in LOW_CARD_CATS
    ]

    data = build_xy(features)

    experiments.append(
        run_experiment(
            "B_expanded_lag_features",
            *data,
            features,
            cat_idx,
            sample_weight=sample_weight,
        )
    )

    # ---------------------------------------------------------------------
    # MODEL C
    # ---------------------------------------------------------------------

    features = feature_sets[
        "C_plus_encoding_and_seasonal"
    ]

    cat_idx = [
        features.index(c)
        for c in LOW_CARD_CATS
    ]

    data = build_xy(features)

    experiments.append(
        run_experiment(
            "C_plus_encoding_and_seasonal",
            *data,
            features,
            cat_idx,
            sample_weight=sample_weight,
        )
    )

    # ---------------------------------------------------------------------
    # LOG TARGET
    # ---------------------------------------------------------------------

    best = choose_best(experiments)

    features = best["feature_cols"]

    cat_idx = [
        features.index(c)
        for c in LOW_CARD_CATS
    ]

    data = build_xy(features)

    experiments.append(
        run_experiment(
            "D_log_target",
            *data,
            features,
            cat_idx,
            log_target=True,
            sample_weight=sample_weight,
        )
    )

    # ---------------------------------------------------------------------
    # TUNED HISTGB
    # ---------------------------------------------------------------------

    best = choose_best(experiments)

    features = best["feature_cols"]

    cat_idx = [
        features.index(c)
        for c in LOW_CARD_CATS
    ]

    data = build_xy(features)

    X_train, y_train, X_val, y_val, X_test, y_test, X_real, y_real = data

    tuned_params = tune_histgb_on_validation(
        X_train,
        y_train,
        X_val,
        y_val,
        cat_idx,
        sample_weight,
    )

    tuned_model = HistGradientBoostingRegressor(
        categorical_features=cat_idx,
        random_state=RANDOM_STATE,
        early_stopping=True,
        validation_fraction=0.1,
        **tuned_params,
    )

    experiments.append(
        run_experiment(
            "D2_tuned_HistGB",
            X_train,
            y_train,
            X_val,
            y_val,
            X_test,
            y_test,
            X_real,
            y_real,
            features,
            cat_idx,
            model=tuned_model,
            sample_weight=sample_weight,
        )
    )

    # ---------------------------------------------------------------------
    # ALTERNATIVE MODELS
    # ---------------------------------------------------------------------

    best = choose_best(experiments)

    features = best["feature_cols"]

    cat_idx = [
        features.index(c)
        for c in LOW_CARD_CATS
    ]

    (
        X_train,
        y_train,
        X_val,
        y_val,
        X_test,
        y_test,
        X_real,
        y_real,
    ) = build_xy(features)

    for model_name, factory in candidate_models().items():

        if model_name == "HistGB":
            continue

        model = factory(None)

        if model_name in [
            "RandomForest",
            "ExtraTrees",
            "XGBoost",
            "LightGBM",
        ]:

            one_hot_columns = [
                c
                for c in LOW_CARD_CATS
                if c in X_train.columns
            ]

            X_train_oh = pd.get_dummies(
                X_train,
                columns=one_hot_columns,
            )

            X_val_oh = (
                pd.get_dummies(
                    X_val,
                    columns=one_hot_columns,
                )
                .reindex(
                    columns=X_train_oh.columns,
                    fill_value=0,
                )
            )

            X_test_oh = (
                pd.get_dummies(
                    X_test,
                    columns=one_hot_columns,
                )
                .reindex(
                    columns=X_train_oh.columns,
                    fill_value=0,
                )
            )

            X_real_oh = (
                pd.get_dummies(
                    X_real,
                    columns=one_hot_columns,
                )
                .reindex(
                    columns=X_train_oh.columns,
                    fill_value=0,
                )
            )

            experiments.append(
                run_experiment(
                    f"E_{model_name}",
                    X_train_oh,
                    y_train,
                    X_val_oh,
                    y_val,
                    X_test_oh,
                    y_test,
                    X_real_oh,
                    y_real,
                    list(X_train_oh.columns),
                    None,
                    model=model,
                    sample_weight=sample_weight,
                )
            )

        else:
            experiments.append(
                run_experiment(
                    f"E_{model_name}",
                    X_train,
                    y_train,
                    X_val,
                    y_val,
                    X_test,
                    y_test,
                    X_real,
                    y_real,
                    features,
                    cat_idx,
                    model=model,
                    sample_weight=sample_weight,
                )
            )

    # ---------------------------------------------------------------------
    # FINAL WINNER
    # ---------------------------------------------------------------------

    winner = choose_best(experiments)

    print("\n" + "=" * 75)
    print(
        f"WINNER — selected by validation MAE: "
        f"{winner['name']}"
    )
    print("=" * 75)

    # ---------------------------------------------------------------------
    # OLD VS NEW
    # ---------------------------------------------------------------------

    OLD_TEST = {
        "MAE": 583.0,
        "RMSE": 1479.0,
        "R2": 0.720,
        "MAPE_%": 19.44,
    }

    new_test = winner["metrics"]["test"]

    improved = (
        new_test["MAE"] < OLD_TEST["MAE"]
        and new_test["MAPE_%"] < OLD_TEST["MAPE_%"]
    )

    print(
        f"\nOLD TEST: "
        f"MAE={OLD_TEST['MAE']:.1f}, "
        f"RMSE={OLD_TEST['RMSE']:.1f}, "
        f"R2={OLD_TEST['R2']:.4f}, "
        f"MAPE={OLD_TEST['MAPE_%']:.2f}%"
    )

    print(
        f"NEW TEST: "
        f"MAE={new_test['MAE']:.1f}, "
        f"RMSE={new_test['RMSE']:.1f}, "
        f"R2={new_test['R2']:.4f}, "
        f"MAPE={new_test['MAPE_%']:.2f}%"
    )

    print(
        "\nVERDICT:",
        "IMPROVED" if improved else "NOT IMPROVED",
    )

    # ---------------------------------------------------------------------
    # PRICE RANGE BREAKDOWN
    # ---------------------------------------------------------------------

    thresholds, quantiles = price_range_thresholds(
        train
    )

    range_table = price_range_breakdown(
        test[TARGET_COL],
        winner["test_pred"],
        thresholds,
    )

    print("\nTEST PERFORMANCE BY PRICE RANGE")

    if not range_table.empty:
        print(
            range_table.to_string(
                index=False
            )
        )

        range_table.to_csv(
            OUTPUT_DIR
            / "price_range_breakdown.csv",
            index=False,
        )

    # ---------------------------------------------------------------------
    # STATE / COMMODITY / GRADE
    # ---------------------------------------------------------------------

    state_table = group_breakdown(
        test,
        test[TARGET_COL],
        winner["test_pred"],
        "State",
    )

    commodity_table = group_breakdown(
        test,
        test[TARGET_COL],
        winner["test_pred"],
        "Commodity",
    )

    grade_table = group_breakdown(
        test,
        test[TARGET_COL],
        winner["test_pred"],
        "Grade",
    )

    if not state_table.empty:
        state_table.to_csv(
            OUTPUT_DIR / "state_breakdown.csv",
            index=False,
        )

    if not commodity_table.empty:
        commodity_table.to_csv(
            OUTPUT_DIR / "commodity_breakdown.csv",
            index=False,
        )

    if not grade_table.empty:
        grade_table.to_csv(
            OUTPUT_DIR / "grade_breakdown.csv",
            index=False,
        )

    # ---------------------------------------------------------------------
    # PLOTS
    # ---------------------------------------------------------------------

    plot_actual_vs_predicted(
        test[TARGET_COL],
        winner["test_pred"],
        "Actual vs Predicted — Test",
        OUTPUT_DIR
        / "actual_vs_predicted.png",
    )

    plot_error_distribution(
        test[TARGET_COL],
        winner["test_pred"],
        "Prediction Error Distribution — Test",
        OUTPUT_DIR
        / "error_distribution.png",
    )

    # ---------------------------------------------------------------------
    # FEATURE IMPORTANCE
    # ---------------------------------------------------------------------

    X_val_final = winner["X_val"]
    y_val_final = winner["y_val"]

    sample_size = min(
        20000,
        len(X_val_final),
    )

    sample = X_val_final.sample(
        sample_size,
        random_state=1,
    )

    sample_y = y_val_final.loc[
        sample.index
    ]

    permutation = permutation_importance(
        winner["model"],
        sample,
        sample_y,
        n_repeats=3,
        random_state=1,
        n_jobs=-1,
    )

    importance_df = pd.DataFrame(
        {
            "feature": winner["feature_cols"],
            "importance": permutation.importances_mean,
        }
    ).sort_values(
        "importance",
        ascending=False,
    )

    importance_df.to_csv(
        OUTPUT_DIR
        / "feature_importance.csv",
        index=False,
    )

    plot_feature_importance(
        importance_df,
        f"Feature Importance — {winner['name']}",
        OUTPUT_DIR
        / "feature_importance.png",
    )

    # ---------------------------------------------------------------------
    # METRICS JSON
    # ---------------------------------------------------------------------

    all_metrics = {
        experiment["name"]:
            experiment["metrics"]
        for experiment in experiments
    }

    all_metrics["_winner"] = winner["name"]

    all_metrics["_old_vs_new_test"] = {
        "old": OLD_TEST,
        "new": new_test,
        "improved": bool(improved),
    }

    with open(
        OUTPUT_DIR / "metrics.json",
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            all_metrics,
            file,
            indent=2,
        )

    # ---------------------------------------------------------------------
    # SAVE MODEL ARTIFACT
    # ---------------------------------------------------------------------

    model_artifact = {
        "model": winner["model"],
        "encoding_maps": encoding_maps,
        "freq_maps": frequency_maps,
        "global_mean": global_mean,
        "feature_cols": winner["feature_cols"],
        "low_card_cats": LOW_CARD_CATS,
        "high_card_cats": HIGH_CARD_CATS,
        "commodity_median_train":
            commodity_median_train,
        "global_train_median":
            global_train_median,
        "log_target":
            winner["log_target"],
        "price_range_thresholds":
            thresholds,
        "train_end": TRAIN_END,
        "validation_end": VAL_END,
        "group_cols": GROUP_COLS,
        "target_col": TARGET_COL,
    }

    joblib.dump(
        model_artifact,
        OUTPUT_DIR
        / "mandi_price_model.joblib",
    )

    print("\n" + "=" * 75)
    print("TRAINING COMPLETE")
    print("=" * 75)

    print(
        f"\nOutputs written to:\n"
        f"{OUTPUT_DIR}"
    )

    print(
        "\nFiles generated:"
    )

    for filename in [
        "mandi_price_model.joblib",
        "metrics.json",
        "feature_importance.csv",
        "feature_importance.png",
        "actual_vs_predicted.png",
        "error_distribution.png",
        "price_range_breakdown.csv",
        "state_breakdown.csv",
        "commodity_breakdown.csv",
        "grade_breakdown.csv",
    ]:
        print(f"  - {filename}")

    return experiments, winner


if __name__ == "__main__":
    run_all()
