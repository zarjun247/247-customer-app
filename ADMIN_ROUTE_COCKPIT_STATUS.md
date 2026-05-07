# Admin Route Cockpit Status

## Branch / baseline
- Branch: `feat/p20-17-admin-route-cockpit`
- Baseline inspected: current local `work` branch at merged PR #51 commit (`ff19315`). Remote `origin` is not configured in this container, so `git fetch origin main` could not be performed.

## Implementation checklist
- [x] Audit current `/admin` route declarations in `client/src/App.tsx`.
- [x] Move admin route declarations into a focused route config/helper.
- [x] Centralize frontend role constants for route guards.
- [x] Ensure all `/admin` routes are wrapped in `RestrictedRoute`.
- [x] Correct `/admin/masters/customers` to a customer page.
- [x] Add cockpit-level risk dashboard foundation with safe fallback states.
- [x] Add guard tests for route protection, route coverage, customer mapping, and cockpit fallback copy.

## Admin routes audited
Audited these admin route groups and paths:
- Admin entry/cockpit: `/admin`, `/admin/command-center`
- Orders/Rx/sales: `/admin/orders`, `/admin/prescriptions`, `/admin/sales`, `/admin/sales/counter`
- Purchase: `/admin/purchase`, `/admin/purchase/invoices`, `/admin/purchase/returns`, `/admin/purchase/payments`, `/admin/purchase/reports`
- Inventory: `/admin/inventory`, `/admin/inventory/current-stock`, `/admin/inventory/batchwise`, `/admin/inventory/near-expiry`, `/admin/inventory/movements`, `/admin/inventory/adjustments`, `/admin/inventory/audit`
- Customers/refills/communications: `/admin/customers`, `/admin/customers/medicine-records`, `/admin/refills`, `/admin/whatsapp`
- Reports: `/admin/reports`, `/admin/reports/daily-sales`, `/admin/reports/stock`, `/admin/reports/expiry`, `/admin/reports/purchase`, `/admin/reports/h1`, `/admin/reports/gst`, `/admin/reports/sla`
- Masters: `/admin/masters`, `/admin/masters/suppliers`, `/admin/masters/manufacturers`, `/admin/masters/categories`, `/admin/masters/generics`, `/admin/masters/schedules`, `/admin/masters/discount-categories`, `/admin/masters/discounts`, `/admin/masters/doctors`, `/admin/masters/patient-categories`, `/admin/masters/customers`, `/admin/masters/staff`, `/admin/masters/stores`, `/admin/masters/buildings`, `/admin/masters/printers`, `/admin/masters/products`
- Settings/accounting/utilities: `/admin/settings`, `/admin/accounting`, `/admin/accounting/shift`, `/admin/accounting/gst-export`, `/admin/accounting/tally`, `/admin/utilities`
- Delivery/OCR/imports: `/admin/riders`, `/admin/delivery`, `/admin/ocr`, `/admin/master-data`, `/admin/shift`, `/admin/expiry`, `/admin/sla`, `/admin/barcodes`, `/admin/gst-export`, `/admin/medivision`, `/admin/imports/medivision`

## Routes fixed
- Moved admin route declarations into `client/src/routes/adminRoutes.tsx`; every configured admin route is rendered through the shared `RestrictedRoute` wrapper with `ADMIN_ROLES`.
- Fixed previously direct, unguarded admin routes:
  - `/admin/purchase*`
  - `/admin/inventory*`
  - `/admin/customers/medicine-records`
- Kept route paths and existing page components unchanged except for the customer master correction below.

## Customer master mapping status
- `/admin/masters/customers` now maps to `AdminCustomers` from `client/src/pages/AdminCustomers.tsx`.
- `/admin/masters/patient-categories` remains mapped to `AdminPatientCategories`.
- The customer master route no longer points to the patient category master page.

## Cockpit cards added/wired
Added a cockpit-level risk foundation row to the existing Admin Command Center:
- Stock risk: wired to the existing command center stockout snapshot field.
- Near-expiry risk: wired to the existing near-expiry snapshot field.
- Pending Rx/H1/regulatory review: wired to the existing pharmacist queue snapshot field.
- Payment/refund risk: safe `Not wired` card; no backend accounting/refund logic was touched.
- SLA breach risk: wired to existing SLA risk snapshot fields.
- Supplier outstanding: safe `Not wired` card; no backend supplier ledger/accounting logic was touched.
- Failed notifications/provider failures: wired to existing critical command center recent events query as a conservative proxy for surfaced critical events.

## Remaining UI risks
- Payment/refund risk and supplier outstanding need approved backend read-only summary endpoints before live metrics can be displayed.
- Provider failure card currently uses existing critical command-center events; a dedicated notification/provider health endpoint would improve specificity.
- The cockpit row intentionally avoids synthetic values; unavailable data displays safe fallback states.

## Validation results
- `pnpm install`: passed; lockfile was already up to date. pnpm emitted the existing ignored build scripts warning for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check`: passed.
- `pnpm test -- --runInBand`: passed (`55` files, `210` tests).
- `pnpm run build`: passed. Vite emitted existing environment/chunk-size warnings for analytics placeholders and bundle size.

## Files changed
- `client/src/App.tsx`
- `client/src/routes/adminRoutes.tsx`
- `client/src/routes/roleGuards.ts`
- `client/src/pages/admin/AdminCommandCenter.tsx`
- `server/admin-route-cockpit.guard.test.ts`
- `ADMIN_ROUTE_COCKPIT_STATUS.md`

## Migrations
- None.
