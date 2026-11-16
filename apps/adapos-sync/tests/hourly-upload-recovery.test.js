import test from 'node:test';
import assert from 'node:assert/strict';
import {createHourlyUploadRecovery} from '../src/hourlyUploadRecovery.js';
const reset=()=>Object.assign(new Error('SYNTHETIC-PRIVATE'),{code:'ECONNRESET'});
const options=()=>({body:JSON.stringify({branchCode:'004',idempotencyKey:'synthetic-idempotency-key',records:[{productCode:'synthetic'}]}),token:'synthetic-token',branchCode:'004',apiBaseUrl:'https://synthetic.invalid',timeoutMs:30000,maxAttempts:1});
test('reset after a receiver commit resends exact bytes and obtains a duplicate receipt without another insert',async()=>{
 let time=0,calls=0,inserts=0,guards=0;const receiver=new Map(),sent=[];
 const makeUpload=()=>createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{guards++;time+=100;},upload:async o=>{sent.push(o.body);calls++;const id=JSON.parse(o.body).idempotencyKey;if(!receiver.has(id)){receiver.set(id,{accepted:6835,branchCode:'004',captureId:'1'});inserts++;throw reset();}return {...receiver.get(id),duplicate:true};}});
 const o=options(),ack=await makeUpload()(o);assert.equal(ack.duplicate,true);assert.equal(calls,2);assert.equal(inserts,1);assert.equal(guards,1);assert.deepEqual(sent,[o.body,o.body]);
 // A restarted caller still uses the durable original body; the receiver stays
 // idempotent. This is a simulated receiver, not production PostgreSQL proof.
 const again=await makeUpload()(o);assert.equal(again.duplicate,true);assert.equal(inserts,1);
});
test('a first provider cannot mutate original body, branch, credential or destination of the retry',async()=>{
 const o=options(),original={...o};let calls=0,time=0;
 const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{},upload:async v=>{calls++;if(calls===1){v.body='changed';v.branchCode='005';v.token='changed';v.apiBaseUrl='https://changed.invalid';throw reset();}for(const k of ['body','branchCode','token','apiBaseUrl'])assert.equal(v[k],original[k]);return {accepted:6835};}});
 await upload(o);assert.deepEqual(o,original);assert.equal(calls,2);
});
test('a second reset exits after two posts; there is no recursive or stacked recovery',async()=>{
 let calls=0,time=0;const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{},upload:async()=>{calls++;throw reset();}});await assert.rejects(upload(options()),{code:'ECONNRESET'});assert.equal(calls,2);
});
test('timeout, auth, SQL, guard, bad ACK and HTTP throttling/service errors are not reset recovery',async()=>{
 for(const code of ['HOURLY_EVIDENCE_TIMEOUT','EACCES','ELOGIN','HOURLY_EVIDENCE_ACK_INVALID','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_SOURCE_TIMEOUT','HOST_CPU_AT_OR_ABOVE_70_PERCENT','HOURLY_SOURCE_GUARD_UNAVAILABLE']){let calls=0;const upload=createHourlyUploadRecovery({enabled:true,guard:()=>assert.fail('guard must not run'),upload:async()=>{calls++;throw Object.assign(new Error('private'),{code,status:503});}});await assert.rejects(upload(options()),{code});assert.equal(calls,1);}
});
test('guard failure after reset prevents a second post and does not weaken CPU or Full exclusion',async()=>{
 for(const code of ['HOST_CPU_AT_OR_ABOVE_70_PERCENT','EXISTING_AGENT_OR_FULL_SYNC_WORK','HOURLY_SOURCE_GUARD_UNAVAILABLE']){let calls=0,time=0;const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{throw Object.assign(new Error('private'),{code});},upload:async()=>{calls++;throw reset();}});await assert.rejects(upload(options()),{code});assert.equal(calls,1);}
});
test('first post, wait and guard share the original30s delivery budget',async()=>{
 for(const spend of [29000,30000]){let calls=0,time=0;const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{time=30000;},upload:async()=>{calls++;time=spend;throw reset();}});await assert.rejects(upload(options()),{code:'ECONNRESET'});assert.equal(calls,1);}
});
test('OFF is a single unchanged call; invalid enabled stacked attempts fail before network',async()=>{
 let calls=0;const o=options();const disabled=createHourlyUploadRecovery({upload:async v=>{calls++;assert.equal(v,o);return {accepted:6835};}});await disabled(o);assert.equal(calls,1);
 const enabled=createHourlyUploadRecovery({enabled:true,guard:async()=>{},upload:()=>assert.fail('must not post')});for(const bad of [{...o,maxAttempts:3},{...o,body:null},{...o,timeoutMs:60000}])await assert.rejects(enabled(bad),TypeError);
});
test('review regression: a reset nested under auth, HTTP, timeout or ACK failure cannot override the outer stop reason',async()=>{
 for(const code of ['EACCES','HOURLY_EVIDENCE_HTTP_ERROR','HOURLY_EVIDENCE_TIMEOUT','HOURLY_EVIDENCE_ACK_INVALID']){let calls=0,time=0;const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{},upload:async()=>{calls++;if(calls===1)throw Object.assign(new Error('private'),{code,cause:{code:'ECONNRESET'}});return {accepted:6835};}});await assert.rejects(upload(options()),{code});assert.equal(calls,1);}
});
test('a plain fetch wrapper with no outer stop code can retry a reset; an HTTP status always blocks it',async()=>{
 let time=0,calls=0;const upload=createHourlyUploadRecovery({enabled:true,monotonic:()=>time,wait:async ms=>{time+=ms;},guard:async()=>{},upload:async()=>{calls++;if(calls===1)throw Object.assign(new TypeError('private'),{cause:{code:'ECONNRESET'}});return {accepted:6835};}});await upload(options());assert.equal(calls,2);
 for(const status of [401,403,429,503]){calls=0;const blocked=createHourlyUploadRecovery({enabled:true,guard:async()=>assert.fail(),upload:async()=>{calls++;throw Object.assign(reset(),{status});}});await assert.rejects(blocked(options()));assert.equal(calls,1);}
});
