## Goal

Add a new **executive** role with a fast, read-only dashboard. Executives log in and immediately see: how the company did last month vs this month (like-for-like same day-of-month cutoff), outstanding debts, top customers/products, and a monthly bags-sold bar chart filterable by shop and category.

## Access

- New `app_role` value: `executive`.
- New route `/` renders `ExecutiveDashboard` when `profile.role === 'executive'`.
- Executive can also access `/ai-insights` (add `'executive'` to the allowed roles).
- No write access anywhere. No inventory edits, no sales entry, no user management.

## Default period logic (like-for-like)

- If today is day `D` of the current month:
  - **Current** = 1st → today of this month.
  - **Prior** = 1st → same day `D` of last month (clamped to last month's length).
- User can override with the existing `PeriodPicker` (prior period auto-shifts to the same-length window immediately before).
- Every KPI, table row, and total shows the **prior value** and a **Δ %** chip (green up / red down).

## Sections (in order)

1. **KPI strip (current vs prior)** — Revenue, Money In (cash sales + debt payments), Credit issued, Outstanding debt (as of today, period-independent), Bags sold (70kg eq), Active customers, New customers.

2. **Sales by outlet** — table: rows = shops, columns = Bags (70kg eq), Revenue, Money In, Credit issued, Δ vs prior %. Totals row.

3. **Product sales** — table: rows = products, columns = Bags, Revenue, Δ %. Sorted by current revenue desc. Category filter applies here.

4. **Outstanding debts summary** — total outstanding, debtor count, aging buckets (0–30 / 31–60 / 61–90 / 90+ days since sale), top 10 debtors table. Reuses `DebtorsList` in a dialog for the full list.

5. **Top customers this period** — top 10 by revenue with Δ vs prior.

6. **Monthly bags bar chart** — last 12 months, bars = total bags (70kg eq). Two filters above the chart:
   - **Shop** dropdown (All + each shop).
   - **Category** dropdown (All + each product category; filters items to products in that category).
   Uses `recharts` `BarChart` already in the project.

7. **Link card** — button to `/ai-insights` for the AI narrative report.

## Technical details

**DB migration**
- `ALTER TYPE public.app_role ADD VALUE 'executive';` (guarded with `IF NOT EXISTS` via `DO` block).
- No new tables. No RLS changes needed — executive reads use existing tables whose policies already allow authenticated reads (verify via `supabase--read_query` on `sales_transactions`, `sales_items`, `customers`, `debt_payments`, `inventory`, `product_categories`, `product_category_items` policies before finalizing; if any policy is `admin`-only, extend it to `has_role(auth.uid(), 'executive')`).

**Frontend files**
- `src/components/ExecutiveDashboard.tsx` — new. Header (logo, shop selector reused pattern, logout), period picker with auto prior-period, all sections above.
- `src/components/executive/KpiCompareStrip.tsx` — small reusable comparison KPI card (value, prior, Δ %).
- `src/components/executive/OutletSalesTable.tsx` — outlet pivot.
- `src/components/executive/ProductSalesTable.tsx` — product pivot with category filter prop.
- `src/components/executive/MonthlyBagsChart.tsx` — 12-month bar chart with shop + category dropdowns.
- `src/components/executive/DebtAgingCard.tsx` — outstanding + aging buckets + top debtors.
- `src/pages/Index.tsx` — add `profile?.role === 'executive'` branch returning `<ExecutiveDashboard />`.
- `src/App.tsx` — add `'executive'` to the `/ai-insights` `RequireAuth roles` array.
- `src/components/UserManagement.tsx` — add `executive` to the role dropdown so admins can assign it.

**Data fetching**
- One `useEffect` triggered by `[selectedShop, period]`; runs current and prior queries in parallel (`Promise.all`).
- Chunk `sales_items` fetches by 200 transaction IDs (existing pattern in `AdminOverview.tsx`).
- Monthly chart pulls the last 12 months of `sales_transactions` + `sales_items` once, then aggregates client-side by shop and category.
- Category filter uses `product_categories` + `product_category_items` to build a `product → category` map.

**Units**
- All bag totals use `toBagEquivalent` from `@/lib/units` (70kg standard), matching existing dashboards.

## Out of scope

- No new writes, no editing, no bulk uploads.
- No changes to seller / accountant / admin / logistics dashboards.
- No new AI insights logic — just link to existing page.
- No changes to daily report, factory intake, or delivery flows.
