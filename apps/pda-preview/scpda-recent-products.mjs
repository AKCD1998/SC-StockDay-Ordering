// Device-local navigation shortcuts only. Never store stock, prices or counts.
export const RECENT_LIMIT=10;
export function recentProduct(product){
 const productCode=product?.productCode,skuId=product?.skuId==null?null:String(product.skuId);
 const lookupCode=product?.lookupCode??product?.barcode??productCode;
 if(typeof productCode!=='string'||!productCode.trim()||productCode.length>200||skuId!==null&&!/^\d{1,15}$/.test(skuId)||typeof lookupCode!=='string'||!lookupCode.trim()||lookupCode.length>200)throw Error('รหัสรายการล่าสุดไม่ครบ');
 return {productCode,skuId,lookupCode,name:typeof product.name==='string'?product.name.slice(0,500):productCode};
}
export function recentProducts(rows){
 const result=[];
 for(const raw of Array.isArray(rows)?rows:[]){try{const row=recentProduct(raw);if(!result.some(x=>x.productCode===row.productCode))result.push(row);}catch{/* Ignore damaged local shortcuts. */}if(result.length===RECENT_LIMIT)break;}
 return result;
}
export function touchRecent(rows,product){const row=recentProduct(product);return [row,...recentProducts(rows).filter(x=>x.productCode!==row.productCode)].slice(0,RECENT_LIMIT);}
function scope(who){if(!who||({'01001':'001','02001':'001','03001':'001','01004':'004','01005':'005'})[who.operatorCode]!==who.branchCode)throw Error('เข้าสู่ระบบก่อนเปิดรายการล่าสุด');return JSON.stringify([who.branchCode,who.operatorCode]);}
export class RecentProductBook{
 constructor(){this.ready=new Promise((ok,no)=>{try{const r=indexedDB.open('scpda-recent-products-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('recent',{keyPath:'scope'});r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result);};r.onerror=r.onblocked=()=>no(Error('เก็บรายการล่าสุดไม่ได้'));}catch(e){no(e);}});this.ready.catch(()=>{});}
 async list(who){const key=scope(who),db=await this.ready;return new Promise((ok,no)=>{const t=db.transaction('recent'),r=t.objectStore('recent').get(key);r.onsuccess=()=>ok(recentProducts(r.result?.items));r.onerror=()=>no(Error('อ่านรายการล่าสุดไม่ได้'));});}
 async remember(who,product){const key=scope(who),item=recentProduct(product),db=await this.ready;return new Promise((ok,no)=>{const t=db.transaction('recent','readwrite'),store=t.objectStore('recent'),r=store.get(key);let next;r.onsuccess=()=>{next=touchRecent(r.result?.items,item);store.put({scope:key,items:next});};t.oncomplete=()=>ok(next);t.onabort=t.onerror=()=>no(Error('เก็บรายการล่าสุดไม่ได้'));});}
}
