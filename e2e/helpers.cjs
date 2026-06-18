"use strict";

const { expect } = require("@playwright/test");
const cfg = require("./config.cjs");

async function login(page, user) {
  await page.goto("/");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("link", { name: "สต็อกสาขา" })).toBeVisible();
}

async function loginContext(browser, user) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return { context, page };
}

// ---- requester flows (on the stock page) ----

async function enableRequestMode(page) {
  await page.getByRole("link", { name: "สต็อกสาขา" }).click();
  const toggle = page.getByRole("button", { name: "ขอสินค้า", exact: true });
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
  await expect(page.getByRole("button", { name: "ปิดโหมดขอสินค้า" })).toBeVisible();
}

// Add one product to the cart, choosing quantity from a specific source branch.
async function addProductLine(page, { productCode, sourceBranch, qty }) {
  await page.getByRole("button", { name: `ขอสินค้า ${productCode}`, exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  const card = modal.locator(".branch-choice-card", { hasText: sourceBranch });
  await card.getByRole("spinbutton").fill(String(qty));
  await modal.getByRole("button", { name: "เพิ่มลงตะกร้าคำขอ" }).click();
  await expect(modal).toBeHidden();
}

// Go through cart -> review -> confirm. Returns the created batch public id.
async function submitCart(page) {
  await page.getByRole("link", { name: "ตะกร้า" }).click();
  await page.getByRole("button", { name: "สร้างคำขอสินค้า" }).click();
  await page.getByRole("button", { name: "ยืนยันการสร้างเอกสารคำขอสินค้า" }).click();
  await page.getByRole("button", { name: "ยืนยันและส่งคำขอ" }).click();
  await expect(page.getByRole("heading", { name: "สร้างคำขอสินค้าสำเร็จ" })).toBeVisible();
  const idText = await page.getByText(/SRQ-\d{8}-\d{3}-\d+/).first().innerText();
  const match = idText.match(/SRQ-\d{8}-\d{3}-\d+/);
  return match ? match[0] : null;
}

async function submitSingleBranchRequest(page, {
  productCode = "630010001",
  sourceBranch = "000",
  qty = 1,
} = {}) {
  await enableRequestMode(page);
  await addProductLine(page, { productCode, sourceBranch, qty });
  return submitCart(page);
}

async function apiJson(page, method, path, body) {
  const meResponse = await page.context().request.get(`${cfg.API_BASE}/admin/me`);
  expect(meResponse.ok()).toBeTruthy();
  const me = await meResponse.json();
  const response = await page.context().request.fetch(`${cfg.API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": me.csrf_token || "",
    },
    data: body,
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

// ---- responder flows (on the incoming page) ----

async function openIncomingRequest(page, requestingBranchLabel) {
  await page.getByRole("link", { name: "รับคำขอ" }).click();
  // open the first request card from the requesting branch
  const row = page.locator(".request-list-row", { hasText: requestingBranchLabel }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: "รายละเอียดคำขอเข้า" })).toBeVisible();
}

// Set every line to a status. perLine: array aligned to the rendered line order,
// each { status: 'full'|'partial'|'reject', qty?, reason? }.
const STATUS_LABEL = {
  full: "อนุมัติเต็มจำนวน",
  partial: "อนุมัติบางส่วน",
  reject: "ปฏิเสธ",
};

async function submitResponse(page, perLine) {
  const rows = page.locator(".response-line-row");
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const spec = perLine[i] || perLine[perLine.length - 1];
    const row = rows.nth(i);
    await row.locator("select").selectOption({ label: STATUS_LABEL[spec.status] });
    if (spec.status === "partial") {
      await row.getByPlaceholder("จำนวนอนุมัติ").fill(String(spec.qty));
    }
    if (spec.status !== "full" && spec.reason) {
      await row.getByPlaceholder("เหตุผล (จำเป็น)").fill(spec.reason);
    }
  }
  await page.getByRole("button", { name: "ส่งการตอบกลับ" }).click();
  await page.getByRole("button", { name: "ยืนยันและส่ง" }).click();
}

async function openMyRequest(page, batchId) {
  await page.getByRole("link", { name: "สถานะคำขอของฉัน", exact: true }).click();
  await page.getByPlaceholder(/ค้นหาเลขที่เอกสาร/).fill(batchId);
  await page.getByRole("button", { name: "ค้นหา" }).click();
  const card = page.locator(".request-list-row", { hasText: batchId }).first();
  await expect(card).toBeVisible();
  await card.click();
}

async function acknowledgeResponse(page) {
  await page.getByRole("button", { name: "รับทราบการตอบกลับ" }).click();
}

async function dispatchAll(page) {
  await page.getByRole("button", { name: "บันทึกการจัดส่ง" }).click();
}

async function receiveAll(page) {
  await page.getByRole("button", { name: "บันทึกการรับสินค้า" }).click();
}

async function generateDocument(page) {
  await page.getByRole("link", { name: "เอกสารแพ็กสินค้า" }).click();
  await page.getByRole("button", { name: "ออกเอกสาร", exact: true }).click();
  await expect(page.getByRole("button", { name: "พิมพ์", exact: true })).toBeVisible();
}

module.exports = {
  login,
  loginContext,
  enableRequestMode,
  addProductLine,
  submitCart,
  submitSingleBranchRequest,
  apiJson,
  openIncomingRequest,
  submitResponse,
  openMyRequest,
  acknowledgeResponse,
  dispatchAll,
  receiveAll,
  generateDocument,
};
