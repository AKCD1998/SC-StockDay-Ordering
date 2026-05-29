import { useEffect, useMemo, useRef, useState } from "react";
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
  if (status === "proposed") return "รอตรวจ";
  if (status === "needs_review") return "ต้องทบทวน";
  if (status === "reverify") return "ต้องตรวจซ้ำ";
  return status || "-";
}

function categoryStatusClass(status) {
  if (status === "confirmed") return "good";
  if (status === "proposed") return "warning";
  if (status === "reverify") return "danger";
  return "muted";
}

function compactFileName(value) {
  if (!value) return "-";
  const parts = String(value).split(/[\\/]/);
  return parts[parts.length - 1] || value;
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

function BranchStockPanel() {
  const pageSize = 25;
  const [records, setRecords] = useState([]);
  const [matchReport, setMatchReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [pagination, setPagination] = useState({
    limit: pageSize,
    offset: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadBranchStock() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
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
            limit: pageSize,
            offset,
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
  }, [appliedSearchTerm, offset, refreshKey]);

  useEffect(() => {
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
  }, [refreshKey]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    const nextSearch = searchTerm.trim();
    setAppliedSearchTerm(nextSearch);
    setOffset(0);
    if (nextSearch === appliedSearchTerm) {
      setRefreshKey((value) => value + 1);
    }
  }

  const total = pagination.total || 0;
  const currentPage = Math.floor((pagination.offset || 0) / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (pagination.offset || 0) + 1;
  const end = total === 0 ? 0 : (pagination.offset || 0) + records.length;
  const reportSummary = matchReport?.summary || null;
  const reportStats = matchReport?.stats || null;

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
          <button type="submit" className="ghost-button">
            ค้นหา
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            รีเฟรช
          </button>
        </form>
      </div>

      <section className="taxonomy-report-card">
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
      </section>

      {error && <p className="notice error compact">เชื่อมต่อไม่ได้: {error}</p>}
      {loading && <p className="empty-state">กำลังโหลดข้อมูลสต็อกสาขา...</p>}
      {!loading && !error && !records.length && (
        <p className="empty-state">ไม่พบข้อมูลสต็อกสาขาตามเงื่อนไขที่ค้นหา</p>
      )}

      <div className="table-wrap">
        <table className="branch-stock-table">
          <thead>
            <tr>
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้าไทย</th>
              <th>ชื่ออังกฤษ</th>
              <th>Barcode</th>
              <th>หน่วย</th>
              <th>หมวดหมู่</th>
              <th>สถานะหมวดหมู่</th>
              <th>สาขา 000</th>
              <th>สาขา 001</th>
              <th>สาขา 003</th>
              <th>สาขา 004</th>
              <th>สาขา 005</th>
              <th>รวมทุกสาขา</th>
              <th>synced_at</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.productCode}>
                <td><strong>{row.productCode}</strong></td>
                <td>{row.productNameThai || "-"}</td>
                <td>{row.productNameEng || "-"}</td>
                <td>{row.barcode || "-"}</td>
                <td>{row.unit || "-"}</td>
                <td>
                  <strong>{row.category || "-"}</strong>
                  {row.categoryRationale ? (
                    <div className="meta">{row.categoryRationale}</div>
                  ) : null}
                </td>
                <td>
                  <span className={`status ${categoryStatusClass(row.categoryStatus)}`}>
                    {translateCategoryReviewStatus(row.categoryStatus || "needs_review")}
                  </span>
                </td>
                <td>{formatNumber(row.qtyBranch000, 2)}</td>
                <td>{formatNumber(row.qtyBranch001, 2)}</td>
                <td>{formatNumber(row.qtyBranch003, 2)}</td>
                <td>{formatNumber(row.qtyBranch004, 2)}</td>
                <td>{formatNumber(row.qtyBranch005, 2)}</td>
                <td>{formatNumber(row.qtyTotalAllBranches, 2)}</td>
                <td>{formatDateTime(row.syncedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            onClick={() => setOffset((current) => current + pageSize)}
          >
            ถัดไป
          </button>
        </div>
      </div>
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
          <button
            type="button"
            className={view === "category-review" ? "view-nav-btn active" : "view-nav-btn"}
            onClick={() => setView("category-review")}
          >
            หมวดหมู่สินค้า
          </button>
          <button
            type="button"
            className={view === "sync-log" ? "view-nav-btn active" : "view-nav-btn"}
            onClick={() => setView("sync-log")}
          >
            ประวัติ Sync
          </button>
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
        <BranchStockPanel />
      ) : view === "category-review" ? (
        <CategoryReviewPanel decidedBy={session.user.id || "admin"} />
      ) : view === "sync-log" ? (
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
