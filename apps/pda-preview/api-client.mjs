import { normalizeMobileRead } from './mobile-contract.mjs';
// Enabled only by the isolated demo server's HTML marker. Static hosted v4 and
// the navy/yellow review remain browser-only, with a separate storage namespace.
export const apiMode=!!document.querySelector('meta[name="pda-api"][content="/api/demo"]');
export class ApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
export class DemoApi {
 constructor(){this.csrf=null;const key='sc-pda-api-device-v1';this.deviceId=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,this.deviceId);}
 async request(path,{method='GET',body}={}){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&this.csrf?{'X-CSRF-Token':this.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new ApiError(response.status,data.code||'API_ERROR',data.error||'API request failed');return data;
 }
 async login(accountId,pin){const data=await this.request('/api/demo/auth/login',{method:'POST',body:{accountId,pin,deviceId:this.deviceId}});this.csrf=data.csrfToken;this.identity=data.identity;return data;}
 async bootstrap(){const data=await this.request('/api/demo/bootstrap');if(data.environment!=='isolated-fixture-demo'||data.officialStockWrites!==false)throw new Error('Unexpected demo environment');this.csrf=data.csrfToken;this.identity=data.identity;return data;}
 async logout(){await this.request('/api/demo/auth/logout',{method:'POST',body:{}});this.csrf=null;}
 async lookup(barcode){const result=await this.request('/api/mobile/products/by-barcode/'+encodeURIComponent(barcode));return {...result,stockEvidence:normalizeMobileRead(result,{branchCode:this.identity.branchCode,requestedBarcode:barcode}).stock};}
 submit(request){return this.request('/api/demo/count-events',{method:'POST',body:request});}
}
export class DurableOutbox {
 constructor(){this.ready=new Promise((resolve,reject)=>{const request=indexedDB.open('sc-pda-api-outbox-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('events',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 async all(){const db=await this.ready;return new Promise((resolve,reject)=>{const tx=db.transaction('events','readonly'),r=tx.objectStore('events').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async put(event){const db=await this.ready;return new Promise((resolve,reject)=>{const tx=db.transaction('events','readwrite');tx.objectStore('events').put(event);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Outbox transaction aborted'));});}
}
export function countRequest(event,product,assignment){
 return {id:event.id,branchCode:event.branchCode,staffId:event.staffId,productCode:event.productCode,unit:product.unit,canonicalStockCode:product.canonicalStockCode,canonicalFactor:product.canonicalFactor,catalogVersion:product.catalogVersion,assignmentId:assignment.id,assignmentRevision:assignment.revision,startedAt:event.startedAt,observedAt:event.observedAt,baseRevision:event.baseRevision,lots:event.lots,quantity:event.quantity,complete:event.complete,note:event.note,referenceAtScan:event.referenceAtScan,supersedesId:event.supersedesId,incidentId:event.incidentId,correctionReason:event.correctionReason,...(event.discrepancyConfirmation?{discrepancyConfirmation:event.discrepancyConfirmation}:{})};
}
