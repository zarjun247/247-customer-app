# 247 Pharmacy OS

Residential medication continuity infrastructure for India. Mumbai-first.

## Documentation

- [Operations Handbook](./docs/OPERATIONS.md) — daily operations, pharmacist SOPs, incident response
- [Runtime Reference](./docs/RUNTIME.md) — observability, SLOs, dead-letter remediation
- [Compliance Reference](./docs/COMPLIANCE.md) — regulatory frame, audit, AI boundaries
- [Release Reference](./docs/RELEASE.md) — branch protection, CI gates, deployment
- [Current Status](./docs/STATUS.md) — score, what's done, what's in progress

## Strategic context

- [Product North Star](./docs/PRODUCT_NORTH_STAR.md) — the thesis
- [Pharmacy OS Blueprint](./docs/PHARMACY_OS_BLUEPRINT.md) — architecture

## Architectural decisions

See [docs/adr/](./docs/adr/).

## Open work

See [OPEN_BLOCKERS.md](./OPEN_BLOCKERS.md).

## Doctrine

See [AGENT_INSTRUCTIONS.md](./AGENT_INSTRUCTIONS.md).

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in required secrets and DATABASE_URL
pnpm run db:bootstrap         # fresh database: create tables via migrations
pnpm run dev
```

> **Existing database:** use `pnpm run db:push` to apply any new migrations.

## CI gates (must pass before merge)

```bash
pnpm run check      # TypeScript strict
pnpm test           # Vitest
pnpm run build      # Vite + esbuild
pnpm run lint:ci    # ESLint baseline
```
