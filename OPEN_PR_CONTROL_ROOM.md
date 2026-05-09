# OPEN PR CONTROL ROOM

- Current date/time: 2026-05-09 10:23:31 UTC
- Latest main SHA used for this control room: `200fafcc20451cc43e8d6272588ec7e26e12d9c8`
- Current repo score estimate: **7.8 / 10**
- Production caveat: **Repo is strong pre-production architecture, not 10/10 launch-ready.**
- Scope: governance/control-room only. No runtime product code, migrations, `drizzle/schema.ts`, package manifests, lockfiles, workflows, provider/runtime implementation, observability implementation, reservation implementation, or barcode implementation were changed.

## GitHub inspection result and blocker

Live GitHub inspection was attempted from this environment, but authenticated GitHub access is not available:

- `gh auth status` / `gh repo view zarjun247/247-customer-app`: `gh: command not found`.
- `curl https://api.github.com/repos/zarjun247/247-customer-app/pulls?state=open&per_page=100`: GitHub returned `404 Not Found`, consistent with a private repository or unauthenticated API access.
- `git fetch origin main --prune` after adding `https://github.com/zarjun247/247-customer-app.git`: failed with `fatal: could not read Username for 'https://github.com': No such device or address`.

Therefore this control room uses the local checkout at `200fafc`, local merge history showing PR `#116` merged, existing stale/governance ledgers, and the required PR list supplied in the prompt. Maintainers with GitHub permissions must verify live title/mergeability/base/head data before closing anything. No PRs were merged, commented, or closed by this branch.

## Full open PR control table

Legend:

- **Metadata confidence**: `blocked` means live GitHub title/base/head/mergeable/status could not be read in this environment.
- **Docs-only/runtime**: based on the requested domain guidance and local governance history, not live diff inspection.
- **Risk**: `P0` = must not merge raw / can break launch truth, migrations, money, inventory, or provider correctness; `P1` = high rebuild risk; `P2` = stale/duplicate governance risk; `P3` = low-risk docs/extraction candidate after verification.

