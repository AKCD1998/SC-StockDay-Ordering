const thaiDateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
});

const thaiDateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const integerFormatter = new Intl.NumberFormat("th-TH");

const currencyFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
});

export function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : thaiDateFormatter.format(date);
}

export function formatThaiDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : thaiDateTimeFormatter.format(date);
}

export function formatInteger(value) {
  return integerFormatter.format(Number(value || 0));
}

export function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return currencyFormatter.format(Number(value));
}

export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 10) return value || "-";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function toDateInputValue(date) {
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) return "";
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

export function normalizeDrugItems(input) {
  if (!input) return [];

  function normalizeDrugItem(item, index) {
    const name =
      item?.display_name ||
      item?.name ||
      item?.amed_full_name ||
      item?.amedFullName ||
      item?.amed_short_name ||
      item?.amedShortName ||
      item?.amed_copy_name ||
      item?.amedCopyName ||
      "";
    const rawQty = item?.qty ?? item?.quantity ?? 1;
    const qty = Number(rawQty);
    const uom = item?.uom_th || item?.uom || item?.unit || "";

    return {
      id: `${name || "drug"}-${item?.barcode || item?.sku_id || item?.skuId || index}`,
      name: name || "-",
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      uom,
    };
  }

  if (Array.isArray(input)) {
    return input.map((item, index) => normalizeDrugItem(item, index));
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return normalizeDrugItems(parsed);
      }
    } catch {
      return input
        .split(/[,|\n]/)
        .map((part, index) => part.trim())
        .filter(Boolean)
        .map((part, index) => ({
          id: `${part}-${index}`,
          name: part,
          qty: 1,
          uom: "",
        }));
    }
  }

  if (typeof input === "object") {
    return [normalizeDrugItem(input, 0)];
  }

  return [];
}
