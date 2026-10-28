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
import {createHourlyStatusStore} from '../../../src/hourlyStatusStore.js';

export function pendingCount(cacheDir) {
  try { return fs.readdirSync(path.join(cacheDir,'hourly-evidence-outbox','004')).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).length; }
  catch(error) { return error.code==='ENOENT'?0:null; }
}
export const createStatusWriter=createHourlyStatusStore;

// The same function is used by the real task and offline dependency-injected
// fixtures. Importing this module never loads credentials, SQL or the network.
export async function runObservedHourly004({slot,load,writeStatus,now=()=>new Date().toISOString(),readPending=()=>null,monotonic=()=>performance.now()}) {
  const startedAt=now(),cpuStart=process.cpuUsage(),collectionStartedAt=monotonic();
  let partial={schemaVersion:'hourly004-complete-slot-v1',inspectionTime:startedAt,branch:'004',slot,status:'starting',observedProducts:null,backendAcceptedRecords:null,outboxPending:null,captured:false};
  if(typeof writeStatus?.begin!=='function'||typeof writeStatus?.acknowledge!=='function')throw Object.assign(new Error('Receipt store required; details withheld.'),{code:'HOURLY_RECEIPT_STATE_UNVERIFIED'});
  writeStatus.setRemaining(()=>900000-(monotonic()-collectionStartedAt));
  const diagnostics=createHourlyAttemptDiagnostics({checkpoint:diagnostics=>writeStatus.offer({...partial,diagnostics})});
  let summary;
  let begun=false;
  try {
    writeStatus.begin({slot,startedAt});begun=true;
    diagnostics.observe({stage:'launch',kind:'start'});
    const dependencies=await load(diagnostics.observe);
    diagnostics.observe({stage:'launch',kind:'success'});
    summary=await runCompleteCycle({...dependencies,slot,now,monotonic,collectionStartedAt,persistAcknowledgement:options=>writeStatus.acknowledge(options),onDiagnostic:event=>{
      if(event.stage==='sql-batch'&&event.kind==='progress')partial={...partial,observedProducts:event.readProducts};
      diagnostics.observe(event);
      // Display I/O is coalesced asynchronously. It cannot throw a fabricated
      // access denial into collection or postpone the twelve-second guard timer.
    }});
  } catch(error) {
    if(!begun){await writeStatus.close();throw error;}
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
  writeStatus.setRemaining(()=>1200000-(monotonic()-collectionStartedAt));
  let completionFailure;
  try{return await writeStatus.finish(summary);}
  catch(error){completionFailure=error;throw error;}
  finally{
    await writeStatus.close();
    // The pointer may exit only its own process after this cleanup. Preserve
    // the critical error code; do not let unrelated display I/O keep it alive.
    if(completionFailure&&writeStatus.snapshot().ioPending>0)completionFailure.hourlyDisplayIoPending=true;
  }
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
  console.log(JSON.stringify({status:result.status,slot:result.slot,lastAttemptComplete:result.lastAttemptComplete,lastSuccess:result.lastSuccess,statusPersistence:result.statusPersistence,detailsWithheld:true}));
  if(result.captureOutcome!=='captured-and-acknowledged')process.exitCode=1;
  // Only display I/O can remain here: core pools/locks and critical receipts
  // have completed. Exit this task's own process rather than waiting beyond
  // the display deadline. A lease remains until this PID is confirmed dead.
  if(result.statusPersistence.ioPending>0)process.exit(process.exitCode??0);
}