| PR | Title / domain record | State | Mergeable | Base SHA | Head SHA | Docs-only vs runtime code | Migrations added/edited | Schema/package/workflow touched? | CI/testing claims | Likely superseded by merged main? | Unique useful content? | Risk | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#2` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes; later audit/RBAC/report/stock work supersedes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#3` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#4` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#5` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#6` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#7` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#8` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#9` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#10` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#11` | Early stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#19` | Older stale audit/stabilization PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Unknown; treat as possible docs/runtime audit | Unknown | Unknown | Unknown | Likely yes | Possible small audit notes only | P2 | Close as superseded after live confirmation; extract small useful content later only if unique |
| `#44` | Older repo hygiene / CI fixes candidate; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Likely docs/CI/governance, verify live diff | Unknown | Possible workflow/package risk must be checked | Unknown | Likely yes; later repo hygiene/CI fixes supersede | Possible unique docs only | P2 | Close as superseded unless unique docs remain |
| `#46` | Barcode duplicate of `#47`; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Likely runtime/client barcode foundation | Unknown | Unknown | Unknown | Likely yes; duplicate of `#47` and later barcode planning | Low; duplicate domain | P2 | Close as duplicate/superseded |
| `#47` | Barcode component foundation, not production screen UX; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/client likely | Unknown | Unknown | Unknown | Partly; useful intent not production-ready | Barcode component patterns may be useful | P1 | Rebuild barcode screen-level wiring from latest main later; do not merge raw |
| `#62` | Payment fail-closed intent; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/payment likely | Unknown | Unknown | Unknown | Possibly superseded by merged payment hardening | Payment fail-closed checks may be useful if not covered | P1 | Compare with main; rebuild/extract if not covered; do not merge raw |
| `#66` | Product-master runtime gates; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/product likely | Unknown | Unknown | Unknown | Possibly not fully superseded | Runtime gates may be useful | P1 | Rebuild/extract from latest main after comparison |
| `#68` | Balanced accounting journal batches; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/accounting likely | Likely old migration risk | Likely schema/migration risk | Unknown | Partly superseded by later accounting work | Accounting batch semantics may be useful | P0 | Must rebuild from latest main; no raw merge due migration risk |
| `#76` | Governance scan; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Possible scanner/config risk to verify | Unknown | Likely yes; merged `#92`/`#109` governance supersedes | Possibly none | P2 | Close as superseded if live diff confirms |
| `#80` | Observability duplicate older than `#117`; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/observability likely | Unknown | Unknown | Unknown | Likely yes; `#117` latest candidate | Possible healthcheck ideas | P1 | Close/supersede or extract after comparing with `#117`; do not merge raw |
| `#86` | Commercial lifecycle ledger; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/commercial ledger likely | Likely old migration risk | Likely schema/migration risk | Unknown | Possibly partly superseded | Ledger semantics may be useful | P0 | Must rebuild from latest main only if still needed |
| `#88` | Reservation lifecycle duplicate older than `#115`; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/reservation likely | Likely migration risk | Likely schema/migration risk | Unknown | Likely superseded by `#115` candidate | Possible reservation edge cases | P0 | Close/supersede after live comparison; otherwise extraction-only |
| `#89` | MySQL concurrency proof duplicate; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Tests/governance likely, maybe runtime tests | No known migration | Unknown | Unknown | Likely superseded by merged `#116` | Possible test scenarios | P2 | Close as superseded if `#116` covers scope; extract missing tests later |
| `#90` | MySQL concurrency proof duplicate; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Tests/governance likely, maybe runtime tests | No known migration | Unknown | Unknown | Likely superseded by merged `#116` | Possible test scenarios | P2 | Close as superseded if `#116` covers scope; extract missing tests later |
| `#91` | Observability duplicate older than `#117`; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/observability likely | Unknown | Unknown | Unknown | Likely superseded by `#117` | Possible healthcheck ideas | P1 | Close/supersede or extract after comparing with `#117`; do not merge raw |
| `#94` | Pharmacy legal ops; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/legal ops likely | Likely old migration risk | Likely schema/migration risk | Unknown | Unknown | Legal ops model may be useful | P0 | Must rebuild from latest main if still needed; no raw merge |
| `#95` | Provider runtime duplicate older than `#114`; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/provider likely | Likely migration risk | Likely schema/migration risk | Unknown | Likely superseded by `#114` | Possible provider edge cases | P0 | Close/supersede after comparing with `#114`; extraction-only if unique |
| `#96` | Offline degradation; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/offline likely | Likely old migration risk | Likely schema/migration risk | Unknown | Unknown | Offline degradation patterns may be useful | P0 | Must rebuild from latest main if still needed; no raw merge |
| `#101` | Stale governance/docs PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Unknown | Unknown | Likely yes; later governance docs supersede | Possible text snippets | P3 | Close as superseded if confirmed; extract small content later only if unique |
| `#103` | Stale governance/docs PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Unknown | Unknown | Likely yes; later governance docs supersede | Possible text snippets | P3 | Close as superseded if confirmed; extract small content later only if unique |
| `#104` | Stale governance/docs PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Unknown | Unknown | Likely yes; later governance docs supersede | Possible text snippets | P3 | Close as superseded if confirmed; extract small content later only if unique |
| `#106` | Stale governance/docs PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Unknown | Unknown | Likely yes; later governance docs supersede | Possible text snippets | P3 | Close as superseded if confirmed; extract small content later only if unique |
| `#108` | Stale governance/docs PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Unknown | Unknown | Likely yes; later governance docs supersede | Possible text snippets | P3 | Close as superseded if confirmed; extract small content later only if unique |
| `#110` | Stale governance/docs PR; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/governance likely | No known migration | Unknown | Unknown | Likely yes; later governance docs supersede | Possible text snippets | P3 | Close as superseded if confirmed; extract small content later only if unique |
| `#113` | Runtime stub / fake-success docs audit; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Docs/audit likely | No known migration | Unknown | Unknown | Not assumed; current candidate | Useful launch blocker inventory | P1 | Potential merge after CI green if clean, or rebuild docs from latest main |
| `#114` | Provider runtime latest candidate; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/provider likely | Likely migration `0049` risk | Likely schema/migration risk | Unknown | Not superseded; current candidate | High-value provider enforcement | P0 | First implementation rebuild from latest main; reserve next migration number |
| `#115` | Reservation lifecycle latest candidate; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Runtime/reservation likely | Likely migration conflict with `#114` | Likely schema/migration risk | Unknown | Not superseded; current candidate | High-value reservation truth | P0 | Rebuild after provider runtime and concurrency proof; no raw merge |
| `#117` | Observability latest candidate; live title unavailable | Open per prompt; GitHub blocked | Unknown | Unknown | Unknown | Likely read-only runtime/ops | No known migration, verify | Unknown | Unknown | Not superseded; current candidate | High-value healthchecks/observability | P1 | Potential merge/rebuild after CI; can sequence immediately after control room if no conflict |

