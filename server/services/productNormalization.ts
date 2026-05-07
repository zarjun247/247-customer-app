import { createHash } from "crypto";

export type NormalizedPack = { quantity: number | null; unit: string | null; text: string | null };
export type ProductMasterLike = {
  id?: number | string;
  name?: string | null;
  genericName?: string | null;
  brandName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  form?: string | null;
  packSize?: string | null;
  manufacturer?: string | null;
  companyName?: string | null;
  hsnCode?: string | null;
  gstRate?: number | string | null;
  schedule?: string | null;
  requiresPrescription?: boolean | number | null;
  category?: string | null;
  barcode?: string | null;
};
const compact=(v?:string|null)=> (v??"").trim().toUpperCase().replace(/\s+/g," ");
export const normalizeProductName=(v?:string|null)=>compact(v).replace(/[^A-Z0-9 +\-/().]/g,"");
export const normalizeGenericName=(v?:string|null)=>compact(v).replace(/TAB/g,"TABLET");
export const normalizeBrandName=(v?:string|null)=>compact(v);
export const normalizeStrength=(v?:string|null)=>compact(v).replace(/MILLIGRAM/g,"MG").replace(/GRAM/g,"G");
export const normalizeDosageForm=(v?:string|null)=>compact(v).replace(/TABS?/g,"TABLET").replace(/CAPS?/g,"CAPSULE");
export function normalizePackSize(v?:string|null): NormalizedPack { const t=compact(v); const m=t.match(/(\d+(?:\.\d+)?)\s*([A-Z]+)/); return { quantity:m?Number(m[1]):null, unit:m?m[2]:null, text:t||null }; }
export const normalizeManufacturer=(v?:string|null)=>compact(v).replace(/PVT\.?\s*LTD/g,"PVT LTD");
export const normalizeHsnCode=(v?:string|null)=> (v??"").replace(/\D/g,"").slice(0,8) || null;
export const normalizeBarcode=(v?:string|null)=> (v??"").trim().replace(/\s+/g,"").toUpperCase();
export function buildCanonicalProductKey(p: ProductMasterLike){ const pack=normalizePackSize(p.packSize); const parts=[normalizeGenericName(p.genericName),normalizeStrength(p.strength),normalizeDosageForm(p.dosageForm),pack.text,normalizeManufacturer(p.manufacturer ?? p.companyName)].filter(Boolean); return parts.join("|")||normalizeProductName(p.name); }
export function scoreProductMatch(a: ProductMasterLike,b: ProductMasterLike){ let s=0; if(buildCanonicalProductKey(a)===buildCanonicalProductKey(b)) s+=70; if(normalizeProductName(a.name)===normalizeProductName(b.name)) s+=15; if(normalizeBarcode(a.barcode)&&normalizeBarcode(a.barcode)===normalizeBarcode(b.barcode)) s+=20; return Math.min(100,s); }
export function detectPotentialDuplicateProducts(rows: ProductMasterLike[]){ const out:any[]=[]; for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){ const score=scoreProductMatch(rows[i],rows[j]); if(score>=70) out.push({leftId:rows[i].id,rightId:rows[j].id,candidateProductIds:[rows[i].id,rows[j].id].filter((id)=>id!==undefined),score,canonicalKey:buildCanonicalProductKey(rows[i]),reason:"canonical_product_match",reviewStatus:"review_required"}); } return out; }
export function assertProductMasterCompleteness(p: ProductMasterLike){ const errors:string[]=[]; if(!normalizeProductName(p.name)) errors.push("missing_name"); if(!normalizeStrength(p.strength)) errors.push("missing_strength"); if(!normalizeDosageForm(p.form ?? p.dosageForm)) errors.push("missing_form"); if(!normalizePackSize(p.packSize).text) errors.push("missing_pack_size"); if(!normalizeManufacturer(p.manufacturer ?? p.companyName)) errors.push("missing_manufacturer"); if(!normalizeHsnCode(p.hsnCode)) errors.push("missing_hsn"); if(p.gstRate===null||p.gstRate===undefined||p.gstRate==="") errors.push("missing_gst_rate"); if(!p.schedule) errors.push("missing_schedule"); return { ok: errors.length===0, errors }; }
export function buildProductMasterAuditPayload(before: ProductMasterLike, after: ProductMasterLike){ return { before, after, canonicalBefore: buildCanonicalProductKey(before), canonicalAfter: buildCanonicalProductKey(after), fingerprint:createHash("sha1").update(JSON.stringify(after)).digest("hex") }; }
