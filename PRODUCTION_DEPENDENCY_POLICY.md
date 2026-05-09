# Production Dependency Policy

## Purpose

This policy defines how dependencies, package managers, lockfiles, and emergency security patches must be handled before production launch. It exists to prevent fake green security claims, unreviewed upgrades, package-manager drift, and hidden supply-chain risk.

## Approved dependency-change process

1. Open a dedicated PR for dependency changes unless the dependency update is strictly incidental to an approved feature PR.
2. State why the dependency is needed, whether it is runtime or dev-only, and which production surface it can affect.
3. Include the exact package names, current versions, target versions, and whether the update is direct or transitive.
4. Include `pnpm install`, `pnpm run check`, `pnpm test -- --runInBand`, `pnpm run build`, `node scripts/verify-migrations.mjs`, `git diff --check`, and `pnpm audit` results.
5. For runtime dependencies, include focused regression evidence for the affected feature area.
6. Do not bundle unrelated upgrades into one PR.

## Major upgrade rule

No major version upgrade is allowed in a general hardening or feature PR unless maintainers explicitly approve a dedicated upgrade plan. Major upgrades for React, Vite, TypeScript, Drizzle, Razorpay, AWS SDK, Express, database clients, auth/session libraries, payment libraries, or provider SDKs require their own PR, rollback plan, and focused regression evidence.

## Security patch policy

| Severity | Policy |
| --- | --- |
| Critical runtime | P0. Patch immediately in a dedicated security PR or record explicit owner-approved risk acceptance. No production-green claim while open. |
| High runtime | P0/P1 depending on reachability. Patch before launch unless a security owner accepts risk with evidence. |
| High/critical dev/build tool | P1. Patch before launch if it can affect build artifacts, developer machines, CI, or release integrity. |
| Moderate runtime | P1 unless proven unreachable. Patch on the next dependency hardening cycle. |
| Low/defense-in-depth | P2 unless bundled safely with a higher-priority patch. |

Security findings must not be suppressed, hidden, or relabeled as false positives without documented evidence.

## Lockfile policy

- `pnpm-lock.yaml` is production evidence and must be committed with any dependency change.
- Do not rewrite the lockfile broadly to hide unrelated dependency movement.
- Review lockfile diffs for unexpected package-manager changes, registry changes, lifecycle scripts, binary packages, native packages, new transitive dependencies, or new patches/overrides.
- `pnpm install --frozen-lockfile` must pass in CI before merge.
- Lockfile-only changes require the same review seriousness as `package.json` changes.

## Package-manager version policy

- The `packageManager` field in `package.json` is the intended single source of truth for pnpm.
- Do not add `pnpm` as a project `dependency` or `devDependency` unless the application imports pnpm as a library and maintainers approve the rationale.
- CI should use the `packageManager` pin through Corepack or an exact pnpm version that matches the project policy.
- Avoid generic CI setup such as `version: 10` when the repository pins a specific pnpm version/hash.
- Any package-manager version bump requires a dedicated PR with install, audit, lockfile, and CI validation evidence.

## Runtime and tooling version documentation requirement

Before launch, production docs must state supported versions for:

- Node.js.
- pnpm.
- MySQL.
- Drizzle ORM and Drizzle Kit.
- Vite/build tooling.
- Payment/provider SDKs that are production critical.

A `.nvmrc` or equivalent runtime-version file is recommended so local, CI, and production environments do not drift.

## Dependency audit cadence

- Run `pnpm audit` on every dependency-change PR.
- Run a scheduled dependency audit at least weekly before launch and at least monthly after launch.
- Run an immediate audit when a critical advisory affects Node, pnpm, Vite/build tooling, Express, auth/session, database, payment/provider, AWS/S3, markdown/rendering, or serialization dependencies.
- Keep audit output honest: failed audits are failed audits until patched or formally accepted.

## Emergency security patch flow

1. Create branch `fix/high-critical-dependency-security-patch` or a similarly scoped emergency branch.
2. Patch the smallest safe set of packages needed to remediate the advisory.
3. Avoid unrelated major upgrades.
4. Run the full validation suite and `pnpm audit`.
5. Document remaining vulnerabilities by severity, reachability, and owner decision.
6. Request expedited review from security, platform, and affected domain owners.
7. Merge only after validation is green or an explicit, documented production-risk exception is approved.

## No-fake-green rule

A PR must not claim supply-chain, dependency, or secret hygiene is green if any high/critical issue remains unresolved or unaccepted. Reports must distinguish:

- fixed,
- accepted with owner/date/evidence,
- false positive with proof,
- dev-only with rationale,
- runtime/transitive and still open.
