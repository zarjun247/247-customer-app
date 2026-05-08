import { getOfflineOperationPolicy } from "./offlineDegradationPolicy";
import { type OfflineOperationRecord, type OfflineOperationStatus } from "./offlineOperationQueue";

export type OfflineRecoveryReportRow = {
  id: number;
  storeId: number;
  terminalId: string;
  actorId: number | null;
  operationType: string;
  operationCategory: string;
  status: OfflineOperationStatus;
  ageMs: number;
  pendingOverThreshold: boolean;
  replayAttempts: number;
  failedReplayAttempts: boolean;
  highRiskBlocked: boolean;
  duplicateIdempotencyAttempts: number;
  conflictReason: string | null;
  rejectionReason: string | null;
  managerReviewRequired: boolean;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
};

export type OfflineRecoveryReport = {
  rows: OfflineRecoveryReportRow[];
  totals: Record<string, number>;
  csvData: string;
  queuedCount: number;
  appliedCount: number;
  rejectedCount: number;
  conflictCount: number;
  expiredCount: number;
  highRiskQueuedCount: number;
};

const csvHeaders: (keyof OfflineRecoveryReportRow)[] = [
  "id",
  "storeId",
  "terminalId",
  "actorId",
  "operationType",
  "operationCategory",
  "status",
  "ageMs",
  "pendingOverThreshold",
  "replayAttempts",
  "failedReplayAttempts",
  "highRiskBlocked",
  "duplicateIdempotencyAttempts",
  "conflictReason",
  "rejectionReason",
  "managerReviewRequired",
  "payloadHash",
  "createdAt",
  "updatedAt",
];

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildOfflineRecoveryReport(
  operations: OfflineOperationRecord[],
  options: { pendingThresholdMs?: number; now?: Date } = {},
): OfflineRecoveryReport {
  const now = options.now ?? new Date();
  const pendingThresholdMs = options.pendingThresholdMs ?? 30 * 60 * 1000;

  const rows = operations.map((operation): OfflineRecoveryReportRow => {
    const policy = getOfflineOperationPolicy(operation.operationType);
    const ageMs = now.getTime() - operation.createdAt.getTime();
    const pendingOverThreshold = operation.status === "queued" && ageMs > pendingThresholdMs;
    const highRiskBlocked = operation.status === "rejected" && policy.highRisk;
    const managerReviewRequired = operation.status === "conflict" || pendingOverThreshold || operation.duplicateCount > 0;

    return {
      id: operation.id,
      storeId: operation.storeId,
      terminalId: operation.terminalId,
      actorId: operation.actorId,
      operationType: operation.operationType,
      operationCategory: operation.operationCategory,
      status: operation.status,
      ageMs,
      pendingOverThreshold,
      replayAttempts: operation.replayAttempts,
      failedReplayAttempts: operation.replayAttempts > 0 && operation.status !== "applied",
      highRiskBlocked,
      duplicateIdempotencyAttempts: operation.duplicateCount,
      conflictReason: operation.conflictReason,
      rejectionReason: operation.rejectionReason,
      managerReviewRequired,
      payloadHash: operation.payloadHash,
      createdAt: operation.createdAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
    };
  });

  const totals = rows.reduce<Record<string, number>>((acc, row) => {
    acc.total = (acc.total ?? 0) + 1;
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    if (row.pendingOverThreshold) acc.pendingOverThreshold = (acc.pendingOverThreshold ?? 0) + 1;
    if (row.failedReplayAttempts) acc.failedReplayAttempts = (acc.failedReplayAttempts ?? 0) + 1;
    if (row.highRiskBlocked) acc.highRiskBlocked = (acc.highRiskBlocked ?? 0) + 1;
    if (row.duplicateIdempotencyAttempts > 0) acc.duplicateIdempotencyRows = (acc.duplicateIdempotencyRows ?? 0) + 1;
    if (row.managerReviewRequired) acc.managerReviewRequired = (acc.managerReviewRequired ?? 0) + 1;
    return acc;
  }, {});

  const csvData = [
    csvHeaders.join(","),
    ...rows.map(row => csvHeaders.map(header => csvEscape(row[header])).join(",")),
  ].join("\n");

  return {
    rows,
    totals,
    csvData,
    queuedCount: totals.queued ?? 0,
    appliedCount: totals.applied ?? 0,
    rejectedCount: totals.rejected ?? 0,
    conflictCount: totals.conflict ?? 0,
    expiredCount: totals.expired ?? 0,
    highRiskQueuedCount: rows.filter(row => row.status === "queued" && getOfflineOperationPolicy(row.operationType).highRisk).length,
  };
}
