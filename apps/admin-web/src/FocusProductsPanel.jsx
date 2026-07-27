import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";

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

const LINE_PACKAGE_FOCUS_TYPES = ["group_manager", "store_manager", "salesperson"];

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
  extraProducts: [], // additional products sharing this row's single target
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
const BRANCH_LABELS = {
  "001": "สาขา 001",
  "003": "สาขา 003 วัดช่องลม",
  "004": "สาขา 004",
  "005": "สาขา 005",
};
const PRODUCT_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const PRODUCT_LOOKUP_CACHE_PREFIX = "focus-product-lookup:v2:";

function branchToneIndex(code) {
  return Math.max(0, BRANCH_CHOICES.indexOf(code)) % 4;
}

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

function toThaiBuddhistYear(year) {
  const parsed = Number(year);
  return Number.isFinite(parsed) ? parsed + 543 : year;
}

function formatThaiDateRange(from, to) {
  const start = toIsoDateOnly(from);
  const end = toIsoDateOnly(to);
  if (!start || !end) return "";
  const [sy, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  const thaiYear = toThaiBuddhistYear(ey || sy);
  if (sy === ey && sm === em) return `${sd}-${ed}/${em}/${thaiYear}`;
  return `${sd}/${sm}/${toThaiBuddhistYear(sy)}-${ed}/${em}/${thaiYear}`;
}

function formatBaht(value) {
  return formatNumber(value, 0);
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

// Admin view of a pharmacist/store_manager row: these types have no single
// combined verdict (each branch clears its own target), so summarise how many
// branches have closed rather than forcing one pass/fail for the whole row.
function BranchCloseCountBadge({ row, branchCodes }) {
  const judged = branchCodes.filter((code) => row.branchAchieved?.[code] != null);
  if (judged.length === 0) return <span className="fp-dash">-</span>;
  const closed = judged.filter((code) => row.branchAchieved[code]).length;
  // Kept short on purpose: this badge is nowrap and sits next to the actions
  // column in an already-wide per-branch matrix, so a long label overflows on
  // top of แก้ไข/ลบ. Full wording lives in the tooltip.
  return (
    <span
      className={`fp-status-badge ${closed === judged.length ? "ok" : "pending"}`}
      title={`ปิดเป้าแล้ว ${closed} จาก ${judged.length} สาขา`}
    >
      ปิด {closed}/{judged.length}
    </span>
  );
}

// A focus row can group several product codes under ONE shared target — staff
// may sell any mix of them as long as the combined quantity clears it. Rows
// created before that was supported (or served by an older API) only carry the
// single legacy field, so fall back to it.
function focusRowProducts(row) {
  if (row.products?.length) return row.products;
  return [{ productCode: row.productCode, productName: row.productName }];
}

function FocusProductCodes({ row }) {
  const products = focusRowProducts(row);
  return (
    <div className="fp-product-codes">
      {products.map((product) => (
        <span key={product.productCode}>{product.productCode}</span>
      ))}
    </div>
  );
}

function FocusProductNames({ row }) {
  const products = focusRowProducts(row);
  return (
    <div className="fp-product-names">
      {products.map((product) => (
        <span key={product.productCode} className="fp-product-name-line">
          {product.productName || product.productCode}
        </span>
      ))}
      {products.length > 1 && (
        <span
          className="fp-shared-target-hint"
          title="สินค้าเหล่านี้ใช้เป้าร่วมกัน ขายรสไหน/แบบไหนก็ได้ ขอให้ยอดรวมถึงเป้า"
        >
          เป้าร่วม {products.length} รายการ
        </span>
      )}
    </div>
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
  // When true the search box adds a product that SHARES this row's target
  // instead of replacing the main one, so the same lookup UI serves both.
  const [addingExtra, setAddingExtra] = useState(false);
  const extraProducts = form.extraProducts || [];

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
    if (addingExtra) {
      setForm((prev) => {
        const already = [prev.productCode, ...(prev.extraProducts || []).map((p) => p.productCode)];
        // Listing the same code twice would double-count its sales.
        if (already.some((code) => String(code).toLowerCase() === selected.code.toLowerCase())) return prev;
        return {
          ...prev,
          extraProducts: [...(prev.extraProducts || []), { productCode: selected.code, productName: selected.name }],
        };
      });
      setAddingExtra(false);
    } else {
      setForm((prev) => ({
        ...prev,
        productCode: selected.code,
        productName: selected.name,
        productUnit: selected.unit,
        productBarcode: selected.barcode,
      }));
    }
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
    <div className={`fp-modal-overlay fp-focus-form-overlay${form.id ? " is-edit" : ""}`} onClick={onCancel}>
      <div className={`fp-modal fp-focus-form-modal${form.id ? " is-edit" : ""}`} onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? "แก้ไขสินค้าโฟกัส" : "เพิ่มสินค้าโฟกัส"}</h3>

        <label className="fp-field">
          <span>{addingExtra ? "ค้นหาสินค้าที่ใช้เป้าร่วมกัน" : "รหัสสินค้า"}</span>
          <input
            type="text"
            value={addingExtra ? searchQuery : form.productCode}
            onChange={(e) => {
              if (addingExtra) {
                setSearchQuery(e.target.value);
                setBarcodeLookupError(null);
                return;
              }
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

        {/* Several products can share one target — e.g. Vicks Vapodrop honey-lemon
            and orange against a single 50: any split counts, so their sales are
            summed before the target is judged. */}
        {form.productCode && form.productName && (
          <div className="fp-shared-products">
            <div className="fp-shared-products-head">
              <span>สินค้าที่ใช้เป้าร่วมกัน</span>
              {addingExtra ? (
                <button type="button" className="fp-btn-link" onClick={() => { setAddingExtra(false); setSearchQuery(""); setSearchResults([]); }}>
                  ยกเลิก
                </button>
              ) : (
                <button type="button" className="fp-btn-link" onClick={() => { setAddingExtra(true); setSearchQuery(""); setSearchResults([]); }}>
                  ＋ เพิ่มสินค้า
                </button>
              )}
            </div>
            {extraProducts.length === 0 ? (
              <small className="fp-shared-products-empty">
                ยังไม่มี — เป้านี้นับเฉพาะ {form.productCode} เท่านั้น
              </small>
            ) : (
              <>
                <ul className="fp-shared-products-list">
                  {extraProducts.map((product) => (
                    <li key={product.productCode}>
                      <strong>{product.productCode}</strong> {product.productName}
                      <button
                        type="button"
                        className="fp-btn-link danger"
                        onClick={() => setForm((prev) => ({
                          ...prev,
                          extraProducts: (prev.extraProducts || []).filter((p) => p.productCode !== product.productCode),
                        }))}
                      >
                        เอาออก
                      </button>
                    </li>
                  ))}
                </ul>
                <small className="fp-shared-products-hint">
                  ยอดขายของทั้ง {extraProducts.length + 1} รายการจะถูกรวมกันก่อนเทียบเป้า
                </small>
              </>
            )}
            {addingExtra && (
              <small className="fp-shared-products-hint">
                พิมพ์รหัสหรือยิงบาร์โค้ดในช่องด้านบน แล้วเลือกสินค้าที่จะใช้เป้าร่วมกัน
              </small>
            )}
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

function productCodesText(row) {
  return focusRowProducts(row).map((product) => product.productCode).filter(Boolean).join("\n");
}

function productNamesText(row) {
  return focusRowProducts(row).map((product) => product.productName || product.productCode).filter(Boolean).join("\n");
}

function focusLinePackageRows(rows, type, branchCode) {
  return rows.filter((row) => (row.branchCodes || []).includes(branchCode)).map((row, index) => {
    const target = type === "salesperson"
      ? row.targetQty
      : row.branchTargetsEffective?.[branchCode] ?? row.targetQty;
    const sold = type === "salesperson"
      ? row.soldByBranch?.[branchCode] || 0
      : row.soldByBranch?.[branchCode] || 0;
    const achieved = type === "salesperson"
      ? Number(sold || 0) >= Number(target || 0)
      : row.branchAchieved?.[branchCode];
    return {
      no: index + 1,
      code: productCodesText(row),
      name: productNamesText(row),
      owner: row.assignedPersonName || "",
      target: Number(target || 0),
      sold: Number(sold || 0),
      achieved,
    };
  });
}

function focusLinePackageSections(rowsByType, branchCode) {
  return LINE_PACKAGE_FOCUS_TYPES.map((type) => ({
    type,
    title: FOCUS_TYPE_SHORT_LABELS[type],
    rows: focusLinePackageRows(rowsByType[type] || [], type, branchCode),
  }));
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildFocusLineRowFingerprint({ rowsByType, branchCode }) {
  const details = focusLinePackageSections(rowsByType, branchCode).map((section) => ({
    type: section.type,
    rows: section.rows.map((row) => ({
      code: row.code,
      target: row.target,
      sold: row.sold,
      achieved: row.achieved,
      owner: row.owner,
    })),
  }));
  return JSON.stringify({
    version: 2,
    branchCode,
    hash: hashText(JSON.stringify(details)),
    sections: details.map((section) => ({
      type: section.type,
      count: section.rows.length,
    })),
  });
}

function buildDefaultLineMessage({ branchCode, monthStart, progress, ciCount }) {
  const tiers = [...(progress?.tiers || [])].sort((a, b) => Number(a.tier) - Number(b.tier));
  const actualSoFar = progress?.actualSoFar ?? 0;
  const dateTo = progress?.asOfDate || monthStart;
  const tier3 = tiers.find((tier) => Number(tier.tier) === 3) || tiers[tiers.length - 1] || null;
  const targetLines = tiers
    .filter((tier) => tier.monthlyTarget != null)
    .map((tier) => `✅ Target เป้า ${tier.tier}= ${formatBaht(tier.monthlyTarget)}`);
  const averageNeeded = tier3?.remainingAvgPerDay ?? null;

  return [
    "รายงานยอดขาย",
    `${BRANCH_LABELS[branchCode] || `สาขา ${branchCode}`}`,
    `⏩ ยอดขายวันที่ ${formatThaiDateRange(monthStart, dateTo)}`,
    "",
    `= ${formatBaht(actualSoFar)} บาท`,
    "",
    ...targetLines,
    "",
    averageNeeded == null
      ? "ยังไม่ได้กำหนด Target เป้า 3"
      : `เฉลี่ยต่อวันต้องทำ ${formatBaht(averageNeeded)} บาท\nเพื่อให้ได้สเต็ป 3 ค่ะ`,
    "",
    `⏩ จำนวนยอดผู้ใช้สิทธิ ci = ${Number(ciCount || 0)} คน`,
  ].join("\n");
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || "-").split(/(\s+)/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current}${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current.trim());
      current = word.trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.length ? lines : ["-"];
}

function drawCell(ctx, text, x, y, width, height, options = {}) {
  ctx.fillStyle = options.fill || "#ffffff";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = options.stroke || "#6b7280";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = options.color || "#111827";
  ctx.font = options.font || "24px Arial, sans-serif";
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = "middle";
  const padding = 12;
  const maxWidth = Math.max(20, width - padding * 2);
  const lines = wrapCanvasText(ctx, text, maxWidth).slice(0, options.maxLines || 3);
  const lineHeight = options.lineHeight || 28;
  const totalHeight = lineHeight * lines.length;
  const startY = y + height / 2 - totalHeight / 2 + lineHeight / 2;
  const textX = options.align === "center" ? x + width / 2 : options.align === "right" ? x + width - padding : x + padding;
  lines.forEach((line, index) => {
    ctx.fillText(line, textX, startY + index * lineHeight, maxWidth);
  });
}

function renderFocusLinePackageImage({ rowsByType, branchCode, monthName, year }) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const sections = focusLinePackageSections(rowsByType, branchCode);
    const columnsByType = {
      salesperson: [
        ["no", "รายการ", 78],
        ["owner", "เป้ารายคน", 200],
        ["code", "รหัสสินค้า", 155],
        ["name", "สินค้าโฟกัส", 500],
        ["target", "เป้า", 115],
        ["sold", `ยอด ${branchCode}`, 125],
        ["status", "สถานะ", 115],
      ],
      store_manager: [
        ["no", "รายการ", 78],
        ["code", "รหัสสินค้า", 170],
        ["name", "สินค้าโฟกัส", 560],
        ["target", `เป้าสาขา ${branchCode}`, 150],
        ["sold", "ยอดล่าสุด", 130],
        ["status", "สถานะ", 120],
      ],
      group_manager: [
        ["no", "รายการ", 78],
        ["code", "รหัสสินค้า", 170],
        ["name", "สินค้าโฟกัส", 560],
        ["target", `เป้าสาขา ${branchCode}`, 150],
        ["sold", "ยอดล่าสุด", 130],
        ["status", "สถานะ", 120],
      ],
    };
    const tableWidth = Math.max(...Object.values(columnsByType).map((columns) => columns.reduce((sum, col) => sum + col[2], 0)));
    const width = tableWidth + 80;
    const left = Math.floor((width - tableWidth) / 2);
    const mainTitleHeight = 66;
    const sectionTitleHeight = 52;
    const headHeight = 46;
    const emptyHeight = 52;
    const sectionGap = 24;
    const footerHeight = 26;
    ctx.font = "22px Arial, sans-serif";
    const measuredSections = sections.map((section) => {
      const columns = columnsByType[section.type];
      const tableWidthForSection = columns.reduce((sum, col) => sum + col[2], 0);
      const sectionLeft = left + Math.floor((tableWidth - tableWidthForSection) / 2);
      const nameCol = columns.find((col) => col[0] === "name");
      const codeCol = columns.find((col) => col[0] === "code");
      const ownerCol = columns.find((col) => col[0] === "owner");
      const rowHeights = section.rows.map((row) => {
        const nameLines = wrapCanvasText(ctx, row.name, nameCol[2] - 24).slice(0, 3).length;
        const codeLines = wrapCanvasText(ctx, row.code, codeCol[2] - 24).slice(0, 3).length;
        const ownerLines = ownerCol ? wrapCanvasText(ctx, row.owner, ownerCol[2] - 24).slice(0, 2).length : 1;
        return Math.max(56, 20 + Math.max(nameLines, codeLines, ownerLines) * 26);
      });
      const height = sectionTitleHeight + headHeight + (rowHeights.length ? rowHeights.reduce((sum, h) => sum + h, 0) : emptyHeight);
      return { ...section, columns, rowHeights, height, sectionLeft, tableWidthForSection };
    });
    canvas.width = width;
    canvas.height = mainTitleHeight
      + measuredSections.reduce((sum, section) => sum + section.height + sectionGap, 0)
      - sectionGap
      + footerHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCell(
      ctx,
      `${BRANCH_LABELS[branchCode] || `สาขา ${branchCode}`} สินค้าโฟกัส เดือน ${monthName} ${toThaiBuddhistYear(year)}`,
      left,
      0,
      tableWidth,
      mainTitleHeight,
      { fill: "#2fb7e4", color: "#0f172a", font: "bold 30px Arial, sans-serif", align: "center", maxLines: 1 },
    );

    let y = mainTitleHeight;
    measuredSections.forEach((section, sectionIndex) => {
      drawCell(ctx, section.title, section.sectionLeft, y, section.tableWidthForSection, sectionTitleHeight, {
        fill: sectionIndex % 2 === 0 ? "#c4b5fd" : "#fde68a",
        color: "#111827",
        font: "bold 25px Arial, sans-serif",
        align: "center",
        maxLines: 1,
      });
      y += sectionTitleHeight;

      let x = section.sectionLeft;
      for (const [, label, colWidth] of section.columns) {
        drawCell(ctx, label, x, y, colWidth, headHeight, {
          fill: "#9ee7fb",
          color: "#0f172a",
          font: "bold 21px Arial, sans-serif",
          align: "center",
          maxLines: 1,
        });
        x += colWidth;
      }
      y += headHeight;

      if (section.rows.length === 0) {
        drawCell(ctx, "ไม่มีรายการสำหรับสาขานี้", section.sectionLeft, y, section.tableWidthForSection, emptyHeight, {
          fill: "#f8fafc",
          color: "#64748b",
          font: "22px Arial, sans-serif",
          align: "center",
          maxLines: 1,
        });
        y += emptyHeight;
      } else {
        section.rows.forEach((row, rowIndex) => {
          x = section.sectionLeft;
          const rowHeight = section.rowHeights[rowIndex];
          for (const [key, , colWidth] of section.columns) {
            let value = row[key];
            let align = "left";
            let color = "#111827";
            if (key === "no") {
              value = row.no;
              align = "center";
            } else if (key === "target" || key === "sold") {
              value = formatNumber(value);
              align = "center";
              color = key === "sold" && row.achieved === false ? "#b91c1c" : "#0f172a";
            } else if (key === "status") {
              value = row.achieved === true ? "ถึงเป้า" : row.achieved === false ? "ยังไม่ถึง" : "-";
              align = "center";
              color = row.achieved === true ? "#047857" : row.achieved === false ? "#b91c1c" : "#64748b";
            }
            drawCell(ctx, value, x, y, colWidth, rowHeight, {
              fill: rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc",
              color,
              font: key === "name" ? "21px Arial, sans-serif" : "bold 21px Arial, sans-serif",
              align,
              lineHeight: 26,
            });
            x += colWidth;
          }
          y += rowHeight;
        });
      }

      if (sectionIndex < measuredSections.length - 1) {
        y += sectionGap;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, y - sectionGap, canvas.width, sectionGap);
      }
    });

    resolve(canvas.toDataURL("image/png"));
  });
}

function FocusLinePackageModal({ rowsByType, selectedMonth, year, csrfToken, restrictToBranch, onClose }) {
  const monthStart = `${year}-${pad2(selectedMonth)}-01`;
  const branchOptions = useMemo(() => {
    const codes = new Set();
    LINE_PACKAGE_FOCUS_TYPES.forEach((type) => {
      (rowsByType[type] || []).forEach((row) => (row.branchCodes || []).forEach((code) => codes.add(code)));
    });
    const all = [...codes].sort();
    return restrictToBranch ? all.filter((code) => code === restrictToBranch) : all;
  }, [rowsByType, restrictToBranch]);
  const [branchCode, setBranchCode] = useState(restrictToBranch || branchOptions[0] || BRANCH_CHOICES[0]);
  const [ciCount, setCiCount] = useState("");
  const [progress, setProgress] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageDirty, setMessageDirty] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [preparingImage, setPreparingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packageSaved, setPackageSaved] = useState(false);
  const [imageDownloaded, setImageDownloaded] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const busyMessage = saving
    ? "กำลังบันทึกและเตรียมรูปสำหรับส่ง LINE..."
    : preparingImage
      ? "กำลังสร้างรูปตารางสินค้า..."
    : loadingProgress
      ? `กำลังโหลดข้อมูล${BRANCH_LABELS[branchCode] || `สาขา ${branchCode}`}...`
      : "";

  useEffect(() => {
    if (!branchCode) return undefined;
    let active = true;
    setLoadingProgress(true);
    setError(null);
    apiFetch(`/api/admin/sales-targets/progress?branchCode=${encodeURIComponent(branchCode)}&month=${encodeURIComponent(monthStart)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
        if (active) setProgress(body);
      })
      .catch((err) => {
        if (active) {
          setProgress(null);
          setError(err.message || "โหลดเป้ายอดขายไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (active) setLoadingProgress(false);
      });
    return () => {
      active = false;
    };
  }, [branchCode, monthStart]);

  const defaultMessage = useMemo(() => buildDefaultLineMessage({
    branchCode,
    monthStart,
    progress,
    ciCount: Number(ciCount || 0),
  }), [branchCode, ciCount, monthStart, progress]);

  useEffect(() => {
    if (!messageDirty) setMessageText(defaultMessage);
  }, [defaultMessage, messageDirty]);

  async function copyMessage() {
    await navigator.clipboard.writeText(messageText);
    setMessageCopied(true);
    setStatus("คัดลอกข้อความแล้ว");
  }

  async function buildImagePreview() {
    const rendered = await renderFocusLinePackageImage({
      rowsByType,
      branchCode,
      monthName: THAI_MONTH_NAMES[selectedMonth - 1],
      year,
    });
    setImageDataUrl(rendered);
    return rendered;
  }

  async function downloadImage() {
    setPreparingImage(true);
    setError(null);
    setStatus("");
    let image = imageDataUrl;
    try {
      if (!image) image = await buildImagePreview();
    } catch (err) {
      setError(err.message || "สร้างรูปไม่สำเร็จ");
      return;
    } finally {
      setPreparingImage(false);
    }
    const anchor = document.createElement("a");
    anchor.href = image;
    anchor.download = `focus-line-${monthStart}-${branchCode}.png`;
    anchor.click();
    setImageDownloaded(true);
    setStatus("ดาวน์โหลดรูปแล้ว");
  }

  async function handleSaveAndCopy() {
    setSaving(true);
    setError(null);
    setStatus("");
    try {
      const rendered = imageDataUrl || await buildImagePreview();
      const response = await apiFetch("/api/admin/focus-products/line-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          focusType: "group_manager",
          branchCode,
          dateFrom: monthStart,
          dateTo: progress?.asOfDate || monthStart,
          ciCount: Number(ciCount || 0),
          messageText,
          rowFingerprint: buildFocusLineRowFingerprint({ rowsByType, branchCode }),
          imageDataUrl: rendered,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
      await navigator.clipboard.writeText(messageText);
      setPackageSaved(true);
      setMessageCopied(true);
      setStatus(body.duplicate ? "ข้อมูลชุดนี้เคยบันทึกแล้ว ระบบคัดลอกข้อความเดิมให้แล้ว" : "บันทึกและคัดลอกข้อความแล้ว");
    } catch (err) {
      setError(err.message || "บันทึกชุดส่ง LINE ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fp-modal-overlay" onClick={onClose}>
      <div className="fp-modal fp-line-package-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {busyMessage && (
          <div className="fp-line-package-loading-overlay" role="status" aria-live="polite">
            <div className="fp-loading-spinner" />
            <strong>{busyMessage}</strong>
            <span>รอสักครู่ ระบบกำลังเตรียมข้อความและข้อมูลล่าสุดของสาขานี้</span>
          </div>
        )}
        <button type="button" className="fp-table-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        <h3>เตรียมส่ง LINE รวม 3 ตาราง</h3>
        <div className="fp-line-package-controls">
          {restrictToBranch ? (
            <div className="fp-field fp-line-package-branch-lock">
              <span>สาขา</span>
              <strong>{BRANCH_LABELS[branchCode] || `สาขา ${branchCode}`}</strong>
            </div>
          ) : (
            <label className="fp-field">
              <span>สาขา</span>
              <select value={branchCode} disabled={Boolean(busyMessage)} onChange={(event) => {
                setBranchCode(event.target.value);
                setMessageDirty(false);
                setImageDataUrl("");
                setPackageSaved(false);
                setImageDownloaded(false);
                setMessageCopied(false);
                setStatus("");
              }}>
                {branchOptions.map((code) => <option key={code} value={code}>{BRANCH_LABELS[code] || `สาขา ${code}`}</option>)}
              </select>
            </label>
          )}
          <label className="fp-field">
            <span>จำนวน CI</span>
            <input type="number" min="0" step="1" value={ciCount} disabled={Boolean(busyMessage)} onChange={(event) => {
              setCiCount(event.target.value);
              setMessageDirty(false);
              setPackageSaved(false);
              setMessageCopied(false);
              setStatus("");
            }} placeholder="กรอกเอง" />
          </label>
        </div>
        <label className="fp-field">
          <span>ข้อความที่จะคัดลอกไป LINE</span>
          <textarea
            className="fp-line-package-message"
            value={messageText}
            disabled={Boolean(busyMessage)}
            onChange={(event) => {
              setMessageText(event.target.value);
              setMessageDirty(true);
              setPackageSaved(false);
              setMessageCopied(false);
            }}
          />
        </label>
        <div className="fp-line-package-preview">
          <div>
            <strong>รูปตารางสินค้า</strong>
            <span>ผจก.กลุ่ม + ผจก.สาขา + รายคน · {BRANCH_LABELS[branchCode] || branchCode}</span>
          </div>
          {imageDataUrl ? <img src={imageDataUrl} alt="ตัวอย่างรูปตารางสินค้าโฟกัสสำหรับส่ง LINE" /> : <span>กดดาวน์โหลดรูป หรือ บันทึกและคัดลอก เพื่อสร้างรูปตารางสินค้า</span>}
        </div>
        {error && <div className="fp-form-error">{error}</div>}
        {status && <div className="fp-form-success">{status}</div>}
        <div className="fp-line-package-steps" aria-label="ขั้นตอนเตรียมส่ง LINE">
          <div className="fp-line-package-step">
            <span className="fp-line-package-step-number">1</span>
            <button type="button" className="fp-btn-primary fp-line-package-save-button" onClick={handleSaveAndCopy} disabled={!messageText || loadingProgress || saving || packageSaved}>
              {saving ? "กำลังบันทึก..." : packageSaved ? "บันทึกแล้ว" : "บันทึกและคัดลอก"}
            </button>
            <span className={`fp-line-package-status-light${packageSaved ? " is-complete" : ""}`} aria-label={packageSaved ? "บันทึกแล้ว" : "ยังไม่ได้บันทึก"} />
            <small>{packageSaved ? "บันทึกขึ้น R2 แล้ว" : "ต้องกดบันทึกก่อน"}</small>
          </div>
          <div className="fp-line-package-step">
            <span className="fp-line-package-step-number">2</span>
            <button type="button" className="fp-btn-secondary" onClick={downloadImage} disabled={!packageSaved || loadingProgress || Boolean(busyMessage)}>
              {preparingImage ? "กำลังสร้างรูป..." : imageDataUrl ? "ดาวน์โหลดรูป" : "สร้างและดาวน์โหลดรูป"}
            </button>
            <span className={`fp-line-package-status-light${imageDownloaded ? " is-complete" : ""}`} aria-label={imageDownloaded ? "ดาวน์โหลดแล้ว" : "ยังไม่ได้ดาวน์โหลด"} />
            <small>{imageDownloaded ? "ดาวน์โหลดแล้ว กดซ้ำได้" : "ดาวน์โหลดได้หลังบันทึก"}</small>
          </div>
          <div className="fp-line-package-step">
            <span className="fp-line-package-step-number">3</span>
            <button type="button" className="fp-btn-secondary" onClick={copyMessage} disabled={!packageSaved || !messageText || Boolean(busyMessage)}>คัดลอกข้อความ</button>
            <span className={`fp-line-package-status-light${messageCopied ? " is-complete" : ""}`} aria-label={messageCopied ? "คัดลอกแล้ว" : "ยังไม่ได้คัดลอก"} />
            <small>{messageCopied ? "คัดลอกแล้ว กดซ้ำได้" : "คัดลอกได้หลังบันทึก"}</small>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mirrors the source Excel's "สินค้าโฟกัส เดือน ..." layout: one column per
// branch instead of a combined chip cell, person name and target up front.
function SalespersonFocusTable({ rows, isAdminUser, onEdit, onDelete, staffHireDateByStaffId }) {
  const branchCodes = useMemo(() => {
    const codes = new Set();
    for (const row of rows) {
      for (const code of row.branchCodes || []) codes.add(code);
    }
    return [...codes].sort();
  }, [rows]);

  // Seniority order: earliest hire_date first. Staff with no hire_date on
  // record yet (never entered, or the row has no assignedStaffId) sort last
  // rather than being mistaken for the earliest hire.
  const sortedRows = useMemo(() => {
    const hireDateFor = (row) => (row.assignedStaffId && staffHireDateByStaffId?.get(row.assignedStaffId)) || null;
    return [...rows].sort((a, b) => {
      const dateA = hireDateFor(a);
      const dateB = hireDateFor(b);
      if (dateA && dateB) return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
      if (dateA) return -1;
      if (dateB) return 1;
      return 0;
    });
  }, [rows, staffHireDateByStaffId]);

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
          {sortedRows.map((row, index) => (
            <tr key={row.id} className={row.isActive === false ? "fp-inactive-row" : ""}>
              <td>{index + 1}</td>
              <td>{row.assignedPersonName || "-"}</td>
              <td><FocusProductCodes row={row} /></td>
              <td>{formatNumber(row.targetQty)}</td>
              <td className="fp-col-wide"><FocusProductNames row={row} />{isAdminUser && <PublicationBadge row={row} />}</td>
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
              <td><FocusProductCodes row={row} /></td>
              <td className="fp-col-wide"><FocusProductNames row={row} />{isAdminUser && <PublicationBadge row={row} />}</td>
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
            <th rowSpan={2} className="fp-status-col">สถานะ</th>
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
          {rows.map((row) => {
            // A shared-target group only splits into one row per product when
            // every product actually carries its own sold-by-branch breakdown.
            // Rows frozen before that breakdown existed (migration 064) only
            // have the group's combined total, so they fall back to one merged
            // row rather than showing wrong/blank per-product numbers.
            const groupProducts = focusRowProducts(row);
            const canSplit = groupProducts.length > 1 && groupProducts.every((p) => p.soldByBranch);
            const productRows = canSplit ? groupProducts : [null];
            const spanCount = productRows.length;

            return productRows.map((product, productIndex) => (
              <tr key={product ? `${row.id}-${product.productCode}` : row.id} className={row.isActive === false ? "fp-inactive-row" : ""}>
                <td>{product ? product.productCode : <FocusProductCodes row={row} />}</td>
                <td className="fp-col-wide">
                  {product ? (product.productName || product.productCode) : <FocusProductNames row={row} />}
                  {isAdminUser && productIndex === 0 && <PublicationBadge row={row} />}
                  {productIndex === 0 && groupProducts.length > 1 && (
                    <span
                      className="fp-shared-target-hint"
                      title="สินค้าเหล่านี้ใช้เป้าร่วมกัน ขายรสไหน/แบบไหนก็ได้ ขอให้ยอดรวมถึงเป้า"
                    >
                      เป้าร่วม {groupProducts.length} รายการ
                    </span>
                  )}
                </td>
                {branchCodes.map((code, branchIndex) => {
                  const target = row.branchTargetsEffective?.[code];
                  const sold = product ? (product.soldByBranch?.[code] || 0) : (row.soldByBranch?.[code] || 0);
                  const pass = row.branchAchieved ? row.branchAchieved[code] : null;
                  const cls = pass === null || pass === undefined ? "" : pass ? "fp-cell-ok" : "fp-cell-fail";
                  return (
                    <Fragment key={code}>
                      {productIndex === 0 && (
                        <td className={`fp-target-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"}`} rowSpan={spanCount}>
                          {target != null ? formatNumber(target) : "-"}
                        </td>
                      )}
                      <td className={`fp-sold-col fp-branch-group-${branchIndex % 2 === 0 ? "a" : "b"} ${cls}`}>
                        {formatNumber(sold)}
                      </td>
                    </Fragment>
                  );
                })}
                {productIndex === 0 && (
                  <td className="fp-status-col" rowSpan={spanCount}>
                    {/* Staff see only their own branch, so a single verdict is the
                        honest answer for them; admins see every branch, so a count.
                        Neither reads row.isFrozen — that flag means "the period
                        ended and the numbers were locked", NOT "the target was met". */}
                    {restrictToBranch
                      ? <StatusBadge achieved={row.branchAchieved?.[restrictToBranch] ?? null} />
                      : <BranchCloseCountBadge row={row} branchCodes={branchCodes} />}
                    {row.isFrozen && (
                      <span className="fp-frozen-badge" title="ยอดขายถูกล็อกแล้วเมื่อสิ้นสุดช่วงเวลา">
                        🔒 ปิดยอด
                      </span>
                    )}
                  </td>
                )}
                {isAdminUser && productIndex === 0 && (
                  <td className="fp-actions-cell" rowSpan={spanCount}>
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
            ));
          })}
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
              colSpan={activeBranch === "all" ? 5 + (branchCodes.length * 2) + (isAdminUser ? 1 : 0) : 6 + (isAdminUser ? 1 : 0)}
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
              // No combined target column here on purpose: group_manager success
              // requires every branch to clear its OWN target, so a summed target
              // is meaningless — one branch selling a lot cannot cover another
              // branch that missed. Only the combined SOLD figure is shown.
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
                <td><FocusProductCodes row={row} /></td>
                <td className="fp-col-wide"><FocusProductNames row={row} />{isAdminUser && <PublicationBadge row={row} />}</td>
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
                {activeBranch !== "all" && <td>{target != null ? formatNumber(target) : "-"}</td>}
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

