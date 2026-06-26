import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const PAGE_SIZE = 50;
const UNCLASSIFIED_FILTER = "unclassified";

const PRODUCT_TYPE_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: UNCLASSIFIED_FILTER, label: "ยังไม่ระบุ" },
  { value: "drug", label: "ยา" },
  { value: "supplement", label: "อาหารเสริม" },
  { value: "herb", label: "สมุนไพร" },
  { value: "antiseptic", label: "น้ำยาฆ่าเชื้อ" },
  { value: "cosmeceutical", label: "เวชสำอาง" },
  { value: "cosmetic", label: "เครื่องสำอาง" },
  { value: "device", label: "อุปกรณ์" },
  { value: "service", label: "บริการ" },
  { value: "other", label: "อื่นๆ" },
];

const EDIT_PRODUCT_TYPE_OPTIONS = PRODUCT_TYPE_OPTIONS.slice(1);
const ENRICHMENT_STATUS_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "missing", label: "missing" },
  { value: "partial", label: "partial" },
  { value: "verified", label: "verified" },
  { value: "not_applicable", label: "not_applicable" },
];

const PRODUCT_TYPE_LABELS = {
  drug: "ยา",
  supplement: "อาหารเสริม",
  herb: "สมุนไพร",
  antiseptic: "น้ำยาฆ่าเชื้อ",
  cosmeceutical: "เวชสำอาง",
  cosmetic: "เครื่องสำอาง",
  device: "อุปกรณ์",
  service: "บริการ",
  other: "อื่นๆ",
};

const HOTKEY_ASSIGNMENTS = [
  { key: "1", value: "drug", label: "ยา" },
  { key: "2", value: "herb", label: "สมุนไพร" },
  { key: "3", value: "supplement", label: "อาหารเสริม" },
  { key: "4", value: "antiseptic", label: "ฆ่าเชื้อ" },
  { key: "5", value: "cosmeceutical", label: "เวชสำอาง" },
  { key: "6", value: "cosmetic", label: "เครื่องสำอาง" },
  { key: "7", value: "device", label: "อุปกรณ์" },
  { key: "8", value: "service", label: "บริการ" },
  { key: "9", value: "other", label: "อื่นๆ" },
  { key: "0", value: "", label: "ล้างค่า" },
];

const HOTKEY_ASSIGNMENT_MAP = Object.fromEntries(
  HOTKEY_ASSIGNMENTS.map((item) => [item.key, item.value]),
);

const RULE_SUMMARY_COPY = {
  device_product_kind: {
    title: "อุปกรณ์จาก product_kind",
    description: "ใช้เมื่อ product_kind เป็น device_or_general_goods",
  },
  service_company_code: {
    title: "บริการจากรหัสสินค้า",
    description: "ใช้เมื่อรหัสขึ้นต้นด้วย IS-",
  },
  ingredient_categories: {
    title: "จับจาก ingredient ที่ยืนยันแล้ว",
    description: "อิง knowledge.product_ingredients ที่สถานะ confirmed",
  },
  category_name_herb: {
    title: "สมุนไพรจากหมวด AdaPOS",
    description: "จับจากข้อความใน category_name",
  },
  category_name_antiseptic: {
    title: "ฆ่าเชื้อจากหมวด AdaPOS",
    description: "จับจากข้อความใน category_name",
  },
  category_name_supplement: {
    title: "อาหารเสริมจากหมวด AdaPOS",
    description: "จับจากข้อความใน category_name",
  },
  category_name_drug: {
    title: "ยาจากหมวด AdaPOS",
    description: "จับจากข้อความใน category_name",
  },
  category_name_cosmetic: {
    title: "เครื่องสำอางจากหมวด AdaPOS",
    description: "จับจากข้อความใน category_name",
  },
};

function formatNumber(value) {
  if (value == null || value === "") return "-";
  return Number(value).toLocaleString("th-TH");
}

function isTypingTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
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

