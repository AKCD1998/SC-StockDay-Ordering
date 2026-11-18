import {enrollmentFromUrl,SCPDA_VERSION_CODE} from './scpda-daily-contract.mjs';
import {validScpdaCredential} from './scpda-credential.mjs';
// Browser transport for the existing SCPDA device/PIN/count contracts.
// No shared keys, credentials, fallback fixtures, proxy or arbitrary URLs.
export const API_ORIGIN='https://paasrtsm-project.onrender.com';
const READ='scpda-read-001-v1',COUNT='scpda-counts-001-v1';
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});

export function ecdsaDer(raw){
 const bytes=new Uint8Array(raw);if(bytes.length!==64)throw error(0,'DEVICE_PROOF_INVALID','รูปแบบลายเซ็นเครื่องไม่ถูกต้อง');
 const integer=part=>{let p=part;while(p.length>1&&p[0]===0)p=p.slice(1);if(p[0]&128)p=Uint8Array.from([0,...p]);return [2,p.length,...p];};
 const r=integer(bytes.slice(0,32)),s=integer(bytes.slice(32));return Uint8Array.from([48,r.length+s.length,...r,...s]);
}

export class BrowserDevice {
 constructor({name='scpda-web-device-001-v1'}={}){
  this.db=new Promise((ok,no)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('device');q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();ok(q.result);};q.onerror=()=>no(error(0,'DEVICE_STORAGE','จัดเก็บข้อมูลเครื่องไม่ได้'));q.onblocked=()=>no(error(0,'DEVICE_STORAGE','ปิดหน้า SCPDA อื่นแล้วเปิดใหม่'));});
  this.ready=this.load();this.ready.catch(()=>{});
 }
 async transaction(mode,fn){const db=await this.db;return new Promise((ok,no)=>{const t=db.transaction('device',mode);let value;fn(t.objectStore('device'),x=>value=x);t.oncomplete=()=>ok(value);t.onerror=t.onabort=()=>no(error(0,'DEVICE_STORAGE','จัดเก็บข้อมูลเครื่องไม่ได้'));});}
 async load(){let state=await this.transaction('readonly',(s,set)=>{const q=s.get('identity');q.onsuccess=()=>set(q.result);});
  if(!state){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);const fresh={deviceId:crypto.randomUUID(),privateKey:keys.privateKey,publicKey:b64(await crypto.subtle.exportKey('spki',keys.publicKey)),certificate:''};
   // Serialize the final read/create in one transaction across tabs.
   state=await this.transaction('readwrite',(s,set)=>{const q=s.get('identity');q.onsuccess=()=>{if(q.result)set(q.result);else{s.add(fresh,'identity');set(fresh);}};});
  }
  if(!state.privateKey||state.privateKey.extractable||typeof state.publicKey!=='string'||typeof state.deviceId!=='string')throw error(0,'DEVICE_STORAGE','ข้อมูลเครื่องไม่สมบูรณ์ ติดต่อผู้ดูแล');this.state=state;return state;
 }
 async status(){const s=await this.ready;let paired=false,expiresAt=null;try{const part=s.certificate.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),p=JSON.parse(atob(part));paired=p.public_key===s.publicKey&&p.device_id===s.deviceId&&['001','004','005'].includes(p.branch_code)&&p.exp>Date.now()/1000;expiresAt=new Date(p.exp*1000).toISOString();if(paired)this.branch=p.branch_code;}catch{}return {contract:'scpda-read-'+(this.branch||'001')+'-v1',branchCode:this.branch||'001',paired,expiresAt,dailyResumeAvailable:!!s.dailySessionId};}
 async dailySession(value){const s=await this.ready;if(value===undefined)return s.dailySessionId||'';await this.transaction('readwrite',store=>store.put({...s,dailySessionId:value},'identity'));s.dailySessionId=value;}
 async certificate(value){const s=await this.ready;if(value===undefined)return s.certificate;const next={...s,certificate:value};await this.transaction('readwrite',store=>store.put(next,'identity'));Object.assign(s,next);}
 async sign(message){const s=await this.ready;return b64(ecdsaDer(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},s.privateKey,new TextEncoder().encode(message))));}
}

