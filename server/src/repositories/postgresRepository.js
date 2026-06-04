import { getPool, closePool } from "../db/pool.js";
import {
  buildCategoryDecision,
  buildDisplayCategory,
  inferKeywordCategory,
  isRealBarcode,
} from "../categoryUtils.js";
import { buildStockDayRow } from "../stockDay.js";
import { makeId, normalizeQuery } from "../utils.js";

function mapMemberRow(row) {
  return {
    id:            row.id,
    memberCode:    row.member_code,
    displayName:   row.display_name,
    phone:         row.phone || null,
    email:         row.email || null,
    sex:           row.sex || null,
    dob:           row.dob || null,
    remark:        row.remark || "",
    currentPoints: Number(row.current_points || 0),
  };
}

function mapSearchRow(row) {
  return {
    productCode: row.product_code,
    productName: row.product_name,
    productNameEng: row.product_name_eng || null,
    barcode: row.barcode_1 || row.barcode_2 || row.barcode_3 || "",
    supplier: row.supplier_name || row.supplier_code || "",
    unit: row.unit_small || row.unit_medium || row.unit_large || "",
    stockCurrent: Number(row.stock_current || 0),
    stockRetail: Number(row.stock_retail || 0),
    stockWarehouse: Number(row.stock_warehouse || 0),
    minStock: Number(row.min_stock || 0),
    maxStock: Number(row.max_stock || 0),
    leadTimeDays: Number(row.lead_time_days || 0),
  };
}

function toBranchStockNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickBestBarcode(row) {
  const candidates = [row.barcode_1, row.barcode_2, row.barcode_3];
  return candidates.find((value) => isRealBarcode(value)) || candidates.find(Boolean) || null;
}

function toOptionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function mapBranchStockSnapshotRow(row) {
  return {
    productCode: row.product_code,
    productNameThai: row.product_name_thai || "",
    productNameEng: row.product_name_eng || "",
    barcode: row.barcode || "",
    unit: row.unit || "",
    category: row.category || "",
    categoryStatus: row.category_review_status || "",
    categorySource: row.category_source || "",
    categoryConfidence: Number(row.category_confidence || 0),
    placementConfidence: Number(row.placement_confidence || 0),
    categoryRationale: row.category_rationale || "",
    qtyBranch000: toBranchStockNumber(row.qty_branch_000),
    qtyBranch001: toBranchStockNumber(row.qty_branch_001),
    qtyBranch002: toBranchStockNumber(row.qty_branch_002),
    qtyBranch003: toBranchStockNumber(row.qty_branch_003),
    qtyBranch004: toBranchStockNumber(row.qty_branch_004),
    qtyBranch005: toBranchStockNumber(row.qty_branch_005),
    qtyTotalAllBranches: toBranchStockNumber(row.qty_total_all_branches),
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresRepository {
  constructor() {
    // pool may be overridden after construction (e.g. in tests with a mock pool)
    try { this.pool = getPool(); } catch { this.pool = null; }
  }

  async init() {
    await this.pool.query("SELECT 1");
  }

  async getBranches() {
    const { rows } = await this.pool.query(
      "SELECT branch_code, branch_name, is_hq FROM branches ORDER BY branch_code ASC",
    );
    return rows.map((row) => ({
      branchCode: row.branch_code,
      branchName: row.branch_name,
      isHq: row.is_hq,
    }));
  }

  async searchProducts(query) {
    const q = normalizeQuery(query);
    const params = [];
    let whereClause = "";
    if (q) {
      params.push(`%${q}%`);
      whereClause = `
        WHERE LOWER(product_code) LIKE $1
           OR LOWER(product_name) LIKE $1
           OR LOWER(COALESCE(barcode_1, '')) LIKE $1
           OR LOWER(COALESCE(barcode_2, '')) LIKE $1
           OR LOWER(COALESCE(barcode_3, '')) LIKE $1
      `;
    }

    const { rows } = await this.pool.query(
      `
      SELECT *
      FROM products
      ${whereClause}
      ORDER BY product_code ASC
      LIMIT 20
      `,
      params,
    );

    return rows.map(mapSearchRow);
  }

  async loadStockDayBase(periodDays, productCode = null) {
    const params = [periodDays];
    let productFilter = "";
    if (productCode) {
      params.push(productCode);
      productFilter = "WHERE p.product_code = $2";
    }

    const { rows } = await this.pool.query(
      `
      WITH sales AS (
        SELECT product_code, SUM(sold_qty_base) AS sold_qty_period
        FROM product_sales_summary
        WHERE period_days = $1
        GROUP BY product_code
      ),
      purchases AS (
        SELECT product_code, SUM(purchased_qty_base) AS purchased_qty_period
        FROM product_purchase_summary
        WHERE period_days = $1
        GROUP BY product_code
      ),
      pending_requests AS (
        SELECT
          i.product_code,
          SUM(i.requested_qty) AS pending_requested_qty,
          COUNT(*) AS pending_request_lines,
          COUNT(DISTINCT r.branch_code) AS pending_request_branches
        FROM branch_order_request_items i
        JOIN branch_order_requests r ON r.id = i.order_request_id
        WHERE r.status = 'submitted'
        GROUP BY i.product_code
      )
      SELECT
        p.product_code,
        p.product_name,
        p.product_name_eng,
        COALESCE(p.barcode_1, p.barcode_2, p.barcode_3, '') AS barcode,
        COALESCE(p.unit_small, p.unit_medium, p.unit_large, '') AS unit,
        p.stock_current,
        COALESCE(s.sold_qty_period, 0) AS sold_qty_period,
        COALESCE(pr.purchased_qty_period, 0) AS purchased_qty_period,
        p.min_stock,
        p.max_stock,
        p.lead_time_days,
        COALESCE(p.supplier_name, p.supplier_code, '') AS supplier,
        COALESCE(req.pending_requested_qty, 0) AS pending_requested_qty,
        COALESCE(req.pending_request_lines, 0) AS pending_request_lines,
        COALESCE(req.pending_request_branches, 0) AS pending_request_branches
      FROM products p
      LEFT JOIN sales s ON s.product_code = p.product_code
      LEFT JOIN purchases pr ON pr.product_code = p.product_code
      LEFT JOIN pending_requests req ON req.product_code = p.product_code
      ${productFilter}
      ORDER BY p.product_code ASC
      `,
      params,
    );

    return rows.map((row) => ({
      productCode: row.product_code,
      productName: row.product_name,
      productNameEng: row.product_name_eng || null,
      barcode: row.barcode,
      unit: row.unit,
      currentStock: Number(row.stock_current || 0),
      soldQtyPeriod: Number(row.sold_qty_period || 0),
      purchasedQtyPeriod: Number(row.purchased_qty_period || 0),
      minStock: Number(row.min_stock || 0),
      maxStock: Number(row.max_stock || 0),
      leadTimeDays: Number(row.lead_time_days || 0),
      supplier: row.supplier,
      pendingRequestedQty: Number(row.pending_requested_qty || 0),
      pendingRequestLines: Number(row.pending_request_lines || 0),
      pendingRequestBranches: Number(row.pending_request_branches || 0),
    }));
  }

  async getProductSummary(productCode, periodDays) {
    const rows = await this.loadStockDayBase(periodDays, productCode);
    if (!rows[0]) return null;
    return buildStockDayRow(rows[0], periodDays);
  }

  async getStockDay(periodDays) {
    const rows = await this.loadStockDayBase(periodDays);
    return rows.map((row) => buildStockDayRow(row, periodDays));
  }

  async createOrderRequest(payload) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const branchCheck = await client.query(
        "SELECT branch_code, branch_name FROM branches WHERE branch_code = $1",
        [payload.branchCode],
      );
      if (!branchCheck.rowCount) {
        throw new Error(`Unknown branchCode: ${payload.branchCode}`);
      }

      for (const item of payload.items) {
        const productCheck = await client.query(
          "SELECT product_code, product_name FROM products WHERE product_code = $1",
          [item.productCode],
        );
        if (!productCheck.rowCount) {
          throw new Error(`Unknown productCode: ${item.productCode}`);
        }
      }

      const orderRequestId = makeId("req");
      await client.query(
        `
        INSERT INTO branch_order_requests (id, branch_code, requested_by, requested_at, status, note)
        VALUES ($1, $2, $3, NOW(), 'submitted', $4)
        `,
        [orderRequestId, payload.branchCode, payload.requestedBy || "Placeholder Staff", payload.note || ""],
      );

      const items = [];
      for (const item of payload.items) {
        const itemId = makeId("req_item");
        await client.query(
          `
          INSERT INTO branch_order_request_items
            (id, order_request_id, product_code, requested_qty, requested_unit, line_note)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [itemId, orderRequestId, item.productCode, Number(item.requestedQty), item.requestedUnit, item.lineNote || ""],
        );
        items.push({
          id: itemId,
          productCode: item.productCode,
          productName: (
            await client.query("SELECT product_name FROM products WHERE product_code = $1", [item.productCode])
          ).rows[0].product_name,
          requestedQty: Number(item.requestedQty),
          requestedUnit: item.requestedUnit,
          lineNote: item.lineNote || "",
        });
      }

      await client.query("COMMIT");
      return {
        id: orderRequestId,
        branchCode: payload.branchCode,
        branchName: branchCheck.rows[0].branch_name,
        requestedBy: payload.requestedBy || "Placeholder Staff",
        requestedAt: new Date().toISOString(),
        status: "submitted",
        note: payload.note || "",
        items,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderRequest(id) {
    const { rows } = await this.pool.query(
      `
      SELECT
        r.id,
        r.branch_code,
        b.branch_name,
        r.requested_by,
        r.requested_at,
        r.status,
        r.note,
        i.id AS item_id,
        i.product_code,
        p.product_name,
        i.requested_qty,
        i.requested_unit,
        i.line_note
      FROM branch_order_requests r
      JOIN branches b ON b.branch_code = r.branch_code
      LEFT JOIN branch_order_request_items i ON i.order_request_id = r.id
      LEFT JOIN products p ON p.product_code = i.product_code
      WHERE r.id = $1
      ORDER BY i.created_at ASC
      `,
      [id],
    );

    if (!rows.length) return null;
    return this.groupOrderRequestRows(rows)[0];
  }

  groupOrderRequestRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: row.id,
          branchCode: row.branch_code,
          branchName: row.branch_name,
          requestedBy: row.requested_by,
          requestedAt: row.requested_at,
          status: row.status,
          note: row.note || "",
          items: [],
        });
      }
      if (row.item_id) {
        grouped.get(row.id).items.push({
          id: row.item_id,
          productCode: row.product_code,
          productName: row.product_name || row.product_code,
          requestedQty: Number(row.requested_qty),
          requestedUnit: row.requested_unit,
          lineNote: row.line_note || "",
        });
      }
    }
    return [...grouped.values()];
  }

  async getOrderRequests() {
    const { rows } = await this.pool.query(
      `
      SELECT
        r.id,
        r.branch_code,
        b.branch_name,
        r.requested_by,
        r.requested_at,
        r.status,
        r.note,
        i.id AS item_id,
        i.product_code,
        p.product_name,
        i.requested_qty,
        i.requested_unit,
        i.line_note
      FROM branch_order_requests r
      JOIN branches b ON b.branch_code = r.branch_code
      LEFT JOIN branch_order_request_items i ON i.order_request_id = r.id
      LEFT JOIN products p ON p.product_code = i.product_code
      ORDER BY r.requested_at DESC, i.created_at ASC
      `,
    );
    return this.groupOrderRequestRows(rows);
  }

  async getSyncStatus() {
    const latestRun = await this.pool.query(
      "SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1",
    );
    const recentErrors = await this.pool.query(
      "SELECT * FROM sync_errors ORDER BY created_at DESC LIMIT 10",
    );
    return {
      latestRun: latestRun.rows[0]
        ? {
            id: latestRun.rows[0].id,
            syncType: latestRun.rows[0].sync_type,
            startedAt: latestRun.rows[0].started_at,
            finishedAt: latestRun.rows[0].finished_at,
            status: latestRun.rows[0].status,
            recordsRead: latestRun.rows[0].records_read,
            recordsSent: latestRun.rows[0].records_sent,
            message: latestRun.rows[0].message,
          }
        : null,
      recentErrors: recentErrors.rows.map((row) => ({
        id: row.id,
        syncRunId: row.sync_run_id,
        syncType: row.sync_type,
        errorMessage: row.error_message,
        errorDetails: row.error_details,
        createdAt: row.created_at,
      })),
      mode: "postgres",
    };
  }

  async loadCategoryReferenceData(client = this.pool) {
    const [aliasResult, ruleResult] = await Promise.all([
      client.query("SELECT raw_variant, canonical_category FROM typo_aliases ORDER BY raw_variant ASC"),
      client.query(
        `SELECT
           clean_category,
           allowed_shelves,
           allowed_unprefixed,
           is_cold_chain_possible,
           is_controlled,
           always_human_confirm
         FROM category_shelf_rules`,
      ),
    ]);

    return {
      aliasRows: aliasResult.rows,
      shelfRules: new Map(ruleResult.rows.map((row) => [row.clean_category, row])),
    };
  }

  async refreshProductCategories(productCodes = []) {
    const normalizedCodes = [...new Set((productCodes || []).filter(Boolean))];
    const client = await this.pool.connect();
    let inTransaction = false;

    try {
      const whereClause = normalizedCodes.length
        ? "WHERE p.product_code = ANY($1::text[])"
        : "";
      const params = normalizedCodes.length ? [normalizedCodes] : [];

      const { rows: productsToClassify } = await client.query(
        `
        SELECT
          p.product_code,
          p.product_name,
          p.product_name_eng,
          p.barcode_1,
          p.barcode_2,
          p.barcode_3,
          pc.review_status AS existing_review_status
        FROM products p
        LEFT JOIN product_category pc ON pc.product_code = p.product_code
        ${whereClause}
        ORDER BY p.product_code ASC
        `,
        params,
      );

      if (!productsToClassify.length) {
        return { processed: 0, confirmed: 0, needsReview: 0, reverify: 0 };
      }

      const { aliasRows, shelfRules } = await this.loadCategoryReferenceData(client);
      const realBarcodes = [...new Set(productsToClassify.map(pickBestBarcode).filter(isRealBarcode))];
      const productCodesForMatch = productsToClassify.map((row) => row.product_code);
      const taxonomyResult = await client.query(
        `
        SELECT
          product_code,
          barcode,
          raw_label,
          clean_category,
          shelf_no,
          pharmacist_zone,
          status
        FROM taxonomy_map
        WHERE status <> 'ignored'
          AND (
            product_code = ANY($1::text[])
            OR ($2::text[] <> '{}'::text[] AND barcode = ANY($2::text[]))
          )
        ORDER BY
          CASE WHEN status = 'reverify' THEN 0 ELSE 1 END,
          source_row_number NULLS LAST,
          taxonomy_id ASC
        `,
        [productCodesForMatch, realBarcodes],
      );

      const taxonomyByCode = new Map();
      const taxonomyByBarcode = new Map();
      for (const row of taxonomyResult.rows) {
        if (row.product_code && !taxonomyByCode.has(row.product_code)) {
          taxonomyByCode.set(row.product_code, row);
        }
        if (row.barcode && !taxonomyByBarcode.has(row.barcode)) {
          taxonomyByBarcode.set(row.barcode, row);
        }
      }

      await client.query("BEGIN");
      inTransaction = true;

      let confirmed = 0;
      let needsReview = 0;
      let reverify = 0;

      for (const product of productsToClassify) {
        const bestBarcode = pickBestBarcode(product);
        const exactMatch =
          taxonomyByCode.get(product.product_code) ||
          (isRealBarcode(bestBarcode) ? taxonomyByBarcode.get(bestBarcode) : null) ||
          null;
        const keywordMatch = exactMatch
          ? null
          : inferKeywordCategory({
              productNameThai: product.product_name,
              productNameEng: product.product_name_eng,
              barcode: bestBarcode,
            });
        const categoryKey = exactMatch?.clean_category || keywordMatch?.cleanCategory || null;
        const decision = buildCategoryDecision({
          product: {
            productCode: product.product_code,
            productNameThai: product.product_name,
            productNameEng: product.product_name_eng,
            barcode: bestBarcode,
          },
          exactMatch,
          keywordMatch,
          shelfRule: categoryKey ? shelfRules.get(categoryKey) || null : null,
          aliasRows,
        });

        await client.query(
          `
          INSERT INTO product_category (
            product_code,
            clean_category,
            shelf_no,
            pharmacist_zone,
            is_cold_chain,
            requires_signoff,
            category_confidence,
            placement_confidence,
            source,
            review_status,
            rationale,
            needs_reverification,
            matched_from_product_code,
            matched_from_barcode,
            raw_label_source,
            decided_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            CASE WHEN $10 = 'confirmed' THEN NOW() ELSE NULL END,
            NOW()
          )
          ON CONFLICT (product_code) DO UPDATE SET
            clean_category = EXCLUDED.clean_category,
            shelf_no = EXCLUDED.shelf_no,
            pharmacist_zone = EXCLUDED.pharmacist_zone,
            is_cold_chain = EXCLUDED.is_cold_chain,
            requires_signoff = EXCLUDED.requires_signoff,
            category_confidence = EXCLUDED.category_confidence,
            placement_confidence = EXCLUDED.placement_confidence,
            source = EXCLUDED.source,
            review_status = EXCLUDED.review_status,
            rationale = EXCLUDED.rationale,
            needs_reverification = EXCLUDED.needs_reverification,
            matched_from_product_code = EXCLUDED.matched_from_product_code,
            matched_from_barcode = EXCLUDED.matched_from_barcode,
            raw_label_source = EXCLUDED.raw_label_source,
            updated_at = NOW(),
            decided_at = CASE
              WHEN EXCLUDED.review_status = 'confirmed' THEN NOW()
              ELSE product_category.decided_at
            END
          `,
          [
            product.product_code,
            decision.cleanCategory,
            decision.shelfNo,
            decision.pharmacistZone,
            decision.isColdChain,
            decision.requiresSignoff,
            decision.categoryConfidence,
            decision.placementConfidence,
            decision.source,
            decision.reviewStatus,
            decision.rationale,
            decision.needsReverification,
            decision.matchedFromProductCode,
            decision.matchedFromBarcode,
            decision.rawLabelSource,
          ],
        );

        await client.query(
          "UPDATE products SET category = $2, updated_at = NOW() WHERE product_code = $1",
          [product.product_code, decision.displayCategory || null],
        );

        if (decision.reviewStatus === "confirmed") confirmed += 1;
        else if (decision.reviewStatus === "reverify") reverify += 1;
        else needsReview += 1;
      }

      await client.query("COMMIT");
      inTransaction = false;
      return {
        processed: productsToClassify.length,
        confirmed,
        needsReview,
        reverify,
      };
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getCategoryReviewQueue({ search = "", status = "open", limit = 25, offset = 0 } = {}) {
    const normalizedSearch = normalizeQuery(search);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const statusFilter = status === "all" ? null : status;
    const params = [normalizedSearch || null, statusFilter, safeLimit, safeOffset];
    const whereClause = `
      WHERE (
        $1::text IS NULL
        OR LOWER(COALESCE(p.product_code, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(p.product_name, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(p.product_name_eng, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(pc.clean_category, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(p.category, '')) LIKE '%' || $1 || '%'
      )
      AND (
        $2::text IS NULL
        OR ($2 = 'open' AND COALESCE(pc.review_status, 'needs_review') <> 'confirmed')
        OR COALESCE(pc.review_status, 'needs_review') = $2
      )
    `;

    const countResult = await this.pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM products p
      LEFT JOIN product_category pc ON pc.product_code = p.product_code
      ${whereClause}
      `,
      params.slice(0, 2),
    );

    const { rows } = await this.pool.query(
      `
      SELECT
        p.product_code,
        p.product_name,
        p.product_name_eng,
        COALESCE(p.barcode_1, p.barcode_2, p.barcode_3, '') AS barcode,
        p.category,
        pc.clean_category,
        pc.shelf_no,
        pc.pharmacist_zone,
        pc.is_cold_chain,
        pc.requires_signoff,
        pc.category_confidence,
        pc.placement_confidence,
        pc.source,
        pc.review_status,
        pc.rationale,
        pc.needs_reverification,
        pc.raw_label_source,
        pc.decided_by,
        pc.decided_at
      FROM products p
      LEFT JOIN product_category pc ON pc.product_code = p.product_code
      ${whereClause}
      ORDER BY
        CASE COALESCE(pc.review_status, 'needs_review')
          WHEN 'reverify' THEN 0
          WHEN 'needs_review' THEN 1
          WHEN 'proposed' THEN 2
          ELSE 3
        END,
        p.product_code ASC
      LIMIT $3 OFFSET $4
      `,
      params,
    );

    return {
      records: rows.map((row) => ({
        productCode: row.product_code,
        productNameThai: row.product_name || "",
        productNameEng: row.product_name_eng || "",
        barcode: row.barcode || "",
        category: row.category || "",
        cleanCategory: row.clean_category || "",
        shelfNo: row.shelf_no,
        pharmacistZone: row.pharmacist_zone ?? false,
        isColdChain: row.is_cold_chain ?? false,
        requiresSignoff: row.requires_signoff ?? false,
        categoryConfidence: Number(row.category_confidence || 0),
        placementConfidence: Number(row.placement_confidence || 0),
        source: row.source || "",
        reviewStatus: row.review_status || "needs_review",
        rationale: row.rationale || "",
        needsReverification: row.needs_reverification ?? false,
        rawLabelSource: row.raw_label_source || "",
        decidedBy: row.decided_by || "",
        decidedAt: row.decided_at,
      })),
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        total: Number(countResult.rows[0]?.total || 0),
      },
    };
  }

  async getAllCleanCategories() {
    const { rows } = await this.pool.query(`
      SELECT DISTINCT clean_category AS name
      FROM (
        SELECT clean_category FROM category_shelf_rules WHERE clean_category IS NOT NULL
        UNION
        SELECT clean_category FROM product_category WHERE clean_category IS NOT NULL
      ) t
      ORDER BY name ASC
    `);
    return rows.map((r) => r.name);
  }

  async confirmProductCategory({
    productCode,
    cleanCategory,
    shelfNo,
    isColdChain = false,
    decidedBy = "admin",
    note = "",
  }) {
    const normalizedCategory = String(cleanCategory || "").trim();
    if (!normalizedCategory) {
      throw new Error("cleanCategory is required.");
    }

    const safeShelfNo = toOptionalInteger(shelfNo);
    const requiresSignoff = safeShelfNo === 9;
    const displayCategory = buildDisplayCategory(normalizedCategory, safeShelfNo);

    const client = await this.pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      await client.query(
        `
        INSERT INTO product_category (
          product_code,
          clean_category,
          shelf_no,
          pharmacist_zone,
          is_cold_chain,
          requires_signoff,
          category_confidence,
          placement_confidence,
          source,
          review_status,
          rationale,
          needs_reverification,
          decided_by,
          decided_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 1, 1, 'human', 'confirmed', $7, FALSE, $8, NOW(), NOW())
        ON CONFLICT (product_code) DO UPDATE SET
          clean_category = EXCLUDED.clean_category,
          shelf_no = EXCLUDED.shelf_no,
          pharmacist_zone = EXCLUDED.pharmacist_zone,
          is_cold_chain = EXCLUDED.is_cold_chain,
          requires_signoff = EXCLUDED.requires_signoff,
          category_confidence = 1,
          placement_confidence = 1,
          source = 'human',
          review_status = 'confirmed',
          rationale = EXCLUDED.rationale,
          needs_reverification = FALSE,
          decided_by = EXCLUDED.decided_by,
          decided_at = NOW(),
          updated_at = NOW()
        `,
        [
          productCode,
          normalizedCategory,
          safeShelfNo,
          safeShelfNo !== null,
          Boolean(isColdChain),
          requiresSignoff,
          note || "Confirmed by admin review queue.",
          decidedBy,
        ],
      );
      await client.query(
        "UPDATE products SET category = $2, updated_at = NOW() WHERE product_code = $1",
        [productCode, displayCategory],
      );
      await client.query("COMMIT");
      return { ok: true, productCode, category: displayCategory };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCategoryMetrics() {
    const { rows } = await this.pool.query(
      `
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE COALESCE(product_name, '') <> '')::int AS thai_name_count,
        COUNT(*) FILTER (WHERE COALESCE(product_name_eng, '') <> '')::int AS english_name_count,
        COUNT(*) FILTER (
          WHERE COALESCE(barcode_1, '') ~ '^[0-9]{6,}$'
             OR COALESCE(barcode_2, '') ~ '^[0-9]{6,}$'
             OR COALESCE(barcode_3, '') ~ '^[0-9]{6,}$'
        )::int AS barcode_like_count,
        COUNT(*) FILTER (
          WHERE COALESCE(barcode_1, '') ~ '^9{5,}'
             OR COALESCE(barcode_2, '') ~ '^9{5,}'
             OR COALESCE(barcode_3, '') ~ '^9{5,}'
        )::int AS dummy_barcode_count
      FROM products
      `,
    );
    const metrics = rows[0] || {};
    return {
      totalProducts: Number(metrics.total_products || 0),
      thaiNameCoverage: Number(metrics.total_products || 0)
        ? Number(metrics.thai_name_count || 0) / Number(metrics.total_products || 1)
        : 0,
      englishNameCoverage: Number(metrics.total_products || 0)
        ? Number(metrics.english_name_count || 0) / Number(metrics.total_products || 1)
        : 0,
      barcodeCoverage: Number(metrics.total_products || 0)
        ? Number(metrics.barcode_like_count || 0) / Number(metrics.total_products || 1)
        : 0,
      dummyBarcodeRate: Number(metrics.total_products || 0)
        ? Number(metrics.dummy_barcode_count || 0) / Number(metrics.total_products || 1)
        : 0,
    };
  }

  async ingestBranches(payload) {
    let accepted = 0;
    for (const record of payload.records || []) {
      await this.pool.query(
        `
        INSERT INTO branches (branch_code, branch_name, is_hq)
        VALUES ($1, $2, $3)
        ON CONFLICT (branch_code) DO UPDATE SET
          branch_name = EXCLUDED.branch_name,
          is_hq = EXCLUDED.is_hq
        `,
        [record.branchCode, record.branchName || record.branchCode, record.isHq ?? false],
      );
      accepted += 1;
    }
    return { accepted };
  }

  async ingestProducts(payload) {
    const records = payload.records || [];
    if (!records.length) return { accepted: 0 };

    const codes = [], names = [], namesEng = [], b1 = [], b2 = [], b3 = [];
    const sCodes = [], sNames = [];
    const uSmall = [], fSmall = [], uMed = [], fMed = [], uLarge = [], fLarge = [];
    const sCurr = [], sRet = [], sWhs = [], minS = [], maxS = [], lead = [];
    const snapIds = [];

    for (const r of records) {
      codes.push(r.productCode);
      names.push(r.productName);
      namesEng.push(r.productNameEng || null);
      b1.push(r.barcode1 || null);
      b2.push(r.barcode2 || null);
      b3.push(r.barcode3 || null);
      sCodes.push(r.supplierCode || null);
      sNames.push(r.supplierName || null);
      uSmall.push(r.unitSmall || r.unit || null);
      fSmall.push(Number(r.factorSmall ?? 1));
      uMed.push(r.unitMedium || null);
      fMed.push(r.factorMedium ?? null);
      uLarge.push(r.unitLarge || null);
      fLarge.push(r.factorLarge ?? null);
      sCurr.push(Number(r.stockCurrent || 0));
      sRet.push(Number(r.stockRetail || 0));
      sWhs.push(Number(r.stockWarehouse || 0));
      minS.push(Number(r.minStock || 0));
      maxS.push(Number(r.maxStock || 0));
      lead.push(Number(r.leadTimeDays || 0));
      snapIds.push(makeId("stock_snapshot"));
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO products
           (product_code, product_name, product_name_eng, barcode_1, barcode_2, barcode_3,
            supplier_code, supplier_name,
            unit_small, factor_small, unit_medium, factor_medium,
            unit_large, factor_large,
            stock_current, stock_retail, stock_warehouse,
            min_stock, max_stock, lead_time_days, synced_at)
         SELECT
           unnest($1::text[]), unnest($2::text[]), unnest($3::text[]),
           unnest($4::text[]), unnest($5::text[]), unnest($6::text[]),
           unnest($7::text[]), unnest($8::text[]),
           unnest($9::text[]), unnest($10::numeric[]),
           unnest($11::text[]), unnest($12::numeric[]),
           unnest($13::text[]), unnest($14::numeric[]),
           unnest($15::numeric[]), unnest($16::numeric[]), unnest($17::numeric[]),
           unnest($18::numeric[]), unnest($19::numeric[]), unnest($20::numeric[]),
           NOW()
         ON CONFLICT (product_code) DO UPDATE SET
           product_name     = EXCLUDED.product_name,
           product_name_eng = EXCLUDED.product_name_eng,
           barcode_1        = EXCLUDED.barcode_1,
           barcode_2        = EXCLUDED.barcode_2,
           barcode_3        = EXCLUDED.barcode_3,
           supplier_code    = EXCLUDED.supplier_code,
           supplier_name    = EXCLUDED.supplier_name,
           unit_small       = EXCLUDED.unit_small,
           factor_small     = EXCLUDED.factor_small,
           unit_medium      = EXCLUDED.unit_medium,
           factor_medium    = EXCLUDED.factor_medium,
           unit_large       = EXCLUDED.unit_large,
           factor_large     = EXCLUDED.factor_large,
           stock_current    = EXCLUDED.stock_current,
           stock_retail     = EXCLUDED.stock_retail,
           stock_warehouse  = EXCLUDED.stock_warehouse,
           min_stock        = EXCLUDED.min_stock,
           max_stock        = EXCLUDED.max_stock,
           lead_time_days   = EXCLUDED.lead_time_days,
           synced_at        = NOW(),
           updated_at       = NOW()`,
        [codes, names, namesEng, b1, b2, b3, sCodes, sNames,
          uSmall, fSmall, uMed, fMed, uLarge, fLarge,
          sCurr, sRet, sWhs, minS, maxS, lead],
      );

      await client.query(
        `INSERT INTO product_stock_snapshots
           (id, product_code, snapshot_at, stock_current, stock_retail, stock_warehouse, source_name)
         SELECT
           unnest($1::text[]), unnest($2::text[]),
           NOW(),
           unnest($3::numeric[]), unnest($4::numeric[]), unnest($5::numeric[]),
           'adapos_sync'`,
        [snapIds, codes, sCurr, sRet, sWhs],
      );

      await client.query("COMMIT");
      inTransaction = false;
      const categoryResult = await this.refreshProductCategories(codes);
      return { accepted: records.length, categoryRefresh: categoryResult };
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async ingestSalesSummary(payload) {
    const records = payload.records || [];
    if (!records.length) return { accepted: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const ids = [], codes = [], branches = [], pStarts = [], pEnds = [], pDays = [], soldQty = [], avgUsage = [];

    for (const r of records) {
      const periodDays = Number(r.periodDays || 30);
      const periodStart = r.periodStart || new Date(Date.now() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);
      const periodEnd = r.periodEnd || today;
      ids.push(makeId("sales_summary"));
      codes.push(r.productCode);
      branches.push(r.branchCode || null);
      pStarts.push(periodStart);
      pEnds.push(periodEnd);
      pDays.push(periodDays);
      soldQty.push(Number(r.soldQtyBase || 0));
      avgUsage.push(Number(r.avgDailyUsage || 0));
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `DELETE FROM product_sales_summary
         WHERE (product_code, branch_code, period_start, period_end, period_days) IN (
           SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::date[]), unnest($4::date[]), unnest($5::int[])
         )`,
        [codes, branches, pStarts, pEnds, pDays],
      );

      await client.query(
        `INSERT INTO product_sales_summary
           (id, product_code, branch_code, period_start, period_end, period_days, sold_qty_base, avg_daily_usage, source_name)
         SELECT
           unnest($1::text[]), unnest($2::text[]), unnest($3::text[]),
           unnest($4::date[]), unnest($5::date[]), unnest($6::int[]),
           unnest($7::numeric[]), unnest($8::numeric[]),
           'adapos_sync'`,
        [ids, codes, branches, pStarts, pEnds, pDays, soldQty, avgUsage],
      );

      await client.query("COMMIT");
      return { accepted: records.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ingestPurchaseSummary(payload) {
    const records = payload.records || [];
    if (!records.length) return { accepted: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const ids = [], codes = [], pStarts = [], pEnds = [], pDays = [], purchQty = [];

    for (const r of records) {
      const periodDays = Number(r.periodDays || 30);
      const periodStart = r.periodStart || new Date(Date.now() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);
      const periodEnd = r.periodEnd || today;
      ids.push(makeId("purchase_summary"));
      codes.push(r.productCode);
      pStarts.push(periodStart);
      pEnds.push(periodEnd);
      pDays.push(periodDays);
      purchQty.push(Number(r.purchasedQtyBase || 0));
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `DELETE FROM product_purchase_summary
         WHERE (product_code, period_start, period_end, period_days) IN (
           SELECT unnest($1::text[]), unnest($2::date[]), unnest($3::date[]), unnest($4::int[])
         )`,
        [codes, pStarts, pEnds, pDays],
      );

      await client.query(
        `INSERT INTO product_purchase_summary
           (id, product_code, period_start, period_end, period_days, purchased_qty_base, source_name)
         SELECT
           unnest($1::text[]), unnest($2::text[]),
           unnest($3::date[]), unnest($4::date[]), unnest($5::int[]),
           unnest($6::numeric[]),
           'adapos_sync'`,
        [ids, codes, pStarts, pEnds, pDays, purchQty],
      );

      await client.query("COMMIT");
      return { accepted: records.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ingestRunLog(payload) {
    const runId = payload.id || makeId("sync");
    await this.pool.query(
      `
      INSERT INTO sync_runs
        (id, sync_type, started_at, finished_at, status, records_read, records_sent, message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        sync_type = EXCLUDED.sync_type,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        status = EXCLUDED.status,
        records_read = EXCLUDED.records_read,
        records_sent = EXCLUDED.records_sent,
        message = EXCLUDED.message
      `,
      [
        runId,
        payload.syncType || "manual",
        payload.startedAt || new Date().toISOString(),
        payload.finishedAt || new Date().toISOString(),
        payload.status || "success",
        Number(payload.recordsRead || 0),
        Number(payload.recordsSent || 0),
        payload.message || "",
      ],
    );

    if ((payload.status || "").toLowerCase() === "failed") {
      await this.pool.query(
        `
        INSERT INTO sync_errors (id, sync_run_id, sync_type, error_message, error_details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          makeId("sync_error"),
          runId,
          payload.syncType || "manual",
          payload.message || "Sync failed.",
          JSON.stringify(payload.errorDetails || {}),
        ],
      );
    }

    return { accepted: 1 };
  }

  async ingestTransfers(payload) {
    const headers = payload.headers || [];
    const lines = payload.lines || [];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (headers.length) {
        const docNos = [];
        const branchFroms = [];
        const branchTos = [];
        const docTypes = [];
        const docDates = [];
        const tnfDates = [];
        const warehouseFroms = [];
        const warehouseTos = [];
        const transferTypes = [];
        const totals = [];
        const vats = [];
        const grands = [];
        const deptCodes = [];
        const userCodes = [];

        for (const header of headers) {
          docNos.push(header.docNo);
          branchFroms.push(header.branchCode);
          branchTos.push(header.branchCodeTo);
          docTypes.push(header.docType);
          docDates.push(header.docDate);
          tnfDates.push(header.tnfDate);
          warehouseFroms.push(header.warehouseCode);
          warehouseTos.push(header.warehouseCodeTo);
          transferTypes.push(header.transferType);
          totals.push(header.total ?? 0);
          vats.push(header.vat ?? 0);
          grands.push(header.grand ?? 0);
          deptCodes.push(header.deptCode);
          userCodes.push(header.createdBy || header.approvedBy || null);
        }

        await client.query(
          `
          INSERT INTO transfer_headers
            (doc_no, branch_frm, branch_to, doc_type, doc_date, tnf_date,
             wh_frm, wh_to, transfer_type, total, vat, grand, dept_code, usr_code, synced_at)
          SELECT
            unnest($1::text[]), unnest($2::text[]), unnest($3::text[]), unnest($4::text[]),
            unnest($5::date[]), unnest($6::date[]), unnest($7::text[]), unnest($8::text[]),
            unnest($9::text[]), unnest($10::numeric[]), unnest($11::numeric[]), unnest($12::numeric[]),
            unnest($13::text[]), unnest($14::text[]), NOW()
          ON CONFLICT (doc_no) DO UPDATE SET
            branch_frm = EXCLUDED.branch_frm,
            branch_to = EXCLUDED.branch_to,
            doc_type = EXCLUDED.doc_type,
            doc_date = EXCLUDED.doc_date,
            tnf_date = EXCLUDED.tnf_date,
            wh_frm = EXCLUDED.wh_frm,
            wh_to = EXCLUDED.wh_to,
            transfer_type = EXCLUDED.transfer_type,
            total = EXCLUDED.total,
            vat = EXCLUDED.vat,
            grand = EXCLUDED.grand,
            dept_code = EXCLUDED.dept_code,
            usr_code = EXCLUDED.usr_code,
            synced_at = NOW()
          `,
          [
            docNos,
            branchFroms,
            branchTos,
            docTypes,
            docDates,
            tnfDates,
            warehouseFroms,
            warehouseTos,
            transferTypes,
            totals,
            vats,
            grands,
            deptCodes,
            userCodes,
          ],
        );
      }

      if (lines.length) {
        const docNos = [];
        const seqNos = [];
        const productCodes = [];
        const unitCodes = [];
        const unitNames = [];
        const factors = [];
        const qtys = [];
        const qtyBases = [];
        const costs = [];
        const costIns = [];
        const nets = [];
        const vats = [];
        const branchFroms = [];
        const branchTos = [];
        const warehouseFroms = [];
        const warehouseTos = [];
        const docDates = [];

        for (const line of lines) {
          docNos.push(line.docNo);
          seqNos.push(line.lineNo);
          productCodes.push(line.productCode);
          unitCodes.push(line.unitCode);
          unitNames.push(line.unitName);
          factors.push(line.stockFactor ?? 1);
          qtys.push(line.qty ?? 0);
          qtyBases.push(line.qtyBase ?? 0);
          costs.push(line.cost ?? 0);
          costIns.push(line.costIn ?? 0);
          nets.push(line.net ?? 0);
          vats.push(line.vat ?? 0);
          branchFroms.push(line.branchCode);
          branchTos.push(line.branchCodeTo);
          warehouseFroms.push(line.warehouseCode);
          warehouseTos.push(line.warehouseCodeTo);
          docDates.push(line.docDate);
        }

        await client.query(
          `
          INSERT INTO transfer_lines
            (doc_no, seq_no, product_code, unit_code, unit_name, factor,
             qty, qty_base, cost, cost_in, net, vat,
             branch_frm, branch_to, wh_frm, wh_to, doc_date, synced_at)
          SELECT
            unnest($1::text[]), unnest($2::integer[]), unnest($3::text[]), unnest($4::text[]),
            unnest($5::text[]), unnest($6::numeric[]), unnest($7::numeric[]), unnest($8::numeric[]),
            unnest($9::numeric[]), unnest($10::numeric[]), unnest($11::numeric[]), unnest($12::numeric[]),
            unnest($13::text[]), unnest($14::text[]), unnest($15::text[]), unnest($16::text[]),
            unnest($17::date[]), NOW()
          ON CONFLICT (doc_no, seq_no) DO UPDATE SET
            product_code = EXCLUDED.product_code,
            unit_code = EXCLUDED.unit_code,
            unit_name = EXCLUDED.unit_name,
            factor = EXCLUDED.factor,
            qty = EXCLUDED.qty,
            qty_base = EXCLUDED.qty_base,
            cost = EXCLUDED.cost,
            cost_in = EXCLUDED.cost_in,
            net = EXCLUDED.net,
            vat = EXCLUDED.vat,
            branch_frm = EXCLUDED.branch_frm,
            branch_to = EXCLUDED.branch_to,
            wh_frm = EXCLUDED.wh_frm,
            wh_to = EXCLUDED.wh_to,
            doc_date = EXCLUDED.doc_date,
            synced_at = NOW()
          `,
          [
            docNos,
            seqNos,
            productCodes,
            unitCodes,
            unitNames,
            factors,
            qtys,
            qtyBases,
            costs,
            costIns,
            nets,
            vats,
            branchFroms,
            branchTos,
            warehouseFroms,
            warehouseTos,
            docDates,
          ],
        );
      }

      await client.query("COMMIT");
      return {
        acceptedHeaders: headers.length,
        acceptedLines: lines.length,
        headersAccepted: headers.length,
        linesAccepted: lines.length,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTransfersByBranch(branchCode, periodDays = 30) {
    const { rows } = await this.pool.query(
      `
      SELECT
        h.doc_no, h.doc_date, h.tnf_date,
        h.branch_frm, h.branch_to, h.wh_frm, h.wh_to,
        h.transfer_type, h.grand,
        COUNT(l.seq_no)::int   AS line_count,
        COALESCE(SUM(l.qty_base), 0) AS total_qty_base
      FROM transfer_headers h
      LEFT JOIN transfer_lines l ON l.doc_no = h.doc_no
      WHERE (h.branch_frm = $1 OR h.branch_to = $1)
        AND h.doc_date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
      GROUP BY h.doc_no, h.doc_date, h.tnf_date,
               h.branch_frm, h.branch_to, h.wh_frm, h.wh_to,
               h.transfer_type, h.grand
      ORDER BY h.doc_date DESC
      `,
      [branchCode, periodDays],
    );
    return rows.map((r) => ({
      docNo:        r.doc_no,
      docDate:      r.doc_date,
      tnfDate:      r.tnf_date,
      branchFrm:    r.branch_frm,
      branchTo:     r.branch_to,
      whFrm:        r.wh_frm,
      whTo:         r.wh_to,
      transferType: r.transfer_type,
      grand:        Number(r.grand),
      lineCount:    r.line_count,
      totalQtyBase: Number(r.total_qty_base),
    }));
  }
  async ingestPendingReceipts(payload) {
    const headers = payload.headers || [];
    const lines   = payload.lines   || [];
    if (!headers.length) return { headersAccepted: 0, linesAccepted: 0 };

    const branchCodes = [...new Set(headers.map((h) => h.branchCode).filter(Boolean))];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      if (branchCodes.length) {
        await client.query(
          `DELETE FROM ada_pending_receipt_headers
           WHERE branch_code = ANY($1::text[])`,
          [branchCodes],
        );
      }

      for (const h of headers) {
        await client.query(
          `INSERT INTO ada_pending_receipt_headers
             (doc_no, branch_code, doc_type, doc_date, doc_time,
              supplier_code, supplier_name, ref_ext, ref_ext_date,
              warehouse_code, total, vat, grand,
              usr_code, created_by, created_at_ada, sta_doc, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())`,
          [
            h.docNo, h.branchCode, h.docType || null,
            h.docDate || null, h.docTime || null,
            h.supplierCode || null, h.supplierName || null,
            h.refExt || null, h.refExtDate || null,
            h.warehouseCode || null,
            Number(h.total || 0), Number(h.vat || 0), Number(h.grand || 0),
            h.usrCode || null, h.createdBy || null, h.createdAtAda || null,
            h.staDoc || null,
          ],
        );
      }

      for (const l of lines) {
        await client.query(
          `INSERT INTO ada_pending_receipt_lines
             (doc_no, seq_no, product_code, product_name, barcode,
              unit_code, unit_name, factor, qty, qty_base, stock_factor,
              set_price, net, vat, cost_in, lot_no, expired_date,
              warehouse_code, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())`,
          [
            l.docNo, Number(l.seqNo),
            l.productCode || null, l.productName || null, l.barcode || null,
            l.unitCode || null, l.unitName || null,
            Number(l.factor ?? 1), Number(l.qty || 0), Number(l.qtyBase || 0),
            Number(l.stockFactor ?? 1), Number(l.setPrice || 0),
            Number(l.net || 0), Number(l.vat || 0), Number(l.costIn || 0),
            l.lotNo || null,
            l.expiredDate ? new Date(l.expiredDate).toISOString().slice(0, 10) : null,
            l.warehouseCode || null,
          ],
        );
      }

      await client.query("COMMIT");
      return { headersAccepted: headers.length, linesAccepted: lines.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  mapReceiptRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.doc_no)) {
        grouped.set(row.doc_no, {
          docNo: row.doc_no,
          branchCode: row.branch_code,
          docType: row.doc_type,
          docDate: row.doc_date,
          docTime: row.doc_time,
          supplierCode: row.supplier_code,
          supplierName: row.supplier_name,
          refExt: row.ref_ext,
          refExtDate: row.ref_ext_date,
          warehouseCode: row.warehouse_code,
          total: Number(row.total || 0),
          vat: Number(row.vat || 0),
          grand: Number(row.grand || 0),
          usrCode: row.usr_code,
          createdBy: row.created_by,
          createdAtAda: row.created_at_ada,
          staPrcDoc: row.sta_prc_doc,
          syncedAt: row.synced_at,
          lines: [],
        });
      }
      if (row.seq_no != null) {
        grouped.get(row.doc_no).lines.push({
          seqNo: row.seq_no,
          productCode: row.product_code,
          productName: row.product_name,
          barcode: row.barcode,
          unitCode: row.unit_code,
          unitName: row.unit_name,
          factor: Number(row.factor || 1),
          qty: Number(row.qty || 0),
          qtyBase: Number(row.qty_base || 0),
          stockFactor: Number(row.stock_factor || 1),
          setPrice: Number(row.set_price || 0),
          net: Number(row.net || 0),
          vat: Number(row.line_vat || 0),
          costIn: Number(row.cost_in || 0),
          lotNo: row.lot_no,
          expiredDate: row.expired_date,
          warehouseCode: row.line_warehouse_code || row.warehouse_code,
        });
      }
    }
    return [...grouped.values()];
  }

  async getReceiptPage({
    headerTable,
    lineTable,
    branchCode = null,
    date = null,
    search = "",
    sort = "desc",
    page = 1,
    pageSize = 10,
  }) {
    const normalizedSearch = normalizeQuery(search);
    const normalizedSort = String(sort || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 10));
    const offset = (safePage - 1) * safePageSize;
    const params = [branchCode, date, normalizedSearch || null, safePageSize, offset];
    const whereClause = `
      WHERE ($1::text IS NULL OR h.branch_code = $1)
        AND ($2::text IS NULL OR CAST(h.doc_date AS DATE) = $2::date)
        AND (
          $3::text IS NULL
          OR LOWER(COALESCE(h.doc_no, '')) LIKE '%' || $3 || '%'
          OR LOWER(COALESCE(h.supplier_name, '')) LIKE '%' || $3 || '%'
          OR LOWER(COALESCE(h.supplier_code, '')) LIKE '%' || $3 || '%'
          OR LOWER(COALESCE(h.ref_ext, '')) LIKE '%' || $3 || '%'
          OR LOWER(COALESCE(h.created_by, '')) LIKE '%' || $3 || '%'
          OR EXISTS (
            SELECT 1
            FROM ${lineTable} lx
            WHERE lx.doc_no = h.doc_no
              AND (
                LOWER(COALESCE(lx.product_code, '')) LIKE '%' || $3 || '%'
                OR LOWER(COALESCE(lx.product_name, '')) LIKE '%' || $3 || '%'
                OR LOWER(COALESCE(lx.barcode, '')) LIKE '%' || $3 || '%'
                OR LOWER(COALESCE(lx.lot_no, '')) LIKE '%' || $3 || '%'
                OR LOWER(COALESCE(lx.unit_name, '')) LIKE '%' || $3 || '%'
              )
          )
        )
    `;

    const countResult = await this.pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ${headerTable} h
      ${whereClause}
      `,
      params.slice(0, 3),
    );
    const total = Number(countResult.rows[0]?.total || 0);

    const { rows } = await this.pool.query(
      `
      WITH paged_docs AS (
        SELECT h.doc_no
        FROM ${headerTable} h
        ${whereClause}
        ORDER BY h.doc_date ${normalizedSort}, h.doc_time ${normalizedSort}, h.doc_no ${normalizedSort}
        LIMIT $4 OFFSET $5
      )
      SELECT
        h.doc_no, h.branch_code, h.doc_type, h.doc_date, h.doc_time,
        h.supplier_code, h.supplier_name, h.ref_ext, h.ref_ext_date,
        h.warehouse_code, h.total, h.vat, h.grand,
        h.usr_code, h.created_by, h.created_at_ada, h.sta_doc, h.synced_at, h.sta_prc_doc,
        l.seq_no, l.product_code, l.product_name, l.barcode,
        l.unit_code, l.unit_name, l.factor, l.qty, l.qty_base, l.stock_factor,
        l.set_price, l.net, l.vat AS line_vat, l.cost_in, l.lot_no, l.expired_date,
        l.warehouse_code AS line_warehouse_code
      FROM paged_docs d
      JOIN ${headerTable} h ON h.doc_no = d.doc_no
      LEFT JOIN ${lineTable} l ON l.doc_no = h.doc_no
      ORDER BY h.doc_date ${normalizedSort}, h.doc_time ${normalizedSort}, h.doc_no ${normalizedSort}, l.seq_no ASC
      `,
      params,
    );

    return {
      records: this.mapReceiptRows(rows),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      },
    };
  }

  async getPendingReceipts(options = {}) {
    return this.getReceiptPage({
      headerTable: "ada_pending_receipt_headers",
      lineTable: "ada_pending_receipt_lines",
      ...options,
    });
  }

  async ingestApprovedReceipts(branchCode, records) {
    if (!records.length) return { upserted: 0 };

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const h of records) {
        await client.query(
          `INSERT INTO ada_approved_receipt_headers
             (doc_no, branch_code, doc_type, doc_date, doc_time,
              supplier_code, supplier_name, ref_ext, ref_ext_date,
              warehouse_code, total, vat, grand,
              usr_code, created_by, created_at_ada, sta_doc, sta_prc_doc, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
           ON CONFLICT (doc_no) DO UPDATE SET
             branch_code    = EXCLUDED.branch_code,
             doc_type       = EXCLUDED.doc_type,
             doc_date       = EXCLUDED.doc_date,
             doc_time       = EXCLUDED.doc_time,
             supplier_code  = EXCLUDED.supplier_code,
             supplier_name  = EXCLUDED.supplier_name,
             ref_ext        = EXCLUDED.ref_ext,
             ref_ext_date   = EXCLUDED.ref_ext_date,
             warehouse_code = EXCLUDED.warehouse_code,
             total          = EXCLUDED.total,
             vat            = EXCLUDED.vat,
             grand          = EXCLUDED.grand,
             usr_code       = EXCLUDED.usr_code,
             created_by     = EXCLUDED.created_by,
             created_at_ada = EXCLUDED.created_at_ada,
             sta_doc        = EXCLUDED.sta_doc,
             sta_prc_doc    = EXCLUDED.sta_prc_doc,
             synced_at      = NOW()`,
          [
            h.docNo, branchCode, h.docType || null,
            h.docDate || null, h.docTime || null,
            h.supplierCode || null, h.supplierName || null,
            h.refExt || null, h.refExtDate || null,
            h.warehouseCode || null,
            Number(h.total || 0), Number(h.vat || 0), Number(h.grand || 0),
            h.usrCode || null, h.createdBy || null, h.createdAtAda || null,
            h.staDoc || null, h.staPrcDoc || null,
          ],
        );

        // Replace lines for this doc
        await client.query(
          `DELETE FROM ada_approved_receipt_lines WHERE doc_no = $1`,
          [h.docNo],
        );

        for (const l of h.lines || []) {
          await client.query(
            `INSERT INTO ada_approved_receipt_lines
               (doc_no, seq_no, product_code, product_name, barcode,
                unit_code, unit_name, factor, qty, qty_base, stock_factor,
                set_price, net, vat, cost_in, lot_no, expired_date, warehouse_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              h.docNo, Number(l.seqNo),
              l.productCode || null, l.productName || null, l.barcode || null,
              l.unitCode || null, l.unitName || null,
              Number(l.factor ?? 1), Number(l.qty || 0), Number(l.qtyBase || 0),
              Number(l.stockFactor ?? 1), Number(l.setPrice || 0),
              Number(l.net || 0), Number(l.vat || 0), Number(l.costIn || 0),
              l.lotNo || null,
              l.expiredDate ? new Date(l.expiredDate).toISOString().slice(0, 10) : null,
              l.warehouseCode || null,
            ],
          );
        }
      }

      await client.query("COMMIT");
      return { upserted: records.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getApprovedReceipts(options = {}) {
    return this.getReceiptPage({
      headerTable: "ada_approved_receipt_headers",
      lineTable: "ada_approved_receipt_lines",
      ...options,
    });
  }

  async ingestBranchStockSnapshots(records) {
    if (!records.length) return { accepted: 0, insertedOrUpdated: 0 };

    const productCodes = [];
    const productNamesThai = [];
    const productNamesEng = [];
    const barcodes = [];
    const units = [];
    const qtyBranch000 = [];
    const qtyBranch001 = [];
    const qtyBranch002 = [];
    const qtyBranch003 = [];
    const qtyBranch004 = [];
    const qtyBranch005 = [];
    const qtyTotals = [];
    const syncedAts = [];

    for (const record of records) {
      productCodes.push(record.productCode);
      productNamesThai.push(record.productNameThai || null);
      productNamesEng.push(record.productNameEng || null);
      barcodes.push(record.barcode || null);
      units.push(record.unit || null);
      qtyBranch000.push(toBranchStockNumber(record.qtyBranch000));
      qtyBranch001.push(toBranchStockNumber(record.qtyBranch001));
      qtyBranch002.push(toBranchStockNumber(record.qtyBranch002));
      qtyBranch003.push(toBranchStockNumber(record.qtyBranch003));
      qtyBranch004.push(toBranchStockNumber(record.qtyBranch004));
      qtyBranch005.push(toBranchStockNumber(record.qtyBranch005));
      qtyTotals.push(toBranchStockNumber(record.qtyTotalAllBranches));
      syncedAts.push(record.syncedAt);
    }

    await this.pool.query(
      `
      INSERT INTO branch_stock_snapshots (
        product_code,
        product_name_thai,
        product_name_eng,
        barcode,
        unit,
        qty_branch_000,
        qty_branch_001,
        qty_branch_002,
        qty_branch_003,
        qty_branch_004,
        qty_branch_005,
        qty_total_all_branches,
        synced_at
      )
      SELECT
        unnest($1::text[]),
        unnest($2::text[]),
        unnest($3::text[]),
        unnest($4::text[]),
        unnest($5::text[]),
        unnest($6::numeric[]),
        unnest($7::numeric[]),
        unnest($8::numeric[]),
        unnest($9::numeric[]),
        unnest($10::numeric[]),
        unnest($11::numeric[]),
        unnest($12::numeric[]),
        unnest($13::timestamptz[])
      ON CONFLICT (product_code) DO UPDATE SET
        product_name_thai = EXCLUDED.product_name_thai,
        product_name_eng = EXCLUDED.product_name_eng,
        barcode = EXCLUDED.barcode,
        unit = EXCLUDED.unit,
        qty_branch_000 = EXCLUDED.qty_branch_000,
        qty_branch_001 = EXCLUDED.qty_branch_001,
        qty_branch_002 = EXCLUDED.qty_branch_002,
        qty_branch_003 = EXCLUDED.qty_branch_003,
        qty_branch_004 = EXCLUDED.qty_branch_004,
        qty_branch_005 = EXCLUDED.qty_branch_005,
        qty_total_all_branches = EXCLUDED.qty_total_all_branches,
        synced_at = EXCLUDED.synced_at,
        updated_at = NOW()
      `,
      [
        productCodes,
        productNamesThai,
        productNamesEng,
        barcodes,
        units,
        qtyBranch000,
        qtyBranch001,
        qtyBranch002,
        qtyBranch003,
        qtyBranch004,
        qtyBranch005,
        qtyTotals,
        syncedAts,
      ],
    );

    return {
      accepted: records.length,
      insertedOrUpdated: records.length,
    };
  }

  async getBranchStockSnapshots({ search = "", limit = 25, offset = 0 } = {}) {
    const normalizedSearch = normalizeQuery(search);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 25));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const params = [normalizedSearch || null, safeLimit, safeOffset];
    const whereClause = `
      WHERE (
        $1::text IS NULL
        OR LOWER(COALESCE(bs.product_code, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(bs.product_name_thai, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(bs.product_name_eng, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(bs.barcode, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(p.category, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(pc.clean_category, '')) LIKE '%' || $1 || '%'
      )
    `;

    const countResult = await this.pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM branch_stock_snapshots bs
      LEFT JOIN products p ON p.product_code = bs.product_code
      LEFT JOIN product_category pc ON pc.product_code = bs.product_code
      ${whereClause}
      `,
      [normalizedSearch || null],
    );
    const total = Number(countResult.rows[0]?.total || 0);

    const { rows } = await this.pool.query(
      `
      SELECT
        bs.product_code,
        bs.product_name_thai,
        bs.product_name_eng,
        bs.barcode,
        bs.unit,
        COALESCE(p.category, '') AS category,
        COALESCE(pc.review_status, '') AS category_review_status,
        COALESCE(pc.source, '') AS category_source,
        COALESCE(pc.category_confidence, 0) AS category_confidence,
        COALESCE(pc.placement_confidence, 0) AS placement_confidence,
        COALESCE(pc.rationale, '') AS category_rationale,
        bs.qty_branch_000,
        bs.qty_branch_001,
        bs.qty_branch_002,
        bs.qty_branch_003,
        bs.qty_branch_004,
        bs.qty_branch_005,
        bs.qty_total_all_branches,
        bs.synced_at,
        bs.created_at,
        bs.updated_at
      FROM branch_stock_snapshots bs
      LEFT JOIN products p ON p.product_code = bs.product_code
      LEFT JOIN product_category pc ON pc.product_code = bs.product_code
      ${whereClause}
      ORDER BY bs.product_code ASC
      LIMIT $2 OFFSET $3
      `,
      params,
    );

    return {
      records: rows.map(mapBranchStockSnapshotRow),
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        total,
      },
    };
  }

  async getBranchStockExportRows({ search = "" } = {}) {
    const normalizedSearch = normalizeQuery(search);
    const { rows } = await this.pool.query(
      `
      SELECT
        bs.product_code,
        bs.product_name_thai,
        bs.product_name_eng,
        bs.barcode,
        bs.unit,
        COALESCE(p.category, '') AS category,
        COALESCE(pc.review_status, '') AS category_review_status,
        COALESCE(pc.source, '') AS category_source,
        COALESCE(pc.category_confidence, 0) AS category_confidence,
        COALESCE(pc.placement_confidence, 0) AS placement_confidence,
        COALESCE(pc.rationale, '') AS category_rationale,
        bs.qty_branch_000,
        bs.qty_branch_001,
        bs.qty_branch_002,
        bs.qty_branch_003,
        bs.qty_branch_004,
        bs.qty_branch_005,
        bs.qty_total_all_branches,
        bs.synced_at,
        bs.created_at,
        bs.updated_at
      FROM branch_stock_snapshots bs
      LEFT JOIN products p ON p.product_code = bs.product_code
      LEFT JOIN product_category pc ON pc.product_code = bs.product_code
      WHERE (
        $1::text IS NULL
        OR LOWER(COALESCE(bs.product_code, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(bs.product_name_thai, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(bs.product_name_eng, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(bs.barcode, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(p.category, '')) LIKE '%' || $1 || '%'
        OR LOWER(COALESCE(pc.clean_category, '')) LIKE '%' || $1 || '%'
      )
      ORDER BY bs.product_code ASC
      `,
      [normalizedSearch || null],
    );

    return rows.map(mapBranchStockSnapshotRow);
  }

  // ── Nightly sync log ─────────────────────────────────────────────────────────

  // Record that a branch laptop started up and kicked off the sync wrapper.
  // Called by POST /api/sync/heartbeat from the PS1 script on each branch.
  async saveHeartbeat(branchCode, laptopName, event = "startup") {
    const { rows } = await this.pool.query(
      `
      INSERT INTO ingest.laptop_heartbeats (branch_code, laptop_name, event, created_at)
      VALUES ($1, $2, $3, now())
      RETURNING heartbeat_id, branch_code, laptop_name, event, created_at
      `,
      [branchCode, laptopName || null, event || "startup"],
    );
    return { ok: true, heartbeatId: rows[0]?.heartbeat_id ?? null };
  }

  // Mirror a sync run result into ingest.sync_runs (includes branch_code).
  // Called by POST /api/sync/nightly-run-log from the adapos-sync agent.
  async saveNightlyRunLog({ branchCode, syncType, startedAt, finishedAt, status, recordsRead, recordsSent, message }) {
    const safeStatus = ["queued", "running", "success", "failed"].includes(status) ? status : "success";
    const { rows } = await this.pool.query(
      `
      INSERT INTO ingest.sync_runs
        (sync_type, branch_code, started_at, finished_at, status, records_read, records_sent, message, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      RETURNING sync_run_id
      `,
      [
        syncType   || "adapos_sync",
        branchCode,
        startedAt  || new Date().toISOString(),
        finishedAt || null,
        safeStatus,
        Math.max(0, Math.floor(Number(recordsRead  || 0))),
        Math.max(0, Math.floor(Number(recordsSent  || 0))),
        message    || "",
      ],
    );
    return { ok: true, syncRunId: rows[0]?.sync_run_id ?? null };
  }

  // Return a calendar-grid summary for the last `days` days.
  // For each (branch, date) slot the status is one of:
  //   "success"  — at least one run finished with status=success
  //   "failed"   — run exists but none succeeded, OR heartbeat with no run
  //   "offline"  — no heartbeat and no run (laptop was off / never set up)
  //   "pending"  — the date is today (sync hasn't happened yet tonight)
  async getNightlySyncLog(days = 14) {
    const safeDays = Math.max(1, Math.min(Number(days) || 14, 90));

    const { rows } = await this.pool.query(
      `
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - ($1 - 1) * INTERVAL '1 day',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS sync_date
      ),
      known_branches(branch_code) AS (
        VALUES ('000'),('001'),('003'),('004'),('005')
      ),
      runs_agg AS (
        SELECT
          branch_code,
          started_at::date AS sync_date,
          CASE
            WHEN bool_or(status = 'success') THEN 'success'
            WHEN bool_or(status = 'running') THEN 'running'
            ELSE 'failed'
          END AS run_status
        FROM ingest.sync_runs
        WHERE started_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
          AND branch_code IS NOT NULL
        GROUP BY branch_code, started_at::date
      ),
      heartbeats_agg AS (
        SELECT
          branch_code,
          created_at::date AS sync_date,
          true AS had_heartbeat
        FROM ingest.laptop_heartbeats
        WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
        GROUP BY branch_code, created_at::date
      )
      SELECT
        b.branch_code,
        d.sync_date,
        CASE
          WHEN d.sync_date = CURRENT_DATE THEN 'pending'
          WHEN r.run_status IS NOT NULL    THEN r.run_status
          WHEN h.had_heartbeat             THEN 'failed'
          ELSE                                  'offline'
        END AS status
      FROM known_branches b
      CROSS JOIN date_series d
      LEFT JOIN runs_agg       r ON r.branch_code = b.branch_code AND r.sync_date = d.sync_date
      LEFT JOIN heartbeats_agg h ON h.branch_code = b.branch_code AND h.sync_date = d.sync_date
      ORDER BY b.branch_code, d.sync_date
      `,
      [safeDays],
    );

    // Build dates array (ascending)
    const datesSet = new Set();
    const branchesSet = new Set();
    for (const row of rows) {
      datesSet.add(row.sync_date instanceof Date
        ? row.sync_date.toISOString().slice(0, 10)
        : String(row.sync_date).slice(0, 10));
      branchesSet.add(row.branch_code);
    }
    const dates    = Array.from(datesSet).sort();
    const branches = Array.from(branchesSet).sort();

    // Build rows: { "000": { "2026-05-20": "success", ... }, ... }
    const resultRows = {};
    for (const row of rows) {
      const dateKey = row.sync_date instanceof Date
        ? row.sync_date.toISOString().slice(0, 10)
        : String(row.sync_date).slice(0, 10);
      if (!resultRows[row.branch_code]) resultRows[row.branch_code] = {};
      resultRows[row.branch_code][dateKey] = row.status;
    }

    return { dates, branches, rows: resultRows };
  }

  // Return an hourly-grid summary for the last `hours` hours (Bangkok time).
  // For each (branch, hour-slot) the status is one of:
  //   "success"  — at least one run finished with status=success in that slot
  //   "failed"   — run(s) exist but none succeeded
  //   "offline"  — no run recorded in that hour slot
  //   "pending"  — current hour slot with no run yet (sync hasn't fired yet)
  async getHourlySyncLog(hours = 24) {
    const safeHours = Math.max(1, Math.min(Number(hours) || 24, 168)); // cap at 7 days

    const { rows } = await this.pool.query(
      `
      WITH
      hour_series AS (
        SELECT generate_series(
          date_trunc('hour', NOW() AT TIME ZONE 'Asia/Bangkok') - ($1 - 1) * INTERVAL '1 hour',
          date_trunc('hour', NOW() AT TIME ZONE 'Asia/Bangkok'),
          INTERVAL '1 hour'
        ) AS hour_slot
      ),
      known_branches(branch_code) AS (
        VALUES ('000'),('001'),('003'),('004'),('005')
      ),
      runs_agg AS (
        SELECT
          branch_code,
          date_trunc('hour', started_at AT TIME ZONE 'Asia/Bangkok') AS hour_slot,
          CASE
            WHEN bool_or(status = 'success') THEN 'success'
            WHEN bool_or(status = 'running') THEN 'running'
            ELSE 'failed'
          END AS run_status,
          SUM(records_sent)::integer AS total_sent
        FROM ingest.sync_runs
        WHERE started_at >= NOW() - $1 * INTERVAL '1 hour'
          AND branch_code IS NOT NULL
        GROUP BY branch_code, date_trunc('hour', started_at AT TIME ZONE 'Asia/Bangkok')
      )
      SELECT
        b.branch_code,
        TO_CHAR(h.hour_slot, 'YYYY-MM-DD HH24:00') AS hour_key,
        CASE
          WHEN h.hour_slot = date_trunc('hour', NOW() AT TIME ZONE 'Asia/Bangkok')
               AND r.run_status IS NULL THEN 'pending'
          WHEN r.run_status IS NOT NULL  THEN r.run_status
          ELSE 'offline'
        END AS status,
        COALESCE(r.total_sent, 0) AS total_sent
      FROM known_branches b
      CROSS JOIN hour_series h
      LEFT JOIN runs_agg r
        ON r.branch_code = b.branch_code AND r.hour_slot = h.hour_slot
      ORDER BY b.branch_code, h.hour_slot ASC
      `,
      [safeHours],
    );

    // Collect ordered hour keys (ascending) and branches
    const hoursSet    = new Set();
    const branchesSet = new Set();
    for (const row of rows) {
      hoursSet.add(row.hour_key);
      branchesSet.add(row.branch_code);
    }
    const hourKeys = Array.from(hoursSet).sort();
    const branches = Array.from(branchesSet).sort();

    // Build rows: { "005": { "2026-05-28 14:00": { status, totalSent }, ... } }
    const resultRows = {};
    for (const row of rows) {
      if (!resultRows[row.branch_code]) resultRows[row.branch_code] = {};
      resultRows[row.branch_code][row.hour_key] = {
        status:    row.status,
        totalSent: Number(row.total_sent ?? 0),
      };
    }

    return { hours: hourKeys, branches, rows: resultRows };
  }

  // ── Loyalty: member search ────────────────────────────────────────────────────

  async searchMembers(query) {
    const q = normalizeQuery(query);
    if (!q) return [];

    const { rows } = await this.pool.query(
      `
      SELECT id, member_code, display_name, first_name, last_name, phone, email, current_points
      FROM members
      WHERE LOWER(COALESCE(phone, ''))       LIKE $1
         OR LOWER(display_name)              LIKE $1
         OR LOWER(COALESCE(first_name, ''))  LIKE $1
         OR LOWER(COALESCE(last_name, ''))   LIKE $1
         OR LOWER(COALESCE(email, ''))       LIKE $1
         OR LOWER(member_code)               LIKE $1
         OR LOWER(COALESCE(thai_id, ''))     LIKE $1
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(phone, ''))  = $2 THEN 0
          WHEN LOWER(member_code)          = $2 THEN 1
          WHEN LOWER(COALESCE(phone, ''))  LIKE $3 THEN 2
          ELSE 3
        END,
        display_name ASC
      LIMIT 20
      `,
      [`%${q}%`, q, `${q}%`],
    );

    return rows.map(mapMemberRow);
  }

  async getMemberById(memberId) {
    const { rows } = await this.pool.query(
      `SELECT id, member_code, display_name, first_name, last_name, phone, email, sex, dob, remark, current_points
       FROM members WHERE id = $1`,
      [memberId],
    );
    return rows[0] ? mapMemberRow(rows[0]) : null;
  }

  async updateMemberById(memberId, payload) {
    const { rows } = await this.pool.query(
      `
      UPDATE members
      SET
        display_name = $2,
        phone = $3,
        email = $4,
        sex = $5,
        dob = $6,
        remark = $7,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, member_code, display_name, first_name, last_name, phone, email, sex, dob, remark, current_points
      `,
      [
        memberId,
        payload.displayName,
        payload.phone,
        payload.email,
        payload.sex,
        payload.dob,
        payload.remark,
      ],
    );
    return rows[0] ? mapMemberRow(rows[0]) : null;
  }

  // ── Loyalty: claim creation ───────────────────────────────────────────────────

  async createLoyaltyClaim(payload) {
    const { receiptNo, branchCode, cashierStaffCode, soldAt, totalAmount, previewPoints, memberId, items } = payload;
    const awardedPoints = Math.max(0, Math.floor(Number(totalAmount) / 100));

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Duplicate check
      const dup = await client.query(
        `SELECT id FROM loyalty_claims WHERE branch_code = $1 AND receipt_no = $2`,
        [branchCode, receiptNo],
      );
      if (dup.rowCount > 0) {
        const err = new Error("Receipt already claimed.");
        err.statusCode = 409;
        throw err;
      }

      // Member must exist
      const memberResult = await client.query(
        `SELECT id, display_name, current_points FROM members WHERE id = $1`,
        [memberId],
      );
      if (!memberResult.rowCount) {
        const err = new Error("Member not found.");
        err.statusCode = 404;
        throw err;
      }
      const member = memberResult.rows[0];

      // Insert claim header
      const claimId = makeId("clm");
      await client.query(
        `INSERT INTO loyalty_claims
           (id, receipt_no, branch_code, cashier_staff_code, sold_at, total_amount, preview_points, awarded_points, member_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          claimId,
          receiptNo,
          branchCode,
          cashierStaffCode || null,
          soldAt || null,
          Number(totalAmount),
          previewPoints != null ? Number(previewPoints) : null,
          awardedPoints,
          memberId,
        ],
      );

      // Insert line items
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO loyalty_claim_items (id, claim_id, product_code, product_name, qty, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            makeId("clm_item"),
            claimId,
            String(item.productCode || "").trim() || null,
            String(item.productName || "").trim() || null,
            Number(item.qty || 0),
            Number(item.unitPrice || 0),
            Number(item.lineTotal || 0),
          ],
        );
      }

      // Update member balance
      const newBalance = Number(member.current_points) + awardedPoints;
      await client.query(
        `UPDATE members SET current_points = $1, updated_at = NOW() WHERE id = $2`,
        [newBalance, memberId],
      );

      // Ledger entry
      await client.query(
        `INSERT INTO loyalty_point_ledger (id, member_id, claim_id, points_delta, balance_after, event_type, note)
         VALUES ($1, $2, $3, $4, $5, 'earn', $6)`,
        [
          makeId("ledger"),
          memberId,
          claimId,
          awardedPoints,
          newBalance,
          `Earned from receipt ${receiptNo}`,
        ],
      );

      await client.query("COMMIT");

      return {
        ok: true,
        claimId,
        receiptNo,
        member: {
          id: memberId,
          displayName: member.display_name,
          currentPoints: newBalance,
        },
        awardedPoints,
        newPointsBalance: newBalance,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await closePool();
  }
}
