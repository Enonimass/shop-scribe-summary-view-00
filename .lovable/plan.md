## Goals

1. Cross-shop fulfillment on sales — sale recorded at Shop A, but inventory deducted at fulfilling Shop B.
2. Printable PDF delivery notes (with Kimp Feeds logo).
3. Delivery note shows total bags per unit (summary line).

---

## 1. Cross-shop fulfillment

**DB change** (`sales_transactions`):
- Add `fulfilled_by_shop_id text` (nullable; defaults to NULL = same as `shop_id`).
- Add `fulfilled_by_shop_name text` for display.

**Sales form (`SalesTab.tsx`)**:
- Add a "Fulfilled at" shop selector inside the new-sale dialog, defaulting to the current shop. Loaded from the same shop list used elsewhere.
- A small note below: *"Choose another shop only if the customer collects the goods from there."*
- On save:
  - Insert the transaction with `shop_id` = current shop (sale credit) and `fulfilled_by_shop_id` = chosen shop.
  - **Stock validation** runs against the fulfilling shop's inventory.
  - **Inventory deduction** happens on the fulfilling shop, not the selling shop.

**Reporting impact**:
- Sales totals / money report continue to attribute the sale to `shop_id` (selling shop) — no change.
- Inventory views automatically reflect the deduction at the fulfilling shop.
- Daily report adds a small badge "Fulfilled by: Shop B" on transactions where `fulfilled_by_shop_id` differs.
- Optional: a simple "Cross-shop transfers" line in the daily report listing such sales.

---

## 2. Printable PDF delivery note

**Library**: `jspdf` + `jspdf-autotable` (already in the project per existing exports).

In `DeliveryNoteManager.tsx` detail dialog, add a **"Print PDF"** button.

PDF layout:
- Header: Kimp Feeds logo (top-left, from `@/assets/kimp-feeds-logo.jpeg` embedded as base64) + company name + "DELIVERY NOTE" title.
- Meta block: DN No, Date, Shop, Delivered by, Status.
- Items table: Product | Quantity | Unit.
- **Totals section** (per unit): e.g. *"Total: 25 bags, 10 × 50kg, 35 kg"* — sum quantities grouped by unit.
- Footer: signature lines for "Delivered By" and "Received By" + timestamp.
- File name: `DeliveryNote-{DN-No}.pdf`.

---

## 3. Delivery note totals per unit (in-app + PDF)

In the detail dialog (above the items table) and in the PDF, render a totals strip:
```
Totals  •  bags: 25  •  50kg: 10  •  kg: 35
```
Computed by grouping `delivery_note_items` by `unit` and summing `quantity`.

---

## Files to touch

- `supabase/migrations/...` — add `fulfilled_by_shop_id`, `fulfilled_by_shop_name` to `sales_transactions`.
- `src/components/SalesTab.tsx` — fulfilling shop selector, stock check + deduction against fulfilling shop, save fields.
- `src/components/logistics/DeliveryNoteManager.tsx` — totals-per-unit strip + Print PDF button + PDF generator.
- `src/components/money/DailyReport.tsx` — show "Fulfilled by" badge for cross-shop sales (small addition).

No changes to roles, auth, or existing reporting math.
