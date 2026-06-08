## Goal

1. Make every sales-transaction field editable from the admin sales editor — including payment method, amount paid, totals, due date, plus item unit price (currently only product name, quantity, unit, customer, date, shop, and sale type are editable).
2. In the bulk Excel/CSV upload, validate every product name against the shop's known product list. Rows with unknown products are flagged; the user must pick the correct product from a dropdown of known products before they can upload (no free-text typing).

## Changes

### 1. `src/components/AdminTableEditor.tsx` — full edit of transactions

Add these fields to the per-row inline editor for `sales_transactions`:

- Payment method — `Select` populated from `payment_methods` table (active only). Updates both `payment_method_id` and `payment_method_name`, and sets `is_credit` from the chosen method's `kind`.
- Total amount — numeric input (`total_amount`).
- Amount paid — numeric input (`amount_paid`).
- Due date — date input (`due_date`), only shown when the chosen method is credit.

Extend `startEditingTransaction` and `saveTransactionEdit` to round-trip these columns. Keep the existing audit logging pattern; add an audit entry when payment method changes.

Add per-item unit price editing in the same row block:

- New numeric input for `unit_price` in the items sub-table.
- `saveTransactionEdit` writes `unit_price` alongside `product`, `quantity`, `unit`. `line_total` is derived in the DB — leave it untouched here.

No schema changes. The columns already exist (`payment_method_id`, `payment_method_name`, `is_credit`, `total_amount`, `amount_paid`, `due_date`, `unit_price`).

### 2. `src/components/BulkSalesUpload.tsx` — product-name validation against known list

Behavior:

1. On dialog open, fetch the shop's known products in one query: `inventory.product` for the current `shopId`, lowercased into a `Set`. Also keep a sorted display list for the dropdown.
2. After parsing the file, each row keeps its existing checks plus a new check: `productKnown = knownProducts.has(resolvedProduct.toLowerCase())`. If not known, mark the row invalid with error "Unknown product — pick from list".
3. In the preview table, replace the static "Product" cell with:
   - Known product → plain text (as today).
   - Unknown product → `Select` dropdown listing known products, plus the original raw value shown above it (e.g. "From file: <raw>"). Selecting a product updates that row's `product` and clears the error.
4. Disable the "Import" button while any row has `valid === false` due to an unknown product. (Other invalid reasons — missing date / customer / qty — keep current behaviour: those rows are simply skipped.)
5. Keep `PRODUCT_ALIASES` resolution as the first pass; only rows still unresolved after alias lookup require the dropdown.

No backend changes; everything is client-side using the existing `inventory` query.

### 3. UX polish

- Show a small legend above the preview table: green badge "OK", red badge "Unknown product — choose from list", grey badge "Skipped (missing field)".
- Toast on import completion already exists; extend the message to include how many product names were corrected via dropdown.

## Out of scope

- No changes to the seller-facing `SalesTab` create flow.
- No changes to RLS, edge functions, or schema.
- No changes to the existing alias map (still applied before validation).
