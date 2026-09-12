import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StockCostAuditPanel from "./StockCostAuditPanel.jsx";

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function branchPayload(overrides = {}) {
  return {
    branchCode: "004",
    productCount: 30,
    productsWithStock: 26,
    productsWithCost: 25,
    totalInventoryValue: 1234.5,
    branchSummaries: [],
    products: [
      {
        productCode: "P-001",
        productNameThai: "สินค้าทดสอบ",
        productNameEng: "Test product",
        barcode: "885000000001",
        unit: "ชิ้น",
        category: "ทดสอบ",
        qty: 5,
        unitCostAvg: 10,
        inventoryValue: 50,
        syncedAt: "2026-09-09T01:20:00.000Z",
      },
    ],
    pagination: {
      limit: 25,
      offset: 0,
      total: 26,
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StockCostAuditPanel characterization", () => {
  it("preserves the initial branch request, summary, search, refresh, and pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      const offset = Number(parsed.searchParams.get("offset") || 0);
      return response(200, branchPayload({
        pagination: { limit: 25, offset, total: 26 },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<StockCostAuditPanel branchCode="004" />);

    expect(screen.getByRole("heading", { name: "ตรวจสอบต้นทุนสต๊อกสินค้า" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("004");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/branch-stock\/inventory-value\?branchCode=004&detail=true&limit=25&offset=0$/,
      ),
      expect.objectContaining({ credentials: "include" }),
    ));

    expect(await screen.findByText("สินค้าทดสอบ")).toBeInTheDocument();
    expect(screen.getByText("Test product")).toBeInTheDocument();
    expect(container.querySelector(".stock-cost-table")).toBeInTheDocument();
    expect(container.querySelector(".stock-cost-compare-table")).not.toBeInTheDocument();
    expect(screen.getByText(/หน้า 1 \/ 2/)).toBeInTheDocument();

    const search = screen.getByPlaceholderText("ค้นหารหัสสินค้า ชื่อไทย ชื่ออังกฤษ หรือ Barcode");
    fireEvent.change(search, { target: { value: "  P-001  " } });
    fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /branchCode=004&detail=true&limit=25&offset=0&search=P-001$/,
      ),
      expect.any(Object),
    ));

    const beforeRefresh = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "รีเฟรช" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeRefresh));

    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /branchCode=004&detail=true&limit=25&offset=25&search=P-001$/,
      ),
      expect.any(Object),
    ));
  });

  it("preserves the all-branches comparison view and branch summaries", async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.searchParams.get("branchCode") !== "all") {
        return response(200, branchPayload({ products: [], pagination: { limit: 25, offset: 0, total: 0 } }));
      }
      return response(200, branchPayload({
        branchCode: "all",
        productsWithStock: 1,
        productsWithCost: 1,
        totalInventoryValue: 107,
        branchSummaries: [
          {
            branchCode: "004",
            label: "สาขา 004",
            productsWithStock: 1,
            productsWithCost: 1,
            totalInventoryValue: 50,
          },
        ],
        products: [
          {
            productCode: "P-ALL",
            productNameThai: "สินค้ารวม",
            productNameEng: "Combined product",
            barcode: "885000000002",
            unit: "ชิ้น",
            category: "ทดสอบ",
            branches: {
              "000": { qty: 1, unitCostAvg: 10, inventoryValue: 10 },
              "001": { qty: 2, unitCostAvg: 10, inventoryValue: 20 },
              "003": { qty: 3, unitCostAvg: 10, inventoryValue: 30 },
              "004": { qty: 5, unitCostAvg: 10, inventoryValue: 50 },
              "005": { qty: 0, unitCostAvg: 0, inventoryValue: 0 },
            },
            qtyTotalAllBranches: 11,
            totalInventoryValue: 110,
            syncedAt: "2026-09-09T01:20:00.000Z",
          },
        ],
        pagination: { limit: 25, offset: 0, total: 1 },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<StockCostAuditPanel branchCode="005" />);
    await screen.findByText("ไม่พบข้อมูลต้นทุนสต๊อกสำหรับสาขาหรือคำค้นหาปัจจุบัน");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/branch-stock\/inventory-value\?branchCode=all&detail=true&limit=25&offset=0$/,
      ),
      expect.any(Object),
    ));
    expect(await screen.findByText("สินค้ารวม")).toBeInTheDocument();
    expect(container.querySelector(".stock-cost-compare-table")).toBeInTheDocument();
    expect(screen.getByText("000 คงเหลือ")).toBeInTheDocument();
    expect(screen.getByText("005 มูลค่า")).toBeInTheDocument();
    expect(screen.getByText("มีสต๊อก 1")).toBeInTheDocument();
    expect(screen.getByText("ขาดต้นทุน 0")).toBeInTheDocument();
  });

  it("preserves the bounded HTTP error shown by the panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(503)));

    const { container } = render(<StockCostAuditPanel branchCode="003" />);

    await waitFor(() => expect(container.querySelector(".notice.error.compact"))
      .toHaveTextContent("HTTP 503"));
    expect(screen.getByText("ไม่พบข้อมูลต้นทุนสต๊อกสำหรับสาขาหรือคำค้นหาปัจจุบัน"))
      .toBeInTheDocument();
  });
});
