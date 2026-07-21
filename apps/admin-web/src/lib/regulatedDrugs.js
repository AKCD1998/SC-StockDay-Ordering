import { REGULATED_DRUG_CATALOG } from "../data/regulatedDrugCatalog.js";

export function normalizeProductCode(code) {
  return code == null ? "" : String(code).trim().toUpperCase();
}

const catalogByCode = new Map(
  REGULATED_DRUG_CATALOG.map(([code, reportGroups]) => [
    normalizeProductCode(code),
    [...new Set(reportGroups)].filter((group) => group === "KY10" || group === "KY11").sort(),
  ]),
);

export function getRegulatedDrugClassification(productCode) {
  const normalizedCode = normalizeProductCode(productCode);
  const reportGroups = catalogByCode.get(normalizedCode) || [];
  return {
    productCode: normalizedCode,
    reportGroups,
    isRegulated: reportGroups.length > 0,
  };
}

export function summarizeRegulatedDrugLines(lines) {
  const matchedLines = (Array.isArray(lines) ? lines : [])
    .map((line) => ({ line, ...getRegulatedDrugClassification(line?.productCode) }))
    .filter((entry) => entry.isRegulated);
  return {
    count: matchedLines.length,
    reportGroups: [...new Set(matchedLines.flatMap((entry) => entry.reportGroups))].sort(),
  };
}

export function summarizeRegulatedDrugBatch(batch) {
  return summarizeRegulatedDrugLines(
    (batch?.requests || []).flatMap((request) => request?.lines || []),
  );
}
