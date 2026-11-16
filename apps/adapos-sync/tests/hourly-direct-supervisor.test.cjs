'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const api=require('../scripts/hourlyDirectReadSupervisor.cjs');
const reader=fs.readFileSync(path.join(__dirname,'../scripts/Read-Hourly004DirectSource.ps1'),'utf8');
const supervisor=fs.readFileSync(path.join(__dirname,'../scripts/hourlyDirectReadSupervisor.cjs'),'utf8');
function fake(value,inspect=()=>{}){return (exe,args,opts)=>{inspect(exe,args,opts);return value;};}
test('child uses fixed PS5.1, no shell, exact timeout and only safe environment',()=>{
 const r=api.ownedChild("Write-Output '{}'",{env:{SystemRoot:'C:\\Windows',NODE_OPTIONS:'PRIVATE_SENTINEL',RENDER_API_KEY:'PRIVATE_SENTINEL'},spawn:fake({status:0,stdout:'{}'},(exe,args,o)=>{
  assert.equal(exe,String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`);
  assert.equal(o.shell,false);assert.equal(o.windowsHide,true);assert.equal(o.timeout,30000);assert.equal(o.killSignal,'SIGKILL');assert.equal(o.maxBuffer,262144);
  assert.equal(o.env.SystemRoot,'C:\\Windows');assert.equal(o.env.NODE_OPTIONS,undefined);assert.equal(o.env.RENDER_API_KEY,undefined);
  assert.ok(args.includes('-NoProfile')&&args.includes('-NonInteractive')&&args.includes('-Command'));
 })});assert.equal(r.status,'COMPLETED');assert.equal(r.ownedChildExited,true);
});
test('timeout discards partial stdout and raw errors and confirms only owned exit',()=>{
 const r=api.ownedChild('fixture',{spawn:fake({pid:1,status:null,signal:'SIGKILL',stdout:'PRIVATE_SENTINEL',stderr:'PRIVATE_SENTINEL',error:{code:'ETIMEDOUT',message:'PRIVATE_SENTINEL'}})});
 assert.equal(r.status,'TIMED_OUT');assert.equal(r.ownedChildExited,true);assert.equal(r.data,null);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SENTINEL|"pid"/);
});
test('unconfirmed child exit remains false and cannot certify a deadline',()=>{
 const r=api.ownedChild('fixture',{spawn:fake({status:null,signal:null,error:{code:'ETIMEDOUT'}})});
 assert.equal(r.ownedChildExited,false);assert.equal(r.data,null);
});
test('failed spawn does not become no pending or successful source read',()=>{
 const r=api.ownedChild('fixture',{spawn:fake({status:null,error:{code:'EACCES'},stderr:'PRIVATE_SENTINEL'})});
 assert.equal(r.status,'BLOCKED');assert.equal(r.ownedChildExited,null);assert.equal(r.data,null);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SENTINEL/);
});
test('malformed, oversized and sensitive output stay unavailable',()=>{
 for(const stdout of ['not json','{"rawLog":"PRIVATE_SENTINEL"}','{"queue":{"token":"PRIVATE_SENTINEL"}}',JSON.stringify({value:'x'.repeat(257)})]){
  const r=api.ownedChild('fixture',{spawn:fake({status:0,stdout,stderr:'PRIVATE_SENTINEL'})});
  assert.equal(r.safeError,'DIRECT_READ_INVALID_OUTPUT');assert.equal(r.data,null);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SENTINEL/);
 }
 const r=api.ownedChild('fixture',{spawn:fake({status:null,signal:'SIGKILL',error:{code:'ENOBUFS'},stdout:'PRIVATE_SENTINEL'})});
 assert.equal(r.safeError,'DIRECT_READ_OUTPUT_LIMIT');assert.equal(r.ownedChildExited,true);
});
test('source access denial is retained as a source report, never zeroed',()=>{
 const data={schemaVersion:'hourly004-direct-source-v1',accessStatus:'BLOCKED',safeError:'ACCESS_DENIED',queue:{known:false,pending:null}};
 const r=api.ownedChild('fixture',{spawn:fake({status:1,stdout:JSON.stringify(data)})});
 assert.equal(r.status,'READER_REPORTED_FAILURE');assert.deepEqual(r.data,data);
});
test('capsules have fixed modes, bounded size and reviewed code only',()=>{
 for(const mode of ['Status','DeadlineSelfTest']){const cmd=api.buildNativeCommand(reader,supervisor,mode);assert.ok(cmd.length<29000);assert.ok(cmd.startsWith("& 'C:\\Program Files\\nodejs\\node.exe' -e '"));assert.doesNotMatch(cmd,/\$\(|`|PRIVATE_SENTINEL/);assert.equal(api.verifyNativeCommand(cmd,reader,supervisor,mode),true);assert.equal(api.verifyNativeCommand(cmd,reader+'foreign',supervisor,mode),false);assert.equal(api.verifyNativeCommand(cmd,reader,supervisor,mode==='Status'?'DeadlineSelfTest':'Status'),false);assert.equal(api.verifyNativeCommand(cmd+';unexpected',reader,supervisor,mode),false);}
 assert.throws(()=>api.buildNativeCommand(reader,supervisor,'RunTask'),/MODE_NOT_ALLOWED/);
 assert.throws(()=>api.powerShellArguments('x'.repeat(98305)),/PAYLOAD_LIMIT/);
 assert.doesNotMatch(supervisor,/process\.kill\(|Get-Process|Stop-Process|taskkill|writeFile|WriteAll|Set-Acl|RunAs|schtasks/i);
});
test('public capsule stops on a non-target host before running any reader',{skip:require('node:os').hostname().toUpperCase()==='SERVER004'},()=>{
 const r=api.runCapsule({reviewVersion:api.REVIEW,mode:'Status',readerSource:reader});assert.equal(r.safeError,'WRONG_EXECUTION_HOST');assert.equal(r.sourceExecutionCount,0);
});
test('real PS5.1 memory-only child preserves the non-target host gate',{skip:process.platform!=='win32'||require('node:os').hostname().toUpperCase()==='SERVER004'},()=>{
 const r=api.ownedChild(reader);assert.equal(r.status,'READER_REPORTED_FAILURE');assert.equal(r.ownedChildExited,true);assert.equal(r.data.safeError,'WRONG_EXECUTION_HOST');assert.equal(r.data.sourceFileWrites,0);assert.equal(r.data.taskRuns,0);
});
test('real hanging owned PS5.1 child is terminated and reaped without a business process scan',{skip:process.platform!=='win32'},()=>{
 const r=api.ownedChild('Start-Sleep -Seconds 120',{timeout:1500});assert.equal(r.status,'TIMED_OUT');assert.equal(r.ownedChildExited,true);assert.ok(r.elapsedMs>=1250&&r.elapsedMs<6500);assert.equal(r.data,null);
 console.log(JSON.stringify({simulation:true,ownedSleepChildTerminated:true,elapsedMs:r.elapsedMs,sourceReads:0,taskRuns:0,businessProcessesTerminated:0}));
});
test('packaged memory-only command executes on Windows without native workspace writes',{skip:process.platform!=='win32'||require('node:os').hostname().toUpperCase()==='SERVER004'},()=>{
 const ps=String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
 const command=api.buildNativeCommand(reader,supervisor,'Status');
 const r=spawnSync(ps,['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,env:api.environment(),timeout:10000,maxBuffer:262144});
 let data;try{data=JSON.parse(r.stdout.replace(/^\uFEFF/,''));}catch{assert.fail('Capsule did not return its safe JSON report');}
 assert.equal(data.safeError,'WRONG_EXECUTION_HOST');assert.equal(data.sourceExecutionCount,0);assert.equal(data.sourceFileWrites,0);
});
function admissionFixture(){
 const at='2026-11-12T03:10:00.000Z';
 const zero={sqlQueries:0,taskRuns:0,configurationChanges:0,permissionChanges:0,sourceFileWrites:0};
 const deadlineProof={...zero,reviewVersion:api.REVIEW,mode:'DeadlineSelfTest',status:'PASS_DEADLINE_ONLY',deadlineProbePassed:true,externalDeadlineMs:30000,ownedChildExited:true,sourceExecutionCount:0,elapsedMs:30020,supervisorNodeVersion:'24.16.0'};
 const source={...zero,schemaVersion:'hourly004-direct-source-v1',checkedAt:at,accessStatus:'PASS_READ_ACCESS_ONLY',actualExecutionHostVerified:true,existingIdentityVerified:true,timeZoneVerified:true,executionIdentityKind:'existing-native-sandbox',administratorToken:false,fileRead:'passed',taskReadsExpected:11,taskReadsPassed:11,activePointerVersion:'cpu-v5',guardChanged:false,recoveryChanged:false,queue:{known:true,pending:0},tasks:Array.from({length:11},(_,i)=>({slot:String(i+9).padStart(2,'0')+':00',definitionVerified:true}))};
 return {nativeAuthorized:true,sameNativeContext:true,approvedBytesVerified:true,executionTime:at,deadlineProof,readReport:{...zero,reviewVersion:api.REVIEW,checkedAt:at,mode:'Status',status:'COMPLETED',externalDeadlineMs:30000,ownedChildExited:true,elapsedMs:900,supervisorNodeVersion:'24.16.0',guardChanged:false,recoveryChanged:false,reader:source}};
}
test('actual native sandbox can pass read-only admission without Administrator or freshness claims',()=>{
 const result=api.admitDirectRead(admissionFixture());assert.equal(result.status,'PASS_READ_ACCESS_ONLY');assert.equal(result.currentStockCertified,false);assert.equal(result.policyContract,'NOT_FULLY_REVALIDATED');assert.equal(result.requiresIndependentCentralCheck,true);
});
test('payload cannot grant native authorization or bypass deadline/queue/clock/preservation gates',()=>{
 const changes=[f=>f.nativeAuthorized=false,f=>f.sameNativeContext=false,f=>f.approvedBytesVerified=false,f=>f.deadlineProof.deadlineProbePassed=false,f=>f.deadlineProof.ownedChildExited=false,f=>f.deadlineProof.elapsedMs=29000,f=>f.readReport.ownedChildExited=false,f=>f.readReport.supervisorNodeVersion='different',f=>f.executionTime='2026-11-13T03:10:00Z',f=>f.readReport.reader.checkedAt='2026-11-11T03:10:00Z',f=>f.readReport.reader.executionIdentityKind='other',f=>f.readReport.reader.taskReadsPassed=10,f=>f.readReport.reader.tasks[0].definitionVerified=false,f=>f.readReport.reader.queue={known:false,pending:null},f=>f.readReport.reader.permissionChanges=1,f=>f.readReport.guardChanged=true];
 for(const change of changes){const f=admissionFixture();change(f);const r=api.admitDirectRead(f);assert.equal(r.readyForExistingMonitor,false);assert.equal(r.status,'PARTIAL');}
});
