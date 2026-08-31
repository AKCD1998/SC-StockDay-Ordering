// Maps raw AdaAcc rows to the API payload shapes expected by the server.

/**
 * Format a SQL Server DATE value (JS Date object from mssql) as a plain
 * 'YYYY-MM-DD' string in Bangkok timezone, so that it is stored in the
 * PostgreSQL DATE column with the correct calendar date regardless of the
 * UTC offset of the mother PC or the Render server.
 */
function toBangkokDateString(value) {
  if (value == null) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

export function toProductRecords(rows) {
  return rows.map((r) => ({
    productCode:    r.FTPdtCode,
    productName:    r.FTPdtName,
    productNameEng: r.FTPdtNameOth || null,
    barcode1:       r.FTPdtBarCode1  || null,
    barcode2:       r.FTPdtBarCode2  || null,
    barcode3:       r.FTPdtBarCode3  || null,
    supplierCode:   r.FTSplCode      || null,
    unitSmall:      r.FTPdtSUnit     || null,
    factorSmall:    r.FCPdtSFactor   ?? 1,
    unitMedium:     r.FTPdtMUnit     || null,
    factorMedium:   r.FCPdtMFactor   ?? null,
    unitLarge:      r.FTPdtLUnit     || null,
    factorLarge:    r.FCPdtLFactor   ?? null,
    // LEGACY / APPROXIMATE: these come from the global product master (TCNMPdt)
    // on whichever machine ran the sync. They are NOT valid as branch-level
    // stock truth — use branch_stock_snapshots (/api/branch-stock) for that.
    stockCurrent:   r.FCPdtQtyNow    ?? 0,
    stockRetail:    r.FCPdtQtyRet    ?? 0,
    stockWarehouse: r.FCPdtQtyWhs    ?? 0,
    minStock:       r.FCPdtMin       ?? 0,
    maxStock:       r.FCPdtMax       ?? 0,
    leadTimeDays:   r.FCPdtLeadTime  ?? 0,
  }));
}

function transferSourceIdentity(value) {
  return value == null ? "" : String(value).trim();
}

function transferSourceBranchIdentity(record) {
  return transferSourceIdentity(record.FTBchCode) || transferSourceIdentity(record.FTPthBchFrm);
}

function transferPersistenceBranchIdentity(record) {
  // Preserve the key older Full payloads established through the backend's
  // branchFrm fallback. FTBchCode fills only source rows (observed types 2/3)
  // where branchFrm is empty and no valid Postgres key previously existed.
  return transferSourceIdentity(record.FTPthBchFrm) || transferSourceIdentity(record.FTBchCode);
}

function indexTransferHeadersByDocNo(headerRows) {
  const byDocNo = new Map();
  for (const header of headerRows) {
    const docNo = transferSourceIdentity(header.FTPthDocNo);
    if (!byDocNo.has(docNo)) byDocNo.set(docNo, []);
    byDocNo.get(docNo).push(header);
  }
  return byDocNo;
}

function transferHeaderCandidates(headersByDocNo, line) {
  const docNo = transferSourceIdentity(line.FTPthDocNo);
  const docType = transferSourceIdentity(line.FTPthDocType);
  const sourceBranchCode = transferSourceIdentity(line.FTBchCode);
  const persistenceBranchCode = transferSourceIdentity(line.FTPthBchFrm);

  return (headersByDocNo.get(docNo) ?? []).filter((header) => {
    if (docType && transferSourceIdentity(header.FTPthDocType) !== docType) return false;
    if (sourceBranchCode && transferSourceBranchIdentity(header) !== sourceBranchCode) return false;
    if (!sourceBranchCode && persistenceBranchCode && transferPersistenceBranchIdentity(header) !== persistenceBranchCode) return false;
    return true;
  });
}

function resolveTransferLineIdentity(headersByDocNo, line) {
  const candidates = transferHeaderCandidates(headersByDocNo, line);
  const identities = new Map(candidates.map((candidate) => {
    const identity = {
      docType: transferSourceIdentity(candidate.FTPthDocType),
      branchCode: transferPersistenceBranchIdentity(candidate),
    };
    return [JSON.stringify([identity.branchCode, identity.docType]), identity];
  }));

  if (identities.size === 0 &&
      transferSourceIdentity(line.FTPthDocNo) &&
      transferSourceIdentity(line.FTPthDocType) &&
      transferSourceBranchIdentity(line)) {
    throw new Error(
      "Transfer line has no matching header for composite identity (branchCode, docType, docNo).",
    );
  }

  if (identities.size !== 1) {
    throw new Error("Transfer line identity requires an unambiguous branch code and document type.");
  }

  const [identity] = identities.values();
  if (!identity.docType || !identity.branchCode) {
    throw new Error("Transfer line identity requires an unambiguous branch code and document type.");
  }
  return identity;
}

export function toTransferPayload(headerRows, lineRows, { compositeIdentity = false } = {}) {
  // Preserve the deployed Full-transfer contract unless Transfer Shadow is
  // explicitly enabled. This keeps the new identity validation from changing
  // branches that are not participating in the Transfer acceptance window.
  if (!compositeIdentity) {
    return {
      headers: headerRows.map((h) => ({
        docNo:     h.FTPthDocNo,
        docType:   h.FTPthDocType   || null,
        docDate:   toBangkokDateString(h.FDPthDocDate),
        tnfDate:   toBangkokDateString(h.FDPthTnfDate),
        branchFrm: h.FTPthBchFrm,
        branchTo:  h.FTPthBchTo,
        whFrm:     h.FTPthWhFrm     || null,
        whTo:      h.FTPthWhTo      || null,
        type:      h.FTPthType      || null,
        total:     Number(h.FCPthTotal  || 0),
        vat:       Number(h.FCPthVat    || 0),
        grand:     Number(h.FCPthGrand  || 0),
        deptCode:  h.FTDptCode      || null,
        usrCode:   h.FTUsrCode      || null,
      })),
      lines: lineRows.map((l) => ({
        docNo:       l.FTPthDocNo,
        seqNo:       Number(l.FNPtdSeqNo),
        productCode: l.FTPdtCode      || null,
        unitCode:    l.FTPunCode      || null,
        unitName:    l.FTPtdUnitName  || null,
        factor:      Number(l.FCPtdFactor  ?? 1),
        qty:         Number(l.FCPtdQty     || 0),
        qtyBase:     Number(l.FCPtdQtyAll  || 0),
        cost:        Number(l.FCPtdCost    || 0),
        costIn:      Number(l.FCPtdCostIn  || 0),
        net:         Number(l.FCPtdNet     || 0),
        vat:         Number(l.FCPtdVat     || 0),
        branchFrm:   l.FTPthBchFrm    || null,
        branchTo:    l.FTPthBchTo     || null,
        whFrm:       l.FTPthWhFrm     || null,
        whTo:        l.FTPthWhTo      || null,
        docDate:     toBangkokDateString(l.FDPthDocDate),
      })),
    };
  }

  // Avoid an O(headers × lines) orphan check on real branch-sized scans.
  // Sparse matching only examines headers sharing the same document number.
  const headersByDocNo = indexTransferHeadersByDocNo(headerRows);
  const headers = headerRows.map((h) => ({
    docNo:     h.FTPthDocNo,
    docType:   h.FTPthDocType   || null,
    branchCode: transferPersistenceBranchIdentity(h) || null,
    docDate:   toBangkokDateString(h.FDPthDocDate),
    tnfDate:   toBangkokDateString(h.FDPthTnfDate),
    branchFrm: h.FTPthBchFrm,
    branchTo:  h.FTPthBchTo,
    whFrm:     h.FTPthWhFrm     || null,
    whTo:      h.FTPthWhTo      || null,
    type:      h.FTPthType      || null,
    total:     Number(h.FCPthTotal  || 0),
    vat:       Number(h.FCPthVat    || 0),
    grand:     Number(h.FCPthGrand  || 0),
    deptCode:  h.FTDptCode      || null,
    usrCode:   h.FTUsrCode      || null,
  }));
  const lines = lineRows.map((l) => {
    const identity = resolveTransferLineIdentity(headersByDocNo, l);
    return {
      docNo:       l.FTPthDocNo,
      docType:     identity.docType,
      branchCode:  identity.branchCode,
      seqNo:       Number(l.FNPtdSeqNo),
      productCode: l.FTPdtCode      || null,
      unitCode:    l.FTPunCode      || null,
      unitName:    l.FTPtdUnitName  || null,
      factor:      Number(l.FCPtdFactor  ?? 1),
      qty:         Number(l.FCPtdQty     || 0),
      qtyBase:     Number(l.FCPtdQtyAll  || 0),
      cost:        Number(l.FCPtdCost    || 0),
      costIn:      Number(l.FCPtdCostIn  || 0),
      net:         Number(l.FCPtdNet     || 0),
      vat:         Number(l.FCPtdVat     || 0),
      branchFrm:   l.FTPthBchFrm    || null,
      branchTo:    l.FTPthBchTo     || null,
      whFrm:       l.FTPthWhFrm     || null,
      whTo:        l.FTPthWhTo      || null,
      docDate:     toBangkokDateString(l.FDPthDocDate),
    };
  });

  // Full transfer ingestion is header-owned. A line-only tuple would be
  // ignored by document chunking and cannot be safely upserted as a child of
  // some other document. Refuse the whole run before POSTing or shadow-cache
  // advancement instead of silently dropping/counting different row sets.
  const headerKeys = new Set(headers.map(payloadDocumentKey));
  for (const line of lines) {
    if (!headerKeys.has(payloadDocumentKey(line))) {
      throw new Error(
        "Transfer line has no matching header for composite identity (branchCode, docType, docNo).",
      );
    }
  }

  return { headers, lines };
}

// ── Pending purchase receipts ──────────────────────────────────────────────────
export function toPendingReceiptPayload(hdRows, dtRows) {
  return {
    headers: hdRows.map((h) => ({
      docNo:         h.FTXihDocNo,
      docType:       h.FTXihDocType       || null,
      docDate:       toBangkokDateString(h.FDXihDocDate),
      docTime:       h.FTXihDocTime       || null,
      branchCode:    h.FTBchCode,
      supplierCode:  h.FTSplCode          || null,
      supplierName:  h.FTXihCstName       || null,
      refExt:        h.FTXihRefExt        || null,
      refExtDate:    toBangkokDateString(h.FDXihRefExtDate),
      warehouseCode: h.FTWahCode          || null,
      total:         Number(h.FCXihTotal  || 0),
      vat:           Number(h.FCXihVat    || 0),
      grand:         Number(h.FCXihGrand  || 0),
      usrCode:       h.FTUsrCode          || null,
      createdBy:     h.FTWhoIns           || null,
      createdAtAda:  h.FDDateIns          || null,
      staDoc:        h.FTXihStaDoc        || null,
    })),
    lines: dtRows.map((d) => ({
      docNo:         d.FTXihDocNo,
      seqNo:         Number(d.FNXidSeqNo),
      productCode:   d.FTPdtCode          || null,
      productName:   d.FTPdtName          || null,
      barcode:       d.FTXidBarCode       || null,
      unitCode:      d.FTPunCode          || null,
      unitName:      d.FTXidUnitName      || null,
      factor:        Number(d.FCXidFactor    ?? 1),
      qty:           Number(d.FCXidQty       || 0),
      qtyBase:       Number(d.FCXidQtyAll    || 0),
      stockFactor:   Number(d.FCXidStkFac    ?? 1),
      setPrice:      Number(d.FCXidSetPrice  || 0),
      net:           Number(d.FCXidNet       || 0),
      vat:           Number(d.FCXidVat       || 0),
      costIn:        Number(d.FCXidCostIn    || 0),
      lotNo:         d.FTXidLotNo         || null,
      expiredDate:   toBangkokDateString(d.FDXidExpired),
      warehouseCode: d.FTWahCode          || null,
    })),
  };
}

// ── Approved purchase receipts (today) ────────────────────────────────────────
export function toApprovedReceiptPayload(hdRows, dtRows) {
  return hdRows.map((h) => {
    const lines = dtRows
      .filter((d) => d.FTXihDocNo === h.FTXihDocNo)
      .map((d) => ({
        seqNo:         Number(d.FNXidSeqNo    ?? 0),
        productCode:   d.FTPdtCode            || null,
        productName:   d.FTPdtName            || null,
        barcode:       d.FTXidBarCode         || null,
        unitCode:      d.FTPunCode            || null,
        unitName:      d.FTXidUnitName        || null,
        factor:        Number(d.FCXidFactor   ?? 1),
        qty:           Number(d.FCXidQty      || 0),
        qtyBase:       Number(d.FCXidQtyAll   || 0),
        stockFactor:   Number(d.FCXidStkFac   ?? 1),
        setPrice:      Number(d.FCXidSetPrice || 0),
        net:           Number(d.FCXidNet      || 0),
        vat:           Number(d.FCXidVat      || 0),
        costIn:        Number(d.FCXidCostIn   || 0),
        lotNo:         d.FTXidLotNo           || null,
        expiredDate:   toBangkokDateString(d.FDXidExpired),
        warehouseCode: d.FTWahCode            || null,
      }));
    return {
      branchCode:    h.FTBchCode             || null,
      docNo:         h.FTXihDocNo            || null,
      docType:       h.FTXihDocType          || null,
      docDate:       toBangkokDateString(h.FDXihDocDate),
      docTime:       h.FTXihDocTime          || null,
      supplierCode:  h.FTSplCode             || null,
      supplierName:  h.FTXihCstName          || null,
      refExt:        h.FTXihRefExt           || null,
      refExtDate:    toBangkokDateString(h.FDXihRefExtDate),
      warehouseCode: h.FTWahCode             || null,
      total:         Number(h.FCXihTotal     || 0),
      vat:           Number(h.FCXihVat       || 0),
      grand:         Number(h.FCXihGrand     || 0),
      usrCode:       h.FTUsrCode             || null,
      createdBy:     h.FTWhoIns              || null,
      createdAtAda:  h.FDDateIns             || null,
      staDoc:        h.FTXihStaDoc           || null,
      staPrcDoc:     h.FTXihStaPrcDoc        || null,
      lines,
    };
  });
}

// Fixed whitelist of branch codes allowed to sync per-branch stock. Mirrors the
// server's BRANCH_STOCK_COLUMNS whitelist. Unknown codes are rejected so a
// misconfigured agent can never be routed to an arbitrary branch's column.
export const BRANCH_STOCK_SYNC_BRANCHES = new Set(["000", "001", "002", "003", "004", "005"]);

// Build branch-stock sync records for a SINGLE branch. Each record carries only
// that branch's qty/cost — never fake zeroes for the other branches — so the
// server can update just this branch's column and a sync from one branch can
// never overwrite another branch's stored quantity. The owning branch is sent
// explicitly at the top level of the request (see index.js), not embedded as a
// wide per-branch row.
export function toBranchStockRecords(rows, branchCode) {
  const normalizedBranch = String(branchCode || "").padStart(3, "0");
  if (!BRANCH_STOCK_SYNC_BRANCHES.has(normalizedBranch)) {
    throw new Error(`Refusing to build branch-stock records for unknown branch code: ${branchCode}`);
  }

  const syncedAt = new Date().toISOString();
  const snapshots = new Map();

  for (const row of rows) {
    const productCode = row.product_code;
    if (!productCode) continue;

    // getBranchStockRows returns one row per active product; last write wins.
    snapshots.set(productCode, {
      productCode,
      branchCode: normalizedBranch,
      productNameThai: row.product_name_thai || "",
      productNameEng: row.product_name_eng || "",
      barcode: row.barcode || "",
      unit: row.unit || "",
      qty: Number(row.qty || 0),
      // Send null (not 0) when cost is unknown so the server's COALESCE keeps any
      // previously stored cost instead of overwriting it with a fake zero.
      costAvg: row.cost_avg == null ? null : Number(row.cost_avg),
      syncedAt,
    });
  }

  return [...snapshots.values()];
}

// Accumulate-mode stock history. Reuses the same rows as toBranchStockRecords
// (current overwrite-mode sync) but posts to /api/sync/ada/stock-snapshots
// instead of /api/branch-stock/sync — that endpoint is insert-only (unique key
// includes snapshotAt), so each call adds a new row rather than overwriting the
// previous one. snapshotAt should be the actual moment this scheduled run fired
// (e.g. the 08:20 or 19:20 run), not the underlying AdaAcc data's own timestamp,
// since TCNMPdt.FCPdtQtyRet itself has no per-row timestamp to reuse.
export function toStockSnapshotRecords(rows, branchCode, snapshotAt = new Date().toISOString()) {
  const normalizedBranch = String(branchCode || "").padStart(3, "0");
  if (!BRANCH_STOCK_SYNC_BRANCHES.has(normalizedBranch)) {
    throw new Error(`Refusing to build stock-snapshot records for unknown branch code: ${branchCode}`);
  }

  return rows
    .filter((row) => row.product_code)
    .map((row) => ({
      productCode: row.product_code,
      branchCode: normalizedBranch,
      snapshotAt,
      qtyOnHand: Number(row.qty || 0),
      unitCode: row.unit || null,
      barcode: row.barcode || null,
      productNameThai: row.product_name_thai || null,
      sourceTable: "TCNMPdt",
    }));
}

function signedSalesQtyBase(qtyRaw, stockFactorRaw, qtyAllRaw) {
  const qty = Number(qtyRaw ?? 0);
  const stockFactor = Number(stockFactorRaw ?? 1);
  const calculated = qty * (Number.isFinite(stockFactor) ? stockFactor : 1);
  if (qtyAllRaw == null) return calculated;

  const qtyAll = Number(qtyAllRaw);
  if (!Number.isFinite(qtyAll)) return calculated;
  if (qty < 0 && qtyAll > 0) return -qtyAll;
  if (qty > 0 && qtyAll < 0) return Math.abs(qtyAll);
  return qtyAll;
}

export function toSalesDetailPayload(headerRows, lineRows) {
  const syncedAt = new Date().toISOString();
  return {
    sourceSystem: "AdaAcc",
    sourceSyncedAt: syncedAt,
    headers: headerRows.map((r) => ({
      branchCode: String(r.FTBchCode || "").trim(),
      docNo: r.FTShdDocNo || null,
      docDate: toBangkokDateString(r.FDShdDocDate),
      docTime: r.FTShdDocTime || null,
      customerCode: r.FTCstCode || null,
      paidStatus: r.FTShdStaPaid || null,
      grandAmount: Number(r.FCShdGrand ?? 0),
      netAmount: Number(r.FCShdAftDisChg ?? 0),
      vatAmount: Number(r.FCShdVat ?? 0),
      cashierCode: r.FTUsrCode || null,
      terminalCode: r.FTPosCode || null,
      referenceDocNo: r.FTShdPosCN || null,
      sourceTable: "TPSTSalHD",
      // Extra source fields preserved in raw_payload for future reporting.
      FTShdDocType: r.FTShdDocType || null,
      FTShdStaRefund: r.FTShdStaRefund || null,
      FTShdStaDoc: r.FTShdStaDoc || null,
      // Bill-level gross + discount. On AdaAcc the discount lives at the header
      // (FCShdDis); the line discount FCSdtDis is 0. So gross = FCShdTotal,
      // net = FCShdGrand, discount = FCShdTotal − FCShdGrand. Kept so the backend
      // can reproduce the report's gross/discount columns, not just net, and so
      // the CRM mirror's gross_total is no longer 0. (branch 005, 2026-07-23)
      FCShdTotal: r.FCShdTotal == null ? null : Number(r.FCShdTotal),
      FCShdDis: r.FCShdDis == null ? null : Number(r.FCShdDis),
    })),
    lines: lineRows.map((r) => ({
      branchCode: String(r.FTBchCode || "").trim(),
      docNo: r.FTShdDocNo || null,
      lineNo: Number(r.FNSdtSeqNo ?? 0),
      productCode: r.FTPdtCode || null,
      barcode: r.FTSdtBarCode || null,
      qty: Number(r.FCSdtQty ?? 0),
      unitPrice: Number(r.FCSdtSetPrice ?? 0),
      discountAmount: Number(r.FCSdtDis ?? 0),
      lineAmount: Number(r.FCSdtNet ?? 0),
      stockFactor: Number(r.FCSdtStkFac ?? 1),
      // AdaSoft may store Void rows with signed FCSdtQty but a positive
      // FCSdtQtyAll magnitude. Preserve the transaction sign from FCSdtQty.
      qtyBase: signedSalesQtyBase(r.FCSdtQty, r.FCSdtStkFac, r.FCSdtQtyAll),
      lotNo: r.FTSdtLotNo || null,
      expiryDate: toBangkokDateString(r.FDSdtExpired),
      sourceTable: "TPSTSalDT",
      // Extra source fields preserved in raw_payload for future reporting.
      productNameThai: r.FTPdtName || null,
      unitCode: r.FTPunCode || null,
      unitName: r.FTSdtUnitName || null,
      FCSdtDisAvg: Number(r.FCSdtDisAvg ?? 0),
      FCSdtFootAvg: Number(r.FCSdtFootAvg ?? 0),
      FCSdtRePackAvg: Number(r.FCSdtRePackAvg ?? 0),
    })),
  };
}

// Splits an already-built { headers, lines, ...rest } payload into chunks of
// whole documents (a header + all of its lines always stay in the same
// chunk — never split a document across two requests). Any other fields on
// the payload (e.g. sales_detail's sourceSystem/sourceSyncedAt) are copied
// onto every chunk unchanged. Generic across every doc-shaped sync endpoint
// (sales_detail, transfers, ...) — they all share the same architecture:
// the backend wraps a whole request in one DB transaction with per-record
// queries, so a branch with a big day can build a payload that takes longer
// to commit than the client's request timeout. Chunking by document count
// bounds each request/transaction to a predictable size.
function payloadDocumentKey(record) {
  return JSON.stringify([
    String(record.branchCode ?? "").trim(),
    String(record.docType ?? "").trim(),
    String(record.docNo ?? "").trim(),
  ]);
}

export function chunkPayloadByDoc(payload, maxDocsPerChunk, { requireMatchingHeaders = false } = {}) {
  const { headers, lines, ...rest } = payload;
  const documentKey = requireMatchingHeaders
    ? payloadDocumentKey
    : (record) => record.docNo;

  if (requireMatchingHeaders) {
    const headerKeys = new Set(headers.map(payloadDocumentKey));
    for (const line of lines) {
      if (!headerKeys.has(payloadDocumentKey(line))) {
        throw new Error(
          "Document chunking refused a line without a matching composite header identity.",
        );
      }
    }
  }

  if (headers.length === 0) {
    return lines.length > 0 ? [{ ...rest, headers: [], lines }] : [];
  }

  const linesByDoc = new Map();
  for (const line of lines) {
    const key = documentKey(line);
    if (!linesByDoc.has(key)) linesByDoc.set(key, []);
    linesByDoc.get(key).push(line);
  }

  const chunks = [];
  for (let i = 0; i < headers.length; i += maxDocsPerChunk) {
    const headerChunk = headers.slice(i, i + maxDocsPerChunk);
    const lineChunk = headerChunk.flatMap((h) => linesByDoc.get(documentKey(h)) ?? []);
    chunks.push({ ...rest, headers: headerChunk, lines: lineChunk });
  }
  return chunks;
}

export function toSalesRecords(rows, branchCode, periodDays) {
  return rows.map((r) => ({
    productCode:   r.FTPdtCode,
    branchCode,
    periodDays,
    soldQtyBase:   Number(r.sold_qty_base ?? 0),
    avgDailyUsage: Number(r.sold_qty_base ?? 0) / periodDays,
  }));
}

// ── Product prices: master defaults + per-branch overrides ──────────────────────
// AdaAcc stores an *unset* price slot as 0 (master, float NOT NULL) or NULL
// (per-branch override). Neither is a real price: the backend resolves
// override -> master per slot, so an absent slot must simply be omitted from the
// payload, never shipped as 0 or null. isRealPrice() centralises that rule.
function isRealPrice(value) {
  if (value == null) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

// Combine the SQL-side 'YYYY-MM-DD' date (CONVERT style 23 — language independent,
// so the stored year is preserved verbatim) with FTTimeUpd ('HH:MM:SS' varchar)
// into an ISO-8601 local timestamp. Returns null when no date is present.
// Safety net for the known ADA Buddhist-Era bug: if a stray BE year slips through
// (year > 2400) subtract 543 so it is not shipped as a year-2569 timestamp.
function combineSourceTimestamp(dateStr, timeStr) {
  if (!dateStr) return null;
  let [year, month, day] = String(dateStr).split("-");
  if (Number(year) > 2400) year = String(Number(year) - 543);
  const time = (timeStr && String(timeStr).trim()) || "00:00:00";
  return `${year}-${month}-${day}T${time}`;
}

// unitSize -> source fields for unit code/factor/name. S is the base unit (factor 1).
const PRICE_UNIT_SIZES = [
  { unitSize: "S", codeField: "FTPdtSUnit", factorField: "FCPdtSFactor", nameField: "unitNameS", defaultFactor: 1 },
  { unitSize: "M", codeField: "FTPdtMUnit", factorField: "FCPdtMFactor", nameField: "unitNameM", defaultFactor: null },
  { unitSize: "L", codeField: "FTPdtLUnit", factorField: "FCPdtLFactor", nameField: "unitNameL", defaultFactor: null },
];

// retail = price levels 1..3, wholesale = 1..5. These are price *tiers/levels*, not
// quantity-based tiers. Phase 1 carries no promotion/qty-tier data, but the
// {channel, unitSize, priceLevel} record shape leaves room to add those later
// (e.g. a future "channel": "promo" with a qty range + effective dates).
const PRICE_CHANNELS = [
  { channel: "retail",    colTag: "Ret", levels: [1, 2, 3] },
  { channel: "wholesale", colTag: "Whs", levels: [1, 2, 3, 4, 5] },
];

/**
 * Master price rows (getProductPriceDefaultRows) -> one normalized record per
 * non-zero price slot. priceScope is always "master"; sourceUpdatedAt is null
 * (the master table's update stamp is not tracked at slot granularity).
 */
export function toProductPriceDefaultRecords(rows) {
  const syncedAt = new Date().toISOString();
  const records = [];

  for (const r of rows) {
    const allowBranchOverride = String(r.FTPdtStaSetPri ?? "") === "1";

    for (const u of PRICE_UNIT_SIZES) {
      const unitName = r[u.nameField] || r[u.codeField] || null;
      const factor = r[u.factorField] != null ? Number(r[u.factorField]) : u.defaultFactor;

      for (const ch of PRICE_CHANNELS) {
        for (const priceLevel of ch.levels) {
          const raw = r[`FCPdt${ch.colTag}Pri${u.unitSize}${priceLevel}`];
          if (!isRealPrice(raw)) continue;

          records.push({
            productCode: r.FTPdtCode,
            channel: ch.channel,
            unitSize: u.unitSize,
            priceLevel,
            priceAmount: Number(raw),
            unitName,
            factor,
            priceScope: "master",
            allowBranchOverride,
            sourceUpdatedAt: null,
            syncedAt,
          });
        }
      }
    }
  }

  return records;
}

/**
 * Branch override rows (getBranchPriceOverrideRows) -> one normalized record per
 * non-null override slot. NULL slots are dropped (no override -> backend falls
 * back to master). priceScope is always "override". branchCode is normalized to
 * three digits and validated against the known branch whitelist.
 */
export function toProductBranchPriceOverrideRecords(rows) {
  const syncedAt = new Date().toISOString();
  const records = [];

  for (const r of rows) {
    const branchCode = String(r.FTBchCode || "").padStart(3, "0");
    if (!BRANCH_STOCK_SYNC_BRANCHES.has(branchCode)) continue; // never route an unknown branch
    const sourceUpdatedAt = combineSourceTimestamp(r.FDDateUpdStr, r.FTTimeUpd);

    for (const u of PRICE_UNIT_SIZES) {
      for (const ch of PRICE_CHANNELS) {
        for (const priceLevel of ch.levels) {
          const raw = r[`FCPbp${ch.colTag}Pri${u.unitSize}${priceLevel}`];
          if (!isRealPrice(raw)) continue; // null / 0 = no override -> omit

          records.push({
            branchCode,
            productCode: r.FTPdtCode,
            channel: ch.channel,
            unitSize: u.unitSize,
            priceLevel,
            priceAmount: Number(raw),
            priceScope: "override",
            sourceUpdatedAt,
            syncedAt,
          });
        }
      }
    }
  }

  return records;
}
