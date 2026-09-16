import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MovementAndTransactionsPanel from "./MovementTransactionsPanel";
import FocusProductsPanel from "./FocusProductsPanel";
import BranchStockHistoryPanel from "./BranchStockHistoryPanel";
import StockRecommendationsPanel from "./StockRecommendationsPanel";
import { BranchStockPanel } from "./BranchStockPanel.jsx";
import { IncomingRequestsTab, MyRequestsTab, StockRequestsPanel } from "./StockRequestsPanel.jsx";
import ProductTaxonomyPanel from "./ProductTaxonomyPanel";
import TaxonomyReviewPanel from "./TaxonomyReviewPanel";
import SyncLogPanel from "./SyncLogPanel.jsx";
import StockCostAuditPanel from "./StockCostAuditPanel.jsx";
import ReviewQueuePanel from "./ReviewQueuePanel.jsx";
import IngredientDictionaryPanel from "./IngredientDictionaryPanel.jsx";
import PreorderPanel from "./preorders/PreorderPanel";
import LoginScreen from "./LoginScreen.jsx";
import AdminNavigation from "./AdminNavigation.jsx";
import AdminAccountActions from "./AdminAccountActions.jsx";
import useAdminView from "./useAdminView.js";
import useAdminNavigationMenu from "./useAdminNavigationMenu.js";
import {
  adminOnlyViews,
  getNavigationGroups,
  stockCostAuditView,
  taxonomyReviewView,
  taxonomyView,
} from "./adminNavigation.js";
export { BranchStockPanel } from "./BranchStockPanel.jsx";
export { IncomingRequestsTab, MyRequestsTab, StockRequestsPanel } from "./StockRequestsPanel.jsx";
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

import woothiLogoUrl from "./assets/woothi-logo.svg";
import orexTradingLogoUrl from "./assets/orex-trading-logo.svg";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const customerPreordersEnabled = String(import.meta.env.VITE_FEATURE_CUSTOMER_PREORDERS || "").toLowerCase() === "true";
const adminThemeStorageKey = "sc-stockday-admin-theme";
const ONLINE_MARKETING_STAFF_USER_ID = "onlinemarketingstaff";
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


function countPendingIncomingRequests(records) {
  const list = Array.isArray(records) ? records : [];
  return list.filter((record) => record?.status === "SUBMITTED" && !record?.responseResult).length;
}



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
  const [view, setView] = useAdminView();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const {
    openNavGroup,
    setOpenNavGroup,
    navigationMenuRef,
    closeNavGroup,
    handleNavigate,
    handleNavTriggerKeyDown,
    handleNavItemKeyDown,
  } = useAdminNavigationMenu(setView);
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

        <AdminNavigation
          navigationGroups={navigationGroups}
          view={view}
          openNavGroup={openNavGroup}
          navigationMenuRef={navigationMenuRef}
          stockRequestBadgeCount={stockRequestBadgeCount}
          syncFailureBadgeCount={syncFailureBadgeCount}
          preorderBadgeCount={preorderBadgeCount}
          handleNavigate={handleNavigate}
          closeNavGroup={closeNavGroup}
          setOpenNavGroup={setOpenNavGroup}
          handleNavTriggerKeyDown={handleNavTriggerKeyDown}
          handleNavItemKeyDown={handleNavItemKeyDown}
        />

        <AdminAccountActions
          session={session}
          branchCode={branchCode}
          activeBranchName={activeBranchName}
          canSelectBranchContext={canSelectBranchContext}
          branchOptions={branchOptions}
          selectedBranchContext={selectedBranchContext}
          setSelectedBranchContext={setSelectedBranchContext}
          branchContextBusy={branchContextBusy}
          handleApplyBranchContext={handleApplyBranchContext}
          theme={theme}
          setTheme={setTheme}
          accountMenuRef={accountMenuRef}
          accountMenuOpen={accountMenuOpen}
          setAccountMenuOpen={setAccountMenuOpen}
          handleLogout={handleLogout}
        />
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
