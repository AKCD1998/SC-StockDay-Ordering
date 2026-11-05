// Read-only StockDay web contract, live revision 3ab71e713173. This is a
// different, populated catalogue from the legacy /api/mobile scan catalogue.
const fail=(message,code='READ_CONTRACT')=>{throw Object.assign(new Error(message),{code});};
const exact=value=>{if(typeof value!=='string'||!value.trim()||value.length>160)fail('กรอกบาร์โค้ดหรือรหัส IC ให้ครบ');return value.trim();};
const numeric=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
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
 const value=row?.qtyBranch001;if(row&&value!==null&&(typeof value!=='number'||!Number.isFinite(value)))fail('รูปแบบยอดสต๊อกไม่ถูกต้อง');
 const detail=candidate.detail,prices=(detail?.unit_prices||[]).map(p=>({unit:typeof p.unit==='string'&&p.unit?p.unit:null,amount:numeric(p.retail_price),currency:p.currency||'THB',sourceUpdatedAt:p.source_updated_at||null,updatedAt:p.updated_at||null}));
 if(!prices.length&&detail?.retail_price)prices.push({unit:null,amount:numeric(detail.retail_price.price),currency:detail.retail_price.currency||'THB',sourceUpdatedAt:null,updatedAt:detail.retail_price.updated_at||null});
 return {productCode:candidate.code,skuId:candidate.skuId,name:detail?.display_name||row?.productNameThai||candidate.name,barcode:query,websiteBarcode:row?.barcode||null,prices,
  stock:{quantity:row?value:null,source:'stockday-full-sync-web-view',observedAt:null,unitBasis:'unknown',displayUnit:row?.unit||null,websiteTableSyncedAt:row?.syncedAt||null,zeroMayRepresentMissing:row?.qtyBranch001===0,recordPresent:Boolean(row)},
  fetchedAt,branchCode:'001',identity:{scannedPack:'unknown',conversionRuleVersion:null},officialStockWrites:false,countSubmissionAvailable:false};
}
export class StockDayLookup {
 constructor(request){this.request=request;}
 async candidates(value){const query=exact(value);const [catalog,stock]=await Promise.all([this.request('products',{keyword:query}),this.request('stock',{search:query})]);
  if(!Array.isArray(catalog.rows)||!Number.isInteger(catalog.total)||!Array.isArray(stock.records))fail('ระบบตอบข้อมูลค้นหาไม่ครบ');
  if(catalog.total>200||stock.pagination?.total>200)fail('พบรายการมาก กรุณากรอกบาร์โค้ดหรือรหัส IC ให้ครบ','SEARCH_TOO_BROAD');
  const details=[];for(let i=0;i<catalog.rows.length;i+=4){const batch=await Promise.all(catalog.rows.slice(i,i+4).map(async p=>{if(!/^\d+$/.test(String(p.sku_id)))fail('SKU ไม่ถูกต้อง');const r=await this.request('product',{skuId:String(p.sku_id)});if(r.ok!==true||!r.product)fail('ข้อมูลสินค้าไม่ครบ');return r.product;}));details.push(...batch);}
  return {query,candidates:selectExactCandidates(query,details,stock.records),stockRows:stock.records};
 }
 async resolve(candidate,query,stockRows){let rows=stockRows;if(!rows.some(r=>r.productCode===candidate.code)){const s=await this.request('stock',{search:candidate.code});if(!Array.isArray(s.records)||s.pagination?.total>200)fail('ค้นสต๊อก IC ไม่ได้ครบ');rows=s.records;}return normalizeStockDayProduct(candidate,query,rows);}
}
