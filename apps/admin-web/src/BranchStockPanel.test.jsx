import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchStockPanel } from "./App.jsx";

const xlsxMock = vi.hoisted(() => ({
  aoaToSheet: vi.fn((matrix) => ({ matrix })),
  appendSheet: vi.fn(),
  write: vi.fn(() => new Uint8Array([80, 75, 3, 4])),
}));

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: xlsxMock.aoaToSheet,
    encode_col: (index) => String.fromCharCode(65 + index),
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    book_append_sheet: xlsxMock.appendSheet,
  },
  write: xlsxMock.write,
}));

const STOCK_RECORDS = [
  {
    productNameThai: "ยาอัลฟา",
    productCode: "A001",
    barcode: "8850001",
    unit: "กล่อง",
    qtyBranch000: 1,
    qtyBranch001: 2,
    qtyBranch003: 3,
    qtyBranch004: 4,
    qtyBranch005: 5,
    qtyTotalAllBranches: 15,
    productNameEng: "Alpha",
    category: "ยา",
    categoryStatus: "confirmed",
    syncedAt: "2026-08-25T01:00:00.000Z",
  },
  {
    productNameThai: "ยาเบตา",
    productCode: "B002",
    barcode: "8850002",
    unit: "ขวด",
    qtyBranch000: 10,
    qtyBranch001: 20,
    qtyBranch003: 30,
    qtyBranch004: 40,
    qtyBranch005: 50,
    qtyTotalAllBranches: 150,
    productNameEng: "Beta",
    category: "ยา",
    categoryStatus: "needs_review",
    syncedAt: "2026-08-25T02:00:00.000Z",
  },
];

const MISSING_BRANCH_RECORD = {
  productNameThai: "ข้อมูลสาขาไม่ครบ",
  productCode: "M003",
  barcode: "",
  unit: "ชิ้น",
  qtyBranch000: "not-a-number",
  qtyBranch001: null,
  qtyBranch999: 77,
  qtyTotalAllBranches: 77,
  productNameEng: "Missing",
  category: "",
  categoryStatus: "unknown",
  syncedAt: null,
};

function makeJsonResponse(records) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      records,
      pagination: { limit: 10000, offset: 0, total: records.length },
    }),
  };
}

function renderPanel({
  isAdminUser = false,
  userId = isAdminUser ? "admin-test" : "staff-test",
  isOnlineMarketingStaff = true,
  branchCode = "000",
  records = STOCK_RECORDS,
  fetchImplementation,
} = {}) {
  global.fetch = vi.fn(fetchImplementation || (() => Promise.resolve(makeJsonResponse(records))));
  return render(
    <BranchStockPanel
      csrfToken="test-csrf"
      isAdminUser={isAdminUser}
      userId={userId}
      isOnlineMarketingStaff={isOnlineMarketingStaff}
      branchCode={branchCode}
      branchName={`สาขา ${branchCode}`}
      onNavigate={vi.fn()}
      requestDraftItems={[]}
      setRequestDraftItems={vi.fn()}
      onClearDraft={vi.fn()}
    />,
  );
}

function headerKeys() {
  return [...document.querySelectorAll("th[data-column-key]")].map((cell) => cell.dataset.columnKey);
}

function productRow(productCode) {
  return screen.getByText(productCode).closest("tr");
}

function scopedTotal(productCode) {
  return productRow(productCode).querySelector('[data-column-key="qtyTotalAllBranches"]').textContent;
}