function FocusSectionTable({ type, typeRows, isAdminUser, onEdit, onDelete, restrictToBranch, staffHireDateByStaffId }) {
  if (type === "salesperson") {
    return (
      <SalespersonFocusTable
        rows={typeRows}
        isAdminUser={isAdminUser}
        onEdit={onEdit}
        onDelete={onDelete}
        staffHireDateByStaffId={staffHireDateByStaffId}
      />
    );
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

function FocusProductsTables({ rows, isAdminUser, onEdit, onDelete, restrictToBranch, staffHireDateByStaffId }) {
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
            className={`fp-section fp-section-clickable fp-focus-section fp-focus-section--${type}`}
            onClick={() => setExpandedType(type)}
            title="คลิกเพื่อดูแบบเต็มหน้าจอ"
          >
            <div className="fp-focus-section-header">
              <h3 className="fp-section-title">{FOCUS_TYPE_LABELS[type]}</h3>
            </div>
            <FocusSectionTable
              type={type}
              typeRows={typeRows}
              isAdminUser={isAdminUser}
              onEdit={onEdit}
              onDelete={onDelete}
              restrictToBranch={restrictToBranch}
              staffHireDateByStaffId={staffHireDateByStaffId}
            />
          </section>
        );
      })}

      {expandedType && (
        <div className="fp-table-modal-overlay" onClick={() => setExpandedType(null)}>
          <div
            className={`fp-table-modal fp-focus-table-modal fp-focus-section--${expandedType}`}
            onClick={(e) => e.stopPropagation()}
          >
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
              staffHireDateByStaffId={staffHireDateByStaffId}
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
      <div className="fp-calendar-topbar">
        <div className="fp-calendar-title">
          <h2>สินค้าโฟกัส และ ยอดขาย</h2>
          <p>เลือกเดือนเพื่อดูและจัดการเป้าหมายสินค้า</p>
        </div>
        <div className="fp-calendar-header">
          <button type="button" className="fp-year-nav-btn" onClick={() => onYearChange(year - 1)} aria-label="ปีก่อนหน้า">
            ‹
          </button>
          <input
            type="number"
            className="fp-year-input"
            value={year}
            aria-label="ปีที่ต้องการดู"
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isInteger(next) && next > 1900) onYearChange(next);
            }}
          />
          <button type="button" className="fp-year-nav-btn" onClick={() => onYearChange(year + 1)} aria-label="ปีถัดไป">
            ›
          </button>
        </div>
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
function LoadingOverlay({ active, onNavigateBack }) {
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
        {onNavigateBack && (
          <button type="button" className="fp-loading-back-button" onClick={onNavigateBack}>
            กลับหน้าสต๊อกสาขา
          </button>
        )}
      </div>
    </div>
  );
}

