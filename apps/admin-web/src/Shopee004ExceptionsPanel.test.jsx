import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Shopee004ExceptionsPanel from "./Shopee004ExceptionsPanel.jsx";
import { exceptionFixture, exceptionsFixture, reconciliationFixture } from "./test/shopee004Exceptions.fixture.js";

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const recorded = { recorded: true, duplicate: false, ruleId: "fixture-rule", ruleVersion: 2, requeuedOrders: 2 };
function mockReads(payload = exceptionsFixture(), onMutation = async () => response(recorded)) {
  const fetch = vi.fn(async (url, options = {}) => {
    if (options.method === "POST") return onMutation(url, options);
    return response(url.includes("/stock-reconciliation") ? reconciliationFixture : typeof payload === "function" ? payload(url) : payload);
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
async function selectMapping(user) {
  await screen.findByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" });
  await user.click(screen.getByRole("checkbox", { name: /สินค้า POS ตัวอย่าง/ }));
  await user.click(screen.getByRole("checkbox", { name: /คำอธิบายแพ็กจากหน้าสินค้าที่ตรวจแล้ว/ }));
  await user.click(screen.getByRole("checkbox", { name: /ทะเบียนรายการและตัวเลือกจาก Seller Centre/ }));
  await user.click(screen.getByRole("checkbox", { name: /หน่วยจากทะเบียน POS ที่ตรวจแล้ว/ }));
  await user.click(screen.getByRole("checkbox", { name: /ตรวจหลักฐานแล้วว่าแพ็ก/ }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin Shopee004 exception workflow", () => {
  it("never reads or exposes the approval page for a non-admin", () => {
    const fetch = mockReads(); render(<Shopee004ExceptionsPanel isAdminUser={false} csrfToken="fixture-csrf" />);
    expect(screen.getByRole("alert")).toHaveTextContent("ผู้ดูแลเท่านั้น"); expect(fetch).not.toHaveBeenCalled();
  });
  it("shows public product, variant, evidence and counts without raw order references", async () => {
    mockReads(); render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" });
    expect(screen.getByText("กล่อง 2 ชิ้น")).toBeInTheDocument();
    expect(screen.getByText("หน่วยขัดกัน")).toBeInTheDocument();
    expect(screen.getByText(/ออเดอร์ที่เกี่ยวข้อง/)).toBeInTheDocument();
    expect(screen.queryByText("fixture-exception-a")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).toBeDisabled();
  });
  it("requires explicit components, verified evidence and unit attestation before writing mapping only", async () => {
    const user = userEvent.setup(); const fetch = mockReads(); render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user);
    const button = screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }); expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1));
    const [url, options] = fetch.mock.calls.find(([, options]) => options.method === "POST");
    expect(url).toContain("/stock-exceptions/fixture-exception-a/mapping");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ expectedRevision: "fixture-revision-2", components: [{ productCode: "SYNTHETIC-A", quantityPerSale: 1, unit: "กล่อง" }], evidenceRefs: ["fixture-evidence", "fixture-catalog", "fixture-pos-unit"], acknowledgeUnitEvidence: true });
    expect(body).not.toHaveProperty("physicalEvidenceVerified"); expect(options.headers["X-CSRF-Token"]).toBe("fixture-csrf");
  });
  it("supports a verified multi-product bundle without implicitly selecting components", async () => {
    const user = userEvent.setup(); const row = exceptionFixture();
    row.proposedMatches.push({ productCode: "SYNTHETIC-B", productName: "แผ่นตรวจตัวอย่าง", unit: "กล่อง", quantityPerSale: 1, evidenceRefs: ["fixture-evidence"] });
    const fetch = mockReads(exceptionsFixture([row])); render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); await user.click(screen.getByRole("checkbox", { name: /แผ่นตรวจตัวอย่าง/ }));
    await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options.method === "POST")).toBe(true));
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body).components).toHaveLength(2);
  });
  it("does not approve a fuzzy proposal without verified unit evidence", async () => {
    mockReads(exceptionsFixture([exceptionFixture({ evidence: [ { kind: "source_item", reference: "fixture-evidence", label: "ข้อเสนอจากชื่อคล้ายกัน", verifiedAt: null } ] })]));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    const evidence = await screen.findByRole("checkbox", { name: /ข้อเสนอจากชื่อคล้ายกัน/ }); expect(evidence).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).toBeDisabled();
  });
  it("keeps cancellation or return review separate from mapping approval", async () => {
    mockReads(exceptionsFixture([exceptionFixture({ issueClass: "lifecycle", canApproveMapping: false, requiresLifecycleReview: true })]));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByText(/มีเรื่องการส่ง ยกเลิก หรือคืนที่ต้องตรวจแยก/);
    expect(screen.queryByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).not.toBeInTheDocument();
  });
  it("retains a successful read as timestamped reference while a later service error disables approval", async () => {
    const user = userEvent.setup(); let failed = false;
    vi.stubGlobal("fetch", vi.fn(async url => {
      if (url.includes("/stock-reconciliation")) return response(reconciliationFixture);
      return failed ? response({ error: { code: "TEMPORARY_UNAVAILABLE" } }, 503) : response(exceptionsFixture());
    }));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); failed = true; await user.click(screen.getByRole("button", { name: "อ่านใหม่" }));
    await screen.findByText(/คงรายการอ้างอิงที่อ่านสำเร็จ/);
    expect(screen.getByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).toBeDisabled();
  });
  it("keeps the exact mutation key and payload after ambiguous timeout, and retries only on explicit action", async () => {
    const user = userEvent.setup(); let calls = 0;
    const fetch = mockReads(exceptionsFixture(), async () => { if (++calls === 1) throw new Error("private upstream body"); return response({ ...recorded, recorded: false, duplicate: true }); });
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await screen.findByRole("button", { name: "ส่งคำขอเดิมซ้ำเพื่อยืนยันผล" });
    expect(calls).toBe(1); expect(screen.getByRole("button", { name: "อ่านใหม่" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).toBeDisabled();
    expect(screen.queryByText(/private upstream/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ส่งคำขอเดิมซ้ำเพื่อยืนยันผล" }));
    await waitFor(() => expect(calls).toBe(2));
    const mutations = fetch.mock.calls.filter(([, options]) => options.method === "POST");
    expect(mutations[0][1].body).toBe(mutations[1][1].body);
  });
  it("rechecks revision conflicts instead of replacing the rule blindly", async () => {
    const user = userEvent.setup(); let reads = 0;
    const fetch = mockReads(() => { reads += 1; return exceptionsFixture(); }, async () => response({ error: { code: "REVISION_CONFLICT" } }, 409));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await screen.findByText(/ข้อมูลเปลี่ยนแล้ว/);
    expect(reads).toBeGreaterThan(1); expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it("preserves selected draft components after a revision changes but requires unit evidence to be re-attested", async () => {
    const user = userEvent.setup(); let changed = false;
    mockReads(() => exceptionsFixture([exceptionFixture({ revision: changed ? "fixture-revision-3" : "fixture-revision-2" })]), async () => {
      changed = true; return response({ error: { code: "REVISION_CONFLICT" } }, 409);
    });
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await screen.findByText(/คงแบบร่างไว้ให้ตรวจ/);
    expect(screen.getByRole("checkbox", { name: /สินค้า POS ตัวอย่าง/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /คำอธิบายแพ็กจากหน้าสินค้าที่ตรวจแล้ว/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /ตรวจหลักฐานแล้วว่าแพ็ก/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).toBeDisabled();
  });
  it("shows a fail-closed bridge as unavailable without claiming a mutation occurred", async () => {
    const user = userEvent.setup(); const fetch = mockReads(exceptionsFixture(), async () => response({ definitiveNoWrite: true,
      error: { code: "BRIDGE_UNAVAILABLE", definitiveNoWrite: true, detailsWithheld: true } }, 503));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await screen.findByText("ช่องทางจัดการข้อยกเว้นยังไม่พร้อม");
    expect(screen.queryByRole("button", { name: "ส่งคำขอเดิมซ้ำเพื่อยืนยันผล" })).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it("shows bounded recovery waits and never starts retries from the page", async () => {
    const fetch = mockReads(exceptionsFixture([exceptionFixture({ issueClass: "temporary", reasonCode: "PROCESSING_TIMEOUT", canApproveMapping: false,
      recovery: { state: "retry_wait", attempts: 2, nextRetryAt: "2026-10-23T10:01:00Z", firstFailedAt: "2026-10-23T10:00:00Z", lastFailedAt: "2026-10-23T10:00:30Z" } })]));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByText("ประมวลผลไม่ทันเวลา");
    expect(screen.getByText(/รอลองใหม่ตามคิวเดิม · ล้มเหลวแล้ว 2 ครั้ง/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /สั่งลองใหม่/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("retains an unidentified exception without hiding the other identifiable records", async () => {
    mockReads(exceptionsFixture([exceptionFixture({ exceptionId: "fixture-unknown", productName: "", variantName: "", canApproveMapping: false, proposedMatches: [], evidence: [] }), exceptionFixture()]));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByRole("heading", { name: "ยังระบุสินค้าไม่ได้" });
    expect(screen.getByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" })).toBeInTheDocument();
  });
  it("does not report requeued zero as completed when the durable worker handoff is pending", async () => {
    const user = userEvent.setup(); mockReads(exceptionsFixture(), async () => response({ ...recorded, requeuedOrders: 0, requeuePending: true }));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await selectMapping(user); await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await screen.findByText("บันทึกกฎแล้ว · รอ worker รับรายการที่เกี่ยวข้องกลับคิวเดิม");
    expect(screen.queryByText(/ให้คิวเดิมตรวจต่อ 0/)).not.toBeInTheDocument();
  });
  it("reports omitted unreadable records while allowing only the valid evidence-backed record to be approved", async () => {
    const user = userEvent.setup(); const fetch = mockReads(exceptionsFixture([exceptionFixture()], { unreadableRecords: 1 }));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByText(/มี 1 รายการที่อ่านรายละเอียดไม่ได้ ต้องตรวจต่อ/);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await selectMapping(user); expect(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" }));
    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1));
    expect(fetch.mock.calls.find(([, options]) => options.method === "POST")[0]).toContain("/fixture-exception-a/mapping");
  });
  it("does not call an unreadable-only page an empty exception queue", async () => {
    mockReads(exceptionsFixture([], { unreadableRecords: 2 }));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByText(/มี 2 รายการที่อ่านรายละเอียดไม่ได้ ต้องตรวจต่อ/);
    expect(screen.queryByText("ไม่มีข้อยกเว้นในหน้านี้")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "บันทึกกฎจับคู่เท่านั้น" })).not.toBeInTheDocument();
  });
  it("requires a separate reason and acknowledgement to revoke a versioned rule", async () => {
    const user = userEvent.setup(); const fetch = mockReads(exceptionsFixture([exceptionFixture({ ruleId: "fixture-rule", ruleVersion: 3,
      auditHistory: [{ action: "approved", at: "2026-10-23T09:00:00Z", ruleVersion: 3, reason: "หลักฐานแพ็ก" }] })]), async () => response({ recorded: true, duplicate: false }));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByText("ประวัติและยกเลิกกฎ"); await user.click(screen.getByText("ประวัติและยกเลิกกฎ"));
    const button = screen.getByRole("button", { name: "ยกเลิกกฎนี้" }); expect(button).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "เหตุผลที่ยกเลิกกฎ" }), "unit_evidence_changed");
    await user.click(screen.getByRole("checkbox", { name: /ยกเลิกเฉพาะกฎ/ })); await user.click(button);
    await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options.method === "POST")).toBe(true));
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body)).toMatchObject({ expectedVersion: 3, reason: "unit_evidence_changed" });
  });
  it("keeps the stock-count boundary read-only and shows incomplete physical verification", async () => {
    const user = userEvent.setup(); const fetch = mockReads(); render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" });
    await user.click(screen.getByText("เตรียมสะสางยอดก่อนนับสต็อก"));
    expect(screen.getByText("ยอดตั้งต้นยังไม่ใช่ผลนับสต็อกจริง")).toBeInTheDocument();
    expect(screen.getByText(/ระบบจะไม่ rebaseline/)).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  });
  it("reads cursor pages without losing the previous page route", async () => {
    const user = userEvent.setup(); const fetch = mockReads(url => url.includes("cursor=")
      ? exceptionsFixture([exceptionFixture({ exceptionId: "fixture-b", productName: "หน้าสอง" })])
      : exceptionsFixture(undefined, { pagination: { hasMore: true, nextCursor: "fixture-cursor" } }));
    render(<Shopee004ExceptionsPanel isAdminUser csrfToken="fixture-csrf" />);
    await screen.findByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" }); await user.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
    await screen.findByRole("heading", { name: "หน้าสอง" });
    expect(fetch.mock.calls.some(([url]) => url.includes("cursor=fixture-cursor"))).toBe(true);
    await user.click(screen.getByRole("button", { name: "หน้าก่อน" }));
    await screen.findByRole("heading", { name: "สินค้าแพ็กตัวอย่าง" });
  });
});
