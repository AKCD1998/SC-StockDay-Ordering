import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const BRANCH_COLUMNS = [
  { code: "000", label: "สาขา 000 (HQ)" },
  { code: "001", label: "สาขา 001" },
  { code: "003", label: "สาขา 003" },
  { code: "004", label: "สาขา 004" },
  { code: "005", label: "สาขา 005" },
];

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

// datetime-local inputs give "YYYY-MM-DDTHH:mm" in the browser's local time —
// interpret it as such and convert to an ISO instant for the API.
function toIsoOrNull(datetimeLocalValue) {
  if (!datetimeLocalValue) return null;
  const parsed = new Date(datetimeLocalValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function apiFetch(path) {
  return fetch(`${apiBaseUrl}${path}`, { credentials: "include" });
}

export default function BranchStockHistoryPanel() {
  const [productCode, setProductCode] = useState("");
  const [atFromInput, setAtFromInput] = useState("");
  const [atToInput, setAtToInput] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Accepts overrides so callers that just changed state (e.g. the clear
  // buttons) can search with the new values immediately, without waiting a
  // render for setState to land in atFromInput/atToInput.
  async function runSearch({ productCode: productCodeOverride, atFromInput: atFromOverride, atToInput: atToOverride } = {}) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const effectiveProductCode = (productCodeOverride ?? productCode).trim();
      if (effectiveProductCode) {
        params.set("product_code", effectiveProductCode);
      }
      const atFrom = toIsoOrNull(atFromOverride ?? atFromInput);
      const atTo = toIsoOrNull(atToOverride ?? atToInput);
      if (atFrom) params.set("at_from", atFrom);
      if (atTo) params.set("at_to", atTo);

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

  function handleSearch(event) {
    event?.preventDefault?.();
    return runSearch();
  }

  function clearAtFrom() {
    setAtFromInput("");
    runSearch({ atFromInput: "" });
  }

  function clearAtTo() {
    setAtToInput("");
    runSearch({ atToInput: "" });
  }

  useEffect(() => {
    // Show the latest snapshot on first load, same as clearing both dates.
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasTimeFilter = Boolean(atFromInput || atToInput);

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
        <input
          type="text"
          placeholder="รหัสสินค้า (ไม่บังคับ)"
          value={productCode}
          onChange={(event) => setProductCode(event.target.value)}
        />
        <div className="stock-history-datetime-field">
          <input
            type="datetime-local"
            aria-label="จากวันเวลา"
            value={atFromInput}
            onChange={(event) => setAtFromInput(event.target.value)}
          />
          {atFromInput ? (
            <button
              type="button"
              className="stock-history-datetime-clear"
              aria-label="ล้างจากวันเวลา"
              onClick={clearAtFrom}
            >
              ×
            </button>
          ) : null}
        </div>
        <span className="stock-history-date-sep">ถึง</span>
        <div className="stock-history-datetime-field">
          <input
            type="datetime-local"
            aria-label="ถึงวันเวลา"
            value={atToInput}
            onChange={(event) => setAtToInput(event.target.value)}
          />
          {atToInput ? (
            <button
              type="button"
              className="stock-history-datetime-clear"
              aria-label="ล้างถึงวันเวลา"
              onClick={clearAtTo}
            >
              ×
            </button>
          ) : null}
        </div>
        <button type="submit" className="ghost-button" disabled={loading}>
          {loading ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </form>

      <p className="meta-line stock-history-hint">
        {hasTimeFilter
          ? "แสดง snapshot ที่ใกล้เคียงที่สุดหลังจากเวลาที่ตั้ง (หรือก่อนหน้า ถ้าตั้งแค่ \"ถึง\")"
          : "ยังไม่ได้ตั้งช่วงเวลา — แสดงยอดล่าสุดของแต่ละสาขา"}
      </p>

      {error && <div className="notice error">{error}</div>}

      {hasSearched && !loading && !error && records.length === 0 ? (
        <div className="notice">ไม่พบข้อมูลในช่วงเวลาที่เลือก</div>
      ) : records.length > 0 ? (
        <table className="stock-history-table">
          <thead>
            <tr>
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้า</th>
              {BRANCH_COLUMNS.map((col) => (
                <th key={col.code}>{col.label}</th>
              ))}
              <th>รวมทุกสาขา</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.productCode}>
                <td>{row.productCode}</td>
                <td>{row.productNameThai || "-"}</td>
                {BRANCH_COLUMNS.map((col) => (
                  <td key={col.code} className="stock-history-qty">
                    {formatNumber(row[`qtyBranch${col.code}`])}
                  </td>
                ))}
                <td className="stock-history-qty">{formatNumber(row.qtyTotalAllBranches)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
