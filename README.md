
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
