import { createHash } from "node:crypto";
import { toTransferPayload } from "../transform.js";
import { scanTransferDocuments, transferDocumentKey } from "./transferFingerprint.js";
import {
  readTransferDeliveryState,
  TRANSFER_DELTA_CONTRACT_VERSION,
  writeTransferDeliveryStateAtomic,
} from "./transferDeliveryState.js";

export { TRANSFER_DELTA_CONTRACT_VERSION };

const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const compareText = (left, right) => String(left ?? "").localeCompare(String(right ?? ""));

function sortPayload(payload) {
  return {
    headers: [...payload.headers].sort((a, b) => compareText(a.branchCode, b.branchCode)
      || compareText(a.docType, b.docType) || compareText(a.docNo, b.docNo)),
    lines: [...payload.lines].sort((a, b) => compareText(a.branchCode, b.branchCode)
      || compareText(a.docType, b.docType) || compareText(a.docNo, b.docNo)
      || Number(a.lineNo ?? a.seqNo) - Number(b.lineNo ?? b.seqNo)
      || compareText(a.productCode, b.productCode)),
  };
}

export function transferStateHash(documents) {
  return sha256(JSON.stringify([...documents.entries()]
    .map(([key, value]) => [key, value.fingerprint])
    .sort(([left], [right]) => left.localeCompare(right))));
}

export function mergeManagedTransferDocuments(previous, current) {
  const merged = new Map(previous);
  for (const [key, value] of current) merged.set(key, { fingerprint: value.fingerprint });
  return merged;
}

export function buildTransferDeltaCandidate({
  branchCode, headerRows, lineRows, cacheDir, maxDocuments = 30,
  capabilityCheckpointToken = null, capabilityStateHash = null,
  capabilityCheckpointSequence = 0,
  deliveryState: suppliedDeliveryState = null,
}) {
  const previous = suppliedDeliveryState ?? readTransferDeliveryState(cacheDir, branchCode);
  if (previous.state !== "loaded") {
    return { mode: "fallback", reason: `baseline-${previous.reason || previous.state}` };
  }
  const localStateHash = transferStateHash(previous.documents);
  if ((previous.checkpointToken ?? null) !== (capabilityCheckpointToken ?? null)
    || previous.checkpointSequence !== capabilityCheckpointSequence
    || previous.stateHash !== localStateHash || capabilityStateHash !== localStateHash) {
    return { mode: "fallback", reason: "delivery-checkpoint-diverged" };
  }

  const current = scanTransferDocuments(headerRows ?? [], lineRows ?? []);
  const changedKeys = new Set();
  for (const [key, entry] of current) {
    if (previous.documents.get(key)?.fingerprint !== entry.fingerprint) changedKeys.add(key);
  }
  if (changedKeys.size > maxDocuments) {
    return { mode: "fallback", reason: "changed-document-limit", changedDocumentCount: changedKeys.size };
  }
  const fullPayload = toTransferPayload(headerRows ?? [], lineRows ?? [], { compositeIdentity: true });
  const selected = sortPayload({
    headers: fullPayload.headers.filter((record) => changedKeys.has(
      transferDocumentKey(record.branchCode, record.docType, record.docNo))),
    lines: fullPayload.lines.filter((record) => changedKeys.has(
      transferDocumentKey(record.branchCode, record.docType, record.docNo))),
  });
  const selectedHeaderKeys = new Set(selected.headers.map((record) =>
    transferDocumentKey(record.branchCode, record.docType, record.docNo)));
  if (selectedHeaderKeys.size !== changedKeys.size) {
    throw new Error("Transfer Delta candidate is missing a complete document header.");
  }

  // The server stores this declared managed-set hash in its checkpoint. The
  // set intentionally retains documents that leave the rolling source window.
  const nextManagedDocuments = mergeManagedTransferDocuments(previous.documents, current);
  const nextStateHash = transferStateHash(nextManagedDocuments);
  const contentHash = sha256(JSON.stringify({
    branchCode: String(branchCode), contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
    baseCheckpointToken: capabilityCheckpointToken ?? null,
    baseStateHash: localStateHash,
    nextStateHash,
    headers: selected.headers, lines: selected.lines, tombstones: [],
  }));
  const idempotencyKey = sha256(JSON.stringify([
    String(branchCode), TRANSFER_DELTA_CONTRACT_VERSION, capabilityCheckpointToken,
    localStateHash, nextStateHash, contentHash,
  ]));
  return {
    mode: "delta", changedDocumentCount: changedKeys.size,
    disappearedCount: [...previous.documents.keys()].filter((key) => !current.has(key)).length,
    nextManagedDocuments,
    payload: {
      branchCode: String(branchCode), contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
      baseCheckpointToken: capabilityCheckpointToken ?? null,
      baseStateHash: localStateHash, nextStateHash, idempotencyKey, contentHash,
      headers: selected.headers, lines: selected.lines, tombstones: [],
    },
  };
}

async function getCapability(getJson, apiBaseUrl, branchCode) {
  const query = new URLSearchParams({ branchCode: String(branchCode), contractVersion: TRANSFER_DELTA_CONTRACT_VERSION });
  return getJson(`${apiBaseUrl}/api/sync/ada/transfers/delta-capabilities?${query}`);
}

