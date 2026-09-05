import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchStockPanel } from "./App.jsx";

const RECORD = {
  productNameThai: "สินค้าทดสอบ",
  productCode: "P001",
  barcode: "8850001",
  unit: "หลอด",
  qtyBranch000: 5,
  qtyBranch001: 4,
  qtyBranch003: 3,
  qtyBranch004: 2,
  qtyBranch005: 1,
  qtyTotalAllBranches: 15,
  productNameEng: "Test product",
  category: "ยา",
  categoryStatus: "confirmed",
  syncedAt: "2026-09-05T01:20:00.000Z",
};

function stockResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      records: [RECORD],
      pagination: { limit: 10000, offset: 0, total: 1 },
    }),
  };
}

function recommendationResponse({ ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => ok ? ({
      targetDays: 90,
      meta: { reader: { servedReader: "normalized" } },
      recommendation: {
        ...RECORD,
        branchCode: "004",
        currentStock: 2,
        soldQty30d: 30,
        soldQty90d: 90,
        adu30: 1,
        adu90: 1,
        adjustedAdu: 1,
        incomingPoAllocationQty: 0,
        effectiveStock: 2,
        effectiveDaysCover: 2,
        targetDays: 90,
        targetQty: 90,
        shortageQty: 88,
        transferPlanQty: 3,
        purchaseQty: 85,
        action: "TRANSFER_AND_PURCHASE",
        reason: "สต็อกต่ำกว่าเป้าหมาย",
        flags: [],
        donors: [{ branchCode: "003", qty: 3 }],
      },
    }) : ({ error: "Recommendation input unavailable" }),
  };
}

function renderPanel({ recommendationPromise, setRequestDraftItems = vi.fn() }) {
  global.fetch = vi.fn((url) => {
    if (String(url).includes("/api/admin/stock-recommendations/")) {
      return recommendationPromise;
    }
    return Promise.resolve(stockResponse());
  });
  return {
    ...render(
      <BranchStockPanel
        csrfToken="test-csrf"
        isAdminUser={false}
        userId="branch004-test"
        isOnlineMarketingStaff={false}
        branchCode="004"
        branchName="สาขา 004"
        onNavigate={vi.fn()}
        requestDraftItems={[]}
        setRequestDraftItems={setRequestDraftItems}
        onClearDraft={vi.fn()}
      />,
    ),
    setRequestDraftItems,
  };
}

async function openRequestDialog(user) {
  await screen.findByText("P001");
  await user.click(screen.getByRole("button", { name: "ขอสินค้า" }));
  await user.click(screen.getByRole("button", { name: "เพิ่มคำขอสินค้า P001" }));
  return screen.getByRole("dialog", { name: /P001/ });
}

describe("BranchStockPanel normalized suggestion", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not auto-fill or submit quantities while a normalized suggestion loads", async () => {
    const user = userEvent.setup();
    let resolveRecommendation;
    const pendingRecommendation = new Promise((resolve) => {
      resolveRecommendation = resolve;
    });
    const { setRequestDraftItems } = renderPanel({ recommendationPromise: pendingRecommendation });
    const dialog = await openRequestDialog(user);
    const quantityInputs = within(dialog).getAllByRole("spinbutton");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/stock-recommendations/004/P001"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(quantityInputs.every((input) => input.value === "")).toBe(true);
    expect(within(dialog).getByRole("button", { name: "ยืนยันใส่ตะกร้า" })).toBeEnabled();
    expect(setRequestDraftItems).not.toHaveBeenCalled();

    resolveRecommendation(recommendationResponse());
    expect(await within(dialog).findByRole("region", { name: "คำแนะนำการเติมสินค้า" })).toBeInTheDocument();
    expect(quantityInputs.every((input) => input.value === "")).toBe(true);
    expect(setRequestDraftItems).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "ยืนยันใส่ตะกร้า" }));
    expect(within(dialog).getByText("กรุณาระบุจำนวนอย่างน้อย 1 สาขา หรือจำนวนที่แจ้งจัดซื้อ")).toBeInTheDocument();
    expect(setRequestDraftItems).not.toHaveBeenCalled();
  });

  it("keeps the existing request flow usable when the suggestion endpoint returns 503", async () => {
    const user = userEvent.setup();
    const { setRequestDraftItems } = renderPanel({
      recommendationPromise: Promise.resolve(recommendationResponse({ ok: false, status: 503 })),
    });
    const dialog = await openRequestDialog(user);

    expect(await within(dialog).findByText("คำแนะนำยังไม่พร้อม แต่ยังขอสินค้าได้ตามปกติ")).toBeInTheDocument();
    const firstQuantity = within(dialog).getAllByRole("spinbutton")[0];
    await user.type(firstQuantity, "1");
    await user.click(within(dialog).getByRole("button", { name: "ยืนยันใส่ตะกร้า" }));
    expect(setRequestDraftItems).toHaveBeenCalledOnce();
  });
});
