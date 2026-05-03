import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";

export function computeAvailableQty(input:{onHandQty:number;reservedQty?:number;softLockedQty?:number;quarantinedQty?:number;expiredQty?:number}) {
  return input.onHandQty - (input.reservedQty ?? 0) - (input.softLockedQty ?? 0) - (input.quarantinedQty ?? 0) - (input.expiredQty ?? 0);
}
export function explainAvailability(input:any){ const available=computeAvailableQty(input); return { ...input, availableQty: available, formula: "availableQty = onHandQty - reservedQty - softLockedQty - quarantinedQty - expiredQty"}; }
export async function getCanonicalAvailability(storeId:number, productId:number, variantId?:number|null){ const { getDb } = await import("../db"); const db = await getDb(); const { storeSkus, batchLedger } = await import("../../drizzle/schema"); if (!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"}); const [sku]=await db.select().from(storeSkus).where(and(eq(storeSkus.storeId,storeId), eq(storeSkus.productId,productId), variantId?eq(storeSkus.variantId,variantId):sql`1=1`)).limit(1); const [agg]=await db.select({onHand:sql<number>`COALESCE(SUM(${batchLedger.qtyOnHand}),0)`,reserved:sql<number>`COALESCE(SUM(${batchLedger.qtyReserved}),0)`,quarantined:sql<number>`COALESCE(SUM(${batchLedger.qtyQuarantined}),0)`,expired:sql<number>`COALESCE(SUM(${batchLedger.qtyExpired}),0)`}).from(batchLedger).where(and(eq(batchLedger.storeId,storeId), eq(batchLedger.productId,productId), variantId?eq(batchLedger.variantId,variantId):sql`1=1`)); return explainAvailability({ onHandQty: Number(agg?.onHand ?? sku?.stockQty ?? 0), reservedQty:Number(agg?.reserved??0), softLockedQty:Number(sku?.softLockedQty ?? 0), quarantinedQty:Number(agg?.quarantined??0), expiredQty:Number(agg?.expired??0) }); }
export async function assertAvailableForReservation(input:any){ const c = await getCanonicalAvailability(input.storeId,input.productId,input.variantId); if (c.availableQty < input.qty) throw new TRPCError({code:"PRECONDITION_FAILED",message:"Insufficient available stock after reservations"}); return c; }
export async function reserveStockForOrder(input:any){ await assertAvailableForReservation(input); await logAudit({ action:"reservation.created", entityType:"order", entityId:Number(input.orderId ?? 0), afterJson: input }, input.ctx); return { status:"active", ...input }; }
export async function releaseReservation(input:any){ await logAudit({ action:"reservation.released", entityType:"order", entityId:Number(input.orderId ?? 0), afterJson: input }, input.ctx); return { status:"released" }; }
export async function expireReservation(input:any){ await logAudit({ action:"reservation.expired", entityType:"order", entityId:Number(input.orderId ?? 0), afterJson: input }, input.ctx); return { status:"expired" }; }
export async function getReservationStatus(input:any){ return { status: "active", ...input }; }
export async function syncStoreSkuSoftLocks(){ return { synced: false, note: "Deferred to stock-truth hardening" }; }
export async function releaseReservationOnPaymentFailure(input:any){ return releaseReservation(input); }
export async function releaseReservationOnRxReject(input:any){ return releaseReservation(input); }
export async function releaseReservationOnOrderCancel(input:any){ return releaseReservation(input); }
