import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MovementAndTransactionsPanel from "./MovementTransactionsPanel";
import FocusProductsPanel from "./FocusProductsPanel";
import BranchStockHistoryPanel from "./BranchStockHistoryPanel";
import StockRecommendationsPanel from "./StockRecommendationsPanel";
import { BranchStockPanel } from "./BranchStockPanel.jsx";
import ProductTaxonomyPanel from "./ProductTaxonomyPanel";
import TaxonomyReviewPanel from "./TaxonomyReviewPanel";
import SyncLogPanel from "./SyncLogPanel.jsx";
import StockCostAuditPanel from "./StockCostAuditPanel.jsx";
import ReviewQueuePanel from "./ReviewQueuePanel.jsx";
import IngredientDictionaryPanel from "./IngredientDictionaryPanel.jsx";
import PreorderPanel from "./preorders/PreorderPanel";
import LoginScreen from "./LoginScreen.jsx";
export { BranchStockPanel } from "./BranchStockPanel.jsx";
import {
  getRegulatedDrugClassification,
  summarizeRegulatedDrugBatch,
  summarizeRegulatedDrugLines,
} from "./lib/regulatedDrugs.js";
import dkshLogoUrl from "./assets/dksh.svg";
import hansaLogoUrl from "./assets/hansa-logo.png";
import tnpHealthcareLogoUrl from "./assets/tnp-healthcare-logo.svg";
import zuelligPharmaLogoUrl from "./assets/zuellig-pharma-logo.svg";
import biopharmChemicalsLogoUrl from "./assets/biopharm-chemicals-logo.gif";
import khaolaorLogoUrl from "./assets/khaolaor-logo.webp";
import sriprasitLogoUrl from "./assets/sriprasit-logo.png";
import blHuaLogoUrl from "./assets/bl-hua-logo.svg";
import bangkokDrugLogoUrl from "./assets/bangkok-drug-logo.svg";
import royalDLogoUrl from "./assets/royal-d-logo.png";
import poseHealthCareLogoUrl from "./assets/pose-health-care-logo.svg";
import pksMedicalCenterLogoUrl from "./assets/pks-medical-center-logo.svg";
import mohmeeLogoUrl from "./assets/mohmee-logo.svg";
import fasicareLogoUrl from "./assets/fasicare-logo.svg";
import birichLogoUrl from "./assets/birich-logo.svg";
import boonsongOsotLogoUrl from "./assets/boonsong-osot-logo.svg";
import macropharlabLogoUrl from "./assets/macropharlab-logo.svg";
import aceGlobalLogoUrl from "./assets/ace-global-logo.svg";
import scharoenPharmaLogoUrl from "./assets/scharoen-pharma-logo.svg";
import polipharmLogoUrl from "./assets/polipharm-logo.svg";
import tmanLogoUrl from "./assets/tman-logo.svg";
import berlinpharmLogoUrl from "./assets/berlinpharm-logo.svg";
import anbLabLogoUrl from "./assets/anb-lab-logo.svg";
import pacificHealthcareLogoUrl from "./assets/pacific-healthcare-logo.svg";
import greaterPharmaLogoUrl from "./assets/greater-pharma-logo.svg";
import siamPharmaceuticalLogoUrl from "./assets/siam-pharmaceutical-logo.svg";
import rxchumchonLogoUrl from "./assets/rxchumchon-logo.svg";

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
import woothiLogoUrl from "./assets/woothi-logo.svg";
import orexTradingLogoUrl from "./assets/orex-trading-logo.svg";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const customerPreordersEnabled = String(import.meta.env.VITE_FEATURE_CUSTOMER_PREORDERS || "").toLowerCase() === "true";
const adminViewStorageKey = "sc-stockday-admin-view";
const adminThemeStorageKey = "sc-stockday-admin-theme";
const ONLINE_MARKETING_STAFF_USER_ID = "onlinemarketingstaff";
const defaultAdminView = "receipts";
const stockCostAuditView = "stock-cost-audit";
const taxonomyView = "product-taxonomy";
const taxonomyReviewView = "taxonomy-review";
const adminOnlyViews = [stockCostAuditView, "category-review", "ingredient-dictionary", taxonomyView, taxonomyReviewView, "sync-log"];
const adminViewKeys = [defaultAdminView, "branch-stock", "branch-stock-history", "stock-recommendations", "movement-trace", "stock-requests", "focus-products", "preorder", ...adminOnlyViews];
const ADMIN_VIEW_ROUTE_SEGMENTS = {
  receipts: "receipts",
  "branch-stock": "branch-stock",
  "branch-stock-history": "branch-stock-history",
  "stock-recommendations": "stock-recommendations",
  "movement-trace": "movement-trace",
  "stock-requests": "stock-requests",
  "focus-products": "focus-products",
  preorder: "preorder",
  [stockCostAuditView]: "stock-cost-audit",
  "category-review": "category-review",
  "ingredient-dictionary": "ingredient-dictionary",
  [taxonomyView]: "taxonomy",
  [taxonomyReviewView]: "taxonomy-review",
  "sync-log": "sync-log",
};
const ADMIN_VIEW_BY_SEGMENT = Object.fromEntries(
  Object.entries(ADMIN_VIEW_ROUTE_SEGMENTS).map(([viewKey, segment]) => [segment, viewKey]),
);
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

function getNavigationGroups(isAdminUser, hideDashboard = false) {
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      shortLabel: "DB",
      items: [
        { label: "สินค้าโฟกัส", view: "focus-products", description: "เป้าหมายสินค้าโปรโมชั่นและยอดขายสะสม" },
      ],
    },
    {
      id: "product-data",
      label: "ข้อมูลสินค้า",
      shortLabel: "PR",
      items: [
        { label: "ใบรับสินค้า", view: "receipts", description: "ตรวจใบรับสินค้าและโลโก้ Supplier" },
        { label: "สต็อกสาขา", view: "branch-stock", description: "สถานะสต็อกแยกตามสาขา" },
        { label: "สต๊อกดูย้อนหลัง", view: "branch-stock-history", description: "ประวัติสต๊อกสะสมตามรอบเวลา sync" },
        { label: "คำแนะนำสต๊อก", view: "stock-recommendations", description: "ระบบแนะนำว่าควรถือสต๊อก ขอสาขาอื่น หรือซื้อเพิ่มเท่าไหร่" },
        { label: "คำขอสินค้า", view: "stock-requests", description: "ส่งและติดตามคำขอสินค้าระหว่างสาขา" },
        { label: "Movement & Transactions", view: "movement-trace", description: "ยอดรวม · รายการ transaction · เอกสาร" },
        ...(isAdminUser ? [{
          label: "ตรวจสอบต้นทุนสต๊อกสินค้า",
          view: stockCostAuditView,
          description: "ดูต้นทุนเฉลี่ยและมูลค่าคงเหลือต่อสาขา",
        }] : []),
      ],
    },
    {
      id: "data-quality",
      label: "ตรวจสอบฐานข้อมูล",
      shortLabel: "DQ",
      adminOnly: true,
      items: [
        { label: "ตรวจหมวดสินค้า", view: "category-review", description: "review queue สำหรับยืนยันหมวดสินค้า" },
        { label: "พจนานุกรมสารสำคัญ", view: "ingredient-dictionary", description: "ดูแลฐานความรู้สารสำคัญ" },
        { label: "Product Taxonomy", view: taxonomyView, description: "กำหนดประเภทสินค้าและจัดประเภทอัตโนมัติ" },
        { label: "Taxonomy Review", view: taxonomyReviewView, description: "ยืนยันผล AI classification และจัดคิวตรวจทาน" },
        { label: "ประวัติ Sync", view: "sync-log", description: "สถานะและประวัติการ sync ข้อมูล" },
        { label: "Ingredient Mapping", description: "supervision workflow ระยะถัดไป", disabled: true },
        { label: "Product Master", description: "ทะเบียนสินค้ากลาง", disabled: true },
      ],
    },
    {
      id: "customer-relations",
      label: "ลูกค้าสัมพันธ์",
      shortLabel: "CR",
      items: [
        { label: "พรีออเดอร์", view: "preorder", description: "รับและติดตามคำสั่งจองสินค้าล่วงหน้า" },
      ],
    },
  ].filter((group) => (!group.adminOnly || isAdminUser) && (!hideDashboard || group.id !== "dashboard"));
}

function statusClass(status) {
  if (status === "Reorder soon") return "danger";
  if (status === "Overstock / slow moving") return "warning";
  if (status === "No sales") return "muted";
  return "good";
}

