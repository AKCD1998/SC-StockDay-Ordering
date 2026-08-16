// ── Delta Sync Slice 1 — sales headers/lines canonical document fingerprint ──
//
// SHADOW-ONLY. This module never talks to the network and never mutates the
// rows it is given. It reuses toSalesDetailPayload (the exact same
// normalization Full Sync already applies before POSTing) so "what we detect
// a change in" is provably the same shape as "what Full Sync would send" —
// no separate/duplicated business-field list to drift out of sync.
//
// A document's identity is (branchCode, docNo). Its fingerprint covers:
//   - every business field on the header, after ONLY the null/empty
//     normalization toSalesDetailPayload's own `|| null` fields already
//     apply — nothing added on top;
//   - every business field on every line belonging to that docNo, combined
//     as an order-independent MULTISET (sorted hashes) so a reordered-but-
//     unchanged line list produces the same fingerprint, while duplicate
//     line keys are preserved (not deduped) so a duplicate-key content
//     change is still detected;
//   - duplicate header rows sharing the same (branchCode, docNo) are
//     likewise combined as a multiset, never collapsed to one.
//
// Explicitly EXCLUDED: toSalesDetailPayload's `sourceSyncedAt` field, which
// is wall-clock (`new Date().toISOString()`, fresh every run). Including it
// would make every document look "changed" on every single run, making
// Delta detection worthless.
//
// Nothing here treats "absent next scan" as deletion — that judgment belongs
// to the caller (salesShadow.js), which only ever reports a disappeared-key
// COUNT, never a tombstone.
//
// Lesson carried forward from the frozen candidate's own remediation history
// (parent 26c6800..., three Codex-caught rounds): v1 of that candidate added
// its own trim()/toFixed(6) normalization on top of toSalesDetailPayload's
// output, which silently masked real whitespace and fine-decimal
// differences that Full Sync would actually send as different bytes. This
// rebuild does NOT repeat that mistake — see normalizeValue below.
//
// v2 (2026-08-14, Codex cache-identity remediation): v1 of THIS rebuild
// (this file's own prototype version — never deployed, never sealed, never
// committed) used documentKey() = `${branchCode}::${docNo}` — a plaintext,
// string-concatenated identity that (a) persisted the real business
// document number to the on-disk shadow cache with no reason to, and (b) had
// a real, reproduced delimiter-collision bug: documentKey("A::B","C") and
// documentKey("A","B::C") both produced the identical string "A::B::C".
// Fixed: documentKey() now returns SHA-256 of the CANONICAL TUPLE
// `JSON.stringify([branchCode, docNo])` (never string concatenation — each
// array element is independently JSON-escaped, so no delimiter can ever
// cause two distinct (branch, doc) pairs to collide), and the result is a
// one-way hash, so no plaintext document number is ever written to the
// cache file. Bumped to discard/rebuild any v1 cache rather than comparing
// incompatible key shapes; v1 of this contract was never deployed to any
// branch PC, so this bump has zero real-world compatibility cost.

import { createHash } from "node:crypto";
import { toSalesDetailPayload } from "../transform.js";

export const FINGERPRINT_CONTRACT_VERSION = "delta-shadow-sales-v2";

// ── normalization ────────────────────────────────────────────────────────────

// toSalesDetailPayload already normalizes "" -> null for every field that
// uses `|| null` (matching the bytes Full Sync literally sends: an empty
// source string is never POSTed as ""). This layer adds NOTHING on top of
// that — no trimming, no rounding. The only thing handled here is
// `undefined` -> `null`, purely so canonicalStringify never produces a JSON
// `undefined` token; toSalesDetailPayload always sets every key explicitly,
// so this is a defensive no-op in practice today.
function normalizeValue(value) {
  return value === undefined ? null : value;
}

function normalizeRecord(record) {
  const out = {};
  for (const key of Object.keys(record)) {
    if (key === "sourceSyncedAt") continue; // batch-level field, not per-record; excluded at the payload level below anyway
    out[key] = normalizeValue(record[key]);
  }
  return out;
}

// Deterministic JSON: sort object keys so field insertion order never
// affects the hash. Values are already normalized primitives (no nested
// objects in header/line records), so a shallow key sort is sufficient.
function canonicalStringify(record) {
  const keys = Object.keys(record).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(record[k])}`);
  return `{${parts.join(",")}}`;
}

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function recordFingerprint(record) {
  return sha256Hex(canonicalStringify(normalizeRecord(record)));
}

function normalizeIdentityComponent(value) {
  return String(value ?? "").trim();
}

// One-way, collision-safe document identity. Uses a canonical TUPLE
// (JSON array), never string concatenation with a delimiter — this is what
// makes documentKey("A::B", "C") and documentKey("A", "B::C") produce
// different hashes instead of colliding (reproduced as a real bug before
// this fix; see the v2 note above). SHA-256 is a stable, deterministic,
// one-way function of its input: the same (branchCode, docNo) pair always
// produces the same key within and across runs, and the key itself cannot
// be reversed back into the plaintext branch code or document number.
export function documentKey(branchCode, docNo) {
  const tuple = [normalizeIdentityComponent(branchCode), normalizeIdentityComponent(docNo)];
  return sha256Hex(JSON.stringify(tuple));
}

// ── document-level scan ────────────────────────────────────────────────────

// Returns a Map<documentKey, { fingerprint, headerCount, lineCount }>.
// headerRows/lineRows are the raw AdaPOS rows exactly as returned by
// getSalesDetailHeaderRows/getSalesDetailLineRows — the same rows Full Sync
// already fetched for this run. No additional SQL is issued here.
export function scanSalesDocuments(headerRows, lineRows) {
  // sourceSyncedAt is wall-clock and must never enter a fingerprint — strip
  // it at the payload level (belt-and-suspenders alongside the per-record
  // skip above, since it lives at the top of the payload, not per-record).
  const { headers, lines } = toSalesDetailPayload(headerRows ?? [], lineRows ?? []);

  const headersByKey = new Map();
  for (const h of headers) {
    const key = documentKey(h.branchCode, h.docNo);
    if (!headersByKey.has(key)) headersByKey.set(key, []);
    headersByKey.get(key).push(h);
  }

  const linesByDocNo = new Map();
  for (const l of lines) {
    const key = documentKey(l.branchCode, l.docNo);
    if (!linesByDocNo.has(key)) linesByDocNo.set(key, []);
    linesByDocNo.get(key).push(l);
  }

  const allKeys = new Set([...headersByKey.keys(), ...linesByDocNo.keys()]);
  const result = new Map();

  for (const key of allKeys) {
    const headerRowsForKey = headersByKey.get(key) ?? [];
    const lineRowsForKey = linesByDocNo.get(key) ?? [];

    // Multiset of hashes: sorted, duplicates kept. Reordering the source
    // rows never changes this; an actual duplicate-vs-single occurrence
    // does.
    const headerHashes = headerRowsForKey.map(recordFingerprint).sort();
    const lineHashes = lineRowsForKey.map(recordFingerprint).sort();

    const fingerprint = sha256Hex(`${headerHashes.join(",")}||${lineHashes.join(",")}`);

    result.set(key, {
      fingerprint,
      headerCount: headerRowsForKey.length,
      lineCount: lineRowsForKey.length,
    });
  }

  return result;
}
