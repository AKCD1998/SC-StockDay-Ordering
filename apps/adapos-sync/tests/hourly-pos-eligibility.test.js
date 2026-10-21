import test from "node:test";
import assert from "node:assert/strict";
import { classifyHourlyPosEligibility, selectHourlyPosActiveCohort } from "../src/hourlyPosEligibility.js";
import { buildPosActiveHourlyCohortManifest, validateHourlyCohortManifest } from "../src/hourlyCohortManifest.js";

const codes = n => Array.from({ length:n },(_,i)=>`SYNTHETIC-${String(i).padStart(5,"0")}`);
function fixture(count=7050) {
  const products=codes(count), positions=new Map(products.map((code,index)=>[code,index]));
  const state={queries:[],guards:[],elapsed:0,identity:{machine_name:"SERVER004",database_name:"AdaAcc",database_status:"ONLINE",is_admin:0,is_owner:0,is_writer:0,can_insert:0,can_update:0,can_delete:0},
    products, now:()=>Date.parse("2026-10-21T10:00:00Z")+state.elapsed,monotonic:()=>state.elapsed,
    guard:async options=>{state.guards.push(options);},
    pool:{request(){const bound=[];return {input(_key,_type,value){bound.push(value);},cancel(){},async query(text){
      state.queries.push({text,bound});state.elapsed++;
      if(text.includes(" AS is_admin"))return {recordset:[state.identity]};
      return {recordset:bound.map(product_code=>{const index=positions.get(product_code);return {product_code,master_exists:index<count-2?1:0,source_active:index<count-215?1:0};})};
    }}}},
  };return state;
}
test("7050 website entries partition into 6835 active, 213 not-active and 2 missing without stock reads",async()=>{
  const f=fixture(), priority=[f.products[275],f.products[1],...f.products.filter(code=>code!==f.products[275]&&code!==f.products[1])];
  const selection=await selectHourlyPosActiveCohort(f.pool,priority,{branchCode:"004",guard:f.guard,now:f.now,monotonic:f.monotonic});
  assert.equal(selection.productCodes.length,6835);assert.equal(selection.excludedNotActiveProductCodes.length,213);assert.equal(selection.excludedMissingProductCodes.length,2);
  assert.equal(selection.productCodes[0],priority[0]);assert.equal(selection.productCodes[1],priority[1]);
  assert.equal(f.queries.length,37);assert.equal(f.guards.length,73);
  for(const query of f.queries){assert.ok(query.bound.length<=200);assert.ok(!/FCPdtQty|TST_|\bEXEC(?:UTE)?\b|\b(?:INSERT|UPDATE|DELETE)\s+(?:dbo\.|INTO)/i.test(query.text));}
  const manifest=buildPosActiveHourlyCohortManifest(priority,selection);assert.equal(manifest.scope,"explicit");assert.equal(validateHourlyCohortManifest(manifest).length,6835);
  assert.equal(manifest.sourceSelection.consistency,"unverified");
});
test("SQL classification treats only active=1 as active; missing, null and other source statuses cannot become zero stock",()=>{
  const expected=codes(4),rows=expected.map((product_code,i)=>({product_code,master_exists:i===3?0:1,source_active:i===0?1:0}));
  const selected=classifyHourlyPosEligibility(rows.reverse(),expected);
  assert.deepEqual(selected.productCodes,[expected[0]]);assert.deepEqual(selected.excludedNotActiveProductCodes,expected.slice(1,3));assert.deepEqual(selected.excludedMissingProductCodes,[expected[3]]);
  for(const changed of [rows.slice(1),[...rows.slice(1),rows[1]],rows.map(row=>({...row,source_active:null})),rows.map(row=>({...row,master_exists:0,source_active:1}))]){
    assert.throws(()=>classifyHourlyPosEligibility(changed,expected),{code:"HOURLY_POS_ELIGIBILITY_INCOMPLETE"});
  }
});
test("eligibility refuses broad, duplicate, non004 or unguarded reads before SQL",async()=>{
  const f=fixture(50);
  for(const options of [{branchCode:"001",guard:f.guard},{branchCode:"004"},{branchCode:"004",guard:f.guard,batchSize:201}]){
    await assert.rejects(selectHourlyPosActiveCohort(f.pool,f.products,options),{code:"HOURLY_POS_ELIGIBILITY_INVALID"});
  }
  for(const products of [[],codes(10001),["duplicate","duplicate"]])await assert.rejects(selectHourlyPosActiveCohort(f.pool,products,{branchCode:"004",guard:f.guard}),{code:"HOURLY_POS_ELIGIBILITY_INVALID"});
  assert.equal(f.queries.length,0);
});
test("privileges, busy source and clock/deadline faults stop metadata selection without a manifest",async()=>{
  for(const mutation of [{is_admin:1},{is_writer:null},{database_name:"other"},{database_status:"OFFLINE"}]){
    const f=fixture();Object.assign(f.identity,mutation);
    await assert.rejects(selectHourlyPosActiveCohort(f.pool,f.products,{branchCode:"004",guard:f.guard,now:f.now,monotonic:f.monotonic}),{code:"HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED"});
    assert.equal(f.queries.length,1);
  }
  const busy=fixture();await assert.rejects(selectHourlyPosActiveCohort(busy.pool,busy.products,{branchCode:"004",guard:async()=>{throw Object.assign(new Error("busy"),{code:"SOURCE_BUSY"});}}),{code:"SOURCE_BUSY"});assert.equal(busy.queries.length,0);
  const expired=fixture();await assert.rejects(selectHourlyPosActiveCohort(expired.pool,expired.products,{branchCode:"004",guard:async()=>{expired.elapsed=900001;},now:expired.now,monotonic:expired.monotonic}),{code:"HOURLY_POS_ELIGIBILITY_TIMEOUT"});
  const clock=fixture();await assert.rejects(selectHourlyPosActiveCohort(clock.pool,clock.products,{branchCode:"004",guard:clock.guard,now:()=>clock.now()+(clock.queries.length?1000:0),monotonic:clock.monotonic}),{code:"HOURLY_OBSERVER_CLOCK_STEP_DETECTED"});
  const denied=fixture();denied.pool.request=()=>({query:async()=>{throw Object.assign(new Error("private connection detail"),{number:229});},cancel(){}});
  await assert.rejects(selectHourlyPosActiveCohort(denied.pool,denied.products,{branchCode:"004",guard:denied.guard}),error=>error.code==="HOURLY_SOURCE_ACCESS_DENIED"&&!error.message.includes("private"));
});
test("private source selection rejects overlapping/extraneous identities, unbounded windows and hidden metadata",()=>{
  const expected=codes(4),selection={productCodes:expected.slice(0,2),excludedNotActiveProductCodes:[expected[2]],excludedMissingProductCodes:[expected[3]],readStartedAt:"2026-10-21T10:00:00.000Z",readCompletedAt:"2026-10-21T10:15:00.000Z",consistency:"unverified"};
  const manifest=buildPosActiveHourlyCohortManifest(expected,selection);assert.equal(validateHourlyCohortManifest(manifest).length,2);
  for(const mutate of [m=>m.sourceSelection.excludedMissingProductCodes=[expected[0]],m=>m.sourceSelection.readCompletedAt="2026-10-21T10:15:00.001Z",m=>m.sourceSelection.consistency="verified",m=>m.sourceSelection.hidden="private",m=>m.scope="web-all"]){
    const changed=structuredClone(manifest);mutate(changed);assert.throws(()=>validateHourlyCohortManifest(changed),{code:"HOURLY_COHORT_MANIFEST_INVALID"});
  }
  assert.throws(()=>buildPosActiveHourlyCohortManifest(codes(3),selection),{code:"HOURLY_COHORT_MANIFEST_INVALID"});
});
