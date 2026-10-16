import assert from "node:assert/strict";
import test from "node:test";

process.env.ADAPOS_SYNC_REQUEST_TIMEOUT_MS = "5";
process.env.ADAPOS_SYNC_BRANCH_CODE = "000";
const { getJson, postJson } = await import("../src/client.js");

test("getJson exposes HTTP status for polling classification", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "unauthorized",
  });

  await assert.rejects(
    getJson("https://example.test/run-status"),
    (error) => error.status === 401 && error.message.includes("unauthorized"),
  );
});

test("postJson exposes HTTP status for retry classification", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => "backend busy",
  });

  await assert.rejects(
    postJson("https://example.test/stock", { records: [] }),
    (error) => error.status === 503 && error.message.includes("backend busy"),
  );
});

test("postJson marks bounded request timeouts for retry classification", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    postJson("https://example.test/stock", { records: [] }),
    (error) => error.code === "REQUEST_TIMEOUT" && error.message.includes("5ms"),
  );
});

test("Transfer Delta 400 messages classify parser and service failures without retaining response contents", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const [message, reason] of [
    ["Payload must include headers and lines arrays.", "payload-arrays-required"],
    ["Each transfer header requires docNo, docType, and branchFrm/branchCode (or AdaAcc aliases).", "header-identity-required"],
    ["Each transfer line requires docNo, docType, branchFrm/branchCode, seqNo/lineNo, and productCode (or AdaAcc aliases).", "line-fields-required"],
    ["Transfer Delta branchCode must be three digits.", "branch-format-invalid"],
    ["Transfer Delta payload requires tombstones[].", "tombstones-array-required"],
    ["Transfer Delta idempotencyKey must be SHA-256 hex.", "idempotency-format-invalid"],
    ["Transfer Delta contentHash must be SHA-256 hex.", "content-hash-format-invalid"],
    ["Transfer Delta requires SHA-256 baseStateHash and nextStateHash.", "state-hash-format-invalid"],
    ["Transfer Delta cannot mix branch codes.", "mixed-branch-codes"],
    ["Transfer Delta contains a duplicate document header.", "duplicate-document-header"],
    ["Every Transfer Delta line requires its complete document header.", "line-header-required"],
    ["Hard tombstones require branch/doc identity and explicit source-hard-delete evidence.", "tombstone-evidence-required"],
    ["A document cannot be replaced and tombstoned in one Delta request.", "replace-tombstone-conflict"],
  ]) {
    globalThis.fetch = async () => ({ ok: false, status: 400,
      text: async () => JSON.stringify({ message, code: "TRANSFER_DELTA_INVALID", checkpointToken: "PRIVATE-RESPONSE-MARKER" }) });
    await assert.rejects(postJson("https://example.test/api/sync/ada/transfers/delta", {}), (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.transferDeltaReason, reason);
      assert.doesNotMatch(`${error.stack}${JSON.stringify(error)}`, /PRIVATE-RESPONSE-MARKER/);
      assert.equal(error.message, "Transfer Delta request failed: 400");
      return true;
    });
  }
});

test("Transfer responses with unknown, spoofed, malformed or oversized bodies remain opaque", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const text of [
    JSON.stringify({ message: "PRIVATE-UNKNOWN-MARKER", code: "TRANSFER_DELTA_INVALID", idempotencyKey: "PRIVATE-KEY-MARKER" }),
    JSON.stringify({ message: "Transfer Delta cannot mix branch codes. PRIVATE-APPENDED-MARKER" }),
    JSON.stringify({ message: { secret: "PRIVATE-OBJECT-MARKER" } }),
    JSON.stringify([{ message: "Transfer Delta cannot mix branch codes." }]),
    JSON.stringify({ message: "Transfer Delta cannot mix branch codes.", padding: "PRIVATE-OVERSIZED-MARKER".repeat(300) }),
    "<html>PRIVATE-HTML-MARKER</html>", "{PRIVATE-TRUNCATED-MARKER", "null",
  ]) {
    globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => text });
    await assert.rejects(postJson("https://example.test/api/sync/ada/transfers/delta-rebaseline", {}), (error) => {
      assert.equal(error.transferDeltaReason, "unknown-validation-error");
      assert.doesNotMatch(`${error.stack}${JSON.stringify(error)}`, /PRIVATE-/);
      return true;
    });
  }
});

test("Transfer capability HTTP errors and timeouts keep status without logging response or URL secrets", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "PRIVATE-RESPONSE-MARKER" });
  await assert.rejects(getJson("https://example.test/api/sync/ada/transfers/delta-capabilities?branchCode=004"), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.transferDeltaReason, "http-error");
    assert.doesNotMatch(error.message, /PRIVATE-/);
    return true;
  });
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  });
  await assert.rejects(postJson("https://example.test/api/sync/ada/transfers/delta?private=PRIVATE-URL-MARKER", {}), (error) => {
    assert.equal(error.code, "REQUEST_TIMEOUT");
    assert.doesNotMatch(error.message, /PRIVATE-/);
    return true;
  });
});
