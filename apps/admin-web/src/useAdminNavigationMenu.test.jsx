import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAdminNavigationMenu from "./useAdminNavigationMenu.js";

const group = { id: "product-data" };

function NavigationHarness({ setView = vi.fn() }) {
  const menu = useAdminNavigationMenu(setView);
  return (
    <div>
      <output aria-label="open group">{menu.openNavGroup || "closed"}</output>
      <button type="button" onClick={() => menu.setOpenNavGroup(group.id)}>Open</button>
      <button type="button" onClick={() => menu.handleNavigate({ view: "branch-stock" })}>Navigate</button>
      <button type="button" onClick={() => menu.handleNavigate({ view: "sync-log", disabled: true })}>Disabled</button>
      <nav ref={menu.navigationMenuRef}>
        <div data-nav-group={group.id}>
          <button
            type="button"
            data-nav-trigger={group.id}
            onKeyDown={(event) => menu.handleNavTriggerKeyDown(event, group)}
          >
            Trigger
          </button>
          <button type="button" data-nav-item onKeyDown={(event) => menu.handleNavItemKeyDown(event, group.id)}>First</button>
          <button type="button" data-nav-item disabled>Disabled item</button>
          <button type="button" data-nav-item onKeyDown={(event) => menu.handleNavItemKeyDown(event, group.id)}>Last</button>
        </div>
      </nav>
    </div>
  );
}

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback();
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAdminNavigationMenu", () => {
  it("navigates valid items, ignores disabled items, and closes the group", async () => {
    const setView = vi.fn();
    render(<NavigationHarness setView={setView} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(setView).not.toHaveBeenCalled();
    expect(screen.getByLabelText("open group")).toHaveTextContent(group.id);

    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect(setView).toHaveBeenCalledWith("branch-stock");
    await waitFor(() => expect(screen.getByLabelText("open group")).toHaveTextContent("closed"));
  });

  it("opens from ArrowDown and focuses the first enabled item", () => {
    render(<NavigationHarness />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Trigger" }), { key: "ArrowDown" });
    expect(screen.getByLabelText("open group")).toHaveTextContent(group.id);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("cycles enabled items with arrows and Home/End, then restores trigger focus on Escape", () => {
    render(<NavigationHarness />);
    const trigger = screen.getByRole("button", { name: "Trigger" });
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "ArrowDown" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText("open group")).toHaveTextContent("closed");
  });

  it("dismisses an open group on outside pointer and window Escape", () => {
    render(<NavigationHarness />);
    const open = screen.getByRole("button", { name: "Open" });
    fireEvent.click(open);
    expect(screen.getByLabelText("open group")).toHaveTextContent(group.id);
    fireEvent.pointerDown(document.body);
    expect(screen.getByLabelText("open group")).toHaveTextContent("closed");

    fireEvent.click(open);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("open group")).toHaveTextContent("closed");
    expect(screen.getByRole("button", { name: "Trigger" })).toHaveFocus();
  });
});
