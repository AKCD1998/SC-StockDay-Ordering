import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { formatInteger, formatThaiDate, toDateInputValue } from "../lib/format.js";

const today = new Date();
const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
const defaultTo = toDateInputValue(today);

const quickRanges = [
  { label: "7 วันล่าสุด", from: toDateInputValue(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)), to: defaultTo },
  { label: "ต้นเดือนถึงวันนี้", from: defaultFrom, to: defaultTo },
];

export default function SummaryPage() {
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState({
    dateFrom: defaultFrom,
    dateTo: defaultTo,
    branchCode: "",
    search: "",
    hideZero: true,
  });
  const [data, setData] = useState({ records: [], totals: { totalQtyBase: 0, totalOrders: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBranches().then((payload) => setBranches(payload.branches || [])).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .getSummary(filters)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setData({ records: [], totals: { totalQtyBase: 0, totalOrders: 0 } });
          setError(loadError.message || "โหลด summary ไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Drug summary</h2>
            <p>รวมปริมาณยาตามช่วงวันที่และสาขา โดยคงแนวทาง RPC summary ของระบบเดิมไว้</p>
          </div>
        </div>

        <div className="filter-grid">
          <label>
            เริ่มวันที่
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
          </label>
          <label>
            สิ้นสุดวันที่
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
          </label>
          <label>
            สาขา
            <select value={filters.branchCode} onChange={(event) => setFilters((current) => ({ ...current, branchCode: event.target.value }))}>
              <option value="">ทุกสาขา</option>
              {branches.map((branch) => (
                <option key={branch.branchCode} value={branch.branchCode}>
                  {branch.branchCode}
                </option>
              ))}
            </select>
          </label>
          <label>
            ค้นหายา
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="ชื่อยา หรือ company code" />
          </label>
        </div>

        <div className="form-actions">
          {quickRanges.map((range) => (
            <button
              key={range.label}
              type="button"
              className="ghost"
              onClick={() => setFilters((current) => ({ ...current, dateFrom: range.from, dateTo: range.to }))}
            >
              {range.label}
            </button>
          ))}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={filters.hideZero}
              onChange={(event) => setFilters((current) => ({ ...current, hideZero: event.target.checked }))}
            />
            ซ่อนรายการศูนย์
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="summary-grid">
          <article className="summary-card">
            <span>จำนวนรายการยา</span>
            <strong>{formatInteger(data.records?.length || 0)}</strong>
            <small>{`${formatThaiDate(filters.dateFrom)} ถึง ${formatThaiDate(filters.dateTo)}`}</small>
          </article>
          <article className="summary-card">
            <span>ยอดรวม base qty</span>
            <strong>{formatInteger(data.totals?.totalQtyBase || 0)}</strong>
            <small>คำนวณจากผล summary ทั้งชุด</small>
          </article>
          <article className="summary-card">
            <span>จำนวน order lines</span>
            <strong>{formatInteger(data.totals?.totalOrders || 0)}</strong>
            <small>จำนวนครั้งที่พบยาใน encounter</small>
          </article>
        </div>

        {loading ? <div className="notice">กำลังโหลด summary...</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {!loading ? (
          <div className="table-shell">
            <table className="lookup-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>ชื่อยา</th>
                  <th>Company</th>
                  <th>Qty</th>
                  <th>Base Qty</th>
                  <th>Orders</th>
                  <th>ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {data.records?.length ? (
                  data.records.map((row) => (
                    <tr key={`${row.skuId}-${row.companyCode}`}>
                      <td>{row.skuId || "-"}</td>
                      <td>{row.skuName || "-"}</td>
                      <td>{row.companyCode || "-"}</td>
                      <td>{formatInteger(row.totalQty || 0)}</td>
                      <td>{formatInteger(row.totalQtyBase || 0)}</td>
                      <td>{formatInteger(row.orders || 0)}</td>
                      <td>{formatThaiDate(row.lastSold)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="table-empty-state">
                      ไม่พบข้อมูล summary ตามเงื่อนไข
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
