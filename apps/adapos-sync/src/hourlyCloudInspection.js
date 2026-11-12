// Pure, read-only reconciliation. Importing this module performs no I/O and
// cannot load SQL, configuration, a collector, a runner or production main().
import {safeHourlyFailureCode} from './hourlyAttemptDiagnostics.js';
import {safeProviderFailure,safeCpuObservation} from './hourlyGuardEvidence.js';

export const CLOUD_INSPECTION_BOUNDS=Object.freeze({products:6835,batches:35,sourceMaxAgeMs:120000,centralMaxAgeMs:120000,futureToleranceMs:2000,taskStartToleranceMs:2000,taskLimitMs:1200000,guardBudgetMs:12000,inputBytes:65536});
// Native PS5.1 uses seven fractional digits. Require an explicit timezone and
// reject normalized impossible dates rather than inheriting a checker timezone.
const parseTime=x=>{
 if(typeof x!=='string')return null;
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,7})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(x);
 if(!m)return null;const time=Date.parse(x);if(!Number.isFinite(time))return null;
 const offset=m[2]==='Z'?0:(m[3]==='+'?1:-1)*(Number(m[4])*60+Number(m[5]));
 return new Date(time+offset*60000).toISOString().slice(0,19)===m[1]?time:null;
};
const n=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const b=x=>typeof x==='boolean'?x:null;
const stamp=x=>parseTime(x)==null?null:new Date(x).toISOString();
const slotAt=x=>new Date(x+7*3600000).toISOString().slice(11,16);
const dayAt=x=>new Date(x+7*3600000).toISOString().slice(0,10);
const isSlot=x=>parseTime(x)!=null&&/^(09|1[0-9]):00$/.test(slotAt(Date.parse(x)))&&new Date(x).getUTCMinutes()===0&&new Date(x).getUTCSeconds()===0&&new Date(x).getUTCMilliseconds()===0;
const installations=new Set(['cpu-v5-installed','checkpoint-v4-installed','original-12-second-guard']);
const sourceStates=new Set(['captured-and-acknowledged','pending-or-incomplete','stopped-no-partial-capture','launch-stopped']);
const accessReasons=new Set(['not-authorized','access-denied','offline','network-unavailable','not-found','timeout','unavailable']);
const guardReasons=new Set(['CPU_UNAVAILABLE','CPU_LIMIT','CPU_UNREADABLE','TASKS_UNAVAILABLE','PROCESSES_UNAVAILABLE','PROCESS_UNREADABLE','PROVIDER_TIMEOUT','ACCESS_DENIED','BUDGET_EXHAUSTED','HOST_UNVERIFIED','IDENTITY_UNVERIFIED','FULL_SYNC_BUSY','PLATFORM_UNAVAILABLE','DEADLINE','CHILD_STILL_RUNNING','GUARD_LEASE_UNVERIFIED']);

