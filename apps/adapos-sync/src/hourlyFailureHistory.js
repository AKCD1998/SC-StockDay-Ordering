import {safeHourlyFailureCode,safeHourlyDiagnostic} from './hourlyAttemptDiagnostics.js';
import {safeHourlyGuardSummary} from './hourlyGuardProcess.js';

// Sanitized failed attempts share the existing receipt snapshots. No new worker,
// file, SQL query, retry, or stock assertion is created for historical evidence.
export const FAILURE_HISTORY_BOUNDS=Object.freeze({entries:8,bytes:3072});
const slots=/^(09|1[0-9]):00$/;
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const statuses=new Set(['launch-stopped','stopped-no-partial-capture','pending-or-incomplete']);
export function safeHistoricalFailure(value){
 if(!value||!Number.isSafeInteger(value.sequence)||value.sequence<1||!slots.test(value.slot)||!iso(value.startedAt)||!iso(value.finishedAt)||Date.parse(value.finishedAt)<Date.parse(value.startedAt)||!statuses.has(value.status))return null;
 const guard=safeHourlyGuardSummary(value.guard),stage=safeHourlyDiagnostic({stage:value.stage,kind:'failure'});
 const result={sequence:value.sequence,slot:value.slot,startedAt:value.startedAt,finishedAt:value.finishedAt,status:value.status,code:safeHourlyFailureCode({code:value.code}),...(stage?{stage:stage.stage}:{}),...(guard?{guard}:{}),detailsWithheld:true};
 for(const key of ['observedProducts','backendAcceptedRecords','outboxPending'])if(Number.isSafeInteger(value[key])&&value[key]>=0&&value[key]<=10000)result[key]=value[key];
 return result;
}
export function boundedFailureHistory(values){
 const result=Array.isArray(values)?values.map(safeHistoricalFailure).filter(Boolean):[];
 while(result.length>FAILURE_HISTORY_BOUNDS.entries||Buffer.byteLength(JSON.stringify(result))>FAILURE_HISTORY_BOUNDS.bytes)result.shift();
 return result;
}
export function failureForAttempt(summary,attempt){
 if(!statuses.has(summary?.status))return null;
 const failure=summary.failure??summary.deliveryFailure??summary.uploadFailure;
 const event=summary.diagnostics?.events?.findLast?.(x=>x.kind==='failure');
 return safeHistoricalFailure({sequence:attempt.sequence,slot:attempt.slot,startedAt:attempt.startedAt,finishedAt:summary.finishedAt,status:summary.status,code:failure?.code,guard:failure?.guard,stage:event?.stage,observedProducts:summary.observedProducts,backendAcceptedRecords:summary.backendAcceptedRecords,outboxPending:summary.outboxPending});
}
