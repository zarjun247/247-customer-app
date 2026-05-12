# 247 Pharmacy OS — Product Roadmap

Current: SM-E complete. Codebase at ~9.65/10. Production readiness gates: see SCORECARD.md.

## Phase 1 — Pilot (current)

Single-store deployment. All core flows operational.

- Counter billing, pharmacist workbench, Rx dispensing
- Customer app: catalog, cart, orders, refill reminders
- DPDP compliance: consent registry, DSR pipeline, retention worker
- CSRF enforcement, CSP headers, audit trail
- WhatsApp order channel (webhook-driven)

## Phase 2 — Scaled (next milestone)

Multi-store rollout. Intelligence features activated.

- Intelligence: continuity graphs, refill risk, stockout forecasting
- AI Eval Ledger: advisory output governance
- Multi-store inventory consolidation
- Doctor consult booking flow (currently scaffolded)
- SLA board production dashboards

Gated by: `APP_PHASE=scaled` env var.

## Phase 3 — Full

Platform features. Requires additional infrastructure.

- SMTP/SES integration for breach notifications
- Real-time delivery tracking
- Supplier payment reconciliation automation
- Analytics export pipeline

Gated by: `APP_PHASE=full` env var.

## Humans-must-do (unblockable by agents)

See SCORECARD.md for the 10 items that require human action before production.

Key items: SMTP credentials, Razorpay production keys, SSL certificate, real pharmacist UAT, DPDP DPO registration.
