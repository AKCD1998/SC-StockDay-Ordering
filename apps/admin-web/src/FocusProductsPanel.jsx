import { useState, useEffect, useMemo, useRef, Fragment } from "react";

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

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
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
  productUnit: "",
  productBarcode: "",
  focusType: "salesperson",
  targetQty: "",
  dateFrom: "",
  dateTo: "",
  branchCodes: ["001", "003", "004", "005"],
  branchTargets: {}, // {branchCode: targetQty} — group_manager only
  assignedPersonName: "",
  assignedStaffId: "",
  note: "",
  publicationStatus: "draft",
  scheduledPublishAt: "",
};

const BRANCH_CHOICES = ["001", "003", "004", "005"];
const PRODUCT_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_LOOKUP_CACHE_PREFIX = "focus-product-lookup:v2:";

function productLookupCacheKey(value) {
  return String(value || "").trim().toLowerCase();
}

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

function PublicationBadge({ row }) {
  if (!row) return null;
  const state = row.publicationState || row.publicationStatus || "published";
  const labels = {
    draft: "ร่าง",
    scheduled: "ตั้งเวลาเผยแพร่",
    published: row.publicationStatus === "scheduled" ? "เผยแพร่อัตโนมัติแล้ว" : "เผยแพร่แล้ว",
  };
  return <span className={`fp-publication-badge ${state}`}>{labels[state] || state}</span>;
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

function FocusProductForm({ initial, onCancel, onSubmit, csrfToken, submitting, submitError, salesStaff }) {
  const [form, setForm] = useState(initial);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [barcodeLookupBusy, setBarcodeLookupBusy] = useState(false);
  const [barcodeLookupError, setBarcodeLookupError] = useState(null);

  function productFields(product) {
    return {
      code: product.productCode || product.product_code || "",
      name: product.displayName || product.display_name || product.productName || product.product_name || "",
      unit: product.unitName || product.unit_name || product.unit || product.unitCode || product.unit_code || "",
      barcode: product.barcode || "",
    };
  }

  function chooseProduct(product) {
    const selected = productFields(product);
    setForm((prev) => ({
      ...prev,
      productCode: selected.code,
      productName: selected.name,
      productUnit: selected.unit,
      productBarcode: selected.barcode,
    }));
    setSearchQuery("");
    setSearchResults([]);
    setBarcodeLookupError(null);
  }

  async function scanOrSearchProduct(rawQuery) {
    const query = String(rawQuery || "").trim();
    if (!query) return;
    setBarcodeLookupBusy(true);
    setBarcodeLookupError(null);
    try {
      const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : data.products || [];
      const exact = results.find((product) => {
        const fields = productFields(product);
        return fields.barcode === query || fields.code.toLowerCase() === query.toLowerCase();
      });
      if (exact) {
        chooseProduct(exact);
      } else if (results.length === 1) {
        chooseProduct(results[0]);
      } else if (results.length > 1) {
        setSearchResults(results);
        setBarcodeLookupError("พบหลายรายการ กรุณาเลือกรายการที่ถูกต้อง");
      } else {
        setSearchResults([]);
        setBarcodeLookupError(`ไม่พบสินค้าจากบาร์โค้ดหรือรหัส “${query}”`);
      }
    } catch (error) {
      setBarcodeLookupError(error.message || "ค้นหาสินค้าไม่สำเร็จ");
    } finally {
      setBarcodeLookupBusy(false);
    }
  }

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
        if (active) {
          setSearchResults(Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : data.products || []);
        }
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
              update("productName", "");
              update("productUnit", "");
              update("productBarcode", "");
              setSearchQuery(e.target.value);
              setBarcodeLookupError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              scanOrSearchProduct(e.currentTarget.value);
            }}
            placeholder="IC-xxxxxx หรือ 630xxxxxxx"
            autoComplete="off"
          />
          <small className="fp-scan-hint">ยิงบาร์โค้ดแล้วกด Enter เพื่อเลือกรายการอัตโนมัติ</small>
          {barcodeLookupBusy && <span className="fp-product-lookup-status">กำลังค้นหาสินค้า...</span>}
          {barcodeLookupError && <span className="fp-product-lookup-error">{barcodeLookupError}</span>}
          {searchResults.length > 0 && (
            <div className="fp-search-results">
              {searchResults.slice(0, 8).map((product) => (
                <button
                  type="button"
                  key={product.productCode || product.product_code}
                  className="fp-search-result"
                  onClick={() => chooseProduct(product)}
                >
                  <strong>{product.productCode || product.product_code}</strong>{" "}
                  {product.displayName || product.display_name || product.productName || product.product_name}
                  {(product.unitName || product.unit_name || product.unit || product.unitCode || product.unit_code) && (
                    <span className="fp-search-result-meta">หน่วย: {product.unitName || product.unit_name || product.unit || product.unitCode || product.unit_code}</span>
                  )}
                  {product.barcode && <span className="fp-search-result-meta">บาร์โค้ด: {product.barcode}</span>}
                </button>
              ))}
            </div>
          )}
        </label>

        {form.productCode && form.productName && (
          <div className="fp-selected-product" aria-live="polite">
            <span className="fp-selected-product-check">✓</span>
            <div>
              <strong>{form.productCode} — {form.productName}</strong>
              <div className="fp-selected-product-meta">
                <span>หน่วยสินค้า: {form.productUnit || "ไม่ระบุ"}</span>
                {form.productBarcode && <span>บาร์โค้ด: {form.productBarcode}</span>}
              </div>
            </div>
          </div>
        )}

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
          <span>{form.focusType === "salesperson" ? "เป้าหมาย (ชิ้น)" : "เป้าหมายหลัก (ใช้กับสาขาที่ไม่ได้ตั้งเป้าแยก)"}</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.targetQty}
            onChange={(e) => update("targetQty", e.target.value)}
          />
        </label>

        {(form.focusType === "group_manager" || form.focusType === "pharmacist" || form.focusType === "store_manager") && (
          <label className="fp-field">
            <span>เป้าหมายแยกตามสาขา (ต้องมากกว่า 0 และกรอกให้ครบทุกสาขา)</span>
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
            <span>พนักงานขายที่รับผิดชอบ</span>
            <select value={form.assignedStaffId || ""} onChange={(e) => { const staff = salesStaff.find((item) => item.staffId === e.target.value); setForm((prev) => ({ ...prev, assignedStaffId: e.target.value, assignedPersonName: staff?.displayName || "" })); }}>
              <option value="">— เลือกพนักงานขาย —</option>
              {salesStaff.map((staff) => <option key={staff.staffId} value={staff.staffId}>{staff.displayName} — สาขา {staff.branchCode}{staff.isProbationary ? " — ทดลองงาน" : ""}</option>)}
            </select>
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
          <span>สาขาที่เกี่ยวข้อง (ระบบบังคับครบทุกสาขา)</span>
          <div className="fp-branch-checkboxes">
            {["001", "003", "004", "005"].map((code) => (
              <label key={code} className="fp-branch-checkbox">
                <input
                  type="checkbox"
                  checked={form.branchCodes.includes(code)}
                  onChange={() => toggleBranch(code)}
                  disabled
                />
                {code}
              </label>
            ))}
          </div>
        </label>

        {form.focusType !== "pharmacist" && (
          <label className="fp-field">
            <span>หมายเหตุ</span>
            <textarea value={form.note} onChange={(e) => update("note", e.target.value)} rows={2} />
          </label>
        )}

        <label className="fp-field">
          <span>การเผยแพร่</span>
          <select value={form.publicationStatus} onChange={(e) => update("publicationStatus", e.target.value)}>
            <option value="draft">บันทึกร่าง — เฉพาะ admin มองเห็น</option>
            <option value="published">บันทึกและเผยแพร่ทันที</option>
            <option value="scheduled">บันทึกและตั้งเวลาเผยแพร่</option>
          </select>
        </label>

        {form.publicationStatus === "scheduled" && (
          <label className="fp-field">
            <span>วันและเวลาที่เผยแพร่</span>
            <input
              type="datetime-local"
              value={form.scheduledPublishAt}
              onChange={(e) => update("scheduledPublishAt", e.target.value)}
            />
            <small>เมื่อถึงเวลานี้ พนักงานจะเห็นรายการโดยอัตโนมัติ</small>
          </label>
        )}

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
            {submitting
              ? "กำลังบันทึก..."
              : form.publicationStatus === "draft"
                ? "บันทึกร่าง"
                : form.publicationStatus === "scheduled"
                  ? "บันทึกและตั้งเวลา"
                  : "บันทึกและเผยแพร่ทันที"}
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
              <td className="fp-col-wide">{row.productName || "-"}{isAdminUser && <PublicationBadge row={row} />}</td>
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
              <td className="fp-col-wide">{row.productName || "-"}{isAdminUser && <PublicationBadge row={row} />}</td>
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

// pharmacist / store_manager: each branch can have its own target for the
// same product (branchTargets override), judged independently — no combined
// verdict. One pair of columns (เป้า/ขาย) per branch instead of a squished
// chip cell, matching the source Excel's per-branch layout.
function BranchTargetFocusTable({ rows, isAdminUser, onEdit, onDelete, restrictToBranch }) {
  const branchCodes = useMemo(() => {
    const codes = new Set();
    for (const row of rows) {
      for (const code of row.branchCodes || []) codes.add(code);
    }
    const all = [...codes].sort();
    // Staff accounts only see their own branch's target/sold columns here —
    // the salesperson and group_manager tables are intentionally left alone.
    return restrictToBranch ? all.filter((code) => code === restrictToBranch) : all;
  }, [rows, restrictToBranch]);

  return (
    <div className="mvt-sales-table-wrap">
      <table className="mvt-sales-table fp-table fp-branch-matrix">
        <thead>
          <tr>
            <th rowSpan={2}>รหัสสินค้า</th>
            <th className="fp-col-wide" rowSpan={2}>
              สินค้า
            </th>
            {branchCodes.map((code, branchIndex) => (
              <th
                key={code}
                colSpan={2}
                className={`fp-branch-group fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}
              >
                สาขา {code}
              </th>
            ))}
            <th rowSpan={2}>สถานะ</th>
            {isAdminUser && <th rowSpan={2}>จัดการ</th>}
          </tr>
          <tr>
            {branchCodes.map((code, branchIndex) => (
              <Fragment key={code}>
                <th className={`fp-target-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}>เป้า</th>
                <th className={`fp-sold-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}>ขาย</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.isActive === false ? "fp-inactive-row" : ""}>
              <td>{row.productCode}</td>
              <td className="fp-col-wide">{row.productName || "-"}{isAdminUser && <PublicationBadge row={row} />}</td>
              {branchCodes.map((code, branchIndex) => {
                const target = row.branchTargetsEffective?.[code];
                const sold = row.soldByBranch?.[code] || 0;
                const pass = row.branchAchieved ? row.branchAchieved[code] : null;
                const cls = pass === null || pass === undefined ? "" : pass ? "fp-cell-ok" : "fp-cell-fail";
                return (
                  <Fragment key={code}>
                    <td className={`fp-target-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}>
                      {target != null ? formatNumber(target) : "-"}
                    </td>
                    <td className={`fp-sold-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"} ${cls}`}>
                      {formatNumber(sold)}
                    </td>
                  </Fragment>
                );
              })}
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

// group_manager: same purple-banner Excel layout as SalespersonFocusTable,
// but with a branch switcher — target/sold/status are dynamic based on which
// branch (or "ทุกสาขา" combined) is selected, since each branch can have its
// own target and only "ทุกสาขา" reflects the true all-must-succeed verdict.
function GroupManagerFocusTable({ rows, isAdminUser, onEdit, onDelete }) {
  const branchCodes = useMemo(() => {
    const codes = new Set();
    for (const row of rows) {
      for (const code of row.branchCodes || []) codes.add(code);
    }
    return [...codes].sort();
  }, [rows]);

  const [selectedBranch, setSelectedBranch] = useState("all");
  const activeBranch = branchCodes.includes(selectedBranch) || selectedBranch === "all" ? selectedBranch : "all";

  const monthLabel = rows[0]
    ? `${THAI_MONTH_NAMES[Number(toIsoDateOnly(rows[0].dateFrom).slice(5, 7)) - 1]} ${toIsoDateOnly(rows[0].dateFrom).slice(0, 4)}`
    : "";

  return (
    <div className="mvt-sales-table-wrap">
      <div className="fp-branch-tabs">
        {branchCodes.map((code) => (
          <button
            key={code}
            type="button"
            className={`fp-branch-tab${activeBranch === code ? " active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedBranch(code);
            }}
          >
            สาขา {code}
          </button>
        ))}
        <button
          type="button"
          className={`fp-branch-tab${activeBranch === "all" ? " active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedBranch("all");
          }}
        >
          รวมทั้งหมด
        </button>
      </div>

      <table className={`mvt-sales-table fp-table fp-excel-table${activeBranch === "all" ? " fp-branch-matrix" : ""}`}>
        <thead>
          <tr className="fp-excel-banner-row">
            <th
              colSpan={activeBranch === "all" ? 6 + (branchCodes.length * 2) + (isAdminUser ? 1 : 0) : 6 + (isAdminUser ? 1 : 0)}
              className="fp-excel-banner"
            >
              สินค้าโฟกัส ผู้จัดการกลุ่ม {activeBranch === "all" ? "ทุกสาขา" : `สาขา ${activeBranch}`} เดือน {monthLabel}
            </th>
          </tr>
          {activeBranch === "all" ? (
            <>
              <tr>
                <th rowSpan={2}>ลำดับ</th>
                <th rowSpan={2}>รหัสสินค้า</th>
                <th className="fp-col-wide" rowSpan={2}>ชื่อสินค้า</th>
                {branchCodes.map((code, branchIndex) => (
                  <th
                    key={code}
                    colSpan={2}
                    className={`fp-branch-group fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}
                  >
                    สาขา {code}
                  </th>
                ))}
                <th rowSpan={2} className="fp-total-target-col">เป้ารวม</th>
                <th rowSpan={2} className="fp-total-sold-col">ขายรวม</th>
                <th rowSpan={2}>สถานะ</th>
                {isAdminUser && <th rowSpan={2}>จัดการ</th>}
              </tr>
              <tr>
                {branchCodes.map((code, branchIndex) => (
                  <Fragment key={code}>
                    <th className={`fp-target-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}>เป้า</th>
                    <th className={`fp-sold-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}>ขาย</th>
                  </Fragment>
                ))}
              </tr>
            </>
          ) : (
            <tr>
              <th>ลำดับ</th>
              <th>รหัสสินค้า</th>
              <th className="fp-col-wide">ชื่อสินค้า</th>
              <th>เป้าสินค้า {activeBranch}</th>
              <th>ยอดล่าสุด</th>
              <th>สถานะ</th>
              {isAdminUser && <th>จัดการ</th>}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowBranchCodes = row.branchCodes || [];
            let target;
            let sold;
            let achieved;
            if (activeBranch === "all") {
              target = rowBranchCodes.reduce((sum, code) => sum + (row.branchTargetsEffective?.[code] || 0), 0);
              sold = row.totalSold;
              achieved = row.achieved;
            } else {
              target = row.branchTargetsEffective?.[activeBranch];
              sold = row.soldByBranch?.[activeBranch] || 0;
              achieved = row.branchAchieved ? row.branchAchieved[activeBranch] : null;
            }
            return (
              <tr key={row.id} className={row.isActive === false ? "fp-inactive-row" : ""}>
                <td>{index + 1}</td>
                <td>{row.productCode}</td>
                <td className="fp-col-wide">{row.productName || "-"}{isAdminUser && <PublicationBadge row={row} />}</td>
                {activeBranch === "all" ? branchCodes.map((code, branchIndex) => {
                  const branchTarget = row.branchTargetsEffective?.[code];
                  const branchSold = row.soldByBranch?.[code] || 0;
                  const branchPass = row.branchAchieved ? row.branchAchieved[code] : null;
                  const branchClass = branchPass === null || branchPass === undefined ? "" : branchPass ? "fp-cell-ok" : "fp-cell-fail";
                  return (
                    <Fragment key={code}>
                      <td className={`fp-target-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`}>
                        {branchTarget != null ? formatNumber(branchTarget) : "-"}
                      </td>
                      <td className={`fp-sold-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"} ${branchClass}`}>
                        {formatNumber(branchSold)}
                      </td>
                    </Fragment>
                  );
                }) : null}
                <td className={activeBranch === "all" ? "fp-total-target-col" : ""}>{target != null ? formatNumber(target) : "-"}</td>
                <td className={activeBranch === "all" ? "fp-total-sold-col" : ""}>{formatNumber(sold)}</td>
                <td>
                  <StatusBadge achieved={achieved} />
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FocusSectionTable({ type, typeRows, isAdminUser, onEdit, onDelete, restrictToBranch }) {
  if (type === "salesperson") {
    return <SalespersonFocusTable rows={typeRows} isAdminUser={isAdminUser} onEdit={onEdit} onDelete={onDelete} />;
  }
  if (type === "pharmacist" || type === "store_manager") {
    return (
      <BranchTargetFocusTable
        rows={typeRows}
        isAdminUser={isAdminUser}
        onEdit={onEdit}
        onDelete={onDelete}
        restrictToBranch={restrictToBranch}
      />
    );
  }
  if (type === "group_manager") {
    return <GroupManagerFocusTable rows={typeRows} isAdminUser={isAdminUser} onEdit={onEdit} onDelete={onDelete} />;
  }
  return <GenericFocusTable typeRows={typeRows} isAdminUser={isAdminUser} onEdit={onEdit} onDelete={onDelete} />;
}

function FocusProductsTables({ rows, isAdminUser, onEdit, onDelete, restrictToBranch }) {
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
            <FocusSectionTable
              type={type}
              typeRows={typeRows}
              isAdminUser={isAdminUser}
              onEdit={onEdit}
              onDelete={onDelete}
              restrictToBranch={restrictToBranch}
            />
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
              restrictToBranch={restrictToBranch}
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

function BatchFocusProductForm({ initialDates, csrfToken, onCancel, onSaved, salesStaff }) {
  const [focusType, setFocusType] = useState("salesperson");
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [publicationStatus, setPublicationStatus] = useState("draft");
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [rows, setRows] = useState([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [scanningQuery, setScanningQuery] = useState("");
  const [error, setError] = useState(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [copyFromBranch, setCopyFromBranch] = useState("001");
  const [copyToBranch, setCopyToBranch] = useState("003");
  const scanRef = useRef(null);
  const lookupCacheRef = useRef(new Map());
  const busy = scanBusy || submitBusy;
  const hasUnsavedChanges = rows.length > 0
    || scanValue.trim().length > 0
    || focusType !== "salesperson"
    || dateFrom !== initialDates.from
    || dateTo !== initialDates.to
    || publicationStatus !== "draft"
    || scheduledPublishAt.length > 0;

  function requestClose() {
    if (busy) return;
    if (hasUnsavedChanges) {
      setDiscardConfirmOpen(true);
      return;
    }
    onCancel();
  }

  function readCachedProduct(query) {
    const key = productLookupCacheKey(query);
    const memoryEntry = lookupCacheRef.current.get(key);
    if (memoryEntry && Date.now() - memoryEntry.savedAt < PRODUCT_LOOKUP_CACHE_TTL_MS) return memoryEntry.product;
    if (memoryEntry) lookupCacheRef.current.delete(key);
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${PRODUCT_LOOKUP_CACHE_PREFIX}${key}`) || "null");
      if (stored?.product && Date.now() - stored.savedAt < PRODUCT_LOOKUP_CACHE_TTL_MS) {
        lookupCacheRef.current.set(key, stored);
        return stored.product;
      }
      sessionStorage.removeItem(`${PRODUCT_LOOKUP_CACHE_PREFIX}${key}`);
    } catch {
      // Cache failure must never prevent barcode lookup.
    }
    return null;
  }

  function cacheProduct(query, product) {
    const entry = { product, savedAt: Date.now() };
    const aliases = [query, product.productCode, product.barcode].map(productLookupCacheKey).filter(Boolean);
    aliases.forEach((key) => {
      lookupCacheRef.current.set(key, entry);
      try { sessionStorage.setItem(`${PRODUCT_LOOKUP_CACHE_PREFIX}${key}`, JSON.stringify(entry)); } catch { /* optional cache */ }
    });
  }

  function updateRow(index, updater) {
    setRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? updater(row) : row));
  }

  async function addScannedProduct() {
    const query = scanValue.trim();
    if (!query || scanBusy) return;
    setScanBusy(true);
    setScanningQuery(query);
    setError(null);
    try {
      let product = readCachedProduct(query);
      if (!product) {
        const response = await apiFetch(`/api/products/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const results = Array.isArray(data) ? data : data.results || data.products || [];
        product = results.find((item) => item.barcode === query || String(item.productCode || "").toLowerCase() === query.toLowerCase())
          || (results.length === 1 ? results[0] : null);
        if (!product) throw new Error(results.length ? "พบหลายสินค้า กรุณายิงบาร์โค้ดหรือกรอกรหัสที่ตรงกัน" : "ไม่พบสินค้า");
        cacheProduct(query, product);
      }
      if (focusType !== "salesperson" && rows.some((row) => row.productCode === product.productCode)) throw new Error("สินค้านี้อยู่ในรายการแล้ว");
      setRows((prev) => [...prev, {
        productCode: product.productCode,
        productName: product.productName || "",
        barcode: product.barcode || query,
        unit: product.unitName || product.unit_name || product.unit || product.unitCode || product.unit_code || "",
        stockByBranch: product.stockByBranch || {},
        targetQty: "",
        assignedPersonName: "",
        assignedStaffId: "",
        branchTargets: Object.fromEntries(BRANCH_CHOICES.map((code) => [code, ""])),
      }]);
      setScanValue("");
      setTimeout(() => scanRef.current?.focus(), 0);
    } catch (lookupError) {
      setError(lookupError.message || "ค้นหาสินค้าไม่สำเร็จ");
    } finally {
      setScanBusy(false);
      setScanningQuery("");
    }
  }

  function applySameTarget(index) {
    updateRow(index, (row) => {
      const value = row.targetQty;
      return { ...row, branchTargets: Object.fromEntries(BRANCH_CHOICES.map((code) => [code, value])) };
    });
  }

  function copyBranchTargets() {
    setRows((prev) => prev.map((row) => ({
      ...row,
      branchTargets: { ...row.branchTargets, [copyToBranch]: row.branchTargets[copyFromBranch] },
    })));
  }

  function blockingErrors() {
    const issues = [];
    if (!rows.length) issues.push("ต้องเพิ่มสินค้าอย่างน้อย 1 รายการ");
    if (!dateFrom || !dateTo || dateTo < dateFrom) issues.push("ช่วงวันที่ไม่ถูกต้อง");
    rows.forEach((row, index) => {
      if (!(Number(row.targetQty) > 0)) issues.push(`แถว ${index + 1}: เป้าหมายหลักต้องมากกว่า 0`);
      if (focusType === "salesperson" && !row.assignedStaffId) issues.push(`แถว ${index + 1}: ต้องเลือกพนักงานขาย`);
      if (focusType !== "salesperson") {
        const missing = BRANCH_CHOICES.filter((code) => !(Number(row.branchTargets[code]) > 0));
        if (missing.length) issues.push(`แถว ${index + 1}: เป้าสาขา ${missing.join(", ")} ยังไม่ครบ`);
      }
    });
    if (publicationStatus === "scheduled" && !scheduledPublishAt) issues.push("ต้องระบุวันเวลาเผยแพร่");
    if (publicationStatus === "scheduled" && scheduledPublishAt && new Date(scheduledPublishAt) > new Date(`${dateTo}T23:59:59`)) issues.push("วันเผยแพร่ต้องไม่ช้ากว่าวันสิ้นสุดเป้า");
    return issues;
  }

  function warnings() {
    const result = rows.flatMap((row, index) => BRANCH_CHOICES.flatMap((code) => {
      const stock = Number(row.stockByBranch?.[code] || 0);
      const target = focusType === "salesperson" ? null : Number(row.branchTargets[code] || 0);
      if (stock <= 0) return [`แถว ${index + 1} ${row.productCode}: สาขา ${code} ไม่มี stock`];
      if (target && target > stock * 2) return [`แถว ${index + 1} ${row.productCode}: เป้าสาขา ${code} สูงกว่า stock มาก`];
      return [];
    }));
    if (publicationStatus === "scheduled" && scheduledPublishAt && new Date(scheduledPublishAt) > new Date(`${dateFrom}T00:00:00`)) {
      result.unshift("วันเผยแพร่อยู่หลังวันเริ่มเป้า");
    }
    return result;
  }

  function coverageReminders() {
    if (focusType === "salesperson") {
      const selectedStaffIds = new Set(rows.map((row) => String(row.assignedStaffId || "")).filter(Boolean));
      return salesStaff
        .filter((staff) => !selectedStaffIds.has(String(staff.staffId)))
        .map((staff) => `พนักงานขาย ${staff.displayName} — สาขา ${staff.branchCode}`);
    }

    return BRANCH_CHOICES
      .filter((code) => !rows.some((row) => Number(row.branchTargets?.[code]) > 0))
      .map((code) => `สาขา ${code}`);
  }

  function requestSubmitBatch() {
    const issues = blockingErrors();
    if (issues.length) { setError(issues.join(" • ")); return; }
    setError(null);
    if (coverageReminders().length || warnings().length) {
      setCreateConfirmOpen(true);
      return;
    }
    persistBatch();
  }

  async function persistBatch() {
    setCreateConfirmOpen(false);
    setSubmitBusy(true);
    setError(null);
    try {
      const response = await apiFetch("/api/admin/focus-products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          publicationStatus,
          scheduledPublishAt: publicationStatus === "scheduled" ? new Date(scheduledPublishAt).toISOString() : null,
          focusProducts: rows.map((row) => ({
            productCode: row.productCode,
            focusType,
            targetQty: Number(row.targetQty),
            branchCodes: [...BRANCH_CHOICES],
            branchTargets: focusType === "salesperson" ? null : Object.fromEntries(BRANCH_CHOICES.map((code) => [code, Number(row.branchTargets[code])])),
            assignedPersonName: focusType === "salesperson" ? row.assignedPersonName.trim() : null,
            assignedStaffId: focusType === "salesperson" ? row.assignedStaffId : null,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
      onSaved(body.count || rows.length);
    } catch (submitError) {
      setError(submitError.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitBusy(false);
    }
  }

  const issues = blockingErrors();
  const warningList = warnings();
  const coverageReminderList = coverageReminders();
  return (
    <div className="fp-modal-overlay" onClick={requestClose}>
      <div className="fp-modal fp-batch-modal" onClick={(event) => event.stopPropagation()}>
        <h3>เพิ่มสินค้าโฟกัสหลายรายการ</h3>
        {scanBusy && (
          <div className="fp-batch-lookup-overlay" role="status" aria-live="polite">
            <div className="fp-batch-lookup-card">
              <div className="fp-loading-spinner" />
              <strong>กำลังค้นหาสินค้า...</strong>
              <span>รหัสหรือบาร์โค้ด: {scanningQuery}</span>
              <small>กรุณารอสักครู่ ระบบกำลังโหลดชื่อสินค้า หน่วย และ Stock ของแต่ละสาขา</small>
            </div>
          </div>
        )}
        {discardConfirmOpen && (
          <div className="fp-batch-discard-overlay" role="presentation" onClick={() => setDiscardConfirmOpen(false)}>
            <div className="fp-batch-discard-card" role="alertdialog" aria-modal="true" aria-labelledby="fp-discard-title" aria-describedby="fp-discard-description" onClick={(event) => event.stopPropagation()}>
              <div className="fp-batch-discard-icon" aria-hidden="true">!</div>
              <h4 id="fp-discard-title">ออกโดยไม่บันทึกหรือไม่?</h4>
              <p id="fp-discard-description">รายการสินค้าและเป้าหมายที่กำลังทำอยู่จะหายทั้งหมด และไม่สามารถกู้คืนจากหน้านี้ได้</p>
              <div className="fp-batch-discard-actions">
                <button type="button" className="fp-btn-secondary" onClick={() => setDiscardConfirmOpen(false)} autoFocus>กลับไปทำต่อ</button>
                <button type="button" className="fp-btn-danger" onClick={onCancel}>ออกและทิ้งข้อมูล</button>
              </div>
            </div>
          </div>
        )}
        {createConfirmOpen && (
          <div className="fp-batch-discard-overlay" role="presentation" onClick={() => setCreateConfirmOpen(false)}>
            <div className="fp-batch-discard-card fp-batch-create-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="fp-create-confirm-title" aria-describedby="fp-create-confirm-description" onClick={(event) => event.stopPropagation()}>
              <div className="fp-batch-discard-icon" aria-hidden="true">!</div>
              <h4 id="fp-create-confirm-title">ยืนยันสร้างเป้าสินค้าโฟกัส?</h4>
              <p id="fp-create-confirm-description">ข้อมูลที่กรอกสามารถสร้างได้ แต่ยังมีรายการที่ระบบอยากให้ตรวจสอบก่อน</p>
              {coverageReminderList.length > 0 && <div className="fp-create-confirm-section"><strong>คุณยังไม่ได้ระบุสินค้าโฟกัสให้</strong>{coverageReminderList.map((item) => <span key={item}>{item}</span>)}</div>}
              {warningList.length > 0 && <div className="fp-create-confirm-section secondary"><strong>คำเตือนเพิ่มเติม</strong>{warningList.map((item) => <span key={item}>{item}</span>)}</div>}
              <div className="fp-batch-discard-actions">
                <button type="button" className="fp-btn-secondary" onClick={() => setCreateConfirmOpen(false)} autoFocus>กลับไปตรวจสอบ</button>
                <button type="button" className="fp-btn-primary" onClick={persistBatch}>ยืนยันสร้าง</button>
              </div>
            </div>
          </div>
        )}
        <div className="fp-field-row">
          <label className="fp-field"><span>ประเภทโฟกัส</span><select value={focusType} onChange={(e) => setFocusType(e.target.value)}>{FOCUS_TYPE_ORDER.map((type) => <option key={type} value={type}>{FOCUS_TYPE_LABELS[type]}</option>)}</select></label>
          <label className="fp-field"><span>จากวันที่</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label className="fp-field"><span>ถึงวันที่</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        </div>
        <label className="fp-field"><span>ยิงบาร์โค้ดหรือกรอกรหัสสินค้า</span><div className="fp-batch-scan-row"><input ref={scanRef} autoFocus value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addScannedProduct(); } }} placeholder="ยิงบาร์โค้ดแล้ว Enter" /><button type="button" className="fp-btn-secondary" onClick={addScannedProduct} disabled={busy}>เพิ่ม</button></div></label>
        {focusType !== "salesperson" && <div className="fp-copy-tools"><span>คัดลอกเป้าทุกแถวจาก</span><select value={copyFromBranch} onChange={(e) => setCopyFromBranch(e.target.value)}>{BRANCH_CHOICES.map((code) => <option key={code}>{code}</option>)}</select><span>ไป</span><select value={copyToBranch} onChange={(e) => setCopyToBranch(e.target.value)}>{BRANCH_CHOICES.map((code) => <option key={code}>{code}</option>)}</select><button type="button" className="fp-btn-secondary" onClick={copyBranchTargets}>คัดลอก</button></div>}
        <div className="fp-batch-table-wrap"><table className="fp-batch-table"><thead><tr><th>สินค้า</th><th>หน่วย</th>{focusType === "salesperson" ? <><th>พนักงานขาย</th><th>เป้ารวม</th></> : <><th>เป้าหลัก</th>{BRANCH_CHOICES.map((code) => <th key={code}>{code}<small>stock</small></th>)}</>}<th /></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.productCode}-${index}`}><td><strong>{row.productCode}</strong><span>{row.productName}</span></td><td>{row.unit || "-"}</td>{focusType === "salesperson" ? <><td><select value={row.assignedStaffId} onChange={(e) => { const staff = salesStaff.find((item) => item.staffId === e.target.value); updateRow(index, (old) => ({ ...old, assignedStaffId: e.target.value, assignedPersonName: staff?.displayName || "" })); }}><option value="">เลือกพนักงานขาย</option>{salesStaff.map((staff) => <option key={staff.staffId} value={staff.staffId}>{staff.displayName} — {staff.branchCode}{staff.isProbationary ? " (ทดลองงาน)" : ""}</option>)}</select></td><td><input type="number" min="1" value={row.targetQty} onChange={(e) => updateRow(index, (old) => ({ ...old, targetQty: e.target.value }))} /></td></> : <><td><input type="number" min="1" value={row.targetQty} onChange={(e) => updateRow(index, (old) => ({ ...old, targetQty: e.target.value }))} /><button type="button" onClick={() => applySameTarget(index)}>ใช้ทุกสาขา</button></td>{BRANCH_CHOICES.map((code) => <td key={code} className={Number(row.stockByBranch?.[code] || 0) <= 0 ? "warning" : ""}><input type="number" min="1" value={row.branchTargets[code]} onChange={(e) => updateRow(index, (old) => ({ ...old, branchTargets: { ...old.branchTargets, [code]: e.target.value } }))} /><small>{Number(row.stockByBranch?.[code] || 0)}</small></td>)}</>}<td><button type="button" className="fp-btn-link danger" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>ลบ</button></td></tr>)}</tbody></table></div>
        {!rows.length && <div className="fp-empty">ยิงบาร์โค้ดเพื่อเพิ่มสินค้าได้ต่อเนื่อง</div>}
        {issues.length > 0 && <div className="fp-batch-issues"><strong>ยังบันทึกไม่ได้</strong>{issues.map((issue) => <span key={issue}>{issue}</span>)}</div>}
        {coverageReminderList.length > 0 && <div className="fp-batch-coverage"><strong>เตือนความครอบคลุม (ยังบันทึกได้)</strong><span>ยังไม่ได้ระบุสินค้าโฟกัสให้:</span>{coverageReminderList.map((item) => <span key={item}>{item}</span>)}</div>}
        {warningList.length > 0 && <div className="fp-batch-warnings"><strong>คำเตือน (ยังบันทึกได้)</strong>{warningList.slice(0, 8).map((warning) => <span key={warning}>{warning}</span>)}</div>}
        <div className="fp-field-row"><label className="fp-field"><span>การเผยแพร่</span><select value={publicationStatus} onChange={(e) => setPublicationStatus(e.target.value)}><option value="draft">บันทึกร่าง</option><option value="published">เผยแพร่ทันที</option><option value="scheduled">ตั้งเวลาเผยแพร่</option></select></label>{publicationStatus === "scheduled" && <label className="fp-field"><span>วันเวลาเผยแพร่</span><input type="datetime-local" value={scheduledPublishAt} onChange={(e) => setScheduledPublishAt(e.target.value)} /></label>}</div>
        {error && <div className="fp-form-error">{error}</div>}
        <div className="fp-modal-actions"><button type="button" className="fp-btn-secondary" onClick={requestClose} disabled={busy}>ยกเลิก</button><button type="button" className="fp-btn-primary" onClick={requestSubmitBatch} disabled={busy || issues.length > 0}>{busy ? "กำลังบันทึก..." : `สร้าง ${rows.length} รายการ`}</button></div>
      </div>
    </div>
  );
}

const SALES_TARGET_TIER_LABELS = { 1: "ขั้นที่ 1", 2: "ขั้นที่ 2", 3: "ขั้นที่ 3" };

const SALES_TARGET_COLUMN_DEFS = [
  { key: "monthlyTarget", label: "เป้าเดือน" },
  { key: "dailyTarget", label: "เป้า/วัน" },
  { key: "actualAvgPerDay", label: "เฉลี่ย/วัน (สะสม)" },
  { key: "remainingAmount", label: "คงเหลือ" },
  { key: "remainingAvgPerDay", label: "เฉลี่ย/วัน (คงเหลือ)" },
  { key: "achieved", label: "สถานะ" },
];

const SALES_TARGET_COLUMN_VISIBILITY_KEY = "sales-targets:visible-columns:v1";

function loadVisibleColumns() {
  try {
    const stored = JSON.parse(localStorage.getItem(SALES_TARGET_COLUMN_VISIBILITY_KEY) || "null");
    if (Array.isArray(stored)) return new Set(stored);
  } catch {
    // fall through to default
  }
  return new Set(SALES_TARGET_COLUMN_DEFS.map((col) => col.key));
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function formatCurrency(value) {
  if (value === null || value === undefined) return "-";
  return formatNumber(value, 2);
}

const THAI_WEEKDAY_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function formatDailyDateLabel(iso) {
  const [, month, day] = iso.split("-");
  const weekday = THAI_WEEKDAY_SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${day}/${month} (${weekday})`;
}

// Admin-only inline form for setting the 3 tier targets for the currently
// selected branch/month. Kept separate from the read-only progress table so
// staff (who never see this) get a strictly smaller component tree.
function SalesTargetEditForm({ tiers, onSave, saving, saveError }) {
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries([1, 2, 3].map((tier) => [tier, tiers.find((t) => t.tier === tier)?.monthlyTarget ?? ""])),
  );

  useEffect(() => {
    setDrafts(Object.fromEntries([1, 2, 3].map((tier) => [tier, tiers.find((t) => t.tier === tier)?.monthlyTarget ?? ""])));
  }, [tiers]);

  return (
    <div className="fp-sales-target-edit">
      <div className="fp-branch-target-grid">
        {[1, 2, 3].map((tier) => (
          <label key={tier} className="fp-branch-target-field fp-sales-target-tier-field">
            <span>{SALES_TARGET_TIER_LABELS[tier]}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={drafts[tier]}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [tier]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {saveError && <div className="fp-form-error">{saveError}</div>}
      <button
        type="button"
        className="fp-btn-primary"
        disabled={saving}
        onClick={() =>
          onSave(
            [1, 2, 3]
              .filter((tier) => drafts[tier] !== "" && Number.isFinite(Number(drafts[tier])))
              .map((tier) => ({ tier, monthlyTarget: Number(drafts[tier]) })),
          )
        }
      >
        {saving ? "กำลังบันทึก..." : "บันทึกเป้า"}
      </button>
    </div>
  );
}

function SalesTargetsSection({ csrfToken, isAdminUser, branchCode }) {
  const [selectedBranch, setSelectedBranch] = useState(isAdminUser ? BRANCH_CHOICES[0] : branchCode);
  const [month, setMonth] = useState(currentMonthValue());
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(true);

  const activeBranch = isAdminUser ? selectedBranch : branchCode;

  useEffect(() => {
    localStorage.setItem(SALES_TARGET_COLUMN_VISIBILITY_KEY, JSON.stringify([...visibleColumns]));
  }, [visibleColumns]);

  useEffect(() => {
    if (!activeBranch) {
      setProgress(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch(`/api/admin/sales-targets/progress?branchCode=${encodeURIComponent(activeBranch)}&month=${encodeURIComponent(month)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (active) setProgress(data);
      })
      .catch((err) => {
        if (active) setError(err.message || "โหลดเป้ายอดขายไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeBranch, month, refreshKey]);

  async function saveTiers(tiers) {
    if (!tiers.length) {
      setSaveError("กรุณากรอกเป้าหมายอย่างน้อย 1 ขั้น");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/admin/sales-targets?branchCode=${encodeURIComponent(activeBranch)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ month, tiers }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setSaveError(err.message || "บันทึกเป้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function toggleColumn(key) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columns = SALES_TARGET_COLUMN_DEFS.filter((col) => visibleColumns.has(col.key));

  return (
    <section className="fp-section fp-sales-target-section">
      <div className="fp-sales-target-header">
        <h3 className="fp-section-title">เป้ายอดขาย</h3>
        <div className="fp-sales-target-controls">
          {isAdminUser && (
            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
              {BRANCH_CHOICES.map((code) => (
                <option key={code} value={code}>
                  สาขา {code}
                </option>
              ))}
            </select>
          )}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <div className="fp-sales-target-col-picker">
            <button type="button" className="fp-btn-secondary" onClick={() => setColumnPickerOpen((v) => !v)}>
              คอลัมน์ ▾
            </button>
            {columnPickerOpen && (
              <div className="fp-sales-target-col-menu">
                {SALES_TARGET_COLUMN_DEFS.map((col) => (
                  <label key={col.key} className="fp-branch-checkbox">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!activeBranch && <div className="fp-empty">ยังไม่ได้เลือกสาขา</div>}
      {loading && activeBranch && <div className="fp-loading">กำลังโหลด...</div>}
      {error && <div className="fp-form-error">{error}</div>}

      {!loading && !error && progress && (
        <>
          <div className="fp-sales-target-summary">
            <span>
              ยอดขายสะสมเดือนนี้: <strong>{formatCurrency(progress.actualSoFar)}</strong>
            </span>
            <span>
              วันที่ผ่านไป {progress.daysElapsed}/{progress.totalDaysInMonth} วัน (เหลือ {progress.daysRemaining} วัน)
            </span>
          </div>

          {progress.dailyActuals?.length > 0 && (
            <div className="fp-sales-target-daily">
              <button
                type="button"
                className="fp-btn-link"
                onClick={() => setDailyOpen((v) => !v)}
              >
                {dailyOpen ? "▾" : "▸"} ยอดขายรายวัน ({progress.dailyActuals.length} วัน)
              </button>
              {dailyOpen && (
                <div className="mvt-sales-table-wrap fp-sales-target-daily-wrap">
                  <table className="mvt-sales-table fp-table">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th>ยอดขาย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...progress.dailyActuals].reverse().map((day) => (
                        <tr key={day.date}>
                          <td>{formatDailyDateLabel(day.date)}</td>
                          <td>{formatCurrency(day.actual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mvt-sales-table-wrap fp-sales-target-tier-wrap">
            <table className="mvt-sales-table fp-table">
              <thead>
                <tr>
                  <th>ขั้น</th>
                  {columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progress.tiers.map((tier) => (
                  <tr key={tier.tier}>
                    <td>{SALES_TARGET_TIER_LABELS[tier.tier]}</td>
                    {columns.map((col) => {
                      if (col.key === "achieved") {
                        return (
                          <td key={col.key}>
                            <StatusBadge achieved={tier.achieved} />
                          </td>
                        );
                      }
                      return <td key={col.key}>{formatCurrency(tier[col.key])}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdminUser && (
            <SalesTargetEditForm tiers={progress.tiers} onSave={saveTiers} saving={saving} saveError={saveError} />
          )}
        </>
      )}
    </section>
  );
}

export default function FocusProductsPanel({ csrfToken, isAdminUser, branchCode }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalState, setModalState] = useState(null); // null | { form, submitting, submitError }
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [salesStaff, setSalesStaff] = useState([]);
  const [year, setYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    if (!isAdminUser) return;
    apiFetch("/api/admin/branch-staff").then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))).then((body) => {
      setSalesStaff((body.staff || []).filter((staff) => staff.role === "sales" && staff.isActive && BRANCH_CHOICES.includes(staff.branchCode)));
    }).catch(() => setSalesStaff([]));
  }, [isAdminUser]);

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
        productUnit: row.productUnit || "",
        productBarcode: row.productBarcode || "",
        focusType: row.focusType,
        targetQty: String(row.targetQty),
        dateFrom: toIsoDateOnly(row.dateFrom),
        dateTo: toIsoDateOnly(row.dateTo),
        branchCodes: row.branchCodesRaw || [],
        branchTargets: row.branchTargets || {},
        assignedPersonName: row.assignedPersonName || "",
        assignedStaffId: row.assignedStaffId || "",
        note: row.note || "",
        publicationStatus: row.publicationState || row.publicationStatus || "published",
        scheduledPublishAt: toDateTimeLocal(row.scheduledPublishAt),
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
    const incompleteBranches = BRANCH_CHOICES.filter((code) => !form.branchCodes.includes(code));
    const incompleteTargets = form.focusType === "salesperson"
      ? []
      : BRANCH_CHOICES.filter((code) => !(Number(form.branchTargets[code]) > 0));
    let validationError = null;
    if (!form.productCode.trim() || !form.productName) validationError = "กรุณาเลือกสินค้าที่ระบบค้นพบจากรหัสหรือบาร์โค้ด";
    else if (!(Number(form.targetQty) > 0)) validationError = "เป้าหมายต้องมากกว่า 0";
    else if (!form.dateFrom || !form.dateTo || form.dateTo < form.dateFrom) validationError = "กรุณาระบุช่วงวันที่ให้ถูกต้อง";
    else if (incompleteBranches.length) validationError = `ต้องเลือกสาขา ${BRANCH_CHOICES.join(", ")} ให้ครบ`;
    else if (incompleteTargets.length) validationError = `ต้องกำหนดเป้าหมายมากกว่า 0 ให้สาขา ${incompleteTargets.join(", ")}`;
    else if (form.focusType === "salesperson" && !form.assignedStaffId) validationError = "กรุณาเลือกพนักงานขาย";
    else if (form.publicationStatus === "scheduled" && !form.scheduledPublishAt) validationError = "กรุณาระบุวันและเวลาที่เผยแพร่";
    else if (form.publicationStatus === "scheduled" && form.scheduledPublishAt.slice(0, 10) > form.dateTo) validationError = "วันเผยแพร่ต้องไม่ช้ากว่าวันสิ้นสุดเป้า";
    if (validationError) {
      setModalState((prev) => ({ ...prev, submitting: false, submitError: validationError }));
      return;
    }
    setModalState((prev) => ({ ...prev, submitting: true, submitError: null }));
    const payload = {
      productCode: form.productCode.trim(),
      focusType: form.focusType,
      targetQty: Number(form.targetQty),
      dateFrom: form.dateFrom,
      dateTo: form.dateTo,
      branchCodes: form.branchCodes.length > 0 ? form.branchCodes : null,
      branchTargets: form.focusType !== "salesperson" && Object.keys(form.branchTargets).length > 0
        ? Object.fromEntries(Object.entries(form.branchTargets).map(([code, qty]) => [code, Number(qty)]))
        : null,
      assignedPersonName: form.focusType === "salesperson" ? (form.assignedPersonName || "").trim() || null : null,
      assignedStaffId: form.focusType === "salesperson" ? form.assignedStaffId || null : null,
      note: form.note.trim() || null,
      publicationStatus: form.publicationStatus,
      scheduledPublishAt: form.publicationStatus === "scheduled"
        ? (form.scheduledPublishAt ? new Date(form.scheduledPublishAt).toISOString() : null)
        : null,
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

      <SalesTargetsSection csrfToken={csrfToken} isAdminUser={isAdminUser} branchCode={branchCode} />

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
                  <div className="fp-month-actions"><button type="button" className="fp-btn-secondary" onClick={openCreateModalForSelectedMonth}>+ เพิ่มทีละสินค้า</button><button type="button" className="fp-btn-primary" onClick={() => setBatchModalOpen(true)}>▦ เพิ่มหลายสินค้าด้วยบาร์โค้ด</button></div>
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
                  restrictToBranch={!isAdminUser ? branchCode : null}
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
          salesStaff={salesStaff}
        />
      )}
      {batchModalOpen && selectedMonth && (
        <BatchFocusProductForm
          initialDates={monthBounds(year, selectedMonth)}
          csrfToken={csrfToken}
          salesStaff={salesStaff}
          onCancel={() => setBatchModalOpen(false)}
          onSaved={(count) => { setBatchModalOpen(false); setRefreshKey((value) => value + 1); window.alert(`สร้างสินค้าโฟกัสสำเร็จ ${count} รายการ`); }}
        />
      )}
    </div>
  );
}
