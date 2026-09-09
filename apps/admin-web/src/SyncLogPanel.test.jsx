import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SyncLogPanel from "./SyncLogPanel.jsx";

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SyncLogPanel characterization", () => {
  it("preserves endpoints, Thai controls, defaults, tab switching, and refresh", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/api/sync/hourly-log")) {
        return response(200, {
          hours: ["2026-09-09 08:00"],
          branches: ["001"],
          rows: {
            "001": {
              "2026-09-09 08:00": { status: "success", totalSent: 12 },
            },
          },
        });
      }
      return response(200, {
        dates: ["2026-09-09"],
        branches: ["001"],
        rows: {
          "001": {
            "2026-09-09": { status: "success" },
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SyncLogPanel onUnauthorized={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "ประวัติ Sync" })).toBeInTheDocument();
    expect(screen.getByText(/สถานะการซิงก์ข้อมูลจาก Mother PC/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("14");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/sync\/nightly-log\?days=14$/),
      expect.objectContaining({ credentials: "include" }),
    ));
    expect(await screen.findByTitle("สาขา 001 · 2026-09-09 · สำเร็จ")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "30" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/sync\/nightly-log\?days=30$/),
      expect.any(Object),
    ));

    fireEvent.click(screen.getByRole("button", { name: /รายชั่วโมง/ }));
    expect(screen.getByText(/สถานะการส่งข้อมูลรายชั่วโมงจาก Mother PC/)).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("24");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/sync\/hourly-log\?hours=24$/),
      expect.any(Object),
    ));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "48" } });
    fireEvent.click(screen.getByRole("button", { name: /รีเฟรช/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/sync\/hourly-log\?hours=48$/),
      expect.any(Object),
    ));
  });

  it("preserves the 401 callback and Thai session-expired error", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => response(401)));

    const { container } = render(<SyncLogPanel onUnauthorized={onUnauthorized} />);

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector(".notice.error.compact"))
      .toHaveTextContent("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่"));
  });
});
