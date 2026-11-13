import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserSession,API_ORIGIN} from '../scpda-browser-host.mjs';
function fixture({badBranch=false,logoutFails=false}={}){
 const calls=[],device={ready:Promise.resolve({}),status:async()=>({paired:true}),certificate:async()=>'synthetic-public-device-certificate',sign:async()=>'synthetic-signature'};
 const fetcher=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;let d,status=200;const user={id:'01001',operatorCode:'01001',branchCode:'001',role:'reader'};
  if(path.endsWith('/auth/challenge'))d={challengeId:'fixture',nonce:'fixture',deviceRef:'fixture'};
  else if(path.endsWith('/auth/login'))d={token:'SYNTHETIC-READER-TOKEN',user};
  else if(path.endsWith('/session'))d={user,officialStockWrites:false,countSubmissionAvailable:false};
  else if(path.endsWith('/counts/admission')){status=405;d={code:'READ_ONLY',error:'Reader only'};}
  else if(path.endsWith('/auth/logout')){if(logoutFails)throw Error('synthetic network loss');d={ok:true};}
  else d={rows:[]};return new Response(JSON.stringify({contract:'scpda-read-001-v1',branchCode:badBranch?'004':'001',...d}),{status});};
 return {session:new BrowserSession({device,fetcher}),calls};
}
test('existing reader-only deployment keeps product reads while count submit is unavailable',async()=>{const {session,calls}=fixture();const result=await session.execute('login',{username:'01001',password:'1111'});assert.equal(result.countUploadAvailable,false);assert.ok(!JSON.stringify(result).includes('SYNTHETIC-READER-TOKEN'));await session.execute('products',{keyword:'0001234567890'});assert.ok(calls.at(-1).url.includes('0001234567890'));await assert.rejects(session.execute('countSubmit',{}),e=>e.code==='COUNT_ACCESS_REQUIRED');assert.equal(calls.some(x=>x.url.endsWith('/api/scpda/counts')),false);});
test('browser uses credential-free fixed-origin transport with redirects rejected',async()=>{const {session,calls}=fixture();await session.execute('login',{username:'01001',password:'1111'});for(const c of calls){assert.ok(c.url.startsWith(API_ORIGIN+'/api/scpda/'));assert.equal(c.options.credentials,'omit');assert.equal(c.options.redirect,'error');}assert.throws(()=>new BrowserSession({origin:'https://example.com',device:{}}),/Fixed SCPDA/);});
test('wrong branch response cannot become a reader identity',async()=>{const {session}=fixture({badBranch:true});await assert.rejects(session.execute('login',{username:'01001',password:'1111'}),e=>e.code==='CONTRACT_INVALID');await assert.rejects(session.execute('products',{keyword:'0001234567890'}),e=>e.code==='LOGIN_REQUIRED');});
test('failed logout still clears local session capability',async()=>{const {session}=fixture({logoutFails:true});await session.execute('login',{username:'01001',password:'1111'});await assert.rejects(session.execute('logout'));await assert.rejects(session.execute('products',{keyword:'0001234567890'}),e=>e.code==='LOGIN_REQUIRED');});
