# Backup and Restore Proof Status

## Backup command

Dry-run backup proof:

```bash
BACKUP_DATABASE_URL='mysql://user:password@host:3306/database' pnpm run backup:db:dry-run
```

Production-looking backups must also set `BACKUP_OUTPUT_DIR` or pass `--output-dir`:

```bash
APP_ENV=production BACKUP_OUTPUT_DIR=/secure/backups BACKUP_DATABASE_URL='mysql://user:password@host:3306/database' node scripts/backup-db.mjs --dry-run --metadata
```

Execution mode is explicit and requires the output directory to already exist:

```bash
BACKUP_OUTPUT_DIR=/secure/backups BACKUP_DATABASE_URL='mysql://user:password@host:3306/database' node scripts/backup-db.mjs --execute
```

Required local tool: `mysqldump`.

## Restore drill command

Dry-run restore proof requires a real backup file path and a non-production restore target:

```bash
RESTORE_DATABASE_URL='mysql://user:password@127.0.0.1:3306/customer_app_restore_drill' node scripts/restore-db-drill.mjs --dry-run --backup-file ./backup.sql
```

Execution mode is explicit:

```bash
RESTORE_DATABASE_URL='mysql://user:password@127.0.0.1:3306/customer_app_restore_drill' node scripts/restore-db-drill.mjs --execute --backup-file ./backup.sql
```

Required local tool: `mysql`.

## Dry-run behavior

- Backup dry-run parses `BACKUP_DATABASE_URL` or `DATABASE_URL`, generates a timestamped `mysqldump` command, and never prints the database password.
- Restore dry-run parses `RESTORE_DATABASE_URL` or `TEST_DATABASE_URL`, verifies the backup file exists, generates a `mysql` restore command, and never prints the database password.
- Dry-runs prove command construction and safety checks only; they do not claim a completed backup or restore.

## Production safety refusal rules

Backup refuses production-looking targets unless an explicit output directory is configured. Restore refuses production-looking targets by default and requires a non-production restore database URL for drills. Restore also refuses to proceed when the backup file is missing.

## Restore verification checklist

After an executed restore drill, capture evidence for:

1. Restore target database name and host class are non-production.
2. Restore command completed successfully.
3. Application migration table or schema objects are present.
4. A smoke query succeeds.
5. Sensitive production credentials were not written to logs.
6. Rollback owner reviewed the drill output and timestamp.

## Remaining gaps

- The scripts do not provision backup storage buckets, encryption-at-rest policies, retention policies, or offsite replication.
- The scripts do not run post-restore smoke queries automatically yet.
- Point-in-time recovery and binlog replay are not automated in this wave.
