import pino from "pino";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { familyConsent, users } from "../../drizzle/schema";
import { logAudit } from "./audit";
import type { FamilyConsentRecord } from "../../drizzle/schema/prescriptions";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type ConsentScope = "rx_h1" | "rx_h" | "general";
export type GuardianRelationship = "parent" | "legal_guardian";
export type GuardianIdProofKind = "aadhaar" | "voter_id" | "passport";

const SCHEDULE_TO_SCOPE: Record<"H" | "H1" | "X", ConsentScope> = {
  H1: "rx_h1",
  H: "rx_h",
  X: "rx_h1",
};

function isUnder18(dateOfBirth: Date | null | undefined): boolean {
  if (!dateOfBirth) return false;
  const now = new Date();
  const age = now.getFullYear() - dateOfBirth.getFullYear();
  const m = now.getMonth() - dateOfBirth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dateOfBirth.getDate())) {
    return age - 1 < 18;
  }
  return age < 18;
}

export async function recordFamilyConsent(input: {
  minorCustomerId: number;
  guardianName: string;
  guardianRelationship: GuardianRelationship;
  guardianIdProofKind?: GuardianIdProofKind;
  guardianIdProofLast4?: string;
  consentScope: ConsentScope[];
  consentDocStoragePath?: string;
  recordedByUserId: number;
  guardianCustomerId?: number;
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for recordFamilyConsent");

  const result = await db.insert(familyConsent).values({
    minorCustomerId: input.minorCustomerId,
    guardianCustomerId: input.guardianCustomerId ?? null,
    guardianName: input.guardianName,
    guardianRelationship: input.guardianRelationship,
    guardianIdProofKind: input.guardianIdProofKind ?? null,
    guardianIdProofLast4: input.guardianIdProofLast4 ?? null,
    consentScopeJson: input.consentScope,
    consentSignedAt: new Date(),
    consentDocStoragePath: input.consentDocStoragePath ?? null,
    recordedByUserId: input.recordedByUserId,
  });

  const id = Number((result as any).insertId ?? 0);

  await logAudit({
    actorId: input.recordedByUserId,
    action: "family_consent.recorded",
    entityType: "customer",
    entityId: input.minorCustomerId,
    afterJson: {
      consentId: id,
      guardianRelationship: input.guardianRelationship,
      consentScope: input.consentScope,
    },
  });

  logger.info(
    { minorCustomerId: input.minorCustomerId, id },
    "familyConsentService: consent recorded"
  );
  return { id };
}

export async function getActiveFamilyConsent(input: {
  minorCustomerId: number;
}): Promise<FamilyConsentRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(familyConsent)
    .where(
      and(
        eq(familyConsent.minorCustomerId, input.minorCustomerId),
        isNull(familyConsent.consentRevokedAt)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function revokeFamilyConsent(input: {
  consentId: number;
  revokedByUserId: number;
  reason: string;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for revokeFamilyConsent");

  const [existing] = await db
    .select()
    .from(familyConsent)
    .where(
      and(
        eq(familyConsent.id, input.consentId),
        isNull(familyConsent.consentRevokedAt)
      )
    )
    .limit(1);

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Active family consent not found",
    });
  }

  await db
    .update(familyConsent)
    .set({ consentRevokedAt: new Date() })
    .where(eq(familyConsent.id, input.consentId));

  await logAudit({
    actorId: input.revokedByUserId,
    action: "family_consent.revoked",
    entityType: "customer",
    entityId: existing.minorCustomerId,
    reason: input.reason,
    afterJson: { consentId: input.consentId },
  });

  return { ok: true };
}

export async function assertConsentForScheduleSale(input: {
  customerId: number;
  scheduleClass: "H" | "H1" | "X";
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [customer] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.customerId))
    .limit(1);

  if (!customer) return;

  const dob = customer.dateOfBirth ?? null;
  if (!dob) {
    logger.warn(
      { customerId: input.customerId },
      "familyConsent: customer has no DOB; treating as adult (backfill required — see SCORECARD item 9)"
    );
    return;
  }
  if (!isUnder18(dob)) return;

  // Customer is under 18 — require active family consent for this schedule
  const requiredScope = SCHEDULE_TO_SCOPE[input.scheduleClass];
  const consent = await getActiveFamilyConsent({
    minorCustomerId: input.customerId,
  });

  if (!consent) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `Schedule ${input.scheduleClass} sale to a minor requires recorded family consent. ` +
        `Please record guardian consent before proceeding.`,
    });
  }

  const scope = Array.isArray(consent.consentScopeJson)
    ? (consent.consentScopeJson as string[])
    : [];

  if (!scope.includes(requiredScope) && !scope.includes("general")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Family consent exists but does not cover Schedule ${input.scheduleClass} (requires scope "${requiredScope}").`,
    });
  }
}
