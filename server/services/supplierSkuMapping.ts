import { TRPCError } from "@trpc/server";
import { buildCanonicalProductKey, scoreProductMatch, type ProductMasterLike } from "./productNormalization";

export type SupplierSkuMapping = { supplierId: number; supplierSkuCode: string; supplierProductName?: string|null; productId?: number|null; status: "draft"|"approved"|"rejected"; confidenceScore?: number|null; };

export function assertSupplierSkuMappingUnique(existing: SupplierSkuMapping[], candidate: SupplierSkuMapping){ const clash=existing.find(e=>e.supplierId===candidate.supplierId && e.supplierSkuCode.trim().toUpperCase()===candidate.supplierSkuCode.trim().toUpperCase() && e.status!=="rejected"); if(clash) throw new TRPCError({code:"CONFLICT",message:"Supplier SKU already mapped"}); }
export function scoreSupplierCandidate(mapping: SupplierSkuMapping, product: ProductMasterLike){ return scoreProductMatch({name:mapping.supplierProductName, genericName:mapping.supplierProductName},{...product}); }
export function getSupplierSkuCandidates(mapping: SupplierSkuMapping, products: ProductMasterLike[]){ return products.map((p)=>({ productId:p.id, score:scoreSupplierCandidate(mapping,p), canonicalKey:buildCanonicalProductKey(p) })).filter((r)=>r.score>=40).sort((a,b)=>b.score-a.score); }
export function matchSupplierSku(mapping: SupplierSkuMapping, products: ProductMasterLike[]){ const c=getSupplierSkuCandidates(mapping,products); return { matched: c[0]?.score>=85 ? c[0] : null, candidates:c, ambiguous: c.length>1 && c[0].score-c[1].score<10 }; }
export const createSupplierSkuMapping = (input: SupplierSkuMapping) => ({ ...input, status: input.status ?? "draft" });
export const approveSupplierSkuMapping = (m: SupplierSkuMapping) => ({ ...m, status: "approved" as const });
export const rejectSupplierSkuMapping = (m: SupplierSkuMapping) => ({ ...m, status: "rejected" as const });
export const buildSupplierMappingAuditPayload=(before:SupplierSkuMapping,after:SupplierSkuMapping)=>({before,after,changed:before.status!==after.status||before.productId!==after.productId});