export async function deliverTransferDelta({
  apiBaseUrl, branchCode, headerRows, lineRows, cacheDir, maxDocuments, getJson, postJson,
  readDeliveryState = readTransferDeliveryState,
  writeDeliveryState = writeTransferDeliveryStateAtomic,
}) {
  let capability;
  try { capability = await getCapability(getJson, apiBaseUrl, branchCode); } catch (error) {
    return { mode: "fallback", reason: `capability-unavailable:${error.status || error.code || "error"}` };
  }
  if (capability?.enabled !== true || capability?.contractVersion !== TRANSFER_DELTA_CONTRACT_VERSION) {
    return { mode: "fallback", reason: "capability-disabled-or-unsupported" };
  }
  let candidate;
  try {
    candidate = buildTransferDeltaCandidate({
      branchCode, headerRows, lineRows, cacheDir, maxDocuments,
      capabilityCheckpointToken: capability.checkpointToken ?? null,
      capabilityCheckpointSequence: Number(capability.checkpointSequence ?? 0),
      capabilityStateHash: capability.stateHash ?? null,
      deliveryState: readDeliveryState(cacheDir, branchCode),
    });
  } catch (error) {
    return { mode: "fallback", reason: `candidate-invalid:${error.code || "error"}` };
  }
  if (candidate.mode !== "delta") return candidate;
  try {
    const acknowledgement = await postJson(`${apiBaseUrl}/api/sync/ada/transfers/delta`, candidate.payload);
    if (acknowledgement?.ok !== true
      || acknowledgement?.idempotencyKey !== candidate.payload.idempotencyKey
      || acknowledgement?.contentHash !== candidate.payload.contentHash
      || acknowledgement?.stateHash !== candidate.payload.nextStateHash
      || typeof acknowledgement?.checkpointToken !== "string"
      || acknowledgement.checkpointToken === candidate.payload.baseCheckpointToken
      || !Number.isSafeInteger(acknowledgement?.checkpointSequence)
      || acknowledgement.checkpointSequence <= Number(capability.checkpointSequence ?? 0)
      || acknowledgement?.acceptedHeaders !== candidate.payload.headers.length
      || acknowledgement?.acceptedLines !== candidate.payload.lines.length
      || acknowledgement?.acceptedTombstones !== candidate.payload.tombstones.length) {
      return { mode: "fallback", reason: "delta-acknowledgement-invalid" };
    }
    try {
      writeDeliveryState(cacheDir, branchCode, acknowledgement.checkpointToken,
        acknowledgement.checkpointSequence, acknowledgement.stateHash, candidate.nextManagedDocuments);
    } catch (error) {
      return { mode: "fallback", reason: `delivery-state-write-failed:${error.code || "error"}` };
    }
    return {
      mode: "delta", changedDocumentCount: candidate.changedDocumentCount,
      acceptedHeaders: Number(acknowledgement.acceptedHeaders || 0),
      acceptedLines: Number(acknowledgement.acceptedLines || 0),
      replayed: acknowledgement.replayed === true, checkpointToken: acknowledgement.checkpointToken,
    };
  } catch (error) {
    return { mode: "fallback", reason: `delta-request-failed:${error.status || error.code || "error"}` };
  }
}

export async function rebaselineTransferDeltaAfterFull({
  apiBaseUrl, branchCode, headerRows, lineRows, cacheDir, getJson, postJson,
  readDeliveryState = readTransferDeliveryState,
  writeDeliveryState = writeTransferDeliveryStateAtomic,
}) {
  try {
    const capability = await getCapability(getJson, apiBaseUrl, branchCode);
    if (capability?.enabled !== true || capability?.contractVersion !== TRANSFER_DELTA_CONTRACT_VERSION) {
      return { ok: false, reason: "rebaseline-capability-disabled" };
    }
    const previous = readDeliveryState(cacheDir, branchCode);
    const current = scanTransferDocuments(headerRows ?? [], lineRows ?? []);
    const managedDocuments = previous.state === "loaded"
      ? mergeManagedTransferDocuments(previous.documents, current) : current;
    const stateHash = transferStateHash(managedDocuments);
    const baseCheckpointToken = capability.checkpointToken ?? null;
    const idempotencyKey = sha256(JSON.stringify([
      String(branchCode), TRANSFER_DELTA_CONTRACT_VERSION, "rebaseline", baseCheckpointToken, stateHash,
    ]));
    const acknowledgement = await postJson(`${apiBaseUrl}/api/sync/ada/transfers/delta-rebaseline`, {
      branchCode: String(branchCode), contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
      baseCheckpointToken, stateHash, idempotencyKey,
    });
    if (acknowledgement?.ok !== true || acknowledgement?.idempotencyKey !== idempotencyKey
      || acknowledgement?.stateHash !== stateHash || typeof acknowledgement?.checkpointToken !== "string"
      || acknowledgement.checkpointToken === baseCheckpointToken
      || !Number.isSafeInteger(acknowledgement?.checkpointSequence)
      || acknowledgement.checkpointSequence <= Number(capability.checkpointSequence ?? 0)) {
      return { ok: false, reason: "rebaseline-acknowledgement-invalid" };
    }
    writeDeliveryState(cacheDir, branchCode, acknowledgement.checkpointToken,
      acknowledgement.checkpointSequence, stateHash, managedDocuments);
    return { ok: true, checkpointToken: acknowledgement.checkpointToken, replayed: acknowledgement.replayed === true };
  } catch (error) {
    return { ok: false, reason: `rebaseline-failed:${error.status || error.code || "error"}` };
  }
}
