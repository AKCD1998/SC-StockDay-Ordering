import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Only branch 005 has a live AdaAcc connection reachable over Tailscale right
// now, so it is the only branch that can actually have rows in
// ada.stock_snapshots yet. The other branches are wired up on the UI (so the
// selector doesn't need to change again once they come online) but show a
// "pending sync" placeholder instead of calling the API, since calling it
// would just return an empty result that looks indistinguishable from "no
// stock movement," which is misleading.
const BRANCH_OPTIONS = [
  { branchCode: "000", label: "สาขา 000 (HQ)", synced: false },
  { branchCode: "001", label: "สาขา 001", synced: false },
  { branchCode: "003", label: "สาขา 003", synced: false },
  { branchCode: "004", label: "สาขา 004", synced: false },
  { branchCode: "005", label: "สาขา 005", synced: true },
];

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function todayInputValue() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function daysAgoInputValue(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function apiFetch(path) {
  return fetch(`${apiBaseUrl}${path}`, { credentials: "include" });
}

export default function BranchStockHistoryPanel() {
  const [branchCode, setBranchCode] = useState("005");
  const [productCode, setProductCode] = useState("");
  const [dateFrom, setDateFrom] = useState(daysAgoInputValue(7));
  const [dateTo, setDateTo] = useState(todayInputValue());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const selectedBranch = BRANCH_OPTIONS.find((b) => b.branchCode === branchCode) || BRANCH_OPTIONS[0];

  async function handleSearch(event) {
    event.preventDefault();
    if (!selectedBranch.synced) {
      // Nothing to fetch — the placeholder below already explains why.
      setRecords([]);
      setError("");
      setHasSearched(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        branch_code: branchCode,
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (productCode.trim()) {
        params.set("product_code", productCode.trim());
      }
      const response = await apiFetch(`/api/branch-stock/history?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setRecords(data.records || []);
    } catch (searchError) {
      setError(searchError.message || "โหลดข้อมูลย้อนหลังไม่สำเร็จ");
      setRecords([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }

  useEffect(() => {
    // Re-run the search automatically when switching branch, so the "pending
    // sync" placeholder (or a fresh table) shows immediately without the user
    // needing to press search again.
    handleSearch({ preventDefault: () => {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCode]);

  return (
    <section className="panel stock-history-panel">
      <div className="panel-header">
        <h2>สต๊อกดูย้อนหลัง</h2>
        <p>
          ข้อมูล snapshot สะสมตามรอบเวลาที่ sync จริง (ไม่ทับของเก่า) — ต่างจากหน้า
          "สต็อกสาขา" ที่โชว์แค่ยอดล่าสุด
        </p>
      </div>

      <form className="toolbar stock-history-toolbar" onSubmit={handleSearch}>
        <select value={branchCode} onChange={(event) => setBranchCode(event.target.value)}>
          {BRANCH_OPTIONS.map((option) => (
            <option key={option.branchCode} value={option.branchCode}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="รหัสสินค้า (ไม่บังคับ)"
          value={productCode}
          onChange={(event) => setProductCode(event.target.value)}
        />
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <span className="stock-history-date-sep">ถึง</span>
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        <button type="submit" className="ghost-button" disabled={loading || !selectedBranch.synced}>
          {loading ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </form>

      {error && <div className="notice error">{error}</div>}

      {!selectedBranch.synced ? (
        <div className="notice stock-history-pending">
          {selectedBranch.label}: ยังไม่มีข้อมูล sync ย้อนหลัง — ตอนนี้เชื่อมต่อได้เฉพาะสาขา 005 ผ่าน
          Tailscale เท่านั้น สาขาอื่นจะแสดงข้อมูลได้เมื่อเริ่ม sync จริง
        </div>
      ) : hasSearched && !loading && !error && records.length === 0 ? (
        <div className="notice">ไม่พบข้อมูลในช่วงวันที่ที่เลือก</div>
      ) : records.length > 0 ? (
        <table className="stock-history-table">
          <thead>
            <tr>
              <th>วันที่/เวลา sync</th>
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้า</th>
              <th>จำนวน</th>
              <th>หน่วย</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row, index) => (
              <tr key={`${row.productCode}-${row.snapshotAt}-${index}`}>
                <td>{formatDateTime(row.snapshotAt)}</td>
                <td>{row.productCode}</td>
                <td>{row.productNameThai || "-"}</td>
                <td className="stock-history-qty">{formatNumber(row.qty)}</td>
                <td>{row.unit || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
