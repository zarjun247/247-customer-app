# COMPLIANCE POS MARGIN STATUS

## Canonical schema sources inspected
- `products.schedule` + `products.requiresPrescription`
- `prescriptions` workflow (`status`, `pharmacistId`, linked sale)
- `h1_register`
- `sales`, `sale_lines`, `counter_payments`
- `batch_ledger` (`purchaseRate`, `landingCost`)
- `discount_categories`, `product_margin_rules`, `product_locks`

## Implemented in this PR
- Added `server/services/complianceGate.ts` with server-truth schedule gates.
- Added `server/services/marginGuard.ts` with server-side cost-basis and sale margin assertion.
- Wired `salesRouter.confirmSale` to enforce:
  - `assertCanConfirmSale`
  - `assertNoLossWithoutApproval`
  - `createOrVerifyH1RegisterEntry`
- Added audits:
  - `compliance.sale_blocked`
  - `compliance.h1_register_created`
  - `compliance.sale_approved`
  - `margin.sale_blocked`
  - override request/approval events

## Rx/H/H1/X behavior
- Product compliance flags are fetched from `products` server-side.
- H/H1/X or prescription-required items cannot be confirmed without clearance.

## H1 register behavior
- On confirmation, H1 lines auto-create missing register entries in `h1_register`.
- Captures available fields: sale, bill, patient, qty, pharmacist, prescription ref, store.

## POS/counter gate behavior
- Counter confirmation route uses same server compliance + margin gate.

## Pick/pack/delivery
- Deferred: current sales lifecycle has `draft/confirmed/returned/cancelled` only.

## Discount behavior
- Added minimal `discount_codes` schema foundation in Drizzle and SQL migration `drizzle/0023_discount_codes.sql`.
- `marginGuard.validateDiscountCode` validates existence, active status, start/end windows, min-order, and usage limits.
- `marginGuard.applyDiscountCode` computes discount server-side (percentage/fixed), enforces max discount cap, and updates sale totals without consuming usage yet.
- `salesRouter.confirmSale` accepts optional `discountCode`, runs compliance + margin gates, and only then calls `recordDiscountCodeUsage` so blocked sales do not consume coupon usage.
- Audit events: rejected/invalid attempts use `discount.code_rejected`; successful post-gate consumption uses `discount.code_applied`.

## Margin/profit method
- Uses batch `landingCost`/`purchaseRate` if batch linked.
- Falls back to latest `product_supplier_mappings.lastPurchaseRate`.

## No-loss-without-approval
- Blocks below-threshold margin (default 8%) for non manager/admin roles.
- Manager roles can proceed; audit trail recorded.

## Tests/guards
- `server/compliance-gate.guard.test.ts`
- `server/margin-guard.guard.test.ts`

## Known limitations
- Store/customer/category/product-specific eligibility constraints are schema-supported (`appliesTo`/`appliesToId`) but only baseline validation is wired in this pass.
- No pick/pack/delivery state machine route in current sales router.

## Next recommended mega prompt
OCR Purchase Inwarding + Supplier Ledger + Accounting Basics.
