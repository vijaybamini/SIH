# FarmDirect — Frontend ↔ Backend Integration Plan

## 1. Goal

Connect the existing React/Vite landing page to the Supabase database (profiles, farmers, buyers, logistics/service providers + sub-tables) and expose the standalone Python pricing engine as a callable service, delivering a session-aware, role-based dashboard experience for all four roles for the SIH demo.

## 2. Current State

### Frontend
- React 19.3 + Vite 8.3, single file `src/main.jsx` (landing + auth modal only).
- Auth wired to Supabase via `src/supabase.js` (uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`).
- Registration collects role fields into `registration_details` and passes them in `supabase.auth.signUp` metadata; a DB trigger writes them to role tables.
- No session persistence UI, no dashboard, no DB reads, no logout.

### Backend / Database (Supabase project `qugxvcearledapmaxkve`, "SIH")
- 9 migrations applied; 1 staged, not yet pushed: `20260912096000_normalize_service_provider_types.sql`.
- Tables: `profiles`, `farmers`, `bulk_buyers`, `logistics_providers`, `service_providers`, `farmer_profiles`, `crop_details`, `farmer_bank_details`, `transportation_details`, `inventory_details`, `service_types`, `service_provider_services`.
- RLS active on all tables; policies restrict rows to `auth.uid()`.
- Auth trigger `handle_new_user()` fans metadata into role + sub-tables on signup.

### Pricing engine
- Python 3.12 standalone: `pricing_engine.py` + `pricing_config.json`, entry point `PricingEngine.price_trip(...)` returning `Quote` (has `.to_dict()`). Not exposed to the frontend.

### Environment notes
- `.env.local` contains unused `SUPABASE_DB_PASSWORD` (remove — secret).
- `python3 test_pricing_engine.py` validates the engine (must stay green).

## 3. Decisions (confirmed)

| Topic | Decision |
|---|---|
| Pricing engine exposure | Separate **FastAPI** backend wrapping `pricing_engine.py` |
| App structure | **react-router** + per-role dashboards |
| Scope | Auth session + all four role dashboards + pricing quote UI |

## 4. Phase 0 — Housekeeping

1. Push pending migration: `supabase db push`, verify with `supabase migration list`.
2. Remove `SUPABASE_DB_PASSWORD` from `.env.local`.
3. Add `react-router-dom` to dependencies.

## 5. Phase 1 — Session & App Shell

- **Session context** (`src/context/SessionContext.jsx`): initialise with `supabase.auth.getSession()`, subscribe to `onAuthStateChange`; expose `user`, `role`, `profile`, `loading`, `refreshProfile()`.
- **App-level routing** in `src/main.jsx` (or `src/App.jsx`):
  - `/` — landing (existing hero + stats + mission)
  - `/dashboard` — route guard → redirect to role dashboard
  - `/dashboard/farmer`, `/dashboard/buyer`, `/dashboard/logistics`, `/dashboard/service`
  - `/login`, `/register` — keep modal flow, but on success route to `/dashboard`
- **Header**: shows account name + role + Logout when signed in; Login/Register buttons otherwise.
- **Lift language & accessibility state** from `App` into a context so dashboards use the same copy system.

## 6. Phase 2 — Frontend Data Layer

New `src/api/` modules (thin wrappers over `supabase`, RLS-aware):

| Hook / module | Reads/Writes |
|---|---|
| `useProfile()` | `profiles` row for signed-in user |
| `useFarmerProfile()` | `farmers`, `farmer_profiles` (land info) |
| `useCropDetails()` | `crop_details` CRUD |
| `useBankDetails()` | `farmer_bank_details` CRUD |
| `useBuyerProfile()` | `bulk_buyers` |
| `useTransportationDetails()` | `transportation_details` CRUD |
| `useInventoryDetails()` | `inventory_details` CRUD |
| `useServiceProfile()` | `service_providers` |
| `useServiceTypes()` | `service_types` + `service_provider_services` (many-to-many join) |

Shared `Loading`, `EmptyState`, `ErrorBanner`, and a `useAsync` hook for uniform load/error handling.

## 7. Phase 3 — Role Dashboards

### Farmer (`/dashboard/farmer`)
- Overview card: farm name, primary crops, location, area (acres), survey number, aadhaar.
- Crop details: list + add/edit/delete (`crop_type`, `specific_crop_type`, `turnover`, `expected_turnover`).
- Bank details: form add/edit (`account_holder_name`, `account_number`, `ifsc_code`, `branch_name`).

### Buyer (`/dashboard/buyer`)
- Profile card: name, address, pincode, rating (read-only).
- Edit name/address/pincode.

### Logistics (`/dashboard/logistics`)
- Company profile: name, service areas, fleet details.
- Transportation details CRUD: `vehicle_type`, `vehicle_capacity`.
- Inventory details CRUD: `cold_storage_capacity`, `location`, `storage_fill_percentage`.

### Service (`/dashboard/service`)
- Business profile: name, service areas.
- Service types: multi-select list of `service_types`; insert/delete rows in `service_provider_services`.

## 8. Phase 4 — Pricing Engine FastAPI Backend

### Backend app (`backend/`)
- `backend/main.py` — FastAPI app:
  - `POST /api/quote` → `PricingEngine('pricing_config.json').price_trip(...)`, returns `Quote.to_dict()`.
  - `GET /api/commodities` → list from `pricing_config.json` for dropdowns.
- CORS: allow `http://localhost:5173` + deployed frontend origin.
- `backend/requirements.txt` — `fastapi`, `uvicorn`.
- Share engine + config either by referencing the repo files (`pricing_engine.py`, `pricing_config.json`) or copying into `backend/`; document choice.

### Frontend call path
- Vite dev: proxy `/api → http://localhost:8000` in `vite.config.js`.
- Prod: `VITE_API_URL` env var.
- `src/api/pricing.js` — `getQuote(inputs)`, `getCommodities()`.
- **"Get freight quote" tool** (Logistics dashboard): commodity, weight, distance, pickup, destination, corridor type, season, optional diesel override → renders itemised quote:
  - Operating cost lines (fuel, driver, toll, maintenance, depreciation, loading, insurance, permits, overhead, totals)
  - Market band (low/mid/high) + market vs cost status
  - Recommended freight, driver payout + margin, platform commission, customer price
  - Metrics (/km, /kg), market position, warnings.

## 9. Phase 5 — Distance & Persistence (decide before build)

- **Distance**: prefer backend `GET /api/distance` (OSRM + Nominatim geocode pickup/destination), fallback to manual distance input. **Confirm if external mapping APIs acceptable for the demo.**
- **Quote persistence** (optional): new `quotes` table + RLS if history is wanted. **Confirm scope.**

## 10. Phase 6 — Verification

1. `supabase migration list` — all migrations applied.
2. `npm run build` + `npm run dev` smoke test; register each role → correct dashboard, CRUD works.
3. `python3 test_pricing_engine.py` — still green after backend integration.
4. End-to-end: get quote from logistics dashboard → prices render; e.g. vegetables / 2000kg / 145km / Warangal→Hyderabad → `mini_lcv`, 80% util.

## 11. File Map (new/changed)

```
plan.md                        (this plan)
package.json                   + react-router-dom
vite.config.js                 + /api proxy
src/App.jsx                    routes + layout (extracted from main.jsx)
src/context/SessionContext.jsx
src/context/UiContext.jsx      language + accessibility
src/api/profile.js, crops.js, bank.js, transport.js, inventory.js, services.js, pricing.js
src/components/                form, card, modal, table, useAsync, Loading/Empty/Error
src/pages/                     Landing, Dashboard, FarmerDashboard, BuyerDashboard,
                              LogisticsDashboard, ServiceDashboard, QuotePage
backend/main.py               FastAPI app
backend/requirements.txt
.env.local / .env.example     add VITE_API_URL, drop DB password
supabase/migrations/optional  quotes.sql (only if confirmed)
```

## 12. Risks / Notes

- Email confirmation is on (`emailRedirectTo`); users must confirm before login — keep the "check your inbox" guidance.
- `farmer_bank_details`, `transportation_details`, `inventory_details` have no default rows — dashboards must show an "add" state.
- `.env.local` is gitignored; document required vars in `.env.example`.
- FastAPI deploy target for the demo (local `uvicorn` vs Railway/Render/Fly) needs to be decided at build time.