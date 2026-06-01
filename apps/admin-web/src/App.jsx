import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const adminViewStorageKey = "sc-stockday-admin-view";
const adminThemeStorageKey = "sc-stockday-admin-theme";

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
];

// Lowercase and strip whitespace, dots, and hyphens so matching tolerates
// casing, inconsistent spacing, and punctuation in Adasoft data
// (e.g. "ที เอ็น พี" vs "ทีเอ็นพี", "พี.เค.เอส." vs "พีเคเอส").
function normalizeSupplierText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s.-]+/g, "");
}

function getSupplierBrand(supplierName) {
  const normalized = normalizeSupplierText(supplierName);
  if (!normalized) return null;

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

async function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
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

function PurchaseReceiptsPanel({ branchCode, canViewPrices }) {
  const receiptPageSize = 10;
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingRecords, setPendingRecords] = useState([]);
  const [approvedRecords, setApprovedRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [approvedSortOrder, setApprovedSortOrder] = useState("desc");
  const [pendingDateFilter, setPendingDateFilter] = useState("");
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

  function toggleDoc(docNo) {
    setExpandedDocs((prev) => ({ ...prev, [docNo]: !prev[docNo] }));
  }

  async function fetchPending({ page = pendingPage, search = appliedSearchTerm, date = pendingDateFilter } = {}) {
    setLoadingPending(true);
    setPendingError("");
    try {
      const params = new URLSearchParams({
        branchCode,
        page: String(page),
        pageSize: String(receiptPageSize),
      });
      if (search) params.set("search", search);
      if (date) params.set("date", date);
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
    date = selectedDate,
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
      if (date) params.set("date", date);
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
  }, [appliedSearchTerm, branchCode, pendingDateFilter, pendingPage, pendingRefreshKey]);

  useEffect(() => {
    fetchApproved();
  }, [approvedPage, approvedRefreshKey, appliedSearchTerm, branchCode, selectedDate, approvedSortOrder]);

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
    const supplierBrand = getSupplierBrand(record.supplierName || record.supplierCode);
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
          <input
            type="search"
            className="receipt-search-input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ค้นหา SKU, ชื่อสินค้า, ผู้จำหน่าย, เลขที่เอกสาร"
          />
          <label className="date-label receipt-date-label">
            วันที่
            <input
              type="date"
              value={activeTab === "pending" ? pendingDateFilter : selectedDate}
              onChange={(event) => {
                if (activeTab === "pending") {
                  setPendingDateFilter(event.target.value);
                  setPendingPage(1);
                  return;
                }
                setSelectedDate(event.target.value);
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
          <button type="submit" className="ghost-button receipt-search-button">
            ค้นหา
          </button>
          <button
            type="button"
            className="ghost-button receipt-refresh-button"
            onClick={handleRefresh}
            disabled={activeTab === "pending" ? loadingPending : loadingApproved}
          >
            🔄 รีเฟรช
          </button>
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
              {selectedDate ? "ยังไม่มีเอกสารรับของสำหรับวันที่เลือก" : "ยังไม่มีเอกสารรับของ"}
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
    </section>
  );
}

function BranchStockPanel({ csrfToken, isAdminUser }) {
  const pageSize = 25;
  const pageFetchLimit = 10000;
  const branchExportOptions = [
    { branchCode: "000", label: "สาขา 000 (HQ)" },
    { branchCode: "001", label: "สาขา 001" },
    { branchCode: "003", label: "สาขา 003" },
    { branchCode: "004", label: "สาขา 004" },
    { branchCode: "005", label: "สาขา 005" },
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
  const filterMenuRef = useRef(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);

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

    function handleScroll() {
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
      anchor.download = fileNameMatch?.[1] || `branch-stock-${selectedExportBranch}.xlsx`;
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
        </form>
      </div>

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
      {loading && <p className="empty-state">กำลังโหลดข้อมูลสต็อกสาขา...</p>}
      {!loading && !error && !records.length && (
        <p className="empty-state">ไม่พบข้อมูลสต็อกสาขาตามเงื่อนไขที่ค้นหา</p>
      )}

      <div className="table-wrap">
        <table className="branch-stock-table">
          <thead>
            <tr>
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
                {BRANCH_STOCK_COLUMNS.map((column) => (
                  <td key={`${row.productCode}-${column.key}`}>{renderBranchStockCell(row, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
                  <span>ดึงเฉพาะคอลัมน์จำนวนของ {option.label}</span>
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
                {exporting ? "กำลังสร้างไฟล์..." : `ดาวน์โหลด ${selectedExportBranch}`}
              </button>
            </div>
          </div>
        </div>
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

// ── Nightly sub-tab ───────────────────────────────────────────────────────
function NightlySyncGrid({ days, refreshKey }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/sync/nightly-log?days=${days}`)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((json) => { if (active) setData(json); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
                  const status = rows[branch]?.[d] ?? "offline";
                  const { icon, label, cls } = syncLogStatusIcon(status);
                  return (
                    <td key={d} className={`sync-log-cell ${cls}`}
                        title={`${BRANCH_LABELS[branch] ?? branch} · ${d} · ${label}`}>
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

function HourlySyncGrid({ hours, refreshKey }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/sync/hourly-log?hours=${hours}`)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((json) => { if (active) setData(json); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
                  return (
                    <td key={h}
                        className={`sync-log-cell-hour ${cls}`}
                        title={`${BRANCH_LABELS[branch] ?? branch} · ${h} · ${label}${sent > 0 ? ` · ${sent} รายการ` : ""}`}>
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
    </>
  );
}

// ── SyncLogPanel — outer shell with sub-tabs ───────────────────────────────
function SyncLogPanel() {
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
        ? <NightlySyncGrid days={nightlyDays} refreshKey={refreshKey} />
        : <HourlySyncGrid  hours={hourlyHours} refreshKey={refreshKey} />}
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
  const [currentPage, setCurrentPage] = useState(1);
  const [view, setView] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    const savedView = window.localStorage.getItem(adminViewStorageKey);
    return ["dashboard", "receipts", "branch-stock", "category-review", "sync-log"].includes(savedView)
      ? savedView
      : "dashboard";
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    const savedTheme = window.localStorage.getItem(adminThemeStorageKey);
    return savedTheme === "light" ? "light" : "dark";
  });
  const accountMenuRef = useRef(null);
  const branchCode = import.meta.env.VITE_BRANCH_CODE || "005";

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
      setLoading(false);
      setStockDay([]);
      setOrderRequests([]);
      setSyncStatus(null);
      setError("");
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

  useEffect(() => {
    if (!isAdminUser && (view === "category-review" || view === "sync-log")) {
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

        <nav className="view-nav" aria-label="เมนูหลัก">
          <button
            type="button"
            className="view-nav-btn view-nav-btn-disabled"
            disabled
            aria-disabled="true"
          >
            หน้าหลักแดชบอร์ด
            <span className="view-nav-badge">เร็วๆนี้</span>
          </button>
          <button
            type="button"
            className={view === "receipts" ? "view-nav-btn active" : "view-nav-btn"}
            onClick={() => setView("receipts")}
          >
            ใบรับสินค้า
          </button>
          <button
            type="button"
            className={view === "branch-stock" ? "view-nav-btn active" : "view-nav-btn"}
            onClick={() => setView("branch-stock")}
          >
            สต็อกสาขา
          </button>
          {isAdminUser ? (
            <>
              <button
                type="button"
                className={view === "category-review" ? "view-nav-btn active" : "view-nav-btn"}
                onClick={() => setView("category-review")}
              >
                ตรวจหมวดสินค้า
              </button>
              <button
                type="button"
                className={view === "sync-log" ? "view-nav-btn active" : "view-nav-btn"}
                onClick={() => setView("sync-log")}
              >
                ประวัติ Sync
              </button>
            </>
          ) : null}
        </nav>

        <div className="account-actions">
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

      {view === "receipts" ? (
        <PurchaseReceiptsPanel
          branchCode={branchCode}
          canViewPrices={session.user.role === "admin"}
        />
      ) : view === "branch-stock" ? (
        <BranchStockPanel csrfToken={session.csrfToken} isAdminUser={isAdminUser} />
      ) : view === "category-review" && isAdminUser ? (
        <ReviewQueuePanel csrfToken={session.csrfToken} />
      ) : view === "sync-log" && isAdminUser ? (
        <SyncLogPanel />
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
