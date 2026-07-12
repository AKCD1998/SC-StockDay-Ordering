import { useState, useEffect, useMemo } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: { ...(options.headers || {}) },
  });
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Date columns come over the wire as either "YYYY-MM-DD" or a full
// "YYYY-MM-DDT00:00:00.000Z" timestamp depending on the pg driver's date
// parsing — slicing the first 10 chars avoids any timezone re-interpretation.
function toIsoDateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

const FOCUS_TYPE_ORDER = ["salesperson", "pharmacist", "store_manager", "group_manager"];

const FOCUS_TYPE_LABELS = {
  salesperson: "โฟกัสรายคน (พนักงานขาย) — รวมทุกสาขา",
  pharmacist: "โฟกัสเภสัชกร — แยกปิดต่อสาขา",
  store_manager: "โฟกัสผู้จัดการหน้าร้าน — แยกปิดต่อสาขา",
  group_manager: "โฟกัสผู้จัดการกลุ่ม — ทุกสาขาต้องปิดครบ",
};

const FOCUS_TYPE_SHORT_LABELS = {
  salesperson: "รายคน",
  pharmacist: "เภสัชกร",
  store_manager: "ผจก.หน้าร้าน",
  group_manager: "ผจก.กลุ่ม",
};

const THAI_MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const EMPTY_FORM = {
  id: null,
  productCode: "",
  productName: "",
  focusType: "salesperson",
  targetQty: "",
  dateFrom: "",
  dateTo: "",
  branchCodes: [],
  note: "",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthBounds(year, month) {
  const from = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  return { from, to };
}

// A focus product "belongs to" a month if its date range overlaps that month at all.
function rowOverlapsMonth(row, year, month) {
  const { from, to } = monthBounds(year, month);
  const rowFrom = toIsoDateOnly(row.dateFrom);
  const rowTo = toIsoDateOnly(row.dateTo);
  if (!rowFrom || !rowTo) return false;
  return rowFrom <= to && rowTo >= from;
}

function StatusBadge({ achieved }) {
  if (achieved === null || achieved === undefined) return <span className="fp-dash">-</span>;
  return (
    <span className={`fp-status-badge ${achieved ? "ok" : "pending"}`}>
      {achieved ? "สำเร็จ" : "ยังไม่ถึงเป้า"}
    </span>
  );
}

function BranchBreakdown({ row }) {
  const branchCodes = row.branchCodes || [];
  return (
    <div className="fp-branch-chips">
      {branchCodes.map((code) => {
        const sold = row.soldByBranch?.[code] || 0;
        const pass = row.branchAchieved ? row.branchAchieved[code] : null;
        const cls = pass === null || pass === undefined ? "" : pass ? "ok" : "fail";
        return (
          <span key={code} className={`fp-branch-chip ${cls}`}>
            {code}: {formatNumber(sold)}
          </span>
        );
      })}
    </div>
  );
}

function FocusProductForm({ initial, onCancel, onSubmit, csrfToken, submitting, submitError }) {
  const [form, setForm] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active) setSearchResults(Array.isArray(data.results) ? data.results : data.products || []);
      } catch {
        // ignore search errors — user can still type the code manually
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleBranch(code) {
    setForm((prev) => {
      const has = prev.branchCodes.includes(code);
      return {
        ...prev,
        branchCodes: has ? prev.branchCodes.filter((c) => c !== code) : [...prev.branchCodes, code],
      };
    });
  }

  return (
    <div className="fp-modal-overlay" onClick={onCancel}>
      <div className="fp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? "แก้ไขสินค้าโฟกัส" : "เพิ่มสินค้าโฟกัส"}</h3>

        <label className="fp-field">
          <span>รหัสสินค้า</span>
          <input
            type="text"
            value={form.productCode}
            onChange={(e) => {
              update("productCode", e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder="IC-xxxxxx หรือ 630xxxxxxx"
          />
          {searchResults.length > 0 && (
            <div className="fp-search-results">
              {searchResults.slice(0, 8).map((product) => (
                <button
                  type="button"
                  key={product.productCode || product.product_code}
                  className="fp-search-result"
                  onClick={() => {
                    const code = product.productCode || product.product_code;
                    const name = product.displayName || product.display_name || product.productName || "";
                    update("productCode", code);
                    update("productName", name);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                >
                  <strong>{product.productCode || product.product_code}</strong> {product.displayName || product.display_name || product.productName}
                </button>
              ))}
            </div>
          )}
        </label>

        <label className="fp-field">
          <span>ประเภทโฟกัส</span>
          <select value={form.focusType} onChange={(e) => update("focusType", e.target.value)}>
            {FOCUS_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {FOCUS_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="fp-field">
          <span>เป้าหมาย (ชิ้น)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.targetQty}
            onChange={(e) => update("targetQty", e.target.value)}
          />
        </label>

        <div className="fp-field-row">
          <label className="fp-field">
            <span>จากวันที่</span>
            <input type="date" value={form.dateFrom} onChange={(e) => update("dateFrom", e.target.value)} />
          </label>
          <label className="fp-field">
            <span>ถึงวันที่</span>
            <input type="date" value={form.dateTo} onChange={(e) => update("dateTo", e.target.value)} />
          </label>
        </div>

        <label className="fp-field">
          <span>สาขาที่เกี่ยวข้อง (ว่าง = ทุกสาขา)</span>
          <div className="fp-branch-checkboxes">
            {["001", "003", "004", "005"].map((code) => (
              <label key={code} className="fp-branch-checkbox">
                <input
                  type="checkbox"
                  checked={form.branchCodes.includes(code)}
                  onChange={() => toggleBranch(code)}
                />
                {code}
              </label>
            ))}
          </div>
        </label>

        <label className="fp-field">
          <span>หมายเหตุ</span>
          <textarea value={form.note} onChange={(e) => update("note", e.target.value)} rows={2} />
        </label>

        {submitError && <div className="fp-form-error">{submitError}</div>}

        <div className="fp-modal-actions">
          <button type="button" className="fp-btn-secondary" onClick={onCancel} disabled={submitting}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="fp-btn-primary"
            disabled={submitting}
            onClick={() => onSubmit(form, csrfToken)}
          >
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FocusProductsTables({ rows, isAdminUser, onEdit, onDelete }) {
  const grouped = useMemo(() => {
    const map = new Map(FOCUS_TYPE_ORDER.map((type) => [type, []]));
    for (const row of rows) {
      if (!map.has(row.focusType)) map.set(row.focusType, []);
      map.get(row.focusType).push(row);
    }
    return map;
  }, [rows]);

  return (
    <>
      {FOCUS_TYPE_ORDER.map((type) => {
        const typeRows = grouped.get(type) || [];
        if (typeRows.length === 0) return null;
        return (
          <section key={type} className="fp-section">
            <h3 className="fp-section-title">{FOCUS_TYPE_LABELS[type]}</h3>
            <div className="mvt-sales-table-wrap">
              <table className="mvt-sales-table fp-table">
                <thead>
                  <tr>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th>ช่วงเวลา</th>
                    <th>เป้าหมาย</th>
                    <th>ยอดขายแต่ละสาขา</th>
                    <th>รวม</th>
                    <th>สถานะ</th>
                    {isAdminUser && <th>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {typeRows.map((row) => (
                    <tr key={row.id} className={row.isActive === false ? "fp-inactive-row" : ""}>
                      <td>{row.productCode}</td>
                      <td>{row.productName || "-"}</td>
                      <td>
                        {toIsoDateOnly(row.dateFrom)} – {toIsoDateOnly(row.dateTo)}
                      </td>
                      <td>{formatNumber(row.targetQty)}</td>
                      <td>
                        <BranchBreakdown row={row} />
                      </td>
                      <td>{formatNumber(row.totalSold)}</td>
                      <td>
                        <StatusBadge achieved={row.achieved} />
                      </td>
                      {isAdminUser && (
                        <td className="fp-actions-cell">
                          <button type="button" className="fp-btn-link" onClick={() => onEdit(row)}>
                            แก้ไข
                          </button>
                          <button type="button" className="fp-btn-link danger" onClick={() => onDelete(row)}>
                            ลบ
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

function YearCalendar({ year, onYearChange, selectedMonth, onSelectMonth, monthSummaries }) {
  return (
    <div className="fp-calendar">
      <div className="fp-calendar-header">
        <button type="button" className="fp-year-nav-btn" onClick={() => onYearChange(year - 1)} aria-label="ปีก่อนหน้า">
          ‹
        </button>
        <input
          type="number"
          className="fp-year-input"
          value={year}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isInteger(next) && next > 1900) onYearChange(next);
          }}
        />
        <button type="button" className="fp-year-nav-btn" onClick={() => onYearChange(year + 1)} aria-label="ปีถัดไป">
          ›
        </button>
      </div>

      <div className="fp-month-grid">
        {THAI_MONTH_NAMES.map((name, index) => {
          const month = index + 1;
          const summary = monthSummaries[month] || [];
          const isSelected = selectedMonth === month;
          return (
            <button
              type="button"
              key={month}
              className={`fp-month-card${isSelected ? " selected" : ""}`}
              onClick={() => onSelectMonth(month)}
            >
              <span className="fp-month-card-name">{name}</span>
              {summary.length === 0 ? (
                <span className="fp-month-empty-note">ยังไม่มี</span>
              ) : (
                <div className="fp-month-chips">
                  {summary.map((type) => (
                    <span key={type} className={`fp-month-chip fp-type-${type}`}>
                      {FOCUS_TYPE_SHORT_LABELS[type]}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FocusProductsPanel({ csrfToken, isAdminUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalState, setModalState] = useState(null); // null | { form, submitting, submitError }
  const [year, setYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const endpoint = isAdminUser ? "/api/admin/focus-products" : "/api/focus-products";
    apiFetch(endpoint)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (active) setRows(Array.isArray(data.focusProducts) ? data.focusProducts : []);
      })
      .catch((err) => {
        if (active) setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdminUser, refreshKey]);

  const monthSummaries = useMemo(() => {
    const summaries = {};
    for (let month = 1; month <= 12; month += 1) {
      const typesPresent = new Set();
      for (const row of rows) {
        if (rowOverlapsMonth(row, year, month)) typesPresent.add(row.focusType);
      }
      summaries[month] = FOCUS_TYPE_ORDER.filter((type) => typesPresent.has(type));
    }
    return summaries;
  }, [rows, year]);

  const monthRows = useMemo(() => {
    if (!selectedMonth) return [];
    return rows.filter((row) => rowOverlapsMonth(row, year, selectedMonth));
  }, [rows, year, selectedMonth]);

  function handleYearChange(nextYear) {
    setYear(nextYear);
    setSelectedMonth(null);
  }

  function openCreateModal(prefill = {}) {
    setModalState({ form: { ...EMPTY_FORM, ...prefill }, submitting: false, submitError: null });
  }

  function openEditModal(row) {
    setModalState({
      form: {
        id: row.id,
        productCode: row.productCode,
        productName: row.productName || "",
        focusType: row.focusType,
        targetQty: String(row.targetQty),
        dateFrom: toIsoDateOnly(row.dateFrom),
        dateTo: toIsoDateOnly(row.dateTo),
        branchCodes: row.branchCodesRaw || [],
        note: row.note || "",
      },
      submitting: false,
      submitError: null,
    });
  }

  function openCreateModalForSelectedMonth() {
    if (!selectedMonth) return openCreateModal();
    const { from, to } = monthBounds(year, selectedMonth);
    openCreateModal({ dateFrom: from, dateTo: to });
  }

  async function handleSubmit(form, csrf) {
    setModalState((prev) => ({ ...prev, submitting: true, submitError: null }));
    const payload = {
      productCode: form.productCode.trim(),
      focusType: form.focusType,
      targetQty: Number(form.targetQty),
      dateFrom: form.dateFrom,
      dateTo: form.dateTo,
      branchCodes: form.branchCodes.length > 0 ? form.branchCodes : null,
      note: form.note.trim() || null,
    };
    try {
      const response = await apiFetch(
        form.id ? `/api/admin/focus-products/${form.id}` : "/api/admin/focus-products",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${response.status}`);
      }
      setModalState(null);
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setModalState((prev) => ({ ...prev, submitting: false, submitError: err.message }));
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`ลบสินค้าโฟกัส "${row.productCode}" ใช่หรือไม่?`)) return;
    try {
      const response = await apiFetch(`/api/admin/focus-products/${row.id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRefreshKey((v) => v + 1);
    } catch (err) {
      window.alert(`ลบไม่สำเร็จ: ${err.message}`);
    }
  }

  return (
    <div className="fp-panel">
      <div className="panel-header stacked">
        <h2>สินค้าโฟกัส</h2>
        <p>เป้าหมายสินค้าโปรโมชั่นที่ต้องผลักดันการขาย และยอดขายสะสมถึงรอบล่าสุด</p>
      </div>

      {loading && <div className="fp-loading">กำลังโหลด...</div>}
      {error && <div className="fp-form-error">{error}</div>}

      {!loading && !error && (
        <>
          <YearCalendar
            year={year}
            onYearChange={handleYearChange}
            selectedMonth={selectedMonth}
            onSelectMonth={(month) => setSelectedMonth(month === selectedMonth ? null : month)}
            monthSummaries={monthSummaries}
          />

          {selectedMonth && (
            <div className="fp-month-detail">
              <div className="fp-month-detail-header">
                <h3>
                  สินค้าโฟกัสเดือน{THAI_MONTH_NAMES[selectedMonth - 1]} {year}
                </h3>
                {isAdminUser && (
                  <button type="button" className="fp-btn-primary" onClick={openCreateModalForSelectedMonth}>
                    + เพิ่มสินค้าโฟกัส
                  </button>
                )}
              </div>

              {monthRows.length === 0 ? (
                <div className="fp-empty">ยังไม่มีการตั้งสินค้าโฟกัสในเดือนนี้</div>
              ) : (
                <FocusProductsTables
                  rows={monthRows}
                  isAdminUser={isAdminUser}
                  onEdit={openEditModal}
                  onDelete={handleDelete}
                />
              )}
            </div>
          )}
        </>
      )}

      {modalState && (
        <FocusProductForm
          initial={modalState.form}
          submitting={modalState.submitting}
          submitError={modalState.submitError}
          csrfToken={csrfToken}
          onCancel={() => setModalState(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
