import React from "react";
import { act, cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ky9DocumentsPanel, { BRANCHES } from "./Ky9DocumentsPanel.jsx";
import { apiFetch } from "../lib/apiClient.js";

vi.mock("../lib/apiClient.js", () => ({ apiFetch: vi.fn() }));
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const incidentId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  return { period: { period: "2026-10", version: 1, branches: Object.fromEntries(BRANCHES.map(code => [code, {
    coverage: "in_progress", review: "not_sent", reviewReference: "", pendingReason: "",
  }])) }, incidents: [{
    id: incidentId, version: 1, data: {
      title: "TEST-CASE-001 สินค้าไม่ตรงใบกำกับ", branchCodes: ["000"], supplier: "บริษัทตัวอย่าง", products: "สินค้าตัวอย่าง",
      invoiceRefs: "1,000 บาท", stockRefs: "TEST-RECEIPT-001", facts: "ยอดรวมตรง แต่สินค้าต่างกัน",
      hypotheses: "ยังไม่ทราบสาเหตุ", checks: "ตรวจข้ามบริษัทและยอดแยกแล้ว",
      evidence: "SCAN-TEST-P1", owner: "", nextAction: "รอข้อยุติ", impact: "", status: "investigating", blocksPeriod: true,
      resolutionType: "", conclusion: "",
    },
  }], notes: [], drafts: [], events: [], nextBefore: null };
}
const mount = (isAdminUser = true) => render(<Ky9DocumentsPanel isAdminUser={isAdminUser} csrfToken="csrf-test" />);
beforeEach(() => { apiFetch.mockReset(); });
afterEach(cleanup);

