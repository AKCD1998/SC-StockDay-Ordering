import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeManualDate,manualDateText,dateDraftValue,monthDays,maskManualDate} from '../manual-label-date.mjs';
import {prepareLocalCount} from '../scpda-local-counts.mjs';import {countSubmission} from '../scpda-count-sync.mjs';
test('direct numeric, separated, Thai-digit and Buddhist label dates preserve the same Gregorian day',()=>{
 for(const input of ['16112026','16/11/2026','16-11-2026','16.11.2026','16112569','16/11/2569','๑๖๑๑๒๕๖๙','2026-11-16'])assert.equal(normalizeManualDate(input),'2026-11-16',input);
 assert.equal(manualDateText('2026-11-16'),'16/11/2026');assert.equal(manualDateText('16112569'),'16/11/2026');
 assert.equal(normalizeManualDate('2450-11-16'),'2450-11-16','ISO is explicitly Gregorian');assert.equal(manualDateText('2450-11-16'),'2450-11-16');
});
test('missing days, short years and nonexistent dates are never guessed or rolled into another month',()=>{
 for(const input of ['',null,'02/2026','022026','2026','16/11/26','31022026','29022025','31/04/2026','2026-13-01','0000-01-01'])assert.throws(()=>normalizeManualDate(input),String(input));
 assert.equal(normalizeManualDate('29022024'),'2024-02-29');assert.equal(monthDays(1900,2),28);assert.equal(monthDays(2000,2),29);
 assert.equal(dateDraftValue('16'),'16');assert.equal(manualDateText('31/02/2026'),'31/02/2026');assert.equal(dateDraftValue(''),'');
});
test('typing separators preserve partial input and invalid dates for validation, while complete pasted dates keep their meaning',()=>{
 for(const [raw,expected] of [['',''],['1','1'],['16','16/'],['161','16/1'],['1611','16/11/'],['16112026','16/11/2026'],['๑๖๑๑๒๕๖๙','16/11/2569'],['31/02/2026','31/02/2026'],['2026-11-16','16/11/2026'],['1/2/2026','01/02/2026']])assert.equal(maskManualDate(raw),expected);
 assert.throws(()=>normalizeManualDate(maskManualDate('31022026')));
});
test('manual typing reaches the existing count payload as ISO dates without altering the draft or validation policy',()=>{
 const who={branchCode:'005',operatorCode:'01005'},product={branchCode:'005',productCode:'QA-DATE',skuId:'1',barcode:'000123',name:'เภสัช ทดสอบ',stock:{displayUnit:'แผง',quantity:6}},draft={id:'10000000-0000-4000-8000-000000000001',category:'pharma',round:1,unit:'แผง',lots:[{code:'DATE-A',quantity:'6',manufacturedOn:'01022566',expiresOn:'29/02/2579'}]},original=JSON.stringify(draft);
 const result=prepareLocalCount({who,product,draft,now:'2026-11-16T03:00:00Z'}),payload=countSubmission(result);
 assert.equal(payload.lots[0].manufacturedOn,'2023-02-01');assert.equal(payload.lots[0].expiresOn,'2036-02-29');assert.equal(payload.lots[0].quantity,'6');assert.equal(JSON.stringify(draft),original);
 assert.throws(()=>prepareLocalCount({who,product,draft:{...draft,lots:[{...draft.lots[0],manufacturedOn:'16112579'}]},now:'2026-11-16T03:00:00Z'}),/วันผลิตอยู่ในอนาคต/);
 const unknown=prepareLocalCount({who,product,draft:{...draft,lots:[{...draft.lots[0],mfgUnknown:true,expUnknown:true,manufacturedOn:'02/2026',expiresOn:'02/2028'}]}});assert.equal(unknown.lots[0].manufacturedOn,null);assert.equal(unknown.lots[0].expiresOn,null);
});
