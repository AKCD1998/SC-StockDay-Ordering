import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableRequestError, postBatchesWithRetry } from "../src/batching.js";

function errorWith(fields) {
  return Object.assign(new Error(fields.message ?? "request failed"), fields);
}

test("splits records into bounded batches and preserves extra body fields", async () => {
  const payloads = [];
  const sent = await postBatchesWithRetry({
    url: "https://example.test/stock",
    records: Array.from({ length: 250 }, (_, id) => ({ id })),
    batchSize: 100,
    extraBody: { branchCode: "000" },
    post: async (_url, payload) => payloads.push(payload),
  });

  assert.equal(sent, 250);
  assert.deepEqual(payloads.map((payload) => payload.records.length), [100, 100, 50]);
  assert.ok(payloads.every((payload) => payload.branchCode === "000"));
});

test("a production-sized 6592-row stock set becomes 66 requests with no batch over 100", async () => {
  const batchSizes = [];
  const sent = await postBatchesWithRetry({
    url: "https://example.test/stock",
    records: Array.from({ length: 6_592 }, (_, id) => ({ id })),
    batchSize: 100,
    post: async (_url, payload) => batchSizes.push(payload.records.length),
  });

  assert.equal(sent, 6_592);
  assert.equal(batchSizes.length, 66);
  assert.ok(batchSizes.every((size) => size <= 100));
  assert.equal(batchSizes.at(-1), 92);
});

test("retries timeout errors with exponential backoff and then succeeds", async () => {
  let calls = 0;
  const delays = [];
  const warnings = [];
  const payloads = [];

  const sent = await postBatchesWithRetry({
    url: "https://example.test/stock",
    records: [{ id: 1 }],
    batchSize: 100,
    maxAttempts: 3,
    retryBaseDelayMs: 1_000,
    retryMaxDelayMs: 5_000,
    random: () => 0,
    sleep: async (delay) => delays.push(delay),
    logger: { warn: (message) => warnings.push(message) },
    post: async (_url, payload) => {
      calls += 1;
      payloads.push(JSON.stringify(payload));
      if (calls < 3) throw errorWith({ code: "REQUEST_TIMEOUT", message: "timed out" });
    },
  });

  assert.equal(sent, 1);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
  assert.equal(warnings.length, 2);
  assert.equal(new Set(payloads).size, 1);
});

test("does not retry by default so non-stock callers keep their old behavior", async () => {
  let calls = 0;
  await assert.rejects(
    postBatchesWithRetry({
      url: "https://example.test/other-dataset",
      records: [{ id: 1 }],
      post: async () => {
        calls += 1;
        throw errorWith({ status: 503 });
      },
    }),
  );
  assert.equal(calls, 1);
});

for (const status of [429, 500, 503, 599]) {
  test(`retries HTTP ${status}`, async () => {
    let calls = 0;
    const sent = await postBatchesWithRetry({
      url: "https://example.test/stock",
      records: [{ id: 1 }],
      maxAttempts: 2,
      random: () => 0,
      sleep: async () => {},
      logger: { warn: () => {} },
      post: async () => {
        calls += 1;
        if (calls === 1) throw errorWith({ status });
      },
    });
    assert.equal(sent, 1);
    assert.equal(calls, 2);
  });
}

for (const status of [400, 401, 404, 422]) {
  test(`does not retry HTTP ${status}`, async () => {
    let calls = 0;
    let sleeps = 0;
    await assert.rejects(
      postBatchesWithRetry({
        url: "https://example.test/stock",
        records: [{ id: 1 }],
        maxAttempts: 3,
        sleep: async () => { sleeps += 1; },
        logger: { warn: () => {} },
        post: async () => {
          calls += 1;
          throw errorWith({ status });
        },
      }),
    );
    assert.equal(calls, 1);
    assert.equal(sleeps, 0);
  });
}

test("stops after the configured maximum attempts", async () => {
  let calls = 0;
  const delays = [];
  const failure = errorWith({ status: 503, message: "backend busy" });

  await assert.rejects(
    postBatchesWithRetry({
      url: "https://example.test/stock",
      records: [{ id: 1 }],
      maxAttempts: 3,
      random: () => 0,
      sleep: async (delay) => delays.push(delay),
      logger: { warn: () => {} },
      post: async () => {
        calls += 1;
        throw failure;
      },
    }),
    failure,
  );

  assert.equal(calls, 3);
  assert.deepEqual(delays, [1_000, 2_000]);
});

test("retry classifier is limited to timeout, 429, and 5xx", () => {
  assert.equal(isRetryableRequestError(errorWith({ code: "REQUEST_TIMEOUT" })), true);
  assert.equal(isRetryableRequestError(errorWith({ status: 429 })), true);
  assert.equal(isRetryableRequestError(errorWith({ status: 500 })), true);
  assert.equal(isRetryableRequestError(errorWith({ status: 400 })), false);
  assert.equal(isRetryableRequestError(errorWith({ code: "ECONNRESET" })), false);
});
