function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function pickFirst(record, keys) {
  for (const key of keys) {
    if (hasValue(record?.[key])) {
      return record[key];
    }
  }
  return null;
}

function pickNumber(record, keys) {
  const value = pickFirst(record, keys);
  if (!hasValue(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value) {
  return hasValue(value) ? String(value) : null;
}

function headerKey(docNo, docType) {
  return `${docNo || ""}::${docType || ""}`;
}

export function normalizeTransferHeader(record) {
  return {
    docNo: normalizeString(pickFirst(record, ["FTPthDocNo", "docNo"])),
    docType: normalizeString(pickFirst(record, ["FTPthDocType", "docType"])),
    branchCode: normalizeString(pickFirst(record, ["FTBchCode", "branchCode", "branchFrm"])),
    branchCodeTo: normalizeString(pickFirst(record, ["FTBchCodeTo", "branchCodeTo", "branchTo"])),
    warehouseCode: normalizeString(pickFirst(record, ["FTWahCode", "warehouseCode", "whFrm"])),
    warehouseCodeTo: normalizeString(pickFirst(record, ["FTWahCodeTo", "warehouseCodeTo", "whTo"])),
    docDate: normalizeString(pickFirst(record, ["FDPthDocDate", "docDate", "tnfDate"])),
    tnfDate: normalizeString(pickFirst(record, ["tnfDate", "FDPthDocDate", "docDate"])),
    transferType: normalizeString(pickFirst(record, ["FTPthType", "type"])),
    total: pickNumber(record, ["FCPthTotal", "total"]),
    vat: pickNumber(record, ["FCPthVat", "vat"]),
    grand: pickNumber(record, ["FCPthGrand", "grand"]),
    deptCode: normalizeString(pickFirst(record, ["FTDptCode", "deptCode"])),
    createdBy: normalizeString(pickFirst(record, ["FTPthUsrName", "createdBy", "usrCode"])),
    approvedBy: normalizeString(pickFirst(record, ["FTPthApvCode", "approvedBy", "usrCode"])),
    raw: record,
  };
}

export function normalizeTransferLine(record, relatedHeader = null) {
  const docNo = normalizeString(pickFirst(record, ["FTPthDocNo", "docNo"]));
  const directDocType = normalizeString(pickFirst(record, ["FTPthDocType", "docType"]));
  const headerDocType = relatedHeader?.docType || null;

  return {
    docNo,
    docType: directDocType || headerDocType,
    branchCode: normalizeString(
      pickFirst(record, ["FTBchCode", "branchCode", "branchFrm"]) ?? relatedHeader?.branchCode,
    ),
    branchCodeTo: normalizeString(
      pickFirst(record, ["FTBchCodeTo", "branchCodeTo", "branchTo"]) ?? relatedHeader?.branchCodeTo,
    ),
    lineNo: pickNumber(record, ["FNPtdSeqNo", "lineNo", "seqNo"]),
    productCode: normalizeString(pickFirst(record, ["FTPtdPdtCode", "productCode"])),
    unitCode: normalizeString(pickFirst(record, ["FTPunCode", "unitCode"])),
    unitName: normalizeString(pickFirst(record, ["FTPunName", "unitName"])),
    qty: pickNumber(record, ["FCPtdQtyAll", "qty"]),
    qtyBase: pickNumber(record, ["FCPtdQtyBase", "qtyBase"]),
    stockFactor: pickNumber(record, ["FCPtdStkFac", "FCPtdFactor", "factor"]),
    cost: pickNumber(record, ["FCPtdCost", "cost"]),
    costIn: pickNumber(record, ["FCPtdCostIn", "costIn"]),
    net: pickNumber(record, ["FCPtdNet", "net"]),
    vat: pickNumber(record, ["FCPtdVat", "vat"]),
    warehouseCode: normalizeString(
      pickFirst(record, ["FTWahCode", "warehouseCode", "whFrm"]) ?? relatedHeader?.warehouseCode,
    ),
    warehouseCodeTo: normalizeString(
      pickFirst(record, ["FTWahCodeTo", "warehouseCodeTo", "whTo"]) ?? relatedHeader?.warehouseCodeTo,
    ),
    docDate: normalizeString(
      pickFirst(record, ["FDPthDocDate", "docDate", "tnfDate"]) ?? relatedHeader?.docDate ?? relatedHeader?.tnfDate,
    ),
    raw: record,
  };
}

export function normalizeTransferPayload(payload) {
  const headerRecords = payload?.headers || payload?.transferHeaders || [];
  const lineRecords = payload?.lines || payload?.transferLines || [];

  const headers = headerRecords.map((record) => normalizeTransferHeader(record));
  const headersByKey = new Map(
    headers.map((header) => [headerKey(header.docNo, header.docType), header]),
  );
  const headersByDocNo = new Map(
    headers.filter((header) => header.docNo).map((header) => [header.docNo, header]),
  );

  const lines = lineRecords.map((record) => {
    const docNo = normalizeString(pickFirst(record, ["FTPthDocNo", "docNo"]));
    const docType = normalizeString(pickFirst(record, ["FTPthDocType", "docType"]));
    const relatedHeader =
      headersByKey.get(headerKey(docNo, docType)) ||
      (docNo ? headersByDocNo.get(docNo) : null) ||
      null;
    return normalizeTransferLine(record, relatedHeader);
  });

  return { headers, lines };
}

export function validateTransferPayload(payload) {
  const { headers, lines } = normalizeTransferPayload(payload);

  if (!headers.length) {
    return { error: "Payload must include a headers array.", normalized: { headers, lines } };
  }

  if (!lines.length) {
    return { error: "Payload must include a lines array.", normalized: { headers, lines } };
  }

  for (const header of headers) {
    if (!header.docNo || !header.docType || !header.branchCode) {
      return {
        error: "Each transfer header requires docNo, docType, and branchFrm/branchCode (or AdaAcc aliases).",
        normalized: { headers, lines },
      };
    }
  }

  for (const line of lines) {
    if (!line.docNo || !line.docType || !line.branchCode || !Number.isFinite(line.lineNo) || !line.productCode) {
      return {
        error: "Each transfer line requires docNo, docType, branchFrm/branchCode, seqNo/lineNo, and productCode (or AdaAcc aliases).",
        normalized: { headers, lines },
      };
    }
  }

  return { error: null, normalized: { headers, lines } };
}
