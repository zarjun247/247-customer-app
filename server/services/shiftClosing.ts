import * as reconciliationTruth from './reconciliationTruth';
export async function openShift(input:any){ return { ok:true, ...input }; }
export async function closeShift(input:{variance:number;varianceReason?:string}){ if(input.variance!==0 && !input.varianceReason) throw new Error('varianceReason required'); return { ok:true, source:'reconciliationTruth' }; }
export async function dailyShiftSummary(input:any){ return { rows:[], totals:{}, csvData:[] }; }
export { reconciliationTruth };
