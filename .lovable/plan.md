## 1. Trip + Delivery Notes coupling

Goal: a trip and its delivery notes are one document. Generating a trip PDF produces a single file containing the trip summary page followed by one delivery-note page per stop with that stop's products and quantities.

Changes
- `src/components/logistics/TripManager.tsx`
  - Replace the current "Trip Summary PDF" + separate per-stop DN export with a single action: "Print Trip + Delivery Notes (PDF)".
  - PDF layout:
    1. Page 1 — Trip header: Kimp Feeds logo, Trip No, Date, Driver, Vehicle, Status, totals (bags-equivalent and tonnage), plus a table listing every stop (outlet/customer, place, line count, totals per unit).
    2. One page per stop — header reads "Delivery Note — {Trip No}/{Stop #}" with destination, place, date, then a product/quantity/unit table and a per-unit summary row ("10 Bags, 5 × 50kg"). Signature blocks for driver and receiver.
    3. Final page (only if returns exist) — Returns to factory table.
  - Keep existing dispatch/confirm/return logic untouched.
- `src/components/logistics/DeliveryNoteManager.tsx` — leave the legacy standalone DN flow as-is for now; mark its section heading as "Standalone delivery notes (legacy)" so users default to trips.

No DB changes.

## 2. Purchasing Power tier summary (Customer Analytics)

Tier definition (per customer, within the selected scope, measured in 70kg bag-equivalents via `toBagEquivalent`):
- `≥100`     → "≥100"
- `10–99`    → "10-99"
- `1–9`      → "1-9"
- `<1`       → "<1"   (fractional / less than one bag)

Two linked tables, matching the user's screenshots:

A. Number of customers per purchasing category (count)
```
OUTLET     ≥100   10-99   1-9    <1    TOTAL
HQ           2      21    101    18     142
…
T.Count      3      33    351    60     447
```

B. Quantity per purchasing category (sum of bag-equivalents, 2 dp)
```
OUTLET     ≥100    10-99    1-9      <1     TOTAL
HQ         450.00  489.00   259.57   9.64   1,208.21
…
T.Quantity 561.57  655.00   700.14   33.07  1,949.79
```

Above the tables: two compact strips showing column %:
- Customer % (count share per tier)
- Quantity % (bag-equivalent share per tier)
And a "GRAND TOTAL" line under each table (total customers / total bag-equivalents).

Scope controls
- Period toggle: "All time" ↔ "Selected range" (date pickers). Default = current month.
- A shop filter is already present in Customer Analytics — it still applies (selecting one shop collapses the table to that single outlet row).

Where it appears
- `src/components/CustomerAnalytics.tsx` — new section "Purchasing Power" inserted at the top, above the existing customer list. Sellers see only their shop's row; admin/super-admin see all shop rows plus totals.
- `src/components/admin/AdminOverview.tsx` — add the same two-table block in a new "Purchasing Power" card so admin sees it at a glance on the main dashboard.

Computation notes (in-memory after fetching `sales_items` + `sales_transactions` chunked at 200 IDs, per existing pattern):
1. For each customer × shop, sum `toBagEquivalent(quantity, unit)` across the filtered transactions.
2. Bucket each (customer, shop) total into one of the four tiers.
3. Aggregate counts and quantity sums per (shop, tier) for table A and B.
4. Compute row totals, column totals, grand totals, and the two percentage strips.

Exports
- Add "Export CSV" and "Export PDF" buttons next to the Purchasing Power section, reusing `jspdf`/`xlsx` helpers already in the project.

## 3. Technical details

- No new tables. No migrations.
- Reuse `src/lib/units.ts::toBagEquivalent` for all conversions (50kg → 5/7, kg → 1/70, etc.).
- Reuse the 200-ID chunking pattern already used in `AdminDashboard.tsx` to fetch full history when "All time" is selected.
- Numbers formatted with `Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`; zero quantities render as `-` to match the screenshots.
- PDF generation reuses the existing `jspdf` + `jspdf-autotable` setup; the trip PDF is built as one `jsPDF` instance with `doc.addPage()` between sections.

## 4. Out of scope (not touched)
- Trip dispatch / inventory / returns logic.
- Customer segmentation lifecycle (New/Active/Inactive/Dormant) — separate from purchasing tiers.
- Pricing, payment methods, debts.
