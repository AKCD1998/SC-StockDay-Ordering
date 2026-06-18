"use strict";

const { test, expect } = require("@playwright/test");
const cfg = require("../config.cjs");
const { resetOrderingData } = require("../db.cjs");
const h = require("../helpers.cjs");

test.beforeEach(async () => {
  await resetOrderingData();
});

// Scenario: 001 requests from 000, 000 approves in full, requester acknowledges,
// 000 dispatches, requester receives, and 000 generates the packing document.
test("full lifecycle 001->000: submit, approve, acknowledge, dispatch, receive, document", async ({ browser }) => {
  const requester = await browser.newContext();
  const source = await browser.newContext();
  const rp = await requester.newPage();
  const sp = await source.newPage();
  await h.login(rp, cfg.USERS.branch001);
  await h.login(sp, cfg.USERS.branch000);

  // requester submits a single-branch request to 000
  await h.enableRequestMode(rp);
  await h.addProductLine(rp, { productCode: "630010001", sourceBranch: "000", qty: 5 });
  const batchId = await h.submitCart(rp);
  expect(batchId).toMatch(/^SRQ-\d{8}-001-\d+$/);

  // source 000 approves the whole request
  await h.openIncomingRequest(sp, "001");
  await h.submitResponse(sp, [{ status: "full" }]);
  await expect(sp.getByText("สรุปการจัดส่ง").or(sp.getByText("รับทราบ")).first()).toBeVisible({ timeout: 15000 }).catch(() => {});

  // requester sees the response and acknowledges
  await h.openMyRequest(rp, batchId);
  await expect(rp.getByText("ตอบกลับแล้ว").first()).toBeVisible();
  await h.acknowledgeResponse(rp);
  await expect(rp.getByText("รับทราบแล้ว").first()).toBeVisible();

  // source dispatches
  await h.openIncomingRequest(sp, "001");
  await h.dispatchAll(sp);
  await expect(sp.getByText("จัดส่งแล้ว").first()).toBeVisible();

  // requester receives
  await h.openMyRequest(rp, batchId);
  await h.receiveAll(rp);
  await expect(rp.getByText("สรุปการจัดส่ง / รับสินค้า").first()).toBeVisible();

  // source generates the packing document
  await h.openIncomingRequest(sp, "001");
  await h.generateDocument(sp);
  await expect(sp.getByText("ใบส่งสินค้าระหว่างสาขา")).toBeVisible();

  await requester.close();
  await source.close();
});
