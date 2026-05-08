import crypto from "node:crypto";
import { logAudit } from "./audit";
import { redactSensitive, safeRef } from "./legalOpsRedaction";

export type RegulatedDecision = "approved" | "rejected" | "clarification_required";
export type ScheduleFlag = "OTC" | "H" | "H1" | "X" | string;

export interface RegulatedReleaseInput {
  orderId?: string | number | null;
  saleId?: string | number | null;
  saleLineId?: string | number | null;
  saleLineRef?: string | number | null;
  productId?: string | number | null;
  batchId?: string | number | null;
  batchLedgerId?: string | number | null;
  prescriptionId?: string | number | null;
  h1RegisterId?: string | number | null;
  h1Ref?: string | number | null;
  customerId?: string | number | null;
  storeId?: string | number | null;
  pharmacistId?: string | number | null;
  actorType?: "pharmacist" | "staff" | "ai" | "system" | string;
  scheduleFlag?: ScheduleFlag | null;
  classification?: ScheduleFlag | null;
  prescription?: {
    id?: string | number | null;
    present?: boolean;
    expired?: boolean;
    revoked?: boolean;
    doctorName?: string | null;
    doctorRegistrationNo?: string | null;
    patientIdentity?: string | null;
    fileBlob?: unknown;
    imageUrl?: string | null;
    token?: string | null;
  } | null;
  doctorRegistrationRequired?: boolean;
  decision: RegulatedDecision;
  reason?: string | null;
  notes?: string | null;
  releaseTimestamp?: Date;
}

export interface RegulatedReleaseEvidence {
  orderId: string | null;
  saleId: string | null;
  saleLineRef: string | null;
  productId: string | null;
  batchId: string | null;
  batchLedgerId: string | null;
  prescriptionId: string | null;
  h1RegisterId: string | null;
  h1Ref: string | null;
  customerId: string | null;
  storeId: string | null;
  pharmacistId: string | null;
  scheduleFlag: string | null;
  decision: RegulatedDecision;
  checklistJson: Record<string, boolean>;
  missingFieldsJson: string[];
  evidenceHash: string;
  notes: string | null;
  createdAt: Date;
}

const REGULATED = new Set(["H", "H1", "X"]);

export function buildRegulatedReleaseProof(input: RegulatedReleaseInput): RegulatedReleaseEvidence {
  const schedule = safeRef(input.scheduleFlag ?? input.classification)?.toUpperCase() ?? null;
  const prescription = input.prescription ?? null;
  const prescriptionId = safeRef(input.prescriptionId ?? prescription?.id);
  const h1RegisterId = safeRef(input.h1RegisterId);
  const h1Ref = safeRef(input.h1Ref);
  const pharmacistId = safeRef(input.pharmacistId);
  const actorType = safeRef(input.actorType)?.toLowerCase() ?? null;
  const requiresHumanRelease = schedule ? REGULATED.has(schedule) : true;

  const checklistJson = {
    validPrescriptionPresent: Boolean(prescriptionId && prescription?.present !== false && !prescription?.expired && !prescription?.revoked),
    prescriptionNotExpiredOrRevoked: Boolean(prescriptionId && !prescription?.expired && !prescription?.revoked),
    doctorNameCaptured: Boolean(prescription?.doctorName),
    doctorRegistrationCaptured: !input.doctorRegistrationRequired || Boolean(prescription?.doctorRegistrationNo),
    patientIdentityCaptured: Boolean(prescription?.patientIdentity ?? input.customerId),
    scheduleFlagPresent: Boolean(schedule),
    regulatedClassificationPresent: Boolean(schedule),
    h1EvidencePresent: schedule !== "H1" || Boolean(h1RegisterId || h1Ref),
    pharmacistActorRecorded: Boolean(pharmacistId && actorType === "pharmacist"),
    productRefStringSafe: safeRef(input.productId) !== null,
    batchRefStringSafe: safeRef(input.batchId ?? input.batchLedgerId) !== null,
    humanApprovalForRegulated: !requiresHumanRelease || actorType === "pharmacist",
    aiDidNotApprove: !(input.decision === "approved" && ["ai", "system"].includes(actorType ?? "")),
  };

  const missingFieldsJson = Object.entries(checklistJson).filter(([, ok]) => !ok).map(([field]) => field);
  if (input.decision !== "approved" && !input.reason) missingFieldsJson.push("reasonForNonApproval");
  if (input.decision === "approved" && missingFieldsJson.length > 0) missingFieldsJson.push("approvedReleaseBlockedByIncompleteChecklist");

  const evidenceBase = redactSensitive({
    orderId: safeRef(input.orderId), saleId: safeRef(input.saleId), saleLineRef: safeRef(input.saleLineRef ?? input.saleLineId),
    productId: safeRef(input.productId), batchId: safeRef(input.batchId), batchLedgerId: safeRef(input.batchLedgerId), prescriptionId,
    h1RegisterId, h1Ref, customerId: safeRef(input.customerId), storeId: safeRef(input.storeId), pharmacistId, scheduleFlag: schedule,
    decision: input.decision, checklistJson, missingFieldsJson, notes: input.notes ?? null,
  });
  const evidenceHash = crypto.createHash("sha256").update(JSON.stringify(evidenceBase)).digest("hex");

  return {
    orderId: safeRef(input.orderId), saleId: safeRef(input.saleId), saleLineRef: safeRef(input.saleLineRef ?? input.saleLineId), productId: safeRef(input.productId),
    batchId: safeRef(input.batchId), batchLedgerId: safeRef(input.batchLedgerId), prescriptionId, h1RegisterId, h1Ref, customerId: safeRef(input.customerId),
    storeId: safeRef(input.storeId), pharmacistId, scheduleFlag: schedule, decision: missingFieldsJson.length && input.decision === "approved" ? "rejected" : input.decision,
    checklistJson, missingFieldsJson, evidenceHash, notes: input.notes ?? input.reason ?? null, createdAt: input.releaseTimestamp ?? new Date(),
  };
}

export async function recordRegulatedReleaseProof(input: RegulatedReleaseInput, deps?: { db?: any; ctx?: any }) {
  const evidence = buildRegulatedReleaseProof(input);
  if (deps?.db) {
    const { regulatedReleaseEvents } = await import("../../drizzle/schema");
    await deps.db.insert(regulatedReleaseEvents).values({
      orderId: evidence.orderId, saleId: evidence.saleId, saleLineRef: evidence.saleLineRef, productId: evidence.productId, batchId: evidence.batchId,
      batchLedgerId: evidence.batchLedgerId, prescriptionId: evidence.prescriptionId, h1RegisterId: evidence.h1RegisterId, h1Ref: evidence.h1Ref,
      customerId: evidence.customerId, storeId: evidence.storeId, pharmacistId: evidence.pharmacistId, scheduleFlag: evidence.scheduleFlag,
      decision: evidence.decision, checklistJson: evidence.checklistJson, missingFieldsJson: evidence.missingFieldsJson, evidenceHash: evidence.evidenceHash, notes: evidence.notes,
    });
  }
  await logAudit({ action: evidence.decision === "approved" ? "regulated.release_proof_approved" : "regulated.release_proof_blocked", entityType: "regulated_release_event", entityRef: evidence.saleId ?? evidence.orderId ?? evidence.productId ?? undefined, afterJson: redactSensitive(evidence) }, deps?.ctx);
  return evidence;
}
