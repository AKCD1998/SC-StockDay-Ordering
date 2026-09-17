import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getRegulatedDrugClassification,
  summarizeRegulatedDrugBatch,
  summarizeRegulatedDrugLines,
} from "./lib/regulatedDrugs.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const STOCK_REQUEST_BRANCH_FILTER_CODES = ["000", "001", "003", "004", "005"];
const CODE39_PATTERNS = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};
const BRANCH_LABELS = {
  "000": "สาขา 000 (HQ)",
  "001": "สาขา 001",
  "003": "สาขา 003",
  "004": "สาขา 004",
  "005": "สาขา 005",
};

export function Code39Barcode({ value, height = 56, narrow = 2, wide = 5, gap = 2 }) {
  const normalizedValue = String(value || "").trim().toUpperCase();
  if (!normalizedValue) return null;

  const encoded = `*${normalizedValue}*`;
  const patterns = [];
  for (const char of encoded) {
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) return null;
    patterns.push(pattern);
  }

  const rects = [];
  let cursor = 0;
  patterns.forEach((pattern, patternIndex) => {
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === "w" ? wide : narrow;
      const isBar = i % 2 === 0;
      if (isBar) {
        rects.push(
          <rect
            key={`${patternIndex}-${i}-${cursor}`}
            x={cursor}
            y="0"
            width={width}
            height={height}
            rx="0.4"
          />,
        );
      }
      cursor += width;
    }
    if (patternIndex < patterns.length - 1) {
      cursor += gap;
    }
  });

  return (
    <div className="srq-barcode-block" aria-label={`บาร์โค้ด ${normalizedValue}`}>
      <svg
        className="srq-barcode-svg"
        viewBox={`0 0 ${cursor} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-hidden="true"
      >
        <g fill="currentColor">
          {rects}
        </g>
      </svg>
      <div className="srq-barcode-text mono">{normalizedValue}</div>
    </div>
  );
}

function RegulatedDrugBadges({ reportGroups, summary = false, count = 0 }) {
  if (!reportGroups?.length) return null;
  return (
    <span className={`srq-regulated-badges${summary ? " summary" : ""}`}>
      {summary ? <span className="srq-regulated-summary-label">มียาควบคุม{count ? ` ${count} รายการ` : ""}</span> : null}
      {reportGroups.map((group) => (
        <span key={group} className={`srq-regulated-badge ${group.toLowerCase()}`}>
          {group === "KY10" ? "ขย.10" : "ขย.11"}
        </span>
      ))}
    </span>
  );
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function formatDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dedupeBranchCodes(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeSearchNeedle(value) {
  return String(value || "").trim().toLowerCase();
}

function includesNeedle(haystackParts = [], needle = "") {
  if (!needle) return true;
  const haystack = haystackParts
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map((part) => String(part).toLowerCase())
    .join(" ");
  return haystack.includes(needle);
}

function getBatchSourceBranchCodes(record, batchDetail = null) {
  if (Array.isArray(record?.sourceBranchCodes) && record.sourceBranchCodes.length > 0) {
    return dedupeBranchCodes(record.sourceBranchCodes);
  }
  if (record?.sourceBranchCode) {
    return [record.sourceBranchCode];
  }
  if (Array.isArray(batchDetail?.requests) && batchDetail.requests.length > 0) {
    return dedupeBranchCodes(batchDetail.requests.map((request) => request.sourceBranchCode));
  }
  return [];
}

function matchesIncomingSearch(record, detail, needle) {
  if (!needle) return true;
  const baseParts = [
    record?.requestPublicId,
    record?.requestingBranchCode,
    BRANCH_LABELS[record?.requestingBranchCode] ?? "",
    record?.status,
  ];
  const lineParts = (detail?.lines || []).flatMap((line) => ([
    line?.productCode,
    line?.productNameThai,
    line?.productNameEng,
    line?.barcode,
  ]));
  return includesNeedle([...baseParts, ...lineParts], needle);
}

function matchesMyRequestSearch(record, batchDetail, needle) {
  if (!needle) return true;
  const requestSourceCodes = getBatchSourceBranchCodes(record, batchDetail);
  const requestSourceLabels = requestSourceCodes.map((code) => BRANCH_LABELS[code] ?? `สาขา ${code}`);
  const baseParts = [
    record?.batchPublicId,
    ...(record?.sourceBranchCodes || []),
    ...requestSourceLabels,
    record?.status,
    batchDetail?.note,
  ];
  const requestParts = (batchDetail?.requests || []).flatMap((request) => ([
    request?.publicId,
    request?.sourceBranchCode,
    BRANCH_LABELS[request?.sourceBranchCode] ?? "",
    ...(request?.lines || []).flatMap((line) => ([
      line?.productCode,
      line?.productNameThai,
      line?.productNameEng,
      line?.barcode,
    ])),
  ]));
  return includesNeedle([...baseParts, ...requestParts], needle);
}

function BranchMultiSelectFilter({ label, selectedCodes, onChange, active = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selectedCount = selectedCodes.length;
  const allSelected = selectedCount === STOCK_REQUEST_BRANCH_FILTER_CODES.length;

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function toggleBranch(branchCode) {
    if (selectedCodes.includes(branchCode)) {
      onChange(selectedCodes.filter((code) => code !== branchCode));
      return;
    }
    onChange([...selectedCodes, branchCode].sort());
  }

  const summaryText = allSelected
    ? `${label}: ทุกสาขา`
    : selectedCount === 0
      ? `${label}: ไม่เลือก`
      : `${label}: ${selectedCount} สาขา`;

  return (
    <div className="srq-branch-multifilter" ref={containerRef}>
      <button
        type="button"
        className={`ghost-button srq-branch-multifilter-button${active ? " srq-filter-active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{summaryText}</span>
        <span className="srq-branch-multifilter-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="srq-branch-multifilter-menu" role="menu" aria-label={label}>
          <div className="srq-branch-multifilter-actions">
            <button
              type="button"
              className="ghost-button srq-branch-multifilter-action"
              onClick={() => onChange([...STOCK_REQUEST_BRANCH_FILTER_CODES])}
            >
              เลือกทั้งหมด
            </button>
            <button
              type="button"
              className="ghost-button srq-branch-multifilter-action"
              onClick={() => onChange([])}
            >
              ไม่เลือก
            </button>
          </div>
          <div className="srq-branch-multifilter-list">
            {STOCK_REQUEST_BRANCH_FILTER_CODES.map((branchCode) => (
              <label key={branchCode} className="srq-branch-multifilter-option">
                <input
                  type="checkbox"
                  checked={selectedCodes.includes(branchCode)}
                  onChange={() => toggleBranch(branchCode)}
                />
                <span>{BRANCH_LABELS[branchCode] ?? `สาขา ${branchCode}`}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

function SrqStatusChip({ status }) {
  const STATUS_MAP = {
    SUBMITTED:           { label: "รอตอบกลับ",        cls: "waiting" },
    PARTIALLY_RESPONDED: { label: "ตอบกลับบางส่วน",   cls: "waiting" },
    RESPONDED:           { label: "ตอบกลับแล้ว",       cls: "responded" },
    ACKNOWLEDGED:        { label: "ยืนยันรับแล้ว",     cls: "responded" },
    COMPLETED:           { label: "เสร็จสิ้น",          cls: "done" },
    CANCELLED:           { label: "ยกเลิก",             cls: "cancelled" },
    PENDING:             { label: "รอดำเนินการ",        cls: "waiting" },
    APPROVED_FULL:       { label: "อนุมัติทั้งหมด",    cls: "responded" },
    CUSTOM:              { label: "กำหนดจำนวน",        cls: "waiting" },
    REJECTED:            { label: "ปฏิเสธ",             cls: "cancelled" },
    FULLY_APPROVED:      { label: "อนุมัติทั้งหมด",    cls: "responded" },
    PARTIALLY_APPROVED:  { label: "อนุมัติบางส่วน",    cls: "waiting" },
    FULLY_REJECTED:      { label: "ไม่อนุมัติทั้งหมด", cls: "cancelled" },
  };
  const info = STATUS_MAP[status] || { label: status || "-", cls: "done" };
  return <span className={`srq-status-chip ${info.cls}`}>{info.label}</span>;
}

function createIncomingLineState(line) {
  const response = line?.response || null;
  const responseStatus = response?.responseStatus || response?.status || "";
  if (responseStatus === "APPROVED_FULL") {
    return {
      choice: "APPROVED_FULL",
      approvedQty: String(line.requestedQty),
      note: response?.note || "",
      reasonCode: response?.reasonCode || "",
    };
  }
  if (responseStatus === "REJECTED") {
    return {
      choice: "REJECTED",
      approvedQty: "0",
      note: response?.note || "",
      reasonCode: response?.reasonCode || "",
    };
  }
  if (responseStatus === "CUSTOM") {
    return {
      choice: "CUSTOM",
      approvedQty: String(response?.approvedQty ?? ""),
      note: response?.note || "",
      reasonCode: response?.reasonCode || "",
    };
  }
  return {
    choice: "",
    approvedQty: String(line?.requestedQty ?? ""),
    note: "",
    reasonCode: "",
  };
}

function createApprovedFullLineState(line) {
  return {
    choice: "APPROVED_FULL",
    approvedQty: String(line?.requestedQty ?? ""),
    note: "",
    reasonCode: "",
  };
}

function RequestDocumentsModal({ requestPublicId, documents, onClose }) {
  return (
    <div className="dialog-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="เอกสารคำขอสินค้า">
      <div className="dialog-card packing-document-modal srq-documents-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <h3>เอกสารคำขอสินค้า</h3>
            <p>เลขที่คำขอ {requestPublicId}</p>
          </div>
          <button type="button" className="ghost-button dialog-close-button" onClick={onClose}>ปิด</button>
        </div>
        <div className="packing-document-print">
          {(documents || []).map((doc) => (
            <section key={`${doc.documentType}-${doc.documentId || doc.version}`} className="srq-doc-sheet">
              <div className="packing-doc-header">
                <div><strong>{doc.documentType === "RESPONSE_SUMMARY" ? "เอกสารสรุปการดำเนินการคำขอ" : "ใบปะหน้าส่งของ"}</strong></div>
                <div>เลขที่คำขอ: <span className="mono">{doc.document?.requestPublicId || requestPublicId}</span></div>
                <div>จาก: <strong>{BRANCH_LABELS[doc.document?.sourceBranchCode] ?? `สาขา ${doc.document?.sourceBranchCode}`}</strong></div>
                <div>ถึง: <strong>{BRANCH_LABELS[doc.document?.requestingBranchCode] ?? `สาขา ${doc.document?.requestingBranchCode}`}</strong></div>
                <div>วันที่ออกเอกสาร: {formatDateTime(doc.document?.generatedAt || new Date().toISOString())}</div>
                {doc.document?.responseResult ? (
                  <div>ผลการดำเนินการ: <strong>{(function mapResult(value) {
                    if (value === "FULLY_APPROVED") return "อนุมัติทั้งหมด";
                    if (value === "PARTIALLY_APPROVED") return "อนุมัติบางส่วน";
                    if (value === "FULLY_REJECTED") return "ไม่อนุมัติทั้งหมด";
                    return value || "-";
                  })(doc.document.responseResult)}</strong></div>
                ) : null}
                {doc.document?.responseNote ? <div>หมายเหตุรวม: {doc.document.responseNote}</div> : null}
              </div>

              <table className="packing-doc-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th>จำนวนที่ขอ</th>
                    <th>จำนวนที่อนุมัติ</th>
                    <th>หน่วย</th>
                    {doc.documentType === "RESPONSE_SUMMARY" ? <th>ผลการดำเนินการ</th> : null}
                    {doc.documentType === "RESPONSE_SUMMARY" ? <th>เหตุผล</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(doc.document?.lines || []).map((line, idx) => (
                    <tr key={line.lineId || `${line.productCode}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td className="mono">{line.productCode}</td>
                      <td>{line.productNameThai || line.productNameEng || "-"}</td>
                      <td>{formatNumber(line.requestedQty, 0)}</td>
                      <td>{formatNumber(line.approvedQty, 0)}</td>
                      <td>{line.unit}</td>
                      {doc.documentType === "RESPONSE_SUMMARY" ? <td>{(function mapLineStatus(value) {
                        if (value === "APPROVED_FULL") return "อนุมัติทั้งหมด";
                        if (value === "CUSTOM") return "กำหนดจำนวน";
                        if (value === "REJECTED") return "ปฏิเสธ";
                        return value || "-";
                      })(line.responseStatus)}</td> : null}
                      {doc.documentType === "RESPONSE_SUMMARY" ? <td>{line.note || line.reasonCode || "-"}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={onClose}>ปิด</button>
          <button type="button" className="primary-button" onClick={() => window.print()}>พิมพ์</button>
        </div>
      </div>
    </div>
  );
}

function PackingPreviewModal({ detail, onClose }) {
  const requestLines = detail?.lines || [];
  const sourceBranchLabel = BRANCH_LABELS[detail?.sourceBranchCode] ?? `สาขา ${detail?.sourceBranchCode || "-"}`;
  const requestingBranchLabel = BRANCH_LABELS[detail?.requestingBranchCode] ?? `สาขา ${detail?.requestingBranchCode || "-"}`;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="dialog-overlay srq-preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="พรีวิวเอกสารสำหรับจัดแพ๊ค">
      <div className="dialog-card packing-document-modal srq-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="packing-document-print">
          <section className="srq-doc-sheet srq-preview-sheet">
            {requestLines.length > 0 ? (
              <table className="packing-doc-table srq-preview-table">
                <thead>
                  <tr className="srq-preview-header-row">
                    <th colSpan="6">
                      <div className="srq-preview-header-grid">
                        <div className="packing-doc-header srq-preview-meta-block">
                          <div><strong>เอกสารตรวจนับสินค้าก่อนจัดแพ๊ค</strong></div>
                          <div>เลขที่คำขอ: <span className="mono">{detail?.publicId || "-"}</span></div>
                          <div>จากสาขาต้นทาง: <strong>{requestingBranchLabel}</strong></div>
                          <div>ตรวจที่สาขาผู้ถูกขอ: <strong>{sourceBranchLabel}</strong></div>
                          <div>พิมพ์เมื่อ: {formatDateTime(new Date().toISOString())}</div>
                          <div>รายการสินค้าที่สาขาต้นทางขอมา: <strong>{formatNumber(requestLines.length, 0)}</strong> รายการ</div>
                        </div>
                        <div className="srq-preview-barcode-panel">
                          <div className="srq-preview-barcode-label">บาร์โค้ดเลขที่คำขอ</div>
                          <Code39Barcode value={detail?.publicId || ""} />
                        </div>
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th>#</th>
                    <th>รหัสสินค้าของบริษัท</th>
                    <th>ชื่อยาภาษาไทย</th>
                    <th>สต๊อกสาขาผู้ถูกขอ</th>
                    <th>จำนวนที่สาขาต้นทางขอ</th>
                    <th>ทดว่าจะให้เท่าไหร่</th>
                  </tr>
                </thead>
                <tbody>
                  {requestLines.map((line, index) => (
                    <tr key={line.lineId || `${line.productCode}-${index}`}>
                      <td>{index + 1}</td>
                      <td className="mono">{line.productCode || "-"}</td>
                      <td>{line.productNameThai || line.productNameEng || "-"}</td>
                      <td>{line.currentQty != null ? `${formatNumber(line.currentQty, 0)} ${line.unit || ""}`.trim() : "-"}</td>
                      <td>{`${formatNumber(line.requestedQty, 0)} ${line.unit || ""}`.trim()}</td>
                      <td className="srq-preview-note-cell">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="notice compact">คำขอนี้ยังไม่มีรายการสินค้า</p>
            )}
          </section>
        </div>
        <div className="dialog-actions">
          <button type="button" className="ghost-button srq-preview-close-btn" onClick={onClose}>ปิด</button>
          <button type="button" className="primary-button srq-preview-print-btn" onClick={() => window.print()} disabled={requestLines.length === 0}>
            พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function IncomingRequestActionModal({ detail, csrfToken, onClose, onCompleted }) {
  const requestLines = detail?.lines || [];
  const [lineStates, setLineStates] = useState(() => {
    const initial = {};
    for (const line of requestLines) {
      initial[line.lineId] = createIncomingLineState(line);
    }
    return initial;
  });
  const [decisionNote, setDecisionNote] = useState(detail?.responseNote || "");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [requestVersion, setRequestVersion] = useState(detail?.version || 1);
  const [workflowDone, setWorkflowDone] = useState(detail?.status === "RESPONDED" || detail?.status === "ACKNOWLEDGED");
  const [responseResult, setResponseResult] = useState(detail?.responseResult || null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [exceptionsMode, setExceptionsMode] = useState(() => requestLines.some((line) => {
    const state = createIncomingLineState(line);
    return state.choice && state.choice !== "APPROVED_FULL";
  }));
  const totalRequestedLines = requestLines.length;

  function patchLine(lineId, patch) {
    setLineStates((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] || {}),
        ...patch,
      },
    }));
  }

  function openRejectDialog(line) {
    const current = lineStates[line.lineId] || createIncomingLineState(line);
    setRejectTarget(line);
    setRejectReason(current.note || "");
  }

  function confirmRejectDialog() {
    if (!rejectTarget || !rejectReason.trim()) {
      setSubmitError("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
      return;
    }
    patchLine(rejectTarget.lineId, {
      choice: "REJECTED",
      approvedQty: "0",
      note: rejectReason.trim(),
      reasonCode: "MANUAL_REJECT",
    });
    setRejectTarget(null);
    setRejectReason("");
    setSubmitError("");
  }

  function hydrateApproveAllDraft() {
    setLineStates((current) => {
      const next = { ...current };
      for (const line of requestLines) {
        const state = next[line.lineId] || createIncomingLineState(line);
        if (!state.choice) {
          next[line.lineId] = createApprovedFullLineState(line);
        }
      }
      return next;
    });
  }

  function handleOpenExceptionsMode() {
    hydrateApproveAllDraft();
    setExceptionsMode(true);
    setRejectTarget(null);
    setSubmitError("");
  }

  function handleCloseExceptionsMode() {
    setExceptionsMode(false);
    setRejectTarget(null);
    setSubmitError("");
  }

  const hasAnyCustom = Object.values(lineStates).some((state) => state.choice === "CUSTOM");

  const allDecided = requestLines.length > 0 && requestLines.every((line) => {
    const state = lineStates[line.lineId];
    if (!state?.choice) return false;
    if (state.choice === "REJECTED") return Boolean(state.note?.trim());
    if (state.choice === "CUSTOM") return Number.isFinite(Number(state.approvedQty)) && Number(state.approvedQty) >= 0;
    return true;
  }) && (!hasAnyCustom || Boolean(decisionNote.trim()));

  function buildApproveAllPayload() {
    return {
      version: requestVersion,
      decisionNote: decisionNote.trim() || null,
      responses: requestLines.map((line) => ({
        lineId: line.lineId,
        responseStatus: "APPROVED_FULL",
      })),
    };
  }

  function buildSubmitPayload() {
    return {
      version: requestVersion,
      decisionNote: decisionNote.trim() || null,
      responses: requestLines.map((line) => {
        const state = lineStates[line.lineId] || {};
        if (state.choice === "APPROVED_FULL") {
          return {
            lineId: line.lineId,
            responseStatus: "APPROVED_FULL",
          };
        }
        if (state.choice === "REJECTED") {
          return {
            lineId: line.lineId,
            responseStatus: "REJECTED",
            approvedQty: 0,
            reasonCode: state.reasonCode || "MANUAL_REJECT",
            note: state.note?.trim() || null,
          };
        }
        return {
          lineId: line.lineId,
          responseStatus: "CUSTOM",
          approvedQty: Number(state.approvedQty),
          reasonCode: Number(state.approvedQty) === 0 ? (state.reasonCode || "MANUAL_REJECT") : (state.reasonCode || "MANUAL_OVERRIDE"),
          note: state.note?.trim() || null,
        };
      }),
    };
  }

  async function handleGenerateDocuments() {
    setGeneratingDoc(true);
    setSubmitError("");
    try {
      const res = await apiFetch(
        `/api/stock-requests/incoming/${encodeURIComponent(detail.publicId)}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
          body: JSON.stringify({ version: requestVersion, autoGenerate: true }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDocuments(data.documents || []);
      setDocumentsOpen(true);
    } catch (err) {
      setSubmitError(err.message || "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setGeneratingDoc(false);
    }
  }

  async function submitResponseAndGenerate(payload) {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await apiFetch(
        `/api/stock-requests/incoming/${encodeURIComponent(detail.publicId)}/submit-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWorkflowDone(true);
      setRequestVersion(data.version || requestVersion);
      setResponseResult(data.responseResult || null);
      onCompleted();
      await handleGenerateDocuments();
    } catch (err) {
      setSubmitError(err.message || "ส่งคำตอบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitAndGenerate() {
    if (!allDecided) {
      setSubmitError("กรุณาดำเนินการทุกรายการก่อนยืนยัน");
      return;
    }

    await submitResponseAndGenerate(buildSubmitPayload());
  }

  async function handleApproveAllAndGenerate() {
    if (requestLines.length === 0) {
      setSubmitError("คำขอนี้ยังไม่มีรายการสินค้า");
      return;
    }

    await submitResponseAndGenerate(buildApproveAllPayload());
  }

  return (
    <>
      <div className="dialog-overlay" onClick={() => !submitting && !generatingDoc && onClose()}>
        <div className="dialog-card srq-action-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="dialog-header">
            <div>
              <h3>ดำเนินการคำขอสินค้า</h3>
              <p>
                เลขที่ <span className="mono">{detail.publicId}</span> จาก {BRANCH_LABELS[detail.requestingBranchCode] ?? `สาขา ${detail.requestingBranchCode}`}
              </p>
            </div>
            <button type="button" className="ghost-button dialog-close-button" onClick={onClose} disabled={submitting || generatingDoc}>ปิด</button>
          </div>

          {!exceptionsMode && !workflowDone ? (
            <section className="srq-action-quick-panel">
              <div className="srq-action-quick-head">
                <strong>โหมดด่วน</strong>
                <SrqStatusChip status="APPROVED_FULL" />
              </div>
              <p>
                ระบบจะอนุมัติครบตามจำนวนที่ขอทุกบรรทัด และสร้างเอกสารปะหน้าให้ทันที
                หากมีบางรายการให้ไม่ครบหรือไม่อนุมัติ ค่อยกด <strong>มีข้อยกเว้น</strong>
              </p>
              <div className="srq-action-quick-stats">
                <div className="srq-action-quick-stat">
                  <strong>{formatNumber(totalRequestedLines, 0)}</strong>
                  <span>รายการในคำขอ</span>
                </div>
                <div className="srq-action-quick-stat">
                  <strong>{BRANCH_LABELS[detail.requestingBranchCode] ?? `สาขา ${detail.requestingBranchCode}`}</strong>
                  <span>สาขาผู้ขอ</span>
                </div>
                <div className="srq-action-quick-stat">
                  <strong>{BRANCH_LABELS[detail.sourceBranchCode] ?? `สาขา ${detail.sourceBranchCode}`}</strong>
                  <span>สาขาผู้ดำเนินการ</span>
                </div>
              </div>
            </section>
          ) : (
            <div className="srq-action-grid">
              <div className="srq-action-grid-head srq-action-product">รายการสินค้า</div>
              <div className="srq-action-grid-head">จำนวนที่ขอ</div>
              <div className="srq-action-grid-head">หน่วย</div>
              <div className="srq-action-grid-head">การดำเนินการ</div>

              {requestLines.map((line) => {
                const state = lineStates[line.lineId] || createIncomingLineState(line);
                const customSelected = state.choice === "CUSTOM";
                return (
                  <Fragment key={line.lineId}>
                    <div className="srq-action-cell srq-action-product">
                      <strong>{line.productCode}</strong>
                      <span>{line.productNameThai || line.productNameEng || "-"}</span>
                    </div>
                    <div className="srq-action-cell srq-action-requested">{formatNumber(line.requestedQty, 0)}</div>
                    <div className="srq-action-cell srq-action-unit">{line.unit}</div>
                    <div className="srq-action-cell srq-action-controls">
                      <button
                        type="button"
                        className={`srq-traffic-btn approve${state.choice === "APPROVED_FULL" ? " active" : ""}`}
                        onClick={() => patchLine(line.lineId, createApprovedFullLineState(line))}
                        disabled={workflowDone || submitting || generatingDoc}
                        aria-label="อนุมัติทั้งหมด"
                      >
                        อนุมัติ
                      </button>
                      <button
                        type="button"
                        className={`srq-traffic-btn reject${state.choice === "REJECTED" ? " active" : ""}`}
                        onClick={() => openRejectDialog(line)}
                        disabled={workflowDone || submitting || generatingDoc}
                        aria-label="ไม่อนุมัติ"
                      >
                        ปฏิเสธ
                      </button>
                      <button
                        type="button"
                        className={`srq-traffic-btn custom${customSelected ? " active" : ""}`}
                        onClick={() => patchLine(line.lineId, {
                          choice: "CUSTOM",
                          approvedQty: customSelected ? state.approvedQty : String(line.requestedQty),
                          reasonCode: state.reasonCode || "",
                        })}
                        disabled={workflowDone || submitting || generatingDoc}
                        aria-label="กำหนดจำนวน"
                      >
                        ระบุ
                      </button>
                      {customSelected ? (
                        <>
                          <input
                            type="number"
                            className={`srq-custom-qty-input${line.snapshotQty != null && Number(state.approvedQty) > line.snapshotQty ? " srq-custom-qty-over" : ""}`}
                            min="0"
                            max={line.snapshotQty ?? undefined}
                            step="1"
                            value={state.approvedQty}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const parsed = Number(raw);
                              if (line.snapshotQty != null && Number.isFinite(parsed) && parsed > line.snapshotQty) {
                                patchLine(line.lineId, { approvedQty: String(line.snapshotQty) });
                              } else {
                                patchLine(line.lineId, { approvedQty: raw });
                              }
                            }}
                            disabled={workflowDone || submitting || generatingDoc}
                          />
                          {line.snapshotQty != null ? (
                            <span className="srq-snapshot-hint">สต็อก {formatNumber(line.snapshotQty, 0)} {line.unit}</span>
                          ) : null}
                        </>
                      ) : null}
                      {state.choice ? <SrqStatusChip status={state.choice === "CUSTOM" && Number(state.approvedQty) === 0 ? "REJECTED" : state.choice} /> : null}
                      {state.choice === "CUSTOM" ? <span className="meta-line">ให้ {formatNumber(state.approvedQty, 0)} {line.unit}</span> : null}
                      {state.choice === "REJECTED" && state.note ? <span className="meta-line">เหตุผล: {state.note}</span> : null}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          )}

          <label className={`srq-decision-note${exceptionsMode && hasAnyCustom ? " srq-decision-note-required" : ""}`}>
            หมายเหตุรวมการดำเนินการ{exceptionsMode && hasAnyCustom ? <span className="srq-required-mark"> * จำเป็นเมื่อมีการระบุจำนวน</span> : null}
            <textarea
              rows="3"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={
                exceptionsMode && hasAnyCustom
                  ? "ระบุเหตุผลที่ให้จำนวนไม่ตรงกับที่ขอ..."
                  : "เช่น อนุมัติครบตามคำขอ / ตรวจแล้วพร้อมจัดของ"
              }
              disabled={submitting || generatingDoc}
            />
          </label>

          {responseResult ? <p className="meta-line">ผลล่าสุด: <strong>{responseResult}</strong></p> : null}
          {submitError ? <p className="notice error compact">{submitError}</p> : null}

          <div className="dialog-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={submitting || generatingDoc}>ยกเลิก</button>
            {workflowDone ? (
              <button type="button" className="srq-submit-btn" onClick={handleGenerateDocuments} disabled={generatingDoc}>
                {generatingDoc ? "กำลังสร้างเอกสาร..." : "สร้างเอกสารอีกครั้ง"}
              </button>
            ) : exceptionsMode ? (
              <>
                <button type="button" className="srq-secondary-btn" onClick={handleCloseExceptionsMode} disabled={submitting || generatingDoc}>
                  กลับไปโหมดอนุมัติทั้งหมด
                </button>
                <button type="button" className="srq-submit-btn" onClick={handleSubmitAndGenerate} disabled={!allDecided || submitting || generatingDoc}>
                  {submitting || generatingDoc ? "กำลังดำเนินการ..." : "ยืนยันข้อยกเว้นและรับเอกสารปะหน้า"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="srq-secondary-btn" onClick={handleOpenExceptionsMode} disabled={submitting || generatingDoc}>
                  มีข้อยกเว้น
                </button>
                <button type="button" className="srq-submit-btn" onClick={handleApproveAllAndGenerate} disabled={submitting || generatingDoc}>
                  {submitting || generatingDoc ? "กำลังดำเนินการ..." : "อนุมัติทั้งหมดและรับเอกสารปะหน้า"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {rejectTarget ? (
        <div className="dialog-overlay" onClick={() => setRejectTarget(null)}>
          <div className="dialog-card srq-reject-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="dialog-header">
              <div>
                <h3>ระบุเหตุผลที่ไม่อนุมัติ</h3>
                <p>{rejectTarget.productCode} · {rejectTarget.productNameThai || rejectTarget.productNameEng || "-"}</p>
              </div>
            </div>
            <textarea
              className="srq-reason-input"
              rows="4"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="เช่น ของหมด / สินค้าถูกจอง / ต้องเก็บไว้ใช้ในสาขา"
            />
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setRejectTarget(null)}>ยกเลิก</button>
              <button type="button" className="ghost-button srq-clear-draft-btn" onClick={confirmRejectDialog}>ยืนยันไม่อนุมัติ</button>
            </div>
          </div>
        </div>
      ) : null}

      {documentsOpen ? (
        <RequestDocumentsModal
          requestPublicId={detail.publicId}
          documents={documents}
          onClose={() => setDocumentsOpen(false)}
        />
      ) : null}
    </>
  );
}

function IncomingRequestDetail({ publicId, csrfToken, onResponseSubmitted, isAdmin = false }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionOpen, setActionOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [batchSiblings, setBatchSiblings] = useState([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/stock-requests/incoming/${encodeURIComponent(publicId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (!active) return;
        const req = data.request;
        setDetail(req);
        if (req?.batchPublicId) {
          apiFetch(`/api/stock-requests/${encodeURIComponent(req.batchPublicId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((bd) => {
              if (!active || !bd?.batch?.requests) return;
              setBatchSiblings(bd.batch.requests.filter((r) => r.publicId !== req.publicId));
            })
            .catch(() => {});
        }
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [publicId, refreshKey]);

  if (loading) return <div className="srq-detail-body"><p className="notice compact">กำลังโหลดรายละเอียด...</p></div>;
  if (error)   return <div className="srq-detail-body"><p className="notice error compact">{error}</p></div>;
  if (!detail) return null;

  return (
    <>
      <div className="srq-detail-body">
        <div className="srq-detail-summary">
          <div>
            <strong>จาก {BRANCH_LABELS[detail.requestingBranchCode] ?? `สาขา ${detail.requestingBranchCode}`}</strong>
            <p className="meta-line">คำขอ {detail.lines?.length || 0} รายการ · เวอร์ชัน {detail.version}</p>
          </div>
          <div className="srq-detail-summary-status">
            <button
              type="button"
              className="ghost-button srq-preview-btn"
              onClick={() => setPreviewOpen(true)}
              title="พรีวิวเอกสารสำหรับจัดแพ๊ค"
            >
              <span aria-hidden="true">👁</span>
              <span>พรีวิวเอกสารสำหรับจัดแพ๊ค</span>
            </button>
            <button type="button" className="srq-submit-btn srq-submit-btn-compact" onClick={() => setActionOpen(true)}>
              {detail.status === "SUBMITTED" ? "ดำเนินการ" : "ดูผลการดำเนินการ"}
            </button>
          </div>
        </div>

        {batchSiblings.length > 0 ? (
          <div className="srq-batch-context-panel">
            <div className="srq-batch-context-header">
              🔗 คำขอร่วมในชุดเดียวกัน ({batchSiblings.length} รายการ)
            </div>
            {batchSiblings.map((sib) => (
              <div key={sib.publicId} className={`srq-batch-context-row${sib.requestMode === "ADMIN_ALERT" ? " alert" : ""}`}>
                <span className="srq-batch-context-branch">
                  {sib.requestMode === "ADMIN_ALERT" ? "📋" : "📦"} {BRANCH_LABELS[sib.sourceBranchCode] ?? `สาขา ${sib.sourceBranchCode}`}
                </span>
                <div className="srq-batch-context-lines">
                  {(sib.lines || []).map((ln) => (
                    <span key={ln.lineId} className="srq-batch-context-line">
                      {ln.productNameThai || ln.productCode} · <strong>{formatNumber(ln.requestedQty, 0)} {ln.unit}</strong>
                    </span>
                  ))}
                </div>
                <SrqStatusChip status={sib.responseResult || sib.status} />
              </div>
            ))}
          </div>
        ) : null}

        {(detail.lines || []).map((line) => {
          const classification = getRegulatedDrugClassification(line.productCode);
          return (
          <div key={line.lineId} className={`srq-detail-line-row${classification.isRegulated ? " srq-regulated-row" : ""}`}>
            <div className="srq-line-info">
              <strong>
                {line.productNameThai || line.productNameEng || line.productCode}
                <RegulatedDrugBadges reportGroups={classification.reportGroups} />
              </strong>
              <span className="meta-line">{line.productCode}</span>
              {isAdmin && line.snapshotQty != null ? (
                <span className="meta-line srq-snapshot-audit">
                  ตอนขอมีสต็อก {formatNumber(line.snapshotQty, 0)} {line.unit}
                  {line.snapshotSyncedAt ? ` (${formatDateTime(line.snapshotSyncedAt)})` : ""}
                </span>
              ) : null}
            </div>
            <div className="srq-line-preview-metrics">
              <span>ขอ {formatNumber(line.requestedQty, 0)} {line.unit}</span>
              {line.response ? (
                <>
                  <SrqStatusChip status={line.response.status} />
                  <span>ให้ {formatNumber(line.response.approvedQty, 0)} {line.unit}</span>
                </>
              ) : (
                <span className="meta-line">ยังไม่ตอบกลับ</span>
              )}
            </div>
          </div>
          );
        })}

        {detail.responseNote ? <p className="meta-line">หมายเหตุล่าสุด: {detail.responseNote}</p> : null}
      </div>

      {actionOpen ? (
        <IncomingRequestActionModal
          detail={detail}
          csrfToken={csrfToken}
          onClose={() => setActionOpen(false)}
          onCompleted={() => {
            setRefreshKey((current) => current + 1);
            onResponseSubmitted();
          }}
        />
      ) : null}

      {previewOpen ? (
        <PackingPreviewModal
          detail={detail}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

function IncomingRequestsTab({ branchCode, isAdmin = false, csrfToken, onIncomingNotificationsChanged }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [filterBranch, setFilterBranch] = useState("");
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [filterSingleDate, setFilterSingleDate] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedRequestingBranches, setSelectedRequestingBranches] = useState(() => [...STOCK_REQUEST_BRANCH_FILTER_CODES]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchDetailCache, setSearchDetailCache] = useState({});
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const canLoad = isAdmin || Boolean(branchCode);

  useEffect(() => {
    setSelectedRequestingBranches([...STOCK_REQUEST_BRANCH_FILTER_CODES]);
  }, [branchCode, isAdmin]);

  async function ensureSearchDetails(candidateRecords) {
    const missingIds = candidateRecords
      .map((record) => record.requestPublicId)
      .filter((publicId) => publicId && !searchDetailCache[publicId]);

    if (missingIds.length === 0) return;

    const results = await Promise.all(
      missingIds.map(async (publicId) => {
        try {
          const res = await apiFetch(`/api/stock-requests/incoming/${encodeURIComponent(publicId)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return [publicId, null];
          return [publicId, data.request || null];
        } catch {
          return [publicId, null];
        }
      }),
    );

    setSearchDetailCache((current) => {
      const next = { ...current };
      results.forEach(([publicId, detail]) => {
        next[publicId] = detail;
      });
      return next;
    });
  }

  useEffect(() => {
    if (!canLoad) return undefined;
    let active = true;
    setLoading(true);
    const params = isAdmin && filterBranch ? `?branch=${encodeURIComponent(filterBranch)}` : "";
    apiFetch(`/api/stock-requests/incoming${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => { if (active) setRecords(data.records || []); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchCode, isAdmin, filterBranch, refreshKey, canLoad]);

  const baseFilteredRecords = records.filter((record) => {
    if (selectedRequestingBranches.length > 0 && !selectedRequestingBranches.includes(record.requestingBranchCode)) {
      return false;
    }
    if (selectedRequestingBranches.length === 0) {
      return false;
    }
    const createdDate = formatDateInputValue(record.createdAt);
    if (dateFilterMode === "single") {
      return !filterSingleDate || createdDate === filterSingleDate;
    }
    if (dateFilterMode === "range") {
      if (filterDateFrom && createdDate < filterDateFrom) return false;
      if (filterDateTo && createdDate > filterDateTo) return false;
    }
    return true;
  });

  const normalizedAppliedSearch = normalizeSearchNeedle(appliedSearch);
  const filteredRecords = baseFilteredRecords.filter((record) =>
    matchesIncomingSearch(record, searchDetailCache[record.requestPublicId], normalizedAppliedSearch),
  );
  const searchCandidateKey = baseFilteredRecords.map((record) => record.requestPublicId).join("|");

  const adminAlertCount = filteredRecords.filter((r) => r.isAdminAlert && r.status === "SUBMITTED" && !r.responseResult).length;
  const hasActiveDateFilter =
    dateFilterMode === "single"
      ? dateFilterMode !== "all"
      : dateFilterMode === "range"
        ? dateFilterMode !== "all"
        : false;
  const hasActiveRequestingBranchFilter = selectedRequestingBranches.length !== STOCK_REQUEST_BRANCH_FILTER_CODES.length;
  const hasActiveSearch = Boolean(normalizedAppliedSearch);

  // Pagination is purely a display window over filteredRecords — search and
  // filters above already run against every loaded record, not just the
  // current page, so a match on page 999 is still found. Reset to page 1
  // whenever the underlying filtered set changes, so users don't land on a
  // now-empty page (e.g. filtering down to 3 records while on page 5).
  useEffect(() => {
    setCurrentPage(1);
  }, [filterBranch, selectedRequestingBranches, dateFilterMode, filterSingleDate, filterDateFrom, filterDateTo, normalizedAppliedSearch, pageSize, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRecords = filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  const regulatedCandidateKey = pagedRecords.map((record) => record.requestPublicId).join("|");
  useEffect(() => {
    if (!regulatedCandidateKey) return;
    ensureSearchDetails(pagedRecords);
    // Detail data is required to mark folded accordions; loading is bounded by page size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regulatedCandidateKey]);

  useEffect(() => {
    let active = true;
    if (!normalizedAppliedSearch) return undefined;
    setSearching(true);
    ensureSearchDetails(baseFilteredRecords)
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [normalizedAppliedSearch, searchCandidateKey]);

  async function handleSearchSubmit(event) {
    event?.preventDefault?.();
    const nextSearch = normalizeSearchNeedle(searchInput);
    setSearching(true);
    try {
      if (nextSearch) {
        await ensureSearchDetails(baseFilteredRecords);
      }
      setAppliedSearch(searchInput);
      setExpandedId(null);
    } finally {
      setSearching(false);
    }
  }

  if (!canLoad) return <p className="notice warning compact">ต้องเลือกสาขาที่ใช้งานก่อนจึงจะดูคำขอที่เข้ามาได้</p>;
  if (loading)  return <p className="notice compact">กำลังโหลด...</p>;

  return (
    <div className="srq-tab-body srq-filter-shell">
      {searching ? (
        <div className="srq-search-loading-overlay" aria-live="polite" aria-label="กำลังค้นหารายการคำขอ">
          <div className="srq-search-loading-card">
            <strong>กำลังค้นหา...</strong>
            <span>กำลังสืบค้น transaction และรายการสินค้า</span>
          </div>
        </div>
      ) : null}
      <div className="srq-tab-toolbar">
        <span className="srq-total-label">{filteredRecords.length} รายการ{adminAlertCount > 0 ? <span className="srq-alert-count"> · 🔴 {adminAlertCount} แจ้งจัดซื้อรอดำเนินการ</span> : null}</span>
        <select
          className="srq-branch-filter srq-page-size-select"
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setExpandedId(null); }}
          aria-label="จำนวนรายการต่อหน้า"
        >
          <option value={10}>10 รายการ/หน้า</option>
          <option value={50}>50 รายการ/หน้า</option>
          <option value={100}>100 รายการ/หน้า</option>
        </select>
        {isAdmin ? (
          <select
            className="srq-branch-filter"
            value={filterBranch}
            onChange={(e) => { setFilterBranch(e.target.value); setExpandedId(null); }}
            aria-label="กรองตามสาขา"
          >
            <option value="">ทุกสาขา</option>
            {["000","001","003","004","005"].map((code) => (
              <option key={code} value={code}>{BRANCH_LABELS[code] ?? `สาขา ${code}`}</option>
            ))}
          </select>
        ) : null}
        <BranchMultiSelectFilter
          label="สาขาที่ขอมา"
          selectedCodes={selectedRequestingBranches}
          onChange={(codes) => {
            setSelectedRequestingBranches(codes);
            setExpandedId(null);
          }}
          active={hasActiveRequestingBranchFilter}
        />
        <form className="srq-search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className={`srq-search-input${hasActiveSearch ? " srq-filter-active" : ""}`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหา transaction, IC, 630, ชื่อยา, barcode"
            aria-label="ค้นหา transaction หรือสินค้าในคำขอที่รับเข้า"
          />
          <button type="submit" className="ghost-button srq-search-submit" disabled={searching}>
            {searching ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
        <div className="srq-date-filter-group">
          <select
            className={`srq-branch-filter srq-date-filter-mode${hasActiveDateFilter ? " srq-filter-active" : ""}`}
            value={dateFilterMode}
            onChange={(e) => {
              const nextMode = e.target.value;
              setDateFilterMode(nextMode);
              setExpandedId(null);
              if (nextMode === "all") {
                setFilterSingleDate("");
                setFilterDateFrom("");
                setFilterDateTo("");
              }
            }}
            aria-label="รูปแบบการกรองวัน"
          >
            <option value="all">ทุกวัน</option>
            <option value="single">เฉพาะวัน</option>
            <option value="range">ช่วงวันที่</option>
          </select>
          {dateFilterMode === "single" ? (
            <input
              type="date"
              className={`srq-branch-filter srq-date-filter-input${hasActiveDateFilter ? " srq-filter-active" : ""}`}
              value={filterSingleDate}
              onChange={(e) => { setFilterSingleDate(e.target.value); setExpandedId(null); }}
              aria-label="เลือกวันเดียว"
            />
          ) : null}
          {dateFilterMode === "range" ? (
            <>
              <input
                type="date"
                className={`srq-branch-filter srq-date-filter-input${hasActiveDateFilter ? " srq-filter-active" : ""}`}
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setExpandedId(null); }}
                aria-label="วันที่เริ่มต้น"
              />
              <span className="srq-date-filter-separator">ถึง</span>
              <input
                type="date"
                className={`srq-branch-filter srq-date-filter-input${hasActiveDateFilter ? " srq-filter-active" : ""}`}
                value={filterDateTo}
                min={filterDateFrom || undefined}
                onChange={(e) => { setFilterDateTo(e.target.value); setExpandedId(null); }}
                aria-label="วันที่สิ้นสุด"
              />
            </>
          ) : null}
          {hasActiveDateFilter ? (
            <button
              type="button"
              className="ghost-button srq-date-filter-clear"
              onClick={() => {
                setDateFilterMode("all");
                setFilterSingleDate("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setExpandedId(null);
              }}
            >
              ล้างวัน
            </button>
          ) : null}
        </div>
        {hasActiveSearch ? (
          <button
            type="button"
            className="ghost-button srq-date-filter-clear"
            onClick={() => {
              setSearchInput("");
              setAppliedSearch("");
              setExpandedId(null);
            }}
          >
            ล้างค้นหา
          </button>
        ) : null}
        <button type="button" className="ghost-button" onClick={() => setRefreshKey((k) => k + 1)}>รีเฟรช</button>
      </div>
      {filteredRecords.length === 0 ? (
        <p className="notice compact">
          {records.length === 0
            ? "ยังไม่มีคำขอสินค้าเข้ามา"
            : hasActiveSearch
              ? "ไม่พบ transaction หรือสินค้าที่ตรงกับคำค้น"
              : (hasActiveDateFilter || hasActiveRequestingBranchFilter)
                ? "ไม่พบคำขอสินค้าที่ตรงกับตัวกรองที่เลือก"
                : "ยังไม่มีคำขอสินค้าเข้ามา"}
        </p>
      ) : pagedRecords.map((req) => {
        const regulatedSummary = summarizeRegulatedDrugLines(searchDetailCache[req.requestPublicId]?.lines);
        const isOpen = expandedId === req.requestPublicId;
        const isPureAlert = req.isAdminAlert && !req.isMixedMode && req.status === "SUBMITTED" && !req.responseResult;
        const isMixedIncoming = req.isAdminAlert && req.isMixedMode && req.status === "SUBMITTED" && !req.responseResult;
        const inCardExtra = isPureAlert ? " srq-batch-card-admin-alert" : isMixedIncoming ? " srq-batch-card-mixed" : "";
        const inHeaderExtra = isPureAlert ? " srq-batch-card-header-admin-alert" : isMixedIncoming ? " srq-batch-card-header-mixed" : "";
        const alertPillLabel = req.isMixedMode ? "ขอสาขาอื่น + สั่งเพิ่ม" : "สินค้าหมด / แจ้ง admin";
        return (
        <article
          key={req.requestPublicId}
          className={`srq-batch-card${inCardExtra}${regulatedSummary.count && !isOpen ? " srq-regulated-card" : ""}`}
        >
          <button
            type="button"
            className={`srq-batch-card-header${inHeaderExtra}`}
            onClick={() => setExpandedId((prev) => (prev === req.requestPublicId ? null : req.requestPublicId))}
          >
            <span className="srq-batch-id">{req.requestPublicId}</span>
            <span className="srq-batch-date">{formatDateTime(req.createdAt)}</span>
            <span className="srq-from-label">จาก: <strong>{BRANCH_LABELS[req.requestingBranchCode] ?? `สาขา ${req.requestingBranchCode}`}</strong></span>
            {req.isAdminAlert ? <span className="srq-admin-alert-pill">{alertPillLabel}</span> : null}
            <RegulatedDrugBadges reportGroups={regulatedSummary.reportGroups} count={regulatedSummary.count} summary />
            <SrqStatusChip status={req.responseResult || req.status} />
            <span className="srq-chevron">{isOpen ? "▾" : "▸"}</span>
          </button>
          {isOpen ? (
            <IncomingRequestDetail
              publicId={req.requestPublicId}
              csrfToken={csrfToken}
              isAdmin={isAdmin}
              onResponseSubmitted={() => {
                setRefreshKey((k) => k + 1);
                onIncomingNotificationsChanged?.();
              }}
            />
          ) : null}
        </article>
        );
      })}
      {filteredRecords.length > 0 ? (
        <div className="srq-pagination">
          <button
            type="button"
            className="ghost-button srq-pagination-nav"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            ก่อนหน้า
          </button>
          <span className="srq-pagination-label">หน้า {safePage} จาก {totalPages}</span>
          <button
            type="button"
            className="ghost-button srq-pagination-nav"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            ถัดไป
          </button>
        </div>
      ) : null}
    </div>
  );
}

const RESPONSE_STATUS_LABELS = {
  APPROVED_FULL: "อนุมัติทั้งหมด",
  CUSTOM: "กำหนดจำนวน",
  REJECTED: "ปฏิเสธ",
};

function MyRequestsTab({ branchCode, csrfToken, requestDraftItems, setRequestDraftItems, requestBatchNote, setRequestBatchNote, onSubmitDraft, onClearDraft, draftHydrating = false, draftSaveStatus = null }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [loadingDetail, setLoadingDetail] = useState("");
  const [acknowledging, setAcknowledging] = useState("");
  const [ackError, setAckError] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [filterSingleDate, setFilterSingleDate] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedSourceBranches, setSelectedSourceBranches] = useState(() => [...STOCK_REQUEST_BRANCH_FILTER_CODES]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searching, setSearching] = useState(false);

  const draftItems = requestDraftItems || [];
  const draftCount = draftItems.length;
  const draftByBranch = useMemo(() => {
    const groups = new Map();
    for (const item of draftItems) {
      if (!groups.has(item.sourceBranchCode)) groups.set(item.sourceBranchCode, []);
      groups.get(item.sourceBranchCode).push(item);
    }
    return groups;
  }, [draftItems]);

  function patchDraftItem(lineKey, patch) {
    setRequestDraftItems((current) =>
      current
        .map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                ...patch,
                requestedQty: patch.requestedQty == null ? item.requestedQty : normalizeRequestedQty(patch.requestedQty),
                lineNote: patch.lineNote == null ? item.lineNote : String(patch.lineNote || "").trim(),
              }
            : item,
        )
        .filter((item) => normalizeRequestedQty(item.requestedQty) > 0),
    );
  }

  function removeDraftItem(lineKey) {
    setRequestDraftItems((current) => current.filter((item) => item.lineKey !== lineKey));
  }

  function handleSubmit() {
    const invalid = draftItems.find((item) => !Number.isFinite(Number(item.requestedQty)) || Number(item.requestedQty) <= 0);
    if (invalid) { setSubmitError(`จำนวนที่ขอของสินค้า ${invalid.productCode} ต้องมากกว่า 0`); return; }
    setConfirmOpen(true);
  }

  function handleConfirmedSubmit() {
    setSubmitError("");
    onSubmitDraft({
      onStart: () => setSubmittingRequest(true),
      onSuccess: (result) => {
        setConfirmOpen(false);
        setSubmitSuccess(`ส่งคำขอสินค้าแล้ว เลขที่ ${result.batchPublicId || "-"}`);
        setRefreshKey((k) => k + 1);
        setTimeout(() => setSubmitSuccess(""), 4000);
      },
      onError: (err) => setSubmitError(err.message || "ส่งคำขอสินค้าไม่สำเร็จ"),
      onFinally: () => setSubmittingRequest(false),
    });
  }

  useEffect(() => {
    if (!branchCode) return undefined;
    let active = true;
    setLoading(true);
    apiFetch("/api/stock-requests/mine")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => { if (active) setRecords(data.records || []); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchCode, refreshKey]);

  useEffect(() => {
    setSelectedSourceBranches([...STOCK_REQUEST_BRANCH_FILTER_CODES]);
  }, [branchCode]);

  async function ensureBatchDetails(candidateRecords) {
    const missingIds = candidateRecords
      .map((record) => record.batchPublicId)
      .filter((publicId) => publicId && !detailCache[publicId]);

    if (missingIds.length === 0) return;

    const results = await Promise.all(
      missingIds.map(async (publicId) => {
        try {
          const res = await apiFetch(`/api/stock-requests/${encodeURIComponent(publicId)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return [publicId, null];
          return [publicId, data.batch || null];
        } catch {
          return [publicId, null];
        }
      }),
    );

    setDetailCache((current) => {
      const next = { ...current };
      results.forEach(([publicId, detail]) => {
        next[publicId] = detail;
      });
      return next;
    });
  }

  async function handleExpand(batchPublicId) {
    if (expandedId === batchPublicId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(batchPublicId);
    if (detailCache[batchPublicId]) return;
    setLoadingDetail(batchPublicId);
    try {
      const res = await apiFetch(`/api/stock-requests/${encodeURIComponent(batchPublicId)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setDetailCache((c) => ({ ...c, [batchPublicId]: d.batch }));
    } catch { /* show nothing extra on error */ }
    finally { setLoadingDetail(""); }
  }

  async function handleAcknowledge(childPublicId, batchPublicId) {
    setAcknowledging(childPublicId);
    setAckError("");
    try {
      const res = await apiFetch(`/api/stock-requests/${encodeURIComponent(childPublicId)}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setDetailCache((c) => { const copy = { ...c }; delete copy[batchPublicId]; return copy; });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setAckError(err.message);
    } finally {
      setAcknowledging("");
    }
  }

  const baseFilteredRecords = records.filter((record) => {
    const sourceBranchCodes = getBatchSourceBranchCodes(record, detailCache[record.batchPublicId]);
    if (selectedSourceBranches.length === 0) {
      return false;
    }
    if (sourceBranchCodes.length > 0 && !sourceBranchCodes.some((code) => selectedSourceBranches.includes(code))) {
      return false;
    }
    const createdDate = formatDateInputValue(record.createdAt);
    if (dateFilterMode === "single") {
      return !filterSingleDate || createdDate === filterSingleDate;
    }
    if (dateFilterMode === "range") {
      if (filterDateFrom && createdDate < filterDateFrom) return false;
      if (filterDateTo && createdDate > filterDateTo) return false;
    }
    return true;
  });

  const normalizedAppliedSearch = normalizeSearchNeedle(appliedSearch);
  const filteredRecords = baseFilteredRecords.filter((record) =>
    matchesMyRequestSearch(record, detailCache[record.batchPublicId], normalizedAppliedSearch),
  );
  const searchCandidateKey = baseFilteredRecords.map((record) => record.batchPublicId).join("|");

  useEffect(() => {
    if (!searchCandidateKey) return;
    ensureBatchDetails(baseFilteredRecords);
    // Batch details provide product codes for folded-card regulated-drug indicators.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCandidateKey]);

  const hasActiveDateFilter =
    dateFilterMode === "single"
      ? dateFilterMode !== "all"
      : dateFilterMode === "range"
        ? dateFilterMode !== "all"
        : false;
  const hasActiveSourceBranchFilter = selectedSourceBranches.length !== STOCK_REQUEST_BRANCH_FILTER_CODES.length;
  const hasActiveSearch = Boolean(normalizedAppliedSearch);

  useEffect(() => {
    let active = true;
    if (!normalizedAppliedSearch) return undefined;
    setSearching(true);
    ensureBatchDetails(baseFilteredRecords)
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [normalizedAppliedSearch, searchCandidateKey]);

  async function handleSearchSubmit(event) {
    event?.preventDefault?.();
    setSearching(true);
    try {
      const nextSearch = normalizeSearchNeedle(searchInput);
      if (nextSearch) {
        await ensureBatchDetails(baseFilteredRecords);
      }
      setAppliedSearch(searchInput);
      setExpandedId(null);
    } finally {
      setSearching(false);
    }
  }

  if (!branchCode) return <p className="notice warning compact">ต้องเลือกสาขาที่ใช้งานก่อนจึงจะดูคำขอสินค้าของฉันได้</p>;

  return (
    <div className="srq-tab-body srq-filter-shell">
      {searching ? (
        <div className="srq-search-loading-overlay" aria-live="polite" aria-label="กำลังค้นหารายการคำขอ">
          <div className="srq-search-loading-card">
            <strong>กำลังค้นหา...</strong>
            <span>กำลังสืบค้น transaction และรายการสินค้า</span>
          </div>
        </div>
      ) : null}

      {draftHydrating ? (
        <p className="meta-line" style={{ padding: "8px 0", opacity: 0.6 }}>กำลังโหลดร่างคำขอ...</p>
      ) : null}

      {draftSaveStatus === "saving" ? (
        <p className="meta-line" style={{ padding: "4px 0", opacity: 0.6, fontSize: "0.8em" }}>กำลังบันทึกร่าง...</p>
      ) : draftSaveStatus === "saved" ? (
        <p className="meta-line" style={{ padding: "4px 0", color: "#4caf50", fontSize: "0.8em" }}>บันทึกร่างแล้ว</p>
      ) : draftSaveStatus?.error ? (
        <p className="meta-line" style={{ padding: "4px 0", color: "#f44336", fontSize: "0.8em" }}>บันทึกไม่สำเร็จ: {draftSaveStatus.error}</p>
      ) : null}

      {!draftHydrating && draftCount > 0 ? (
        <div className="srq-draft-inline">
          <div className="srq-checkout-header">
            <div>
              <h3>สร้างคำขอสินค้า</h3>
              <p className="meta-line">สาขาผู้ขอ: {BRANCH_LABELS[branchCode] ?? `สาขา ${branchCode}`} · {draftCount} รายการ</p>
            </div>
            <button
              type="button"
              className="ghost-button srq-clear-draft-btn"
              onClick={() => setClearConfirmOpen(true)}
              disabled={submittingRequest}
            >
              ล้างรายการ
            </button>
          </div>
          <div className="srq-checkout-body">
            {[...draftByBranch.entries()].map(([sourceBranchCode, items]) => (
              <details key={sourceBranchCode} className="srq-branch-group" open>
                <summary>
                  ส่งคำขอสินค้าไปที่ : {BRANCH_LABELS[sourceBranchCode] ?? `สาขา ${sourceBranchCode}`}
                  <span className="meta-line" style={{ fontWeight: 400, marginLeft: 8 }}>({items.length} รายการ)</span>
                </summary>
                <div className="srq-branch-group-body">
                  {items.map((item) => (
                    <div key={item.lineKey} className="srq-checkout-line">
                      <div>
                        <strong>{item.productNameThai || item.productNameEng || item.productCode}</strong>
                        <span className="meta-line"> {item.productCode}</span>
                      </div>
                      <input type="number" min="1" step="1" value={item.requestedQty}
                        onChange={(e) => patchDraftItem(item.lineKey, { requestedQty: e.target.value })}
                        disabled={submittingRequest} aria-label="จำนวน" />
                      <span>{item.unit || ""}</span>
                      <input type="text" value={item.lineNote || ""}
                        onChange={(e) => patchDraftItem(item.lineKey, { lineNote: e.target.value })}
                        placeholder="หมายเหตุ" disabled={submittingRequest} aria-label="หมายเหตุรายบรรทัด" />
                      <button type="button" className="ghost-button srq-remove-line-btn"
                        onClick={() => removeDraftItem(item.lineKey)} disabled={submittingRequest}>ลบ</button>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            <div className="srq-checkout-note-section">
              <label>
                หมายเหตุรวมทั้งคำขอ
                <textarea rows="3" value={requestBatchNote}
                  onChange={(e) => setRequestBatchNote(e.target.value)}
                  placeholder="เช่น เร่งด่วน / ใช้ขายหน้าร้าน / ลูกค้ารับของวันนี้"
                  disabled={submittingRequest} />
              </label>
            </div>
            {submitError ? <p className="notice error compact">{submitError}</p> : null}
          </div>
          <div className="srq-checkout-actions">
            <button type="button" className="srq-confirm-btn" onClick={handleSubmit} disabled={submittingRequest || !draftCount}>
              ยืนยันส่งคำขอสินค้า
            </button>
          </div>
          {confirmOpen ? (
            <div className="dialog-overlay" onClick={() => !submittingRequest && setConfirmOpen(false)}>
              <div className="dialog-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="dialog-header"><h3>ยืนยันการส่งคำขอ?</h3></div>
                <p style={{ padding: "0 0 16px" }}>
                  รายการนี้จะถูกส่งไปยัง {draftByBranch.size} สาขา รวม {draftCount} รายการสินค้า
                </p>
                <div className="dialog-actions">
                  <button type="button" className="ghost-button" onClick={() => setConfirmOpen(false)} disabled={submittingRequest}>ยกเลิก</button>
                  <button type="button" className="srq-confirm-btn" onClick={handleConfirmedSubmit} disabled={submittingRequest}>
                    {submittingRequest ? "กำลังส่งคำขอ..." : "ยืนยัน"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {clearConfirmOpen ? (
            <div className="dialog-overlay" onClick={() => !submittingRequest && setClearConfirmOpen(false)}>
              <div className="dialog-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="dialog-header"><h3>ยืนยันจะล้างรายการ?</h3></div>
                <p style={{ padding: "0 0 16px" }}>
                  รายการร่างทั้งหมด {draftCount} รายการจะถูกล้างออกจากหน้านี้
                </p>
                <div className="dialog-actions">
                  <button type="button" className="ghost-button" onClick={() => setClearConfirmOpen(false)} disabled={submittingRequest}>ยกเลิก</button>
                  <button
                    type="button"
                    className="ghost-button srq-clear-draft-btn"
                    onClick={() => {
                      onClearDraft();
                      setClearConfirmOpen(false);
                    }}
                    disabled={submittingRequest}
                  >
                    ยืนยันล้างรายการ
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {submitSuccess ? <p className="notice success compact">{submitSuccess}</p> : null}

      <div className="srq-tab-toolbar">
        <span className="srq-total-label">{loading ? "กำลังโหลด..." : `${filteredRecords.length} รายการ`}</span>
        <BranchMultiSelectFilter
          label="สาขาที่ขอไป"
          selectedCodes={selectedSourceBranches}
          onChange={(codes) => {
            setSelectedSourceBranches(codes);
            setExpandedId(null);
          }}
          active={hasActiveSourceBranchFilter}
        />
        <form className="srq-search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className={`srq-search-input${hasActiveSearch ? " srq-filter-active" : ""}`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหา transaction, IC, 630, ชื่อยา, barcode"
            aria-label="ค้นหา transaction หรือสินค้าในคำขอของฉัน"
          />
          <button type="submit" className="ghost-button srq-search-submit" disabled={searching}>
            {searching ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </form>
        <div className="srq-date-filter-group">
          <select
            className={`srq-branch-filter srq-date-filter-mode${hasActiveDateFilter ? " srq-filter-active" : ""}`}
            value={dateFilterMode}
            onChange={(e) => {
              const nextMode = e.target.value;
              setDateFilterMode(nextMode);
              setExpandedId(null);
              if (nextMode === "all") {
                setFilterSingleDate("");
                setFilterDateFrom("");
                setFilterDateTo("");
              }
            }}
            aria-label="รูปแบบการกรองวัน"
          >
            <option value="all">ทุกวัน</option>
            <option value="single">เฉพาะวัน</option>
            <option value="range">ช่วงวันที่</option>
          </select>
          {dateFilterMode === "single" ? (
            <input
              type="date"
              className={`srq-branch-filter srq-date-filter-input${hasActiveDateFilter ? " srq-filter-active" : ""}`}
              value={filterSingleDate}
              onChange={(e) => { setFilterSingleDate(e.target.value); setExpandedId(null); }}
              aria-label="เลือกวันเดียว"
            />
          ) : null}
          {dateFilterMode === "range" ? (
            <>
              <input
                type="date"
                className={`srq-branch-filter srq-date-filter-input${hasActiveDateFilter ? " srq-filter-active" : ""}`}
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setExpandedId(null); }}
                aria-label="วันที่เริ่มต้น"
              />
              <span className="srq-date-filter-separator">ถึง</span>
              <input
                type="date"
                className={`srq-branch-filter srq-date-filter-input${hasActiveDateFilter ? " srq-filter-active" : ""}`}
                value={filterDateTo}
                min={filterDateFrom || undefined}
                onChange={(e) => { setFilterDateTo(e.target.value); setExpandedId(null); }}
                aria-label="วันที่สิ้นสุด"
              />
            </>
          ) : null}
          {hasActiveDateFilter ? (
            <button
              type="button"
              className="ghost-button srq-date-filter-clear"
              onClick={() => {
                setDateFilterMode("all");
                setFilterSingleDate("");
                setFilterDateFrom("");
                setFilterDateTo("");
                setExpandedId(null);
              }}
            >
              ล้างวัน
            </button>
          ) : null}
        </div>
        {hasActiveSearch ? (
          <button
            type="button"
            className="ghost-button srq-date-filter-clear"
            onClick={() => {
              setSearchInput("");
              setAppliedSearch("");
              setExpandedId(null);
            }}
          >
            ล้างค้นหา
          </button>
        ) : null}
        <button type="button" className="ghost-button" onClick={() => setRefreshKey((k) => k + 1)}>รีเฟรช</button>
      </div>
      {ackError ? <p className="notice error compact">{ackError}</p> : null}
      {filteredRecords.length === 0 && draftCount === 0 ? (
        <p className="notice compact">
          {records.length === 0
            ? "ยังไม่มีคำขอสินค้า"
            : hasActiveSearch
              ? "ไม่พบ transaction หรือสินค้าที่ตรงกับคำค้น"
              : (hasActiveDateFilter || hasActiveSourceBranchFilter)
                ? "ไม่พบคำขอสินค้าที่ตรงกับตัวกรองที่เลือก"
                : "ยังไม่มีคำขอสินค้า"}
        </p>
      ) : filteredRecords.map((batch) => {
        const isOpen = expandedId === batch.batchPublicId;
        const detail = detailCache[batch.batchPublicId] || null;
        const regulatedSummary = summarizeRegulatedDrugBatch(detail);
        const isPureAlert = batch.isAdminAlert && !batch.isMixedMode && batch.status === "SUBMITTED";
        const isMixed = batch.isAdminAlert && batch.isMixedMode && batch.status === "SUBMITTED";
        const cardExtra = isPureAlert ? " srq-batch-card-admin-alert" : isMixed ? " srq-batch-card-mixed" : "";
        const headerExtra = isPureAlert ? " srq-batch-card-header-admin-alert" : isMixed ? " srq-batch-card-header-mixed" : "";
        const pillLabel = batch.isMixedMode ? "📋 แจ้งจัดซื้อ + ขอจากสาขา" : "📋 แจ้งจัดซื้อ";
        return (
          <article key={batch.batchPublicId} className={`srq-batch-card${cardExtra}${regulatedSummary.count && !isOpen ? " srq-regulated-card" : ""}`}>
            <button
              type="button"
              className={`srq-batch-card-header${headerExtra}`}
              onClick={() => handleExpand(batch.batchPublicId)}
            >
              <span className="srq-batch-id">{batch.batchPublicId}</span>
              <span className="srq-batch-date">{formatDateTime(batch.createdAt)}</span>
              {batch.isAdminAlert ? <span className="srq-procurement-pill">{pillLabel}</span> : null}
              <RegulatedDrugBadges reportGroups={regulatedSummary.reportGroups} count={regulatedSummary.count} summary />
              <SrqStatusChip status={batch.status} />
              <span className="srq-chevron">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen ? (
              <div className="srq-batch-body">
                {loadingDetail === batch.batchPublicId ? (
                  <p className="notice compact">กำลังโหลดรายการ...</p>
                ) : detail ? (
                  <>
                    {detail.note ? <p className="srq-batch-note">📝 {detail.note}</p> : null}
                    {(detail.requests || []).map((req) => (
                      <div key={req.publicId} className={`srq-branch-section${req.requestMode === "ADMIN_ALERT" ? " srq-branch-section-alert" : ""}`}>
                        <div className="srq-branch-section-header">
                          <span className="srq-branch-label">📦 ขอจาก: <strong>{BRANCH_LABELS[req.sourceBranchCode] ?? `สาขา ${req.sourceBranchCode}`}</strong></span>
                          {req.status === "RESPONDED" ? (
                            <button
                              type="button"
                              className="ghost-button srq-ack-button"
                              onClick={() => handleAcknowledge(req.publicId, batch.batchPublicId)}
                              disabled={acknowledging === req.publicId}
                            >
                              {acknowledging === req.publicId ? "กำลังบันทึก..." : "รับทราบผลการดำเนินการ"}
                            </button>
                          ) : null}
                        </div>
                        <div className="srq-lines-table">
                          <div className="srq-lines-head">
                            <span>รหัส</span><span>ชื่อสินค้า</span><span>ขอ</span><span>หน่วย</span><span>ผล</span>
                          </div>
                          {(req.lines || []).map((line) => {
                            const classification = getRegulatedDrugClassification(line.productCode);
                            return (
                            <div key={line.lineId} className={`srq-line-row${classification.isRegulated ? " srq-regulated-row" : ""}`}>
                              <span className="srq-line-code">{line.productCode}</span>
                              <span className="srq-line-name">
                                {line.productNameThai || line.productNameEng || "-"}
                                <RegulatedDrugBadges reportGroups={classification.reportGroups} />
                              </span>
                              <span className="srq-line-qty">{formatNumber(line.requestedQty, 0)}</span>
                              <span className="srq-line-unit">{line.unit || "-"}</span>
                              <span className="srq-line-resp">
                                {line.response ? (
                                  <>
                                    <span className={`srq-resp-tag srq-resp-${(line.response.status || "").toLowerCase()}`}>
                                      {RESPONSE_STATUS_LABELS[line.response.status] || line.response.status}
                                    </span>
                                    {line.response.approvedQty > 0 ? <span className="srq-resp-qty"> {formatNumber(line.response.approvedQty, 0)} {line.unit || ""}</span> : null}
                                  </>
                                ) : <span className="srq-resp-pending">รอตอบ</span>}
                              </span>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="notice compact">ไม่สามารถโหลดรายละเอียดได้</p>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function StockRequestsPanel({
  branchCode,
  isAdmin = false,
  csrfToken,
  requestDraftItems,
  setRequestDraftItems,
  requestBatchNote,
  setRequestBatchNote,
  onSubmitDraft,
  onClearDraft,
  draftHydrating = false,
  draftSaveStatus = null,
  incomingNotifCount = 0,
  onIncomingNotificationsChanged,
}) {
  const [activeTab, setActiveTab] = useState(isAdmin ? "incoming" : "mine");

  return (
    <section className="panel srq-panel">
      <div className="panel-header stacked">
        <div>
          <h2>คำขอสินค้าระหว่างสาขา</h2>
          <p>ส่งคำขอสินค้าไปยังสาขาอื่น และตอบรับคำขอจากสาขาที่ขอมา</p>
        </div>
        <div className="srq-subtabs">
          <button type="button" className={`srq-subtab${activeTab === "mine" ? " active" : ""}`} onClick={() => setActiveTab("mine")}>
            📤 คำขอของฉัน
          </button>
          <button type="button" className={`srq-subtab${activeTab === "incoming" ? " active" : ""}`} onClick={() => setActiveTab("incoming")}>
            <span>📥 รับคำขอ</span>
            {incomingNotifCount > 0 ? (
              <span className="nav-notif-badge" aria-label={`${incomingNotifCount} คำขอใหม่`}>
                {incomingNotifCount > 99 ? "99+" : incomingNotifCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
      {activeTab === "mine" ? (
        <MyRequestsTab
          branchCode={branchCode}
          csrfToken={csrfToken}
          requestDraftItems={requestDraftItems}
          setRequestDraftItems={setRequestDraftItems}
          requestBatchNote={requestBatchNote}
          setRequestBatchNote={setRequestBatchNote}
          onSubmitDraft={onSubmitDraft}
          onClearDraft={onClearDraft}
          draftHydrating={draftHydrating}
          draftSaveStatus={draftSaveStatus}
        />
      ) : (
        <IncomingRequestsTab
          branchCode={branchCode}
          isAdmin={isAdmin}
          csrfToken={csrfToken}
          onIncomingNotificationsChanged={onIncomingNotificationsChanged}
        />
      )}
    </section>
  );
}

export { IncomingRequestsTab, MyRequestsTab, StockRequestsPanel };
export default StockRequestsPanel;
