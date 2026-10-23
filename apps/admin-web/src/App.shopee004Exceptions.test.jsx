import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

vi.mock("./Shopee004ExceptionsPanel.jsx", () => ({ default: () => <div role="region" aria-label="Shopee exception admin fixture" /> }));

function restoreAs(role) {
  global.fetch = vi.fn(async url => {
    const path = String(url); let body = [];
    if (path.endsWith("/admin/me")) body = { user: { id: "synthetic-user", role, branch_code: "004", effective_branch_code: "004" },
      csrf_token: "synthetic-csrf", permissions: { allowed_branch_codes: ["004"] } };
    else if (path.endsWith("/api/admin/sync-status")) body = { latestRun: null };
    else if (path.includes("/api/sync/nightly-log")) body = { dates: [], branches: [], rows: {} };
    else if (path.endsWith("/api/stock-request-draft/me")) body = { draft: null };
    else if (path.includes("/api/stock-requests/")) body = { records: [] };
    else if (path.endsWith("/api/customer-preorders/unread-count")) body = { unreadCount: 0 };
    return { ok: true, status: 200, json: async () => body };
  });
}
beforeEach(() => { window.localStorage.clear(); window.history.replaceState({}, "", "/#/shopee004-exceptions"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete global.fetch; });

describe("Shopee004 exception administrator direct links", () => {
  it("restores an authorized admin directly to the exception view", async () => {
    restoreAs("admin"); render(<App />);
    expect(await screen.findByRole("region", { name: "Shopee exception admin fixture" })).toBeVisible();
    expect(window.location.hash).toBe("#/shopee004-exceptions");
  });
  it("redirects a restored staff session and never mounts exception approvals", async () => {
    restoreAs("staff"); render(<App />);
    await waitFor(() => expect(window.location.hash).not.toBe("#/shopee004-exceptions"));
    expect(screen.queryByRole("region", { name: "Shopee exception admin fixture" })).not.toBeInTheDocument();
  });
});
