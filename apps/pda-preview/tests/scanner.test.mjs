import test from 'node:test';
import assert from 'node:assert/strict';
import {targetCrop,selectCapture,CaptureGate} from '../scanner-core.mjs';
const catalog=[{code:'A',barcode:'8850000000028'},{code:'B',barcode:'0123456789012'}];
test('aiming alone never captures; trigger is single-flight; next read requires rearming',()=>{
 const gate=new CaptureGate();assert.equal(gate.begin(),null);gate.arm();assert.equal(gate.phase,'aiming');
 const token=gate.begin();assert.equal(gate.begin(),null);assert.equal(gate.finish(token,true),true);assert.equal(gate.begin(),null);
 gate.arm();assert.notEqual(gate.begin(),null);
});
test('late decoding cannot return a result after closing or restarting',()=>{
 const g=new CaptureGate();g.arm();const token=g.begin();g.stop();assert.equal(g.finish(token,true),false);g.arm();assert.equal(g.finish(token,true),false);assert.equal(g.phase,'aiming');
});
test('an empty or ambiguous capture returns to aiming without choosing a product',()=>{
 assert.equal(selectCapture([],catalog).kind,'empty');assert.equal(selectCapture([{value:catalog[0].barcode},{value:'UNKNOWN'}],catalog).kind,'multiple');
 assert.equal(selectCapture([{value:catalog[0].barcode,valid:false}],catalog).kind,'empty');
});
test('one recognized code resolves to its exact product; unknown code remains visible',()=>{
 assert.equal(selectCapture([{value:catalog[0].barcode}],catalog).product.code,'A');assert.equal(selectCapture([{value:'unrecognized'}],catalog).kind,'unknown');
 assert.equal(selectCapture([{value:'123456789012'}],catalog).product.code,'B');
});
test('same code repeated by a decoder is one capture, never additional quantity',()=>{
 const r=selectCapture([{value:catalog[0].barcode},{value:catalog[0].barcode}],catalog);assert.equal(r.kind,'known');assert.equal(r.value,catalog[0].barcode);assert.equal(r.quantity,undefined);
});
test('portrait camera viewport maps target to cropped sensor coordinates',()=>{
 // Landscape 1280x720 rendered in a 400x300 cover viewport clips 160px of sensor width.
 const r=targetCrop(1280,720,400,300,{x:40,y:75,width:320,height:150});
 for(const [key,expected] of Object.entries({x:256,y:180,width:768,height:360}))assert.ok(Math.abs(r[key]-expected)<1e-8);
});
test('unready frames are rejected instead of reading the wrong or full image',()=>{
 assert.throws(()=>targetCrop(0,0,400,300,{x:40,y:75,width:320,height:150}));
});
