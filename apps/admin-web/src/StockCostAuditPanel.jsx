import { Fragment, useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

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

async function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
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

export default StockCostAuditPanel;
