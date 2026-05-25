## 1. Weekly Purchasing Analysis (new tab in Customer Analytics)

New component `src/components/analytics/WeeklyPurchasing.tsx`.

Tiers (bag‑equivalents per week, Mon–Sat = one week):
- `>10`, `5–10`, `1–5`, `<1`

For each customer in the period:
1. Group their sales into Mon–Sat weeks.
2. Sum bag‑equivalents per week (reuse `toBagEquivalent`).
3. Count how many of that customer's weeks fall in each tier.

Two tables (matching the existing Purchasing Power layout):

A. Customer‑weeks per tier — per shop row + totals
```
OUTLET   >10   5-10   1-5   <1   TOTAL WEEKS
HQ        4     17    62    9        92
…
```

B. Distinct customers reaching each tier at least once (so admin sees "how many customers ever hit ≥10 bags/week")
```
OUTLET   >10   5-10   1-5   <1   ACTIVE CUSTOMERS
HQ        2     8     45    12       67
```

Scope controls (same pattern as Purchasing Power):
- Period toggle: This Month / All Time / Custom Range (default current month).
- Shop filter respected; sellers see only their own shop.
- CSV + PDF export buttons.

Surfaces:
- New "Weekly Purchasing" section inside `CustomerAnalytics.tsx`, directly under Purchasing Power.
- Same block reused inside `AdminOverview.tsx`.

No DB changes — pure in‑memory aggregation over `sales_items` + `sales_transactions` fetched with the existing 200‑ID chunking.

## 2. Trip ↔ Delivery Note coupling (enforced)

Rule: every delivery note must live inside a trip. DNs are still authored manually, but only from within a trip.

`src/components/logistics/TripManager.tsx`
- Each trip stop gains a "Delivery Notes" sub‑panel. Logistics user adds DN(s) per stop manually (DN no., delivery date, items, notes).
- Trip cannot be dispatched if any stop has zero delivery notes (button disabled + tooltip "Add a delivery note to every stop").
- The combined "Print Trip + Delivery Notes (PDF)" already implemented stays — now it iterates real DN records per stop instead of synthesising from stop items.

`src/components/logistics/DeliveryNoteManager.tsx`
- Remove "Create new delivery note" UI. Keep only a read‑only history list of legacy/standalone DNs labelled "Legacy delivery notes (read‑only)".
- Hide the page entry from the nav for non‑super‑admin to discourage use.

Data model
- Add `trip_stop_id uuid` and `trip_id uuid` columns to `delivery_notes` (nullable for legacy rows).
- New DNs created via TripManager must have both set; UI enforces it.

Dispatch validation
- Client‑side check (count DNs per stop) on dispatch.
- Migration also adds a trigger that prevents `trips.status = 'dispatched'` when any stop has zero linked DNs.

## 3. Accountant role (read‑only + exports)

New role `accountant` (DB enum + profile role string).

Admin → User Management can create accountant accounts (same form, role dropdown gains "Accountant").

New page `src/pages/AccountantDashboard.tsx` with tabs:
- Sales (all shops, all transactions, filters, exports) — read‑only `SalesTab`.
- Money In — payments (`sales_transactions.amount_paid`, `debt_payments`), grouped by method + shop.
- Debts — outstanding (transactions where `amount_paid < total_amount`).
- Stock Levels — `inventory` per shop.
- Factory Inventory — `factory_inventory`.
- Accounting Summary — KPIs: total sales, total collected, outstanding debt, COGS proxy (factory dispatched), stock value (if prices present).

All existing tables shown with current export buttons (CSV/PDF/Excel) enabled. No create/edit/delete buttons rendered; routing guard hides them.

`AuthProvider` + `src/pages/Index.tsx` routing:
- If `role === 'accountant'` → render `AccountantDashboard`, never `AdminDashboard`/`SellerDashboard`.
- A small `useReadOnly()` hook returns true for accountants; all mutating components check it and render disabled actions.

## Technical details

- Migration (one file): add `delivery_notes.trip_id`, `delivery_notes.trip_stop_id`; add `accountant` to the role enum (or accepted role strings on `profiles`); add trigger `trg_trips_require_dn_before_dispatch`.
- Reuse `toBagEquivalent`, `Intl.NumberFormat`, `jspdf`/`jspdf‑autotable`, `xlsx` already in project.
- Mon–Sat week key: format date as `YYYY-WW` where week start = nearest prior Monday, week end = Saturday (Sundays ignored / rolled into previous Saturday's week).
- Read‑only enforcement is UI‑level only (RLS stays permissive as today) — flagged as a follow‑up if stricter security is required later.

## Out of scope
- Changing existing trip dispatch/return/inventory math.
- Touching pricing or payment‑method logic beyond surfacing them to the accountant.
- Server‑side RLS lockdown for accountant (UI guard only this round).
