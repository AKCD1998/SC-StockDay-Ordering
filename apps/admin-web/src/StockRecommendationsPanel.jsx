import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const ACTION_LABELS = {
  NO_ACTION: "ยังไม่ต้องสั่ง",
  TRANSFER_IN: "ขอจากสาขาอื่น",
  PURCHASE: "สั่งซื้อเพิ่ม",
  TRANSFER_AND_PURCHASE: "ขอ + ซื้อเพิ่ม",
  NO_PURCHASE_SLOW_MOVING: "หมุนช้า",
};

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

  const displayedSummary = useMemo(() => companySummary || summary, [companySummary, summary]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <section className="panel stock-recommendations-panel">
      <div className="panel-header stacked">
        <div>
          <h2>คำแนะนำสต๊อก</h2>
          <p>ดูว่าแต่ละสินค้าในแต่ละสาขาควรถือสต๊อกประมาณเท่าไหร่ ควรขอจากสาขาไหน หรือควรซื้อเพิ่มหรือไม่</p>
        </div>
        <div className="toolbar cluster-toolbar">
          <form className="search-row inline-search" onSubmit={handleSearchSubmit}>
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
            <button type="submit">ค้นหา</button>
          </form>
          <div className="toolbar">
            {isAdminUser ? (
              <select value={scopeBranchCode} onChange={(event) => setScopeBranchCode(event.target.value)}>
                <option value="all">ทุกสาขา</option>
                <option value="000">000</option>
                <option value="001">001</option>
                <option value="003">003</option>
                <option value="004">004</option>
                <option value="005">005</option>
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

      <div className="summary-grid stock-recommendations-summary-grid">
        <SummaryCard label="SKU ในผลลัพธ์" value={formatNumber(rows.length)} />
        <SummaryCard label="มูลค่าสต๊อกปัจจุบัน" value={formatNumber(displayedSummary?.currentInventoryValue)} />
        <SummaryCard label="มูลค่าที่เป้าหมาย 90 วัน" value={formatNumber(displayedSummary?.projectedInventoryValueAtTarget)} />
        <SummaryCard label="โอกาสลดต้นทุน" value={formatNumber(displayedSummary?.potentialReductionValue)} />
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

      {!loading ? (
        <div className="stock-recommendations-layout">
          <div className="stock-recommendations-table-shell">
            <table className="stock-recommendations-table">
              <thead>
                <tr>
                  <th>สาขา</th>
                  <th>สินค้า</th>
                  <th>มีอยู่</th>
                  <th>เป้าหมาย</th>
                  <th>cover</th>
                  <th>action</th>
                  <th>แนะนำขอ</th>
                  <th>แนะนำซื้อ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.branchCode}-${row.productCode}`}
                    className={selectedRow?.branchCode === row.branchCode && selectedRow?.productCode === row.productCode ? "selected" : ""}
                    onClick={() => setSelectedRow(row)}
                  >
                    <td>{row.branchCode}</td>
                    <td>
                      <strong>{row.productCode}</strong>
                      <div className="subtle">{row.productNameThai || row.productNameEng || "-"}</div>
                    </td>
                    <td>{formatNumber(row.currentStock)}</td>
                    <td>{formatNumber(row.targetQty)}</td>
                    <td>{formatNumber(row.currentDaysCover, 1)}</td>
                    <td>
                      <span className={`stock-recommendation-badge tone-${actionTone(row.action)}`}>
                        {ACTION_LABELS[row.action] || row.action}
                      </span>
                    </td>
                    <td>{formatNumber(row.transferPlanQty)}</td>
                    <td>{formatNumber(row.purchaseQty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="stock-recommendation-detail-card">
            {!selectedRow ? (
              <p className="subtle">เลือกแถวเพื่อดูรายละเอียด recommendation</p>
            ) : detailLoading ? (
              <p className="subtle">กำลังโหลดรายละเอียด...</p>
            ) : detail ? (
              <>
                <div className="stock-recommendation-detail-header">
                  <div>
                    <h3>{detail.productNameThai || detail.productNameEng || detail.productCode}</h3>
                    <p className="subtle">{detail.productCode} · สาขา {detail.branchCode}</p>
                  </div>
                  <span className={`stock-recommendation-badge tone-${actionTone(detail.action)}`}>
                    {ACTION_LABELS[detail.action] || detail.action}
                  </span>
                </div>
                <div className="stock-recommendation-detail-grid">
                  <div><span>มีอยู่</span><strong>{formatNumber(detail.currentStock)}</strong></div>
                  <div><span>incoming</span><strong>{formatNumber(detail.incomingPoAllocationQty)}</strong></div>
                  <div><span>เป้าหมาย</span><strong>{formatNumber(detail.targetQty)}</strong></div>
                  <div><span>effective cover</span><strong>{formatNumber(detail.effectiveDaysCover, 1)}</strong></div>
                </div>
                <p><strong>เหตุผล:</strong> {detail.recommendationReason || detail.reason || "-"}</p>
                <p><strong>แนะนำขอจากสาขาอื่น:</strong> {formatNumber(detail.transferPlanQty)}</p>
                <p><strong>แนะนำสั่งซื้อเพิ่ม:</strong> {formatNumber(detail.purchaseQty)}</p>
                <p><strong>donor หลัก:</strong> {detail.primarySuggestedDonorBranchCode || "-"}</p>
                <p><strong>อัปเดตจาก backend:</strong> {formatDateTime(detail.generatedAt || selectedRow.generatedAt)}</p>
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
