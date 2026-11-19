import test from 'node:test';
import assert from 'node:assert/strict';
import {enrollmentFromUrl} from '../scpda-daily-contract.mjs';
import {BrowserSession} from '../scpda-browser-host.mjs';
import {requireScpdaActor} from '../stockday-live-contract.mjs';
import {prepareLocalCount} from '../scpda-local-counts.mjs';
const qr='https://sc-stockday-ordering.onrender.com/scpda/#enroll=781802c7-8c57-4ad3-b15c-a1e7aa745643.'+'a'.repeat(43);
for(const [operatorCode,scope] of [['02004','004-front'],['02004SHPEE','004-shopee'],['03004','004-front'],['04004SHPEE','004-shopee'],['120004','004-front']]){
 test(operatorCode+' QR selects its own004 identity before login; another team is rejected',async()=>{
  const grant=enrollmentFromUrl(qr+'&operator='+operatorCode);assert.equal(grant.branchCode,'004');assert.equal(grant.operatorCode,operatorCode);
  const device={status:async()=>({paired:false}),ready:Promise.resolve({})};const session=new BrowserSession({device,companion:true,fetcher:async()=>{throw Error('Foreign login must not reach the network');}});session.grant=grant;
  const state=await session.execute('status');assert.equal(state.operatorCode,operatorCode);assert.equal(state.branchCode,'004');assert.equal(state.paired,true);
  await assert.rejects(session.execute('login',{username:operatorCode.endsWith('SHPEE')?'02004':'02004SHPEE',password:'fixturePassword'}),e=>e.code==='IDENTITY_INVALID');
 });
 test(operatorCode+' keeps scope in local drafts/submissions and cannot acquire primary pick privileges',()=>{
  const reply={contract:'scpda-read-004-v1',branchCode:'004',user:{id:operatorCode,operatorCode,branchCode:'004',role:'reader',rotationDueAt:'2027-01-01T00:00:00Z',countScope:{id:scope,branchCode:'004'},canRecordInternalPick:true}};
  const who=requireScpdaActor(reply);assert.equal(who.countScope.id,scope);assert.equal(who.canRecordInternalPick,false);
  assert.throws(()=>requireScpdaActor({...reply,user:{...reply.user,countScope:null}}));assert.throws(()=>requireScpdaActor({...reply,user:{...reply.user,countScope:{id:scope==='004-front'?'004-shopee':'004-front',branchCode:'004'}}}));
  const product={productCode:'QA-001',skuId:'1',barcode:'0001234567890',name:'เภสัช ยาทดสอบ',branchCode:'004',stock:{quantity:40,displayUnit:'กล่อง'}},draft={id:crypto.randomUUID(),countScopeId:scope,category:'pharma',round:1,unit:'กล่อง',completeProduct:false,lots:[{code:'LOT',quantity:'3',manufacturedOn:'01/01/2026',expiresOn:'31/01/2028'}]};
  assert.equal(prepareLocalCount({who,product,draft}).countScopeId,scope);assert.throws(()=>prepareLocalCount({who,product,draft:{...draft,countScopeId:null}}));
 });
 test(operatorCode+' cold resume reads the permanent certificate identity instead of default005',async()=>{
  const session=new BrowserSession({companion:true,device:{status:async()=>({paired:true,branchCode:'004',operatorCode})},fetcher:async()=>{throw Error('No network for status');}});
  assert.deepEqual((({operatorCode,branchCode})=>({operatorCode,branchCode}))(await session.execute('status')),{operatorCode,branchCode:'004'});
 });
}
test('legacy005 QR is retained and QR identity accepts only known companion accounts',()=>{
 assert.deepEqual(enrollmentFromUrl(qr),{grantId:'781802c7-8c57-4ad3-b15c-a1e7aa745643',secret:'a'.repeat(43)});
 for(const suffix of ['&operator=01004','&operator=02001','&operator=02004&operator=02004SHPEE','&operator=02004&branch=005'])assert.throws(()=>enrollmentFromUrl(qr+suffix));
});
