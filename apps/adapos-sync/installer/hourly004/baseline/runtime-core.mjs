import { performance } from 'node:perf_hooks';
const fail=code=>{throw Object.assign(new Error('Hourly complete operation stopped; details withheld.'),{code});};
export const BOUNDS=Object.freeze({branch:'004',products:6835,batchSize:200,batchDeadlineMs:60000,collectionDeadlineMs:900000,taskMinutes:20});
export function safeFailure(error){const allowed=new Set(['HOST_CPU_AT_OR_ABOVE_70_PERCENT','EXISTING_AGENT_OR_FULL_SYNC_WORK','GUARD_PROCESS_IDENTITY_UNREADABLE','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_EVIDENCE_TIMEOUT','HOURLY_SOURCE_TIMEOUT','HOURLY_SOURCE_ACCESS_DENIED','HOURLY_SOURCE_READ_FAILED','HOURLY_SOURCE_GUARD_UNAVAILABLE','HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED','HOURLY_OBSERVER_CLOCK_STEP_DETECTED','HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED','HOURLY_SOURCE_COHORT_INCOMPLETE','HOURLY_EVIDENCE_BUSY','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_OUTBOX_FULL','HOURLY_OUTBOX_CORRUPT','HOURLY_DELIVERY_BUDGET_EXHAUSTED','HOURLY_SOURCE_COHORT_CHANGED','HOURLY_COMPLETE_CONFIG_INVALID','OWN_SQL_METRICS_UNAVAILABLE','SQL_READONLY_STATEMENT_REJECTED','ETIMEOUT','ELOGIN','ESOCKET','ECONNRESET','ECONNCLOSED']);return {code:allowed.has(error?.code)?error.code:'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD',...(Number.isInteger(error?.status)?{httpStatus:error.status}:{}),detailsWithheld:true};}
export function installSelectOnlyGuard(pool){
 const original=pool.request.bind(pool),state={approvedSqlBatches:0,blockedSqlOperations:0,userDmlStatements:0};
 pool.request=(...args)=>{const request=original(...args),query=request.query.bind(request);
  request.query=(text,...rest)=>{const clean=String(text).replace(/'(?:''|[^'])*'/g,' ').replace(/--[^\r\n]*|\/\*[\s\S]*?\*\//g,' ');
   if(!/^\s*(?:SELECT|WITH)\b/i.test(clean)||/\b(?:INSERT|UPDATE|DELETE|MERGE|INTO|EXEC|EXECUTE|CREATE|ALTER|DROP|TRUNCATE|GRANT|DENY|REVOKE|DBCC|OPENROWSET|OPENQUERY|SET|USE|BEGIN|COMMIT|ROLLBACK|WAITFOR|KILL)\b/i.test(clean)){state.blockedSqlOperations++;fail('SQL_READONLY_STATEMENT_REJECTED');}
   state.approvedSqlBatches++;return query(text,...rest);};
  for(const name of ['execute','batch','bulk'])request[name]=()=>{state.blockedSqlOperations++;fail('SQL_READONLY_STATEMENT_REJECTED');};return request;};
 return state;
}
export async function ownMetrics(pool){try{const row=(await pool.request().query('SELECT session_id,cpu_time,reads,writes,logical_reads FROM sys.dm_exec_sessions WHERE session_id=@@SPID')).recordset?.[0];if(!row||!['session_id','cpu_time','reads','writes','logical_reads'].every(k=>Number.isSafeInteger(Number(row[k]))&&Number(row[k])>=0))fail('OWN_SQL_METRICS_UNAVAILABLE');return row;}catch{fail('OWN_SQL_METRICS_UNAVAILABLE');}}
function delta(a,b){if(a.session_id!==b.session_id)fail('OWN_SQL_METRICS_UNAVAILABLE');const result={cpuMs:b.cpu_time-a.cpu_time,logicalReads:b.logical_reads-a.logical_reads,physicalReads:b.reads-a.reads,physicalWrites:b.writes-a.writes};if(Object.values(result).some(x=>!Number.isFinite(x)||x<0))fail('OWN_SQL_METRICS_UNAVAILABLE');return result;}
export async function runCompleteCycle({config,slot,runner,collector,guard,connectSql,upload,now=()=>new Date().toISOString()}){
 if(config?.branchCode!=='004'||config.hourlyStockEvidence?.enabled!==true||config.hourlyStockEvidence.completeCohortEnabled!==true||!/^\b(?:09|1[0-9]):00$/.test(slot)||typeof guard!=='function'||config.sqlServerUser!=='readonly_pilot')fail('HOURLY_COMPLETE_CONFIG_INVALID');
 const summary={schemaVersion:'hourly004-complete-slot-v1',inspectionTime:now(),branch:'004',slot,expectedProducts:6835,batchSize:200,readDeadlineMs:60000,collectionDeadlineMs:900000,taskLimitMinutes:20,status:'starting',captured:false,backendAcceptedRecords:0,acknowledgements:0,backendDuplicateAcknowledgements:0,sourceChanged:false,fullSyncDeltaChangesRequested:false,manualCaptureRequested:false,sourceFreshnessQualified:false,atomicSnapshotQualified:false,clockSynchronizationVerified:false};
 let sqlGuard;const cpu=[];const observedGuard=async options=>{const result=await guard(options);if(Number.isFinite(result?.systemCpuPercent))cpu.push(result.systemCpuPercent);return result;};const start=performance.now();
 try{
  const result=await runner({syncConfig:{...config,hourlyStockEvidence:{...config.hourlyStockEvidence,observationKind:'intraday',plannedSlot:slot}},sqlConnectRetryOptions:{maxAttempts:1},now,
   connectSql:async connection=>{const pool=await connectSql(connection);sqlGuard=installSelectOnlyGuard(pool);return pool;},
   getHourlyStockEvidenceRows:async(pool,codes,options)=>{
    if(codes.length!==6835||new Set(codes).size!==6835)fail('HOURLY_SOURCE_COHORT_CHANGED');
    const before=await ownMetrics(pool);
    const snapshot=await collector(pool,codes,{...options,scope:'explicit',batchSize:200,maxWindowMs:900000,guard:observedGuard});
    const after=await ownMetrics(pool);summary.ownSqlSessionDelta=delta(before,after);
    if(snapshot.rows?.length!==6835||snapshot.cohortCoverage?.expectedProductCount!==6835||snapshot.cohortCoverage?.missingProductCodes?.length!==0)fail('HOURLY_SOURCE_COHORT_CHANGED');
    summary.observedProducts=snapshot.rows.length;summary.readBatchCount=snapshot.sourceBatchTimings.length;
    const times=snapshot.sourceBatchTimings.map(x=>x.durationMs).sort((a,b)=>a-b);
    summary.batchMinMs=times[0];summary.batchMedianMs=times[Math.floor(times.length/2)];summary.batchMaxMs=times.at(-1);summary.batchesOver3Seconds=snapshot.sourceBatchTimings.filter(x=>x.timeWarning).length;
    summary.derivedReasonCounts={};for(const row of snapshot.derivedObservation.records)summary.derivedReasonCounts[row.reason]=(summary.derivedReasonCounts[row.reason]||0)+1;
    summary.derivedSuppressedProducts=Object.entries(summary.derivedReasonCounts).filter(([key])=>key!=='observed-unverified').reduce((n,[,v])=>n+v,0);
    return snapshot;
   },
   uploadHourlyEvidence:async options=>{
    // Capture IDs and original bodies remain in RAM. The normal runner validates
    // the real acknowledgement and only then removes the exact queued body.
    let ack;try{ack=await upload(options);}catch(error){summary.uploadFailure=safeFailure(error);throw error;}const sent=JSON.parse(options.body);
    if(ack?.accepted!==6835||String(ack.branchCode)!=='004'||ack.capturedAt!==sent.capturedAt||!/^[1-9][0-9]*$/.test(String(ack.captureId))||typeof ack.duplicate!=='boolean'){summary.uploadFailure=safeFailure({code:'HOURLY_EVIDENCE_ACK_INVALID'});fail('HOURLY_EVIDENCE_ACK_INVALID');}
    summary.backendAcceptedRecords=ack.accepted;summary.acknowledgements++;if(ack.duplicate===true)summary.backendDuplicateAcknowledgements++;return ack;
   }});
  summary.captured=result.status==='captured';summary.queryDurationMs=result.queryDurationMs;summary.uploadDelivered=result.upload?.delivered??0;summary.outboxPending=result.upload?.pending??null;summary.uploadStatus=result.upload?.status??'unknown';
  summary.status=summary.captured&&summary.backendAcceptedRecords===6835&&summary.outboxPending===0?'captured-and-acknowledged':'pending-or-incomplete';
 }catch(error){summary.status='stopped-no-partial-capture';summary.failure=safeFailure(error);}
 summary.resourceGuardSummary={cpuSamples:cpu.length,maxSampledHostCpuPercent:cpu.length?Math.max(...cpu):null,sampling:'before-and-after-batches-not-continuous',physicalWritesAreDmlCount:false};summary.sqlStatementGuard=sqlGuard??{approvedSqlBatches:0,blockedSqlOperations:0,userDmlStatements:0};summary.finishedAt=now();summary.elapsedMs=Math.ceil(performance.now()-start);return summary;
}
