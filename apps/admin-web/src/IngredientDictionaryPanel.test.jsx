import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import IngredientDictionaryPanel from "./IngredientDictionaryPanel.jsx";

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

describe("IngredientDictionaryPanel characterization", () => {
  it("preserves the default dictionary request, search, selection, and detail request", async () => {
    const fetchMock = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/ingredients/7")) {
        return response(200, {
          ingredient: {
            ingredientId: 7,
            canonicalName: "loratadine",
            displayName: "Loratadine",
            status: "active",
            synonyms: [],
            drugClasses: [],
            indications: [],
            categoryRules: [],
          },
        });
      }
      if (parsed.pathname.endsWith("/categories")) {
        return response(200, { records: [] });
      }
      if (parsed.pathname.endsWith("/ingredients")) {
        return response(200, {
          total: 1,
          records: [{
            ingredientId: 7,
            displayName: "Loratadine",
            status: "active",
            drugClassNames: "Antihistamine",
            synonymCount: 2,
            drugClassCount: 1,
            indicationCount: 1,
            categoryRuleCount: 1,
          }],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<IngredientDictionaryPanel csrfToken="csrf-ingredient" />);

    expect(screen.getByRole("heading", { name: "พจนานุกรมสารสำคัญ" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/ingredient-dictionary\/ingredients\?limit=100$/),
      expect.objectContaining({ credentials: "include" }),
    ));
    fireEvent.click(await screen.findByRole("button", { name: /Loratadine/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/ingredient-dictionary\/ingredients\/7$/),
      expect.objectContaining({ credentials: "include" }),
    ));
    expect(await screen.findByText("loratadine")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("ค้นหา: ชื่อสาร / คำพ้อง / กลุ่มยา / ข้อบ่งใช้"), {
      target: { value: "  lora  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "ค้นหา" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/ingredients\?limit=100&search=lora$/),
      expect.any(Object),
    ));
  });

  it("preserves matched-product loading and the CSRF-protected confirmation payload", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/ingredients")) {
        return response(200, { total: 0, records: [] });
      }
      if (parsed.pathname.endsWith("/matched-products")) {
        return response(200, {
          total: 1,
          records: [{
            productCode: "P-002",
            productName: "สินค้าจับคู่",
            ingredientId: 9,
            matchedIngredient: "Cetirizine",
            strengthValue: 10,
            strengthUnit: "mg",
            matchSource: "seed",
            ingredientStatus: "proposed",
          }],
        });
      }
      if (parsed.pathname.endsWith("/product-ingredients/P-002/9") && options.method === "PATCH") {
        return response(200, {});
      }
      throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<IngredientDictionaryPanel csrfToken="csrf-ingredient" />);
    fireEvent.click(screen.getByRole("button", { name: "สินค้าที่จับคู่แล้ว" }));

    expect(await screen.findByText("สินค้าจับคู่")).toBeInTheDocument();
    fireEvent.click(container.querySelector(".id-confirm-btn.ok"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/ingredient-dictionary\/product-ingredients\/P-002\/9$/),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-ingredient" }),
        body: JSON.stringify({ status: "confirmed" }),
      }),
    ));
    await waitFor(() => expect(container.querySelector(".notice.success.compact"))
      .toHaveTextContent("ยืนยันแล้ว"));
  });
});
