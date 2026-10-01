import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildTransferDeltaCandidate,
  deliverTransferDelta,
  rebaselineTransferDeltaAfterFull,
  transferStateHash,
  TRANSFER_DELTA_CONTRACT_VERSION,
} from "../src/delta/transferDeltaDelivery.js";
import {
  readTransferDeliveryState,
  writeTransferDeliveryStateAtomic,
} from "../src/delta/transferDeliveryState.js";
import { scanTransferDocuments, transferDocumentKey } from "../src/delta/transferFingerprint.js";

const header = (docNo, overrides = {}) => ({
  FTBchCode: "004", FTPthDocNo: docNo, FTPthDocType: "4", FDPthDocDate: "2026-09-23",
  FTPthBchFrm: "004", FTPthBchTo: "005", FTPthStaDoc: "1", FCPthGrand: 10, ...overrides,
});
const line = (docNo, seqNo, productCode, overrides = {}) => ({
  FTBchCode: "004", FTPthDocNo: docNo, FTPthDocType: "4", FNPtdSeqNo: seqNo,
  FTPdtCode: productCode, FCPtdQty: 1, FCPtdQtyAll: 1, FTPthBchFrm: "004",
  FTPthBchTo: "005", FDPthDocDate: "2026-09-23", ...overrides,
});

function withCache(fn) {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "transfer-delta-delivery-"));
  return Promise.resolve(fn(cacheDir)).finally(() => rmSync(cacheDir, { recursive: true, force: true }));
}

function seed(cacheDir, headers, lines, checkpointToken = "cp1", checkpointSequence = 1) {
  const documents = scanTransferDocuments(headers, lines);
  const stateHash = transferStateHash(documents);
  writeTransferDeliveryStateAtomic(cacheDir, "004", checkpointToken, checkpointSequence, stateHash, documents);
  return { documents, stateHash, checkpointToken, checkpointSequence };
}

test("missing accepted delivery baseline falls back", () => withCache((cacheDir) => {
  const result = buildTransferDeltaCandidate({
    branchCode: "004", headerRows: [header("T1")], lineRows: [line("T1", 1, "P1")], cacheDir,
  });
  assert.equal(result.mode, "fallback");
  assert.match(result.reason, /baseline-no-delivery-state/);
}));

test("candidate omits unchanged docs and sends the changed document's full current line set", () => withCache((cacheDir) => {
  const headers = [header("T1"), header("T2")];
  const lines = [line("T1", 1, "P1"), line("T1", 2, "P2"), line("T2", 1, "P3")];
  const baseline = seed(cacheDir, headers, lines);
  const result = buildTransferDeltaCandidate({
    branchCode: "004",
    headerRows: [header("T1", { FCPthGrand: 20 }), header("T2")],
    lineRows: [line("T1", 1, "P1", { FCPtdQty: 2 }), line("T1", 2, "P2"), line("T2", 1, "P3")],
    cacheDir, capabilityCheckpointToken: "cp1", capabilityCheckpointSequence: 1,
    capabilityStateHash: baseline.stateHash,
  });
  assert.equal(result.mode, "delta");
  assert.equal(result.changedDocumentCount, 1);
  assert.deepEqual(result.payload.headers.map((row) => row.docNo), ["T1"]);
  assert.deepEqual(result.payload.lines.map((row) => [row.docNo, row.productCode]), [["T1", "P1"], ["T1", "P2"]]);
  assert.deepEqual(result.payload.tombstones, []);
}));

