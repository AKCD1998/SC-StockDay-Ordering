import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildHourlyEvidencePayload } from "../src/hourlyStockEvidenceClient.js";
import { acquireHourlyEvidenceLock, enqueueHourlyEvidence, flushHourlyEvidenceOutbox } from "../src/hourlyEvidenceStorage.js";
import { queueHourlyMorningAnchor } from "../src/hourlyMorningAnchor.js";

function fixture(t) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-hourly-storage-"));
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }));
  return { cacheDir, branchCode: "004" };
}
function capture(capturedAt = "2026-10-02T03:00:01.000Z") {
  return buildHourlyEvidencePayload({ branchCode: "004", observationKind: "intraday", plannedSlot: "10:00", capturedAt,
    rows: [{ product_code: "P1", qty: 20, latest_estimated_on_hand: 18 }],
  });
}
function ack(body) {
  const payload = JSON.parse(body);
  return { accepted: 1, branchCode: "004", capturedAt: payload.capturedAt, captureId: "9", duplicate: false };
}
test("atomic enqueue is idempotent, bounded and never evicts unsent evidence", (t) => {
  const options = fixture(t);
  enqueueHourlyEvidence({ ...options, body: capture().body, maxPending: 1 });
  enqueueHourlyEvidence({ ...options, body: capture().body, maxPending: 1 });
  assert.throws(() => enqueueHourlyEvidence({ ...options, body: capture("2026-10-02T03:00:02.000Z").body, maxPending: 1 }), (e) => e.code === "HOURLY_OUTBOX_FULL");
  const files = fs.readdirSync(path.join(options.cacheDir, "hourly-evidence-outbox", "004"));
  assert.equal(files.filter((file) => file.endsWith(".json")).length, 1);
  assert.equal(files.some((file) => file.endsWith(".tmp")), false);
});
test("wrong acknowledgement keeps pending evidence; correct retry removes only acked capture", async (t) => {
  const options = fixture(t);
  enqueueHourlyEvidence({ ...options, body: capture().body });
  const wrong = await flushHourlyEvidenceOutbox({ ...options, uploadEvidence: async ({ body }) => ({ ...ack(body), accepted: 0 }) });
  assert.equal(wrong.pending, 1);
  assert.equal(wrong.errorCode, "HOURLY_EVIDENCE_ACK_INVALID");
  const right = await flushHourlyEvidenceOutbox({ ...options, uploadEvidence: async ({ body }) => ack(body) });
  assert.equal(right.pending, 0);
  assert.equal(right.delivered, 1);
});
test("delivery lock excludes concurrent replay and stale crashed-process lock is reclaimed", async (t) => {
  const options = fixture(t);
  const moduleUrl = new URL("../src/hourlyEvidenceStorage.js", import.meta.url).href;
  const script = "import { acquireHourlyEvidenceLock } from " + JSON.stringify(moduleUrl)
    + "; acquireHourlyEvidenceLock(" + JSON.stringify(options) + ");";
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const reclaimed = acquireHourlyEvidenceLock(options);
  assert.equal(typeof reclaimed, "function");
  reclaimed();
  const release = acquireHourlyEvidenceLock({ ...options, purpose: "delivery" });
  assert.equal((await flushHourlyEvidenceOutbox({ ...options, uploadEvidence: async () => assert.fail() })).status, "busy");
  release();
});
test("morning anchor needs exact Full acknowledgement, receipt, explicit slot and real read time", (t) => {
  const options = fixture(t);
  const config = { branchCode: "004", hourlyStockEvidence: { ...options, enabled: true, fullSyncAnchorEnabled: true,
    observationKind: "morning_anchor", plannedSlot: "08:20", productCodes: ["P1"], uploadToken: "test-only".repeat(4) } };
  const args = { config, rows: [{ product_code: "P1", qty: 20, latest_estimated_on_hand: 20 }],
    capturedAt: "2026-10-02T01:21:00.000Z", acceptedRecords: 1, syncRunId: "2225" };
  assert.equal(queueHourlyMorningAnchor(args).status, "queued");
  assert.throws(() => queueHourlyMorningAnchor({ ...args, acceptedRecords: 0 }), (e) => e.code === "HOURLY_EVIDENCE_ANCHOR_INCOMPLETE");
  assert.throws(() => queueHourlyMorningAnchor({ ...args, syncRunId: null }), (e) => e.code === "HOURLY_EVIDENCE_ANCHOR_RECEIPT_REQUIRED");
  assert.throws(() => queueHourlyMorningAnchor({ ...args, capturedAt: "2026-10-02T12:20:00.000Z" }), (e) => e.code === "HOURLY_EVIDENCE_INVALID_TIME");
  assert.throws(() => queueHourlyMorningAnchor({ ...args, capturedAt: "2026-10-02T01:19:59.000Z" }), (e) => e.code === "HOURLY_EVIDENCE_INVALID_TIME");
});
