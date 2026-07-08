## Goal

Every sale must have money recorded. New sales require a payment method + amount. Sales with missing money get auto-priced from the shop's `product_prices` (with the same derivation rules already used elsewhere: e.g. 1 bag = 3050 → 0.5 bag = 1525). Existing records get backfilled the same way.

## Changes

### 1. New sale entry (SalesTab)
- Make payment method **required** (already is) and, for non-credit methods, make **Amount Paid required** (currently it silently defaults to the computed total).
- Show a live per-line total and grand total under the items list. Each row already auto-fills `unit_price` from `lookupPrice(product, unit)`; keep that but also:
  - Show the resolved price next to the product row (e.g. "@ 3,050 / bag → 1,525").
  - If no price is set for that product/unit, flag the row with an inline warning and block submit until the user either sets a price or types a unit price manually.
- For credit sales, keep Amount Paid optional (can be 0), but still require the payment method.

### 2. Bulk upload (BulkSalesUpload)
- Add a **Payment Method** select (required) in the preview dialog, applied to the whole batch (per-row override optional, out of scope for this pass).
- For each row, if `unit_price` is empty, resolve it via the same `getEffectiveUnitPrice` logic used in SalesTab (so 0.5 bag inherits half of the 1-bag price).
- Persist `unit_price`, `line_total`, `original_price`, `price_overridden` on every `sales_items` row.
- Persist `payment_method_id`, `payment_method_name`, `is_credit`, `total_amount`, `amount_paid` on the `sales_transactions` row. For non-credit, `amount_paid = total_amount`; for credit, `amount_paid = 0` by default.

### 3. Backfill existing records
Add an **Admin → Data Tools → "Backfill sale prices"** action (visible to admin only) that, per shop:
1. Loads `product_prices` for the shop.
2. Streams `sales_items` joined to their `sales_transactions` in chunks of 200.
3. For any item with `unit_price` null/0, computes the effective unit price via `getEffectiveUnitPrice` (same rules as live entry). Writes `unit_price`, `original_price = unit_price`, `price_overridden = false`, `line_total = unit_price * quantity`.
4. Recomputes `total_amount` for each affected transaction as `SUM(line_total)`. For non-credit transactions with `amount_paid = 0`, sets `amount_paid = total_amount`. Credit transactions keep `amount_paid` as-is.
5. Skips items where no price can be resolved and reports them in a summary toast + downloadable CSV so the user can set prices and re-run.

The backfill runs entirely from the admin UI using existing tables and RLS — no new DB tables, no edge functions.

## Technical details

- Uses existing helpers: `lookupPrice`, `getEffectiveUnitPrice`, `canonicalUnitKey` in `src/lib/units.ts`. No new pricing logic.
- No schema migration needed — `sales_items.unit_price / line_total / original_price / price_overridden` and `sales_transactions.total_amount / amount_paid / payment_method_*` already exist.
- Files touched:
  - `src/components/SalesTab.tsx` — enforce Amount Paid for non-credit, show resolved price hint per row, block submit on missing price.
  - `src/components/BulkSalesUpload.tsx` — add payment method select, resolve missing prices via `getEffectiveUnitPrice`, persist money fields on transaction + items.
  - `src/components/admin/AdminOverview.tsx` (or nearest admin data-tools panel) — add "Backfill sale prices" card with shop picker, run button, progress, and CSV of unresolved rows.
- Chunk all reads/writes in 200-row batches (project-wide convention).

## Out of scope

- No changes to seller/accountant/logistics dashboards' read views (they'll simply start showing correct totals once data is backfilled).
- No new payment methods, no receipt template changes.
- No retroactive change to `saleType` or inventory quantities.
