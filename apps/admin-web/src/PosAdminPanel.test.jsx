import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PosAdminPanel from "./PosAdminPanel.jsx";
import { apiFetch } from "./lib/apiClient.js";
vi.mock("./lib/apiClient.js", () => ({ apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("POS admin panel", () => {
  it("separates the latest download from dated release history and omits unrestricted downloads", async () => {
    apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({
      auditedAt: "2026-10-21T10:00:00Z", devices: [],
      installer: { version: "1.3.1", publishedAt: "2026-10-21T11:49:10Z", downloadUrl: "https://example.com/Setup-1.3.1.exe", highlights: ["ดูประวัติการซื้อแยกสมาชิก"] },
      previousReleases: [
        { version: "1.3.0", publishedAt: "2026-10-21T11:25:16Z", downloadUrl: "https://example.com/Setup-1.3.0.exe", highlights: ["ตรวจสิทธิ์เครื่องบริษัท"] },
        { version: "1.2.0", publishedAt: "2026-10-21T10:24:38Z", downloadUrl: null, highlights: ["โปรโมชั่นส่วนกลาง"], downloadNote: "รุ่นนี้ยังไม่มีระบบตรวจสิทธิ์เครื่องบริษัท" },
      ],
    }) });
    render(<PosAdminPanel />);
    expect(await screen.findByText("รุ่นล่าสุด · 1.3.1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ดาวน์โหลดสำหรับ Windows/ })).toHaveAttribute("href", "https://example.com/Setup-1.3.1.exe");
    expect(screen.getByText("21 ต.ค. 2569 เวลา 18:49 น.")).toHaveAttribute("datetime", "2026-10-21T11:49:10Z");
    expect(screen.getByText("ดูประวัติการซื้อแยกสมาชิก")).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "เวอร์ชันก่อนหน้า" });
    expect(within(history).getByRole("link", { name: "ดาวน์โหลด 1.3.0" })).toHaveAttribute("href", "https://example.com/Setup-1.3.0.exe");
    expect(within(history).getByText("21 ต.ค. 2569 เวลา 18:25 น.")).toBeInTheDocument();
    expect(within(history).queryByRole("link", { name: /1.2.0/ })).not.toBeInTheDocument();
    expect(within(history).getByText("รุ่นนี้ยังไม่มีระบบตรวจสิทธิ์เครื่องบริษัท")).toBeInTheDocument();
  });
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
