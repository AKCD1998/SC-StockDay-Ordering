import test from 'node:test';
import assert from 'node:assert/strict';
import {PriceCheckRefresh} from '../scpda-price-refresh.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function setup(load){
 const timers=new Map(),data=[],states=[];let id=0;
 const watch=new PriceCheckRefresh({load,onData:p=>data.push(p),onState:s=>states.push(s),setTimer:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimer:i=>timers.delete(i)});
 return {watch,timers,data,states};
}
test('active price view schedules 60-second reads without overlap',async()=>{
 const job=deferred();let calls=0;const {watch,timers,data}=setup(()=>{calls++;return job.promise;});
 watch.start({productCode:'IC-000981'});assert.equal([...timers.values()][0].ms,60000);
 const first=watch.refresh(),second=watch.refresh();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);assert.equal(timers.size,0);
 job.resolve({productCode:'IC-000981',quantity:46});await first;assert.equal(data[0].quantity,46);assert.equal(timers.size,1);
});
test('leaving or replacing the view rejects late data and old retry timers',async()=>{
 const old=deferred(),{watch,data,timers}=setup(()=>old.promise);watch.start({productCode:'OLD'});const job=watch.refresh();await Promise.resolve();watch.start({productCode:'NEW'});old.resolve({productCode:'OLD'});await job;
 assert.equal(data.length,0);assert.equal(watch.product.productCode,'NEW');assert.equal(timers.size,1);watch.stop();assert.equal(timers.size,0);
});
test('background pauses reads; returning refreshes immediately and ignores old results',async()=>{
 const old=deferred();let calls=0;const {watch,data,timers}=setup(()=>++calls===1?old.promise:Promise.resolve({quantity:47}));
 watch.start({quantity:45});const first=watch.refresh();await Promise.resolve();watch.pause(true);assert.equal(timers.size,0);await watch.refresh();assert.equal(calls,1);
 watch.pause(false);const resumed=watch.job;await resumed;old.resolve({quantity:1});await first;assert.deepEqual(data,[{quantity:47}]);assert.equal(timers.size,1);
});
test('failed refresh retains source data/time, reports failure and schedules a retry',async()=>{
 const p={quantity:45,syncedAt:'2026-11-15T01:21:30Z'},error=new Error('offline');const {watch,data,states,timers}=setup(()=>Promise.reject(error));watch.start(p);await watch.refresh();
 assert.equal(data.length,0);assert.equal(watch.product,p);assert.equal(states.at(-1).error,error);assert.equal(states.at(-1).refreshing,false);assert.equal(timers.size,1);
});
test('an expired response from an old view cannot invoke the current error handler',async()=>{
 const old=deferred(),{watch,states}=setup(()=>old.promise);watch.start({id:1});const job=watch.refresh();await Promise.resolve();watch.stop();old.reject(Object.assign(Error('expired'),{status:401}));await job;assert.equal(states.filter(s=>s.error).length,0);
});
test('stopping a queued refresh before it starts avoids the network call',async()=>{
 let calls=0;const {watch}=setup(()=>{calls++;return {quantity:1};});watch.start({quantity:45});const job=watch.refresh();watch.stop();await job;assert.equal(calls,0);
});
