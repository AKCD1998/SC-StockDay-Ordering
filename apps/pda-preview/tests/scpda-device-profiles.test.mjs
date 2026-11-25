import test from 'node:test';import assert from 'node:assert/strict';
import {profileIdentity,profileRecords,rememberProfile} from '../scpda-device-profiles.mjs';
const certificate=(branch,operator)=>'fixture.'+btoa(JSON.stringify({branch_code:branch,...(operator?{operator_code:operator}:{})}))+'.fixture';
test('profile migration remembers the legacy home connection without passwords/bearers',()=>{
 const state={certificate:certificate('001'),dailySessionId:'day-home'};const remembered=rememberProfile(state);
 assert.deepEqual(remembered['001:primary'],{certificate:state.certificate,dailySessionId:'day-home'});
 const rows=profileRecords(state);assert.equal(rows[0].branchCode,'001');assert.equal(rows[0].active,true);
 assert.equal(JSON.stringify(rows).includes('day-home'),false);assert.equal(JSON.stringify(rows).includes('fixture.'),false);
});
test('visiting005 and004 keeps the home connection and each daily marker independent',()=>{
 let state={certificate:certificate('001'),dailySessionId:'home'};
 let profiles=rememberProfile(state);state={profiles,certificate:certificate('005','03005'),dailySessionId:'five'};profiles=rememberProfile(state);
 state={profiles,certificate:certificate('004','04004SHPEE'),dailySessionId:'four'};profiles=rememberProfile(state);
 assert.equal(Object.keys(profiles).length,3);assert.equal(profiles['001:primary'].dailySessionId,'home');assert.equal(profiles['005:03005'].dailySessionId,'five');
 state={profiles,certificate:certificate('005','03005'),dailySessionId:''};profiles=rememberProfile(state);
 assert.equal(profiles['005:03005'].dailySessionId,'');assert.equal(profiles['004:04004SHPEE'].dailySessionId,'four');
 assert.equal(profileRecords(state).filter(r=>r.active).length,1);assert.equal(profileIdentity(certificate('999','01999')),null);
});
