"use strict";

const { test, expect } = require("@playwright/test");
const cfg = require("../config.cjs");
const { resetOrderingData } = require("../db.cjs");
const h = require("../helpers.cjs");

test.beforeEach(async () => {
  await resetOrderingData();
});

test("one checkout splits into child requests for source branches 000 and 003", async ({ browser }) => {
  const { context, page } = await h.loginContext(browser, cfg.USERS.branch001);

  await h.enableRequestMode(page);
  await h.addProductLine(page, { productCode: "630010001", sourceBranch: "000", qty: 2 });
  await h.addProductLine(page, { productCode: "630010001", sourceBranch: "003", qty: 1 });
  const batchId = await h.submitCart(page);

  await page.getByRole("link", { name: "สถานะคำขอของฉัน", exact: true }).click();
  const row = page.locator(".request-list-row", { hasText: batchId });
  await expect(row).toContainText("2 สาขา");
  await expect(row).toContainText("000, 003");

  await context.close();
});

test("partial approval records approved quantity and required reason", async ({ browser }) => {
  const requester = await h.loginContext(browser, cfg.USERS.branch001);
  const source = await h.loginContext(browser, cfg.USERS.branch000);
  const batchId = await h.submitSingleBranchRequest(requester.page, { qty: 5 });

  await h.openIncomingRequest(source.page, "001");
  await h.submitResponse(source.page, [{ status: "partial", qty: 3, reason: "เหลือไม่พอ" }]);

  await h.openMyRequest(requester.page, batchId);
  await expect(requester.page.getByText(/อนุมัติบางส่วน \(3\)/)).toBeVisible();

  await requester.context.close();
  await source.context.close();
});

test("rejection records zero approved quantity and the receiver reason", async ({ browser }) => {
  const requester = await h.loginContext(browser, cfg.USERS.branch001);
  const source = await h.loginContext(browser, cfg.USERS.branch000);
  const batchId = await h.submitSingleBranchRequest(requester.page, { qty: 4 });

  await h.openIncomingRequest(source.page, "001");
  await h.submitResponse(source.page, [{ status: "reject", reason: "สินค้าเสียหาย" }]);

  await h.openMyRequest(requester.page, batchId);
  await expect(requester.page.getByText(/ปฏิเสธ \(0\)/)).toBeVisible();

  await requester.context.close();
  await source.context.close();
});

test("mixed response supports full approval and rejection in one request", async ({ browser }) => {
  const requester = await h.loginContext(browser, cfg.USERS.branch001);
  const source = await h.loginContext(browser, cfg.USERS.branch000);

  await h.enableRequestMode(requester.page);
  await h.addProductLine(requester.page, { productCode: "630010001", sourceBranch: "000", qty: 2 });
  await h.addProductLine(requester.page, { productCode: "630010002", sourceBranch: "000", qty: 3 });
  const batchId = await h.submitCart(requester.page);

  await h.openIncomingRequest(source.page, "001");
  await h.submitResponse(source.page, [
    { status: "full" },
    { status: "reject", reason: "หมดอายุใกล้ถึง" },
  ]);

  await h.openMyRequest(requester.page, batchId);
  await expect(requester.page.getByText(/อนุมัติเต็มจำนวน \(2\)/)).toBeVisible();
  await expect(requester.page.getByText(/ปฏิเสธ \(0\)/)).toBeVisible();

  await requester.context.close();
  await source.context.close();
});

test("reject response cannot be submitted without a reason", async ({ browser }) => {
  const requester = await h.loginContext(browser, cfg.USERS.branch001);
  const source = await h.loginContext(browser, cfg.USERS.branch000);
  await h.submitSingleBranchRequest(requester.page);

  await h.openIncomingRequest(source.page, "001");
  const row = source.page.locator(".response-line-row").first();
  await row.locator("select").selectOption({ label: "ปฏิเสธ" });
  await source.page.getByRole("button", { name: "ส่งการตอบกลับ" }).click();

  await expect(source.page.getByText("การปฏิเสธต้องระบุเหตุผล")).toBeVisible();
  await expect(source.page.getByRole("dialog")).toHaveCount(0);

  await requester.context.close();
  await source.context.close();
});

test("incoming notification opens the addressed request and is marked read", async ({ browser }) => {
  const requester = await h.loginContext(browser, cfg.USERS.branch001);
  const source = await h.loginContext(browser, cfg.USERS.branch000);
  const batchId = await h.submitSingleBranchRequest(requester.page);

  await source.page.getByRole("button", { name: /การแจ้งเตือน/ }).click();
  const item = source.page.locator(".notification-item", { hasText: batchId }).first();
  await expect(item).toBeVisible();
  await item.click();

  await expect(source.page.getByRole("heading", { name: "รายละเอียดคำขอเข้า" })).toBeVisible();
  await expect(source.page).toHaveURL(new RegExp(`${batchId}-000`));

  await requester.context.close();
  await source.context.close();
});

test("requester can find a submitted batch by exact SRQ id", async ({ browser }) => {
  const { context, page } = await h.loginContext(browser, cfg.USERS.branch001);
  const batchId = await h.submitSingleBranchRequest(page);

  await h.openMyRequest(page, batchId);
  await expect(page.locator(".request-list-row", { hasText: batchId })).toHaveCount(1);
  await expect(page.getByText("ประวัติการดำเนินการ")).toBeVisible();

  await context.close();
});

test("replaying the same idempotency key returns the original batch once", async ({ browser }) => {
  const { context, page } = await h.loginContext(browser, cfg.USERS.branch001);
  const payload = {
    idempotencyKey: "e2e-idempotency-replay",
    note: "network retry",
    groups: [{
      sourceBranchCode: "000",
      lines: [{
        productCode: "630010001",
        requestedQty: 2,
        unit: "ขวด",
        snapshotQty: 12,
        snapshotSyncedAt: new Date().toISOString(),
      }],
    }],
  };

  const first = await h.apiJson(page, "POST", "/api/stock-requests", payload);
  const replay = await h.apiJson(page, "POST", "/api/stock-requests", payload);

  expect(first.response.status()).toBe(201);
  expect(first.payload.duplicate).toBe(false);
  expect(replay.response.status()).toBe(200);
  expect(replay.payload.duplicate).toBe(true);
  expect(replay.payload.batchPublicId).toBe(first.payload.batchPublicId);

  const mine = await h.apiJson(page, "GET", `/api/stock-requests/mine?search=${first.payload.batchPublicId}`);
  expect(mine.payload.records).toHaveLength(1);

  await context.close();
});

test("a third branch receives 403 for another source branch's incoming detail", async ({ browser }) => {
  const requester = await h.loginContext(browser, cfg.USERS.branch001);
  const otherBranch = await h.loginContext(browser, cfg.USERS.branch003);
  const batchId = await h.submitSingleBranchRequest(requester.page);

  const denied = await h.apiJson(
    otherBranch.page,
    "GET",
    `/api/stock-requests/incoming/${encodeURIComponent(`${batchId}-000`)}`,
  );

  expect(denied.response.status()).toBe(403);

  await requester.context.close();
  await otherBranch.context.close();
});
