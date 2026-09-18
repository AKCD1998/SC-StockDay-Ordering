import { createHash } from "node:crypto";

export const HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION = "hourly-dual-stock-shadow-v1";
export const ACTIVE_HOURLY_STOCK_BRANCHES = new Set(["000", "001", "003", "004", "005"]);

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizedBranchCode(branchCode) {
  return String(branchCode ?? "").trim().padStart(3, "0");
}

export function isActiveHourlyStockBranch(branchCode) {
  return ACTIVE_HOURLY_STOCK_BRANCHES.has(normalizedBranchCode(branchCode));
}

export function hourlyStockProductKey(branchCode, productCode) {
  return sha256Hex(JSON.stringify([
    normalizedBranchCode(branchCode),
    String(productCode ?? "").trim(),
  ]));
}

function finiteNumber(value, fieldName, productCode, { nullable = false } = {}) {
  if (value == null && nullable) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new Error(
      `Hourly stock evidence rejected non-finite ${fieldName} for product ${String(productCode ?? "(missing)")}.`,
    );
    error.code = "INVALID_HOURLY_STOCK_VALUE";
    throw error;
  }
  return number;
}

function canonicalValues(values) {
  return JSON.stringify({
    latestEstimatedOnHand: values.latestEstimatedOnHand,
    retailOnHand: values.retailOnHand,
  });
}

// Converts the optional query projection into a separate evidence contract.
// `retailOnHand` remains FCPdtQtyRet-backed `row.qty`; FCPdtQtyNow is carried
// only as `latestEstimatedOnHand` and null is preserved rather than invented
// as zero. Duplicate product codes use the same last-write-wins behavior as
// toBranchStockRecords, while the hashed cache key never exposes productCode.
export function scanHourlyStockEvidence(rows, branchCode) {
  const normalizedBranch = normalizedBranchCode(branchCode);
  if (!ACTIVE_HOURLY_STOCK_BRANCHES.has(normalizedBranch)) {
    const error = new Error(`Hourly stock evidence excludes inactive/unknown branch ${normalizedBranch}.`);
    error.code = "HOURLY_STOCK_BRANCH_NOT_ACTIVE";
    throw error;
  }

  const documents = new Map();
  for (const row of rows ?? []) {
    const productCode = String(row?.product_code ?? "").trim();
    if (!productCode) {
      const error = new Error("Hourly stock evidence rejected a row without product_code.");
      error.code = "INVALID_HOURLY_STOCK_IDENTITY";
      throw error;
    }

    const values = {
      retailOnHand: finiteNumber(row.qty, "FCPdtQtyRet/qty", productCode),
      latestEstimatedOnHand: finiteNumber(
        row.latest_estimated_on_hand,
        "FCPdtQtyNow/latest_estimated_on_hand",
        productCode,
        { nullable: true },
      ),
    };
    const content = canonicalValues(values);
    documents.set(hourlyStockProductKey(normalizedBranch, productCode), {
      productCode,
      fingerprint: sha256Hex(content),
      content,
      values,
    });
  }
  return documents;
}

// Proposed transport contract for a future backend evidence sink. The current
// candidate deliberately does not POST it; exporting the pure builder lets the
// contract be reviewed and tested without allocating a route or migration.
export function toHourlyStockEvidencePayload({ rows, branchCode, observedAt, observationKind }) {
  const documents = scanHourlyStockEvidence(rows, branchCode);
  return {
    contractVersion: HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION,
    datasetTag: "hourly_dual_stock_evidence",
    branchCode: normalizedBranchCode(branchCode),
    observedAt,
    observationKind,
    sourceTable: "TCNMPdt",
    retailSourceField: "FCPdtQtyRet",
    estimatedSourceField: "FCPdtQtyNow",
    records: [...documents.values()].map((entry) => ({
      productCode: entry.productCode,
      retailOnHand: entry.values.retailOnHand,
      latestEstimatedOnHand: entry.values.latestEstimatedOnHand,
    })),
  };
}

