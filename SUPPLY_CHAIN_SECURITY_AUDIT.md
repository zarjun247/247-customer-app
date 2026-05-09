# Supply Chain Security Audit

## Audit identity

| Field | Value |
| --- | --- |
| Audit date | 2026-05-09 |
| Branch | `chore/supply-chain-dependency-secret-audit` |
| Latest main SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| GitHub main refresh status | Attempted `git fetch origin main` after adding `https://github.com/zarjun247/247-customer-app.git`, but the environment could not read GitHub credentials: `fatal: could not read Username for 'https://github.com': No such device or address`. This report therefore audits the checked-out main-equivalent SHA above and does **not** claim a verified remote refresh. |
| Runtime code changed | No |
| Server services/routers changed | No |
| Client runtime files changed | No |
| `drizzle/schema.ts` changed | No |
| `drizzle/*.sql` changed | No |
| Migrations added | No |
| `package.json` changed | No |
| `pnpm-lock.yaml` changed | No |

## Scope inspected

- `package.json`, `pnpm-lock.yaml`, root lockfile importers, lockfile overrides, and patched dependencies.
- `.github/workflows/ci.yml`.
- `scripts/*` governance, production-env, migration, backup/restore, and seed scripts by static inspection.
- `patches/*`.
- `.npmrc` presence check: no root `.npmrc` is present.
- `.env` example presence check: no root `.env.example` or `.env.production.example` is present.
- Docker/deploy files: `docker-compose.test.yml`; no root `Dockerfile` was present in the inspected tree.
- `vite.config.ts` and `tsconfig.json`.
- Production readiness, deployment, CI, provider, security, and governance Markdown docs by targeted search.

## Package-manager status

| Control | Observed status | Classification | Required action |
| --- | --- | --- | --- |
| Root package manager | `package.json` pins `packageManager` to `pnpm@10.4.1+sha512...`. | Good pin, but must remain the source of truth. | Keep one authoritative pnpm version and make CI consume it consistently. |
| Installed pnpm used for audit | `pnpm --version` returned `10.4.1`. | Matches `packageManager`. | Keep using Corepack/packageManager-derived pnpm for installs. |
| `pnpm` in `devDependencies` | `package.json` also has `pnpm: ^10.15.1`; the lockfile resolved `pnpm@10.18.0`, and `pnpm audit` reports multiple pnpm vulnerabilities on that dev dependency. | **P1 package-manager drift and supply-chain risk.** | Prefer removing `pnpm` from `devDependencies` in a dedicated dependency-governance PR after validating scripts do not import pnpm as a library. Do not hide the current audit finding. |
| CI pnpm setup | GitHub Actions uses `pnpm/action-setup@v4` with `version: 10` in each job. | P1 drift risk because CI does not pin the exact packageManager version/hash. | Prefer Corepack or exact `10.4.1`/packageManager-derived setup in a CI hardening PR. |
| Node version | CI pins Node `20`; local validation ran on Node `v24.15.0`; no `.nvmrc` was found. | P1 reproducibility gap. | Add `.nvmrc`/docs in a dedicated tooling PR and align local/dev/CI production support. |
| npm/yarn drift | No package scripts invoke `npm` or `yarn`; scripts are pnpm-oriented. | No action. | Keep npm audit as non-primary for this pnpm repo unless explicitly needed. |
| `.npmrc` | Not present. | P2 policy gap. | Consider a minimal `.npmrc` only if the team wants enforceable settings such as `engine-strict` or registry policy. |

## Lockfile and patch status

| Item | Observed status | Classification | Required action |
| --- | --- | --- | --- |
| Lockfile version | `pnpm-lock.yaml` uses `lockfileVersion: '9.0'`. | Expected for current pnpm generation. | No lockfile rewrite in this branch. |
| Install consistency | `pnpm install` completed with lockfile already up to date. | Pass with warnings. | Warnings should be reviewed, not hidden. |
| Ignored build scripts | `pnpm install` warned that `@tailwindcss/oxide` and `esbuild` build scripts are ignored until approved. | P1 supply-chain review item. | Decide whether to approve exact build scripts through pnpm policy; do not blanket-approve unreviewed scripts. |
| Overrides | Lockfile contains override `tailwindcss>nanoid: 3.3.7`. | Needs owner review. | Confirm the override rationale and whether it still applies. |
| Patches | `patches/wouter@3.7.1.patch` is registered and modifies route collection behavior in patched dependency code. | Needs owner review before launch. | Keep patch documented; confirm it is intentional and non-secret-bearing. |

