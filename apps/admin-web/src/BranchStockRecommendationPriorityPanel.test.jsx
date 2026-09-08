import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BranchStockPanel } from "./App.jsx";

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => payload,
  };
}

const RECORDS = [
  ["P-OTHER", "Other"],
  ["P-NONE", "No action"],
  ["P-TRANSFER", "Transfer"],
  ["P-PURCHASE-LOW", "Purchase low"],
  ["P-PURCHASE-HIGH", "Purchase high"],
].map(([productCode, productNameEng], index) => ({
  productCode,
  productNameThai: productNameEng,
  productNameEng,
  barcode: `885000${index}`,
  unit: "ชิ้น",
  qtyBranch001: index,
  qtyTotalAllBranches: index,
  category: "ยา",
  categoryStatus: "confirmed",
  syncedAt: "2026-09-08T01:20:00.000Z",
}));

const PRIORITY_ROWS = [
  { productCode: "P-PURCHASE-LOW", action: "PURCHASE", neededQty: 4, purchaseQty: 4, transferPlanQty: 0 },
  { productCode: "P-PURCHASE-HIGH", action: "TRANSFER_AND_PURCHASE", neededQty: 12, purchaseQty: 8, transferPlanQty: 4 },
  { productCode: "P-TRANSFER", action: "TRANSFER_IN", neededQty: 30, purchaseQty: 0, transferPlanQty: 30 },
  { productCode: "P-NONE", action: "NO_ACTION", neededQty: 0, purchaseQty: 0, transferPlanQty: 0 },
];

function renderPanel({ priorityResponse } = {}) {
  global.fetch = vi.fn((url) => {
    if (String(url).includes("/api/admin/stock-recommendations/priority-index")) {
      return Promise.resolve(priorityResponse || jsonResponse({
        active: true,
        rows: PRIORITY_ROWS,
        meta: { reader: { servedReader: "normalized" } },
      }));
    }
    return Promise.resolve(jsonResponse({
      records: RECORDS,
      pagination: { limit: 10000, offset: 0, total: RECORDS.length },
    }));
  });

  return render(
    <BranchStockPanel
      csrfToken="test-csrf"
      isAdminUser={false}
      userId="branch001-priority-test"
      branchCode="001"
      branchName="สาขา 001"
      onNavigate={vi.fn()}
      requestDraftItems={[]}
      setRequestDraftItems={vi.fn()}
      onClearDraft={vi.fn()}
    />,
  );
}

function tableProductCodes(container) {
  return [...container.querySelectorAll("tbody tr")].map((row) => (
    row.querySelector('[data-column-key="productCode"]')?.textContent
  ));
}

describe("BranchStockPanel recommendation priority concept", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads one compact index and applies the default group order, quantity order and row colors", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await screen.findByText("P-OTHER");

    await user.click(container.querySelector(".request-entry-button"));
    await screen.findByLabelText("สีลำดับคำแนะนำสินค้า");

    expect(tableProductCodes(container)).toEqual([
      "P-PURCHASE-HIGH",
      "P-PURCHASE-LOW",
      "P-TRANSFER",
      "P-NONE",
      "P-OTHER",
    ]);
    expect(screen.getByText("P-PURCHASE-HIGH").closest("tr")).toHaveClass("priority-purchase");
    expect(screen.getByText("P-TRANSFER").closest("tr")).toHaveClass("priority-transfer");
    expect(screen.getByText("P-NONE").closest("tr")).toHaveClass("priority-no-action");
    expect(screen.getByText("P-OTHER").closest("tr")).not.toHaveClass("priority-purchase", "priority-transfer", "priority-no-action");
    expect(global.fetch.mock.calls.filter(([url]) => String(url).includes("priority-index"))).toHaveLength(1);

    const productHeader = container.querySelector('th[data-column-key="productCode"]');
    await user.click(within(productHeader).getByRole("button"));
    await user.click(screen.getByRole("button", { name: "Sort A to Z" }));
    expect(tableProductCodes(container)).toEqual([
      "P-NONE",
      "P-OTHER",
      "P-PURCHASE-HIGH",
      "P-PURCHASE-LOW",
      "P-TRANSFER",
    ]);
  });

  it("keeps the original table order and request flow when the priority endpoint is unavailable", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel({
      priorityResponse: jsonResponse({ error: "unavailable" }, { ok: false, status: 503 }),
    });
    await screen.findByText("P-OTHER");

    await user.click(container.querySelector(".request-entry-button"));
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).includes("priority-index"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

    expect(screen.queryByLabelText("สีลำดับคำแนะนำสินค้า")).not.toBeInTheDocument();
    expect(tableProductCodes(container)).toEqual([
      "P-NONE",
      "P-OTHER",
      "P-PURCHASE-HIGH",
      "P-PURCHASE-LOW",
      "P-TRANSFER",
    ]);
    expect(container.querySelectorAll("tbody .priority-purchase, tbody .priority-transfer, tbody .priority-no-action")).toHaveLength(0);
    expect(container.querySelector(".branch-stock-request-plus")).toBeEnabled();
  });
});
