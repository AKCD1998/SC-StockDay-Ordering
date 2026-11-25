import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreScpdaSession} from '../scpda-startup.mjs';
function fixture(extra={}){
 const events=[];
 return {events,options:{busy:()=>events.push('busy'),device:()=>events.push('device'),authenticated:()=>events.push('authenticated'),ready:()=>events.push('ready'),needsLogin:()=>events.push('login'),retryable:()=>events.push('retry'),status:async()=>({paired:true,dailyResumeAvailable:true}),resume:async()=>({dailySession:true}),...extra}};
}
test('startup stays loading until saved daily proof is accepted, without flashing login',async()=>{
 let finish;const f=fixture({resume:()=>new Promise(resolve=>{finish=resolve;})});const run=restoreScpdaSession(f.options);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.events,['busy','device']);finish({dailySession:true});
 assert.equal(await run,'ready');assert.deepEqual(f.events,['busy','device','authenticated','ready']);
});
test('an absent saved session goes to login without a resume or credentials replay',async()=>{
 const f=fixture({status:async()=>({paired:true,dailyResumeAvailable:false}),resume:async()=>assert.fail('No resume marker')});
 assert.equal(await restoreScpdaSession(f.options),'login');assert.deepEqual(f.events,['busy','device','login']);
});
test('midnight/revocation is not treated as a valid remembered login',async()=>{
 const f=fixture({resume:async()=>{throw Object.assign(Error('expired'),{status:401});}});
 assert.equal(await restoreScpdaSession(f.options),'login');assert.equal(f.events.includes('authenticated'),false);
});
test('offline resume offers retry, then restores without switching to the login form',async()=>{
 let offline=true;const f=fixture({resume:async()=>{if(offline)throw Error('offline');return {dailySession:true};}});
 assert.equal(await restoreScpdaSession(f.options),'retry');offline=false;
 assert.equal(await restoreScpdaSession(f.options),'ready');assert.equal(f.events.includes('login'),false);
});
