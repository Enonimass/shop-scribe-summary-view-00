# Prepayments + Full Admin Payment Editing + Customer Accounts

## 1. Prepayments (customer pays now, collects goods later)

- New **Prepayment** form available to sellers and admin (next to Record Debt Payment): customer, amount, payment method, date, notes.
- Recording one prints/downloads a prepayment receipt (same A4 / 80mm thermal choice as other receipts, with logo).
- The money counts as **income on the day it was received** (it appears in Money-in, daily report and accountant reports), and at the same time shows as an **outstanding prepaid balance** the shop still owes in goods.
- **Auto-apply at sale:** when a sale is recorded for a customer who has a prepaid balance, the sale form shows "Prepaid balance available: KES X" and settles the sale from that balance automatically (partial if the balance is smaller — the remainder is paid normally or taken on credit). Applying a balance does not create new income, so nothing is counted twice.
- Prepaid balances show in the debtors area as a separate "Prepaid (we owe goods)" section, and in shop/admin/accountant summaries as a total.

## 2. Admin can edit everything about payments

- Debt Records tab in Database Management becomes fully editable for admin: customer, shop, amount, date, payment method, linked sale, notes — plus delete with confirm.
- Prepayments and their applications are editable/deletable the same way, with guards so an applied amount can't exceed what was received.
- Every payment edit/delete writes an audit entry (who, when, before/after), visible in the existing audit trail.
- Sellers/accountants stay read-only on payments and use the change-request flow.

## 3. Customer accounts (statement view)

The customer detail dialog gains an **Account** section that reads like a ledger:

```text
Date        Type            Ref        Charge     Payment    Balance
12 Jul      Sale (credit)   #a1b2       12,000          -     12,000
15 Jul      Payment         MPESA           -      5,000      7,000
20 Jul      Prepayment      CASH            -     10,000     -3,000  (prepaid)
22 Jul      Sale applied    #c3d4        3,000          -          0
```

- Running balance: positive = customer owes, negative = we hold prepaid funds.
- Summary cards: total purchases, total paid, outstanding debt, prepaid balance.
- Existing purchase-history and credit-analysis sections stay; sorted newest-last so the balance reads down the page.
- The same account view is reachable from the debtors list for admin and accountant.

## Technical notes

- **Schema:** two new tables — `customer_prepayments` (shop_id, customer_name, amount, payment_method, payment_date, recorded_by, notes) and `prepayment_applications` (prepayment_id, transaction_id, amount). Both get GRANTs, RLS in line with the current public-access posture of `debt_payments`/`sales_transactions`, and `updated_at` triggers. Prepaid balance = sum(prepayments) - sum(applications); a trigger blocks over-application and negative amounts.
- Financial aggregation helpers (`DailyReport`, `AdminOverview`, `AccountantReports`, `SellerSummary`) add prepayments to money-in by `payment_date` and exclude applications, so revenue/money-in stay reconciled.
- New `src/components/money/PrepaymentForm.tsx`; sale-recording path in `SalesTab.tsx` gains prepaid lookup + auto-allocation on insert; `AdminTableEditor.tsx` Debt Records tab gets inline edit/delete with `logAudit`; `CustomerDetailDialog.tsx` gains the ledger builder; receipt template added to `src/lib/receipts.ts`.
- Customer name matching uses the existing case-insensitive canonicalisation, so prepayments merge with sales for the same person.
