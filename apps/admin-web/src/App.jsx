import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const syncEventLogEnabled = String(import.meta.env.VITE_ENABLE_SYNC_EVENT_LOG || "").toLowerCase() === "true";
const adminViewStorageKey = "sc-stockday-admin-view";
const adminThemeStorageKey = "sc-stockday-admin-theme";
const defaultAdminView = "receipts";
const stockCostAuditView = "stock-cost-audit";
const adminOnlyViews = [stockCostAuditView, "category-review", "ingredient-dictionary", "sync-log"];
const adminViewKeys = [defaultAdminView, "branch-stock", "movement-trace", "stock-requests", ...adminOnlyViews];

function getNavigationGroups(isAdminUser) {
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      shortLabel: "DB",
      items: [
        { label: "Dashboard", description: "ภาพรวม Stock Day และคำขอจากสาขา", disabled: true },
      ],
    },
    {
      id: "product-data",
      label: "ข้อมูลสินค้า",
      shortLabel: "PR",
      items: [
        { label: "ใบรับสินค้า", view: "receipts", description: "ตรวจใบรับสินค้าและโลโก้ Supplier" },
        { label: "สต็อกสาขา", view: "branch-stock", description: "สถานะสต็อกแยกตามสาขา" },
        { label: "คำขอสินค้า", view: "stock-requests", description: "ส่งและติดตามคำขอสินค้าระหว่างสาขา" },
        { label: "Movement", view: "movement-trace", description: "ติดตาม movement รายสินค้า" },
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
        { label: "ประวัติ Sync", view: "sync-log", description: "สถานะและประวัติการ sync ข้อมูล" },
        { label: "Ingredient Mapping", description: "supervision workflow ระยะถัดไป", disabled: true },
        { label: "Product Master", description: "ทะเบียนสินค้ากลาง", disabled: true },
      ],
    },
  ].filter((group) => !group.adminOnly || isAdminUser);
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

function translateCategoryReviewStatus(status) {
  if (status === "confirmed") return "ยืนยันแล้ว";
  if (status === "imported_exact_match") return "นำเข้าจาก exact code";
  if (status === "proposed") return "รอตรวจ";
  if (status === "needs_review") return "ต้องทบทวน";
  if (status === "reverify") return "ต้องตรวจซ้ำ";
  return status || "-";
}

function categoryStatusClass(status) {
  if (status === "confirmed" || status === "imported_exact_match") return "good";
  if (status === "proposed") return "warning";
  if (status === "reverify") return "danger";
  return "muted";
}

function getCategoryGroupStyle(category) {
  const label = String(category || "").trim();
  if (!label) return undefined;

  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = ((hash << 5) - hash) + label.charCodeAt(index);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return {
    "--category-group-bg": `hsla(${hue}, 68%, 56%, 0.12)`,
    "--category-group-border": `hsla(${hue}, 58%, 45%, 0.24)`,
  };
}

function compactFileName(value) {
  if (!value) return "-";
  const parts = String(value).split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

const BRANCH_STOCK_COLUMNS = [
  { key: "productCode", label: "รหัสสินค้า", type: "text" },
  { key: "productNameThai", label: "ชื่อสินค้าไทย", type: "text" },
  { key: "productNameEng", label: "ชื่ออังกฤษ", type: "text" },
  { key: "barcode", label: "Barcode", type: "text" },
  { key: "unit", label: "หน่วย", type: "text" },
  { key: "category", label: "หมวดหมู่", type: "text" },
  { key: "categoryStatus", label: "สถานะหมวดหมู่", type: "text" },
  { key: "qtyBranch000", label: "สาขา 000", type: "number" },
  { key: "qtyBranch001", label: "สาขา 001", type: "number" },
  { key: "qtyBranch003", label: "สาขา 003", type: "number" },
  { key: "qtyBranch004", label: "สาขา 004", type: "number" },
  { key: "qtyBranch005", label: "สาขา 005", type: "number" },
  { key: "qtyTotalAllBranches", label: "รวมทุกสาขา", type: "number" },
  { key: "syncedAt", label: "synced_at", type: "date" },
];

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

function getBranchStockQty(row, branchCode) {
  return Number(row?.[`qtyBranch${branchCode}`] || 0);
}

function formatBranchContextLabel(branchCode, branchName = "") {
  if (!branchCode) return branchName || "ยังไม่ได้เลือกสาขา";
  return branchName ? `${branchCode} - ${branchName}` : `สาขา ${branchCode}`;
}

function buildRequestDraftLineKey({ productCode, sourceBranchCode, unit }) {
  return [productCode, sourceBranchCode, unit || ""].join("::");
}

function normalizeRequestedQty(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(numericValue));
}

function mergeRequestDraftItems(currentItems = [], addedItems = []) {
  const merged = new Map();

  currentItems.forEach((item) => {
    merged.set(item.lineKey, item);
  });

  addedItems.forEach((item) => {
    const lineKey = buildRequestDraftLineKey(item);
    const normalized = {
      ...item,
      lineKey,
      requestedQty: normalizeRequestedQty(item.requestedQty),
      lineNote: String(item.lineNote || "").trim(),
      snapshotQty: Number(item.snapshotQty || 0),
      snapshotSyncedAt: item.snapshotSyncedAt || null,
    };
    const existing = merged.get(lineKey);
    if (!existing) {
      merged.set(lineKey, normalized);
      return;
    }
    merged.set(lineKey, {
      ...existing,
      requestedQty: existing.requestedQty + normalized.requestedQty,
      snapshotQty: Math.max(existing.snapshotQty || 0, normalized.snapshotQty || 0),
      snapshotSyncedAt: normalized.snapshotSyncedAt || existing.snapshotSyncedAt,
      lineNote: normalized.lineNote || existing.lineNote,
    });
  });

  return Array.from(merged.values()).sort((left, right) =>
    `${left.sourceBranchCode}-${left.productCode}`.localeCompare(
      `${right.sourceBranchCode}-${right.productCode}`,
      "th",
      { numeric: true, sensitivity: "base" },
    ),
  );
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
        lines: [],
      });
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

