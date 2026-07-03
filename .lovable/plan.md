## Goal

In the Daily Report (already shown to Admin, Accountant, and Sellers), surface the "Customers who bought today" list as a simple table placed directly under the daily bags-sold summary — one row per customer with an inline list like `Moses Martin — 4 High Yield bags, 7 Kienyeji kg`.

## Context

- `src/components/money/DailyReport.tsx` already computes `customersToday` and renders a customer table, but it sits at the bottom of the page (after money-by-method and the products pivot), so it's easy to miss.
- The report is already mounted in `AdminDashboard`, `AccountantDashboard`, and `SellerDashboard`, so no new wiring is needed there.
- Factory ↔ Kiambu shared stock is already handled by the existing `mirror_kiambu_sale_to_factory` trigger; no DB changes are needed for this request.

## Changes

**`src/components/money/DailyReport.tsx`**
1. Move the "Customers who bought today" card so it renders immediately after the 4 KPI cards (Total Bags Sold / Sales Value / Money Collected / Credit Issued) and before the two-column "Products sold per unit" + "Money by Payment Method" grid.
2. Tighten the table to two columns:
   - **Customer** (bold name)
   - **Purchases** — comma-separated list of `{qty} {product} ({unit})`, e.g. `4 High Yield (bags), 7 Kienyeji (kg)`.
3. Keep the existing empty state ("No customer purchases on this date.").
4. No changes to data fetching or aggregation logic; `customersToday` already groups per customer and merges duplicate product+unit lines.

## Out of scope

- No changes to Admin, Accountant, or Seller dashboards (they already render `DailyReport`).
- No database, RLS, or inventory-mirroring changes.
- No change to the money-by-product×unit pivot or the per-unit bag-equivalent table.
