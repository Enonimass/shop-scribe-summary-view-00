# Super Admin + Company Dashboard

## Goal
Add a Super Admin role authenticated by email/password (Supabase Auth) with a company-wide dashboard covering sales, money, customers, and inventory across all shops. Existing admin/seller users keep their current username login.

## Auth & roles
- Enable Supabase Auth (email + password) for super admins only.
- New tables:
  - `app_role` enum: `super_admin`
  - `user_roles (user_id uuid, role app_role)` linked to `auth.users`
  - `has_role(user_id, role)` security-definer function
- Super admin signs in at `/super-admin/login` using email + password.
- A bootstrap edge function `create-super-admin` (callable once, guarded by a one-time setup token stored as a secret) creates the first super admin account. After that, additional super admins are invited from within the dashboard.
- Existing username-based login for admins/sellers stays unchanged.

## Super admin capabilities
- Company-wide dashboard across every shop
- Manage admin and seller accounts (create, edit, disable, reset password)
- Audit log of sensitive edits (sales edits/deletes, inventory adjustments, user edits, price overrides, find-and-replace runs)

## Audit log
- New table `audit_logs (actor, actor_role, action, entity, entity_id, shop_id, before jsonb, after jsonb, created_at)`
- Wire app code to write audit rows on: sales edit/delete, inventory manual adjust, user create/edit/disable, price override on sale, find-and-replace, debt payment edits.
- Super admin dashboard has an "Activity" tab with filters by actor, entity, shop, date.

## Company dashboard layout

```text
+--------------------------------------------------------------+
| Period: [Today] [This month] [Custom range]   Shop: [All v]  |
+--------------------------------------------------------------+
| KPI cards: Bags sold | Tonnage (kg) | Revenue | Cash in     |
|            Credit issued | Debt outstanding | Debt paid     |
|            New customers | Active customers | Low-stock     |
+--------------------------------------------------------------+
| Sales trend chart (per shop, stacked)                        |
| Top products (bags + tonnage)                                |
| Money mix by payment method (donut)                          |
+--------------------------------------------------------------+
| Per-shop table: bags | tonnage | revenue | cash | debt      |
| Top debtors | Top buyers | Low stock list                    |
| Recent sensitive activity (last 20 audit entries)            |
+--------------------------------------------------------------+
```

- Tonnage rule: bags = quantity * 70kg; raw materials use their unit weight (40kg or 50kg bags); reuse existing bag-equivalent helper.
- Defaults: Today + This month cards, plus date-range picker.
- All data scoped by selected shop filter (default: All shops).

## Admin dashboard (existing role)
- Add a summary header to the existing admin view showing the same KPIs but scoped to that admin's shop only: bags, tonnage, money received, credit issued, debt outstanding, low stock count, today vs month.

## Technical details
- Files to add:
  - `supabase/migrations/...` — `app_role` enum, `user_roles`, `has_role`, `audit_logs`, RLS (super admin via `has_role(auth.uid(),'super_admin')`)
  - `supabase/functions/create-super-admin/index.ts` — bootstrap
  - `src/pages/SuperAdminLogin.tsx`, `src/pages/SuperAdminDashboard.tsx`
  - `src/components/super-admin/KpiCards.tsx`, `SalesTrend.tsx`, `PaymentMix.tsx`, `PerShopTable.tsx`, `DebtorsList.tsx`, `LowStockList.tsx`, `AuditLog.tsx`, `UserManager.tsx`
  - `src/components/admin/AdminSummary.tsx`
  - `src/hooks/useSuperAdminAuth.ts`
  - `src/lib/audit.ts` — helper to write audit rows
- Routes: `/super-admin/login`, `/super-admin` (guarded by Supabase session + `super_admin` role).
- RLS: `audit_logs`, `user_roles` readable only when `has_role(auth.uid(),'super_admin')`. Existing tables stay permissive (no change to current app behavior).
- Reuse existing batching strategy (chunks of 200) when aggregating across all shops.
- Charts via existing `recharts` setup; KPI cards follow Kimp Feeds green theme.

## Out of scope
- Migrating existing admins/sellers to Supabase Auth
- Tightening RLS on the rest of the schema (tracked separately)
