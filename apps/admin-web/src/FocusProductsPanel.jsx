import { useState, useEffect, useMemo, useRef } from "react";

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
  branchTargets: {}, // {branchCode: targetQty} — group_manager only
  assignedPersonName: "",
  note: "",
};

const BRANCH_CHOICES = ["001", "003", "004", "005"];

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
        const target = row.branchTargetsEffective?.[code];
        return (
          <span key={code} className={`fp-branch-chip ${cls}`}>
            {code}: {formatNumber(sold)}{target != null ? `/${formatNumber(target)}` : ""}
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
          <span>{form.focusType === "group_manager" ? "เป้าหมายหลัก (ใช้กับสาขาที่ไม่ได้ตั้งเป้าแยก)" : "เป้าหมาย (ชิ้น)"}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.targetQty}
            onChange={(e) => update("targetQty", e.target.value)}
          />
        </label>

        {form.focusType === "group_manager" && (
          <label className="fp-field">
            <span>เป้าหมายแยกตามสาขา (แต่ละสาขากำหนดไม่เท่ากันได้ — เว้นว่างเพื่อใช้เป้าหมายหลัก)</span>
            <div className="fp-branch-target-grid">
              {BRANCH_CHOICES.map((code) => (
                <label key={code} className="fp-branch-target-field">
                  <span>{code}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.branchTargets[code] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => {
                        const next = { ...prev.branchTargets };
                        if (value === "") delete next[code];
                        else next[code] = value;
                        return { ...prev, branchTargets: next };
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          </label>
        )}

        {form.focusType === "salesperson" && (
          <label className="fp-field">
            <span>ชื่อพนักงานที่รับผิดชอบ</span>
            <input
              type="text"
              value={form.assignedPersonName}
              onChange={(e) => update("assignedPersonName", e.target.value)}
              placeholder="ชื่อ-นามสกุลพนักงาน"
            />
          </label>
        )}

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

// Mirrors the source Excel's "สินค้าโฟกัส เดือน ..." layout: one column per
// branch instead of a combined chip cell, person name and target up front.
function SalespersonFocusTable({ rows, isAdminUser, onEdit, onDelete }) {
  const branchCodes = useMemo(() => {
    const codes = new Set();
    for (const row of rows) {
      for (const code of row.branchCodes || []) codes.add(code);
    }
    return [...codes].sort();
  }, [rows]);

  return (
    <div className="mvt-sales-table-wrap">
      <table className="mvt-sales-table fp-table fp-excel-table">
        <thead>
          <tr className="fp-excel-banner-row">
            <th colSpan={5 + branchCodes.length + 1 + 1 + (isAdminUser ? 1 : 0)} className="fp-excel-banner">
              สินค้าโฟกัส เดือน {THAI_MONTH_NAMES[Number(toIsoDateOnly(rows[0]?.dateFrom).slice(5, 7)) - 1]}{" "}
              {toIsoDateOnly(rows[0]?.dateFrom).slice(0, 4)}
            </th>
          </tr>
          <tr>
            <th>ลำดับ</th>
            <th>เป้ารายคน</th>
            <th>รหัสสินค้า</th>
            <th>จำนวน(เป้า)</th>
            <th className="fp-col-wide">สินค้าโฟกัส</th>
            {branchCodes.map((code) => (
              <th key={code}>ยอดสาขา {code}</th>
            ))}
            <th>รวม {branchCodes.length} สาขา</th>
            <th>สถานะ</th>
            {isAdminUser && <th>จัดการ</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={row.isActive === false ? "fp-inactive-row" : ""}>
              <td>{index + 1}</td>
              <td>{row.assignedPersonName || "-"}</td>
              <td>{row.productCode}</td>
              <td>{formatNumber(row.targetQty)}</td>
              <td className="fp-col-wide">{row.productName || "-"}</td>
              {branchCodes.map((code) => (
                <td key={code}>{formatNumber(row.soldByBranch?.[code] || 0)}</td>
              ))}
              <td>
                <strong>{formatNumber(row.totalSold)}</strong>
              </td>
              <td>
                <StatusBadge achieved={row.achieved} />
                {row.isFrozen && (
                  <span className="fp-frozen-badge" title="ยอดขายถูกล็อกแล้วเมื่อสิ้นสุดช่วงเวลา">
                    🔒 ปิดยอด
                  </span>
                )}
              </td>
              {isAdminUser && (
                <td className="fp-actions-cell">
                  <button
                    type="button"
                    className="fp-btn-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(row);
                    }}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="fp-btn-link danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row);
                    }}
                  >
                    ลบ
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="fp-excel-note-row">
            <td className="fp-excel-note-label">หมายเหตุ</td>
            <td colSpan={4 + branchCodes.length + 2 + (isAdminUser ? 1 : 0)}>
              เป้ายอดรวม {branchCodes.length} สาขา
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GenericFocusTable({ typeRows, isAdminUser, onEdit, onDelete }) {
  return (
    <div className="mvt-sales-table-wrap">
      <table className="mvt-sales-table fp-table">
        <thead>
          <tr>
            <th>รหัสสินค้า</th>
            <th className="fp-col-wide">ชื่อสินค้า</th>
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
              <td className="fp-col-wide">{row.productName || "-"}</td>
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
                {row.isFrozen && (
                  <span className="fp-frozen-badge" title="ยอดขายถูกล็อกแล้วเมื่อสิ้นสุดช่วงเวลา">
                    🔒 ปิดยอด
                  </span>
                )}
              </td>
              {isAdminUser && (
                <td className="fp-actions-cell">
                  <button
                    type="button"
                    className="fp-btn-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(row);
                    }}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="fp-btn-link danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row);
                    }}
                  >
                    ลบ
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FocusSectionTable({ type, typeRows, isAdminUser, onEdit, onDelete }) {
  return type === "salesperson" ? (
    <SalespersonFocusTable rows={typeRows} isAdminUser={isAdminUser} onEdit={onEdit} onDelete={onDelete} />
  ) : (
    <GenericFocusTable typeRows={typeRows} isAdminUser={isAdminUser} onEdit={onEdit} onDelete={onDelete} />
  );
}

function FocusProductsTables({ rows, isAdminUser, onEdit, onDelete }) {
  const [expandedType, setExpandedType] = useState(null);

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
          <section
            key={type}
            className="fp-section fp-section-clickable"
            onClick={() => setExpandedType(type)}
            title="คลิกเพื่อดูแบบเต็มหน้าจอ"
          >
            <h3 className="fp-section-title">{FOCUS_TYPE_LABELS[type]}</h3>
            <FocusSectionTable type={type} typeRows={typeRows} isAdminUser={isAdminUser} onEdit={onEdit} onDelete={onDelete} />
          </section>
        );
      })}

      {expandedType && (
        <div className="fp-table-modal-overlay" onClick={() => setExpandedType(null)}>
          <div className="fp-table-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fp-table-modal-close" onClick={() => setExpandedType(null)} aria-label="ปิด">
              ✕
            </button>
            <h3 className="fp-section-title">{FOCUS_TYPE_LABELS[expandedType]}</h3>
            <FocusSectionTable
              type={expandedType}
              typeRows={grouped.get(expandedType) || []}
              isAdminUser={isAdminUser}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      )}
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

// Fake-progress loading overlay. The single biggest cause of a "stuck"
// overlay is a stale interval that outlives the operation it was tracking —
// so every branch here (load starts, load ends, unmount) clears any existing
// timers FIRST before deciding what to do next, and the simulated progress
// only ever climbs to 90%. The jump to 100% happens only when `active`
// genuinely becomes false — never simulated — so the overlay can't visually
// finish before the real request actually has.
function LoadingOverlay({ active }) {
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
          {progress < 90 ? "กำลังโหลดข้อมูลสินค้าโฟกัส..." : "เกือบเสร็จแล้ว รอสักครู่..."}
        </div>
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
        branchTargets: row.branchTargets || {},
        assignedPersonName: row.assignedPersonName || "",
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
      branchTargets: form.focusType === "group_manager" && Object.keys(form.branchTargets).length > 0
        ? Object.fromEntries(Object.entries(form.branchTargets).map(([code, qty]) => [code, Number(qty)]))
        : null,
      assignedPersonName: form.focusType === "salesperson" ? (form.assignedPersonName || "").trim() || null : null,
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

      <LoadingOverlay active={loading} />
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
