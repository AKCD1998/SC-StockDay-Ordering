import { branches, orderRequests, products, staffAccounts, syncErrors, syncRuns } from "../mockData.js";
import { buildStockDayRow } from "../stockDay.js";
import { makeId, normalizeQuery } from "../utils.js";

const MOCK_MEMBERS = [
  { id: "mem_demo_001", memberCode: "M000001", displayName: "สมชาย ใจดี",  phone: "0831234567", email: "somchai@example.com", sex: null, dob: null, remark: "", currentPoints: 0 },
  { id: "mem_demo_002", memberCode: "M000002", displayName: "สมหญิง รักดี", phone: "0627966956", email: "somying@example.com", sex: null, dob: null, remark: "", currentPoints: 50 },
  { id: "mem_demo_003", memberCode: "M000003", displayName: "วิทยา มีสุข",  phone: "0899876543", email: null,                  sex: null, dob: null, remark: "", currentPoints: 120 },
];

export class MockRepository {
  constructor() {
    this.branches = structuredClone(branches);
    this.products = structuredClone(products);
    this.orderRequests = structuredClone(orderRequests);
    this.staffAccounts = structuredClone(staffAccounts);
    this.syncRuns = structuredClone(syncRuns);
    this.syncErrors = structuredClone(syncErrors);
    this.members = structuredClone(MOCK_MEMBERS);
    this.loyaltyClaims = [];
    this.supplierLogos = [];
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

  async ingestBranches(payload) {
    return { accepted: (payload.records || []).length };
  }

  async getTransfersByBranch(_branchCode, _periodDays) {
    return [];
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

  async ingestTransfers(payload) {
    this.syncRuns.unshift({
      id: makeId("sync"),
      syncType: "ada-transfers",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      recordsRead: (payload.headers?.length || 0) + (payload.lines?.length || 0),
      recordsSent: (payload.headers?.length || 0) + (payload.lines?.length || 0),
      message: "AdaPOS transfers received by mock API.",
    });
    return {
      acceptedHeaders: payload.headers?.length || 0,
      acceptedLines: payload.lines?.length || 0,
      headersAccepted: payload.headers?.length || 0,
      linesAccepted: payload.lines?.length || 0,
    };
  }

  async ingestPendingReceipts(payload) {
    return {
      headersAccepted: (payload.headers || []).length,
      linesAccepted:   (payload.lines   || []).length,
    };
  }

  async getPendingReceipts(_options = {}) {
    return {
      records: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      },
    };
  }

  async ingestApprovedReceipts(_branchCode, _records) {
    return { upserted: 0 };
  }

  async getApprovedReceipts(_options = {}) {
    return {
      records: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      },
    };
  }

  async getSupplierLogos() {
    return this.supplierLogos;
  }

  async upsertSupplierLogo({ supplierKey, supplierName, logoDataUrl }) {
    const now = new Date().toISOString();
    const existing = this.supplierLogos.find((item) => item.supplierKey === supplierKey);
    if (existing) {
      existing.supplierName = supplierName;
      existing.logoDataUrl = logoDataUrl;
      existing.updatedAt = now;
      return existing;
    }

    const next = {
      supplierKey,
      supplierName,
      logoDataUrl,
      createdAt: now,
      updatedAt: now,
    };
    this.supplierLogos.push(next);
    return next;
  }

  async ingestBranchStock(payload) {
    return { accepted: (payload.records || []).length };
  }

  async getBranchStock(_productCode) {
    return [];
  }

  async ingestBranchStockSnapshots(records) {
    return {
      accepted: records.length,
      insertedOrUpdated: records.length,
    };
  }

  async getBranchStockSnapshots(options = {}) {
    return {
      records: [],
      pagination: {
        limit: Number(options.limit) || 25,
        offset: Number(options.offset) || 0,
        total: 0,
      },
    };
  }

  async getBranchStockExportRows(_options = {}) {
    return [];
  }

  async getCategoryReviewQueue(options = {}) {
    return {
      records: [],
      pagination: {
        limit: Number(options.limit) || 25,
        offset: Number(options.offset) || 0,
        total: 0,
      },
    };
  }

  async getAllCleanCategories() {
    return [];
  }

  async getCategoryMetrics() {
    return {
      totalProducts: this.products.length,
      thaiNameCoverage: 1,
      englishNameCoverage: 0,
      barcodeCoverage: 1,
      dummyBarcodeRate: 0,
    };
  }

  async refreshProductCategories(productCodes = []) {
    return {
      processed: productCodes.length,
      confirmed: 0,
      needsReview: productCodes.length,
      reverify: 0,
    };
  }

  async confirmProductCategory({ productCode, cleanCategory, shelfNo = null }) {
    return {
      ok: true,
      productCode,
      category: shelfNo === null ? cleanCategory : `${shelfNo}${cleanCategory}`,
    };
  }

  async saveHeartbeat(_branchCode, _laptopName, _event) {
    return { ok: true, heartbeatId: null };
  }

  async saveNightlyRunLog(_payload) {
    return { ok: true, syncRunId: null };
  }

  async getNightlySyncLog(_days) {
    return { dates: [], branches: [], rows: {} };
  }

  async getHourlySyncLog(_hours) {
    return { hours: [], branches: [], rows: {} };
  }

  async getRecentSyncEvents(_options = {}) {
    return [];
  }

  // ── Loyalty ───────────────────────────────────────────────────────────────────

  async searchMembers(query) {
    const q = normalizeQuery(query);
    if (!q) return [];
    return this.members
      .filter((m) =>
        [m.phone, m.displayName, m.email, m.memberCode].some((f) =>
          normalizeQuery(f || "").includes(q),
        ),
      )
      .slice(0, 20);
  }

  async getMemberById(memberId) {
    return this.members.find((m) => m.id === memberId) || null;
  }

  async updateMemberById(memberId, payload) {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) return null;

    member.displayName = payload.displayName;
    member.phone = payload.phone;
    member.email = payload.email;
    member.sex = payload.sex;
    member.dob = payload.dob;
    member.remark = payload.remark;

    return structuredClone(member);
  }

  async createLoyaltyClaim(payload) {
    const { receiptNo, branchCode, memberId, items, totalAmount } = payload;

    const dup = this.loyaltyClaims.find(
      (c) => c.branchCode === branchCode && c.receiptNo === receiptNo,
    );
    if (dup) {
      const err = new Error("Receipt already claimed.");
      err.statusCode = 409;
      throw err;
    }

    const member = this.members.find((m) => m.id === memberId);
    if (!member) {
      const err = new Error("Member not found.");
      err.statusCode = 404;
      throw err;
    }

    const awardedPoints = Math.max(0, Math.floor(Number(totalAmount) / 100));
    member.currentPoints += awardedPoints;

    const claimId = makeId("clm");
    this.loyaltyClaims.push({ id: claimId, receiptNo, branchCode, memberId, items });

    return {
      ok: true,
      claimId,
      receiptNo,
      member: { id: memberId, displayName: member.displayName, currentPoints: member.currentPoints },
      awardedPoints,
      newPointsBalance: member.currentPoints,
    };
  }

  async close() {}
}
