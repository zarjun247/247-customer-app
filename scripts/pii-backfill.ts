/**
 * pii-backfill.ts — encrypt existing plaintext PII and populate phoneHash
 *
 * Phases:
 *   1. users.phone  — encrypt plaintext + compute phoneHash
 *   2. users.email  — encrypt plaintext
 *   3. prescriptions.patientPhone — encrypt plaintext
 *
 * Run (dry-run by default — no DB writes):
 *   pnpm tsx scripts/pii-backfill.ts
 *
 * To commit changes:
 *   pnpm tsx scripts/pii-backfill.ts --apply
 */

import { eq, isNull, and, like, not } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getMasterKey } from "../server/services/piiEncryption";
import {
  encryptUserPhone,
  encryptUserEmail,
  computePhoneHash,
} from "../server/services/customerPiiService";
import { encryptPatientPhone } from "../server/services/prescriptionPiiService";
import { getDb } from "../server/db";

const DRY_RUN = !process.argv.includes("--apply");
const BATCH_SIZE = 100;

function isPlaintext(value: string | null | undefined): boolean {
  if (!value) return false;
  return !value.startsWith("v1:");
}

async function main() {
  const masterKey = getMasterKey();
  if (!masterKey) {
    console.error(
      "ERROR: PII_ENCRYPTION_MASTER_KEY not set. Cannot backfill without it."
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(
      "[dry-run] No DB writes will occur. Pass --apply to commit changes.\n"
    );
  }

  const db = await getDb();
  if (!db) {
    console.error("ERROR: DB unavailable.");
    process.exit(1);
  }

  const { users, prescriptions } = await import("../drizzle/schema");

  // ── Phase 1: users.phone ─────────────────────────────────────────────────
  console.log("── Phase 1: users.phone ─────────────────────────────────────");
  let userPhoneUpdated = 0;
  let batch = 0;
  while (true) {
    const rows = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(and(not(isNull(users.phone)), not(like(users.phone, "v1:%"))))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    batch++;
    for (const row of rows) {
      if (!isPlaintext(row.phone)) continue;
      const encPhone = await encryptUserPhone(row.phone!);
      const hash = computePhoneHash(row.phone!);
      if (!DRY_RUN) {
        await db
          .update(users)
          .set({
            phone: encPhone ?? row.phone,
            ...(hash ? { phoneHash: hash } : {}),
          })
          .where(eq(users.id, row.id));
      }
      userPhoneUpdated++;
    }
    console.log(
      `  batch ${batch}: +${rows.length} (total updated: ${userPhoneUpdated})`
    );
  }
  console.log(`  Done. users.phone updated: ${userPhoneUpdated}\n`);

  // ── Phase 2: users.email ─────────────────────────────────────────────────
  console.log("── Phase 2: users.email ─────────────────────────────────────");
  let userEmailUpdated = 0;
  batch = 0;
  while (true) {
    const rows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(not(isNull(users.email)), not(like(users.email, "v1:%"))))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    batch++;
    for (const row of rows) {
      if (!isPlaintext(row.email)) continue;
      const encEmail = await encryptUserEmail(row.email!);
      if (!DRY_RUN) {
        await db
          .update(users)
          .set({ email: encEmail ?? row.email })
          .where(eq(users.id, row.id));
      }
      userEmailUpdated++;
    }
    console.log(
      `  batch ${batch}: +${rows.length} (total updated: ${userEmailUpdated})`
    );
  }
  console.log(`  Done. users.email updated: ${userEmailUpdated}\n`);

  // ── Phase 3: prescriptions.patientPhone ──────────────────────────────────
  console.log("── Phase 3: prescriptions.patientPhone ──────────────────────");
  let rxPhoneUpdated = 0;
  batch = 0;
  while (true) {
    const rows = await db
      .select({
        id: prescriptions.id,
        patientPhone: prescriptions.patientPhone,
      })
      .from(prescriptions)
      .where(
        and(
          not(isNull(prescriptions.patientPhone)),
          not(like(prescriptions.patientPhone, "v1:%"))
        )
      )
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    batch++;
    for (const row of rows) {
      if (!isPlaintext(row.patientPhone)) continue;
      const enc = await encryptPatientPhone(row.patientPhone!);
      if (!DRY_RUN) {
        await db
          .update(prescriptions)
          .set({ patientPhone: enc ?? row.patientPhone })
          .where(eq(prescriptions.id, row.id));
      }
      rxPhoneUpdated++;
    }
    console.log(
      `  batch ${batch}: +${rows.length} (total updated: ${rxPhoneUpdated})`
    );
  }
  console.log(
    `  Done. prescriptions.patientPhone updated: ${rxPhoneUpdated}\n`
  );

  // ── Advisory: encrypted phones with no hash ───────────────────────────────
  const [{ missingHashCount }] = await db
    .select({ missingHashCount: sql<number>`count(*)` })
    .from(users)
    .where(
      and(
        not(isNull(users.phone)),
        like(users.phone, "v1:%"),
        isNull(users.phoneHash)
      )
    );

  if (Number(missingHashCount) > 0) {
    console.log(
      `⚠  ${missingHashCount} user row(s) have an encrypted phone but no phoneHash.`
    );
    console.log(
      "   These were encrypted before the hash column existed. Decrypt + re-hash manually."
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("── Summary ───────────────────────────────────────────────────");
  console.log(`  users.phone encrypted:              ${userPhoneUpdated}`);
  console.log(`  users.email encrypted:              ${userEmailUpdated}`);
  console.log(`  prescriptions.patientPhone encrypted: ${rxPhoneUpdated}`);
  if (DRY_RUN) {
    console.log("\n[dry-run] Re-run with --apply to commit.");
  } else {
    console.log("\nBackfill complete.");
  }
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
