import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/#/stock-requests");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

describe("App session expiry handling", () => {
  it("returns to login with a Thai explanation and tears down polling after a stock-request 401", async () => {
    const realSetInterval = globalThis.setInterval;
    const realClearInterval = globalThis.clearInterval;
    const stockRequestPolls = [];
    const clearedIntervals = [];

    vi.spyOn(globalThis, "setInterval").mockImplementation((callback, delay, ...args) => {
      const intervalId = realSetInterval(callback, delay, ...args);
      if (delay === 30_000) stockRequestPolls.push(intervalId);
      return intervalId;
    });
    vi.spyOn(globalThis, "clearInterval").mockImplementation((intervalId) => {
      clearedIntervals.push(intervalId);
      return realClearInterval(intervalId);
    });

    global.fetch = vi.fn(async (url) => {
      const path = String(url);
      if (path.endsWith("/admin/me")) {
        return jsonResponse({
          user: {
            id: "staff001",
            role: "staff",
            branch_code: "001",
            effective_branch_code: "001",
          },
          csrf_token: "csrf-test",
          permissions: { allowed_branch_codes: ["001"] },
        });
      }
      if (path.endsWith("/api/stock-requests/incoming")) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      if (path.endsWith("/api/branches")) return jsonResponse([]);
      if (path.endsWith("/api/admin/stock-day")) return jsonResponse([]);
      if (path.endsWith("/api/admin/order-requests")) return jsonResponse([]);
      if (path.endsWith("/api/admin/sync-status")) return jsonResponse({ latestRun: null });
      if (path.endsWith("/api/stock-request-draft/me")) return jsonResponse({ draft: null });
      if (path.endsWith("/api/stock-requests/mine")) return jsonResponse({ records: [] });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<App />);

    expect(await screen.findByText("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "คำขอสินค้าระหว่างสาขา" })).not.toBeInTheDocument();

    await waitFor(() => expect(stockRequestPolls.length).toBeGreaterThan(0));
    expect(stockRequestPolls.every((intervalId) => clearedIntervals.includes(intervalId))).toBe(true);
  });
});

