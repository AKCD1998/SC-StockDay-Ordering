import { getPool, closePool } from "../db/pool.js";
import { buildStockDayRow } from "../stockDay.js";
import { makeId, normalizeQuery } from "../utils.js";

function mapSearchRow(row) {
  return {
    productCode: row.product_code,
    productName: row.product_name,
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

export class PostgresRepository {
  constructor() {
    this.pool = getPool();
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

  async ingestProducts(payload) {
    const records = payload.records || [];
    if (!records.length) return { accepted: 0 };

    const codes = [], names = [], b1 = [], b2 = [], b3 = [];
    const sCodes = [], sNames = [];
    const uSmall = [], fSmall = [], uMed = [], fMed = [], uLarge = [], fLarge = [];
    const sCurr = [], sRet = [], sWhs = [], minS = [], maxS = [], lead = [];
    const snapIds = [];

    for (const r of records) {
      codes.push(r.productCode);
      names.push(r.productName);
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
           (product_code, product_name, barcode_1, barcode_2, barcode_3,
            supplier_code, supplier_name,
            unit_small, factor_small, unit_medium, factor_medium,
            unit_large, factor_large,
            stock_current, stock_retail, stock_warehouse,
            min_stock, max_stock, lead_time_days, synced_at)
         SELECT
           unnest($1::text[]), unnest($2::text[]),
           unnest($3::text[]), unnest($4::text[]), unnest($5::text[]),
           unnest($6::text[]), unnest($7::text[]),
           unnest($8::text[]), unnest($9::numeric[]),
           unnest($10::text[]), unnest($11::numeric[]),
           unnest($12::text[]), unnest($13::numeric[]),
           unnest($14::numeric[]), unnest($15::numeric[]), unnest($16::numeric[]),
           unnest($17::numeric[]), unnest($18::numeric[]), unnest($19::numeric[]),
           NOW()
         ON CONFLICT (product_code) DO UPDATE SET
           product_name     = EXCLUDED.product_name,
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
        [codes, names, b1, b2, b3, sCodes, sNames,
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
      return { accepted: records.length };
    } catch (error) {
      await client.query("ROLLBACK");
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

  async close() {
    await closePool();
  }
}
