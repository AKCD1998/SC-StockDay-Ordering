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
  const started = Promise.withResolvers();
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