function syncTone(status) {
  if (status === "failed") return "danger";
  if (status === "running") return "warning";
  return "good";
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

function Code39Barcode({ value, height = 56, narrow = 2, wide = 5, gap = 2 }) {
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

function translateStatus(status) {
  if (status === "Reorder soon") return "ควรสั่งซื้อเพิ่ม";
  if (status === "Overstock / slow moving") return "ค้างสต็อก / เคลื่อนไหวช้า";
  if (status === "No sales") return "ยังไม่มีการขาย";
  if (status === "Normal") return "ปกติ";
  if (status === "failed") return "ล้มเหลว";
  if (status === "running") return "กำลังทำงาน";
  if (status === "submitted") return "ส่งคำขอแล้ว";
  return status || "-";
}

const STOCK_COST_COMPARE_BRANCHES = [
  { branchCode: "000", label: "สาขา 000 (HQ)", shortLabel: "000" },
  { branchCode: "001", label: "สาขา 001", shortLabel: "001" },
  { branchCode: "003", label: "สาขา 003", shortLabel: "003" },
  { branchCode: "004", label: "สาขา 004", shortLabel: "004" },
  { branchCode: "005", label: "สาขา 005", shortLabel: "005" },
];

const STOCK_COST_BRANCH_OPTIONS = [
  { branchCode: "all", label: "ทุกสาขา" },
  ...STOCK_COST_COMPARE_BRANCHES.map(({ branchCode, label }) => ({ branchCode, label })),
];

function formatBranchContextLabel(branchCode, branchName = "") {
  if (!branchCode) return branchName || "ยังไม่ได้เลือกสาขา";
  return branchName ? `${branchCode} - ${branchName}` : `สาขา ${branchCode}`;
}

function normalizeRequestedQty(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(numericValue));
}

function normalizeDraftLine(line) {
  return {
    lineKey: line.lineKey || "",
    sourceBranchCode: line.sourceBranchCode || "",
    requestMode: line.requestMode || "STANDARD",
    productCode: line.productCode || "",
    productNameThai: line.productNameThai || "",
    productNameEng: line.productNameEng || "",
    barcode: line.barcode || "",
    unit: line.unit || "",
    requestedQty: Number(line.requestedQty) || 1,
    snapshotQty: line.snapshotQty != null ? Number(line.snapshotQty) : null,
    snapshotSyncedAt: line.snapshotSyncedAt || null,
    lineNote: line.lineNote || "",
  };
}

function generateRequestIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `srq-${crypto.randomUUID()}`;
  }
  return `srq-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildStockRequestPayload(lines = [], { note = "", idempotencyKey } = {}) {
  const groups = new Map();

  lines.forEach((line) => {
    if (!line?.sourceBranchCode || !line?.productCode || !line?.unit) {
      return;
    }
    const requestedQty = normalizeRequestedQty(line.requestedQty);
    if (!groups.has(line.sourceBranchCode)) {
      groups.set(line.sourceBranchCode, {
        sourceBranchCode: line.sourceBranchCode,
        requestMode: line.requestMode || "STANDARD",
        lines: [],
      });
    }
    if (line.requestMode === "ADMIN_ALERT") {
      groups.get(line.sourceBranchCode).requestMode = "ADMIN_ALERT";
    }
    groups.get(line.sourceBranchCode).lines.push({
      productCode: line.productCode,
      requestedQty,
      unit: line.unit,
      snapshotQty: Number.isFinite(Number(line.snapshotQty)) ? Number(line.snapshotQty) : null,
      snapshotSyncedAt: line.snapshotSyncedAt || null,
    });
  });

  return {
    idempotencyKey,
    note: String(note || "").trim(),
    groups: Array.from(groups.values()).filter((group) => group.lines.length > 0),
  };
}

// Supplier-to-logo mapping. Add new suppliers here — `patterns` are matched
// against the Adasoft supplier name (case- and whitespace-insensitive), so list
// both Thai and English variants. First brand with any matching pattern wins.
const SUPPLIER_BRANDS = [
  {
    key: "dksh",
    wordmark: "DKSH",
    tagline: "Performance Materials",
    logoSrc: dkshLogoUrl,
    patterns: ["ดีเคเอสเอช", "DKSH"],
  },
  {
    key: "zuellig-pharma",
    wordmark: "ZUELLIG",
    tagline: "PHARMA",
    logoSrc: zuelligPharmaLogoUrl,
    patterns: ["ซิลลิค ฟาร์มา", "ซิลลิค", "ZUELLIG PHARMA", "ZUELLIG"],
  },
  {
    key: "biopharm-chemicals",
    wordmark: "BIOPHARM",
    tagline: "CHEMICALS",
    logoSrc: biopharmChemicalsLogoUrl,
    patterns: ["ไบโอฟาร์ม เคมิคัลส์", "BIOPHARM CHEMICALS", "BIOPHARM"],
  },
  {
    key: "tnp-healthcare",
    wordmark: "TNP",
    tagline: "HEALTHCARE",
    logoSrc: tnpHealthcareLogoUrl,
    patterns: ["ที เอ็น พี เฮลท์แคร์", "T N P HEALTH CARE", "TNP HEALTHCARE", "TNP"],
  },
  {
    key: "hansa-pharmaceutical",
    wordmark: "HANSA",
    tagline: "PHARMACEUTICAL",
    logoSrc: hansaLogoUrl,
    patterns: ["หรรษา ฟาร์มาซูติคอล เซ็นเตอร์", "หรรษา", "HANSA"],
  },
  {
    key: "khaolaor",
    wordmark: "KLO",
    tagline: "ขาวละออ",
    logoSrc: khaolaorLogoUrl,
    patterns: ["ขาวละออ", "KHAOLAOR"],
  },
  {
    key: "sriprasit",
    wordmark: "SPS",
    tagline: "SRIPRASIT",
    logoSrc: sriprasitLogoUrl,
    patterns: ["ศรีประสิทธิ์", "เอสพีเอส", "SRIPRASIT", "SPS"],
  },
  {
    key: "bl-hua",
    wordmark: "HUA",
    tagline: "B.L. HUA",
    logoSrc: blHuaLogoUrl,
    patterns: ["บี.แอล.ฮั้ว", "บีแอลฮั้ว", "ฮั้ว", "B.L. HUA", "BL HUA"],
  },
  {
    key: "bangkok-drug",
    wordmark: "BANGKOK",
    tagline: "DRUG",
    logoSrc: bangkokDrugLogoUrl,
    patterns: ["บางกอก ดรัก", "บางกอกดรัก", "กรุงเทพดรัก", "BANGKOK DRUG"],
  },
  {
    key: "royal-d",
    wordmark: "Royal-D",
    tagline: "",
    logoSrc: royalDLogoUrl,
    patterns: ["รอแยล-ดี", "รอแยลดี", "ROYAL-D", "ROYAL D"],
  },
  {
    key: "pose-health-care",
    wordmark: "POSE",
    tagline: "HEALTH CARE",
    logoSrc: poseHealthCareLogoUrl,
    patterns: ["โพสเฮลท์แคร์", "โพส เฮลท์แคร์", "POSE HEALTH CARE", "POSE HEALTHCARE", "POSE"],
  },
  {
    key: "pks-medical-center",
    wordmark: "PKS",
    tagline: "MEDICAL CENTER",
    logoSrc: pksMedicalCenterLogoUrl,
    patterns: ["พีเคเอส", "PKS MEDICAL CENTER", "PKS MEDICAL", "PKS"],
  },
  {
    key: "mohmee",
    wordmark: "MOHMEE",
    tagline: "หมอมี",
    logoSrc: mohmeeLogoUrl,
    patterns: ["หมอมี", "MOHMEE", "MOH MEE"],
  },
  {
    key: "fasicare",
    wordmark: "FASICARE",
    tagline: "",
    logoSrc: fasicareLogoUrl,
    patterns: ["ฟาซิแคร์", "FASICARE"],
  },
  {
    key: "birich-thailand",
    wordmark: "BIRICH",
    tagline: "THAILAND",
    logoSrc: birichLogoUrl,
    patterns: ["บีริช", "BIRICH", "BIRICH THAILAND"],
  },
  {
    key: "boonsong-osot",
    wordmark: "บุญส่งโอสถ",
    tagline: "",
    logoSrc: boonsongOsotLogoUrl,
    patterns: ["บุญส่งโอสถ", "BOONSONG OSOT", "BOONSONGOSOT"],
  },
  {
    key: "macropharlab",
    wordmark: "MACROPHARLAB",
    tagline: "",
    logoSrc: macropharlabLogoUrl,
    patterns: ["แมคโครฟาร์แลบ", "MACROPHARLAB", "MACRO PHARLAB"],
  },
  {
    key: "ace-global",
    wordmark: "ACE GLOBAL",
    tagline: "",
    logoSrc: aceGlobalLogoUrl,
    patterns: ["เอซีโกลบอล", "เอซีอีโกลบอล", "ACE GLOBAL", "ACEGLOBAL"],
  },
  {
    key: "scharoen-pharma",
    wordmark: "ส.เจริญเภสัช",
    tagline: "เทรดดิ้ง",
    logoSrc: scharoenPharmaLogoUrl,
    patterns: ["ส.เจริญเภสัชเทรดดิ้ง", "สเจริญเภสัชเทรดดิ้ง", "S CHAROEN", "SCHAROEN"],
  },
  {
    key: "polipharm",
    wordmark: "POLIPHARM",
    tagline: "",
    logoSrc: polipharmLogoUrl,
    patterns: [
      "บริษัท โปลิฟาร์ม จำกัด (สำนักงานใหญ่)",
      "โปลิฟาร์ม",
      "POLIPHARM",
    ],
  },
  {
    key: "tman-pharmaceutical",
    wordmark: "T.MAN",
    tagline: "PHARMACEUTICAL",
    logoSrc: tmanLogoUrl,
    patterns: [
      "บริษัท ที. แมน ฟาร์มาซูติคอล จำกัด (มหาชน)",
      "ที. แมน ฟาร์มาซูติคอล",
      "ทีแมน ฟาร์มาซูติคอล",
      "T MAN PHARMACEUTICAL",
      "TMAN PHARMACEUTICAL",
      "TMAN",
    ],
  },
  {
    key: "berlin-pharmaceutical",
    wordmark: "BERLIN",
    tagline: "PHARMACEUTICAL",
    logoSrc: berlinpharmLogoUrl,
    patterns: [
      "บริษัท เบอร์ลินฟาร์มาซูติคอลอินดัสตรี้ จำกัด",
      "เบอร์ลินฟาร์มาซูติคอลอินดัสตรี้",
      "เบอร์ลินฟาร์มาซูติคอล",
      "BERLIN PHARMACEUTICAL",
      "BERLINPHARMACEUTICAL",
      "BERLIN",
    ],
  },
  {
    key: "anb-laboratory",
    wordmark: "A.N.B.",
    tagline: "LABORATORY",
    logoSrc: anbLabLogoUrl,
    patterns: [
      "บริษัท เอ.เอ็น.บี. ลาบอราตอรี่ (อำนวยเภสัช) จำกัด",
      "เอ.เอ็น.บี. ลาบอราตอรี่",
      "เอ็นบี ลาบอราตอรี่",
      "ANB LABORATORY",
      "A N B LABORATORY",
      "ANB LAB",
    ],
  },
  {
    key: "pacific-healthcare-thailand",
    wordmark: "PACIFIC",
    tagline: "HEALTHCARE",
    logoSrc: pacificHealthcareLogoUrl,
    patterns: [
      "บริษัท แปซิฟิค เฮลธ์แคร์ (ไทยแลนด์) จำกัด",
      "แปซิฟิค เฮลธ์แคร์",
      "แปซิฟิคเฮลธ์แคร์",
      "PACIFIC HEALTHCARE",
      "PACIFIC HEALTH CARE",
      "PACIFIC HEALTHCARE THAILAND",
    ],
  },
  {
    key: "greater-pharma",
    wordmark: "GREATER",
    tagline: "PHARMA",
    logoSrc: greaterPharmaLogoUrl,
    patterns: ["เกร๊ตเตอร์ ฟาร์ม่า", "GREATER PHARMA", "GREATER"],
  },
  {
    key: "siam-pharmaceutical",
    wordmark: "SIAM",
    tagline: "PHARMACEUTICAL",
    logoSrc: siamPharmaceuticalLogoUrl,
    patterns: ["เภสัช สยาม", "SIAM PHARMACEUTICAL", "SIAM"],
  },
  {
    key: "rxchumchon",
    wordmark: "RXCHUMCHON",
    tagline: "",
    logoSrc: rxchumchonLogoUrl,
    patterns: [
      "บริษัท ชุมชนเภสัชกรรม จำกัด (มหาชน)",
      "ชุมชนเภสัชกรรม",
      "RXCHUMCHON",
      "RX CHUMCHON",
    ],
  },
  {
    key: "woothi-interdrugs",
    wordmark: "WOOTHI",
    tagline: "INTERDRUGS 2010",
    logoSrc: woothiLogoUrl,
    patterns: [
      "บริษัท วุฒิ อินเตอร์ดรักส์ 2010 จำกัด",
      "วุฒิ อินเตอร์ดรักส์ 2010",
      "วุฒิ อินเตอร์ดรักส์",
      "WOOTHI INTERDRUGS 2010",
      "WOOTHI",
    ],
  },
  {
    key: "orex-trading",
    wordmark: "OREX",
    tagline: "TRADING",
    logoSrc: orexTradingLogoUrl,
    patterns: [
      "บริษัท โอเร็กซ์ เทรดดิ้ง จำกัด (สำนักงานใหญ่)",
      "โอเร็กซ์ เทรดดิ้ง",
      "OREX TRADING",
      "OCL",
    ],
  },
];

// Lowercase and strip whitespace, dots, and hyphens so matching tolerates
// casing, inconsistent spacing, and punctuation in Adasoft data
// (e.g. "ที เอ็น พี" vs "ทีเอ็นพี", "พี.เค.เอส." vs "พีเคเอส").
function normalizeSupplierText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s.-]+/g, "");
}

function getSupplierBrand(supplierName, supplierLogoMap = {}) {
  const normalized = normalizeSupplierText(supplierName);
  if (!normalized) return null;

  const customLogo = supplierLogoMap[normalized];
  if (customLogo?.logoDataUrl) {
    return {
      key: "custom",
      wordmark: customLogo.supplierName || supplierName,
      tagline: "",
      logoSrc: customLogo.logoDataUrl,
      isCustom: true,
    };
  }

  for (const [key, logo] of Object.entries(supplierLogoMap)) {
    if (key && logo?.logoDataUrl && (normalized.includes(key) || key.includes(normalized))) {
      return {
        key: "custom",
        wordmark: logo.supplierName || supplierName,
        tagline: "",
        logoSrc: logo.logoDataUrl,
        isCustom: true,
      };
    }
  }

  for (const brand of SUPPLIER_BRANDS) {
    const matched = brand.patterns.some((pattern) =>
      normalized.includes(normalizeSupplierText(pattern)),
    );
    if (matched) {
      return {
        key: brand.key,
        wordmark: brand.wordmark,
        tagline: brand.tagline,
        logoSrc: brand.logoSrc,
      };
    }
  }

  return null;
}

function svgTextToDataUrl(svgText) {
  const bytes = new TextEncoder().encode(svgText);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}

function validateSvgText(svgText) {
  const lowerSvg = String(svgText || "").toLowerCase();
  if (!lowerSvg.includes("<svg") || !lowerSvg.includes("</svg")) {
    return "ไฟล์นี้ไม่ใช่ SVG ที่ถูกต้อง";
  }
  if (/<script[\s>]/i.test(svgText) || /<foreignobject[\s>]/i.test(svgText) || /\son[a-z]+\s*=/i.test(svgText)) {
    return "SVG นี้มี markup ที่ไม่ปลอดภัย";
  }
  return "";
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

function readAdminViewFromLocation() {
  if (typeof window === "undefined") return null;

  const hashSegment = window.location.hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (hashSegment && ADMIN_VIEW_BY_SEGMENT[hashSegment]) {
    return ADMIN_VIEW_BY_SEGMENT[hashSegment];
  }

  const pathSegment = window.location.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
  if (pathSegment && ADMIN_VIEW_BY_SEGMENT[pathSegment]) {
    return ADMIN_VIEW_BY_SEGMENT[pathSegment];
  }

  return null;
}

function buildAdminViewHash(viewKey) {
  const segment = ADMIN_VIEW_ROUTE_SEGMENTS[viewKey];
  if (!segment || viewKey === defaultAdminView) {
    return "";
  }
  return `#/${segment}`;
}

