import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

function scopedColumnValue(productCode, columnKey) {
  return productRow(productCode).querySelector(`[data-column-key="${columnKey}"]`)?.textContent;
}

function scopedTotal(productCode) {
  return scopedColumnValue(productCode, "qtyTotalAllBranches");
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function hourlyResponse(quantity = 0) {
    const data = {
      records: [{ ...STOCK_RECORDS[0], qtyBranch004: quantity, qtyTotalAllBranches: 11 + quantity,
        fullSyncQtyBranch004: 4, stock004: { basis: "hourly-calculated", reason: null,
          capturedAt: "2026-10-22T06:02:00.000Z", fullSyncAt: "2026-10-22T01:22:00.000Z" } }],
      hourlyStock004: { status: "available", availableProducts: 6835, capturedAt: "2026-10-22T06:02:00.000Z", pageFallbackProducts: 0 },
      pagination: { limit: 10000, offset: 0, total: 1 },
    };
    return { ...makeJsonResponse([]), json: async () => data };
  }

  it("requests the Hourly read view and displays a sold-to-zero quantity with its original Full Sync baseline", async () => {
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: async () => hourlyResponse() });
    await screen.findByText("A001");
    const cell = productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell.querySelector("span")).toHaveTextContent("0.00");
    expect(cell).toHaveTextContent("Hourly คำนวณ");
    expect(cell).toHaveTextContent("Full Sync เดิม 4.00");
    expect(screen.getByRole("region", { name: "แหล่งข้อมูลสต็อกสาขา 004" })).toHaveTextContent("6,835");
    expect(global.fetch.mock.calls[0][0]).toContain("stockView=hourly004");
  });

  it("shows 004 orange shared-stock availability with separate POS and marketplace demand", async () => {
    const data = { records: [{ ...STOCK_RECORDS[0], qtyBranch004: 1, posQtyBranch004: 4,
      stock004: { basis: "hourly-and-shopee", posBasis: "hourly-calculated", shopee: {
        reservedQuantity: 2, shippedUnpostedQuantity: 1, asOf: "2026-10-22T12:00:00Z" } } }],
      shopeeStock004: { status: "available", asOf: "2026-10-22T12:00:00Z", sourceLabelReviewOrders: 1 } };
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: async () => ({ ...makeJsonResponse([]), json: async () => data }) });
    await screen.findByText("A001");
    const cell = productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell).toHaveTextContent("แชร์กับ Shopee"); expect(cell).toHaveTextContent("POS 4.00");
    expect(cell).toHaveTextContent("จอง 2.00"); expect(cell).toHaveTextContent("ส่งแล้วไม่ลง POS 1.00");
    expect(cell.querySelector(".stock-shopee-shared")).not.toBeNull();
    const details=cell.querySelector("details"),breakdown=cell.querySelector(".stock-004-expanded-details");
    expect(details).not.toHaveAttribute("open");expect(breakdown).not.toBeVisible();
    expect(cell.querySelector("summary strong")).toBeVisible();
    await userEvent.click(cell.querySelector("summary"));
    expect(details).toHaveAttribute("open");expect(breakdown).toBeVisible();
    expect(screen.getByText(/มีรูปแบบชื่อต้นทาง/)).toBeInTheDocument();
  });

  it("keeps unknown Shopee availability unknown for branch users and scoped totals", async () => {
    const data = { records: [{ ...STOCK_RECORDS[0], qtyBranch004: null, qtyTotalAllBranches: null, posQtyBranch004: 4,
      stock004: { basis: "shopee-availability-unknown", posBasis: "hourly-calculated", shopee: {} } }],
      shopeeStock004: { status: "projection-unavailable" } };
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: async () => ({ ...makeJsonResponse([]), json: async () => data }) });
    await screen.findByText("A001");
    const cell = productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell).toHaveTextContent("รอตรวจ"); expect(cell.querySelector("strong")).not.toHaveTextContent("0.00");
    expect(cell).toHaveTextContent("POS 4.00 ก่อนหัก Shopee");
    expect(cell.querySelector(".stock-004-expanded-details")).not.toBeVisible();
    expect(screen.getByText("ติดต่อข้อมูล Shopee ไม่สำเร็จ — ยอด POS ยังแสดงแยกไว้")).toBeInTheDocument();
  });
  it("explains a Shopee review count without hiding the separately labelled POS reference",async()=>{
    const data={records:[{...STOCK_RECORDS[0],qtyBranch004:null,qtyTotalAllBranches:null,posQtyBranch004:4,
      stock004:{basis:"shopee-availability-unknown",posBasis:"hourly-calculated",shopee:{}}}],
      shopeeStock004:{status:"shopee-orders-need-review",reviewOrders:2}};
    renderPanel({isOnlineMarketingStaff:false,branchCode:"004",fetchImplementation:async()=>({...makeJsonResponse([]),json:async()=>data})});
    await screen.findByText("A001");
    expect(screen.getByText("Shopee รอตรวจ 2 ออเดอร์ — ยอด POS ยังแสดงแยกไว้")).toBeInTheDocument();
    const cell=productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell).toHaveTextContent("POS 4.00 ก่อนหัก Shopee");expect(cell.querySelector("strong")).toHaveTextContent("รอตรวจ");
  });
  it("keeps last-confirmed stock clearly labelled as a closed reference disclosure and never a current total",async()=>{
    const data={records:[{...STOCK_RECORDS[0],qtyBranch004:null,qtyTotalAllBranches:null,posQtyBranch004:4,
      stock004:{basis:"shopee-availability-unknown",viewStatus:"reference",posBasis:"hourly-calculated",shopee:{reservedQuantity:1,shippedUnpostedQuantity:0,asOf:"2026-10-23T09:00:00Z"},
        lastConfirmed:{quantity:3,observedAt:"2026-10-23T09:00:00Z",fetchedAt:"2026-10-23T09:01:00Z",stale:true,reasonCode:"projection-timeout"}}}],
      shopeeStock004:{status:"reference"}};
    renderPanel({isOnlineMarketingStaff:false,branchCode:"004",fetchImplementation:async()=>({...makeJsonResponse([]),json:async()=>data})});
    await screen.findByText("A001"); const cell=productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell.querySelector("summary strong")).toHaveTextContent("3.00");
    expect(cell.querySelector("summary")).toHaveTextContent("อ้างอิง");
    expect(cell.querySelector(".stock-004-expanded-details")).not.toBeVisible();
    await userEvent.click(cell.querySelector("summary"));
    expect(cell).toHaveTextContent("ไม่ใช่ยอดพร้อมใช้ปัจจุบัน");
    expect(cell).toHaveTextContent("POS 4.00 ก่อนหัก Shopee");
    expect(cell).not.toHaveTextContent("พร้อมใช้ · แชร์กับ Shopee");
  });
  it("does not display a malformed reference as a ready-to-sell zero",async()=>{
    const data={records:[{...STOCK_RECORDS[0],qtyBranch004:null,stock004:{basis:"shopee-availability-unknown",viewStatus:"reference",lastConfirmed:{quantity:null}}}]};
    renderPanel({isOnlineMarketingStaff:false,branchCode:"004",fetchImplementation:async()=>({...makeJsonResponse([]),json:async()=>data})});
    await screen.findByText("A001"); const summary=productRow("A001").querySelector('[data-column-key="qtyBranch004"] summary');
    expect(summary).toHaveTextContent("รอตรวจ");expect(summary).not.toHaveTextContent("0.00");
  });

  it("retains unaffected availability when only a mapped product needs marketplace review",async()=>{
    const data={records:[{...STOCK_RECORDS[0],qtyBranch004:null,qtyTotalAllBranches:null,posQtyBranch004:4,
      stock004:{basis:"shopee-availability-unknown",posBasis:"hourly-calculated",shopee:{}}},
      {...STOCK_RECORDS[0],productCode:"PARTIAL002",qtyBranch004:3,posQtyBranch004:4,
        stock004:{basis:"hourly-and-shopee",posBasis:"hourly-calculated",shopee:{reservedQuantity:1,shippedUnpostedQuantity:0}}}],
      shopeeStock004:{status:"partial",reviewOrders:1}};
    renderPanel({isOnlineMarketingStaff:false,branchCode:"004",fetchImplementation:async()=>({...makeJsonResponse([]),json:async()=>data})});
    await screen.findByText("A001");
    expect(productRow("A001").querySelector('[data-column-key="qtyBranch004"]')).toHaveTextContent("รอตรวจ");
    const available=productRow("PARTIAL002").querySelector('[data-column-key="qtyBranch004"]');
    expect(available.querySelector("strong")).toHaveTextContent("3.00");expect(available).not.toHaveTextContent("รอตรวจ");
  });
  it("shows temporary quantities with an explicit incomplete-order banner and compact details",async()=>{
    const data={records:[{...STOCK_RECORDS[0],qtyBranch004:2,posQtyBranch004:4,
      stock004:{basis:"hourly-and-shopee-known-only",posBasis:"hourly-calculated",shopee:{reservedQuantity:2,shippedUnpostedQuantity:0,unallocatedOrders:1,allOrdersAllocated:false}}}],
      shopeeStock004:{status:"partial-known-commitments",unallocatedOrders:1}};
    renderPanel({isOnlineMarketingStaff:false,branchCode:"004",fetchImplementation:async()=>({...makeJsonResponse([]),json:async()=>data})});
    await screen.findByText("A001");const cell=productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell.querySelector('summary strong')).toHaveTextContent('2.00');expect(cell).not.toHaveTextContent('พร้อมใช้ · แชร์กับ Shopee');
    expect(screen.getByText('ยอดชั่วคราว — ยังไม่รวม 1 ออเดอร์ที่รอจับคู่สินค้า')).toBeInTheDocument();
    expect(cell.querySelector('.stock-004-expanded-details')).not.toBeVisible();
  });
  it("labels suppressed fallback quantities rather than representing the morning value as Hourly", async () => {
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: async () => {
      const response = hourlyResponse(); const data = await response.json();
      data.records[0].qtyBranch004 = 4;
      data.records[0].stock004 = { basis: "full-sync", reason: "changed-between-reads" };
      data.hourlyStock004.pageFallbackProducts = 1;
      return { ...response, json: async () => data };
    } });
    await screen.findByText("A001");
    const cell = productRow("A001").querySelector('[data-column-key="qtyBranch004"]');
    expect(cell).toHaveTextContent("ข้อมูลเปลี่ยนระหว่างอ่าน");
    expect(cell).not.toHaveTextContent("Hourly คำนวณ");
    expect(screen.getByRole("region", { name: "แหล่งข้อมูลสต็อกสาขา 004" })).toHaveTextContent("ใช้ Full Sync 1 รายการ");
  });

  it("keeps another branch's quantity and export scope independent of the 004 overlay", async () => {
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "001", fetchImplementation: async () => hourlyResponse() });
    await screen.findByText("A001");
    expect(scopedColumnValue("A001", "qtyBranch001")).toBe("2.00");
    expect(screen.queryByRole("region", { name: "แหล่งข้อมูลสต็อกสาขา 004" })).not.toBeInTheDocument();
  });

  it("refreshes visible data each minute, skips hidden tabs, and aborts on unmount", async () => {
    vi.useFakeTimers();
    let quantity = 0;
    const view = renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: async () => hourlyResponse(quantity) });
    await act(async () => {});
    expect(global.fetch).toHaveBeenCalledTimes(1);
    quantity = -2;
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(productRow("A001").querySelector('[data-column-key="qtyBranch004"] span')).toHaveTextContent("-2.00");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const signal = global.fetch.mock.calls.at(-1)[1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it("invalidates both the old marketplace quantity and its available banner after a failed refresh", async () => {
    vi.useFakeTimers(); let calls=0;
    const data={records:[{...STOCK_RECORDS[0],qtyBranch004:1,posQtyBranch004:4,stock004:{basis:'hourly-and-shopee',posBasis:'hourly-calculated',
      shopee:{reservedQuantity:2,shippedUnpostedQuantity:1}}}],shopeeStock004:{status:'available'}};
    renderPanel({isOnlineMarketingStaff:false,branchCode:'004',fetchImplementation:async()=>{
      calls++;if(calls>1)throw Error('synthetic network failure');return {...makeJsonResponse([]),json:async()=>data};
    }});
    await act(async()=>{});expect(screen.getByText('หักยอดจอง Shopee แล้ว')).toBeInTheDocument();
    await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
    expect(productRow('A001').querySelector('[data-column-key="qtyBranch004"]')).toHaveTextContent('รอตรวจ');
    expect(screen.queryByText('หักยอดจอง Shopee แล้ว')).not.toBeInTheDocument();
  });

  it("exports the displayed Hourly zero and includes a separate source/baseline sheet", async () => {
    const user = userEvent.setup();
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: async () => hourlyResponse() });
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "ส่งออก Excel ตามขอบเขตสต็อกที่เลือก" }));
    await waitFor(() => expect(xlsxMock.aoaToSheet).toHaveBeenCalledTimes(2));
    const displayed = xlsxMock.aoaToSheet.mock.calls[0][0];
    expect(displayed[1][displayed[0].indexOf("สาขา 004")]).toBe(0);
    const sources = xlsxMock.aoaToSheet.mock.calls[1][0];
    expect(sources[1]).toEqual(["A001", "hourly-calculated", 4, "2026-10-22T06:02:00.000Z", "2026-10-22T01:22:00.000Z", ""]);
  });

  it("does not let an older slow response overwrite a newer search", async () => {
    const user = userEvent.setup();
    let resolveOld;
    let call = 0;
    renderPanel({ isOnlineMarketingStaff: false, branchCode: "004", fetchImplementation: () => {
      call += 1;
      return call === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(hourlyResponse(2));
    } });
    await user.type(screen.getByRole("searchbox", { name: "ค้นหาสต็อกสินค้า" }), "Alpha");
    await user.click(screen.getByRole("button", { name: "ค้นหา" }));
    await screen.findByText("A001");
    await act(async () => { resolveOld(hourlyResponse(99)); });
    expect(productRow("A001").querySelector('[data-column-key="qtyBranch004"] span')).toHaveTextContent("2.00");
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("groups branch-stock header controls without replacing their existing behavior", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel({ isOnlineMarketingStaff: false, branchCode: "004" });
    await screen.findByText("A001");

    const header = container.querySelector(".branch-stock-panel-header");
    const searchRow = header.querySelector(".branch-stock-search-row");
    const actionRow = header.querySelector(".branch-stock-action-row");
    const actionButtons = [...actionRow.querySelectorAll(":scope > button")];
    const searchInput = searchRow.querySelector('input[type="search"]');
    const searchButton = searchRow.querySelector('button[type="submit"]');

    expect(header).toContainElement(header.querySelector(".branch-stock-header-info"));
    expect(header).toContainElement(header.querySelector(".branch-stock-scope-bar"));
    expect(searchInput).toHaveAccessibleName("ค้นหาสต็อกสินค้า");
    expect(searchInput.parentElement).toBe(searchRow);
    expect(searchButton.parentElement).toBe(searchRow);
    expect(searchButton).toHaveClass("branch-stock-search-button");
    expect(actionButtons).toHaveLength(3);
    expect(actionButtons[0]).toHaveClass("excel-export-button");
    expect(actionButtons[1]).toHaveClass("request-entry-button");
    expect(actionButtons[2]).toHaveClass("branch-stock-refresh-button");

    await user.click(actionButtons[1]);
    expect(actionButtons[1]).toHaveClass("active");
  });

  it("defaults Online Marketing to branch 000 only", async () => {
    renderPanel({ branchCode: "" });
    await screen.findByText("A001");

    expect(screen.getByRole("button", { name: "แสดงสต็อกเฉพาะสาขา 000" })).toHaveAttribute("aria-pressed", "true");
    expect(headerKeys()).toContain("qtyBranch000");
    expect(headerKeys()).not.toContain("qtyTotalAllBranches");
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
    expect(headerKeys()).not.toContain("qtyTotalAllBranches");
    expect(scopedColumnValue("A001", `qtyBranch${branchCode}`)).toBe(expectedTotal);
    expect(scopedTotal("A001")).toBeUndefined();
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
    expect(headerKeys()).toContain("qtyTotalAllBranches");
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
    expect(matrix[0]).not.toContain("รวม");
    expect(matrix[1][matrix[0].indexOf("สาขา 004")]).toBe(4);
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
    expect(headerKeys()).toContain("qtyTotalAllBranches");
  });

  it("shows a total only when the selected scope contains multiple branches", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("A001");

    expect(scopedTotal("A001")).toBeUndefined();
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

  it("animates both rows when an admin moves a column with the arrow buttons", async () => {
    const user = userEvent.setup();
    const animationFrames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getMockRect() {
      const isColumnRow = this.parentElement?.classList.contains("branch-stock-column-list");
      const rowIndex = isColumnRow ? [...this.parentElement.children].indexOf(this) : 0;
      const top = rowIndex * 64;
      return {
        x: 0,
        y: top,
        top,
        right: 400,
        bottom: top + 56,
        left: 0,
        width: 400,
        height: 56,
        toJSON: () => ({}),
      };
    });

    renderPanel({ isAdminUser: true, isOnlineMarketingStaff: false, userId: "admin-animation" });
    await screen.findByText("A001");
    await user.click(screen.getByRole("button", { name: "จัดคอลัมน์" }));
    await user.click(screen.getByRole("button", { name: "ย้าย รหัสสินค้า ขึ้น" }));

    const firstTwoRows = [...document.querySelectorAll(".branch-stock-column-list li")].slice(0, 2);
    expect(firstTwoRows.map((row) => row.querySelector("strong").textContent))
      .toEqual(["รหัสสินค้า", "ชื่อสินค้าไทย"]);
    expect(firstTwoRows.map((row) => row.style.transform)).toEqual(
      expect.arrayContaining(["translateY(64px)", "translateY(-64px)"]),
    );
    expect(animationFrames).toHaveLength(2);

    animationFrames.forEach((runAnimationFrame) => runAnimationFrame(0));
    firstTwoRows.forEach((row) => {
      expect(row.style.transition).toContain("transform 320ms");
      expect(row.style.transform).toBe("translateY(0)");
      const transitionEnd = new Event("transitionend", { bubbles: true });
      Object.defineProperty(transitionEnd, "propertyName", { value: "transform" });
      row.dispatchEvent(transitionEnd);
      expect(row.style.transition).toBe("");
      expect(row.style.transform).toBe("");
    });
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

    expect(scopedColumnValue("M003", "qtyBranch000")).toBe("0.00");
    expect(scopedTotal("M003")).toBeUndefined();
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

    await user.type(screen.getByRole("searchbox", { name: "ค้นหาสต็อกสินค้า" }), "Alpha");
    await user.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("search=Alpha"),
      expect.any(Object),
    ));
    expect(await screen.findByText("A001")).toBeInTheDocument();
    expect(screen.queryByText("B002")).not.toBeInTheDocument();
  });
});
