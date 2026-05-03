export type SlaConfig = { standardMins: number; urgentMins: number; inBuildingMins: number };
export const SLA_DEFAULTS: SlaConfig = { standardMins: 60, urgentMins: 30, inBuildingMins: 15 };

export type Timeline = {
  createdAt?: Date | null; acceptedAt?: Date | null; packedAt?: Date | null;
  outForDeliveryAt?: Date | null; deliveredAt?: Date | null;
  urgent?: boolean; inBuilding?: boolean;
};

const diff = (a?: Date | null, b?: Date | null) => (!a || !b ? null : Math.max(0, Math.round((b.getTime()-a.getTime())/60000)));

export function computeOrderSla(t: Timeline, config: SlaConfig = SLA_DEFAULTS) {
  const targetMins = t.inBuilding ? config.inBuildingMins : (t.urgent ? config.urgentMins : config.standardMins);
  const createdToAccepted = diff(t.createdAt, t.acceptedAt);
  const acceptedToPacked = diff(t.acceptedAt, t.packedAt);
  const packedToOutForDelivery = diff(t.packedAt, t.outForDeliveryAt);
  const outForDeliveryToDelivered = diff(t.outForDeliveryAt, t.deliveredAt);
  const totalOrderSla = diff(t.createdAt, t.deliveredAt);
  const breached = totalOrderSla !== null ? totalOrderSla > targetMins : false;
  return { createdToAccepted, acceptedToPacked, packedToOutForDelivery, outForDeliveryToDelivered, totalOrderSla, targetMins, breached, breachReason: breached ? 'total_order_sla_exceeded' : null };
}
