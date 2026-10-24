import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BranchStockPanel } from "../BranchStockPanel.jsx";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });
const props = {
  csrfToken: "csrf", userId: "admin", branchCode: "000", branchName: "HQ",
  requestDraftItems: [], setRequestDraftItems: () => {}, onClearDraft: () => {}, onNavigate: () => {},
};
it("only admins can open documents, and a role downgrade unmounts the document view", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ records: [], pagination: { total: 0 },
      period: null, incidents: [], notes: [], drafts: [], events: [] }),
  })));
  const { rerender } = render(<BranchStockPanel {...props} isAdminUser />);
  await user.click(screen.getByRole("tab", { name: "เอกสาร", exact: true }));
  expect(await screen.findByRole("heading", { name: "เอกสาร ขย.9" })).toBeVisible();
  screen.getByRole("tab", { name: "เอกสาร", exact: true }).focus();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "สินค้าและสต็อก" })).toHaveFocus();
  await user.keyboard("{End}");
  expect(await screen.findByRole("heading", { name: "เอกสาร ขย.9" })).toBeVisible();
  rerender(<BranchStockPanel {...props} isAdminUser={false} />);
  expect(screen.queryByRole("tab", { name: "เอกสาร" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "เอกสาร ขย.9" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "สต็อกแยกตามสาขา" })).toBeVisible();
});
