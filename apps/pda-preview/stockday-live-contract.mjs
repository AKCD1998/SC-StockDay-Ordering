// Read-only StockDay web contract, live revision 3ab71e713173. This is a
// different, populated catalogue from the legacy /api/mobile scan catalogue.
const fail=(message,code='READ_CONTRACT')=>{throw Object.assign(new Error(message),{code});};
const exact=value=>{if(typeof value!=='string'||!value.trim()||value.length>160)fail('กรอกบาร์โค้ดหรือรหัส IC ให้ครบ');return value.trim();};
const numeric=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export function requireScpdaActor(data){const u=data?.user;if(!['001','004','005'].includes(data?.branchCode)||data.contract!=='scpda-read-'+data.branchCode+'-v1'||u?.role!=='reader'||u.branchCode!==data.branchCode||({'01001':'001','02001':'001','03001':'001','01004':'004','01004SHPEE':'004','01005':'005','02005':'005'})[u.operatorCode]!==u.branchCode||u.id!==u.operatorCode||!Number.isFinite(Date.parse(u.rotationDueAt)))fail('ข้อมูลบัญชี SCPDA ไม่ตรงกัน','SCPDA_IDENTITY');const expected={'01004':'004-front','01004SHPEE':'004-shopee'}[u.operatorCode];if(u.countScope&&(u.countScope.id!==expected||u.countScope.branchCode!=='004')||u.operatorCode==='01004SHPEE'&&!u.countScope)fail('พื้นที่นับไม่ตรงบัญชี','SCPDA_SCOPE');return {...(u.countScope?{countScope:{id:expected,label:expected==='004-front'?'หน้าร้าน · รวมคลังหน้าร้าน':'Shopee · หลังร้าน',branchCode:'004'},canRecordInternalPick:u.canRecordInternalPick===true}:{}),branchCode:u.branchCode,userId:u.id,operatorCode:u.operatorCode,role:'reader',rotationDueAt:u.rotationDueAt,rotationDue:u.rotationDue===true};}
export function requireScpda001(data){const actor=requireScpdaActor(data);if(actor.branchCode!=='001')fail('บัญชีไม่ตรงสาขา','SCPDA_IDENTITY');return actor;}
export function requireBranch001(data){const u=data?.user;if(data?.ok!==true||u?.role!=='branch'||(u.effective_branch_code||u.branch_code)!=='001')fail('ใช้บัญชี StockDay ของสาขา 001 สำหรับรุ่นทดสอบนี้','BRANCH_REQUIRED');return {branchCode:'001',userId:String(u.id),role:u.role};}
export function selectExactCandidates(query,details,stockRows){
 query=exact(query);const byCode=new Map();
 for(const p of details){if(!p||typeof p.company_code!=='string'||!p.company_code||!Number.isInteger(Number(p.sku_id)))fail('รหัสสินค้าจากระบบไม่ครบ');
  if(p.company_code===query||(p.barcodes||[]).some(b=>typeof b.barcode==='string'&&b.barcode===query)){
   if(byCode.has(p.company_code)&&byCode.get(p.company_code).skuId!==String(p.sku_id))fail('รหัส IC ผูกหลาย SKU กรุณาตรวจใน StockDay','AMBIGUOUS_IDENTITY');
   byCode.set(p.company_code,{code:p.company_code,name:p.display_name||p.company_code,skuId:String(p.sku_id),detail:p});
  }
 }
 for(const row of stockRows){if(typeof row.productCode!=='string')fail('รหัสสต๊อกจากระบบไม่ถูกต้อง');if(row.productCode!==query&&row.barcode!==query)continue;if(!byCode.has(row.productCode))byCode.set(row.productCode,{code:row.productCode,name:row.productNameThai||row.productCode,skuId:null,detail:null});}
 return [...byCode.values()];
}
export function normalizeStockDayProduct(candidate,query,stockRows,{fetchedAt=new Date().toISOString()}={}){
 query=exact(query);const matches=stockRows.filter(r=>r.productCode===candidate.code);if(matches.length>1)fail('พบสต๊อก IC ซ้ำ กรุณาตรวจใน StockDay','AMBIGUOUS_STOCK');const row=matches[0]||null;
 const branch=candidate.branchCode||row?.branchCode||'001';if(!['001','004','005'].includes(branch)||row?.branchCode&&row.branchCode!==branch)fail('สต๊อกตอบกลับคนละสาขา','STOCK_BRANCH_MISMATCH');const value=branch==='001'?row?.qtyBranch001:row?.quantity;if(row&&value!==null&&(typeof value!=='number'||!Number.isFinite(value)))fail('รูปแบบยอดสต๊อกไม่ถูกต้อง');
 const detail=candidate.detail,prices=(detail?.unit_prices||[]).map(p=>({unit:typeof p.unit==='string'&&p.unit?p.unit:null,amount:numeric(p.retail_price),currency:p.currency||'THB',sourceUpdatedAt:p.source_updated_at||null,updatedAt:p.updated_at||null}));
 if(!prices.length&&detail?.retail_price)prices.push({unit:null,amount:numeric(detail.retail_price.price),currency:detail.retail_price.currency||'THB',sourceUpdatedAt:null,updatedAt:detail.retail_price.updated_at||null});
 return {productCode:candidate.code,skuId:candidate.skuId,name:detail?.display_name||row?.productNameThai||candidate.name,barcode:query,websiteBarcode:row?.barcode||null,prices,
  stock:{quantity:row?value:null,source:'stockday-full-sync-web-view',observedAt:null,unitBasis:'unknown',displayUnit:row?.unit||null,websiteTableSyncedAt:row?.syncedAt||null,zeroMayRepresentMissing:value===0&&row?.stockNullsPreserved!==true,recordPresent:Boolean(row)},
  fetchedAt,branchCode:branch,identity:{scannedPack:'unknown',conversionRuleVersion:null},officialStockWrites:false,countSubmissionAvailable:false};
}
export class StockDayLookup {
 constructor(request){this.request=request;}
 async candidates(value){const query=exact(value);const [catalog,stock]=await Promise.all([this.request('products',{keyword:query}),this.request('stock',{search:query})]);
  if(!Array.isArray(catalog.rows)||!Number.isInteger(catalog.total)||!Array.isArray(stock.records))fail('ระบบตอบข้อมูลค้นหาไม่ครบ');
  if(catalog.total>200||stock.pagination?.total>200)fail('พบรายการมาก กรุณากรอกบาร์โค้ดหรือรหัส IC ให้ครบ','SEARCH_TOO_BROAD');
  const details=[];for(let i=0;i<catalog.rows.length;i+=4){const batch=await Promise.all(catalog.rows.slice(i,i+4).map(async p=>{if(!/^\d+$/.test(String(p.sku_id)))fail('SKU ไม่ถูกต้อง');const r=await this.request('product',{skuId:String(p.sku_id)});if(r.ok!==true||!r.product)fail('ข้อมูลสินค้าไม่ครบ');return r.product;}));details.push(...batch);}
  const branch=catalog.branchCode||'001';if(!['001','004','005'].includes(branch)||(stock.branchCode||'001')!==branch)fail('ข้อมูลตอบกลับคนละสาขา','STOCK_BRANCH_MISMATCH');return {query,candidates:selectExactCandidates(query,details,stock.records).map(c=>({...c,branchCode:branch})),stockRows:stock.records};
 }
 async resolve(candidate,query,stockRows){let rows=stockRows;if(!rows.some(r=>r.productCode===candidate.code)){const s=await this.request('stock',{search:candidate.code});if(s.branchCode&&s.branchCode!==(candidate.branchCode||'001'))fail('ข้อมูลตอบกลับคนละสาขา','STOCK_BRANCH_MISMATCH');if(!Array.isArray(s.records)||s.pagination?.total>200)fail('ค้นสต๊อก IC ไม่ได้ครบ');rows=s.records;}return normalizeStockDayProduct(candidate,query,rows);}
}
