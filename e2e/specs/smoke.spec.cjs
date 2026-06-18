"use strict";

const { test, expect } = require("@playwright/test");
const cfg = require("../config.cjs");
const { login } = require("../helpers.cjs");

test("branch user logs in and sees the branch stock view", async ({ page }) => {
  await login(page, cfg.USERS.branch001);

  // session-derived branch identity is shown in the shell
  await expect(page.getByText("คำขอสินค้าระหว่างสาขา")).toBeVisible();

  // seeded products appear in the stock table
  await expect(page.getByText("เซทิริซีน").first()).toBeVisible();
});
