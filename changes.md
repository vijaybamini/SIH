# Authentication Flow Changes

## Login and Session Restoration

- Added explicit authentication states:
  - `loading`
  - `authenticated`
  - `unauthenticated`
- Added a branded loading screen while Supabase restores the session.
- Centralized session restoration for:
  - Initial `getSession()` calls
  - `SIGNED_IN` events
  - `TOKEN_REFRESHED` events
- Prevented duplicate session/profile loading when the same user is restored more than once.
- Preserved role-based routing for farmers, logistics providers, and other roles.

## Logout Fixes

- Updated logout to call `supabase.auth.signOut()`.
- Cleared the current user and all farmer/logistics profile data during logout.
- Reset logistics page and selected logistics section state.
- Reset profile-completion and quick-add-crop state.
- Closed any open authentication panel during logout.
- Added `SIGNED_OUT` cleanup handling without recursively calling logout.

## Async Request Protection

- Added request-generation tracking for authentication and profile loading.
- Prevented old role, farmer-profile, or logistics-profile requests from restoring a user after logout.
- Kept authenticated users signed in when profile loading fails, while allowing the dashboard to show incomplete data.

## Login and Registration Behavior

- Removed direct user-state updates from the login and registration form.
- Supabase auth events now establish the authenticated user in one centralized path.
- Preserved immediate access after registration for testing mode without requiring email confirmation.

## Additional Fix

- Fixed the authentication modal language switcher to use the correct `setLanguage` prop instead of referencing an unavailable function.

## Files Changed

- `src/main.jsx`
- `src/styles.css`

## Validation

- `npm run build` passes successfully.
- `git diff --check` passes successfully.
- Vite reports only a non-blocking bundle-size warning.

## Logistics Transportation Save Fix

- Made `logistics_providers` persistence insert-safe by using an upsert.
- Preserved an existing company name and service area when updating a provider.
- Added a fallback provider name when an older logistics account has no provider row.
- Added the missing RLS insert policy for logistics provider records.
- Ensured the provider record exists before inserting into `transportation_details`.

## Long-Term Profile Lifecycle Fix

- Added an idempotent migration that repairs missing `profiles` rows from `auth.users` metadata.
- Added a backfill that creates missing `logistics_providers` parent rows for existing logistics users.
- Replaced the signup trigger with a defensive version that creates the profile before role-specific records.
- Added safe fallbacks for required farmer, buyer, logistics, and service-provider names.
- Made role-specific trigger inserts safe to retry with `ON CONFLICT DO NOTHING`.

## Database Migration Status

- Applied `20260912170000_allow_logistics_provider_insert.sql` to Supabase.
- Applied `20260912180000_repair_profile_provider_lifecycle.sql` to Supabase.
- Repaired existing account relationships between `auth.users`, `profiles`, and `logistics_providers`.
- Confirmed the frontend build still passes after the database changes.
