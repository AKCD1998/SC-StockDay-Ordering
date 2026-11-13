import test from 'node:test';import assert from 'node:assert/strict';
import {focusScore,selectCaptureFrame,mergeSameImageReadings,BoxSmoother} from '../label-capture-quality.mjs';
import {patchFeature} from '../label-vision.mjs';
const bbox={x0:15,y0:15,x1:65,y1:30},region={x0:15/80,y0:15/100,x1:65/80,y1:30/100};
function frame(blank=false){const gray=new Uint8Array(80*100).fill(240);if(!blank)for(let y=15;y<70;y++)for(let x=15;x<65;x++)if((x%7<3)&&(y%20<10))gray[y*80+x]=20;return {w:80,h:100,gray};}
test('focus scoring prefers actual edges to a flat image',()=>assert.ok(focusScore(frame(),[region])>focusScore(frame(true),[region])));
test('same-image retained LOT survives a missing fresh OCR field',()=>{
 const retained=[{role:'lot',value:'A2601',raw:'A2601',bbox}],fresh=[{role:'mfg',value:'2026-03',bbox},{role:'exp',value:'2028-02',bbox}];const out=mergeSameImageReadings(fresh,retained);assert.equal(out.length,3);assert.equal(out.find(b=>b.role==='lot').retained,true);
});
test('different readings of one image remain alternatives, never silently overwritten',()=>{
 const out=mergeSameImageReadings([{role:'lot',value:'A2601',bbox}],[{role:'lot',value:'A260I',bbox}]);assert.equal(out.length,2);assert.ok(out.every(b=>b.conflicting));
});
test('selection rejects an expired or unrelated cached frame',()=>{
 const f=frame(),old={id:'old',at:100,quality:500,frame:f,regions:[{bbox}],anchors:[{role:'lot',region,feature:patchFeature(f,bbox)},{role:'mfg',region,feature:patchFeature(f,bbox)}],readings:[{role:'lot',value:'A2601'}]},blank={id:'new',at:3000,quality:10,frame:frame(true),regions:[],anchors:[],readings:[]};
 assert.equal(selectCaptureFrame([old],[blank],3000).chosen.id,'new');assert.equal(selectCaptureFrame([old],[{...blank,at:6000,frame:f,regions:[{bbox}]}],6000).chosen.id,'new');
 assert.equal(selectCaptureFrame([{...old,at:2900}],[blank],3000).chosen.id,'new');
});
test('small box jitter is reduced without changing OCR geometry; large moves snap',()=>{
 const s=new BoxSmoother(),input=x=>[{id:'a',role:'lot',value:'A',bbox:{x0:x,y0:20,x1:x+70,y1:45}}];s.update(input(50),640,800);const b=s.update(input(56),640,800)[0];assert.equal(b.bbox.x0,56);assert.ok(b.renderBbox.x0>50&&b.renderBbox.x0<56);assert.equal(s.update(input(300),640,800)[0].renderBbox.x0,300);s.update([],640,800);assert.equal(s.items.size,0);
});
test('a changed LOT vetoes older buffer frames even when the two date patches still match',()=>{
 const a={w:80,h:120,gray:new Uint8Array(9600).fill(235)},regions=[{x0:15,y0:10,x1:65,y1:25},{x0:15,y0:50,x1:65,y1:65},{x0:15,y0:90,x1:65,y1:105}];
 for(const b of regions)for(let y=b.y0;y<b.y1;y++)for(let x=b.x0;x<b.x1;x++)if(x%7<3)a.gray[y*80+x]=20;
 const b={...a,gray:a.gray.slice()};for(let y=10;y<25;y++)for(let x=15;x<65;x++)b.gray[y*80+x]=255-b.gray[y*80+x];
 const anchors=regions.map((r,i)=>({role:['lot','mfg','exp'][i],region:{x0:r.x0/80,x1:r.x1/80,y0:r.y0/120,y1:r.y1/120},feature:patchFeature(a,r)}));
 const old={id:'known-A',at:950,quality:500,frame:a,regions:regions.map(bbox=>({bbox})),anchors,readings:[{role:'lot',value:'A2601'}]},buffer={...old,id:'buffer-A',anchors:anchors.slice(1).map(x=>({...x,role:'text'})),readings:[]},fresh={id:'current-B',at:1000,quality:50,frame:b,regions:regions.map(bbox=>({bbox})),anchors:[],readings:[]};
 assert.equal(selectCaptureFrame([old,buffer],[fresh],1000).chosen.id,'current-B');
});
