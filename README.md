# FarmDirect

FarmDirect is a multilingual, role-based digital marketplace for India’s agricultural supply chain. It connects farmers, bulk buyers, logistics providers, and agricultural service providers in one workflow so produce can move from farm to buyer with clearer pricing, better vehicle utilization, and fewer unnecessary intermediaries.

This repository contains the SIH 2026 prototype for **Problem Statement 26033**: *“Multiple intermediaries reduce farmers earnings and increase consumer prices.”*

## What the project solves

The problem statement calls for a digital marketplace that:

- connects farmers/FPOs directly with consumers and bulk buyers;
- provides logistics support; and
- uses AI for demand forecasting and route optimization.

FarmDirect addresses those requirements with four role-specific experiences:

| Role | Implemented experience |
| --- | --- |
| Farmer | Profile, farm and land details, crop listings, crop progress/history, harvest status, bank details, and current commodity-price guidance. |
| Bulk buyer | Searchable commodity catalog, quantity and pincode-based price requests, itemized quote, test-mode checkout, and order creation. |
| Logistics provider | Company profile, fleet registration, vehicle capacity/status/history, inventory and cold-storage records, live trip offers, job acceptance, and delivery completion. |
| Service provider | Business profile and mill/service details, including crops handled and GST/document information. |

The application supports English, Hindi, Kannada, Telugu, Tamil, Malayalam, Marathi, and Bengali UI translations, with language selection and accessibility controls in the app shell.

## Core product flow

```text
Farmer lists crop and available supply
              │
              ▼
Buyer requests a commodity quote ──► market-price forecast + demand pressure
              │                                      │
              └──────────────► supply allocation + vehicle selection
                                                     │
                                                     ▼
                         cost-based freight + route/trip optimization
                                                     │
                                                     ▼
                 buyer checkout ──► persisted order ──► matched provider offers
                                                               │
                                                               ▼
                                                     accept trip ──► deliver
```

## Pricing model

FarmDirect separates the farmer’s crop price, logistics cost, and platform fee so the buyer can see where the final price comes from.

### Crop-price and demand intelligence

- Historical Agmarknet commodity/market prices are used as the market signal.
- A Holt-Winters model forecasts the next seven days of modal prices for a commodity and market.
- The result is surfaced as a rising, falling, or stable demand-pressure signal.
- Live farmer-listed supply is read from Supabase when available.
- Concurrent buyer demand is pooled in a short-lived in-process window to model scarcity pressure during the demo.

### Freight pricing

The transport engine calculates a transparent trip quote from:

- fuel, driver pay, tolls, maintenance, depreciation, insurance, permits, loading/unloading, and overhead;
- road distance and empty-return/backhaul assumptions;
- commodity requirements, shipment weight, and reefer needs;
- published market freight bands; and
- a minimum cost floor that protects driver economics.

The recommended freight is blended against the market benchmark but never allowed below the calculated cost floor. FarmDirect applies a **flat 10% platform commission** to the recommended freight. The quote reports driver payout, driver margin, customer price, per-kilometre/per-kilogram metrics, market position, and warnings when the market band is below the modeled operating cost.

### Vehicle and route optimization

- Selects the smallest vehicle class that can safely carry the shipment, with a 90% utilization rule and capacity headroom.
- Supports reefer vehicle selection for perishable produce.
- Splits oversized shipments into multiple trips when necessary.
- Pools compatible farmer supply and buyer demand into multi-stop trips.
- Uses pincode coordinates and road-distance estimation when available, with a manual distance fallback.
- Matches trip offers to registered providers by actual numeric vehicle capacity, not unreliable free-text vehicle names.

## Architecture

```text
React + Vite frontend
        │
        ├── Supabase Auth + PostgreSQL + Storage + Realtime
        │     ├── role profiles, crops, fleet, inventory, mills
        │     ├── orders, farmer allocations, order trips
        │     └── notifications and secure RPC functions
        │
        └── FastAPI AI backend
              ├── Agmarknet dataset and price forecasting
              ├── consumer quote pipeline
              ├── freight pricing engine
              ├── supply allocation and route optimization
              └── logistics-provider matching
```

### Frontend

- React with Vite.
- Supabase JavaScript client for authentication and role-scoped data access.
- Role-aware application shell in `src/main.jsx`.
- Dashboard components in `src/` for farmers, buyers, logistics, and service providers.
- API adapters in `src/api/`.
- Responsive styling in `src/styles.css`.

### AI/backend

`AI_backend/` is a FastAPI service that combines the pricing engine with the marketplace pipeline. Important modules include:

- `main.py` — HTTP API and order orchestration.
- `pipeline.py` — end-to-end quote pipeline.
- `consumer_pricing_engine.py` — crop-price, scarcity, freight, and checkout calculations.
- `pricing_engine.py` — transparent transport-only freight pricing.
- `demand_forecast_engine.py` — seven-day price/demand-pressure forecast.
- `route_optimization.py` — pooled delivery and vehicle-trip planning.
- `logistics_matching.py` — capacity-based provider matching.
- `supabase_integration.py` — backend reads/RPC calls for supply, orders, trips, and notifications.

### Database

