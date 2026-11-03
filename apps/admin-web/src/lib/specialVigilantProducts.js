import {
  SPECIAL_VIGILANT_BRANCH,
  SPECIAL_VIGILANT_INTERVAL_MS,
  SPECIAL_VIGILANT_PRODUCTS,
} from "../data/specialVigilantProducts.js";

export const VIGILANT_RETRY_MS = 5 * 60 * 1000;

export function finiteQuantity(value) {
  if (!["string", "number"].includes(typeof value) || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function vigilantStorageKey(userId) {
  return `sc-special-vigilant:005:v1:${encodeURIComponent(String(userId))}`;
}

export function readVigilantSchedule(storage, key, now) {
  try {
    const value = JSON.parse(storage?.getItem(key) || "{}");
    const shown = Number(value.lastShownAt);
    const next = Number(value.nextCheckAt);
    return {
      lastShownAt: Number.isFinite(shown) && shown > 0 && shown <= now ? shown : 0,
      nextCheckAt: Number.isFinite(next) && next > 0 && next <= now + SPECIAL_VIGILANT_INTERVAL_MS ? next : 0,
    };
  } catch {
    return { lastShownAt: 0, nextCheckAt: 0 };
  }
}

export function writeVigilantSchedule(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // The open page retains its schedule if browser storage is unavailable.
  }
}

export function isVigilantPopupDue(lastShownAt, now) {
  return !lastShownAt || now - lastShownAt >= SPECIAL_VIGILANT_INTERVAL_MS;
}

export function buildVigilantRows(stockRecords, recommendations, products = SPECIAL_VIGILANT_PRODUCTS) {
  const stockByCode = new Map(stockRecords.map(row => [row.productCode, row]));
  return products.map(product => {
    const stock = stockByCode.get(product.productCode);
    const currentStock = finiteQuantity(stock?.qtyBranch005);
    const recommendation = recommendations.get(product.productCode);
    const sameUnit = !recommendation?.unit || String(recommendation.unit).trim() === String(stock?.unit || "").trim();
    const target = sameUnit ? finiteQuantity(recommendation?.targetQty) : null;
    const targetQty = target != null && target >= 0 ? target : null;
    const outOfStock = currentStock != null && currentStock <= 0;
    const belowTarget = currentStock != null && targetQty != null && currentStock < targetQty;
    return {
      ...product,
      name: stock?.productNameThai || product.name,
      unit: stock?.unit || recommendation?.unit || "",
      currentStock,
      targetQty,
      shortageQty: currentStock != null && targetQty != null ? Math.max(0, targetQty - currentStock) : null,
      alert: outOfStock || belowTarget,
      status: currentStock == null ? "unknown-stock" : currentStock < 0 ? "negative"
        : outOfStock ? "out-of-stock" : belowTarget ? "below-target"
          : targetQty == null ? "unknown-target" : "sufficient",
    };
  });
}

async function readJson(request, path, signal) {
  const response = await request(path, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  return payload;
}

// Exact-product reads reuse the website's normalized recommendation calculation.
export async function loadVigilantSnapshot({ request, signal, products = SPECIAL_VIGILANT_PRODUCTS }) {
  const stockRecords = [];
  let offset = 0;
  for (;;) {
    const payload = await readJson(request, `/api/branch-stock?limit=10000&offset=${offset}`, signal);
    if (!Array.isArray(payload.records)) throw new Error("Invalid stock response");
    stockRecords.push(...payload.records);
    offset += payload.records.length;
    const total = finiteQuantity(payload.pagination?.total);
    if (total == null || offset >= total) break;
    if (!payload.records.length) throw new Error("Incomplete stock response");
    if (products.every(product => stockRecords.some(row => row.productCode === product.productCode))) break;
  }

  const recommendations = new Map();
  async function readRecommendation(product) {
    const payload = await readJson(request,
      `/api/admin/stock-recommendations/005/${encodeURIComponent(product.productCode)}`, signal);
    if (payload.branchCode !== SPECIAL_VIGILANT_BRANCH
      || payload.productCode !== product.productCode
      || payload.meta?.reader?.servedReader !== "normalized") return false;
    const row = payload.recommendation;
    if (row?.branchCode === SPECIAL_VIGILANT_BRANCH && row.productCode === product.productCode) {
      recommendations.set(product.productCode, row);
    }
    return true;
  }

  // Probe once before a batch, so a disabled/unavailable reader gets one request.
  let available = false;
  if (products.length) {
    try { available = await readRecommendation(products[0]); } catch { /* Stock-only alerts remain usable. */ }
  }
  if (available) {
    let cursor = 1;
    async function worker() {
      while (cursor < products.length && !signal?.aborted) {
        const product = products[cursor++];
        try { await readRecommendation(product); } catch { /* Mark that target unavailable. */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, products.length - 1) }, worker));
  }
  const rows = buildVigilantRows(stockRecords, recommendations, products);
  return {
    checkedAt: Date.now(),
    rows,
    alerts: rows.filter(row => row.alert).sort((left, right) =>
      Number(right.currentStock <= 0) - Number(left.currentStock <= 0)
      || (right.shortageQty || 0) - (left.shortageQty || 0)),
    unavailableCount: rows.filter(row => row.currentStock == null || row.targetQty == null).length,
  };
}
