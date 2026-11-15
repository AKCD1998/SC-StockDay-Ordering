import test from 'node:test';import assert from 'node:assert/strict';
import {prepareLocalCount,defaultAdaCountUnit,countCategoryFromName} from '../scpda-local-counts.mjs';
const who={operatorCode:'01001',branchCode:'001'},product={productCode:'000IC',skuId:'001',barcode:'0001234567890',name:'ทดสอบ',stock:{quantity:6,observedAt:null,unitBasis:'unknown'},prices:[]};
const lot={code:'LOT-A',codeUnknown:false,manufacturedOn:'2026-01-01',mfgUnknown:false,expiresOn:'2027-01-01',expUnknown:false,quantity:'3'};
const input=()=>({who,product,draft:{id:'fixture-record',category:'pharma',round:1,unit:'เม็ด',completeProduct:false,lots:[{...lot}]},now:'2026-11-08T12:00:00Z'});
test('local lot count preserves exact identity and records no acceptance or conversion',()=>{const i=input();i.draft.lots.push({...lot,code:'LOT-B',quantity:'2'});const r=prepareLocalCount(i);assert.equal(r.quantity,5);assert.equal(r.barcode,'0001234567890');assert.equal(r.productCode,'000IC');assert.equal(r.serverReceipt,null);assert.equal(r.syncState,'local-only');assert.equal(r.conversionFactor,null);assert.equal(r.sourceSelectionChanged,false);assert.equal(r.referenceAtCount.quantity,6);assert.equal(r.stockComparisonAllowed,false);assert.equal(r.completeProduct,false);});
test('zero is deliberate input; missing quantity and fractional/negative amounts are rejected',()=>{const i=input();for(const q of ['', '-1','1.5']){i.draft.lots[0].quantity=q;assert.throws(()=>prepareLocalCount(i));}i.draft.lots[0].quantity='0';assert.equal(prepareLocalCount(i).quantity,0);});
test('unknown lot/date fields must be explicit and stay null; dates never inferred',()=>{const i=input();i.draft.lots[0]={code:'',codeUnknown:true,manufacturedOn:'',mfgUnknown:true,expiresOn:'',expUnknown:true,quantity:'1'};const r=prepareLocalCount(i);assert.deepEqual([r.lots[0].code,r.lots[0].manufacturedOn,r.lots[0].expiresOn],[null,null,null]);i.draft.lots[0].mfgUnknown=false;assert.throws(()=>prepareLocalCount(i));});
test('invalid/reversed/future dates and duplicate lots are rejected',()=>{for(const patch of [{manufacturedOn:'2026-02-31'},{expiresOn:'2025-01-01'},{manufacturedOn:'2028-01-01'}]){const i=input();Object.assign(i.draft.lots[0],patch);assert.throws(()=>prepareLocalCount(i));}const i=input();i.draft.lots.push({...lot});assert.throws(()=>prepareLocalCount(i));});
test('rounds stay independent and a correction preserves count time with a required reason',()=>{const i=input();i.draft.round=2;assert.equal(prepareLocalCount(i).quantity,3);i.draft.supersedesId='original';i.draft.originalCountedAt='2026-11-07T10:00:00Z';assert.throws(()=>prepareLocalCount(i));i.draft.reason='พบอีกล็อต';const r=prepareLocalCount(i);assert.equal(r.quantity,3);assert.equal(r.countedAt,i.draft.originalCountedAt);assert.equal(r.supersedesId,'original');});

test('Ada source unit defaults ahead of alphabetic price units; absent source stays unknown',()=>{
 const product={stock:{displayUnit:' เม็ด '},prices:[{unit:'กล่อง'},{unit:'เม็ด'}]};
 assert.equal(defaultAdaCountUnit(product),'เม็ด');
 for(const displayUnit of [null,undefined,'',123,'x'.repeat(81)])assert.equal(defaultAdaCountUnit({...product,stock:{displayUnit}}),'');
 assert.equal(defaultAdaCountUnit({prices:[{unit:'กล่อง'}]}),'');
});

test('category follows the leading product-name token, with safe manual fallback',()=>{
 for(const [name,category]of [['เภสัช เซอร์ลิฟ 50 มก 30 เม็ด','pharma'],[' สามัญ: สำลี','common'],['ปกติ-ครีม','normal'],['\u200Bเภสัช · ยา','pharma']])assert.equal(countCategoryFromName(name),category);
 for(const name of ['ยา เภสัช ทดสอบ','เภสัชกร','สามัญชน','สินค้าใหม่',null])assert.equal(countCategoryFromName(name),'');
});
test('an admitted pilot operator can prepare round one and round two independently',()=>{
 const first=input();first.draft.uploadIntent=true;const a=prepareLocalCount(first);
 const second=input();second.draft.id='another-round';second.draft.round=2;second.draft.lots[0].quantity='5';second.draft.uploadIntent=true;const b=prepareLocalCount(second);
 assert.equal(a.operatorCode,b.operatorCode);assert.equal(a.round,1);assert.equal(b.round,2);assert.equal(a.quantity,3);assert.equal(b.quantity,5);assert.equal(a.uploadIntent,true);assert.equal(b.uploadIntent,true);assert.equal(a.completeProduct,false);assert.equal(b.completeProduct,false);
});
