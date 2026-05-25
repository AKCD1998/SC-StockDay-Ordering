import express from "express";
import { config } from "./config.js";
import { validateTransferPayload } from "./transferSync.js";
import { parsePositiveNumber } from "./utils.js";

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function validateOrderRequestBody(body) {
  const { branchCode, items } = body || {};
  if (!branchCode || !Array.isArray(items) || items.length === 0) {
    return "branchCode and at least one item are required.";
  }

  for (const item of items) {
    if (!item.productCode || !item.requestedUnit) {
      return "Each item requires productCode, requestedQty, and requestedUnit.";
    }
    const qty = parsePositiveNumber(item.requestedQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return "Each item requestedQty must be a positive number.";
    }
  }

  return null;
}

function validateRecordsPayload(body) {
  if (!body || !Array.isArray(body.records)) {
    return "Payload must include a records array.";
  }

  return null;
}

function parsePageParam(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseOffsetParam(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeOptionalText(value, maxLength = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeBranchStockNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSyncedAt(value) {
  const candidate = value ? new Date(value) : new Date();
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate.toISOString();
}

function validateBranchStockSyncToken(req) {
  const configuredToken = config.branchStockSyncToken;
  if (!configuredToken) {
    return "BRANCH_STOCK_SYNC_TOKEN is not configured on the server.";
  }

  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = String(req.headers["x-sync-token"] || "").trim();
  const providedToken = bearerToken || headerToken;

  if (!providedToken || providedToken !== configuredToken) {
    return "Unauthorized sync token.";
  }

  return null;
}

function validateAndNormalizeBranchStockRecords(body) {
  if (!body || !Array.isArray(body.records)) {
    return { error: "Payload must include a records array.", records: [] };
  }

  const records = [];
  for (const [index, record] of body.records.entries()) {
    const productCode = normalizeOptionalText(record?.product_code ?? record?.productCode, 120);
    if (!productCode) {
      return { error: `records[${index}].product_code is required.`, records: [] };
    }

    const syncedAt = normalizeSyncedAt(record?.synced_at ?? record?.syncedAt);
    if (!syncedAt) {
      return { error: `records[${index}].synced_at is invalid.`, records: [] };
    }

    records.push({
      productCode,
      productNameThai: normalizeOptionalText(record?.product_name_thai ?? record?.productNameThai),
      productNameEng: normalizeOptionalText(record?.product_name_eng ?? record?.productNameEng),
      barcode: normalizeOptionalText(record?.barcode, 120),
      unit: normalizeOptionalText(record?.unit, 80),
      qtyBranch000: normalizeBranchStockNumber(record?.qty_branch_000 ?? record?.qtyBranch000),
      qtyBranch001: normalizeBranchStockNumber(record?.qty_branch_001 ?? record?.qtyBranch001),
      qtyBranch002: normalizeBranchStockNumber(record?.qty_branch_002 ?? record?.qtyBranch002),
      qtyBranch003: normalizeBranchStockNumber(record?.qty_branch_003 ?? record?.qtyBranch003),
      qtyBranch004: normalizeBranchStockNumber(record?.qty_branch_004 ?? record?.qtyBranch004),
      qtyBranch005: normalizeBranchStockNumber(record?.qty_branch_005 ?? record?.qtyBranch005),
      qtyTotalAllBranches: normalizeBranchStockNumber(
        record?.qty_total_all_branches ?? record?.qtyTotalAllBranches,
      ),
      syncedAt,
    });
  }

  return { error: null, records };
}

export function createRouter(repository) {
  const router = express.Router();

  router.get("/api/branches", asyncHandler(async (_req, res) => {
    res.json(await repository.getBranches());
  }));

  router.get("/api/products/search", asyncHandler(async (req, res) => {
    res.json(await repository.searchProducts(req.query.q || ""));
  }));

  router.post("/api/order-requests", asyncHandler(async (req, res) => {
    const validationError = validateOrderRequestBody(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const request = await repository.createOrderRequest(req.body);
    return res.status(201).json(request);
  }));

  router.get("/api/order-requests/:id", asyncHandler(async (req, res) => {
    const request = await repository.getOrderRequest(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Order request not found." });
    }
    return res.json(request);
  }));

  router.get("/api/admin/order-requests", asyncHandler(async (_req, res) => {
    res.json(await repository.getOrderRequests());
  }));

  router.get("/api/admin/stock-day", asyncHandler(async (req, res) => {
    const periodDays = Number(req.query.periodDays || config.defaultPeriodDays);
    if (!Number.isFinite(periodDays) || periodDays <= 0) {
      return res.status(400).json({ message: "periodDays must be a positive number." });
    }
    res.json(await repository.getStockDay(periodDays));
  }));

  router.get("/api/admin/products/:productCode/summary", asyncHandler(async (req, res) => {
    const periodDays = Number(req.query.periodDays || config.defaultPeriodDays);
    const summary = await repository.getProductSummary(req.params.productCode, periodDays);
    if (!summary) {
      return res.status(404).json({ message: "Product summary not found." });
    }
    return res.json(summary);
  }));

  router.get("/api/admin/sync-status", asyncHandler(async (_req, res) => {
    res.json(await repository.getSyncStatus());
  }));

  router.post("/api/sync/branches", asyncHandler(async (req, res) => {
    const validationError = validateRecordsPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    res.json(await repository.ingestBranches(req.body || {}));
  }));

  // Alias used by Codex-deployed backend — routes to same handler.
  router.post("/api/sync/ada/branches", asyncHandler(async (req, res) => {
    const validationError = validateRecordsPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    res.json(await repository.ingestBranches(req.body || {}));
  }));

  router.post("/api/sync/products", asyncHandler(async (req, res) => {
    const validationError = validateRecordsPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    res.json(await repository.ingestProducts(req.body || {}));
  }));

  router.post("/api/sync/sales-summary", asyncHandler(async (req, res) => {
    const validationError = validateRecordsPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    res.json(await repository.ingestSalesSummary(req.body || {}));
  }));

  router.post("/api/sync/purchase-summary", asyncHandler(async (req, res) => {
    const validationError = validateRecordsPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }
    res.json(await repository.ingestPurchaseSummary(req.body || {}));
  }));

  router.post("/api/sync/transfers", asyncHandler(async (req, res) => {
    const validation = validateTransferPayload(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    res.json(await repository.ingestTransfers(validation.normalized));
  }));

  // Alias used by Codex-deployed backend — normalizes both raw AdaAcc and camelCase payloads.
  router.post("/api/sync/ada/transfers", asyncHandler(async (req, res) => {
    const validation = validateTransferPayload(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    const result = await repository.ingestTransfers(validation.normalized);
    // Respond with both field-name conventions so either client works.
    res.json({
      ...result,
      acceptedHeaders: result.headersAccepted,
      acceptedLines:   result.linesAccepted,
    });
  }));

  // Ingest pending purchase receipts from adapos-sync
  router.post("/api/sync/ada/pending-receipts", asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.headers) || !Array.isArray(body.lines)) {
      return res.status(400).json({ message: "Payload must include headers[] and lines[]." });
    }
    res.json(await repository.ingestPendingReceipts(body));
  }));

  // Admin view: pending purchase receipts grouped by document
  router.get("/api/admin/pending-receipts", asyncHandler(async (req, res) => {
    const { branchCode, date, search } = req.query;
    const page = parsePageParam(req.query.page, 1);
    const pageSize = parsePageParam(req.query.pageSize, 10);
    res.json(await repository.getPendingReceipts({
      branchCode: branchCode || null,
      date: date || null,
      search: search || "",
      page,
      pageSize,
    }));
  }));

  // Ingest approved purchase receipts from adapos-sync
  router.post("/api/sync/ada/approved-receipts", asyncHandler(async (req, res) => {
    const { branchCode, records } = req.body || {};
    if (!branchCode || !Array.isArray(records)) {
      return res.status(400).json({ error: "branchCode and records[] required" });
    }
    const result = await repository.ingestApprovedReceipts(branchCode, records);
    res.json({ ok: true, upserted: result.upserted });
  }));

  // Admin view: approved purchase receipts for today (or a specific date)
  router.get("/api/admin/approved-receipts", asyncHandler(async (req, res) => {
    const { branchCode, date, search } = req.query;
    if (!branchCode) return res.status(400).json({ error: "branchCode required" });
    const page = parsePageParam(req.query.page, 1);
    const pageSize = parsePageParam(req.query.pageSize, 10);
    const result = await repository.getApprovedReceipts({
      branchCode,
      date: date ?? null,
      search: search || "",
      page,
      pageSize,
    });
    res.json({ ok: true, ...result });
  }));

  router.get("/api/admin/transfers", asyncHandler(async (req, res) => {
    const { branchCode } = req.query;
    if (!branchCode) {
      return res.status(400).json({ message: "branchCode query param required." });
    }
    const periodDays = Number(req.query.periodDays || config.defaultPeriodDays);
    if (!Number.isFinite(periodDays) || periodDays <= 0) {
      return res.status(400).json({ message: "periodDays must be a positive number." });
    }
    res.json(await repository.getTransfersByBranch(branchCode, periodDays));
  }));

  router.post("/api/sync/ada/branch-stock", asyncHandler(async (req, res) => {
    const validationError = validateRecordsPayload(req.body);
    if (validationError) return res.status(400).json({ message: validationError });
    res.json(await repository.ingestBranchStock(req.body));
  }));

  // /api/admin/branch-stock requires Render Basic Auth credentials (browser handles this automatically).
  // /api/branch-stock is the public alias used by the frontend SPA.
  router.get("/api/admin/branch-stock", asyncHandler(async (req, res) => {
    const { productCode } = req.query;
    res.json(await repository.getBranchStock(productCode || null));
  }));

  router.post("/api/branch-stock/sync", asyncHandler(async (req, res) => {
    const authError = validateBranchStockSyncToken(req);
    if (authError) {
      return res.status(401).json({ message: authError });
    }

    const validation = validateAndNormalizeBranchStockRecords(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const result = await repository.ingestBranchStockSnapshots(validation.records);
    res.json(result);
  }));

  router.get("/api/branch-stock", asyncHandler(async (req, res) => {
    const limit = parsePageParam(req.query.limit, 25);
    const offset = parseOffsetParam(req.query.offset, 0);
    const result = await repository.getBranchStockSnapshots({
      search: req.query.search || "",
      limit,
      offset,
    });
    res.json(result);
  }));

  router.post("/api/sync/run-log", asyncHandler(async (req, res) => {
    res.json(await repository.ingestRunLog(req.body || {}));
  }));

  router.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal server error." });
  });

  return router;
}
