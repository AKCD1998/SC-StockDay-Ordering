import React, { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminNavigation from "./AdminNavigation.jsx";

const baseProps = {
  navigationGroups: [],
  view: "receipts",
  openNavGroup: null,
  navigationMenuRef: createRef(),
  stockRequestBadgeCount: 0,
  syncFailureBadgeCount: 0,
  preorderBadgeCount: 0,
  handleNavigate: vi.fn(),
  closeNavGroup: vi.fn(),
  setOpenNavGroup: vi.fn(),
  handleNavTriggerKeyDown: vi.fn(),
  handleNavItemKeyDown: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminNavigation", () => {
  it("renders an open dropdown, preserves active state, and caps request badges", async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      view: "stock-requests",
      openNavGroup: "product-data",
      stockRequestBadgeCount: 120,
      navigationGroups: [{
        id: "product-data",
        label: "ข้อมูลสินค้า",
        shortLabel: "PR",
        items: [
          { label: "ใบรับสินค้า", view: "receipts", description: "ตรวจใบรับสินค้า" },
          { label: "คำขอสินค้า", view: "stock-requests", description: "ส่งและติดตามคำขอสินค้า" },
        ],
      }],
    };

    render(<AdminNavigation {...props} />);

    const trigger = screen.getByRole("button", { name: /ข้อมูลสินค้า/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveClass("active", "open");
    expect(screen.getAllByText("99+")).toHaveLength(2);
    const activeItem = screen.getByRole("menuitem", { name: /คำขอสินค้า/ });
    expect(activeItem).toHaveClass("active");

    await user.click(activeItem);
    expect(props.handleNavigate).toHaveBeenCalledWith(props.navigationGroups[0].items[1]);
  });

  it("opens and closes dropdown groups through the existing callbacks", async () => {
    const user = userEvent.setup();
    const group = {
      id: "product-data",
      label: "ข้อมูลสินค้า",
      shortLabel: "PR",
      items: [
        { label: "ใบรับสินค้า", view: "receipts", description: "ตรวจใบรับสินค้า" },
        { label: "สต็อกสาขา", view: "branch-stock", description: "สถานะสต็อก" },
      ],
    };
    const { rerender } = render(<AdminNavigation {...baseProps} navigationGroups={[group]} />);
    await user.click(screen.getByRole("button", { name: /ข้อมูลสินค้า/ }));
    expect(baseProps.setOpenNavGroup).toHaveBeenCalledWith("product-data");

    rerender(<AdminNavigation {...baseProps} navigationGroups={[group]} openNavGroup="product-data" />);
    await user.click(screen.getByRole("button", { name: /ข้อมูลสินค้า/ }));
    expect(baseProps.closeNavGroup).toHaveBeenCalledWith("product-data", { restoreFocus: true });
  });

  it("keeps single-item navigation and preorder notification behavior", async () => {
    const user = userEvent.setup();
    const item = { label: "พรีออเดอร์", view: "preorder", description: "รับรายการจอง" };
    render(
      <AdminNavigation
        {...baseProps}
        navigationGroups={[{ id: "customer-relations", label: "ลูกค้าสัมพันธ์", shortLabel: "CR", items: [item] }]}
        preorderBadgeCount={4}
      />,
    );

    const button = screen.getByRole("button", { name: /ลูกค้าสัมพันธ์/ });
    expect(button).toHaveTextContent("4");
    await user.click(button);
    expect(baseProps.handleNavigate).toHaveBeenCalledWith(item);
  });
});
