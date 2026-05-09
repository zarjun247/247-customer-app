# Dependency Security Patch Status

## Patch identity

| Field | Value |
| --- | --- |
| Date | 2026-05-09 |
| Branch | `fix/dependency-supply-chain-security-patch` |
| Latest main SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Remote refresh status | Attempted to add/fetch `https://github.com/zarjun247/247-customer-app.git`, but GitHub credentials were unavailable in this container (`fatal: could not read Username for 'https://github.com': No such device or address`). This patch therefore starts from the checked-out main-equivalent SHA above and does not claim verified remote freshness. |
| Runtime business logic changed | No |
| Server services/routers changed | No |
| `drizzle/schema.ts` changed | No |
| `drizzle/*.sql` changed | No |
| Migrations added | No |
| `package.json` changed | Yes |
| `pnpm-lock.yaml` changed | Yes |

## Commands run

| Command | Result |
| --- | --- |
| `pnpm install` before patch | Passed; lockfile already up to date using pnpm `10.4.1`; warning noted for ignored `@tailwindcss/oxide` and `esbuild` build scripts. |
| `pnpm audit --json` before patch | Failed with 73 advisories across 862 dependencies: 1 critical, 26 high, 42 moderate, 4 low. |
| `pnpm outdated` | Failed because updates are available; used only to identify patch/minor safe candidates. |
| `pnpm install` after patch | Passed with pnpm `10.33.4`. |
| `pnpm audit` after patch | Failed truthfully with 5 advisories across 827 dependencies: 0 critical, 2 high, 3 moderate, 0 low. |
| `pnpm run check` | Passed. |
| `pnpm test -- --runInBand` | Passed: 84 test files passed, 2 skipped; 490 tests passed, 12 skipped. MySQL DB tests were skipped because `TEST_DATABASE_URL` is not set. |
| `pnpm run build` | Passed; Vite emitted pre-existing analytics placeholder/chunk-size warnings. |
| `node scripts/verify-migrations.mjs` | Passed: 49 files, 46 numbered migrations, latest `0048`, 0 blocking issues, 0 warnings. |
| `node scripts/ci-governance-guards.mjs all` | Passed: no blocked patterns found. |
| `git diff --check` | Passed. |
| `pnpm run test:db:smoke` | Completed with the MySQL DB lifecycle integration test skipped because `TEST_DATABASE_URL` is not set; no DB proof is claimed. |

## Dependency changes made

### Direct runtime dependencies

| Package | Previous manifest range | New manifest range | Reason |
| --- | ---: | ---: | --- |
| `@aws-sdk/client-s3` | `^3.693.0` | `^3.1045.0` | Lift AWS SDK transitive `fast-xml-parser` / Smithy advisories without major SDK family change. |
| `@aws-sdk/s3-request-presigner` | `^3.693.0` | `^3.1045.0` | Keep AWS SDK S3 package set aligned. |
| `@trpc/client` | `^11.6.0` | `^11.17.0` | Patch high `@trpc/server` advisory through same-major tRPC update set. |
| `@trpc/react-query` | `^11.6.0` | `^11.17.0` | Keep tRPC client/react/server packages aligned. |
| `@trpc/server` | `^11.6.0` | `^11.17.0` | Patch high direct runtime advisory. |
| `axios` | `^1.12.0` | `^1.16.0` | Patch high/moderate direct and Razorpay-transitive axios advisories within major `1`. |
| `drizzle-orm` | `^0.44.5` | `^0.45.2` | Patch high runtime advisory without schema or migration changes. |
| `express` | `^4.21.2` | `^4.22.1` | Stay on Express 4 while taking latest patch-line fixes. |
| `streamdown` | `^1.4.0` | `^1.6.11` | Same-major runtime update to reduce Markdown/Mermaid transitive advisories. |

### Direct dev/tooling dependencies

| Package | Previous manifest range | New manifest range | Reason |
| --- | ---: | ---: | --- |
| `@tailwindcss/vite` | `^4.1.3` | `^4.3.0` | Same-major tooling update to lift Tailwind/Vite/tar transitive advisories. |
| `postcss` | `^8.4.47` | `^8.5.14` | Patch moderate direct/transitive PostCSS advisory. |
| `vite` | `^7.1.7` | `^7.3.3` | Same-major Vite update to patch high Vite/Rollup/Picomatch advisories for the app build path. |
| `pnpm` | `^10.15.1` in `devDependencies` | Removed from `devDependencies`; `packageManager` is now `pnpm@10.33.4` | Resolve package-manager drift and remove pnpm as an audited app dependency. |

### Targeted pnpm overrides

