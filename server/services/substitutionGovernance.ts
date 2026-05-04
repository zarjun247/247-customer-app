export type SubstitutionDecision = { originalProductId: number; substituteProductId: number; reason: string; pharmacistId?: number | null; customerApproved?: boolean | null; schedule?: 'OTC'|'H'|'H1'|'X'|null; status?: 'pending'|'approved'|'rejected' };

export const suggestPossibleSubstitutes = (candidates: Array<{productId:number; score:number}>) => candidates.filter((c) => c.score >= 70);
export const requirePharmacistSubstitutionApproval = (d: SubstitutionDecision) => !d.pharmacistId || d.status !== 'approved';
export function assertSubstitutionAllowed(d: SubstitutionDecision) {
  if (d.schedule === 'H1' || d.schedule === 'X') throw new Error('controlled_substitution_fail_closed');
  if (!d.pharmacistId) throw new Error('pharmacist_approval_required');
  return true;
}
export const approveSubstitution = (d: SubstitutionDecision) => (assertSubstitutionAllowed(d), { ...d, status: 'approved' as const });
export const rejectSubstitution = (d: SubstitutionDecision) => ({ ...d, status: 'rejected' as const });
export const buildSubstitutionAuditPayload = (d: SubstitutionDecision) => ({ ...d, approvedAt: d.status === 'approved' ? new Date().toISOString() : null });
