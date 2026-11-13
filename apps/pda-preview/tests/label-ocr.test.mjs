import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrintedDate,validLabelDate,dateBounds,dateOrderInvalid,labelDateText} from '../label-dates.mjs';
import {parseLabelText,proposeLabelBoxes} from '../label-parser.mjs';
import {validateCount} from '../domain.mjs';
test('example preserves exact LOT and month precision, never weight as quantity',()=>{
 const fields=parseLabelText('EXP 02/2026\nBN 202308 MFG 02/2023\nNet Weight: 800mg / pc');
 assert.deepEqual(fields.map(f=>[f.role,f.value]),[['exp','2026-02'],['lot','202308'],['mfg','2023-02']]);
 assert.ok(fields.every(f=>!('quantity' in f)));assert.equal(parsePrintedDate('202308'),null);
});
test('different layouts and labels remain anchored',()=>{
 assert.deepEqual(parseLabelText('Batch No: A001/BC\nMFD:2024-11-13\nExpiry JAN 2028').map(f=>[f.role,f.value]),[['lot','A001/BC'],['mfg','2024-11-13'],['exp','2028-01']]);
 assert.equal(parseLabelText('LOT 000012')[0].value,'000012');
 assert.deepEqual(parseLabelText('EXP02/2026 MFG02/2023').map(f=>f.value),['2026-02','2023-02']);
 assert.deepEqual(parseLabelText('Net Weight 800mg / pc'),[]);
});
test('missing fields and ambiguous dates stay uncertain',()=>{
 assert.equal(parseLabelText('LOT A22').length,1);
 const d=parsePrintedDate('03/04/2026');assert.equal(d.value,null);assert.deepEqual(d.choices,['2026-04-03','2026-03-04']);
 assert.equal(parsePrintedDate('02/26'),null);assert.equal(parsePrintedDate('02/2623'),null);assert.equal(parsePrintedDate('02/2569'),null);assert.equal(parsePrintedDate('EXP not printed'),null);
});
test('calendar validation and month intervals do not invent stored days',()=>{
 for(const s of ['2026-02','2024-02-29'])assert.ok(validLabelDate(s));
 for(const s of ['2026-13','2026-02-29','2026-04-31','incomplete'])assert.equal(validLabelDate(s),false);
 assert.deepEqual(dateBounds('2024-02'),{first:'2024-02-01',last:'2024-02-29'});
 assert.equal(dateOrderInvalid('2026-03','2026-02'),true);assert.equal(dateOrderInvalid('2026-02-27','2026-02'),false);
 assert.equal(labelDateText('2026-02'),'ก.พ. 2026 · เดือน/ปี');
});
test('automatic rectangles use recognized text positions',()=>{
 const word=(text,x)=>({text,bbox:{x0:x,y0:20,x1:x+80,y1:50}});
 const data={text:'MFG 02/2023 EXP 02/2026 LOT A12',blocks:[{paragraphs:[{lines:[{bbox:{x0:0,y0:20,x1:600,y1:50},words:[word('MFG',0),word('02/2023',90),word('EXP',180),word('02/2026',270),word('LOT',360),word('A12',450)]}]}]}]};
 const p=proposeLabelBoxes(data);assert.equal(p.boxes.length,3);assert.equal(p.boxes.find(b=>b.role==='exp').bbox.x0,270);

});
test('preview validation accepts month evidence and explicit absent label fields',()=>{
 const base={complete:false,observedAt:'2026-11-13T05:00:00Z'};
 assert.deepEqual(validateCount({...base,lots:[{code:'ไม่ทราบ',quantity:7,mfg:null,exp:null}]},Date.parse('2026-11-13T06:00Z')),[]);
 assert.deepEqual(validateCount({...base,lots:[{code:'202308',quantity:7,mfg:'2023-02',exp:'2026-02'}]},Date.parse('2026-11-13T06:00Z')),[]);
 assert.ok(validateCount({...base,lots:[{code:'A',quantity:7,mfg:'2026-03',exp:'2026-02'}]},Date.parse('2026-11-13T06:00Z')).length);
});