function movementSign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function skippedReconciliation(reason) {
  return {
    status: "skipped",
    reason,
    eligibleProducts: 0,
    directionAgreementCount: 0,
    directionMismatchCount: 0,
    exactEstimateMatchCount: 0,
    absoluteErrorSum: 0,
    absoluteErrorMean: null,
    absoluteErrorMax: null,
    missingAnchorProducts: 0,
    missingIntradayProducts: 0,
    missingCurrentProducts: 0,
    missingEstimatedProducts: 0,
    mismatchExamples: [],
  };
}

// Pure next-08:20 evidence calculation. It intentionally emits measurements,
// not a PASS/FAIL decision: acceptable drift and direction thresholds remain
// a human/product decision after real AdaSoft observation.
export function reconcileHourlyWindowAtNextAnchor({ previousWindow, currentDocuments }) {
  if (!previousWindow?.anchor?.documents) return skippedReconciliation("no-prior-morning-anchor");
  const observations = Array.isArray(previousWindow.observations)
    ? previousWindow.observations
    : [];
  const lastIntraday = observations.at(-1);
  if (!lastIntraday?.documents) return skippedReconciliation("no-prior-intraday-observation");

  const anchorDocuments = previousWindow.anchor.documents;
  const intradayDocuments = lastIntraday.documents;
  const current = Object.fromEntries(
    [...(currentDocuments ?? new Map())].map(([key, entry]) => [key, entry.values]),
  );
  const keys = new Set([
    ...Object.keys(anchorDocuments),
    ...Object.keys(intradayDocuments),
    ...Object.keys(current),
  ]);

  const result = {
    status: "compared",
    reason: null,
    priorAnchorAt: previousWindow.anchor.observedAt ?? null,
    lastIntradayAt: lastIntraday.observedAt ?? null,
    eligibleProducts: 0,
    directionAgreementCount: 0,
    directionMismatchCount: 0,
    exactEstimateMatchCount: 0,
    absoluteErrorSum: 0,
    absoluteErrorMean: null,
    absoluteErrorMax: null,
    missingAnchorProducts: 0,
    missingIntradayProducts: 0,
    missingCurrentProducts: 0,
    missingEstimatedProducts: 0,
    mismatchExamples: [],
  };

  for (const key of keys) {
    const anchor = anchorDocuments[key];
    const intraday = intradayDocuments[key];
    const nextAnchor = current[key];
    if (!anchor) { result.missingAnchorProducts++; continue; }
    if (!intraday) { result.missingIntradayProducts++; continue; }
    if (!nextAnchor) { result.missingCurrentProducts++; continue; }
    if (anchor.latestEstimatedOnHand == null || intraday.latestEstimatedOnHand == null) {
      result.missingEstimatedProducts++;
      continue;
    }

    const estimatedMovement = intraday.latestEstimatedOnHand - anchor.latestEstimatedOnHand;
    const canonicalMovement = nextAnchor.retailOnHand - anchor.retailOnHand;
    const absoluteError = Math.abs(intraday.latestEstimatedOnHand - nextAnchor.retailOnHand);
    const directionMatches = movementSign(estimatedMovement) === movementSign(canonicalMovement);

    result.eligibleProducts++;
    result.absoluteErrorSum += absoluteError;
    result.absoluteErrorMax = result.absoluteErrorMax == null
      ? absoluteError
      : Math.max(result.absoluteErrorMax, absoluteError);
    if (absoluteError === 0) result.exactEstimateMatchCount++;
    if (directionMatches) result.directionAgreementCount++;
    else {
      result.directionMismatchCount++;
      if (result.mismatchExamples.length < 10) {
        result.mismatchExamples.push({
          productKeyPrefix: key.slice(0, 12),
          estimatedMovement,
          canonicalMovement,
          absoluteError,
        });
      }
    }
  }

  result.absoluteErrorMean = result.eligibleProducts === 0
    ? null
    : result.absoluteErrorSum / result.eligibleProducts;
  return result;
}
