## 1. Debtors list — show a table of debtors (one row per customer)

Currently `DebtorsList` shows one row per credit sale, which makes the same customer repeat. Add a customer-aggregated view as the default, with a toggle to drop back to the per-sale view.

**New "By customer" view** (default tab on the Debtors page):
- Columns: Customer, Outstanding sales (count), Total balance, Oldest age, Worst status (Good / Long / Bad badge), Last payment date, Action.
- Built from the same `credits` + `payments` data already loaded — grouped by `customer_name`, balance = sum of per-sale balances, worst status = highest of all sale buckets, oldest age = max age.
- Row click expands to a nested mini-table showing the individual credit sales that make up that balance (reuses today's columns: sale date, due, billed, paid, balance, reprint invoice).
- Filters stay (search by name, min/max balance, age, bucket, sort), but they apply to aggregated rows.
- Three KPI cards at the top (Good / Long / Bad) keep working and now count distinct debtors as well as totals.

**Per-sale view** stays available behind a small "By sale" toggle for users who want today's drill-down.

## 2. UI polish — stronger separation and more lively look

Goal: make tabs, cards, tables, inputs and buttons visually distinct without redoing the whole design system. All changes go through tokens in `src/index.css` and a few component-level classes; semantic tokens stay the source of truth.

**Tokens (`src/index.css`):**
- Raise the contrast between `--background`, `--card`, `--muted` and `--border` in both themes so cards/tables visibly sit on the page (current borders are nearly invisible).
- Add `--surface-2` and `--surface-3` tokens for table headers and zebra rows.
- Strengthen `--ring` to a clear green for focus.
- Add `--shadow-card` and `--shadow-pop` utility variables.

**Components:**
- **Tabs:** active tab uses a filled green pill + bold label, inactive tabs sit on a muted bar. Mobile sheet nav keeps the same active styling.
- **Cards:** visible border + soft shadow, subtle hover lift. Dashboard KPI cards get a left-edge color accent (primary / warning / success / destructive) so they read at a glance.
- **Tables:** outlined container, tinted header row, zebra rows, hover highlight, sticky header on long tables, right-aligned numeric columns already in place.
- **Inputs / Selects / Textareas:** thicker border, clear focus ring in primary green, slight inner shadow so empty inputs don't blend into the page.
- **Buttons:** primary keeps the green gradient with a hover lift; secondary becomes outlined with hover fill; destructive gets a clearer red; ghost buttons get a subtle hover background so they look clickable.
- **Section dividers:** a thin gradient bar between major dashboard sections to break up long pages.
- **Micro-motion:** fade/slide on tab change, 150 ms hover transitions on cards and buttons. No animation libraries added.

Scope is presentation-only — no business logic changes.

## 3. Auth & access — direct URL must require login

Today the app remembers the user in `localStorage` with no expiry and no protected-route wrapper, so pasting any URL drops you into the last page. Fix on three layers:

**a. Token expiry enforcement (`AuthProvider`):**
- On load, read `sessionToken`, decode its HMAC payload, check `exp`. If missing or expired → clear `currentUser` + `sessionToken` and treat as logged out.
- Track inactivity (configurable, default 30 minutes); on timeout clear session and redirect to `/auth`.
- Wrap every edge-function call helper to log the user out on `401`.

**b. Optional session-only login:**
- Add a "Keep me signed in on this device" checkbox on `/auth`. Default OFF.
- When OFF, store `currentUser` + `sessionToken` in `sessionStorage` instead of `localStorage`, so closing the tab/browser ends the session. When ON, fall back to today's `localStorage` behavior.

**c. Protected routes (`App.tsx`):**
- Add a `<RequireAuth>` wrapper around `/`, `/ai-insights`. Unauthenticated visitors are redirected to `/auth?next=<original-path>` and bounced back after login.
- Add a `<RequireRole roles={[...]}>` wrapper for role-restricted routes (e.g. AI Insights only for admin/accountant/seller-of-that-shop).
- `/auth`, `/super-admin/login` stay public; `/super-admin` keeps its existing super-admin check.

**d. Login function token TTL:**
- `login` edge function already issues an HMAC token; default TTL drops from 12h to 8h. "Keep me signed in" extends it to 30 days. The client clears state once the token expires.

### Files touched

- `src/components/money/DebtorsList.tsx` — new "By customer" aggregated view + toggle.
- `src/index.css`, `tailwind.config.ts` — token contrast tweaks, new surface/shadow tokens.
- `src/components/ui/{tabs,table,input,button,card,select,textarea}.tsx` — small class adjustments to match the new tokens.
- `src/components/AuthProvider.tsx` — token-expiry + inactivity logic, sessionStorage option.
- `src/pages/Auth.tsx` — "Keep me signed in" checkbox, `next` redirect handling.
- `src/App.tsx` — `RequireAuth` / `RequireRole` route wrappers.
- `src/lib/adminApi.ts` — clear session and redirect to `/auth` on `401`.
- `supabase/functions/login/index.ts` — token TTL + optional long-lived flag.

No database migrations are required.
