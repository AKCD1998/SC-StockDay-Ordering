import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {safeProviderFailure,safeCpuObservation} from './hourlyGuardEvidence.js';
import {boundedFailureHistory,failureForAttempt,FAILURE_HISTORY_BOUNDS} from './hourlyFailureHistory.js';

export const STATUS_BOUNDS=Object.freeze({attempts:3,retryDelaysMs:[10,25],totalIoMs:2000,finalReserveMs:250,progressIntervalMs:1000,maxProgressPublications:128,viewBytes:262144,receiptBytes:8192});
const slots=/^(09|1[0-9]):00$/;
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const iso=value=>time(value)&&new Date(value).toISOString()===value;
const fail=(code,storageFailure)=>Object.assign(new Error('Hourly storage unavailable; details withheld.'),{code,...(storageFailure?{storageFailure}:{} )});
const nativeCodes=new Set(['EACCES','EPERM','EBUSY','EAGAIN','ETXTBSY','ENOSPC','EDQUOT','EIO','EROFS','ENOENT','EEXIST','EINVAL']);
const stages=new Set(['status-read','status-open','status-write','status-sync','status-close','status-rename','status-serialize','receipt-read','receipt-open','receipt-write','receipt-sync','receipt-close','receipt-lease','outbox-directory','outbox-scan','outbox-read','outbox-open','outbox-write','outbox-sync','outbox-close','outbox-rename','outbox-unlink']);
export function safeStorageFailure(error,stage){
  const code=nativeCodes.has(error?.code)?error.code:'UNKNOWN_IO';
  const category=['ENOSPC','EDQUOT'].includes(code)?'disk-full':code==='EACCES'||(code==='EPERM'&&stage!=='status-rename')?'access-denied':['EBUSY','EAGAIN','ETXTBSY'].includes(code)?'contention':code==='EPERM'&&stage==='status-rename'?'rename-access-or-contention':code==='EROFS'?'read-only-filesystem':code==='ENOENT'?'path-unavailable':'io-unavailable';
  return {stage:stages.has(stage)?stage:'unknown-stage',code,category,retryable:category==='contention'||category==='rename-access-or-contention',detailsWithheld:true};
}
export function successReceipt(value){
  if(value?.status!=='captured-and-acknowledged'||value.expectedProducts!==6835||value.observedProducts!==6835||value.readBatchCount!==35||value.backendAcceptedRecords!==6835||value.outboxPending!==0||!iso(value.finishedAt)||!slots.test(value.slot))return null;
  return {status:'captured-and-acknowledged',slot:value.slot,finishedAt:value.finishedAt,expectedProducts:6835,observedProducts:6835,readBatchCount:35,backendAcceptedRecords:6835,outboxPending:0,sourceFreshnessQualified:false,atomicSnapshotQualified:false};
}
const newer=(a,b)=>!a?b:!b?a:Date.parse(b.finishedAt)>Date.parse(a.finishedAt)?b:a;
function legacySuccess(value){const previous=value?.lastSuccess;return successReceipt(value)??(previous?.status!=null&&previous.status!=='captured-and-acknowledged'?null:successReceipt({...previous,status:'captured-and-acknowledged',expectedProducts:6835}));}
function aged(value,now){if(!value)return null;const difference=Date.parse(now)-Date.parse(value.finishedAt);return {...value,ageMs:Number.isFinite(difference)&&difference>=0?difference:null,timestampInFuture:difference<0};}
const receiptFile=(file,index)=>file+'.receipt-'+index+'.json';
const digest=text=>createHash('sha256').update(text).digest('hex');
function regularRead(io,file,max){
  const st=io.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>max)throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
  return io.readFileSync(file,'utf8');
}
function parseReceipt(text){
  const envelope=JSON.parse(text);
  if(envelope?.schemaVersion!=='hourly004-durable-state-v2'||typeof envelope.body!=='string'||typeof envelope.digest!=='string'||digest(envelope.body)!==envelope.digest)throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
  const value=JSON.parse(envelope.body),a=value?.attempt;
  if(!Number.isSafeInteger(value?.generation)||value.generation<1||!a||!Number.isSafeInteger(a.sequence)||a.sequence<1||!slots.test(a.slot)||!iso(a.startedAt)||!['running','finished'].includes(a.phase)||value.lastSuccess!=null&&!successReceipt(value.lastSuccess))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
  if(a.phase==='finished'&&(!iso(a.finishedAt)||!Number.isSafeInteger(a.finalViewSequence)||a.finalViewSequence<1))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
  const ack=value.lastAck;
  if(ack!=null&&(!/^[a-f0-9]{64}$/.test(ack.key)||!slots.test(ack.slot)||!iso(ack.capturedAt)||!iso(ack.recordedAt)||ack.accepted!==6835||!Number.isSafeInteger(ack.attemptSequence)||ack.attemptSequence<1))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
  const recentFailures=boundedFailureHistory(value.recentFailures);
  return {generation:value.generation,attempt:{sequence:a.sequence,slot:a.slot,startedAt:a.startedAt,phase:a.phase,...(a.phase==='finished'?{finishedAt:a.finishedAt,finalViewSequence:a.finalViewSequence}:{})},lastSuccess:value.lastSuccess==null?null:successReceipt(value.lastSuccess),lastAck:ack?{key:ack.key,slot:ack.slot,capturedAt:ack.capturedAt,accepted:6835,recordedAt:ack.recordedAt,attemptSequence:ack.attemptSequence}:null,recentFailures,failureHistoryRecorded:Array.isArray(value.recentFailures),failureHistoryIncomplete:value.failureHistoryIncomplete===true||(value.recentFailures!=null&&(!Array.isArray(value.recentFailures)||recentFailures.length!==value.recentFailures.length))};
}
export function readHourlyDurableState(file,{io=fs}={}){
  const valid=[],issues=[];let present=0;
  for(let index=0;index<2;index++){
    try{const text=regularRead(io,receiptFile(file,index),STATUS_BOUNDS.receiptBytes);valid.push({index,value:parseReceipt(text)});present++;}
    catch(error){if(error.code==='ENOENT')continue;present++;issues.push(error.code==='HOURLY_RECEIPT_STATE_UNVERIFIED'||error instanceof SyntaxError?{stage:'receipt-read',code:'INVALID_DATA',category:'unverified-data',retryable:false,detailsWithheld:true}:safeStorageFailure(error,'receipt-read'));}
  }
  valid.sort((a,b)=>b.value.generation-a.value.generation);
  const conflict=valid.length===2&&valid[0].value.generation===valid[1].value.generation&&JSON.stringify(valid[0].value)!==JSON.stringify(valid[1].value);
  return {state:conflict?null:valid[0]?.value??null,index:conflict?null:valid[0]?.index??null,issues,present,conflict};
}
function readLegacy(file,io){try{return {value:JSON.parse(regularRead(io,file,STATUS_BOUNDS.viewBytes))};}catch(error){return {value:null,error:error.code==='ENOENT'?null:error instanceof SyntaxError?{stage:'status-read',code:'INVALID_DATA',category:'unverified-data',retryable:false,detailsWithheld:true}:safeStorageFailure(error,'status-read')};}}
function acquireLease(file,io,pidAlive){
  const dir=file+'.receipt-lock',owner=path.join(dir,randomUUID()+'.owner');
  for(let attempt=0;attempt<2;attempt++){
    try{io.mkdirSync(dir);const fd=io.openSync(owner,'wx',0o600);try{io.writeFileSync(fd,JSON.stringify({pid:process.pid}));io.fsyncSync(fd);}finally{io.closeSync(fd);}return ()=>{try{io.unlinkSync(owner);io.rmdirSync(dir);}catch{}};}
    catch(error){
      if(error.code!=='EEXIST')throw fail('HOURLY_RECEIPT_PERSISTENCE_FAILED',safeStorageFailure(error,'receipt-lease'));
      try{const st=io.lstatSync(dir),names=io.readdirSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||names.length!==1||!/^[a-f0-9-]+\.owner$/.test(names[0]))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');const prior=path.join(dir,names[0]),value=JSON.parse(regularRead(io,prior,1024));if(!Number.isSafeInteger(value.pid)||value.pid<1||pidAlive(value.pid)!==false)throw fail('HOURLY_RECEIPT_BUSY');io.unlinkSync(prior);io.rmdirSync(dir);}
      catch(cause){throw fail(cause.code==='HOURLY_RECEIPT_BUSY'?cause.code:'HOURLY_RECEIPT_STATE_UNVERIFIED');}
    }
  }
  throw fail('HOURLY_RECEIPT_BUSY');
}
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='ESRCH'?false:null;}};

