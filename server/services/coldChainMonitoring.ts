import { logAudit } from "./audit";
import { safeRef } from "./legalOpsRedaction";

export type ReadingSource = "manual" | "import" | "device";
export type ExcursionStatus = "normal" | "low_excursion" | "high_excursion";
export interface TemperatureReadingInput { storeId: string | number; storageUnitId: string; temperatureC: number; capturedAt?: Date; capturedBy: string | number; source: ReadingSource; minAllowedC: number; maxAllowedC: number; notes?: string; }
export interface TemperatureReading extends TemperatureReadingInput { id: string; storeId: string; capturedBy: string; capturedAt: Date; excursionStatus: ExcursionStatus; }
export interface ColdChainAlert { id: string; readingId: string; storeId: string; storageUnitId: string; excursionStatus: Exclude<ExcursionStatus, "normal">; temperatureC: number; status: "open" | "resolved"; createdAt: Date; resolvedAt?: Date; correctiveAction?: string; }

export function evaluateTemperatureExcursion(input: Pick<TemperatureReadingInput, "temperatureC" | "minAllowedC" | "maxAllowedC">): ExcursionStatus {
  if (input.temperatureC < input.minAllowedC) return "low_excursion";
  if (input.temperatureC > input.maxAllowedC) return "high_excursion";
  return "normal";
}

export async function recordTemperatureReading(input: TemperatureReadingInput, deps?: { alerts?: ColdChainAlert[]; ctx?: any }) {
  const reading: TemperatureReading = { ...input, id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`, storeId: safeRef(input.storeId) ?? "", capturedBy: safeRef(input.capturedBy) ?? "", capturedAt: input.capturedAt ?? new Date(), excursionStatus: evaluateTemperatureExcursion(input) };
  let alert: ColdChainAlert | null = null;
  if (reading.excursionStatus !== "normal") {
    alert = { id: `cc_alert_${Date.now()}`, readingId: reading.id, storeId: reading.storeId, storageUnitId: reading.storageUnitId, excursionStatus: reading.excursionStatus, temperatureC: reading.temperatureC, status: "open", createdAt: new Date() };
    deps?.alerts?.push(alert);
  }
  await logAudit({ action: alert ? "cold_chain.excursion_detected" : "cold_chain.reading_recorded", entityType: "cold_chain_reading", entityRef: reading.id, afterJson: { ...reading, alertId: alert?.id } }, deps?.ctx);
  return { reading, alert };
}

export function listColdChainAlerts(alerts: ColdChainAlert[], filter?: { storeId?: string | number; status?: "open" | "resolved" }) {
  return alerts.filter((alert) => (!filter?.storeId || alert.storeId === safeRef(filter.storeId)) && (!filter?.status || alert.status === filter.status));
}

export function createColdChainCorrectiveAction(alert: ColdChainAlert, correctiveAction: string) {
  return { ...alert, correctiveAction };
}

export function markColdChainAlertResolved(alert: ColdChainAlert, resolvedBy: string | number, correctiveAction?: string) {
  return { ...alert, status: "resolved" as const, resolvedAt: new Date(), resolvedBy: safeRef(resolvedBy), correctiveAction: correctiveAction ?? alert.correctiveAction };
}