test("disappeared document stays in managed state across noop and later change", () => withCache((cacheDir) => {
  const baseline = seed(
    cacheDir,
    [header("T1"), header("T2")],
    [line("T1", 1, "P1"), line("T2", 1, "P2")],
  );
  const noop = buildTransferDeltaCandidate({
    branchCode: "004", headerRows: [header("T1")], lineRows: [line("T1", 1, "P1")], cacheDir,
    capabilityCheckpointToken: baseline.checkpointToken,
    capabilityCheckpointSequence: baseline.checkpointSequence,
    capabilityStateHash: baseline.stateHash,
  });
  assert.equal(noop.mode, "delta");
  assert.equal(noop.changedDocumentCount, 0);
  assert.equal(noop.disappearedCount, 1);
  assert.equal(noop.nextManagedDocuments.has(transferDocumentKey("004", "4", "T2")), true);
  assert.deepEqual(noop.payload.tombstones, []);

  writeTransferDeliveryStateAtomic(cacheDir, "004", "cp2", 2,
    noop.payload.nextStateHash, noop.nextManagedDocuments);
  const changed = buildTransferDeltaCandidate({
    branchCode: "004", headerRows: [header("T1", { FCPthGrand: 30 })],
    lineRows: [line("T1", 1, "P1", { FCPtdQty: 3 })], cacheDir,
    capabilityCheckpointToken: "cp2", capabilityCheckpointSequence: 2,
    capabilityStateHash: noop.payload.nextStateHash,
  });
  assert.equal(changed.mode, "delta");
  assert.equal(changed.nextManagedDocuments.has(transferDocumentKey("004", "4", "T2")), true);
  assert.deepEqual(changed.payload.tombstones, []);
}));

test("stale token or state hash cannot apply Delta", () => withCache((cacheDir) => {
  const baseline = seed(cacheDir, [header("T1")], [line("T1", 1, "P1")]);
  for (const capability of [
    { token: "stale", hash: baseline.stateHash },
    { token: "cp1", hash: "0".repeat(64) },
  ]) {
    const result = buildTransferDeltaCandidate({
      branchCode: "004", headerRows: [header("T1")], lineRows: [line("T1", 1, "P1")], cacheDir,
      capabilityCheckpointToken: capability.token, capabilityCheckpointSequence: 1,
      capabilityStateHash: capability.hash,
    });
    assert.equal(result.mode, "fallback");
    assert.equal(result.reason, "delivery-checkpoint-diverged");
  }
}));

test("same no-change state after rebaseline uses a new checkpoint-bound idempotency key", () => withCache((cacheDir) => {
  const headers = [header("T1")];
  const lines = [line("T1", 1, "P1")];
  const firstState = seed(cacheDir, headers, lines, "cp1", 1);
  const first = buildTransferDeltaCandidate({ branchCode:"004",headerRows:headers,lineRows:lines,cacheDir,
    capabilityCheckpointToken:"cp1",capabilityCheckpointSequence:1,capabilityStateHash:firstState.stateHash });
  writeTransferDeliveryStateAtomic(cacheDir, "004", "cp3", 3,
    firstState.stateHash, firstState.documents);
  const afterRebaseline = buildTransferDeltaCandidate({ branchCode:"004",headerRows:headers,lineRows:lines,cacheDir,
    capabilityCheckpointToken:"cp3",capabilityCheckpointSequence:3,capabilityStateHash:firstState.stateHash });
  assert.notEqual(first.payload.idempotencyKey, afterRebaseline.payload.idempotencyKey);
}));

test("server ack followed by local-state crash chooses Full fallback", () => withCache(async (cacheDir) => {
  const baseline = seed(cacheDir, [header("T1")], [line("T1", 1, "P1")]);
  const result = await deliverTransferDelta({
    apiBaseUrl: "https://api.test", branchCode: "004", cacheDir,
    headerRows: [header("T1", { FCPthGrand: 11 })], lineRows: [line("T1", 1, "P1")],
    getJson: async () => ({ enabled: true, contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
      checkpointToken: "cp1", checkpointSequence: 1, stateHash: baseline.stateHash }),
    postJson: async (_url, payload) => ({
      ok: true, idempotencyKey: payload.idempotencyKey, contentHash: payload.contentHash,
      stateHash: payload.nextStateHash, checkpointToken: "cp2", checkpointSequence: 2,
      acceptedHeaders: 1, acceptedLines: 1, acceptedTombstones: 0,
    }),
    writeDeliveryState: () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); },
  });
  assert.equal(result.mode, "fallback");
  assert.equal(result.reason, "delivery-state-write-failed:ENOSPC");
  assert.equal(readTransferDeliveryState(cacheDir, "004").checkpointToken, "cp1");
}));

