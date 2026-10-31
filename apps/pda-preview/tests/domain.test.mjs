import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStock,validateCount,syncOutbox,POLICY} from '../domain.mjs';
const now=Date.parse('2026-10-31T05:00:00Z');
const row=(quantity,age=0,extra={})=>({quantity,observedAt:new Date(now-age).toISOString(),eligible:true,...extra});
const human=(quantity,age=0,extra={})=>row(quantity,age,{status:'synced',complete:true,...extra});
test('complete accepted count has priority and preserves an actual zero',()=>{
 const result=resolveStock({human:human(0),hourly:row(20,60000),full:row(30,3600000),now});
 assert.equal(result.source,'human');assert.equal(result.quantity,0);
});
test('a partial count cannot replace a branch total',()=>{
 assert.equal(resolveStock({human:human(7,0,{complete:false}),hourly:row(20),now}).quantity,20);
});
test('pending and conflicted events never become source of truth',()=>{
 for(const status of ['pending','conflict'])assert.equal(resolveStock({human:human(7,0,{status}),full:row(30),now}).source,'full');
});
test('stale human count falls through to hourly',()=>{
 const r=resolveStock({human:human(7,POLICY.human+1),hourly:row(20),now});
 assert.equal(r.source,'hourly');assert.equal(r.skipped[0].reason,'stale');
});
test('newer machine observation supersedes older count without movement coverage',()=>{
 const r=resolveStock({human:human(7,60000),hourly:row(20),now});
 assert.equal(r.source,'hourly');assert.equal(r.skipped[0].reason,'newer-observation');
});
test('future or unverified machine observation does not invalidate a good count',()=>{
 for(const hourly of [row(20,-60000),row(20,0,{eligible:false})])assert.equal(resolveStock({human:human(7,60000),hourly,now}).source,'human');
});
test('missing hourly falls through to fresh Full Sync',()=>assert.equal(resolveStock({full:row(30),now}).source,'full'));
test('all sources stale returns unknown, never fabricated zero',()=>{
 const r=resolveStock({human:human(7,POLICY.human+1),hourly:row(20,POLICY.hourly+1),full:row(30,POLICY.full+1),now});
 assert.equal(r.source,'unknown');assert.equal(r.quantity,null);
});
test('invalid/future/NaN values fall through; zero hourly remains valid',()=>{
 for(const h of [human(NaN),human(7,-60000),human('7'),human(Infinity)])assert.equal(resolveStock({human:h,hourly:row(0),now}).quantity,0);
});
const count=(lots)=>({complete:true,observedAt:new Date(now).toISOString(),lots});
const lot=(quantity=3)=>({code:'A01',quantity,mfg:'2025-01-01',exp:'2027-01-01'});
test('accept explicit zero and unknown dates, retain expired items as count evidence',()=>{
 assert.deepEqual(validateCount(count([{code:'unknown',quantity:0,mfg:null,exp:null}]),now),[]);
 assert.deepEqual(validateCount(count([{...lot(),exp:'2026-01-01'}]),now),[]);
});
test('reject negative, absent, infinite quantities and impossible chronology',()=>{
 for(const q of [-1,NaN,Infinity,'',1e12])assert.ok(validateCount(count([lot(q)]),now).length);
 assert.ok(validateCount(count([{...lot(),mfg:'2028-01-01'}]),now).length);
 assert.ok(validateCount(count([{...lot(),mfg:'2025-02-30'}]),now).length);
});
test('reject duplicate lots rather than double count',()=>assert.ok(validateCount(count([lot(),lot()]),now).some(e=>e.includes('ล็อตซ้ำ'))));
test('outbox retry is idempotent and keeps the original observed time',()=>{
 const event={id:'a',productCode:'P1',baseRevision:0,status:'pending',observedAt:new Date(now-3600000).toISOString()};
 const once=syncOutbox([event],{}),twice=syncOutbox(once.events,once.revisions);
 assert.deepEqual(twice,once);assert.equal(once.revisions.P1,1);assert.equal(once.events[0].observedAt,event.observedAt);
});
test('offline concurrent counts are retained as conflicts, never last-writer-wins',()=>{
 const a={id:'a',productCode:'P1',baseRevision:0,status:'pending',observedAt:new Date(now-1000).toISOString()};
 const b={...a,id:'b',observedAt:new Date(now).toISOString()};
 const r=syncOutbox([b,a],{});
 assert.equal(r.events.find(e=>e.id==='a').status,'synced');assert.equal(r.events.find(e=>e.id==='b').status,'conflict');assert.equal(r.events.length,2);
});

