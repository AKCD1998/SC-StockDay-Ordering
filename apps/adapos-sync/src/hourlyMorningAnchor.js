import { buildHourlyEvidencePayload } from "./hourlyStockEvidenceClient.js";
import { enqueueHourlyEvidence } from "./hourlyEvidenceStorage.js";
import { buildCohortCoverage, HOURLY_COMPLETE_COHORT_MAX_RECORDS } from "./hourlyCohortCoverage.js";
import { resolveHourlyCohortConfig } from "./hourlyCohortManifest.js";

export function isHourlyMorningAnchorRun(config) {
  const evidence = config.hourlyStockEvidence;
  return evidence?.enabled === true && evidence.fullSyncAnchorEnabled === true
    && config.skipIfSyncedToday !== true
    && evidence.observationKind === "morning_anchor" && evidence.plannedSlot === "08:20";
}

export function queueHourlyMorningAnchor({ config, rows, capturedAt, syncRunId, acceptedRecords }) {
  const originalEvidence = config.hourlyStockEvidence;
  const evidence = originalEvidence?.enabled === true && originalEvidence.fullSyncAnchorEnabled === true && isHourlyMorningAnchorRun(config)
    ? resolveHourlyCohortConfig(originalEvidence) : originalEvidence;
  if (evidence?.enabled !== true || evidence.fullSyncAnchorEnabled !== true) {
    return { status: "skipped", reason: "feature-disabled" };
  }
  if (!isHourlyMorningAnchorRun(config)) {
    return { status: "skipped", reason: "not-morning-task" };
  }
  if (!capturedAt || String(evidence.uploadToken || "").trim().length < 32 || !Array.isArray(evidence.productCodes)
      || evidence.productCodes.length < 1 || evidence.productCodes.length > (evidence.completeCohortEnabled === true ? HOURLY_COMPLETE_COHORT_MAX_RECORDS : 500)
      || acceptedRecords !== rows.length) {
    throw Object.assign(new Error("Morning anchor configuration, timestamp, or Full acknowledgement is incomplete."), { code: "HOURLY_EVIDENCE_ANCHOR_INCOMPLETE" });
  }
  const cohort = new Set(evidence.productCodes);
  const selected = rows.filter((row) => cohort.has(row.product_code));
  if ((!evidence.completeCohortEnabled && selected.length !== cohort.size) || !selected.length || cohort.size !== evidence.productCodes.length) {
    throw Object.assign(new Error("Morning anchor cohort is incomplete."), { code: "HOURLY_EVIDENCE_COHORT_INCOMPLETE" });
  }
  const present = new Set(selected.map(row => row.product_code));
  const cohortCoverage = evidence.completeCohortEnabled === true ? buildCohortCoverage({
    expectedProductCodes: evidence.productCodes, rows: selected,
    missingProductCodes: evidence.productCodes.filter(code => !present.has(code)), scope: evidence.cohortScope ?? "explicit", observationKind: "morning_anchor",
  }) : null;
  const { body } = buildHourlyEvidencePayload({
    branchCode: config.branchCode, observationKind: "morning_anchor",
    plannedSlot: "08:20", capturedAt, rows: selected,
    clientMeta: { agentVersion: "hourly-evidence-candidate-v1", authoritativeSyncRunId: String(syncRunId) },
    cohortCoverage,
  });
  enqueueHourlyEvidence({ cacheDir: evidence.cacheDir, branchCode: config.branchCode, body });
  return { status: "queued", recordCount: selected.length, capturedAt };
}
