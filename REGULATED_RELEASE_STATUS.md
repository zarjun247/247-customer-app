# REGULATED_RELEASE_STATUS

- H1 sale reference type verification: `sales.id` is UUID/text while `h1_register.saleId` is numeric, so H1 entries now use numeric sale-line reference (`sale_lines.id`) and preserve source sale UUID in audit payload; no `saleId=0` fallback is used.
- Product schedule source: `products.schedule` + `products.requiresPrescription`.
- H/H1/X determination logic: `server/services/complianceGate.ts#getProductScheduleFlags`.
- H1 register behavior: fail-closed on missing pharmacist/product/sale context; actual medicine name written to `drugName`.
- Delivery runtime gate: `deliveryRouter` now enforces regulated release checks before `outForDelivery`, `deliverWithOtp`, and `deliverWithPhoto` with allow/block audit events.
- WhatsApp runtime gate: regulated cart confirm path escalates to human/pharmacist and blocks auto order confirmation; audited as `whatsapp.regulated_escalated`.
- Refill runtime gate: regulated reorder prompt remains draft-only (`autoConfirmedSale: false`), emits `refill.regulated_review_required`, and sets `requiresPharmacistReview`.
- Tests/guards added: `delivery-regulated.guard.test.ts`, `whatsapp-refill-vault.guard.test.ts`, plus prior H1/regulated guards.
- Remaining gaps: dedicated shared regulatedRelease service extraction and deeper DB-joined delivery→sale H1 verification.
- Validation: see `pnpm run check`, `pnpm test -- --runInBand`, `pnpm run build`.
- Next recommended prompt: `feat/payment-gateway-refund-reconciliation`.
