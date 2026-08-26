import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BranchTargetFocusTable,
  GroupManagerFocusTable,
  focusProductTotalSold,
} from "./FocusProductsPanel";

const branchTargets = { "001": 10, "003": 10, "004": 10, "005": 10 };
const branchAchieved = { "001": true, "003": false, "004": true, "005": true };

function baseRow(overrides = {}) {
  return {
    id: 1,
    productCode: "P001",
    productName: "สินค้าทดสอบ",
    branchCodes: ["001", "003", "004", "005"],
    branchTargetsEffective: branchTargets,
    branchAchieved,
    soldByBranch: { "001": 11, "003": 7, "004": 13, "005": 11 },
    totalSold: 42,
    achieved: false,
    isActive: true,
    ...overrides,
  };
}

describe("focus product all-branch row totals", () => {
  it("uses each product's own branch breakdown when a shared-target row is split", () => {
    const row = baseRow();
    expect(focusProductTotalSold(row, { soldByBranch: { "001": 1, "003": 2, "004": 3, "005": 4 } })).toBe(10);
    expect(focusProductTotalSold(row)).toBe(42);
  });

  it("shows an exact per-product all-branch total in pharmacist/store-manager matrices", () => {
    const row = baseRow({
      products: [
        { productCode: "P001", productName: "สินค้า A", soldByBranch: { "001": 1, "003": 2, "004": 3, "005": 4 } },
        { productCode: "P002", productName: "สินค้า B", soldByBranch: { "001": 5, "003": 6, "004": 7, "005": 8 } },
      ],
      totalSold: 36,
    });
    const { container } = render(
      <BranchTargetFocusTable rows={[row]} isAdminUser onEdit={vi.fn()} onDelete={vi.fn()} restrictToBranch={null} />,
    );

    expect(screen.getByRole("columnheader", { name: "รวมทุกสาขา" })).toBeInTheDocument();
    expect([...container.querySelectorAll("tbody td.fp-total-sold-col")].map((cell) => cell.textContent)).toEqual(["10", "26"]);
  });

  it("does not expose an all-branch aggregate to a branch-restricted account", () => {
    const { container } = render(
      <BranchTargetFocusTable rows={[baseRow()]} isAdminUser={false} onEdit={vi.fn()} onDelete={vi.fn()} restrictToBranch="004" />,
    );

    expect(screen.queryByRole("columnheader", { name: "รวมทุกสาขา" })).not.toBeInTheDocument();
    expect(container.querySelector("tbody td.fp-total-sold-col")).toBeNull();
  });

  it("keeps the all-branch total visible when group manager switches to one branch", () => {
    render(<GroupManagerFocusTable rows={[baseRow()]} isAdminUser={false} onEdit={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "สาขา 001" }));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "รวมทุกสาขา" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "42" })).toHaveClass("fp-total-sold-col");
  });
});
