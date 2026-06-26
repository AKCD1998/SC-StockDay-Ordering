import { useState, useEffect, useMemo, Fragment } from "react";

// ── Utilities (mirror of App.jsx helpers; kept local to avoid App.jsx exports) ──

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatBranchOptionLabel(branch) {
  const code = String(branch?.branchCode || "").trim();
  const name = String(branch?.branchName || "").trim();
  if (!code) return name || "-";
  if (!name || name === code) return `สาขา ${code}`;
  return `${code} - ${name}`;
}

function parsePastedProductCodes(value) {
  const seen = new Set();
  const duplicates = [];
  const skipped = [];
  const productCodes = [];
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((code) => {
      if (!code || code.toUpperCase() === "#N/A") {
        if (code) skipped.push(code);
        return;
      }
      if (seen.has(code)) { duplicates.push(code); return; }
      seen.add(code);
      productCodes.push(code);
    });
  return { productCodes, duplicates, skipped };
}

// Extended to handle both summary and transaction-level types
function movementTypeLabel(type) {
  const labels = {
    transfer_in: "รับโอนเข้า",
    transfer_out: "โอนออก",
    supplier_receipt: "ซื้อ Supplier",
    sales_summary: "ยอดขายรวม",
    sale_receipt: "ขายรายบิล",
    sale_return: "คืนสินค้า",
  };
  return labels[type] || type || "-";
}

function movementTypeClass(type) {
  const classes = {
    transfer_in: "good",
    transfer_out: "warning",
    supplier_receipt: "muted",
    sales_summary: "danger",
    sale_receipt: "danger",
    sale_return: "info",
  };
  return classes[type] || "muted";
}

function toggleArrayValue(setter, value) {
  setter((current) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  );
}

// ── Data contracts (pending backend implementation) ───────────────────────────
//
// TRANSACTIONS ENDPOINT — PENDING BACKEND:
//   GET /api/admin/movement-transactions
//   Query params:
//     branch_code   — e.g. "005"
//     date_from     — "YYYY-MM-DD"
//     date_to       — "YYYY-MM-DD"
//     types         — comma-separated: "transfer_in,transfer_out,supplier_receipt,sale_receipt,sale_return"
//     product_code  — optional product code filter
//     doc_search    — optional document number substring
//     limit         — default 100
//     offset        — default 0
//   Response:
//   {
//     transactions: [{
//       event_id: string,
//       event_date: "YYYY-MM-DD",
//       event_type: "sale_receipt" | "transfer_in" | "transfer_out" | "supplier_receipt" | "sale_return",
//       document_no: string,
//       source_table: string,           // e.g. "TSHD001", "TRF_HEADER"
//       branch_from: string | null,
//       branch_to: string | null,
//       warehouse_code: string | null,
//       product_code: string,
//       product_name: string,
//       qty: number,
//       unit: string,
//       unit_price: number | null,
//       amount: number | null,
//       pos_code: string | null,
//       notes: string | null
//     }],
//     total: number,
//     offset: number,
//     limit: number
//   }
//
// DOCUMENTS ENDPOINT — PENDING BACKEND:
//   GET /api/admin/movement-documents
//   Query params: branch_code, date_from, date_to, types, doc_search, limit, offset
//   Response:
//   {
//     documents: [{
//       document_no: string,
//       document_type: "sale_receipt" | "transfer_in" | "transfer_out" | "supplier_receipt" | "sale_return",
//       document_date: "YYYY-MM-DD",
//       branch_code: string,
//       pos_code: string | null,
//       item_count: number,
//       total_amount: number | null,
//       status: "completed" | "void" | "hold",
//       items: null   // null until drilldown; fetched separately
//     }],
//     total: number
//   }
//   GET /api/admin/movement-documents/:document_no/items
//   Response: { items: [{ product_code, product_name, qty, unit, unit_price, amount }] }
//
// ─────────────────────────────────────────────────────────────────────────────

const SUMMARY_MOVEMENT_TYPES = ["transfer_in", "transfer_out", "supplier_receipt", "sales_summary"];
const LEDGER_MOVEMENT_TYPES = ["transfer_in", "transfer_out", "supplier_receipt", "sale_receipt", "sale_return"];

// ── Main component ────────────────────────────────────────────────────────────