function movementTypeLabel(type) {
  if (type === "transfer_in") return "รับโอนเข้า";
  if (type === "transfer_out") return "โอนออก";
  if (type === "supplier_receipt") return "ซื้อ Supplier";
  if (type === "sales_summary") return "ยอดขายรวม";
  return type || "-";
}

function movementTypeClass(type) {
  if (type === "transfer_in") return "good";
  if (type === "transfer_out") return "warning";
  if (type === "supplier_receipt") return "muted";
  if (type === "sales_summary") return "danger";
  return "muted";
}

// ProductMovementTracePanel was replaced by MovementAndTransactionsPanel (imported from MovementTransactionsPanel.jsx)


function PurchaseReceiptsPanel({ branchCode, canViewPrices, canEditLogos, csrfToken }) {
  const receiptPageSize = 10;
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingRecords, setPendingRecords] = useState([]);
  const [approvedRecords, setApprovedRecords] = useState([]);
  const [supplierLogoMap, setSupplierLogoMap] = useState({});
  const [logoEditorRecord, setLogoEditorRecord] = useState(null);
  const [logoPreviewSrc, setLogoPreviewSrc] = useState("");
  const [logoEditorMessage, setLogoEditorMessage] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);
  const [approvedDateFrom, setApprovedDateFrom] = useState("");
  const [approvedDateTo, setApprovedDateTo] = useState("");
  const [approvedSortOrder, setApprovedSortOrder] = useState("desc");
  const [pendingDateFrom, setPendingDateFrom] = useState("");
  const [pendingDateTo, setPendingDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const [approvedError, setApprovedError] = useState("");
  const [expandedDocs, setExpandedDocs] = useState({});
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [pendingPagination, setPendingPagination] = useState({
    page: 1,
    pageSize: receiptPageSize,
    total: 0,
    totalPages: 1,
  });
  const [approvedPagination, setApprovedPagination] = useState({
    page: 1,
    pageSize: receiptPageSize,
    total: 0,
    totalPages: 1,
  });
  const [pendingRefreshKey, setPendingRefreshKey] = useState(0);
  const [approvedRefreshKey, setApprovedRefreshKey] = useState(0);

  function indexSupplierLogos(logos) {
    const nextMap = {};
    for (const logo of logos || []) {
      const keys = [
        normalizeSupplierText(logo.supplierKey),
        normalizeSupplierText(logo.supplierName),
      ].filter(Boolean);
      for (const key of keys) {
        nextMap[key] = logo;
      }
    }
    return nextMap;
  }

  async function fetchSupplierLogos() {
    const res = await apiFetch("/api/admin/supplier-logos");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setSupplierLogoMap(indexSupplierLogos(data.logos || []));
  }

  function toggleDoc(docNo) {
    setExpandedDocs((prev) => ({ ...prev, [docNo]: !prev[docNo] }));
  }

  async function fetchPending({
    page = pendingPage,
    search = appliedSearchTerm,
    dateFrom = pendingDateFrom,
    dateTo = pendingDateTo,
  } = {}) {
    setLoadingPending(true);
    setPendingError("");
    try {
      const params = new URLSearchParams({
        branchCode,
        page: String(page),
        pageSize: String(receiptPageSize),
      });
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await apiFetch(`/api/admin/pending-receipts?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPendingRecords(data.records || []);
      setPendingPagination(
        data.pagination || {
          page,
          pageSize: receiptPageSize,
          total: data.records?.length || 0,
          totalPages: 1,
        },
      );
    } catch (err) {
      setPendingError(err.message);
    } finally {
      setLoadingPending(false);
    }
  }

  async function fetchApproved({
    dateFrom = approvedDateFrom,
    dateTo = approvedDateTo,
    page = approvedPage,
    search = appliedSearchTerm,
    sort = approvedSortOrder,
  } = {}) {
    setLoadingApproved(true);
    setApprovedError("");
    try {
      const params = new URLSearchParams({
        branchCode,
        page: String(page),
        pageSize: String(receiptPageSize),
        sort,
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (search) params.set("search", search);
      const res = await apiFetch(`/api/admin/approved-receipts?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApprovedRecords(data.records || []);
      setApprovedPagination(
        data.pagination || {
          page,
          pageSize: receiptPageSize,
          total: data.records?.length || 0,
          totalPages: 1,
        },
      );
    } catch (err) {
      setApprovedError(err.message);
    } finally {
      setLoadingApproved(false);
    }
  }

  useEffect(() => {
    fetchPending();
  }, [appliedSearchTerm, branchCode, pendingDateFrom, pendingDateTo, pendingPage, pendingRefreshKey]);

  useEffect(() => {
    fetchApproved();
  }, [approvedPage, approvedRefreshKey, appliedSearchTerm, branchCode, approvedDateFrom, approvedDateTo, approvedSortOrder]);

  useEffect(() => {
    fetchSupplierLogos().catch(() => {
      setSupplierLogoMap({});
    });
  }, []);

  function formatDocDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function isExpired(expiredDate) {
    if (!expiredDate) return false;
    return new Date(expiredDate) < new Date();
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const nextSearch = searchTerm.trim();
    setAppliedSearchTerm(nextSearch);
    if (activeTab === "approved") {
      if (approvedPage !== 1) {
        setApprovedPage(1);
      } else {
        setApprovedRefreshKey((value) => value + 1);
      }
      return;
    }
    if (pendingPage !== 1) {
      setPendingPage(1);
    } else {
      setPendingRefreshKey((value) => value + 1);
    }
  }

  function handleRefresh() {
    if (activeTab === "pending") {
      setPendingRefreshKey((value) => value + 1);
      return;
    }
    setApprovedRefreshKey((value) => value + 1);
  }

  function openLogoEditor(record) {
    const supplierName = record.supplierName || record.supplierCode || "";
    const supplierBrand = getSupplierBrand(supplierName, supplierLogoMap);
    setLogoEditorRecord(record);
    setLogoPreviewSrc(supplierBrand?.logoSrc || "");
    setLogoEditorMessage("");
  }

  function closeLogoEditor() {
    if (savingLogo) return;
    setLogoEditorRecord(null);
    setLogoPreviewSrc("");
    setLogoEditorMessage("");
  }

  async function handleLogoFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setLogoEditorMessage("กรุณาเลือกไฟล์ .svg เท่านั้น");
      return;
    }
    if (file.size > 300_000) {
      setLogoEditorMessage("ไฟล์ SVG ต้องไม่เกิน 300KB");
      return;
    }

    const svgText = await file.text();
    const validationMessage = validateSvgText(svgText);
    if (validationMessage) {
      setLogoEditorMessage(validationMessage);
      return;
    }

    setLogoPreviewSrc(svgTextToDataUrl(svgText));
    setLogoEditorMessage("");
  }

  async function saveSupplierLogo() {
    const supplierName = logoEditorRecord?.supplierName || logoEditorRecord?.supplierCode || "";
    if (!supplierName || !logoPreviewSrc) {
      setLogoEditorMessage("กรุณาเลือก SVG ก่อนบันทึก");
      return;
    }

    setSavingLogo(true);
    setLogoEditorMessage("");
    try {
      const res = await apiFetch("/api/admin/supplier-logos", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({
          supplierKey: normalizeSupplierText(supplierName),
          supplierName,
          logoDataUrl: logoPreviewSrc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSupplierLogoMap((current) => ({
        ...current,
        [normalizeSupplierText(data.logo.supplierKey)]: data.logo,
        [normalizeSupplierText(data.logo.supplierName)]: data.logo,
      }));
      setLogoEditorRecord(null);
      setLogoPreviewSrc("");
    } catch (err) {
      setLogoEditorMessage(err.message || "บันทึกโลโก้ไม่สำเร็จ");
    } finally {
      setSavingLogo(false);
    }
  }

  function renderPagination(pagination, setPage, loading, records) {
    const total = pagination.total || 0;
    const currentPage = pagination.page || 1;
    const totalPages = pagination.totalPages || 1;
    const start = total === 0 ? 0 : (currentPage - 1) * pagination.pageSize + 1;
    const end = total === 0 ? 0 : start + (records.length || 0) - 1;
    return (
      <div className="pagination receipt-pagination">
        <p className="pagination-info">
          {total === 0
            ? "0 รายการ"
            : `${formatNumber(start)}-${formatNumber(end)} จาก ${formatNumber(total)} รายการ`}
        </p>
        <div className="pagination-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={loading || currentPage <= 1}
            onClick={() => setPage((page) => Math.max(1, page - 1))}
          >
            ก่อนหน้า
          </button>
          <span className="receipt-page-indicator">
            หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={loading || currentPage >= totalPages}
            onClick={() => setPage((page) => Math.min(totalPages, page + 1))}
          >
            ถัดไป
          </button>
        </div>
      </div>
    );
  }

  function ReceiptCard({ record }) {
    const docNo = record.docNo;
    const isOpen = !!expandedDocs[docNo];
    const supplierName = record.supplierName || record.supplierCode || "";
    const supplierBrand = getSupplierBrand(supplierName, supplierLogoMap);
    return (
      <article className="receipt-card">
        <div className="receipt-card-header">
          <div className="receipt-card-meta">
            <strong className="receipt-doc-no">{docNo}</strong>
            <span className="receipt-supplier">
              {record.supplierName || record.supplierCode || "-"}
            </span>
            <span className="meta-line">
              {formatDocDate(record.docDate)}
              {record.docTime ? ` · ${record.docTime}` : ""}
            </span>
          </div>
          <div className="receipt-card-brand-slot">
            <div className="receipt-card-brand-stack">
              {supplierBrand ? (
                <div className={`supplier-brand supplier-brand-${supplierBrand.key}`}>
                  <div className="supplier-brand-mark" aria-hidden="true">
                    {supplierBrand.logoSrc ? (
                      <img
                        className="supplier-brand-image"
                        src={supplierBrand.logoSrc}
                        alt=""
                      />
                    ) : supplierBrand.key === "dksh" ? (
                      <>
                        <span className="supplier-brand-dksh-half" />
                        <span className="supplier-brand-dksh-leaf supplier-brand-dksh-leaf-1" />
                        <span className="supplier-brand-dksh-leaf supplier-brand-dksh-leaf-2" />
                        <span className="supplier-brand-dksh-leaf supplier-brand-dksh-leaf-3" />
                      </>
                    ) : (
                      <>
                        <span className="supplier-brand-globe" />
                        <span className="supplier-brand-slash" />
                      </>
                    )}
                  </div>
                </div>
              ) : null}
              {canEditLogos ? (
                <button
                  type="button"
                  className="ghost-button supplier-logo-edit-button"
                  onClick={() => openLogoEditor(record)}
                >
                  แก้โลโก้
                </button>
              ) : null}
            </div>
          </div>
          <div className="receipt-card-side">
            {canViewPrices && (
              <span className="receipt-grand">
                {Number(record.grand || 0).toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                บาท
              </span>
            )}
            <span className="meta-line">{(record.lines || []).length} รายการ</span>
            <button
              type="button"
              className="ghost-button receipt-toggle"
              onClick={() => toggleDoc(docNo)}
            >
              {isOpen ? "▼ ซ่อนรายการ" : "▶ ดูรายการสินค้า"}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="receipt-lines-wrap">
            <table className="receipt-lines-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th>จำนวน</th>
                  <th>หน่วย</th>
                  {canViewPrices && <th>ราคา/หน่วย</th>}
                  <th>Lot</th>
                  <th>หมดอายุ</th>
                </tr>
              </thead>
              <tbody>
                {(record.lines || []).map((ln) => (
                  <tr
                    key={ln.seqNo}
                    className={isExpired(ln.expiredDate) ? "row-expired" : ""}
                  >
                    <td>{ln.seqNo}</td>
                    <td>{ln.productCode || "-"}</td>
                    <td>{ln.productName || "-"}</td>
                    <td>
                      {Number(ln.qty || 0).toLocaleString("th-TH", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td>{ln.unitName || ln.unitCode || "-"}</td>
                    {canViewPrices && (
                      <td>
                        {Number(ln.setPrice || 0).toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    )}
                    <td>{ln.lotNo || "-"}</td>
                    <td className={isExpired(ln.expiredDate) ? "expired-date" : ""}>
                      {formatDocDate(ln.expiredDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="panel purchase-receipts-panel">
      <div className="panel-header">
        <div>
          <h2>ใบรับสินค้า</h2>
          <p>ติดตามเอกสารรับของจากผู้จำหน่าย พร้อมย้อนดูเอกสารเก่าด้วยการแบ่งหน้า</p>
        </div>
      </div>

      <div className="receipt-tabs-row">
        <div className="receipt-tabs">
          <button
            type="button"
            className={activeTab === "pending" ? "receipt-tab active" : "receipt-tab"}
            onClick={() => setActiveTab("pending")}
          >
            📋 รออนุมัติ
            {pendingRecords.length > 0 && (
              <span className="tab-badge">{pendingRecords.length}</span>
            )}
          </button>
          <button
            type="button"
            className={activeTab === "approved" ? "receipt-tab active" : "receipt-tab"}
            onClick={() => setActiveTab("approved")}
          >
            ✅ CEO กดอนุมัติแล้ว
            {approvedRecords.length > 0 && (
              <span className="tab-badge tab-badge-good">{approvedRecords.length}</span>
            )}
          </button>
        </div>
        <form className="receipt-filter-bar" onSubmit={handleSearchSubmit}>
          <div className="receipt-search-row">
            <input
              type="search"
              className="receipt-search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหา SKU, ชื่อสินค้า, ผู้จำหน่าย, เลขที่เอกสาร"
            />
            <button type="submit" className="ghost-button receipt-search-button">
              ค้นหา
            </button>
          </div>
          <div className="receipt-date-row">
            <label className="date-label receipt-date-label">
              จากวันที่
              <input
                type="date"
                value={activeTab === "pending" ? pendingDateFrom : approvedDateFrom}
                onChange={(event) => {
                  if (activeTab === "pending") {
                    setPendingDateFrom(event.target.value);
                    setPendingPage(1);
                    return;
                  }
                  setApprovedDateFrom(event.target.value);
                  setApprovedPage(1);
                }}
                className="date-input-inline"
              />
            </label>
            <label className="date-label receipt-date-label">
              ถึงวันที่
              <input
                type="date"
                value={activeTab === "pending" ? pendingDateTo : approvedDateTo}
                onChange={(event) => {
                  if (activeTab === "pending") {
                    setPendingDateTo(event.target.value);
                    setPendingPage(1);
                    return;
                  }
                  setApprovedDateTo(event.target.value);
                  setApprovedPage(1);
                }}
                className="date-input-inline"
              />
            </label>
            {activeTab === "approved" && (
              <button
                type="button"
                className="ghost-button receipt-sort-button"
                onClick={() => {
                  setApprovedSortOrder((current) => (current === "desc" ? "asc" : "desc"));
                  setApprovedPage(1);
                }}
              >
                {approvedSortOrder === "desc" ? "ใหม่ -> เก่า" : "เก่า -> ใหม่"}
              </button>
            )}
            <button
              type="button"
              className="ghost-button receipt-refresh-button"
              onClick={handleRefresh}
              disabled={activeTab === "pending" ? loadingPending : loadingApproved}
            >
              🔄 รีเฟรช
            </button>
          </div>
        </form>
      </div>

      {activeTab === "pending" && (
        <div className="receipt-tab-content">
          {loadingPending && <p className="empty-state">⏳ กำลังโหลด...</p>}
          {pendingError && (
            <p className="notice error compact">❌ เชื่อมต่อไม่ได้: {pendingError}</p>
          )}
          {!loadingPending && !pendingError && pendingRecords.length === 0 && (
            <p className="empty-state">ไม่มีเอกสารรออนุมัติ</p>
          )}
          <div className="receipt-list">
            {pendingRecords.map((rec) => (
              <ReceiptCard key={rec.docNo || rec.doc_no} record={rec} />
            ))}
          </div>
          {!pendingError && renderPagination(pendingPagination, setPendingPage, loadingPending, pendingRecords)}
        </div>
      )}

      {activeTab === "approved" && (
        <div className="receipt-tab-content">
          {loadingApproved && <p className="empty-state">⏳ กำลังโหลด...</p>}
          {approvedError && (
            <p className="notice error compact">❌ เชื่อมต่อไม่ได้: {approvedError}</p>
          )}
          {!loadingApproved && !approvedError && approvedRecords.length === 0 && (
            <p className="empty-state">
              {approvedDateFrom || approvedDateTo
                ? "ยังไม่มีเอกสารรับของในช่วงวันที่เลือก"
                : "ยังไม่มีเอกสารรับของ"}
            </p>
          )}
          <div className="receipt-list">
            {approvedRecords.map((rec) => (
              <ReceiptCard key={rec.docNo || rec.doc_no} record={rec} />
            ))}
          </div>
          {!approvedError &&
            renderPagination(approvedPagination, setApprovedPage, loadingApproved, approvedRecords)}
        </div>
      )}
      {logoEditorRecord ? (
        <div className="logo-editor-backdrop" role="presentation" onClick={closeLogoEditor}>
          <div
            className="logo-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="แก้โลโก้ผู้จำหน่าย"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="logo-editor-header">
              <div>
                <h3>แก้โลโก้ผู้จำหน่าย</h3>
                <p>{logoEditorRecord.supplierName || logoEditorRecord.supplierCode || "-"}</p>
              </div>
              <button type="button" className="ghost-button" onClick={closeLogoEditor} disabled={savingLogo}>
                ปิด
              </button>
            </div>
            <div className="logo-editor-body">
              <div className="logo-editor-preview">
                {logoPreviewSrc ? (
                  <img className="supplier-brand-image" src={logoPreviewSrc} alt="" />
                ) : (
                  <span>ยังไม่มีโลโก้</span>
                )}
              </div>
              <label className="logo-file-picker">
                <span>อัปโหลด SVG</span>
                <input type="file" accept=".svg,image/svg+xml" onChange={handleLogoFileChange} />
              </label>
              {logoEditorMessage ? <p className="notice error compact">{logoEditorMessage}</p> : null}
            </div>
            <div className="logo-editor-actions">
              <button type="button" className="ghost-button" onClick={closeLogoEditor} disabled={savingLogo}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveSupplierLogo}
                disabled={savingLogo || !logoPreviewSrc}
              >
                {savingLogo ? "กำลังบันทึก..." : "บันทึกโลโก้"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
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

// Temporary test seam for R3 characterization. Runtime ownership remains in App.jsx.
export { IncomingRequestsTab, MyRequestsTab, StockRequestsPanel };

function countPendingIncomingRequests(records) {
  const list = Array.isArray(records) ? records : [];
  return list.filter((record) => record?.status === "SUBMITTED" && !record?.responseResult).length;
}

// ── Nightly Sync Log ─────────────────────────────────────────────────────────
const BRANCH_LABELS = {
  "000": "สาขา 000 (HQ)",
  "001": "สาขา 001",
  "003": "สาขา 003",
  "004": "สาขา 004",
  "005": "สาขา 005",
};


export default function App() {
  const pageSize = 50;
  const [stockDay, setStockDay] = useState([]);
  const [orderRequests, setOrderRequests] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState("");
  const [session, setSession] = useState(null);
  const [branchOptions, setBranchOptions] = useState([]);
  const [branchContextBusy, setBranchContextBusy] = useState(false);
  const [branchContextError, setBranchContextError] = useState("");
  const [selectedBranchContext, setSelectedBranchContext] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView] = useState(() => {
    if (typeof window === "undefined") return defaultAdminView;
    const locationView = readAdminViewFromLocation();
    if (locationView && adminViewKeys.includes(locationView)) {
      return locationView;
    }
    const savedView = window.localStorage.getItem(adminViewStorageKey);
    return adminViewKeys.includes(savedView)
      ? savedView
      : defaultAdminView;
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState(null);
  const [incomingRequestBadgeCount, setIncomingRequestBadgeCount] = useState(0);
  const [preorderBadgeCount, setPreorderBadgeCount] = useState(0);
  const [syncFailureBranches, setSyncFailureBranches] = useState([]);
  const [requestDraftItems, setRequestDraftItems] = useState([]);
  const [requestBatchNote, setRequestBatchNote] = useState("");
  const [draftPublicId, setDraftPublicId] = useState(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [draftHydrating, setDraftHydrating] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState(null); // null | "saving" | "saved" | { error: string }
  const requestIdempotencyKeyRef = useRef(generateRequestIdempotencyKey());
  const draftPublicIdRef = useRef(null);
  const draftVersionRef = useRef(0);
  // items: null = not hydrated yet; set after first load so autosave skips hydration re-renders
  const draftHydrationRef = useRef({ items: null, note: null });
  const draftSaveTimerRef = useRef(null);
  const draftHydratedForBranchRef = useRef("");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem(adminThemeStorageKey);
    return savedTheme === "light" ? "light" : "dark";
  });
  const accountMenuRef = useRef(null);
  const navigationMenuRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const response = await apiFetch("/admin/me");
        if (response.status === 401) {
          if (!active) return;
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("ตรวจสอบเซสชันผู้ดูแลไม่สำเร็จ");
        }

        const data = await response.json();
        if (!active) return;

        setSession({
          user: data.user,
          csrfToken: data.csrf_token,
          permissions: data.permissions,
        });
      } catch (sessionError) {
        if (!active) return;
        setAuthError(sessionError.message || "ตรวจสอบเซสชันผู้ดูแลไม่สำเร็จ");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setBranchOptions([]);
      setSelectedBranchContext("");
      setBranchContextError("");
      return undefined;
    }

    let active = true;

    async function loadBranches() {
      try {
        const response = await apiFetch("/api/branches");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setBranchOptions(Array.isArray(data) ? data : []);
      } catch (loadError) {
        if (!active) return;
        setBranchOptions([]);
        setBranchContextError(loadError.message || "โหลดรายการสาขาไม่สำเร็จ");
      }
    }

    loadBranches();
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;

    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const [stockResponse, orderResponse, syncResponse] = await Promise.all([
          apiFetch("/api/admin/stock-day"),
          apiFetch("/api/admin/order-requests"),
          apiFetch("/api/admin/sync-status"),
        ]);

        if ([stockResponse, orderResponse, syncResponse].some((response) => response.status === 401)) {
          if (!active) return;
          setSession(null);
          setAuthError("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
          return;
        }

        if (!stockResponse.ok || !orderResponse.ok || !syncResponse.ok) {
          throw new Error("โหลดข้อมูลแดชบอร์ดไม่สำเร็จ");
        }

        const [stockData, orderData, syncData] = await Promise.all([
          stockResponse.json(),
          orderResponse.json(),
          syncResponse.json(),
        ]);

        if (!active) return;

        setStockDay(stockData);
        setOrderRequests(orderData);
        setSyncStatus(syncData);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลดข้อมูลแดชบอร์ดไม่สำเร็จ");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [session]);

  const branchCode = session?.user?.effective_branch_code || session?.user?.branch_code || "";
  const activeBranchOption = branchOptions.find((branch) => branch.branchCode === branchCode) || null;
  const activeBranchName = activeBranchOption?.branchName || "";
  const stockRequestBadgeCount = requestDraftItems.length + incomingRequestBadgeCount;
  const syncFailureBadgeCount = syncFailureBranches.length;
  const canSelectBranchContext =
    session?.user?.role === "admin" ||
    (session?.user?.role === "staff" && !branchCode);

  useEffect(() => {
    setSelectedBranchContext(branchCode || "");
  }, [branchCode]);

  // Auto-apply for staff with exactly one allowed branch so the selector never appears
  useEffect(() => {
    if (branchCode || session?.user?.role !== "staff") return undefined;
    const allowedCodes = session?.permissions?.allowed_branch_codes;
    if (!Array.isArray(allowedCodes) || allowedCodes.length !== 1) return undefined;
    handleApplyBranchContext(allowedCodes[0]);
    return undefined;
  }, [session, branchCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshIncomingRequestBadgeCount = useCallback(async () => {
    if (!branchCode) {
      setIncomingRequestBadgeCount(0);
      return;
    }
    try {
      const res = await apiFetch("/api/stock-requests/incoming");
      if (!res.ok) return;
      const data = await res.json();
      const records = Array.isArray(data.records) ? data.records : [];
      setIncomingRequestBadgeCount(countPendingIncomingRequests(records));
    } catch {
      // silent
    }
  }, [branchCode]);

  const refreshPreorderBadgeCount = useCallback(async () => {
    if (!session || !customerPreordersEnabled) { setPreorderBadgeCount(0); return; }
    try {
      const response = await apiFetch("/api/customer-preorders/unread-count");
      if (!response.ok) return;
      const data = await response.json();
      setPreorderBadgeCount(Math.max(Number(data.unreadCount) || 0, Number(data.actionableCount) || 0));
    } catch { /* badge polling must not block the page */ }
  }, [session]);

  useEffect(() => {
    refreshPreorderBadgeCount();
    if (!session || !customerPreordersEnabled) return undefined;
    const timer = setInterval(refreshPreorderBadgeCount, 30_000);
    return () => clearInterval(timer);
  }, [session, refreshPreorderBadgeCount]);

  useEffect(() => {
    if (!branchCode) { setIncomingRequestBadgeCount(0); return undefined; }
    let active = true;
    async function fetchIncomingBadgeCount() {
      try {
        const res = await apiFetch("/api/stock-requests/incoming");
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        const records = Array.isArray(data.records) ? data.records : [];
        setIncomingRequestBadgeCount(countPendingIncomingRequests(records));
      } catch { /* silent */ }
    }
    fetchIncomingBadgeCount();
    const id = setInterval(fetchIncomingBadgeCount, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [branchCode]);

  // Sync-failure nav badge: a branch stays flagged only while its MOST RECENT
  // run today is still "failed" — one successful run clears it, even if an
  // earlier run that same day failed. Historical failures from prior days
  // don't count; only today's unresolved state does.
  useEffect(() => {
    if (!session || session.user?.role !== "admin") { setSyncFailureBranches([]); return undefined; }
    let active = true;
    async function fetchSyncFailureBadge() {
      try {
        const res = await apiFetch("/api/sync/nightly-log?days=1");
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        const todayIso = Array.isArray(data.dates) ? data.dates[0] : null;
        const branches = Array.isArray(data.branches) ? data.branches : [];
        const rows = data.rows || {};
        const failed = todayIso
          ? branches.filter((branchCode) => rows[branchCode]?.[todayIso] === "failed")
          : [];
        setSyncFailureBranches(failed);
      } catch { /* silent */ }
    }
    fetchSyncFailureBadge();
    const id = setInterval(fetchSyncFailureBadge, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [session]);

  // Hydrate draft from server whenever branch context changes
  useEffect(() => {
    if (!session || !branchCode) {
      draftHydratedForBranchRef.current = "";
      draftHydrationRef.current = { items: null, note: null };
      setDraftPublicId(null);
      setDraftVersion(0);
      draftPublicIdRef.current = null;
      draftVersionRef.current = 0;
      setRequestDraftItems([]);
      setRequestBatchNote("");
      setDraftHydrating(false);
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      return undefined;
    }
    if (draftHydratedForBranchRef.current === branchCode) return undefined;

    draftHydratedForBranchRef.current = branchCode;
    draftHydrationRef.current = { items: null, note: null };
    setDraftHydrating(true);
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    let active = true;
    async function fetchDraft() {
      try {
        const res = await apiFetch("/api/stock-request-draft/me");
        if (!res.ok || !active) { if (active) setDraftHydrating(false); return; }
        const data = await res.json();
        if (!active) return;
        const draft = data.draft || {};
        const hydratedItems = (draft.lines || []).map(normalizeDraftLine);
        const hydratedNote = draft.note || "";
        setRequestDraftItems(hydratedItems);
        setRequestBatchNote(hydratedNote);
        setDraftPublicId(draft.draftPublicId || null);
        setDraftVersion(draft.version ?? 0);
        draftPublicIdRef.current = draft.draftPublicId || null;
        draftVersionRef.current = draft.version ?? 0;
        // Mark hydration snapshot so autosave skips this render
        draftHydrationRef.current = { items: hydratedItems, note: hydratedNote };
      } catch {
        // Draft is non-critical; allow autosave to create it fresh
        draftHydrationRef.current = { items: [], note: "" };
      } finally {
        if (active) setDraftHydrating(false);
      }
    }
    fetchDraft();
    return () => { active = false; };
  }, [session, branchCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave draft changes with 1.5 s debounce
  useEffect(() => {
    const snap = draftHydrationRef.current;
    // Skip until hydrated and skip the hydration-triggered re-render itself
    if (snap.items === null) return undefined;
    if (requestDraftItems === snap.items && requestBatchNote === snap.note) return undefined;
    if (!branchCode || !session) return undefined;

    const capturedItems = requestDraftItems;
    const capturedNote = requestBatchNote;
    const capturedCsrf = session?.csrfToken || "";

    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    setDraftSaveStatus(null);
    draftSaveTimerRef.current = setTimeout(async () => {
      draftSaveTimerRef.current = null;
      setDraftSaveStatus("saving");
      try {
        const res = await apiFetch("/api/stock-request-draft/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": capturedCsrf },
          body: JSON.stringify({
            version: draftVersionRef.current,
            note: capturedNote,
            lines: capturedItems.map(normalizeDraftLine),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const saved = data.draft || {};
          draftPublicIdRef.current = saved.draftPublicId || null;
          draftVersionRef.current = saved.version ?? 0;
          setDraftPublicId(saved.draftPublicId || null);
          setDraftVersion(saved.version ?? 0);
          setDraftSaveStatus("saved");
          setTimeout(() => setDraftSaveStatus(null), 3000);
        } else if (res.status === 409) {
          // Re-fetch fresh draft on version conflict
          const freshRes = await apiFetch("/api/stock-request-draft/me");
          if (freshRes.ok) {
            const freshData = await freshRes.json();
            const fresh = freshData.draft || {};
            const freshItems = (fresh.lines || []).map(normalizeDraftLine);
            const freshNote = fresh.note || "";
            draftHydrationRef.current = { items: freshItems, note: freshNote };
            setRequestDraftItems(freshItems);
            setRequestBatchNote(freshNote);
            setDraftPublicId(fresh.draftPublicId || null);
            setDraftVersion(fresh.version ?? 0);
            draftPublicIdRef.current = fresh.draftPublicId || null;
            draftVersionRef.current = fresh.version ?? 0;
          }
          setDraftSaveStatus({ error: "409 conflict — reloaded" });
        } else {
          const errText = await res.text().catch(() => "");
          setDraftSaveStatus({ error: `${res.status} ${errText.slice(0, 120)}` });
        }
      } catch (err) {
        setDraftSaveStatus({ error: `network: ${err?.message || "unknown"}` });
      }
    }, 1500);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [requestDraftItems, requestBatchNote]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin(event) {
    event.preventDefault();
    setAuthenticating(true);
    setAuthError("");

    try {
      const response = await apiFetch("/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "เข้าสู่ระบบไม่สำเร็จ");
      }

      setSession({
        user: data.user,
        csrfToken: data.csrf_token,
        permissions: {
          can_select_branch_context: data.permissions?.can_select_branch_context
            ?? (data.user?.role === "admin" || data.user?.role === "staff"),
          allowed_branch_codes: data.permissions?.allowed_branch_codes ?? null,
        },
      });
      setPassword("");
    } catch (loginError) {
      setAuthError(loginError.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setAuthenticating(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/admin/auth/logout", {
        method: "POST",
        headers: {
          "X-CSRF-Token": session?.csrfToken || "",
        },
      });
    } finally {
      setAccountMenuOpen(false);
      setSession(null);
      setBranchOptions([]);
      setSelectedBranchContext("");
      setBranchContextError("");
      setLoading(false);
      setStockDay([]);
      setOrderRequests([]);
      setSyncStatus(null);
      setError("");
    }
  }

  async function handleApplyBranchContext(nextBranchCode) {
    if (!session || !canSelectBranchContext) return;

    setBranchContextBusy(true);
    setBranchContextError("");
    try {
      const response = nextBranchCode
        ? await apiFetch("/admin/auth/branch-override", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": session.csrfToken || "",
            },
            body: JSON.stringify({ branchCode: nextBranchCode }),
          })
        : await apiFetch("/admin/auth/branch-override", {
            method: "DELETE",
            headers: {
              "X-CSRF-Token": session.csrfToken || "",
            },
          });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      setSession((current) => ({
        ...(current || {}),
        user: data.user,
        csrfToken: data.csrf_token || current?.csrfToken || "",
        permissions: current?.permissions || null,
      }));
    } catch (contextError) {
      setBranchContextError(contextError.message || "เปลี่ยนสาขาที่ใช้งานไม่สำเร็จ");
    } finally {
      setBranchContextBusy(false);
    }
  }

  function handleClearDraft() {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const publicIdToDiscard = draftPublicIdRef.current;
    if (publicIdToDiscard) {
      apiFetch("/api/stock-request-draft/me", {
        method: "DELETE",
        headers: { "X-CSRF-Token": session?.csrfToken || "" },
      }).catch(() => {});
    }
    const emptyItems = [];
    setRequestDraftItems(emptyItems);
    setRequestBatchNote("");
    setDraftPublicId(null);
    setDraftVersion(0);
    draftPublicIdRef.current = null;
    draftVersionRef.current = 0;
    draftHydrationRef.current = { items: emptyItems, note: "" };
    requestIdempotencyKeyRef.current = generateRequestIdempotencyKey();
  }

  async function handleSubmitDraft({ onStart, onSuccess, onError, onFinally } = {}) {
    if (onStart) onStart();
    try {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      const payload = buildStockRequestPayload(requestDraftItems, {
        note: requestBatchNote,
        idempotencyKey: requestIdempotencyKeyRef.current,
      });
      if (!payload.groups.length) throw new Error("ยังไม่มีรายการที่พร้อมส่งคำขอ");
      const submitPayload = {
        ...payload,
        ...(draftPublicIdRef.current
          ? { draftPublicId: draftPublicIdRef.current, draftVersion: draftVersionRef.current }
          : {}),
      };
      const response = await apiFetch("/api/stock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session?.csrfToken || "" },
        body: JSON.stringify(submitPayload),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.code === "DRAFT_VERSION_CONFLICT") {
        throw new Error("ร่างคำขอถูกแก้ไขจากอุปกรณ์อื่น กรุณารีโหลดหน้าเพื่อดูข้อมูลล่าสุด");
      }
      if (!response.ok) throw new Error(result.message || result.error || `HTTP ${response.status}`);
      // Draft is now SUBMITTED server-side — clear local state without calling DELETE
      const emptyItems = [];
      setRequestDraftItems(emptyItems);
      setRequestBatchNote("");
      setDraftPublicId(null);
      setDraftVersion(0);
      draftPublicIdRef.current = null;
      draftVersionRef.current = 0;
      draftHydrationRef.current = { items: emptyItems, note: "" };
      requestIdempotencyKeyRef.current = generateRequestIdempotencyKey();
      if (onSuccess) onSuccess(result);
    } catch (err) {
      if (onError) onError(err);
    } finally {
      if (onFinally) onFinally();
    }
  }

  const filteredStock = useMemo(() => {
    return stockDay.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesQuery =
        query.trim() === "" ||
        [item.productName, item.productCode, item.supplier]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase());

      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, stockDay]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, stockDay.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(adminViewStorageKey, view);
    const nextHash = buildAdminViewHash(view);
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function syncViewFromLocation() {
      const locationView = readAdminViewFromLocation();
      if (locationView && adminViewKeys.includes(locationView)) {
        setView(locationView);
      } else if (!window.location.hash && window.location.pathname === "/") {
        setView((current) => current);
      }
    }

    window.addEventListener("hashchange", syncViewFromLocation);
    window.addEventListener("popstate", syncViewFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncViewFromLocation);
      window.removeEventListener("popstate", syncViewFromLocation);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(adminThemeStorageKey, theme);
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  }, [theme]);

  const riskItems = useMemo(() => {
    return [...stockDay]
      .filter((item) => item.status !== "Normal")
      .sort((left, right) => {
        const leftProjected = Number(left.projectedStockDay ?? left.stockDay ?? 0);
        const rightProjected = Number(right.projectedStockDay ?? right.stockDay ?? 0);
        return leftProjected - rightProjected;
      })
      .slice(0, 5);
  }, [stockDay]);

  const reorderCount = stockDay.filter((item) => item.status === "Reorder soon").length;
  const normalCount = stockDay.filter((item) => item.status === "Normal").length;
  const overstockCount = stockDay.filter((item) => item.status === "Overstock / slow moving").length;
  const noSalesCount = stockDay.filter((item) => item.status === "No sales").length;
  const submittedOrders = orderRequests.filter((request) => request.status === "submitted").length;
  const totalPendingRequestedQty = stockDay.reduce(
    (sum, item) => sum + Number(item.pendingRequestedQty || 0),
    0,
  );
  const requestedProductsCount = stockDay.filter((item) => Number(item.pendingRequestedQty || 0) > 0).length;
  const latestRun = syncStatus?.latestRun;
  const totalPages = Math.max(1, Math.ceil(filteredStock.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedStock = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredStock.slice(startIndex, startIndex + pageSize);
  }, [filteredStock, pageSize, safeCurrentPage]);
  const isAdminUser = session?.user?.role === "admin";
  const isOnlineMarketingStaff =
    String(session?.user?.id || "").trim().toLowerCase() === ONLINE_MARKETING_STAFF_USER_ID;
  const navigationGroups = useMemo(
    () => getNavigationGroups(isAdminUser, isOnlineMarketingStaff),
    [isAdminUser, isOnlineMarketingStaff],
  );

  const focusNavItem = useCallback((groupId, direction) => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const items = Array.from(
        navigationMenuRef.current?.querySelectorAll(`[data-nav-group="${groupId}"] [data-nav-item]:not(:disabled)`) || [],
      );
      if (items.length === 0) return;
      const activeIndex = items.findIndex((item) => item === document.activeElement);
      let nextIndex = 0;
      if (direction === "last") {
        nextIndex = items.length - 1;
      } else if (direction === "next") {
        nextIndex = activeIndex >= 0 ? (activeIndex + 1) % items.length : 0;
      } else if (direction === "previous") {
        nextIndex = activeIndex >= 0 ? (activeIndex - 1 + items.length) % items.length : items.length - 1;
      }
      items[nextIndex]?.focus();
    });
  }, []);

  const closeNavGroup = useCallback((groupId = openNavGroup, { restoreFocus = false } = {}) => {
    if (!groupId) {
      setOpenNavGroup(null);
      return;
    }

    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const groupElement = navigationMenuRef.current?.querySelector(`[data-nav-group="${groupId}"]`);
    const triggerElement = navigationMenuRef.current?.querySelector(`[data-nav-trigger="${groupId}"]`);
    if (restoreFocus || (groupElement && activeElement instanceof HTMLElement && groupElement.contains(activeElement))) {
      triggerElement?.focus();
    }
    setOpenNavGroup(null);
  }, [openNavGroup]);

  const handleNavigate = useCallback((item) => {
    if (!item?.view || item.disabled) return;
    setView(item.view);
    closeNavGroup();
  }, [closeNavGroup]);

  const handleNavTriggerKeyDown = useCallback((event, group) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpenNavGroup(group.id);
      focusNavItem(group.id, "first");
    }
  }, [focusNavItem]);

  const handleNavItemKeyDown = useCallback((event, groupId) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNavGroup(groupId, { restoreFocus: true });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusNavItem(groupId, "next");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusNavItem(groupId, "previous");
    } else if (event.key === "Home") {
      event.preventDefault();
      focusNavItem(groupId, "first");
    } else if (event.key === "End") {
      event.preventDefault();
      focusNavItem(groupId, "last");
    }
  }, [closeNavGroup, focusNavItem]);

  const handleSyncUnauthorized = useCallback(() => {
    setSession(null);
    setAuthError("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
    setOpenNavGroup(null);
    setAccountMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!accountMenuOpen || typeof window === "undefined") return undefined;

    function handlePointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!openNavGroup || typeof window === "undefined") return undefined;

    function handlePointerDown(event) {
      if (!navigationMenuRef.current?.contains(event.target)) {
        closeNavGroup();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeNavGroup(openNavGroup, { restoreFocus: true });
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeNavGroup, openNavGroup]);

  useEffect(() => {
    if (!isAdminUser && adminOnlyViews.includes(view)) {
      setView("receipts");
    }
  }, [isAdminUser, view]);

  useEffect(() => {
    if (isOnlineMarketingStaff && view === "focus-products") {
      setView("receipts");
    }
  }, [isOnlineMarketingStaff, view]);

  if (loading && !session) {
    return (
      <div className="page auth-page">
        <div className="notice">กำลังตรวจสอบเซสชันผู้ดูแล...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        authError={authError}
        busy={authenticating}
        username={username}
        password={password}
        onUsernameChange={(event) => setUsername(event.target.value)}
        onPasswordChange={(event) => setPassword(event.target.value)}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            SC
          </div>
          <div className="brand-copy">
            <strong>SC Group 1989</strong>
            <span>ศูนย์ควบคุม Stock Day</span>
          </div>
        </div>

        <nav className="view-nav hero-nav" aria-label="เมนูหลัก" ref={navigationMenuRef}>
          {navigationGroups.map((group) => {
            const activeItem = group.items.find((item) => item.view === view);
            const isOpen = openNavGroup === group.id;
            const hasDropdown = group.items.length > 1 || group.items.some((item) => item.disabled);
            const groupBadgeCount = group.items.some((item) => item.view === "stock-requests")
              ? stockRequestBadgeCount
              : group.items.some((item) => item.view === "sync-log")
                ? syncFailureBadgeCount
                : group.items.some((item) => item.view === "preorder")
                  ? preorderBadgeCount
                  : 0;
            const groupHasNotif = groupBadgeCount > 0;
            const triggerClassName = [
              "view-nav-btn",
              "hero-nav-trigger",
              activeItem ? "active" : "",
              isOpen ? "open" : "",
            ].filter(Boolean).join(" ");

            if (!hasDropdown) {
              const item = group.items[0];
              return (
                <button
                  key={group.id}
                  type="button"
                  className={[
                    triggerClassName,
                    item.disabled ? "view-nav-btn-disabled" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={item.disabled}
                  aria-disabled={item.disabled}
                  onClick={() => handleNavigate(item)}
                >
                  <span className="hero-nav-mark" aria-hidden="true">{group.shortLabel}</span>
                  <span className="hero-nav-label">{group.label}</span>
                  {item.disabled ? <span className="view-nav-badge">เร็วๆนี้</span> : null}
                  {item.view === "preorder" && preorderBadgeCount > 0 ? <span className="nav-notif-badge nav-trigger-badge">{preorderBadgeCount > 99 ? "99+" : preorderBadgeCount}</span> : null}
                </button>
              );
            }

            return (
              <div
                key={group.id}
                className={isOpen ? "hero-nav-group open" : "hero-nav-group"}
                data-nav-group={group.id}
              >
                <button
                  type="button"
                  className={triggerClassName}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  data-nav-trigger={group.id}
                  onClick={() => {
                    if (isOpen) {
                      closeNavGroup(group.id, { restoreFocus: true });
                    } else {
                      setOpenNavGroup(group.id);
                    }
                  }}
                  onKeyDown={(event) => handleNavTriggerKeyDown(event, group)}
                >
                  <span className="hero-nav-mark" aria-hidden="true">{group.shortLabel}</span>
                  <span className="hero-nav-label">{group.label}</span>
                  <span className="hero-nav-chevron" aria-hidden="true">▾</span>
                  {groupHasNotif ? (
                    <span className="nav-notif-badge nav-trigger-badge">{groupBadgeCount > 99 ? "99+" : groupBadgeCount}</span>
                  ) : null}
                </button>
                <div
                  className="hero-nav-menu"
                  role="menu"
                  aria-label={group.label}
                  aria-hidden={!isOpen}
                  hidden={!isOpen}
                >
                  {group.items.map((item) => {
                    const isActive = item.view === view;
                    return (
                      <button
                        key={item.view || item.label}
                        type="button"
                        className={[
                          "hero-nav-item",
                          isActive ? "active" : "",
                          item.disabled ? "disabled" : "",
                        ].filter(Boolean).join(" ")}
                        role="menuitem"
                        disabled={item.disabled}
                        data-nav-item
                        onClick={() => handleNavigate(item)}
                        onKeyDown={(event) => handleNavItemKeyDown(event, group.id)}
                      >
                        <span className="hero-nav-item-main">
                          <span>{item.label}</span>
                          {item.disabled ? <span className="view-nav-badge">เร็วๆนี้</span> : null}
                          {item.view === "stock-requests" && stockRequestBadgeCount > 0 ? (
                            <span className="nav-notif-badge">{stockRequestBadgeCount > 99 ? "99+" : stockRequestBadgeCount}</span>
                          ) : null}
                          {item.view === "sync-log" && syncFailureBadgeCount > 0 ? (
                            <span className="nav-notif-badge">{syncFailureBadgeCount > 99 ? "99+" : syncFailureBadgeCount}</span>
                          ) : null}
                          {item.view === "preorder" && preorderBadgeCount > 0 ? (
                            <span className="nav-notif-badge">{preorderBadgeCount > 99 ? "99+" : preorderBadgeCount}</span>
                          ) : null}
                        </span>
                        <span className="hero-nav-item-desc">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="account-actions">
          {(!branchCode && session?.user?.role !== "admin") ? <div className="branch-context-card">
            <span className="branch-context-label">สาขาที่ใช้งาน</span>
            {canSelectBranchContext ? (
              <div className="branch-context-controls">
                <select
                  value={selectedBranchContext}
                  onChange={(event) => {
                    setSelectedBranchContext(event.target.value);
                    if (event.target.value) {
                      handleApplyBranchContext(event.target.value);
                    }
                  }}
                  disabled={branchContextBusy}
                  aria-label="เลือกสาขาที่ใช้งาน"
                >
                  <option value="">เลือกสาขา</option>
                  {branchOptions
                    .filter((branch) => {
                      const allowed = session?.permissions?.allowed_branch_codes;
                      return !allowed || allowed.includes(branch.branchCode);
                    })
                    .map((branch) => (
                      <option key={branch.branchCode} value={branch.branchCode}>
                        {formatBranchContextLabel(branch.branchCode, branch.branchName)}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="ghost-button branch-context-apply-button"
                  onClick={() => handleApplyBranchContext(selectedBranchContext)}
                  disabled={branchContextBusy || selectedBranchContext === (branchCode || "")}
                >
                  {branchContextBusy ? "กำลังบันทึก..." : "ใช้สาขานี้"}
                </button>
              </div>
            ) : (
              <strong>{formatBranchContextLabel(branchCode, activeBranchName)}</strong>
            )}
            {branchCode ? (
              <span className="branch-context-current">
                ใช้งานอยู่: {formatBranchContextLabel(branchCode, activeBranchName)}
              </span>
            ) : (
              <span className="branch-context-current warning">ยังไม่ได้ตั้ง branch context</span>
            )}
          </div> : null}
          <button
            type="button"
            className="ghost-button theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
          >
            <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
            <span>{theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}</span>
          </button>
          <div className="account-menu" ref={accountMenuRef}>
            <button
              type="button"
              className={accountMenuOpen ? "account-chip account-chip-open" : "account-chip"}
              onClick={() => setAccountMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label="เปิดเมนูบัญชีผู้ใช้"
            >
              <span className="account-avatar" aria-hidden="true">
                {String(session.user.id || "SC").slice(0, 2).toUpperCase()}
              </span>
              <span className="account-copy">
                <strong>{session.user.id}</strong>
                <span>{session.user.role}</span>
              </span>
              <span className="account-chevron" aria-hidden="true">
                ▾
              </span>
            </button>
            {accountMenuOpen ? (
              <div className="account-menu-panel" role="menu" aria-label="เมนูบัญชีผู้ใช้">
                <button
                  type="button"
                  className="primary-button logout-button"
                  onClick={handleLogout}
                  role="menuitem"
                >
                  ออกจากระบบ
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {branchContextError && <div className="notice warning">{branchContextError}</div>}

      {view === "receipts" ? (
        <PurchaseReceiptsPanel
          branchCode={branchCode}
          canViewPrices={session.user.role === "admin"}
          canEditLogos={isAdminUser}
          csrfToken={session.csrfToken}
        />
      ) : view === "branch-stock" ? (
        <BranchStockPanel
          csrfToken={session.csrfToken}
          isAdminUser={isAdminUser}
          userId={session.user.id}
          isOnlineMarketingStaff={isOnlineMarketingStaff}
          branchCode={branchCode}
          branchName={activeBranchName}
          onNavigate={() => setView("stock-requests")}
          requestDraftItems={requestDraftItems}
          setRequestDraftItems={setRequestDraftItems}
          onClearDraft={handleClearDraft}
        />
      ) : view === "branch-stock-history" ? (
        <BranchStockHistoryPanel />
      ) : view === "stock-recommendations" ? (
        <StockRecommendationsPanel
          branchCode={branchCode}
          isAdminUser={isAdminUser}
        />
      ) : view === "stock-requests" ? (
        <StockRequestsPanel
          branchCode={branchCode}
          isAdmin={isAdminUser}
          csrfToken={session.csrfToken}
          requestDraftItems={requestDraftItems}
          setRequestDraftItems={setRequestDraftItems}
          requestBatchNote={requestBatchNote}
          setRequestBatchNote={setRequestBatchNote}
          onSubmitDraft={handleSubmitDraft}
          onClearDraft={handleClearDraft}
          draftHydrating={draftHydrating}
          draftSaveStatus={draftSaveStatus}
          incomingNotifCount={incomingRequestBadgeCount}
          onIncomingNotificationsChanged={refreshIncomingRequestBadgeCount}
        />
      ) : view === "movement-trace" ? (
        <MovementAndTransactionsPanel branchCode={branchCode} csrfToken={session.csrfToken} />
      ) : view === "focus-products" ? (
        <FocusProductsPanel csrfToken={session.csrfToken} isAdminUser={isAdminUser} branchCode={branchCode} onNavigateBack={() => setView("branch-stock")} />
      ) : view === stockCostAuditView && isAdminUser ? (
        <StockCostAuditPanel branchCode={branchCode} />
      ) : view === "category-review" && isAdminUser ? (
        <ReviewQueuePanel csrfToken={session.csrfToken} />
      ) : view === "ingredient-dictionary" && isAdminUser ? (
        <IngredientDictionaryPanel csrfToken={session.csrfToken} />
      ) : view === taxonomyView && isAdminUser ? (
        <ProductTaxonomyPanel csrfToken={session.csrfToken} />
      ) : view === taxonomyReviewView && isAdminUser ? (
        <TaxonomyReviewPanel csrfToken={session.csrfToken} />
      ) : view === "sync-log" && isAdminUser ? (
        <SyncLogPanel onUnauthorized={handleSyncUnauthorized} />
      ) : view === "preorder" ? (
        <PreorderPanel enabled={customerPreordersEnabled} csrfToken={session.csrfToken} isAdmin={isAdminUser} branchCode={branchCode} apiBaseUrl={apiBaseUrl} onBadgeChanged={refreshPreorderBadgeCount} />
      ) : (
        <>
          <section className="kpis">
            <article className="kpi">
              <span>ควรสั่งซื้อเพิ่ม</span>
              <strong>{formatNumber(reorderCount)}</strong>
            </article>
            <article className="kpi">
              <span>สต็อกปกติ</span>
              <strong>{formatNumber(normalCount)}</strong>
            </article>
            <article className="kpi">
              <span>ค้างสต็อก</span>
              <strong>{formatNumber(overstockCount)}</strong>
            </article>
            <article className="kpi">
              <span>ไม่มีข้อมูลขาย</span>
              <strong>{formatNumber(noSalesCount)}</strong>
            </article>
            <article className="kpi">
              <span>คำขอจากสาขา</span>
              <strong>{formatNumber(submittedOrders)}</strong>
            </article>
            <article className="kpi">
              <span>จำนวนที่สาขาขอรวม</span>
              <strong>{formatNumber(totalPendingRequestedQty)}</strong>
            </article>
            <article className="kpi">
              <span>สินค้าที่ถูกขอ</span>
              <strong>{formatNumber(requestedProductsCount)}</strong>
            </article>
          </section>

          <section className="dashboard-grid">
            <section className="panel spotlight">
              <div className="panel-header stacked">
                <div>
                  <h2>สินค้าที่ต้องดูทันที</h2>
                  <p>รายการที่มีความเสี่ยงด้าน stock day มากที่สุดในตอนนี้</p>
                </div>
              </div>

              <div className="spotlight-list">
                {riskItems.map((item) => (
                  <article className="spotlight-card" key={item.productCode}>
                    <div>
                      <strong>{item.productName}</strong>
                      <p className="meta-line">
                        {item.productCode} · {item.supplier || "ไม่มีผู้จำหน่าย"}
                      </p>
                    </div>
                    <div className="spotlight-metrics">
                      <span>{formatNumber(item.projectedStockDay ?? item.stockDay, 1)} วัน</span>
                      <span className={`status ${statusClass(item.status)}`}>
                        {translateStatus(item.status)}
                      </span>
                    </div>
                  </article>
                ))}
                {!riskItems.length && (
                  <p className="empty-state">ตอนนี้ยังไม่มีสินค้าที่ต้องเร่งจัดการ</p>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header stacked">
                <div>
                  <h2>คำขอจากสาขาล่าสุด</h2>
                  <p>ดูปริมาณและเวลาในการส่งคำขอ ก่อนวางแผนโอนหรือจัดซื้อ</p>
                </div>
              </div>

              <div className="request-list">
                {orderRequests.map((request) => (
                  <article className="request-card" key={request.id}>
                    <div>
                      <strong>{request.branchName}</strong>
                      <p className="meta-line">{request.id}</p>
                      <p className="meta-line">{formatDateTime(request.requestedAt)}</p>
                    </div>
                    <div className="request-side">
                      <p>{request.items.length} รายการ</p>
                      <span
                        className={`status ${request.status === "submitted" ? "warning" : "good"}`}
                      >
                        {translateStatus(request.status || "submitted")}
                      </span>
                    </div>
                  </article>
                ))}
                {!orderRequests.length && (
                  <p className="empty-state">ยังไม่มีคำขอสั่งสินค้าจากสาขา</p>
                )}
              </div>
            </section>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>ตาราง Stock Day</h2>
                <p>ภาพรวมสุขภาพสต็อกของสินค้าทั้งหมดในช่วงเวลาที่กำลังดู</p>
              </div>

              <div className="toolbar">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาชื่อสินค้า รหัสสินค้า หรือผู้จำหน่าย"
                />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">ทุกสถานะ</option>
                  <option value="Reorder soon">ควรสั่งซื้อเพิ่ม</option>
                  <option value="Normal">ปกติ</option>
                  <option value="Overstock / slow moving">ค้างสต็อก / เคลื่อนไหวช้า</option>
                  <option value="No sales">ยังไม่มีการขาย</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className="empty-state">กำลังโหลดข้อมูลแดชบอร์ด...</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th>คงเหลือปัจจุบัน</th>
                      <th>ขายสะสม</th>
                      <th>เฉลี่ยต่อวัน</th>
                      <th>Stock Day</th>
                      <th>สาขาขอรวม</th>
                      <th>คงเหลือหลังหักคำขอ</th>
                      <th>Projected Day</th>
                      <th>ซื้อเข้า</th>
                      <th>Min</th>
                      <th>Max</th>
                      <th>Lead Time</th>
                      <th>ผู้จำหน่าย</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStock.map((row) => (
                      <tr key={row.productCode}>
                        <td>
                          <strong>{row.productName}</strong>
                          <div className="meta">{row.productCode}</div>
                        </td>
                        {/* LEGACY/APPROXIMATE: global product-master stock for the
                            all-products overview, not branch-level. Real per-branch
                            stock is on the "สต็อกสาขา" page (/api/branch-stock). */}
                        <td>{formatNumber(row.currentStock)}</td>
                        <td>{formatNumber(row.soldQtyPeriod)}</td>
                        <td>{formatNumber(row.averageDailyUsage, 2)}</td>
                        <td>{formatNumber(row.stockDay, 1)}</td>
                        <td>{formatNumber(row.pendingRequestedQty)}</td>
                        <td>{formatNumber(row.projectedStockAfterRequests)}</td>
                        <td>{formatNumber(row.projectedStockDay, 1)}</td>
                        <td>{formatNumber(row.purchasedQtyPeriod)}</td>
                        <td>{formatNumber(row.minStock)}</td>
                        <td>{formatNumber(row.maxStock)}</td>
                        <td>{formatNumber(row.leadTimeDays, 1)}</td>
                        <td>{row.supplier || "-"}</td>
                        <td>
                          <span className={`status ${statusClass(row.status)}`}>
                            {translateStatus(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredStock.length > 0 && (
                  <div className="pagination">
                    <p className="pagination-info">
                      หน้า {formatNumber(safeCurrentPage)} / {formatNumber(totalPages)} · แสดง{" "}
                      {formatNumber(pagedStock.length)} จาก {formatNumber(filteredStock.length)} รายการ
                    </p>
                    <div className="pagination-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={safeCurrentPage === 1}
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={safeCurrentPage === totalPages}
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                )}

                {!filteredStock.length && (
                  <p className="empty-state">ไม่พบสินค้าที่ตรงกับตัวกรองปัจจุบัน</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
