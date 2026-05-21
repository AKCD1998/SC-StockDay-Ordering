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
