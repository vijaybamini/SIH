# Changes Log (Ramcharan)

## Session: Push to GitHub + white page fix

### 1. Pushed local work to GitHub
- Repo: https://github.com/vijaybamini/SIH (branch `master`)
- Pushed commit `2541f91` — "Add responsive nav menu with mobile toggle and scroll highlighting".
- Existing remote commits were pulled in first (rebased), including:
  - Route-optimization pipeline and pooling work
  - `agmarknet_data` moved inside `AI_backend/` (Render deployment fix)
  - New migrations (`add_orders_and_farmer_pincode`, logistics insert policy)

### 2. Updated `.gitignore`
- Added `*.log` so dev/run log files (`vite.log`, `vite.err.log`, `AI_backend/uvicorn*.log`) are no longer tracked.
- Kept the removal of the `agmarknet_data` CSV ignore line (remote had dropped it).

### 3. Merge conflict resolution (during rebase)
- `.gitignore`: kept `*.log` + remote's cleanup.
- `src/main.jsx`: resolved the Malayalam translation block (kept our version without the `learn` key; retained the remote author's unrelated changes elsewhere).

### 4. Fixed white page (`src/main.jsx`)
- Symptom: app rendered a blank white page after login/session restore.
- Cause: runtime crash — "Rendered more hooks than during the previous render".
  An early return `if (authStatus === 'loading') return <AuthLoadingScreen />`
  was sitting between the session-restore `useEffect` and the two nav
  `useEffect`s (scroll-highlight + Escape-to-close). On first render
  (`authStatus === 'loading'`) those nav hooks were skipped; once the
  Supabase session resolved they were called, violating the Rules of Hooks.
- Fix: moved both nav `useEffect`s above the early return so every hook is
  called unconditionally in the same order on every render.
- Verified with `vite build` (compiles cleanly).

### 5. Accessibility menu redesign (`src/main.jsx`, `src/styles.css`)
- Replaced the old on/off accessibility toggles with a richer menu:
  - Font size stepper with 5 levels (`FONT_SIZE_LEVELS`, default level 2) instead of the `large-text` binary toggle.
  - Saturation stepper with 4 levels (`SATURATION_LEVELS`, default level 2) — replaces the `motion` toggle.
  - Screen reader toggle that reads the page aloud via `SpeechSynthesisUtterance`, using the selected UI language (`SPEECH_LANG_CODES`).
  - High-contrast theme toggle and a reset button.
  - Accessibility state changed to `{ fontSizeLevel, saturationLevel, screenReader, highContrast }`.
- New CSS for the popover: `.a11y-section`, `.a11y-stepper`, `.a11y-dots`, `.a11y-feature-row`, `.utility-divider`, etc.
- New translation keys (`fontSize`, `saturation`, `screenReader`, `highContrastTheme`, `resetLabel`) added across all languages.
- All the new hooks were placed above the `authStatus === 'loading'` early return to keep the Rules of Hooks intact.

### Files touched
- `.gitignore`
- `src/main.jsx`
- `src/i18n.js`, `src/styles.css`
- `ramcharan.md` (this file)

### Pushed
- This push on `master` includes the accessibility menu redesign plus the white-page hooks fix (section 4), after a clean `vite build`.