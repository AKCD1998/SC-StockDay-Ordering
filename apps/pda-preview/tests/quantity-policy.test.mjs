import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNT_INPUT_POLICY,COUNT_INPUT_MODE,parseCountMilli,formatQuantity} from '../quantity-policy.mjs';
test('temporary whole-number input accepts zero and exact bounded integers',()=>{
 assert.equal(COUNT_INPUT_POLICY.fractionDigits,0);assert.equal(COUNT_INPUT_MODE,'numeric');
 for(const [text,value] of [['0',0],['3',3000],['100',100000],['999999999',999999999000]])assert.equal(parseCountMilli(text),value);
});
test('decimal, signed, exponential and oversized entries are rejected without rounding',()=>{
 for(const text of ['1.5','2.0','3.000','0.001','-1','+1','1e3','01','',' 1','1,000','1000000000',1.5])assert.throws(()=>parseCountMilli(text),/จำนวนเต็ม/);
});
test('stored integral precision shortens for display but historical fractions survive',()=>{
 for(const [raw,shown] of [['3.000','3'],['0.000','0'],['2.500','2.5'],['1.230','1.23'],['1.234','1.234'],['100','100']])assert.equal(formatQuantity(raw),shown);
 assert.equal(parseCountMilli(formatQuantity('3.000')),3000);
 assert.throws(()=>parseCountMilli(formatQuantity('2.500')),/จำนวนเต็ม/);
});