describe("BranchStockPanel branch scope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    xlsxMock.aoaToSheet.mockClear();
    xlsxMock.appendSheet.mockClear();
    xlsxMock.write.mockReset();
    xlsxMock.write.mockImplementation(() => new Uint8Array([80, 75, 3, 4]));
    window.URL.createObjectURL = vi.fn(() => "blob:test-workbook");
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("defaults Online Marketing to branch 000 only", async () => {
    renderPanel({ branchCode: "" });
    await screen.findByText("A001");

    expect(screen.getByRole("button", { name: "แสดงสต็อกเฉพาะสาขา 000" })).toHaveAttribute("aria-pressed", "true");
    expect(headerKeys()).toContain("qtyBranch000");
    expect(headerKeys()).not.toEqual(expect.arrayContaining(["qtyBranch001", "qtyBranch003", "qtyBranch004", "qtyBranch005"]));
  });

  it.each([
    ["001", "2.00"],
    ["003", "3.00"],
    ["004", "4.00"],
    ["005", "5.00"],
  ])("defaults branch %s staff to their own branch", async (branchCode, expectedTotal) => {
    renderPanel({ isOnlineMarketingStaff: false, branchCode });
    await screen.findByText("A001");

    expect(screen.getByRole("button", { name: `แสดงสต็อกเฉพาะสาขา ${branchCode}` })).toHaveAttribute("aria-pressed", "true");
    expect(headerKeys()).toContain(`qtyBranch${branchCode}`);
    expect(headerKeys().filter((key) => key.startsWith("qtyBranch"))).toEqual([`qtyBranch${branchCode}`]);
    expect(scopedTotal("A001")).toBe(expectedTotal);
    expect(screen.getByRole("button", { name: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แสดงสต็อกทุกสาขา" })).toBeInTheDocument();
  });

  it("lets branch 005 inspect Samut Songkhram without leaking branch 005 into that regional total", async () => {
    const user = userEvent.setup();
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "005" });
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004" }));

    expect(headerKeys()).toEqual(expect.arrayContaining(["qtyBranch000", "qtyBranch001", "qtyBranch003", "qtyBranch004"]));
    expect(headerKeys()).not.toContain("qtyBranch005");
    expect(scopedTotal("A001")).toBe("10.00");
  });

  it("exports a branch account's selected own-branch scope without opening the admin modal", async () => {
    const user = userEvent.setup();
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004" });
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "ส่งออก Excel ตามขอบเขตสต็อกที่เลือก" }));

    await waitFor(() => expect(xlsxMock.aoaToSheet).toHaveBeenCalledOnce());
    const matrix = xlsxMock.aoaToSheet.mock.calls[0][0];
    expect(matrix[0]).toContain("สาขา 004");
    expect(matrix[0]).not.toEqual(expect.arrayContaining(["สาขา 000", "สาขา 001", "สาขา 003", "สาขา 005"]));
    expect(matrix[1][matrix[0].indexOf("รวม")]).toBe(4);
    expect(screen.queryByRole("dialog", { name: "ส่งออก Excel แยกตามสาขา" })).not.toBeInTheDocument();
    const clickedAnchor = HTMLAnchorElement.prototype.click.mock.instances.at(-1);
    expect(clickedAnchor.download).toMatch(/^branch-stock-branch-004-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("shows only 000, 001, 003, and 004 for the Samut Songkhram scope", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004" }));

    expect(headerKeys()).toEqual(expect.arrayContaining(["qtyBranch000", "qtyBranch001", "qtyBranch003", "qtyBranch004"]));
    expect(headerKeys()).not.toContain("qtyBranch005");
  });

  it("shows every current branch column for the all-branches scope", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกทุกสาขา" }));

    expect(headerKeys()).toEqual(expect.arrayContaining([
      "qtyBranch000",
      "qtyBranch001",
      "qtyBranch003",
      "qtyBranch004",
      "qtyBranch005",
    ]));
  });

  it("recalculates each total from the selected scope", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("A001");

    expect(scopedTotal("A001")).toBe("1.00");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004" }));
    expect(scopedTotal("A001")).toBe("10.00");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกทุกสาขา" }));
    expect(scopedTotal("A001")).toBe("15.00");
  });

  it("exports the selected columns and the same scoped total shown on screen", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004" }));
    await user.click(screen.getByRole("button", { name: "ส่งออก Excel ตามขอบเขตสต็อกที่เลือก" }));

    await waitFor(() => expect(xlsxMock.aoaToSheet).toHaveBeenCalledOnce());
    const matrix = xlsxMock.aoaToSheet.mock.calls[0][0];
    expect(matrix[0]).toEqual(expect.arrayContaining(["สาขา 000", "สาขา 001", "สาขา 003", "สาขา 004", "รวม"]));
    expect(matrix[0]).not.toContain("สาขา 005");
    const totalIndex = matrix[0].indexOf("รวม");
    expect(matrix[1][totalIndex]).toBe(10);
    expect(Number(scopedTotal("A001"))).toBe(matrix[1][totalIndex]);
    const clickedAnchor = HTMLAnchorElement.prototype.click.mock.instances.at(-1);
    expect(clickedAnchor.download).toMatch(/^branch-stock-samut-songkhram-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("announces an export failure and clears the error after a successful retry", async () => {
    const user = userEvent.setup();
    xlsxMock.write.mockImplementationOnce(() => {
      throw new Error("สร้างไฟล์ XLSX ไม่สำเร็จ");
    });
    renderPanel();
    await screen.findByText("A001");

    const exportButton = screen.getByRole("button", { name: "ส่งออก Excel ตามขอบเขตสต็อกที่เลือก" });
    await user.click(exportButton);
    expect(await screen.findByRole("alert")).toHaveTextContent("ส่งออก Excel ไม่สำเร็จ: สร้างไฟล์ XLSX ไม่สำเร็จ");
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();

    await user.click(exportButton);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(xlsxMock.write).toHaveBeenCalledTimes(2);
    expect(window.URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("preserves the original all-column and server-export flow for admin users", async () => {
    const user = userEvent.setup();
    renderPanel({ isAdminUser: true, isOnlineMarketingStaff: false });
    await screen.findByText("A001");

    expect(screen.queryByRole("group", { name: "เลือกขอบเขตสต็อกที่แสดง" })).not.toBeInTheDocument();
    expect(headerKeys()).toEqual(expect.arrayContaining([
      "qtyBranch000",
      "qtyBranch001",
      "qtyBranch003",
      "qtyBranch004",
      "qtyBranch005",
    ]));
    expect(scopedTotal("A001")).toBe("15.00");
    await user.click(screen.getByRole("button", { name: "เปิดตัวเลือกส่งออก Excel แยกตามสาขา" }));
    expect(screen.getByRole("dialog", { name: "ส่งออก Excel แยกตามสาขา" })).toBeInTheDocument();
    expect(xlsxMock.aoaToSheet).not.toHaveBeenCalled();
  });

  it("lets an admin save a private column order without changing another account", async () => {
    const user = userEvent.setup();
    renderPanel({ isAdminUser: true, isOnlineMarketingStaff: false, userId: "admin-a" });
    await screen.findByText("A001");

    await user.click(screen.getByRole("button", { name: "จัดคอลัมน์" }));
    await user.click(screen.getByRole("button", { name: "ย้าย รหัสสินค้า ขึ้น" }));
    await user.click(screen.getByRole("button", { name: "บันทึกลำดับ" }));
    expect(screen.getByRole("status")).toHaveTextContent("กำลังบันทึกลำดับคอลัมน์");
    await waitFor(() => expect(headerKeys().slice(0, 2)).toEqual(["productCode", "productNameThai"]));

    cleanup();
    renderPanel({ isAdminUser: true, isOnlineMarketingStaff: false, userId: "admin-a" });
    await screen.findByText("A001");
    expect(headerKeys().slice(0, 2)).toEqual(["productCode", "productNameThai"]);

    cleanup();
    renderPanel({ isAdminUser: true, isOnlineMarketingStaff: false, userId: "admin-b" });
    await screen.findByText("A001");
    expect(headerKeys().slice(0, 2)).toEqual(["productNameThai", "productCode"]);
  });

  it("shows progress feedback before restoring the default column order", async () => {
    const user = userEvent.setup();
    renderPanel({ isAdminUser: true, isOnlineMarketingStaff: false, userId: "admin-reset" });
    await screen.findByText("A001");

    await user.click(screen.getByRole("button", { name: "จัดคอลัมน์" }));
    expect(screen.getByRole("button", { name: "ปิด" })).toHaveClass("branch-stock-column-close-button");
    expect(screen.getByRole("button", { name: "คืนค่าเริ่มต้น" })).toHaveClass("branch-stock-column-reset-button");
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toHaveClass("branch-stock-column-cancel-button");
    await user.click(screen.getByRole("button", { name: "คืนค่าเริ่มต้น" }));
    expect(screen.getByRole("status")).toHaveTextContent("กำลังคืนค่าลำดับเริ่มต้น");
    expect(screen.getByRole("button", { name: "บันทึกลำดับ" })).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "จัดลำดับคอลัมน์" })).not.toBeInTheDocument());
  });

  it("does not expose the column editor to non-admin branch accounts", async () => {
    renderPanel({ isAdminUser: false, isOnlineMarketingStaff: false, branchCode: "001" });
    await screen.findByText("A001");
    expect(screen.queryByRole("button", { name: "จัดคอลัมน์" })).not.toBeInTheDocument();
  });

  it("treats missing, invalid, and unknown branch data as zero without crashing", async () => {
    const user = userEvent.setup();
    renderPanel({ records: [MISSING_BRANCH_RECORD] });
    await screen.findByText("M003");

    expect(scopedTotal("M003")).toBe("0.00");
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกทุกสาขา" }));
    expect(scopedTotal("M003")).toBe("0.00");
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("keeps sorting and server-backed search working while scopes are switched", async () => {
    const user = userEvent.setup();
    const fetchImplementation = async (url) => {
      const search = new URL(String(url), "http://localhost").searchParams.get("search");
      return makeJsonResponse(search === "Alpha" ? [STOCK_RECORDS[0]] : STOCK_RECORDS);
    };
    renderPanel({ fetchImplementation });
    await screen.findByText("A001");

    const productCodeHeader = document.querySelector('th[data-column-key="productCode"]');
    await user.click(within(productCodeHeader).getByRole("button", { name: "Sort and filter รหัสสินค้า" }));
    await user.click(screen.getByRole("button", { name: "Sort Z to A" }));
    expect([...document.querySelectorAll('tbody td[data-column-key="productCode"] strong')].map((node) => node.textContent)).toEqual(["B002", "A001"]);

    await user.click(screen.getByRole("button", { name: "แสดงสต็อกทุกสาขา" }));
    await user.click(screen.getByRole("button", { name: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004" }));
    expect([...document.querySelectorAll('tbody td[data-column-key="productCode"] strong')].map((node) => node.textContent)).toEqual(["B002", "A001"]);

    await user.type(screen.getByRole("searchbox", { name: "" }), "Alpha");
    await user.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("search=Alpha"),
      expect.any(Object),
    ));
    expect(await screen.findByText("A001")).toBeInTheDocument();
    expect(screen.queryByText("B002")).not.toBeInTheDocument();
  });
});