describe("admin document register", () => {
  it("does not render or request data for a non-admin", () => {
    const { container } = mount(false);
    expect(container).toBeEmptyDOMElement();
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("opens only an explicitly chosen period and creates it through the CSRF protected API", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(json({ period: null, incidents: [], notes: [], drafts: [], events: [] }));
    mount();
    await user.click(await screen.findByRole("button", { name: "เปิดงวดนี้" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
    const [path, options] = apiFetch.mock.calls.find(([, opts]) => opts?.method === "POST");
    expect(path).toMatch(/\/api\/admin\/ky9-documents\/20\d{2}-\d{2}$/);
    expect(options.headers["X-CSRF-Token"]).toBe("csrf-test");
    expect(JSON.parse(options.body)).toEqual({ reason: "เปิดงวดเอกสาร ขย.9" });
  });
  it("separates company coverage, blockers and onsite signature status", async () => {
    apiFetch.mockResolvedValue(json(fixture()));
    mount();
    await screen.findByRole("heading", { name: "TEST-CASE-001 สินค้าไม่ตรงใบกำกับ" });
    expect(screen.getByText("เคสที่ยังขวางการปิดงวด")).toBeVisible();
    expect(screen.getByText("สาขาที่ตรวจเทียบครบทั้งงวด")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "ความคืบหน้ารายสาขา" })).getAllByText("ยังไม่ส่งตรวจ")).toHaveLength(5);
    expect(screen.getAllByText("ยังไม่ลงทะเบียนร่าง PDF")).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "TEST-CASE-001 สินค้าไม่ตรงใบกำกับ" })).toBeVisible();
  });
  it("records unresolved closure without claiming stock correction or pharmacist signature", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((_path, opts) => Promise.resolve(json(opts?.method ? {} : fixture())));
    mount();
    await user.click(await screen.findByRole("button", { name: "เปิดรายละเอียด" }));
    const form = screen.getByRole("form", { name: "บันทึกเคส" });
    expect(within(form).getByLabelText("ตรวจอะไรไปแล้ว / ตัดความเป็นไปได้อะไรแล้ว")).toHaveValue("ตรวจข้ามบริษัทและยอดแยกแล้ว");
    await user.selectOptions(within(form).getByLabelText("สถานะเคส"), "closed");
    expect(within(form).getByLabelText("ยังขวางการปิดงวด")).not.toBeChecked();
    expect(within(form).getByLabelText("ยังขวางการปิดงวด")).toBeDisabled();
    expect(within(form).getByLabelText("ข้อยุติ")).toHaveValue("documented_unresolved");
    fireEvent.change(within(form).getByLabelText("ผลต่องวด / รายการและรุ่นเอกสารที่ต้องแก้"), { target: { value: "ร่าง R6 คงข้อแตกต่าง" } });
    fireEvent.change(within(form).getByLabelText("ข้อสรุปและวิธีจัดการต่อ"), { target: { value: "ตรวจครบแล้ว ยุติการสืบค้น" } });
    fireEvent.change(within(form).getByLabelText("เหตุผลการบันทึกครั้งนี้"), { target: { value: "ตามข้อยุติผู้ดูแล" } });
    await user.click(within(form).getByRole("button", { name: "บันทึกเคส" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([, opts]) => opts?.method === "PUT")).toBe(true));
    const [path, options] = apiFetch.mock.calls.find(([, opts]) => opts?.method === "PUT");
    expect(path).toContain("/incidents/" + incidentId);
    const body = JSON.parse(options.body);
    expect(body.expectedVersion).toBe(1);
    expect(body.data).toMatchObject({ status: "closed", blocksPeriod: false, resolutionType: "documented_unresolved", evidence: "SCAN-TEST-P1" });
    expect(body.data.human_verified).toBeUndefined();
    expect(body.data.closed_by).toBeUndefined();
  });
  it("keeps unsaved incident text when a competing admin has edited the record", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((_path, opts) => Promise.resolve(opts?.method ? json({ error: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก" }, 409) : json(fixture())));
    mount();
    await user.click(await screen.findByRole("button", { name: "เปิดรายละเอียด" }));
    fireEvent.change(screen.getByLabelText("เหตุผลการบันทึกครั้งนี้"), { target: { value: "เพิ่มข้อเท็จจริง" } });
    fireEvent.change(screen.getByLabelText("ข้อเท็จจริงที่พบ"), { target: { value: "ข้อความที่ยังไม่บันทึก" } });
    await user.click(screen.getByRole("button", { name: "บันทึกเคส" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ข้อมูลเปลี่ยนแล้ว");
    expect(screen.getByLabelText("ข้อเท็จจริงที่พบ")).toHaveValue("ข้อความที่ยังไม่บันทึก");
  });
  it("stores independent notes and optional same-period case links", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((_path, opts) => Promise.resolve(json(opts?.method ? {} : fixture())));
    mount();
    await screen.findByRole("heading", { name: "TEST-CASE-001 สินค้าไม่ตรงใบกำกับ" });
    await user.selectOptions(screen.getByLabelText("เชื่อมเคส (ไม่จำเป็น)"), incidentId);
    fireEvent.change(screen.getByLabelText("ข้อความ / คำยืนยัน / กติกาที่ตกลง"), { target: { value: "ไม่ต้องค้นทางเดิมซ้ำ" } });
    await user.click(screen.getByRole("button", { name: "เพิ่มหมายเหตุ" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([path]) => path.endsWith("/notes"))).toBe(true));
    const [, options] = apiFetch.mock.calls.find(([path]) => path.endsWith("/notes"));
    expect(JSON.parse(options.body)).toEqual({ body: "ไม่ต้องค้นทางเดิมซ้ำ", incidentId });
  });
  it("does not show an older response after the month changes", async () => {
    let finishOld;
    apiFetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const newBundle = fixture(); newBundle.period.period = "2026-09"; newBundle.incidents = [];
    apiFetch.mockResolvedValue(json(newBundle));
    mount();
    const month = screen.getByLabelText("เดือนเอกสาร");
    fireEvent.change(month, { target: { value: month.value === "09" ? "08" : "09" } });
    await screen.findByText("ไม่มีเคสในเงื่อนไขนี้");
    await act(async () => finishOld(json(fixture())));
    expect(screen.queryByText("TEST-CASE-001 สินค้าไม่ตรงใบกำกับ")).not.toBeInTheDocument();
  });
  it("requires review and save before turning prepared evidence into a case", async () => {
    const user = userEvent.setup();
    const bundle = fixture();
    bundle.preparedIncidents = [{ sourceKey: "synthetic-case-0", evidenceAsOf: "2026-10-23", data: bundle.incidents[0].data }];
    bundle.incidents = [];
    apiFetch.mockImplementation((_path, opts) => Promise.resolve(json(opts?.method ? {} : bundle)));
    mount();
    await user.click(await screen.findByText("บันทึกหลักฐานเดิมที่เตรียมให้ทบทวน (1)"));
    expect(apiFetch.mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false);
    await user.click(screen.getByRole("button", { name: "ทบทวนและสร้างเคส" }));
    expect(screen.getByLabelText("ข้อเท็จจริงที่พบ")).toHaveValue("ยอดรวมตรง แต่สินค้าต่างกัน");
    await user.click(screen.getByRole("button", { name: "บันทึกเคส" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(true));
    const [path, options] = apiFetch.mock.calls.find(([, opts]) => opts?.method === "POST");
    expect(path).toMatch(/\/incidents$/);
    expect(JSON.parse(options.body).sourceKey).toBe("synthetic-case-0");
  });
  it("shows an API outage without claiming the selected month is empty", async () => {
    apiFetch.mockResolvedValue(json({ error: "ฐานข้อมูลยังไม่พร้อม" }, 503));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("ฐานข้อมูลยังไม่พร้อม");
    expect(screen.queryByRole("button", { name: "เปิดงวดนี้" })).not.toBeInTheDocument();
  });
  it("registers a replacement draft against the current version", async () => {
    const user = userEvent.setup();
    const bundle = fixture();
    bundle.drafts = [{ id: incidentId, branch_code: "004", label: "R6", reference: "เดิม.pdf", is_current: true }];
    apiFetch.mockImplementation((_path, opts) => Promise.resolve(json(opts?.method ? {} : bundle)));
    mount();
    await user.click(await screen.findByText("ลงทะเบียนร่าง PDF / รุ่นเอกสาร"));
    await user.selectOptions(screen.getByLabelText("สาขาของเอกสาร"), "004");
    fireEvent.change(screen.getByLabelText("รุ่นเอกสาร"), { target: { value: "R7" } });
    fireEvent.change(screen.getByLabelText("ชื่อไฟล์ / แหล่งเก็บ PDF"), { target: { value: "ใหม่.pdf" } });
    fireEvent.change(screen.getByLabelText("เหตุผล / สิ่งที่แก้ในรุ่นนี้"), { target: { value: "แก้ยอด" } });
    await user.click(screen.getByRole("button", { name: "บันทึกรุ่นเอกสาร" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([path]) => path.endsWith("/drafts"))).toBe(true));
    const [, options] = apiFetch.mock.calls.find(([path]) => path.endsWith("/drafts"));
    expect(JSON.parse(options.body)).toMatchObject({ branchCode: "004", label: "R7", supersedes: incidentId, expectedVersion: 1 });
  });
});
