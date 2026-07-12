import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const ACTION_LABELS = {
  NO_ACTION: "ยังไม่ต้องสั่ง",
  TRANSFER_IN: "ขอจากสาขาอื่น",
  PURCHASE: "สั่งซื้อเพิ่ม",
  TRANSFER_AND_PURCHASE: "ขอ + ซื้อเพิ่ม",
  NO_PURCHASE_SLOW_MOVING: "สินค้าหมุนช้า",
};

const DEFAULT_PAGE_SIZE = 25;

function formatNumber(value, digits = 0) {
  if (value == null || value === "") return "-";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function actionTone(action) {
  if (action === "TRANSFER_IN") return "transfer";
  if (action === "PURCHASE" || action === "TRANSFER_AND_PURCHASE") return "purchase";
  if (action === "NO_PURCHASE_SLOW_MOVING") return "slow";
  return "neutral";
}

function buildCartLineFromRecommendation(row) {
  const recommendedQty =
    Number(row.transferPlanQty || 0) + Number(row.purchaseQty || 0) > 0
      ? Number(row.transferPlanQty || 0) + Number(row.purchaseQty || 0)
      : Math.max(1, Math.ceil(Number(row.shortageQty || 0)));
  const sourceBranchCode =
    row.action === "TRANSFER_IN" || row.action === "TRANSFER_AND_PURCHASE"
      ? row.primarySuggestedDonorBranchCode || "000"
      : "000";

  return {
    lineKey: [row.productCode, sourceBranchCode, row.unit || ""].join("::"),
    sourceBranchCode,
    sourceBranchName: row.action === "PURCHASE" ? "ฝ่ายจัดซื้อ / HQ" : row.donors?.[0]?.branchName || "",
    productCode: row.productCode,
    productNameThai: row.productNameThai || "",
    productNameEng: row.productNameEng || "",
    barcode: row.barcode || "",
    unit: row.unit || "",
    requestedQty: Math.max(1, Math.ceil(recommendedQty)),
    snapshotQty: Number(row.currentStock || 0),
    snapshotSyncedAt: row.syncedAt || null,
    lineNote: row.recommendationReason || row.reason || "",
    recommendation: {
      targetDays: Number(row.targetDays || 90),
      incomingAllocationMode: "EQUAL_SPLIT",
      incomingSourceMode: "LIVE_RECEIPTS",
      recommendationGeneratedAt: row.generatedAt || null,
      currentStock: Number(row.currentStock || 0),
      unitCostAvg: row.unitCostAvg == null ? null : Number(row.unitCostAvg),
      inventoryValue: row.inventoryValue == null ? null : Number(row.inventoryValue),
      soldQty30d: Number(row.soldQty30d || 0),
      soldQty90d: Number(row.soldQty90d || 0),
      adu30: Number(row.adu30 || 0),
      adu90: Number(row.adu90 || 0),
      adjustedAdu: Number(row.adjustedAdu || 0),
      incomingPoQtyTotal: Number(row.incomingPoQtyTotal || 0),
      incomingPoAllocationQty: Number(row.incomingPoAllocationQty || 0),
      effectiveStock: Number(row.effectiveStock || 0),
      currentDaysCover: row.currentDaysCover == null ? null : Number(row.currentDaysCover),
      effectiveDaysCover: row.effectiveDaysCover == null ? null : Number(row.effectiveDaysCover),
      targetQty: row.targetQty == null ? null : Number(row.targetQty),
      surplusQty: Number(row.surplusQty || 0),
      shortageQty: Number(row.shortageQty || 0),
      recommendedAction: row.action,
      recommendedTransferQty: Number(row.transferPlanQty || 0),
      recommendedPurchaseQty: Number(row.purchaseQty || 0),
      recommendedRequestQty: Math.max(1, Math.ceil(recommendedQty)),
      primarySuggestedDonorBranchCode: row.primarySuggestedDonorBranchCode || null,
      recommendationReason: row.recommendationReason || row.reason || "",
      recommendationFlags: Array.isArray(row.flags) ? row.flags : [],
      donorSnapshot: Array.isArray(row.donors) ? row.donors : [],
      recommendationSnapshot: {
        branchCode: row.branchCode,
        productCode: row.productCode,
        priorityScore: row.priorityScore,
        generatedAt: row.generatedAt || null,
      },
    },
  };
}

function RecommendationCard({ row, onApply }) {
  const recommendedQty = Number(row.transferPlanQty || 0) + Number(row.purchaseQty || 0);

  return (
    <article className={`recommendation-card tone-${actionTone(row.action)}`}>
      <div className="recommendation-card-header">
        <div>
          <h3>{row.productNameThai || row.productNameEng || row.productCode}</h3>
          <p className="subtle">
            {row.productCode} · {row.unit || "-"} · cover ตอนนี้ {formatNumber(row.currentDaysCover, 1)} วัน
          </p>
        </div>
        <span className={`recommendation-badge tone-${actionTone(row.action)}`}>
          {ACTION_LABELS[row.action] || row.action}
        </span>
      </div>

      <div className="recommendation-metrics">
        <div>
          <span>มีอยู่</span>
          <strong>{formatNumber(row.currentStock)}</strong>
        </div>
        <div>
          <span>เป้าหมาย</span>
          <strong>{formatNumber(row.targetQty)}</strong>
        </div>
        <div>
          <span>ขาด / เกิน</span>
          <strong>{formatNumber(row.shortageQty || row.surplusQty)}</strong>
        </div>
        <div>
          <span>ระบบแนะนำขอรวม</span>
          <strong>{formatNumber(recommendedQty)}</strong>
        </div>
      </div>

      <div className="recommendation-breakdown">
        <p><strong>เหตุผล:</strong> {row.recommendationReason || row.reason || "-"}</p>
        <p>
          <strong>Transfer:</strong> {formatNumber(row.transferPlanQty)}{" "}
          <strong>Purchase:</strong> {formatNumber(row.purchaseQty)}
        </p>
        {row.primarySuggestedDonorBranchCode ? (
          <p>
            <strong>สาขาที่แนะนำให้ขอ:</strong> {row.primarySuggestedDonorBranchCode}
          </p>
        ) : null}
      </div>

      <div className="recommendation-actions">
        <button type="button" className="primary review-submit-button" onClick={() => onApply(row)}>
          ใช้คำแนะนำนี้
        </button>
      </div>
    </article>
  );
}

export default function RecommendationsPage() {
  const { session } = useAuth();
  const { addLines } = useCart();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  });

  useEffect(() => {
    setPagination((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [action, search, session?.branchCode]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const listData = await api.getStockRecommendations({
          branchCode: session?.branchCode || "",
          search,
          action,
          page: pagination.page,
          pageSize: pagination.pageSize,
        });
        if (!active) return;
        const generatedAt = listData.generatedAt || new Date().toISOString();
        const normalizedRows = Array.isArray(listData.rows)
          ? listData.rows.map((row) => ({ ...row, generatedAt }))
          : [];
        setRows(normalizedRows);
        setSummary(listData?.summary || null);
        setPagination({
          page: Number(listData.pagination?.page || pagination.page || 1),
          pageSize: Number(listData.pagination?.pageSize || pagination.pageSize || DEFAULT_PAGE_SIZE),
          total: Number(listData.pagination?.total || 0),
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลดคำแนะนำสต๊อกไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [action, pagination.page, pagination.pageSize, search, session?.branchCode]);

  useEffect(() => {
    let active = true;
    async function loadSummary() {
      try {
        setSummaryLoading(true);
        const summaryData = await api.getStockRecommendationSummary({ branchCode: session?.branchCode || "" });
        if (!active) return;
        setSummary(summaryData?.company || null);
      } catch (_error) {
        if (!active) return;
        setSummary(null);
      } finally {
        if (active) setSummaryLoading(false);
      }
    }
    loadSummary();
    return () => {
      active = false;
    };
  }, [session?.branchCode]);

  useEffect(() => {
    if (!flashMessage) return undefined;
    const timeoutId = window.setTimeout(() => setFlashMessage(""), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [flashMessage]);

  const actionableCount = useMemo(
    () => rows.filter((row) => row.action !== "NO_ACTION" && row.action !== "NO_PURCHASE_SLOW_MOVING").length,
    [rows],
  );
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || DEFAULT_PAGE_SIZE)));
  const currentPage = Math.min(totalPages, Math.max(1, pagination.page || 1));
  const rangeStart = pagination.total === 0 ? 0 : (currentPage - 1) * (pagination.pageSize || DEFAULT_PAGE_SIZE) + 1;
  const rangeEnd = pagination.total === 0 ? 0 : rangeStart + rows.length - 1;
  const showLoadingOverlay = loading && (rows.length > 0 || pagination.total > 0);

  function handleApplyRecommendation(row) {
    addLines([buildCartLineFromRecommendation(row)]);
    setFlashMessage(`เพิ่ม ${row.productCode} ตามคำแนะนำลงตะกร้าแล้ว`);
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  return (
    <section className="panel">
      <div className="panel-header stacked">
        <div>
          <h2>คำแนะนำสต๊อกสำหรับสาขา {session?.branchCode || "-"}</h2>
          <p>ระบบช่วยประเมินว่าตอนนี้ควรขอของจากสาขาอื่นหรือสั่งซื้อเพิ่มเท่าไหร่ โดยยังไม่บังคับตามคำแนะนำ</p>
        </div>
        <div className="toolbar cluster-toolbar">
          <form className="search-row inline-search" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ค้นหา SKU ชื่อสินค้า หรือ barcode"
            />
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">ทุก action</option>
              <option value="TRANSFER_IN">ขอจากสาขาอื่น</option>
              <option value="PURCHASE">สั่งซื้อเพิ่ม</option>
              <option value="TRANSFER_AND_PURCHASE">ขอ + ซื้อเพิ่ม</option>
              <option value="NO_PURCHASE_SLOW_MOVING">สินค้าหมุนช้า</option>
              <option value="NO_ACTION">ยังไม่ต้องสั่ง</option>
            </select>
            <button type="submit">ค้นหา</button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setAction("");
              }}
            >
              ล้างตัวกรอง
            </button>
          </form>
        </div>
      </div>

      <div className="summary-grid recommendation-summary-grid">
        <article className="summary-card">
          <span>SKU ที่กำลังแสดง</span>
          <strong>{rows.length.toLocaleString("th-TH")}</strong>
        </article>
        <article className="summary-card">
          <span>SKU ที่ควรลงมือ</span>
          <strong>{actionableCount.toLocaleString("th-TH")}</strong>
        </article>
        <article className="summary-card">
          <span>มูลค่าสต๊อกปัจจุบัน</span>
          <strong>{formatNumber(summary?.currentInventoryValue, 0)}</strong>
        </article>
        <article className="summary-card">
          <span>วันคงคลังเฉลี่ย</span>
          <strong>{formatNumber(summary?.averageDaysCover, 1)}</strong>
        </article>
      </div>

      {flashMessage ? <div className="notice success compact-notice">{flashMessage}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {summaryLoading ? <div className="notice compact-notice">กำลังอัปเดตภาพรวมคำแนะนำ...</div> : null}

      <div className="recommendation-loading-wrap">
        {showLoadingOverlay ? (
          <div className="recommendation-loading-overlay" aria-live="polite" aria-label="กำลังโหลดคำแนะนำสต๊อก">
            <div className="recommendation-spinner" />
            <div>กำลังโหลดคำแนะนำสต๊อก...</div>
          </div>
        ) : null}

        {!loading && rows.length === 0 ? (
          <div className="empty-cart-card">
            <p className="empty-state">ไม่พบ recommendation ตามเงื่อนไขนี้</p>
          </div>
        ) : null}

        {(rows.length > 0 || loading) ? (
          <div className="recommendation-grid">
            {rows.map((row) => (
              <RecommendationCard
                key={`${row.branchCode}-${row.productCode}`}
                row={row}
                onApply={handleApplyRecommendation}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="pagination recommendation-pagination">
        <p className="pagination-info">
          {pagination.total === 0
            ? "0 รายการ"
            : `${formatNumber(rangeStart)}-${formatNumber(rangeEnd)} จาก ${formatNumber(pagination.total)} รายการ`}
        </p>
        <div className="pagination-actions">
          <button
            type="button"
            className="ghost"
            disabled={loading || currentPage <= 1}
            onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
          >
            ก่อนหน้า
          </button>
          <span className="recommendation-page-indicator">
            หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </span>
          <button
            type="button"
            disabled={loading || currentPage >= totalPages}
            onClick={() => setPagination((current) => ({ ...current, page: Math.min(totalPages, current.page + 1) }))}
          >
            ถัดไป
          </button>
        </div>
      </div>
    </section>
  );
}
