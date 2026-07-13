import { useEffect, useMemo, useRef, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const ACTION_LABELS = {
  NO_ACTION: "ยังไม่ต้องสั่ง",
  TRANSFER_IN: "ขอจากสาขาอื่น",
  PURCHASE: "สั่งซื้อเพิ่ม",
  TRANSFER_AND_PURCHASE: "ขอ + ซื้อเพิ่ม",
  NO_PURCHASE_SLOW_MOVING: "หมุนช้า",
};

const BRANCH_OPTIONS = ["000", "001", "003", "004", "005"];
const DEFAULT_PAGE_SIZE = 25;

function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

function formatNumber(value, digits = 0) {
  if (value == null || value === "") return "-";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function actionTone(action) {
  if (action === "TRANSFER_IN") return "transfer";
  if (action === "PURCHASE" || action === "TRANSFER_AND_PURCHASE") return "purchase";
  if (action === "NO_PURCHASE_SLOW_MOVING") return "slow";
  return "neutral";
}

// Fake-progress loading overlay, same pattern as FocusProductsPanel.jsx's
// LoadingOverlay: simulated progress only ever climbs to 90%, and only jumps
// to 100% once `active` genuinely becomes false, so it can't visually finish
// before the real request has.
function SummaryLoadingOverlay({ active }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(active);
  const intervalRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

    if (active) {
      setVisible(true);
      setProgress(0);
      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          const step = p < 50 ? 4 : p < 75 ? 2 : 0.5;
          return Math.min(90, p + step);
        });
      }, 200);
    } else {
      setProgress(100);
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 350);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [active]);

  if (!visible) return null;

  return (
    <div className="fp-loading-overlay">
      <div className="fp-loading-box">
        <div className="fp-loading-spinner" />
        <div className="fp-loading-percent">{Math.round(progress)}%</div>
        <div className="fp-loading-bar-track">
          <div className="fp-loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="fp-loading-label">
          {progress < 90 ? "กำลังอัปเดตภาพรวมสาขา..." : "เกือบเสร็จแล้ว รอสักครู่..."}
        </div>
      </div>
    </div>
  );
}

function getScopeLabel(scopeBranchCode, isAdminUser, branchCode) {
  if (!isAdminUser) return branchCode ? `สาขา ${branchCode}` : "สาขาปัจจุบัน";
  if (!scopeBranchCode || scopeBranchCode === "all") return "ทุกสาขา";
  return `สาขา ${scopeBranchCode}`;
}