| Override | Reason |
| --- | --- |
| `tar: 7.5.11` | Patch high Tailwind/tar transitive advisories without broad Tailwind major changes. |
| `fast-xml-parser: 5.7.0` | Patch critical/high AWS XML parser advisories. |
| `rollup: ^4.59.0` | Patch high Rollup advisory under Vite. |
| `picomatch: 4.0.4` | Patch high/moderate Picomatch advisories under Vite/fdir. |
| `vitest>vite: 5.4.21` | Minimize Vitest's Vite 5 advisory exposure without major Vitest upgrade; one later Vite advisory still remains because it requires `>=6.4.2`. |
| `esbuild: ^0.25.10` | Patch older transitive esbuild instances without changing Drizzle Kit major. |
| `path-to-regexp: 0.1.13` | Patch Express 4 transitive high advisory while avoiding Express 5 major migration. |
| `body-parser>qs: 6.14.2` | Patch Express/body-parser transitive qs advisories. |
| `dompurify: 3.4.0` | Patch Mermaid/streamdown DOMPurify advisories. |
| `uuid: 11.1.1` | Patch Mermaid/streamdown uuid advisory. |
| `lodash: 4.17.23`, `lodash-es: 4.17.23` | Reduce older lodash advisories to the current published 4.x ceiling; the remaining advisory asks for non-existent `>=4.18.0`, so this is documented instead of faked green. |
| `mdast-util-to-hast: 13.2.1` | Patch Markdown transitive moderate advisory. |

## Vulnerability classification and action table

| Package / advisory group | Severity before | Direct/transitive | Current before | Patched version available | Runtime/dev-only | Fix strategy | Upgrade risk | Action taken |
| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| `fast-xml-parser` via AWS SDK | Critical + high/moderate/low | Transitive | `5.2.5` | `>=5.7.0` for full set | Runtime | AWS SDK same-major updates plus `fast-xml-parser` override | Low/medium; AWS SDK same major, parser override targeted | Fixed; no remaining `fast-xml-parser` audit findings. |
| `@trpc/server` | High | Direct/transitive | `11.6.0` | `>=11.8.0` | Runtime | Same-major tRPC package set update | Low/medium; same major API family | Fixed; no remaining tRPC audit findings. |
| `pnpm` as app dependency | High/moderate | Direct dev dependency | `10.18.0` lockfile | `>=10.28.2` for full set | Dev/tooling | Remove `pnpm` from `devDependencies`; pin `packageManager`/CI to `10.33.4` | Low; package manager should not be imported by app code | Fixed as audited app dependency and drift reduced. |
| `tar` via Tailwind oxide | High/moderate | Transitive | `7.5.1` | `>=7.5.11` | Dev/build tooling | Same-major Tailwind Vite update plus `tar` override | Low; targeted transitive patch | Fixed. |
| `rollup` via Vite | High | Transitive | `4.52.4` | `>=4.59.0` | Dev/build tooling | Same-major Vite update plus `rollup` override | Low/medium; build validated | Fixed for app Vite 7 path. |
| `picomatch` via Vite/fdir | High/moderate | Transitive | `4.0.3` | `>=4.0.4` | Dev/build tooling | `picomatch` override | Low | Fixed. |
| `drizzle-orm` | High | Direct | `0.44.6` | `>=0.45.2` | Runtime | Patch-level/minor Drizzle ORM update only; no schema/migration edits | Medium; ORM runtime package changed, validated by typecheck/tests/build | Fixed. |
| `axios` / `follow-redirects` | High/moderate/low | Direct plus Razorpay transitive | `1.12.2` | `>=1.16.0` / current audit ceiling | Runtime | Same-major axios update | Low/medium; HTTP client behavior validated by tests/build | Fixed; no remaining axios/follow-redirects findings. |
| `path-to-regexp` via Express 4 | High | Transitive | `0.1.12` | `>=0.1.13` | Runtime | Express 4 patch-line update plus targeted override | Low/medium; avoids Express 5 major migration | Fixed. |
| `qs` via Express/body-parser | Moderate/low | Transitive | `6.13.0` | `>=6.14.2` | Runtime | Targeted `body-parser>qs` override | Low | Fixed. |
| `dompurify` via streamdown/Mermaid | Moderate | Transitive | `3.3.0` | `>=3.4.0` | Runtime/client-rendering path | Same-major streamdown update plus DOMPurify override | Low/medium; Markdown rendering path validated by test/build | Fixed. |
| `uuid` via streamdown/Mermaid | Moderate | Transitive | `11.1.0` | `>=11.1.1` | Runtime/client-rendering path | Targeted `uuid` override | Low | Fixed. |
| `mdast-util-to-hast` via streamdown | Moderate | Transitive | `13.2.0` | `>=13.2.1` | Runtime/client-rendering path | Targeted override | Low | Fixed. |
| `postcss` | Moderate | Direct/transitive | `8.5.6` | `>=8.5.10` | Dev/build tooling | Same-major PostCSS update | Low | Fixed. |
| `esbuild` via Drizzle Kit/Vitest | Moderate | Transitive | `0.18.20` / `0.21.5` | `>=0.25.0` | Dev/build tooling | Targeted `esbuild` override | Medium; build/test validated | Fixed. |
| `lodash` via Recharts | High + moderate remaining | Transitive | `4.17.21` before, `4.17.23` after | Audit claims `>=4.18.0` | Runtime/client charting path | Updated to current published 4.x ceiling; no safe patch exists without major Recharts migration or unpublished lodash `4.18.0` | High for broad replacement/major chart upgrade | Remaining; documented. |
| `lodash-es` via streamdown/Mermaid | High + moderate remaining | Transitive | `4.17.21` before, `4.17.23` after | Audit claims `>=4.18.0` | Runtime/client Markdown/Mermaid path | Updated to current published 4.x ceiling; no safe patch exists without major streamdown/Mermaid/parser changes or unpublished lodash-es `4.18.0` | High for broad rendering stack major upgrade | Remaining; documented. |
| `vite` via Vitest 2 | Moderate remaining | Transitive | `5.4.20` before, `5.4.21` after | `>=6.4.2` | Dev/test-only | Minimized within Vitest 2; no major Vitest upgrade in this PR | Medium/high; Vitest major upgrade could destabilize tests | Remaining; documented. |

