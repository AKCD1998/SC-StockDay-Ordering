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
    const { branchCode } = req.query;
    res.json(await repository.getPendingReceipts(branchCode || null));
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
    const { branchCode, date } = req.query;
    if (!branchCode) return res.status(400).json({ error: "branchCode required" });
    const records = await repository.getApprovedReceipts(branchCode, date ?? null);
    res.json({ ok: true, records });
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

  router.post("/api/sync/run-log", asyncHandler(async (req, res) => {
    res.json(await repository.ingestRunLog(req.body || {}));
  }));

  router.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal server error." });
  });

  return router;
}