export function sanitizeControllerObservation(controller,{now,deviceAccessVerified=false,accessReason='unavailable'}={}){
 const at=parseTime(now);if(at==null)throw new TypeError('A valid independent check time is required.');
 const result={availability:'unknown',accessReason:accessReasons.has(accessReason)?accessReason:'unavailable',installation:null,policyVerified:false,observedAt:null,task:null,latestAttempt:null,lastSuccess:null,queuePending:null,failureCode:null,currentStockCertified:false};
 // A payload's claim to be SERVER004 does not authorize execution on that device.
 if(deviceAccessVerified!==true)return {...result,accessReason:'not-authorized'};
 if(controller==null)return result;
 const o=controller?.sourceObservation,seen=parseTime(o?.observedAt);
 if(controller?.schemaVersion!=='hourly004-update-status-v3'||o?.schemaVersion!=='hourly004-source-observation-v1')return {...result,accessReason:'controller-contract-unverified'};
 if(o.hostVerified!==true)return {...result,accessReason:'unexpected-host'};
 if(o.timeZoneVerified!==true)return {...result,accessReason:'unexpected-timezone'};
 if(o.sqlQueries!==0||o.taskRuns!==0||o.configurationChanges!==0)return {...result,accessReason:'inspection-operations-unverified'};
 if(seen==null)return {...result,accessReason:'source-time-unverified'};
 if(at-seen>CLOUD_INSPECTION_BOUNDS.sourceMaxAgeMs)return {...result,accessReason:'source-observation-stale'};
 if(seen-at>CLOUD_INSPECTION_BOUNDS.futureToleranceMs)return {...result,accessReason:'source-time-in-future'};
 result.observedAt=stamp(o.observedAt);
 result.installation=installations.has(controller.installation)?controller.installation:null;
 result.policyVerified=result.installation!=null&&controller.guardBudgetMs===12000&&controller.newRecoveryEnabled===false&&controller.installationTransaction?.state==='idle';
 result.policyMismatch=result.installation!=null&&(controller.guardBudgetMs!==12000||controller.newRecoveryEnabled!==false);
 const task=o.task;
 if(o.taskAccessVerified===true&&task&&parseTime(task.startedAt)!=null&&Date.parse(task.startedAt)<=seen+CLOUD_INSPECTION_BOUNDS.futureToleranceMs&&b(task.running)!=null&&b(task.enabled)!=null&&b(task.definitionVerified)!=null&&n(task.lastResult)!=null)result.task={startedAt:stamp(task.startedAt),running:task.running,enabled:task.enabled,lastResult:task.lastResult,definitionVerified:task.definitionVerified};
 const a=controller.latestAttempt,started=parseTime(a?.startedAt),finished=parseTime(a?.finishedAt);
 if(controller.availability==='published'&&sourceStates.has(a?.status)&&started!=null&&finished!=null&&finished>=started&&finished-started<=CLOUD_INSPECTION_BOUNDS.taskLimitMs&&finished<=seen+CLOUD_INSPECTION_BOUNDS.futureToleranceMs&&a.slot===slotAt(started)&&dayAt(started)===dayAt(finished))result.latestAttempt={status:a.status,slot:a.slot,startedAt:stamp(a.startedAt),finishedAt:stamp(a.finishedAt),observedProducts:n(a.observedProducts),backendAcceptedRecords:n(a.backendAcceptedRecords),outboxPending:n(a.outboxPending)};
 const prior=controller.lastSuccess,priorAt=parseTime(prior?.finishedAt);
 if(prior?.status==='captured-and-acknowledged'&&priorAt!=null&&priorAt<=at+CLOUD_INSPECTION_BOUNDS.futureToleranceMs&&prior.observedProducts===6835&&prior.backendAcceptedRecords===6835&&prior.outboxPending===0)result.lastSuccess={slot:/^(09|1[0-9]):00$/.test(prior.slot)?prior.slot:null,finishedAt:stamp(prior.finishedAt),observedProducts:6835,backendAcceptedRecords:6835,outboxPending:0,historicalOnly:true};
 const queue=controller.queueNow,queueAt=parseTime(queue?.checkedAt);
 if(queueAt!=null&&at-queueAt<=CLOUD_INSPECTION_BOUNDS.sourceMaxAgeMs&&queueAt-at<=CLOUD_INSPECTION_BOUNDS.futureToleranceMs)result.queuePending=n(queue.pending);
 result.failureCode=controller.failureCode==null?null:safeHourlyFailureCode({code:controller.failureCode});
 result.guardReason=result.latestAttempt&&guardReasons.has(controller.guardReason)?controller.guardReason:null;
 result.providerFailure=result.latestAttempt?safeProviderFailure(controller.providerFailure):null;
 result.cpuObservation=result.latestAttempt?safeCpuObservation(controller.cpuObservation):null;
 result.availability=result.task&&result.policyVerified?'available':'unknown';
 result.accessReason=result.availability==='available'?null:!result.task?'task-access-unverified':'source-policy-unverified';
 return result;
}

function centralView(value,expectedSlot,now){
 const result={availability:'unknown',unavailableReason:'query-unverified',branchCode:null,observedAt:null,captures:null,declaredRecords:null,actualRows:null,distinctProducts:null};
 if(value?.readOnlyVerified!==true)return result;
 if(value.branchCode!=='004')return {...result,unavailableReason:'branch-unverified'};
 if(stamp(value.slot)!==stamp(expectedSlot))return {...result,unavailableReason:'slot-unverified'};
 const seen=parseTime(value.observedAt),checked=parseTime(now);
 if(seen==null)return {...result,unavailableReason:'query-time-unverified'};
 if(checked-seen>CLOUD_INSPECTION_BOUNDS.centralMaxAgeMs)return {...result,unavailableReason:'query-observation-stale'};
 if(seen-checked>CLOUD_INSPECTION_BOUNDS.futureToleranceMs)return {...result,unavailableReason:'query-time-in-future'};
 const names=['captures','declaredRecords','actualRows','distinctProducts'];
 if(names.some(k=>n(value[k])==null))return {...result,unavailableReason:'query-counts-unverified'};
 return {availability:'available',unavailableReason:null,branchCode:'004',observedAt:stamp(value.observedAt),...Object.fromEntries(names.map(k=>[k,value[k]]))};
}

