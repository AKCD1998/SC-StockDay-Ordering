import test from 'node:test';
import assert from 'node:assert/strict';
import {operatorDisplayCode, FIXTURE_OPERATOR_NUMBERS} from '../operator-display.mjs';

test('explicit branch user numbers produce the requested five-digit codes',()=>{
  for(const [staffId,code] of [['1','01001'],['2','02001'],['3','03001']]) {
    assert.equal(operatorDisplayCode({branchCode:'001',staffId},FIXTURE_OPERATOR_NUMBERS),code);
  }
});

test('missing assignments, other branches and malformed identities do not invent a number',()=>{
  for(const who of [null,{branchCode:'001',staffId:'1'},{branchCode:'004',staffId:'1'},{branchCode:'001',staffId:'107'},{branchCode:'1',staffId:'1'},{branchCode:'001',staffId:1}]) {
    assert.equal(operatorDisplayCode(who),null);
    if(who?.branchCode!=='001'||who?.staffId!=='1')assert.equal(operatorDisplayCode(who,FIXTURE_OPERATOR_NUMBERS),null);
  }
  assert.equal(operatorDisplayCode({branchCode:'001',staffId:'107'},{'001':{'107':'02'}}),'02001');
  for(const number of ['00','1','100',1,null])assert.equal(operatorDisplayCode({branchCode:'001',staffId:'1'},{'001':{'1':number}}),null);
});

test('aliases use identity and explicit assignment, never names or roster order',()=>{
  const who=Object.freeze({branchCode:'001',staffId:'2',staffName:'Any renamed employee'});
  const aliases=Object.freeze({'001':Object.freeze({'3':'03','2':'02','1':'01'})});
  assert.equal(operatorDisplayCode(who,aliases),'02001');
  assert.deepEqual(who,{branchCode:'001',staffId:'2',staffName:'Any renamed employee'});
});