test('unconfirmed discrepancy is delivered but cannot replace shared stock',()=>{
 const event={id:'d1',productCode:'P1',quantity:3,complete:true,status:'pending',baseRevision:0,observedAt:new Date(now).toISOString()};
 const r=syncOutbox([event],{},{getReference:()=>({quantity:6,source:'hourly',observedAt:'2026-10-31T04:50:00Z'}),now:()=>new Date(now).toISOString()});
 assert.equal(r.events[0].status,'review');assert.equal(r.events[0].comparison.difference,-3);
 assert.equal(resolveStock({human:{...r.events[0],eligible:true},hourly:row(6,60000),now}).source,'hourly');
});
test('explicit staff recheck accepts 3 against 6 with its exact comparison evidence',()=>{
 const ref={quantity:6,source:'hourly',observedAt:'2026-10-31T04:50:00Z'};
 const event={id:'d1',productCode:'P1',quantity:3,complete:true,status:'pending',baseRevision:0,observedAt:new Date(now).toISOString(),discrepancyConfirmation:{rechecked:true,reason:'Checked both floors',countQuantity:3,referenceQuantity:6,referenceSource:'hourly',referenceObservedAt:ref.observedAt}};
 const r=syncOutbox([event],{},{getReference:()=>ref});assert.equal(r.events[0].status,'synced');
 assert.deepEqual(r.events[0].discrepancyConfirmation,event.discrepancyConfirmation);
 const changed=syncOutbox([event],{},{getReference:()=>({...ref,quantity:9})});assert.equal(changed.events[0].status,'review');
 const timed=syncOutbox([event],{},{getReference:()=>({...ref,observedAt:'2026-10-31T04:55:00Z'})});assert.equal(timed.events[0].status,'review');
});
test('partial lots are not falsely compared to the full branch quantity',()=>{
 const event={id:'p',productCode:'P1',quantity:3,complete:false,status:'pending',baseRevision:0,observedAt:new Date(now).toISOString()};
 const r=syncOutbox([event],{},{getReference:()=>({quantity:6})});assert.equal(r.events[0].status,'synced');assert.equal(r.events[0].comparison.kind,'partial');
});
test('linked correction preserves the original observation and reason',()=>{
 const original={id:'old',branchCode:'004',productCode:'P1',quantity:3,complete:true,status:'synced',baseRevision:0,observedAt:'2026-10-31T04:00:00Z'};
 const originalCopy=structuredClone(original);
 const correction={...original,id:'new',status:'pending',baseRevision:1,quantity:6,supersedesId:'old',incidentId:'incident-1',correctionReason:'Found second-floor lot',observedAt:'2026-10-31T05:00:00Z'};
 const r=syncOutbox([original,correction],{P1:1});assert.deepEqual(r.events[0],originalCopy);assert.equal(r.events[1].status,'synced');assert.equal(r.events[1].quantity,6);assert.equal(r.events.length,2);
 const wrongBranch=syncOutbox([original,{...correction,branchCode:'001'}],{P1:1});assert.equal(wrongBranch.events[1].status,'conflict');
 const missingReason=syncOutbox([original,{...correction,correctionReason:''}],{P1:1});assert.equal(missingReason.events[1].status,'conflict');
});
