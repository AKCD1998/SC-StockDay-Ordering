import { createHash } from "node:crypto";
import { toTransferPayload } from "../transform.js";

export const TRANSFER_FINGERPRINT_CONTRACT_VERSION = "delta-shadow-transfers-v1";

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function identityPart(value) {
  return String(value ?? "").trim();
}

export function transferDocumentKey(branchCode, docType, docNo) {
  return sha256Hex(JSON.stringify([
    identityPart(branchCode),
    identityPart(docType),
    identityPart(docNo),
  ]));
}

function canonicalRecord(record) {
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key] ?? null)}`).join(",")}}`;
}

function recordFingerprint(record) {
  return sha256Hex(canonicalRecord(record));
}

export function scanTransferDocuments(headerRows, lineRows) {
  const { headers, lines } = toTransferPayload(
    headerRows ?? [],
    lineRows ?? [],
    { compositeIdentity: true },
  );
  const headersByKey = new Map();
  const linesByKey = new Map();

  for (const header of headers) {
    const key = transferDocumentKey(header.branchCode, header.docType, header.docNo);
    if (!headersByKey.has(key)) headersByKey.set(key, []);
    headersByKey.get(key).push(header);
  }

  for (const line of lines) {
    const key = transferDocumentKey(line.branchCode, line.docType, line.docNo);
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key).push(line);
  }

  const allKeys = new Set([...headersByKey.keys(), ...linesByKey.keys()]);
  const documents = new Map();
  for (const key of allKeys) {
    const documentHeaders = headersByKey.get(key) ?? [];
    const documentLines = linesByKey.get(key) ?? [];
    const headerHashes = documentHeaders.map(recordFingerprint).sort();
    const lineHashes = documentLines.map(recordFingerprint).sort();
    documents.set(key, {
      fingerprint: sha256Hex(`${headerHashes.join(",")}||${lineHashes.join(",")}`),
      headerCount: documentHeaders.length,
      lineCount: documentLines.length,
    });
  }
  return documents;
}
