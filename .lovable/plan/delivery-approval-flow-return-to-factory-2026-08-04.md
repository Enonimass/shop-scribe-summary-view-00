# Delivery approval flow + Return to Factory

## Part 1 — New delivery flow (dispatch → shop approves/rejects)

Today a delivery note created by logistics is auto-marked confirmed and pushed straight into shop inventory, so the shop never gets a say. New flow:

```text
Logistics creates note (draft)
        |
   Dispatch  -> status: dispatched   (no inventory change)
        |
   Shop reviews the note
        |-- Approve  -> status: approved -> items added to shop inventory
        |-- Reject (with reason) -> status: rejected
                  |
             Logistics edits products/quantities -> re-dispatch -> shop reviews again
```

Details:
- Logistics: create note, then a "Dispatch" action. Notes in `rejected` become editable (products, quantities, units) and can be re-dispatched.
- Shop (seller): sees incoming dispatched notes with Approve / Reject buttons. Reject requires a reason, shown to logistics.
- Inventory is only credited on approval, exactly once. Factory stock is deducted on dispatch so goods in transit are not double-counted.
- Full history retained per note: who dispatched, who approved/rejected, when, rejection reason, edit trail in the audit log.

## Part 2 — Return to Factory

A shop can return goods to the factory:
- Shop enters product (from the product list only), quantity, unit, date and a reason for the return.
- On submission the quantity leaves the shop inventory and is added to factory stock.
- A permanent "Returns" record is kept, visible to the shop (its own returns), logistics/factory and admin, filterable by shop, product and date range.
- Optional next step (not required for v1): require logistics to confirm receipt before factory stock increases.

## Technical notes

- `delivery_notes`: add `dispatched_at`, `dispatched_by`, `rejected_at`, `rejected_by`, `rejection_reason`; statuses become `draft | dispatched | approved | rejected`. Existing rows map to `approved`.
- New table `shop_returns` (shop_id, product, unit, quantity, reason, return_date, created_by, status) with grants + RLS, plus a returns log view in the UI.
- Files: `src/components/logistics/DeliveryNoteManager.tsx` (dispatch, edit-on-reject), a new `ShopReturns.tsx` used by seller/logistics/admin dashboards, tab wiring in `SellerDashboard.tsx`, `LogisticsDashboard.tsx`, `AdminDashboard.tsx`, and factory stock adjustments alongside `factory_inventory`.

## Scope vs. remaining credits

This is doable but touches a migration plus several components. Suggested order so value lands even if credits run low:
1. Return to Factory (self-contained table + one screen) — smallest, highest standalone value.
2. Dispatch + shop approve/reject with inventory on approval.
3. Reject → logistics edit → re-dispatch loop and PDF/status polish.

Steps 1 and 2 are the core; step 3 can follow later without rework.
