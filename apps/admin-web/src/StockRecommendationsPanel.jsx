import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const ACTION_LABELS = {
  NO_ACTION: "ยังไม่ต้องสั่ง",
  TRANSFER_IN: "ขอจากสาขาอื่น",
  PURCHASE: "สั่งซื้อเพิ่ม",
  TRANSFER_AND_PURCHASE: "ขอ + ซื้อเพิ่ม",
  NO_PURCHASE_SLOW_MOVING: "หมุนช้า",
};

const BRANCH_OPTIONS = ["000", "001", "003", "004", "005"];

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

function SummaryCard({ label, value, hint = "" }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small className="subtle">{hint}</small> : null}
    </article>
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
  const [summary, setSummary] = useState(null);
  const [companySummary, setCompanySummary] = useState(null);
  const [branchSummaries, setBranchSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isAdminUser) {
      setScopeBranchCode(branchCode || "");
    }
  }, [branchCode, isAdminUser]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const branchParam = scopeBranchCode || branchCode || "";
        const params = new URLSearchParams({
          branchCode: branchParam,
          pageSize: "100",
          sort,
        });
        if (search.trim()) params.set("search", search.trim());
        if (action) params.set("action", action);

        const summaryParams = new URLSearchParams({
          branchCode: isAdminUser ? (scopeBranchCode || "all") : (branchCode || ""),
        });

        const [listRes, summaryRes] = await Promise.all([
          apiFetch(`/api/admin/stock-recommendations?${params.toString()}`),
          apiFetch(`/api/admin/stock-recommendations/summary?${summaryParams.toString()}`),
        ]);

        const listData = await listRes.json().catch(() => ({}));
        const summaryData = await summaryRes.json().catch(() => ({}));
        if (!listRes.ok) throw new Error(listData.error || listData.message || `HTTP ${listRes.status}`);
        if (!summaryRes.ok) throw new Error(summaryData.error || summaryData.message || `HTTP ${summaryRes.status}`);
        if (!active) return;
        setRows(Array.isArray(listData.rows) ? listData.rows : []);
        setSummary(listData.summary || null);
        setCompanySummary(summaryData.company || null);
        setBranchSummaries(Array.isArray(summaryData.branches) ? summaryData.branches : []);
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
  }, [action, branchCode, isAdminUser, scopeBranchCode, search, sort]);

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

  const displayedSummary = useMemo(() => companySummary || summary, [companySummary, summary]);
  const actionableRows = useMemo(
    () => rows.filter((row) => !["NO_ACTION", "NO_PURCHASE_SLOW_MOVING"].includes(row.action)),
    [rows],
  );
  const scopeLabel = getScopeLabel(scopeBranchCode, isAdminUser, branchCode);
  const targetDays = detail?.targetDays || rows[0]?.targetDays || 90;
  const selectedRecommendation = detail || selectedRow;
  const lastGeneratedAt = rows[0]?.generatedAt || detail?.generatedAt || null;

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
        <div className="toolbar cluster-toolbar">
          <form className="toolbar branch-stock-toolbar stock-recommendations-toolbar" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ค้นหา SKU ชื่อสินค้า หรือ barcode"
            />
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">ทุก action</option>
              <option value="TRANSFER_IN">ขอจากสาขาอื่น</option>
              <option value="PURCHASE">สั่งซื้อเพิ่ม</option>
              <option value="TRANSFER_AND_PURCHASE">ขอ + ซื้อเพิ่ม</option>
              <option value="NO_PURCHASE_SLOW_MOVING">หมุนช้า</option>
              <option value="NO_ACTION">ยังไม่ต้องสั่ง</option>
            </select>
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
          </form>
          <div className="toolbar">
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
        </div>
      </div>

      <div className="stock-recommendation-hero">
        <div className="stock-recommendation-hero-copy">
          <strong>คิวตัดสินใจสำหรับ {scopeLabel}</strong>
          <span>ระบบสรุปให้ก่อนว่าสินค้าตัวไหนควรขอย้าย, ซื้อเพิ่ม, หรือชะลอการซื้อจาก stock จริง + sold 30/90 วัน + incoming PO</span>
        </div>
        <div className="stock-recommendation-hero-meta">
          <span>เป้าหมาย days cover: {formatNumber(targetDays)}</span>
          <span>อัปเดตล่าสุด: {formatDateTime(lastGeneratedAt)}</span>
        </div>
      </div>

      <div className="summary-grid stock-recommendations-summary-grid">
        <SummaryCard label="SKU ในผลลัพธ์" value={formatNumber(rows.length)} hint={scopeLabel} />
        <SummaryCard label="SKU ที่ต้องลงมือ" value={formatNumber(actionableRows.length)} hint="ขอของหรือซื้อเพิ่ม" />
        <SummaryCard label="มูลค่าสต๊อกปัจจุบัน" value={formatNumber(displayedSummary?.currentInventoryValue)} />
        <SummaryCard label="มูลค่าที่เป้าหมาย 90 วัน" value={formatNumber(displayedSummary?.projectedInventoryValueAtTarget)} />
        <SummaryCard label="โอกาสลดต้นทุน" value={formatNumber(displayedSummary?.potentialReductionValue)} hint="ถ้าปรับลงใกล้ target days" />
      </div>

      {branchSummaries.length > 0 ? (
        <div className="stock-recommendation-branch-grid">
          {branchSummaries.map((branch) => (
            <article key={branch.branchCode} className="stock-recommendation-branch-card">
              <strong>{branch.label}</strong>
              <span>days cover เฉลี่ย {formatNumber(branch.averageDaysCover, 1)} วัน</span>
              <span>ขอจากสาขาอื่น {formatNumber(branch.recommendTransferCount)} SKU</span>
              <span>ซื้อเพิ่ม {formatNumber(branch.recommendPurchaseCount)} SKU</span>
            </article>
          ))}
        </div>
      ) : null}

      {error ? <div className="notice error">{error}</div> : null}
      {loading ? <div className="notice">กำลังโหลด recommendation...</div> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="empty-cart-card stock-recommendation-empty">
          <strong>ยังไม่มี recommendation ที่เข้าเงื่อนไขใน {scopeLabel}</strong>
          <p className="empty-state">
            ตอนนี้ backend ไม่พบสินค้าในสcope นี้ที่มี stock / sales / incoming data มากพอสำหรับคำนวณแถว recommendation
            ลองเปลี่ยนสาขา, ล้างตัวกรอง, หรือค้นหา SKU ที่ทราบว่ามีการขายล่าสุด
          </p>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
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
    </section>
  );
}
