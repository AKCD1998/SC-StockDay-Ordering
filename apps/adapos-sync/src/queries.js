export function getProductMasterSql() {
  return `
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
WHERE FTPdtStaActive = '1';
`.trim();
}

export function getSalesSummarySql(periodDays, dateCutoff) {
  return `
SELECT
  d.FTPdtCode,
  SUM(d.FCSdtQty * d.FCSdtStkFac) AS sold_qty_base
FROM TPSTSalHD h
JOIN TPSTSalDT d
  ON h.FTBchCode = d.FTBchCode
 AND h.FTShdDocNo = d.FTShdDocNo
WHERE h.FDShdDocDate >= DATEADD(day, -${periodDays}, GETDATE())
  AND h.FDShdDocDate <= '${dateCutoff}'
GROUP BY d.FTPdtCode;
`.trim();
}

export function getPurchaseSummarySql(periodDays) {
  return `
SELECT
  d.FTPdtCode,
  SUM(d.FCXidQty * d.FCXidStkFac) AS purchased_qty_base
FROM TACTPiHD h
JOIN TACTPiDT d
  ON h.FTBchCode = d.FTBchCode
 AND h.FTXihDocNo = d.FTXihDocNo
WHERE h.FDXihDocDate >= DATEADD(day, -${periodDays}, GETDATE())
  AND h.FDXihDocDate <= GETDATE()
GROUP BY d.FTPdtCode;
`.trim();
}
