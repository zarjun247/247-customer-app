import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { logAudit } from "./audit";
import { disposeBatch } from "./stockInvariant";

export const REQUIRED_PHARMACY_SOP_CODES = [
  "cashier_sale",
  "pharmacist_regulated_release",
  "purchase_inwarding",
  "stock_audit",
  "delivery_handover",
  "refund_return",
  "offline_manual_fallback",
  "cold_chain",
  "recall",
  "expiry_disposal",
] as const;

export type RequiredPharmacySopCode = typeof REQUIRED_PHARMACY_SOP_CODES[number];
export type CtxLike = { user?: { id?: number; role?: string | null }; req?: { headers?: Record<string, string | string[] | undefined>; ip?: string }; session?: { id?: string } };
export type ScheduleCategory = "OTC" | "H" | "H1" | "X" | "Rx" | string;

async function getDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function cleanText(value: unknown, max = 500): string | null {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function requirePositiveInt(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${label} is required` });
  return n;
}

function todayDateOnly(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateExpired(validUntil: unknown, now = new Date()) {
  if (!validUntil) return false;
  return new Date(String(validUntil)) < todayDateOnly(now);
}

function publicLicense(row: any) {
  if (!row) return null;
  const { documentStorageKey: _documentStorageKey, ...safe } = row;
  return safe;
}

function publicRegistration(row: any) {
  if (!row) return null;
  const { documentStorageKey: _documentStorageKey, ...safe } = row;
  return safe;
}

export async function getStoreLicenseStatus(storeId: number, now = new Date()) {
  const db = await getDb();
  const { pharmacyStoreLicenses } = await import("../../drizzle/schema");
  const rows = await db.select().from(pharmacyStoreLicenses).where(eq(pharmacyStoreLicenses.storeId, storeId)).orderBy(desc(pharmacyStoreLicenses.validUntil));
  const active = rows.find((row: any) => row.status === "active" && !dateExpired(row.validUntil, now));
  const blocking = rows.find((row: any) => row.status === "suspended") ?? rows.find((row: any) => row.status === "expired" || dateExpired(row.validUntil, now));
  return {
    storeId,
    status: active ? "active" : blocking ? (blocking.status === "suspended" ? "suspended" : "expired") : "missing",
    activeLicense: publicLicense(active),
    latestLicense: publicLicense(rows[0]),
    manualReviewRequired: !active,
  };
}

export async function assertStoreLicenseActiveForDispense(storeId: number, ctx?: CtxLike) {
  const status = await getStoreLicenseStatus(storeId);
  await logAudit({ action: "pharmacy.license.dispense_checked", entityType: "store", entityId: storeId, afterJson: status }, ctx);
  if (status.status !== "active") {
    await logAudit({ action: "pharmacy.license.dispense_blocked", entityType: "store", entityId: storeId, reason: `license_${status.status}`, afterJson: status }, ctx);
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Active pharmacy store license is required before regulated release" });
  }
  return status;
}

export async function listExpiringLicenses(input: { days?: number; storeId?: number } = {}) {
  const db = await getDb();
  const { pharmacyStoreLicenses } = await import("../../drizzle/schema");
  const days = Math.max(1, Math.min(input.days ?? 45, 365));
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const clauses = [eq(pharmacyStoreLicenses.status, "active"), lte(pharmacyStoreLicenses.validUntil, until)];
  if (input.storeId) clauses.push(eq(pharmacyStoreLicenses.storeId, input.storeId));
  const rows = await db.select().from(pharmacyStoreLicenses).where(and(...clauses)).orderBy(asc(pharmacyStoreLicenses.validUntil));
  return rows.map(publicLicense);
}

export async function attachLicenseDocument(input: { licenseId: number; documentStorageKey: string; actorId: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { pharmacyStoreLicenses } = await import("../../drizzle/schema");
  const key = cleanText(input.documentStorageKey, 500);
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Document storage key required" });
  await db.update(pharmacyStoreLicenses).set({ documentStorageKey: key }).where(eq(pharmacyStoreLicenses.id, input.licenseId));
  await logAudit({ action: "pharmacy.license.document_attached", entityType: "pharmacy_store_license", entityId: input.licenseId, actorId: input.actorId, afterJson: { documentAttached: true } }, ctx);
  return { id: input.licenseId, documentAttached: true };
}

export async function getLicenseAuditSummary(storeId: number) {
  const status = await getStoreLicenseStatus(storeId);
  return { ...status, documentStorageKeyExposed: false };
}

async function getActivePharmacistRegistration(userId: number, now = new Date()) {
  const db = await getDb();
  const { pharmacistRegistrations } = await import("../../drizzle/schema");
  const rows = await db.select().from(pharmacistRegistrations).where(and(eq(pharmacistRegistrations.userId, userId), eq(pharmacistRegistrations.status, "active"))).orderBy(desc(pharmacistRegistrations.validUntil));
  return rows.find((row: any) => !dateExpired(row.validUntil, now)) ?? null;
}

async function assertActivePharmacistRegistration(userId: number) {
  const registration = await getActivePharmacistRegistration(userId);
  if (!registration) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Active pharmacist registration is required" });
  return registration;
}

export async function startPharmacistDutySession(input: { storeId: number; pharmacistUserId: number; openedBy: number; notes?: string }, ctx?: CtxLike) {
  const db = await getDb();
  const { pharmacistDutySessions } = await import("../../drizzle/schema");
  await assertActivePharmacistRegistration(input.pharmacistUserId);
  const active = await getActivePharmacistOnDuty(input.storeId);
  if (active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A pharmacist duty session is already active for this store" });
  const [result] = await db.insert(pharmacistDutySessions).values({ storeId: input.storeId, pharmacistUserId: input.pharmacistUserId, openedBy: input.openedBy, notes: cleanText(input.notes) ?? undefined });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.pharmacist_duty.started", entityType: "pharmacist_duty_session", entityId: id, actorId: input.openedBy, storeId: input.storeId, afterJson: { storeId: input.storeId, pharmacistUserId: input.pharmacistUserId } }, ctx);
  return { id, storeId: input.storeId, pharmacistUserId: input.pharmacistUserId, status: "active" as const };
}

export async function endPharmacistDutySession(input: { sessionId: number; closedBy: number; status?: "closed" | "interrupted"; notes?: string }, ctx?: CtxLike) {
  const db = await getDb();
  const { pharmacistDutySessions } = await import("../../drizzle/schema");
  const [session] = await db.select().from(pharmacistDutySessions).where(eq(pharmacistDutySessions.id, input.sessionId)).limit(1);
  if (!session || session.status !== "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Active duty session required" });
  await db.update(pharmacistDutySessions).set({ status: input.status ?? "closed", endedAt: new Date(), closedBy: input.closedBy, notes: cleanText(input.notes) ?? session.notes }).where(eq(pharmacistDutySessions.id, input.sessionId));
  await logAudit({ action: "pharmacy.pharmacist_duty.ended", entityType: "pharmacist_duty_session", entityId: input.sessionId, actorId: input.closedBy, storeId: session.storeId, afterJson: { status: input.status ?? "closed" } }, ctx);
  return { id: input.sessionId, status: input.status ?? "closed" };
}

export async function getActivePharmacistOnDuty(storeId: number) {
  const db = await getDb();
  const { pharmacistDutySessions } = await import("../../drizzle/schema");
  const [session] = await db.select().from(pharmacistDutySessions).where(and(eq(pharmacistDutySessions.storeId, storeId), eq(pharmacistDutySessions.status, "active"), isNull(pharmacistDutySessions.endedAt))).orderBy(desc(pharmacistDutySessions.startedAt)).limit(1);
  if (!session) return null;
  const registration = await getActivePharmacistRegistration(session.pharmacistUserId);
  if (!registration) return null;
  return { ...session, pharmacistRegistration: publicRegistration(registration) };
}

export async function assertPharmacistOnDutyForRegulatedRelease(storeId: number, pharmacistUserId?: number, ctx?: CtxLike) {
  const active = await getActivePharmacistOnDuty(storeId);
  await logAudit({ action: "pharmacy.pharmacist_duty.release_checked", entityType: "store", entityId: storeId, afterJson: { storeId, pharmacistUserId, activeDutySessionId: active?.id ?? null } }, ctx);
  if (!active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Active pharmacist-on-duty session is required before regulated release" });
  if (pharmacistUserId && active.pharmacistUserId !== pharmacistUserId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Regulated release must be approved by the pharmacist currently on duty" });
  return active;
}

export async function getPharmacistDutyAuditSummary(storeId: number) {
  const active = await getActivePharmacistOnDuty(storeId);
  return { storeId, activeDutySession: active ? { id: active.id, pharmacistUserId: active.pharmacistUserId, startedAt: active.startedAt } : null };
}

export function isRegulatedSchedule(schedule: ScheduleCategory | null | undefined, requiresPrescription?: boolean) {
  const normalized = String(schedule ?? "").toUpperCase();
  return requiresPrescription === true || ["H", "H1", "X", "RX"].includes(normalized);
}

export function evaluateRegulatedReleasePolicy(input: {
  scheduleCategory?: ScheduleCategory | null;
  requiresPrescription?: boolean;
  storeLicenseStatus?: string | null;
  hasPharmacistOnDuty?: boolean;
  pharmacistRegistered?: boolean;
  prescriptionId?: number | null;
  patientRef?: string | null;
  doctorName?: string | null;
  doctorRef?: string | null;
  batchRef?: string | null;
  quantity?: number | null;
  unresolvedColdChainBreach?: boolean;
  recalledBatch?: boolean;
  paymentVerified?: boolean;
  reservationStatus?: string | null;
}) {
  const regulated = isRegulatedSchedule(input.scheduleCategory, input.requiresPrescription);
  const reasons: string[] = [];
  if (!regulated) return { allowed: true, regulated, reasons, paymentOrReservationBypass: false };
  if (input.storeLicenseStatus !== "active") reasons.push("active_store_license_required");
  if (!input.hasPharmacistOnDuty) reasons.push("active_pharmacist_duty_required");
  if (!input.pharmacistRegistered) reasons.push("active_pharmacist_registration_required");
  if (input.requiresPrescription !== false && !input.prescriptionId) reasons.push("prescription_reference_required");
  if (!cleanText(input.patientRef, 200)) reasons.push("patient_ref_required");
  if (["H1", "X", "RX"].includes(String(input.scheduleCategory ?? "").toUpperCase()) && !cleanText(input.doctorName ?? input.doctorRef, 200)) reasons.push("doctor_evidence_required");
  if (!input.quantity || input.quantity <= 0) reasons.push("positive_quantity_required");
  if (input.unresolvedColdChainBreach) reasons.push("unresolved_cold_chain_breach");
  if (input.recalledBatch) reasons.push("batch_recalled");
  const paymentOrReservationBypass = !!input.paymentVerified || input.reservationStatus === "consumed" || input.reservationStatus === "active";
  return { allowed: reasons.length === 0, regulated, reasons, paymentOrReservationBypass };
}

export async function createRegulatedReleaseReview(input: ReleaseEvidenceInput, ctx?: CtxLike) {
  return recordRegulatedReleaseEvidence({ ...input, releaseStatus: "pending_review" }, ctx);
}

export async function approveRegulatedRelease(input: { evidenceId: number; pharmacistUserId: number; reason?: string }, ctx?: CtxLike) {
  await assertActivePharmacistRegistration(input.pharmacistUserId);
  const db = await getDb();
  const { regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const [row] = await db.select().from(regulatedReleaseEvidence).where(eq(regulatedReleaseEvidence.id, input.evidenceId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Release evidence not found" });
  if (row.pharmacistUserId !== input.pharmacistUserId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only the responsible pharmacist can approve regulated release" });
  await db.update(regulatedReleaseEvidence).set({ releaseStatus: "approved", approvedAt: new Date(), releaseReason: cleanText(input.reason) }).where(eq(regulatedReleaseEvidence.id, input.evidenceId));
  await logAudit({ action: "regulated.release_evidence.approved", entityType: "regulated_release_evidence", entityId: input.evidenceId, actorId: input.pharmacistUserId, storeId: row.storeId, afterJson: { releaseStatus: "approved" } }, ctx);
  return { id: input.evidenceId, releaseStatus: "approved" as const };
}

export async function rejectRegulatedRelease(input: { evidenceId: number; pharmacistUserId: number; reason: string }, ctx?: CtxLike) {
  await assertActivePharmacistRegistration(input.pharmacistUserId);
  const db = await getDb();
  const { regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const reason = cleanText(input.reason);
  if (!reason) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Rejection reason required" });
  await db.update(regulatedReleaseEvidence).set({ releaseStatus: "rejected", releaseReason: reason }).where(eq(regulatedReleaseEvidence.id, input.evidenceId));
  await logAudit({ action: "regulated.release_evidence.rejected", entityType: "regulated_release_evidence", entityId: input.evidenceId, actorId: input.pharmacistUserId, reason }, ctx);
  return { id: input.evidenceId, releaseStatus: "rejected" as const };
}

type ReleaseEvidenceInput = {
  saleId?: string | null; orderId?: number | null; saleLineId?: string | null; orderItemId?: number | null; prescriptionId?: number | null; storeId: number; pharmacistUserId: number; pharmacistDutySessionId?: number | null; patientRef?: string | null; doctorRef?: string | null; doctorName?: string | null; scheduleCategory?: string | null; drugName: string; batchRef?: string | null; quantity: number; releaseStatus?: "blocked" | "pending_review" | "approved" | "rejected" | "released"; releaseReason?: string | null;
};

export async function recordRegulatedReleaseEvidence(input: ReleaseEvidenceInput, ctx?: CtxLike) {
  const policy = await assertRegulatedReleaseAllowed(input, ctx);
  const db = await getDb();
  const { regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const [result] = await db.insert(regulatedReleaseEvidence).values({
    saleId: cleanText(input.saleId, 36), orderId: input.orderId ?? undefined, saleLineId: cleanText(input.saleLineId, 36), orderItemId: input.orderItemId ?? undefined, prescriptionId: input.prescriptionId ?? undefined, storeId: input.storeId, pharmacistUserId: input.pharmacistUserId, pharmacistDutySessionId: input.pharmacistDutySessionId ?? undefined, patientRef: cleanText(input.patientRef, 200), doctorRef: cleanText(input.doctorRef, 200), doctorName: cleanText(input.doctorName, 200), scheduleCategory: cleanText(input.scheduleCategory, 20), drugName: cleanText(input.drugName, 300) ?? "regulated-medicine", batchRef: cleanText(input.batchRef, 120), quantity: input.quantity, releaseStatus: input.releaseStatus ?? "pending_review", releaseReason: cleanText(input.releaseReason),
  });
  const id = Number(result.insertId);
  await logAudit({ action: "regulated.release_evidence.recorded", entityType: "regulated_release_evidence", entityId: id, actorId: input.pharmacistUserId, storeId: input.storeId, afterJson: { ...policy, drugName: input.drugName, scheduleCategory: input.scheduleCategory, batchRef: input.batchRef, quantity: input.quantity } }, ctx);
  return { id, releaseStatus: input.releaseStatus ?? "pending_review" };
}

export async function getRegulatedReleaseEvidencePack(input: { evidenceId?: number; saleId?: string; orderId?: number }) {
  const db = await getDb();
  const { regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const clauses = [];
  if (input.evidenceId) clauses.push(eq(regulatedReleaseEvidence.id, input.evidenceId));
  if (input.saleId) clauses.push(eq(regulatedReleaseEvidence.saleId, input.saleId));
  if (input.orderId) clauses.push(eq(regulatedReleaseEvidence.orderId, input.orderId));
  if (!clauses.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Evidence, sale, or order reference required" });
  const rows = await db.select().from(regulatedReleaseEvidence).where(and(...clauses)).orderBy(desc(regulatedReleaseEvidence.createdAt));
  return { rows, secretFieldsExposed: false };
}

export async function assertRegulatedReleaseAllowed(input: ReleaseEvidenceInput, ctx?: CtxLike) {
  const license = await assertStoreLicenseActiveForDispense(input.storeId, ctx);
  const duty = await assertPharmacistOnDutyForRegulatedRelease(input.storeId, input.pharmacistUserId, ctx);
  const registration = await assertActivePharmacistRegistration(input.pharmacistUserId);
  let unresolvedColdChainBreach = false;
  let recalledBatch = false;
  if (input.batchRef) {
    unresolvedColdChainBreach = await hasUnresolvedColdChainBreachForBatch(input.batchRef);
    recalledBatch = await hasOpenRecallForBatch(input.batchRef, input.storeId);
  }
  const policy = evaluateRegulatedReleasePolicy({ scheduleCategory: input.scheduleCategory, requiresPrescription: true, storeLicenseStatus: license.status, hasPharmacistOnDuty: !!duty, pharmacistRegistered: !!registration, prescriptionId: input.prescriptionId ?? null, patientRef: input.patientRef ?? null, doctorName: input.doctorName ?? null, doctorRef: input.doctorRef ?? null, batchRef: input.batchRef ?? null, quantity: input.quantity, unresolvedColdChainBreach, recalledBatch });
  if (!policy.allowed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Regulated release blocked: ${policy.reasons.join(", ")}` });
  return policy;
}

