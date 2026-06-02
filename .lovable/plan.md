# Plan: Linked Debt Payments + Pivoted Inventory/Prices

## 1. Debt payments linked to specific credit purchases

**Goal:** Each debt payment must be tied to a specific credit sale (a row in `sales_transactions` with `is_credit = true`), not just a customer name.

### DB migration
- Add nullable columns to `debt_payments`:
  - `sale_transaction_id uuid` (the credit sale being paid off)
  - `allocated_amount numeric` (optional; defaults to `amount` — supports partial payments)
- Index on `sale_transaction_id`.
- Leave existing rows with `sale_transaction_id = NULL` (legacy, unallocated).

### UI: `DebtPaymentForm.tsx`
- When a customer name is chosen, fetch their outstanding credit sales for that shop:
  `sales_transactions` where `shop_id = X`, `customer_name = Y`, `is_credit = true`, and
  `total_amount > coalesce(sum(debt_payments.amount where sale_transaction_id = id), 0)`.
- Show a **dropdown/list** of those open credit sales: `Date · Items summary · Total · Paid · Balance`.
- User picks one before saving. Amount defaults to remaining balance; cannot exceed it.
- Save sets `sale_transaction_id` on the new `debt_payments` row.

### UI: Customer debts view (`AccountantDashboard`, `SellerSummary`, `AdminOverview` where debts are listed)
- Replace "outstanding by customer" aggregate with a drill-down:
  - Customer row → expandable to show each open credit sale (date, total, paid, balance) and the payments allocated to it.

### Out of scope
- Auto-reallocating legacy payments. They stay as "Unallocated" and are still subtracted from the customer's overall balance.

## 2. Pivoted inventory: one row per product, columns per unit

**Goal:** Replace the long per-(product,unit) list with a pivot table.

### Unit set (fixed columns, in this order)
`70kg bags`, `50kg bags`, `40kg bags`, `20kg bags`, `10kg bags`, `kg`

(70kg = the bag-equivalent standard; the rest are the unit values already in use.)

### `InventoryTab.tsx` (seller stock view)
- Fetch `inventory` for shop, group by `product`.
- Render one row per product. Each unit column shows the `quantity` for that exact (product, unit) row, or `—` if none.
- Keep an extra **Total (70kg eq.)** column using `toBagEquivalent` from `src/lib/units.ts`.
- **Threshold/desired/status table stays untouched** as a separate card below (current per-row table), as requested.
- Low-stock alert logic unchanged.

### Factory inventory view (`FactoryInventory.tsx`)
- Same pivot treatment (no shop filter).

### Add-stock form
- Unchanged: still writes a single (product, unit) row. The pivot is purely a display change.

## 3. Pivoted prices: one row per product, columns per unit, with derived `kg`

**Goal:** Admin sees all prices for a product on one row.

### `PriceManager.tsx`
- Same unit columns as inventory: `70kg`, `50kg`, `40kg`, `20kg`, `10kg`, `kg`.
- Row source: distinct product names from `inventory` ∪ `product_prices` for the selected shop.
- Each cell is an editable price input bound to the (product, unit) row in `product_prices`.
- **Derived `kg` rule:** when a `10kg` price exists and `kg` is empty, show `10kg / 10` as a faint placeholder (e.g. `"≈ 120"`). Saving writes an explicit value; otherwise the derived value is used at read time wherever prices are consumed.
  - Implement a single helper `getEffectiveUnitPrice(prices, product, unit)`:
    - returns explicit price if present
    - else if unit = `kg` and a `10kg` price exists → `price_10kg / 10`
    - else if unit = `10kg` and a `kg` price exists → `price_kg * 10`
    - else `null`
  - Use it in `PriceManager` cells (as placeholder) and anywhere else prices are read for display (sales line entry). Saving still creates a real `product_prices` row.
- Save per cell (existing pattern) — no bulk save button needed this round.

### Out of scope
- Backfilling `product_prices` rows from the derived rule (kept on-the-fly).
- Changing how sales pricing is recorded (`sales_items.unit_price` still snapshots whatever value was used).

## Technical notes
- Migration tool: only the `debt_payments` column additions.
- All other work is frontend pivoting + a small price-derivation helper.
- No RLS changes; no changes to existing constraints.

## Files touched
- `supabase/migrations/<new>.sql` — add columns to `debt_payments`
- `src/components/money/DebtPaymentForm.tsx` — credit-sale picker
- `src/components/AccountantDashboard.tsx`, `src/components/seller/SellerSummary.tsx`, `src/components/admin/AdminOverview.tsx` — debts drill-down
- `src/components/InventoryTab.tsx` — pivot stock table
- `src/components/factory/FactoryInventory.tsx` — pivot factory stock
- `src/components/money/PriceManager.tsx` — pivot prices + derived kg
- `src/lib/units.ts` — add `getEffectiveUnitPrice` helper