export default function MovementAndTransactionsPanel({ branchCode, csrfToken }) {
  // Shared filter state
  const [selectedBranch, setSelectedBranch] = useState(branchCode || "005");
  const [dateFrom, setDateFrom] = useState(daysAgoIsoDate(30));
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [movementTypes, setMovementTypes] = useState([...SUMMARY_MOVEMENT_TYPES]);
  const [docSearch, setDocSearch] = useState("");

  const [activeTab, setActiveTab] = useState("summary");
  const [options, setOptions] = useState({ categories: [], brands: [], branches: [] });

  useEffect(() => {
    let active = true;
    apiFetch("/api/admin/product-movement-options").then(async (res) => {
      if (!res.ok || !active) return;
      const data = await res.json();
      if (active) setOptions(data);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function switchTab(tab) {
    setActiveTab(tab);
    if (tab === "summary") setMovementTypes([...SUMMARY_MOVEMENT_TYPES]);
    else setMovementTypes([...LEDGER_MOVEMENT_TYPES]);
  }

  const activeTypes = activeTab === "summary" ? SUMMARY_MOVEMENT_TYPES : LEDGER_MOVEMENT_TYPES;

  return (
    <section className="panel movement-panel">
      <div className="panel-header stacked">
        <div>
          <p className="eyebrow">Movement &amp; Transactions</p>
          <h2>การเคลื่อนไหวสินค้า</h2>
          <p>สรุปยอดรวม · ตรวจ transaction รายบิล · เปิดเอกสาร</p>
        </div>
      </div>

      {/* ── Shared filter bar ─────────────────────────────────────────── */}
      <div className="mvt-filter-bar">
        <label className="mvt-filter-field">
          <span>สาขา</span>
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
            <option value="">ทุกสาขา</option>
            {options.branches.map((b) => (
              <option key={b.branchCode} value={b.branchCode}>{formatBranchOptionLabel(b)}</option>
            ))}
          </select>
        </label>
        <label className="mvt-filter-field">
          <span>จากวันที่</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="mvt-filter-field">
          <span>ถึงวันที่</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {activeTab !== "summary" && (
          <label className="mvt-filter-field mvt-filter-grow">
            <span>ค้นหาสินค้า / เลขเอกสาร</span>
            <input
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder="ชื่อสินค้า รหัส IC- หรือเลขเอกสาร"
            />
          </label>
        )}
      </div>

      {/* Movement type toggles */}
      <div className="movement-type-row mvt-type-row">
        {activeTypes.map((type) => (
          <label key={type} className="movement-checkbox">
            <input
              type="checkbox"
              checked={movementTypes.includes(type)}
              onChange={() => toggleArrayValue(setMovementTypes, type)}
            />
            {movementTypeLabel(type)}
          </label>
        ))}
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="mvt-tab-bar" role="tablist">
        {[
          { key: "summary", label: "Summary — ยอดรวม" },
          { key: "transactions", label: "Transactions — รายการ" },
          { key: "documents", label: "Documents — เอกสาร" },
        ].map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={activeTab === key}
            className={`mvt-tab${activeTab === key ? " active" : ""}`}
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      {activeTab === "summary" && (
        <SummaryTab
          options={options}
          selectedBranch={selectedBranch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          movementTypes={movementTypes}
          csrfToken={csrfToken}
        />
      )}
      {activeTab === "transactions" && (
        <TransactionsTab
          selectedBranch={selectedBranch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          movementTypes={movementTypes}
          docSearch={docSearch}
        />
      )}
      {activeTab === "documents" && (
        <DocumentsTab
          selectedBranch={selectedBranch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          movementTypes={movementTypes}
          docSearch={docSearch}
        />
      )}
    </section>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────
// Preserves all existing ProductMovementTracePanel functionality.
// Branch, dates, and movement types are now inherited from parent's shared filters.

function SummaryTab({ options, selectedBranch, dateFrom, dateTo, movementTypes, csrfToken }) {
  const [pasteText, setPasteText] = useState("");
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [result, setResult] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const pasteStats = useMemo(() => parsePastedProductCodes(pasteText), [pasteText]);

  useEffect(() => {
    let active = true;
    apiFetch("/api/admin/product-movement-groups").then(async (res) => {
      if (!res.ok || !active) return;
      const data = await res.json();
      if (active) setGroups(data.groups || []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return undefined; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) setSearchResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 260);
    return () => { active = false; window.clearTimeout(timer); };
  }, [searchQuery]);

  function mergeCodes(codes) {
    setSelectedCodes((current) => {
      const seen = new Set(current);
      const next = [...current];
      codes.forEach((code) => { if (!seen.has(code)) { seen.add(code); next.push(code); } });
      return next;
    });
  }

  function removeCode(code) {
    setSelectedCodes((current) => current.filter((item) => item !== code));
  }

  async function runTrace() {
    setLoadingTrace(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/product-movement-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_codes: selectedCodes,
          saved_group_ids: selectedGroupIds,
          category_names: selectedCategories,
          brand_names: selectedBrands,
          branch_code: selectedBranch,
          date_from: dateFrom,
          date_to: dateTo,
          movement_types: movementTypes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "สืบค้นไม่สำเร็จ");
      setResult(data);
      setExpanded({});
    } catch (err) {
      setError(err.message || "สืบค้นการเคลื่อนไหวไม่สำเร็จ");
    } finally {
      setLoadingTrace(false);
    }
  }

  async function saveCurrentGroup() {
    setSavingGroup(true);
    setError("");
    try {
      const path = editingGroupId
        ? `/api/admin/product-movement-groups/${editingGroupId}`
        : "/api/admin/product-movement-groups";
      const res = await apiFetch(path, {
        method: editingGroupId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({ name: groupName, description: groupDescription, product_codes: selectedCodes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "บันทึกกลุ่มไม่สำเร็จ");
      const groupsRes = await apiFetch("/api/admin/product-movement-groups");
      const groupsData = await groupsRes.json();
      setGroups(groupsData.groups || []);
      setGroupName(""); setGroupDescription(""); setEditingGroupId("");
    } catch (err) {
      setError(err.message || "บันทึกกลุ่มไม่สำเร็จ");
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteEditingGroup() {
    if (!editingGroupId) return;
    setSavingGroup(true);
    setError("");
    try {
      const res = await apiFetch(`/api/admin/product-movement-groups/${editingGroupId}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": csrfToken || "" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "ลบกลุ่มไม่สำเร็จ");
      const groupsRes = await apiFetch("/api/admin/product-movement-groups");
      const groupsData = await groupsRes.json();
      setGroups(groupsData.groups || []);
      setSelectedGroupIds((c) => c.filter((id) => String(id) !== String(editingGroupId)));
      setEditingGroupId(""); setGroupName(""); setGroupDescription("");
    } catch (err) {
      setError(err.message || "ลบกลุ่มไม่สำเร็จ");
    } finally {
      setSavingGroup(false);
    }
  }

  const products = result?.products || [];
  const totalSummary = products.reduce((s, p) => {
    s.transferIn += Number(p.summary?.transfer_in_qty || 0);
    s.transferOut += Number(p.summary?.transfer_out_qty || 0);
    s.supplierReceipt += Number(p.summary?.supplier_receipt_qty || 0);
    s.sold += Number(p.summary?.sold_qty_base || 0);
    s.net += Number(p.summary?.net_movement_qty || 0);
    return s;
  }, { transferIn: 0, transferOut: 0, supplierReceipt: 0, sold: 0, net: 0 });

  return (
    <div className="movement-layout">
      {/* Left sidebar — product selection */}
      <section className="movement-controls">
        <div className="movement-control-block">
          <label>
            Paste รหัสสินค้า จาก Excel คอลัมน์เดียว
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={7}
              placeholder={"IC-002833\nIC-000193\n#N/A\nIC-003501"}
            />
          </label>
          <div className="movement-inline-actions">
            <button type="button" className="primary-button" onClick={() => mergeCodes(pasteStats.productCodes)}>
              เพิ่มจาก Paste
            </button>
            <span className="meta-line">
              {pasteStats.productCodes.length} รายการ
              {pasteStats.duplicates.length ? ` · ซ้ำ ${pasteStats.duplicates.length}` : ""}
            </span>
          </div>
        </div>

        <div className="movement-control-block">
          <label>
            Search-add สินค้า
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นรหัสสินค้า ชื่อสินค้า หรือ barcode"
            />
          </label>
          <div className="movement-search-results">
            {searching ? <p className="meta-line">กำลังค้นหา...</p> : null}
            {searchResults.map((item) => (
              <button key={item.productCode} type="button" className="movement-search-item" onClick={() => mergeCodes([item.productCode])}>
                <strong>{item.productCode}</strong>
                <span>{item.productName}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="movement-control-block">
          <label>
            Category
            <select value="" onChange={(e) => e.target.value && toggleArrayValue(setSelectedCategories, e.target.value)}>
              <option value="">เลือกหมวดสินค้า</option>
              {(options.categories || []).map((cat) => (
                <option key={cat.name} value={cat.name}>{cat.name} ({cat.productCount})</option>
              ))}
            </select>
          </label>
          <label>
            Brand / Supplier Code
            <select value="" onChange={(e) => e.target.value && toggleArrayValue(setSelectedBrands, e.target.value)}>
              <option value="">เลือก brand/supplier</option>
              {(options.brands || []).map((brand) => (
                <option key={brand.name} value={brand.name}>{brand.name} ({brand.productCount})</option>
              ))}
            </select>
          </label>
        </div>

        <div className="movement-control-block">
          <label>
            Saved Groups
            <select value="" onChange={(e) => { const id = Number(e.target.value); if (id) toggleArrayValue(setSelectedGroupIds, id); }}>
              <option value="">เลือกกลุ่มสินค้า</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.productCodes.length})</option>)}
            </select>
          </label>
          <div className="movement-chip-list">
            {selectedGroupIds.map((id) => {
              const g = groups.find((item) => item.id === id);
              return (
                <button key={id} type="button" className="movement-chip" onClick={() => toggleArrayValue(setSelectedGroupIds, id)}>
                  {g?.name || id} ×
                </button>
              );
            })}
          </div>
        </div>

        <div className="movement-control-block">
          <label>
            แก้ไขกลุ่มเดิม หรือสร้างกลุ่มใหม่
            <select value={editingGroupId} onChange={(e) => {
              const nextId = e.target.value;
              setEditingGroupId(nextId);
              const g = groups.find((item) => String(item.id) === String(nextId));
              if (g) { setGroupName(g.name); setGroupDescription(g.description || ""); setSelectedCodes(g.productCodes || []); }
              else { setGroupName(""); setGroupDescription(""); }
            }}>
              <option value="">สร้างกลุ่มใหม่</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="ชื่อกลุ่ม เช่น ยาความดัน" />
          <input value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="คำอธิบาย optional" />
          <div className="movement-inline-actions">
            <button type="button" className="ghost-button" disabled={savingGroup || !groupName.trim() || selectedCodes.length === 0} onClick={saveCurrentGroup}>
              {savingGroup ? "กำลังบันทึก..." : editingGroupId ? "Update Group" : "Save Group"}
            </button>
            {editingGroupId ? (
              <button type="button" className="ghost-button" disabled={savingGroup} onClick={deleteEditingGroup}>Delete</button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Right — results */}
      <section className="movement-main">
        <div className="notice movement-warning">
          ยอดขายในแท็บนี้เป็นข้อมูลสรุปรวมตามช่วง ไม่ใช่รายบิล — ใช้แท็บ Transactions เพื่อดูรายการระดับ transaction
        </div>

        <div className="movement-chip-list">
          {selectedCodes.map((code) => (
            <button key={code} type="button" className="movement-chip" onClick={() => removeCode(code)}>{code} ×</button>
          ))}
          {selectedCategories.map((name) => (
            <button key={name} type="button" className="movement-chip movement-chip-category" onClick={() => toggleArrayValue(setSelectedCategories, name)}>{name} ×</button>
          ))}
          {selectedBrands.map((name) => (
            <button key={name} type="button" className="movement-chip movement-chip-brand" onClick={() => toggleArrayValue(setSelectedBrands, name)}>{name} ×</button>
          ))}
        </div>

        <div className="movement-actions">
          <button type="button" className="primary-button" onClick={runTrace} disabled={loadingTrace || movementTypes.length === 0}>
            {loadingTrace ? "กำลังสืบค้น..." : "สืบค้นข้อมูล"}
          </button>
          <span className="meta-line">เลือกสินค้า {selectedCodes.length} รายการ · groups {selectedGroupIds.length}</span>
        </div>

        {error ? <div className="notice error compact">{error}</div> : null}

        {result ? (
          <>
            <section className="kpis movement-kpis">
              <article className="kpi"><span>รับโอนเข้า</span><strong>{formatNumber(totalSummary.transferIn)}</strong></article>
              <article className="kpi"><span>โอนออก</span><strong>{formatNumber(totalSummary.transferOut)}</strong></article>
              <article className="kpi"><span>ซื้อ Supplier</span><strong>{formatNumber(totalSummary.supplierReceipt)}</strong></article>
              <article className="kpi"><span>ขายรวม</span><strong>{formatNumber(totalSummary.sold)}</strong></article>
              <article className="kpi"><span>Net movement</span><strong>{formatNumber(totalSummary.net)}</strong></article>
            </section>

            {(result.warnings || []).map((w) => (
              <div key={w} className="notice movement-warning">{w}</div>
            ))}

            <div className="table-wrap movement-table-wrap">
              <table className="movement-table">
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>รับโอนเข้า</th>
                    <th>โอนออก</th>
                    <th>ซื้อ Supplier</th>
                    <th>ขายรวม</th>
                    <th>Net</th>
                    <th>ล่าสุด</th>
                    <th>รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <Fragment key={product.product_code}>
                      <tr>
                        <td>
                          <strong>{product.product_name}</strong>
                          <div className="meta">{product.product_code} · {product.barcode || "ไม่มี barcode"}</div>
                        </td>
                        <td>{formatNumber(product.summary.transfer_in_qty)}</td>
                        <td>{formatNumber(product.summary.transfer_out_qty)}</td>
                        <td>{formatNumber(product.summary.supplier_receipt_qty)}</td>
                        <td>{formatNumber(product.summary.sold_qty_base)}</td>
                        <td>{formatNumber(product.summary.net_movement_qty)}</td>
                        <td>{product.last_movement_date || "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="ghost-button movement-expand-button"
                            onClick={() => setExpanded((c) => ({ ...c, [product.product_code]: !c[product.product_code] }))}
                          >
                            {expanded[product.product_code] ? "ซ่อน" : "ดู timeline"}
                          </button>
                        </td>
                      </tr>
                      {expanded[product.product_code] ? (
                        <tr key={`${product.product_code}-detail`} className="movement-detail-row">
                          <td colSpan={8}>
                            <div className="movement-detail-grid">
                              {[
                                ...(product.movements || []),
                                ...(product.sales_summary || []).map((item) => ({
                                  date: `${item.date_from} ถึง ${item.date_to}`,
                                  type: "sales_summary",
                                  from_branch: item.branch_code,
                                  to_branch: "Customer",
                                  document_no: "summary",
                                  qty: item.sold_qty_base,
                                  unit_cost: null,
                                })),
                              ].map((movement, index) => (
                                <div className="movement-event" key={`${movement.type}-${movement.document_no}-${index}`}>
                                  <span className={`status ${movementTypeClass(movement.type)}`}>{movementTypeLabel(movement.type)}</span>
                                  <strong>{movement.date}</strong>
                                  <span>{movement.from_branch || "-"} → {movement.to_branch || "-"}</span>
                                  <span>{movement.document_no || "-"}</span>
                                  <span>{formatNumber(movement.qty)} ชิ้น</span>
                                  <span>ทุน {movement.unit_cost == null ? "-" : formatNumber(movement.unit_cost, 2)}</span>
                                </div>
                              ))}
                              {!(product.movements || []).length && !(product.sales_summary || []).length ? (
                                <p className="empty-state">ไม่พบ movement ในช่วงนี้</p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {!products.length ? <p className="empty-state">ยังไม่มีผลลัพธ์ตามเงื่อนไขที่เลือก</p> : null}
          </>
        ) : (
          <p className="empty-state">เลือกสินค้า กลุ่ม หรือหมวด แล้วกดสืบค้นข้อมูล</p>
        )}
      </section>
    </div>
  );
}

// ── Transactions Tab ──────────────────────────────────────────────────────────
// Ledger-style table: one row per product-line event.
// BACKEND PENDING: GET /api/admin/movement-transactions (see data contract above)

function TransactionsTab({ selectedBranch, dateFrom, dateTo, movementTypes, docSearch }) {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams({
        branch_code: selectedBranch || "",
        date_from: dateFrom,
        date_to: dateTo,
        types: movementTypes.join(","),
        ...(docSearch ? { doc_search: docSearch } : {}),
        limit: "200",
        offset: "0",
      });
      const res = await apiFetch(`/api/admin/movement-transactions?${params}`);
      if (res.status === 404) {
        // Endpoint not yet implemented — show pending state
        setTransactions([]);
        setTotal(0);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "โหลดข้อมูล transaction ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="movement-main">
      <div className="movement-actions">
        <button type="button" className="primary-button" onClick={runSearch} disabled={loading}>
          {loading ? "กำลังโหลด..." : "ค้นหา Transactions"}
        </button>
        {searched && !loading && (
          <span className="meta-line">{total > 0 ? `พบ ${total} รายการ` : "ไม่พบรายการ"}</span>
        )}
      </div>

      {error ? <div className="notice error compact">{error}</div> : null}

      {searched && !loading && transactions.length === 0 && !error ? (
        <div className="mvt-pending-notice">
          <strong>Transactions endpoint ยังไม่พร้อม</strong>
          <p>Backend endpoint สำหรับ transaction-level data อยู่ระหว่างพัฒนา</p>
          <code>{`GET /api/admin/movement-transactions
Params: branch_code, date_from, date_to, types, doc_search
Returns: { transactions: [{ event_date, event_type, document_no,
  branch_from, branch_to, product_code, product_name,
  qty, unit, unit_price, amount, pos_code }], total }`}</code>
        </div>
      ) : null}

      {transactions.length > 0 && (
        <div className="table-wrap mvt-ledger-wrap">
          <table className="mvt-ledger">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ประเภท</th>
                <th>เลขเอกสาร</th>
                <th>สาขาต้นทาง</th>
                <th>สาขาปลายทาง</th>
                <th>สินค้า</th>
                <th style={{ textAlign: "right" }}>จำนวน</th>
                <th style={{ textAlign: "right" }}>ราคา/หน่วย</th>
                <th style={{ textAlign: "right" }}>มูลค่า</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, index) => (
                <tr key={tx.event_id || index}>
                  <td>{tx.event_date}</td>
                  <td>
                    <span className={`status ${movementTypeClass(tx.event_type)}`}>
                      {movementTypeLabel(tx.event_type)}
                    </span>
                  </td>
                  <td>
                    <span className="mvt-doc-no">{tx.document_no}</span>
                    {tx.pos_code ? <div className="meta">POS {tx.pos_code}</div> : null}
                  </td>
                  <td>{tx.branch_from || "-"}</td>
                  <td>{tx.branch_to || "-"}</td>
                  <td>
                    <strong>{tx.product_name}</strong>
                    <div className="meta">{tx.product_code}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>{formatNumber(tx.qty)} {tx.unit || ""}</td>
                  <td style={{ textAlign: "right" }}>{tx.unit_price != null ? formatNumber(tx.unit_price, 2) : "-"}</td>
                  <td style={{ textAlign: "right" }}>{tx.amount != null ? formatNumber(tx.amount, 2) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!searched && (
        <p className="empty-state">ตั้งค่าตัวกรองด้านบน แล้วกด "ค้นหา Transactions"</p>
      )}
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────
// Document-level view: one card per document, expandable to show line items.
// BACKEND PENDING: GET /api/admin/movement-documents (see data contract above)

function DocumentsTab({ selectedBranch, dateFrom, dateTo, movementTypes, docSearch }) {
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState({});
  const [loadingItems, setLoadingItems] = useState({});

  async function runSearch() {
    setLoading(true);
    setError("");
    setSearched(true);
    setExpandedDocs({});
    try {
      const params = new URLSearchParams({
        branch_code: selectedBranch || "",
        date_from: dateFrom,
        date_to: dateTo,
        types: movementTypes.join(","),
        ...(docSearch ? { doc_search: docSearch } : {}),
        limit: "100",
        offset: "0",
      });
      const res = await apiFetch(`/api/admin/movement-documents?${params}`);
      if (res.status === 404) {
        setDocuments([]); setTotal(0); return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "โหลดเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDocument(docNo) {
    if (expandedDocs[docNo]) {
      setExpandedDocs((c) => ({ ...c, [docNo]: false }));
      return;
    }
    // Check if items already loaded on the doc object
    const doc = documents.find((d) => d.document_no === docNo);
    if (doc?.items) {
      setExpandedDocs((c) => ({ ...c, [docNo]: true }));
      return;
    }
    // Fetch items for this document
    setLoadingItems((c) => ({ ...c, [docNo]: true }));
    try {
      const res = await apiFetch(`/api/admin/movement-documents/${encodeURIComponent(docNo)}/items`);
      if (res.ok) {
        const data = await res.json();
        setDocuments((current) => current.map((d) => d.document_no === docNo ? { ...d, items: data.items || [] } : d));
      }
      setExpandedDocs((c) => ({ ...c, [docNo]: true }));
    } catch {
      setExpandedDocs((c) => ({ ...c, [docNo]: true }));
    } finally {
      setLoadingItems((c) => ({ ...c, [docNo]: false }));
    }
  }

  const docTypeLabel = (type) => movementTypeLabel(type);

  return (
    <div className="movement-main">
      <div className="movement-actions">
        <button type="button" className="primary-button" onClick={runSearch} disabled={loading}>
          {loading ? "กำลังโหลด..." : "ค้นหาเอกสาร"}
        </button>
        {searched && !loading && (
          <span className="meta-line">{total > 0 ? `พบ ${total} เอกสาร` : "ไม่พบเอกสาร"}</span>
        )}
      </div>

      {error ? <div className="notice error compact">{error}</div> : null}

      {searched && !loading && documents.length === 0 && !error ? (
        <div className="mvt-pending-notice">
          <strong>Documents endpoint ยังไม่พร้อม</strong>
          <p>Backend endpoint สำหรับ document-level drilldown อยู่ระหว่างพัฒนา</p>
          <code>{`GET /api/admin/movement-documents
Params: branch_code, date_from, date_to, types, doc_search
Returns: { documents: [{ document_no, document_type, document_date,
  branch_code, pos_code, item_count, total_amount, status }], total }

GET /api/admin/movement-documents/:document_no/items
Returns: { items: [{ product_code, product_name, qty, unit, unit_price, amount }] }`}</code>
        </div>
      ) : null}

      {documents.length > 0 && (
        <div className="mvt-doc-list">
          {documents.map((doc) => (
            <div key={doc.document_no} className="mvt-doc-card">
              <button
                type="button"
                className="mvt-doc-card-header"
                onClick={() => toggleDocument(doc.document_no)}
                aria-expanded={!!expandedDocs[doc.document_no]}
              >
                <span className={`status ${movementTypeClass(doc.document_type)}`}>
                  {docTypeLabel(doc.document_type)}
                </span>
                <div>
                  <div className="mvt-doc-no">{doc.document_no}</div>
                  <div className="mvt-doc-meta">
                    {doc.document_date} · สาขา {doc.branch_code}
                    {doc.pos_code ? ` · POS ${doc.pos_code}` : ""}
                    {" · "}{doc.item_count} รายการ
                  </div>
                </div>
                <span className="mvt-doc-amount">{doc.total_amount != null ? formatNumber(doc.total_amount, 2) : "-"}</span>
                <span className={`status${doc.status === "completed" ? " good" : doc.status === "void" ? " danger" : " warning"}`}>
                  {doc.status === "completed" ? "สำเร็จ" : doc.status === "void" ? "ยกเลิก" : "รอดำเนินการ"}
                </span>
                <span>{expandedDocs[doc.document_no] ? "▲" : "▼"}{loadingItems[doc.document_no] ? " ..." : ""}</span>
              </button>

              {expandedDocs[doc.document_no] && (
                <div className="mvt-doc-items">
                  {doc.items && doc.items.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>รหัสสินค้า</th>
                          <th>ชื่อสินค้า</th>
                          <th style={{ textAlign: "right" }}>จำนวน</th>
                          <th>หน่วย</th>
                          <th style={{ textAlign: "right" }}>ราคา/หน่วย</th>
                          <th style={{ textAlign: "right" }}>มูลค่า</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.items.map((item, i) => (
                          <tr key={`${item.product_code}-${i}`}>
                            <td><span className="meta">{item.product_code}</span></td>
                            <td>{item.product_name}</td>
                            <td style={{ textAlign: "right" }}>{formatNumber(item.qty)}</td>
                            <td>{item.unit || "-"}</td>
                            <td style={{ textAlign: "right" }}>{item.unit_price != null ? formatNumber(item.unit_price, 2) : "-"}</td>
                            <td style={{ textAlign: "right" }}>{item.amount != null ? formatNumber(item.amount, 2) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="empty-state">ไม่มีรายการสินค้าในเอกสารนี้</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!searched && (
        <p className="empty-state">ตั้งค่าตัวกรองด้านบน แล้วกด "ค้นหาเอกสาร"</p>
      )}
    </div>
  );
}
