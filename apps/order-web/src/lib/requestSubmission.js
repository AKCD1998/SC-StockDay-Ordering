// WP-06 submit helpers. Pure functions so the review/submit flow stays testable
// without a DOM. The API body shape matches POST /api/stock-requests
// (services/stockRequests.js): { idempotencyKey, note, groups:[{ sourceBranchCode,
// lines:[{ productCode, requestedQty, unit, snapshotQty, snapshotSyncedAt }] }] }.

import { groupCartLines, normalizeRequestedQty } from "./requestCart";

export function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `srq-${crypto.randomUUID()}`;
  }
  return `srq-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

// Build the request body the backend expects from grouped (or flat) cart lines.
export function buildSubmitPayload(linesOrGroups, { idempotencyKey, note = "" } = {}) {
  if (!idempotencyKey) {
    throw new Error("idempotencyKey is required to build a submit payload.");
  }

  const groupedSource = Array.isArray(linesOrGroups) && linesOrGroups.length && linesOrGroups[0]?.lines
    ? linesOrGroups
    : groupCartLines(linesOrGroups || []);

  const groups = groupedSource
    .map((group) => ({
      sourceBranchCode: String(group.sourceBranchCode || "").trim(),
      lines: (group.lines || [])
        .map((line) => ({
          productCode: String(line.productCode || "").trim(),
          requestedQty: normalizeRequestedQty(line.requestedQty),
          unit: String(line.unit || "").trim(),
          snapshotQty: Number.isFinite(Number(line.snapshotQty)) ? Number(line.snapshotQty) : null,
          snapshotSyncedAt: line.snapshotSyncedAt || null,
          recommendation:
            line.recommendation && typeof line.recommendation === "object" && !Array.isArray(line.recommendation)
              ? line.recommendation
              : undefined,
        }))
        .filter((line) => line.productCode && line.unit && line.requestedQty > 0),
    }))
    .filter((group) => group.sourceBranchCode && group.lines.length > 0);

  return {
    idempotencyKey,
    note: String(note || "").trim(),
    groups,
  };
}

// Validate before hitting the network: every group must have a source branch and
// at least one valid line. Returns a list of human-readable Thai error strings.
export function validateSubmitPayload(payload) {
  const errors = [];

  if (!payload?.groups?.length) {
    errors.push("ยังไม่มีรายการสำหรับสร้างคำขอ");
    return errors;
  }

  payload.groups.forEach((group) => {
    if (!group.sourceBranchCode) {
      errors.push("มีกลุ่มที่ไม่มีรหัสสาขาต้นทาง");
    }
    if (!group.lines?.length) {
      errors.push(`สาขา ${group.sourceBranchCode || "?"} ไม่มีบรรทัดที่ถูกต้อง`);
    }
  });

  return errors;
}

export function countSubmitGroups(payload) {
  return payload?.groups?.length || 0;
}
