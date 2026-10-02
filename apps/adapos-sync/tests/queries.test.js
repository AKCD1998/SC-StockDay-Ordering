import assert from "node:assert/strict";
import test from "node:test";

import {
  getBranchStockRows,
  getSalesDetailHeaderRows,
  getSalesDetailLineRows,
  getTransferLineRows,
} from "../src/queries.js";

// Minimal fake mssql pool that records the SQL text (and bound inputs) of every
// query, so we can assert the sales-detail queries sync return documents too.
function fakePool() {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = {};
      const req = {
        input(name, _type, value) {
          inputs[name] = value;
          return req;
        },
        // eslint-disable-next-line require-await
        async query(sql) {
          calls.push({ sql, inputs });
          return { recordset: [] };
        },
      };
      return req;
    },
  };
}

test("sales-detail header query syncs both sale (1) and return (9) documents", async () => {
  const pool = fakePool();
  await getSalesDetailHeaderRows(pool, "005", { fromDate: "2026-07-01", toDate: "2026-07-22" });
  const { sql, inputs } = pool.calls[0];
  assert.match(sql, /FTShdDocType\s+IN\s+\('1',\s*'9'\)/);
  assert.doesNotMatch(sql, /FTShdDocType\s*=\s*'1'/); // old single-type filter is gone
  assert.match(sql, /FTShdStaPaid\s*=\s*'3'/);
  // Bill-level gross/discount are selected for report reproduction.
  assert.match(sql, /FCShdTotal/);
  assert.match(sql, /FCShdDis/);
  assert.match(sql, /FTShdStaDoc/);
  assert.equal(inputs.branchCode, "005");
});

test("sales-detail line query syncs both sale (1) and return (9) lines", async () => {
  const pool = fakePool();
  await getSalesDetailLineRows(pool, "005", { fromDate: "2026-07-01", toDate: "2026-07-22" });
  const { sql } = pool.calls[0];
  assert.match(sql, /FTShdDocType\s+IN\s+\('1',\s*'9'\)/);
  assert.doesNotMatch(sql, /FTShdDocType\s*=\s*'1'/);
  assert.match(sql, /FCSdtDisAvg/);
  assert.match(sql, /FCSdtFootAvg/);
  assert.match(sql, /FCSdtRePackAvg/);
});

test("transfer line query defaults to the legacy field list", async () => {
  const defaultPool = fakePool();
  const explicitOffPool = fakePool();
  await getTransferLineRows(defaultPool, "005", 30);
  await getTransferLineRows(explicitOffPool, "005", 30, false);
  const { sql, inputs } = defaultPool.calls[0];
  assert.equal(sql, explicitOffPool.calls[0].sql);
  const selectColumns = sql
    .match(/SELECT\s+([\s\S]+?)\s+FROM/)[1]
    .split(",")
    .map((field) => field.trim());
  assert.deepEqual(selectColumns, [
    "FTBchCode", "FTPthDocNo", "FNPtdSeqNo", "FTPdtCode", "FTPunCode",
    "FTPtdUnitName", "FCPtdFactor", "FCPtdQty", "FCPtdQtyAll", "FCPtdCost",
    "FCPtdCostIn", "FCPtdNet", "FCPtdVat", "FTPthBchFrm", "FTPthBchTo",
    "FTPthWhFrm", "FTPthWhTo", "FDPthDocDate",
  ]);
  assert.doesNotMatch(sql, /FTPthDocType/);
  assert.equal(inputs.branchCode, "005");
});

test("transfer line query includes document type when composite identity is enabled", async () => {
  const pool = fakePool();
  await getTransferLineRows(pool, "005", 30, true);
  const { sql, inputs } = pool.calls[0];
  assert.match(sql, /FTBchCode/);
  assert.match(sql, /FTPthDocNo/);
  assert.match(sql, /FTPthDocType/);
  assert.equal(inputs.branchCode, "005");
});

test("branch-stock query defaults to the exact legacy projection without FCPdtQtyNow", async () => {
  const defaultPool = fakePool();
  const explicitOffPool = fakePool();
  await getBranchStockRows(defaultPool, "005");
  await getBranchStockRows(explicitOffPool, "005", false);
  const { sql, inputs } = defaultPool.calls[0];
  assert.equal(sql, explicitOffPool.calls[0].sql);
  assert.match(sql, /COALESCE\(p\.FCPdtQtyRet, 0\) AS qty/);
  assert.doesNotMatch(sql, /FCPdtQtyNow/);
  assert.doesNotMatch(sql, /latest_estimated_on_hand/);
  assert.equal(inputs.branchCode, "005");
});

test("branch-stock evidence query adds FCPdtQtyNow under a separate nullable alias", async () => {
  const pool = fakePool();
  await getBranchStockRows(pool, "005", true);
  const { sql } = pool.calls[0];
  assert.match(sql, /COALESCE\(p\.FCPdtQtyRet, 0\) AS qty/);
  assert.match(sql, /p\.FCPdtQtyNow AS latest_estimated_on_hand/);
  assert.doesNotMatch(sql, /COALESCE\(p\.FCPdtQtyNow/);
});

test("hourly stock runner query selects only identity and the two stock values", async () => {
  const { getHourlyStockEvidenceRows } = await import("../src/queries.js");
  const pool = fakePool();
  await getHourlyStockEvidenceRows(pool, ["IC-003550", "IC-001096"]);
  const { sql, inputs } = pool.calls[0];
  assert.deepEqual(inputs, { productCode0: "IC-003550", productCode1: "IC-001096" });
  assert.match(sql, /p\.FTPdtCode AS product_code/);
  assert.match(sql, /COALESCE\(p\.FCPdtQtyRet, 0\) AS qty/);
  assert.match(sql, /p\.FCPdtQtyNow AS latest_estimated_on_hand/);
  assert.match(sql, /p\.FTPdtStaActive = 1/);
  assert.match(sql, /p\.FTPdtCode IN \(@productCode0, @productCode1\)/);
  assert.doesNotMatch(sql, /JOIN|product_name|barcode|cost_avg|FTPunName/i);
});

test("hourly stock runner query fails closed without an explicit bounded cohort", async () => {
  const { getHourlyStockEvidenceRows } = await import("../src/queries.js");
  const pool = fakePool();
  await assert.rejects(
    getHourlyStockEvidenceRows(pool, []),
    (error) => error.code === "HOURLY_EVIDENCE_COHORT_REQUIRED",
  );
  assert.equal(pool.calls.length, 0);
});
