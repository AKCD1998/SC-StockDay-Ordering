// Explicit browser-only preview. Public demo profiles; never a backend fallback.
// Separate storage and reference IDs prevent preview work entering a live queue.
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const fail=(status,code,message)=>{const error=new Error(message);Object.assign(error,{status,code});throw error;};
const keyOf=request=>JSON.stringify([request.productCode,request.unitSize,request.scopeId]);
const quantity=value=>{if(typeof value!=='string'||!/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(value))fail(400,'QUANTITY_INVALID','ตรวจจำนวนสินค้าอีกครั้ง');const [n,f='']=value.split('.');return BigInt(n)*1000n+BigInt(f.padEnd(3,'0'));};
const date=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const profiles=[{staffId:'1',operatorCode:'01001',role:'sales',code:'1111'},{staffId:'2',operatorCode:'02001',role:'sales',code:'2222'},{staffId:'3',operatorCode:'03001',role:'manager',code:'3333'}];
export const PREVIEW_CATALOG=Object.freeze([
 {productCode:'DEMO-001',barcode:'8850000000028',name:'พาราเซตามอล 500 มก.',category:'pharma',units:[{size:'S',name:'เม็ด',factor:null},{size:'M',name:'กล่อง',factor:null}],reference:6},
 {productCode:'DEMO-002',barcode:'0001234567890',name:'หน้ากากอนามัย',category:'common',units:[{size:'S',name:'ชิ้น',factor:null},{size:'M',name:'กล่อง',factor:null}],reference:12},
 {productCode:'DEMO-003',barcode:'8850000000035',name:'สำลีแผ่น',category:'normal',units:[{size:'S',name:'ห่อ',factor:null}],reference:null},
]);
const categories=[['pharma','เภสัช'],['common','สามัญ'],['normal','ปกติ']];
export const PREVIEW_SCOPES=categories.flatMap(([key,label],index)=>[1,2,3].map(round=>({id:'10000000-0000-4000-8000-'+String(100+index*10+round).padStart(12,'0'),kind:'stocktake',sessionKey:'fixture-001-'+key,locationKey:'whole-branch',label,round,coverage:'whole-branch'})));
export function pdaRuntime({localFixture=false,apiOrigin=null}={}){return localFixture?'fixture':apiOrigin?'configured-backend':'browser-preview';}

