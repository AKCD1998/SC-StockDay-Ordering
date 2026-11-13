import test from 'node:test';
import assert from 'node:assert/strict';
import {coverCrop,normalizedBox,frameBox,regionAt,sceneChanged,overlaps} from '../label-camera.mjs';
test('visible camera crop respects portrait and landscape object-fit cover',()=>{
 assert.deepEqual(coverCrop(1600,900,400,600),{left:500,top:0,width:600,height:900});
 assert.deepEqual(coverCrop(900,1600,600,400),{left:0,top:500,width:900,height:600});
 assert.equal(coverCrop(0,900,400,600),null);
});
test('chosen areas survive analysis-to-capture resolution changes without changing meaning',()=>{
 const region=normalizedBox({x0:200,y0:300,x1:500,y1:400},1000,1400);
 assert.deepEqual(frameBox(region,2000,2800),{x0:400,y0:600,x1:1000,y1:800});
 const edge=regionAt({x:2,y:2},1000,1400);assert.ok(edge.x0>=0&&edge.y0>=0&&edge.x1<=1000&&edge.y1<=1400);
});
test('camera-motion guard distinguishes a changed view from small sensor noise',()=>{
 const a=new Uint8Array(200).fill(200),noise=new Uint8Array(200).fill(202),b=a.slice();b.fill(40,50,70);
 assert.equal(sceneChanged(a,noise),false);assert.equal(sceneChanged(a,b),true);
 assert.equal(sceneChanged(null,a),false);
});
test('manual hint replaces an overlapping automatic reading, not unrelated text',()=>{
 assert.equal(overlaps({x0:0,y0:0,x1:10,y1:10},{x0:1,y0:1,x1:9,y1:9}),true);
 assert.equal(overlaps({x0:0,y0:0,x1:10,y1:10},{x0:20,y0:20,x1:30,y1:30}),false);
});