function normalizeFilterValue(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeCategorySearchValue(value) {
  return normalizeFilterValue(value).toLowerCase();
}

function getBranchStockColumnValue(row, key) {
  if (key === "categoryStatus") {
    return translateCategoryReviewStatus(row.categoryStatus || "needs_review");
  }
  if (key === "syncedAt") {
    return row.syncedAt || "";
  }
  if (key === "category") {
    return row.category || "";
  }
  return row[key] ?? "";
}

function compareBranchStockValues(leftValue, rightValue, type, direction) {
  const order = direction === "desc" ? -1 : 1;

  if (type === "number") {
    const leftNumber = Number(leftValue || 0);
    const rightNumber = Number(rightValue || 0);
    if (leftNumber === rightNumber) return 0;
    return leftNumber > rightNumber ? order : -order;
  }

  if (type === "date") {
    const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
    const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
    if (leftTime === rightTime) return 0;
    return leftTime > rightTime ? order : -order;
  }

  const leftText = normalizeFilterValue(leftValue);
  const rightText = normalizeFilterValue(rightValue);
  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;
  return leftText.localeCompare(rightText, "th", { numeric: true, sensitivity: "base" }) * order;
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

function parsePastedProductCodes(value) {
  const seen = new Set();
  const duplicates = [];
  const skipped = [];
  const productCodes = [];

  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((code) => {
      if (!code || code.toUpperCase() === "#N/A") {
        if (code) skipped.push(code);
        return;
      }
      if (seen.has(code)) {
        duplicates.push(code);
        return;
      }
      seen.add(code);
      productCodes.push(code);
    });

  return { productCodes, duplicates, skipped };
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

function formatBranchOptionLabel(branch) {
  const code = String(branch?.branchCode || "").trim();
  const name = String(branch?.branchName || "").trim();
  if (!code) return name || "-";
  if (!name || name === code) return `สาขา ${code}`;
  return `${code} - ${name}`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function ProductMovementTracePanel({ branchCode, csrfToken }) {
  const [pasteText, setPasteText] = useState("");
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState({ categories: [], brands: [], branches: [] });
  const [groups, setGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(branchCode || "005");
  const [dateFrom, setDateFrom] = useState(daysAgoIsoDate(30));
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [movementTypes, setMovementTypes] = useState(["transfer_in", "transfer_out", "supplier_receipt", "sales_summary"]);
  const [result, setResult] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const pasteStats = useMemo(() => parsePastedProductCodes(pasteText), [pasteText]);

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      try {
        const [optionsResponse, groupsResponse] = await Promise.all([
          apiFetch("/api/admin/product-movement-options"),
          apiFetch("/api/admin/product-movement-groups"),
        ]);
        if (!optionsResponse.ok || !groupsResponse.ok) throw new Error("โหลดตัวเลือกการสืบค้นไม่สำเร็จ");
        const [optionsData, groupsData] = await Promise.all([optionsResponse.json(), groupsResponse.json()]);
        if (!active) return;
        setOptions(optionsData);
        setGroups(groupsData.groups || []);
      } catch (loadError) {
        if (active) setError(loadError.message || "โหลดตัวเลือกการสืบค้นไม่สำเร็จ");
      }
    }
    loadOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await apiFetch(`/api/products/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (!response.ok) throw new Error("ค้นหาสินค้าไม่สำเร็จ");
        const data = await response.json();
        if (active) setSearchResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch (_error) {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 260);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  function mergeCodes(codes) {
    setSelectedCodes((current) => {
      const seen = new Set(current);
      const next = [...current];
      codes.forEach((code) => {
        if (!seen.has(code)) {
          seen.add(code);
          next.push(code);
        }
      });
      return next;
    });
  }

  function applyPasteList() {
    mergeCodes(pasteStats.productCodes);
  }

  function removeCode(code) {
    setSelectedCodes((current) => current.filter((item) => item !== code));
  }

  function toggleArrayValue(setter, value) {
    setter((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
  }

  async function runTrace() {
    setLoadingTrace(true);
    setError("");
    try {
      const response = await apiFetch("/api/admin/product-movement-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_codes: selectedCodes,
          saved_group_ids: selectedGroupIds,
          category_names: selectedCategories,
          brand_names: selectedBrands,
          branch_code: selectedBranch,
          date_from: dateFrom,
          date_to: dateTo,
          movement_types: movementTypes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "สืบค้นการเคลื่อนไหวไม่สำเร็จ");
      setResult(data);
      setExpanded({});
    } catch (traceError) {
      setError(traceError.message || "สืบค้นการเคลื่อนไหวไม่สำเร็จ");
    } finally {
      setLoadingTrace(false);
    }
  }

  async function saveCurrentGroup() {
    setSavingGroup(true);
    setError("");
    try {
      const path = editingGroupId
        ? `/api/admin/product-movement-groups/${editingGroupId}`
        : "/api/admin/product-movement-groups";
      const response = await apiFetch(path, {
        method: editingGroupId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          product_codes: selectedCodes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "บันทึกกลุ่มไม่สำเร็จ");
      const groupsResponse = await apiFetch("/api/admin/product-movement-groups");
      const groupsData = await groupsResponse.json();
      setGroups(groupsData.groups || []);
      setGroupName("");
      setGroupDescription("");
      setEditingGroupId("");
    } catch (saveError) {
      setError(saveError.message || "บันทึกกลุ่มไม่สำเร็จ");
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteEditingGroup() {
    if (!editingGroupId) return;
    setSavingGroup(true);
    setError("");
    try {
      const response = await apiFetch(`/api/admin/product-movement-groups/${editingGroupId}`, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": csrfToken || "",
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "ลบกลุ่มไม่สำเร็จ");
      const groupsResponse = await apiFetch("/api/admin/product-movement-groups");
      const groupsData = await groupsResponse.json();
      setGroups(groupsData.groups || []);
      setSelectedGroupIds((current) => current.filter((id) => String(id) !== String(editingGroupId)));
      setEditingGroupId("");
      setGroupName("");
      setGroupDescription("");
    } catch (deleteError) {
      setError(deleteError.message || "ลบกลุ่มไม่สำเร็จ");
    } finally {
      setSavingGroup(false);
    }
  }

  const products = result?.products || [];
  const totalSummary = products.reduce((summary, product) => {
    summary.transferIn += Number(product.summary?.transfer_in_qty || 0);
    summary.transferOut += Number(product.summary?.transfer_out_qty || 0);
    summary.supplierReceipt += Number(product.summary?.supplier_receipt_qty || 0);
    summary.sold += Number(product.summary?.sold_qty_base || 0);
    summary.net += Number(product.summary?.net_movement_qty || 0);
    return summary;
  }, { transferIn: 0, transferOut: 0, supplierReceipt: 0, sold: 0, net: 0 });

  return (
    <section className="panel movement-panel">
      <div className="panel-header stacked">
        <div>
          <p className="eyebrow">Product Movement Trace</p>
          <h2>สืบค้นการเคลื่อนไหวสินค้า</h2>
          <p>ดูรับเข้า โอนออก ซื้อ Supplier และยอดขายรวมตามช่วงเวลาในหน้าเดียว</p>
        </div>
      </div>

      <div className="notice movement-warning">
        ยอดขายเป็นข้อมูลสรุปรวมตามช่วง ไม่ใช่รายบิล จึงไม่สามารถบอกวันที่ขายจริงต่อ transaction ได้ในหน้านี้
      </div>

      <div className="movement-layout">
        <section className="movement-controls">
          <div className="movement-control-block">
            <label>
              Paste รหัสสินค้า จาก Excel คอลัมน์เดียว
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                rows={7}
                placeholder={"IC-002833\nIC-000193\n#N/A\nIC-003501"}
              />
            </label>
            <div className="movement-inline-actions">
              <button type="button" className="primary-button" onClick={applyPasteList}>
                เพิ่มจาก Paste
              </button>
              <span className="meta-line">
                {pasteStats.productCodes.length} รายการ
                {pasteStats.duplicates.length ? ` · ซ้ำ ${pasteStats.duplicates.length}` : ""}
              </span>
            </div>
          </div>

          <div className="movement-control-block">
            <label>
              Search-add สินค้า
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ค้นรหัสสินค้า ชื่อสินค้า หรือ barcode"
              />
            </label>
            <div className="movement-search-results">
              {searching ? <p className="meta-line">กำลังค้นหา...</p> : null}
              {searchResults.map((item) => (
                <button
                  key={item.productCode}
                  type="button"
                  className="movement-search-item"
                  onClick={() => mergeCodes([item.productCode])}
                >
                  <strong>{item.productCode}</strong>
                  <span>{item.productName}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="movement-control-block">
            <label>
              Saved Groups
              <select
                value=""
                onChange={(event) => {
                  const id = Number(event.target.value);
                  if (id) toggleArrayValue(setSelectedGroupIds, id);
                }}
              >
                <option value="">เลือกกลุ่มสินค้า</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.productCodes.length})
                  </option>
                ))}
              </select>
            </label>
            <div className="movement-chip-list">
              {selectedGroupIds.map((id) => {
                const group = groups.find((item) => item.id === id);
                return (
                  <button key={id} type="button" className="movement-chip" onClick={() => toggleArrayValue(setSelectedGroupIds, id)}>
                    {group?.name || id} ×
                  </button>
                );
              })}
            </div>
          </div>

          <div className="movement-control-block">
            <label>
              แก้ไขกลุ่มเดิม หรือสร้างกลุ่มใหม่
              <select
                value={editingGroupId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setEditingGroupId(nextId);
                  const group = groups.find((item) => String(item.id) === String(nextId));
                  if (group) {
                    setGroupName(group.name);
                    setGroupDescription(group.description || "");
                    setSelectedCodes(group.productCodes || []);
                  } else {
                    setGroupName("");
                    setGroupDescription("");
                  }
                }}
              >
                <option value="">สร้างกลุ่มใหม่</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="ชื่อกลุ่ม เช่น ยาความดัน" />
            <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="คำอธิบาย optional" />
            <div className="movement-inline-actions">
              <button type="button" className="ghost-button" disabled={savingGroup || !groupName.trim() || selectedCodes.length === 0} onClick={saveCurrentGroup}>
                {savingGroup ? "กำลังบันทึก..." : editingGroupId ? "Update Group" : "Save Group"}
              </button>
              {editingGroupId ? (
                <button type="button" className="ghost-button" disabled={savingGroup} onClick={deleteEditingGroup}>
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="movement-main">
          <div className="movement-filter-grid">
            <label>
              สาขา
              <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
                <option value="">ทุกสาขา</option>
                {(options.branches || []).map((branch) => (
                  <option key={branch.branchCode} value={branch.branchCode}>
                    {formatBranchOptionLabel(branch)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              จากวันที่
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              ถึงวันที่
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
          </div>

          <div className="movement-filter-grid">
            <label>
              Category
              <select value="" onChange={(event) => event.target.value && toggleArrayValue(setSelectedCategories, event.target.value)}>
                <option value="">เลือกหมวดสินค้า</option>
                {(options.categories || []).map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name} ({category.productCount})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Brand / Supplier Code
              <select value="" onChange={(event) => event.target.value && toggleArrayValue(setSelectedBrands, event.target.value)}>
                <option value="">เลือก brand/supplier</option>
                {(options.brands || []).map((brand) => (
                  <option key={brand.name} value={brand.name}>
                    {brand.name} ({brand.productCount})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="movement-chip-list">
            {selectedCodes.map((code) => (
              <button key={code} type="button" className="movement-chip" onClick={() => removeCode(code)}>
                {code} ×
              </button>
            ))}
            {selectedCategories.map((name) => (
              <button key={name} type="button" className="movement-chip movement-chip-category" onClick={() => toggleArrayValue(setSelectedCategories, name)}>
                {name} ×
              </button>
            ))}
            {selectedBrands.map((name) => (
              <button key={name} type="button" className="movement-chip movement-chip-brand" onClick={() => toggleArrayValue(setSelectedBrands, name)}>
                {name} ×
              </button>
            ))}
          </div>

          <div className="movement-type-row">
            {["transfer_in", "transfer_out", "supplier_receipt", "sales_summary"].map((type) => (
              <label key={type} className="movement-checkbox">
                <input
                  type="checkbox"
                  checked={movementTypes.includes(type)}
                  onChange={() => toggleArrayValue(setMovementTypes, type)}
                />
                {movementTypeLabel(type)}
              </label>
            ))}
          </div>

          <div className="movement-actions">
            <button type="button" className="primary-button" onClick={runTrace} disabled={loadingTrace || movementTypes.length === 0}>
              {loadingTrace ? "กำลังสืบค้น..." : "สืบค้นข้อมูล"}
            </button>
            <span className="meta-line">เลือกสินค้า {selectedCodes.length} รายการ · groups {selectedGroupIds.length}</span>
          </div>

          {error ? <div className="notice error compact">{error}</div> : null}

          {result ? (
            <>
              <section className="kpis movement-kpis">
                <article className="kpi"><span>รับโอนเข้า</span><strong>{formatNumber(totalSummary.transferIn)}</strong></article>
                <article className="kpi"><span>โอนออก</span><strong>{formatNumber(totalSummary.transferOut)}</strong></article>
                <article className="kpi"><span>ซื้อ Supplier</span><strong>{formatNumber(totalSummary.supplierReceipt)}</strong></article>
                <article className="kpi"><span>ขายรวม</span><strong>{formatNumber(totalSummary.sold)}</strong></article>
                <article className="kpi"><span>Net movement</span><strong>{formatNumber(totalSummary.net)}</strong></article>
              </section>

              {(result.warnings || []).map((warning) => (
                <div key={warning} className="notice movement-warning">{warning}</div>
              ))}

              <div className="table-wrap movement-table-wrap">
                <table className="movement-table">
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th>รับโอนเข้า</th>
                      <th>โอนออก</th>
                      <th>ซื้อ Supplier</th>
                      <th>ขายรวม</th>
                      <th>Net</th>
                      <th>ล่าสุด</th>
                      <th>รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <Fragment key={product.product_code}>
                        <tr>
                          <td>
                            <strong>{product.product_name}</strong>
                            <div className="meta">{product.product_code} · {product.barcode || "ไม่มี barcode"}</div>
                          </td>
                          <td>{formatNumber(product.summary.transfer_in_qty)}</td>
                          <td>{formatNumber(product.summary.transfer_out_qty)}</td>
                          <td>{formatNumber(product.summary.supplier_receipt_qty)}</td>
                          <td>{formatNumber(product.summary.sold_qty_base)}</td>
                          <td>{formatNumber(product.summary.net_movement_qty)}</td>
                          <td>{product.last_movement_date || "-"}</td>
                          <td>
                            <button
                              type="button"
                              className="ghost-button movement-expand-button"
                              onClick={() => setExpanded((current) => ({ ...current, [product.product_code]: !current[product.product_code] }))}
                            >
                              {expanded[product.product_code] ? "ซ่อน" : "ดู timeline"}
                            </button>
                          </td>
                        </tr>
                        {expanded[product.product_code] ? (
                          <tr key={`${product.product_code}-detail`} className="movement-detail-row">
                            <td colSpan={8}>
                              <div className="movement-detail-grid">
                                {[...(product.movements || []), ...(product.sales_summary || []).map((item) => ({
                                  date: `${item.date_from} ถึง ${item.date_to}`,
                                  type: "sales_summary",
                                  from_branch: item.branch_code,
                                  to_branch: "Customer",
                                  document_no: "summary",
                                  qty: item.sold_qty_base,
                                  unit_cost: null,
                                }))].map((movement, index) => (
                                  <div className="movement-event" key={`${movement.type}-${movement.document_no}-${index}`}>
                                    <span className={`status ${movementTypeClass(movement.type)}`}>{movementTypeLabel(movement.type)}</span>
                                    <strong>{movement.date}</strong>
                                    <span>{movement.from_branch || "-"} → {movement.to_branch || "-"}</span>
                                    <span>{movement.document_no || "-"}</span>
                                    <span>{formatNumber(movement.qty)} ชิ้น</span>
                                    <span>ทุน {movement.unit_cost == null ? "-" : formatNumber(movement.unit_cost, 2)}</span>
                                  </div>
                                ))}
                                {!(product.movements || []).length && !(product.sales_summary || []).length ? (
                                  <p className="empty-state">ไม่พบ movement ในช่วงนี้</p>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {!products.length ? <p className="empty-state">ยังไม่มีผลลัพธ์ตามเงื่อนไขที่เลือก</p> : null}
            </>
          ) : (
            <p className="empty-state">เลือกสินค้า กลุ่ม หรือหมวด แล้วกดสืบค้นข้อมูล</p>
          )}
        </section>
      </div>
    </section>
  );
}

function LoginScreen({ authError, busy, username, password, onUsernameChange, onPasswordChange, onSubmit }) {
  return (
    <div className="page auth-page">
      <section className="auth-shell">
        <div className="auth-copy">
          <p className="eyebrow">แดชบอร์ดภายใน</p>
          <h1>ศูนย์ควบคุม Stock Day</h1>
          <p>
            เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อดูสถานะการซิงก์ KPI สต็อก และคำขอสั่งสินค้าจากสาขา
            ผ่าน backend กลาง
          </p>
        </div>

        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-card-header">
            <h2>เข้าสู่ระบบผู้ดูแล</h2>
            <p>ใช้ session cookie จาก Render backend</p>
          </div>

          <label>
            ชื่อผู้ใช้
            <input value={username} onChange={onUsernameChange} autoComplete="username" />
          </label>

          <label>
            รหัสผ่าน
            <input
              type="password"
              value={password}
              onChange={onPasswordChange}
              autoComplete="current-password"
            />
          </label>

          {authError && <div className="notice error compact">{authError}</div>}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>
    </div>
  );
}

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

function BranchStockPanel({ csrfToken, isAdminUser, branchCode, branchName, onNavigate, requestDraftItems, setRequestDraftItems, onClearDraft }) {
  const pageSize = 25;
  const pageFetchLimit = 10000;
  const branchExportOptions = [
    { branchCode: "all", label: "ทุกสาขา", description: "1 ชีทเปรียบเทียบทุกสาขา + 5 ชีทรายสาขา (ไฟล์เดียว)" },
    { branchCode: "000", label: "สาขา 000 (HQ)", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 000 (HQ)" },
    { branchCode: "001", label: "สาขา 001", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 001" },
    { branchCode: "003", label: "สาขา 003", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 003" },
    { branchCode: "004", label: "สาขา 004", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 004" },
    { branchCode: "005", label: "สาขา 005", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 005" },
  ];
  const [records, setRecords] = useState([]);
  const [matchReport, setMatchReport] = useState(null);
  const [matchPreview, setMatchPreview] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: "productCode", direction: "asc" });
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilterKey, setOpenFilterKey] = useState("");
  const [filterSearchTerm, setFilterSearchTerm] = useState("");
  const [pendingFilterValues, setPendingFilterValues] = useState([]);
  const [pagination, setPagination] = useState({
    limit: pageFetchLimit,
    offset: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applyingPreview, setApplyingPreview] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportBranch, setSelectedExportBranch] = useState("001");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [requestMode, setRequestMode] = useState(false);
  const [requestDialogProduct, setRequestDialogProduct] = useState(null);
  const [requestQuantities, setRequestQuantities] = useState({});
  const [requestLineNote, setRequestLineNote] = useState("");
  const [requestDialogError, setRequestDialogError] = useState("");
  const filterMenuRef = useRef(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const requestButtonRef = useRef(null);
  const [flyDots, setFlyDots] = useState([]);

  useEffect(() => {
    if (!loading) return undefined;
    const id = setTimeout(() => {
      setLoading(false);
      setError("โหลดข้อมูลนานเกินไป กรุณาลองกด รีเฟรช");
    }, 45000);
    return () => clearTimeout(id);
  }, [loading]);

  useEffect(() => {
    let active = true;

    async function loadBranchStock() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          limit: String(pageFetchLimit),
          offset: "0",
        });
        if (appliedSearchTerm) {
          params.set("search", appliedSearchTerm);
        }
        const response = await apiFetch(`/api/branch-stock?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setRecords(data.records || []);
        setError("");
        setPagination(
          data.pagination || {
            limit: pageFetchLimit,
            offset: 0,
            total: data.records?.length || 0,
          },
        );
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลดข้อมูลสต็อกสาขาไม่สำเร็จ");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBranchStock();
    return () => {
      active = false;
    };
  }, [appliedSearchTerm, refreshKey]);

  useEffect(() => {
    if (!isAdminUser) {
      setMatchReport(null);
      setReportError("");
      setLoadingReport(false);
      return undefined;
    }

    let active = true;

    async function loadMatchReport() {
      setLoadingReport(true);
      setReportError("");
      try {
        const response = await apiFetch("/api/admin/taxonomy-match-report");
        if (response.status === 404) {
          if (!active) return;
          setMatchReport(null);
          setReportError("ยังไม่มีรายงานเทียบ taxonomy ใน docs/");
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setMatchReport(data);
      } catch (loadError) {
        if (!active) return;
        setReportError(loadError.message || "โหลดรายงานเทียบ taxonomy ไม่สำเร็จ");
      } finally {
        if (active) {
          setLoadingReport(false);
        }
      }
    }

    loadMatchReport();
    return () => {
      active = false;
    };
  }, [isAdminUser, refreshKey]);

  useEffect(() => {
    if (!openFilterKey) return undefined;

    function handlePointerDown(event) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setOpenFilterKey("");
        setFilterMenuAnchor(null);
        setPendingFilterValues([]);
        setFilterSearchTerm("");
      }
    }

    function handleScroll(event) {
      if (filterMenuRef.current && filterMenuRef.current.contains(event.target)) return;
      setOpenFilterKey("");
      setFilterMenuAnchor(null);
      setPendingFilterValues([]);
      setFilterSearchTerm("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [openFilterKey]);

  useEffect(() => {
    if (!isAdminUser) {
      setMatchPreview(null);
      setPreviewError("");
      setApplyMessage("");
      setLoadingPreview(false);
      return undefined;
    }

    let active = true;

    async function loadMatchPreview() {
      setLoadingPreview(true);
      setPreviewError("");
      setApplyMessage("");
      try {
        const response = await apiFetch("/api/admin/taxonomy-match-preview?limit=10&offset=0");
        if (response.status === 404) {
          if (!active) return;
          setMatchPreview(null);
          setPreviewError("ยังไม่มี preview สำหรับ taxonomy report");
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setMatchPreview(data);
      } catch (loadError) {
        if (!active) return;
        setPreviewError(loadError.message || "โหลด preview taxonomy ไม่สำเร็จ");
      } finally {
        if (active) {
          setLoadingPreview(false);
        }
      }
    }

    loadMatchPreview();
    return () => {
      active = false;
    };
  }, [isAdminUser, refreshKey]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    const nextSearch = searchTerm.trim();
    setAppliedSearchTerm(nextSearch);
    setOffset(0);
    if (nextSearch === appliedSearchTerm) {
      setRefreshKey((value) => value + 1);
    }
  }

  function openColumnFilter(columnKey, event) {
    if (openFilterKey === columnKey) {
      setOpenFilterKey("");
      setFilterMenuAnchor(null);
      setPendingFilterValues([]);
      setFilterSearchTerm("");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setFilterMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    const optionValues = columnOptions[columnKey] || [];
    const currentValues = columnFilters[columnKey] ? [...columnFilters[columnKey]] : [...optionValues];
    setPendingFilterValues(currentValues);
    setOpenFilterKey(columnKey);
    setFilterSearchTerm("");
  }

  function updateColumnSort(columnKey, direction) {
    setSortConfig({ key: columnKey, direction });
    setOpenFilterKey("");
    setPendingFilterValues([]);
  }

  function clearColumnFilter(columnKey) {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      return next;
    });
    setPendingFilterValues([]);
    setOffset(0);
  }

  function toggleColumnFilterValue(optionValue) {
    setPendingFilterValues((current) =>
      current.includes(optionValue)
        ? current.filter((value) => value !== optionValue)
        : [...current, optionValue],
    );
  }

  function deselectAllColumnFilterValues() {
    setPendingFilterValues([]);
  }

  function toggleAllColumnFilterValues(optionValues) {
    setPendingFilterValues((current) =>
      current.length === optionValues.length ? [] : [...optionValues],
    );
  }

  function applyColumnFilter(columnKey, optionValues) {
    setColumnFilters((current) => {
      const next = { ...current };
      if (pendingFilterValues.length === optionValues.length) {
        delete next[columnKey];
      } else {
        next[columnKey] = [...pendingFilterValues];
      }
      return next;
    });
    setOpenFilterKey("");
    setPendingFilterValues([]);
    setOffset(0);
  }

  async function handleApplySafeMatches() {
    setApplyingPreview(true);
    setPreviewError("");
    setApplyMessage("");
    try {
      const response = await apiFetch("/api/admin/taxonomy-match-apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }
      setApplyMessage(
        `apply แล้ว ${formatNumber(data.appliedCount || 0)} รายการ ข้าม ${formatNumber(data.skippedCount || 0)} รายการ`,
      );
      setRefreshKey((value) => value + 1);
    } catch (applyError) {
      setPreviewError(applyError.message || "apply taxonomy exact matches ไม่สำเร็จ");
    } finally {
      setApplyingPreview(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    setExportError("");
    try {
      const params = new URLSearchParams({
        branchCode: selectedExportBranch,
      });
      const exportSearch = searchTerm.trim() || appliedSearchTerm;
      if (exportSearch) {
        params.set("search", exportSearch);
      }

      const response = await apiFetch(`/api/branch-stock/export.xlsx?${params.toString()}`);
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          message = payload.message || payload.error || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename=\"?([^"]+)\"?/i);
      anchor.href = objectUrl;
      const dateStamp = new Date().toISOString().slice(0, 10);
      const fallbackName = selectedExportBranch === "all"
        ? `branch-stock-all-${dateStamp}.xlsx`
        : `branch-stock-${selectedExportBranch}.xlsx`;
      anchor.download = fileNameMatch?.[1] || fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setExportModalOpen(false);
    } catch (downloadError) {
      setExportError(downloadError.message || "ส่งออก Excel ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  const columnOptions = useMemo(() => {
    return Object.fromEntries(
      BRANCH_STOCK_COLUMNS.map((column) => {
        const values = [...new Set(records.map((row) => normalizeFilterValue(getBranchStockColumnValue(row, column.key))))].sort(
          (left, right) => left.localeCompare(right, "th", { numeric: true, sensitivity: "base" }),
        );
        return [column.key, values];
      }),
    );
  }, [records]);

  const visibleRecords = useMemo(() => {
    const filtered = records.filter((row) => {
      return BRANCH_STOCK_COLUMNS.every((column) => {
        const activeValues = columnFilters[column.key];
        if (!activeValues) {
          return true;
        }
        if (activeValues.length === 0) {
          return false;
        }
        const value = normalizeFilterValue(getBranchStockColumnValue(row, column.key));
        return activeValues.includes(value);
      });
    });

    const sortColumn = BRANCH_STOCK_COLUMNS.find((column) => column.key === sortConfig.key) || BRANCH_STOCK_COLUMNS[0];
    return [...filtered].sort((left, right) =>
      compareBranchStockValues(
        getBranchStockColumnValue(left, sortColumn.key),
        getBranchStockColumnValue(right, sortColumn.key),
        sortColumn.type,
        sortConfig.direction,
      ),
    );
  }, [records, columnFilters, sortConfig]);

  const total = visibleRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safeOffset = Math.min(offset, Math.max(0, (totalPages - 1) * pageSize));
  const currentPage = Math.floor(safeOffset / pageSize) + 1;
  const start = total === 0 ? 0 : safeOffset + 1;
  const pagedRecords = visibleRecords.slice(safeOffset, safeOffset + pageSize);
  const end = total === 0 ? 0 : safeOffset + pagedRecords.length;
  const reportSummary = matchReport?.summary || null;
  const reportStats = matchReport?.stats || null;
  const previewSummary = matchPreview?.summary || null;

  useEffect(() => {
    if (safeOffset !== offset) {
      setOffset(safeOffset);
    }
  }, [offset, safeOffset]);


  useEffect(() => {
    setRequestDialogProduct(null);
    setRequestQuantities({});
    setRequestLineNote("");
    setRequestDialogError("");
  }, [branchCode]);

  const requestBranchLabel = formatBranchContextLabel(branchCode, branchName);
  const requestDraftCount = requestDraftItems.length;

  const requestDraftByBranch = useMemo(() => {
    const groups = new Map();
    for (const item of requestDraftItems) {
      const key = item.sourceBranchCode;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }, [requestDraftItems]);
  const requestDraftTotalQty = requestDraftItems.reduce(
    (sum, item) => sum + Number(item.requestedQty || 0),
    0,
  );

  function getRequestableBranches(row) {
    return STOCK_COST_COMPARE_BRANCHES.filter(
      (branch) => branch.branchCode !== branchCode && getBranchStockQty(row, branch.branchCode) > 0,
    );
  }

  function canRequestProduct(row) {
    if (!branchCode || !row?.productCode || !row?.unit) {
      return false;
    }
    return getRequestableBranches(row).length > 0;
  }

  function openRequestDialogForRow(row) {
    if (!canRequestProduct(row)) return;
    const availableBranches = getRequestableBranches(row);
    setRequestDialogProduct(row);
    setRequestQuantities(
      Object.fromEntries(availableBranches.map((branch) => [branch.branchCode, ""])),
    );
    setRequestLineNote("");
    setRequestDialogError("");
  }

  function closeRequestDialog() {
    setRequestDialogProduct(null);
    setRequestQuantities({});
    setRequestLineNote("");
    setRequestDialogError("");
  }

  function handleAddDraftItem(event) {
    if (!requestDialogProduct) return;
    if (!requestDialogProduct.unit) {
      setRequestDialogError("สินค้านี้ยังไม่มีหน่วย จึงยังเพิ่มคำขอไม่ได้");
      return;
    }
    const selectedLines = [];
    for (const branch of getRequestableBranches(requestDialogProduct)) {
      const rawValue = requestQuantities[branch.branchCode];
      if (rawValue === "" || rawValue == null) continue;
      const requestedQty = normalizeRequestedQty(rawValue);
      const snapshotQty = getBranchStockQty(requestDialogProduct, branch.branchCode);
      if (requestedQty > snapshotQty) {
        setRequestDialogError(`จำนวนที่ขอจาก ${branch.branchCode} มากกว่าสต็อกที่มีอยู่`);
        return;
      }

      selectedLines.push({
        productCode: requestDialogProduct.productCode,
        productNameThai: requestDialogProduct.productNameThai || "",
        productNameEng: requestDialogProduct.productNameEng || "",
        unit: requestDialogProduct.unit || "",
        sourceBranchCode: branch.branchCode,
        sourceBranchName: BRANCH_LABELS[branch.branchCode] || `สาขา ${branch.branchCode}`,
        requestedQty,
        snapshotQty,
        snapshotSyncedAt: requestDialogProduct.syncedAt || null,
        lineNote: requestLineNote.trim(),
      });
    }

    if (!selectedLines.length) {
      setRequestDialogError("กรุณาระบุจำนวนอย่างน้อย 1 สาขา");
      return;
    }

    setRequestDraftItems((current) => mergeRequestDraftItems(current, selectedLines));

    if (event && requestButtonRef.current) {
      const srcRect = event.currentTarget.getBoundingClientRect();
      const dstRect = requestButtonRef.current.getBoundingClientRect();
      const startX = srcRect.left + srcRect.width / 2;
      const startY = srcRect.top + srcRect.height / 2;
      const id = Date.now() + Math.random();
      setFlyDots((dots) => [
        ...dots,
        {
          id,
          x: startX - 7,
          y: startY - 7,
          tx: dstRect.left + dstRect.width / 2 - startX,
          ty: dstRect.top + dstRect.height / 2 - startY,
        },
      ]);
      setTimeout(() => setFlyDots((dots) => dots.filter((d) => d.id !== id)), 520);
    }
    closeRequestDialog();
  }

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

  function renderBranchStockCell(row, column) {
    if (column.key === "productCode") {
      return <strong>{row.productCode}</strong>;
    }
    if (column.key === "category") {
      return (
        <div className="category-group-card" style={getCategoryGroupStyle(row.category)}>
          <strong>{row.category || "-"}</strong>
          {isAdminUser && row.categoryRationale ? <div className="meta">{row.categoryRationale}</div> : null}
        </div>
      );
    }
    if (column.key === "categoryStatus") {
      return (
        <span className={`status category-status-pill ${categoryStatusClass(row.categoryStatus)}`}>
          {translateCategoryReviewStatus(row.categoryStatus || "needs_review")}
        </span>
      );
    }
    if (column.type === "number") {
      return formatNumber(row[column.key], 2);
    }
    if (column.key === "syncedAt") {
      return formatDateTime(row.syncedAt);
    }
    return row[column.key] || "-";
  }

  return (
    <section className="panel branch-stock-panel">
      <div className="panel-header stacked">
        <div>
          <h2>สต็อกแยกตามสาขา</h2>
          <p>ข้อมูล snapshot ล่าสุดที่ Mother PC ส่งเข้า Render สำหรับการติดตามยอดแต่ละสาขา</p>
        </div>

        <form className="toolbar branch-stock-toolbar" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ค้นหารหัสสินค้า ชื่อไทย ชื่ออังกฤษ หรือ Barcode"
          />
          <button
            type="button"
            className="excel-export-button"
            onClick={() => {
              setExportError("");
              setExportModalOpen(true);
            }}
          >
            ส่งออก Excel
          </button>
          <button type="submit" className="ghost-button branch-stock-search-button">
            ค้นหา
          </button>
          <button
            type="button"
            className="ghost-button branch-stock-refresh-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            รีเฟรช
          </button>
          <button
            ref={requestButtonRef}
            type="button"
            className={`request-entry-button${requestMode ? " active" : ""}`}
            onClick={() => setRequestMode((value) => !value)}
          >
            {requestMode ? "ปิดโหมดขอสินค้า" : "ขอสินค้า"}
          </button>
        </form>
      </div>

      {!branchCode ? (
        <p className="notice warning compact">
          ต้องเลือกสาขาที่จะใช้งานใน session ก่อน จึงจะเปิดใช้งานคำขอสินค้าได้อย่างปลอดภัย
        </p>
      ) : null}
      {(requestMode || requestDraftCount > 0) && (
        <section className="request-draft-card">
          <div>
            <strong>คำขอสินค้าของ {requestBranchLabel}</strong>
            <p className="meta-line">
              เลือกโหมดขอสินค้าแล้วกดปุ่ม <strong>+</strong> หน้าแต่ละรายการเพื่อเพิ่มเข้าคำขอ
            </p>
          </div>
          <div className="request-draft-actions">
            <span className="request-draft-chip">
              {formatNumber(requestDraftCount)} รายการ · {formatNumber(requestDraftTotalQty)} หน่วย
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onClearDraft()}
              disabled={!requestDraftCount}
            >
              ล้างรายการ
            </button>
          </div>
        </section>
      )}

      {isAdminUser ? (
      <section className={`taxonomy-report-card${taxonomyOpen ? " taxonomy-open" : " taxonomy-collapsed"}`}>
        <button
          type="button"
          className="taxonomy-toggle-bar"
          onClick={() => setTaxonomyOpen((v) => !v)}
          aria-expanded={taxonomyOpen}
        >
          <span className="taxonomy-toggle-label">
            <span className="taxonomy-toggle-icon">{taxonomyOpen ? "▾" : "▸"}</span>
            <span>Taxonomy</span>
            {!taxonomyOpen && reportSummary && (
              <span className="taxonomy-toggle-pill">
                {formatNumber(reportSummary.exactCodeMatches || 0)} matched
                {(reportSummary.conflictRows || 0) > 0 && (
                  <span className="taxonomy-toggle-warn"> · {formatNumber(reportSummary.conflictRows)} conflicts</span>
                )}
              </span>
            )}
          </span>
          {!taxonomyOpen && (
            <span className="taxonomy-toggle-hint">คลิกเพื่อดูรายงาน</span>
          )}
        </button>

        {taxonomyOpen && (
        <div className="taxonomy-report-body">
        <div className="taxonomy-report-header">
          <div>
            <h3>รายงานเทียบ taxonomy ล่าสุด</h3>
            <p>
              เทียบ workbook กับ live product export ตามกติกา column C only เพื่อดูความพร้อมก่อนใช้จริง
            </p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loadingReport}
          >
            {loadingReport ? "กำลังโหลด..." : "รีโหลดรายงาน"}
          </button>
        </div>

        {reportError && <p className="notice error compact">รายงาน: {reportError}</p>}
        {previewError && <p className="notice error compact">Preview: {previewError}</p>}
        {applyMessage && <p className="notice success compact">{applyMessage}</p>}

        {matchReport ? (
          <>
            <div className="taxonomy-report-meta">
              <span>ไฟล์รายงาน: {matchReport.fileName}</span>
              <span>สร้างเมื่อ: {formatDateTime(matchReport.generatedAt)}</span>
              <span>Workbook: {compactFileName(matchReport.args?.workbookFile)}</span>
              <span>Live source: {compactFileName(matchReport.args?.liveFile)}</span>
            </div>

            <div className="taxonomy-report-metrics">
              <article className="taxonomy-report-metric">
                <span>Live rows</span>
                <strong>{formatNumber(reportSummary?.totalLiveRowsExamined || 0)}</strong>
                {reportStats?.liveCodeStats ? (
                  <small>{formatNumber(reportStats.liveCodeStats.uniqueValues || 0)} unique codes</small>
                ) : null}
              </article>
              <article className="taxonomy-report-metric">
                <span>Workbook rows</span>
                <strong>{formatNumber(reportSummary?.totalWorkbookRowsExamined || 0)}</strong>
                {reportStats?.workbookCodeStats ? (
                  <small>{formatNumber(reportStats.workbookCodeStats.uniqueValues || 0)} unique C codes</small>
                ) : null}
              </article>
              <article className="taxonomy-report-metric">
                <span>Exact code</span>
                <strong>{formatNumber(reportSummary?.exactCodeMatches || 0)}</strong>
              </article>
              <article className="taxonomy-report-metric">
                <span>Barcode</span>
                <strong>{formatNumber(reportSummary?.barcodeMatches || 0)}</strong>
              </article>
              <article className="taxonomy-report-metric">
                <span>Unmatched live</span>
                <strong>{formatNumber(reportSummary?.unmatchedLiveRows || 0)}</strong>
              </article>
              <article className="taxonomy-report-metric">
                <span>Conflicts</span>
                <strong>{formatNumber(reportSummary?.conflictRows || 0)}</strong>
              </article>
            </div>

            <div className="taxonomy-report-source-status">
              <span className={`status ${
                Number(matchReport.backendEvidence?.productsRows || 0) > 0 &&
                Number(matchReport.backendEvidence?.branchStockSnapshotRows || 0) > 0
                  ? "good"
                  : "warning"
              }`}>
                {Number(matchReport.backendEvidence?.productsRows || 0) > 0 &&
                Number(matchReport.backendEvidence?.branchStockSnapshotRows || 0) > 0
                  ? "ใช้ backend source"
                  : "ใช้ file-backed fallback"}
              </span>
              <span className="meta-line">
                products={formatNumber(matchReport.backendEvidence?.productsRows || 0)} ·
                branch_stock_snapshots={formatNumber(matchReport.backendEvidence?.branchStockSnapshotRows || 0)}
              </span>
            </div>

            {matchPreview ? (
              <>
                <div className="taxonomy-report-metrics taxonomy-report-preview-metrics">
                  <article className="taxonomy-report-metric">
                    <span>Safe to apply</span>
                    <strong>{formatNumber(previewSummary?.safeToApply || 0)}</strong>
                  </article>
                  <article className="taxonomy-report-metric">
                    <span>Category conflict</span>
                    <strong>{formatNumber(previewSummary?.category_conflict || 0)}</strong>
                  </article>
                  <article className="taxonomy-report-metric">
                    <span>Already confirmed</span>
                    <strong>{formatNumber(previewSummary?.already_confirmed || 0)}</strong>
                  </article>
                  <article className="taxonomy-report-metric">
                    <span>Needs review</span>
                    <strong>{formatNumber(previewSummary?.needs_review || 0)}</strong>
                  </article>
                </div>

                <div className="taxonomy-report-header taxonomy-report-preview-header">
                  <div>
                    <h3>Preview ก่อน apply</h3>
                    <p>ใช้ exact code match เพื่อสร้าง category overlay แบบปลอดภัยก่อนแตะ source data จริง</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleApplySafeMatches}
                    disabled={applyingPreview || loadingPreview || !csrfToken}
                  >
                    {applyingPreview ? "กำลัง apply..." : "Apply safe exact matches"}
                  </button>
                </div>

                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Current</th>
                        <th>Proposed</th>
                        <th>Safe</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchPreview.records || []).map((row) => (
                        <tr key={`${row.productCode}-${row.workbookRowNumber}`}>
                          <td>{row.productCode}</td>
                          <td>{row.currentCategory || "-"}</td>
                          <td>{row.proposedCategory || "-"}</td>
                          <td>{row.safeToApply ? "yes" : "no"}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <div className="taxonomy-report-grid">
              <details className="taxonomy-report-section" open>
                <summary>ตัวอย่าง exact code match</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Live code</th>
                        <th>Workbook C</th>
                        <th>ชื่อสินค้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.exactCodeMatches || []).slice(0, 5).map((row) => (
                        <tr key={`${row.liveProductCode}-${row.workbookRowNumber}`}>
                          <td>{row.liveProductCode}</td>
                          <td>{row.workbookProductCode}</td>
                          <td>{row.liveProductNameThai || row.workbookProductNameThai || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details className="taxonomy-report-section">
                <summary>ตัวอย่าง unmatched live</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Live code</th>
                        <th>Barcode</th>
                        <th>ชื่อสินค้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.unmatchedLiveRows || []).slice(0, 5).map((row) => (
                        <tr key={`${row.liveProductCode}-${row.liveRowNumber}`}>
                          <td>{row.liveProductCode}</td>
                          <td>{row.liveBarcode || "-"}</td>
                          <td>{row.liveProductNameThai || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details className="taxonomy-report-section">
                <summary>ตัวอย่าง unmatched workbook</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Workbook C</th>
                        <th>Barcode</th>
                        <th>ชื่อสินค้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.unmatchedWorkbookRows || []).slice(0, 5).map((row) => (
                        <tr key={`${row.workbookProductCode}-${row.workbookRowNumber}`}>
                          <td>{row.workbookProductCode}</td>
                          <td>{row.workbookBarcode || "-"}</td>
                          <td>{row.workbookProductNameThai || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details className="taxonomy-report-section">
                <summary>ตัวอย่าง conflict</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.conflicts || []).slice(0, 5).map((row, index) => (
                        <tr key={`${row.type}-${row.value}-${row.productCode || index}`}>
                          <td>{row.type}</td>
                          <td>{row.value || "-"}</td>
                          <td>{row.productCode || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </>
        ) : null}
        </div>
        )}
      </section>
      ) : null}

      {error && <p className="notice error compact">เชื่อมต่อไม่ได้: {error}</p>}
      {!loading && !error && !records.length && (
        <p className="empty-state">ไม่พบข้อมูลสต็อกสาขาตามเงื่อนไขที่ค้นหา</p>
      )}

      <div className="branch-stock-loading-wrap">
        {loading && (
          <div className="branch-stock-loading-overlay" aria-live="polite" aria-label="กำลังโหลดข้อมูล">
            <div className="branch-stock-spinner" />
            <span>กำลังโหลดข้อมูลสต็อกสาขา...</span>
          </div>
        )}
      <div className="table-wrap">
        <table className={`branch-stock-table${requestMode ? " request-mode" : ""}`}>
          <thead>
            <tr>
              {requestMode ? <th className="branch-stock-request-column">#</th> : null}
              {BRANCH_STOCK_COLUMNS.map((column) => {
                const optionValues = columnOptions[column.key] || [];
                const appliedValues = columnFilters[column.key] ? [...columnFilters[column.key]] : optionValues;
                const activeValues =
                  openFilterKey === column.key ? pendingFilterValues : appliedValues;
                const allSelected = activeValues.length === optionValues.length;
                const hasActiveFilter = Object.prototype.hasOwnProperty.call(columnFilters, column.key);
                const filteredOptions = optionValues.filter((value) =>
                  normalizeFilterValue(value).toLowerCase().includes(filterSearchTerm.trim().toLowerCase()),
                );

                return (
                  <th key={column.key}>
                    <div className="branch-stock-header-cell">
                      <span>{column.label}</span>
                      <button
                        type="button"
                        className={`branch-stock-filter-button ${openFilterKey === column.key ? "active" : ""} ${
                          hasActiveFilter ? "filtered" : ""
                        }`}
                        onClick={(e) => openColumnFilter(column.key, e)}
                        aria-label={`Sort and filter ${column.label}`}
                      >
                        ▾
                      </button>
                    </div>

                    {openFilterKey === column.key ? (
                      <div
                        className="branch-stock-filter-menu"
                        ref={filterMenuRef}
                        style={filterMenuAnchor ? { top: filterMenuAnchor.top, right: filterMenuAnchor.right } : undefined}
                      >
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => updateColumnSort(column.key, "asc")}
                        >
                          Sort A to Z
                        </button>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => updateColumnSort(column.key, "desc")}
                        >
                          Sort Z to A
                        </button>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => {
                            clearColumnFilter(column.key);
                            setOpenFilterKey("");
                          }}
                          disabled={!hasActiveFilter}
                        >
                          Clear Filter
                        </button>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => deselectAllColumnFilterValues()}
                          disabled={activeValues.length === 0}
                        >
                          Deselect All
                        </button>
                        <input
                          type="search"
                          value={filterSearchTerm}
                          onChange={(event) => setFilterSearchTerm(event.target.value)}
                          placeholder="Search"
                          className="branch-stock-filter-search"
                        />
                        <div className="branch-stock-filter-options">
                          <label className="branch-stock-filter-option">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleAllColumnFilterValues(optionValues)}
                            />
                            <span>(Select All)</span>
                          </label>
                          {filteredOptions.map((value) => (
                            <label key={`${column.key}-${value || "blank"}`} className="branch-stock-filter-option">
                              <input
                                type="checkbox"
                                checked={activeValues.includes(value)}
                                onChange={() => toggleColumnFilterValue(value)}
                              />
                              <span>{value || "(Blank)"}</span>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => applyColumnFilter(column.key, optionValues)}
                        >
                          OK
                        </button>
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRecords.map((row) => (
              <tr key={row.productCode}>
                {requestMode ? (
                  <td className="branch-stock-request-column">
                    <button
                      type="button"
                      className="branch-stock-request-plus"
                      onClick={() => openRequestDialogForRow(row)}
                      disabled={!canRequestProduct(row)}
                      aria-label={`เพิ่มคำขอสินค้า ${row.productCode}`}
                    >
                      +
                    </button>
                  </td>
                ) : null}
                {BRANCH_STOCK_COLUMNS.map((column) => (
                  <td key={`${row.productCode}-${column.key}`}>{renderBranchStockCell(row, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </div>

      {!loading && !error && records.length > 0 && pagedRecords.length === 0 && (
        <p className="empty-state">ไม่พบข้อมูลหลังใช้ตัวกรองที่หัวตาราง</p>
      )}

      <div className="pagination">
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
            onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
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
            onClick={() => setOffset((current) => Math.min(Math.max(0, total - 1), current + pageSize))}
          >
            ถัดไป
          </button>
        </div>
      </div>

      {exportModalOpen && (
        <div className="dialog-overlay" onClick={() => !exporting && setExportModalOpen(false)}>
          <div
            className="dialog-card export-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-export-title"
          >
            <div className="dialog-header">
              <div>
                <h3 id="branch-export-title">ส่งออก Excel แยกตามสาขา</h3>
                <p>เลือกสาขาที่ต้องการดาวน์โหลดเพื่อให้ไฟล์แสดงเฉพาะยอดของสาขานั้น</p>
              </div>
              <button
                type="button"
                className="ghost-button dialog-close-button"
                onClick={() => setExportModalOpen(false)}
                disabled={exporting}
              >
                ปิด
              </button>
            </div>

            <div className="export-branch-grid">
              {branchExportOptions.map((option) => (
                <button
                  key={option.branchCode}
                  type="button"
                  className={`export-branch-option${selectedExportBranch === option.branchCode ? " active" : ""}`}
                  onClick={() => setSelectedExportBranch(option.branchCode)}
                  disabled={exporting}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            {exportError && <p className="notice error compact">{exportError}</p>}

            <div className="dialog-actions">
              <button
                type="button"
                className="excel-export-button export-cancel-button"
                onClick={() => setExportModalOpen(false)}
                disabled={exporting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="excel-export-button"
                onClick={handleExportExcel}
                disabled={exporting}
              >
                {exporting ? "กำลังสร้างไฟล์..." : selectedExportBranch === "all" ? "ดาวน์โหลดทั้งหมด" : `ดาวน์โหลด ${selectedExportBranch}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestDialogProduct ? (() => {
        const totalRequestedQty = Object.values(requestQuantities).reduce(
          (sum, v) => sum + (Number(v) || 0), 0
        );
        return (
          <div className="rq-overlay" onClick={closeRequestDialog}>
            <div
              className="rq-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rq-dialog-title"
            >
              {/* Product info header */}
              <div className="rq-dialog-header">
                <div className="rq-dialog-product-info" id="rq-dialog-title">
                  <span className="rq-product-code">{requestDialogProduct.productCode}</span>
                  {requestDialogProduct.productNameThai ? (
                    <span className="rq-product-name-th">{requestDialogProduct.productNameThai}</span>
                  ) : null}
                  {requestDialogProduct.productNameEng ? (
                    <span className="rq-product-name-en">{requestDialogProduct.productNameEng}</span>
                  ) : null}
                  {requestDialogProduct.barcode ? (
                    <span className="rq-product-meta">บาร์โค้ด: {requestDialogProduct.barcode}</span>
                  ) : null}
                  {requestDialogProduct.category ? (
                    <span className="rq-product-meta">หมวด: {requestDialogProduct.category}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rq-close-btn"
                  onClick={closeRequestDialog}
                  aria-label="ปิด"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="rq-dialog-body">
                {/* Branch rows */}
                <div className="rq-branch-table">
                  <div className="rq-branch-table-head">
                    <span>สาขา</span>
                    <span>คงเหลือ</span>
                    <span>จำนวนที่ขอ</span>
                    <span>หน่วย</span>
                  </div>
                  {getRequestableBranches(requestDialogProduct).map((branch) => {
                    const stockQty = getBranchStockQty(requestDialogProduct, branch.branchCode);
                    const reqQty = Number(requestQuantities[branch.branchCode] || 0);
                    return (
                      <div key={branch.branchCode} className="rq-branch-row">
                        <span className="rq-branch-name">
                          {BRANCH_LABELS[branch.branchCode] || `สาขา ${branch.branchCode}`}
                        </span>
                        <span className="rq-branch-stock">{formatNumber(stockQty, 2)}</span>
                        <div className="rq-qty-stepper">
                          <button
                            type="button"
                            className="rq-qty-btn rq-qty-minus"
                            onClick={() =>
                              setRequestQuantities((c) => ({
                                ...c,
                                [branch.branchCode]: Math.max(0, Number(c[branch.branchCode] || 0) - 1),
                              }))
                            }
                            disabled={reqQty <= 0}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            className="rq-qty-input"
                            min="0"
                            step="1"
                            value={requestQuantities[branch.branchCode] ?? ""}
                            onChange={(event) =>
                              setRequestQuantities((c) => ({
                                ...c,
                                [branch.branchCode]: event.target.value,
                              }))
                            }
                            placeholder="0"
                          />
                          <button
                            type="button"
                            className="rq-qty-btn rq-qty-plus"
                            onClick={() =>
                              setRequestQuantities((c) => ({
                                ...c,
                                [branch.branchCode]: Number(c[branch.branchCode] || 0) + 1,
                              }))
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="rq-branch-unit">{requestDialogProduct.unit || "-"}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Summary panel */}
                <div className="rq-dialog-summary">
                  <div className="rq-summary-item">
                    <span className="rq-summary-label">สาขาของคุณ</span>
                    <span className="rq-summary-val">{requestBranchLabel}</span>
                  </div>
                  <div className="rq-summary-item rq-summary-total-box">
                    <span className="rq-summary-label">จำนวนทั้งหมดที่ขอ</span>
                    <span className="rq-total-num">{totalRequestedQty}</span>
                  </div>
                  <div className="rq-summary-item">
                    <span className="rq-summary-label">หน่วยสินค้า</span>
                    <span className="rq-summary-val">{requestDialogProduct.unit || "-"}</span>
                  </div>
                </div>
              </div>

              {requestDialogError ? (
                <p className="notice error compact" style={{ margin: "0 20px" }}>{requestDialogError}</p>
              ) : null}

              {/* Footer */}
              <div className="rq-dialog-footer">
                <button type="button" className="rq-btn-confirm" onClick={(e) => handleAddDraftItem(e)}>
                  ยืนยันใส่ตะกร้า
                </button>
                <button type="button" className="rq-btn-cancel" onClick={closeRequestDialog}>
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}


      {flyDots.map((dot) => (
        <div
          key={dot.id}
          className="fly-dot flying"
          style={{ left: dot.x, top: dot.y, "--tx": `${dot.tx}px`, "--ty": `${dot.ty}px` }}
        />
      ))}
    </section>
  );
}

function StockCostAuditPanel({ branchCode }) {
  const pageSize = 25;
  const [selectedBranch, setSelectedBranch] = useState(branchCode || "005");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState({
    branchCode: branchCode || "005",
    productCount: 0,
    productsWithStock: 0,
    productsWithCost: 0,
    totalInventoryValue: 0,
    branchSummaries: [],
  });
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({
    limit: pageSize,
    offset: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadInventoryValue() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          branchCode: selectedBranch,
          detail: "true",
          limit: String(pageSize),
          offset: String(offset),
        });
        if (appliedSearchTerm) {
          params.set("search", appliedSearchTerm);
        }

        const response = await apiFetch(`/api/branch-stock/inventory-value?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;

        setSummary({
          branchCode: data.branchCode || selectedBranch,
          productCount: Number(data.productCount || 0),
          productsWithStock: Number(data.productsWithStock || 0),
          productsWithCost: Number(data.productsWithCost || 0),
          totalInventoryValue: Number(data.totalInventoryValue || 0),
          branchSummaries: Array.isArray(data.branchSummaries) ? data.branchSummaries : [],
        });
        setRecords(Array.isArray(data.products) ? data.products : []);
        setPagination({
          limit: Number(data.pagination?.limit || pageSize),
          offset: Number(data.pagination?.offset || 0),
          total: Number(data.pagination?.total || 0),
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลดข้อมูลต้นทุนสต๊อกไม่สำเร็จ");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadInventoryValue();
    return () => {
      active = false;
    };
  }, [selectedBranch, appliedSearchTerm, offset, refreshKey]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    const nextSearch = searchTerm.trim();
    setAppliedSearchTerm(nextSearch);
    setOffset(0);
    if (nextSearch === appliedSearchTerm) {
      setRefreshKey((value) => value + 1);
    }
  }

  const isAllBranchesMode = selectedBranch === "all";
  const selectedBranchLabel = STOCK_COST_BRANCH_OPTIONS.find(
    (option) => option.branchCode === selectedBranch,
  )?.label || selectedBranch;
  const branchSummaries = Array.isArray(summary.branchSummaries) ? summary.branchSummaries : [];
  const missingCostCount = Math.max(0, summary.productsWithStock - summary.productsWithCost);
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize));
  const currentPage = Math.min(totalPages, Math.floor((pagination.offset || 0) / pageSize) + 1);

  return (
    <section className="panel stock-cost-panel">
      <div className="panel-header stacked">
        <div>
          <h2>ตรวจสอบต้นทุนสต๊อกสินค้า</h2>
          <p>
            {isAllBranchesMode
              ? "ดูต้นทุนเฉลี่ยต่อหน่วยและมูลค่าคงเหลือแบบรวมทุกสาขาจาก branch-stock sync ของ AdaPOS"
              : `ดูต้นทุนเฉลี่ยต่อหน่วยและมูลค่าคงเหลือของ ${selectedBranchLabel} จาก branch-stock sync ของ AdaPOS`}
          </p>
        </div>

        <form className="toolbar stock-cost-toolbar" onSubmit={handleSearchSubmit}>
          <select
            value={selectedBranch}
            onChange={(event) => {
              setSelectedBranch(event.target.value);
              setOffset(0);
            }}
          >
            {STOCK_COST_BRANCH_OPTIONS.map((option) => (
              <option key={option.branchCode} value={option.branchCode}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ค้นหารหัสสินค้า ชื่อไทย ชื่ออังกฤษ หรือ Barcode"
          />
          <button type="submit" className="ghost-button branch-stock-search-button">
            ค้นหา
          </button>
          <button
            type="button"
            className="ghost-button branch-stock-refresh-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            รีเฟรช
          </button>
        </form>
      </div>

      <p className="stock-cost-note">
        {isAllBranchesMode
          ? "รวม moving average cost ของสาขา 000, 001, 003, 004, 005 และคำนวณมูลค่าคงเหลือจาก จำนวน x ต้นทุนเฉลี่ย ต่อสาขา ก่อนรวมเป็นยอดเดียว"
          : "ใช้ moving average cost ต่อสาขาที่ sync จาก AdaPOS และคำนวณมูลค่าคงเหลือจาก จำนวน x ต้นทุนเฉลี่ย"}
      </p>

      {error ? <p className="notice error compact">{error}</p> : null}

      <section className="kpis stock-cost-summary-grid">
        <article className="kpi stock-cost-kpi">
          <span>{isAllBranchesMode ? "มูลค่าคงเหลือรวมทุกสาขา" : "มูลค่าคงเหลือรวม"}</span>
          <strong>{formatNumber(summary.totalInventoryValue, 2)}</strong>
        </article>
        <article className="kpi stock-cost-kpi">
          <span>{isAllBranchesMode ? "สินค้าที่มีสต๊อกอย่างน้อย 1 สาขา" : "สินค้าที่มีสต๊อก"}</span>
          <strong>{formatNumber(summary.productsWithStock)}</strong>
        </article>
        <article className="kpi stock-cost-kpi">
          <span>{isAllBranchesMode ? "สินค้าที่มีต้นทุนครบทุกสาขาที่มีสต๊อก" : "มีต้นทุนเฉลี่ย"}</span>
          <strong>{formatNumber(summary.productsWithCost)}</strong>
        </article>
        <article className="kpi stock-cost-kpi">
          <span>{isAllBranchesMode ? "ยังขาดต้นทุนบางสาขา" : "ยังไม่มีต้นทุน"}</span>
          <strong>{formatNumber(missingCostCount)}</strong>
        </article>
      </section>

      {isAllBranchesMode && branchSummaries.length ? (
        <section className="stock-cost-branch-grid">
          {branchSummaries.map((branchSummary) => {
            const branchMissingCostCount = Math.max(
              0,
              Number(branchSummary.productsWithStock || 0) - Number(branchSummary.productsWithCost || 0),
            );
            return (
              <article key={branchSummary.branchCode} className="stock-cost-branch-card">
                <div className="stock-cost-branch-head">
                  <strong>{branchSummary.label || `สาขา ${branchSummary.branchCode}`}</strong>
                  <span>{formatNumber(branchSummary.totalInventoryValue, 2)}</span>
                </div>
                <div className="stock-cost-branch-meta">
                  <span>มีสต๊อก {formatNumber(branchSummary.productsWithStock)}</span>
                  <span>ขาดต้นทุน {formatNumber(branchMissingCostCount)}</span>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {loading ? (
        <p className="empty-state">กำลังโหลดข้อมูลต้นทุนสต๊อก...</p>
      ) : (
        <div className="table-wrap">
          {isAllBranchesMode ? (
            <table className="stock-cost-table stock-cost-compare-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้าไทย</th>
                  <th>ชื่ออังกฤษ</th>
                  <th>Barcode</th>
                  <th>หน่วย</th>
                  <th>หมวดหมู่</th>
                  {STOCK_COST_COMPARE_BRANCHES.map((branchOption) => (
                    <Fragment key={branchOption.branchCode}>
                      <th>{branchOption.shortLabel} คงเหลือ</th>
                      <th>{branchOption.shortLabel} ต้นทุน</th>
                      <th>{branchOption.shortLabel} มูลค่า</th>
                    </Fragment>
                  ))}
                  <th>รวมทุกสาขา</th>
                  <th>มูลค่ารวม</th>
                  <th>synced_at</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={`${row.productCode}-${row.syncedAt || ""}`}>
                    <td>{row.productCode || "-"}</td>
                    <td>{row.productNameThai || "-"}</td>
                    <td>{row.productNameEng || "-"}</td>
                    <td>{row.barcode || "-"}</td>
                    <td>{row.unit || "-"}</td>
                    <td>{row.category || "-"}</td>
                    {STOCK_COST_COMPARE_BRANCHES.map((branchOption) => {
                      const branchData = row.branches?.[branchOption.branchCode] || {};
                      return (
                        <Fragment key={`${row.productCode}-${branchOption.branchCode}`}>
                          <td>{formatNumber(branchData.qty, 2)}</td>
                          <td>{formatNumber(branchData.unitCostAvg, 2)}</td>
                          <td>{formatNumber(branchData.inventoryValue, 2)}</td>
                        </Fragment>
                      );
                    })}
                    <td>{formatNumber(row.qtyTotalAllBranches, 2)}</td>
                    <td>{formatNumber(row.totalInventoryValue, 2)}</td>
                    <td>{formatDateTime(row.syncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="stock-cost-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้าไทย</th>
                  <th>ชื่ออังกฤษ</th>
                  <th>Barcode</th>
                  <th>หน่วย</th>
                  <th>หมวดหมู่</th>
                  <th>จำนวนคงเหลือ</th>
                  <th>ต้นทุนเฉลี่ย/หน่วย</th>
                  <th>มูลค่าคงเหลือ</th>
                  <th>synced_at</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={`${row.productCode}-${row.syncedAt || ""}`}>
                    <td>{row.productCode || "-"}</td>
                    <td>{row.productNameThai || "-"}</td>
                    <td>{row.productNameEng || "-"}</td>
                    <td>{row.barcode || "-"}</td>
                    <td>{row.unit || "-"}</td>
                    <td>{row.category || "-"}</td>
                    <td>{formatNumber(row.qty, 2)}</td>
                    <td>{formatNumber(row.unitCostAvg, 2)}</td>
                    <td>{formatNumber(row.inventoryValue, 2)}</td>
                    <td>{formatDateTime(row.syncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pagination.total > 0 ? (
            <div className="pagination">
              <p className="pagination-info">
                หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)} · แสดง{" "}
                {formatNumber(records.length)} จาก {formatNumber(pagination.total)} รายการ
              </p>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
                  disabled={currentPage === 1}
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setOffset((current) => current + pageSize)}
                  disabled={currentPage >= totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          ) : null}

          {!records.length ? (
            <p className="empty-state">
              {isAllBranchesMode
                ? "ไม่พบข้อมูลต้นทุนสต๊อกสำหรับทุกสาขาหรือคำค้นหาปัจจุบัน"
                : "ไม่พบข้อมูลต้นทุนสต๊อกสำหรับสาขาหรือคำค้นหาปัจจุบัน"}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function NotificationBell({ branchCode, onNavigate }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!branchCode) return undefined;
    let active = true;

    async function fetchCount() {
      try {
        const res = await apiFetch("/api/notifications/unread-count");
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) setUnreadCount(data.unreadCount || 0);
      } catch {
        // silent — bell is non-critical
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [branchCode]);

  return (
    <button
      type="button"
      className="notification-bell ghost-button"
      aria-label={`การแจ้งเตือน${unreadCount ? ` (${unreadCount} ยังไม่ได้อ่าน)` : ""}`}
      onClick={onNavigate}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {unreadCount > 0 ? (
        <span className="notification-badge" aria-hidden="true">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
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

function IncomingRequestActionModal({ detail, csrfToken, onClose, onCompleted }) {
  const [lineStates, setLineStates] = useState(() => {
    const initial = {};
    for (const line of detail?.lines || []) {
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

  const allDecided = (detail?.lines || []).length > 0 && (detail?.lines || []).every((line) => {
    const state = lineStates[line.lineId];
    if (!state?.choice) return false;
    if (state.choice === "REJECTED") return Boolean(state.note?.trim());
    if (state.choice === "CUSTOM") return Number.isFinite(Number(state.approvedQty)) && Number(state.approvedQty) >= 0;
    return true;
  });

  function buildSubmitPayload() {
    return {
      version: requestVersion,
      decisionNote: decisionNote.trim() || null,
      responses: (detail?.lines || []).map((line) => {
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

  async function handleSubmitAndGenerate() {
    if (!allDecided) {
      setSubmitError("กรุณาดำเนินการทุกรายการก่อนยืนยัน");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await apiFetch(
        `/api/stock-requests/incoming/${encodeURIComponent(detail.publicId)}/submit-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
          body: JSON.stringify(buildSubmitPayload()),
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

          <div className="srq-action-grid">
            <div className="srq-action-grid-head srq-action-product">รายการสินค้า</div>
            <div className="srq-action-grid-head">จำนวนที่ขอ</div>
            <div className="srq-action-grid-head">หน่วย</div>
            <div className="srq-action-grid-head">การดำเนินการ</div>

            {(detail.lines || []).map((line) => {
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
                      onClick={() => patchLine(line.lineId, {
                        choice: "APPROVED_FULL",
                        approvedQty: String(line.requestedQty),
                        note: "",
                        reasonCode: "",
                      })}
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
                      <input
                        type="number"
                        className="srq-custom-qty-input"
                        min="0"
                        step="1"
                        value={state.approvedQty}
                        onChange={(e) => patchLine(line.lineId, { approvedQty: e.target.value })}
                        disabled={workflowDone || submitting || generatingDoc}
                      />
                    ) : null}
                    {state.choice ? <SrqStatusChip status={state.choice === "CUSTOM" && Number(state.approvedQty) === 0 ? "REJECTED" : state.choice} /> : null}
                    {state.choice === "CUSTOM" ? <span className="meta-line">ให้ {formatNumber(state.approvedQty, 0)} {line.unit}</span> : null}
                    {state.choice === "REJECTED" && state.note ? <span className="meta-line">เหตุผล: {state.note}</span> : null}
                  </div>
                </Fragment>
              );
            })}
          </div>

          <label className="srq-decision-note">
            หมายเหตุรวมการดำเนินการ
            <textarea
              rows="3"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="เช่น ของไม่พอบางรายการ / อนุมัติเพิ่มตามสต็อกจริง"
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
            ) : (
              <button type="button" className="srq-submit-btn" onClick={handleSubmitAndGenerate} disabled={!allDecided || submitting || generatingDoc}>
                {submitting || generatingDoc ? "กำลังดำเนินการ..." : "ยืนยันและรับเอกสารปะหน้า"}
              </button>
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

function IncomingRequestDetail({ publicId, csrfToken, onResponseSubmitted }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionOpen, setActionOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/stock-requests/incoming/${encodeURIComponent(publicId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (!active) return;
        setDetail(data.request);
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
            <SrqStatusChip status={detail.responseResult || detail.status} />
          </div>
        </div>

        {(detail.lines || []).map((line) => (
          <div key={line.lineId} className="srq-detail-line-row">
            <div className="srq-line-info">
              <strong>{line.productNameThai || line.productNameEng || line.productCode}</strong>
              <span className="meta-line">{line.productCode}</span>
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
        ))}

        {detail.responseNote ? <p className="meta-line">หมายเหตุล่าสุด: {detail.responseNote}</p> : null}

        <div className="srq-detail-actions">
          <button type="button" className="srq-submit-btn" onClick={() => setActionOpen(true)}>
            {detail.status === "SUBMITTED" ? "ดำเนินการ" : "ดูผลการดำเนินการ"}
          </button>
        </div>
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
    </>
  );
}

function IncomingRequestsTab({ branchCode, csrfToken, onIncomingNotificationsChanged }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!branchCode) return undefined;
    let active = true;
    setLoading(true);
    apiFetch("/api/stock-requests/incoming")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => { if (active) setRecords(data.records || []); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [branchCode, refreshKey]);

  if (!branchCode) return <p className="notice warning compact">ต้องเลือกสาขาที่ใช้งานก่อนจึงจะดูคำขอที่เข้ามาได้</p>;
  if (loading)    return <p className="notice compact">กำลังโหลด...</p>;

  return (
    <div className="srq-tab-body">
      <div className="srq-tab-toolbar">
        <span className="srq-total-label">{records.length} รายการ</span>
        <button type="button" className="ghost-button" onClick={() => setRefreshKey((k) => k + 1)}>รีเฟรช</button>
      </div>
      {records.length === 0 ? (
        <p className="notice compact">ยังไม่มีคำขอสินค้าเข้ามา</p>
      ) : records.map((req) => (
        <article key={req.requestPublicId} className="srq-batch-card">
          <button
            type="button"
            className="srq-batch-card-header"
            onClick={() => setExpandedId((prev) => (prev === req.requestPublicId ? null : req.requestPublicId))}
          >
            <span className="srq-batch-id">{req.requestPublicId}</span>
            <span className="srq-batch-date">{formatDateTime(req.createdAt)}</span>
            <span className="srq-from-label">จาก: <strong>{BRANCH_LABELS[req.requestingBranchCode] ?? `สาขา ${req.requestingBranchCode}`}</strong></span>
            <SrqStatusChip status={req.responseResult || req.status} />
            <span className="srq-chevron">{expandedId === req.requestPublicId ? "▾" : "▸"}</span>
          </button>
          {expandedId === req.requestPublicId ? (
            <IncomingRequestDetail
              publicId={req.requestPublicId}
              csrfToken={csrfToken}
              onResponseSubmitted={() => {
                setRefreshKey((k) => k + 1);
                onIncomingNotificationsChanged?.();
              }}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}

const RESPONSE_STATUS_LABELS = {
  APPROVED_FULL: "อนุมัติทั้งหมด",
  CUSTOM: "กำหนดจำนวน",
  REJECTED: "ปฏิเสธ",
};

function MyRequestsTab({ branchCode, csrfToken, requestDraftItems, setRequestDraftItems, requestBatchNote, setRequestBatchNote, onSubmitDraft, onClearDraft }) {
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

  if (!branchCode) return <p className="notice warning compact">ต้องเลือกสาขาที่ใช้งานก่อนจึงจะดูคำขอสินค้าของฉันได้</p>;

  return (
    <div className="srq-tab-body">

      {draftCount > 0 ? (
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
        <span className="srq-total-label">{loading ? "กำลังโหลด..." : `${records.length} รายการ`}</span>
        <button type="button" className="ghost-button" onClick={() => setRefreshKey((k) => k + 1)}>รีเฟรช</button>
      </div>
      {ackError ? <p className="notice error compact">{ackError}</p> : null}
      {records.length === 0 && draftCount === 0 ? (
        <p className="notice compact">ยังไม่มีคำขอสินค้า</p>
      ) : records.map((batch) => {
        const isOpen = expandedId === batch.batchPublicId;
        const detail = detailCache[batch.batchPublicId] || null;
        return (
          <article key={batch.batchPublicId} className="srq-batch-card">
            <button
              type="button"
              className="srq-batch-card-header"
              onClick={() => handleExpand(batch.batchPublicId)}
            >
              <span className="srq-batch-id">{batch.batchPublicId}</span>
              <span className="srq-batch-date">{formatDateTime(batch.createdAt)}</span>
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
                      <div key={req.publicId} className="srq-branch-section">
                        <div className="srq-branch-section-header">
                          <span className="srq-branch-label">📦 ขอจาก: <strong>{BRANCH_LABELS[req.sourceBranchCode] ?? `สาขา ${req.sourceBranchCode}`}</strong></span>
                          <SrqStatusChip status={req.status} />
                          {req.status === "RESPONDED" ? (
                            <button
                              type="button"
                              className="ghost-button srq-ack-button"
                              onClick={() => handleAcknowledge(req.publicId, batch.batchPublicId)}
                              disabled={acknowledging === req.publicId}
                            >
                              {acknowledging === req.publicId ? "กำลังยืนยัน..." : "ยืนยันรับสินค้า"}
                            </button>
                          ) : null}
                        </div>
                        <div className="srq-lines-table">
                          <div className="srq-lines-head">
                            <span>รหัส</span><span>ชื่อสินค้า</span><span>ขอ</span><span>หน่วย</span><span>ผล</span>
                          </div>
                          {(req.lines || []).map((line) => (
                            <div key={line.lineId} className="srq-line-row">
                              <span className="srq-line-code">{line.productCode}</span>
                              <span className="srq-line-name">{line.productNameThai || line.productNameEng || "-"}</span>
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
                          ))}
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
  csrfToken,
  requestDraftItems,
  setRequestDraftItems,
  requestBatchNote,
  setRequestBatchNote,
  onSubmitDraft,
  onClearDraft,
  incomingNotifCount = 0,
  onIncomingNotificationsChanged,
}) {
  const [activeTab, setActiveTab] = useState("mine");

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
        />
      ) : (
        <IncomingRequestsTab
          branchCode={branchCode}
          csrfToken={csrfToken}
          onIncomingNotificationsChanged={onIncomingNotificationsChanged}
        />
      )}
    </section>
  );
}

function CategoryReviewPanel({ decidedBy }) {
  const pageSize = 20;
  const [records, setRecords] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [pagination, setPagination] = useState({ limit: pageSize, offset: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState("");
  const [drafts, setDrafts] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadReviewQueue() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(pagination.offset || 0),
          status: statusFilter,
        });
        if (appliedSearchTerm) {
          params.set("search", appliedSearchTerm);
        }

        const [queueResponse, metricsResponse] = await Promise.all([
          apiFetch(`/api/admin/category-review?${params.toString()}`),
          apiFetch("/api/admin/category-metrics"),
        ]);

        if (!queueResponse.ok) {
          throw new Error(`HTTP ${queueResponse.status}`);
        }
        if (!metricsResponse.ok) {
          throw new Error(`HTTP ${metricsResponse.status}`);
        }

        const [queueData, metricsData] = await Promise.all([
          queueResponse.json(),
          metricsResponse.json(),
        ]);

        if (!active) return;
        setRecords(queueData.records || []);
        setMetrics(metricsData);
        setPagination(
          queueData.pagination || {
            limit: pageSize,
            offset: 0,
            total: queueData.records?.length || 0,
          },
        );
        setDrafts((current) => {
          const next = { ...current };
          for (const row of queueData.records || []) {
            if (!next[row.productCode]) {
              next[row.productCode] = {
                cleanCategory: row.cleanCategory || "",
                shelfNo: row.shelfNo ?? "",
                isColdChain: Boolean(row.isColdChain),
              };
            }
          }
          return next;
        });
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "โหลดคิวหมวดหมู่ไม่สำเร็จ");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReviewQueue();
    return () => {
      active = false;
    };
  }, [appliedSearchTerm, pagination.offset, refreshKey, statusFilter]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setAppliedSearchTerm(searchTerm.trim());
    setPagination((current) => ({ ...current, offset: 0 }));
  }

  async function handleRunCategorizer() {
    setRunning(true);
    setError("");
    try {
      const response = await apiFetch("/api/admin/categories/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setPagination((current) => ({ ...current, offset: 0 }));
      setRefreshKey((value) => value + 1);
    } catch (runError) {
      setError(runError.message || "สั่งประมวลผลหมวดหมู่ไม่สำเร็จ");
    } finally {
      setRunning(false);
    }
  }

  async function handleConfirm(productCode) {
    const draft = drafts[productCode] || {};
    setSavingCode(productCode);
    setError("");
    try {
      const response = await apiFetch(`/api/admin/category-review/${productCode}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanCategory: draft.cleanCategory,
          shelfNo: draft.shelfNo === "" ? null : Number(draft.shelfNo),
          isColdChain: Boolean(draft.isColdChain),
          decidedBy,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${response.status}`);
      }
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setError(saveError.message || "บันทึกการยืนยันหมวดหมู่ไม่สำเร็จ");
    } finally {
      setSavingCode("");
    }
  }

  const total = pagination.total || 0;
  const currentPage = Math.floor((pagination.offset || 0) / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (pagination.offset || 0) + 1;
  const end = total === 0 ? 0 : (pagination.offset || 0) + records.length;

  return (
    <section className="panel category-review-panel">
      <div className="panel-header stacked">
        <div>
          <h2>คิวตรวจหมวดหมู่สินค้า</h2>
          <p>ตรวจรายการที่ระบบจัดหมวดหมู่ได้ไม่ชัด หรือรายการที่ต้องยืนยันจากเภสัช</p>
        </div>

        <form className="toolbar branch-stock-toolbar" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ค้นหารหัสสินค้า ชื่อ หรือหมวดหมู่"
          />
          <select value={statusFilter} onChange={(event) => {
            setStatusFilter(event.target.value);
            setPagination((current) => ({ ...current, offset: 0 }));
          }}>
            <option value="open">คิวที่ยังไม่ยืนยัน</option>
            <option value="needs_review">ต้องทบทวน</option>
            <option value="reverify">ต้องตรวจซ้ำ</option>
            <option value="proposed">รอตรวจ</option>
            <option value="confirmed">ยืนยันแล้ว</option>
            <option value="all">ทั้งหมด</option>
          </select>
          <button type="submit" className="ghost-button">
            ค้นหา
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={handleRunCategorizer}
            disabled={running}
          >
            {running ? "กำลังประมวลผล..." : "ประมวลผลใหม่"}
          </button>
        </form>
      </div>

      {metrics ? (
        <div className="category-metrics">
          <article className="category-metric">
            <span>สินค้าทั้งหมด</span>
            <strong>{formatNumber(metrics.totalProducts)}</strong>
          </article>
          <article className="category-metric">
            <span>ชื่อไทยพร้อมใช้</span>
            <strong>{formatNumber((metrics.thaiNameCoverage || 0) * 100, 1)}%</strong>
          </article>
          <article className="category-metric">
            <span>ชื่ออังกฤษพร้อมใช้</span>
            <strong>{formatNumber((metrics.englishNameCoverage || 0) * 100, 1)}%</strong>
          </article>
          <article className="category-metric">
            <span>Barcode ใช้งานได้</span>
            <strong>{formatNumber((metrics.barcodeCoverage || 0) * 100, 1)}%</strong>
          </article>
          <article className="category-metric">
            <span>Dummy barcode</span>
            <strong>{formatNumber((metrics.dummyBarcodeRate || 0) * 100, 1)}%</strong>
          </article>
        </div>
      ) : null}

      {error && <p className="notice error compact">{error}</p>}
      {loading && <p className="empty-state">กำลังโหลดคิวหมวดหมู่...</p>}
      {!loading && !records.length ? (
        <p className="empty-state">ไม่มีรายการในคิวตามตัวกรองปัจจุบัน</p>
      ) : null}

      <div className="category-review-list">
        {records.map((row) => {
          const draft = drafts[row.productCode] || {
            cleanCategory: row.cleanCategory || "",
            shelfNo: row.shelfNo ?? "",
            isColdChain: Boolean(row.isColdChain),
          };
          return (
            <article className="category-review-card" key={row.productCode}>
              <div className="category-review-main">
                <div>
                  <strong>{row.productNameThai || row.productCode}</strong>
                  <p className="meta-line">{row.productCode} · {row.productNameEng || "-"}</p>
                  <p className="meta-line">
                    Barcode: {row.barcode || "-"} · source: {row.source || "-"}
                  </p>
                </div>
                <span className={`status ${categoryStatusClass(row.reviewStatus)}`}>
                  {translateCategoryReviewStatus(row.reviewStatus)}
                </span>
              </div>

              <div className="category-review-grid">
                <label>
                  หมวดหมู่
                  <input
                    value={draft.cleanCategory}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [row.productCode]: {
                        ...draft,
                        cleanCategory: event.target.value,
                      },
                    }))}
                  />
                </label>
                <label>
                  Shelf
                  <input
                    value={draft.shelfNo}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [row.productCode]: {
                        ...draft,
                        shelfNo: event.target.value,
                      },
                    }))}
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.isColdChain)}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [row.productCode]: {
                        ...draft,
                        isColdChain: event.target.checked,
                      },
                    }))}
                  />
                  <span>Cold chain</span>
                </label>
              </div>

              <div className="category-review-meta">
                <span>แสดงผล: <strong>{row.category || "-"}</strong></span>
                <span>Category conf. {formatNumber((row.categoryConfidence || 0) * 100, 1)}%</span>
                <span>Placement conf. {formatNumber((row.placementConfidence || 0) * 100, 1)}%</span>
              </div>

              <p className="meta-line">{row.rationale || "ไม่มีคำอธิบายจากระบบ"}</p>
              {row.rawLabelSource ? <p className="meta-line">ประวัติอ้างอิง: {row.rawLabelSource}</p> : null}

              <div className="category-review-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={savingCode === row.productCode || !draft.cleanCategory.trim()}
                  onClick={() => handleConfirm(row.productCode)}
                >
                  {savingCode === row.productCode ? "กำลังบันทึก..." : "ยืนยันหมวดหมู่"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="pagination">
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
            onClick={() => setPagination((current) => ({
              ...current,
              offset: Math.max(0, (current.offset || 0) - pageSize),
            }))}
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
            onClick={() => setPagination((current) => ({
              ...current,
              offset: (current.offset || 0) + pageSize,
            }))}
          >
            ถัดไป
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Review Queue — fast keyboard-driven human category verification ───────────
// ── Ingredient Knowledge Layer (read-only display) ───────────────────────────
// Cache supervision payloads per product code so navigating back/forth in the
// queue does not re-hit the backend.
const ingredientSupervisionCache = new Map();

const INGREDIENT_STATUS_LABELS = {
  proposed:     "รอตรวจ",
  confirmed:    "ยืนยันแล้ว",
  needs_review: "ต้องทบทวน",
  rejected:     "ปฏิเสธ",
};

function formatIngredientStrength(ingredient) {
  const value = ingredient?.strengthValue;
  const unit  = ingredient?.strengthUnit;
  if (value == null && !unit) return "";
  if (value == null) return unit || "";
  return `${value}${unit || ""}`;
}

function IngredientSuggestions({ productCode, onUseCategory, csrfToken }) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [busyId, setBusyId] = useState(null);

  const fetchSupervision = useCallback(async (force) => {
    const res = await apiFetch(`/api/admin/products/${encodeURIComponent(productCode)}/ingredient-supervision`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    ingredientSupervisionCache.set(productCode, json);
    return json;
  }, [productCode]);

  useEffect(() => {
    if (!productCode) return undefined;
    let active = true;

    const cached = ingredientSupervisionCache.get(productCode);
    if (cached) {
      setState({ status: "ready", data: cached });
      return undefined;
    }

    setState({ status: "loading", data: null });
    fetchSupervision()
      .then((json) => { if (active) setState({ status: "ready", data: json }); })
      .catch(() => { if (active) setState({ status: "error", data: null }); });

    return () => { active = false; };
  }, [productCode, fetchSupervision]);

  async function setIngredientStatus(ing, status) {
    setBusyId(ing.ingredientId);
    try {
      const res = await apiFetch(`/api/admin/ingredient-dictionary/product-ingredients/${encodeURIComponent(productCode)}/${ing.ingredientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ingredientSupervisionCache.delete(productCode);
      const json = await fetchSupervision(true);
      setState({ status: "ready", data: json });
    } catch (e) {
      // surface minimally; keep panel usable
      setState((prev) => ({ ...prev }));
    } finally {
      setBusyId(null);
    }
  }

  const title = <div className="rq-ing-title">สารสำคัญ</div>;

  if (state.status === "loading") {
    return <div className="rq-ing"><div className="rq-ing-card">{title}<p className="rq-ing-muted">⏳ กำลังโหลด...</p></div></div>;
  }
  if (state.status === "error") {
    return <div className="rq-ing"><div className="rq-ing-card">{title}<p className="rq-ing-muted">โหลดข้อมูลสารสำคัญไม่สำเร็จ</p></div></div>;
  }

  const ingredients = state.data?.ingredients || [];
  const categorySuggestions = state.data?.categorySuggestions || [];

  if (!ingredients.length && !categorySuggestions.length) {
    return <div className="rq-ing"><div className="rq-ing-card">{title}<p className="rq-ing-muted">ยังไม่มีข้อมูลสารสำคัญ</p></div></div>;
  }

  return (
    <div className="rq-ing">
      <div className="rq-ing-card">
        {title}

        {ingredients.length > 0 && (
          <ul className="rq-ing-list">
            {ingredients.map((ing) => {
              const strength = formatIngredientStrength(ing);
              const drugClasses = (ing.drugClasses || []).map((dc) => dc.name).filter(Boolean);
              const indications = (ing.indications || []).map((ind) => ind.name).filter(Boolean);
              return (
                <li key={ing.ingredientId} className={`rq-ing-item${ing.status === "rejected" ? " rq-ing-item-rejected" : ""}`}>
                  <div className="rq-ing-head">
                    <span className="rq-ing-name">
                      {ing.displayName || ing.canonicalName}
                      {strength && <span className="rq-ing-strength"> {strength}</span>}
                    </span>
                    {ing.status && (
                      <span className={`rq-ing-status rq-ing-status-${ing.status}`}>
                        {INGREDIENT_STATUS_LABELS[ing.status] || ing.status}
                      </span>
                    )}
                    <span className="rq-ing-actions">
                      <button
                        type="button"
                        className={`id-confirm-btn ok${ing.status === "confirmed" ? " on" : ""}`}
                        title="ยืนยันสารนี้"
                        disabled={busyId === ing.ingredientId}
                        onClick={() => setIngredientStatus(ing, "confirmed")}
                      >✓</button>
                      <button
                        type="button"
                        className={`id-confirm-btn no${ing.status === "rejected" ? " on" : ""}`}
                        title="ปฏิเสธสารนี้"
                        disabled={busyId === ing.ingredientId}
                        onClick={() => setIngredientStatus(ing, "rejected")}
                      >✗</button>
                    </span>
                  </div>
                  {drugClasses.length > 0 && (
                    <div className="rq-ing-line rq-ing-class">{drugClasses.join(" · ")}</div>
                  )}
                  {indications.length > 0 && (
                    <div className="rq-ing-line rq-ing-indication">{indications.join(" / ")}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {categorySuggestions.length > 0 && (
          <div className="rq-ing-suggest">
            <div className="rq-ing-suggest-title">หมวดที่แนะนำจากสารสำคัญ</div>
            {categorySuggestions.map((sug, i) => (
              <button
                key={`${sug.categoryName}-${i}`}
                type="button"
                className="rq-ing-suggest-btn"
                onClick={() => onUseCategory && onUseCategory(sug.categoryName)}
                title={sug.reason || sug.categoryName}
              >
                <span className="rq-ing-suggest-cat">{sug.categoryName}</span>
                {sug.reason && <span className="rq-ing-suggest-reason">{sug.reason}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ingredient Dictionary Admin (Phase 5A) ───────────────────────────────────
const ING_API = "/api/admin/ingredient-dictionary";

const ING_STATUS_LABELS = {
  active: "ใช้งาน",
  confirmed: "ยืนยันแล้ว",
  proposed: "รอตรวจ",
  needs_review: "ต้องทบทวน",
  deprecated: "ปิดใช้",
  inactive: "ปิดใช้",
  rejected: "ปฏิเสธ",
};

function ingStatusLabel(status) {
  return ING_STATUS_LABELS[status] || status || "-";
}

function IngredientDictionaryPanel({ csrfToken }) {
  const [subTab, setSubTab] = useState("dictionary"); // dictionary | matched | discoveries

  // dictionary list
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("");
  const [list, setList]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [loadingList, setLoadingList] = useState(false);

  // selected ingredient detail
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError]   = useState("");

  // form inputs
  const [newSynonym, setNewSynonym]   = useState("");
  const [newDrugClass, setNewDrugClass] = useState("");
  const [newIndication, setNewIndication] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [rulePriority, setRulePriority] = useState("100");
  const [categoryOptions, setCategoryOptions] = useState([]);

  // matched products
  const [matched, setMatched]           = useState([]);
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [matchedOffset, setMatchedOffset] = useState(0);
  const [matchedSearch, setMatchedSearch] = useState("");
  const [matchedStatusFilter, setMatchedStatusFilter] = useState("");
  const [loadingMatched, setLoadingMatched] = useState(false);
  const [matchedSelected, setMatchedSelected] = useState(() => new Set());

  // discoveries
  const [discoveries, setDiscoveries] = useState([]);
  const [discoveryTotal, setDiscoveryTotal] = useState(0);
  const [loadingDiscoveries, setLoadingDiscoveries] = useState(false);

  const MATCHED_PAGE = 50;

  // ── loaders ───────────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch(`${ING_API}/ingredients?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data.records || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError("โหลดรายการสารสำคัญไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingList(false);
    }
  }, [search, statusFilter]);

  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    setError("");
    try {
      const res = await apiFetch(`${ING_API}/ingredients/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data.ingredient);
    } catch (e) {
      setError("โหลดรายละเอียดไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadMatched = useCallback(async (offset = 0) => {
    setLoadingMatched(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(MATCHED_PAGE), offset: String(offset) });
      if (matchedSearch.trim()) params.set("search", matchedSearch.trim());
      if (matchedStatusFilter) params.set("status", matchedStatusFilter);
      const res = await apiFetch(`${ING_API}/matched-products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMatched(data.records || []);
      setMatchedTotal(data.total || 0);
      setMatchedOffset(offset);
      setMatchedSelected(new Set());
    } catch (e) {
      setError("โหลดสินค้าที่จับคู่ไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingMatched(false);
    }
  }, [matchedSearch, matchedStatusFilter]);

  const loadDiscoveries = useCallback(async () => {
    setLoadingDiscoveries(true);
    setError("");
    try {
      const res = await apiFetch(`${ING_API}/potential-discoveries?limit=100&minCount=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiscoveries(data.records || []);
      setDiscoveryTotal(data.totalProducts || 0);
    } catch (e) {
      setError("โหลดคำที่ยังไม่รู้จักไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingDiscoveries(false);
    }
  }, []);

  useEffect(() => { if (subTab === "dictionary") loadList(); }, [subTab, loadList]);
  useEffect(() => { if (subTab === "matched") loadMatched(0); }, [subTab, matchedStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (subTab === "discoveries") loadDiscoveries(); }, [subTab, loadDiscoveries]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // ── mutation helper ──────────────────────────────────────────────────────────
  const mutate = useCallback(async (path, method, body) => {
    setError("");
    setNotice("");
    const res = await apiFetch(`${ING_API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.ingredient) setDetail(data.ingredient);
    return data;
  }, [csrfToken]);

  async function runMutation(fn, successMsg) {
    try {
      await fn();
      if (successMsg) setNotice(successMsg);
      loadList();
    } catch (e) {
      setError(e.message);
    }
  }

  // matched-products confirm/reject
  const toggleMatchedSelect = (key) => setMatchedSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  async function confirmMatched(rec, status) {
    try {
      await mutate(`/product-ingredients/${encodeURIComponent(rec.productCode)}/${rec.ingredientId}`, "PATCH", { status });
      setMatched((prev) => prev.map((m) => (m.productCode === rec.productCode && m.ingredientId === rec.ingredientId ? { ...m, ingredientStatus: status } : m)));
      setNotice(status === "confirmed" ? "ยืนยันแล้ว" : "ปฏิเสธแล้ว");
    } catch (e) {
      setError(e.message);
    }
  }

  async function bulkMatched(status) {
    const decisions = matched
      .filter((m) => matchedSelected.has(`${m.productCode}|${m.ingredientId}`))
      .map((m) => ({ productCode: m.productCode, ingredientId: m.ingredientId, status }));
    if (!decisions.length) return;
    try {
      const data = await mutate(`/product-ingredients/confirm-batch`, "POST", { decisions });
      setMatched((prev) => prev.map((m) => (matchedSelected.has(`${m.productCode}|${m.ingredientId}`) ? { ...m, ingredientStatus: status } : m)));
      setMatchedSelected(new Set());
      setNotice(`อัปเดต ${data.updated ?? decisions.length} รายการ`);
    } catch (e) {
      setError(e.message);
    }
  }

  // category options for rule picker
  useEffect(() => {
    if (subTab !== "dictionary" || !detail) return;
    let active = true;
    apiFetch(`${ING_API}/categories?search=${encodeURIComponent(ruleCategory.trim())}`)
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => { if (active) setCategoryOptions(d.records || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [ruleCategory, subTab, detail]);

  // ── action handlers ───────────────────────────────────────────────────────────
  const addSynonym = () => runMutation(async () => {
    const t = newSynonym.trim();
    if (!t) return;
    await mutate(`/ingredients/${detail.ingredientId}/synonyms`, "POST", { synonymText: t, language: "en" });
    setNewSynonym("");
  }, "เพิ่มคำพ้องแล้ว");

  const toggleSynonym = (s) => runMutation(async () => {
    const next = s.status === "deprecated" ? "active" : "deprecated";
    await mutate(`/synonyms/${s.synonymId}`, "PATCH", { status: next });
  });

  const addDrugClass = () => runMutation(async () => {
    const name = newDrugClass.trim();
    if (!name) return;
    await mutate(`/ingredients/${detail.ingredientId}/drug-classes`, "POST", { name });
    setNewDrugClass("");
  }, "เชื่อมกลุ่มยาแล้ว");

  const toggleDrugClass = (d) => runMutation(async () => {
    const next = d.status === "rejected" ? "confirmed" : "rejected";
    await mutate(`/ingredients/${detail.ingredientId}/drug-classes/${d.drugClassId}`, "PATCH", { status: next });
  });

  const addIndication = () => runMutation(async () => {
    const name = newIndication.trim();
    if (!name) return;
    await mutate(`/ingredients/${detail.ingredientId}/indications`, "POST", { name });
    setNewIndication("");
  }, "เชื่อมข้อบ่งใช้แล้ว");

  const toggleIndication = (i) => runMutation(async () => {
    const next = i.status === "rejected" ? "confirmed" : "rejected";
    await mutate(`/ingredients/${detail.ingredientId}/indications/${i.indicationId}`, "PATCH", { status: next });
  });

  const addCategoryRule = () => runMutation(async () => {
    const categoryName = ruleCategory.trim();
    if (!categoryName) return;
    await mutate(`/ingredients/${detail.ingredientId}/category-rules`, "POST", {
      categoryName,
      priority: parseInt(rulePriority, 10) || 100,
    });
    setRuleCategory("");
  }, "เพิ่มกฎหมวดแล้ว");

  const toggleRule = (r) => runMutation(async () => {
    const next = r.ruleStatus === "active" ? "inactive" : "active";
    await mutate(`/category-rules/${r.ruleId}`, "PATCH", { ruleStatus: next });
  });

  const changeRulePriority = (r, delta) => runMutation(async () => {
    await mutate(`/category-rules/${r.ruleId}`, "PATCH", { priority: Math.max(0, r.priority + delta) });
  });

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <section className="panel id-panel">
      <div className="panel-header">
        <h2>พจนานุกรมสารสำคัญ</h2>
        <p>จัดการความรู้สารสำคัญ — คำพ้อง กลุ่มยา ข้อบ่งใช้ และกฎหมวด (อ่าน/แก้ไขโดยเภสัชกร)</p>
      </div>

      <div className="id-subtabs">
        {[
          { key: "dictionary", label: "พจนานุกรม" },
          { key: "matched", label: "สินค้าที่จับคู่แล้ว" },
          { key: "discoveries", label: "คำที่ยังไม่รู้จัก" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={subTab === t.key ? "id-subtab active" : "id-subtab"}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="notice error compact">{error}</p>}
      {notice && <p className="notice success compact">{notice}</p>}

      {/* ── DICTIONARY ── */}
      {subTab === "dictionary" && (
        <div className="id-dictionary">
          <div className="id-list-col">
            <div className="id-search-row">
              <div className="id-search-stack">
                <label className="id-search-box">
                  <span className="id-search-icon" aria-hidden="true">⌕</span>
                  <input
                    type="text"
                    className="rq-search"
                    placeholder="ค้นหา: ชื่อสาร / คำพ้อง / กลุ่มยา / ข้อบ่งใช้"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") loadList(); }}
                  />
                </label>
                <label className="id-status-box">
                  <span className="id-status-dot" aria-hidden="true" />
                  <select className="id-select" value={statusFilter} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">ทุกสถานะ</option>
                    <option value="active">ใช้งาน</option>
                    <option value="needs_review">ต้องทบทวน</option>
                    <option value="deprecated">ปิดใช้</option>
                  </select>
                  <span className="id-status-chevron" aria-hidden="true">⌄</span>
                </label>
              </div>
              <button type="button" className="id-search-button" onClick={loadList}>
                <span className="id-search-button-icon" aria-hidden="true">⌕</span>
                <span>ค้นหา</span>
              </button>
            </div>
            <div className="id-list-meta">{total.toLocaleString()} สาร</div>
            <div className="id-list">
              {loadingList ? (
                <p className="empty-state">กำลังโหลด...</p>
              ) : list.length === 0 ? (
                <p className="empty-state">ไม่พบสารสำคัญ</p>
              ) : (
                list.map((row) => (
                  <button
                    key={row.ingredientId}
                    type="button"
                    className={`id-list-item${selectedId === row.ingredientId ? " active" : ""}`}
                    onClick={() => setSelectedId(row.ingredientId)}
                  >
                    <div className="id-list-name">
                      {row.displayName}
                      {row.status !== "active" && <span className="id-badge muted">{ingStatusLabel(row.status)}</span>}
                    </div>
                    <div className="id-list-sub">
                      {row.drugClassNames || "ไม่มีกลุ่มยา"}
                    </div>
                    <div className="id-list-counts">
                      <span title="คำพ้อง">🔤 {row.synonymCount}</span>
                      <span title="กลุ่มยา">💊 {row.drugClassCount}</span>
                      <span title="ข้อบ่งใช้">🩺 {row.indicationCount}</span>
                      <span title="กฎหมวด">📂 {row.categoryRuleCount}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="id-detail-col">
            {!detail ? (
              <p className="empty-state">เลือกสารสำคัญทางซ้ายเพื่อดูรายละเอียด</p>
            ) : loadingDetail ? (
              <p className="empty-state">กำลังโหลด...</p>
            ) : (
              <>
                <div className="id-detail-head">
                  <h3>{detail.displayName}</h3>
                  <code>{detail.canonicalName}</code>
                  <span className={`id-badge ${detail.status === "active" ? "good" : "muted"}`}>{ingStatusLabel(detail.status)}</span>
                </div>
                <div className="id-detail-dates">
                  สร้าง: {new Date(detail.createdAt).toLocaleString("th-TH")} · แก้ไขล่าสุด: {new Date(detail.updatedAt).toLocaleString("th-TH")}
                </div>

                {/* Synonyms */}
                <div className="id-section">
                  <div className="id-section-title">คำพ้อง (Synonyms)</div>
                  <ul className="id-rows">
                    {detail.synonyms.map((s) => (
                      <li key={s.synonymId} className={s.status === "deprecated" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">{s.synonymText}</span>
                        <span className="id-row-meta">{s.language || "-"} · {s.source || "-"} · {ingStatusLabel(s.status)}</span>
                        <button type="button" className="ghost-button id-mini" onClick={() => toggleSynonym(s)}>
                          {s.status === "deprecated" ? "เปิดใช้" : "ปิดใช้"}
                        </button>
                      </li>
                    ))}
                    {detail.synonyms.length === 0 && <li className="id-row empty">ยังไม่มีคำพ้อง</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" placeholder="เพิ่มคำพ้องใหม่..." value={newSynonym}
                      onChange={(e) => setNewSynonym(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSynonym(); }} />
                    <button type="button" className="primary-button id-mini" onClick={addSynonym} disabled={!newSynonym.trim()}>เพิ่ม</button>
                  </div>
                </div>

                {/* Drug classes */}
                <div className="id-section">
                  <div className="id-section-title">กลุ่มยา (Drug Classes)</div>
                  <ul className="id-rows">
                    {detail.drugClasses.map((d) => (
                      <li key={d.drugClassId} className={d.status === "rejected" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">{d.name}</span>
                        <span className="id-row-meta">
                          {d.confidence != null ? `conf ${d.confidence}` : "conf -"} · {d.source || "-"} · {ingStatusLabel(d.status)}
                        </span>
                        <button type="button" className="ghost-button id-mini" onClick={() => toggleDrugClass(d)}>
                          {d.status === "rejected" ? "เปิดใช้" : "ปิดใช้"}
                        </button>
                      </li>
                    ))}
                    {detail.drugClasses.length === 0 && <li className="id-row empty">ยังไม่มีกลุ่มยา</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" placeholder="เพิ่ม/เชื่อมกลุ่มยา..." value={newDrugClass}
                      onChange={(e) => setNewDrugClass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addDrugClass(); }} />
                    <button type="button" className="primary-button id-mini" onClick={addDrugClass} disabled={!newDrugClass.trim()}>เชื่อม</button>
                  </div>
                </div>

                {/* Indications */}
                <div className="id-section">
                  <div className="id-section-title">ข้อบ่งใช้ (Indications)</div>
                  <ul className="id-rows">
                    {detail.indications.map((i) => (
                      <li key={i.indicationId} className={i.status === "rejected" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">{i.name}</span>
                        <span className="id-row-meta">{i.source || "-"} · {ingStatusLabel(i.status)}</span>
                        <button type="button" className="ghost-button id-mini" onClick={() => toggleIndication(i)}>
                          {i.status === "rejected" ? "เปิดใช้" : "ปิดใช้"}
                        </button>
                      </li>
                    ))}
                    {detail.indications.length === 0 && <li className="id-row empty">ยังไม่มีข้อบ่งใช้</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" placeholder="เพิ่ม/เชื่อมข้อบ่งใช้..." value={newIndication}
                      onChange={(e) => setNewIndication(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addIndication(); }} />
                    <button type="button" className="primary-button id-mini" onClick={addIndication} disabled={!newIndication.trim()}>เชื่อม</button>
                  </div>
                </div>

                {/* Category rules */}
                <div className="id-section">
                  <div className="id-section-title">กฎหมวด (Category Rules)</div>
                  <ul className="id-rows">
                    {detail.categoryRules.map((r) => (
                      <li key={r.ruleId} className={r.ruleStatus !== "active" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">
                          {detail.displayName}
                          {r.drugClassName && <> → {r.drugClassName}</>}
                          {r.indicationName && <> → {r.indicationName}</>}
                          {" → "}<strong>{r.categoryName}</strong>
                        </span>
                        <span className="id-row-meta">priority {r.priority} · {ingStatusLabel(r.ruleStatus)}</span>
                        <span className="id-row-actions">
                          <button type="button" className="ghost-button id-mini" onClick={() => changeRulePriority(r, -10)} title="ลำดับสำคัญขึ้น">▲</button>
                          <button type="button" className="ghost-button id-mini" onClick={() => changeRulePriority(r, 10)} title="ลำดับสำคัญลง">▼</button>
                          <button type="button" className="ghost-button id-mini" onClick={() => toggleRule(r)}>
                            {r.ruleStatus === "active" ? "ปิดใช้" : "เปิดใช้"}
                          </button>
                        </span>
                      </li>
                    ))}
                    {detail.categoryRules.length === 0 && <li className="id-row empty">ยังไม่มีกฎหมวด</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" list="id-category-options" placeholder="เลือกหมวดที่มีอยู่แล้ว..." value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value)} />
                    <datalist id="id-category-options">
                      {categoryOptions.map((c) => <option key={c.categoryName} value={c.categoryName}>{`${c.categoryName} (${c.productCount})`}</option>)}
                    </datalist>
                    <input type="number" className="id-priority-input" value={rulePriority} onChange={(e) => setRulePriority(e.target.value)} title="priority" />
                    <button type="button" className="primary-button id-mini" onClick={addCategoryRule} disabled={!ruleCategory.trim()}>เพิ่มกฎ</button>
                  </div>
                  <p className="id-hint">* เลือกได้เฉพาะหมวดที่ยืนยันแล้วในระบบ — ไม่สร้างหมวดใหม่ และไม่กระทบการยืนยันหมวดสินค้า</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MATCHED PRODUCTS ── */}
      {subTab === "matched" && (
        <div className="id-matched">
          <div className="id-search-row">
            <input type="text" className="rq-search" placeholder="ค้นหา: รหัส / ชื่อสินค้า / สาร" value={matchedSearch}
              onChange={(e) => setMatchedSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") loadMatched(0); }} />
            <label className="id-filter-label">
              <span>ยืนยัน</span>
              <select
                className="id-select"
                value={matchedStatusFilter}
                onChange={(e) => {
                  setMatchedStatusFilter(e.target.value);
                  setMatchedOffset(0);
                }}
                title="กรองสถานะการยืนยัน"
              >
                <option value="">ทั้งหมดที่ยังไม่ถูกปฏิเสธ</option>
                <option value="proposed">รอยืนยัน</option>
                <option value="confirmed">ยืนยันแล้ว</option>
                <option value="needs_review">ต้องทบทวน</option>
                <option value="rejected">ปฏิเสธแล้ว</option>
              </select>
            </label>
            <button type="button" className="ghost-button" onClick={() => loadMatched(0)}>ค้นหา</button>
          </div>
          <div className="id-matched-toolbar">
            <span className="id-list-meta">{matchedTotal.toLocaleString()} รายการ — กดยืนยัน/ปฏิเสธสารที่ระบบเดาไว้</span>
            {matchedSelected.size > 0 && (
              <span className="id-bulk-bar">
                เลือก {matchedSelected.size} รายการ:
                <button type="button" className="primary-button id-mini" onClick={() => bulkMatched("confirmed")}>✓ ยืนยันที่เลือก</button>
                <button type="button" className="ghost-button id-mini" onClick={() => bulkMatched("rejected")}>✗ ปฏิเสธที่เลือก</button>
                <button type="button" className="ghost-button id-mini" onClick={() => setMatchedSelected(new Set())}>ล้าง</button>
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table className="id-table">
              <thead>
                <tr>
                  <th></th>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th>สารที่จับคู่</th>
                  <th>ที่มา</th>
                  <th>สถานะ</th>
                  <th>
                    <label className="id-th-filter">
                      <span>ยืนยัน</span>
                      <select
                        value={matchedStatusFilter}
                        onChange={(e) => {
                          setMatchedStatusFilter(e.target.value);
                          setMatchedOffset(0);
                        }}
                        aria-label="กรองสถานะยืนยัน"
                      >
                        <option value="">ทั้งหมด</option>
                        <option value="proposed">รอยืนยัน</option>
                        <option value="confirmed">ยืนยันแล้ว</option>
                        <option value="needs_review">ต้องทบทวน</option>
                        <option value="rejected">ปฏิเสธแล้ว</option>
                      </select>
                    </label>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingMatched ? (
                  <tr><td colSpan={7} className="empty-state">กำลังโหลด...</td></tr>
                ) : matched.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">ยังไม่มีสินค้าที่จับคู่ใน product_ingredients</td></tr>
                ) : (
                  matched.map((m, idx) => {
                    const key = `${m.productCode}|${m.ingredientId}`;
                    return (
                      <tr key={`${m.productCode}-${idx}`} className={m.ingredientStatus === "rejected" ? "id-row-rejected" : ""}>
                        <td><input type="checkbox" checked={matchedSelected.has(key)} onChange={() => toggleMatchedSelect(key)} /></td>
                        <td><code>{m.productCode}</code></td>
                        <td>{m.productName}</td>
                        <td>{m.matchedIngredient}{m.strengthValue != null && <span className="id-strength"> {m.strengthValue}{m.strengthUnit || ""}</span>}</td>
                        <td>{m.matchSource}</td>
                        <td><span className={`id-badge ${m.ingredientStatus === "confirmed" ? "good" : m.ingredientStatus === "rejected" ? "muted" : ""}`}>{ingStatusLabel(m.ingredientStatus)}</span></td>
                        <td className="id-confirm-cell">
                          <button type="button" className={`id-confirm-btn ok${m.ingredientStatus === "confirmed" ? " on" : ""}`} title="ยืนยัน" onClick={() => confirmMatched(m, "confirmed")}>✓</button>
                          <button type="button" className={`id-confirm-btn no${m.ingredientStatus === "rejected" ? " on" : ""}`} title="ปฏิเสธ" onClick={() => confirmMatched(m, "rejected")}>✗</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="id-pager">
            <button type="button" className="ghost-button" disabled={matchedOffset === 0 || loadingMatched} onClick={() => loadMatched(Math.max(0, matchedOffset - MATCHED_PAGE))}>← ก่อนหน้า</button>
            <span>{matchedTotal === 0 ? 0 : matchedOffset + 1}–{Math.min(matchedOffset + MATCHED_PAGE, matchedTotal)} / {matchedTotal}</span>
            <button type="button" className="ghost-button" disabled={matchedOffset + MATCHED_PAGE >= matchedTotal || loadingMatched} onClick={() => loadMatched(matchedOffset + MATCHED_PAGE)}>ถัดไป →</button>
          </div>
        </div>
      )}

      {/* ── POTENTIAL DISCOVERIES ── */}
      {subTab === "discoveries" && (
        <div className="id-discoveries">
          <div className="id-list-meta">
            คำที่พบบ่อยในชื่อสินค้าที่ยังจับคู่ไม่ได้ — ใช้เป็นตัวช่วยขยายพจนานุกรม
            {discoveryTotal > 0 && <> (จากทั้งหมด {discoveryTotal.toLocaleString()} สินค้า)</>}
          </div>
          <div className="table-wrap">
            <table className="id-table">
              <thead>
                <tr><th>#</th><th>คำ</th><th>จำนวนสินค้า</th><th>% ของแคตตาล็อก</th></tr>
              </thead>
              <tbody>
                {loadingDiscoveries ? (
                  <tr><td colSpan={4} className="empty-state">กำลังสแกนชื่อสินค้า...</td></tr>
                ) : discoveries.length === 0 ? (
                  <tr><td colSpan={4} className="empty-state">ไม่มีข้อมูล</td></tr>
                ) : (
                  discoveries.map((d, idx) => (
                    <tr key={d.token}>
                      <td>{idx + 1}</td>
                      <td><strong>{d.token}</strong></td>
                      <td>{d.productCount.toLocaleString()}</td>
                      <td>{d.coveragePct.toFixed(2)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="id-hint">* คำเหล่านี้รวมชื่อยี่ห้อ/บรรจุภัณฑ์ด้วย — เภสัชกรควรเลือกเฉพาะที่เป็นสารสำคัญจริงก่อนเพิ่มเข้าพจนานุกรม</p>
        </div>
      )}
    </section>
  );
}

function ReviewQueuePanel({ csrfToken }) {
  // phase: idle → reviewing → summary → done
  const [phase, setPhase]           = useState("idle");
  const [queue, setQueue]           = useState([]);          // current batch of products
  const [allCategories, setAllCats] = useState([]);          // every known confirmed category
  const [totalInQueue, setTotal]    = useState(null);
  const [loading, setLoading]       = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Per-session state
  const [decisions, setDecisions]   = useState([]);          // [{productCode,productNameThai,categoryName,isNew?,skipped?}]
  const [currentIdx, setCurrentIdx] = useState(0);           // index into queue[]
  const [search, setSearch]         = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState("");

  const searchRef  = useRef(null);
  const newCatRef  = useRef(null);

  // ── Load queue ──────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async (filter) => {
    setLoading(true);
    try {
      const f = filter || statusFilter;
      const response = await apiFetch(`/api/admin/review-queue?limit=80&status=${f}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setQueue(data.records || []);
      setAllCats(data.allCategories || []);
      setTotal(data.total || 0);
      return (data.records || []).length;
    } catch (e) {
      setSubmitMsg("โหลดคิวไม่สำเร็จ: " + e.message);
      return 0;
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // ── Current product ─────────────────────────────────────────────────────────
  const product = queue[currentIdx] || null;

  // Category options sorted: proposed first (if any), then by similarity
  const options = useMemo(() => {
    if (!product) return [];
    const opts = [...(product.options || [])];
    if (product.currentCategory && !opts.find(o => o.category_name === product.currentCategory)) {
      opts.unshift({ category_name: product.currentCategory, similarity: null, isProposed: true });
    }
    return opts;
  }, [product]);

  const searchableCategories = useMemo(() => {
    const byName = new Map();

    for (const option of options) {
      const name = normalizeFilterValue(option?.category_name);
      if (!name) continue;
      byName.set(name, {
        category_name: name,
        similarity: option?.similarity ?? null,
        isProposed: Boolean(option?.isProposed),
      });
    }

    for (const category of allCategories) {
      const name = normalizeFilterValue(category);
      if (!name || byName.has(name)) continue;
      byName.set(name, {
        category_name: name,
        similarity: null,
        isProposed: false,
      });
    }

    return [...byName.values()].sort((left, right) => {
      if (left.isProposed && !right.isProposed) return -1;
      if (!left.isProposed && right.isProposed) return 1;
      return left.category_name.localeCompare(right.category_name, "th", {
        sensitivity: "base",
        numeric: true,
      });
    });
  }, [options, allCategories]);

  // Filtered options for search
  const filteredOptions = useMemo(() => {
    const q = normalizeCategorySearchValue(search);
    if (!q) return options.slice(0, 9);
    return searchableCategories
      .filter((option) => normalizeCategorySearchValue(option.category_name).includes(q))
      .slice(0, 9);
  }, [search, options, searchableCategories]);

  // ── Decision helpers ────────────────────────────────────────────────────────
  const pickCategory = useCallback((categoryName, isNew = false) => {
    if (!product) return;
    setDecisions(prev => {
      const next = prev.filter(d => d.productCode !== product.productCode);
      next.push({ productCode: product.productCode, productNameThai: product.productNameThai, categoryName, isNew, skipped: false });
      return next;
    });
    setSearch("");
    setShowNewCat(false);
    setNewCatName("");
    if (currentIdx + 1 >= queue.length) {
      setPhase("summary");
    } else {
      setCurrentIdx(i => i + 1);
    }
  }, [product, currentIdx, queue.length]);

  const skipProduct = useCallback(() => {
    if (!product) return;
    setDecisions(prev => {
      const next = prev.filter(d => d.productCode !== product.productCode);
      next.push({ productCode: product.productCode, productNameThai: product.productNameThai, categoryName: null, skipped: true });
      return next;
    });
    setSearch("");
    if (currentIdx + 1 >= queue.length) {
      setPhase("summary");
    } else {
      setCurrentIdx(i => i + 1);
    }
  }, [product, currentIdx, queue.length]);

  const goBack = useCallback(() => {
    if (currentIdx === 0) return;
    setDecisions(prev => prev.filter(d => d.productCode !== (queue[currentIdx - 1]?.productCode)));
    setSearch("");
    setShowNewCat(false);
    setCurrentIdx(i => i - 1);
  }, [currentIdx, queue]);

  const createNewCategory = useCallback(() => {
    const name = newCatName.trim();
    if (!name) return;
    apiFetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    setAllCats(prev => [...new Set([...prev, name])].sort());
    pickCategory(name, true);
  }, [newCatName, csrfToken, pickCategory]);

  // ── Keyboard handler ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "reviewing") return;
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && filteredOptions[n - 1]) {
        e.preventDefault();
        pickCategory(filteredOptions[n - 1].category_name);
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        goBack();
      } else if ((e.key === "s" || e.key === "S") && !e.ctrlKey) {
        e.preventDefault();
        skipProduct();
      } else if ((e.key === "n" || e.key === "N") && !e.ctrlKey) {
        e.preventDefault();
        setShowNewCat(true);
        setTimeout(() => newCatRef.current?.focus(), 50);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, filteredOptions, pickCategory, goBack, skipProduct]);

  // ── Confirm batch ───────────────────────────────────────────────────────────
  async function confirmAll() {
    const toConfirm = decisions.filter(d => !d.skipped && d.categoryName);
    if (!toConfirm.length) return;
    setSubmitting(true);
    setSubmitMsg("");
    try {
      const response = await apiFetch("/api/admin/review-queue/confirm-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({ decisions: toConfirm.map(d => ({ productCode: d.productCode, categoryName: d.categoryName, isNewCategory: d.isNew || false })) }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setSubmitMsg(`ยืนยันสำเร็จ ${toConfirm.length} รายการ`);
      setPhase("done");
    } catch (e) {
      setSubmitMsg("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startSession() {
    setDecisions([]);
    setCurrentIdx(0);
    setSearch("");
    setShowNewCat(false);
    setNewCatName("");
    setSubmitMsg("");
    setPhase("reviewing");
  }

  function resetAll() {
    setPhase("idle");
    setQueue([]);
    setDecisions([]);
    setCurrentIdx(0);
    setTotal(null);
    setSubmitMsg("");
  }

  const confirmed  = decisions.filter(d => !d.skipped && d.categoryName).length;
  const skipped    = decisions.filter(d => d.skipped).length;
  const progress   = queue.length ? Math.round(((confirmed + skipped) / queue.length) * 100) : 0;

  // ── IDLE ────────────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "done") {
    return (
      <section className="panel rq-panel">
        <div className="panel-header">
          <h2>ตรวจหมวดสินค้า</h2>
          <p>ยืนยันหมวดของสินค้าที่ระบบยังไม่แน่ใจ — แต่ละรายการใช้เวลาไม่กี่วินาที</p>
        </div>

        {submitMsg && <p className="notice success compact">{submitMsg}</p>}

        <div className="rq-start-grid">
          {[
            { key: "all",          label: "ทั้งหมด",                desc: "รอตรวจ + ต้องทบทวน" },
            { key: "proposed",     label: "รอตรวจ",                  desc: "ระบบเดาไว้ รอ approve" },
            { key: "needs_review", label: "ต้องทบทวน",               desc: "ระบบไม่รู้ ต้องหาเอง" },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`rq-start-card${statusFilter === opt.key ? " active" : ""}`}
              onClick={() => setStatusFilter(opt.key)}
            >
              <strong>{opt.label}</strong>
              <span>{opt.desc}</span>
            </button>
          ))}
        </div>

        <div className="rq-start-actions">
          <button
            type="button"
            className="primary-button"
            onClick={async () => {
              const loaded = await loadQueue(statusFilter);
              if (loaded > 0) {
                startSession();
              } else {
                setSubmitMsg("ไม่พบสินค้าในคิวสำหรับตัวกรองนี้");
              }
            }}
            disabled={loading}
          >
            {loading ? "กำลังโหลด..." : "เริ่มตรวจ →"}
          </button>
          {totalInQueue !== null && (
            <span className="rq-queue-count">
              {totalInQueue.toLocaleString()} รายการในคิว
            </span>
          )}
        </div>
      </section>
    );
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  if (phase === "summary") {
    return (
      <section className="panel rq-panel">
        <div className="rq-summary-header">
          <h2>สรุปก่อนยืนยัน</h2>
          <p>ตรวจสอบรายการด้านล่าง แก้ไขได้ก่อนกด "ยืนยันทั้งหมด"</p>
        </div>

        {submitMsg && <p className={`notice ${submitMsg.includes("ผิด") ? "error" : "success"} compact`}>{submitMsg}</p>}

        <div className="rq-summary-stats">
          <span className="rq-stat good">{confirmed} รายการพร้อม</span>
          {skipped > 0 && <span className="rq-stat muted">{skipped} ข้าม</span>}
        </div>

        <div className="rq-summary-list">
          {decisions.filter(d => !d.skipped).map((d, i) => (
            <div key={d.productCode} className="rq-summary-row">
              <span className="rq-summary-name">{d.productNameThai}</span>
              <span className={`rq-summary-cat${d.isNew ? " new" : ""}`}>
                {d.categoryName}
                {d.isNew && <span className="rq-new-badge">ใหม่</span>}
              </span>
              <button
                type="button"
                className="ghost-button rq-edit-btn"
                onClick={() => {
                  setCurrentIdx(i);
                  setDecisions(prev => prev.filter((_, idx) => idx !== i));
                  setPhase("reviewing");
                }}
              >
                แก้
              </button>
            </div>
          ))}
        </div>

        <div className="rq-summary-actions">
          <button type="button" className="ghost-button" onClick={() => setPhase("reviewing")}>
            ← กลับตรวจต่อ
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={confirmAll}
            disabled={submitting || confirmed === 0}
          >
            {submitting ? "กำลังบันทึก..." : `✓ ยืนยัน ${confirmed} รายการ`}
          </button>
        </div>
      </section>
    );
  }

  // ── REVIEWING ───────────────────────────────────────────────────────────────
  if (!product) {
    return (
      <section className="panel rq-panel">
        <p className="empty-state">คิวว่าง — ไม่มีสินค้าที่ต้องตรวจ</p>
        <button type="button" className="ghost-button" onClick={resetAll}>กลับ</button>
      </section>
    );
  }

  return (
    <section className="panel rq-panel rq-reviewing">
      {/* ── top bar ── */}
      <div className="rq-topbar">
        <button type="button" className="ghost-button rq-back-btn" onClick={goBack} disabled={currentIdx === 0} title="← กลับ (ArrowLeft)">
          ←
        </button>
        <div className="rq-progress-wrap">
          <div className="rq-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <span className="rq-counter">{currentIdx + 1} / {queue.length}</span>
        <button type="button" className="ghost-button rq-summary-btn" onClick={() => setPhase("summary")}>
          สรุป ({confirmed})
        </button>
      </div>

      {/* ── product name ── */}
      <div className="rq-product">
        <div className="rq-product-name">{product.productNameThai}</div>
        {product.productNameEng && <div className="rq-product-eng">{product.productNameEng}</div>}
        <div className="rq-product-meta">
          {product.productCode}
          {product.barcode && <> · {product.barcode}</>}
          {product.reviewStatus === "proposed" && product.currentCategory && (
            <span className="rq-proposed-badge">ระบบเดา: {product.currentCategory}</span>
          )}
        </div>
      </div>

      {/* ── ingredient knowledge layer (read-only) ── */}
      <IngredientSuggestions productCode={product.productCode} onUseCategory={pickCategory} csrfToken={csrfToken} />

      {/* ── category buttons ── */}
      {!showNewCat && (
        <div className="rq-options">
          {filteredOptions.map((opt, i) => (
            <button
              key={opt.category_name}
              type="button"
              className={`rq-option${opt.category_name === product.currentCategory ? " rq-option-proposed" : ""}`}
              onClick={() => pickCategory(opt.category_name)}
              title={opt.similarity ? `${Math.round(opt.similarity * 100)}% similarity` : ""}
            >
              <span className="rq-option-key">{i + 1}</span>
              <span className="rq-option-name">{opt.category_name}</span>
              {opt.similarity != null && (
                <span className="rq-option-sim">{Math.round(opt.similarity * 100)}%</span>
              )}
            </button>
          ))}
          {!filteredOptions.length && (
            <div className="rq-option-empty">
              ไม่พบหมวดที่ตรงกับคำค้น ลองพิมพ์คำอื่นหรือสร้างหมวดใหม่
            </div>
          )}
        </div>
      )}

      {/* ── search ── */}
      {!showNewCat && (
        <div className="rq-search-row">
          <input
            ref={searchRef}
            type="text"
            className="rq-search"
            placeholder="/ ค้นหาหมวด..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") { setSearch(""); e.target.blur(); }
              if (e.key === "Enter" && filteredOptions.length === 1) pickCategory(filteredOptions[0].category_name);
            }}
          />
        </div>
      )}

      {/* ── new category ── */}
      {showNewCat ? (
        <div className="rq-newcat-row">
          <input
            ref={newCatRef}
            type="text"
            className="rq-search"
            placeholder="ชื่อหมวดใหม่..."
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") createNewCategory();
              if (e.key === "Escape") { setShowNewCat(false); setNewCatName(""); }
            }}
            autoFocus
          />
          <button type="button" className="primary-button" onClick={createNewCategory} disabled={!newCatName.trim()}>
            สร้าง + เลือก
          </button>
          <button type="button" className="ghost-button" onClick={() => { setShowNewCat(false); setNewCatName(""); }}>
            ยกเลิก
          </button>
        </div>
      ) : (
        <div className="rq-footer-actions">
          <button type="button" className="ghost-button rq-newcat-btn" onClick={() => { setShowNewCat(true); setTimeout(() => newCatRef.current?.focus(), 50); }} title="N">
            + สร้างหมวดใหม่
          </button>
          <button type="button" className="ghost-button rq-skip-btn" onClick={skipProduct} title="S">
            ข้ามไปก่อน
          </button>
        </div>
      )}

      {/* ── keyboard hint ── */}
      <div className="rq-hints">
        <span>1–9 เลือก</span><span>/ ค้นหา</span><span>N หมวดใหม่</span><span>S ข้าม</span><span>← กลับ</span>
      </div>
    </section>
  );
}

// ── Nightly Sync Log ─────────────────────────────────────────────────────────
const BRANCH_LABELS = {
  "000": "สาขา 000 (HQ)",
  "001": "สาขา 001",
  "003": "สาขา 003",
  "004": "สาขา 004",
  "005": "สาขา 005",
};

function syncLogStatusIcon(status) {
  if (status === "success") return { icon: "✅", label: "สำเร็จ",              cls: "sl-success" };
  if (status === "failed")  return { icon: "❌", label: "ล้มเหลว",             cls: "sl-failed"  };
  if (status === "running") return { icon: "⏳", label: "กำลังรัน",            cls: "sl-running" };
  if (status === "pending") return { icon: "🌙", label: "รอคืนนี้",            cls: "sl-pending" };
  if (status === "waiting") return { icon: "🕐", label: "รอ sync ชั่วโมงนี้",  cls: "sl-pending" };
  if (status === "offline") return { icon: "💤", label: "ปิดเครื่อง",          cls: "sl-offline" };
  return { icon: "—",  label: "ไม่มีข้อมูล", cls: "sl-unknown" };
}

function formatShortDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatSyncMetaValue(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSyncLogStamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SyncEventLog({ mode, days, hours, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!syncEventLogEnabled) {
      setEvents([]);
      setLoading(false);
      setError("");
      setUnavailable(false);
      return undefined;
    }

    let active = true;
    const params = new URLSearchParams({ limit: "60" });
    if (mode === "nightly") {
      params.set("days", String(days));
    } else {
      params.set("hours", String(hours));
    }

    setLoading(true);
    setError("");
    setUnavailable(false);
    apiFetch(`/api/sync/recent-events?${params.toString()}`)
      .then((res) => {
        if ([401, 403, 404, 405, 501].includes(res.status)) {
          throw new Error("SYNC_EVENT_LOG_UNAVAILABLE");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (active) setEvents(Array.isArray(json) ? json : []); })
      .catch((err) => {
        if (!active) return;
        if (err.message === "SYNC_EVENT_LOG_UNAVAILABLE") {
          setUnavailable(true);
          setEvents([]);
          return;
        }
        setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [mode, days, hours, refreshKey]);

  if (!syncEventLogEnabled) {
    return null;
  }

  return (
    <section className="sync-event-log">
      <div className="sync-event-log-header">
        <h3>Log เวลาที่ส่งเข้า</h3>
        <span>
          {mode === "nightly"
            ? `แสดงรายการย้อนหลัง ${days} วัน`
            : `แสดงรายการย้อนหลัง ${hours} ชั่วโมง`}
        </span>
      </div>

      {unavailable ? (
        <p className="empty-state">backend ปัจจุบันยังไม่เปิด recent event log ส่วนนี้</p>
      ) : null}
      {error ? <p className="notice error compact">❌ โหลด log ไม่ได้: {error}</p> : null}
      {loading ? <p className="empty-state">⏳ กำลังโหลด log...</p> : null}
      {!loading && !error && !unavailable && events.length === 0 ? (
        <p className="empty-state">ยังไม่มี log การส่งในช่วงเวลานี้</p>
      ) : null}

      {!loading && !error && !unavailable && events.length > 0 ? (
        <div className="sync-event-log-list">
          {events.map((event) => {
            const status = event.status ?? "offline";
            const { icon, label, cls } = syncLogStatusIcon(status);
            return (
              <article key={event.syncRunId} className={`sync-event-log-item ${cls}`}>
                <div className="sync-event-log-main">
                  <strong>{BRANCH_LABELS[event.branchCode] ?? `สาขา ${event.branchCode}`}</strong>
                  <span>{icon} {label}</span>
                  <span>เริ่มส่ง {formatSyncLogStamp(event.startedAt)}</span>
                  <span>เสร็จ {formatSyncLogStamp(event.finishedAt)}</span>
                </div>
                <div className="sync-event-log-sub">
                  <span>ประเภท {event.syncType || "-"}</span>
                  <span>อ่าน {formatNumber(event.recordsRead ?? 0)} รายการ</span>
                  <span>ส่ง {formatNumber(event.recordsSent ?? 0)} รายการ</span>
                </div>
                <div className="sync-event-log-message">{event.message?.trim() || "-"}</div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SyncLogMetaCard({ selection, mode }) {
  if (!selection) {
    return (
      <div className="sync-log-meta-card">
        <div className="sync-log-meta-empty">กดที่ช่องในตารางเพื่อดู metadata ของการ sync ล่าสุด</div>
      </div>
    );
  }

  const { branch, slotLabel, slotValue, cell } = selection;
  const status = cell?.status ?? "offline";
  const { icon, label } = syncLogStatusIcon(status);
  const items = [
    { label: mode === "nightly" ? "วันที่" : "ช่วงเวลา", value: slotLabel },
    { label: "สาขา", value: BRANCH_LABELS[branch] ?? `สาขา ${branch}` },
    { label: "สถานะช่อง", value: `${icon} ${label}` },
    { label: "sync ล่าสุดเริ่ม", value: formatSyncMetaValue(cell?.latestStartedAt) },
    { label: "sync ล่าสุดเสร็จ", value: formatSyncMetaValue(cell?.latestFinishedAt) },
    { label: "sync type", value: cell?.syncType || "-" },
    { label: "run status ล่าสุด", value: cell?.latestRunStatus || "-" },
    { label: "จำนวนครั้งที่รัน", value: formatNumber(cell?.totalRuns ?? 0) },
    { label: "ส่งรวมในช่องนี้", value: formatNumber(cell?.totalSent ?? 0) },
    { label: "records read ล่าสุด", value: formatNumber(cell?.recordsRead ?? 0) },
    { label: "records sent ล่าสุด", value: formatNumber(cell?.recordsSent ?? 0) },
  ];

  if (mode === "nightly") {
    items.push(
      { label: "heartbeat ล่าสุด", value: formatSyncMetaValue(cell?.latestHeartbeatAt) },
      { label: "จำนวน heartbeat", value: formatNumber(cell?.heartbeatCount ?? 0) },
    );
  }

  return (
    <div className="sync-log-meta-card">
      <div className="sync-log-meta-header">
        <strong>{BRANCH_LABELS[branch] ?? `สาขา ${branch}`}</strong>
        <span>{slotValue}</span>
      </div>
      <div className="sync-log-meta-grid">
        {items.map((item) => (
          <div key={item.label} className="sync-log-meta-item">
            <span className="sync-log-meta-label">{item.label}</span>
            <strong className="sync-log-meta-value">{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="sync-log-meta-message">
        <span className="sync-log-meta-label">message ล่าสุด</span>
        <div className="sync-log-meta-message-body">{cell?.message?.trim() || "-"}</div>
      </div>
    </div>
  );
}

// ── Nightly sub-tab ───────────────────────────────────────────────────────
function NightlySyncGrid({ days, refreshKey, onUnauthorized }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/sync/nightly-log?days=${days}`)
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized?.();
          throw new Error("SESSION_EXPIRED");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (active) setData(json); })
      .catch((err) => {
        if (!active) return;
        if (err.message === "SESSION_EXPIRED") {
          setError("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
          return;
        }
        setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, refreshKey]);

  useEffect(() => {
    setSelection(null);
  }, [days, refreshKey]);

  const dates    = data?.dates    ?? [];
  const branches = data?.branches ?? ["000", "001", "003", "004", "005"];
  const rows     = data?.rows     ?? {};

  if (error)   return <p className="notice error compact">❌ โหลดไม่ได้: {error}</p>;
  if (loading) return <p className="empty-state">⏳ กำลังโหลด...</p>;
  if (dates.length === 0)
    return <p className="empty-state">ยังไม่มีข้อมูล sync — รอให้ laptop สาขารันครั้งแรกก่อน</p>;

  return (
    <>
      <div className="table-wrap sync-log-table-wrap">
        <table className="sync-log-table">
          <thead>
            <tr>
              <th className="sync-log-branch-col">สาขา</th>
              {dates.map((d) => (
                <th key={d} className="sync-log-date-col" title={d}>
                  {formatShortDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch}>
                <td className="sync-log-branch-label">{BRANCH_LABELS[branch] ?? `สาขา ${branch}`}</td>
                {dates.map((d) => {
                  const cell = rows[branch]?.[d] ?? { status: "offline" };
                  const status = typeof cell === "string" ? cell : cell.status;
                  const { icon, label, cls } = syncLogStatusIcon(status);
                  const isActive = selection?.branch === branch && selection?.slotValue === d;
                  return (
                    <td
                      key={d}
                      className={`sync-log-cell ${cls}${isActive ? " active" : ""}`}
                      title={`${BRANCH_LABELS[branch] ?? branch} · ${d} · ${label}`}
                      onClick={() => setSelection({
                        branch,
                        slotLabel: formatShortDate(d),
                        slotValue: d,
                        cell: typeof cell === "string" ? { status: cell } : cell,
                      })}
                    >
                      <span aria-label={label}>{icon}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sync-log-legend">
        {[
          { icon: "✅", label: "สำเร็จ" },
          { icon: "❌", label: "ล้มเหลว (laptop เปิด แต่ sync error)" },
          { icon: "💤", label: "ปิดเครื่อง (ไม่มี heartbeat)" },
          { icon: "🌙", label: "วันนี้ — รอ sync คืนนี้" },
        ].map(({ icon, label }) => (
          <span key={label} className="sync-log-legend-item">{icon} {label}</span>
        ))}
      </div>
      <SyncLogMetaCard selection={selection} mode="nightly" />
    </>
  );
}

// ── Hourly sub-tab ─────────────────────────────────────────────────────────
function formatHourLabel(hourKey) {
  // hourKey = "2026-05-28 14:00"  →  two-line: "14:00" / "28/5"
  if (!hourKey) return "";
  const [datePart, timePart] = hourKey.split(" ");
  if (!datePart || !timePart) return hourKey;
  const [, mm, dd] = datePart.split("-");
  return `${timePart}\n${Number(dd)}/${Number(mm)}`;
}

function HourlySyncGrid({ hours, refreshKey, onUnauthorized }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/sync/hourly-log?hours=${hours}`)
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized?.();
          throw new Error("SESSION_EXPIRED");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (active) setData(json); })
      .catch((err) => {
        if (!active) return;
        if (err.message === "SESSION_EXPIRED") {
          setError("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
          return;
        }
        setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hours, refreshKey]);

  useEffect(() => {
    setSelection(null);
  }, [hours, refreshKey]);

  const hourKeys = data?.hours    ?? [];
  const branches = data?.branches ?? ["000", "001", "003", "004", "005"];
  const rows     = data?.rows     ?? {};

  // Show most-recent hours on the LEFT → reverse for display
  const displayHours = [...hourKeys].reverse();

  if (error)   return <p className="notice error compact">❌ โหลดไม่ได้: {error}</p>;
  if (loading) return <p className="empty-state">⏳ กำลังโหลด...</p>;
  if (hourKeys.length === 0)
    return <p className="empty-state">ยังไม่มีข้อมูล sync — รอให้รันครั้งแรกก่อน</p>;

  return (
    <>
      <div className="table-wrap sync-log-table-wrap">
        <table className="sync-log-table">
          <thead>
            <tr>
              <th className="sync-log-branch-col">สาขา</th>
              {displayHours.map((h) => {
                const lines = formatHourLabel(h).split("\n");
                return (
                  <th key={h} className="sync-log-hour-col" title={h}>
                    <span style={{ display: "block" }}>{lines[0]}</span>
                    <span style={{ display: "block", opacity: 0.65 }}>{lines[1]}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch}>
                <td className="sync-log-branch-label">{BRANCH_LABELS[branch] ?? `สาขา ${branch}`}</td>
                {displayHours.map((h) => {
                  const cell   = rows[branch]?.[h];
                  const rawStatus = cell?.status ?? "offline";
                  // Remap to hourly-specific icons
                  const status = rawStatus === "pending" ? "waiting"
                               : rawStatus === "offline" ? "unknown"
                               : rawStatus;
                  const sent   = cell?.totalSent ?? 0;
                  const { icon, label, cls } = syncLogStatusIcon(status);
                  const isActive = selection?.branch === branch && selection?.slotValue === h;
                  return (
                    <td
                      key={h}
                      className={`sync-log-cell-hour ${cls}${isActive ? " active" : ""}`}
                      title={`${BRANCH_LABELS[branch] ?? branch} · ${h} · ${label}${sent > 0 ? ` · ${sent} รายการ` : ""}`}
                      onClick={() => setSelection({
                        branch,
                        slotLabel: h,
                        slotValue: h,
                        cell,
                      })}
                    >
                      <span aria-label={label}>{icon}</span>
                      {status === "success" && sent > 0 && (
                        <span className="sync-log-total-sent">{sent}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sync-log-legend">
        {[
          { icon: "✅", label: "ส่งข้อมูลสำเร็จ" },
          { icon: "❌", label: "ส่งไม่สำเร็จ (มี error)" },
          { icon: "—",  label: "ไม่มีการส่ง (ชั่วโมงนั้น)" },
          { icon: "🕐", label: "ชั่วโมงปัจจุบัน — รอ sync" },
        ].map(({ icon, label }) => (
          <span key={label} className="sync-log-legend-item">{icon} {label}</span>
        ))}
      </div>
      <SyncLogMetaCard selection={selection} mode="hourly" />
    </>
  );
}

// ── SyncLogPanel — outer shell with sub-tabs ───────────────────────────────
function SyncLogPanel({ onUnauthorized }) {
  const [subTab, setSubTab]       = useState("nightly");
  const [nightlyDays, setNightlyDays] = useState(14);
  const [hourlyHours, setHourlyHours] = useState(24);
  const [refreshKey, setRefreshKey]   = useState(0);

  const isNightly = subTab === "nightly";

  return (
    <section className="panel sync-log-panel">
      <div className="panel-header">
        <div>
          <h2>ประวัติ Sync</h2>
          <div className="sync-log-subtabs" style={{ marginTop: "8px" }}>
            <button
              type="button"
              className={`sync-log-subtab${isNightly ? " active" : ""}`}
              onClick={() => setSubTab("nightly")}
            >
              🌙 รายคืน
            </button>
            <button
              type="button"
              className={`sync-log-subtab${!isNightly ? " active" : ""}`}
              onClick={() => setSubTab("hourly")}
            >
              ⏱ รายชั่วโมง
            </button>
          </div>
          <p style={{ marginTop: "6px" }}>
            {isNightly
              ? "สถานะการซิงก์ข้อมูลจาก Mother PC แต่ละสาขา — ✅ สำเร็จ · ❌ ล้มเหลว · 💤 ปิดเครื่อง · 🌙 รอคืนนี้"
              : "สถานะการส่งข้อมูลรายชั่วโมงจาก Mother PC (Task Scheduler) — ✅ ส่งสำเร็จ · ❌ error · — ไม่มีการส่ง · 🕐 กำลังรอ"}
          </p>
        </div>
        <div className="toolbar">
          {isNightly ? (
            <label className="date-label">
              ย้อนหลัง
              <select
                value={nightlyDays}
                onChange={(e) => setNightlyDays(Number(e.target.value))}
                className="date-input-inline"
                style={{ marginLeft: "6px" }}
              >
                <option value={7}>7 วัน</option>
                <option value={14}>14 วัน</option>
                <option value={30}>30 วัน</option>
              </select>
            </label>
          ) : (
            <label className="date-label">
              ย้อนหลัง
              <select
                value={hourlyHours}
                onChange={(e) => setHourlyHours(Number(e.target.value))}
                className="date-input-inline"
                style={{ marginLeft: "6px" }}
              >
                <option value={12}>12 ชั่วโมง</option>
                <option value={24}>24 ชั่วโมง</option>
                <option value={48}>48 ชั่วโมง</option>
              </select>
            </label>
          )}
          <button
            type="button"
            className="ghost-button"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            🔄 รีเฟรช
          </button>
        </div>
      </div>

      {isNightly
        ? <NightlySyncGrid days={nightlyDays} refreshKey={refreshKey} onUnauthorized={onUnauthorized} />
        : <HourlySyncGrid  hours={hourlyHours} refreshKey={refreshKey} onUnauthorized={onUnauthorized} />}

      <SyncEventLog
        mode={subTab}
        days={nightlyDays}
        hours={hourlyHours}
        refreshKey={refreshKey}
        onUnauthorized={onUnauthorized}
      />
    </section>
  );
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
  const [view, setView] = useState(() => {
    if (typeof window === "undefined") return defaultAdminView;
    const savedView = window.localStorage.getItem(adminViewStorageKey);
    return adminViewKeys.includes(savedView)
      ? savedView
      : defaultAdminView;
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [requestDraftItems, setRequestDraftItems] = useState([]);
  const [requestBatchNote, setRequestBatchNote] = useState("");
  const requestIdempotencyKeyRef = useRef(generateRequestIdempotencyKey());
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
  const stockRequestBadgeCount = requestDraftItems.length + unreadNotifCount;
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

  const refreshUnreadNotifCount = useCallback(async () => {
    if (!branchCode) {
      setUnreadNotifCount(0);
      return;
    }
    try {
      const res = await apiFetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadNotifCount(data.unreadCount || 0);
    } catch {
      // silent
    }
  }, [branchCode]);

  useEffect(() => {
    if (!branchCode) { setUnreadNotifCount(0); return undefined; }
    let active = true;
    async function fetchUnread() {
      try {
        const res = await apiFetch("/api/notifications/unread-count");
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) setUnreadNotifCount(data.unreadCount || 0);
      } catch { /* silent */ }
    }
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [branchCode]);

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
    setRequestDraftItems([]);
    setRequestBatchNote("");
    requestIdempotencyKeyRef.current = generateRequestIdempotencyKey();
  }

  async function handleSubmitDraft({ onStart, onSuccess, onError, onFinally } = {}) {
    if (onStart) onStart();
    try {
      const payload = buildStockRequestPayload(requestDraftItems, {
        note: requestBatchNote,
        idempotencyKey: requestIdempotencyKeyRef.current,
      });
      if (!payload.groups.length) throw new Error("ยังไม่มีรายการที่พร้อมส่งคำขอ");
      const response = await apiFetch("/api/stock-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session?.csrfToken || "" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || `HTTP ${response.status}`);
      handleClearDraft();
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
  }, [view]);

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
  const navigationGroups = useMemo(() => getNavigationGroups(isAdminUser), [isAdminUser]);

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
            const groupHasNotif = stockRequestBadgeCount > 0 && group.items.some((item) => item.view === "stock-requests");
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
                    <span className="nav-notif-badge nav-trigger-badge">{stockRequestBadgeCount > 99 ? "99+" : stockRequestBadgeCount}</span>
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
          {(session?.user?.role === "admin" || !branchCode) ? <div className="branch-context-card">
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
          branchCode={branchCode}
          branchName={activeBranchName}
          onNavigate={() => setView("stock-requests")}
          requestDraftItems={requestDraftItems}
          setRequestDraftItems={setRequestDraftItems}
          onClearDraft={handleClearDraft}
        />
      ) : view === "stock-requests" ? (
        <StockRequestsPanel
          branchCode={branchCode}
          csrfToken={session.csrfToken}
          requestDraftItems={requestDraftItems}
          setRequestDraftItems={setRequestDraftItems}
          requestBatchNote={requestBatchNote}
          setRequestBatchNote={setRequestBatchNote}
          onSubmitDraft={handleSubmitDraft}
          onClearDraft={handleClearDraft}
          incomingNotifCount={unreadNotifCount}
          onIncomingNotificationsChanged={refreshUnreadNotifCount}
        />
      ) : view === "movement-trace" ? (
        <ProductMovementTracePanel branchCode={branchCode} csrfToken={session.csrfToken} />
      ) : view === stockCostAuditView && isAdminUser ? (
        <StockCostAuditPanel branchCode={branchCode} />
      ) : view === "category-review" && isAdminUser ? (
        <ReviewQueuePanel csrfToken={session.csrfToken} />
      ) : view === "ingredient-dictionary" && isAdminUser ? (
        <IngredientDictionaryPanel csrfToken={session.csrfToken} />
      ) : view === "sync-log" && isAdminUser ? (
        <SyncLogPanel onUnauthorized={handleSyncUnauthorized} />
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
