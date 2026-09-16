import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import useAdminView, { adminViewStorageKey } from "./useAdminView.js";

function ViewHarness() {
  const [view, setView] = useAdminView();
  return (
    <div>
      <output aria-label="current view">{view}</output>
      <button type="button" onClick={() => setView("branch-stock")}>Branch stock</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("useAdminView", () => {
  it("prefers the supported location view over a saved view", () => {
    window.localStorage.setItem(adminViewStorageKey, "branch-stock");
    window.history.replaceState({}, "", "/receipts#/stock-requests");
    render(<ViewHarness />);
    expect(screen.getByLabelText("current view")).toHaveTextContent("stock-requests");
  });

  it("uses a supported saved view when the location has no view", () => {
    window.localStorage.setItem(adminViewStorageKey, "branch-stock-history");
    render(<ViewHarness />);
    expect(screen.getByLabelText("current view")).toHaveTextContent("branch-stock-history");
  });

  it("falls back to receipts when location and storage are unsupported", () => {
    window.localStorage.setItem(adminViewStorageKey, "not-a-view");
    window.history.replaceState({}, "", "/not-a-route");
    render(<ViewHarness />);
    expect(screen.getByLabelText("current view")).toHaveTextContent("receipts");
  });

  it("persists view changes and synchronizes the canonical hash", async () => {
    const user = userEvent.setup();
    render(<ViewHarness />);
    await user.click(screen.getByRole("button", { name: "Branch stock" }));
    await waitFor(() => {
      expect(window.localStorage.getItem(adminViewStorageKey)).toBe("branch-stock");
      expect(window.location.hash).toBe("#/branch-stock");
    });
  });

  it("responds to hashchange and popstate navigation", async () => {
    render(<ViewHarness />);

    act(() => {
      window.history.pushState({}, "", "/#/sync-log");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByLabelText("current view")).toHaveTextContent("sync-log");

    act(() => {
      window.history.pushState({}, "", "/taxonomy");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByLabelText("current view")).toHaveTextContent("product-taxonomy");
  });
});
