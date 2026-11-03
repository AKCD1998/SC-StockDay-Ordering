import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpecialVigilantProducts from "./SpecialVigilantProducts.jsx";
import { loadVigilantSnapshot, vigilantStorageKey } from "./lib/specialVigilantProducts.js";
import { SPECIAL_VIGILANT_INTERVAL_MS } from "./data/specialVigilantProducts.js";

vi.mock("./lib/specialVigilantProducts.js", async importOriginal => ({
  ...await importOriginal(), loadVigilantSnapshot: vi.fn(),
}));
const row = { productCode: "IC-005814", name: "เมวาโลทิน", currentStock: 0, targetQty: 2, shortageQty: 2, status: "out-of-stock", unit: "กล่อง", alert: true };
const response = (alerts = [row], unavailableCount = 0) => ({
  checkedAt: Date.now(), rows: alerts.length ? alerts : [{ ...row, currentStock: 2, shortageQty: 0, status: "sufficient", alert: false }],
  alerts, unavailableCount,
});
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
function mount(props = {}) {
  return render(<SpecialVigilantProducts branchCode="005" userId="staff005" {...props} />);
}

describe("branch 005 vigilant popup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T02:00:00Z"));
    localStorage.clear();
    vi.mocked(loadVigilantSnapshot).mockReset();
    vi.mocked(loadVigilantSnapshot).mockImplementation(async () => response());
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true,
      value: vi.fn(function () { this.setAttribute("open", ""); }) });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true,
      value: vi.fn(function () { this.removeAttribute("open"); }) });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each(["000", "001", "003", "004", "", null])("does not request or display branch %s", async branchCode => {
    mount({ branchCode });
    await flush();
    expect(loadVigilantSnapshot).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows stock quantities and reopens only after two hours, including a reload", async () => {
    const first = mount();
    await flush();
    const dialog = screen.getByRole("dialog");
    const visibleTable = within(dialog).getAllByRole("table")[0];
    expect(within(visibleTable).getByText("เมวาโลทิน")).toBeVisible();
    expect(within(visibleTable).getByText("สต๊อกหมด")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ปิดแจ้งเตือนสินค้าเฝ้าระวัง" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    first.unmount();
    mount();
    await flush();
    expect(loadVigilantSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(SPECIAL_VIGILANT_INTERVAL_MS - 60_000); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadVigilantSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("does not pop up for sufficient stock, and can be inspected manually", async () => {
    vi.mocked(loadVigilantSnapshot).mockImplementation(async () => response([]));
    mount();
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /เฝ้าระวัง 005/ }));
    await flush();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("รายการที่อ่านข้อมูลครบมีสต๊อกเพียงพอ")).toBeVisible();
  });

  it("uses fresh data at the next interval and stops alerts after stock is replenished", async () => {
    mount();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "ปิดแจ้งเตือนสินค้าเฝ้าระวัง" }));
    vi.mocked(loadVigilantSnapshot).mockImplementation(async () => response([]));
    await act(async () => { await vi.advanceTimersByTimeAsync(SPECIAL_VIGILANT_INTERVAL_MS); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears branch-005 data when switching branch and discards late requests", async () => {
    let resolve;
    vi.mocked(loadVigilantSnapshot).mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = mount();
    view.rerender(<SpecialVigilantProducts branchCode="004" userId="staff005" />);
    await act(async () => { resolve(response()); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("retries a failed check after five minutes without displaying fabricated stock", async () => {
    vi.mocked(loadVigilantSnapshot).mockRejectedValueOnce(new Error("offline"));
    mount();
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("อ่านข้อมูลไม่ได้");
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("defers a hidden tab until it becomes visible", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    mount();
    await flush();
    expect(loadVigilantSnapshot).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    await flush();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("shares the popup cooldown with another tab that completed its check first", async () => {
    let resolve;
    vi.mocked(loadVigilantSnapshot).mockImplementation(() => new Promise(done => { resolve = done; }));
    mount();
    localStorage.setItem(vigilantStorageKey("staff005"), JSON.stringify({
      lastShownAt: Date.now(), nextCheckAt: Date.now() + SPECIAL_VIGILANT_INTERVAL_MS,
    }));
    await act(async () => { resolve(response()); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("serializes the popup claim using browser locks when available", async () => {
    const request = vi.fn(async (_name, _options, callback) => callback(null));
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    mount();
    await flush();
    expect(request).toHaveBeenCalledWith(vigilantStorageKey("staff005"), { ifAvailable: true }, expect.any(Function));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  });

  it("warns about unavailable thresholds and opens the existing branch stock view", async () => {
    vi.mocked(loadVigilantSnapshot).mockImplementation(async () => response([row], 3));
    const onNavigate = vi.fn();
    mount({ onNavigate });
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("ไม่ครบ 3 รายการ");
    fireEvent.click(screen.getByRole("button", { name: "เปิดสต๊อกสาขา 005" }));
    expect(onNavigate).toHaveBeenCalledWith("branch-stock");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps successful partial checks on the two-hour cadence", async () => {
    vi.mocked(loadVigilantSnapshot).mockImplementation(async () => response([row], 1));
    mount();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "ปิดแจ้งเตือนสินค้าเฝ้าระวัง" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(loadVigilantSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
