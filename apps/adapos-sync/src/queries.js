import sql from "mssql";

// All functions: SELECT only. Never INSERT / UPDATE / DELETE / EXEC against AdaAcc.
// All branch codes, dates, and periods are passed as sql.input() parameters — never concatenated.

// ── Product master ─────────────────────────────────────────────────────────────
// Product master is global (not branch-scoped). Returns all active products.
export async function getProductMasterRows(pool) {
  const result = await pool.request().query(`
    SELECT
      FTPdtCode,
      FTPdtName,
      FTPdtNameOth,
      FTPdtBarCode1,
      FTPdtBarCode2,
      FTPdtBarCode3,
      FCPdtQtyNow,
      FCPdtQtyRet,
      FCPdtQtyWhs,
      FCPdtMin,
      FCPdtMax,
      FCPdtLeadTime,
      FTSplCode,
      FTPdtSUnit,
      FCPdtSFactor,
      FTPdtMUnit,
      FCPdtMFactor,
      FTPdtLUnit,
      FCPdtLFactor
    FROM TCNMPdt
    WHERE FTPdtStaActive = 1
  `);
  return result.recordset;
}

// ── Sales summary ──────────────────────────────────────────────────────────────
export async function getSalesSummaryRows(pool, branchCode, periodDays, dateCutoff) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  req.input("periodDays", sql.Int, periodDays);
  req.input("dateCutoff", sql.VarChar(10), dateCutoff);
  const result = await req.query(`
    SELECT
      d.FTPdtCode,
      SUM(d.FCSdtQty * d.FCSdtStkFac) AS sold_qty_base
    FROM TPSTSalHD h
    JOIN TPSTSalDT d
      ON h.FTBchCode = d.FTBchCode
     AND h.FTShdDocNo = d.FTShdDocNo
    WHERE h.FTBchCode = @branchCode
      AND h.FDShdDocDate >= DATEADD(day, -@periodDays, GETDATE())
      AND h.FDShdDocDate <= @dateCutoff
      AND EXISTS (SELECT 1 FROM TCNMPdt p WHERE p.FTPdtCode = d.FTPdtCode AND p.FTPdtStaActive = 1)
    GROUP BY d.FTPdtCode
  `);
  return result.recordset;
}

function applySalesDateWindow(req, { periodDays, dateCutoff, fromDate = null, toDate = null } = {}, columnExpr = "h.FDShdDocDate") {
  if (fromDate) {
    req.input("fromDate", sql.VarChar(10), fromDate);
    req.input("toDate", sql.VarChar(10), toDate || fromDate);
    return `
      AND CAST(${columnExpr} AS DATE) >= @fromDate
      AND CAST(${columnExpr} AS DATE) <= @toDate
    `;
  }

  req.input("periodDays", sql.Int, periodDays);
  req.input("dateCutoff", sql.VarChar(10), dateCutoff);
  // Lookback anchors to today (GETDATE()), matching getSalesSummaryRows. dateCutoff
  // is only a permissive upper-bound safety cap (e.g. against a bad system clock),
  // not a substitute for "today" — anchoring the window to it instead of GETDATE()
  // was the bug that made this query see zero rows when dateCutoff was set far in
  // the future.
  return `
    AND CAST(${columnExpr} AS DATE) >= DATEADD(day, -(@periodDays - 1), CAST(GETDATE() AS DATE))
    AND CAST(${columnExpr} AS DATE) <= CAST(@dateCutoff AS DATE)
  `;
}

