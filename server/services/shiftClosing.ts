/* eslint-disable @typescript-eslint/no-explicit-any */
import * as reconciliationTruth from "./reconciliationTruth";
export function openShift(input: any) {
  return Promise.resolve({ ok: true, ...input });
}
export function closeShift(input: {
  variance: number;
  varianceReason?: string;
}) {
  if (input.variance !== 0 && !input.varianceReason)
    throw new Error("varianceReason required");
  return Promise.resolve({ ok: true, source: "reconciliationTruth" });
}
export function dailyShiftSummary(_input: any) {
  return Promise.resolve({ rows: [], totals: {}, csvData: [] });
}
export { reconciliationTruth };
