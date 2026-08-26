import { describe, expect, it } from "vitest";
import { formatSalesProgressWindow } from "./FocusProductsPanel";

describe("sales progress data cutoff copy", () => {
  it("shows the closed sales date separately from the planning days remaining", () => {
    expect(formatSalesProgressWindow({
      dataThroughDate: "2026-08-25",
      planningDate: "2026-08-26",
      daysElapsed: 25,
      totalDaysInMonth: 31,
      daysRemaining: 6,
    })).toBe("ข้อมูลยอดขายถึง 25/08 (อ) · นับ 25/31 วัน · เหลือ 6 วัน");
  });

  it("states clearly when the month has no completed sales day yet", () => {
    expect(formatSalesProgressWindow({
      dataThroughDate: null,
      daysElapsed: 0,
      totalDaysInMonth: 31,
      daysRemaining: 31,
    })).toBe("ยังไม่มีข้อมูลยอดขายที่ปิดวัน · นับ 0/31 วัน · เหลือ 31 วัน");
  });

  it("falls back to the legacy asOfDate during a staggered frontend/backend release", () => {
    expect(formatSalesProgressWindow({
      asOfDate: "2026-07-24",
      daysElapsed: 24,
      totalDaysInMonth: 31,
      daysRemaining: 8,
    })).toContain("ข้อมูลยอดขายถึง 24/07");
  });
});