// ── Sales detail (raw historical sales for reporting / drilldown) ────────────
// This is additive to sales summary. It preserves source bill/date/time/POS so
// the backend can build per-branch, per-POS, per-bill reporting without losing
// the existing 30-day summary sync.
export async function getSalesDetailHeaderRows(
  pool,
  branchCode,
  { periodDays = 30, dateCutoff = null, fromDate = null, toDate = null } = {},
) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  const dateFilter = applySalesDateWindow(req, { periodDays, dateCutoff, fromDate, toDate });
  const result = await req.query(`
    SELECT
      h.FTBchCode,
      h.FTShdDocNo,
      h.FTShdDocType,
      h.FDShdDocDate,
      h.FTShdDocTime,
      h.FTCstCode,
      h.FTShdStaPaid,
      h.FTShdStaRefund,
      h.FTShdStaDoc,
      h.FTUsrCode,
      h.FTPosCode,
      h.FTShdPosCN,
      h.FCShdTotal,
      h.FCShdDis,
      h.FCShdAftDisChg,
      h.FCShdVat,
      h.FCShdGrand
    FROM TPSTSalHD h
    WHERE h.FTBchCode = @branchCode
      -- DocType 1 = sale, DocType 9 = return/refund document. The AdaSoft
      -- "ยอดขายตามช่วงเวลา" net total = Σ sale grand − Σ return grand, so return
      -- documents must be synced too (proven to the baht on branch 005,
      -- 2026-07-23). Refund status (FTShdStaRefund 1/2) is intentionally NOT
      -- filtered: a partially-refunded original (Refund=2) still contributes its
      -- residual and is netted by its matching DocType 9 return.
      AND h.FTShdDocType IN ('1', '9')
      AND h.FTShdStaPaid = '3'
      ${dateFilter}
    ORDER BY h.FDShdDocDate ASC, h.FTShdDocTime ASC, h.FTShdDocNo ASC
  `);
  return result.recordset;
}

export async function getSalesDetailLineRows(
  pool,
  branchCode,
  { periodDays = 30, dateCutoff = null, fromDate = null, toDate = null } = {},
) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  const dateFilter = applySalesDateWindow(req, { periodDays, dateCutoff, fromDate, toDate });
  const result = await req.query(`
    SELECT
      d.FTBchCode,
      d.FTShdDocNo,
      d.FNSdtSeqNo,
      d.FTPdtCode,
      d.FTPdtName,
      d.FTSdtBarCode,
      d.FTPunCode,
      d.FTSdtUnitName,
      d.FCSdtQty,
      d.FCSdtStkFac,
      d.FCSdtQtyAll,
      d.FCSdtSetPrice,
      d.FCSdtDis,
      d.FCSdtNet,
      d.FCSdtDisAvg,
      d.FCSdtFootAvg,
      d.FCSdtRePackAvg,
      d.FTSdtLotNo,
      d.FDSdtExpired
    FROM TPSTSalDT d
    INNER JOIN TPSTSalHD h
      ON h.FTBchCode = d.FTBchCode
     AND h.FTShdDocNo = d.FTShdDocNo
    WHERE h.FTBchCode = @branchCode
      -- Include DocType 9 return lines alongside DocType 1 sale lines, to match
      -- getSalesDetailHeaderRows (see the note there). The AdaSoft
      -- "ยอดขายตามช่วงเวลา" report calculates net from detail FCSdtNet minus
      -- FCSdtDisAvg/FCSdtFootAvg/FCSdtRePackAvg, so those allocation fields must
      -- remain available to the backend.
      AND h.FTShdDocType IN ('1', '9')
      AND h.FTShdStaPaid = '3'
      ${dateFilter}
    ORDER BY h.FDShdDocDate ASC, h.FTShdDocTime ASC, d.FTShdDocNo ASC, d.FNSdtSeqNo ASC
  `);
  return result.recordset;
}

// ── Purchase summary ───────────────────────────────────────────────────────────
export async function getPurchaseSummaryRows(pool, branchCode, periodDays) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  req.input("periodDays", sql.Int, periodDays);
  const result = await req.query(`
    SELECT
      d.FTPdtCode,
      SUM(d.FCXidQty * d.FCXidStkFac) AS purchased_qty_base
    FROM TACTPiHD h
    JOIN TACTPiDT d
      ON h.FTBchCode = d.FTBchCode
     AND h.FTXihDocNo = d.FTXihDocNo
    WHERE (h.FTXihBchFrm = @branchCode OR h.FTXihBchTo = @branchCode)
      AND h.FDXihDocDate >= DATEADD(day, -@periodDays, GETDATE())
    GROUP BY d.FTPdtCode
  `);
  return result.recordset;
}

// ── Product master schema discovery ───────────────────────────────────────────
// Run with --datasets=product_master_schema to inspect TCNMPdt columns.
// Use this to find cost columns (e.g. FCPdtCostIn, FCPdtLastCost) before adding them to getProductMasterRows.
export async function discoverProductMasterSchema(pool) {
  const result = await pool.request().query("SELECT TOP 1 * FROM TCNMPdt");
  return {
    TCNMPdt: {
      columns: Object.keys(result.recordset?.[0] ?? {}),
      sample:  result.recordset?.[0] ?? null,
    },
  };
}