// The two small checksummed receipt snapshots are critical state. Updating the
// inactive file in place avoids rename contention and preserves the last valid
// generation if a write is torn. Neither file contains product quantities.
export function createHourlyStatusStore(file,{now=()=>new Date().toISOString(),handoffReceipt=null,monotonic=()=>performance.now(),remainingMs=()=>1200000,io=fs,viewIo=fs.promises,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pidAlive=alive}={}){
  let state=null,activeIndex=null,release=null,closed=false,pending=null,pumpPromise=null,timer=null,viewSequence=0,progressCount=0,nextProgressAt=0,spentMs=0,disabled=false,finishing=false;
  const health={currentlyUnavailable:false,everFailed:false,failureCount:0,retryCount:0,recoveredCount:0,lastFailure:null,recentFailures:[],lastPublishedSequence:null,coalesced:0,publicationCount:0,ioPending:0};
  const budget=()=>Math.max(0,Math.min(remainingMs(),STATUS_BOUNDS.totalIoMs-spentMs));
  const healthSnapshot=()=>({...health,recentFailures:health.recentFailures.map(v=>({...v})),spentMs:Math.ceil(spentMs),budgetMs:STATUS_BOUNDS.totalIoMs});
  const remember=failure=>{health.currentlyUnavailable=true;health.everFailed=true;health.failureCount++;health.lastFailure=failure;health.recentFailures.push(failure);if(health.recentFailures.length>8)health.recentFailures.shift();};
  const releaseIfIdle=()=>{if(closed&&health.ioPending===0&&release){release();release=null;}};
  function commit(next){
    if(remainingMs()<=0)throw fail('HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED');
    const index=activeIndex===0?1:0,target=receiptFile(file,index),value={...next,recentFailures:boundedFailureHistory(next.recentFailures??state?.recentFailures),failureHistoryIncomplete:next.failureHistoryIncomplete===true||state?.failureHistoryIncomplete===true,generation:(state?.generation??0)+1};
    if(!Number.isSafeInteger(value.generation))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
    const body=JSON.stringify(value),bytes=Buffer.from(JSON.stringify({schemaVersion:'hourly004-durable-state-v2',body,digest:digest(body)}));
    if(bytes.length>STATUS_BOUNDS.receiptBytes)throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
    let fd,stage='receipt-open';
    try{
      try{regularRead(io,target,STATUS_BOUNDS.receiptBytes);fd=io.openSync(target,'r+');}catch(error){if(error.code!=='ENOENT')throw error;fd=io.openSync(target,'wx',0o600);}
      stage='receipt-write';io.writeFileSync(fd,bytes);io.ftruncateSync(fd,bytes.length);stage='receipt-sync';io.fsyncSync(fd);stage='receipt-close';io.closeSync(fd);fd=null;
      if(remainingMs()<=0)throw fail('HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED');
      state=value;activeIndex=index;
    }catch(error){if(error.code==='HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED')throw error;throw fail('HOURLY_RECEIPT_PERSISTENCE_FAILED',safeStorageFailure(error,stage));}
    finally{if(fd!=null)try{io.closeSync(fd);}catch{}}
  }
  async function publish(item){
    const temporary=file+'.view-pending';
    for(let attempt=1;attempt<=STATUS_BOUNDS.attempts;attempt++){
      const available=budget()-(item.final?0:STATUS_BOUNDS.finalReserveMs);
      if(disabled)return;
      if(available<=0){remember({stage:'status-write',code:'STATUS_BUDGET_EXHAUSTED',category:'budget-exhausted',retryable:false,detailsWithheld:true});return;}
      let text;try{text=JSON.stringify({...item.summary,statusAttemptSequence:state.attempt.sequence,statusViewSequence:item.sequence,statusPublishedAt:now(),lastSuccess:aged(state.lastSuccess,now()),recentFailures:state.recentFailures,lastAttemptComplete:item.summary.status==='captured-and-acknowledged',currentStockCertified:false,statusPersistence:{...healthSnapshot(),currentlyUnavailable:false,recoveredCount:health.recoveredCount+(health.currentlyUnavailable?1:0)}},null,2);if(Buffer.byteLength(text)>STATUS_BOUNDS.viewBytes)throw fail('HOURLY_STATUS_VIEW_TOO_LARGE');}catch{remember({stage:'status-serialize',code:'OUTPUT_LIMIT',category:'output-limit',retryable:false,detailsWithheld:true});disabled=true;return;}
      let handle,stage='status-open',cancelled=false,deadlineTimer;const started=monotonic();
      const assertActive=()=>{if(cancelled)throw Object.assign(new Error('Display deadline unavailable.'),{code:'STATUS_IO_DEADLINE'});};
      let operation;
      try{
        health.ioPending++;
        operation=(async()=>{
          for(const target of [file,temporary]){try{const st=await viewIo.lstat(target);assertActive();if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Object.assign(new Error('Status path unavailable.'),{code:'EINVAL'});}catch(error){if(error.code!=='ENOENT')throw error;}}
          assertActive();handle=await viewIo.open(temporary,'w',0o600);assertActive();stage='status-write';await handle.writeFile(text);assertActive();stage='status-sync';await handle.sync();assertActive();stage='status-close';await handle.close();handle=null;assertActive();stage='status-rename';await viewIo.rename(temporary,file);assertActive();
        })().finally(async()=>{if(handle)try{await handle.close();}catch{}health.ioPending--;releaseIfIdle();});
        await Promise.race([operation,new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>{cancelled=true;disabled=true;reject(Object.assign(new Error('Display deadline unavailable.'),{code:'STATUS_IO_DEADLINE'}));},Math.max(1,Math.floor(available)));})]);
        if(health.currentlyUnavailable)health.recoveredCount++;health.currentlyUnavailable=false;health.lastPublishedSequence=item.sequence;health.publicationCount++;return;
      }catch(error){
        const failure=error.code==='STATUS_IO_DEADLINE'?{stage,code:'STATUS_IO_DEADLINE',category:'deadline',retryable:false,detailsWithheld:true}:safeStorageFailure(error,stage);remember(failure);
        if(!failure.retryable){disabled=true;return;}
        if(attempt>=STATUS_BOUNDS.attempts)return;
        const delay=STATUS_BOUNDS.retryDelaysMs[attempt-1];
        // EPERM at rename is ambiguous on Windows, not proof of ACL denial.
        // Only the same display operation is retried, with no identity change.
        const left=STATUS_BOUNDS.totalIoMs-spentMs-(monotonic()-started)-(item.final?0:STATUS_BOUNDS.finalReserveMs);
        if(left<=delay||remainingMs()<=delay)return;
        health.retryCount++;await wait(delay);
      }finally{clearTimeout(deadlineTimer);spentMs+=Math.max(0,monotonic()-started);}
    }
  }
  function schedule(){
    if(closed||pumpPromise||timer||!pending)return;
    const delay=pending.final?0:Math.max(0,nextProgressAt-monotonic());
    timer=setTimeout(()=>{timer=null;pumpPromise=(async()=>{const item=pending;pending=null;if(!item.final)progressCount++;await publish(item);nextProgressAt=monotonic()+STATUS_BOUNDS.progressIntervalMs;})().catch(()=>remember({stage:'status-write',code:'UNKNOWN_IO',category:'io-unavailable',retryable:false,detailsWithheld:true})).finally(()=>{pumpPromise=null;schedule();});},delay);
  }
  return {
    setRemaining(fn){remainingMs=fn;},
    begin({slot,startedAt}){
      if(release||closed||!slots.test(slot)||!iso(startedAt))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
      release=acquireLease(file,io,pidAlive);
      try{
        const durable=readHourlyDurableState(file,{io}),legacy=readLegacy(file,io);
        if(durable.conflict||durable.present>0&&!durable.state||durable.issues.some(v=>v.category!=='unverified-data'))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED',durable.issues[0]);
        // An unreadable display is not critical state. Preserve its bytes for
        // later history recovery instead of overwriting an unseen last success.
        if(legacy.error){remember(legacy.error);disabled=true;}
        state=durable.state;activeIndex=durable.index;
        const prior=newer(newer(state?.lastSuccess??null,legacySuccess(legacy.value)),successReceipt(handoffReceipt));
        const sequence=(state?.generation??0)+1;
        commit({attempt:{sequence,slot,startedAt,phase:'running'},lastSuccess:prior,lastAck:state?.lastAck??null});
      }catch(error){release();release=null;throw error;}
    },
    offer(summary){
      if(!state||closed||finishing||disabled||progressCount>=STATUS_BOUNDS.maxProgressPublications)return;
      if(pending)health.coalesced++;pending={summary,sequence:++viewSequence,final:false};schedule();
    },
    acknowledge({ack,payload,remainingMs:deliveryRemaining}){
      if(!state||payload?.branchCode!=='004'||!Array.isArray(payload.records)||payload.records.length!==6835||ack?.accepted!==6835||ack.branchCode!=='004'||ack.capturedAt!==payload.capturedAt||!slots.test(payload.plannedSlot)||!iso(payload.capturedAt)||!/^[a-f0-9]{64}$/.test(payload.idempotencyKey)||!Number.isFinite(deliveryRemaining)||deliveryRemaining<=0)throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
      const receipt={key:payload.idempotencyKey,slot:payload.plannedSlot,capturedAt:payload.capturedAt,accepted:6835,recordedAt:now(),attemptSequence:state.attempt.sequence};
      if(state.lastAck?.key===receipt.key&&state.lastAck?.attemptSequence===receipt.attemptSequence)return;
      const started=monotonic();commit({...state,lastAck:receipt});
      if(monotonic()-started>=deliveryRemaining)throw fail('HOURLY_DELIVERY_BUDGET_EXHAUSTED');
    },
    async finish(summary){
      if(!state||closed)throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
      finishing=true;if(timer){clearTimeout(timer);timer=null;}pending=null;
      const success=successReceipt(summary);
      if(success&&(!state.lastAck||state.lastAck.attemptSequence!==state.attempt.sequence||state.lastAck.slot!==success.slot))throw fail('HOURLY_RECEIPT_STATE_UNVERIFIED');
      const sequence=++viewSequence;
      const failure=failureForAttempt(summary,state.attempt);
      commit({...state,attempt:{...state.attempt,phase:'finished',finishedAt:summary.finishedAt,finalViewSequence:sequence},lastSuccess:newer(state.lastSuccess,success),recentFailures:failure?boundedFailureHistory([...(state.recentFailures??[]),failure]):state.recentFailures});
      if(pumpPromise)await pumpPromise;
      pending={summary,sequence,final:true};schedule();
      while(timer||pumpPromise||pending){if(pumpPromise)await pumpPromise;else await new Promise(resolve=>setTimeout(resolve,1));}
      const available=health.lastPublishedSequence===sequence;
      return {...summary,status:available?summary.status:'status-unavailable',captureOutcome:summary.status,lastSuccess:aged(state.lastSuccess,now()),recentFailures:state.recentFailures,lastAttemptComplete:available&&summary.status==='captured-and-acknowledged',currentStockCertified:false,statusPersistence:healthSnapshot()};
    },
    snapshot:healthSnapshot,
    async close(){closed=true;if(timer){clearTimeout(timer);timer=null;}pending=null;if(pumpPromise)await pumpPromise;releaseIfIdle();},
  };
}

