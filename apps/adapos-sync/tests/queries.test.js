import assert from "node:assert/strict";
import test from "node:test";

import { getSalesDetailHeaderRows, getSalesDetailLineRows } from "../src/queries.js";

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
  assert.equal(inputs.branchCode, "005");
});

test("sales-detail line query syncs both sale (1) and return (9) lines", async () => {
  const pool = fakePool();
  await getSalesDetailLineRows(pool, "005", { fromDate: "2026-07-01", toDate: "2026-07-22" });
  const { sql } = pool.calls[0];
  assert.match(sql, /FTShdDocType\s+IN\s+\('1',\s*'9'\)/);
  assert.doesNotMatch(sql, /FTShdDocType\s*=\s*'1'/);
});
