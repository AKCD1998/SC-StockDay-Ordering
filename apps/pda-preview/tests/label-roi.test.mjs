import test from 'node:test';
import assert from 'node:assert/strict';
import {textRegionPlan,mapCropBox} from '../label-roi.mjs';
import {parseLabelText,proposeLabelBoxes} from '../label-parser.mjs';
import {parsePrintedDate} from '../label-dates.mjs';
import {guardedOcrWorker} from '../label-ocr-worker.mjs';
test('close during asynchronous canvas decoding rejects new work and drains before termination',async()=>{
 let finish,terminated=0;const raw={recognize:()=>new Promise(resolve=>{finish=resolve;}),terminate:async()=>{terminated++;}},worker=guardedOcrWorker(raw),reading=worker.recognize({});await Promise.resolve();const stopped=worker.terminate();assert.equal(terminated,0);await assert.rejects(worker.recognize({}),/session closed/);finish({data:{text:'LOT A12'}});await reading;await stopped;assert.equal(terminated,1);await worker.terminate();assert.equal(terminated,1);
});
test('yellow row crops include nearby label context and stay inside source',()=>{
 const regions=[{quality:8,polarity:1,bbox:{x0:210,y0:300,x1:330,y1:320}},{quality:7,polarity:1,bbox:{x0:210,y0:340,x1:330,y1:360}},{quality:6,polarity:1,bbox:{x0:120,y0:380,x1:330,y1:410}}],plan=textRegionPlan(regions,600,640);
 assert.equal(plan.length,1);const b=plan[0].bbox;assert.ok(b.x0<120&&b.x0>0);assert.ok(b.y0<300&&b.y1>410&&b.y1<640);assert.ok((b.x1-b.x0)*(b.y1-b.y0)<600*640*.3);
 assert.deepEqual(textRegionPlan([],600,640),[]);
});
test('recognized crop coordinates map to the exact source without display smoothing',()=>{
 const crop={bbox:{x0:200,y0:500,x1:600,y1:700},scale:2,pad:16};
 assert.deepEqual(mapCropBox({x0:56,y0:76,x1:216,y1:156},crop),{x0:220,y0:530,x1:300,y1:570});
});
test('year then month with dot/space separators keeps printed month precision',()=>{
 for(const text of ['2025. 10','2025 .10','2025 10','2025/10'])assert.equal(parsePrintedDate(text).value,'2025-10');
 assert.equal(parsePrintedDate('2025. 13'),null);
 assert.deepEqual(parseLabelText('2025.10\n2028.10'),[]);
 assert.deepEqual(parseLabelText('Exp. Date 2028. 10\nLot No. 001A\nMfg. Date 2025. 10').map(f=>[f.role,f.value]),[['exp','2028-10'],['lot','001A'],['mfg','2025-10']]);
});
test('dot-separated dates split by OCR still locate the value rectangle',()=>{
 const words=[['Mfg.',10,40],['Date',45,75],['2025.',100,180],['10',190,220]].map(([text,x0,x1])=>({text,bbox:{x0,y0:30,x1,y1:60}}));
 const data={text:'Mfg. Date 2025. 10',blocks:[{paragraphs:[{lines:[{bbox:{x0:10,y0:30,x1:220,y1:60},words}]}]}]};
 assert.deepEqual(proposeLabelBoxes(data).boxes.map(b=>[b.role,b.value,b.bbox]),[['mfg','2025-10',{x0:100,y0:30,x1:220,y1:60}]]);
});
