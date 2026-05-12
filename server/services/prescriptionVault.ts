import { and, eq } from "drizzle-orm";
import { prescriptionAccessLog, prescriptions } from "../../drizzle/schema";

type PrescriptionStatus =
  | "pending_ocr"
  | "pending_pharmacist"
  | "quick_verify"
  | "approved"
  | "rejected"
  | "additional_verification"
  | "on_file";

type PrescriptionLike = {
  id: number;
  userId: number;
  status: PrescriptionStatus;
  expiryDate?: Date | string | null;
  validUntil?: Date | string | null;
  consentRevokedAt?: Date | string | null;
  repeatDispenseCount?: number | null;
  repeatDispenseMax?: number | null;
};

export type PrescriptionUsabilityResult = {
  usable: boolean;
  reason?: string;
};

export type VaultActorRole = string;
export type VaultAccessChannel = string;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPrescriptionExpired(
  rx: Pick<PrescriptionLike, "expiryDate" | "validUntil">,
  now = new Date()
): boolean {
  const validUntil = toDate(rx.validUntil) ?? toDate(rx.expiryDate);
  return validUntil ? validUntil.getTime() < now.getTime() : false;
}

export function canUsePrescriptionOnFile(
  rx: PrescriptionLike,
  now = new Date()
): PrescriptionUsabilityResult {
  if (rx.status !== "on_file")
    return {
      usable: false,
      reason: `Prescription status is '${rx.status}' — must be on file`,
    };
  if (rx.consentRevokedAt)
    return {
      usable: false,
      reason: "Prescription on-file consent was revoked",
    };
  if (isPrescriptionExpired(rx, now))
    return { usable: false, reason: "Prescription has expired" };
  if (
    rx.repeatDispenseCount !== null &&
    rx.repeatDispenseMax !== null &&
    rx.repeatDispenseCount !== undefined &&
    rx.repeatDispenseMax !== undefined &&
    rx.repeatDispenseCount >= rx.repeatDispenseMax
  ) {
    return { usable: false, reason: "Repeat dispense limit reached" };
  }
  return { usable: true };
}

export function assertPrescriptionUsableForCustomer(
  rx: PrescriptionLike | null | undefined,
  customerId: number,
  now = new Date()
): PrescriptionUsabilityResult {
  if (!rx) return { usable: false, reason: "Prescription not found" };
  if (rx.userId !== customerId)
    return {
      usable: false,
      reason: "Prescription does not belong to this customer",
    };
  return canUsePrescriptionOnFile(rx, now);
}

export async function markPrescriptionOnFileWithConsent(
  db: any,
  params: {
    prescriptionId: number;
    customerId: number;
    actorId: number;
    actorRole: string;
    consentSource: "app" | "whatsapp" | "pharmacist" | "doctor" | "manual";
  }
) {
  const now = new Date();
  await db
    .update(prescriptions)
    .set({
      status: "on_file",
      lane: "on_file",
      consentGivenAt: now,
      consentSource: params.consentSource,
      consentRevokedAt: null,
      onFileMarkedBy: params.actorId,
      onFileMarkedAt: now,
    })
    .where(
      and(
        eq(prescriptions.id, params.prescriptionId),
        eq(prescriptions.userId, params.customerId),
        eq(prescriptions.status, "approved")
      )
    );
}

export async function logPrescriptionVaultAccess(
  db: any,
  params: {
    actorId: number | null;
    actorRole: VaultActorRole;
    prescriptionId: number;
    purpose: string;
    channel: VaultAccessChannel;
    accessType?: "view" | "download" | "print" | "api_check" | "audit";
    actorType?: "user" | "system" | "whatsapp" | "scheduled";
  }
) {
  const timestamp = new Date();
  const actorId = params.actorId ?? 0;
  await db.insert(prescriptionAccessLog).values({
    prescriptionId: params.prescriptionId,
    accessedBy: actorId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    accessType: params.accessType ?? "view",
    purpose: params.purpose,
    channel: params.channel,
    accessedAt: timestamp,
  });
  const { writeAuditLog } = await import("../db");
  await writeAuditLog({
    actor: {
      id: params.actorId,
      role: params.actorRole,
      type:
        params.actorType ?? (params.actorRole === "system" ? "system" : "user"),
    },
    action: "prescription.vault_access",
    entityType: "prescription",
    entityId: params.prescriptionId,
    after: {
      prescriptionId: params.prescriptionId,
      purpose: params.purpose,
      channel: params.channel,
      timestamp: timestamp.toISOString(),
    },
    channel: params.channel,
  });
}
