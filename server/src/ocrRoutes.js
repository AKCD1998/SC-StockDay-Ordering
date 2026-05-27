import express from "express";
import { getPool } from "./db/pool.js";
import { makeId } from "./utils.js";

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Simple shared-secret check for requests coming from the mother PC ocr-worker.
function requireWorkerKey(req, res, next) {
  const workerKey = process.env.OCR_WORKER_KEY;
  if (!workerKey) return next(); // key not configured → open (dev mode)
  if (req.headers["x-worker-key"] !== workerKey) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  return next();
}

export function createOcrRouter() {
  const router = express.Router();
  const pool = getPool();

  // ── Worker endpoints ────────────────────────────────────────────────────────

  // POST /api/ocr/documents
  // Called by the mother PC ocr-worker after preprocessing + OCR.
  // Payload: { filename, filePath, branchCode?, supplierName?, invoiceNumber?,
  //            invoiceDate?, ocrEngine, lines: [{ lineIndex, rawText,
  //            parsedProductName, parsedBarcode, parsedQty, parsedUnit,
  //            parsedCost, parsedLot, parsedExpiry, matchedProductCode?,
  //            matchedProductName?, matchMethod?, matchConfidence? }] }
  router.post("/api/ocr/documents", requireWorkerKey, asyncHandler(async (req, res) => {
    const {
      filename, filePath, branchCode, supplierName, invoiceNumber,
      invoiceDate, ocrEngine, lines = [],
    } = req.body || {};

    if (!filename || !filePath) {
      return res.status(400).json({ message: "filename and filePath are required." });
    }

    const docId = makeId("ocrdoc");
    const now = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO ocr_documents
           (id, filename, file_path, branch_code, supplier_name, invoice_number,
            invoice_date, status, ocr_engine, processing_finished_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'review',$8,$9,$9,$9)`,
        [docId, filename, filePath, branchCode || null, supplierName || null,
         invoiceNumber || null, invoiceDate || null, ocrEngine || null, now],
      );

      for (const line of lines) {
        await client.query(
          `INSERT INTO ocr_document_lines
             (id, document_id, line_index, raw_text, parsed_product_name,
              parsed_barcode, parsed_qty, parsed_unit, parsed_cost, parsed_lot,
              parsed_expiry, matched_product_code, matched_product_name,
              match_method, match_confidence, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            makeId("ocrline"), docId, line.lineIndex ?? 0,
            line.rawText || null, line.parsedProductName || null,
            line.parsedBarcode || null, line.parsedQty ?? null,
            line.parsedUnit || null, line.parsedCost ?? null,
            line.parsedLot || null, line.parsedExpiry || null,
            line.matchedProductCode || null, line.matchedProductName || null,
            line.matchMethod || "unmatched",
            line.matchConfidence ?? null, now,
          ],
        );
      }

      await client.query("COMMIT");
      return res.status(201).json({ ok: true, documentId: docId });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }));

  // ── Admin review endpoints ──────────────────────────────────────────────────

  // GET /api/admin/ocr/documents?status=review&page=1&pageSize=20
  router.get("/api/admin/ocr/documents", asyncHandler(async (req, res) => {
    const status = req.query.status || "review";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { rows } = await pool.query(
      `SELECT d.*,
              COUNT(l.id) FILTER (WHERE l.match_status = 'pending') AS pending_lines,
              COUNT(l.id) AS total_lines
       FROM ocr_documents d
       LEFT JOIN ocr_document_lines l ON l.document_id = d.id
       WHERE d.status = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, pageSize, offset],
    );

    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*) FROM ocr_documents WHERE status = $1", [status],
    );

    res.json({ documents: rows, total: Number(count), page, pageSize });
  }));

  // GET /api/admin/ocr/documents/:id
  router.get("/api/admin/ocr/documents/:id", asyncHandler(async (req, res) => {
    const { rows: [doc] } = await pool.query(
      "SELECT * FROM ocr_documents WHERE id = $1", [req.params.id],
    );
    if (!doc) return res.status(404).json({ message: "Document not found." });

    const { rows: lines } = await pool.query(
      "SELECT * FROM ocr_document_lines WHERE document_id = $1 ORDER BY line_index",
      [req.params.id],
    );

    res.json({ ...doc, lines });
  }));

  // PATCH /api/admin/ocr/documents/:id/lines/:lineId
  // Staff corrects a single parsed line before confirming.
  // Payload: { matchStatus, matchedProductCode?, parsedQty?, parsedUnit?,
  //            parsedCost?, parsedLot?, parsedExpiry?, confirmedBy }
  router.patch("/api/admin/ocr/documents/:id/lines/:lineId", asyncHandler(async (req, res) => {
    const {
      matchStatus, matchedProductCode, parsedQty, parsedUnit,
      parsedCost, parsedLot, parsedExpiry, confirmedBy,
    } = req.body || {};

    if (!matchStatus || !confirmedBy) {
      return res.status(400).json({ message: "matchStatus and confirmedBy are required." });
    }

    const now = new Date().toISOString();

    const { rows: [line] } = await pool.query(
      `UPDATE ocr_document_lines
       SET match_status = $1, matched_product_code = COALESCE($2, matched_product_code),
           parsed_qty = COALESCE($3, parsed_qty), parsed_unit = COALESCE($4, parsed_unit),
           parsed_cost = COALESCE($5, parsed_cost), parsed_lot = COALESCE($6, parsed_lot),
           parsed_expiry = COALESCE($7, parsed_expiry),
           confirmed_by = $8, confirmed_at = $9
       WHERE id = $10 AND document_id = $11
       RETURNING *`,
      [matchStatus, matchedProductCode || null, parsedQty ?? null, parsedUnit || null,
       parsedCost ?? null, parsedLot || null, parsedExpiry || null,
       confirmedBy, now, req.params.lineId, req.params.id],
    );

    if (!line) return res.status(404).json({ message: "Line not found." });

    // Log correction if product was changed
    if (matchedProductCode && line.matched_product_code !== matchedProductCode) {
      await pool.query(
        `INSERT INTO match_corrections
           (id, document_line_id, raw_product_name, raw_barcode,
            suggested_product_code, corrected_product_code, corrected_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [makeId("corr"), req.params.lineId, line.parsed_product_name,
         line.parsed_barcode, line.matched_product_code,
         matchedProductCode, confirmedBy, now],
      );
    }

    res.json(line);
  }));

  // POST /api/admin/ocr/documents/:id/confirm
  // All lines reviewed — create the final invoice_receipt record.
  // Payload: { confirmedBy, branchCode, supplierCode?, note? }
  router.post("/api/admin/ocr/documents/:id/confirm", asyncHandler(async (req, res) => {
    const { confirmedBy, branchCode, supplierCode, note } = req.body || {};
    if (!confirmedBy || !branchCode) {
      return res.status(400).json({ message: "confirmedBy and branchCode are required." });
    }

    const { rows: [doc] } = await pool.query(
      "SELECT * FROM ocr_documents WHERE id = $1", [req.params.id],
    );
    if (!doc) return res.status(404).json({ message: "Document not found." });
    if (doc.status === "confirmed") {
      return res.status(409).json({ message: "Document already confirmed." });
    }

    const { rows: lines } = await pool.query(
      `SELECT l.*, p.product_name AS master_product_name
       FROM ocr_document_lines l
       LEFT JOIN products p ON p.product_code = l.matched_product_code
       WHERE l.document_id = $1 AND l.match_status != 'rejected'
       ORDER BY l.line_index`,
      [req.params.id],
    );

    const now = new Date().toISOString();
    const receiptId = makeId("rcpt");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO invoice_receipts
           (id, document_id, branch_code, supplier_code, supplier_name,
            invoice_number, invoice_date, confirmed_by, confirmed_at, note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9)`,
        [receiptId, doc.id, branchCode, supplierCode || null,
         doc.supplier_name, doc.invoice_number, doc.invoice_date,
         confirmedBy, now, note || null],
      );

      for (const line of lines) {
        await client.query(
          `INSERT INTO invoice_receipt_items
             (id, receipt_id, product_code, product_name, barcode,
              qty, unit, cost, lot_number, expiry_date, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            makeId("ritem"), receiptId,
            line.matched_product_code || null,
            line.master_product_name || line.parsed_product_name || "",
            line.parsed_barcode || null,
            line.parsed_qty, line.parsed_unit || "",
            line.parsed_cost || null, line.parsed_lot || null,
            line.parsed_expiry || null, now,
          ],
        );
      }

      await client.query(
        "UPDATE ocr_documents SET status='confirmed', updated_at=$1 WHERE id=$2",
        [now, doc.id],
      );

      await client.query("COMMIT");
      res.status(201).json({ ok: true, receiptId });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }));

  // GET /api/admin/ocr/receipts?branchCode=&date=&page=1&pageSize=20
  router.get("/api/admin/ocr/receipts", asyncHandler(async (req, res) => {
    const { branchCode, date } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (branchCode) { params.push(branchCode); conditions.push(`r.branch_code = $${params.length}`); }
    if (date) { params.push(date); conditions.push(`r.invoice_date = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(pageSize, offset);
    const { rows } = await pool.query(
      `SELECT r.*, COUNT(i.id) AS item_count
       FROM invoice_receipts r
       LEFT JOIN invoice_receipt_items i ON i.receipt_id = r.id
       ${where}
       GROUP BY r.id
       ORDER BY r.confirmed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ receipts: rows, page, pageSize });
  }));

  // GET /api/admin/ocr/receipts/:id
  router.get("/api/admin/ocr/receipts/:id", asyncHandler(async (req, res) => {
    const { rows: [receipt] } = await pool.query(
      "SELECT * FROM invoice_receipts WHERE id = $1", [req.params.id],
    );
    if (!receipt) return res.status(404).json({ message: "Receipt not found." });

    const { rows: items } = await pool.query(
      "SELECT * FROM invoice_receipt_items WHERE receipt_id = $1 ORDER BY created_at",
      [req.params.id],
    );

    res.json({ ...receipt, items });
  }));

  return router;
}
