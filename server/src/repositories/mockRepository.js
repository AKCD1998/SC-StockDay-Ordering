import { branches, orderRequests, products, staffAccounts, syncErrors, syncRuns } from "../mockData.js";
import { buildStockDayRow } from "../stockDay.js";
import { makeId, normalizeQuery } from "../utils.js";

export class MockRepository {
  constructor() {
    this.branches = structuredClone(branches);
    this.products = structuredClone(products);
    this.orderRequests = structuredClone(orderRequests);
    this.staffAccounts = structuredClone(staffAccounts);
    this.syncRuns = structuredClone(syncRuns);
    this.syncErrors = structuredClone(syncErrors);
  }

  async getBranches() {
    return this.branches;
  }

  async searchProducts(query) {
    const q = normalizeQuery(query);
    if (!q) return this.products.slice(0, 20);
    return this.products.filter((product) =>
      [product.productCode, product.barcode, product.productName].some((field) =>
        normalizeQuery(field).includes(q),
      ),
    );
  }

  async getProductSummary(productCode, periodDays) {
    const product = this.products.find((item) => item.productCode === productCode);
    if (!product) return null;
    const demand = this.aggregatePendingDemand().get(productCode) || {
      pendingRequestedQty: 0,
      pendingRequestLines: 0,
      pendingRequestBranches: 0,
    };
    return buildStockDayRow(
      {
        productCode: product.productCode,
        productName: product.productName,
        barcode: product.barcode,
        unit: product.unit,
        currentStock: product.stockCurrent,
        soldQtyPeriod: product.soldQtyPeriod,
        purchasedQtyPeriod: product.purchasedQtyPeriod,
        minStock: product.minStock,
        maxStock: product.maxStock,
        leadTimeDays: product.leadTimeDays,
        supplier: product.supplier,
        pendingRequestedQty: demand.pendingRequestedQty,
        pendingRequestLines: demand.pendingRequestLines,
        pendingRequestBranches: demand.pendingRequestBranches,
      },
      periodDays,
    );
  }

  aggregatePendingDemand() {
    const summary = new Map();

    for (const request of this.orderRequests.filter((item) => item.status === "submitted")) {
      const seenInRequest = new Set();
      for (const item of request.items) {
        const current = summary.get(item.productCode) || {
          pendingRequestedQty: 0,
          pendingRequestLines: 0,
          pendingRequestBranches: 0,
        };
        current.pendingRequestedQty += Number(item.requestedQty || 0);
        current.pendingRequestLines += 1;
        if (!seenInRequest.has(item.productCode)) {
          current.pendingRequestBranches += 1;
          seenInRequest.add(item.productCode);
        }
        summary.set(item.productCode, current);
      }
    }

    return summary;
  }

  async getStockDay(periodDays) {
    return Promise.all(this.products.map((product) => this.getProductSummary(product.productCode, periodDays)));
  }

  async createOrderRequest(payload) {
    const branch = this.branches.find((item) => item.branchCode === payload.branchCode);
    const request = {
      id: makeId("req"),
      branchCode: payload.branchCode,
      branchName: branch?.branchName || payload.branchCode,
      requestedBy: payload.requestedBy || "Placeholder Staff",
      requestedAt: new Date().toISOString(),
      status: "submitted",
      note: payload.note || "",
      items: payload.items.map((item) => {
        const product = this.products.find((productItem) => productItem.productCode === item.productCode);
        return {
          id: makeId("req-item"),
          productCode: item.productCode,
          productName: product?.productName || item.productCode,
          requestedQty: Number(item.requestedQty),
          requestedUnit: item.requestedUnit,
          lineNote: item.lineNote || "",
        };
      }),
    };

    this.orderRequests.unshift(request);
    return request;
  }

  async getOrderRequest(id) {
    return this.orderRequests.find((item) => item.id === id) || null;
  }

  async getOrderRequests() {
    return this.orderRequests;
  }

  async getSyncStatus() {
    return {
      latestRun: this.syncRuns[0] || null,
      recentErrors: this.syncErrors.slice(0, 10),
      mode: "mock",
    };
  }

  async ingestProducts(payload) {
    this.syncRuns.unshift({
      id: makeId("sync"),
      syncType: "products",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      recordsRead: payload.records?.length || 0,
      recordsSent: payload.records?.length || 0,
      message: "Products received by mock API.",
    });
    return { accepted: payload.records?.length || 0 };
  }

  async ingestSalesSummary(payload) {
    this.syncRuns.unshift({
      id: makeId("sync"),
      syncType: "sales-summary",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      recordsRead: payload.records?.length || 0,
      recordsSent: payload.records?.length || 0,
      message: "Sales summaries received by mock API.",
    });
    return { accepted: payload.records?.length || 0 };
  }

  async ingestPurchaseSummary(payload) {
    this.syncRuns.unshift({
      id: makeId("sync"),
      syncType: "purchase-summary",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      recordsRead: payload.records?.length || 0,
      recordsSent: payload.records?.length || 0,
      message: "Purchase summaries received by mock API.",
    });
    return { accepted: payload.records?.length || 0 };
  }

  async ingestRunLog(payload) {
    this.syncRuns.unshift({
      id: payload.id || makeId("sync"),
      syncType: payload.syncType || "manual",
      startedAt: payload.startedAt || new Date().toISOString(),
      finishedAt: payload.finishedAt || new Date().toISOString(),
      status: payload.status || "success",
      recordsRead: payload.recordsRead || 0,
      recordsSent: payload.recordsSent || 0,
      message: payload.message || "",
    });
    return { accepted: 1 };
  }

  async close() {}
}
