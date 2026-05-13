import { computeOrderSla, type Timeline } from "./slaService";

export function assignDelivery(_input: unknown) {
  return { ok: true };
}
export function acceptDelivery(_input: unknown) {
  return { ok: true };
}
export function markPickedUp(_input: unknown) {
  return { ok: true };
}
export function markOutForDelivery(_input: unknown) {
  return { ok: true, complianceGuard: "required" };
}
export function markDelivered(_input: unknown) {
  return { ok: true, complianceGuard: "required" };
}
export function markFailed(_input: unknown) {
  return { ok: true };
}
export function reassignDelivery(_input: unknown) {
  return { ok: true };
}
export function getDeliveryStatus(_input: unknown) {
  return { ok: true };
}
export function getRiderQueue() {
  return { rows: [] };
}
export function computeDeliverySla(t: Timeline) {
  return computeOrderSla(t);
}
export function recordDeliveryEvent(_input: unknown) {
  return { ok: true };
}