## Classification buckets

### A. Safe to close as superseded after live confirmation

Close only after a maintainer verifies the PR is still open, not already merged/closed, and contains no unique current-main content:

- Early stale audit/stabilization: `#2`, `#3`, `#4`, `#5`, `#6`, `#7`, `#8`, `#9`, `#10`, `#11`, `#19`.
- Repo hygiene/CI/docs likely superseded: `#44`.
- Duplicate barcode predecessor: `#46`.
- Governance scan likely superseded by merged governance work: `#76`.
- MySQL concurrency proof duplicates likely superseded by merged `#116`: `#89`, `#90`.
- Stale governance/docs likely superseded by later merged governance docs: `#101`, `#103`, `#104`, `#106`, `#108`, `#110`.

### B. Must rebuild from latest main

Do not merge these raw. Rebuild the useful intent from current main, reserve migration numbers where applicable, and run full validation:

- `#47` barcode foundation: rebuild only production screen-level wiring later.
- `#62` payment fail-closed: rebuild/extract only if current main lacks the fail-closed behavior.
- `#66` product-master runtime gates: rebuild/extract gates that are still missing.
- `#68` accounting journal batches: migration-risk rebuild.
- `#80`, `#91` observability older duplicates: supersede in favor of `#117` or extract only missing checks.
- `#86` commercial lifecycle ledger: migration-risk rebuild only if still needed.
- `#88` reservation lifecycle older duplicate: supersede in favor of `#115` or extract only missing cases.
- `#94` pharmacy legal ops: migration-risk rebuild only if still needed.
- `#95` provider runtime older duplicate: supersede in favor of `#114` or extract only missing cases.
- `#96` offline degradation: migration-risk rebuild only if still needed.
- `#114` provider runtime latest candidate: rebuild first from latest main with migration number reservation.
- `#115` reservation lifecycle latest candidate: rebuild after provider runtime and concurrency proof.

### C. Potential merge candidates after rebase/CI

- `#113`: docs audit of runtime stubs/fake-success. Potentially mergeable if docs-only, current, non-duplicative, and CI green; otherwise rebuild the docs from latest main.
- `#117`: observability/healthchecks latest candidate. Potentially mergeable or rebuildable if read-only, no migration conflict, no provider/reservation dependency conflict, and CI green.

### D. Unique extraction candidates

Extract only through a fresh branch from latest main:

- `#2`-`#11`, `#19`: any surviving audit notes not already represented in current governance docs.
- `#47`: barcode component patterns, but not raw production UX.
- `#62`: payment fail-closed edge cases not in main.
- `#66`: product-master gate cases not in main.
- `#68`: accounting batch invariants without old migrations.
- `#80`, `#91`, `#117`: healthcheck/observability acceptance checks.
- `#86`, `#94`, `#96`: domain policy ideas without old schema histories.
- `#88`, `#115`: reservation truth edge cases after provider runtime is merged.
- `#95`, `#114`: provider runtime enforcement cases after migration numbering is reserved.
- `#101`, `#103`, `#104`, `#106`, `#108`, `#110`: concise governance text only if not duplicated.

### E. Manual review required

Manual review is required for any PR where live GitHub data is unknown or where the PR touches runtime, migrations, schema, package scripts, workflows, money, inventory, provider integration, reservations, observability, payment, barcode, or offline behavior.

Specifically keep open pending manual review and do not raw merge:

- `#62`, `#66`, `#68`, `#80`, `#86`, `#88`, `#91`, `#94`, `#95`, `#96`, `#113`, `#114`, `#115`, `#117`.

## Migration-risk table