## Dependency audit command results

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm audit --json` | 1 | **Not green.** Reported 73 advisories across 862 dependencies: 1 critical, 26 high, 42 moderate, 4 low. |
| `pnpm outdated --format json` | 1 | Found available updates, including runtime and dev packages. No upgrades were applied in this audit branch. |
| `npm audit` | Not run | Not preferred because this repository uses pnpm and has a pnpm lockfile. |

## Vulnerability table

`pnpm audit` currently blocks any truthful production-green claim. The table groups advisories by affected module and top-level path.

| Affected module | Severity/count | Path / top-level package | Classification | Required action |
| --- | --- | --- | --- | --- |
| `fast-xml-parser` | 1 critical, 3 high, 2 moderate, 1 low | Transitive through `@aws-sdk/client-s3` / AWS SDK XML builder | **P0 runtime transitive vulnerability** | Open `fix/high-critical-dependency-security-patch`; evaluate minimal AWS SDK patch that lifts `fast-xml-parser`. |
| `axios` | 5 high, 10 moderate, 1 low | Direct `axios`; also transitive through `razorpay` | **P0 runtime direct/transitive vulnerability** | Open security patch PR. Validate direct axios upgrade and Razorpay transitive constraint separately. |
| `drizzle-orm` | 1 high | Direct `drizzle-orm@0.44.6` | **P0 runtime direct vulnerability** | Open security patch PR; do not change schema/migrations in this audit branch. |
| `@trpc/server` | 1 high | Direct and transitive through `@trpc/*` | P1 runtime/manual review | Review app usage of vulnerable feature and patch in dependency PR. |
| `path-to-regexp` | 1 high | Transitive through `express@4.21.2` | P1 runtime transitive vulnerability | Review Express patch path or route exposure. |
| `tar` | 6 high, 1 moderate | Transitive through `@tailwindcss/vite` / `@tailwindcss/oxide` | P1 build-tooling vulnerability | Patch Tailwind tooling in dedicated dependency PR; also review ignored build scripts. |
| `rollup` | 1 high | Transitive through Vite toolchain | P1 build-time vulnerability | Patch Vite/Rollup in dedicated tooling PR; avoid broad Vite major upgrade without testing. |
| `vite` | 2 high, 4 moderate | Direct Vite and Vitest Vite 5 transitive copies | P1 dev/build server vulnerability | Patch Vite/Vitest toolchain deliberately. Do not claim production green while unresolved. |
| `pnpm` | 3 high, 5 moderate | `pnpm@10.18.0` devDependency resolved from `pnpm: ^10.15.1` | **P1 package-manager drift/security issue** | Remove or pin/patch devDependency in a dedicated PR after validating no runtime dependence on pnpm package. |
| `lodash` | 1 high, 2 moderate | Transitive through `recharts` | P1 runtime/client transitive vulnerability | Patch `recharts`/transitive resolution after UI regression review. |
| `lodash-es` | 1 high, 2 moderate | Transitive through `streamdown`/`mermaid` | P1 runtime/client transitive vulnerability | Patch `streamdown`/`mermaid` path or remove risky markdown/diagram surface if unused. |
| `picomatch` | 1 high, 1 moderate | Transitive through Vite/tinyglobby/fdir | P1 build-tooling vulnerability | Patch Vite toolchain deliberately. |
| `dompurify` | 8 moderate | Transitive through `streamdown`/`mermaid` | P1 runtime/client transitive vulnerability | Patch or verify sanitization exposure; do not treat as false positive without evidence. |
| `mdast-util-to-hast` | 1 moderate | Transitive through `streamdown` markdown stack | P1 runtime/client transitive vulnerability | Patch markdown stack or document accepted risk. |
| `postcss` | 1 moderate | Direct dev dependency and transitive through Vite/autoprefixer | P1 build-tooling/client CSS vulnerability | Patch deliberately in tooling PR. |
| `qs` | 1 moderate, 1 low | Transitive through `express`/`body-parser` | P1 runtime transitive vulnerability | Review Express/body-parser update path. |
| `follow-redirects` | 1 moderate | Transitive through `axios` and `razorpay` | P1 runtime transitive vulnerability | Usually remediated with axios/Razorpay dependency patch. |
| `esbuild` | 1 moderate | Transitive through Drizzle/Vitest/Vite | P2 dev-server vulnerability | Patch through build/test tooling updates. |
| `@smithy/config-resolver` | 1 low | Transitive through AWS SDK | P2 defense-in-depth | Patch with AWS SDK update after P0 review. |
| `uuid` | 1 moderate | Transitive through `streamdown`/`mermaid` | P2/manual review | Patch with markdown/diagram stack update. |

## CI supply-chain coverage

| CI area | Implemented today | Gap before production |
| --- | --- | --- |
| TypeScript check | Yes, `check` job runs `pnpm run check`. | Keep required. |
| Tests | Yes, `test` job runs `pnpm test -- --runInBand`. | Keep required. |
| Build | Yes, `build` job runs `pnpm run build`. | Keep required. |
| Migration smoke | Yes, migration smoke and release-gate advisory jobs exist. | Keep required; add full migration verification as required status if not already protected. |
| Governance scans | Yes, `governance-security-scans` runs `node scripts/ci-governance-guards.mjs all`. | Do not weaken. Consider adding this audit as a required production sign-off. |
| Placeholder guards | Yes, `placeholder-guards` runs production placeholder tests. | Keep required. |
| Security env guards | Yes, security-focused guard tests run. | Keep required. |
| Dependency audit | No dedicated `pnpm audit` CI job observed. | P1: add a dependency audit job or advisory gate. For launch, high/critical findings must be fixed or explicitly accepted by security owner. |
| Secret scanning | No dedicated gitleaks/trufflehog CI job observed. | P1: add a secret scanning job with redacted output and fail-on-real-secrets policy. |
| Artifact leakage | No artifact upload observed in `ci.yml`. | Low current risk; continue to avoid uploading logs/env dumps. |

## Dependency upgrade recommendations

1. **P0:** Open `fix/high-critical-dependency-security-patch` for critical/high runtime findings. Target minimal compatible patches for `fast-xml-parser` via AWS SDK, direct `axios`, `drizzle-orm`, and any reachable payment/provider paths.
2. **P1:** Open a separate package-manager hardening PR to resolve pnpm drift: remove `pnpm` from `devDependencies` unless there is a proven library use; make CI defer to the `packageManager` pin or pin exact pnpm consistently.
3. **P1:** Patch Vite/Vitest/Rollup/Tailwind build-chain advisories deliberately, without broad major upgrades.
4. **P1:** Patch `streamdown`/`mermaid`/DOMPurify/markdown stack advisories or prove the risky rendering paths are unreachable.
5. **P2:** Add Node and database/tooling version documentation (`.nvmrc` or equivalent, MySQL 8.4, Drizzle versions) and an approved build-script policy.

## P0/P1/P2 findings

| Priority | Finding | Launch stance |
| --- | --- | --- |
| P0 | `pnpm audit` reports 1 critical and multiple high runtime advisories. | Blocks a true 10/10 production-green supply-chain claim until patched or formally accepted. |
| P1 | Package-manager drift: `packageManager` is pnpm 10.4.1 while `devDependencies.pnpm` resolves to vulnerable pnpm 10.18.0 and CI uses generic `version: 10`. | Must be resolved before production lock. |
| P1 | No dedicated dependency audit CI gate observed. | Required before launch or must be manually enforced by release governance. |
| P1 | No dedicated secret scanning CI gate observed. | Required before launch or must be manually enforced by release governance. |
| P1 | No root `.env.example` / `.env.production.example` observed. | Production env onboarding gap; document or add carefully after conventions are confirmed. |
| P1 | Ignored pnpm build scripts for `@tailwindcss/oxide` and `esbuild`. | Requires explicit approve/deny decision; do not auto-approve. |
| P2 | No `.npmrc` and no `.nvmrc` observed. | Reproducibility/policy improvement. |

## No-fake-green note

This repository is **not** supply-chain green on 2026-05-09. `pnpm audit` failed with critical/high findings. This audit intentionally does not hide, suppress, or relabel those findings as false positives. Any production readiness claim must either remediate them in a dedicated patch PR or carry explicit, owner-approved risk acceptance with evidence.

## Next recommended prompt

`fix/high-critical-dependency-security-patch`

## Validation results from this audit branch

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm install` | Passed with warnings | Lockfile was already up to date. pnpm warned about ignored build scripts for `@tailwindcss/oxide` and `esbuild`, and Node emitted a `url.parse()` deprecation warning. |
| `pnpm run check` | Passed | TypeScript check completed with no errors. |
| `pnpm test -- --runInBand` | Passed with environment-limited skip | 84 files passed, 1 file skipped; 490 tests passed, 1 skipped. MySQL lifecycle integration skipped because `TEST_DATABASE_URL` was not set. OAuth phone-session test logged missing `OAUTH_SERVER_URL` while passing. |
| `pnpm run build` | Passed with warnings | Vite warned that analytics placeholders were not defined and emitted a chunk-size warning. |
| `node scripts/verify-migrations.mjs` | Passed | 49 migration files scanned; 46 numbered; latest `0048`; 0 blocking issues and 0 warnings. |
| `git diff --check` | Passed | No whitespace errors after cleanup. |
| `pnpm audit` | Failed | 73 vulnerabilities: 4 low, 42 moderate, 26 high, 1 critical. This is intentionally not hidden. |
