import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHourlyEvidencePayload,
  uploadHourlyEvidence,
} from "../src/hourlyStockEvidenceClient.js";

function row(productCode, retailOnHand, latestEstimatedOnHand) {
  return { product_code: productCode, qty: retailOnHand, latest_estimated_on_hand: latestEstimatedOnHand };
}

test("payload is deterministic, sorted, bounded and keeps QtyRet separate from nullable QtyNow", () => {
  const common = {
    branchCode: "005",
    observationKind: "intraday",
    plannedSlot: "19:00",
    capturedAt: "2026-09-18T12:00:05.000Z",
  };
  const first = buildHourlyEvidencePayload({ ...common, rows: [row("P2", 10, null), row("P1", 20, 18)] });
  const second = buildHourlyEvidencePayload({ ...common, rows: [row("P1", 20, 18), row("P2", 10, null)] });
  assert.equal(first.payload.idempotencyKey, second.payload.idempotencyKey);
  assert.deepEqual(first.payload.records, [
    { productCode: "P1", retailOnHand: 20, latestEstimatedOnHand: 18 },
    { productCode: "P2", retailOnHand: 10, latestEstimatedOnHand: null },
  ]);
  assert.equal("qty" in first.payload.records[0], false);
  assert.ok(Buffer.byteLength(first.body, "utf8") < 256 * 1024);
});

test("bounded retry reuses the exact request body and succeeds after a transient 503", async () => {
  const requestBodies = [];
  const waits = [];
  let calls = 0;
  const result = await uploadHourlyEvidence({
    apiBaseUrl: "https://example.test/",
    branchCode: "005",
    token: "secret",
    body: "{\"fixed\":true}",
    wait: async (delayMs) => waits.push(delayMs),
    fetchImpl: async (_url, options) => {
      calls++;
      requestBodies.push(options.body);
      if (calls === 1) return { ok: false, status: 503, text: async () => "unavailable" };
      return { ok: true, status: 200, text: async () => "{\"duplicate\":true,\"captureId\":\"7\"}" };
    },
  });
  assert.deepEqual(requestBodies, ["{\"fixed\":true}", "{\"fixed\":true}"]);
  assert.deepEqual(waits, [500]);
  assert.equal(result.attempts, 2);
  assert.equal(result.duplicate, true);
});

test("non-retryable validation response stops after one attempt", async () => {
  let calls = 0;
  await assert.rejects(uploadHourlyEvidence({
    apiBaseUrl: "https://example.test",
    branchCode: "005",
    token: "secret",
    body: "{}",
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 400, text: async () => "bad" };
    },
  }), (error) => error.status === 400);
  assert.equal(calls, 1);
});

test("payload builder rejects duplicate identities and missing canonical quantities", () => {
  const common = {
    branchCode: "005", observationKind: "intraday", plannedSlot: "09:00",
    capturedAt: "2026-09-18T02:00:01.000Z",
  };
  assert.throws(
    () => buildHourlyEvidencePayload({ ...common, rows: [row("P1", 1, 1), row("P1", 1, 1)] }),
    (error) => error.code === "HOURLY_EVIDENCE_INVALID_ROW",
  );
  assert.throws(
    () => buildHourlyEvidencePayload({ ...common, rows: [{ product_code: "P1", qty: undefined, latest_estimated_on_hand: 1 }] }),
    (error) => error.code === "HOURLY_EVIDENCE_INVALID_ROW",
  );
});
