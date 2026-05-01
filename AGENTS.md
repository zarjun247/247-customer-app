# Codex Working Doctrine

Before major changes, always read:
- `docs/PRODUCT_NORTH_STAR.md`
- `docs/PHARMACY_OS_BLUEPRINT.md`

## Guardrails
- Preserve pharmacist-gated dispensing.
- Preserve one-order-truth across app, WhatsApp, counter, and admin.
- Preserve stock mutation truth: never mutate stock quantity without a stock movement.
- Preserve auditability for regulated actions.
- Preserve AI boundary: operational intelligence only; no clinical or dispensing autonomy.

## Delivery Process
- Work in small, safe tranches.
- Run `pnpm run check`, `pnpm test`, and `pnpm run build` after changes.
- Do not push directly to `main`.
- Prefer branch/PR workflow.
