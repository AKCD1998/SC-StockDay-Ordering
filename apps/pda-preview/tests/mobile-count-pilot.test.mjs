import test from 'node:test';import assert from 'node:assert/strict';
import {MobileCountPilotClient,PILOT_CONTRACT} from '../mobile-count-pilot.mjs';
test('a delayed 401 from the old enrollment cannot clear a newly enrolled identity',async()=>{
  let generation=0,release;const response=(status,data)=>({status,ok:status<400,json:async()=>data});
  const client=new MobileCountPilotClient({fetchImpl:async(url,options)=>{
    if(url.includes('/enroll/roster'))return response(200,{branchCode:'001',staff:[{staffId:'1'}]});
    if(url.includes('/enroll/redeem'))return response(201,{branchCode:'001',staffId:'1',deviceId:'fixture-device',staffName:'Fixture',role:'sales',token:'fixture-generation-'+(++generation),expiresAt:new Date(Date.now()+3600000).toISOString()});
    if(url.endsWith('/capabilities'))return response(200,{contract:PILOT_CONTRACT,branchCode:'001',staffId:'1',role:'sales',officialStockWrites:false,humanOverrideEnabled:false,stockSource:'full-sync',stockObservedAt:null,requiresExplicitUnit:true,barcodePackInferred:false});
    if(url.endsWith('/history')&&generation===1)return await new Promise(resolve=>{release=()=>resolve(response(401,{error:'Old enrollment expired'}));});
    if(url.endsWith('/history')){assert.equal(options.headers.Authorization,'Bearer fixture-generation-2');return response(200,{contract:PILOT_CONTRACT,branchCode:'001',records:[]});}
    throw new Error('Unexpected request');
  }});
  await client.enroll({code:'fixture-code-one',staffId:'1',deviceId:'fixture-device'});await client.connect();
  const old=client.history();await client.enroll({code:'fixture-code-two',staffId:'1',deviceId:'fixture-device'});await client.connect();release();
  await assert.rejects(old,error=>error.status===401&&error.staleAuthentication===true);
  assert.equal(client.identity.staffId,'1');assert.deepEqual(await client.history(),[]);assert.equal(client.identity.token,undefined);
});
