import React, { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminAccountActions, { formatBranchContextLabel } from "./AdminAccountActions.jsx";

const baseProps = {
  session: { user: { id: "admin", role: "admin" }, permissions: { allowed_branch_codes: null } },
  branchCode: "000",
  activeBranchName: "สำนักงานใหญ่",
  canSelectBranchContext: true,
  branchOptions: [],
  selectedBranchContext: "000",
  setSelectedBranchContext: vi.fn(),
  branchContextBusy: false,
  handleApplyBranchContext: vi.fn(),
  theme: "dark",
  setTheme: vi.fn(),
  accountMenuRef: createRef(),
  accountMenuOpen: false,
  setAccountMenuOpen: vi.fn(),
  handleLogout: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminAccountActions", () => {
  it("preserves branch context label formatting", () => {
    expect(formatBranchContextLabel("001", "สาขาหนึ่ง")).toBe("001 - สาขาหนึ่ง");
    expect(formatBranchContextLabel("001")).toBe("สาขา 001");
    expect(formatBranchContextLabel("", "")).toBe("ยังไม่ได้เลือกสาขา");
  });

  it("filters branch choices by the existing allowlist and applies a selected branch", async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      session: { user: { id: "staff", role: "staff" }, permissions: { allowed_branch_codes: ["001"] } },
      branchCode: "",
      activeBranchName: "",
      selectedBranchContext: "",
      branchOptions: [
        { branchCode: "001", branchName: "สาขาหนึ่ง" },
        { branchCode: "004", branchName: "สาขาสี่" },
      ],
    };

    render(<AdminAccountActions {...props} />);
    const select = screen.getByRole("combobox", { name: "เลือกสาขาที่ใช้งาน" });
    expect(screen.getByRole("option", { name: "001 - สาขาหนึ่ง" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "004 - สาขาสี่" })).not.toBeInTheDocument();

    await user.selectOptions(select, "001");
    expect(props.setSelectedBranchContext).toHaveBeenCalledWith("001");
    expect(props.handleApplyBranchContext).toHaveBeenCalledWith("001");
  });

  it("keeps theme and account-menu callbacks in App ownership", async () => {
    const user = userEvent.setup();
    render(<AdminAccountActions {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "สลับเป็นโหมดสว่าง" }));
    const themeUpdater = baseProps.setTheme.mock.calls[0][0];
    expect(themeUpdater("dark")).toBe("light");

    await user.click(screen.getByRole("button", { name: "เปิดเมนูบัญชีผู้ใช้" }));
    const menuUpdater = baseProps.setAccountMenuOpen.mock.calls[0][0];
    expect(menuUpdater(false)).toBe(true);
  });

  it("renders the existing open account menu and delegates logout", async () => {
    const user = userEvent.setup();
    render(<AdminAccountActions {...baseProps} accountMenuOpen />);
    expect(screen.getByRole("button", { name: "เปิดเมนูบัญชีผู้ใช้" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("menuitem", { name: "ออกจากระบบ" }));
    expect(baseProps.handleLogout).toHaveBeenCalledTimes(1);
  });
});
