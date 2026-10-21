import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sql from "mssql";
import { validateHourlyCohortManifest, buildPosActiveHourlyCohortManifest } from "./hourlyCohortManifest.js";
import { selectHourlyPosActiveCohort } from "./hourlyPosEligibility.js";
import { assertHourlyCompleteCohortGuard } from "./hourlyCompleteCohortGuard.js";
import { buildSqlServerConfig } from "./sqlServerConfig.js";

const fail = () => { throw Object.assign(new Error("Hourly cohort preparation stopped; details withheld."), { code: "HOURLY_COHORT_PREPARATION_FAILED" }); };
export async function prepareHourlyCohortManifest({ config, fetchImpl = fetch, now = Date.now,
  connectSql = connectionConfig => new sql.ConnectionPool(connectionConfig).connect(),
  guard = assertHourlyCompleteCohortGuard, priorityProductCodes = [],
}) {
  const evidence = config.hourlyStockEvidence;
  if (config.branchCode !== "004" || !evidence || evidence.enabled !== false || evidence.fullSyncAnchorEnabled !== false
      || evidence.inlineAfterFullSyncEnabled !== false || !path.isAbsolute(evidence.cacheDir || "")
      || typeof evidence.uploadToken !== "string" || evidence.uploadToken.length < 32
      || config.sqlServerUser !== "readonly_pilot" || typeof guard !== "function" || !Array.isArray(priorityProductCodes)) fail();
  let stat;try { stat = fs.lstatSync(evidence.cacheDir); } catch { fail(); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
  let url;
  try { url = new URL(config.apiBaseUrl); } catch { fail(); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) fail();
  url.pathname = url.pathname.replace(/\/$/, "") + "/api/hourly-stock-evidence/cohort";url.searchParams.set("branchCode", "004");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  let manifest;
  try {
    const response = await fetchImpl(url, { redirect: "error", signal: controller.signal,
      headers: { "x-branch-code": "004", "x-hourly-evidence-token": evidence.uploadToken } });
    if (response.status !== 200 || !response.body) fail();
    const chunks = [];let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;if (length > 1024 * 1024) { controller.abort();fail(); }
      chunks.push(Buffer.from(chunk));
    }
    manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"));validateHourlyCohortManifest(manifest);
    if (manifest.scope !== "web-all") fail();
  } catch { fail(); } finally { clearTimeout(timer); }
  // Select source-active membership with the existing readonly identity. The
  // website catalog and POS states are never edited to make membership agree.
  let pool;
  try {
    const expected = new Set(manifest.productCodes), priority = new Set(priorityProductCodes);
    if (priority.size !== priorityProductCodes.length || priorityProductCodes.some(code => !expected.has(code))) fail();
    const ordered = [...priorityProductCodes, ...manifest.productCodes.filter(code => !priority.has(code))];
    await guard({ phase: "before", remainingMs: 12000 });
    pool = await connectSql({ ...buildSqlServerConfig(config), connectionTimeout: 5000, requestTimeout: 60000, pool: { max: 1, min: 0, idleTimeoutMillis: 120000 } });
    const selection = await selectHourlyPosActiveCohort(pool, ordered, { branchCode: "004", guard, now });
    manifest = buildPosActiveHourlyCohortManifest(ordered, selection);
  } catch { fail(); } finally { if (pool) try { await pool.close(); } catch {} }
  // The caller must use the existing protected evidence directory. No ACL,
  // credential, feature flag or existing manifest is changed here.
  const output = path.join(evidence.cacheDir, "approved-hourly-cohort-004-" + String(now()) + ".json");
  let handle;
  try { handle = fs.openSync(output, "wx", 0o600);fs.writeFileSync(handle, JSON.stringify(manifest));fs.fsyncSync(handle); }
  catch { fail(); } finally { if (handle != null) fs.closeSync(handle); }
  return { status: "manifest-prepared-hourly-still-off", productCount: manifest.productCodes.length, scope: manifest.scope,
    selectionBasis: manifest.sourceSelection.basis, webCatalogProducts: manifest.sourceSelection.webProductCount,
    excludedNotActiveProducts: manifest.sourceSelection.excludedNotActiveProductCodes.length,
    excludedMissingProducts: manifest.sourceSelection.excludedMissingProductCodes.length,
    manifestLocation: output, sourceMasterMetadataRead: true, stockQueriesRequested: false, syncRequested: false, configurationChanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  import("./config.js").then(({ syncConfig }) => prepareHourlyCohortManifest({ config: syncConfig }))
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error("HOURLY_COHORT_PREPARATION_FAILED: details withheld.");process.exitCode = 1; });
}
