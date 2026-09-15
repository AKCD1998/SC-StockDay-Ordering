import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ReviewQueuePanel from "./ReviewQueuePanel.jsx";

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReviewQueuePanel characterization", () => {
  it("preserves queue filtering, ingredient supervision, category choice, and batch confirmation", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/admin/review-queue") {
        return response(200, {
          total: 1,
          allCategories: ["ยาแก้แพ้", "ยาปฏิชีวนะ"],
          records: [{
            productCode: "P-001",
            productNameThai: "สินค้าทดสอบ",
            productNameEng: "Test product",
            barcode: "885000000001",
            reviewStatus: "proposed",
            currentCategory: "ยาแก้แพ้",
            options: [{ category_name: "ยาแก้แพ้", similarity: 0.95 }],
          }],
        });
      }
      if (path.endsWith("/ingredient-supervision")) {
        return response(200, {
          ingredients: [{
            ingredientId: 7,
            displayName: "Loratadine",
            strengthValue: 10,
            strengthUnit: "mg",
            status: "confirmed",
            drugClasses: [{ name: "Antihistamine" }],
            indications: [{ name: "ภูมิแพ้" }],
          }],
          categorySuggestions: [],
        });
      }
      if (path === "/api/admin/review-queue/confirm-batch" && options.method === "POST") {
        return response(200, { updated: 1 });
      }
      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ReviewQueuePanel csrfToken="csrf-review" />);

    expect(screen.getByRole("heading", { name: "ตรวจหมวดสินค้า" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("รอตรวจ", { selector: "strong" }).closest("button"));
    fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจ →" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/review-queue\?limit=80&status=proposed$/),
      expect.objectContaining({ credentials: "include" }),
    ));
    expect(await screen.findByText("สินค้าทดสอบ")).toBeInTheDocument();
    expect(await screen.findByText("Loratadine")).toBeInTheDocument();
    expect(screen.getByText("10mg")).toBeInTheDocument();
    expect(container.querySelector(".rq-reviewing")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("/ ค้นหาหมวด..."), {
      target: { value: "ปฏิชีวนะ" },
    });
    fireEvent.click(screen.getByText("ยาปฏิชีวนะ").closest("button"));
    expect(await screen.findByRole("heading", { name: "สรุปก่อนยืนยัน" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "✓ ยืนยัน 1 รายการ" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/review-queue\/confirm-batch$/),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-review" }),
        body: JSON.stringify({
          decisions: [{
            productCode: "P-001",
            categoryName: "ยาปฏิชีวนะ",
            isNewCategory: false,
          }],
        }),
      }),
    ));
    expect(await screen.findByText("ยืนยันสำเร็จ 1 รายการ")).toBeInTheDocument();
  });

  it("preserves the bounded queue-load error without entering review mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(503)));

    const { container } = render(<ReviewQueuePanel csrfToken="csrf-review" />);
    fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจ →" }));

    expect(await screen.findByText("โหลดคิวไม่สำเร็จ: HTTP 503")).toBeInTheDocument();
    expect(container.querySelector(".rq-reviewing")).not.toBeInTheDocument();
  });

  it("preserves ingredient status mutation, CSRF, and cache refresh", async () => {
    let supervisionReads = 0;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/admin/review-queue") {
        return response(200, {
          total: 1,
          allCategories: [],
          records: [{
            productCode: "P-PATCH",
            productNameThai: "สินค้าทดสอบสถานะสาร",
            options: [{ category_name: "หมวดทดสอบ", similarity: 0.9 }],
          }],
        });
      }
      if (path.endsWith("/ingredient-supervision")) {
        supervisionReads += 1;
        return response(200, {
          ingredients: [{
            ingredientId: 17,
            displayName: "Test ingredient",
            status: supervisionReads > 1 ? "confirmed" : "proposed",
          }],
          categorySuggestions: [],
        });
      }
      if (path === "/api/admin/ingredient-dictionary/product-ingredients/P-PATCH/17" && options.method === "PATCH") {
        return response(200, { updated: 1 });
      }
      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueuePanel csrfToken="csrf-ingredient" />);
    fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจ →" }));
    expect(await screen.findByText("Test ingredient")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("ยืนยันสารนี้"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/ingredient-dictionary\/product-ingredients\/P-PATCH\/17$/),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-ingredient" }),
        body: JSON.stringify({ status: "confirmed" }),
      }),
    ));
    await waitFor(() => expect(supervisionReads).toBe(2));
    expect(await screen.findByText("ยืนยันแล้ว")).toBeInTheDocument();
  });

  it("preserves new-category creation, keyboard skip, and batch payload", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/admin/review-queue") {
        return response(200, {
          total: 2,
          allCategories: [],
          records: [
            {
              productCode: "P-NEW-1",
              productNameThai: "สินค้าสร้างหมวด",
              options: [{ category_name: "หมวดเดิม", similarity: 0.5 }],
            },
            {
              productCode: "P-NEW-2",
              productNameThai: "สินค้าข้ามด้วยคีย์บอร์ด",
              options: [{ category_name: "หมวดเดิม", similarity: 0.5 }],
            },
          ],
        });
      }
      if (path.endsWith("/ingredient-supervision")) {
        return response(200, { ingredients: [], categorySuggestions: [] });
      }
      if (path === "/api/admin/categories" && options.method === "POST") {
        return response(201, { created: true });
      }
      if (path === "/api/admin/review-queue/confirm-batch" && options.method === "POST") {
        return response(200, { updated: 1 });
      }
      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReviewQueuePanel csrfToken="csrf-new-category" />);
    fireEvent.click(screen.getByRole("button", { name: "เริ่มตรวจ →" }));
    expect(await screen.findByText("สินค้าสร้างหมวด")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ สร้างหมวดใหม่" }));
    fireEvent.change(screen.getByPlaceholderText("ชื่อหมวดใหม่..."), {
      target: { value: "หมวดใหม่ทดสอบ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "สร้าง + เลือก" }));

    expect(await screen.findByText("สินค้าข้ามด้วยคีย์บอร์ด")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "s" });
    expect(await screen.findByRole("heading", { name: "สรุปก่อนยืนยัน" })).toBeInTheDocument();
    expect(screen.getByText("1 รายการพร้อม")).toBeInTheDocument();
    expect(screen.getByText("1 ข้าม")).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/categories$/),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-new-category" }),
        body: JSON.stringify({ name: "หมวดใหม่ทดสอบ" }),
      }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "✓ ยืนยัน 1 รายการ" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/review-queue\/confirm-batch$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          decisions: [{
            productCode: "P-NEW-1",
            categoryName: "หมวดใหม่ทดสอบ",
            isNewCategory: true,
          }],
        }),
      }),
    ));
  });
});