// ── Purchase schema discovery ──────────────────────────────────────────────────
// Run with --datasets=purchase_schema to inspect TACTPiHD and TACTPiDT columns.
export async function discoverPurchaseSchema(pool) {
  const hdResult = await pool.request().query("SELECT TOP 1 * FROM TACTPiHD");
  const dtResult = await pool.request().query("SELECT TOP 1 * FROM TACTPiDT");
  return {
    TACTPiHD: {
      columns: Object.keys(hdResult.recordset?.[0] ?? {}),
      sample:  hdResult.recordset?.[0] ?? null,
    },
    TACTPiDT: {
      columns: Object.keys(dtResult.recordset?.[0] ?? {}),
      sample:  dtResult.recordset?.[0] ?? null,
    },
  };
}

// ── Transfer schema discovery ──────────────────────────────────────────────────
// Run this first. Returns actual column names + one sample row from each table.
// Do not use assumed column names in transfer queries until this output is reviewed.
export async function discoverTransferSchema(pool) {
  const hdResult = await pool.request().query("SELECT TOP 1 * FROM TCNTPdtTnfHD");
  const dtResult = await pool.request().query("SELECT TOP 1 * FROM TCNTPdtTnfDT");

  return {
    TCNTPdtTnfHD: {
      columns: Object.keys(hdResult.recordset?.[0] ?? {}),
      sample:  hdResult.recordset?.[0] ?? null,
    },
    TCNTPdtTnfDT: {
      columns: Object.keys(dtResult.recordset?.[0] ?? {}),
      sample:  dtResult.recordset?.[0] ?? null,
    },
  };
}

// ── Pending purchase receipt headers ──────────────────────────────────────────
// Returns all purchase receipt headers not yet processed into stock.
// FTXihStaPrcDoc IS NULL  →  entered by staff, awaiting CEO approval.
// lookbackDays caps how far back we scan to avoid a full-table scan on SQL 2008 R2.
export async function getPendingReceiptHeaderRows(pool, branchCode, lookbackDays = 90) {
  const req = pool.request();
  req.input("branchCode",   sql.VarChar(3), branchCode);
  req.input("lookbackDays", sql.Int,        lookbackDays);
  const result = await req.query(`
    SELECT
      FTBchCode,
      FTXihDocNo,
      FTXihDocType,
      FDXihDocDate,
      FTXihDocTime,
      FTSplCode,
      FTXihCstName,
      FTXihRefExt,
      FDXihRefExtDate,
      FTWahCode,
      FCXihTotal,
      FCXihVat,
      FCXihGrand,
      FTUsrCode,
      FTWhoIns,
      FDDateIns,
      FTTimeIns,
      FTXihStaDoc
    FROM TACTPiHD
    WHERE FTBchCode          = @branchCode
      AND FTXihStaPrcDoc     IS NULL
      AND FDXihDocDate       >= DATEADD(day, -@lookbackDays, GETDATE())
    ORDER BY FDXihDocDate DESC, FTXihDocTime DESC
  `);
  return result.recordset;
}

// ── Pending purchase receipt lines ────────────────────────────────────────────
// Returns detail lines for all headers that are still pending.
// Joins through header so the IS NULL filter stays in one place.
export async function getPendingReceiptLineRows(pool, branchCode, lookbackDays = 90) {
  const req = pool.request();
  req.input("branchCode",   sql.VarChar(3), branchCode);
  req.input("lookbackDays", sql.Int,        lookbackDays);
  const result = await req.query(`
    SELECT
      d.FTBchCode,
      d.FTXihDocNo,
      d.FNXidSeqNo,
      d.FTPdtCode,
      d.FTPdtName,
      d.FTXidBarCode,
      d.FTPunCode,
      d.FTXidUnitName,
      d.FCXidFactor,
      d.FCXidQty,
      d.FCXidQtyAll,
      d.FCXidStkFac,
      d.FCXidSetPrice,
      d.FCXidNet,
      d.FCXidVat,
      d.FCXidCostIn,
      d.FTXidLotNo,
      d.FDXidExpired,
      d.FTWahCode
    FROM TACTPiDT d
    JOIN TACTPiHD h
      ON  h.FTBchCode   = d.FTBchCode
      AND h.FTXihDocNo  = d.FTXihDocNo
    WHERE h.FTBchCode      = @branchCode
      AND h.FTXihStaPrcDoc IS NULL
      AND h.FDXihDocDate   >= DATEADD(day, -@lookbackDays, GETDATE())
    ORDER BY d.FTXihDocNo, d.FNXidSeqNo
  `);
  return result.recordset;
}

