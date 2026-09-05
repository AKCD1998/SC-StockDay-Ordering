import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import BranchStockRecommendationSuggestion from "./BranchStockRecommendationSuggestion.jsx";

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function normalizedPayload(overrides = {}) {
  return {
    targetDays: 90,
    generatedAt: "2026-09-05T01:30:00.000Z",
    meta: {
      anchorDate: "2026-09-04",
      reader: {
        servedReader: "normalized",
        inputGenerations: [{ branchCode: "004", syncRunId: "secret-internal-id" }],
        sourceSnapshot: "internal-snapshot-id",
      },
    },
    recommendation: {
      branchCode: "004",
      productCode: "P001",
      unit: "หลอด",
      currentStock: 2,
      soldQty30d: 45,
      soldQty90d: 90,
      adu30: 1.5,
      adu90: 1,
      adjustedAdu: 1.1,
      incomingPoAllocationQty: 3,
      effectiveStock: 5,
      effectiveDaysCover: 4.55,
      targetDays: 90,
      targetQty: 99,
      shortageQty: 94,
      transferPlanQty: 5,
      purchaseQty: 89,
      action: "TRANSFER_AND_PURCHASE",
      reason: "สต็อกยังต่ำกว่าเป้าหมาย",
      flags: ["HAS_INCOMING_PO", "MISSING_COST", "INTERNAL_UNKNOWN_FLAG"],
      donors: [{ branchCode: "003", qty: 5 }],
      ...overrides,
    },
  };
}

describe("BranchStockRecommendationSuggestion", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows normalized recommendation values from the API without exposing reader internals", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => jsonResponse(normalizedPayload()));
    render(
      <BranchStockRecommendationSuggestion branchCode="004" productCode="P001" request={request} />,
    );

    const card = await screen.findByRole("region", { name: "คำแนะนำการเติมสินค้า" });
    expect(request).toHaveBeenCalledWith(
      "/api/admin/stock-recommendations/004/P001",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const headline = within(card).getByText("แนะนำขอจากสาขาอื่นและแจ้งจัดซื้อ: ขอ 5 และซื้อ 89 หลอด");
    const disclosure = headline.closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(headline).toBeVisible();
    expect(within(card).getByText("สต็อกยังต่ำกว่าเป้าหมาย")).not.toBeVisible();

    await user.click(headline.closest("summary"));

    expect(disclosure).toHaveAttribute("open");
    expect(within(card).getByText("สต็อกยังต่ำกว่าเป้าหมาย")).toBeVisible();
    expect(within(card).getByText("สาขา 003: 5 หลอด")).toBeInTheDocument();
    expect(within(card).getByText("สต็อกตอนนี้").parentElement).toHaveTextContent("2");
    expect(within(card).getByText("ขายเฉลี่ยที่ใช้คำนวณ/วัน").parentElement).toHaveTextContent("1.1");
    expect(within(card).getByText("เป้าหมาย 90 วัน").parentElement).toHaveTextContent("99");
    expect(within(card).getByText("ขาดจากเป้าหมาย").parentElement).toHaveTextContent("94");
    expect(within(card).getByText("ขายย้อนหลัง 30 วัน")).toBeInTheDocument();
    expect(within(card).getByText("เฉลี่ย 90 วัน/วัน")).toBeInTheDocument();
    expect(within(card).getByText("ของเข้าที่แบ่งให้สาขานี้")).toBeInTheDocument();
    expect(within(card).getByText("มีของจากใบสั่งซื้อกำลังเข้า")).toBeInTheDocument();
    expect(within(card).getByText("ยังไม่มีข้อมูลต้นทุน")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("secret-internal-id");
    expect(card).not.toHaveTextContent("internal-snapshot-id");
    expect(card).not.toHaveTextContent("INTERNAL_UNKNOWN_FLAG");
    expect(within(card).getByText("ใช้ประกอบการตัดสินใจเท่านั้น ระบบจะไม่ใส่จำนวนให้เอง")).toBeInTheDocument();
  });

  it("stays hidden when the backend serves the legacy reader", async () => {
    const request = vi.fn(async () => jsonResponse({
      meta: { reader: { servedReader: "legacy", selectionStatus: "outside_canary" } },
      recommendation: normalizedPayload().recommendation,
    }));
    render(
      <BranchStockRecommendationSuggestion branchCode="001" productCode="P001" request={request} />,
    );

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "คำแนะนำการเติมสินค้า" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("คำแนะนำยังไม่พร้อม แต่ยังขอสินค้าได้ตามปกติ")).not.toBeInTheDocument();
  });

  it("keeps loading silent and does not disable surrounding request controls", async () => {
    const request = vi.fn(() => new Promise(() => {}));
    render(
      <div>
        <button type="button">ยืนยันใส่ตะกร้า</button>
        <BranchStockRecommendationSuggestion branchCode="004" productCode="P001" request={request} />
      </div>,
    );

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "ยืนยันใส่ตะกร้า" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "คำแนะนำการเติมสินค้า" })).not.toBeInTheDocument();
  });

  it("shows a short non-blocking message when recommendation data is unavailable", async () => {
    const request = vi.fn(async () => jsonResponse(
      { error: "Recommendation input unavailable" },
      { ok: false, status: 503 },
    ));
    render(
      <div>
        <button type="button">ยืนยันใส่ตะกร้า</button>
        <BranchStockRecommendationSuggestion branchCode="004" productCode="P001" request={request} />
      </div>,
    );

    expect(await screen.findByText("คำแนะนำยังไม่พร้อม แต่ยังขอสินค้าได้ตามปกติ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยืนยันใส่ตะกร้า" })).toBeEnabled();
  });
});
