import assert from "node:assert/strict";
import test from "node:test";

import { getSalesDetailHeaderRows, getSalesDetailLineRows, getTransferLineRows } from "../src/queries.js";

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
