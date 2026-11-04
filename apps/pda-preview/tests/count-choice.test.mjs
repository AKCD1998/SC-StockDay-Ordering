import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNT_CATEGORIES,FIXTURE_CATEGORY_SESSIONS,scopeForChoice,choiceForScope} from '../count-choice.mjs';
const scopes=COUNT_CATEGORIES.flatMap((category,index)=>[1,2,3].map(round=>({
  id:'10000000-0000-4000-8000-'+String(100+index*10+round).padStart(12,'0'),
  kind:'stocktake',sessionKey:FIXTURE_CATEGORY_SESSIONS[category.key],locationKey:'whole-branch',
  label:category.label,round,coverage:'whole-branch',
})));
test('all nine category/round choices resolve to distinct registered server IDs',()=>{
  const ids=new Set();for(const category of COUNT_CATEGORIES)for(const round of [1,2,3]){
    const scope=scopeForChoice(scopes,category.key,round,FIXTURE_CATEGORY_SESSIONS);assert.ok(scope);ids.add(scope.id);
    assert.deepEqual(choiceForScope(scopes,scope.id,FIXTURE_CATEGORY_SESSIONS),{category:category.key,round,scope});
  }assert.equal(ids.size,9);
});
test('missing, ambiguous or physically different scopes never fall back to round one',()=>{
  assert.equal(scopeForChoice(scopes,'pharma',1),null);
  assert.equal(scopeForChoice(scopes,'pharma',4,FIXTURE_CATEGORY_SESSIONS),null);
  assert.equal(scopeForChoice(scopes.filter(s=>s.round!==2),'pharma',2,FIXTURE_CATEGORY_SESSIONS),null);
  assert.equal(scopeForChoice([...scopes,{...scopes[0],id:'20000000-0000-4000-8000-000000000001'}],'pharma',1,FIXTURE_CATEGORY_SESSIONS),null);
  for(const changed of [{coverage:'location'},{locationKey:'floor-1'},{kind:'ad-hoc'}])assert.equal(scopeForChoice([{...scopes[0],...changed}],'pharma',1,FIXTURE_CATEGORY_SESSIONS),null);
});
test('names/order are presentation; the configured session and exact round bind the ID',()=>{
  const renamed=scopes.map(s=>({...s,label:'renamed'})).reverse();
  assert.equal(scopeForChoice(renamed,'normal',3,FIXTURE_CATEGORY_SESSIONS).id,scopes[8].id);
  assert.equal(choiceForScope(scopes,'00000000-0000-4000-8000-000000000001',FIXTURE_CATEGORY_SESSIONS),null);
});
