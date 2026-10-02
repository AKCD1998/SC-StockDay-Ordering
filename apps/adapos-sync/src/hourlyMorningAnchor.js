import { buildHourlyEvidencePayload } from "./hourlyStockEvidenceClient.js";
import { enqueueHourlyEvidence } from "./hourlyEvidenceStorage.js";

export function queueHourlyMorningAnchor({ config, rows, capturedAt, syncRunId, acceptedRecords }) {
  const evidence = config.hourlyStockEvidence;
  if (evidence?.enabled !== true || evidence.fullSyncAnchorEnabled !== true) {
    return { status: "skipped", reason: "feature-disabled" };
  }
  if (evidence.observationKind !== "morning_anchor" || evidence.plannedSlot !== "08:20") {
    return { status: "skipped", reason: "not-morning-task" };
  }
  if (!capturedAt || String(evidence.uploadToken || "").trim().length < 32 || !Array.isArray(evidence.productCodes)
      || evidence.productCodes.length < 1 || evidence.productCodes.length > 500
      || acceptedRecords !== rows.length) {
    throw Object.assign(new Error("Morning anchor configuration, timestamp, or Full acknowledgement is incomplete."), { code: "HOURLY_EVIDENCE_ANCHOR_INCOMPLETE" });
  }
  const cohort = new Set(evidence.productCodes);
  const selected = rows.filter((row) => cohort.has(row.product_code));
  if (selected.length !== cohort.size || cohort.size !== evidence.productCodes.length) {
    throw Object.assign(new Error("Morning anchor cohort is incomplete."), { code: "HOURLY_EVIDENCE_COHORT_INCOMPLETE" });
  }
  const { body } = buildHourlyEvidencePayload({
    branchCode: config.branchCode, observationKind: "morning_anchor",
    plannedSlot: "08:20", capturedAt, rows: selected,
    clientMeta: { agentVersion: "hourly-evidence-candidate-v1", authoritativeSyncRunId: String(syncRunId) },
  });
  enqueueHourlyEvidence({ cacheDir: evidence.cacheDir, branchCode: config.branchCode, body });
  return { status: "queued", recordCount: selected.length, capturedAt };
}
