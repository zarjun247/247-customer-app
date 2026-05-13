import { TRPCError } from "@trpc/server";
import {
  scoreProductMatch,
  type ProductMasterLike,
} from "./productNormalization";

export type SubDecision = {
  originalProductId: number;
  substituteProductId: number;
  reason: string;
  pharmacistId?: number | null;
  customerConsent?: boolean | null;
  status: "pending" | "approved" | "rejected";
  controlled?: boolean;
};
export function suggestPossibleSubstitutes(
  original: ProductMasterLike,
  pool: ProductMasterLike[]
) {
  return pool
    .map(p => ({ productId: p.id, score: scoreProductMatch(original, p) }))
    .filter(s => s.score >= 60)
    .sort((a, b) => b.score - a.score);
}
export function requirePharmacistSubstitutionApproval(d: SubDecision) {
  if (!d.pharmacistId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Pharmacist approval required",
    });
}
export function assertSubstitutionAllowed(d: SubDecision) {
  if (d.controlled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Controlled/H1/X substitution fail-closed",
    });
  requirePharmacistSubstitutionApproval(d);
}
export function approveSubstitution(d: SubDecision) {
  assertSubstitutionAllowed(d);
  return { ...d, status: "approved" as const };
}
export const rejectSubstitution = (d: SubDecision) => ({
  ...d,
  status: "rejected" as const,
});
export const buildSubstitutionAuditPayload = (
  before: SubDecision,
  after: SubDecision
) => ({
  before,
  after,
  decisionBy: after.pharmacistId ?? null,
  customerConsent: after.customerConsent ?? null,
});
