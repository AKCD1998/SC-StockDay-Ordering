import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IncomingRequestsTab, MyRequestsTab, StockRequestsPanel } from "./App.jsx";

const DRAFT_LINE = {
  lineKey: "P001::004::กล่อง::STANDARD",
  sourceBranchCode: "004",
  requestMode: "STANDARD",
  productCode: "P001",
  productNameThai: "สินค้าทดสอบ",
  productNameEng: "Test product",
  barcode: "8850001",
  unit: "กล่อง",
  requestedQty: 2,
  snapshotQty: 8,
  snapshotSyncedAt: "2026-09-15T01:20:00.000Z",
  lineNote: "เก็บร่างนี้ไว้",
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function emptyRequestFetch() {
  return vi.fn((url) => {
    if (String(url).includes("/api/stock-requests/incoming")) {
      return Promise.resolve(jsonResponse({ records: [] }));
    }
    if (String(url).includes("/api/stock-requests/mine")) {
      return Promise.resolve(jsonResponse({ records: [] }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function requestPanelProps(overrides = {}) {
  return {
    branchCode: "001",
    isAdmin: false,
    csrfToken: "csrf-test",
    requestDraftItems: [DRAFT_LINE],
    setRequestDraftItems: vi.fn(),
    requestBatchNote: "หมายเหตุเดิม",
    setRequestBatchNote: vi.fn(),
    onSubmitDraft: vi.fn(),
    onClearDraft: vi.fn(),
    draftHydrating: false,
    draftSaveStatus: null,
    incomingNotifCount: 3,
    onIncomingNotificationsChanged: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

describe("StockRequestsPanel characterization", () => {
  it("starts non-admin users on My Requests, preserves the draft across tab switches, and shows the incoming badge", async () => {
    const user = userEvent.setup();
    global.fetch = emptyRequestFetch();

    render(<StockRequestsPanel {...requestPanelProps()} />);

    const mineTab = screen.getByRole("button", { name: /คำขอของฉัน/ });
    const incomingTab = screen.getByRole("button", { name: /รับคำขอ/ });
    expect(mineTab).toHaveClass("active");
    expect(incomingTab).not.toHaveClass("active");
    expect(screen.getByLabelText("3 คำขอใหม่")).toHaveTextContent("3");
    expect(await screen.findByText("สินค้าทดสอบ")).toBeInTheDocument();
    expect(screen.getByDisplayValue("หมายเหตุเดิม")).toBeInTheDocument();

    await user.click(incomingTab);
    expect(incomingTab).toHaveClass("active");
    expect(await screen.findByText("ยังไม่มีคำขอสินค้าเข้ามา")).toBeInTheDocument();
    expect(screen.queryByText("สินค้าทดสอบ")).not.toBeInTheDocument();

    await user.click(mineTab);
    expect(await screen.findByText("สินค้าทดสอบ")).toBeInTheDocument();
    expect(screen.getByDisplayValue("หมายเหตุเดิม")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/stock-requests/mine"), expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/stock-requests/incoming"), expect.anything());
  });

  it("starts admins on Incoming Requests and permits loading without a selected branch", async () => {
    global.fetch = emptyRequestFetch();

    render(<StockRequestsPanel {...requestPanelProps({ branchCode: "", isAdmin: true, incomingNotifCount: 120 })} />);

    expect(screen.getByRole("button", { name: /รับคำขอ/ })).toHaveClass("active");
    expect(screen.getByLabelText("120 คำขอใหม่")).toHaveTextContent("99+");
    expect(await screen.findByText("ยังไม่มีคำขอสินค้าเข้ามา")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "กรองตามสาขา" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/stock-requests/incoming"), expect.anything());
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/stock-requests/mine"), expect.anything());
  });

  it("fails closed for a non-admin without a selected branch and does not request either list", async () => {
    const user = userEvent.setup();
    global.fetch = emptyRequestFetch();

    render(<StockRequestsPanel {...requestPanelProps({ branchCode: "", requestDraftItems: [] })} />);

    expect(screen.getByText("ต้องเลือกสาขาที่ใช้งานก่อนจึงจะดูคำขอสินค้าของฉันได้")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /รับคำขอ/ }));
    expect(screen.getByText("ต้องเลือกสาขาที่ใช้งานก่อนจึงจะดูคำขอที่เข้ามาได้")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("MyRequestsTab characterization", () => {
  it("passes submit lifecycle callbacks through, disables the draft while submitting, and keeps it after an error", async () => {
    const user = userEvent.setup();
    global.fetch = emptyRequestFetch();
    let lifecycle;
    const onSubmitDraft = vi.fn((callbacks) => {
      lifecycle = callbacks;
      callbacks.onStart();
    });

    render(<MyRequestsTab {...requestPanelProps({ onSubmitDraft })} />);
    expect(await screen.findByText("สินค้าทดสอบ")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ยืนยันส่งคำขอสินค้า" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "ยืนยัน" }));

    expect(onSubmitDraft).toHaveBeenCalledTimes(1);
    expect(lifecycle).toEqual(expect.objectContaining({
      onStart: expect.any(Function),
      onSuccess: expect.any(Function),
      onError: expect.any(Function),
      onFinally: expect.any(Function),
    }));
    expect(within(dialog).getByRole("button", { name: "กำลังส่งคำขอ..." })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "จำนวน" })).toBeDisabled();

    await act(async () => {
      lifecycle.onError(new Error("availability changed"));
      lifecycle.onFinally();
    });

    expect(screen.getByText("availability changed")).toBeInTheDocument();
    expect(screen.getByText("สินค้าทดสอบ")).toBeInTheDocument();
    expect(screen.getByDisplayValue("หมายเหตุเดิม")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "จำนวน" })).toBeEnabled();
  });

  it("shows hydration and save-state feedback without rendering the draft during hydration", async () => {
    global.fetch = emptyRequestFetch();
    const { rerender } = render(<MyRequestsTab {...requestPanelProps({ draftHydrating: true })} />);

    expect(screen.getByText("กำลังโหลดร่างคำขอ...")).toBeInTheDocument();
    expect(screen.queryByText("สินค้าทดสอบ")).not.toBeInTheDocument();

    rerender(<MyRequestsTab {...requestPanelProps({ draftHydrating: false, draftSaveStatus: "saved" })} />);
    expect(await screen.findByText("บันทึกร่างแล้ว")).toBeInTheDocument();
    expect(screen.getByText("สินค้าทดสอบ")).toBeInTheDocument();
  });
});

describe("IncomingRequestsTab characterization", () => {
  it("shows loading, then the empty state after a successful empty response", async () => {
    let resolveFetch;
    global.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

    render(<IncomingRequestsTab branchCode="003" csrfToken="csrf-test" />);
    expect(screen.getByText("กำลังโหลด...")).toBeInTheDocument();

    await act(async () => {
      resolveFetch(jsonResponse({ records: [] }));
    });

    expect(await screen.findByText("ยังไม่มีคำขอสินค้าเข้ามา")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/stock-requests/incoming"), expect.anything());
  });

  it("keeps the existing empty-state fallback when the incoming request fails", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network unavailable")));

    render(<IncomingRequestsTab branchCode="003" csrfToken="csrf-test" />);

    expect(await screen.findByText("ยังไม่มีคำขอสินค้าเข้ามา")).toBeInTheDocument();
    expect(screen.queryByText("network unavailable")).not.toBeInTheDocument();
  });
});