async function hasUnresolvedColdChainBreachForBatch(batchRef: string) {
  const batchId = Number(batchRef);
  if (!Number.isInteger(batchId) || batchId <= 0) return false;
  const db = await getDb();
  const { coldChainBreaches } = await import("../../drizzle/schema");
  const rows = await db.select({ id: coldChainBreaches.id }).from(coldChainBreaches).where(and(eq(coldChainBreaches.batchId, batchId), inArray(coldChainBreaches.status, ["open", "quarantined"]))).limit(1);
  return rows.length > 0;
}

async function hasOpenRecallForBatch(batchRef: string, storeId: number) {
  const db = await getDb();
  const { batchRecalls } = await import("../../drizzle/schema");
  const rows = await db.select({ id: batchRecalls.id }).from(batchRecalls).where(and(eq(batchRecalls.storeId, storeId), eq(batchRecalls.batchRef, batchRef), inArray(batchRecalls.status, ["open", "quarantined", "notifications_pending"]))).limit(1);
  return rows.length > 0;
}

export async function recordManualTemperatureLog(input: { storeId: number; batchId?: number; productId?: number; temperatureCelsius: number; recordedBy: number; notes?: string }, ctx?: CtxLike) {
  const db = await getDb();
  const { pharmacyTemperatureLogs } = await import("../../drizzle/schema");
  const [result] = await db.insert(pharmacyTemperatureLogs).values({ storeId: input.storeId, batchId: input.batchId, productId: input.productId, temperatureCelsius: String(input.temperatureCelsius), source: "manual", recordedBy: input.recordedBy, notes: cleanText(input.notes) ?? undefined });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.cold_chain.temperature_manual_recorded", entityType: "pharmacy_temperature_log", entityId: id, actorId: input.recordedBy, storeId: input.storeId, afterJson: { source: "manual", batchId: input.batchId, productId: input.productId } }, ctx);
  return { id, source: "manual" as const };
}

