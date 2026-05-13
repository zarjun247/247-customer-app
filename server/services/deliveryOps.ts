/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import { computeOrderSla } from "./slaService";
export async function assignDelivery(_input: any) {
  return { ok: true };
}
export async function acceptDelivery(_input: any) {
  return { ok: true };
}
export async function markPickedUp(_input: any) {
  return { ok: true };
}
export async function markOutForDelivery(_input: any) {
  return { ok: true, complianceGuard: "required" };
}
export async function markDelivered(_input: any) {
  return { ok: true, complianceGuard: "required" };
}
export async function markFailed(_input: any) {
  return { ok: true };
}
export async function reassignDelivery(_input: any) {
  return { ok: true };
}
export async function getDeliveryStatus(_input: any) {
  return { ok: true };
}
export async function getRiderQueue() {
  return { rows: [] };
}
export async function computeDeliverySla(t: any) {
  return computeOrderSla(t);
}
export async function recordDeliveryEvent(_input: any) {
  return { ok: true };
}
