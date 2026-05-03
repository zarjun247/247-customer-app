import { computeOrderSla } from './slaService';
export async function assignDelivery(input:any){ return { ok:true, ...input }; }
export async function acceptDelivery(input:any){ return { ok:true, ...input }; }
export async function markPickedUp(input:any){ return { ok:true, ...input }; }
export async function markOutForDelivery(input:any){ return { ok:true, complianceGuard:'required' }; }
export async function markDelivered(input:any){ return { ok:true, complianceGuard:'required' }; }
export async function markFailed(input:any){ return { ok:true, ...input }; }
export async function reassignDelivery(input:any){ return { ok:true, ...input }; }
export async function getDeliveryStatus(input:any){ return { ok:true, ...input }; }
export async function getRiderQueue(){ return { rows:[] }; }
export async function computeDeliverySla(t:any){ return computeOrderSla(t); }
export async function recordDeliveryEvent(input:any){ return { ok:true, ...input }; }
