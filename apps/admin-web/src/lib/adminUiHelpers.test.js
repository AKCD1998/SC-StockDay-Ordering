import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatBranchOptionLabel,
  parsePastedProductCodes,
} from "./adminUiHelpers.js";

describe("parsePastedProductCodes", () => {
  it("trims lines, keeps first occurrences, and reports later duplicates", () => {
    assert.deepEqual(
      parsePastedProductCodes(" IC-001 \r\nIC-002\nIC-001\nIC-001"),
      {
        productCodes: ["IC-001", "IC-002"],
        duplicates: ["IC-001", "IC-001"],
        skipped: [],
      },
    );
  });

  it("ignores blank lines and reports #N/A using its trimmed original spelling", () => {
    assert.deepEqual(parsePastedProductCodes("\n #N/A \n#n/a\n  \nIC-003\n"), {
      productCodes: ["IC-003"],
      duplicates: [],
      skipped: ["#N/A", "#n/a"],
    });
  });

  it("keeps product-code comparison case-sensitive", () => {
    assert.deepEqual(parsePastedProductCodes("ABC\nabc\nABC"), {
      productCodes: ["ABC", "abc"],
      duplicates: ["ABC"],
      skipped: [],
    });
  });

  it("returns empty groups for missing input", () => {
    const empty = { productCodes: [], duplicates: [], skipped: [] };
    assert.deepEqual(parsePastedProductCodes(), empty);
    assert.deepEqual(parsePastedProductCodes(null), empty);
    assert.deepEqual(parsePastedProductCodes(""), empty);
  });
});

describe("formatBranchOptionLabel", () => {
  it("shows code and name after trimming both values", () => {
    assert.equal(
      formatBranchOptionLabel({ branchCode: " 004 ", branchName: " สาขาทดสอบ " }),
      "004 - สาขาทดสอบ",
    );
  });

  it("uses the existing fallbacks for missing or repeated values", () => {
    assert.equal(formatBranchOptionLabel(), "-");
    assert.equal(formatBranchOptionLabel({ branchName: "สำนักงานใหญ่" }), "สำนักงานใหญ่");
    assert.equal(formatBranchOptionLabel({ branchCode: "004" }), "สาขา 004");
    assert.equal(
      formatBranchOptionLabel({ branchCode: "004", branchName: "004" }),
      "สาขา 004",
    );
  });

  it("preserves the existing falsy numeric-code behavior", () => {
    assert.equal(
      formatBranchOptionLabel({ branchCode: 0, branchName: "สำนักงานใหญ่" }),
      "สำนักงานใหญ่",
    );
  });
});