// ── Transfer headers ───────────────────────────────────────────────────────────
// Returns one row per transfer document where the branch is sender OR receiver.
// Join key to detail: FTBchCode + FTPthDocNo.
export async function getTransferHeaderRows(pool, branchCode, periodDays) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  req.input("periodDays", sql.Int, periodDays);
  const result = await req.query(`
    SELECT
      FTBchCode,
      FTPthDocNo,
      FTPthDocType,
      FDPthDocDate,
      FDPthTnfDate,
      FTPthBchFrm,
      FTPthBchTo,
      FTPthWhFrm,
      FTPthWhTo,
      FTPthType,
      FCPthTotal,
      FCPthVat,
      FCPthGrand,
      FTDptCode,
      FTUsrCode
    FROM TCNTPdtTnfHD
    WHERE (FTPthBchFrm = @branchCode OR FTPthBchTo = @branchCode)
      AND FDPthDocDate >= DATEADD(day, -@periodDays, GETDATE())
  `);
  return result.recordset;
}

// ── Transfer lines ─────────────────────────────────────────────────────────────
// Returns one row per product line. The DT table denormalises FTPthBchFrm/To
// so we can filter without a join. Preserve the source composite identity
// FTBchCode + FTPthDocType + FTPthDocNo on every line; the transformer then
// projects the backward-compatible persistence branch key.
export async function getTransferLineRows(pool, branchCode, periodDays) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  req.input("periodDays", sql.Int, periodDays);
  const result = await req.query(`
    SELECT
      FTBchCode,
      FTPthDocNo,
      FTPthDocType,
      FNPtdSeqNo,
      FTPdtCode,
      FTPunCode,
      FTPtdUnitName,
      FCPtdFactor,
      FCPtdQty,
      FCPtdQtyAll,
      FCPtdCost,
      FCPtdCostIn,
      FCPtdNet,
      FCPtdVat,
      FTPthBchFrm,
      FTPthBchTo,
      FTPthWhFrm,
      FTPthWhTo,
      FDPthDocDate
    FROM TCNTPdtTnfDT
    WHERE (FTPthBchFrm = @branchCode OR FTPthBchTo = @branchCode)
      AND FDPthDocDate >= DATEADD(day, -@periodDays, GETDATE())
  `);
  return result.recordset;
}

// ── Approved purchase receipt headers ─────────────────────────────────────────
// FTXihStaPrcDoc = '1' means approved by management.
// Default: last 14 days so missed-day syncs self-heal on the next run.
// Pass fromDate/toDate (YYYY-MM-DD strings) for an explicit backfill range.
export async function getApprovedReceiptHeaderRows(
  pool,
  branchCode,
  { lookbackDays = 14, fromDate = null, toDate = null } = {},
) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);

  let dateFilter;
  if (fromDate && toDate) {
    req.input("fromDate", sql.VarChar(10), fromDate);
    req.input("toDate",   sql.VarChar(10), toDate);
    dateFilter = "AND CAST(FDXihDocDate AS DATE) >= @fromDate AND CAST(FDXihDocDate AS DATE) <= @toDate";
  } else {
    req.input("lookbackDays", sql.Int, lookbackDays);
    dateFilter = "AND FDXihDocDate >= DATEADD(day, -@lookbackDays, CAST(GETDATE() AS DATE))";
  }

  const result = await req.query(`
    SELECT
      FTBchCode, FTXihDocNo, FTXihDocType,
      FDXihDocDate, FTXihDocTime, FTSplCode, FTXihCstName, FTXihRefExt, FDXihRefExtDate,
      FTWahCode, FCXihTotal, FCXihVat, FCXihGrand,
      FTUsrCode, FTWhoIns, FDDateIns, FTTimeIns,
      FTXihStaDoc, FTXihStaPrcDoc
    FROM TACTPiHD
    WHERE FTBchCode = @branchCode
      AND FTXihStaPrcDoc = '1'
      ${dateFilter}
    ORDER BY FDXihDocDate DESC, FTXihDocTime DESC
  `);
  return result.recordset;
}