## Audit before/after summary

| Phase | Critical | High | Moderate | Low | Total advisories | Audit exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before patch | 1 | 26 | 42 | 4 | 73 | 1 |
| After patch | 0 | 2 | 3 | 0 | 5 | 1 |

## Vulnerabilities fixed

- Fixed all observed critical advisories from `fast-xml-parser` under AWS SDK.
- Fixed high advisories from `@trpc/server`, `pnpm` dev dependency drift, `tar`, `fast-xml-parser`, `rollup`, `path-to-regexp`, `picomatch`, `drizzle-orm`, `axios`, and Vite 7 build-path advisories.
- Fixed moderate/low advisories for `qs`, `dompurify`, `uuid`, `mdast-util-to-hast`, `postcss`, `follow-redirects`, `esbuild`, AWS Smithy config, and older lodash 4.17.21 ranges where current 4.17.23 exists.

## Vulnerabilities remaining

| Package | Severity | Path | Reason remaining | Required next action |
| --- | --- | --- | --- | --- |
| `lodash-es` | High + moderate | `.>streamdown>mermaid>lodash-es` | Audit requires `>=4.18.0`, but current published 4.x ceiling validated during this patch is `4.17.23`; fixing likely requires major rendering-stack movement or upstream release. | Open follow-up to evaluate `streamdown`/Mermaid major upgrade or replacement strategy with UI regression testing. |
| `lodash` | High + moderate | `.>recharts>lodash` | Audit requires `>=4.18.0`, but current published 4.x ceiling validated during this patch is `4.17.23`; fixing likely requires Recharts major migration or upstream release. | Open follow-up to evaluate Recharts 3 migration with chart regression testing. |
| `vite` | Moderate | `.>vitest>vite` | Vitest 2 remains on a Vite line that audit says is patched only by `>=6.4.2`; a Vitest major upgrade is not a safe dependency-only patch in this PR. | Open follow-up to evaluate Vitest major upgrade separately. |

## Package-manager drift status

- `packageManager` is now the single source of truth at `pnpm@10.33.4`.
- `pnpm` was removed from `devDependencies`; audit no longer treats pnpm as an app package.
- CI `pnpm/action-setup@v4` now uses exact `10.33.4` instead of broad `10`.
- No npm/yarn package scripts were introduced.
- Lockfile was regenerated with pnpm `10.33.4` and remains `pnpm-lock.yaml` only.

## Validation status

- TypeScript, unit/guard tests, production build, migration verifier, governance guards, and diff whitespace checks passed.
- `pnpm audit` is **not green** and still exits `1`; this is not suppressed.
- DB proof is **not claimed** because `TEST_DATABASE_URL` is missing and DB smoke skipped.

## Next required prompt

`fix/remaining-lodash-recharts-streamdown-vitest-audit-findings`

Use this follow-up only after assigning UI/test coverage for chart rendering, Markdown/Mermaid rendering, and Vitest major-version behavior. Do not force major upgrades into this dependency patch PR.
