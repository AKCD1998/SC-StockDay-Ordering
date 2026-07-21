import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRegulatedDrugClassification,
  summarizeRegulatedDrugBatch,
  summarizeRegulatedDrugLines,
} from "./regulatedDrugs.js";

describe("regulated drug classification", () => {
  it("classifies KY10 and normalizes IC codes", () => {
    assert.deepEqual(getRegulatedDrugClassification(" ic-000446 ").reportGroups, ["KY10"]);
  });

  it("classifies KY11 numeric codes without numeric coercion", () => {
    assert.deepEqual(getRegulatedDrugClassification("630030038").reportGroups, ["KY11"]);
  });

  it("does not highlight normal or excluded test products", () => {
    assert.equal(getRegulatedDrugClassification("IC-123456").isRegulated, false);
    assert.equal(getRegulatedDrugClassification("IC-999999").isRegulated, false);
  });

  it("summarizes only matching lines and supports multiple groups", () => {
    assert.deepEqual(summarizeRegulatedDrugLines([
      { productCode: "IC-000446" },
      { productCode: "630030038" },
      { productCode: "NORMAL" },
    ]), { count: 2, reportGroups: ["KY10", "KY11"] });
    assert.equal(summarizeRegulatedDrugBatch({ requests: [{ lines: [{ productCode: "IC-000446" }] }] }).count, 1);
  });
});