export default function StockRecommendationsPanel({ branchCode, isAdminUser }) {
  const [scopeBranchCode, setScopeBranchCode] = useState(isAdminUser ? "all" : branchCode || "");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [sort, setSort] = useState("priority_desc");
  const [rows, setRows] = useState([]);
  const [branchSummaries, setBranchSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  });

  useEffect(() => {
    if (!isAdminUser) {
      setScopeBranchCode(branchCode || "");
    }
  }, [branchCode, isAdminUser]);

  useEffect(() => {
    setPagination((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [action, branchCode, isAdminUser, scopeBranchCode, search, sort]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const branchParam = scopeBranchCode || branchCode || "";
        const params = new URLSearchParams({
          branchCode: branchParam,
          page: String(pagination.page),
          pageSize: String(pagination.pageSize),
          sort,
        });
        if (search.trim()) params.set("search", search.trim());
        if (action) params.set("action", action);

        const listRes = await apiFetch(`/api/admin/stock-recommendations?${params.toString()}`);

        const listData = await listRes.json().catch(() => ({}));
        if (!listRes.ok) throw new Error(listData.error || listData.message || `HTTP ${listRes.status}`);
        if (!active) return;
        setRows(Array.isArray(listData.rows) ? listData.rows : []);
        setPagination({
          page: Number(listData.pagination?.page || pagination.page || 1),
          pageSize: Number(listData.pagination?.pageSize || pagination.pageSize || DEFAULT_PAGE_SIZE),
          total: Number(listData.pagination?.total || 0),
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลด recommendation ไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [action, branchCode, pagination.page, pagination.pageSize, scopeBranchCode, search, sort]);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        setSummaryLoading(true);
        const summaryParams = new URLSearchParams({
          branchCode: isAdminUser ? (scopeBranchCode || "all") : (branchCode || ""),
        });
        const summaryRes = await apiFetch(`/api/admin/stock-recommendations/summary?${summaryParams.toString()}`);
        const summaryData = await summaryRes.json().catch(() => ({}));
        if (!summaryRes.ok) throw new Error(summaryData.error || summaryData.message || `HTTP ${summaryRes.status}`);
        if (!active) return;
        setBranchSummaries(Array.isArray(summaryData.branches) ? summaryData.branches : []);
      } catch (_error) {
        if (!active) return;
        setBranchSummaries([]);
      } finally {
        if (active) setSummaryLoading(false);
      }
    }
    loadSummary();
    return () => {
      active = false;
    };
  }, [branchCode, isAdminUser, scopeBranchCode]);

  useEffect(() => {
    if (!selectedRow) {
      setDetail(null);
      return undefined;
    }
    let active = true;
    async function loadDetail() {
      try {
        setDetailLoading(true);
        const response = await apiFetch(
          `/api/admin/stock-recommendations/${encodeURIComponent(selectedRow.branchCode)}/${encodeURIComponent(selectedRow.productCode)}`,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
        if (!active) return;
        setDetail(data.recommendation || null);
      } catch (_error) {
        if (!active) return;
        setDetail(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    }
    loadDetail();
    return () => {
      active = false;
    };
  }, [selectedRow]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedRow(null);
      return;
    }

    setSelectedRow((current) => {
      if (!current) return rows[0];
      const matched = rows.find(
        (row) => row.branchCode === current.branchCode && row.productCode === current.productCode,
      );
      return matched || rows[0];
    });
  }, [rows]);

  const scopeLabel = getScopeLabel(scopeBranchCode, isAdminUser, branchCode);
  const targetDays = detail?.targetDays || rows[0]?.targetDays || 90;
  const selectedRecommendation = detail || selectedRow;
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || DEFAULT_PAGE_SIZE)));
  const currentPage = Math.min(totalPages, Math.max(1, pagination.page || 1));
  const rangeStart = pagination.total === 0 ? 0 : (currentPage - 1) * (pagination.pageSize || DEFAULT_PAGE_SIZE) + 1;
  const rangeEnd = pagination.total === 0 ? 0 : rangeStart + rows.length - 1;
  const showLoadingOverlay = loading && (rows.length > 0 || pagination.total > 0);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <section className="panel stock-recommendations-panel">
      <div className="panel-header stacked">
        <div>
          <h2>คำแนะนำสต๊อก</h2>
          <p>ดูว่าแต่ละสินค้าใน{scopeLabel}ควรถือสต๊อกประมาณเท่าไหร่ ควรขอจากสาขาไหน หรือควรซื้อเพิ่มหรือไม่ โดยอิงเป้าหมาย {targetDays} วัน</p>
        </div>
        <form className="stock-recommendations-toolbar-stack" onSubmit={handleSearchSubmit}>
          <div className="toolbar branch-stock-toolbar stock-recommendations-toolbar stock-recommendations-search-toolbar">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ค้นหา SKU ชื่อสินค้า หรือ barcode"
            />
            <button type="submit" className="ghost-button branch-stock-search-button">ค้นหา</button>
            <button
              type="button"
              className="ghost-button branch-stock-refresh-button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setAction("");
                setSort("priority_desc");
              }}
            >
              ล้างตัวกรอง
            </button>
          </div>
          <div className="toolbar cluster-toolbar stock-recommendations-select-row">
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">ทุก action</option>
              <option value="TRANSFER_IN">ขอจากสาขาอื่น</option>
              <option value="PURCHASE">สั่งซื้อเพิ่ม</option>
              <option value="TRANSFER_AND_PURCHASE">ขอ + ซื้อเพิ่ม</option>
              <option value="NO_PURCHASE_SLOW_MOVING">หมุนช้า</option>
              <option value="NO_ACTION">ยังไม่ต้องสั่ง</option>
            </select>
            {isAdminUser ? (
              <select value={scopeBranchCode} onChange={(event) => setScopeBranchCode(event.target.value)}>
                <option value="all">ทุกสาขา</option>
                {BRANCH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="priority_desc">เรียงตาม priority</option>
              <option value="days_cover_asc">เรียงตาม days cover ต่ำสุด</option>
              <option value="inventory_value_desc">เรียงตามมูลค่าสต๊อก</option>
              <option value="product_code_asc">เรียงตามรหัสสินค้า</option>
            </select>
          </div>
        </form>
      </div>

      {branchSummaries.length > 0 ? (
        <article className="stock-recommendation-branch-table-card">
          <table className="stock-recommendation-branch-table">
            <thead>
              <tr>
                <th>รหัสสาขา</th>
                <th>Stockday (วัน)</th>
              </tr>
            </thead>
            <tbody>
              {branchSummaries.map((branch) => (
                <tr key={branch.branchCode}>
                  <td>{branch.branchCode}</td>
                  <td>{branch.averageDaysCover != null ? formatNumber(branch.averageDaysCover, 1) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : null}

      <SummaryLoadingOverlay active={summaryLoading} />
      {error ? <div className="notice error">{error}</div> : null}
      <div className="branch-stock-loading-wrap stock-recommendations-loading-wrap">
        {showLoadingOverlay ? (
          <div className="branch-stock-loading-overlay stock-recommendations-loading-overlay" aria-live="polite" aria-label="กำลังโหลดคำแนะนำสต๊อก">
            <div className="branch-stock-spinner" />
            <div>กำลังโหลดคำแนะนำสต๊อก...</div>
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="empty-cart-card stock-recommendation-empty">
            <strong>ยังไม่มี recommendation ที่เข้าเงื่อนไขใน {scopeLabel}</strong>
            <p className="empty-state">
              ตอนนี้ backend ไม่พบสินค้าในสcope นี้ที่มี stock / sales / incoming data มากพอสำหรับคำนวณแถว recommendation
              ลองเปลี่ยนสาขา, ล้างตัวกรอง, หรือค้นหา SKU ที่ทราบว่ามีการขายล่าสุด
            </p>
          </div>
        ) : null}

        {(rows.length > 0 || loading) ? (
          <div className="stock-recommendations-layout">
            <div className="stock-recommendations-list">
              {rows.map((row) => {
                const isSelected =
                  selectedRow?.branchCode === row.branchCode &&
                  selectedRow?.productCode === row.productCode;
                return (
                  <button
                    type="button"
                    key={`${row.branchCode}-${row.productCode}`}
                    className={`stock-recommendation-row-card${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedRow(row)}
                    disabled={loading}
                  >
                    <div className="stock-recommendation-row-top">
                      <div>
                        <strong>{row.productNameThai || row.productNameEng || row.productCode}</strong>
                        <div className="meta-line">{row.productCode} · {scopeBranchCode === "all" ? `สาขา ${row.branchCode}` : scopeLabel}</div>
                      </div>
                      <span className={`stock-recommendation-badge tone-${actionTone(row.action)}`}>
                        {ACTION_LABELS[row.action] || row.action}
                      </span>
                    </div>
                    <div className="stock-recommendation-row-metrics">
                      <span>มี {formatNumber(row.currentStock)}</span>
                      <span>เป้า {formatNumber(row.targetQty)}</span>
                      <span>cover {formatNumber(row.currentDaysCover, 1)} วัน</span>
                      <span>priority {formatNumber(row.priorityScore, 0)}</span>
                    </div>
                    <div className="stock-recommendation-row-plan">
                      <span>ขอจากสาขาอื่น {formatNumber(row.transferPlanQty)}</span>
                      <span>ซื้อเพิ่ม {formatNumber(row.purchaseQty)}</span>
                      {row.primarySuggestedDonorBranchCode ? (
                        <span>donor หลัก {row.primarySuggestedDonorBranchCode}</span>
                      ) : (
                        <span>donor หลัก -</span>
                      )}
                    </div>
                    <p className="stock-recommendation-row-reason">
                      {row.recommendationReason || row.reason || "-"}
                    </p>
                  </button>
                );
              })}
            </div>

            <aside className="stock-recommendation-detail-card">
              {!selectedRow ? (
                <p className="subtle">เลือก SKU จากคิวด้านซ้ายเพื่อดูรายละเอียด recommendation และ donor plan</p>
              ) : detailLoading ? (
                <p className="subtle">กำลังโหลดรายละเอียด...</p>
              ) : selectedRecommendation ? (
                <>
                  <div className="stock-recommendation-detail-header">
                    <div>
                      <h3>{selectedRecommendation.productNameThai || selectedRecommendation.productNameEng || selectedRecommendation.productCode}</h3>
                      <p className="subtle">{selectedRecommendation.productCode} · สาขา {selectedRecommendation.branchCode}</p>
                    </div>
                    <span className={`stock-recommendation-badge tone-${actionTone(selectedRecommendation.action)}`}>
                      {ACTION_LABELS[selectedRecommendation.action] || selectedRecommendation.action}
                    </span>
                  </div>
                  <div className="stock-recommendation-detail-grid">
                    <div><span>มีอยู่</span><strong>{formatNumber(selectedRecommendation.currentStock)}</strong></div>
                    <div><span>incoming</span><strong>{formatNumber(selectedRecommendation.incomingPoAllocationQty)}</strong></div>
                    <div><span>เป้าหมาย</span><strong>{formatNumber(selectedRecommendation.targetQty)}</strong></div>
                    <div><span>effective cover</span><strong>{formatNumber(selectedRecommendation.effectiveDaysCover, 1)}</strong></div>
                    <div><span>ยอดขาย 30 วัน</span><strong>{formatNumber(selectedRecommendation.soldQty30d)}</strong></div>
                    <div><span>ยอดขาย 90 วัน</span><strong>{formatNumber(selectedRecommendation.soldQty90d)}</strong></div>
                    <div><span>แนะนำขอ</span><strong>{formatNumber(selectedRecommendation.transferPlanQty)}</strong></div>
                    <div><span>แนะนำซื้อ</span><strong>{formatNumber(selectedRecommendation.purchaseQty)}</strong></div>
                  </div>
                  <p><strong>เหตุผล:</strong> {selectedRecommendation.recommendationReason || selectedRecommendation.reason || "-"}</p>
                  {Array.isArray(detail?.donors) && detail.donors.length > 0 ? (
                    <div className="stock-recommendation-donor-list">
                      <strong>donor ที่ระบบเสนอ</strong>
                      {detail.donors.map((donor) => (
                        <div key={`${donor.branchCode}-${donor.qty || donor.availableQty}`} className="stock-recommendation-donor-item">
                          <span>{donor.branchName || `สาขา ${donor.branchCode}`}</span>
                          <span>{formatNumber(donor.qty ?? donor.availableQty)} หน่วย</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p><strong>donor หลัก:</strong> {selectedRecommendation.primarySuggestedDonorBranchCode || "-"}</p>
                  )}
                  <p><strong>อัปเดตจาก backend:</strong> {formatDateTime(selectedRecommendation.generatedAt || selectedRow.generatedAt)}</p>
                </>
              ) : (
                <p className="subtle">ไม่มีรายละเอียดเพิ่มเติม</p>
              )}
            </aside>
          </div>
        ) : null}
      </div>

      <div className="pagination stock-recommendation-pagination">
        <p className="pagination-info">
          {pagination.total === 0
            ? "0 รายการ"
            : `${formatNumber(rangeStart)}-${formatNumber(rangeEnd)} จาก ${formatNumber(pagination.total)} รายการ`}
        </p>
        <div className="pagination-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={loading || currentPage <= 1}
            onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
          >
            ก่อนหน้า
          </button>
          <span className="stock-recommendation-page-indicator">
            หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={loading || currentPage >= totalPages}
            onClick={() => setPagination((current) => ({ ...current, page: Math.min(totalPages, current.page + 1) }))}
          >
            ถัดไป
          </button>
        </div>
      </div>
    </section>
  );
}
