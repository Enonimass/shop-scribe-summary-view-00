# Shared HQ/factory stock, logistics write-only, quantity rules

## 1. HQ/Kiambu shares the factory pool
- The HQ (`kiambu_shop`) seller account's Inventory tab shows the **shared factory stock** instead of its own separate rows: same products, units, quantities and low-stock flags the factory sees.
- Stock only enters this pool through "Receive from production". It leaves in two ways: a sale recorded on the HQ shop account, or a delivery dispatched to another shop/customer.
- HQ cannot add stock manually; the add/edit controls are removed from that shop's inventory screen.

## 2. Factory stock: show what caused each movement
On the Factory Stock page, a movement log per product/unit built from data already in the system:

```text
Date     Product      Unit   In    Out   Source
05 Aug   High Yield   bags   40    -     Production intake
05 Aug   High Yield   bags   -     6     Sale - HQ shop (Moses Martin)
05 Aug   High Yield   bags   -     20    Delivery - Ruiru shop (DN-014)
04 Aug   Kienyeji     kg     15    -     Return from Thika shop
```

Filterable by date range, product and category, so any drop in factory stock is traceable to a sale or a delivery.

## 3. Logistics is write-only
Logistics can create records but never modify or delete them:
- Factory stock: only "Receive from production". Add/Edit/Delete rows removed.
- Delivery notes: create and dispatch only. Correcting a rejected note becomes an admin action; logistics raises a Change Request instead.
- Trips, returns and any other logistics screens: edit/delete actions hidden for that role.

Admin keeps full edit rights, with audit logging unchanged.

## 4. Returns
Confirm and keep the rule: a return deducts from the shop's inventory and adds the same quantity to factory stock, with a permanent record. For the HQ shop the "Return to factory" action is hidden, since it already shares the factory pool.

## 5. Quantity entry rules
- All quantity and amount fields become plain manual-entry boxes: the up/down stepper arrows are removed everywhere (inventory, factory stock, production intake, sales, deliveries, trips, returns, debts, prices).
- Negative values are rejected in the UI and blocked in the database: stock records cannot go below 0.
- A transaction line may be left empty (no quantity yet), but once a number is entered it must be 0 or more.

## 6. Category filter on Factory Stock
Add the same category dropdown used on shop inventory to the Factory Stock table (plus a product search), so long product lists are easy to navigate on mobile.

## Technical notes
- HQ inventory: `InventoryTab` gains a shared-pool mode reading `factory_inventory` when `shopId === 'kiambu_shop'`; the existing `mirror_kiambu_sale_to_factory` trigger stays as the deduction path for HQ sales.
- Movement log derived client-side from `factory_intake_log` (in), `sales_items` joined to `sales_transactions` where `shop_id = 'kiambu_shop'` (out - sale), dispatched `delivery_note_items` (out - delivery) and `shop_returns` (in - return). No new table.
- Role gating via `profile.role !== 'logistics'` around edit/delete controls in `FactoryInventory.tsx`, `DeliveryNoteManager.tsx`, `TripManager.tsx`, `ShopReturns.tsx`.
- Number inputs: keep `type="number"` but hide the spinners (`[appearance:textfield]`, no inner spin buttons) with `inputMode="decimal"` and `min={0}`; plus one migration adding non-negative validation triggers on `inventory`, `factory_inventory`, `sales_items`, `shop_returns`, `trip_stop_items`, `delivery_note_items`, `factory_intake_log`.
- Factory category filter reuses the `product_categories` / `product_category_items` mapping already loaded in `InventoryTab`.