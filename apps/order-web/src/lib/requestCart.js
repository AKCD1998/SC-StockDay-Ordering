export const CART_STORAGE_KEY = "sc-stockday-request-cart-v1";

export function formatBranchLabel(branchCode, branchName = "") {
  if (!branchCode) return branchName || "-";
  return branchName ? `${branchCode} - ${branchName}` : `สาขา ${branchCode}`;
}

export function buildLineKey({ productCode, sourceBranchCode, unit }) {
  return [productCode, sourceBranchCode, unit || ""].join("::");
}

export function normalizeRequestedQty(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(numericValue));
}

export function sanitizeCartLine(line) {
  const recommendation =
    line.recommendation && typeof line.recommendation === "object" && !Array.isArray(line.recommendation)
      ? {
          ...line.recommendation,
          recommendationFlags: Array.isArray(line.recommendation.recommendationFlags)
            ? line.recommendation.recommendationFlags
            : [],
          donorSnapshot: Array.isArray(line.recommendation.donorSnapshot)
            ? line.recommendation.donorSnapshot
            : [],
          recommendationSnapshot:
            line.recommendation.recommendationSnapshot &&
            typeof line.recommendation.recommendationSnapshot === "object" &&
            !Array.isArray(line.recommendation.recommendationSnapshot)
              ? line.recommendation.recommendationSnapshot
              : {},
        }
      : null;

  const nextLine = {
    productCode: String(line.productCode || "").trim(),
    productNameThai: String(line.productNameThai || "").trim(),
    productNameEng: String(line.productNameEng || "").trim(),
    barcode: String(line.barcode || "").trim(),
    unit: String(line.unit || "").trim(),
    sourceBranchCode: String(line.sourceBranchCode || "").trim(),
    sourceBranchName: String(line.sourceBranchName || "").trim(),
    requestedQty: normalizeRequestedQty(line.requestedQty),
    snapshotQty: Number(line.snapshotQty || 0),
    snapshotSyncedAt: line.snapshotSyncedAt || null,
    lineNote: String(line.lineNote || "").trim(),
    recommendation,
  };

  nextLine.lineKey = buildLineKey(nextLine);
  return nextLine;
}

export function mergeCartLines(currentLines = [], addedLines = []) {
  const merged = new Map();

  currentLines.map(sanitizeCartLine).forEach((line) => {
    merged.set(line.lineKey, line);
  });

  addedLines.map(sanitizeCartLine).forEach((line) => {
    const existing = merged.get(line.lineKey);
    if (existing) {
      merged.set(line.lineKey, {
        ...existing,
        requestedQty: existing.requestedQty + line.requestedQty,
        snapshotQty: Math.max(existing.snapshotQty || 0, line.snapshotQty || 0),
        snapshotSyncedAt: line.snapshotSyncedAt || existing.snapshotSyncedAt,
        lineNote: existing.lineNote || line.lineNote,
        recommendation: line.recommendation || existing.recommendation || null,
      });
      return;
    }

    merged.set(line.lineKey, line);
  });

  return Array.from(merged.values()).sort((left, right) =>
    `${left.sourceBranchCode}-${left.productCode}`.localeCompare(
      `${right.sourceBranchCode}-${right.productCode}`,
      "th",
      { numeric: true, sensitivity: "base" },
    ),
  );
}

export function updateCartLine(lines = [], lineKey, patch) {
  return lines
    .map((line) => {
      if (line.lineKey !== lineKey) return sanitizeCartLine(line);
      return sanitizeCartLine({ ...line, ...patch });
    })
    .filter((line) => line.requestedQty > 0);
}

export function countCartUnits(lines = []) {
  return lines.reduce((sum, line) => sum + normalizeRequestedQty(line.requestedQty), 0);
}

export function groupCartLines(lines = []) {
  const groups = new Map();

  lines.map(sanitizeCartLine).forEach((line) => {
    if (!groups.has(line.sourceBranchCode)) {
      groups.set(line.sourceBranchCode, {
        sourceBranchCode: line.sourceBranchCode,
        sourceBranchName: line.sourceBranchName,
        totalUnits: 0,
        lines: [],
      });
    }

    const group = groups.get(line.sourceBranchCode);
    group.lines.push(line);
    group.totalUnits += line.requestedQty;
  });

  return Array.from(groups.values()).sort((left, right) =>
    left.sourceBranchCode.localeCompare(right.sourceBranchCode, "th", {
      numeric: true,
      sensitivity: "base",
    }),
  );
}
