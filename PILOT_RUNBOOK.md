# Pilot Runbook — Day-0 to Daily Operations

## 1) Day-0 setup
1. Configure `.env` and database connectivity.
2. Run migrations: `pnpm drizzle-kit migrate`.
3. Run seeds:
   - `node scripts/seed-locations.mjs`
   - `node scripts/seed-medivision.mjs`
4. Validate app health: `pnpm run check && pnpm test && pnpm run build`.

## 2) Opening store
- Login with staff/admin account.
- Verify pharmacist on-duty, service active, and stock availability.
- Open command center, check pending queues and SLA cards.

## 3) Purchase inwarding
- Navigate to Admin Purchase / Pharmacy Purchase.
- Enter supplier invoice or import source data.
- Validate batch, quantity, MRP, expiry before commit.

## 4) OCR inwarding
- Upload invoice image/PDF in OCR ingestion.
- Resolve low-confidence line items.
- Approve and commit inwarding only after pharmacist/manager verification where needed.

## 5) Counter sale
- Use admin sales/counter module.
- OTC can proceed directly; Rx/H/H1 requires prescription flow and role checks.

## 6) Rx approval
- Pharmacist opens prescription queue.
- Approve/reject with notes.
- Ensure order status advances only after pharmacist action.

## 7) H1 sale
- Verify prescription validity and mandatory H1 controls.
- Dispense with pharmacist gate and complete audit trail.

## 8) Delivery handoff
- Assign rider from delivery module.
- Confirm pickup, out-for-delivery, and POD states.

## 9) Shift closing
- Run shift closing report.
- Match orders, payments, and handoff statuses.

## 10) Daily reconciliation
- Review sales, payments, stock movements, and near-expiry dashboards.
- Investigate exceptions before day close.

## 11) Stock/payment mismatch handling
- Freeze affected transaction path.
- Compare order ledger, stock movement ledger, and payment record.
- Correct via stock adjustment/payment exception with reason logging.

## 12) Emergency fallback
- If app degradation: pause new RX/H1 fulfilment, switch to supervised manual capture.
- Continue only pharmacist-approved dispensing.
- Backfill system records post-incident with explicit audit notes.
