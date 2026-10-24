import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runCompleteCycle} from './runtime-core.mjs';
import {createHourlyAttemptDiagnostics,safeHourlyFailureCode} from '../../../src/hourlyAttemptDiagnostics.js';
import {createHourlyGuard,safeHourlyGuardSummary} from '../../../src/hourlyGuardProcess.js';
import {createHourlyGuardLease} from '../../../src/hourlyGuardLease.js';
import {createHourlyUploadRecovery} from '../../../src/hourlyUploadRecovery.js';

export function pendingCount(cacheDir) {
  try { return fs.readdirSync(path.join(cacheDir,'hourly-evidence-outbox','004')).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).length; }
  catch(error) { return error.code==='ENOENT'?0:null; }
}
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function successReceipt(summary) {
  if(summary?.status!=='captured-and-acknowledged'||summary.expectedProducts!==6835||summary.observedProducts!==6835||summary.readBatchCount!==35||summary.backendAcceptedRecords!==6835||summary.outboxPending!==0||!validTime(summary.finishedAt)||new Date(summary.finishedAt).toISOString()!==summary.finishedAt||!/^(09|1[0-9]):00$/.test(summary.slot))return null;
  return {finishedAt:summary.finishedAt,slot:summary.slot,observedProducts:6835,readBatchCount:35,backendAcceptedRecords:6835,outboxPending:0,sourceFreshnessQualified:false,atomicSnapshotQualified:false};
}
export function createStatusWriter(file,{now=()=>new Date().toISOString(),handoffReceipt=null}={}) {
  // Read the old successful result before the first new attempt can replace it.
  let prior=successReceipt(handoffReceipt),origin=prior?'verified-handoff-receipt':null;
  try {const value=JSON.parse(fs.readFileSync(file,'utf8'));const local=successReceipt(value)??successReceipt({...value.lastSuccess,status:'captured-and-acknowledged',expectedProducts:6835});if(local&&(!prior||Date.parse(local.finishedAt)>=Date.parse(prior.finishedAt))){prior=local;origin='local-status';}} catch {}
  return summary=>{
    const success=successReceipt(summary);if(success&&(!prior||Date.parse(success.finishedAt)>=Date.parse(prior.finishedAt))){prior=success;origin='current-runtime';}
    const at=now(),difference=prior&&validTime(at)?Date.parse(at)-Date.parse(prior.finishedAt):null;
    const age=difference!=null&&difference>=0?difference:null;
    const result={...summary,lastSuccess:prior?{...prior,ageMs:age,origin,timestampInFuture:difference!=null&&difference<0}:null,lastAttemptComplete:summary.status==='captured-and-acknowledged',currentStockCertified:false};
    const temporary=file+'.pending';const fd=fs.openSync(temporary,'w',0o600);
    try {fs.writeFileSync(fd,JSON.stringify(result,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,file);return result;
  };
}

// The same function is used by the real task and offline dependency-injected
// fixtures. Importing this module never loads credentials, SQL or the network.
export async function runObservedHourly004({slot,load,writeStatus,now=()=>new Date().toISOString(),readPending=()=>null,monotonic=()=>performance.now()}) {
  const startedAt=now(),cpuStart=process.cpuUsage(),collectionStartedAt=monotonic();
  let partial={schemaVersion:'hourly004-complete-slot-v1',inspectionTime:startedAt,branch:'004',slot,status:'starting',observedProducts:null,backendAcceptedRecords:null,outboxPending:null,captured:false};
  const diagnostics=createHourlyAttemptDiagnostics({checkpoint:diagnostics=>writeStatus({...partial,diagnostics})});
  let summary;
  try {
    diagnostics.observe({stage:'launch',kind:'start'});
    const dependencies=await load(diagnostics.observe);
    if(diagnostics.snapshot().persistenceFailed)throw Object.assign(new Error('Status write unavailable.'),{code:'EACCES'});
    diagnostics.observe({stage:'launch',kind:'success'});
    summary=await runCompleteCycle({...dependencies,slot,now,monotonic,collectionStartedAt,onDiagnostic:event=>{
      if(event.stage==='sql-batch'&&event.kind==='progress')partial={...partial,observedProducts:event.readProducts};
      diagnostics.observe(event);
      // Abort at the next safe operation boundary. Cleanup must still close
      // acquired pools/locks even if a checkpoint became unwritable.
      if(diagnostics.snapshot().persistenceFailed&&event.kind==='start'&&event.stage!=='sql-close')throw Object.assign(new Error('Status write unavailable.'),{code:'EACCES'});
    }});
  } catch(error) {
    summary={...partial,status:'launch-stopped',failure:{code:safeHourlyFailureCode(error),detailsWithheld:true},finishedAt:now()};
    const guard=safeHourlyGuardSummary(error?.guardSummary);if(guard)summary.failure.guard=guard;
  }
  const cpu=process.cpuUsage(cpuStart);
  if(summary.observedProducts==null)summary.observedProducts=partial.observedProducts;
  summary.diagnostics=diagnostics.snapshot();
  summary.outboxPending=readPending();
  if(summary.status==='captured-and-acknowledged'&&summary.outboxPending!==0)summary.status='pending-or-incomplete';
  summary.selfProcessCpuMs=Math.ceil((cpu.user+cpu.system)/1000);
  summary.measurementLimitations=['host-cpu-samples-not-continuous','sql-session-metrics-not-server-total','sql-physical-writes-not-business-dml-count','elapsed-guard-time-not-sql-duration','clock-observation-not-synchronization','acknowledgement-not-independent-central-row-audit'];
  summary.recovery={newUploadRecoveryEnabled:false,sqlConnectMaxAttempts:1,guardMaxAttempts:1,partialReadResumeEnabled:false};
  return writeStatus(summary);
}

export async function main() {
  const app='C:/Users/Administrator/Desktop/RxAuu/apps/adapos-sync';
  const secure='C:/ProgramData/SC-StockDay-Ordering/hourly-stock-evidence-004/complete-on-20261022';
  const slot=process.argv[3]||'',mode=process.argv[2]||'';
  const stop=()=>{throw Object.assign(new Error('Hourly configuration unavailable; details withheld.'),{code:'HOURLY_COMPLETE_CONFIG_INVALID'});};
  if(os.hostname().toUpperCase()!=='SERVER004'||mode!=='run'||!/^(09|1[0-9]):00$/.test(slot))stop();
  let cacheDir;
  const handoffReceipt=JSON.parse(fs.readFileSync(new URL('../../../hourly004-handoff-success.json',import.meta.url),'utf8'));
  const writeStatus=createStatusWriter(path.join(secure,'latest-slot-result.json'),{handoffReceipt});
  const result=await runObservedHourly004({slot,writeStatus,readPending:()=>cacheDir?pendingCount(cacheDir):null,load:async onDiagnostic=>{
    if(os.hostname().toUpperCase()!=='SERVER004'||mode!=='run'||!/^(09|1[0-9]):00$/.test(slot)||new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',hourCycle:'h23'}).format(new Date())!==slot.slice(0,2))stop();
    process.chdir(app);
    const local=createRequire(new URL('../../../package.json',import.meta.url));
    const source=path.join(app,'.env'),stat=fs.lstatSync(source);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)stop();
    const env=local('dotenv').parse(fs.readFileSync(source));
    for(const [key,value]of Object.entries(env))if(key.startsWith('ADAPOS_'))process.env[key]=value;
    const {syncConfig}=await import('../../../src/config.js');
    const config={...syncConfig,sqlServerUser:env.ADAPOS_SQLSERVER_USER_READONLY??env.ADAPOS_SQLSERVER_USER,sqlServerPassword:env.ADAPOS_SQLSERVER_PASSWORD_READONLY??env.ADAPOS_SQLSERVER_PASSWORD};
    if(config.sqlServerUser!=='readonly_pilot'||!config.sqlServerPassword||config.hourlyStockEvidence.fullSyncAnchorEnabled||config.hourlyStockEvidence.inlineAfterFullSyncEnabled)stop();
    cacheDir=config.hourlyStockEvidence.cacheDir;
    const manifest=path.resolve(config.hourlyStockEvidence.cohortFile||'');
    if(!manifest.startsWith(path.resolve(secure)+path.sep)||!fs.lstatSync(manifest).isFile()||fs.lstatSync(manifest).isSymbolicLink())stop();
    const guard=createHourlyGuard({executable:'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',script:fileURLToPath(new URL('../../../src/hourlyCompleteCohortGuard.ps1',import.meta.url)),onDiagnostic,childLease:createHourlyGuardLease(path.join(secure,'guard-child.lock'))});
    await guard({remainingMs:900000});
    const {runHourlyStockIntraday}=await import('../../../src/hourlyStockRunner.js');
    const {readHourlyCompleteCohort}=await import('../../../src/hourlyCompleteCohort.js');
    const {uploadHourlyEvidence}=await import('../../../src/hourlyStockEvidenceClient.js');
    const {buildSqlServerConfig}=await import('../../../src/sqlServerConfig.js');
    const sql=local('mssql');
    const upload=createHourlyUploadRecovery({enabled:false,guard,onDiagnostic,upload:options=>uploadHourlyEvidence({...options,fetchImpl:(url,init)=>{
      if(url!=='https://paasrtsm-project.onrender.com/api/hourly-stock-evidence/captures')stop();return fetch(url,{...init,redirect:'error'});
    }})});
    return {config,runner:runHourlyStockIntraday,collector:readHourlyCompleteCohort,guard,upload,connectSql:async()=>{
      const connection=new sql.ConnectionPool({...buildSqlServerConfig(config),connectionTimeout:5000,requestTimeout:60000,pool:{max:1,min:0,idleTimeoutMillis:120000}});
      connection.on('error',()=>{});try {await connection.connect();return connection;}catch(error){await connection.close().catch(()=>{});throw error;}
    }};
  }});
  console.log(JSON.stringify({status:result.status,slot:result.slot,lastAttemptComplete:result.lastAttemptComplete,lastSuccess:result.lastSuccess,detailsWithheld:true}));
  if(result.status!=='captured-and-acknowledged')process.exitCode=1;
}