export class BrowserSession {
 #reader=null;#counter=null;#serial=Promise.resolve();
 constructor({device=new BrowserDevice(),origin=API_ORIGIN,fetcher=globalThis.fetch.bind(globalThis),fixtureOnly=false,companion=false,versionCode=SCPDA_VERSION_CODE}={}){
  if(origin!==API_ORIGIN&&!(fixtureOnly&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)))throw Error('Fixed SCPDA API origin required');Object.assign(this,{device,origin,fetcher,companion,versionCode});this.branch=companion?'005':'001';this.grant=null;
 }
 async call(path,{method='GET',body,token,contract=null}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);let response;
  try{response=await this.fetcher(this.origin+path,{method,cache:'no-store',redirect:'error',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch{throw error(0,'NETWORK_UNAVAILABLE','ยังเชื่อมต่อ StockDay ไม่ได้ กรุณาลองใหม่');}finally{clearTimeout(timer);}
  const raw=await response.text();if(raw.length>4*1024*1024)throw error(502,'REPLY_INVALID','ข้อมูลตอบกลับมากเกินไป');let data;try{data=JSON.parse(raw);}catch{throw error(response.status>=400?response.status:502,'REPLY_INVALID','ระบบตอบกลับไม่ถูกต้อง');}
  if(!response.ok)throw error(response.status,data.code||'REQUEST_REJECTED',data.error||'ระบบยังไม่พร้อม');
  if(data.contract!==(contract||'scpda-read-'+this.branch+'-v1')||data.branchCode!==this.branch)throw error(502,'CONTRACT_INVALID','ข้อมูลระบบตอบกลับไม่ตรงกัน');return data;
 }
 execute(op,args={}){const task=this.#serial.then(()=>this.perform(op,args));this.#serial=task.catch(()=>{});return task;}
 async activate(invitation){
  if(invitation?.contract!=='scpda-device-invitation-v1'||!['001','004','005'].includes(invitation.branchCode)||invitation.apiOrigin!==API_ORIGIN||typeof invitation.invitationId!=='string'||typeof invitation.activationCode!=='string')throw error(400,'INVITATION_INVALID','ไฟล์เชื่อมเครื่องไม่ถูกต้อง');
  this.branch=invitation.branchCode;const d=await this.device.ready,r=await this.call('/api/scpda/device/pair',{method:'POST',body:{invitationId:invitation.invitationId,code:invitation.activationCode,deviceId:d.deviceId,publicKey:d.publicKey}});
  if(typeof r.deviceCertificate!=='string')throw error(502,'DEVICE_CERT_INVALID','ระบบไม่ส่งใบยืนยันเครื่อง');await this.device.certificate(r.deviceCertificate);const status=await this.device.status();if(!status.paired)throw error(502,'DEVICE_CERT_INVALID','ใบยืนยันเครื่องไม่ตรงกัน');return status;
 }
 async login({username,password,selfie}){
  this.#reader=this.#counter=null;if(!/^(?:0[123]001|01004|01005|02005)$/.test(username||'')||!validScpdaCredential(password))throw error(400,'LOGIN_INVALID','เลือกผู้ใช้งานและกรอกรหัสผ่าน');const state=await this.device.status();this.branch=this.companion?'005':state.branchCode||'001';if(!this.companion&&!state.paired)throw error(409,'DEVICE_ACTIVATION_REQUIRED','เชื่อมเครื่องก่อนเริ่มใช้งาน');
  if(username==='02005')return this.enroll(password,selfie);
  try{const cert=await this.device.certificate(),c=await this.call('/api/scpda/auth/challenge',{method:'POST',body:{deviceCertificate:cert}}),signature=await this.device.sign(['SCPDA-LOGIN-V1',c.challengeId,c.nonce,username,c.deviceRef].join('\n'));
   const r=await this.call('/api/scpda/auth/login',{method:'POST',body:{operatorCode:username,pin:password,deviceCertificate:cert,challengeId:c.challengeId,signature}});
   if(typeof r.token!=='string'||r.user?.operatorCode!==username||r.user?.branchCode!==this.branch||r.user?.role!=='reader')throw error(502,'IDENTITY_INVALID','ข้อมูลบัญชีไม่ตรงกัน');this.#reader=r.token;
   return await this.finish(username);
  }catch(e){this.#reader=this.#counter=null;throw e;}
 }
 async finish(username){
  const cert=await this.device.certificate();
  const me=await this.call('/api/scpda/session',{token:this.#reader});if(me.officialStockWrites!==false||me.countSubmissionAvailable!==false||me.user?.operatorCode!==username||me.user?.role!=='reader')throw error(502,'IDENTITY_INVALID','ขอบเขตบัญชีไม่ตรงกัน');
   try{const a=await this.call('/api/scpda/counts/admission',{token:this.#reader,contract:'scpda-counts-'+this.branch+'-v1'});if(a.canRequestCountAccess){const c=await this.call('/api/scpda/counts/access/challenge',{method:'POST',body:{deviceCertificate:cert},token:this.#reader,contract:'scpda-counts-'+this.branch+'-v1'});if(c.operatorCode!==username)throw error(502,'IDENTITY_INVALID','บัญชีสิทธิ์นับไม่ตรงกัน');const signature=await this.device.sign(['SCPDA-COUNT-ACCESS-V1',c.challengeId,c.nonce,username,c.deviceRef,c.parentSessionId].join('\n'));
     const grant=await this.call('/api/scpda/counts/access/authorize',{method:'POST',body:{deviceCertificate:cert,challengeId:c.challengeId,signature},token:this.#reader,contract:'scpda-counts-'+this.branch+'-v1'});if(grant.operatorCode!==username||typeof grant.countToken!=='string')throw error(502,'IDENTITY_INVALID','ข้อมูลสิทธิ์นับไม่ครบ');this.#counter=grant.countToken;if(!(await this.countCall('/capabilities')).canSubmit)this.#counter=null;}
   }catch{this.#counter=null;}
   return {...me,countUploadAvailable:!!this.#counter};

 }
 async enroll(password,image){
  if(!this.grant)throw error(409,'QR_REQUIRED','สแกน QR จากเครื่องหลักก่อน');
  const d=await this.device.ready,bytes=Uint8Array.from(atob((image||'').split(',')[1]||''),c=>c.charCodeAt(0)),imageHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const body={...this.grant,deviceId:d.deviceId,publicKey:d.publicKey,pin:password,selfie:image,versionCode:this.versionCode};body.signature=await this.device.sign(['SCPDA-COMPANION-ENROLL-V1',body.grantId,body.secret,d.deviceId,imageHash,this.versionCode].join('\n'));
  const r=await this.call('/api/scpda/daily/companion/enroll',{method:'POST',body});if(r.user?.operatorCode!=='02005'||typeof r.token!=='string'||!r.dailySessionId||!r.deviceCertificate)throw error(502,'IDENTITY_INVALID','ข้อมูลเครื่องย่อยไม่ครบ');
  await this.device.certificate(r.deviceCertificate);await this.device.dailySession(r.dailySessionId);this.#reader=r.token;this.grant=null;return this.finish('02005');
 }
 async resume(){
  const sessionId=await this.device.dailySession();if(!sessionId)throw error(401,'DAILY_LOGIN_REQUIRED','เข้าสู่ระบบสำหรับวันนี้');this.branch='005';
  const c=await this.call('/api/scpda/daily/resume/challenge',{method:'POST',body:{sessionId}}),signature=await this.device.sign(['SCPDA-DAILY-RESUME-V1',c.challengeId,c.nonce,sessionId].join('\n'));
  const r=await this.call('/api/scpda/daily/resume',{method:'POST',body:{sessionId,challengeId:c.challengeId,signature}});if(r.user?.operatorCode!=='02005'||r.dailySessionId!==sessionId||typeof r.token!=='string')throw error(502,'IDENTITY_INVALID','ข้อมูลเครื่องย่อยไม่ตรงกัน');this.#reader=r.token;if(r.deviceCertificate)await this.device.certificate(r.deviceCertificate);return this.finish('02005');
 }
 async countCall(path,body){if(!this.#counter)throw error(401,'COUNT_ACCESS_REQUIRED','ยังไม่เชื่อมระบบรับผลนับ');try{return await this.call('/api/scpda/counts'+path,{...(body===undefined?{}:{method:'POST',body}),token:this.#counter,contract:'scpda-counts-'+this.branch+'-v1'});}catch(e){if(e.status===401)this.#counter=null;throw e;}}
 async perform(op,args){
  if(op==='status'){const state=await this.device.status();if(state.paired&&!this.companion)this.branch=state.branchCode;return this.companion?{...state,paired:!!this.grant||state.paired,branchCode:'005',operatorCode:'02005'}:state;}if(op==='dailyPolicy')return this.branch==='005'?this.call('/api/scpda/daily/policy'):{enabled:false};if(op==='resume')return this.resume();if(op==='activateDevice')return this.activate(args);if(op==='login')return this.login(args);
  if(op==='logout'){try{if(this.#reader)await this.call('/api/scpda/auth/logout',{method:'POST',body:{},token:this.#reader});}finally{this.#reader=this.#counter=null;await this.device.dailySession?.('');}return {ok:true};}
  if(!this.#reader)throw error(401,'LOGIN_REQUIRED','เข้าสู่ระบบก่อน');
  const input=(key,max)=>{const v=args?.[key];if(typeof v!=='string'||!v.trim()||v.length>max)throw error(400,'INPUT_INVALID','ข้อมูลไม่ถูกต้อง');return v.trim();};
  if(op==='dailySelfie')return this.call('/api/scpda/daily/selfie',{token:this.#reader});
  if(op==='products')return this.call('/api/scpda/products?keyword='+encodeURIComponent(input('keyword',160))+'&limit=200&offset=0',{token:this.#reader});
  if(op==='stock')return this.call('/api/scpda/stock?search='+encodeURIComponent(input('search',160))+'&limit=200&offset=0',{token:this.#reader});
  if(op==='product'){const id=input('skuId',15);if(!/^[1-9]\d*$/.test(id))throw error(400,'INPUT_INVALID','ตรวจรหัส SKU');return this.call('/api/scpda/products/'+id,{token:this.#reader});}
  if(op==='countCapabilities')return this.countCall('/capabilities');if(op==='countCheck')return this.countCall('/check',args);if(op==='countSubmit')return this.countCall('',args);if(op==='countHistory')return this.countCall('/history');
  if(op==='countReceipt'){const id=input('id',36);if(!/^[a-f0-9-]{36}$/i.test(id))throw error(400,'INPUT_INVALID','ตรวจรหัสผลนับ');return this.countCall('/events/'+id);}
  throw error(400,'OPERATION_REJECTED','คำสั่งนี้ไม่รองรับ');
 }
}

function pickInvitation(){
 return new Promise((ok,no)=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.append(input);const clean=()=>input.remove();input.oncancel=()=>{clean();no(error(0,'PICK_CANCELLED','ยกเลิกการเลือกไฟล์'));};input.onchange=async()=>{try{const f=input.files?.[0];if(!f||f.size>32768)throw error(400,'INVITATION_INVALID','เลือกไฟล์เชื่อมเครื่อง JSON ที่ถูกต้อง');ok(JSON.parse(await f.text()));}catch{no(error(400,'INVITATION_INVALID','อ่านไฟล์เชื่อมเครื่องไม่ได้'));}finally{clean();}};input.click();});
}
export function installBrowserHost(options={}){
 const session=new BrowserSession(options);if(options.companion){window.SCPDA_WEB_COMPANION=true;if(location.hash.startsWith('#enroll=')){try{if(navigator.standalone||matchMedia('(display-mode: standalone)').matches)session.grant=enrollmentFromUrl(location.href);}catch{}history.replaceState(null,'',location.pathname);}}window.SCPDAHost={invoke(id,op,raw){let args;try{if(typeof raw!=='string'||raw.length>(op==='login'?300000:['countSubmit','countCheck'].includes(op)?65536:4096))throw Error();args=JSON.parse(raw);}catch{window.__scpdaReceive(id,{ok:false,status:400,code:'INPUT_INVALID',error:'ข้อมูลไม่ถูกต้อง'});return;}
  const task=op==='activateDevice'?(options.companion?((navigator.standalone||matchMedia('(display-mode: standalone)').matches)?window.__scpdaScanStoreQr().then(grant=>{session.grant=grant;return session.execute('status');}):Promise.reject(error(409,'INSTALL_FIRST','เพิ่ม SCPDA ลงหน้าจอโฮม แล้วเปิดจากไอคอนก่อนสแกน QR'))):pickInvitation().then(x=>session.execute(op,x))):op==='openWebsite'?Promise.resolve(window.open('https://sc-stockday-ordering.onrender.com/#/branch-stock','_blank','noopener')).then(()=>({ok:true})):session.execute(op,args);
  task.then(data=>window.__scpdaReceive(id,{ok:true,data}),e=>window.__scpdaReceive(id,{ok:false,status:e.status||0,code:e.code||'CLIENT_UNAVAILABLE',error:e.message||'เชื่อมต่อไม่ได้'}));
 }};
}
