import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const PAGE_SIZE = 50;
const BULK_FETCH_LIMIT = 200;
const BULK_PATCH_CONCURRENCY = 8;

const PRODUCT_TYPE_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
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

const REVIEW_STATUS_OPTIONS = [
  { value: "auto", label: "auto" },
  { value: "confirmed", label: "confirmed" },
  { value: "needs_review", label: "needs_review" },
];

const PRODUCT_TYPE_LABELS = Object.fromEntries(
  PRODUCT_TYPE_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]),
);

const REVIEW_STATUS_TONES = {
  auto: "warning",
  confirmed: "good",
  needs_review: "danger",
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

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export default function TaxonomyReviewPanel({ csrfToken }) {
  const [filters, setFilters] = useState({
    productType: "",
    reviewStatus: "auto",
  });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ auto: 0, confirmed: 0, needs_review: 0 });
  const [loading, setLoading] = useState(false);
  const [busySkuCode, setBusySkuCode] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectedProductTypeLabel = PRODUCT_TYPE_LABELS[filters.productType] || "ประเภทที่เลือก";
  const canBulkConfirm = Boolean(filters.productType) && filters.reviewStatus === "auto" && !loading && !bulkBusy;

  const summaryCards = useMemo(() => ([
    { key: "auto", label: "auto", count: counts.auto || 0 },
    { key: "confirmed", label: "confirmed", count: counts.confirmed || 0 },
    { key: "needs_review", label: "needs_review", count: counts.needs_review || 0 },
  ]), [counts]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          review_status: filters.reviewStatus,
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (filters.productType) {
          params.set("product_type", filters.productType);
        }

        const response = await apiFetch(`/api/admin/taxonomy-review?${params.toString()}`);
        const data = await readJson(response);
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        if (!active) return;

        setRows(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total || 0));
        setCounts({
          auto: Number(data.counts?.auto || 0),
          confirmed: Number(data.counts?.confirmed || 0),
          needs_review: Number(data.counts?.needs_review || 0),
        });
      } catch (loadError) {
        if (active) {
          setError(`โหลด Taxonomy Review ไม่สำเร็จ: ${loadError.message}`);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [filters, page, refreshToken]);

  async function patchReview(companyCode, payload) {
    const response = await apiFetch(`/api/admin/taxonomy-review/${encodeURIComponent(companyCode)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken || "",
      },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function handleRowStatus(companyCode, nextStatus) {
    const row = rows.find((item) => item.company_code === companyCode);
    if (!row) return;

    setBusySkuCode(companyCode);
    setNotice("");
    setError("");
    try {
      await patchReview(companyCode, {
        taxonomy_review_status: nextStatus,
        product_type: row.product_type,
      });
      setNotice(`อัปเดต ${companyCode} เป็น ${nextStatus} แล้ว`);
      setRefreshToken((current) => current + 1);
    } catch (updateError) {
      setError(`อัปเดตสถานะไม่สำเร็จ: ${updateError.message}`);
    } finally {
      setBusySkuCode("");
    }
  }

  async function handleProductTypeChange(companyCode, nextProductType) {
    const row = rows.find((item) => item.company_code === companyCode);
    if (!row || nextProductType === row.product_type) return;

    setBusySkuCode(companyCode);
    setNotice("");
    setError("");
    try {
      await patchReview(companyCode, {
        taxonomy_review_status: row.taxonomy_review_status,
        product_type: nextProductType,
      });
      setNotice(`เปลี่ยนประเภทสินค้า ${companyCode} แล้ว`);
      setRefreshToken((current) => current + 1);
    } catch (updateError) {
      setError(`อัปเดตประเภทสินค้าไม่สำเร็จ: ${updateError.message}`);
    } finally {
      setBusySkuCode("");
    }
  }

  async function fetchAllRowsForBulkConfirm(productType) {
    const firstParams = new URLSearchParams({
      product_type: productType,
      review_status: "auto",
      page: "1",
      limit: String(BULK_FETCH_LIMIT),
    });
    const firstResponse = await apiFetch(`/api/admin/taxonomy-review?${firstParams.toString()}`);
    const firstData = await readJson(firstResponse);
    if (!firstResponse.ok) {
      throw new Error(firstData.error || `HTTP ${firstResponse.status}`);
    }

    const totalItems = Number(firstData.total || 0);
    const totalPagesForBulk = Math.max(1, Math.ceil(totalItems / BULK_FETCH_LIMIT));
    const items = Array.isArray(firstData.items) ? [...firstData.items] : [];

    for (let currentPage = 2; currentPage <= totalPagesForBulk; currentPage += 1) {
      const params = new URLSearchParams({
        product_type: productType,
        review_status: "auto",
        page: String(currentPage),
        limit: String(BULK_FETCH_LIMIT),
      });
      const response = await apiFetch(`/api/admin/taxonomy-review?${params.toString()}`);
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      items.push(...(Array.isArray(data.items) ? data.items : []));
    }

    return items;
  }

  async function handleBulkConfirm() {
    if (!canBulkConfirm) return;

    setBulkBusy(true);
    setNotice("");
    setError("");
    try {
      const items = await fetchAllRowsForBulkConfirm(filters.productType);
      if (items.length === 0) {
        setNotice(`ไม่มีรายการ auto ของประเภท ${selectedProductTypeLabel}`);
        return;
      }

      let completed = 0;
      for (const group of chunk(items, BULK_PATCH_CONCURRENCY)) {
        await Promise.all(group.map((row) => patchReview(row.company_code, {
          taxonomy_review_status: "confirmed",
          product_type: row.product_type,
        })));
        completed += group.length;
        setNotice(`กำลังยืนยัน ${selectedProductTypeLabel}: ${formatNumber(completed)} / ${formatNumber(items.length)} รายการ`);
      }

      setNotice(`ยืนยัน ${selectedProductTypeLabel} สำเร็จ ${formatNumber(items.length)} รายการ`);
      setRefreshToken((current) => current + 1);
    } catch (bulkError) {
      setError(`ยืนยันทั้งประเภทไม่สำเร็จ: ${bulkError.message}`);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="panel taxonomy-review-panel">
      <div className="panel-header stacked">
        <div>
          <h2>Taxonomy Review</h2>
          <p>ยืนยันประเภทสินค้า AI-classified, ปรับ product_type และแยกคิวที่ต้องทบทวนเพิ่ม</p>
        </div>
      </div>

      {notice ? <div className="notice taxonomy-review-notice">{notice}</div> : null}
      {error ? <div className="notice error taxonomy-review-notice">{error}</div> : null}

      <div className="taxonomy-review-summary">
        {summaryCards.map((card) => (
          <article key={card.key} className={`taxonomy-review-stat taxonomy-review-stat-${card.key}`}>
            <span>{card.label}</span>
            <strong>{formatNumber(card.count)}</strong>
          </article>
        ))}
      </div>

      <div className="taxonomy-review-toolbar">
        <div className="taxonomy-review-filters">
          <label>
            product_type
            <select
              value={filters.productType}
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, productType: event.target.value }));
              }}
              disabled={loading || bulkBusy}
            >
              {PRODUCT_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            review_status
            <select
              value={filters.reviewStatus}
              onChange={(event) => {
                setPage(1);
                setFilters((current) => ({ ...current, reviewStatus: event.target.value }));
              }}
              disabled={loading || bulkBusy}
            >
              {REVIEW_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="taxonomy-review-bulk-bar">
          <button
            type="button"
            className="primary-button"
            onClick={handleBulkConfirm}
            disabled={!canBulkConfirm || !csrfToken}
          >
            {bulkBusy ? "กำลังยืนยันทั้งประเภท..." : `Confirm all ${selectedProductTypeLabel}`}
          </button>
          <span className="taxonomy-review-bulk-hint">
            ใช้ได้เมื่อเลือก `product_type` และอยู่ในคิว `auto`
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="taxonomy-review-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>display_name</th>
              <th>product_type</th>
              <th>taxonomy_note</th>
              <th>status</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="empty-state">กำลังโหลดรายการ review...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">ไม่พบ SKU ที่ตรงกับตัวกรองปัจจุบัน</td>
              </tr>
            ) : rows.map((row) => {
              const isBusy = busySkuCode === row.company_code || bulkBusy;
              return (
                <tr key={row.company_code}>
                  <td><code>{row.company_code}</code></td>
                  <td>{row.display_name || "-"}</td>
                  <td>
                    <select
                      value={row.product_type || ""}
                      onChange={(event) => void handleProductTypeChange(row.company_code, event.target.value)}
                      disabled={isBusy}
                    >
                      {PRODUCT_TYPE_OPTIONS.filter((option) => option.value).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="taxonomy-review-note-cell">{row.taxonomy_note || "-"}</td>
                  <td>
                    <span className={`status ${REVIEW_STATUS_TONES[row.taxonomy_review_status] || ""}`}>
                      {row.taxonomy_review_status}
                    </span>
                  </td>
                  <td>
                    <div className="taxonomy-review-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleRowStatus(row.company_code, "confirmed")}
                        disabled={isBusy || !csrfToken}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleRowStatus(row.company_code, "needs_review")}
                        disabled={isBusy || !csrfToken}
                      >
                        Flag
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="taxonomy-review-pagination">
        <span>
          หน้า {formatNumber(page)} / {formatNumber(totalPages)} · {formatNumber(total)} รายการ
        </span>
        <div className="taxonomy-review-pagination-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading || bulkBusy}
          >
            ก่อนหน้า
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= totalPages || loading || bulkBusy}
          >
            ถัดไป
          </button>
        </div>
      </div>
    </section>
  );
}
