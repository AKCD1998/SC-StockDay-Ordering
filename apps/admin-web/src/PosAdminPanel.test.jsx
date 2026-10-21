import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PosAdminPanel from "./PosAdminPanel.jsx";
import { apiFetch } from "./lib/apiClient.js";
vi.mock("./lib/apiClient.js", () => ({ apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("POS admin panel", () => {
  it("shows audited eligibility and does not offer the unrestricted legacy installer", async () => {
    apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ auditedAt: "2026-10-21T10:00:00Z", installer: { version: "1.3.0", downloadUrl: null }, devices: [{ nodeId: "fixture", hostname: "TEST-POS", ipv4: "100.64.0.1", status: "pending", reason: "ยังตรวจไม่ได้" }] }) });
    render(<PosAdminPanel />);
    expect(await screen.findByText("TEST-POS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /กำลังเตรียมเผยแพร่/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /ดาวน์โหลด/ })).not.toBeInTheDocument();
  });
  it("does not display a device list after server-side authorization is denied", async () => {
    apiFetch.mockResolvedValue({ status: 403, ok: false });
    render(<PosAdminPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("สำหรับบัญชีแอดมินเท่านั้น");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
