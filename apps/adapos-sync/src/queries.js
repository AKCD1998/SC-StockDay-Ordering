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
// so we can filter without a join. Join to header on FTBchCode + FTPthDocNo.
export async function getTransferLineRows(pool, branchCode, periodDays) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
  req.input("periodDays", sql.Int, periodDays);
  const result = await req.query(`
    SELECT
      FTBchCode,
      FTPthDocNo,
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

// ── Today's approved purchase receipt headers ──────────────────────────────────
// FTXihStaPrcDoc = '1' means approved by management.
export async function getTodayApprovedReceiptHeaderRows(pool, branchCode) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
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
      AND CAST(FDXihDocDate AS DATE) = CAST(GETDATE() AS DATE)
    ORDER BY FDXihDocDate DESC, FTXihDocTime DESC
  `);
  return result.recordset;
}

// ── Branch-level stock from TCNTPdtInWha × TCNMBranch ─────────────────────────
// Returns one row per active product × branch for branches 000, 001, 003, 004, 005.
// FCPdtQtyNow only reflects HQ (warehouse 001); this is the authoritative source.
export async function getBranchStockRows(pool) {
  const result = await pool.request().query(`
    SELECT
      w.FTPdtCode  AS product_code,
      b.FTBchCode  AS branch_code,
      w.FCWahQty   AS qty
    FROM TCNTPdtInWha w
    JOIN TCNMBranch b ON b.FTBchWheStk = w.FTWahCode
    WHERE b.FTBchCode IN ('000','001','003','004','005')
      AND EXISTS (
        SELECT 1 FROM TCNMPdt p
        WHERE p.FTPdtCode = w.FTPdtCode AND p.FTPdtStaActive = 1
      )
    ORDER BY w.FTPdtCode, b.FTBchCode
  `);
  return result.recordset;
}

// ── Today's approved purchase receipt lines ────────────────────────────────────
export async function getTodayApprovedReceiptLineRows(pool, branchCode) {
  const req = pool.request();
  req.input("branchCode", sql.VarChar(3), branchCode);
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
      AND CAST(h.FDXihDocDate AS DATE) = CAST(GETDATE() AS DATE)
    ORDER BY d.FTXihDocNo, d.FNXidSeqNo
  `);
  return result.recordset;
}