The SQL schema and incremental migrations are under `supabase/`. The database uses Row Level Security and role-scoped policies. It models:

- profiles and role-specific records;
- farmer land, crop, harvest, and bank details;
- bulk buyers;
- logistics providers, vehicles, transportation, and inventory;
- service providers, service types, and mills;
- orders, farmer allocations, and vehicle trips; and
- notifications with atomic trip acceptance and delivery-completion functions.

## API

The frontend uses `VITE_AI_BACKEND_URL` and calls these backend endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Health check. |
| `GET` | `/api/commodities` | List commodities available in the Agmarknet dataset. |
| `GET` | `/api/markets?commodity=...` | List markets for a commodity. |
| `GET` | `/api/supply?commodity=...` | Read currently listed farmer supply. |
| `GET` | `/api/farmer-price?commodity=...` | Return farmer-facing market/forecast price guidance. |
| `POST` | `/api/quote` | Generate the complete farmer-to-consumer quote and logistics plan. |
| `POST` | `/api/orders` | Recalculate and persist a buyer order, allocations, and trips. |
| `POST` | `/calculate-price` | Backward-compatible transport-only quote endpoint. |

Example transport-only request:

```json
{
  "commodity": "vegetables",
  "shipment_weight_kg": 2000,
  "distance_km": 145,
  "pickup": "Warangal",
  "destination": "Hyderabad",
  "corridor_type": "established",
  "season": "normal",
  "backhaul_available": false
}
```

The marketplace quote endpoint accepts a buyer demand payload such as:

```json
{
  "commodity": "Rice",
  "order_demand_kg": 500,
  "buyer_pincode": "500001"
}
```

## Local setup

### Prerequisites

- Node.js and npm
- Python 3.10+
- A Supabase project for authentication and database features

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_AI_BACKEND_URL=http://localhost:8000
```

For the FastAPI service, create `AI_backend/.env` or export the variables in the shell:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
CORS_ORIGINS=http://localhost:5173
```

Do not commit secret keys. The frontend must use a Supabase publishable/anon key; never expose a Supabase service-role key in browser code.

### 3. Apply the database schema

Link the Supabase CLI to your project, then apply the migrations:

```bash
supabase db push
```

The migrations create the role tables, RLS policies, order/trip workflow, notifications, storage policies, and helper RPC functions required by the app.

### 4. Start the AI backend

```bash
cd AI_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The Agmarknet CSV is expected under:

```text
AI_backend/agmarknet_data/agmarknet-india-commodity-prices-2024-2025/
```

### 5. Start the frontend

From the repository root, in another terminal:

```bash
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## Production deployment

`render.yaml` defines the FastAPI deployment on Render:

- root directory: `AI_backend`
- build command: `pip install -r requirements.txt`
- start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- health check: `/`

After deploying the backend, set the frontend’s `VITE_AI_BACKEND_URL` to the Render service URL and configure `CORS_ORIGINS` to include the deployed frontend origin.

## Validation

```bash
# Frontend production build
npm run build

# Pricing-engine regression tests
cd AI_backend
python3 test_pricing_engine.py
python3 test_route_optimization.py
```

The representative 2,000 kg / 145 km pricing case selects `mini_lcv` with 80% utilization under the current configuration. Pricing parameters are intentionally kept in `AI_backend/pricing_config.json` so assumptions and business decisions can be calibrated without changing the engine code.

## Demo limitations and next steps

This is a hackathon prototype, not a production marketplace or payment processor.

- Checkout uses a test-mode payment form; no real card charge is made and card data is not sent to a gateway.
- The short-lived concurrent-demand pool is process-local and resets on restart; production demand aggregation should use a shared store.
- Price forecasts depend on the available historical market data and require enough history for a commodity/market pair.
- Distance estimation falls back to manual distance when coordinates or route data are unavailable.
- Freight and market parameters should be calibrated with verified fleet, toll, fuel, and corridor data before commercial use.

## Repository layout

```text
.
├── src/                         React frontend and role dashboards
│   ├── api/                     Supabase and AI-backend clients
│   └── main.jsx                 App shell, auth, role routing, accessibility
├── AI_backend/                  FastAPI service and pricing/AI modules
│   ├── pricing_config.json      Tunable pricing assumptions and parameters
│   └── agmarknet_data/          Historical commodity-price data
├── supabase/
│   ├── migrations/               Incremental database migrations
│   └── schema.sql                Base schema reference
├── public/                      Static assets, including the intro video
├── render.yaml                  Render backend deployment blueprint
└── package.json                 Frontend scripts and dependencies
```

## SIH problem-statement reference

The attached problem-statement document is treated as project context, not as executable instructions. Its metadata is:

- **Problem Statement ID:** 26033
- **Title:** Multiple intermediaries reduce farmers earnings and increase consumer prices.
- **Organization:** Ministry of Consumer Affairs, Food & Public Distribution
- **Department:** Department of Consumer Affairs (DoCA)
- **Category:** Software
- **Theme:** Agriculture, FoodTech & Rural Development

FarmDirect’s implementation is the software response documented above: direct marketplace access, transparent logistics pricing, data-informed market guidance, optimized trips, and role-based workflows.