// ── Branch-level stock from local branch product master ───────────────────────
// On branch laptops, TCNTPdtInWha warehouse mappings are not reliable for
// inferring "which branch owns this qty". The local branch's actual on-hand
// stock is reflected in TCNMPdt.FCPdtQtyRet on that machine, so emit one row
// per active product and tag it with the syncing branch code directly.
export async function getBranchStockRows(pool, branchCode) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);

  const result = await req.query(`
    SELECT
      p.FTPdtCode AS product_code,
      p.FTPdtName AS product_name_thai,
      p.FTPdtNameOth AS product_name_eng,
      COALESCE(p.FTPdtBarCode1, p.FTPdtBarCode2, p.FTPdtBarCode3) AS barcode,
      COALESCE(u.FTPunName, p.FTPdtSUnit, p.FTPdtMUnit, p.FTPdtLUnit) AS unit,
      @branchCode AS branch_code,
      COALESCE(p.FCPdtQtyRet, 0) AS qty,
      COALESCE(p.FCPdtCostAvg, 0) AS cost_avg
    FROM TCNMPdt p
    LEFT JOIN TCNMPdtUnit u ON u.FTPunCode = COALESCE(p.FTPdtSUnit, p.FTPdtMUnit, p.FTPdtLUnit)
    WHERE p.FTPdtStaActive = 1
    ORDER BY p.FTPdtCode
  `);
  return result.recordset;
}

// ── Product price defaults (master) ────────────────────────────────────────────
// Master/default prices live on the global product master TCNMPdt — one row per
// product, no branch dimension. These are the fallback the backend applies when a
// branch has no override. Real AdaAcc column names (verified on this HQ instance):
//   retail levels 1..3:    FCPdtRetPri{S,M,L}{1..3}   (float)
//   wholesale levels 1..5: FCPdtWhsPri{S,M,L}{1..5}   (float)
// Unit *names* (e.g. แผง/โหล) are resolved from TCNMPdtUnit because TCNMPdt stores
// only unit codes. Active products only, to stay aligned with getProductMasterRows.
export async function getProductPriceDefaultRows(pool) {
  const result = await pool.request().query(`
    SELECT
      p.FTPdtCode,
      p.FTPdtName,
      p.FTPdtNameOth,
      p.FTPdtBarCode1,
      p.FTPdtBarCode2,
      p.FTPdtBarCode3,
      p.FTPdtStaSetPri,
      p.FTPdtSUnit, p.FCPdtSFactor, uS.FTPunName AS unitNameS,
      p.FTPdtMUnit, p.FCPdtMFactor, uM.FTPunName AS unitNameM,
      p.FTPdtLUnit, p.FCPdtLFactor, uL.FTPunName AS unitNameL,
      p.FCPdtRetPriS1, p.FCPdtRetPriS2, p.FCPdtRetPriS3,
      p.FCPdtRetPriM1, p.FCPdtRetPriM2, p.FCPdtRetPriM3,
      p.FCPdtRetPriL1, p.FCPdtRetPriL2, p.FCPdtRetPriL3,
      p.FCPdtWhsPriS1, p.FCPdtWhsPriS2, p.FCPdtWhsPriS3, p.FCPdtWhsPriS4, p.FCPdtWhsPriS5,
      p.FCPdtWhsPriM1, p.FCPdtWhsPriM2, p.FCPdtWhsPriM3, p.FCPdtWhsPriM4, p.FCPdtWhsPriM5,
      p.FCPdtWhsPriL1, p.FCPdtWhsPriL2, p.FCPdtWhsPriL3, p.FCPdtWhsPriL4, p.FCPdtWhsPriL5
    FROM TCNMPdt p
    LEFT JOIN TCNMPdtUnit uS ON uS.FTPunCode = p.FTPdtSUnit
    LEFT JOIN TCNMPdtUnit uM ON uM.FTPunCode = p.FTPdtMUnit
    LEFT JOIN TCNMPdtUnit uL ON uL.FTPunCode = p.FTPdtLUnit
    WHERE p.FTPdtStaActive = 1
    ORDER BY p.FTPdtCode
  `);
  return result.recordset;
}

