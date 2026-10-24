import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";

function restoreAs(role) {
  vi.stubGlobal("fetch", vi.fn(async url => {
    const path = String(url);
    let body = [];
    if (path.endsWith("/admin/me")) body = {
      user: { id: "synthetic-user", role, branch_code: "001", effective_branch_code: "001" },
      csrf_token: "synthetic-csrf", permissions: { allowed_branch_codes: ["001"] },
    };
    else if (path.includes("/api/admin/ky9-documents/")) body = {
      period: null, incidents: [], notes: [], drafts: [], events: [],
    };
    else if (path.includes("/api/branch-stock")) body = { records: [], pagination: { total: 0 } };
    else if (path.endsWith("/api/admin/sync-status")) body = { latestRun: null };
    else if (path.includes("/api/sync/nightly-log")) body = { dates: [], branches: [], rows: {} };
    else if (path.endsWith("/api/stock-request-draft/me")) body = { draft: null };
    else if (path.includes("/api/stock-requests/")) body = { records: [] };
    else if (path.endsWith("/api/customer-preorders/unread-count")) body = { unreadCount: 0 };
    return { ok: true, status: 200, json: async () => body };
  }));
}
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/#/branch-stock");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("KY9 main navigation", () => {
  it("opens documents from the main menu while stock has no nested tab bar", async () => {
    restoreAs("admin");
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "สต็อกแยกตามสาขา" })).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "สต็อกและเอกสาร" })).not.toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "เมนูหลัก" });
    await user.click(within(menu).getByRole("button", { name: "เอกสาร ขย.9", exact: true }));
    expect(await screen.findByRole("heading", { name: "เอกสาร ขย.9" })).toBeVisible();
    expect(window.location.hash).toBe("#/ky9-documents");
    expect(within(menu).getByRole("button", { name: "เอกสาร ขย.9", exact: true })).toHaveClass("active");
    expect(screen.queryByRole("heading", { name: "สต็อกแยกตามสาขา" })).not.toBeInTheDocument();
  });

  it("restores an admin directly into the standalone documents page", async () => {
    restoreAs("admin");
    window.history.replaceState({}, "", "/#/ky9-documents");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "เอกสาร ขย.9" })).toBeVisible();
    expect(window.location.hash).toBe("#/ky9-documents");
  });

  it("redirects staff away from a document link without requesting document data", async () => {
    restoreAs("staff");
    window.history.replaceState({}, "", "/#/ky9-documents");
    render(<App />);
    await waitFor(() => expect(window.location.hash).not.toBe("#/ky9-documents"));
    expect(screen.queryByRole("heading", { name: "เอกสาร ขย.9" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เอกสาร ขย.9", exact: true })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/admin/ky9-documents/"))).toBe(false);
  });

  it("keeps staff on the stock page without the removed tab bar", async () => {
    restoreAs("staff");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "สต็อกแยกตามสาขา" })).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "สต็อกและเอกสาร" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "เอกสาร ขย.9", exact: true })).not.toBeInTheDocument();
  });
});
