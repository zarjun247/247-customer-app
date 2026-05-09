# SCHEMA_PR_FREEZE_LEDGER

Schema/migration-sensitive PR freeze ledger as of 2026-05-09.

> 🔴 **Freeze rule:** Until migration surgery merges and latest-main validation passes, no PR adding `drizzle/schema.ts` or `drizzle/*.sql` changes should merge.

## Inspection limits

| Item | Result |
| --- | --- |
| Latest main-equivalent SHA inspected | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Local migration state | Duplicate `0045` and `0046` prefixes exist in local main-equivalent checkout. |
| Live GitHub PR metadata | Not verifiable in this container. `gh` is not installed, HTTPS fetch requires GitHub credentials, and unauthenticated REST API returned `404 Not Found`. |
| Classification basis | Local merge history, existing governance docs, local migration inventory, and requested expected PR context pending maintainer live-GitHub confirmation. |

## Freeze ledger

| PR number | Title | Domain | Modifies schema/migration? | Migration prefix used if visible | Current classification | Recommended action | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `#2` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; not visible as merged in local history and likely predates major schema/runtime hardening. |
| `#3` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; unsafe to merge raw into current migration history. |
| `#4` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; stale branch can revert later work. |
| `#5` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; no live diff available. |
| `#6` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; no schema safety proof available. |
| `#7` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; no migration-number proof available. |
| `#8` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; unsafe during migration freeze. |
| `#9` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; no live diff available. |
| `#10` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; no schema safety proof available. |
| `#11` | Unknown legacy PR | Unknown / legacy | Unknown | Unknown | Close as stale | Do not merge; close or rebuild only if a maintainer proves unique current-main value. | Very old pre-current-main PR range; local history jumps from `#1` to merged `#12`. |
| `#19` | Unknown legacy PR near audit-helper series | Server/audit legacy | Unknown | Unknown | Close as stale | Do not merge raw; salvage manually only from latest main after review. | Local history includes surrounding merged audit-helper PRs but not `#19`; stale branch risk is high. |
| `#44` | Superseded PR | Unknown / stale duplicate | Unknown | Unknown | Close as stale | Close or label superseded after live confirmation. | Existing stale-PR docs already classify `#44` as superseded/do-not-merge. |
| `#46` | Superseded barcode duplicate | Barcode | Unknown | Unknown | Close as stale | Close or label `superseded, barcode-duplicate` after live confirmation. | Later barcode work is merged; stale duplicate should not merge raw. |
| `#47` | Superseded barcode duplicate | Barcode | Unknown | Unknown | Close as stale | Close or label `superseded, barcode-duplicate` after live confirmation. | Later barcode production UX and scan truth exist; stale duplicate can revert newer behavior. |
| `#62` | Superseded payment fail-closed duplicate | Payments | Unknown | Unknown | Close as stale | Close or label `superseded, payment-duplicate` after live confirmation. | Later payment verification/webhook hardening is merged; do not merge raw. |
| `#66` | Product-master runtime gates | Product master / runtime gates | Unknown | Unknown | Close as stale | Do not merge original raw; close if live GitHub proves superseded by `#75`, otherwise rebuild from latest main. | Local history shows `#75` rebased/superseded product-master runtime gates. |
| `#68` | Superseded accounting duplicate | Accounting | Unknown / possible | Unknown | Close as stale | Close or rebuild only if unique accounting work remains after live review. | Later accounting/reconciliation/Tally work is merged; possible schema collision risk. |
| `#76` | Unknown stale PR | Unknown | Unknown | Unknown | Freeze | Live changed-files review required; if schema/migration is present, rebuild after surgery. | Not visible as merged locally; existing docs classify as unknown/stale needing manual review. |
| `#80` | Unknown stale PR | Unknown | Unknown | Unknown | Freeze | Live changed-files review required; if schema/migration is present, rebuild after surgery. | Not visible as merged locally; could collide with later index/API/privacy hardening. |
| `#86` | Unknown active/stale PR | Unknown | Unknown | Unknown | Freeze | Live changed-files review required before any merge. Rebuild after surgery if schema/migration is present. | Not visible as merged locally; surrounded by later current-main merges and no live diff available. |
| `#88` | Reservation lifecycle truth | Reservations / order lifecycle | Unknown / expected possible | Unknown / stale assumptions possible | Rebuild after surgery | Freeze now. If schema/migration changes are present, rebuild from latest main after surgery with a new reserved migration number. | Reservation lifecycle may require schema changes and stale migration assumptions; no schema PR should merge during collision state. |
| `#89` | MySQL concurrency harness | Test harness / database concurrency | Unknown / likely no production schema | Unknown | Freeze | Keep frozen until live diff confirms no schema/migration changes; later choose between `#89` and `#90` if duplicative. | Harness may reference migration names or DB lifecycle; unsafe while migration numbering is blocked. |
| `#90` | MySQL concurrency harness | Test harness / database concurrency | Unknown / likely no production schema | Unknown | Freeze | Keep frozen until live diff confirms no schema/migration changes; later choose between `#89` and `#90` if duplicative. | Duplicate harness candidate; freeze if it references stale migration names. |
| `#91` | Observability / healthchecks | Observability / health | Unknown / likely no | Unknown | No schema risk | Salvage after latest-main validation if live diff confirms no schema/migration changes. | Expected not to need migrations; still requires explicit changed-files review. |
| `#94` | Pharmacy legal operations | Pharmacy legal / compliance operations | Yes / expected | Likely stale `0045` | Rebuild after surgery | Freeze now; rebuild from latest main after migration repair with next reserved migration number. | Expected schema/migration PR using stale `0045`; cannot merge during duplicate-prefix state. |
| `#95` | Provider runtime enforcement | Provider runtime enforcement | Yes / expected | Likely stale `0045` | Rebuild after surgery | Freeze now; rebuild first among schema PRs after surgery if still required. | Expected schema/migration PR using stale `0045`; must not reuse stale numbering. |
| `#96` | Offline degradation/recovery | Offline/degraded recovery | Yes / expected | Likely stale `0045` | Rebuild after surgery | Freeze now; rebuild from latest main after provider/pharmacy schema sequencing. | Expected schema/migration PR using stale `0045`; must wait for repaired numbering. |

## Immediate maintainer actions

1. Verify live GitHub state for every PR listed above.
2. Close or label stale PRs only after confirming they are still open and have no unique current-main changes.
3. Add an explicit `schema-freeze` or equivalent label/comment to any open PR touching `drizzle/schema.ts` or `drizzle/*.sql`.
4. Do not merge any stale `0045`/`0046` migration branch.
5. After surgery, rebuild schema PRs one at a time using the next reserved migration number.