export function inspectHourlyStatus(file,{now=new Date().toISOString(),legacyMode=false,latestTaskStartedAt=null,taskRunning=null}={}){
  const durable=readHourlyDurableState(file),legacy=readLegacy(file,fs),state=durable.state,value=legacy.value;
  const observed=Date.parse(now),tolerance=2000,taskLimit=1200000;
  const historical=v=>v&&Number.isFinite(observed)&&Date.parse(v.finishedAt)<=observed+tolerance?v:null;
  const prior=newer(historical(state?.lastSuccess??null),historical(legacySuccess(value)));
  const latest=Date.parse(latestTaskStartedAt),start=Date.parse(state?.attempt?.startedAt),inspection=Date.parse(value?.inspectionTime),finished=Date.parse(value?.finishedAt);
  const taskFresh=Number.isFinite(observed)&&Number.isFinite(latest)&&latest<=observed+tolerance&&observed-latest<=3600000+tolerance;
  const slotFor=milliseconds=>new Date(milliseconds+7*3600000).toISOString().slice(11,13)+':00';
  const sameDay=(a,b)=>new Date(a+7*3600000).toISOString().slice(0,10)===new Date(b+7*3600000).toISOString().slice(0,10);
  const viewMatchesTask=taskFresh&&slots.test(value?.slot)&&Number.isFinite(inspection)&&inspection>=latest-tolerance&&inspection<=latest+taskLimit&&inspection<=observed+tolerance&&value.slot===slotFor(latest)&&sameDay(latest,inspection);
  const finalTimeValid=viewMatchesTask&&Number.isFinite(finished)&&finished>=inspection&&finished<=latest+taskLimit&&finished<=observed+tolerance;
  let known=false;
  if(legacyMode){known=finalTimeValid&&taskRunning===false;}
  else if(state&&!durable.issues.length&&!durable.conflict&&value?.statusAttemptSequence===state.attempt.sequence&&value.slot===state.attempt.slot&&inspection>=start){known=finalTimeValid&&taskRunning===false&&state.attempt.phase==='finished'&&value.statusViewSequence===state.attempt.finalViewSequence&&value.finishedAt===state.attempt.finishedAt&&Math.abs(latest-start)<=tolerance;}
  if(value?.status==='captured-and-acknowledged'&&(!successReceipt(value)||(!legacyMode&&state?.lastSuccess?.finishedAt!==value.finishedAt)))known=false;
  const allowed=['captured-and-acknowledged','pending-or-incomplete','stopped-no-partial-capture','launch-stopped'];
  if(!allowed.includes(value?.status))known=false;
  const number=v=>Number.isFinite(v)&&v>=0&&v<=10000?v:null;
  const failure=value?.failure??value?.deliveryFailure??value?.uploadFailure;const codes=new Set(['EACCES','EPERM','ETIMEOUT','ELOGIN','ESOCKET','ECONNRESET','ECONNCLOSED','HOURLY_RECEIPT_PERSISTENCE_FAILED','HOURLY_RECEIPT_STATE_UNVERIFIED','HOURLY_RECEIPT_BUSY','HOURLY_OUTBOX_PERSISTENCE_FAILED','HOURLY_OUTBOX_CORRUPT','HOURLY_OUTBOX_FULL','HOURLY_DELIVERY_BUDGET_EXHAUSTED','HOURLY_SOURCE_GUARD_UNAVAILABLE','HOURLY_SOURCE_TIMEOUT','HOURLY_SOURCE_ACCESS_DENIED','HOURLY_SOURCE_READ_FAILED','HOST_CPU_AT_OR_ABOVE_70_PERCENT','EXISTING_AGENT_OR_FULL_SYNC_WORK','GUARD_PROCESS_IDENTITY_UNREADABLE','HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED','HOURLY_OBSERVER_CLOCK_STEP_DETECTED','HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED','HOURLY_SOURCE_COHORT_INCOMPLETE','HOURLY_SOURCE_COHORT_CHANGED','HOURLY_EVIDENCE_BUSY','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_EVIDENCE_TIMEOUT','HOURLY_COMPLETE_CONFIG_INVALID','OWN_SQL_METRICS_UNAVAILABLE','SQL_READONLY_STATEMENT_REJECTED','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_OPERATION_FAILED_DETAILS_WITHHELD']);
  const progress=!legacyMode&&viewMatchesTask&&state?.attempt.phase==='running'&&value?.statusAttemptSequence===state.attempt.sequence&&Math.abs(latest-start)<=tolerance&&iso(value.statusPublishedAt)&&Date.parse(value.statusPublishedAt)<=observed+tolerance?{asOf:value.statusPublishedAt,observedProducts:number(value.observedProducts),currentStateVerified:false}:null;
  const storage=known?(failure?.storageFailure??value?.deliveryFailure?.storageFailure):durable.issues[0];
  const diagnosticStages=new Set(['launch','powershell-startup','host-identity','task-scheduler','processes','cpu-provider','capture-lock','sql-connect','readonly-boundary','sql-batch','payload','outbox-enqueue','sql-close','delivery-lock','outbox-scan','upload','acknowledgement','receipt-persist']);
  const last=value?.diagnostics?.events?.at?.(-1),lastStage=known&&diagnosticStages.has(last?.stage)&&['start','success','failure','progress','retry'].includes(last.kind)?{stage:last.stage,kind:last.kind}:null;
  const guardReasons=new Set(['HOST_UNVERIFIED','IDENTITY_UNVERIFIED','FULL_SYNC_BUSY','PROCESS_UNREADABLE','CPU_UNREADABLE','CPU_LIMIT','PROVIDER_TIMEOUT','ACCESS_DENIED','TASKS_UNAVAILABLE','PROCESSES_UNAVAILABLE','CPU_UNAVAILABLE','PLATFORM_UNAVAILABLE','BUDGET_EXHAUSTED','START_FAILED','DEADLINE','OUTPUT_LIMIT','INVALID_OUTPUT','CHILD_EXIT','READY_UNVERIFIED','CHILD_STILL_RUNNING','GUARD_LEASE_UNVERIFIED']);
  return {schemaVersion:'hourly004-status-view-v2',availability:known?'published':'unknown',latestAttempt:{status:known?value.status:'unknown',slot:known?value.slot:null,startedAt:known?new Date(latest).toISOString():null,inspectionTime:known?new Date(inspection).toISOString():null,finishedAt:known?new Date(finished).toISOString():null,evidenceMode:known?(legacyMode?'legacy-v1':'durable-receipt'):null,observedProducts:known?number(value.observedProducts):null,backendAcceptedRecords:known?number(value.backendAcceptedRecords):null,outboxPending:known?number(value.outboxPending):null},progressObservation:progress,lastSuccess:aged(prior,now),failureCode:known&&failure?(codes.has(failure.code)?failure.code:'HOURLY_OPERATION_FAILED_DETAILS_WITHHELD'):null,lastStage,cpuObservation:known?safeCpuObservation(failure?.guard?.cpuObservation??value?.diagnostics?.events?.findLast?.(e=>e.cpuObservation)?.cpuObservation):null,providerFailure:known?safeProviderFailure(failure?.guard?.providerFailure):null,guardReason:known&&guardReasons.has(failure?.guard?.reason)?failure.guard.reason:null,storageFailure:storage?safeStorageFailure({code:storage.code},storage.stage):null,receiptState:durable.present===0?'not-initialized':durable.issues.length||durable.conflict?'degraded':'verified',failureHistory:{availability:!state||durable.conflict||durable.issues.length?'unknown':state.failureHistoryRecorded?'verified':'not-recorded-by-predecessor',records:state&&!durable.conflict&&!durable.issues.length?state.recentFailures:[],incomplete:state?.failureHistoryIncomplete===true,coversAllAttempts:false,maximumEntries:FAILURE_HISTORY_BOUNDS.entries,maximumBytes:FAILURE_HISTORY_BOUNDS.bytes},currentStockCertified:false};
}
