import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BranchStockRecommendationSuggestion from "./BranchStockRecommendationSuggestion";
import {
  createBranchStockScopeWorkbook,
  getBranchStockScopeOptions,
  getDefaultBranchStockScopeId,
  getVisibleBranchStockColumns,
  normalizeBranchStockScopeBranchCode,
  projectBranchStockRows,
} from "./lib/branchStockScope.js";
import {
  clearBranchStockColumnOrder,
  loadBranchStockColumnOrder,
  moveBranchStockColumn,
  normalizeBranchStockColumnOrder,
  reorderBranchStockColumn,
  saveBranchStockColumnOrder,
} from "./lib/branchStockColumnPreferences.js";
import {
  buildRecommendationPriorityMap,
  compareRowsByRecommendationPriority,
  getRecommendationPriorityRowClass,
} from "./lib/branchStockRecommendationPriority.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const BRANCH_STOCK_COLUMN_FEEDBACK_MS = 600;
const HQ_BRANCH_CODE = "000";

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function translateCategoryReviewStatus(status) {
  if (status === "confirmed") return "ยืนยันแล้ว";
  if (status === "imported_exact_match") return "นำเข้าจาก exact code";
  if (status === "proposed") return "รอตรวจ";
  if (status === "needs_review") return "ต้องทบทวน";
  if (status === "reverify") return "ต้องตรวจซ้ำ";
  return status || "-";
}

function categoryStatusClass(status) {
  if (status === "confirmed" || status === "imported_exact_match") return "good";
  if (status === "proposed") return "warning";
  if (status === "reverify") return "danger";
  return "muted";
}

function getCategoryGroupStyle(category) {
  const label = String(category || "").trim();
  if (!label) return undefined;

  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = ((hash << 5) - hash) + label.charCodeAt(index);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return {
    "--category-group-bg": `hsla(${hue}, 68%, 56%, 0.12)`,
    "--category-group-border": `hsla(${hue}, 58%, 45%, 0.24)`,
  };
}

function compactFileName(value) {
  if (!value) return "-";
  const parts = String(value).split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

const BRANCH_STOCK_COLUMNS = [
  { key: "productNameThai", label: "ชื่อสินค้าไทย", type: "text" },
  { key: "productCode", label: "รหัสสินค้า", type: "text" },
  { key: "barcode", label: "รหัสบาร์โค้ด", type: "text" },
  { key: "unit", label: "หน่วย", type: "text" },
  { key: "qtyBranch000", label: "สาขา 000", type: "number" },
  { key: "qtyBranch001", label: "สาขา 001", type: "number" },
  { key: "qtyBranch003", label: "สาขา 003", type: "number" },
  { key: "qtyBranch004", label: "สาขา 004", type: "number" },
  { key: "qtyBranch005", label: "สาขา 005", type: "number" },
  { key: "qtyTotalAllBranches", label: "รวม", type: "number" },
  { key: "productNameEng", label: "ชื่อภาษาอังกฤษ", type: "text" },
  { key: "category", label: "หมวดหมู่", type: "text" },
  { key: "categoryStatus", label: "สถานะหมวดหมู่", type: "text" },
  { key: "syncedAt", label: "Sync At", type: "date" },
];

const STOCK_COST_COMPARE_BRANCHES = [
  { branchCode: "000", label: "สาขา 000 (HQ)", shortLabel: "000" },
  { branchCode: "001", label: "สาขา 001", shortLabel: "001" },
  { branchCode: "003", label: "สาขา 003", shortLabel: "003" },
  { branchCode: "004", label: "สาขา 004", shortLabel: "004" },
  { branchCode: "005", label: "สาขา 005", shortLabel: "005" },
];

function getBranchStockQty(row, branchCode) {
  return Number(row?.[`qtyBranch${branchCode}`] || 0);
}

function formatBranchContextLabel(branchCode, branchName = "") {
  if (!branchCode) return branchName || "ยังไม่ได้เลือกสาขา";
  return branchName ? `${branchCode} - ${branchName}` : `สาขา ${branchCode}`;
}

function buildRequestDraftLineKey({ productCode, sourceBranchCode, unit, requestMode }) {
  return [productCode, sourceBranchCode, unit || "", requestMode || "STANDARD"].join("::");
}

function normalizeRequestedQty(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(numericValue));
}

function mergeRequestDraftItems(currentItems = [], addedItems = []) {
  const merged = new Map();

  currentItems.forEach((item) => {
    merged.set(item.lineKey, item);
  });

  addedItems.forEach((item) => {
    const lineKey = buildRequestDraftLineKey(item);
    const normalized = {
      ...item,
      lineKey,
      requestedQty: normalizeRequestedQty(item.requestedQty),
      lineNote: String(item.lineNote || "").trim(),
      requestMode: item.requestMode || "STANDARD",
      snapshotQty: Number(item.snapshotQty || 0),
      snapshotSyncedAt: item.snapshotSyncedAt || null,
    };
    const existing = merged.get(lineKey);
    if (!existing) {
      merged.set(lineKey, normalized);
      return;
    }
    merged.set(lineKey, {
      ...existing,
      requestedQty: existing.requestedQty + normalized.requestedQty,
      requestMode: existing.requestMode === "ADMIN_ALERT" || normalized.requestMode === "ADMIN_ALERT"
        ? "ADMIN_ALERT"
        : (normalized.requestMode || existing.requestMode || "STANDARD"),
      snapshotQty: Math.max(existing.snapshotQty || 0, normalized.snapshotQty || 0),
      snapshotSyncedAt: normalized.snapshotSyncedAt || existing.snapshotSyncedAt,
      lineNote: normalized.lineNote || existing.lineNote,
    });
  });

  return Array.from(merged.values()).sort((left, right) =>
    `${left.sourceBranchCode}-${left.productCode}`.localeCompare(
      `${right.sourceBranchCode}-${right.productCode}`,
      "th",
      { numeric: true, sensitivity: "base" },
    ),
  );
}

function normalizeFilterValue(value) {
  return String(value == null ? "" : value).trim();
}

function getBranchStockColumnValue(row, key) {
  if (key === "categoryStatus") {
    return translateCategoryReviewStatus(row.categoryStatus || "needs_review");
  }
  if (key === "syncedAt") {
    return row.syncedAt || "";
  }
  if (key === "category") {
    return row.category || "";
  }
  return row[key] ?? "";
}

