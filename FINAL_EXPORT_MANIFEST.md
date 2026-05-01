# Final Export Manifest (Pilot RC)

## Key modules
- Customer app (catalog/cart/orders/Rx/profile/refills)
- Pharmacy operations (purchase/OCR/inventory/expiry/barcode/GST)
- Admin operations (command center/orders/prescriptions/sales/delivery/masters/reports)
- Routing + SLA + event/audit support

## Key routes
- Customer: `/catalog`, `/cart`, `/orders`, `/rx-upload`, `/profile`
- Staff: `/workbench`, `/pharmacy/*`
- Admin: `/admin/*`
- Fallback: `/404` and catch-all NotFound

## Key reports
- Daily sales, stock, expiry, purchase, GST, SLA dashboards/reports

## Key env vars
- `DATABASE_URL`
- Payment provider secrets (as configured in deployment)
- OTP/auth provider vars
- Analytics vars: `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID`

## Key migration files
- Core schema: `drizzle/0000_*` through `drizzle/0021_*`
- Store capabilities creation: `drizzle/0020_tearful_selene.sql`
- **GSTIN on store capabilities:** `drizzle/0022_store_capabilities_gstin.sql`

## Remaining non-blocking gaps
- Chunk size optimization pending (build warning only).
- Analytics env vars optional in non-analytics pilot environments.
- Optional consolidated one-command pilot seed script can still be added later.
