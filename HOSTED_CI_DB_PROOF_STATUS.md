# HOSTED_CI_DB_PROOF_STATUS

Updated: 2026-05-10.

## Current hosted CI DB proof status

**Status: PENDING OBSERVATION — not yet claimable as closed from repository evidence alone.**

The hosted workflow is wired for a real GitHub Actions MySQL-backed proof run, but this checkout does not contain an attached GitHub run URL, run ID, artifact archive, or log excerpt proving that the workflow has passed on the target branch after this evidence update.

## Workflow wiring verified in repo

Workflow: `.github/workflows/concurrency-proof.yml`.

| Requirement | Repo wiring status | Evidence location |
| --- | --- | --- |
| Hosted trigger on PR to `main` | Present | `on.pull_request.branches: [main]` |
| Hosted trigger on push to `main` | Present | `on.push.branches: [main]` |
| Manual dispatch | Present | `on.workflow_dispatch` |
| MySQL service | Present | `services.mysql.image: mysql:8.4` |
| Test database | Present | `MYSQL_DATABASE: 247_customer_app_test` |
| Safe test URL | Present | `TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3306/247_customer_app_test` |
| pnpm bootstrap | Present | Corepack enable, `pnpm@10.4.1`, `pnpm install --frozen-lockfile` |
| Migration bootstrap | Present | `pnpm run test:db:bootstrap` |
| Concurrency command | Present | `pnpm run test:db:concurrency` |
| Evidence capture | Present | migration log, concurrency log, manifest, and uploaded artifact |

## Hosted evidence capture commands

Replace `<branch>` with the branch under review and `<run-id>` with the run selected from `gh run list`.

Trigger the proof manually:

```bash
gh workflow run concurrency-proof.yml --ref <branch>
```

List recent runs for the workflow:

```bash
gh run list --workflow "DB Concurrency Proof" --branch <branch> --limit 10
```

Watch a selected run until completion:

```bash
gh run watch <run-id> --exit-status
```

Inspect the run summary and job status:

```bash
gh run view <run-id>
```

Inspect full logs and preserve them locally:

```bash
gh run view <run-id> --log > db-concurrency-proof-<run-id>.log
```

Download the evidence artifact:

```bash
gh run download <run-id> --name db-concurrency-proof-<run-id>-1 --dir evidence/db-concurrency-proof-<run-id>
```

If the run attempt is not `1`, first inspect the exact artifact name:

```bash
gh run view <run-id> --json artifacts --jq '.artifacts[].name'
```

## Fields to screenshot or archive

Archive or screenshot all of the following before marking hosted DB proof observed:

1. GitHub run header showing workflow name **DB Concurrency Proof**, branch, commit SHA, run ID, and green conclusion.
2. `mysql-concurrency-proof` job summary showing the MySQL service and green job conclusion.
3. `Apply test DB migrations` step showing `pnpm run test:db:bootstrap` completed successfully.
4. `Run MySQL concurrency proof` step showing `pnpm run test:db:concurrency` completed successfully.
5. Vitest summary showing `server/mysql-concurrency.integration.test.ts` and the full pass count.
6. Uploaded artifact named `db-concurrency-proof-<run-id>-<attempt>`.
7. `evidence-manifest.md` with workflow, run ID, run attempt, ref, SHA, MySQL image, commands, generated timestamp, and log checksums.
8. `test-db-bootstrap.log` and `mysql-concurrency-proof.log` from the downloaded artifact.

## Acceptance criteria for marking hosted DB proof observed

Hosted DB proof may be marked **observed** only when all criteria are true:

- The workflow run is from the target branch or release commit being evaluated.
- The run conclusion is `success`.
- The `mysql-concurrency-proof` job used the checked-in MySQL service, not a mocked/skipped DB.
- `TEST_DATABASE_URL` is present in the job environment and points to the hosted test database name containing `test`.
- `pnpm run test:db:bootstrap` passed in the hosted run.
- `pnpm run test:db:concurrency` passed in the hosted run.
- The concurrency log does **not** show `describe.skip`, `Skipping MySQL concurrency integration proof`, or missing `TEST_DATABASE_URL` as the reason for success.
- The pass count matches the checked-in harness for the evaluated commit.
- The evidence artifact and/or full logs are archived with run ID, branch, commit SHA, and run attempt.

## Current gap

The workflow is now auditable and evidence-producing, but hosted DB proof remains pending until a real GitHub Actions run is triggered and its logs/artifact are attached to the release evidence set.
