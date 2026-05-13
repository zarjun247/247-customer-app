# Architecture Decision Records

This directory contains ADRs documenting significant architectural decisions for 24/7 Pharmacy OS.

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| 0001 | Collapse 149 root markdown files into 5 living documents | Accepted | 2026-05-11 |
| 0002 | executeCommand as the command bus for state-mutating operations | Accepted | 2026-05-13 |
| 0003 | Extract role definitions to _core/roles.ts | Accepted | 2026-05-13 |
| 0004 | Emergency stop via DB-backed feature flag | Accepted | 2026-05-13 |
| 0005 | Custom migration runner over drizzle-kit migrate | Accepted | 2026-05-13 |
| 0006 | Dual reservation system — stockReservations retained alongside reservation_ledger | Accepted (transitional) | 2026-05-13 |
| 0007 | CSRF two-phase rollout — log_only before enforce | Accepted (Phase 1 pending) | 2026-05-13 |
| 0008 | AI features are assistive-only — no regulated mutation authority | Accepted | 2026-05-13 |
| 0009 | File-size splitting via barrel re-export pattern | Accepted (legacy pattern) | 2026-05-13 |

## Template

New ADRs follow the format in `0001-doc-collapse.md`:

```markdown
# ADR-NNNN: Title

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## Context
What is the situation that motivates this decision?

## Decision
What is the decision we are making?

## Consequences
What are the positive and negative results of this decision?
```

## When to write an ADR

Write an ADR when:
- A significant architectural direction is chosen over alternatives (e.g., "we will use X instead of Y").
- A constraint is adopted that will shape many future decisions.
- A trade-off is accepted that future contributors should understand.
- A decision reverses or supersedes a prior architectural choice.

Do not write an ADR for:
- Routine implementation decisions (which function to call, how to structure a module).
- Decisions that are fully described by the code itself.
- Short-term tactical choices with no long-term structural impact.
