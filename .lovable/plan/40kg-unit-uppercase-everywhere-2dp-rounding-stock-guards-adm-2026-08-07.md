# 40kg unit, uppercase everywhere, 2dp rounding, stock guards, admin edits everything

## 1. 40kg unit restored
- 40kg is added back to the unit list everywhere a unit can be picked (sales, inventory, factory stock, intake, deliveries, trips, returns, prices).
- Pricing follows the same rule as the other packs: 40kg price = per-kg price x 40 when no explicit price is set.
- Bag-equivalent conversion: 40kg = 40/70 of a bag, so totals and charts stay consistent.
- 40kg appears as its own column in every unit-column table (shop inventory, factory stock, admin inventory editor, pivots).

## 2. Everything in UPPERCASE
- Product names and customer names are stored and displayed in uppercase.
- Typing in any product or customer field converts to uppercase as you type; dropdowns show uppercase.
- Existing records are converted once (products, customers, sales, debts, prepayments, inventory, factory stock, deliveries, trips, returns) so "Pig Grower" and "PIG GROWER" become one entry.
- Matching stays case-insensitive so nothing splits into duplicates during the switch.

## 3. Numbers: always 2 decimals, never negative
- All quantities and money values display rounded to 2 decimal places.
- Values are saved rounded to 2dp, so no long trailing decimals build up.
- Negative entry is blocked in every quantity/amount field (UI + database).
- Logistics cannot dispatch more than the factory pool holds: dispatching a delivery note checks each line against current factory stock and blocks/flags the shortfall.
- Sellers cannot sell more than their shop holds (HQ checks the shared factory pool); the sale is blocked with a clear "only X available" message.

## 4. Table Management (Database Management) UI/UX
- Cleaner layout: sticky headers, clearer section cards, compact rows, obvious edit/save/cancel states, better mobile scrolling.
- Inventory editing switches to the shop view layout: **products as rows, units as columns** (bags/70kg, 50kg, 40kg, 20kg, 10kg, 5kg, kg), with the same category filter and product search shops use.
- Edit a cell to change the quantity for that product/unit; blank means no record for that unit.
- Shop selector and category filter sit above the table.

## 5. Category filter on factory screens
- Factory Stock: category filter for both logistics and admin views.
- Factory intake — weekly: same category dropdown plus product search.

## 6. Admin can edit everything
Admin gets edit + delete (with confirm and audit log) on:
- Production intake records ("received from production")
- Factory stock rows and factory movements
- Sales transactions and their line items (product, unit, quantity, price, payment method, date, customer)
- Debt payments, prepayments and prepaid applications
- Delivery notes / items, trips and returns
Every change writes an audit entry (who, when, before/after). Non-admin roles stay as they are.

## Technical notes
- `src/lib/units.ts`: add `40kg` to `CANONICAL_UNITS`, `PIVOT_UNITS`, `KG_PER_UNIT_KEY`, `toBagEquivalent`, `toKg`, and the derive-from-per-kg branch of `getEffectiveUnitPrice`.
- New helpers: `upper(s)` for name normalisation and `round2(n)` in `src/lib/utils.ts`; applied at every write path and in `formatBags`/money formatters.
- Uppercase backfill runs as a data migration (UPDATE statements on product/customer columns across the tables listed above); `canonical_customer_name`/`normalize_customer_name` stay in place for merge safety.
- Stock guards: reuse the existing case-insensitive stock lookup in `SalesTab` for the seller path and add the same check in `DeliveryNoteManager` dispatch (against `factory_inventory`), plus DB-level non-negative triggers already present.
- `AdminTableEditor.tsx`: inventory tab rebuilt as a pivot grid reusing the category map and unit columns from `InventoryTab.tsx`; new admin tabs/edit affordances for `factory_intake_log`, `factory_inventory`, `delivery_notes`/`delivery_note_items`, `trips`, `shop_returns`, wired through `logAudit`.
- `ProductionIntakeWeekly.tsx` gains the `product_categories` / `product_category_items` filter used elsewhere.
