import { logAudit } from "./audit";
import { safeRef } from "./legalOpsRedaction";

export const SOP_ACK_TYPES = ["prescription_review", "h1_register", "cold_chain", "recall", "stock_quarantine", "expiry_disposal", "refund_cancellation", "privacy_prescription_access"] as const;
export type SopAcknowledgementType = typeof SOP_ACK_TYPES[number];
export interface SopAcknowledgement { staffId: string; sopType: SopAcknowledgementType; version: string; acknowledgedAt: Date; expiresAt?: Date; storeId?: string | null; }

export async function recordSopAcknowledgement(input: { staffId: string | number; sopType: SopAcknowledgementType; version: string; acknowledgedAt?: Date; expiresAt?: Date; storeId?: string | number | null }, deps?: { ctx?: any }) {
  const ack: SopAcknowledgement = { staffId: safeRef(input.staffId) ?? "", sopType: input.sopType, version: input.version, acknowledgedAt: input.acknowledgedAt ?? new Date(), expiresAt: input.expiresAt, storeId: safeRef(input.storeId) };
  await logAudit({ action: "sop.acknowledged", entityType: "sop_acknowledgement", entityRef: `${ack.staffId}:${ack.sopType}`, afterJson: ack }, deps?.ctx);
  return ack;
}

export function getStaffSopStatus(staffId: string | number, acknowledgements: SopAcknowledgement[], requiredTypes: SopAcknowledgementType[] = [...SOP_ACK_TYPES], asOf = new Date()) {
  const staffRef = safeRef(staffId);
  return requiredTypes.map((sopType) => {
    const latest = acknowledgements.filter((ack) => ack.staffId === staffRef && ack.sopType === sopType).sort((a, b) => b.acknowledgedAt.getTime() - a.acknowledgedAt.getTime())[0];
    const expired = !latest || Boolean(latest.expiresAt && latest.expiresAt.getTime() <= asOf.getTime());
    return { sopType, status: expired ? "overdue" as const : "current" as const, acknowledgement: latest ?? null };
  });
}

export function listExpiredSopAcknowledgements(acknowledgements: SopAcknowledgement[], asOf = new Date()) {
  return acknowledgements.filter((ack) => ack.expiresAt && ack.expiresAt.getTime() <= asOf.getTime());
}

export function requireSopAcknowledgementForAction(staffId: string | number, sopType: SopAcknowledgementType, acknowledgements: SopAcknowledgement[], asOf = new Date()) {
  const status = getStaffSopStatus(staffId, acknowledgements, [sopType], asOf)[0];
  return { allowed: status.status === "current", status };
}