export async function recordColdChainBreach(input: { storeId: number; batchId?: number; productId?: number; temperatureLogId?: number; severity?: "watch" | "minor" | "major" | "critical"; description: string; actorId: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { coldChainBreaches } = await import("../../drizzle/schema");
  const [result] = await db.insert(coldChainBreaches).values({ storeId: input.storeId, batchId: input.batchId, productId: input.productId, temperatureLogId: input.temperatureLogId, severity: input.severity ?? "major", status: "open", description: cleanText(input.description) ?? "Cold-chain breach requires review" });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.cold_chain.breach_recorded", entityType: "cold_chain_breach", entityId: id, actorId: input.actorId, storeId: input.storeId, afterJson: { batchId: input.batchId, productId: input.productId, status: "open" } }, ctx);
  return { id, status: "open" as const };
}

export async function assertNoUnresolvedColdChainBreachForBatch(batchId: number) {
  if (await hasUnresolvedColdChainBreachForBatch(String(batchId))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unresolved cold-chain breach blocks affected batch release" });
  return { ok: true };
}

export async function createBatchRecall(input: { storeId: number; batchRef: string; productId?: number; reason: string; initiatedBy: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { batchRecalls } = await import("../../drizzle/schema");
  const reason = cleanText(input.reason);
  if (!reason) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Recall reason required" });
  const [result] = await db.insert(batchRecalls).values({ storeId: input.storeId, batchRef: cleanText(input.batchRef, 120) ?? input.batchRef, productId: input.productId, reason, initiatedBy: input.initiatedBy });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.batch_recall.created", entityType: "batch_recall", entityId: id, actorId: input.initiatedBy, storeId: input.storeId, afterJson: { batchRef: input.batchRef, status: "open" } }, ctx);
  return { id, status: "open" as const };
}

export async function listAffectedCustomersForRecall(recallId: number) {
  const db = await getDb();
  const { batchRecalls, regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const [recall] = await db.select().from(batchRecalls).where(eq(batchRecalls.id, recallId)).limit(1);
  if (!recall) throw new TRPCError({ code: "NOT_FOUND", message: "Recall not found" });
  const rows = await db.select({ saleId: regulatedReleaseEvidence.saleId, saleLineId: regulatedReleaseEvidence.saleLineId, customerRef: regulatedReleaseEvidence.patientRef }).from(regulatedReleaseEvidence).where(and(eq(regulatedReleaseEvidence.storeId, recall.storeId), eq(regulatedReleaseEvidence.batchRef, recall.batchRef)));
  return rows;
}

export async function quarantineRecalledBatch(input: { recallId: number; actorId: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { batchRecalls, batchLedger } = await import("../../drizzle/schema");
  const [recall] = await db.select().from(batchRecalls).where(eq(batchRecalls.id, input.recallId)).limit(1);
  if (!recall) throw new TRPCError({ code: "NOT_FOUND", message: "Recall not found" });
  const batchId = Number(recall.batchRef);
  if (Number.isInteger(batchId) && batchId > 0) await db.update(batchLedger).set({ status: "recalled" }).where(eq(batchLedger.id, batchId));
  await db.update(batchRecalls).set({ status: "quarantined" }).where(eq(batchRecalls.id, input.recallId));
  await logAudit({ action: "pharmacy.batch_recall.quarantined", entityType: "batch_recall", entityId: input.recallId, actorId: input.actorId, storeId: recall.storeId, afterJson: { batchRef: recall.batchRef, status: "quarantined" } }, ctx);
  return { id: input.recallId, status: "quarantined" as const };
}

export async function recordRecallCustomerNotificationTask(input: { recallId: number; saleId?: string; saleLineId?: string; customerRef?: string; actorId: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { batchRecallCustomerImpacts } = await import("../../drizzle/schema");
  const [result] = await db.insert(batchRecallCustomerImpacts).values({ recallId: input.recallId, saleId: cleanText(input.saleId, 36), saleLineId: cleanText(input.saleLineId, 36), customerRef: cleanText(input.customerRef, 200), notificationStatus: "pending" });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.batch_recall.notification_task_recorded", entityType: "batch_recall_customer_impact", entityId: id, actorId: input.actorId, afterJson: { recallId: input.recallId, notificationStatus: "pending" } }, ctx);
  return { id, notificationStatus: "pending" as const };
}

export async function closeRecallWithPharmacistApproval(input: { recallId: number; approvedBy: number }, ctx?: CtxLike) {
  await assertActivePharmacistRegistration(input.approvedBy);
  const db = await getDb();
  const { batchRecalls } = await import("../../drizzle/schema");
  await db.update(batchRecalls).set({ status: "closed", approvedBy: input.approvedBy, closedAt: new Date() }).where(eq(batchRecalls.id, input.recallId));
  await logAudit({ action: "pharmacy.batch_recall.closed", entityType: "batch_recall", entityId: input.recallId, actorId: input.approvedBy, afterJson: { status: "closed" } }, ctx);
  return { id: input.recallId, status: "closed" as const };
}

export async function createExpiredMedicineDisposalRecord(input: { storeId: number; batchId?: number; batchRef: string; productId?: number; quantity: number; reason: string; createdBy: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { expiredMedicineDisposals } = await import("../../drizzle/schema");
  const [result] = await db.insert(expiredMedicineDisposals).values({ storeId: input.storeId, batchId: input.batchId, batchRef: cleanText(input.batchRef, 120) ?? input.batchRef, productId: input.productId, quantity: requirePositiveInt(input.quantity, "Disposal quantity"), reason: cleanText(input.reason) ?? "Expired medicine disposal", createdBy: input.createdBy, status: "pending_approval" });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.expiry_disposal.created", entityType: "expired_medicine_disposal", entityId: id, actorId: input.createdBy, storeId: input.storeId, afterJson: { batchId: input.batchId, batchRef: input.batchRef, quantity: input.quantity, status: "pending_approval" } }, ctx);
  return { id, status: "pending_approval" as const };
}

export async function approveDisposal(input: { disposalId: number; approvedBy: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { expiredMedicineDisposals } = await import("../../drizzle/schema");
  const [row] = await db.select().from(expiredMedicineDisposals).where(eq(expiredMedicineDisposals.id, input.disposalId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Disposal record not found" });
  await db.update(expiredMedicineDisposals).set({ status: "approved", approvedBy: input.approvedBy, approvedAt: new Date() }).where(eq(expiredMedicineDisposals.id, input.disposalId));
  await logAudit({ action: "pharmacy.expiry_disposal.approved", entityType: "expired_medicine_disposal", entityId: input.disposalId, actorId: input.approvedBy, storeId: row.storeId, afterJson: { status: "approved" } }, ctx);
  return { id: input.disposalId, status: "approved" as const };
}

export async function linkDisposalToStockQuarantine(input: { disposalId: number; actorId: number }, ctx?: CtxLike) {
  const db = await getDb();
  const { expiredMedicineDisposals } = await import("../../drizzle/schema");
  const [row] = await db.select().from(expiredMedicineDisposals).where(eq(expiredMedicineDisposals.id, input.disposalId)).limit(1);
  if (!row || row.status !== "approved" || !row.batchId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Approved disposal with batch id required" });
  const movement = await disposeBatch({ batchId: row.batchId, storeId: row.storeId, qtyDelta: Math.abs(row.quantity), referenceType: "expired_disposal", referenceId: row.id, reason: `Approved expired medicine disposal ${row.id}`, actor: { actorId: input.actorId, actorRole: ctx?.user?.role ?? "pharmacist", source: "admin" }, productId: row.productId ?? undefined });
  await db.update(expiredMedicineDisposals).set({ status: "disposed", disposedAt: new Date() }).where(eq(expiredMedicineDisposals.id, input.disposalId));
  await logAudit({ action: "pharmacy.expiry_disposal.stock_invariant_linked", entityType: "expired_medicine_disposal", entityId: input.disposalId, actorId: input.actorId, storeId: row.storeId, afterJson: { movement, status: "disposed" } }, ctx);
  return { id: input.disposalId, status: "disposed" as const, movement };
}

export async function generateDisposalRegister(input: { storeId: number; dateFrom?: string; dateTo?: string }) {
  const db = await getDb();
  const { expiredMedicineDisposals } = await import("../../drizzle/schema");
  const rows = await db.select().from(expiredMedicineDisposals).where(eq(expiredMedicineDisposals.storeId, input.storeId)).orderBy(desc(expiredMedicineDisposals.createdAt));
  return { storeId: input.storeId, rows, generatedAt: new Date().toISOString(), legalAcceptanceClaimed: false };
}

export async function acknowledgeSop(input: { userId: number; sopCode: RequiredPharmacySopCode | string; sopVersion: string; ipHash?: string; deviceRef?: string }, ctx?: CtxLike) {
  if (!REQUIRED_PHARMACY_SOP_CODES.includes(input.sopCode as RequiredPharmacySopCode)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unknown pharmacy SOP code" });
  const db = await getDb();
  const { pharmacySopAcknowledgements } = await import("../../drizzle/schema");
  const [result] = await db.insert(pharmacySopAcknowledgements).values({ userId: input.userId, sopCode: input.sopCode, sopVersion: input.sopVersion, ipHash: cleanText(input.ipHash, 128), deviceRef: cleanText(input.deviceRef, 200) }).onDuplicateKeyUpdate({ set: { acknowledgedAt: sql`CURRENT_TIMESTAMP`, ipHash: cleanText(input.ipHash, 128), deviceRef: cleanText(input.deviceRef, 200) } });
  await logAudit({ action: "pharmacy.sop.acknowledged", entityType: "pharmacy_sop_acknowledgement", actorId: input.userId, afterJson: { sopCode: input.sopCode, sopVersion: input.sopVersion } }, ctx);
  return { id: Number(result.insertId ?? 0), userId: input.userId, sopCode: input.sopCode, sopVersion: input.sopVersion, acknowledgedAtRecorded: true };
}

export async function requireSopAcknowledgementForRole(input: { userId: number; role: string; sopVersion: string; sopCodes?: string[] }) {
  const missing = await listMissingSopAcknowledgements(input);
  if (missing.missingSopCodes.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Missing SOP acknowledgements: ${missing.missingSopCodes.join(", ")}` });
  return { ok: true };
}

export async function listMissingSopAcknowledgements(input: { userId: number; role?: string; sopVersion: string; sopCodes?: string[] }) {
  const db = await getDb();
  const { pharmacySopAcknowledgements } = await import("../../drizzle/schema");
  const required = input.sopCodes?.length ? input.sopCodes : REQUIRED_PHARMACY_SOP_CODES;
  const rows = await db.select({ sopCode: pharmacySopAcknowledgements.sopCode }).from(pharmacySopAcknowledgements).where(and(eq(pharmacySopAcknowledgements.userId, input.userId), eq(pharmacySopAcknowledgements.sopVersion, input.sopVersion), inArray(pharmacySopAcknowledgements.sopCode, [...required])));
  const acknowledged = new Set(rows.map((row: any) => row.sopCode));
  return { userId: input.userId, sopVersion: input.sopVersion, missingSopCodes: required.filter((code) => !acknowledged.has(code)) };
}

export async function generateInspectionExportManifest(input: { storeId: number; dateFrom: string; dateTo: string; generatedBy: number; exportType?: string }, ctx?: CtxLike) {
  const db = await getDb();
  const { pharmacyInspectionExports } = await import("../../drizzle/schema");
  const manifest = {
    storeId: input.storeId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    sections: ["regulated_release", "h1_reference", "license_and_duty", "recall_and_disposal"],
    redactions: ["document_storage_key", "prescription_image_key", "provider_secret", "raw_payment_signature", "full_patient_contact"],
    generatedAt: new Date().toISOString(),
    regulatorAcceptanceClaimed: false,
    counselAndPharmacistReviewRequired: true,
  };
  const [result] = await db.insert(pharmacyInspectionExports).values({ storeId: input.storeId, exportType: input.exportType ?? "inspection_manifest", dateFrom: new Date(input.dateFrom), dateTo: new Date(input.dateTo), status: "generated", generatedBy: input.generatedBy });
  const id = Number(result.insertId);
  await logAudit({ action: "pharmacy.inspection_export.generated", entityType: "pharmacy_inspection_export", entityId: id, actorId: input.generatedBy, storeId: input.storeId, afterJson: manifest }, ctx);
  return { id, manifest };
}

export async function generateRegulatedReleaseExport(input: { storeId: number; dateFrom: string; dateTo: string }) {
  const db = await getDb();
  const { regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const rows = await db.select().from(regulatedReleaseEvidence).where(eq(regulatedReleaseEvidence.storeId, input.storeId)).orderBy(desc(regulatedReleaseEvidence.createdAt));
  return { rows: rows.map((row: any) => ({ ...row, patientRef: row.patientRef ? "redacted" : null })), secretFieldsExposed: false };
}

export async function generateH1ExportReference(input: { storeId: number; dateFrom: string; dateTo: string }) {
  return { storeId: input.storeId, dateFrom: input.dateFrom, dateTo: input.dateTo, h1ExportSource: "h1_register", regulatorAcceptanceClaimed: false };
}

export async function generateLicenseAndDutyExport(input: { storeId: number }) {
  return { license: await getLicenseAuditSummary(input.storeId), duty: await getPharmacistDutyAuditSummary(input.storeId), documentStorageKeyExposed: false };
}

export async function generateRecallAndDisposalExport(input: { storeId: number; dateFrom?: string; dateTo?: string }) {
  const db = await getDb();
  const { batchRecalls, expiredMedicineDisposals } = await import("../../drizzle/schema");
  const recalls = await db.select().from(batchRecalls).where(eq(batchRecalls.storeId, input.storeId)).orderBy(desc(batchRecalls.createdAt));
  const disposals = await db.select().from(expiredMedicineDisposals).where(eq(expiredMedicineDisposals.storeId, input.storeId)).orderBy(desc(expiredMedicineDisposals.createdAt));
  return { recalls, disposals, regulatorAcceptanceClaimed: false };
}

export async function assertRegulatedEvidencePackForSale(saleId: string, ctx?: CtxLike) {
  const db = await getDb();
  const { sales, saleLines, products, regulatedReleaseEvidence } = await import("../../drizzle/schema");
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  const regulatedLineIds: string[] = [];
  for (const line of lines) {
    const [product] = await db.select({ schedule: products.schedule, requiresPrescription: products.requiresPrescription }).from(products).where(eq(products.id, Number(line.productId))).limit(1);
    if (isRegulatedSchedule(product?.schedule ?? line.scheduleCode, !!product?.requiresPrescription || !!line.requiresPrescription)) regulatedLineIds.push(String(line.id));
  }
  if (regulatedLineIds.length === 0) return { ok: true, regulatedLineIds };
  await assertStoreLicenseActiveForDispense(Number(sale.storeId), ctx);
  await assertPharmacistOnDutyForRegulatedRelease(Number(sale.storeId), ctx?.user?.id, ctx);
  const rows = await db.select().from(regulatedReleaseEvidence).where(and(eq(regulatedReleaseEvidence.saleId, saleId), inArray(regulatedReleaseEvidence.saleLineId, regulatedLineIds), inArray(regulatedReleaseEvidence.releaseStatus, ["approved", "released"])));
  const approvedLineIds = new Set(rows.map((row: any) => String(row.saleLineId)));
  const missing = regulatedLineIds.filter((id) => !approvedLineIds.has(id));
  await logAudit({ action: "regulated.release_evidence.pack_checked", entityType: "sale", entityRef: saleId, storeId: Number(sale.storeId), afterJson: { regulatedLineIds, approvedCount: approvedLineIds.size, missing } }, ctx);
  if (missing.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Approved regulated release evidence pack is required before sale confirmation" });
  return { ok: true, regulatedLineIds, evidenceCount: rows.length };
}
