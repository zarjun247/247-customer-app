export type SupplierSkuMapping = { supplierId: number; supplierSku: string; productId?: number | null; status?: 'draft'|'approved'|'rejected'; confidence?: number | null; metadata?: any };

const keyOf = (m: SupplierSkuMapping) => `${m.supplierId}|${(m.supplierSku||'').trim().toUpperCase()}`;

export function assertSupplierSkuMappingUnique(existing: SupplierSkuMapping[], next: SupplierSkuMapping) {
  if (existing.some((e) => keyOf(e) === keyOf(next) && e.productId !== next.productId && e.status !== 'rejected')) {
    throw new Error('duplicate_supplier_sku_mapping');
  }
}

export function matchSupplierSku(existing: SupplierSkuMapping[], input: SupplierSkuMapping) {
  return existing.find((e) => keyOf(e) === keyOf(input) && e.status === 'approved') ?? null;
}

export function createSupplierSkuMapping(existing: SupplierSkuMapping[], input: SupplierSkuMapping) {
  assertSupplierSkuMappingUnique(existing, input);
  return { ...input, status: input.confidence && input.confidence >= 95 ? 'approved' : 'draft' } as SupplierSkuMapping;
}
export const approveSupplierSkuMapping = (m: SupplierSkuMapping, actorRole: string) => ({ ...m, status: actorRole === 'pharmacist' || actorRole === 'admin' ? 'approved' : 'draft' });
export const rejectSupplierSkuMapping = (m: SupplierSkuMapping) => ({ ...m, status: 'rejected' as const });
export const getSupplierSkuCandidates = (existing: SupplierSkuMapping[], input: SupplierSkuMapping) => existing.filter((e) => e.supplierId === input.supplierId && e.status !== 'rejected');
export const buildSupplierMappingAuditPayload = (before: SupplierSkuMapping | null, after: SupplierSkuMapping) => ({ before, after, changedAt: new Date().toISOString() });
