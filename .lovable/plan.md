# Trips, Factory Stock, Dashboards, Editable Sale Product

## 1. Factory inventory
- New table `factory_inventory (product, unit, quantity, threshold)`, unique per (product, unit).
- Managed via a new "Factory" tab in Admin and Super Admin dashboards: receive stock, adjust, view low-stock.
- Every outbound trip deducts factory stock; every confirmed return increases it.

## 2. Trips (one big delivery, many stops)
A trip is the truck leaving the factory. It contains many stops; each stop is either an outlet (shop) or a customer.

New tables:
- `trips (trip_no, trip_date, vehicle, driver, status: draft/dispatched/completed/cancelled, notes)`
- `trip_stops (trip_id, stop_type: outlet|customer, shop_id, customer_name, place, status: pending/confirmed, dispatched_qty_total, received_qty_total, notes)`
- `trip_stop_items (stop_id, product, unit, dispatched_qty, received_qty, discrepancy_qty)` — `discrepancy = received - dispatched`
- `trip_returns (trip_id, product, unit, quantity, reason, status: pending/confirmed)` — goods coming back to factory (not a sale)

Workflow:
1. Admin/logistics creates a trip, adds stops (outlets and/or customers), adds items per stop.
2. Dispatch: factory inventory is deducted by total dispatched quantities. Trip status = dispatched.
3. At each stop, recipient confirms received quantity (may differ from dispatched).
   - Outlet stop confirmed: shop inventory increases by `received_qty`. Discrepancy stored in `trip_stop_items.discrepancy_qty` and surfaced in dashboards/audit log. No auto-return is created.
   - Customer stop confirmed: nothing is auto-created; stop is just marked confirmed and tagged to that shop. The shop seller records the sale later in the normal Sales tab (it does not affect inventory because the goods never reached the shop's stock).
4. Returns: any unsold/unaccepted goods are recorded as `trip_returns`; when confirmed they add back to factory inventory. Returns are never sales.
5. Trip completes once all stops + returns are confirmed (or admin force-completes).

PDF: extend the existing delivery-note PDF (Kimp Feeds logo + per-unit totals) so each trip can print:
- A trip summary sheet listing all stops.
- A per-stop delivery note for outlet/customer.

## 3. Admin dashboard
Add a new "Overview" tab as the first tab of `AdminDashboard`. Same KPI set as the super admin dashboard but scoped to the currently selected shop (or All Shops aggregate), plus delivery metrics:
- Bags sold, tonnage, revenue, cash in, credit issued, debt outstanding, debt paid.
- New customers (30d), active customers (90d), top debtors, low stock list.
- Deliveries inbound (received from factory), customer deliveries pending sale, returns.
- Date range with Today / This month shortcuts.

## 4. Seller dashboard
Add a "Summary" tab (first tab) showing today + this month at-a-glance for the seller's shop:
- Today: bags sold, tonnage, cash collected, debts taken, debts paid, low-stock count.
- This month: same metrics + new vs returning customers, top 5 products.
- Deliveries inbound waiting confirmation (outlet stops assigned to this shop).
- "Customer deliveries waiting to be billed" list (customer stops tagged to this shop that haven't been turned into a sale yet) — seller can click to pre-fill a new sale.

## 5. Editable product in admin sales
In `AdminTableEditor` (and the admin Sales view), make the product field on each sale line editable via the existing inline-edit pattern (autocomplete from products list). Save updates `sales_items.product`; logAudit on change.

## 6. Audit
`logAudit` calls for: trip create/dispatch/cancel, stop confirm with discrepancy, return confirm, factory adjust, sale product change.

## Technical details
- Migration creates the five new tables with permissive RLS matching existing pattern (super admin still gets audit visibility via existing audit_logs).
- New components:
  - `src/components/logistics/TripManager.tsx` — list/create/dispatch trips with stops + returns editor.
  - `src/components/factory/FactoryInventory.tsx` — factory stock CRUD + low-stock.
  - `src/components/admin/AdminOverview.tsx` and `src/components/seller/SellerSummary.tsx` — KPI tabs.
- Existing `DeliveryNoteManager` stays; trips are an additional, broader concept. (Long-term we can fold delivery notes into stops, but not in this pass.)
- Reuse `toBagEquivalent` and the chunked-fetch pattern.
- Routes unchanged; everything is tabs inside existing dashboards.

## Out of scope (for this round)
- Auto-creating sales from customer stops (you chose to keep it manual).
- Migrating existing `delivery_notes` data into trips.
- Tightening RLS on the new tables beyond the permissive default.