// ── Per-branch price overrides ─────────────────────────────────────────────────
// TCNTPdtBchPrice holds branch-specific overrides, keyed (FTPdtCode, FTBchCode).
// The HQ/mother DB is consolidated, so this returns rows for ALL branches (000–005)
// — grouping per branch happens at post time. NOT branch-filtered here on purpose.
// Override columns are NULLABLE: a NULL means "no override for this slot" and must
// fall back to master at the backend — the transform never ships NULL as a price.
//   retail levels 1..3:    FCPbpRetPri{S,M,L}{1..3}
//   wholesale levels 1..5: FCPbpWhsPri{S,M,L}{1..5}
// FDDateUpd is converted in SQL with style 23 ('YYYY-MM-DD') — language-independent,
// so the raw stored year survives (no Thai Buddhist-Era rendering from CONVERT).
// Inner-joined to active products to keep scope identical to the defaults dataset.
export async function getBranchPriceOverrideRows(pool) {
  const result = await pool.request().query(`
    SELECT
      bp.FTBchCode,
      bp.FTPdtCode,
      bp.FCPbpRetPriS1, bp.FCPbpRetPriS2, bp.FCPbpRetPriS3,
      bp.FCPbpRetPriM1, bp.FCPbpRetPriM2, bp.FCPbpRetPriM3,
      bp.FCPbpRetPriL1, bp.FCPbpRetPriL2, bp.FCPbpRetPriL3,
      bp.FCPbpWhsPriS1, bp.FCPbpWhsPriS2, bp.FCPbpWhsPriS3, bp.FCPbpWhsPriS4, bp.FCPbpWhsPriS5,
      bp.FCPbpWhsPriM1, bp.FCPbpWhsPriM2, bp.FCPbpWhsPriM3, bp.FCPbpWhsPriM4, bp.FCPbpWhsPriM5,
      bp.FCPbpWhsPriL1, bp.FCPbpWhsPriL2, bp.FCPbpWhsPriL3, bp.FCPbpWhsPriL4, bp.FCPbpWhsPriL5,
      CONVERT(char(10), bp.FDDateUpd, 23) AS FDDateUpdStr,
      bp.FTTimeUpd
    FROM TCNTPdtBchPrice bp
    INNER JOIN TCNMPdt p
      ON  p.FTPdtCode      = bp.FTPdtCode
      AND p.FTPdtStaActive = 1
    ORDER BY bp.FTBchCode, bp.FTPdtCode
  `);
  return result.recordset;
}

// ── Approved purchase receipt lines ───────────────────────────────────────────
// Date filter mirrors getApprovedReceiptHeaderRows — pass same options.
export async function getApprovedReceiptLineRows(
  pool,
  branchCode,
  { lookbackDays = 14, fromDate = null, toDate = null } = {},
) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);

  let dateFilter;
  if (fromDate && toDate) {
    req.input("fromDate", sql.VarChar(10), fromDate);
    req.input("toDate",   sql.VarChar(10), toDate);
    dateFilter = "AND CAST(h.FDXihDocDate AS DATE) >= @fromDate AND CAST(h.FDXihDocDate AS DATE) <= @toDate";
  } else {
    req.input("lookbackDays", sql.Int, lookbackDays);
    dateFilter = "AND h.FDXihDocDate >= DATEADD(day, -@lookbackDays, CAST(GETDATE() AS DATE))";
  }

  const result = await req.query(`
    SELECT
      d.FTBchCode, d.FTXihDocNo, d.FNXidSeqNo,
      d.FTPdtCode, d.FTPdtName, d.FTXidBarCode,
      d.FTPunCode, d.FTXidUnitName, d.FCXidFactor,
      d.FCXidQty, d.FCXidQtyAll, d.FCXidStkFac,
      d.FCXidSetPrice, d.FCXidNet, d.FCXidVat,
      d.FCXidCostIn, d.FTXidLotNo, d.FDXidExpired,
      d.FTWahCode
    FROM TACTPiDT d
    INNER JOIN TACTPiHD h
      ON  h.FTBchCode  = d.FTBchCode
      AND h.FTXihDocNo = d.FTXihDocNo
    WHERE d.FTBchCode = @branchCode
      AND h.FTXihStaPrcDoc = '1'
      ${dateFilter}
    ORDER BY d.FTXihDocNo, d.FNXidSeqNo
  `);
  return result.recordset;
}