function compareBranchStockValues(leftValue, rightValue, type, direction) {
  const order = direction === "desc" ? -1 : 1;

  if (type === "number") {
    const leftNumber = Number(leftValue || 0);
    const rightNumber = Number(rightValue || 0);
    if (leftNumber === rightNumber) return 0;
    return leftNumber > rightNumber ? order : -order;
  }

  if (type === "date") {
    const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
    const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
    if (leftTime === rightTime) return 0;
    return leftTime > rightTime ? order : -order;
  }

  const leftText = normalizeFilterValue(leftValue);
  const rightText = normalizeFilterValue(rightValue);
  if (!leftText && !rightText) return 0;
  if (!leftText) return 1;
  if (!rightText) return -1;
  return leftText.localeCompare(rightText, "th", { numeric: true, sensitivity: "base" }) * order;
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

const BRANCH_LABELS = {
  "000": "สาขา 000 (HQ)",
  "001": "สาขา 001",
  "003": "สาขา 003",
  "004": "สาขา 004",
  "005": "สาขา 005",
};

export function BranchStockPanel({
  csrfToken,
  isAdminUser,
  userId,
  isOnlineMarketingStaff = false,
  branchCode,
  branchName,
  onNavigate,
  requestDraftItems,
  setRequestDraftItems,
  onClearDraft,
}) {
  const pageSize = 25;
  const pageFetchLimit = 10000;
  const branchExportOptions = [
    { branchCode: "all", label: "ทุกสาขา", description: "1 ชีทเปรียบเทียบทุกสาขา + 5 ชีทรายสาขา (ไฟล์เดียว)" },
    { branchCode: "000", label: "สาขา 000 (HQ)", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 000 (HQ)" },
    { branchCode: "001", label: "สาขา 001", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 001" },
    { branchCode: "003", label: "สาขา 003", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 003" },
    { branchCode: "004", label: "สาขา 004", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 004" },
    { branchCode: "005", label: "สาขา 005", description: "ดึงเฉพาะคอลัมน์จำนวนของ สาขา 005" },
  ];
  const [records, setRecords] = useState([]);
  const [matchReport, setMatchReport] = useState(null);
  const [matchPreview, setMatchPreview] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [offset, setOffset] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: "productCode", direction: "asc" });
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilterKey, setOpenFilterKey] = useState("");
  const [filterSearchTerm, setFilterSearchTerm] = useState("");
  const [pendingFilterValues, setPendingFilterValues] = useState([]);
  const [pagination, setPagination] = useState({
    limit: pageFetchLimit,
    offset: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applyingPreview, setApplyingPreview] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const scopedBranchCode = normalizeBranchStockScopeBranchCode(
    branchCode || (isOnlineMarketingStaff ? "000" : ""),
  );
  const isBranchStockScopeUser = !isAdminUser && Boolean(scopedBranchCode);
  const branchStockScopeOptions = useMemo(
    () => getBranchStockScopeOptions(scopedBranchCode),
    [scopedBranchCode],
  );
  const defaultBranchStockScope = getDefaultBranchStockScopeId(scopedBranchCode);
  const [selectedBranchScope, setSelectedBranchScope] = useState(defaultBranchStockScope);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportBranch, setSelectedExportBranch] = useState("001");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [requestMode, setRequestMode] = useState(false);
  const [recommendationPriorityRows, setRecommendationPriorityRows] = useState([]);
  const [recommendationPriorityActive, setRecommendationPriorityActive] = useState(false);
  const [loadingRecommendationPriority, setLoadingRecommendationPriority] = useState(false);
  const [requestPriorityManualSort, setRequestPriorityManualSort] = useState(false);
  const [requestDialogProduct, setRequestDialogProduct] = useState(null);
  const [requestQuantities, setRequestQuantities] = useState({});
  const [requestLineNote, setRequestLineNote] = useState("");
  const [requestDialogError, setRequestDialogError] = useState("");
  const [procurementQty, setProcurementQty] = useState("");
  const [procurementRowOpen, setProcurementRowOpen] = useState(false);
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [columnEditorBusyAction, setColumnEditorBusyAction] = useState("");
  const [columnOrder, setColumnOrder] = useState(() =>
    loadBranchStockColumnOrder(typeof window === "undefined" ? null : window.localStorage, userId, BRANCH_STOCK_COLUMNS),
  );
  const [draftColumnOrder, setDraftColumnOrder] = useState(columnOrder);
  const [draggedColumnKey, setDraggedColumnKey] = useState("");
  const columnEditorRowRefs = useRef(new Map());
  const previousColumnEditorRowPositions = useRef(null);
  const columnEditorRowAnimationCleanups = useRef(new Map());
  const filterMenuRef = useRef(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const requestButtonRef = useRef(null);
  const [flyDots, setFlyDots] = useState([]);

  useEffect(() => {
    const nextOrder = isAdminUser
      ? loadBranchStockColumnOrder(
          typeof window === "undefined" ? null : window.localStorage,
          userId,
          BRANCH_STOCK_COLUMNS,
        )
      : BRANCH_STOCK_COLUMNS.map((column) => column.key);
    setColumnOrder(nextOrder);
    setDraftColumnOrder(nextOrder);
    setColumnEditorOpen(false);
    setColumnEditorBusyAction("");
  }, [isAdminUser, userId]);

  const draftBranchStockColumns = useMemo(() => {
    const columnsByKey = new Map(BRANCH_STOCK_COLUMNS.map((column) => [column.key, column]));
    return normalizeBranchStockColumnOrder(draftColumnOrder, BRANCH_STOCK_COLUMNS).map((key) => columnsByKey.get(key));
  }, [draftColumnOrder]);

  useLayoutEffect(() => {
    const previousPositions = previousColumnEditorRowPositions.current;
    if (!previousPositions) return;
    previousColumnEditorRowPositions.current = null;

    const prefersReducedMotion = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      [...columnEditorRowAnimationCleanups.current.values()].forEach((cleanupAnimation) => cleanupAnimation());
      return;
    }

    columnEditorRowRefs.current.forEach((row, columnKey) => {
      const previousTop = previousPositions.get(columnKey);
      if (!row || typeof previousTop !== "number") return;
      columnEditorRowAnimationCleanups.current.get(columnKey)?.();
      const verticalOffset = previousTop - row.getBoundingClientRect().top;
      if (Math.abs(verticalOffset) < 1) return;

      let animationFrameId = 0;
      let cleanupTimeoutId = 0;
      let animationFinished = false;
      const handleTransitionEnd = (event) => {
        if (event.target === row && event.propertyName === "transform") cleanupAnimation();
      };
      const cleanupAnimation = () => {
        if (animationFinished) return;
        animationFinished = true;
        window.cancelAnimationFrame(animationFrameId);
        window.clearTimeout(cleanupTimeoutId);
        row.removeEventListener("transitionend", handleTransitionEnd);
        row.style.removeProperty("transition");
        row.style.removeProperty("transform");
        row.style.removeProperty("z-index");
        if (columnEditorRowAnimationCleanups.current.get(columnKey) === cleanupAnimation) {
          columnEditorRowAnimationCleanups.current.delete(columnKey);
        }
      };

      row.style.transition = "none";
      row.style.transform = `translateY(${verticalOffset}px)`;
      row.style.zIndex = "1";
      void row.offsetHeight;
      columnEditorRowAnimationCleanups.current.set(columnKey, cleanupAnimation);
      animationFrameId = window.requestAnimationFrame(() => {
        if (animationFinished) return;
        row.addEventListener("transitionend", handleTransitionEnd);
        row.style.transition = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "translateY(0)";
        cleanupTimeoutId = window.setTimeout(cleanupAnimation, 400);
      });
    });
  }, [draftBranchStockColumns]);

  useEffect(() => () => {
    [...columnEditorRowAnimationCleanups.current.values()].forEach((cleanupAnimation) => cleanupAnimation());
  }, []);

  function openColumnEditor() {
    setDraftColumnOrder(columnOrder);
    setDraggedColumnKey("");
    setColumnEditorBusyAction("");
    setColumnEditorOpen(true);
  }

  function moveColumnEditorRow(columnKey, direction) {
    previousColumnEditorRowPositions.current = new Map(
      [...columnEditorRowRefs.current.entries()].map(([key, row]) => [key, row.getBoundingClientRect().top]),
    );
    setDraftColumnOrder((current) => moveBranchStockColumn(current, columnKey, direction));
  }

  async function waitForColumnEditorFeedback() {
    await new Promise((resolve) => window.setTimeout(resolve, BRANCH_STOCK_COLUMN_FEEDBACK_MS));
  }

  async function saveColumnEditor() {
    if (columnEditorBusyAction) return;
    setColumnEditorBusyAction("saving");
    await waitForColumnEditorFeedback();
    const nextOrder = normalizeBranchStockColumnOrder(draftColumnOrder, BRANCH_STOCK_COLUMNS);
    setColumnOrder(nextOrder);
    saveBranchStockColumnOrder(
      typeof window === "undefined" ? null : window.localStorage,
      userId,
      nextOrder,
      BRANCH_STOCK_COLUMNS,
    );
    setColumnEditorOpen(false);
    setColumnEditorBusyAction("");
    setDraggedColumnKey("");
  }

  async function resetColumnEditorToDefault() {
    if (columnEditorBusyAction) return;
    setColumnEditorBusyAction("resetting");
    await waitForColumnEditorFeedback();
    const defaultOrder = BRANCH_STOCK_COLUMNS.map((column) => column.key);
    setDraftColumnOrder(defaultOrder);
    setColumnOrder(defaultOrder);
    clearBranchStockColumnOrder(typeof window === "undefined" ? null : window.localStorage, userId);
    setColumnEditorOpen(false);
    setColumnEditorBusyAction("");
    setDraggedColumnKey("");
  }

  useEffect(() => {
    setSelectedBranchScope(defaultBranchStockScope);
    setOffset(0);
    setOpenFilterKey("");
    setColumnFilters({});
  }, [defaultBranchStockScope]);

  useEffect(() => {
    if (!loading) return undefined;
    const id = setTimeout(() => {
      setLoading(false);
      setError("โหลดข้อมูลนานเกินไป กรุณาลองกด รีเฟรช");
    }, 45000);
    return () => clearTimeout(id);
  }, [loading]);

  useEffect(() => {
    let active = true;

    async function loadBranchStock() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          limit: String(pageFetchLimit),
          offset: "0",
        });
        if (appliedSearchTerm) {
          params.set("search", appliedSearchTerm);
        }
        const response = await apiFetch(`/api/branch-stock?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setRecords(data.records || []);
        setError("");
        setPagination(
          data.pagination || {
            limit: pageFetchLimit,
            offset: 0,
            total: data.records?.length || 0,
          },
        );
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลดข้อมูลสต็อกสาขาไม่สำเร็จ");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBranchStock();
    return () => {
      active = false;
    };
  }, [appliedSearchTerm, refreshKey]);

  useEffect(() => {
    if (!requestMode || !isBranchStockScopeUser || !scopedBranchCode) {
      setRecommendationPriorityRows([]);
      setRecommendationPriorityActive(false);
      setLoadingRecommendationPriority(false);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    async function loadRecommendationPriority() {
      setRecommendationPriorityRows([]);
      setRecommendationPriorityActive(false);
      setLoadingRecommendationPriority(true);
      try {
        const params = new URLSearchParams({ branchCode: scopedBranchCode });
        const response = await apiFetch(`/api/admin/stock-recommendations/priority-index?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        const normalizedActive = data.active === true && data.meta?.reader?.servedReader === "normalized";
        setRecommendationPriorityRows(normalizedActive && Array.isArray(data.rows) ? data.rows : []);
        setRecommendationPriorityActive(normalizedActive);
      } catch (loadError) {
        if (!active || loadError?.name === "AbortError") return;
        setRecommendationPriorityRows([]);
        setRecommendationPriorityActive(false);
      } finally {
        if (active) setLoadingRecommendationPriority(false);
      }
    }

    loadRecommendationPriority();
    return () => {
      active = false;
      controller.abort();
    };
  }, [isBranchStockScopeUser, requestMode, refreshKey, scopedBranchCode]);

  useEffect(() => {
    if (!isAdminUser) {
      setMatchReport(null);
      setReportError("");
      setLoadingReport(false);
      return undefined;
    }

    let active = true;

    async function loadMatchReport() {
      setLoadingReport(true);
      setReportError("");
      try {
        const response = await apiFetch("/api/admin/taxonomy-match-report");
        if (response.status === 404) {
          if (!active) return;
          setMatchReport(null);
          setReportError("ยังไม่มีรายงานเทียบ taxonomy ใน docs/");
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setMatchReport(data);
      } catch (loadError) {
        if (!active) return;
        setReportError(loadError.message || "โหลดรายงานเทียบ taxonomy ไม่สำเร็จ");
      } finally {
        if (active) {
          setLoadingReport(false);
        }
      }
    }

    loadMatchReport();
    return () => {
      active = false;
    };
  }, [isAdminUser, refreshKey]);

  useEffect(() => {
    if (!openFilterKey) return undefined;

    function handlePointerDown(event) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setOpenFilterKey("");
        setFilterMenuAnchor(null);
        setPendingFilterValues([]);
        setFilterSearchTerm("");
      }
    }

    function handleScroll(event) {
      if (filterMenuRef.current && filterMenuRef.current.contains(event.target)) return;
      setOpenFilterKey("");
      setFilterMenuAnchor(null);
      setPendingFilterValues([]);
      setFilterSearchTerm("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [openFilterKey]);

  useEffect(() => {
    if (!isAdminUser) {
      setMatchPreview(null);
      setPreviewError("");
      setApplyMessage("");
      setLoadingPreview(false);
      return undefined;
    }

    let active = true;

    async function loadMatchPreview() {
      setLoadingPreview(true);
      setPreviewError("");
      setApplyMessage("");
      try {
        const response = await apiFetch("/api/admin/taxonomy-match-preview?limit=10&offset=0");
        if (response.status === 404) {
          if (!active) return;
          setMatchPreview(null);
          setPreviewError("ยังไม่มี preview สำหรับ taxonomy report");
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!active) return;
        setMatchPreview(data);
      } catch (loadError) {
        if (!active) return;
        setPreviewError(loadError.message || "โหลด preview taxonomy ไม่สำเร็จ");
      } finally {
        if (active) {
          setLoadingPreview(false);
        }
      }
    }

    loadMatchPreview();
    return () => {
      active = false;
    };
  }, [isAdminUser, refreshKey]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    const nextSearch = searchTerm.trim();
    setAppliedSearchTerm(nextSearch);
    setOffset(0);
    if (nextSearch === appliedSearchTerm) {
      setRefreshKey((value) => value + 1);
    }
  }

  function openColumnFilter(columnKey, event) {
    if (openFilterKey === columnKey) {
      setOpenFilterKey("");
      setFilterMenuAnchor(null);
      setPendingFilterValues([]);
      setFilterSearchTerm("");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setFilterMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    const optionValues = columnOptions[columnKey] || [];
    const currentValues = columnFilters[columnKey] ? [...columnFilters[columnKey]] : [...optionValues];
    setPendingFilterValues(currentValues);
    setOpenFilterKey(columnKey);
    setFilterSearchTerm("");
  }

  function updateColumnSort(columnKey, direction) {
    setSortConfig({ key: columnKey, direction });
    if (requestMode) setRequestPriorityManualSort(true);
    setOpenFilterKey("");
    setPendingFilterValues([]);
  }

  function toggleRequestMode() {
    setRequestMode((current) => !current);
    setRequestPriorityManualSort(false);
    setOffset(0);
    setOpenFilterKey("");
  }

  function clearColumnFilter(columnKey) {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      return next;
    });
    setPendingFilterValues([]);
    setOffset(0);
  }

  function toggleColumnFilterValue(optionValue) {
    setPendingFilterValues((current) =>
      current.includes(optionValue)
        ? current.filter((value) => value !== optionValue)
        : [...current, optionValue],
    );
  }

  function deselectAllColumnFilterValues() {
    setPendingFilterValues([]);
  }

  function toggleAllColumnFilterValues(optionValues) {
    setPendingFilterValues((current) =>
      current.length === optionValues.length ? [] : [...optionValues],
    );
  }

  function applyColumnFilter(columnKey, optionValues) {
    setColumnFilters((current) => {
      const next = { ...current };
      if (pendingFilterValues.length === optionValues.length) {
        delete next[columnKey];
      } else {
        next[columnKey] = [...pendingFilterValues];
      }
      return next;
    });
    setOpenFilterKey("");
    setPendingFilterValues([]);
    setOffset(0);
  }

  async function handleApplySafeMatches() {
    setApplyingPreview(true);
    setPreviewError("");
    setApplyMessage("");
    try {
      const response = await apiFetch("/api/admin/taxonomy-match-apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken || "",
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }
      setApplyMessage(
        `apply แล้ว ${formatNumber(data.appliedCount || 0)} รายการ ข้าม ${formatNumber(data.skippedCount || 0)} รายการ`,
      );
      setRefreshKey((value) => value + 1);
    } catch (applyError) {
      setPreviewError(applyError.message || "apply taxonomy exact matches ไม่สำเร็จ");
    } finally {
      setApplyingPreview(false);
    }
  }

  function downloadBranchStockBlob(blob, fileName) {
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  async function handleExportExcel() {
    setExporting(true);
    setExportError("");
    try {
      if (isBranchStockScopeUser) {
        const { blob, fileName } = await createBranchStockScopeWorkbook({
          records: visibleRecords,
          columns: visibleBranchStockColumns,
          scopeId: selectedBranchScope,
          branchCode: scopedBranchCode,
          getColumnValue: getBranchStockColumnValue,
        });
        downloadBranchStockBlob(blob, fileName);
        return;
      }

      const params = new URLSearchParams({
        branchCode: selectedExportBranch,
      });
      const exportSearch = searchTerm.trim() || appliedSearchTerm;
      if (exportSearch) {
        params.set("search", exportSearch);
      }

      const response = await apiFetch(`/api/branch-stock/export.xlsx?${params.toString()}`);
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json();
          message = payload.message || payload.error || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename=\"?([^"]+)\"?/i);
      anchor.href = objectUrl;
      const dateStamp = new Date().toISOString().slice(0, 10);
      const fallbackName = selectedExportBranch === "all"
        ? `branch-stock-all-${dateStamp}.xlsx`
        : `branch-stock-${selectedExportBranch}.xlsx`;
      anchor.download = fileNameMatch?.[1] || fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setExportModalOpen(false);
    } catch (downloadError) {
      setExportError(downloadError.message || "ส่งออก Excel ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  const scopedBranchStockColumns = useMemo(
    () => getVisibleBranchStockColumns(BRANCH_STOCK_COLUMNS, {
      isBranchStockScopeUser,
      scopeId: selectedBranchScope,
      branchCode: scopedBranchCode,
    }),
    [isBranchStockScopeUser, scopedBranchCode, selectedBranchScope],
  );

  const visibleBranchStockColumns = useMemo(() => {
    if (!isAdminUser) return scopedBranchStockColumns;
    const columnsByKey = new Map(scopedBranchStockColumns.map((column) => [column.key, column]));
    return normalizeBranchStockColumnOrder(columnOrder, scopedBranchStockColumns).map((key) => columnsByKey.get(key));
  }, [columnOrder, isAdminUser, scopedBranchStockColumns]);

  const scopedRecords = useMemo(
    () => projectBranchStockRows(records, {
      isBranchStockScopeUser,
      scopeId: selectedBranchScope,
      branchCode: scopedBranchCode,
    }),
    [records, isBranchStockScopeUser, scopedBranchCode, selectedBranchScope],
  );

  const columnOptions = useMemo(() => {
    return Object.fromEntries(
      visibleBranchStockColumns.map((column) => {
        const values = [...new Set(scopedRecords.map((row) => normalizeFilterValue(getBranchStockColumnValue(row, column.key))))].sort(
          (left, right) => left.localeCompare(right, "th", { numeric: true, sensitivity: "base" }),
        );
        return [column.key, values];
      }),
    );
  }, [scopedRecords, visibleBranchStockColumns]);

  const recommendationPriorityMap = useMemo(
    () => buildRecommendationPriorityMap(recommendationPriorityRows),
    [recommendationPriorityRows],
  );

  const visibleRecords = useMemo(() => {
    const filtered = scopedRecords.filter((row) => {
      return visibleBranchStockColumns.every((column) => {
        const activeValues = columnFilters[column.key];
        if (!activeValues) {
          return true;
        }
        if (activeValues.length === 0) {
          return false;
        }
        const value = normalizeFilterValue(getBranchStockColumnValue(row, column.key));
        return activeValues.includes(value);
      });
    });

    if (requestMode && recommendationPriorityActive && !requestPriorityManualSort) {
      return [...filtered].sort((left, right) => (
        compareRowsByRecommendationPriority(left, right, recommendationPriorityMap)
      ));
    }

    const sortColumn = visibleBranchStockColumns.find((column) => column.key === sortConfig.key)
      || visibleBranchStockColumns.find((column) => column.key === "productCode")
      || visibleBranchStockColumns[0];
    return [...filtered].sort((left, right) =>
      compareBranchStockValues(
        getBranchStockColumnValue(left, sortColumn.key),
        getBranchStockColumnValue(right, sortColumn.key),
        sortColumn.type,
        sortConfig.direction,
      ),
    );
  }, [
    scopedRecords,
    visibleBranchStockColumns,
    columnFilters,
    sortConfig,
    requestMode,
    recommendationPriorityActive,
    recommendationPriorityMap,
    requestPriorityManualSort,
  ]);

  const total = visibleRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safeOffset = Math.min(offset, Math.max(0, (totalPages - 1) * pageSize));
  const currentPage = Math.floor(safeOffset / pageSize) + 1;
  const start = total === 0 ? 0 : safeOffset + 1;
  const pagedRecords = visibleRecords.slice(safeOffset, safeOffset + pageSize);
  const end = total === 0 ? 0 : safeOffset + pagedRecords.length;
  const reportSummary = matchReport?.summary || null;
  const reportStats = matchReport?.stats || null;
  const previewSummary = matchPreview?.summary || null;

  useEffect(() => {
    if (safeOffset !== offset) {
      setOffset(safeOffset);
    }
  }, [offset, safeOffset]);


  useEffect(() => {
    setRequestDialogProduct(null);
    setRequestQuantities({});
    setRequestLineNote("");
    setRequestDialogError("");
  }, [branchCode]);

  const requestBranchLabel = formatBranchContextLabel(branchCode, branchName);
  const requestDraftCount = requestDraftItems.length;

  const requestDraftByBranch = useMemo(() => {
    const groups = new Map();
    for (const item of requestDraftItems) {
      const key = item.sourceBranchCode;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }, [requestDraftItems]);
  const requestDraftTotalQty = requestDraftItems.reduce(
    (sum, item) => sum + Number(item.requestedQty || 0),
    0,
  );

  function getRequestableBranches(row) {
    return STOCK_COST_COMPARE_BRANCHES.filter(
      (branch) => branch.branchCode !== branchCode && getBranchStockQty(row, branch.branchCode) > 0,
    );
  }

  function getAdminAlertTarget(row) {
    if (!branchCode || branchCode === HQ_BRANCH_CODE || !row?.productCode || !row?.unit) {
      return [];
    }
    if (getRequestableBranches(row).length > 0) {
      return [];
    }
    return [{
      branchCode: HQ_BRANCH_CODE,
      label: BRANCH_LABELS[HQ_BRANCH_CODE] || `สาขา ${HQ_BRANCH_CODE}`,
      shortLabel: HQ_BRANCH_CODE,
      requestMode: "ADMIN_ALERT",
      isAdminAlert: true,
    }];
  }

  function getRequestTargets(row) {
    const standardTargets = getRequestableBranches(row).map((branch) => ({
      ...branch,
      requestMode: "STANDARD",
      isAdminAlert: false,
    }));
    if (standardTargets.length > 0) {
      return standardTargets;
    }
    return getAdminAlertTarget(row);
  }

  function canRequestProduct(row) {
    if (!branchCode || !row?.productCode || !row?.unit) {
      return false;
    }
    return getRequestTargets(row).length > 0;
  }

  function openRequestDialogForRow(row) {
    if (!canRequestProduct(row)) return;
    const availableBranches = getRequestTargets(row);
    setRequestDialogProduct(row);
    setRequestQuantities(
      Object.fromEntries(availableBranches.map((branch) => [branch.branchCode, ""])),
    );
    setRequestLineNote("");
    setRequestDialogError("");
    setProcurementQty("");
    setProcurementRowOpen(false);
  }

  function closeRequestDialog() {
    setRequestDialogProduct(null);
    setRequestQuantities({});
    setRequestLineNote("");
    setRequestDialogError("");
    setProcurementQty("");
    setProcurementRowOpen(false);
  }

  function handleAddDraftItem(event) {
    if (!requestDialogProduct) return;
    if (!requestDialogProduct.unit) {
      setRequestDialogError("สินค้านี้ยังไม่มีหน่วย จึงยังเพิ่มคำขอไม่ได้");
      return;
    }
    const selectedLines = [];
    for (const branch of getRequestTargets(requestDialogProduct)) {
      const rawValue = requestQuantities[branch.branchCode];
      if (rawValue === "" || rawValue == null) continue;
      const requestedQty = normalizeRequestedQty(rawValue);
      const snapshotQty = getBranchStockQty(requestDialogProduct, branch.branchCode);
      if (branch.requestMode !== "ADMIN_ALERT" && requestedQty > snapshotQty) {
        setRequestDialogError(`จำนวนที่ขอจาก ${branch.branchCode} มากกว่าสต็อกที่มีอยู่`);
        return;
      }

      selectedLines.push({
        productCode: requestDialogProduct.productCode,
        productNameThai: requestDialogProduct.productNameThai || "",
        productNameEng: requestDialogProduct.productNameEng || "",
        unit: requestDialogProduct.unit || "",
        sourceBranchCode: branch.branchCode,
        sourceBranchName: BRANCH_LABELS[branch.branchCode] || `สาขา ${branch.branchCode}`,
        requestMode: branch.requestMode || "STANDARD",
        requestedQty,
        snapshotQty,
        snapshotSyncedAt: requestDialogProduct.syncedAt || null,
        lineNote: requestLineNote.trim(),
      });
    }

    if (procurementRowOpen && procurementQty !== "" && procurementQty != null) {
      const qty = normalizeRequestedQty(procurementQty);
      if (qty > 0) {
        selectedLines.push({
          productCode: requestDialogProduct.productCode,
          productNameThai: requestDialogProduct.productNameThai || "",
          productNameEng: requestDialogProduct.productNameEng || "",
          unit: requestDialogProduct.unit || "",
          sourceBranchCode: "000",
          sourceBranchName: BRANCH_LABELS["000"] || "สาขา 000 (HQ)",
          requestMode: "ADMIN_ALERT",
          requestedQty: qty,
          snapshotQty: null,
          snapshotSyncedAt: null,
          lineNote: requestLineNote.trim(),
        });
      }
    }

    if (!selectedLines.length) {
      setRequestDialogError("กรุณาระบุจำนวนอย่างน้อย 1 สาขา หรือจำนวนที่แจ้งจัดซื้อ");
      return;
    }

    setRequestDraftItems((current) => mergeRequestDraftItems(current, selectedLines));

    if (event && requestButtonRef.current) {
      const srcRect = event.currentTarget.getBoundingClientRect();
      const dstRect = requestButtonRef.current.getBoundingClientRect();
      const startX = srcRect.left + srcRect.width / 2;
      const startY = srcRect.top + srcRect.height / 2;
      const id = Date.now() + Math.random();
      setFlyDots((dots) => [
        ...dots,
        {
          id,
          x: startX - 7,
          y: startY - 7,
          tx: dstRect.left + dstRect.width / 2 - startX,
          ty: dstRect.top + dstRect.height / 2 - startY,
        },
      ]);
      setTimeout(() => setFlyDots((dots) => dots.filter((d) => d.id !== id)), 520);
    }
    closeRequestDialog();
  }

  function patchDraftItem(lineKey, patch) {
    setRequestDraftItems((current) =>
      current
        .map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                ...patch,
                requestedQty: patch.requestedQty == null ? item.requestedQty : normalizeRequestedQty(patch.requestedQty),
                lineNote: patch.lineNote == null ? item.lineNote : String(patch.lineNote || "").trim(),
              }
            : item,
        )
        .filter((item) => normalizeRequestedQty(item.requestedQty) > 0),
    );
  }

  function removeDraftItem(lineKey) {
    setRequestDraftItems((current) => current.filter((item) => item.lineKey !== lineKey));
  }

  function renderBranchStockCell(row, column) {
    if (column.key === "productCode") {
      return <strong>{row.productCode}</strong>;
    }
    if (column.key === "category") {
      return (
        <div className="category-group-card" style={getCategoryGroupStyle(row.category)}>
          <strong>{row.category || "-"}</strong>
          {isAdminUser && row.categoryRationale ? <div className="meta">{row.categoryRationale}</div> : null}
        </div>
      );
    }
    if (column.key === "categoryStatus") {
      return (
        <span className={`status category-status-pill ${categoryStatusClass(row.categoryStatus)}`}>
          {translateCategoryReviewStatus(row.categoryStatus || "needs_review")}
        </span>
      );
    }
    if (column.type === "number") {
      return formatNumber(row[column.key], 2);
    }
    if (column.key === "syncedAt") {
      return formatDateTime(row.syncedAt);
    }
    return row[column.key] || "-";
  }

  return (
    <section className="panel branch-stock-panel">
      <div
        className={`panel-header stacked branch-stock-panel-header${isBranchStockScopeUser ? "" : " branch-stock-panel-header-without-scope"}`}
      >
        <div className="branch-stock-header-info">
          <h2>สต็อกแยกตามสาขา</h2>
          <p>ข้อมูล snapshot ล่าสุดที่ Mother PC ส่งเข้า Render สำหรับการติดตามยอดแต่ละสาขา</p>
        </div>

        {isBranchStockScopeUser ? (
          <div className="branch-stock-scope-bar">
            <span className="branch-stock-scope-label">ขอบเขตสต็อก</span>
            <div className="branch-stock-scope-segments" role="group" aria-label="เลือกขอบเขตสต็อกที่แสดง">
              {branchStockScopeOptions.map((option) => {
                const isSelected = selectedBranchScope === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`branch-stock-scope-button${isSelected ? " selected" : ""}`}
                    aria-label={option.ariaLabel}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedBranchScope(option.id);
                      setOffset(0);
                      setOpenFilterKey("");
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <form className="toolbar branch-stock-toolbar" onSubmit={handleSearchSubmit}>
          <div className="branch-stock-search-row">
            <input
              type="search"
              aria-label="ค้นหาสต็อกสินค้า"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหารหัสสินค้า ชื่อไทย ชื่ออังกฤษ หรือ Barcode"
            />
            <button type="submit" className="ghost-button branch-stock-search-button">
              ค้นหา
            </button>
          </div>
          <div className="branch-stock-action-row" role="group" aria-label="การดำเนินการสต็อก">
            <button
              type="button"
              className="excel-export-button"
              aria-label={isBranchStockScopeUser ? "ส่งออก Excel ตามขอบเขตสต็อกที่เลือก" : "เปิดตัวเลือกส่งออก Excel แยกตามสาขา"}
              onClick={isBranchStockScopeUser
                ? handleExportExcel
                : () => {
                    setExportError("");
                    setExportModalOpen(true);
                  }}
              disabled={isBranchStockScopeUser && exporting}
            >
              {isBranchStockScopeUser && exporting ? "กำลังสร้างไฟล์..." : "ส่งออก Excel"}
            </button>
            <button
              ref={requestButtonRef}
              type="button"
              className={`request-entry-button${requestMode ? " active" : ""}`}
              onClick={toggleRequestMode}
            >
              {requestMode ? "ปิดโหมดขอสินค้า" : "ขอสินค้า"}
            </button>
            <button
              type="button"
              className="ghost-button branch-stock-refresh-button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
            >
              รีเฟรช
            </button>
          </div>
          {isAdminUser ? (
            <div className="branch-stock-admin-action-row">
              <button
                type="button"
                className="ghost-button branch-stock-column-editor-button"
                onClick={openColumnEditor}
              >
                จัดคอลัมน์
              </button>
            </div>
          ) : null}
        </form>
        {isBranchStockScopeUser && exportError ? (
          <p
            className="notice error compact branch-stock-export-error"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            ส่งออก Excel ไม่สำเร็จ: {exportError}
          </p>
        ) : null}
      </div>

      {!branchCode && !isAdminUser ? (
        <p className="notice warning compact">
          ต้องเลือกสาขาที่จะใช้งานใน session ก่อน จึงจะเปิดใช้งานคำขอสินค้าได้อย่างปลอดภัย
        </p>
      ) : null}
      {(requestMode || requestDraftCount > 0) && (
        <section className="request-draft-card">
          <div>
            <strong>คำขอสินค้าของ {requestBranchLabel}</strong>
            <p className="meta-line">
              เลือกโหมดขอสินค้าแล้วกดปุ่ม <strong>+</strong> หน้าแต่ละรายการเพื่อเพิ่มเข้าคำขอ
            </p>
          </div>
          <div className="request-draft-actions">
            <span className="request-draft-chip">
              {formatNumber(requestDraftCount)} รายการ · {formatNumber(requestDraftTotalQty)} หน่วย
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onClearDraft()}
              disabled={!requestDraftCount}
            >
              ล้างรายการ
            </button>
          </div>
        </section>
      )}

      {isAdminUser ? (
      <section className={`taxonomy-report-card${taxonomyOpen ? " taxonomy-open" : " taxonomy-collapsed"}`}>
        <button
          type="button"
          className="taxonomy-toggle-bar"
          onClick={() => setTaxonomyOpen((v) => !v)}
          aria-expanded={taxonomyOpen}
        >
          <span className="taxonomy-toggle-label">
            <span className="taxonomy-toggle-icon">{taxonomyOpen ? "▾" : "▸"}</span>
            <span>Taxonomy</span>
            {!taxonomyOpen && reportSummary && (
              <span className="taxonomy-toggle-pill">
                {formatNumber(reportSummary.exactCodeMatches || 0)} matched
                {(reportSummary.conflictRows || 0) > 0 && (
                  <span className="taxonomy-toggle-warn"> · {formatNumber(reportSummary.conflictRows)} conflicts</span>
                )}
              </span>
            )}
          </span>
          {!taxonomyOpen && (
            <span className="taxonomy-toggle-hint">คลิกเพื่อดูรายงาน</span>
          )}
        </button>

        {taxonomyOpen && (
        <div className="taxonomy-report-body">
        <div className="taxonomy-report-header">
          <div>
            <h3>รายงานเทียบ taxonomy ล่าสุด</h3>
            <p>
              เทียบ workbook กับ live product export ตามกติกา column C only เพื่อดูความพร้อมก่อนใช้จริง
            </p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loadingReport}
          >
            {loadingReport ? "กำลังโหลด..." : "รีโหลดรายงาน"}
          </button>
        </div>

        {reportError && <p className="notice error compact">รายงาน: {reportError}</p>}
        {previewError && <p className="notice error compact">Preview: {previewError}</p>}
        {applyMessage && <p className="notice success compact">{applyMessage}</p>}

        {matchReport ? (
          <>
            <div className="taxonomy-report-meta">
              <span>ไฟล์รายงาน: {matchReport.fileName}</span>
              <span>สร้างเมื่อ: {formatDateTime(matchReport.generatedAt)}</span>
              <span>Workbook: {compactFileName(matchReport.args?.workbookFile)}</span>
              <span>Live source: {compactFileName(matchReport.args?.liveFile)}</span>
            </div>

            <div className="taxonomy-report-metrics">
              <article className="taxonomy-report-metric">
                <span>Live rows</span>
                <strong>{formatNumber(reportSummary?.totalLiveRowsExamined || 0)}</strong>
                {reportStats?.liveCodeStats ? (
                  <small>{formatNumber(reportStats.liveCodeStats.uniqueValues || 0)} unique codes</small>
                ) : null}
              </article>
              <article className="taxonomy-report-metric">
                <span>Workbook rows</span>
                <strong>{formatNumber(reportSummary?.totalWorkbookRowsExamined || 0)}</strong>
                {reportStats?.workbookCodeStats ? (
                  <small>{formatNumber(reportStats.workbookCodeStats.uniqueValues || 0)} unique C codes</small>
                ) : null}
              </article>
              <article className="taxonomy-report-metric">
                <span>Exact code</span>
                <strong>{formatNumber(reportSummary?.exactCodeMatches || 0)}</strong>
              </article>
              <article className="taxonomy-report-metric">
                <span>Barcode</span>
                <strong>{formatNumber(reportSummary?.barcodeMatches || 0)}</strong>
              </article>
              <article className="taxonomy-report-metric">
                <span>Unmatched live</span>
                <strong>{formatNumber(reportSummary?.unmatchedLiveRows || 0)}</strong>
              </article>
              <article className="taxonomy-report-metric">
                <span>Conflicts</span>
                <strong>{formatNumber(reportSummary?.conflictRows || 0)}</strong>
              </article>
            </div>

            <div className="taxonomy-report-source-status">
              <span className={`status ${
                Number(matchReport.backendEvidence?.productsRows || 0) > 0 &&
                Number(matchReport.backendEvidence?.branchStockSnapshotRows || 0) > 0
                  ? "good"
                  : "warning"
              }`}>
                {Number(matchReport.backendEvidence?.productsRows || 0) > 0 &&
                Number(matchReport.backendEvidence?.branchStockSnapshotRows || 0) > 0
                  ? "ใช้ backend source"
                  : "ใช้ file-backed fallback"}
              </span>
              <span className="meta-line">
                products={formatNumber(matchReport.backendEvidence?.productsRows || 0)} ·
                branch_stock_snapshots={formatNumber(matchReport.backendEvidence?.branchStockSnapshotRows || 0)}
              </span>
            </div>

            {matchPreview ? (
              <>
                <div className="taxonomy-report-metrics taxonomy-report-preview-metrics">
                  <article className="taxonomy-report-metric">
                    <span>Safe to apply</span>
                    <strong>{formatNumber(previewSummary?.safeToApply || 0)}</strong>
                  </article>
                  <article className="taxonomy-report-metric">
                    <span>Category conflict</span>
                    <strong>{formatNumber(previewSummary?.category_conflict || 0)}</strong>
                  </article>
                  <article className="taxonomy-report-metric">
                    <span>Already confirmed</span>
                    <strong>{formatNumber(previewSummary?.already_confirmed || 0)}</strong>
                  </article>
                  <article className="taxonomy-report-metric">
                    <span>Needs review</span>
                    <strong>{formatNumber(previewSummary?.needs_review || 0)}</strong>
                  </article>
                </div>

                <div className="taxonomy-report-header taxonomy-report-preview-header">
                  <div>
                    <h3>Preview ก่อน apply</h3>
                    <p>ใช้ exact code match เพื่อสร้าง category overlay แบบปลอดภัยก่อนแตะ source data จริง</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleApplySafeMatches}
                    disabled={applyingPreview || loadingPreview || !csrfToken}
                  >
                    {applyingPreview ? "กำลัง apply..." : "Apply safe exact matches"}
                  </button>
                </div>

                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Current</th>
                        <th>Proposed</th>
                        <th>Safe</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchPreview.records || []).map((row) => (
                        <tr key={`${row.productCode}-${row.workbookRowNumber}`}>
                          <td>{row.productCode}</td>
                          <td>{row.currentCategory || "-"}</td>
                          <td>{row.proposedCategory || "-"}</td>
                          <td>{row.safeToApply ? "yes" : "no"}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <div className="taxonomy-report-grid">
              <details className="taxonomy-report-section" open>
                <summary>ตัวอย่าง exact code match</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Live code</th>
                        <th>Workbook C</th>
                        <th>ชื่อสินค้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.exactCodeMatches || []).slice(0, 5).map((row) => (
                        <tr key={`${row.liveProductCode}-${row.workbookRowNumber}`}>
                          <td>{row.liveProductCode}</td>
                          <td>{row.workbookProductCode}</td>
                          <td>{row.liveProductNameThai || row.workbookProductNameThai || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details className="taxonomy-report-section">
                <summary>ตัวอย่าง unmatched live</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Live code</th>
                        <th>Barcode</th>
                        <th>ชื่อสินค้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.unmatchedLiveRows || []).slice(0, 5).map((row) => (
                        <tr key={`${row.liveProductCode}-${row.liveRowNumber}`}>
                          <td>{row.liveProductCode}</td>
                          <td>{row.liveBarcode || "-"}</td>
                          <td>{row.liveProductNameThai || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details className="taxonomy-report-section">
                <summary>ตัวอย่าง unmatched workbook</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Workbook C</th>
                        <th>Barcode</th>
                        <th>ชื่อสินค้า</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.unmatchedWorkbookRows || []).slice(0, 5).map((row) => (
                        <tr key={`${row.workbookProductCode}-${row.workbookRowNumber}`}>
                          <td>{row.workbookProductCode}</td>
                          <td>{row.workbookBarcode || "-"}</td>
                          <td>{row.workbookProductNameThai || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details className="taxonomy-report-section">
                <summary>ตัวอย่าง conflict</summary>
                <div className="table-wrap taxonomy-mini-table-wrap">
                  <table className="taxonomy-mini-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Value</th>
                        <th>Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matchReport.samples?.conflicts || []).slice(0, 5).map((row, index) => (
                        <tr key={`${row.type}-${row.value}-${row.productCode || index}`}>
                          <td>{row.type}</td>
                          <td>{row.value || "-"}</td>
                          <td>{row.productCode || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </>
        ) : null}
        </div>
        )}
      </section>
      ) : null}

      {error && <p className="notice error compact">เชื่อมต่อไม่ได้: {error}</p>}
      {!loading && !error && !records.length && (
        <p className="empty-state">ไม่พบข้อมูลสต็อกสาขาตามเงื่อนไขที่ค้นหา</p>
      )}

      {requestMode && loadingRecommendationPriority ? (
        <p className="branch-stock-priority-loading" role="status">กำลังจัดลำดับตามคำแนะนำ...</p>
      ) : null}
      {requestMode && recommendationPriorityActive ? (
        <div className="branch-stock-priority-legend" aria-label="สีลำดับคำแนะนำสินค้า">
          <span className="priority-purchase">ต้องสั่งซื้อเพิ่ม</span>
          <span className="priority-transfer">ขอสาขาอื่น</span>
          <span className="priority-no-action">ยังไม่ต้องสั่งเพิ่ม</span>
          <small>เรียงจำนวนที่ต้องการจากมากไปน้อยในแต่ละกลุ่ม</small>
        </div>
      ) : null}

      <div className="branch-stock-loading-wrap">
        {loading && (
          <div className="branch-stock-loading-overlay" aria-live="polite" aria-label="กำลังโหลดข้อมูล">
            <div className="branch-stock-spinner" />
            <span>กำลังโหลดข้อมูลสต็อกสาขา...</span>
          </div>
        )}
      <div className="table-wrap">
        <table className={`branch-stock-table${requestMode ? " request-mode" : ""}`}>
          <thead>
            <tr>
              {requestMode ? <th className="branch-stock-request-column">#</th> : null}
              {visibleBranchStockColumns.map((column) => {
                const optionValues = columnOptions[column.key] || [];
                const appliedValues = columnFilters[column.key] ? [...columnFilters[column.key]] : optionValues;
                const activeValues =
                  openFilterKey === column.key ? pendingFilterValues : appliedValues;
                const allSelected = activeValues.length === optionValues.length;
                const hasActiveFilter = Object.prototype.hasOwnProperty.call(columnFilters, column.key);
                const filteredOptions = optionValues.filter((value) =>
                  normalizeFilterValue(value).toLowerCase().includes(filterSearchTerm.trim().toLowerCase()),
                );

                return (
                  <th key={column.key} data-column-key={column.key}>
                    <div className="branch-stock-header-cell">
                      <span>{column.label}</span>
                      <button
                        type="button"
                        className={`branch-stock-filter-button ${openFilterKey === column.key ? "active" : ""} ${
                          hasActiveFilter ? "filtered" : ""
                        }`}
                        onClick={(e) => openColumnFilter(column.key, e)}
                        aria-label={`Sort and filter ${column.label}`}
                      >
                        ▾
                      </button>
                    </div>

                    {openFilterKey === column.key ? (
                      <div
                        className="branch-stock-filter-menu"
                        ref={filterMenuRef}
                        style={filterMenuAnchor ? { top: filterMenuAnchor.top, right: filterMenuAnchor.right } : undefined}
                      >
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => updateColumnSort(column.key, "asc")}
                        >
                          Sort A to Z
                        </button>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => updateColumnSort(column.key, "desc")}
                        >
                          Sort Z to A
                        </button>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => {
                            clearColumnFilter(column.key);
                            setOpenFilterKey("");
                          }}
                          disabled={!hasActiveFilter}
                        >
                          Clear Filter
                        </button>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => deselectAllColumnFilterValues()}
                          disabled={activeValues.length === 0}
                        >
                          Deselect All
                        </button>
                        <input
                          type="search"
                          value={filterSearchTerm}
                          onChange={(event) => setFilterSearchTerm(event.target.value)}
                          placeholder="Search"
                          className="branch-stock-filter-search"
                        />
                        <div className="branch-stock-filter-options">
                          <label className="branch-stock-filter-option">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleAllColumnFilterValues(optionValues)}
                            />
                            <span>(Select All)</span>
                          </label>
                          {filteredOptions.map((value) => (
                            <label key={`${column.key}-${value || "blank"}`} className="branch-stock-filter-option">
                              <input
                                type="checkbox"
                                checked={activeValues.includes(value)}
                                onChange={() => toggleColumnFilterValue(value)}
                              />
                              <span>{value || "(Blank)"}</span>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="branch-stock-filter-action"
                          onClick={() => applyColumnFilter(column.key, optionValues)}
                        >
                          OK
                        </button>
                      </div>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRecords.map((row) => (
              <tr
                key={row.productCode}
                className={requestMode && recommendationPriorityActive
                  ? getRecommendationPriorityRowClass(row, recommendationPriorityMap)
                  : undefined}
              >
                {requestMode ? (
                  <td className="branch-stock-request-column">
                    {getAdminAlertTarget(row).length > 0 ? (
                      <button
                        type="button"
                        className="branch-stock-request-plus stockout"
                        onClick={() => openRequestDialogForRow(row)}
                        aria-label={`แจ้งสินค้าหมด ${row.productCode}`}
                      >
                        ยาหมด สั่งยาเพิ่ม
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="branch-stock-request-plus"
                        onClick={() => openRequestDialogForRow(row)}
                        disabled={!canRequestProduct(row)}
                        aria-label={`เพิ่มคำขอสินค้า ${row.productCode}`}
                      >
                        +
                      </button>
                    )}
                  </td>
                ) : null}
                {visibleBranchStockColumns.map((column) => (
                  <td key={`${row.productCode}-${column.key}`} data-column-key={column.key}>
                    {renderBranchStockCell(row, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </div>

      {isAdminUser && columnEditorOpen ? (
        <div
          className="dialog-overlay"
          onClick={() => {
            if (!columnEditorBusyAction) setColumnEditorOpen(false);
          }}
        >
          <div
            className="dialog-card branch-stock-column-editor"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-stock-column-editor-title"
          >
            <div className="dialog-header">
              <div>
                <h3 id="branch-stock-column-editor-title">จัดลำดับคอลัมน์</h3>
                <p>ลากรายการ หรือใช้ปุ่มขึ้น/ลง แล้วกดบันทึก ลำดับนี้ใช้เฉพาะบัญชี {userId}</p>
              </div>
              <button
                type="button"
                className="ghost-button dialog-close-button branch-stock-column-close-button"
                onClick={() => setColumnEditorOpen(false)}
                disabled={Boolean(columnEditorBusyAction)}
              >
                ปิด
              </button>
            </div>

            <ol className="branch-stock-column-list">
              {draftBranchStockColumns.map((column, index) => (
                <li
                  key={column.key}
                  ref={(row) => {
                    if (row) columnEditorRowRefs.current.set(column.key, row);
                    else columnEditorRowRefs.current.delete(column.key);
                  }}
                  className={draggedColumnKey === column.key ? "dragging" : ""}
                  draggable={!columnEditorBusyAction}
                  onDragStart={() => setDraggedColumnKey(column.key)}
                  onDragEnd={() => setDraggedColumnKey("")}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedColumnKey) return;
                    setDraftColumnOrder((current) => reorderBranchStockColumn(current, draggedColumnKey, column.key));
                    setDraggedColumnKey("");
                  }}
                >
                  <span className="branch-stock-column-drag" aria-hidden="true">⋮⋮</span>
                  <span className="branch-stock-column-position">{index + 1}</span>
                  <strong>{column.label}</strong>
                  <div className="branch-stock-column-move-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => moveColumnEditorRow(column.key, -1)}
                      disabled={Boolean(columnEditorBusyAction) || index === 0}
                      aria-label={`ย้าย ${column.label} ขึ้น`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => moveColumnEditorRow(column.key, 1)}
                      disabled={Boolean(columnEditorBusyAction) || index === draftBranchStockColumns.length - 1}
                      aria-label={`ย้าย ${column.label} ลง`}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            <div className="dialog-actions branch-stock-column-editor-actions">
              <button
                type="button"
                className="ghost-button branch-stock-column-reset-button"
                onClick={resetColumnEditorToDefault}
                disabled={Boolean(columnEditorBusyAction)}
              >
                คืนค่าเริ่มต้น
              </button>
              <div>
                <button
                  type="button"
                  className="ghost-button branch-stock-column-cancel-button"
                  onClick={() => setColumnEditorOpen(false)}
                  disabled={Boolean(columnEditorBusyAction)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={saveColumnEditor}
                  disabled={Boolean(columnEditorBusyAction)}
                >
                  บันทึกลำดับ
                </button>
              </div>
            </div>

            {columnEditorBusyAction ? (
              <div className="branch-stock-column-loading-overlay" role="status" aria-live="polite" aria-atomic="true">
                <span className="branch-stock-column-loading-spinner" aria-hidden="true" />
                <strong>
                  {columnEditorBusyAction === "resetting"
                    ? "กำลังคืนค่าลำดับเริ่มต้น..."
                    : "กำลังบันทึกลำดับคอลัมน์..."}
                </strong>
                <span>โปรดรอสักครู่</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && !error && records.length > 0 && pagedRecords.length === 0 && (
        <p className="empty-state">ไม่พบข้อมูลหลังใช้ตัวกรองที่หัวตาราง</p>
      )}

      <div className="pagination">
        <p className="pagination-info">
          {total === 0
            ? "0 รายการ"
            : `${formatNumber(start)}-${formatNumber(end)} จาก ${formatNumber(total)} รายการ`}
        </p>
        <div className="pagination-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={loading || currentPage <= 1}
            onClick={() => setOffset((current) => Math.max(0, current - pageSize))}
          >
            ก่อนหน้า
          </button>
          <span className="receipt-page-indicator">
            หน้า {formatNumber(currentPage)} / {formatNumber(totalPages)}
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={loading || currentPage >= totalPages}
            onClick={() => setOffset((current) => Math.min(Math.max(0, total - 1), current + pageSize))}
          >
            ถัดไป
          </button>
        </div>
      </div>

      {exportModalOpen && (
        <div className="dialog-overlay" onClick={() => !exporting && setExportModalOpen(false)}>
          <div
            className="dialog-card export-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-export-title"
          >
            <div className="dialog-header">
              <div>
                <h3 id="branch-export-title">ส่งออก Excel แยกตามสาขา</h3>
                <p>เลือกสาขาที่ต้องการดาวน์โหลดเพื่อให้ไฟล์แสดงเฉพาะยอดของสาขานั้น</p>
              </div>
              <button
                type="button"
                className="ghost-button dialog-close-button"
                onClick={() => setExportModalOpen(false)}
                disabled={exporting}
              >
                ปิด
              </button>
            </div>

            <div className="export-branch-grid">
              {branchExportOptions.map((option) => (
                <button
                  key={option.branchCode}
                  type="button"
                  className={`export-branch-option${selectedExportBranch === option.branchCode ? " active" : ""}`}
                  onClick={() => setSelectedExportBranch(option.branchCode)}
                  disabled={exporting}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            {exportError && <p className="notice error compact">{exportError}</p>}

            <div className="dialog-actions">
              <button
                type="button"
                className="excel-export-button export-cancel-button"
                onClick={() => setExportModalOpen(false)}
                disabled={exporting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="excel-export-button"
                onClick={handleExportExcel}
                disabled={exporting}
              >
                {exporting ? "กำลังสร้างไฟล์..." : selectedExportBranch === "all" ? "ดาวน์โหลดทั้งหมด" : `ดาวน์โหลด ${selectedExportBranch}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestDialogProduct ? (() => {
        const totalRequestedQty = Object.values(requestQuantities).reduce(
          (sum, v) => sum + (Number(v) || 0), 0
        );
        const currentBranchStockQty = branchCode
          ? getBranchStockQty(requestDialogProduct, branchCode)
          : 0;
        const requestTargets = getRequestTargets(requestDialogProduct);
        const isAdminAlertOnlyMode =
          requestTargets.length > 0 && requestTargets.every((target) => target.requestMode === "ADMIN_ALERT");
        return (
          <div className="rq-overlay" onClick={closeRequestDialog}>
            <div
              className={isAdminAlertOnlyMode ? "rq-dialog stockout" : "rq-dialog"}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="rq-dialog-title"
            >
              {/* Product info header */}
              <div className="rq-dialog-header">
                <div className="rq-dialog-product-info" id="rq-dialog-title">
                  <span className="rq-product-code">{requestDialogProduct.productCode}</span>
                  {requestDialogProduct.productNameThai ? (
                    <span className="rq-product-name-th">{requestDialogProduct.productNameThai}</span>
                  ) : null}
                  {requestDialogProduct.productNameEng ? (
                    <span className="rq-product-name-en">{requestDialogProduct.productNameEng}</span>
                  ) : null}
                  {requestDialogProduct.barcode ? (
                    <span className="rq-product-meta">บาร์โค้ด: {requestDialogProduct.barcode}</span>
                  ) : null}
                  {requestDialogProduct.category ? (
                    <span className="rq-product-meta">หมวด: {requestDialogProduct.category}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rq-close-btn"
                  onClick={closeRequestDialog}
                  aria-label="ปิด"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="rq-dialog-body">
                {/* Branch rows */}
                <div className="rq-branch-table">
                  <div className="rq-branch-table-head">
                    <span>สาขา</span>
                    <span>คงเหลือ</span>
                    <span>จำนวนที่ขอ</span>
                    <span>หน่วย</span>
                  </div>
                  {requestTargets.map((branch) => {
                    const stockQty = getBranchStockQty(requestDialogProduct, branch.branchCode);
                    const reqQty = Number(requestQuantities[branch.branchCode] || 0);
                    return (
                      <div
                        key={`${branch.branchCode}-${branch.requestMode || "STANDARD"}`}
                        className={`rq-branch-row${branch.requestMode === "ADMIN_ALERT" ? " admin-alert" : ""}`}
                      >
                        <span className="rq-branch-name">
                          {BRANCH_LABELS[branch.branchCode] || `สาขา ${branch.branchCode}`}
                        </span>
                        <span className="rq-branch-stock">
                          {branch.requestMode === "ADMIN_ALERT" ? "แจ้ง admin" : formatNumber(stockQty, 2)}
                        </span>
                        <div className="rq-qty-stepper">
                          <button
                            type="button"
                            className="rq-qty-btn rq-qty-minus"
                            onClick={() =>
                              setRequestQuantities((c) => ({
                                ...c,
                                [branch.branchCode]: Math.max(0, Number(c[branch.branchCode] || 0) - 1),
                              }))
                            }
                            disabled={reqQty <= 0}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            className="rq-qty-input"
                            min="0"
                            step="1"
                            value={requestQuantities[branch.branchCode] ?? ""}
                            onChange={(event) =>
                              setRequestQuantities((c) => ({
                                ...c,
                                [branch.branchCode]: event.target.value,
                              }))
                            }
                            placeholder="0"
                          />
                          <button
                            type="button"
                            className="rq-qty-btn rq-qty-plus"
                            onClick={() =>
                              setRequestQuantities((c) => ({
                                ...c,
                                [branch.branchCode]: Number(c[branch.branchCode] || 0) + 1,
                              }))
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="rq-branch-unit">{requestDialogProduct.unit || "-"}</span>
                      </div>
                    );
                  })}
                  {/* Procurement toggle button */}
                  <button
                    type="button"
                    className={`rq-procurement-toggle${procurementRowOpen ? " active" : ""}`}
                    onClick={() => { setProcurementRowOpen((v) => !v); setProcurementQty(""); }}
                  >
                    {procurementRowOpen ? "✕ ยกเลิกแจ้งจัดซื้อเพิ่ม" : "📋 แจ้งจัดซื้อเพิ่มด้วย"}
                  </button>
                  {procurementRowOpen ? (
                    <div className="rq-branch-row rq-procurement-row">
                      <span className="rq-branch-name">จัดซื้อ / HQ</span>
                      <span className="rq-branch-stock">—</span>
                      <div className="rq-qty-stepper">
                        <button
                          type="button"
                          className="rq-qty-btn rq-qty-minus"
                          onClick={() => setProcurementQty((v) => String(Math.max(0, Number(v || 0) - 1)))}
                          disabled={Number(procurementQty || 0) <= 0}
                        >−</button>
                        <input
                          type="number"
                          className="rq-qty-input"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={procurementQty}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || (/^\d+$/.test(v) && Number(v) >= 0)) setProcurementQty(v);
                          }}
                        />
                        <button
                          type="button"
                          className="rq-qty-btn rq-qty-plus"
                          onClick={() => setProcurementQty((v) => String(Number(v || 0) + 1))}
                        >+</button>
                      </div>
                      <span className="rq-branch-unit">{requestDialogProduct.unit || "-"}</span>
                    </div>
                  ) : null}
                  <BranchStockRecommendationSuggestion
                    branchCode={branchCode}
                    productCode={requestDialogProduct.productCode}
                    request={apiFetch}
                  />
                </div>
                {/* Summary panel */}
                <div className="rq-dialog-summary" aria-label="สรุปคำขอสินค้า">
                  <div className="rq-summary-table">
                    <div className="rq-dialog-summary-row rq-summary-branch-row">
                      <div className="rq-dialog-summary-cell">
                        <span className="rq-summary-label">สาขา</span>
                      </div>
                      <div className="rq-dialog-summary-cell">
                        <span className="rq-summary-val" title={branchCode || "-"}>
                          {branchCode || "-"}
                        </span>
                      </div>
                    </div>
                    <div className="rq-dialog-summary-row rq-summary-stock-row">
                      <div className="rq-dialog-summary-cell">
                        <span className="rq-summary-label" title={`ที่ ${branchCode || "-"} มีอยู่ตอนนี้`}>
                          ที่ {branchCode || "-"} มีอยู่ตอนนี้
                        </span>
                      </div>
                      <div className="rq-dialog-summary-cell rq-summary-stock-value">
                        <span className="rq-summary-stock-num">{formatNumber(currentBranchStockQty, 0)}</span>
                        <span className="rq-summary-stock-unit">{requestDialogProduct.unit || "-"}</span>
                      </div>
                    </div>
                    <div className="rq-dialog-summary-row rq-summary-total-label-row">
                      <div className="rq-dialog-summary-cell">
                        <span className="rq-summary-label">จำนวนที่ขอเพิ่มจากสาขาต่างๆ รวมทั้งหมด</span>
                      </div>
                    </div>
                    <div className="rq-dialog-summary-row rq-summary-total-row">
                      <div className="rq-dialog-summary-cell rq-summary-total-value">
                        <span className="rq-total-num">{totalRequestedQty}</span>
                        <span className="rq-summary-total-unit">{requestDialogProduct.unit || "-"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {requestDialogError ? (
                <p className="notice error compact" style={{ margin: "0 20px" }}>{requestDialogError}</p>
              ) : null}

              {/* Footer */}
              <div className="rq-dialog-footer">
                <button type="button" className="rq-btn-confirm" onClick={(e) => handleAddDraftItem(e)}>
                  {isAdminAlertOnlyMode ? "ใส่ตะกร้า แจ้งจัดซื้อ" : "ยืนยันใส่ตะกร้า"}
                </button>
                <button type="button" className="rq-btn-cancel" onClick={closeRequestDialog}>
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}


      {flyDots.map((dot) => (
        <div
          key={dot.id}
          className="fly-dot flying"
          style={{ left: dot.x, top: dot.y, "--tx": `${dot.tx}px`, "--ty": `${dot.ty}px` }}
        />
      ))}
    </section>
  );
}
