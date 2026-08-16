import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  daysAgoIsoDate,
  formatBranchOptionLabel,
  parsePastedProductCodes,
  todayIsoDate,
} from "./adminUiHelpers.js";

// Runs `fn` with the global Date frozen to `isoInstant` and the process
// timezone forced to UTC, so the helpers' local-time-based Date methods
// (getDate/setDate) are unambiguous regardless of the host machine's real
// timezone. Both the Date override and the TZ env var are restored in
// `finally` so no other test in this file (or process) can inherit the
// fake clock.
function withFixedClock(isoInstant, fn) {
  const RealDate = Date;
  const originalTZ = process.env.TZ;

  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(isoInstant);
      } else {
        super(...args);
      }
    }

    static now() {
      return new RealDate(isoInstant).getTime();
    }
  }

  process.env.TZ = "UTC";
  global.Date = FixedDate;
  try {
    fn();
  } finally {
    global.Date = RealDate;
    // process.env values are always strings, so assigning `undefined` here
    // would coerce TZ to the literal string "undefined" instead of clearing
    // it — delete explicitly when there was no original TZ set.
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  }
}

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

describe("todayIsoDate", () => {
  it("returns YYYY-MM-DD sliced from the existing UTC ISO behavior", () => {
    const RealDate = Date;
    const originalTZ = process.env.TZ;

    withFixedClock("2026-08-05T15:30:00.000Z", () => {
      assert.equal(todayIsoDate(), "2026-08-05");
    });

    // The fake clock and TZ override must not survive past withFixedClock.
    assert.equal(Date, RealDate, "global Date must be restored after the fixed-clock test");
    assert.equal(process.env.TZ, originalTZ, "TZ env var must be restored after the fixed-clock test");
  });
});

describe("daysAgoIsoDate", () => {
  it("returns today's date for days = 0", () => {
    withFixedClock("2026-08-05T09:15:00.000Z", () => {
      assert.equal(daysAgoIsoDate(0), "2026-08-05");
    });
  });

  it("subtracts 30 days across a mix of 31/30-day months", () => {
    withFixedClock("2026-08-05T00:00:00.000Z", () => {
      assert.equal(daysAgoIsoDate(30), "2026-07-06");
    });
  });

  it("crosses a month boundary correctly (non-leap February)", () => {
    withFixedClock("2026-03-01T00:00:00.000Z", () => {
      assert.equal(daysAgoIsoDate(1), "2026-02-28");
    });
  });
});
