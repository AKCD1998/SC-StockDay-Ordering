import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

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

function formatNumber(value) {
  if (value == null || value === "") return "-";
  return Number(value).toLocaleString("th-TH");
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
  return (summary?.lines || [])
    .filter((line) => !line.startsWith("[") && !line.startsWith("Run with"))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join(" | ");
}

function ProductTaxonomyConfirmModal({ open, summary, busy, onClose, onConfirm }) {
  if (!open) return null;

  return createPortal(
    <div className="dialog-overlay" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="ยืนยัน Auto-classify">
      <div className="dialog-card taxonomy-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header stacked">
          <div>
            <h3>ยืนยัน Auto-classify</h3>
            <p>ตรวจสอบสรุปก่อนเขียนผลลัพธ์ลงฐานข้อมูลจริง</p>
          </div>
        </div>
        <div className="taxonomy-confirm-body">
          {(summary?.lines || []).map((line, index) => (
            <div key={`${line}-${index}`} className="taxonomy-confirm-line">{line}</div>
          ))}
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

  function refreshCurrentPage() {
    setAppliedFilters((current) => ({ ...current }));
  }

  function applyFilters(event) {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters({ ...draftFilters });
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
    } catch (updateError) {
      setError(`อัปเดตประเภทสินค้าไม่สำเร็จ: ${updateError.message}`);
    } finally {
      setSavingSkuCode("");
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
            ) : rows.map((row) => (
              <tr key={row.sku_code}>
                <td><code>{row.sku_code}</code></td>
                <td>{row.name || "-"}</td>
                <td>{row.category_name || "-"}</td>
                <td>{row.product_kind || "-"}</td>
                <td>
                  <select
                    value={row.product_type || ""}
                    onChange={(event) => updateProductType(row.sku_code, event.target.value)}
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
          หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)} · {formatNumber(total)} รายการ
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
