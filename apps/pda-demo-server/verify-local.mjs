// Portable Node-only verification of an ALREADY RUNNING loopback fixture demo.
// Writes synthetic count evidence only after explicit fixture opt-in and health
// checks. Never installs software, starts services, enrolls devices or calls live APIs.
import { randomUUID } from 'node:crypto';
import { writeFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { MOBILE_ROUTE_SHA256 } from './runtime.mjs';
const options={};let step='parse-options';const clients=[];
class FixtureClient {
 constructor(base,id,pin){this.base=base;this.id=id;this.pin=pin;this.device='portable-verifier-'+randomUUID();this.cookie='';this.csrf=null;}
 async call(path,body){const res=await fetch(this.base+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{'X-CSRF-Token':this.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const value of res.headers.getSetCookie())if(value.startsWith('pda_demo_session='))this.cookie=value.split(';')[0];let data;try{data=await res.json();}catch{throw new Error('Endpoint did not return the isolated demo JSON contract');}if(!res.ok)throw new Error('Demo request rejected: '+res.status+' '+(data.code||''));return data;}
 async login(){const r=await this.call('/api/demo/auth/login',{accountId:this.id,pin:this.pin,deviceId:this.device});this.csrf=r.csrfToken;}
 async bootstrap(){const r=await this.call('/api/demo/bootstrap');this.csrf=r.csrfToken;return r;}
 async logout(){if(this.csrf)try{await this.call('/api/demo/auth/logout',{});}catch{}this.cookie='';this.csrf=null;}
}
function insist(value,message){if(!value)throw new Error(message);}
function buildEvent(state,actor,quantity,original=null){
 const product=state.products.find(p=>p.code==='DEMO-002');const assignment=state.assignments.find(a=>a.staffId===actor&&a.productCodes.includes(product.code));
 insist(product?.fixture&&product.canonicalStockCode===product.code&&product.canonicalFactor===1&&assignment,'Explicit synthetic catalog/assignment required');
 const ref=state.stockByProduct[product.code];const now=state.serverTime;
 return {id:randomUUID(),branchCode:state.identity.branchCode,staffId:actor,productCode:product.code,unit:product.unit,canonicalStockCode:product.canonicalStockCode,canonicalFactor:product.canonicalFactor,catalogVersion:product.catalogVersion,assignmentId:assignment.id,assignmentRevision:assignment.revision,startedAt:now,observedAt:now,baseRevision:state.revisions[product.code],lots:original?[{code:'PORTABLE-A',quantity:3,mfg:'2025-01-01',exp:'2027-01-01'},{code:'PORTABLE-B',quantity:3,mfg:'2025-02-01',exp:'2027-02-01'}]:[{code:'PORTABLE-A',quantity,mfg:'2025-01-01',exp:'2027-01-01'}],quantity,complete:true,note:'Synthetic portable local verification',referenceAtScan:ref,supersedesId:original,incidentId:original?randomUUID():null,correctionReason:original?'Synthetic omitted lot found during local verification':null,...(ref.quantity!==null&&ref.quantity!==quantity?{discrepancyConfirmation:{rechecked:true,reason:'Synthetic verifier checked complete scope',countQuantity:quantity,referenceQuantity:ref.quantity,referenceSource:ref.source,referenceObservedAt:ref.observedAt}}:{})};
}
try{
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){const name=args[i];if(name==='--fixture-demo'){options.fixture=true;continue;}if(!['--port','--output'].includes(name)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Use --fixture-demo [--port 4180] [--output absolute/report.json]');if(Object.hasOwn(options,name))throw new Error('Duplicate option');options[name]=args[++i];}
 insist(options.fixture,'Explicit --fixture-demo is required before synthetic writes');
 const port=Number(options['--port']||4180);insist(Number.isSafeInteger(port)&&port>=1024&&port<=65535,'Invalid local port');const base='http://127.0.0.1:'+port;
 step='verify-health';const a=new FixtureClient(base,'staff01','1111'),b=new FixtureClient(base,'lead03','3333');clients.push(a,b);
 const health=await a.call('/api/demo/health');insist(health.environment==='isolated-fixture-demo'&&health.officialStockWrites===false&&health.productionAuth===false&&health.mobileRouteSha256===MOBILE_ROUTE_SHA256,'Target is not the reviewed isolated fixture server; no login/count requests were sent');
 step='verify-entry';const entry=await fetch(base+'/index.html',{signal:AbortSignal.timeout(10000)});insist((await entry.text()).includes('name="pda-api" content="/api/demo"'),'index.html bypasses integrated mode');
 step='fixture-auth';await a.login();await b.login();
 step='lookup-existing-handler';const scan=await a.call('/api/mobile/products/by-barcode/8850000000028');insist(scan.productCode==='DEMO-002'&&scan.branchCode==='004'&&!('costByBranch' in scan),'Unexpected fixture scan scope');insist(!('stockObservedAt' in scan),'Do not infer stock observation time');
 step='submit-count';const first=buildEvent(await a.bootstrap(),'staff01',3);const receipt=await a.call('/api/demo/count-events',first);insist(receipt.status==='synced'&&receipt.eventId===first.id&&receipt.officialStockWrites===false,'Count was not accepted by the fixture server');
 step='retry-original';const repeated=await a.call('/api/demo/count-events',first);insist(repeated.replayed&&repeated.receiptId===receipt.receiptId&&repeated.receivedAt===receipt.receivedAt,'Retry did not return original receipt');
 step='other-client';let other=await b.bootstrap();insist(other.events.some(e=>e.id===first.id),'Second client cannot see original record');
 step='append-correction';const correction=buildEvent(await a.bootstrap(),'staff01',6,first.id);const corrected=await a.call('/api/demo/count-events',correction);insist(corrected.status==='synced'&&corrected.event.supersedesId===first.id,'Correction was not accepted');
 other=await b.bootstrap();const saved=other.events.find(e=>e.id===first.id),next=other.events.find(e=>e.id===correction.id);insist(saved?.quantity===3&&next?.quantity===6&&next.lots.length===2,'Original/correction evidence mismatch');insist(other.sourceHistory.some(h=>h.after.eventId===correction.id),'Source-choice audit missing');
 const report={ok:true,action:'portable-loopback-verification',environment:'isolated-fixture-demo',platform:process.platform,node:process.version,origin:base,mobileRouteSha256:health.mobileRouteSha256,officialStockWrites:false,productionOrStagingVerified:false,checks:['fixture auth and exact mobile read','stock observation time not invented','UI backend entry marker available','durable count receipt','idempotent retry','second authenticated client','append-only correction and two lot dates','source-selection audit'],evidence:{eventId:first.id,receiptId:receipt.receiptId,correctionEventId:correction.id,correctionReceiptId:corrected.receiptId},physicalDeviceRequired:false};
 if(options['--output']){const file=resolve(options['--output']);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});}
 console.log(JSON.stringify(report));
}catch(error){console.error(JSON.stringify({ok:false,action:'portable-loopback-verification',step,reason:error.message,productionOrStagingVerified:false}));process.exitCode=1;}
finally{for(const client of clients)await client.logout();}
