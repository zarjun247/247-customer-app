import { csvEscape, redactSensitive, safeRef } from "./legalOpsRedaction";
import type { RegulatedReleaseEvidence } from "./regulatedReleaseProof";
import type { RecallNotice } from "./recallManagement";
import type { ColdChainAlert } from "./coldChainMonitoring";
import type { SopAcknowledgement, SopAcknowledgementType } from "./sopAcknowledgement";
import { getStaffSopStatus } from "./sopAcknowledgement";

export interface PharmacyLegalOpsReportInput {
  regulatedReleases?: RegulatedReleaseEvidence[];
  h1RegisterRows?: Array<{ id?: string | number; saleRef?: string | number | null; saleLineRef?: string | number | null; statutoryContextStatus?: string | null }>;
  recalls?: RecallNotice[];
  coldChainAlerts?: ColdChainAlert[];
  sopAcknowledgements?: SopAcknowledgement[];
  staffIds?: Array<string | number>;
  requiredSops?: SopAcknowledgementType[];
}

export function buildPharmacyLegalOpsReport(input: PharmacyLegalOpsReportInput) {
  const regulatedReleases = input.regulatedReleases ?? [];
  const h1Rows = input.h1RegisterRows ?? [];
  const recalls = input.recalls ?? [];
  const coldChainAlerts = input.coldChainAlerts ?? [];
  const staffIds = input.staffIds ?? [];
  const sopStatuses = staffIds.flatMap((staffId) => getStaffSopStatus(staffId, input.sopAcknowledgements ?? [], input.requiredSops));
  const h1IncompleteCount = h1Rows.filter((row) => row.statutoryContextStatus && row.statutoryContextStatus !== "complete").length + regulatedReleases.filter((event) => event.scheduleFlag === "H1" && !(event.h1RegisterId || event.h1Ref)).length;
  const missingEvidenceCount = regulatedReleases.filter((event) => event.missingFieldsJson.length > 0).length;

  const rows = [
    ...regulatedReleases.map((event) => redactSensitive({ section: "regulated_release", saleId: event.saleId, orderId: event.orderId, productId: event.productId, prescriptionId: event.prescriptionId ? "[REDACTED_REF]" : null, decision: event.decision, missingEvidence: event.missingFieldsJson.join("|"), evidenceHash: event.evidenceHash, createdAt: event.createdAt.toISOString() })),
    ...recalls.map((recall) => redactSensitive({ section: "recall", recallId: recall.id, manufacturer: recall.manufacturer, productId: safeRef(recall.productId), batchNo: recall.batchNo, status: recall.status })),
    ...coldChainAlerts.map((alert) => ({ section: "cold_chain", alertId: alert.id, storeId: alert.storeId, storageUnitId: alert.storageUnitId, excursionStatus: alert.excursionStatus, status: alert.status })),
    ...sopStatuses.map((status) => ({ section: "sop", sopType: status.sopType, status: status.status })),
  ];
  const headers = ["section", "saleId", "orderId", "productId", "prescriptionId", "decision", "missingEvidence", "evidenceHash", "createdAt", "recallId", "manufacturer", "batchNo", "alertId", "storeId", "storageUnitId", "excursionStatus", "sopType", "status"];
  const csvData = [headers.join(","), ...rows.map((row: any) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
  const totals = { missingEvidenceCount, regulatedReleaseCount: regulatedReleases.length, h1IncompleteCount, coldChainExcursionCount: coldChainAlerts.filter((a) => a.status === "open").length, openRecallCount: recalls.filter((r) => r.status !== "closed").length, sopOverdueCount: sopStatuses.filter((s) => s.status === "overdue").length };
  return { rows, totals, csvData, ...totals };
}
