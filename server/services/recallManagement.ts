import { logAudit } from "./audit";
import { redactSensitive, safeRef } from "./legalOpsRedaction";

export type RecallStatus = "open" | "actioning" | "closed";
export interface RecallNoticeInput { id?: string; manufacturer: string; productId: string | number; productName?: string; batchNo: string; expiryDate?: string; affectedStoreIds?: Array<string | number>; reason: string; severity?: "low" | "medium" | "high"; }
export interface InventoryRow { id?: string | number; storeId?: string | number; productId: string | number; batchNo?: string; batchNumber?: string; expiryDate?: string; qtyOnHand?: number; status?: string; manufacturer?: string; }
export interface SaleRow { saleId?: string | number; orderId?: string | number; customerId?: string | number; customerName?: string; customerMobile?: string; productId: string | number; batchNo?: string; createdAt?: string | number | Date; }
export interface RecallNotice extends RecallNoticeInput { id: string; status: RecallStatus; createdAt: Date; notificationStatus: Record<string, string>; actionStatus: Record<string, string>; }

export function createRecallNotice(input: RecallNoticeInput): RecallNotice {
  return { ...input, productId: safeRef(input.productId) ?? "", affectedStoreIds: input.affectedStoreIds?.map((id) => safeRef(id) ?? "") ?? [], id: input.id ?? `recall_${Date.now()}`, status: "open", createdAt: new Date(), notificationStatus: {}, actionStatus: {} };
}

export function findAffectedInventory(notice: RecallNoticeInput, inventory: InventoryRow[]) {
  const productId = safeRef(notice.productId);
  const stores = new Set((notice.affectedStoreIds ?? []).map((id) => safeRef(id)));
  return inventory.filter((row) => safeRef(row.productId) === productId && (row.batchNo ?? row.batchNumber) === notice.batchNo && (stores.size === 0 || stores.has(safeRef(row.storeId))));
}

export function findAffectedSales(notice: RecallNoticeInput, sales: SaleRow[]) {
  const productId = safeRef(notice.productId);
  return sales.filter((row) => safeRef(row.productId) === productId && row.batchNo === notice.batchNo).map((row) => redactSensitive({ ...row, productId: safeRef(row.productId), saleId: safeRef(row.saleId), orderId: safeRef(row.orderId), customerId: safeRef(row.customerId) }));
}

export const findAffectedCustomers = findAffectedSales;

export async function markBatchQuarantinedForRecall(notice: RecallNoticeInput, deps?: { quarantineGateway?: (notice: RecallNoticeInput) => Promise<unknown>; ctx?: any }) {
  if (!deps?.quarantineGateway) {
    const recommendation = { routed: false, action: "route_to_stockInvariant_or_approved_inventory_service", productId: safeRef(notice.productId), batchNo: notice.batchNo, reason: "Direct stock mutation intentionally not performed by recall foundation." };
    await logAudit({ action: "recall.quarantine_recommended", entityType: "recall", entityRef: notice.id, afterJson: recommendation }, deps?.ctx);
    return recommendation;
  }
  const result = await deps.quarantineGateway(notice);
  await logAudit({ action: "recall.quarantine_routed", entityType: "recall", entityRef: notice.id, afterJson: redactSensitive(result) }, deps?.ctx);
  return { routed: true, result };
}

export function generateRecallActionPlan(notice: RecallNoticeInput, inventory: InventoryRow[], sales: SaleRow[]) {
  const affectedInventory = findAffectedInventory(notice, inventory);
  const affectedSales = findAffectedSales(notice, sales);
  return {
    notice: redactSensitive({ ...notice, productId: safeRef(notice.productId) }),
    affectedInventory: affectedInventory.map((row) => ({ ...row, id: safeRef(row.id), storeId: safeRef(row.storeId), productId: safeRef(row.productId) })),
    affectedSales,
    actions: ["verify manufacturer notice", "route quarantine through stockInvariant/approved inventory service", "notify affected customers without exposing prescription files", "document disposition and close recall"],
    notificationStatus: affectedSales.map((row: any) => ({ saleId: row.saleId ?? null, customerId: row.customerId ?? null, status: "pending" })),
    actionStatus: affectedInventory.map((row) => ({ inventoryId: safeRef(row.id), status: "quarantine_recommended" })),
  };
}

export async function recordRecallCustomerNotification(notice: RecallNotice, customerId: string | number, status: "pending" | "sent" | "failed", deps?: { ctx?: any }) {
  notice.notificationStatus[safeRef(customerId) ?? "unknown"] = status;
  await logAudit({ action: "recall.customer_notification_recorded", entityType: "recall", entityRef: notice.id, afterJson: redactSensitive({ customerId: safeRef(customerId), status }) }, deps?.ctx);
  return notice;
}

export function closeRecall(notice: RecallNotice, closedBy: string | number, notes?: string) {
  return { ...notice, status: "closed" as const, closedBy: safeRef(closedBy), closedAt: new Date(), notes };
}
