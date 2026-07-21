import assert from "node:assert/strict";
import test from "node:test";

process.env.ADAPOS_SYNC_REQUEST_TIMEOUT_MS = "5";
process.env.ADAPOS_SYNC_BRANCH_CODE = "000";
const { postJson } = await import("../src/client.js");

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