test("non-exact Delta acknowledgement cannot advance local delivery state", () => withCache(async (cacheDir) => {
  const baseline = seed(cacheDir, [header("T1")], [line("T1", 1, "P1")]);
  const result = await deliverTransferDelta({
    apiBaseUrl: "https://api.test", branchCode: "004", cacheDir,
    headerRows: [header("T1", { FCPthGrand: 12 })], lineRows: [line("T1", 1, "P1")],
    getJson: async () => ({ enabled: true, contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
      checkpointToken: "cp1", checkpointSequence: 1, stateHash: baseline.stateHash }),
    postJson: async (_url, payload) => ({
      ok: true, idempotencyKey: payload.idempotencyKey, contentHash: payload.contentHash,
      stateHash: payload.nextStateHash, checkpointToken: "cp2", checkpointSequence: 2,
      acceptedHeaders: 1, acceptedLines: 0, acceptedTombstones: 0,
    }),
  });
  assert.equal(result.mode, "fallback");
  assert.equal(result.reason, "delta-acknowledgement-invalid");
  assert.equal(readTransferDeliveryState(cacheDir, "004").checkpointToken, "cp1");
}));

test("lost Delta acknowledgement can rebaseline after Full using newly negotiated token", () => withCache(async (cacheDir) => {
  seed(cacheDir, [header("T1"), header("T2")], [line("T1", 1, "P1"), line("T2", 1, "P2")]);
  const currentHeaders = [header("T1", { FCPthGrand: 15 })]; // T2 left rolling window, not deleted.
  const currentLines = [line("T1", 1, "P1", { FCPtdQty: 2 })];
  let posted;
  const result = await rebaselineTransferDeltaAfterFull({
    apiBaseUrl: "https://api.test", branchCode: "004", cacheDir,
    headerRows: currentHeaders, lineRows: currentLines,
    getJson: async () => ({ enabled: true, contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
      checkpointToken: "server-cp-after-lost-ack", checkpointSequence: 2, stateHash: "server-old-hash" }),
    postJson: async (_url, payload) => {
      posted = payload;
      return { ok: true, idempotencyKey: payload.idempotencyKey, stateHash: payload.stateHash,
        checkpointToken: "rebaseline-cp", checkpointSequence: 3, replayed: false };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(posted.baseCheckpointToken, "server-cp-after-lost-ack");
  const state = readTransferDeliveryState(cacheDir, "004");
  assert.equal(state.checkpointToken, "rebaseline-cp");
  assert.equal(state.documents.has(transferDocumentKey("004", "4", "T2")), true);
}));

test("capability absence and apply failure both choose Full fallback", () => withCache(async (cacheDir) => {
  const baseline = seed(cacheDir, [header("T1")], [line("T1", 1, "P1")]);
  const common = {
    apiBaseUrl: "https://api.test", branchCode: "004", cacheDir,
    headerRows: [header("T1", { FCPthGrand: 11 })], lineRows: [line("T1", 1, "P1")],
    postJson: async () => { throw Object.assign(new Error("unavailable"), { status: 503 }); },
  };
  const absent = await deliverTransferDelta({ ...common,
    getJson: async () => { throw Object.assign(new Error("missing"), { status: 404 }); } });
  assert.match(absent.reason, /capability-unavailable:404/);
  const failed = await deliverTransferDelta({ ...common,
    getJson: async () => ({ enabled: true, contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
      checkpointToken: "cp1", checkpointSequence: 1, stateHash: baseline.stateHash }) });
  assert.match(failed.reason, /delta-request-failed:503/);
}));
