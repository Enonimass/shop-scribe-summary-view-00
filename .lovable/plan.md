
## Plan

### 1. Revenue vs Money In — clarity card
On Admin overview + Accountant dashboard, add a small breakdown card for the selected period:

```
Revenue (invoiced)     KES 2,331,777
  = Cash Sales           1,841,263
  + Credit Issued          490,514

Money In (collected)   KES 1,933,420
  = Cash Sales           1,841,263
  + Debt Payments           92,157

Outstanding from period    398,357  (credit issued − debt payments on those sales)
```
No math changes — just an explanatory panel so the gap is obvious.

### 2. Case-insensitive customer & product names
- New DB trigger on `sales_transactions`, `debt_payments`, `customers`, `sales_items`: normalize `customer_name` / `product` by looking up an existing matching row with `lower(name) = lower(new.name)` in the same shop; if found, snap to the canonical casing.
- One-off data cleanup: pick the most-used casing per (shop, lowered-name) as canonical, update all historical rows to it, then merge duplicate `customers` rows.
- Frontend already uses `ProductCombobox` in most places; extend to remaining spots (SalesTab, PriceManager, FactoryInventory, DeliveryNoteManager, TripManager, DebtPaymentForm) so free-text can't reintroduce case duplicates.

### 3. Accountant module — parity with outlets/admin
New tab set for Accountant:
- **Inventory (simplified)**: same pivot table used by admin — rows = products, columns = units (70kg / 50kg / 20kg / 10kg / kg), with category filter and shop filter. Read-only.
- **Daily Report**: same `DailyReport` component used by outlets/admin, plus the two additions in §4.

### 4. Daily Report enhancements (all roles)
Add two sections to `src/components/money/DailyReport.tsx`:

**a) Customers who bought today**
```
Mark        1× High Yield (70kg), 4× Super (50kg)
Jane        2× Pig Grower (10kg)
```
Grouped from `sales_transactions` + `sales_items` for the date, using canonical customer name.

**b) Money by product × unit (pivot)**
Rows = product, columns = units, cell = revenue (qty × unit_price) for that day, with row totals and grand total.

### 5. FPS ↔ Kiambu — single shop
Merge into one `shop_id` (keep the Kiambu id, retire FPS id):
- Data migration: `UPDATE` all rows in `inventory`, `sales_transactions`, `sales_items`, `debt_payments`, `customers`, `product_prices`, `delivery_notes`, `delivery_note_items`, `trips`, `trip_stops`, `factory_inventory`, `audit_logs`, `profiles` from `fps_shop_id` → `kiambu_shop_id`.
- Collapse duplicate `inventory` rows (`SUM(quantity)` per product+unit) before re-adding the unique constraint.
- Remove the FPS shop from `profiles.shops` lists and the shop selector.
- FactoryInventory (production intake) stays, but writes to the merged shop's inventory.

### 6. One-click delivery to outlets
Current flow: create delivery note → confirm at source → confirm at destination → adds to inventory. New flow:
- Logistics/admin creates a delivery note and clicks **Send** → in a single transaction: mark note as `added_to_inventory`, deduct source stock, add destination stock, auto-generate the delivery-note PDF.
- Delivery note is still saved (audit trail preserved), just no second-side confirmation required.
- Remove the two-step confirmation UI from `DeliveryNoteManager`; keep the list/history view.

### 7. FPS production intake — weekly report (admin only)
New read-only report in Admin dashboard → Factory section:

```
Product/Unit   Mon   Tue   Wed   Thu   Fri   Sat   Sun
 Opening        …
 Added          …
 Sold/Out       …
 Closing        …
```
- Week picker (prev/next), one table per product+unit, or a single table with product+unit rows and 7-day columns.
- Sources: `factory_inventory` movements for Added, `delivery_notes` out for Out, computed Opening/Closing.
- Keep the existing manual-entry form for adding intake unchanged.

### Files to touch

**DB migration (single migration):**
- Trigger + backfill for case normalization on customers/products.
- Merge FPS shop_id → Kiambu shop_id across all tables; dedupe inventory.
- Nothing else schema-wise.

**Frontend:**
- `src/components/money/DailyReport.tsx` — customers-today section + money-by-product×unit pivot.
- `src/components/AccountantDashboard.tsx` — add Inventory tab (reuse admin pivot) + Daily Report tab.
- `src/components/admin/AdminOverview.tsx` + `AccountantDashboard.tsx` — Revenue vs Money In breakdown card.
- `src/components/admin/` — new `ProductionIntakeWeekly.tsx` weekly grid, wired into admin factory tab.
- `src/components/logistics/DeliveryNoteManager.tsx` — collapse confirmations into single Send action; keep history.
- `src/components/SalesTab.tsx`, `PriceManager.tsx`, `FactoryInventory.tsx`, `DeliveryNoteManager.tsx`, `TripManager.tsx`, `DebtPaymentForm.tsx` — replace free-text product inputs with `ProductCombobox`.
- Shop selector components — remove FPS option after merge.

### Out of scope for this pass
- Global top-bar shop selector (still per-tab for now).
- New price-change / customers-per-product analytics tabs.
- Cash-deposit reconciliation.

Reply **approve** to build, or tell me which items to drop/reorder.