class PreviewStore{
 constructor(){
  this.memory=new Map(['events','heads','queue','metadata'].map(name=>[name,new Map()]));this.persistent=false;
  this.ready=new Promise((resolve,reject)=>{try{const r=indexedDB.open('sc-stockday-browser-preview-v1',1);r.onupgradeneeded=()=>{for(const name of this.memory.keys())r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}catch(e){reject(e);}}).then(db=>{this.persistent=true;return db;}).catch(()=>null);
 }
 async all(name){const db=await this.ready;if(!db)return [...this.memory.get(name).values()].map(clone);return new Promise((ok,no)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
 async get(name,key){const db=await this.ready;if(!db)return clone(this.memory.get(name).get(key));return new Promise((ok,no)=>{const r=db.transaction(name).objectStore(name).get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
 async put(name,key,value,add=false){const db=await this.ready;if(!db){const store=this.memory.get(name);if(add&&store.has(key))fail(409,'PREVIEW_DUPLICATE','รายการเดิมถูกเก็บแล้ว');if(value===null)store.delete(key);else store.set(key,clone(value));return;}return new Promise((ok,no)=>{const tx=db.transaction(name,'readwrite'),store=tx.objectStore(name);if(value===null)store.delete(key);else store[add?'add':'put'](clone(value),key);tx.oncomplete=()=>ok();tx.onerror=tx.onabort=()=>no(tx.error||new Error('เก็บข้อมูลทดลองไม่สำเร็จ'));});}
 async accept(fn){
  const db=await this.ready;
  if(!db){const events=[...this.memory.get('events').values()].map(clone),heads=[...this.memory.get('heads').values()].map(clone),result=fn(events,heads);if(result.event){this.memory.get('events').set(result.event.id,clone(result.event));this.memory.get('heads').set(result.head.key,clone(result.head));}return clone(result.response);}
  return new Promise((ok,no)=>{const tx=db.transaction(['events','heads'],'readwrite'),events=tx.objectStore('events'),heads=tx.objectStore('heads');let allEvents,allHeads,result,failure;
   const apply=()=>{if(!allEvents||!allHeads)return;try{result=fn(allEvents,allHeads);if(result.event){events.add(result.event,result.event.id);heads.put(result.head,result.head.key);}}catch(error){failure=error;tx.abort();}};
   const a=events.getAll(),b=heads.getAll();a.onsuccess=()=>{allEvents=a.result;apply();};b.onsuccess=()=>{allHeads=b.result;apply();};tx.oncomplete=()=>ok(clone(result.response));tx.onerror=tx.onabort=()=>no(failure||tx.error||new Error('เก็บข้อมูลทดลองไม่สำเร็จ'));
  });
 }
}
class PreviewOutbox{
 constructor(store,origin){this.store=store;this.origin=origin;}
 all(){return this.store.all('queue');}
 async forIdentity(who){return(await this.all()).filter(r=>r.staffId===who.staffId&&r.deviceId===who.deviceId&&r.branchCode==='001');}
 enqueue(who,request){return this.store.put('queue',request.id,{id:request.id,targetOrigin:this.origin,staffId:who.staffId,deviceId:who.deviceId,branchCode:'001',original:JSON.stringify(request),status:'pending'},true);}
 async mark(id,status,detail){const row=await this.store.get('queue',id);if(row)await this.store.put('queue',id,{...row,status,detail});}
 readData(key){return this.store.get('metadata',key);}
 saveData(key,value){return this.store.put('metadata',key,value);}
}
export class BrowserPreviewClient{
 #identity=null;#connected=false;
 constructor(){this.origin='browser-preview:sc-stockday-pda-v1';this.store=new PreviewStore();this.outbox=new PreviewOutbox(this.store,this.origin);}
 get identity(){return clone(this.#identity);}
 get persistent(){return this.store.persistent;}
 async roster(code){const profile=profiles.find(p=>p.code===code?.trim());if(!profile)fail(401,'PREVIEW_CODE','รหัสทดลองไม่ถูกต้อง ใช้ 1111, 2222 หรือ 3333');return {branchCode:'001',staff:[{staffId:profile.staffId,displayName:profile.operatorCode,role:profile.role}]};}
 async enroll({code,staffId,deviceId}){
  this.disconnect();await this.roster(code);const profile=profiles.find(p=>p.code===code.trim());if(profile.staffId!==staffId||typeof deviceId!=='string'||!deviceId)fail(403,'PREVIEW_IDENTITY','รหัสไม่ตรงกับบัญชีที่เลือก');
  let period=await this.store.get('metadata','code-period');if(!period){const due=new Date();due.setUTCMonth(due.getUTCMonth()+6);period={rotationDueAt:due.toISOString()};await this.store.put('metadata','code-period',period);}
  this.#identity={branchCode:'001',staffId,staffName:profile.operatorCode,operatorCode:profile.operatorCode,role:profile.role,deviceId,expiresAt:new Date(Date.now()+12*3600000).toISOString(),rotationDueAt:period.rotationDueAt,previewOnly:true};return this.identity;
 }
 async connect(){if(!this.#identity)fail(401,'PREVIEW_LOGIN','เข้าสู่ระบบทดลองก่อน');this.#connected=true;return {previewOnly:true,officialStockWrites:false};}
 restorePreviewIdentity(who){if(who?.previewOnly&&profiles.some(p=>p.staffId===who.staffId&&p.operatorCode===who.operatorCode)&&Date.parse(who.expiresAt)>Date.now()){this.#identity=clone(who);this.#connected=true;}}
 requireConnection(){if(!this.#connected||!this.#identity||Date.parse(this.#identity.expiresAt)<=Date.now())fail(401,'PREVIEW_LOGIN','เข้าสู่ระบบทดลองอีกครั้ง');}
 async scopes(){this.requireConnection();return clone(PREVIEW_SCOPES);}
 async lookup(barcode,scopeId){
  this.requireConnection();const item=PREVIEW_CATALOG.find(p=>p.barcode===barcode?.trim()),scope=PREVIEW_SCOPES.find(s=>s.id===scopeId);if(!item)fail(404,'PREVIEW_PRODUCT','สินค้านี้ไม่มีในเดโม ใช้ปุ่มสินค้าตัวอย่างเพื่อลองนับ');if(!scope)fail(403,'PREVIEW_SCOPE','เลือกหมวดและรอบนับก่อน');
  const heads=await this.store.all('heads'),revisions={};for(const unit of item.units)revisions[unit.size]=heads.find(h=>h.key===keyOf({productCode:item.productCode,unitSize:unit.size,scopeId}))?.revision||0;
  return {barcode:item.barcode,productCode:item.productCode,name:item.name,units:clone(item.units),catalogVersion:'browser-preview-catalog-v1',scope:clone(scope),revisions,
   stock:{source:'full-sync',quantity:item.reference,observedAt:null,fetchedAt:new Date().toISOString(),synthetic:true},comparisonAllowed:false,humanOverrideEnabled:false,previewOnly:true};
 }
 async submit(request){
  this.requireConnection();const who=this.identity,item=PREVIEW_CATALOG.find(p=>p.productCode===request.productCode&&p.barcode===request.barcode),scope=PREVIEW_SCOPES.find(s=>s.id===request.scopeId),unit=item?.units.find(u=>u.size===request.unitSize);
  if(!item||!scope||!unit||request.catalogVersion!=='browser-preview-catalog-v1'||!Number.isInteger(request.baseRevision))fail(400,'PREVIEW_REQUEST','ตรวจสินค้า หน่วย และรอบนับอีกครั้ง');
  if(!Array.isArray(request.lots)||request.lots.length>100||request.lots.reduce((n,l)=>n+quantity(l.quantity),0n)!==quantity(request.quantity))fail(400,'PREVIEW_LOTS','จำนวนแต่ละล็อตต้องรวมตรงกับผลนับ');
  for(const lot of request.lots)if(!(lot.code===null||typeof lot.code==='string'&&lot.code.trim())||!date(lot.manufacturedOn)||!date(lot.expiresOn)||lot.manufacturedOn&&lot.expiresOn&&lot.manufacturedOn>lot.expiresOn)fail(400,'PREVIEW_DATE','ตรวจเลขล็อตและวันที่ หรือเลือกไม่ทราบ');
  const original=canonical(request),headKey=keyOf(request),now=new Date().toISOString();
  return this.store.accept((events,heads)=>{
   const old=events.find(e=>e.id===request.id);if(old){if(old.original!==original||old.staffId!==who.staffId||old.deviceId!==who.deviceId)fail(409,'PREVIEW_REPLAY','รายการเดิมเปลี่ยนไม่ได้');return {response:{...old.receipt,replayed:true}};}
   const head=heads.find(h=>h.key===headKey);if((head?.revision||0)!==request.baseRevision)fail(409,'PREVIEW_CONFLICT','ผลนับเปลี่ยนแล้ว เก็บรายการเดิมไว้และตรวจใหม่');
   if(heads.some(h=>h.productCode===item.productCode&&h.unitSize===unit.size&&h.sessionKey===scope.sessionKey&&h.locationKey===scope.locationKey&&h.round!==scope.round&&h.staffId===who.staffId))fail(409,'PREVIEW_INDEPENDENT_ROUND','รอบนับอิสระต้องใช้ผู้ตรวจคนละบัญชี');
   if(request.correctionOf){const previous=events.find(e=>e.id===request.correctionOf);if(!previous||head?.id!==previous.id||previous.receipt.event.unitSize!==unit.size||previous.receipt.event.scopeId!==scope.id||previous.receipt.event.observedAt!==request.observedAt)fail(409,'PREVIEW_CORRECTION','ต้นฉบับหรือเวลานับไม่ตรงกัน');if(previous.staffId!==who.staffId&&who.role!=='manager')fail(403,'PREVIEW_CORRECTION_ROLE','บัญชีนี้แก้ผลนับของผู้อื่นไม่ได้');if(!request.reason?.trim()||request.reason.trim().length<3)fail(400,'PREVIEW_REASON','ระบุเหตุผลที่แก้ไข');}
   const event={...clone(request),branchCode:'001',staffId:who.staffId,staffName:who.operatorCode,deviceId:who.deviceId,unit:unit.name,scope:clone(scope),lots:request.lots.map(l=>({...clone(l),unit:unit.name,unitSize:unit.size})),referenceAtSubmit:{source:'full-sync',quantity:item.reference,observedAt:null,synthetic:true},sourceSelection:{changed:false,humanSelected:false},previewOnly:true};
   const receipt={eventId:request.id,receiptId:'demo-'+crypto.randomUUID(),recordedAt:now,receivedAt:now,event,previewOnly:true,storage:this.store.persistent?'browser-only':'page-memory',officialStockWrites:false,humanOverrideEnabled:false,...(request.correctionOf?{correctedAt:now}:{})};
   return {response:receipt,event:{id:request.id,staffId:who.staffId,deviceId:who.deviceId,original,receipt},head:{key:headKey,id:request.id,revision:request.baseRevision+1,productCode:item.productCode,unitSize:unit.size,scopeId:scope.id,sessionKey:scope.sessionKey,locationKey:scope.locationKey,round:scope.round,staffId:who.staffId}};
  });
 }
 async history(){this.requireConnection();return(await this.store.all('events')).map(e=>e.receipt).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));}
 async request(path){this.requireConnection();if(path==='/api/mobile/counts/audit/cases')return {contract:'sc-pda-audit-001-v1',branchCode:'001',cases:[],previewOnly:true};fail(501,'PREVIEW_ONLY','ฟังก์ชันนี้ต้องใช้ระบบที่เชื่อม backend');}
 disconnect(){this.#identity=null;this.#connected=false;}
}
