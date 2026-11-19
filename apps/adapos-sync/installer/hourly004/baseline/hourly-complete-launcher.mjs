import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {runCompleteCycle,safeFailure,installSelectOnlyGuard} from './runtime-core.mjs';
const repo='C:/Users/Administrator/Desktop/RxAuu',app=path.join(repo,'apps/adapos-sync');
const secure='C:/ProgramData/SC-StockDay-Ordering/hourly-stock-evidence-004/complete-on-20261022';
const fail=code=>{throw Object.assign(new Error('Complete Hourly launch stopped; details withheld.'),{code});};
function regular(file,max=1048576){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)fail('HOURLY_COMPLETE_CONFIG_INVALID');}
function writeSafe(file,value){const bytes=JSON.stringify(value,null,2),temp=file+'.pending';fs.writeFileSync(temp,bytes,{flag:'w',mode:0o600});fs.renameSync(temp,file);}
async function main(){
 if(os.hostname().toUpperCase()!=='SERVER004')fail('HOURLY_COMPLETE_CONFIG_INVALID');
 const mode=process.argv[2]||'',slot=process.argv[3]||'';if(!['prepare','run'].includes(mode))fail('HOURLY_COMPLETE_CONFIG_INVALID');
 process.chdir(app);const local=createRequire(path.join(app,'package.json'));regular(path.join(app,'.env'));
 const env=local('dotenv').parse(fs.readFileSync(path.join(app,'.env')));
 // Only this owned child receives the explicit source file environment. The
 // normal Full Sync process/configuration is not altered.
 for(const [k,v]of Object.entries(env))if(k.startsWith('ADAPOS_'))process.env[k]=v;
 const {syncConfig}=await import(pathToFileURL(path.join(app,'src/config.js')));
 const user=env.ADAPOS_SQLSERVER_USER_READONLY??env.ADAPOS_SQLSERVER_USER,password=env.ADAPOS_SQLSERVER_PASSWORD_READONLY??env.ADAPOS_SQLSERVER_PASSWORD;
 if(user!=='readonly_pilot'||typeof password!=='string'||!password)fail('HOURLY_COMPLETE_CONFIG_INVALID');
 const config={...syncConfig,sqlServerUser:user,sqlServerPassword:password};
 const guard=async({remainingMs=12000}={})=>{const script=path.join(secure,'runtime-guard.ps1');const result=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',script,'-ObserverProcessId',String(process.pid)],{encoding:'utf8',windowsHide:true,timeout:Math.max(1,Math.min(12000,remainingMs)),maxBuffer:8192});let value;try{value=JSON.parse(result.stdout.replace(/^\uFEFF/,''));}catch{fail('HOURLY_SOURCE_GUARD_UNAVAILABLE');}if(result.status!==0||value.status!=='ready'||value.cpuBelowThreshold!==true||value.existingWorkQuiet!==true||value.hostVerified!==true||!Number.isFinite(value.systemCpuPercent)||value.systemCpuPercent<0||value.systemCpuPercent>=70)fail(['HOST_CPU_AT_OR_ABOVE_70_PERCENT','EXISTING_AGENT_OR_FULL_SYNC_WORK','GUARD_PROCESS_IDENTITY_UNREADABLE'].includes(value.errorCode)?value.errorCode:'HOURLY_SOURCE_GUARD_UNAVAILABLE');return value;};
 if(mode==='prepare'){
  if(config.hourlyStockEvidence.enabled||config.hourlyStockEvidence.fullSyncAnchorEnabled||config.hourlyStockEvidence.inlineAfterFullSyncEnabled)fail('HOURLY_COMPLETE_CONFIG_INVALID');
  const planPath='C:/Temp/Hourly004-Catalog-Gap-Diagnosis/all-web-cohorts.json';regular(planPath,4194304);const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
  if(plan.branch!=='004'||!Array.isArray(plan.orderedCodes)||plan.orderedCodes.length!==7050||new Set(plan.orderedCodes).size!==7050)fail('HOURLY_COMPLETE_CONFIG_INVALID');
  const base=String(config.apiBaseUrl).replace(/\/$/,'');if(base!=='https://paasrtsm-project.onrender.com')fail('HOURLY_COMPLETE_CONFIG_INVALID');
  const response=await fetch(base+'/api/hourly-stock-evidence/cohort?branchCode=004',{headers:{'x-branch-code':'004','x-hourly-evidence-token':config.hourlyStockEvidence.uploadToken},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.status!==200)fail('HOURLY_COMPLETE_CONFIG_INVALID');const data=Buffer.from(await response.arrayBuffer());if(data.length>1048576)fail('HOURLY_COMPLETE_CONFIG_INVALID');
  const body=JSON.parse(data),current=new Set(body.productCodes);
  if(body.schemaVersion!=='hourly-approved-cohort-v1'||body.scope!=='web-all'||!Array.isArray(body.productCodes)||current.size!==body.productCodes.length||current.size<7050||current.size>10000||plan.orderedCodes.some(x=>!current.has(x)))fail('HOURLY_SOURCE_COHORT_CHANGED');
  const {selectHourlyPosActiveCohort}=await import(pathToFileURL(path.join(app,'src/hourlyPosEligibility.js')));
  const {buildPosActiveHourlyCohortManifest}=await import(pathToFileURL(path.join(app,'src/hourlyCohortManifest.js')));
  const {buildSqlServerConfig}=await import(pathToFileURL(path.join(app,'src/sqlServerConfig.js')));const sql=local('mssql');let pool,selection;
  try{await guard();pool=new sql.ConnectionPool({...buildSqlServerConfig(config),connectionTimeout:5000,requestTimeout:60000,pool:{max:1,min:0,idleTimeoutMillis:120000}});pool.on('error',()=>{});await pool.connect();installSelectOnlyGuard(pool);selection=await selectHourlyPosActiveCohort(pool,plan.orderedCodes,{branchCode:'004',batchSize:200,guard,maxWindowMs:900000});}finally{if(pool)await pool.close();}
  const manifest=buildPosActiveHourlyCohortManifest(plan.orderedCodes,selection);if(manifest.productCodes.length!==6835)fail('HOURLY_SOURCE_COHORT_CHANGED');
  const output=path.join(secure,'approved-cohort-'+Date.now()+'.json');fs.writeFileSync(output,JSON.stringify(manifest),{flag:'wx',mode:0o600});
  const prepared={schemaVersion:'hourly004-complete-manifest-result-v1',status:'approved-6835-manifest-prepared-hourly-off',productCount:6835,approvedWebsiteSnapshotProducts:7050,currentWebsiteProducts:current.size,newWebProductsNotIncluded:current.size-7050,excludedNotActiveProducts:selection.excludedNotActiveProductCodes.length,excludedMissingProducts:selection.excludedMissingProductCodes.length,manifestLocation:output,stockQueriesRequested:false,configurationChanged:false};
  writeSafe(path.join(secure,'manifest-result.json'),prepared);console.log(JSON.stringify(prepared));return;
 }
 if(!/^(?:09|1[0-9]):00$/.test(slot))fail('HOURLY_COMPLETE_CONFIG_INVALID');
 const expected=new Date();const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(expected);if(parts.slice(0,2)!==slot.slice(0,2))fail('HOURLY_COMPLETE_CONFIG_INVALID');
 const manifest=path.resolve(config.hourlyStockEvidence.cohortFile||'');if(!manifest.startsWith(path.resolve(secure)+path.sep))fail('HOURLY_COMPLETE_CONFIG_INVALID');regular(manifest);
 const {runHourlyStockIntraday}=await import(pathToFileURL(path.join(app,'src/hourlyStockRunner.js')));
 const {readHourlyCompleteCohort}=await import(pathToFileURL(path.join(app,'src/hourlyCompleteCohort.js')));
 const {uploadHourlyEvidence}=await import(pathToFileURL(path.join(app,'src/hourlyStockEvidenceClient.js')));
 const {buildSqlServerConfig}=await import(pathToFileURL(path.join(app,'src/sqlServerConfig.js')));
 const sql=local('mssql');
 const safeUpload=options=>uploadHourlyEvidence({...options,fetchImpl:(url,init)=>{if(url!=='https://paasrtsm-project.onrender.com/api/hourly-stock-evidence/captures')fail('HOURLY_COMPLETE_CONFIG_INVALID');return fetch(url,{...init,redirect:'error'});}});
 const summary=await runCompleteCycle({config,slot,runner:runHourlyStockIntraday,collector:readHourlyCompleteCohort,guard,upload:safeUpload,
  connectSql:async()=>{const connection=new sql.ConnectionPool({...buildSqlServerConfig(config),connectionTimeout:5000,requestTimeout:60000,pool:{max:1,min:0,idleTimeoutMillis:120000}});connection.on('error',()=>{});await connection.connect();return connection;}});
 writeSafe(path.join(secure,'latest-slot-result.json'),summary);console.log(JSON.stringify(summary));if(summary.status!=='captured-and-acknowledged')process.exitCode=1;
}
main().catch(error=>{const result={schemaVersion:'hourly004-complete-slot-v1',inspectionTime:new Date().toISOString(),status:'launch-stopped',failure:safeFailure(error),detailsWithheld:true};try{if(os.hostname().toUpperCase()==='SERVER004')writeSafe(path.join(secure,'latest-slot-result.json'),result);}catch{}console.log(JSON.stringify(result));process.exitCode=1;});
