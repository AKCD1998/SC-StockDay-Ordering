import assert from "node:assert/strict";
import test from "node:test";

import {
  connectSqlWithRetry,
  isRetryableSqlConnectionError,
} from "../src/sqlConnection.js";

function sqlError(code, message = "connection failed") {
  return Object.assign(new Error(message), { code });
}

test("classifies only transient SQL connection failures as retryable", () => {
  for (const code of ["ETIMEOUT", "ESOCKET", "ECONNCLOSED"]) {
    assert.equal(isRetryableSqlConnectionError(sqlError(code)), true, code);
  }

  for (const code of ["ELOGIN", "EREQUEST", "CONFIG_ERROR"]) {
    assert.equal(isRetryableSqlConnectionError(sqlError(code)), false, code);
  }

  assert.equal(isRetryableSqlConnectionError({
    code: "UNKNOWN",
    originalError: sqlError("ETIMEOUT"),
  }), true);
});

test("retries transient connection failures with bounded backoff and returns the pool", async () => {
  const delays = [];
  const warnings = [];
  const pool = { close: async () => {} };
  let attempts = 0;

  const result = await connectSqlWithRetry({
    connect: async () => {
      attempts += 1;
      if (attempts < 3) throw sqlError("ETIMEOUT");
      return pool;
    },
    config: { server: "test-sql" },
    wait: async (delayMs) => delays.push(delayMs),
    logger: { warn: (message) => warnings.push(message) },
  });

  assert.equal(result, pool);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [5_000, 10_000]);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /attempt 1\/3 failed \(ETIMEOUT\)/);
  assert.doesNotMatch(warnings.join("\n"), /test-sql/);
});

test("does not retry authentication or query errors", async () => {
  for (const code of ["ELOGIN", "EREQUEST"]) {
    let attempts = 0;
    let waits = 0;

    await assert.rejects(connectSqlWithRetry({
      connect: async () => {
        attempts += 1;
        throw sqlError(code);
      },
      config: {},
      wait: async () => { waits += 1; },
      logger: { warn: () => {} },
    }), (error) => error.code === code);

    assert.equal(attempts, 1, code);
    assert.equal(waits, 0, code);
  }
});

test("stops after the bounded attempt count and preserves the final error", async () => {
  const errors = [sqlError("ETIMEOUT", "one"), sqlError("ETIMEOUT", "two")];
  let attempts = 0;

  await assert.rejects(connectSqlWithRetry({
    connect: async () => {
      const error = errors[attempts];
      attempts += 1;
      throw error;
    },
    config: {},
    maxAttempts: 2,
    wait: async () => {},
    logger: { warn: () => {} },
  }), (error) => error === errors[1]);

  assert.equal(attempts, 2);
});

test("rejects invalid retry configuration before connecting", async () => {
  let attempts = 0;
  await assert.rejects(connectSqlWithRetry({
    connect: async () => { attempts += 1; },
    config: {},
    maxAttempts: 0,
  }), /positive integer/);
  assert.equal(attempts, 0);
});
