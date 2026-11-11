import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Ky9ArchivePanel from "./Ky9ArchivePanel.jsx";
import { apiFetch } from "../lib/apiClient.js";
vi.mock("../lib/apiClient.js", () => ({ apiFetch: vi.fn() }));
const row = { row_key: "a".repeat(64), batch_id: "00000000-0000-4000-8000-000000000000", product_name: "ยาตัวอย่าง", product_code: "IC-TEST", branch_code: "005", received_date: "2026-07-02", lot: "000A", document_no: "TEST-TB", quantity: 2, quantity_display: "24 ขวด", base_quantity: 24, movement_type: "transfer_receipt", physical_lot_confirmed: false, batch_label: "ร่างตัวอย่าง" };
const json = body => ({ ok: true, json: async () => body });
beforeEach(() => {
 apiFetch.mockImplementation(path => Promise.resolve(json(path.includes("/batches") ? { batches: [{ id: "batch", period: "2026-07", row_count: 1, label: "ร่างตัวอย่าง", is_current: true }] } : path.includes("/rows/") ? { ...row, data: { human_verified: false, expiry: null, issues: ["ผู้ขายไม่ระบุ"] }, manifest: {} } : { total: 1, rows: [row] })));
});
afterEach(cleanup);
it("shows original quantities, lot proposal status, trace and preserved missing facts", async () => {
 render(<Ky9ArchivePanel />);
 expect(await screen.findByText("24 ขวด")).toBeVisible(); expect(screen.getByText("ล็อตเสนอให้ตรวจ")).toBeVisible();
 fireEvent.click(screen.getByRole("button", { name: "ดูหลักฐานรายการ" }));
 await screen.findByRole("region", { name: "หลักฐานของรายการ" });
 fireEvent.click(screen.getByText("ข้อมูลรายการและที่มาเดิม"));
 expect(screen.getByText(/"human_verified": false/)).toBeInTheDocument();
 expect(screen.getByText(/"expiry": null/)).toBeInTheDocument();
});
it("filters cross-month search, paginates server-side, and exports the applied filters only", async () => {
 render(<Ky9ArchivePanel />); await screen.findByText("24 ขวด");
 fireEvent.change(screen.getByLabelText("สินค้า / SKU / ล็อต / ใบรับ / ใบโอน"), { target: { value: " TEST TB " } });
 fireEvent.change(screen.getByLabelText("สาขา"), { target: { value: "005" } });
 const exportButton = screen.getByRole("button", { name: "ส่งต่อ ขย.10/11 (JSON)" }); expect(exportButton).toBeDisabled();
 fireEvent.submit(screen.getByRole("form", { name: "ค้นคลังร่าง" }));
 await waitFor(() => expect(apiFetch.mock.calls.some(([p]) => p.includes("q=+TEST+TB+") && p.includes("branch=005"))).toBe(true));
 await screen.findByText("24 ขวด");
 URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn();
 const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
 fireEvent.click(exportButton);
 await waitFor(() => expect(apiFetch.mock.calls.some(([p]) => p.includes("/handoff?") && p.includes("branch=005") && p.includes("q=+TEST+TB+"))).toBe(true));
 await waitFor(() => expect(click).toHaveBeenCalled()); click.mockRestore();
});
it("ignores an old detail response after a new search", async () => {
 let resolve;
 apiFetch.mockImplementation(path => path.includes("/rows/") ? new Promise(r => { resolve = r; }) : Promise.resolve(json(path.includes("/batches") ? { batches: [] } : { total: 1, rows: [row] })));
 render(<Ky9ArchivePanel />); await screen.findByText("24 ขวด"); fireEvent.click(screen.getByRole("button", { name: "ดูหลักฐานรายการ" }));
 fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" })); await screen.findByText("24 ขวด");
 resolve(json({ ...row, data: { label: "OLD DETAIL" } }));
 await waitFor(() => expect(screen.queryByRole("region", { name: "หลักฐานของรายการ" })).not.toBeInTheDocument());
});
it("keeps month-only expiry precision even when its saved date has an inferred day", async () => {
 apiFetch.mockResolvedValue(json({ total: 1, rows: [{ ...row, expiry: "2030-06-30", expiry_precision: "month" }] }));
 render(<Ky9ArchivePanel />);
 expect(await screen.findByText("หมดอายุ 06/2573")).toBeVisible();
 expect(screen.queryByText(/30\/06\/2573/)).not.toBeInTheDocument();
});
it("does not replace a newer search with a late old response even if abort is ignored", async () => {
 let resolveOld;
 apiFetch.mockImplementation(path => {
  if (path.includes("/batches")) return Promise.resolve(json({ batches: [] }));
  if (path.includes("q=OLD")) return new Promise(r => { resolveOld = r; });
  return Promise.resolve(json({ total: 1, rows: [{ ...row, product_name: path.includes("q=NEW") ? "NEW RESULT" : row.product_name }] }));
 });
 render(<Ky9ArchivePanel />); await screen.findByText("24 ขวด");
 const field = screen.getByLabelText("สินค้า / SKU / ล็อต / ใบรับ / ใบโอน"), form = screen.getByRole("form", { name: "ค้นคลังร่าง" });
 fireEvent.change(field, { target: { value: "OLD" } }); fireEvent.submit(form);
 await waitFor(() => expect(resolveOld).toBeTypeOf("function"));
 fireEvent.change(field, { target: { value: "NEW" } }); fireEvent.submit(form);
 await screen.findByText("NEW RESULT");
 await act(async () => { resolveOld(json({ total: 1, rows: [{ ...row, product_name: "OLD RESULT" }] })); });
 expect(screen.getByText("NEW RESULT")).toBeVisible(); expect(screen.queryByText("OLD RESULT")).not.toBeInTheDocument();
});
