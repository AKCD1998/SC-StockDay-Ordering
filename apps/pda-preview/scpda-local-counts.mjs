import {parseCountMilli} from './quantity-policy.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
export const localId=()=>globalThis.crypto.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=crypto.getRandomValues(new Uint8Array(1))[0]&15;return(c==='x'?n:(n&3)|8).toString(16);});
export const draftKey=(who,p)=>JSON.stringify([who.branchCode,who.operatorCode,p.skuId,p.productCode,p.barcode]);
function date(value,unknown,label){
 if(unknown)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('ระบุ'+label+' หรือเลือกไม่ทราบ');
 return value;
}
export function prepareLocalCount({who,product,draft,now=new Date().toISOString()}){
 if(!who||who.branchCode!=='001'||!['01001','02001','03001'].includes(who.operatorCode))throw Error('เข้าสู่ระบบก่อนบันทึก');
 if(!product?.productCode||typeof product.barcode!=='string')throw Error('ตรวจสินค้าก่อนนับ');
 if(!['pharma','common','normal'].includes(draft.category)||![1,2,3].includes(Number(draft.round)))throw Error('เลือกหมวดและรอบนับ');
 const unit=String(draft.unit||'').trim();if(!unit||unit.length>80)throw Error('ระบุหน่วยที่นับ');
 if(!Array.isArray(draft.lots)||!draft.lots.length||draft.lots.length>100)throw Error('เพิ่มล็อตที่นับ');
 const seen=new Set();let quantity=0;
 const lots=draft.lots.map((l,i)=>{
  const code=l.codeUnknown?null:String(l.code||'').trim();if(!l.codeUnknown&&(!code||code.length>120))throw Error('ล็อต '+(i+1)+': ระบุเลขล็อต หรือเลือกไม่ทราบ');
  const mfg=date(l.manufacturedOn,l.mfgUnknown,'วันผลิต'),exp=date(l.expiresOn,l.expUnknown,'วันหมดอายุ');
  if(mfg&&mfg>new Date(Date.parse(now)+7*3600000).toISOString().slice(0,10))throw Error('วันผลิตอยู่ในอนาคต');
  if(mfg&&exp&&exp<mfg)throw Error('วันหมดอายุต้องไม่ก่อนวันผลิต');
  const n=parseCountMilli(String(l.quantity))/1000;quantity+=n;
  const identity=JSON.stringify([code,mfg,exp]);if(seen.has(identity))throw Error('ล็อตซ้ำ กรุณารวมจำนวน');seen.add(identity);
  return {code,manufacturedOn:mfg,expiresOn:exp,quantity:n,unit};
 });
 if(draft.supersedesId&&String(draft.reason||'').trim().length<3)throw Error('ระบุเหตุผลที่แก้ไข');
 return {schema:'scpda-local-count-v1',id:draft.id,branchCode:'001',operatorCode:who.operatorCode,productCode:product.productCode,skuId:product.skuId,barcode:product.barcode,productName:product.name,productSnapshot:clone(product),category:draft.category,round:Number(draft.round),unit,quantity,lots,completeProduct:!!draft.completeProduct,countedAt:draft.originalCountedAt||now,recordedOnDeviceAt:now,...(draft.supersedesId?{supersedesId:draft.supersedesId,correctionReason:String(draft.reason).trim()}:{}),referenceAtCount:clone(product.stock),stockComparisonAllowed:false,conversionFactor:null,sourceSelectionChanged:false,syncState:'local-only',serverReceipt:null,officialStockWrites:false};
}
export class LocalCountBook{
 constructor({demo=false}={}){this.ready=new Promise((ok,no)=>{try{const r=indexedDB.open(demo?'scpda-ui-review-counts-v1':'scpda-local-counts-001-v1',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('records',{keyPath:'id'});s.createIndex('correctionOf','supersedesId',{unique:true});r.result.createObjectStore('drafts',{keyPath:'key'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(Error('พื้นที่เก็บข้อมูลไม่พร้อม'));}catch{no(Error('พื้นที่เก็บข้อมูลไม่พร้อม'));}});this.ready.catch(()=>{});}
 async run(stores,mode,fn){const db=await this.ready;return new Promise((ok,no)=>{const tx=db.transaction(stores,mode);let result,error;try{fn(tx,v=>result=v,e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}tx.oncomplete=()=>ok(result);tx.onabort=tx.onerror=()=>no(error||Error(tx.error?.name==='ConstraintError'?'รายการนี้มีฉบับแก้ไขแล้ว':'บันทึกในเครื่องไม่สำเร็จ'));});}
 draft(key){return this.run(['drafts'],'readonly',(tx,set)=>{const r=tx.objectStore('drafts').get(key);r.onsuccess=()=>set(r.result?.draft||null);});}
 saveDraft(key,who,product,draft){return this.run(['drafts'],'readwrite',tx=>tx.objectStore('drafts').put({key,branchCode:who.branchCode,operatorCode:who.operatorCode,product:clone(product),draft:clone(draft)}));}
 list(who){return this.run(['records','drafts'],'readonly',(tx,set)=>{const all={records:[],drafts:[]};for(const name of ['records','drafts']){const r=tx.objectStore(name).getAll();r.onsuccess=()=>{all[name]=r.result.filter(x=>x.branchCode===who.branchCode&&x.operatorCode===who.operatorCode);set(all);};}});}
 append(record,key){return this.run(['records','drafts'],'readwrite',(tx,set,fail)=>{const store=tx.objectStore('records'),r=store.get(record.id);r.onsuccess=()=>{if(r.result){if(JSON.stringify(r.result)!==JSON.stringify(record))return fail(Error('รายการเดิมเปลี่ยนไม่ได้'));set(r.result);return;}const add=()=>{store.add(clone(record));const d=tx.objectStore('drafts').get(key);d.onsuccess=()=>{if(d.result?.draft.id===record.id)tx.objectStore('drafts').delete(key);};set(clone(record));};if(record.supersedesId){const prior=store.get(record.supersedesId);prior.onsuccess=()=>{const p=prior.result;if(!p||['operatorCode','branchCode','productCode','skuId','barcode','unit','category','round','countedAt'].some(k=>p[k]!==record[k]))return fail(Error('ฉบับแก้ไขต้องตรงกับต้นฉบับ'));add();};}else add();};});}
}
