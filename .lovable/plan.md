# Plan

## 1. Friendlier product picker on Sales

Today the Sales form shows one row per (product × unit) — e.g. `Pig Grower - 50kg (12 available)`, `Pig Grower - 10kg ...`, etc. Hard to scan on mobile.

Change the line-item editor to two cascading pickers:

- **Product** — distinct product names from inventory, alphabetically. Shows total bag-equivalent stock as a small hint.
- **Unit** — only the units that actually have stock for the selected product, with "(N available)" inline.

After both are chosen we apply the same `lookupPrice` + override behavior as today. Defaults: product empty, unit empty until product is picked.

Also drop `40kg` everywhere it appears as a selectable/canonical unit:
- Remove `40kg` from `PIVOT_UNITS` in `src/lib/units.ts`.
- Remove the `40kg` branches from `toBagEquivalent` / `toKg`.
- Remove the `40kg` column from the pivoted Stock and Price tables (`InventoryTab.tsx`, `FactoryInventory.tsx`, `PriceManager.tsx`).
- Keep existing DB rows untouched — they just won't be offered as new options and won't get a dedicated pivot column.

## 2. Price derivation: extend the kg rule to 20kg

`getEffectiveUnitPrice` already derives `kg` from `10kg/10` and `10kg` from `kg*10`. Extend so any of `{10kg, 20kg, 50kg, 70kg}` can be derived from the per-kg price (× pack size) when no explicit price is set, and `kg` can be derived from any pack price (÷ pack size, preferring the smallest pack). Explicit prices always win.

This affects `PriceManager` display and the sales price lookup (sales will call `getEffectiveUnitPrice` instead of the raw `lookupPrice` row match, so derived prices auto-populate the Unit Price field).

## 3. Credit due dates + debtors view

Add a due date to each credit sale and surface a real debtors list everywhere debts are managed (Accountant, Shop Admin).

### Schema (one migration)
- `sales_transactions.due_date date NULL` — only meaningful when `is_credit = true`.
- Backfill: leave NULL for existing rows; UI treats NULL as "no due date set".

### Sales recording
- In `SalesTab` credit flow, when "Credit" is selected show a **Due date** field (defaults to +30 days, editable). Save into `due_date`.

### Debtors list component (new `DebtorsList.tsx`)
Computes per open credit sale: customer, sale date, due date, billed, paid (sum of `debt_payments.allocated_amount` + `sales_transactions.amount_paid`), balance, age in days.

Bucketing by age past due (configurable, defaults shown):
- **Good** — not yet due, or ≤ 30 days past due
- **Long** — 31–90 days past due
- **Bad** — > 90 days past due, or due date missing and > 90 days old

Top of the list: three KPI cards with count + KES total per bucket.

Filters: customer search, min/max balance, age range (days since sale), bucket multi-select, "due before/after" date range. Sort by balance, age, or due date.

Reused on:
- `AccountantDashboard` → Debts tab (above the existing payments list).
- `AdminDashboard` (Shop Admin) → new "Debtors" sub-tab next to existing money views.

## 4. Credit invoice + payment receipt (PDF / thermal)

A new helper `src/lib/receipts.ts` generating two layouts with `jspdf`:

- **Credit Invoice** — issued at the moment a credit sale is saved. Contains: shop header, invoice no (= sale id short), date, customer name, line items (product, qty, unit, unit price, line total), total, amount paid, **credit balance**, **due date**, signature lines. Two render modes:
  - `a4()` — standard A4 PDF, opens in new tab + download.
  - `thermal(80mm)` — narrow 80mm receipt PDF for thermal printers (single column, monospace, auto-height).
- **Debt Payment Receipt** — issued when a `debt_payments` row is created. Contains: receipt no, date, customer, linked sale ref + original total, amount paid today, total paid to date, **outstanding balance**, method.

UI wiring:
- After a successful credit sale in `SalesTab`, show a toast with **Print invoice** + **Download PDF** actions and an inline "Format: A4 / 80mm" toggle (persists in localStorage).
- After a successful debt payment in `DebtPaymentForm`, same pattern for the payment receipt.
- Each row in the new `DebtorsList` gets a **Reprint invoice** button; each row in the Recent Debt Payments table gets **Reprint receipt**.

No new DB tables — invoice/receipt numbers derive from the row id.

## 5. Custom-period summaries (Admin & Shop Summary)

Replace the hard-coded `Today / This month` toggle in `AdminOverview` and `SellerSummary` with a small `<PeriodPicker>` component:

- Presets: Today, Yesterday, Last 7 days, This month, Last month, This year.
- **Custom range**: two date inputs (from/to).
- Component returns `{ start, end, label }` and the parent re-runs its existing aggregation against that range (all current queries already use `gte('sale_date', startStr)` — extend with `lte` when `end` is set).

The same picker is reused in both dashboards so behavior stays consistent.

## Technical notes

- All changes scoped to existing tables; one schema-only migration adds `sales_transactions.due_date`.
- New files: `src/components/money/DebtorsList.tsx`, `src/lib/receipts.ts`, `src/components/PeriodPicker.tsx`.
- Edited files: `src/lib/units.ts`, `src/components/SalesTab.tsx`, `src/components/money/PriceManager.tsx`, `src/components/InventoryTab.tsx`, `src/components/factory/FactoryInventory.tsx`, `src/components/AccountantDashboard.tsx`, `src/components/AdminDashboard.tsx`, `src/components/admin/AdminOverview.tsx`, `src/components/seller/SellerSummary.tsx`, `src/components/money/DebtPaymentForm.tsx`.
- `jspdf` is already a project dependency (used by `exportUtils`), so no new packages needed.
- Bucket thresholds (30/90 days) exposed as constants at the top of `DebtorsList.tsx` so they're easy to tune later.