export function reconcileHourlyDelivery({expectedSlot,now,controller,deviceAccessVerified=false,sourceAccessReason,central,journalPersisted=null}={}){
 if(!isSlot(expectedSlot)||parseTime(now)==null||Date.parse(now)<Date.parse(expectedSlot))throw new TypeError('A completed or current Hourly004 slot and independent check time are required.');
 const source=sanitizeControllerObservation(controller,{now,deviceAccessVerified,accessReason:sourceAccessReason});
 const received=centralView(central,expectedSlot,now),expected=Date.parse(expectedSlot),checked=Date.parse(now);
 const result={schemaVersion:'hourly004-cloud-inspection-v1',branch:'004',expectedSlot:stamp(expectedSlot),checkedAt:stamp(now),status:'PARTIAL',reason:'EVIDENCE_INCOMPLETE',source,central:received,journalPersisted:b(journalPersisted),sourceFreshnessQualified:false,atomicSnapshotQualified:false,clockSynchronizationVerified:false,currentStockCertified:false,action:'report-only',syncRequested:false,taskRunRequested:false,recoveryEnabled:false};
 const done=(status,reason)=>({...result,status,reason});
 if(received.availability==='available'&&received.captures>1)return done('BLOCKED','MULTIPLE_CENTRAL_CAPTURES_REQUIRE_REVIEW');
 if(received.availability==='available'&&received.captures===0&&(received.declaredRecords!==0||received.actualRows!==0||received.distinctProducts!==0))return done('BLOCKED','CENTRAL_COUNTS_MISMATCH');
 const centralPass=received.availability==='available'&&received.captures===1&&received.declaredRecords===6835&&received.actualRows===6835&&received.distinctProducts===6835;
 if(received.availability==='available'&&received.captures===1&&!centralPass)return done('BLOCKED','CENTRAL_COUNTS_MISMATCH');
 if(source.policyMismatch===true)return done('BLOCKED','SOURCE_POLICY_MISMATCH');
 if(source.availability!=='available')return done('PARTIAL',centralPass?'CENTRAL_DELIVERED_SOURCE_UNVERIFIED':'SOURCE_OR_CENTRAL_UNVERIFIED');
 if(source.installation!=='cpu-v5-installed')return done('PARTIAL','CPU_V5_NOT_INSTALLED');
 const task=source.task,start=Date.parse(task.startedAt);
 if(task.definitionVerified!==true||task.enabled!==true)return done('BLOCKED','SOURCE_TASK_POLICY_MISMATCH');
 if(dayAt(start)!==dayAt(expected)||slotAt(start)!==slotAt(expected)||start<expected-CLOUD_INSPECTION_BOUNDS.taskStartToleranceMs||start>expected+CLOUD_INSPECTION_BOUNDS.taskLimitMs)return done('PARTIAL','EXPECTED_SOURCE_ATTEMPT_NOT_OBSERVED');
 if(task.running)return done(checked-start>CLOUD_INSPECTION_BOUNDS.taskLimitMs?'BLOCKED':'WAITING',checked-start>CLOUD_INSPECTION_BOUNDS.taskLimitMs?'SOURCE_TASK_OVERTIME':'NATURAL_RUN_IN_PROGRESS');
 const a=source.latestAttempt;
 if(!a||Math.abs(Date.parse(a.startedAt)-start)>CLOUD_INSPECTION_BOUNDS.taskStartToleranceMs)return done('PARTIAL','CURRENT_STATUS_UNVERIFIED');
 if(task.lastResult!==0||a.status!=='captured-and-acknowledged')return done('BLOCKED','SOURCE_ATTEMPT_FAILED');
 if(source.failureCode!==null)return done('BLOCKED','SOURCE_STATUS_CONTRADICTORY');
 if(a.observedProducts!==6835||a.backendAcceptedRecords!==6835||a.outboxPending!==0||source.queuePending!==0)return done('BLOCKED','SOURCE_ACK_OR_QUEUE_INCOMPLETE');
 if(received.availability==='available'&&Date.parse(received.observedAt)<Date.parse(a.finishedAt))return done('PARTIAL','CENTRAL_OBSERVATION_PRECEDES_SOURCE_COMPLETION');
 if(!centralPass)return done(received.availability==='available'?'BLOCKED':'PARTIAL',received.availability==='available'?'CENTRAL_DELIVERY_NOT_OBSERVED':'CENTRAL_QUERY_UNAVAILABLE');
 return done('PASS','SOURCE_ACK_TASK_AND_CENTRAL_COUNTS_AGREE');
}
