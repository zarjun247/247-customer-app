export interface RefillReminder {
  id: string;
  customerId: number;
  productId: number;
  nextRefillDate: string;
  regulated: boolean;
  status: "active" | "snoozed" | "refilled";
  prescriptionId?: number;
  saleLineId?: number;
  reorderPromptId?: string;
}

const store = new Map<string, RefillReminder>();

export function computeNextRefillDate(
  lastPurchaseDate: Date,
  intervalDays: number
) {
  const dt = new Date(lastPurchaseDate);
  dt.setDate(dt.getDate() + intervalDays);
  return dt.toISOString().slice(0, 10);
}
export function createRefillReminder(
  input: Omit<RefillReminder, "id" | "status">
) {
  const id = `rr_${Date.now()}`;
  const row: RefillReminder = { ...input, id, status: "active" };
  store.set(id, row);
  return row;
}
export function getDueRefills(todayISO: string) {
  return Array.from(store.values()).filter(
    r => r.status === "active" && r.nextRefillDate <= todayISO
  );
}
export function markReminderSent(id: string) {
  return store.get(id) ?? null;
}
export function snoozeReminder(id: string, nextRefillDate: string) {
  const r = store.get(id);
  if (!r) return null;
  r.status = "snoozed";
  r.nextRefillDate = nextRefillDate;
  return r;
}
export function markRefilled(id: string) {
  const r = store.get(id);
  if (!r) return null;
  r.status = "refilled";
  return r;
}
export function createReorderPrompt(reminderId: string) {
  const r = store.get(reminderId);
  if (!r) return null;
  const reorderPromptId = `rp_${Date.now()}`;
  r.reorderPromptId = reorderPromptId;
  // no auto sale confirmation; prompt-only record
  return {
    id: reorderPromptId,
    reminderId,
    customerId: r.customerId,
    productId: r.productId,
    regulated: r.regulated,
    requiresComplianceReview: r.regulated,
    status: "draft_prompt" as const,
  };
}
export function linkReminderToPrescription(id: string, prescriptionId: number) {
  const r = store.get(id);
  if (!r) return null;
  r.prescriptionId = prescriptionId;
  return r;
}
export function linkReminderToSaleLine(id: string, saleLineId: number) {
  const r = store.get(id);
  if (!r) return null;
  r.saleLineId = saleLineId;
  return r;
}
