import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

vi.mock("./PosAdminPanel.jsx", () => ({ default: () => <div role="region" aria-label="POS admin fixture" /> }));

function restoreAs(role) {
  global.fetch = vi.fn(async (url) => {
    const path = String(url);
    let body = [];
    if (path.endsWith("/admin/me")) body = {
      user: { id: "fixture-user", role, branch_code: "001", effective_branch_code: "001" },
      csrf_token: "fixture", permissions: { allowed_branch_codes: ["001"] },
    };
    else if (path.endsWith("/api/admin/sync-status")) body = { latestRun: null };
    else if (path.includes("/api/sync/nightly-log")) body = { dates: [], branches: [], rows: {} };
    else if (path.endsWith("/api/stock-request-draft/me")) body = { draft: null };
    else if (path.includes("/api/stock-requests/")) body = { records: [] };
    else if (path.endsWith("/api/customer-preorders/unread-count")) body = { unreadCount: 0 };
    return { ok: true, status: 200, json: async () => body };
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/#/pos-admin");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete global.fetch; });

describe("POS admin direct links", () => {
  it("keeps the requested admin view while restoring an authorized session", async () => {
    restoreAs("admin");
    render(<App />);
    expect(await screen.findByRole("region", { name: "POS admin fixture" })).toBeVisible();
    expect(window.location.hash).toBe("#/pos-admin");
  });
  it("redirects a restored staff session away from the admin view", async () => {
    restoreAs("staff");
    render(<App />);
    await waitFor(() => expect(window.location.hash).not.toBe("#/pos-admin"));
    expect(screen.queryByRole("region", { name: "POS admin fixture" })).not.toBeInTheDocument();
  });
});
