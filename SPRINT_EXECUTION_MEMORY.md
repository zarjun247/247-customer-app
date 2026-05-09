SPRINT EXECUTION MEMORY

Canonical sprint order:
- sprint/production-readiness-integration (current)
- sprint/accounting-completion
- sprint/db-concurrency-proof
- sprint/medivision-migration

Completed sprint history:
- sprint/mega-sprint-2: cross-platform governance hardening (this repo)

Forbidden regression areas:
- Direct stock mutations outside stockInvariant
- Admin auth bypasses without RBAC guards
- Placeholder success paths in runtime

Architecture invariants:
- Single canonical stock truth (stockInvariant)
- Store-isolation enforced via requireStoreAccess helpers
- Centralized audit logs through audit service/db adapters

Production doctrine & AI boundaries:
- AI may assist on parsing, suggestions, but cannot approve prescriptions or substitute medicines

Stock truth doctrine:
- All stock mutations must route through approved gateways and be audited

Accounting truth doctrine:
- Single canonical ledger for sales/purchases; no duplicate reconciliation sources

Operational philosophy:
- Prefer correctness over speed
- Maintain auditability and traceability
