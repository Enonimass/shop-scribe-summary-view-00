# Kimp Feeds — multi-feature improvement plan

## Goals

1. Make Products/Qty visible & editable in the admin Sales Transactions editor.
2. One source of truth for products. No free-text product input anywhere except `InventoryTab` (admin).
3. Merge duplicate products (`Pig grower` / `Pig Grower`) and prevent future duplicates (case-insensitive uniqueness).
4. Move the shop selector to the **top navigation** as the single global control. Remove per-tab shop dropdowns.
5. Bulk sales upload also imports/uses **default unit prices** from the price table.
6. End-of-day reconciliation: cash sales + bank-paid sales + credit + debt-paid = total sales. Alert when cash is left undeposited.
7. New analytics: price-change contribution, customers-per-product per period, and sales analysis broken down by unit (bags / 50kg / kg / 70kg-equivalent).

---

## 1. Fix empty Products / Qty columns in `AdminTableEditor`

**Root cause:** `fetchSalesTransactions` queries `sales_items` without a filter, hitting Supabase's default 1000-row cap. Items for older transactions are dropped, so those rows show blank Products and 0 Qty.

**Fix:** batch-fetch `sales_items` by `transaction_id` in chunks of 200 (matches the existing "Data Fetching Strategy"), then attach to transactions.

## 2. Enforce product picker everywhere (no free-text)

Replace every free-text product input outside `InventoryTab` with a `ProductCombobox` backed by `inventory.product` for the active shop. Affected files:

- `AdminTableEditor.tsx` — sales item product input → combobox.
- `SalesTab.tsx` — new-sale flow.
- `BulkSalesUpload.tsx` — already validates (recent change); keep dropdown enforcement for unknown rows.
- `PriceManager.tsx` — product field.
- `factory/FactoryInventory.tsx`, `logistics/DeliveryNoteManager.tsx`, `logistics/TripManager.tsx`, `money/DebtPaymentForm.tsx` (where product appears).
- Find/Replace stays in admin only.

New shared component: `src/components/ProductCombobox.tsx` (uses existing `Command` + `Popover`, fetches products for `shopId`, supports unit-aware selection).

## 3. Merge duplicate products (case-insensitive uniqueness)

**Data cleanup (migration):**

- Pick canonical spelling per `(shop_id, lower(product))` as the most-recent or admin-preferred capitalisation; rewrite `inventory`, `sales_items`, `product_prices`, `product_category_items`, `delivery_note_items`, `trip_stop_items`, `factory_inventory` to use the canonical name.
- Merge any duplicate `inventory` rows that collide on `(shop_id, lower(product), lower(unit))` by summing `quantity`, keeping the higher `threshold`/`desired_quantity`.
- Add a partial unique index: `unique (shop_id, lower(product), lower(unit))` on `inventory`. Same on `product_prices`.

**Going forward:**

- All writes go through the combobox; new product creation lives only in `InventoryTab`. The "Add product" form there validates against existing case-insensitive name and refuses to create a duplicate.

## 4. Global shop selector in top nav

- New `src/components/ShopSelectorTopBar.tsx` rendered inside `App.tsx` (or `Index.tsx` layout) above the tabs nav, persisted in `localStorage` and exposed via a `ShopContext` (`useShop()` hook returning `{ shopId, setShopId, shops }`).
- For admins, the value `"all"` keeps the aggregated view.
- Refactor each consumer to read from `useShop()` instead of its own dropdown:
  - `AdminDashboard.tsx` (remove inline "Select Shop" card),
  - `AdminOverview`, `CustomerAnalytics`, `ProductAnalytics`, `PriceManager`, `DailyReport`, `DebtorsList`, `TripManager`, `BulkSalesUpload`, `AdminTableEditor`, etc.
- Sellers are still pinned to their own `shop_id` (selector hidden / disabled).

## 5. Bulk upload — include default prices

- When parsing the upload, resolve `unit_price` for each `(product, unit)` from `product_prices` (using `getEffectiveUnitPrice` from `src/lib/units.ts`).
- If the file already provides a price column, that wins; otherwise default-fill from the price table and show it in the preview (greyed) so the user can override.
- Write `unit_price` into `sales_items`; `line_total` and `total_amount` are summed and saved on the transaction.

## 6. End-of-day cash deposit reconciliation

**Model** (matches the user's equation `sales = bank + credit + debt_paid`):

- Use existing `payment_methods` table — each bank account is a method with `kind = 'bank'`; "Cash" stays as `kind = 'cash'`; credit stays as `kind = 'credit'`.
- New table `cash_deposits` (per shop, per date): `id, shop_id, deposit_date, bank_method_id, amount, note`.
- Daily reconciliation view in `DailyReport.tsx`:
  - **Sales total** for the day (sum of `sales_transactions.total_amount`).
  - **Bank component** = sum of sales paid directly to a bank method + sum of `cash_deposits` for the day.
  - **Credit component** = sum of unpaid credit sales.
  - **Debt-paid component** = sum of `debt_payments` for the day.
  - **Reconciled?** `sales == bank + credit + debt_paid`; otherwise show the gap as **"Undeposited cash"** with an alert badge and a "Record deposit" button that inserts into `cash_deposits`.
- Admin/accountant gets a dashboard banner if any prior-day undeposited cash > 0.

## 7. New analytics

All live under `ProductAnalytics` / `CustomerAnalytics` / a new "Monthly Analysis" tab.

### 7a. Price-change contribution
- Compare `product_prices` history (add `effective_from` column if not present — schema check needed) between two periods (or use last-change diff).
- Per product: `Δprice × units_sold_after = revenue contribution`. Rank products by absolute contribution. Show table + bar chart.

### 7b. Customers per product per period
- For each product, count **distinct customers** (not transactions) in the selected period. A customer who buys product A four times counts as 1.
- Period picker reuses `PeriodPicker`.

### 7c. Sales analysis by unit
- Break down sales by canonical unit key (`bags`, `50kg`, `20kg`, `10kg`, `kg`) using `PIVOT_UNITS` from `src/lib/units.ts`.
- Also show the 70kg-equivalent total per product (existing convention).
- Monthly Analysis tab combines: customer segments (existing), product mix by unit, price-change contribution.

---

## Technical notes

- **Schema migrations needed:**
  - `cash_deposits` table (+ GRANTs, RLS by shop, audit triggers).
  - Add case-insensitive unique indexes on `inventory` and `product_prices`.
  - Data-cleanup SQL to merge duplicate product names (run once, idempotent).
  - Add `effective_from timestamptz default now()` to `product_prices` if missing, to support price-change analytics.
- **ShopContext** lives in `src/context/ShopContext.tsx`; `useShop()` is the only API consumers use. `localStorage` key: `kf.selectedShop`.
- **ProductCombobox** props: `{ shopId, value, unit?, onChange, allowEmpty? }`. Internally caches the product list per shop.
- **AdminTableEditor batched fetch:** chunk `transaction.id`s into groups of 200 and `.in('transaction_id', chunk)` per call; concat results.
- **Cash deposit alert:** computed client-side in `DailyReport` from already-fetched sales + `cash_deposits` queries; no edge function required.

## Out of scope

- No changes to auth, RLS posture, or the AI insights edge function.
- No new exports beyond what the new analytics views already emit via existing CSV/PDF utilities.
- Logistics trip workflow stays as-is apart from swapping product inputs for the combobox.
