import test from 'node:test';
import assert from 'node:assert/strict';
import {priceCheckModel,priceCheckHtml} from '../scpda-price-check.mjs';
import {normalizeStockDayProduct} from '../stockday-live-contract.mjs';

const product=(stock={},prices=[
 {unit:'3 ชิ้น',amount:90,currency:'THB'},
 {unit:'โหล',amount:300,currency:'THB'},
 {unit:'แผง',amount:40,currency:'THB'}
])=>({productCode:'IC-000981',name:'ปกติ สามเบียน วิตามินบี 1 6 12 10 เม็ด',branchCode:'001',prices,
 stock:{quantity:45,displayUnit:'แผง',websiteTableSyncedAt:'2026-11-15T01:21:30.724Z',...stock}});

test('matches the recorded base unit independently of price order or amount',()=>{
 const m=priceCheckModel(product());
 assert.equal(m.single.unit,'แผง');assert.equal(m.single.amount,40);
 assert.deepEqual(m.other.map(p=>[p.unit,p.amount]),[['3 ชิ้น',90],['โหล',300]]);
 const html=priceCheckHtml(product());
 assert.match(html,/ซื้อเดี่ยว/);assert.match(html,/3 ชิ้น/);assert.match(html,/90\.00 บาท/);
 assert.doesNotMatch(html,/ลด \d|ซื้อครบ|ต่อชิ้น|3 แผง|10 ชิ้น/);
});
test('unknown base unit shows unit prices without inventing a single or discount rule',()=>{
 const p=product({displayUnit:null}),m=priceCheckModel(p),html=priceCheckHtml(p);
 assert.equal(m.single,null);assert.equal(m.other.length,3);
 assert.doesNotMatch(html,/ซื้อเดี่ยว|ราคาเป็นชุด/);assert.match(html,/ราคาขายตามหน่วย/);
 assert.match(html,/40\.00 บาท/);assert.match(html,/90\.00 บาท/);assert.match(html,/300\.00 บาท/);
});
test('zero, negative, fractional and absent reference stock remain distinct',()=>{
 for(const n of [0,-3,1.5,null])assert.equal(priceCheckModel(product({quantity:n})).quantity,n);
 assert.match(priceCheckHtml(product({quantity:null})),/ยังไม่มียอด/);
 assert.match(priceCheckHtml(product({quantity:0})),/<strong>0<\/strong>/);
 assert.match(priceCheckHtml(product({quantity:-3})),/<strong>-3<\/strong>/);
});
test('shows actual ingestion time; approximate morning routine is not an observation timestamp',()=>{
 const html=priceCheckHtml(product());assert.match(html,/08:21/);assert.match(html,/ประมาณ 08:30/);
 assert.equal(priceCheckModel(product()).source,'stockday-full-sync-web-view');
 assert.match(priceCheckHtml(product({websiteTableSyncedAt:null})),/ซิงก์เข้าระบบ: ไม่ระบุ/);
});
test('full names and codes are escaped, currencies and missing/zero prices preserved',()=>{
 const p=product({},[{unit:'<unit>',amount:0,currency:'USD'},{unit:null,amount:null,currency:'THB'}]);
 p.name='ชื่อยาเต็ม'.repeat(30)+'<img src=x onerror=alert(1)>';p.productCode='630000001<';
 const html=priceCheckHtml(p);
 assert.match(html,/ชื่อยาเต็ม/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
 assert.match(html,/630000001&lt;/);assert.match(html,/0\.00 USD/);assert.match(html,/ยังไม่มีราคา/);
 assert.match(priceCheckHtml(product({},[])),/ยังไม่มีข้อมูลราคา/);
});
test('reader does not promote draft/PDA-shaped extra fields into current stock',()=>{
 const normalized=normalizeStockDayProduct({code:'IC-000981',skuId:'1844',detail:{display_name:'สามเบียน',unit_prices:[{unit:'แผง',retail_price:'40',currency:'THB'}]}},'IC-000981',[
 {productCode:'IC-000981',qtyBranch001:45,unit:'แผง',syncedAt:'2026-11-15T01:21:30Z',pdaQuantity:999,source:'pda',observedAt:'2026-11-15T02:00:00Z',stockNullsPreserved:true}
 ]);
 assert.equal(priceCheckModel(normalized).quantity,45);
 assert.equal(priceCheckModel(normalized).source,'stockday-full-sync-web-view');
 assert.equal(normalized.stock.observedAt,null);
});