| PR | Migration risk | Control action |
| --- | --- | --- |
| `#68` | Likely old accounting migration history | Rebuild from latest main; reserve next migration number only if needed |
| `#86` | Likely old commercial lifecycle migration history | Rebuild from latest main only if still needed |
| `#88` | Likely reservation migration history, older than `#115` | Close/supersede or extraction-only; do not merge raw |
| `#94` | Likely pharmacy legal ops migration history | Rebuild from latest main only if still needed |
| `#95` | Likely provider migration history, older than `#114` | Close/supersede or extraction-only; do not merge raw |
| `#96` | Likely offline degradation migration history | Rebuild from latest main only if still needed |
| `#114` | Provider runtime candidate likely reserves/uses migration `0049` | First rebuild candidate; reserve next migration number on latest main |
| `#115` | Reservation lifecycle candidate may conflict with provider runtime migration numbering | Sequence after provider runtime migration reservation/merge |

## Runtime-risk table

| Domain | PRs | Risk | Control action |
| --- | --- | --- | --- |
| Provider runtime enforcement | `#95`, `#114` | P0 | Rebuild `#114` intent from latest main first; close/supersede `#95` if duplicate |
| Reservation lifecycle truth | `#88`, `#115` | P0 | Sequence after provider runtime and DB-backed concurrency proof |
| Accounting / commercial / legal / offline | `#68`, `#86`, `#94`, `#96` | P0 | No raw merge; old migrations must be rebuilt or abandoned |
| Payment fail-closed / refund settlement | `#62` | P1 | Compare against merged payment hardening; rebuild only missing truth gaps |
| Observability / healthchecks | `#80`, `#91`, `#117` | P1 | Prefer `#117` as latest candidate; older PRs close/extract |
| Barcode UX | `#46`, `#47` | P1/P2 | Close duplicate `#46`; rebuild barcode production screen wiring later from latest main |
| Product-master gates | `#66` | P1 | Extract missing runtime gates only; avoid reverting current main behavior |
| Runtime stub/fake-success audit | `#113` | P1 | Merge docs only if clean/current, otherwise rebuild docs from latest main |

## Duplicate-domain table

| Domain | Duplicate/older PRs | Latest or merged reference | Action |
| --- | --- | --- | --- |
| Barcode | `#46`, `#47` | Future barcode production UX rebuild | Close `#46`; rebuild useful `#47` intent later |
| Observability | `#80`, `#91` | `#117` latest candidate | Close/supersede older duplicates after live confirmation |
| Reservation lifecycle | `#88` | `#115` latest candidate | Close/supersede older duplicate; sequence latest after provider runtime |
| MySQL concurrency proof | `#89`, `#90` | `#116` merged in local history at `200fafc` | Close older duplicates if live diff confirms no missing tests |
| Provider runtime | `#95` | `#114` latest candidate | Close/supersede older duplicate; rebuild latest from main |
| Governance/docs | `#101`, `#103`, `#104`, `#106`, `#108`, `#110` | Later merged governance docs and this control room | Close if confirmed superseded |
| Early audit/stabilization | `#2`-`#11`, `#19` | Later audit/RBAC/report/stock work and current governance docs | Close or extract-only if unique |

## Exact close/rebuild instructions

### Close/supersede procedure

1. Use authenticated GitHub tooling to open the PR.
2. Confirm it is still open and not already merged or closed.
3. Confirm it is stale, duplicate, or superseded by merged main/current candidate.
4. Confirm it does not contain unique current-main-safe content.
5. Post the matching template from `OPEN_PR_CLOSURE_COMMENTS.md`.
6. Close the PR.
7. Do not merge the stale branch, do not resolve conflicts in-place, and do not cherry-pick schema histories blindly.

### Rebuild procedure

1. Start a new branch from latest `main`.
2. Re-read current `drizzle` migrations before reserving a migration number.
3. Rebuild only the useful intent with minimal scope.
4. Preserve current-main behavior on conflicts.
5. Run required validation.
6. Update the control room if any old PR is finally superseded.

## GitHub-side actions taken by this branch

None. This environment lacks `gh` and authenticated GitHub access, so it cannot comment, close, fetch, push, or open GitHub PRs directly. Maintainers should use the templates and tables above for GitHub-side cleanup.

## Governance scan findings

`node scripts/ci-governance-guards.mjs all || true` was run from this branch and reported: `Governance/security scan passed: no blocked patterns found.` No scanner rule was suppressed or weakened by this PR.