// Every product code a batch row covers — the scanned one plus anything merged
// into it to share its target.
function batchRowCodes(row) {
  return [row.productCode, ...(row.extraProducts || []).map((p) => p.productCode)];
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
      // Also checks merged-in products, or a code could end up counted by two
      // targets once the rows are grouped.
      if (focusType !== "salesperson" && rows.some((row) => batchRowCodes(row).includes(product.productCode))) {
        throw new Error("สินค้านี้อยู่ในรายการแล้ว");
      }
      setRows((prev) => [...prev, {
        productCode: product.productCode,
        productName: product.productName || "",
        barcode: product.barcode || query,
        unit: product.unitName || product.unit_name || product.unit || product.unitCode || product.unit_code || "",
        stockByBranch: product.stockByBranch || {},
        targetQty: "",
        assignedPersonName: "",
        assignedStaffId: "",
        extraProducts: [], // products merged into this row, sharing its target
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

  // Folds a scanned row into the one above it so both products share that row's
  // single target — the Vicks honey-lemon + orange case. Scan normally, then
  // merge, rather than making every scan ask "new target or existing one?".
  function mergeIntoPrevious(index) {
    if (index < 1) return;
    setRows((prev) => {
      const target = prev[index - 1];
      const source = prev[index];
      const merged = {
        ...target,
        extraProducts: [
          ...(target.extraProducts || []),
          { productCode: source.productCode, productName: source.productName },
          ...(source.extraProducts || []),
        ],
        // Keep the combined group's stock realistic: the warnings compare target
        // against stock, and any of the grouped products can satisfy the target.
        stockByBranch: Object.fromEntries(BRANCH_CHOICES.map((code) => [
          code,
          Number(target.stockByBranch?.[code] || 0) + Number(source.stockByBranch?.[code] || 0),
        ])),
      };
      return prev.map((row, i) => (i === index - 1 ? merged : row)).filter((_, i) => i !== index);
    });
  }

  // Pulls a merged product back out into a row of its own.
  function splitProduct(rowIndex, productCode) {
    setRows((prev) => {
      const row = prev[rowIndex];
      const removed = (row.extraProducts || []).find((p) => p.productCode === productCode);
      if (!removed) return prev;
      const kept = {
        ...row,
        extraProducts: (row.extraProducts || []).filter((p) => p.productCode !== productCode),
      };
      const restored = {
        productCode: removed.productCode,
        productName: removed.productName || "",
        barcode: "",
        unit: "",
        stockByBranch: {}, // unknown once merged; re-scan the code to refresh it
        targetQty: "",
        assignedPersonName: "",
        assignedStaffId: "",
        extraProducts: [],
        branchTargets: Object.fromEntries(BRANCH_CHOICES.map((code) => [code, ""])),
      };
      const next = [...prev];
      next[rowIndex] = kept;
      next.splice(rowIndex + 1, 0, restored);
      return next;
    });
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
            productCodes: batchRowCodes(row),
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
        <div className="fp-field-row fp-batch-basics">
          <label className="fp-field"><span>ประเภทโฟกัส</span><select value={focusType} onChange={(e) => setFocusType(e.target.value)}>{FOCUS_TYPE_ORDER.map((type) => <option key={type} value={type}>{FOCUS_TYPE_LABELS[type]}</option>)}</select></label>
          <label className="fp-field"><span>จากวันที่</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label className="fp-field"><span>ถึงวันที่</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        </div>
        <label className="fp-field fp-batch-scan-field"><span>ยิงบาร์โค้ดหรือกรอกรหัสสินค้า</span><div className="fp-batch-scan-row"><input ref={scanRef} autoFocus value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addScannedProduct(); } }} placeholder="ยิงบาร์โค้ดแล้ว Enter" /><button type="button" className="fp-btn-secondary" onClick={addScannedProduct} disabled={busy}>เพิ่ม</button></div></label>
        {focusType !== "salesperson" && <div className="fp-copy-tools"><span>คัดลอกเป้าทุกแถวจาก</span><select value={copyFromBranch} onChange={(e) => setCopyFromBranch(e.target.value)}>{BRANCH_CHOICES.map((code) => <option key={code}>{code}</option>)}</select><span>ไป</span><select value={copyToBranch} onChange={(e) => setCopyToBranch(e.target.value)}>{BRANCH_CHOICES.map((code) => <option key={code}>{code}</option>)}</select><button type="button" className="fp-btn-secondary" onClick={copyBranchTargets}>คัดลอก</button></div>}
        <div className={`fp-batch-table-wrap fp-batch-table-wrap--${focusType}`}><table className={`fp-batch-table fp-batch-table--${focusType}`}><thead><tr><th>สินค้า</th><th>หน่วย</th>{focusType === "salesperson" ? <><th>พนักงานขาย</th><th>เป้ารวม</th></> : <><th>เป้าหลัก</th>{BRANCH_CHOICES.map((code) => <th key={code}>{code}<small>stock</small></th>)}</>}<th /></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.productCode}-${index}`}><td><strong>{row.productCode}</strong><span>{row.productName}</span>{(row.extraProducts || []).map((extra) => <span key={extra.productCode} className="fp-batch-merged-product"><strong>+ {extra.productCode}</strong> {extra.productName}<button type="button" className="fp-btn-link danger" onClick={() => splitProduct(index, extra.productCode)}>แยก</button></span>)}{(row.extraProducts || []).length > 0 && <small className="fp-batch-merged-hint">ใช้เป้าร่วมกัน {batchRowCodes(row).length} รายการ</small>}{index > 0 && <button type="button" className="fp-btn-link fp-batch-merge-btn" title="รวมแถวนี้เข้ากับแถวบน ให้ใช้เป้าเดียวกัน (เช่น วิคส์รสน้ำผึ้งมะนาว + รสส้ม)" onClick={() => mergeIntoPrevious(index)}>🔗 รวมเป้ากับแถวบน</button>}</td><td className="fp-batch-unit-cell">{row.unit || "-"}</td>{focusType === "salesperson" ? <><td><select value={row.assignedStaffId} onChange={(e) => { const staff = salesStaff.find((item) => item.staffId === e.target.value); updateRow(index, (old) => ({ ...old, assignedStaffId: e.target.value, assignedPersonName: staff?.displayName || "" })); }}><option value="">เลือกพนักงานขาย</option>{salesStaff.map((staff) => <option key={staff.staffId} value={staff.staffId}>{staff.displayName} — {staff.branchCode}{staff.isProbationary ? " (ทดลองงาน)" : ""}</option>)}</select></td><td><input type="number" min="1" value={row.targetQty} onChange={(e) => updateRow(index, (old) => ({ ...old, targetQty: e.target.value }))} /></td></> : <><td><input type="number" min="1" value={row.targetQty} onChange={(e) => updateRow(index, (old) => ({ ...old, targetQty: e.target.value }))} /><button type="button" onClick={() => applySameTarget(index)}>ใช้ทุกสาขา</button></td>{BRANCH_CHOICES.map((code) => <td key={code} className={Number(row.stockByBranch?.[code] || 0) <= 0 ? "warning" : ""}><input type="number" min="1" value={row.branchTargets[code]} onChange={(e) => updateRow(index, (old) => ({ ...old, branchTargets: { ...old.branchTargets, [code]: e.target.value } }))} /><small>{Number(row.stockByBranch?.[code] || 0)}</small></td>)}</>}<td><button type="button" className="fp-btn-link danger" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>ลบ</button></td></tr>)}</tbody></table></div>
        {!rows.length && <div className="fp-empty">ยิงบาร์โค้ดเพื่อเพิ่มสินค้าได้ต่อเนื่อง</div>}
        {(issues.length > 0 || coverageReminderList.length > 0 || warningList.length > 0) && (
          <div className="fp-batch-feedback-grid">
            {issues.length > 0 && (
              <details className="fp-batch-feedback-card fp-batch-issues">
                <summary><strong>ยังบันทึกไม่ได้</strong><span className="fp-batch-feedback-count">{issues.length}</span><span className="fp-batch-feedback-toggle">ดูรายละเอียด</span></summary>
                <div className="fp-batch-feedback-body">{issues.map((issue) => <span key={issue}>{issue}</span>)}</div>
              </details>
            )}
            {coverageReminderList.length > 0 && (
              <details className="fp-batch-feedback-card fp-batch-coverage">
                <summary><strong>เตือนความครอบคลุม</strong><span className="fp-batch-feedback-count">{coverageReminderList.length}</span><span className="fp-batch-feedback-toggle">ดูรายละเอียด</span></summary>
                <div className="fp-batch-feedback-body"><span>ยังไม่ได้ระบุสินค้าโฟกัสให้:</span>{coverageReminderList.map((item) => <span key={item}>{item}</span>)}</div>
              </details>
            )}
            {warningList.length > 0 && (
              <details className="fp-batch-feedback-card fp-batch-warnings">
                <summary><strong>คำเตือน</strong><span className="fp-batch-feedback-count">{warningList.length}</span><span className="fp-batch-feedback-toggle">ดูรายละเอียด</span></summary>
                <div className="fp-batch-feedback-body">{warningList.slice(0, 8).map((warning) => <span key={warning}>{warning}</span>)}</div>
              </details>
            )}
          </div>
        )}
        <div className="fp-field-row fp-batch-publication-row"><label className="fp-field"><span>การเผยแพร่</span><select value={publicationStatus} onChange={(e) => setPublicationStatus(e.target.value)}><option value="draft">บันทึกร่าง</option><option value="published">เผยแพร่ทันที</option><option value="scheduled">ตั้งเวลาเผยแพร่</option></select></label>{publicationStatus === "scheduled" && <label className="fp-field"><span>วันเวลาเผยแพร่</span><input type="datetime-local" value={scheduledPublishAt} onChange={(e) => setScheduledPublishAt(e.target.value)} /></label>}</div>
        {error && <div className="fp-form-error">{error}</div>}
        <div className="fp-modal-actions"><button type="button" className="fp-btn-danger" onClick={requestClose} disabled={busy}>ยกเลิก</button><button type="button" className="fp-btn-primary" onClick={requestSubmitBatch} disabled={busy || issues.length > 0}>{busy ? "กำลังบันทึก..." : `สร้าง ${rows.length} รายการ`}</button></div>
      </div>
    </div>
  );
}

const SALES_TARGET_TIER_LABELS = { 1: "ขั้นที่ 1", 2: "ขั้นที่ 2", 3: "ขั้นที่ 3" };

const SALES_TARGET_COLUMN_DEFS = [
  { key: "monthlyTarget", label: "เป้าเดือน" },
  { key: "dailyTarget", label: "เป้า/วัน" },
  { key: "actualAvgPerDay", label: "เฉลี่ย/วัน" },
  { key: "remainingAmount", label: "คงเหลือ" },
  { key: "remainingAvgPerDay", label: "เฉลี่ย/วัน (คงเหลือ)" },
  { key: "achieved", label: "สถานะ" },
];

const SALES_TARGET_COLUMN_VISIBILITY_KEY = "sales-targets:visible-columns:v1";
const DAILY_PAGE_SIZE_OPTIONS = [10, 50, 100];

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

function dailyWeekdayClass(iso) {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `fp-weekday-${weekday}`;
}

// Admin-only inline form for setting the 3 tier targets for the currently
// selected branch/month. Kept separate from the read-only progress table so
// staff (who never see this) get a strictly smaller component tree.
function SalesTargetEditForm({ tiers, onSave, saving, disabled = false, saveError, saveSuccess }) {
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
      <button
        type="button"
        className="fp-btn-primary"
        disabled={saving || disabled}
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
      {saveError && <div className="fp-form-error">{saveError}</div>}
      {saveSuccess && <div className="fp-form-success">บันทึกเป้าเรียบร้อยแล้ว</div>}
    </div>
  );
}

function SalesTargetsSection({ csrfToken, isAdminUser, branchCode }) {
  const [selectedBranch, setSelectedBranch] = useState(isAdminUser ? BRANCH_CHOICES[0] : branchCode);
  const [selectedBranches, setSelectedBranches] = useState(() =>
    isAdminUser ? [...BRANCH_CHOICES] : (branchCode ? [branchCode] : []),
  );
  const [month, setMonth] = useState(currentMonthValue());
  const [progress, setProgress] = useState(null);
  const [progressByBranch, setProgressByBranch] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingBranch, setSavingBranch] = useState("");
  const [saveError, setSaveError] = useState(null);
  const [saveErrorBranch, setSaveErrorBranch] = useState("");
  const [savedBranch, setSavedBranch] = useState("");
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [salesTargetTableExpanded, setSalesTargetTableExpanded] = useState(false);
  const [salesTargetEditModalOpen, setSalesTargetEditModalOpen] = useState(false);
  const [salesTargetExitConfirmOpen, setSalesTargetExitConfirmOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(true);
  const [dailyDateFilterOpen, setDailyDateFilterOpen] = useState(false);
  const [dailyDateSort, setDailyDateSort] = useState("desc");
  const [excludedDailyDates, setExcludedDailyDates] = useState(() => new Set());
  const [dailyPageSize, setDailyPageSize] = useState(DAILY_PAGE_SIZE_OPTIONS[0]);
  const [dailyPage, setDailyPage] = useState(1);

  const activeBranch = isAdminUser ? selectedBranch : branchCode;

  useEffect(() => {
    localStorage.setItem(SALES_TARGET_COLUMN_VISIBILITY_KEY, JSON.stringify([...visibleColumns]));
  }, [visibleColumns]);

  useEffect(() => {
    setExcludedDailyDates(new Set());
    setDailyDateFilterOpen(false);
    setDailyPage(1);
  }, [month]);

  useEffect(() => {
    if (isAdminUser) return undefined;
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
  }, [activeBranch, isAdminUser, month, refreshKey]);

  useEffect(() => {
    if (!isAdminUser) {
      setProgressByBranch({});
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setProgressByBranch({});
    Promise.all(
      BRANCH_CHOICES.map(async (code) => {
        try {
          const response = await apiFetch(`/api/admin/sales-targets/progress?branchCode=${encodeURIComponent(code)}&month=${encodeURIComponent(month)}`);
          if (!response.ok) return [code, null];
          const data = await response.json();
          return [code, data];
        } catch {
          return [code, null];
        }
      }),
    ).then((entries) => {
      if (!active) return;
      const nextProgressByBranch = Object.fromEntries(entries);
      const availableProgress = Object.values(nextProgressByBranch).find(Boolean) || null;
      setProgressByBranch(nextProgressByBranch);
      setProgress(availableProgress);
      if (!availableProgress) setError("โหลดเป้ายอดขายของสาขาไม่สำเร็จ");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isAdminUser, month, refreshKey]);

  useEffect(() => {
    if (!isAdminUser) return;
    const selectedProgress = progressByBranch[selectedBranch];
    if (selectedProgress) {
      setProgress(selectedProgress);
      setError(null);
    } else if (Object.keys(progressByBranch).length > 0) {
      setProgress(null);
      setError(`โหลดเป้ายอดขายของสาขา ${selectedBranch} ไม่สำเร็จ`);
    }
  }, [isAdminUser, progressByBranch, selectedBranch]);

  useEffect(() => {
    if (!isAdminUser || selectedBranches.includes(selectedBranch)) return;
    setSelectedBranch(selectedBranches[0] || BRANCH_CHOICES[0]);
  }, [isAdminUser, selectedBranch, selectedBranches]);

  useEffect(() => {
    if (!salesTargetTableExpanded && !salesTargetEditModalOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        if (salesTargetExitConfirmOpen) {
          setSalesTargetExitConfirmOpen(false);
        } else if (salesTargetEditModalOpen) {
          setSalesTargetExitConfirmOpen(true);
        } else {
          setSalesTargetTableExpanded(false);
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [salesTargetEditModalOpen, salesTargetExitConfirmOpen, salesTargetTableExpanded]);

  async function saveTiers(targetBranch, tiers) {
    setSavedBranch("");
    if (!tiers.length) {
      setSaveErrorBranch(targetBranch);
      setSaveError("กรุณากรอกเป้าหมายอย่างน้อย 1 ขั้น");
      return;
    }
    setSavingBranch(targetBranch);
    setSaveErrorBranch("");
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/admin/sales-targets?branchCode=${encodeURIComponent(targetBranch)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ month, tiers }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setSavedBranch(targetBranch);
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setSaveErrorBranch(targetBranch);
      setSaveError(err.message || "บันทึกเป้าไม่สำเร็จ");
    } finally {
      setSavingBranch("");
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

  function toggleSelectedBranch(code) {
    setSelectedBranches((current) => {
      if (current.includes(code)) {
        if (current.length === 1) return current;
        return current.filter((branch) => branch !== code);
      }
      return BRANCH_CHOICES.filter((branch) => current.includes(branch) || branch === code);
    });
  }

  const columns = SALES_TARGET_COLUMN_DEFS.filter((col) => visibleColumns.has(col.key));
  const branchPickerLabel = selectedBranches.length === BRANCH_CHOICES.length
    ? "ทุกสาขา"
    : `สาขา ${selectedBranches.join(", ")}`;
  const adminDailyRows = useMemo(() => {
    if (!isAdminUser) return [];
    const rowsByDate = new Map();
    for (const code of BRANCH_CHOICES) {
      for (const day of progressByBranch[code]?.dailyActuals || []) {
        const current = rowsByDate.get(day.date) || { date: day.date, byBranch: {} };
        current.byBranch[code] = Number(day.actual || 0);
        rowsByDate.set(day.date, current);
      }
    }
    return [...rowsByDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [isAdminUser, progressByBranch]);

  const baseDailyRows = useMemo(
    () => (isAdminUser ? adminDailyRows : (progress?.dailyActuals || []).map((day) => ({ ...day }))),
    [adminDailyRows, isAdminUser, progress?.dailyActuals],
  );
  const availableDailyDates = useMemo(() => baseDailyRows.map((day) => day.date).sort((a, b) => b.localeCompare(a)), [baseDailyRows]);
  const filteredDailyRows = useMemo(
    () => baseDailyRows
      .filter((day) => !excludedDailyDates.has(day.date))
      .sort((a, b) => dailyDateSort === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)),
    [baseDailyRows, dailyDateSort, excludedDailyDates],
  );
  const displayedDailyCount = filteredDailyRows.length;
  const dailyFilterActive = excludedDailyDates.size > 0;
  const dailyPageCount = Math.max(1, Math.ceil(displayedDailyCount / dailyPageSize));
  const dailyPageStartIndex = (dailyPage - 1) * dailyPageSize;
  const pagedDailyRows = filteredDailyRows.slice(dailyPageStartIndex, dailyPageStartIndex + dailyPageSize);
  const dailyPageStart = displayedDailyCount > 0 ? dailyPageStartIndex + 1 : 0;
  const dailyPageEnd = Math.min(dailyPageStartIndex + dailyPageSize, displayedDailyCount);

  useEffect(() => {
    setDailyPage(1);
  }, [dailyDateSort, dailyPageSize, excludedDailyDates]);

  useEffect(() => {
    setDailyPage((current) => Math.min(current, dailyPageCount));
  }, [dailyPageCount]);

  function renderAdminSalesTargetTable() {
    if (columns.length === 0) {
      return <div className="fp-empty">กรุณาเลือกอย่างน้อย 1 คอลัมน์</div>;
    }

    return (
      <div
        className="mvt-sales-table-wrap fp-sales-target-tier-wrap fp-sales-target-comparison-wrap"
        onClick={() => setSalesTargetTableExpanded(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSalesTargetTableExpanded(true);
          }
        }}
        role="button"
        tabIndex={0}
        title="คลิกเพื่อดูตารางแบบเต็มหน้าจอ"
        aria-label="เปิดตารางเป้ายอดขายแบบเต็มหน้าจอ"
      >
        <table className="mvt-sales-table fp-table fp-sales-target-comparison-table">
          <thead>
            <tr>
              <th rowSpan={2} className="fp-sales-target-tier-sticky">ขั้น</th>
              {selectedBranches.map((code) => (
                <th
                  key={code}
                  colSpan={columns.length}
                  className={`fp-sales-target-branch-group fp-sales-target-branch-tone-${branchToneIndex(code)}`}
                >
                  สาขา {code}
                </th>
              ))}
            </tr>
            <tr>
              {selectedBranches.flatMap((code) => columns.map((col, columnIndex) => (
                <th
                  key={`${code}-${col.key}`}
                  className={`fp-sales-target-branch-subhead fp-sales-target-branch-tone-${branchToneIndex(code)}${columnIndex === 0 ? " branch-start" : ""}`}
                >
                  {col.label}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((tierNumber) => (
              <tr key={tierNumber}>
                <td className="fp-sales-target-tier-sticky">{SALES_TARGET_TIER_LABELS[tierNumber]}</td>
                {selectedBranches.flatMap((code) => {
                  const tier = progressByBranch[code]?.tiers?.find((item) => item.tier === tierNumber);
                  return columns.map((col, columnIndex) => {
                    const cellClass = `fp-sales-target-branch-cell fp-sales-target-branch-tone-${branchToneIndex(code)}${columnIndex === 0 ? " branch-start" : ""}`;
                    // Same figure on all three tier rows — it belongs to the
                    // month, not the tier — so span it once per branch.
                    if (col.key === "actualAvgPerDay") {
                      if (tierNumber !== 1) return null;
                      return (
                        <td
                          key={`${code}-${col.key}`}
                          rowSpan={3}
                          className={`${cellClass} fp-sales-target-merged-avg-cell`}
                        >
                          {formatCurrency(tier?.[col.key])}
                        </td>
                      );
                    }
                    return (
                      <td key={`${code}-${tierNumber}-${col.key}`} className={cellClass}>
                        {col.key === "achieved"
                          ? <StatusBadge achieved={tier?.achieved} />
                          : formatCurrency(tier?.[col.key])}
                      </td>
                    );
                  });
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderAdminSalesTargetGrid() {
    if (columns.length === 0) {
      return <div className="fp-empty">กรุณาเลือกอย่างน้อย 1 คอลัมน์</div>;
    }

    return (
      <div className="fp-sales-target-branch-grid">
        {selectedBranches.map((code) => {
          const branchProgress = progressByBranch[code];
          const tiersByNumber = new Map((branchProgress?.tiers || []).map((tier) => [tier.tier, tier]));
          return (
            <article
              key={code}
              className={`fp-sales-target-branch-card fp-sales-target-branch-tone-${branchToneIndex(code)}`}
            >
              <header className="fp-sales-target-branch-card-header">
                <div className="fp-sales-target-branch-card-title-row">
                  <h4>สาขา {code}</h4>
                  <span className="fp-sales-target-branch-card-amount">
                    ยอดขายสะสม {formatCurrency(branchProgress?.actualSoFar)}
                  </span>
                </div>
                <small>
                  {branchProgress
                    ? `ผ่านไป ${branchProgress.daysElapsed}/${branchProgress.totalDaysInMonth} วัน · เหลือ ${branchProgress.daysRemaining} วัน`
                    : "ไม่มีข้อมูล"}
                </small>
              </header>
              <div className="mvt-sales-table-wrap fp-sales-target-branch-card-table-wrap">
                <table className="mvt-sales-table fp-table fp-sales-target-branch-card-table">
                  <thead>
                    <tr>
                      <th>ตัวชี้วัด</th>
                      {[1, 2, 3].map((tierNumber) => (
                        <th key={tierNumber}>{SALES_TARGET_TIER_LABELS[tierNumber]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((col) => (
                      <tr key={col.key}>
                        <th scope="row">{col.label}</th>
                        {col.key === "actualAvgPerDay" ? (
                          <td colSpan={3} className="fp-sales-target-cumulative-avg-cell">
                            {formatCurrency(tiersByNumber.get(1)?.[col.key])}
                          </td>
                        ) : [1, 2, 3].map((tierNumber) => {
                          const tier = tiersByNumber.get(tierNumber);
                          return (
                            <td key={tierNumber}>
                              {col.key === "achieved"
                                ? <StatusBadge achieved={tier?.achieved} />
                                : formatCurrency(tier?.[col.key])}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <section className="fp-section fp-sales-target-section">
      {!activeBranch && <div className="fp-empty">ยังไม่ได้เลือกสาขา</div>}
      {loading && activeBranch && <div className="fp-loading">กำลังโหลด...</div>}
      {error && <div className="fp-form-error">{error}</div>}

      {!loading && !error && progress && (
        <>
          {baseDailyRows.length > 0 && (
            <div className="fp-sales-target-daily">
              <div className="fp-sales-target-daily-toolbar">
                <button
                  type="button"
                  className="fp-btn-link fp-sales-target-daily-toggle"
                  onClick={() => setDailyOpen((v) => !v)}
                  aria-expanded={dailyOpen}
                >
                  {dailyOpen ? "▾" : "▸"} ยอดขายรายวัน ({dailyFilterActive ? `${displayedDailyCount}/${baseDailyRows.length}` : displayedDailyCount} วัน)
                </button>
                {dailyOpen && (
                  <label className="fp-sales-target-daily-page-size">
                    <span>แสดง</span>
                    <select
                      value={dailyPageSize}
                      onChange={(event) => setDailyPageSize(Number(event.target.value))}
                      aria-label="จำนวนรายการยอดขายรายวันต่อหน้า"
                    >
                      {DAILY_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                    <span>รายการ</span>
                  </label>
                )}
              </div>
              {dailyOpen && (
                <>
                  <div className={`mvt-sales-table-wrap fp-sales-target-daily-wrap${dailyDateFilterOpen ? " filter-open" : ""}`}>
                    <table className="mvt-sales-table fp-table">
                      <thead>
                        <tr>
                          <th className="fp-daily-date-header">
                            <button
                              type="button"
                              className={`fp-daily-date-filter-button${dailyFilterActive ? " active" : ""}`}
                              onClick={() => setDailyDateFilterOpen((open) => !open)}
                              aria-expanded={dailyDateFilterOpen}
                            >
                              วันที่ <span aria-hidden="true">▾</span>
                            </button>
                            {dailyDateFilterOpen && (
                              <div className="fp-daily-date-filter-menu">
                                <button type="button" onClick={() => setDailyDateSort("desc")} className={dailyDateSort === "desc" ? "selected" : ""}>
                                  เรียงใหม่ → เก่า
                                </button>
                                <button type="button" onClick={() => setDailyDateSort("asc")} className={dailyDateSort === "asc" ? "selected" : ""}>
                                  เรียงเก่า → ใหม่
                                </button>
                                <div className="fp-daily-filter-actions">
                                  <button type="button" onClick={() => setExcludedDailyDates(new Set())}>เลือกทั้งหมด</button>
                                  <button type="button" onClick={() => setExcludedDailyDates(new Set(availableDailyDates))}>ล้างทั้งหมด</button>
                                </div>
                                <div className="fp-daily-filter-options">
                                  {availableDailyDates.map((date) => (
                                    <label key={date}>
                                      <input
                                        type="checkbox"
                                        checked={!excludedDailyDates.has(date)}
                                        onChange={() => setExcludedDailyDates((current) => {
                                          const next = new Set(current);
                                          if (next.has(date)) next.delete(date);
                                          else next.add(date);
                                          return next;
                                        })}
                                      />
                                      {formatDailyDateLabel(date)}
                                    </label>
                                  ))}
                                </div>
                                <button type="button" className="fp-daily-filter-done" onClick={() => setDailyDateFilterOpen(false)}>ตกลง</button>
                              </div>
                            )}
                          </th>
                          {isAdminUser ? (
                            <>
                              {BRANCH_CHOICES.map((code) => <th key={code}>สาขา {code}</th>)}
                              <th className="fp-daily-total-col">รวมทุกสาขา</th>
                            </>
                          ) : <th>ยอดขาย</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {isAdminUser ? pagedDailyRows.map((day) => {
                          const total = BRANCH_CHOICES.reduce((sum, code) => sum + Number(day.byBranch[code] || 0), 0);
                          return (
                            <tr key={day.date}>
                              <td className={`fp-daily-date-cell ${dailyWeekdayClass(day.date)}`}>{formatDailyDateLabel(day.date)}</td>
                              {BRANCH_CHOICES.map((code) => <td key={code}>{formatCurrency(day.byBranch[code] || 0)}</td>)}
                              <td className="fp-daily-total-col">{formatCurrency(total)}</td>
                            </tr>
                          );
                        }) : pagedDailyRows.map((day) => (
                          <tr key={day.date}>
                            <td className={`fp-daily-date-cell ${dailyWeekdayClass(day.date)}`}>{formatDailyDateLabel(day.date)}</td>
                            <td>{formatCurrency(day.actual)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="fp-sales-target-daily-pagination" aria-label="การแบ่งหน้ายอดขายรายวัน">
                    <span className="fp-sales-target-daily-range">
                      {displayedDailyCount > 0
                        ? `แสดง ${dailyPageStart}-${dailyPageEnd} จาก ${displayedDailyCount} รายการ`
                        : "0 รายการ"}
                    </span>
                    {dailyPageCount > 1 && (
                      <div className="fp-sales-target-daily-page-actions">
                        <button
                          type="button"
                          className="fp-btn-secondary"
                          disabled={dailyPage <= 1}
                          onClick={() => setDailyPage((current) => Math.max(1, current - 1))}
                        >
                          ก่อนหน้า
                        </button>
                        <span>หน้า {dailyPage} / {dailyPageCount}</span>
                        <button
                          type="button"
                          className="fp-btn-secondary"
                          disabled={dailyPage >= dailyPageCount}
                          onClick={() => setDailyPage((current) => Math.min(dailyPageCount, current + 1))}
                        >
                          ถัดไป
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="fp-sales-target-header fp-sales-target-tier-header">
            <h3 className="fp-section-title">เป้ายอดขาย</h3>
            <div className="fp-sales-target-controls">
              {isAdminUser && (
                <div className="fp-sales-target-branch-picker">
                  <button
                    type="button"
                    className="fp-btn-secondary fp-sales-target-branch-picker-button"
                    onClick={() => {
                      setBranchPickerOpen((open) => !open);
                      setColumnPickerOpen(false);
                    }}
                    aria-expanded={branchPickerOpen}
                  >
                    {branchPickerLabel} ({selectedBranches.length}) ▾
                  </button>
                  {branchPickerOpen && (
                    <div className="fp-sales-target-col-menu fp-sales-target-branch-menu">
                      <button
                        type="button"
                        className="fp-sales-target-branch-select-all"
                        onClick={() => setSelectedBranches([...BRANCH_CHOICES])}
                        disabled={selectedBranches.length === BRANCH_CHOICES.length}
                      >
                        เลือกทุกสาขา
                      </button>
                      {BRANCH_CHOICES.map((code) => (
                        <label key={code} className="fp-branch-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedBranches.includes(code)}
                            disabled={selectedBranches.length === 1 && selectedBranches.includes(code)}
                            onChange={() => toggleSelectedBranch(code)}
                          />
                          สาขา {code}
                        </label>
                      ))}
                      <small>ต้องเลือกอย่างน้อย 1 สาขา</small>
                    </div>
                  )}
                </div>
              )}
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              <div className="fp-sales-target-col-picker">
                <button
                  type="button"
                  className="fp-btn-secondary"
                  onClick={() => {
                    setColumnPickerOpen((v) => !v);
                    setBranchPickerOpen(false);
                  }}
                >
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

          {isAdminUser ? (
            <div className="fp-sales-target-branch-summaries">
              {selectedBranches.map((code) => {
                const branchProgress = progressByBranch[code];
                return (
                  <article
                    key={code}
                    className={`fp-sales-target-branch-summary fp-sales-target-branch-tone-${branchToneIndex(code)}`}
                  >
                    <strong className="fp-sales-target-branch-summary-title">สาขา {code}</strong>
                    <div className="fp-sales-target-branch-summary-total">
                      <span>ยอดขายสะสม</span>
                      <strong>{formatCurrency(branchProgress?.actualSoFar)}</strong>
                    </div>
                    <small>
                      {branchProgress
                        ? `ผ่านไป ${branchProgress.daysElapsed}/${branchProgress.totalDaysInMonth} วัน · เหลือ ${branchProgress.daysRemaining} วัน`
                        : "ไม่มีข้อมูล"}
                    </small>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="fp-sales-target-summary">
              <span>
                ยอดขายสะสมเดือนนี้: <strong>{formatCurrency(progress.actualSoFar)}</strong>
              </span>
              <span>
                วันที่ผ่านไป {progress.daysElapsed}/{progress.totalDaysInMonth} วัน (เหลือ {progress.daysRemaining} วัน)
              </span>
            </div>
          )}

          {isAdminUser ? (
            <>
              <div className="fp-sales-target-table-heading">
                <span>เปรียบเทียบ {selectedBranches.length} สาขา · เลื่อนแนวนอนเพื่อดูคอลัมน์เพิ่มเติม</span>
                <button type="button" className="fp-btn-secondary" onClick={() => setSalesTargetTableExpanded(true)}>
                  ⛶ ดูเต็มจอ
                </button>
              </div>
              {renderAdminSalesTargetTable()}
            </>
          ) : (
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
                  {progress.tiers.map((tier, tierIndex) => (
                    <tr key={tier.tier}>
                      <td>{SALES_TARGET_TIER_LABELS[tier.tier]}</td>
                      {columns.map((col) => {
                        // The actual daily average describes the month, not a
                        // tier, so it is the same figure on every row. Render it
                        // once spanning all tiers instead of repeating it three
                        // times, which read as three separate measurements.
                        if (col.key === "actualAvgPerDay") {
                          if (tierIndex > 0) return null;
                          return (
                            <td
                              key={col.key}
                              rowSpan={progress.tiers.length}
                              className="fp-sales-target-cumulative-avg-cell"
                            >
                              {formatCurrency(tier[col.key])}
                            </td>
                          );
                        }
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
          )}

          {isAdminUser && (
            <div className="fp-sales-target-config-action">
              <button
                type="button"
                className="fp-sales-target-config-button"
                onClick={() => {
                  setSaveError(null);
                  setSaveErrorBranch("");
                  setSavedBranch("");
                  setSalesTargetExitConfirmOpen(false);
                  setSalesTargetEditModalOpen(true);
                }}
                aria-haspopup="dialog"
              >
                กำหนดเป้ายอดขายต่อเดือนร้านค้า
              </button>
              <span>ตั้งเป้า 3 ขั้นแยกตามสาขา สำหรับเดือน {month}</span>
            </div>
          )}

          {isAdminUser && salesTargetEditModalOpen && (
            <div className="fp-table-modal-overlay" onClick={() => setSalesTargetExitConfirmOpen(true)}>
              <div
                className="fp-table-modal fp-sales-target-edit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fp-sales-target-edit-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="fp-table-modal-close"
                  onClick={() => {
                    setSalesTargetExitConfirmOpen(false);
                    setSalesTargetEditModalOpen(false);
                  }}
                  aria-label="ปิด"
                >
                  ✕
                </button>
                <div className="fp-sales-target-modal-header">
                  <h3 id="fp-sales-target-edit-modal-title" className="fp-section-title">
                    กำหนดเป้ายอดขายต่อเดือนร้านค้า
                  </h3>
                  <span>เดือน {month} · บันทึกแยกแต่ละสาขา</span>
                </div>
                <div className="fp-sales-target-edit-grid">
                  {BRANCH_CHOICES.map((code) => {
                    const branchProgress = progressByBranch[code];
                    return (
                      <article
                        key={code}
                        className={`fp-sales-target-edit-card fp-sales-target-branch-tone-${branchToneIndex(code)}`}
                      >
                        <header className="fp-sales-target-edit-card-header">
                          <div>
                            <h4>สาขา {code}</h4>
                            <span>ยอดขายสะสม {formatCurrency(branchProgress?.actualSoFar)}</span>
                          </div>
                          <small>กำหนดเป้ารายเดือน 3 ขั้น</small>
                        </header>
                        <SalesTargetEditForm
                          tiers={branchProgress?.tiers || []}
                          onSave={(tiers) => saveTiers(code, tiers)}
                          saving={savingBranch === code}
                          disabled={Boolean(savingBranch) && savingBranch !== code}
                          saveError={saveErrorBranch === code ? saveError : null}
                          saveSuccess={savedBranch === code}
                        />
                      </article>
                    );
                  })}
                </div>

                {salesTargetExitConfirmOpen && (
                  <div
                    className="fp-sales-target-exit-confirm-overlay"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div
                      className="fp-sales-target-exit-confirm"
                      role="alertdialog"
                      aria-modal="true"
                      aria-labelledby="fp-sales-target-exit-confirm-title"
                      aria-describedby="fp-sales-target-exit-confirm-description"
                    >
                      <h4 id="fp-sales-target-exit-confirm-title">ออกจากหน้ากำหนดเป้าแน่หรือไม่?</h4>
                      <p id="fp-sales-target-exit-confirm-description">
                        ข้อมูลที่กรอกไว้แต่ยังไม่ได้กดบันทึกจะหายไป
                      </p>
                      <div className="fp-sales-target-exit-confirm-actions">
                        <button
                          type="button"
                          className="fp-btn-secondary"
                          onClick={() => setSalesTargetExitConfirmOpen(false)}
                          autoFocus
                        >
                          กลับไปกรอกต่อ
                        </button>
                        <button
                          type="button"
                          className="fp-sales-target-exit-confirm-leave"
                          onClick={() => {
                            setSalesTargetExitConfirmOpen(false);
                            setSalesTargetEditModalOpen(false);
                          }}
                        >
                          ออกจากหน้าต่าง
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {isAdminUser && salesTargetTableExpanded && (
            <div className="fp-table-modal-overlay" onClick={() => setSalesTargetTableExpanded(false)}>
              <div
                className="fp-table-modal fp-sales-target-table-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fp-sales-target-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="fp-table-modal-close"
                  onClick={() => setSalesTargetTableExpanded(false)}
                  aria-label="ปิด"
                >
                  ✕
                </button>
                <div className="fp-sales-target-modal-header">
                  <h3 id="fp-sales-target-modal-title" className="fp-section-title">เป้ายอดขายแบบเต็มหน้าจอ</h3>
                  <span>{branchPickerLabel} · {month}</span>
                </div>
                {renderAdminSalesTargetGrid()}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Lets admins record each staff member's hire date, which drives the
// โฟกัสรายคน table's seniority ordering (earliest hire first) instead of a
// hardcoded order — next time someone new joins, entering their date here is
// enough for them to slot into the right place automatically.
function StaffManagementModal({ staff, csrfToken, onClose, onSaved }) {
  const [drafts, setDrafts] = useState(() => {
    const map = {};
    for (const person of staff) map[person.staffId] = person.hireDate || "";
    return map;
  });
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [errorByStaffId, setErrorByStaffId] = useState({});

  const staffByBranch = useMemo(() => {
    const map = new Map();
    for (const person of staff) {
      if (!map.has(person.branchCode)) map.set(person.branchCode, []);
      map.get(person.branchCode).push(person);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.hireDate || "9999-99-99").localeCompare(b.hireDate || "9999-99-99") || a.displayName.localeCompare(b.displayName));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [staff]);

  async function saveHireDate(person) {
    setSavingId(person.staffId);
    setSavedId(null);
    setErrorByStaffId((prev) => ({ ...prev, [person.staffId]: null }));
    try {
      const res = await apiFetch(`/api/admin/branch-staff/${person.staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ hireDate: drafts[person.staffId] || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`);
      setSavedId(person.staffId);
      onSaved();
    } catch (error) {
      setErrorByStaffId((prev) => ({ ...prev, [person.staffId]: error.message || "บันทึกไม่สำเร็จ" }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="fp-modal-overlay" onClick={onClose}>
      <div className="fp-modal fp-staff-manager-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fp-table-modal-close" onClick={onClose} aria-label="ปิด">✕</button>
        <h3>จัดการพนักงาน — วันที่เข้างาน</h3>
        <p className="fp-staff-manager-hint">
          ตารางโฟกัสรายคนจะเรียงลำดับจากคนที่เข้างานก่อนไปหลังตามวันที่นี้ ใครยังไม่กรอกจะอยู่ท้ายสุด
        </p>
        {staffByBranch.length === 0 && <div className="fp-empty">ยังไม่มีข้อมูลพนักงาน</div>}
        {staffByBranch.map(([branch, people]) => (
          <div key={branch} className="fp-staff-manager-branch">
            <h4>{BRANCH_LABELS[branch] || `สาขา ${branch}`}</h4>
            <table className="fp-staff-manager-table">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>ตำแหน่ง</th>
                  <th>วันที่เข้างาน</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.staffId}>
                    <td>
                      {person.displayName}
                      {person.isProbationary && <span className="fp-staff-manager-badge">ทดลองงาน</span>}
                      {!person.isActive && <span className="fp-staff-manager-badge inactive">ปิดใช้งาน</span>}
                    </td>
                    <td>{person.role === "sales" ? "พนักงานขาย" : "ผู้จัดการ"}</td>
                    <td>
                      <input
                        type="date"
                        value={drafts[person.staffId] || ""}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [person.staffId]: e.target.value }))}
                      />
                    </td>
                    <td className="fp-staff-manager-actions">
                      <button
                        type="button"
                        className="fp-btn-link"
                        disabled={savingId === person.staffId}
                        onClick={() => saveHireDate(person)}
                      >
                        {savingId === person.staffId ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                      {savedId === person.staffId && <span className="fp-staff-manager-saved">บันทึกแล้ว</span>}
                      {errorByStaffId[person.staffId] && (
                        <span className="fp-staff-manager-error">{errorByStaffId[person.staffId]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FocusProductsPanel({ csrfToken, isAdminUser, branchCode, onNavigateBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalState, setModalState] = useState(null); // null | { form, submitting, submitError }
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [allStaff, setAllStaff] = useState([]);
  const [year, setYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [linePackageOpen, setLinePackageOpen] = useState(false);
  const [staffManagerOpen, setStaffManagerOpen] = useState(false);

  const reloadStaff = useCallback(() => {
    if (!isAdminUser) return;
    apiFetch("/api/admin/branch-staff").then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))).then((body) => {
      setAllStaff(body.staff || []);
    }).catch(() => setAllStaff([]));
  }, [isAdminUser]);

  useEffect(() => {
    reloadStaff();
  }, [reloadStaff]);

  // The create/edit form only offers active sales staff in a focus-eligible
  // branch; the staff management panel and hire-date sort need everyone.
  const salesStaff = useMemo(
    () => allStaff.filter((staff) => staff.role === "sales" && staff.isActive && BRANCH_CHOICES.includes(staff.branchCode)),
    [allStaff],
  );
  const staffHireDateByStaffId = useMemo(() => {
    const map = new Map();
    for (const staff of allStaff) map.set(staff.staffId, staff.hireDate || null);
    return map;
  }, [allStaff]);

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

  const linePackageRowsByType = useMemo(() => {
    const map = new Map(FOCUS_TYPE_ORDER.map((type) => [type, []]));
    for (const row of monthRows) {
      if (!map.has(row.focusType)) map.set(row.focusType, []);
      map.get(row.focusType).push(row);
    }
    return Object.fromEntries(LINE_PACKAGE_FOCUS_TYPES.map((type) => [type, map.get(type) || []]));
  }, [monthRows]);

  function handleYearChange(nextYear) {
    setYear(nextYear);
    setSelectedMonth(null);
    setLinePackageOpen(false);
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
        // Everything after the leading code shares this row's target.
        extraProducts: (row.products || []).slice(1).map((product) => ({
          productCode: product.productCode,
          productName: product.productName || "",
        })),
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
      // Leading code first; the backend dedupes and keeps productCode == productCodes[0].
      productCodes: [
        form.productCode.trim(),
        ...(form.extraProducts || []).map((product) => product.productCode).filter(Boolean),
      ],
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
          <button
            type="button"
            className={`fp-line-package-button fp-line-package-button--panel${loading ? " is-loading" : ""}`}
            onClick={() => setLinePackageOpen(true)}
            disabled={!selectedMonth || monthRows.length === 0 || loading}
            aria-busy={loading ? "true" : "false"}
          >
            <span className="fp-line-package-button-label">
              {loading ? "กำลังโหลดข้อมูล..." : "เตรียมส่ง LINE รวม 3 ตาราง"}
            </span>
            {loading && (
              <span className="fp-line-package-button-overlay" aria-hidden="true">
                <span className="fp-line-package-button-spinner" />
              </span>
            )}
          </button>
        </div>

      <LoadingOverlay active={loading} onNavigateBack={onNavigateBack} />
      {error && <div className="fp-form-error">{error}</div>}

      <SalesTargetsSection csrfToken={csrfToken} isAdminUser={isAdminUser} branchCode={branchCode} />

      {!loading && !error && (
        <>
            <YearCalendar
              year={year}
              onYearChange={handleYearChange}
              selectedMonth={selectedMonth}
              onSelectMonth={(month) => {
                setSelectedMonth(month === selectedMonth ? null : month);
                setLinePackageOpen(false);
              }}
              monthSummaries={monthSummaries}
            />

          {selectedMonth && (
            <div className="fp-month-detail">
              <div className="fp-month-detail-header">
                <h3>
                  สินค้าโฟกัสเดือน{THAI_MONTH_NAMES[selectedMonth - 1]} {year}
                </h3>
                {isAdminUser && (
                  <div className="fp-month-actions">
                    <button type="button" className="fp-btn-secondary" onClick={openCreateModalForSelectedMonth}>+ เพิ่มทีละสินค้า</button>
                    <button type="button" className="fp-btn-primary" onClick={() => setBatchModalOpen(true)}>▦ เพิ่มหลายสินค้าด้วยบาร์โค้ด</button>
                    <button type="button" className="fp-btn-secondary" onClick={() => setStaffManagerOpen(true)}>👤 จัดการพนักงาน</button>
                  </div>
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
                  staffHireDateByStaffId={staffHireDateByStaffId}
                />
              )}
            </div>
          )}
        </>
      )}

      {linePackageOpen && selectedMonth && monthRows.length > 0 && (
        <FocusLinePackageModal
          rowsByType={linePackageRowsByType}
          selectedMonth={selectedMonth}
          year={year}
          csrfToken={csrfToken}
          restrictToBranch={!isAdminUser ? branchCode : null}
          onClose={() => setLinePackageOpen(false)}
        />
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
      {staffManagerOpen && (
        <StaffManagementModal
          staff={allStaff}
          csrfToken={csrfToken}
          onClose={() => setStaffManagerOpen(false)}
          onSaved={reloadStaff}
        />
      )}
    </div>
  );
}
