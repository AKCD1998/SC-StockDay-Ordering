import { describe, expect, it } from "vitest";
import {
  buildResponseSubmitBody,
  initResponseDraft,
  validateLineDraft,
  validateResponseDraft,
} from "./responseDraft";

const lines = [
  { lineId: 1, requestedQty: 5, unit: "BOX" },
  { lineId: 2, requestedQty: 3, unit: "TAB" },
];

describe("initResponseDraft", () => {
  it("defaults every line to full approval at the requested qty", () => {
    const draft = initResponseDraft(lines);
    expect(draft[1].responseStatus).toBe("APPROVED_FULL");
    expect(draft[1].approvedQty).toBe(5);
    expect(draft[2].approvedQty).toBe(3);
  });
});

describe("validateLineDraft", () => {
  it("accepts a full approval with no reason", () => {
    expect(validateLineDraft({ responseStatus: "APPROVED_FULL" }, lines[0])).toBeNull();
  });

  it("rejects partial qty that is not strictly between 0 and requested", () => {
    expect(
      validateLineDraft({ responseStatus: "APPROVED_PARTIAL", approvedQty: 5, reasonCode: "X" }, lines[0]),
    ).toMatch(/บางส่วน/);
    expect(
      validateLineDraft({ responseStatus: "APPROVED_PARTIAL", approvedQty: 0, reasonCode: "X" }, lines[0]),
    ).toMatch(/บางส่วน/);
  });

  it("requires a reason for partial approval", () => {
    expect(
      validateLineDraft({ responseStatus: "APPROVED_PARTIAL", approvedQty: 2 }, lines[0]),
    ).toMatch(/เหตุผล/);
    expect(
      validateLineDraft({ responseStatus: "APPROVED_PARTIAL", approvedQty: 2, note: "บางส่วน" }, lines[0]),
    ).toBeNull();
  });

  it("requires a reason for rejection", () => {
    expect(validateLineDraft({ responseStatus: "REJECTED" }, lines[0])).toMatch(/เหตุผล/);
    expect(validateLineDraft({ responseStatus: "REJECTED", reasonCode: "OOS" }, lines[0])).toBeNull();
  });
});

describe("validateResponseDraft", () => {
  it("returns no errors for an all-valid draft", () => {
    const draft = initResponseDraft(lines);
    expect(validateResponseDraft(draft, lines)).toEqual({});
  });

  it("flags only the invalid lines", () => {
    const draft = {
      1: { responseStatus: "REJECTED" },
      2: { responseStatus: "APPROVED_FULL" },
    };
    const errors = validateResponseDraft(draft, lines);
    expect(errors[1]).toBeTruthy();
    expect(errors[2]).toBeUndefined();
  });
});

describe("buildResponseSubmitBody", () => {
  it("includes version and omits approvedQty for non-partial lines", () => {
    const draft = {
      1: { responseStatus: "APPROVED_FULL" },
      2: { responseStatus: "APPROVED_PARTIAL", approvedQty: 2, reasonCode: "LOW" },
    };
    const body = buildResponseSubmitBody(draft, lines, 1);
    expect(body.version).toBe(1);
    expect(body.responses[0]).toEqual({ lineId: 1, responseStatus: "APPROVED_FULL" });
    expect(body.responses[1]).toEqual({
      lineId: 2,
      responseStatus: "APPROVED_PARTIAL",
      reasonCode: "LOW",
      approvedQty: 2,
    });
  });
});
