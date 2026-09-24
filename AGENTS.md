# AGENTS.md

Guidance for AI coding agents working in this repo.

## Project

F2C — "Farmer to Consumer" marketplace: farmers sell produce directly to bulk buyers, with price transparency. Frontend is a single React SPA; auth/data live in Supabase; pricing/forecast/logistics logic lives in a Python FastAPI backend.

## Stack

- **Frontend:** React + Vite + Tailwind CSS v4 (`@tailwindcss/vite`), `react-router-dom`, `recharts`. All styling is Tailwind utilities in JSX plus a global `src/styles.css` for legacy/themed CSS.
- **Backend (frontend-facing):** Supabase client SDK (`src/supabase.js`); auth is **phone-first** (phone → synthetic `phone.farmdirect.internal` email, confirmed by DB trigger) with an optional custom email-OTP flow.
- **AI backend:** `AI_backend/` — FastAPI (`main.py`), pricing, demand forecast, route optimization, email OTP. Deployed separately (see `render.yaml`). The SPA talks to it via `src/api/aiBackend.js`.
- **No UI test framework.** Backend has Python tests (`AI_backend/test_*.py`). "Verify" = `npm run build` + manual check in `npm run dev`.

## Commands

```bash
npm install        # install deps
npm run dev        # dev server (localhost:5173)
npm run build      # production build — run after any JSX/CSS change
npm run preview    # serve the production build
npm run db:push    # apply supabase/migrations (supabase CLI)
# AI backend (optional, for its tests):
cd AI_backend && python -m pytest
```

## Layout

- `src/main.jsx` — root: routing, auth/session restore, role-based rendering, `AuthPanel` (login/register).
- `src/api/` — `aiBackend.js` (AI backend calls), `farmer.js`, `buyer.js`, `logistics.js`, `service.js`, `profile.js`, `notifications.js`, `logisticsJobs.js` (Supabase calls).
- `src/pages/` — public informational pages rendered inside `PublicLayout`.
- Dashboards by role: `Dashboard.jsx` (farmer), `BulkBuyerDashboard.jsx`, `LogisticsDashboard.jsx` (renders `TransportationDashboard`/`InventoryDashboard`/`CompleteProfileLogistics`/`MyJobsPanel`), `ServiceDashboard.jsx`.
- `src/i18n.js` — all UI copy for 8 languages (`en/hi/te/ta/ml/kn/mr/bn`).
- `supabase/migrations/` — timestamped SQL; new schema changes go here and are applied with `npm run db:push`.
- `AI_backend/` — Python backend; `.env.example` lists its secrets (never commit real ones).

## Conventions

- **All user-facing text** must come from translation objects in `src/i18n.js` (via `useTranslation(language)`). Don't hardcode strings in components. Public-layout nav/footer copy uses the `copy` object in `main.jsx` and public pages.
- **Crop display names** must be translated with `displayCropName(name, language)` from `src/cropNames.js` — raw stored crop names are per-language and must never be shown directly.
- **Shared dashboard pattern:** Farmer/Service/Logistics dashboards use a shared responsive shell `src/DashboardShell.jsx` — topbar with greeting + actions, `w-[260px]` sidebar on `lg+`, slide-in drawer on smaller screens. Dashboards currently pass no `zoom` prop (normal scale); the shell still supports an optional `zoom` prop if a scaled layout is ever wanted again (be mindful it multiplies with the accessibility zoom on the public site).
- **Mobile/responsive:** use Tailwind breakpoints (`sm:`/`lg:`/`md:`). Prefer `text-2xl sm:text-3xl`-style scaling over hard-coded sizes; keep ≥44px touch targets.
- **Red/green:** Tailwind theme colors are namespaced via `@theme` (`brand-*`, `cream-*`); screens use `grid-cols-1 sm:grid-cols-3` etc. rather than CSS media queries (CSS media queries exist in `styles.css` only for legacy `.dash-*`/`.buyer-*` sections).
- **Environment:** copy `.env.example` → `.env.local`. `VITE_*` vars are for the SPA; `SUPABASE_SERVICE_ROLE_KEY` / `RESEND_API_KEY` are backend-only. Never commit keys.

## Gotchas

- **Uncommitted local changes will block `git pull`** when the same files changed upstream (e.g. `src/PriceWidget.jsx`, `src/styles.css`). Commit or stash before pulling; if someone says "accept the remote changes", stash+drop the conflicting files, don't merge-commit panels.
- Auth uses synthetic phone emails — users register `name/phone/pincode`, then complete role profiles separately (`CompleteProfileFarmer.jsx` etc.).
- The quote/order flow (`BulkBuyerDashboard.jsx`) includes a **dummy payment gateway** — no real card data is ever sent.
- Public pages and `BulkBuyerDashboard.jsx` are already responsive; the role dashboards and their stat grids are the responsive pain points.