function buildPreviewText(summary) {
  if (!summary) {
    return "";
  }
  const classified = Number(summary.classified || 0);
  const unclassified = Number(summary.unclassified || 0);
  return `พรีวิวล่าสุด: จัดประเภทได้ ${formatNumber(classified)} รายการ และยังไม่เข้าเงื่อนไข ${formatNumber(unclassified)} รายการ`;
}

function buildRuleBreakdown(summary) {
  const orderedKeys = [
    "device_product_kind",
    "service_company_code",
    "ingredient_categories",
    "category_name_herb",
    "category_name_antiseptic",
    "category_name_supplement",
    "category_name_drug",
    "category_name_cosmetic",
  ];

  return orderedKeys
    .map((ruleKey) => {
      const entry = summary?.countsByRule?.[ruleKey];
      if (!entry?.count) {
        return null;
      }

      const copy = RULE_SUMMARY_COPY[ruleKey] || {};
      return {
        ruleKey,
        count: entry.count,
        productType: entry.productType,
        title: copy.title || `${PRODUCT_TYPE_LABELS[entry.productType] || entry.productType}`,
        description: copy.description || entry.reasonLabel || "",
      };
    })
    .filter(Boolean);
}

function ProductTaxonomyConfirmModal({ open, summary, busy, onClose, onConfirm }) {
  if (!open) return null;

  const evaluated = Number(summary?.evaluated || 0);
  const classified = Number(summary?.classified || 0);
  const unclassified = Number(summary?.unclassified || 0);
  const breakdown = buildRuleBreakdown(summary);

  return createPortal(
    <div className="dialog-overlay" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="ยืนยัน Auto-classify">
      <div className="dialog-card taxonomy-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header stacked">
          <div>
            <h3>ยืนยัน Auto-classify</h3>
            <p>นี่คือพรีวิวเท่านั้น ยังไม่ได้เขียนข้อมูลลงฐานข้อมูลจริง</p>
          </div>
        </div>
        <div className="taxonomy-confirm-body">
          <div className="taxonomy-confirm-summary">
            <article className="taxonomy-confirm-stat">
              <span>ตรวจทั้งหมด</span>
              <strong>{formatNumber(evaluated)}</strong>
              <small>SKU ที่ product_type ยังว่าง</small>
            </article>
            <article className="taxonomy-confirm-stat">
              <span>จะจัดประเภทให้</span>
              <strong>{formatNumber(classified)}</strong>
              <small>ถ้ากดยืนยัน ระบบจะเขียนค่าจริง</small>
            </article>
            <article className="taxonomy-confirm-stat">
              <span>ยังไม่เข้าเงื่อนไข</span>
              <strong>{formatNumber(unclassified)}</strong>
              <small>ต้องจัดเองหรือเพิ่มกฎใหม่</small>
            </article>
          </div>

          {breakdown.length > 0 ? (
            <div className="taxonomy-confirm-rule-list">
              {breakdown.map((item) => (
                <div key={item.ruleKey} className="taxonomy-confirm-line">
                  <div className="taxonomy-confirm-line-head">
                    <strong>{item.title}</strong>
                    <span>{formatNumber(item.count)} รายการ</span>
                  </div>
                  <small>{item.description}</small>
                </div>
              ))}
            </div>
          ) : null}

          <div className="taxonomy-confirm-note">
            การกดยืนยันจะเขียนค่าไปที่ <code>public.skus.product_type</code> เฉพาะแถวที่ยังไม่เคยถูกจัดประเภท
          </div>
        </div>
        <div className="taxonomy-confirm-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? "กำลังบันทึก..." : "ยืนยันการจัดประเภท"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ProductTaxonomyPanel({ csrfToken }) {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingSkuCode, setSavingSkuCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [shortcutsVisible, setShortcutsVisible] = useState(true);
  const [appliedFilters, setAppliedFilters] = useState({
    product_type: "",
    enrichment_status: "",
    q: "",
  });
  const [draftFilters, setDraftFilters] = useState({
    product_type: "",
    enrichment_status: "",
    q: "",
  });
  const rowRefs = useRef([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const statChips = useMemo(() => {
    if (!stats) return [];
    return [
      { key: "drug", label: "ยา", count: stats.by_product_type?.drug || 0, tone: "drug" },
      { key: "herb", label: "สมุนไพร", count: stats.by_product_type?.herb || 0, tone: "herb" },
      { key: "supplement", label: "อาหารเสริม", count: stats.by_product_type?.supplement || 0, tone: "supplement" },
      { key: "antiseptic", label: "ฆ่าเชื้อ", count: stats.by_product_type?.antiseptic || 0, tone: "antiseptic" },
      { key: "cosmeceutical", label: "เวชสำอาง", count: stats.by_product_type?.cosmeceutical || 0, tone: "cosmeceutical" },
      { key: "cosmetic", label: "เครื่องสำอาง", count: stats.by_product_type?.cosmetic || 0, tone: "cosmetic" },
      { key: "device", label: "อุปกรณ์", count: stats.by_product_type?.device || 0, tone: "device" },
      { key: "service", label: "บริการ", count: stats.by_product_type?.service || 0, tone: "service" },
      { key: "other", label: "อื่นๆ", count: stats.by_product_type?.other || 0, tone: "other" },
      { key: "unclassified", label: "ยังไม่ระบุ", count: stats.unclassified || 0, tone: "unclassified" },
    ];
  }, [stats]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (appliedFilters.product_type) params.set("product_type", appliedFilters.product_type);
        if (appliedFilters.enrichment_status) params.set("enrichment_status", appliedFilters.enrichment_status);
        if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());

        const [statsRes, rowsRes] = await Promise.all([
          apiFetch("/api/products/taxonomy/stats"),
          apiFetch(`/api/products/taxonomy?${params.toString()}`),
        ]);

        const statsJson = await statsRes.json().catch(() => ({}));
        const rowsJson = await rowsRes.json().catch(() => ({}));

        if (!statsRes.ok) throw new Error(statsJson.error || `HTTP ${statsRes.status}`);
        if (!rowsRes.ok) throw new Error(rowsJson.error || `HTTP ${rowsRes.status}`);
        if (!active) return;

        setStats(statsJson);
        setRows(rowsJson.rows || []);
        setTotal(rowsJson.total || 0);
      } catch (loadError) {
        if (active) {
          setError(`โหลดข้อมูล taxonomy ไม่สำเร็จ: ${loadError.message}`);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [appliedFilters, offset]);

  useEffect(() => {
    if (rows.length === 0) {
      if (activeRowIndex !== 0) {
        setActiveRowIndex(0);
      }
      return;
    }
    if (activeRowIndex >= rows.length) {
      setActiveRowIndex(rows.length - 1);
    }
  }, [activeRowIndex, rows]);

  useEffect(() => {
    const activeRow = rowRefs.current[activeRowIndex];
    if (activeRow && typeof activeRow.scrollIntoView === "function") {
      activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeRowIndex]);

  function refreshCurrentPage() {
    setAppliedFilters((current) => ({ ...current }));
  }

  function applyFilters(event) {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters({ ...draftFilters });
  }

  function toggleShortcuts() {
    setShortcutsVisible((current) => !current);
  }

  async function updateProductType(skuCode, nextProductType) {
    setSavingSkuCode(skuCode);
    setNotice("");
    setError("");
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(skuCode)}/taxonomy`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({
          product_type: nextProductType || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      setRows((current) => current.map((row) => (
        row.sku_code === skuCode
          ? {
              ...row,
              product_type: data.product?.product_type ?? nextProductType ?? null,
              enrichment_status: data.product?.enrichment_status ?? row.enrichment_status,
            }
          : row
      )));
      setNotice(`อัปเดตประเภทสินค้า ${skuCode} แล้ว`);
      refreshCurrentPage();
      return true;
    } catch (updateError) {
      setError(`อัปเดตประเภทสินค้าไม่สำเร็จ: ${updateError.message}`);
      return false;
    } finally {
      setSavingSkuCode("");
    }
  }

  async function assignRowProductType(rowIndex, nextProductType, options = {}) {
    const row = rows[rowIndex];
    if (!row || savingSkuCode) {
      return;
    }
    const ok = await updateProductType(row.sku_code, nextProductType);
    if (ok && options.advance) {
      setActiveRowIndex((current) => Math.min(current + 1, Math.max(rows.length - 1, 0)));
    }
  }

  async function previewAutoClassify() {
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/products/taxonomy/bulk-classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({ commit: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPreviewSummary(data.summary || null);
      setConfirmOpen(true);
    } catch (previewError) {
      setError(`พรีวิว Auto-classify ไม่สำเร็จ: ${previewError.message}`);
    }
  }

  async function confirmAutoClassify() {
    setConfirmBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/products/taxonomy/bulk-classify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({ commit: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setConfirmOpen(false);
      setPreviewSummary(null);
      setNotice(`Auto-classify เสร็จแล้ว ${formatNumber(data.summary?.updated || 0)} รายการ`);
      refreshCurrentPage();
    } catch (commitError) {
      setError(`Auto-classify ไม่สำเร็จ: ${commitError.message}`);
    } finally {
      setConfirmBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        toggleShortcuts();
        return;
      }

      if (confirmOpen || loading || !rows.length) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "j" || event.key === "J") {
        event.preventDefault();
        setActiveRowIndex((current) => Math.min(current + 1, rows.length - 1));
        return;
      }

      if (event.key === "ArrowUp" || event.key === "k" || event.key === "K") {
        event.preventDefault();
        setActiveRowIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "PageDown") {
        if (offset + PAGE_SIZE >= total) {
          return;
        }
        event.preventDefault();
        setOffset((current) => current + PAGE_SIZE);
        setActiveRowIndex(0);
        return;
      }

      if (event.key === "PageUp") {
        if (offset <= 0) {
          return;
        }
        event.preventDefault();
        setOffset((current) => Math.max(0, current - PAGE_SIZE));
        setActiveRowIndex(0);
        return;
      }

      const nextProductType = HOTKEY_ASSIGNMENT_MAP[event.key];
      if (nextProductType === undefined) {
        return;
      }

      event.preventDefault();
      void assignRowProductType(activeRowIndex, nextProductType, { advance: true });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeRowIndex, confirmOpen, loading, offset, rows, savingSkuCode, total]);

  return (
    <section className="panel taxonomy-panel">
      <div className="panel-header stacked">
        <div>
          <h2>Product Taxonomy</h2>
          <p>กำหนดประเภทสินค้า, ตรวจสอบ enrichment applicability และใช้ตัวช่วยจัดประเภทอัตโนมัติ</p>
        </div>
        <div className="taxonomy-header-actions">
          <button type="button" className="primary-button" onClick={previewAutoClassify} disabled={!csrfToken || loading}>
            Auto-classify
          </button>
        </div>
      </div>

      {notice ? <div className="notice taxonomy-notice">{notice}</div> : null}
      {error ? <div className="notice error taxonomy-notice">{error}</div> : null}

      <div className="taxonomy-stats-grid">
        {statChips.map((chip) => (
          <article key={chip.key} className={`taxonomy-stat-card taxonomy-tone-${chip.tone}`}>
            <span>{chip.label}</span>
            <strong>{formatNumber(chip.count)}</strong>
          </article>
        ))}
      </div>

      <div className={`taxonomy-workspace ${shortcutsVisible ? "taxonomy-workspace-open" : "taxonomy-workspace-closed"}`}>
        <div className="taxonomy-main">
          <form className="taxonomy-filters" onSubmit={applyFilters}>
            <label>
              ประเภทสินค้า
              <select
                value={draftFilters.product_type}
                onChange={(event) => setDraftFilters((current) => ({ ...current, product_type: event.target.value }))}
              >
                {PRODUCT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              enrichment_status
              <select
                value={draftFilters.enrichment_status}
                onChange={(event) => setDraftFilters((current) => ({ ...current, enrichment_status: event.target.value }))}
              >
                {ENRICHMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="taxonomy-filter-span">
              ค้นหา
              <input
                type="text"
                value={draftFilters.q}
                onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="ชื่อสินค้า หรือรหัสสินค้า"
              />
            </label>
            <div className="taxonomy-filter-actions">
              <button type="submit" className="primary-button">กรองข้อมูล</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const empty = { product_type: "", enrichment_status: "", q: "" };
                  setDraftFilters(empty);
                  setAppliedFilters(empty);
                  setOffset(0);
                }}
              >
                ล้างตัวกรอง
              </button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="taxonomy-table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวด AdaPos</th>
                  <th>product_kind</th>
                  <th>ประเภท</th>
                  <th>enrichment_status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="empty-state">กำลังโหลดข้อมูล taxonomy...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-state">ไม่พบสินค้าที่ตรงกับตัวกรองปัจจุบัน</td>
                  </tr>
                ) : rows.map((row, index) => (
                  <tr
                    key={row.sku_code}
                    ref={(element) => {
                      rowRefs.current[index] = element;
                    }}
                    className={index === activeRowIndex ? "taxonomy-row-active" : ""}
                    onClick={() => setActiveRowIndex(index)}
                  >
                    <td><code>{row.sku_code}</code></td>
                    <td>{row.name || "-"}</td>
                    <td>{row.category_name || "-"}</td>
                    <td>{row.product_kind || "-"}</td>
                    <td>
                      <select
                        value={row.product_type || ""}
                        onChange={(event) => void updateProductType(row.sku_code, event.target.value)}
                        onFocus={() => setActiveRowIndex(index)}
                        disabled={savingSkuCode === row.sku_code}
                      >
                        <option value="">ยังไม่ระบุ</option>
                        {EDIT_PRODUCT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <div className="taxonomy-inline-meta">{PRODUCT_TYPE_LABELS[row.product_type] || "ยังไม่ระบุ"}</div>
                    </td>
                    <td>{row.enrichment_status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="taxonomy-footer">
            <div className="taxonomy-footer-summary">
              หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)} · {formatNumber(total)} รายการ · แถวที่เลือก {rows[activeRowIndex]?.sku_code || "-"}
            </div>
            <div className="taxonomy-footer-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                disabled={offset <= 0 || loading}
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
              >
                ถัดไป
              </button>
            </div>
          </div>
        </div>

        <aside className={`taxonomy-shortcuts ${shortcutsVisible ? "taxonomy-shortcuts-open" : "taxonomy-shortcuts-closed"}`} aria-label="taxonomy keyboard shortcuts">
          <div className="taxonomy-shortcuts-sticky">
            <button
              type="button"
              className="taxonomy-shortcut-toggle"
              onClick={toggleShortcuts}
              aria-expanded={shortcutsVisible}
              aria-controls="taxonomy-hotkey-panel"
            >
              <span>{shortcutsVisible ? "ซ่อนคีย์ลัด" : "แสดงคีย์ลัด"}</span>
              <kbd>H</kbd>
            </button>

            {shortcutsVisible ? (
              <div id="taxonomy-hotkey-panel" className="taxonomy-hotkey-bar">
                <span className="taxonomy-hotkey-title">ลัดด้วยคีย์บอร์ด</span>
                <span className="taxonomy-hotkey-subtitle">กด <kbd>H</kbd> เพื่อซ่อนหรือแสดงแผงนี้</span>
                <span className="taxonomy-hotkey-chip"><kbd>↑</kbd><kbd>↓</kbd> หรือ <kbd>J</kbd><kbd>K</kbd> เลื่อนแถว</span>
                <span className="taxonomy-hotkey-chip"><kbd>PgUp</kbd><kbd>PgDn</kbd> เปลี่ยนหน้า</span>
                {HOTKEY_ASSIGNMENTS.map((item) => (
                  <span key={item.key} className="taxonomy-hotkey-chip">
                    <kbd>{item.key}</kbd> {item.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <ProductTaxonomyConfirmModal
        open={confirmOpen}
        summary={previewSummary}
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setConfirmOpen(false);
        }}
        onConfirm={confirmAutoClassify}
      />

      {previewSummary && !confirmOpen ? (
        <p className="taxonomy-preview-hint">{buildPreviewText(previewSummary)}</p>
      ) : null}
    </section>
  );
}
