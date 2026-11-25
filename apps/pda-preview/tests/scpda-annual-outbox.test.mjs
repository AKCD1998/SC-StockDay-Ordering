import assert from 'node:assert/strict';
import test from 'node:test';
import { AnnualOutbox, freshAnnualDraft, parseAnnualQuantity } from '../scpda-annual-outbox.mjs';

test('annual quantities use exact thousandths and distinguish empty from zero', () => {
  assert.equal(parseAnnualQuantity('0'), 0);
  assert.equal(parseAnnualQuantity('1.25'), 1250);
  assert.throws(() => parseAnnualQuantity(''));
  assert.throws(() => parseAnnualQuantity('1.0001'));
  assert.throws(() => parseAnnualQuantity('1000000'));
});

test('a lost submit response survives a restart and retries the same operation', async () => {
  const saved = new Map(), changes = [];
  const storage = { put: async (key, data) => saved.set(key, structuredClone(data)) };
  const identity = { eventId: 'fixture-event', category: 'normal', pageNo: 11 };
  const common = { key: 'fixture', storage, identity, changed: error => changes.push(error?.message) };
  let written;
  const first = new AnnualOutbox({
    ...common,
    draft: freshAnnualDraft({ revision: 0, counts: {} }),
    remote: async operation => {
      assert.deepEqual(saved.get('fixture').sending, operation);
      written = operation;
      throw Error('offline');
    },
  });
  const counts = { 3: [{ quantityMilli: 0 }, null, null, { quantityMilli: 2000, place: 'หลังร้าน' }] };
  await first.replace(counts, true);
  await first.flush();
  assert.equal(changes.at(-1), 'offline');
  assert.equal(saved.get('fixture').receipt, null);
  assert.equal(saved.get('fixture').submitRequested, true);
  await first.replace({ 3: [{ quantityMilli: 9000 }, null, null] });
  assert.deepEqual(saved.get('fixture').counts, counts);
  const restored = new AnnualOutbox({
    ...common,
    draft: saved.get('fixture'),
    remote: async operation => {
      assert.deepEqual(operation, written);
      return { ...identity, revision: 1, mutationId: operation.mutationId, state: 'submitted',
        receiptId: 'fixture-receipt', receivedAt: '2026-11-25T01:00:00Z' };
    },
  });
  await restored.flush();
  assert.equal(saved.get('fixture').receipt.receiptId, 'fixture-receipt');
  assert.equal(saved.get('fixture').sending, null);
});

test('an edit while a draft is in flight is sent at the next revision', async () => {
  const requests = [];
  let ack;
  let begin;
  const started = { promise: new Promise(resolve => { begin = resolve; }), resolve: () => begin() };
  const outbox = new AnnualOutbox({
    key: 'fixture',
    storage: { put: async () => {} },
    identity: { eventId: 'fixture-event', category: 'common', pageNo: 1 },
    draft: freshAnnualDraft({ revision: 0, counts: {} }),
    changed: () => {},
    remote: async operation => {
      requests.push(operation);
      const response = { category: operation.category, pageNo: operation.pageNo,
        revision: operation.revision + 1, mutationId: operation.mutationId, state: 'assigned' };
      if (requests.length === 1) {
        await new Promise(resolve => { ack = resolve; started.resolve(); });
      }
      return response;
    },
  });
  const counts = quantityMilli => ({ 3: [{ quantityMilli }, null, null] });
  await outbox.replace(counts(0));
  const running = outbox.flush();
  await started.promise;
  await outbox.replace(counts(1000));
  ack();
  await running;
  assert.deepEqual(requests.map(request => [request.revision, request.counts[3][0].quantityMilli]), [[0, 0], [1, 1000]]);
  assert.equal(outbox.draft.revision, 2);
  assert.equal(outbox.draft.dirty, false);
});

test('pause waits for an existing in-flight save and keeps its durable saved time', async () => {
  let started,ack;const ready=new Promise(resolve=>{started=resolve;});const savedAt='2026-11-25T10:00:00.000Z';let calls=0;
  const box=new AnnualOutbox({key:'fixture',identity:{eventId:'fixture',category:'normal',pageNo:1},draft:freshAnnualDraft({revision:0,counts:{}}),storage:{put:async()=>{}},changed:()=>{},remote:async operation=>{calls++;started();await new Promise(resolve=>{ack=resolve;});return {category:'normal',pageNo:1,mutationId:operation.mutationId,revision:1,state:'assigned',savedAt};}});
  await box.replace({3:[{quantityMilli:0},null,null]});const sending=box.flush();await ready;
  let done=false;const pause=box.flush().then(()=>{done=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);ack();await Promise.all([sending,pause]);assert.equal(calls,1);assert.equal(box.draft.savedAt,savedAt);
});


test('a rejected confirmation keeps counts editable while an uncertain response keeps its operation', async () => {
  const stored = new Map();
  const identity = { eventId: 'event', category: 'common', pageNo: 1 };
  const counts = { 3: [{ quantityMilli: 0 }, null, null] };
  const box = new AnnualOutbox({ key: 'confirmation', identity,
    storage: { put: async (key, value) => stored.set(key, structuredClone(value)) },
    draft: freshAnnualDraft({ revision: 2, counts }), changed: () => {},
    remote: async () => { throw Object.assign(Error('wrong confirmation'), { code: 'ANNUAL_CONFIRM_PASSWORD_INVALID' }); },
  });
  await box.replace(counts, true); await box.flush();
  assert.equal(box.draft.submitRequested, false); assert.equal(box.draft.sending, null);
  assert.equal(box.draft.receipt, null); assert.deepEqual(box.draft.counts, counts);
  const corrected = { 3: [{ quantityMilli: 1000 }, null, null] };
  await box.replace(corrected); assert.deepEqual(stored.get('confirmation').counts, corrected);
  box.remote = async () => { throw Error('lost response'); };
  await box.replace(corrected, true); await box.flush();
  assert.equal(box.draft.submitRequested, true); assert.equal(box.draft.sending.submit, true);
});

test('an amendment stays local until review and replays one immutable reviewed operation', async () => {
  const stored = new Map(), requests = [];
  const common = { key:'amendment', identity:{eventId:'event',category:'normal',pageNo:1},
    storage:{put:async(key,value)=>stored.set(key,structuredClone(value))},changed:()=>{} };
  const counts = {3:[{quantityMilli:0},null,null]};
  const first = new AnnualOutbox({...common,draft:{...freshAnnualDraft({revision:4,counts}),review:{baseRevision:7,baseReceiptId:'previous',previewToken:'reviewed-exact-counts'}},remote:async op=>{requests.push(op);throw Error('lost reply');}});
  first.amendment=true;
  await first.replace(counts);await first.flush();assert.equal(requests.length,0);
  await first.replace(counts,true);await first.flush();
  assert.equal(requests.length,1);assert.equal(requests[0].revision,7);assert.equal(requests[0].baseRevision,7);
  const restored = new AnnualOutbox({...common,draft:stored.get('amendment'),remote:async op=>{
    assert.deepEqual(op,requests[0]);return {...common.identity,revision:8,mutationId:op.mutationId,state:'submitted',receiptId:'receipt',receivedAt:'2026-11-25T12:00:00Z'};
  }});restored.amendment=true;
  await restored.flush();assert.equal(restored.draft.receipt.receiptId,'receipt');
  assert.equal(JSON.stringify(stored.get('amendment')).includes('confirmationPassword'),false);
});
