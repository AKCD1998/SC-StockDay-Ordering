'use strict';
// One approved, memory-only read on the already-authorized native computer.
// No shell, native file placement, credential, identity switch or process scan.
const {spawnSync}=require('node:child_process');
const {gzipSync,gunzipSync}=require('node:zlib');
const os=require('node:os');
const REVIEW='H004-DIRECT-READ-20261112-R2';
const DEADLINE=30000,MAX_OUTPUT=262144;
function environment(input=process.env){
 const env={};
 for(const[k,v]of Object.entries(input))if(/^(SystemRoot|WINDIR|ComSpec|PATH|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|ProgramFiles|ProgramData|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k))env[k]=v;
 return env;
}
function powerShellArguments(source){
 if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>98304)throw new Error('PAYLOAD_LIMIT');
 const packed=gzipSync(Buffer.from(source,'utf8')).toString('base64');
 // The gzip buffer is reviewed code only. It contains no source records/secret.
 const bootstrap=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$b=[Convert]::FromBase64String('${packed}');$m=New-Object IO.MemoryStream(,$b);$z=New-Object IO.Compression.GZipStream($m,[IO.Compression.CompressionMode]::Decompress);$o=New-Object IO.MemoryStream;try{$z.CopyTo($o);if($o.Length -gt 98304){throw 'PAYLOAD_LIMIT'};$s=[Text.Encoding]::UTF8.GetString($o.ToArray());&([ScriptBlock]::Create($s))}finally{$z.Dispose();$m.Dispose();$o.Dispose()}`;
 const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-Command',bootstrap];
 if(args.join(' ').length>29000)throw new Error('PAYLOAD_LIMIT');
 return args;
}
function ownedChild(source,{timeout=DEADLINE,spawn=spawnSync,env=process.env}={}){
 const start=performance.now();let r;
 try{r=spawn(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,powerShellArguments(source),{shell:false,windowsHide:true,env:environment(env),encoding:'utf8',stdio:'pipe',maxBuffer:MAX_OUTPUT,timeout,killSignal:'SIGKILL'});}catch{return {status:'BLOCKED',safeError:'READER_START_UNAVAILABLE',ownedChildExited:null,elapsedMs:Math.round(performance.now()-start),data:null};}
 const elapsedMs=Math.round(performance.now()-start);
 // spawnSync returns after its child has closed. Windows SIGKILL forcefully
 // terminates this child. No PID-based kill, process search or business kill.
 const timedOut=r.error?.code==='ETIMEDOUT';
 const ended=Number.isInteger(r.status)||r.signal==='SIGKILL';
 if(timedOut)return {status:'TIMED_OUT',safeError:'DIRECT_READ_DEADLINE',ownedChildExited:ended,elapsedMs,data:null};
 if(r.error)return {status:'BLOCKED',safeError:r.error.code==='ENOBUFS'?'DIRECT_READ_OUTPUT_LIMIT':'READER_START_UNAVAILABLE',ownedChildExited:ended||null,elapsedMs,data:null};
 if(elapsedMs>DEADLINE+5000)return {status:'PARTIAL',safeError:'DIRECT_READ_DEADLINE_OVERRUN',ownedChildExited:ended,elapsedMs,data:null};
 let data;try{data=JSON.parse(String(r.stdout||'').replace(/^\uFEFF/,''));}catch{return {status:'PARTIAL',safeError:'DIRECT_READ_INVALID_OUTPUT',ownedChildExited:ended,elapsedMs,data:null};}
 const forbidden=/^(?:raw.*|password|token|connectionString|env|document.*|product_code|idempotency_key|hash|digest|receiptkey|pid|arguments|xml|sddl)$/i;
 function safe(value,depth=0){if(depth>14)return false;if(Array.isArray(value))return value.length<=32&&value.every(v=>safe(v,depth+1));if(value&&typeof value==='object')return Object.entries(value).every(([k,v])=>!forbidden.test(k)&&safe(v,depth+1));return typeof value!=='string'||value.length<=256;}
 if(!data||typeof data!=='object'||Array.isArray(data)||!safe(data))return {status:'PARTIAL',safeError:'DIRECT_READ_INVALID_OUTPUT',ownedChildExited:ended,elapsedMs,data:null};
 return {status:r.status===0?'COMPLETED':'READER_REPORTED_FAILURE',safeError:null,ownedChildExited:ended,elapsedMs,data};
}
function runCapsule(payload){
 const base={schemaVersion:'hourly004-direct-supervised-v2',reviewVersion:REVIEW,checkedAt:new Date().toISOString(),supervisorNodeVersion:process.versions.node,status:'BLOCKED',safeError:null,externalDeadlineMs:DEADLINE,ownedChildExited:null,reader:null,sourceExecutionCount:0,sqlQueries:0,taskRuns:0,configurationChanges:0,permissionChanges:0,sourceFileWrites:0,guardChanged:false,recoveryChanged:false,platformAuthorization:'NOT_EVALUATED_LOCALLY',requiresTrustedNativeAuthorization:true};
 if(process.platform!=='win32'||os.hostname().toUpperCase()!=='SERVER004')return {...base,safeError:'WRONG_EXECUTION_HOST'};
 if(!payload||payload.reviewVersion!==REVIEW||!['Status','DeadlineSelfTest'].includes(payload.mode)||typeof payload.readerSource!=='string'||Object.keys(payload).some(k=>!['reviewVersion','mode','readerSource'].includes(k)))return {...base,safeError:'REVIEWED_CAPSULE_REQUIRED'};
 if(payload.mode==='DeadlineSelfTest'){
  const r=ownedChild("$ErrorActionPreference='Stop';Start-Sleep -Seconds 120;Write-Output '{}'");
  const passed=r.status==='TIMED_OUT'&&r.ownedChildExited===true&&r.elapsedMs>=DEADLINE-250&&r.elapsedMs<=DEADLINE+5000;
  return {...base,mode:payload.mode,status:passed?'PASS_DEADLINE_ONLY':'PARTIAL',safeError:passed?null:r.safeError,ownedChildExited:r.ownedChildExited,elapsedMs:r.elapsedMs,deadlineProbePassed:passed,sourceExecutionCount:0};
 }
 const r=ownedChild(payload.readerSource);
 if(!r.data||r.data.schemaVersion!=='hourly004-direct-source-v1')return {...base,mode:payload.mode,status:r.status,safeError:r.safeError||'DIRECT_READ_INVALID_OUTPUT',ownedChildExited:r.ownedChildExited,elapsedMs:r.elapsedMs,sourceExecutionCount:1};
 return {...base,mode:payload.mode,status:r.status,safeError:r.safeError,ownedChildExited:r.ownedChildExited,elapsedMs:r.elapsedMs,reader:r.data,sourceExecutionCount:1};
}
function reviewedProgram(readerSource,supervisorSource,mode){
 if(!['Status','DeadlineSelfTest'].includes(mode))throw new Error('MODE_NOT_ALLOWED');
 const payload={reviewVersion:REVIEW,mode,readerSource};
 return `const m={exports:{}};(function(require,module,exports){${supervisorSource}\n})(require,m,m.exports);try{const r=m.exports.runCapsule(${JSON.stringify(payload)});console.log(JSON.stringify(r));process.exitCode=r.status==='COMPLETED'||r.status==='PASS_DEADLINE_ONLY'?0:1}catch{console.log(JSON.stringify({schemaVersion:'hourly004-direct-supervised-v2',status:'BLOCKED',safeError:'SUPERVISOR_UNAVAILABLE',sourceExecutionCount:null,taskRuns:0,sqlQueries:0}));process.exitCode=1}`;
}
function buildNativeCommand(readerSource,supervisorSource,mode='Status'){
 const program=reviewedProgram(readerSource,supervisorSource,mode);
 const packed=gzipSync(Buffer.from(program,'utf8')).toString('base64');
 const loader=`const z=require('node:zlib'),v=require('node:vm');v.runInThisContext(z.gunzipSync(Buffer.from('${packed}','base64'),{maxOutputLength:196608}).toString('utf8'))`;
 const command="& 'C:\\Program Files\\nodejs\\node.exe' -e '"+loader.replaceAll("'","''")+"'";
 if(command.length>29000)throw new Error('CAPSULE_COMMAND_LIMIT');
 return command;
}
function verifyNativeCommand(command,readerSource,supervisorSource,mode){
 try{
  const prefix="& 'C:\\Program Files\\nodejs\\node.exe' -e '";
  if(typeof command!=='string'||command.length>29000||!command.startsWith(prefix)||!command.endsWith("'"))return false;
  const loader=command.slice(prefix.length,-1).replaceAll("''","'");
  const match=loader.match(/^const z=require\('node:zlib'\),v=require\('node:vm'\);v\.runInThisContext\(z\.gunzipSync\(Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\),\{maxOutputLength:196608\}\)\.toString\('utf8'\)\)$/);
  return !!match&&gunzipSync(Buffer.from(match[1],'base64'),{maxOutputLength:196608}).toString('utf8')===reviewedProgram(readerSource,supervisorSource,mode);
 }catch{return false;}
}
function admitDirectRead({nativeAuthorized=false,sameNativeContext=false,approvedBytesVerified=false,deadlineProof,readReport,executionTime}={}){
 const fail=reason=>({status:'PARTIAL',reason,readyForExistingMonitor:false,currentStockCertified:false});
 if(nativeAuthorized!==true||sameNativeContext!==true||approvedBytesVerified!==true)return fail('TRUSTED_NATIVE_PROVENANCE_REQUIRED');
 const p=deadlineProof,r=readReport;
 if(!p||p.reviewVersion!==REVIEW||p.mode!=='DeadlineSelfTest'||p.status!=='PASS_DEADLINE_ONLY'||p.deadlineProbePassed!==true||p.externalDeadlineMs!==DEADLINE||p.ownedChildExited!==true||p.sourceExecutionCount!==0||p.elapsedMs<DEADLINE-250||p.elapsedMs>DEADLINE+5000)return fail('OWNED_DEADLINE_PROOF_REQUIRED');
 if(!r||r.reviewVersion!==REVIEW||r.mode!=='Status'||r.status!=='COMPLETED'||r.externalDeadlineMs!==DEADLINE||r.ownedChildExited!==true||r.elapsedMs>DEADLINE+5000||r.supervisorNodeVersion!==p.supervisorNodeVersion)return fail('SUPERVISED_READ_REQUIRED');
 const at=Date.parse(executionTime),checked=Date.parse(r.checkedAt),source=r.reader;
 if(!Number.isFinite(at)||!Number.isFinite(checked)||Math.abs(at-checked)>60000)return fail('ACTUAL_EXECUTION_TIME_REQUIRED');
 const sourceAt=Date.parse(source?.checkedAt);
 if(!Number.isFinite(sourceAt)||sourceAt<checked-2000||sourceAt>checked+DEADLINE+5000)return fail('SOURCE_READ_TIME_UNVERIFIED');
 if(!source||source.schemaVersion!=='hourly004-direct-source-v1'||source.accessStatus!=='PASS_READ_ACCESS_ONLY'||source.actualExecutionHostVerified!==true||source.existingIdentityVerified!==true||source.timeZoneVerified!==true)return fail('SOURCE_CONTEXT_UNVERIFIED');
 if(!['existing-owner','existing-native-sandbox'].includes(source.executionIdentityKind)||source.fileRead!=='passed'||source.taskReadsPassed!==11||source.taskReadsExpected!==11||source.activePointerVersion!=='cpu-v5')return fail('SOURCE_FILE_TASK_ACCESS_REQUIRED');
 if(!Array.isArray(source.tasks)||source.tasks.length!==11||new Set(source.tasks.map(t=>t.slot)).size!==11||source.tasks.some(t=>!/^([01][0-9]):00$/.test(t.slot)||Number(t.slot.slice(0,2))<9||Number(t.slot.slice(0,2))>19||t.definitionVerified!==true))return fail('TASK_DEFINITIONS_UNVERIFIED');
 if(source.queue?.known!==true||!Number.isSafeInteger(source.queue.pending)||source.queue.pending<0)return fail('QUEUE_UNKNOWN');
 for(const report of [p,r,source])for(const k of ['sqlQueries','taskRuns','configurationChanges','permissionChanges','sourceFileWrites'])if(report[k]!==0)return fail('ZERO_MUTATION_CONTRACT_REQUIRED');
 if(r.guardChanged!==false||r.recoveryChanged!==false||source.guardChanged!==false||source.recoveryChanged!==false)return fail('PRESERVATION_UNVERIFIED');
 return {status:'PASS_READ_ACCESS_ONLY',reason:null,readyForExistingMonitor:true,currentStockCertified:false,requiresIndependentCentralCheck:true,policyContract:'NOT_FULLY_REVALIDATED'};
}
module.exports={REVIEW,DEADLINE,environment,powerShellArguments,ownedChild,runCapsule,buildNativeCommand,verifyNativeCommand,admitDirectRead};
