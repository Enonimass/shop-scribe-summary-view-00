# Plan

## 1. Logo on every PDF/receipt
- Convert `src/assets/kimp-feeds-logo.jpeg` to a base64 data URL once (small helper module `src/lib/brand.ts` exporting `LOGO_DATA_URL`, `BRAND_NAME`).
- In `src/lib/receipts.ts`, draw the logo at the top-left of every layout:
  - A4 invoice/receipt: `doc.addImage(LOGO_DATA_URL, 'JPEG', 14, 10, 18, 18)` and shift shop name/title to the right.
  - Thermal (80mm): centered ~20x20mm logo at the top, then title lines.
- Audit other PDF exporters and add the same logo header:
  - `src/lib/exportUtils.ts` (general PDF/Excel exports)
  - any `jsPDF` usage in `ExportButtons.tsx`, `MovementReport.tsx`, `DeliveryNoteManager.tsx` (header block).

## 2. Customer directory: faster + richer detail
- Speed up `CustomerManagement.fetchCustomers`:
  - Stop doing the per-row sync + per-row UPDATE on every load. Move the "infer first/last purchase from sales" sync into a single RPC `public.sync_customers_from_sales(p_shop_id text)` (or a one-shot client batch) triggered only by an explicit "Refresh from sales" button, not on every mount.
  - Initial load = single `select` from `customers` (already indexed by shop_id). Render immediately.
- Add `email` column to `customers` (nullable text). Show + edit Name, Phone, Area (place), Email in the edit dialog. Name becomes editable (was read-only).
- Add a "View" action opening a `CustomerDetailDialog` with:
  - Personal info: name, phone, area, email, status, shop.
  - Sales summary: first/last purchase, total transactions, total bag-equivalents, total KES.
  - Period picker (reuse `PeriodPicker`) recomputing: bags per product per unit (table) + bag-equivalent totals.
  - Credit analysis: total credit ever taken, currently outstanding, oldest open debt age, debt bucket (Good/Long/Bad), avg days-to-pay, list of open credit sales with balances; if no credit history show a green "Cash-only customer" badge.
- Detail dialog batches three queries scoped by customer_name + shop_id: `sales_transactions`, then `sales_items` for those tx ids (chunked 200), and `debt_payments` for those tx ids.

## 3. Rename propagation
- New SQL function `public.rename_customer(p_old text, p_new text, p_shop_id text)` that updates `customers.name`, `sales_transactions.customer_name`, `sales.customer_name`, `debt_payments.customer_name`, and `trip_stops.customer_name` in one transaction (case-insensitive match scoped to shop).
- `CustomerManagement` edit dialog calls this RPC when the name field changed; toast shows count of rows updated.

## 4. Daily dashboard: per-unit breakdown + bag-equivalent total
- In `src/components/money/DailyReport.tsx`, replace "Bags Sold by Product" with a pivot table:
  - Rows = product
  - Columns = each unit present that day (kg, 10kg, 20kg, 50kg, 70kg, bags…)
  - Right-most column = "Total (bags eq)" using `toBagEquivalent`
  - Footer row = column totals; grand-total cell uses bag equivalents (your example: 5 bags + 4×10kg + 5×20kg → 7 bag-eq).

## 5. Summary dashboards: bags per product (not per unit)
- In `AdminOverview.tsx` and `SellerSummary.tsx`, add a "Bags sold per product" card under the KPIs:
  - Aggregate `sales_items` by product, summing `toBagEquivalent(quantity, unit)`.
  - Sorted descending, with totals row.
- Keep existing top-line KPI cards.

## 6. Debtors summary on Summary dashboards
- New small KPIs on `AdminOverview` and `SellerSummary` (shop-scoped):
  - "Outstanding debt" = sum of (`total_amount` − `amount_paid` − Σ `debt_payments.amount`) over all `is_credit=true` sales as of today (period-independent).
  - "Debtors" = distinct customers with balance > 0.
- Click-through opens existing `DebtorsList` in a dialog.

## 7. Mobile collapsible nav
- The four role dashboards (`AdminDashboard`, `SellerDashboard`, `LogisticsDashboard`, `AccountantDashboard`) each render a wide `Tabs` bar. On mobile (`useIsMobile`), replace the visible `TabsList` with:
  - A compact header showing current tab + a hamburger button that opens a Sheet (`@/components/ui/sheet`) listing all tab items vertically. Selecting one calls `setActiveTab` and closes the sheet.
- Desktop layout unchanged.

## Technical notes
- New file: `src/lib/brand.ts` (logo data URL + brand constants).
- New file: `src/components/customers/CustomerDetailDialog.tsx`.
- New file: `src/components/MobileTabsNav.tsx` (reusable mobile tab switcher).
- DB migration: `ALTER TABLE customers ADD COLUMN email text;` + create `rename_customer` and `sync_customers_from_sales` functions (no RLS changes needed; tables already permissive).
- No changes to auth, units rules, or pricing logic.
