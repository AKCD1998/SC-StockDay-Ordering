import { useCallback, useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

// ── Ingredient Dictionary Admin (Phase 5A) ───────────────────────────────────
const ING_API = "/api/admin/ingredient-dictionary";

const ING_STATUS_LABELS = {
  active: "ใช้งาน",
  confirmed: "ยืนยันแล้ว",
  proposed: "รอตรวจ",
  needs_review: "ต้องทบทวน",
  deprecated: "ปิดใช้",
  inactive: "ปิดใช้",
  rejected: "ปฏิเสธ",
};

function ingStatusLabel(status) {
  return ING_STATUS_LABELS[status] || status || "-";
}

function IngredientDictionaryPanel({ csrfToken }) {
  const [subTab, setSubTab] = useState("dictionary"); // dictionary | matched | discoveries

  // dictionary list
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("");
  const [list, setList]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [loadingList, setLoadingList] = useState(false);

  // selected ingredient detail
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError]   = useState("");

  // form inputs
  const [newSynonym, setNewSynonym]   = useState("");
  const [newDrugClass, setNewDrugClass] = useState("");
  const [newIndication, setNewIndication] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [rulePriority, setRulePriority] = useState("100");
  const [categoryOptions, setCategoryOptions] = useState([]);

  // matched products
  const [matched, setMatched]           = useState([]);
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [matchedOffset, setMatchedOffset] = useState(0);
  const [matchedSearch, setMatchedSearch] = useState("");
  const [matchedStatusFilter, setMatchedStatusFilter] = useState("");
  const [loadingMatched, setLoadingMatched] = useState(false);
  const [matchedSelected, setMatchedSelected] = useState(() => new Set());

  // discoveries
  const [discoveries, setDiscoveries] = useState([]);
  const [discoveryTotal, setDiscoveryTotal] = useState(0);
  const [loadingDiscoveries, setLoadingDiscoveries] = useState(false);
  const [discoverySearch, setDiscoverySearch] = useState("");

  // all ingredients view
  const [allList, setAllList] = useState([]);
  const [allTotal, setAllTotal] = useState(0);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allSearch, setAllSearch] = useState("");
  const [allCatFilter, setAllCatFilter] = useState("");
  const [allOffset, setAllOffset] = useState(0);
  const ALL_PAGE = 200;

  // synonym checker
  const [checkInput, setCheckInput] = useState("");
  const [checkResults, setCheckResults] = useState(null); // null = not yet run
  const [checkLoading, setCheckLoading] = useState(false);

  const MATCHED_PAGE = 50;

  // ── loaders ───────────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch(`${ING_API}/ingredients?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data.records || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError("โหลดรายการสารสำคัญไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingList(false);
    }
  }, [search, statusFilter]);

  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    setError("");
    try {
      const res = await apiFetch(`${ING_API}/ingredients/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data.ingredient);
    } catch (e) {
      setError("โหลดรายละเอียดไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadMatched = useCallback(async (offset = 0) => {
    setLoadingMatched(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(MATCHED_PAGE), offset: String(offset) });
      if (matchedSearch.trim()) params.set("search", matchedSearch.trim());
      if (matchedStatusFilter) params.set("status", matchedStatusFilter);
      const res = await apiFetch(`${ING_API}/matched-products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMatched(data.records || []);
      setMatchedTotal(data.total || 0);
      setMatchedOffset(offset);
      setMatchedSelected(new Set());
    } catch (e) {
      setError("โหลดสินค้าที่จับคู่ไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingMatched(false);
    }
  }, [matchedSearch, matchedStatusFilter]);

  const loadDiscoveries = useCallback(async () => {
    setLoadingDiscoveries(true);
    setError("");
    try {
      const res = await apiFetch(`${ING_API}/potential-discoveries?limit=100&minCount=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiscoveries(data.records || []);
      setDiscoveryTotal(data.totalProducts || 0);
    } catch (e) {
      setError("โหลดคำที่ยังไม่รู้จักไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingDiscoveries(false);
    }
  }, []);

  const loadAll = useCallback(async (offset = 0) => {
    setLoadingAll(true);
    setError("");
    try {
      const res = await apiFetch(`${ING_API}/ingredients?limit=200&status=active&offset=${offset}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllList(data.records || []);
      setAllTotal(data.total || 0);
      setAllOffset(offset);
    } catch (e) {
      setError("โหลดรายการสารสำคัญไม่สำเร็จ: " + e.message);
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => { if (subTab === "dictionary") loadList(); }, [subTab, loadList]);
  useEffect(() => { if (subTab === "matched") loadMatched(0); }, [subTab, matchedStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (subTab === "discoveries") loadDiscoveries(); }, [subTab, loadDiscoveries]);
  useEffect(() => { if (subTab === "all") loadAll(0); }, [subTab, loadAll]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // ── mutation helper ──────────────────────────────────────────────────────────
  const mutate = useCallback(async (path, method, body) => {
    setError("");
    setNotice("");
    const res = await apiFetch(`${ING_API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.ingredient) setDetail(data.ingredient);
    return data;
  }, [csrfToken]);

  async function runMutation(fn, successMsg) {
    try {
      await fn();
      if (successMsg) setNotice(successMsg);
      loadList();
    } catch (e) {
      setError(e.message);
    }
  }

  // matched-products confirm/reject
  const toggleMatchedSelect = (key) => setMatchedSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  async function confirmMatched(rec, status) {
    try {
      await mutate(`/product-ingredients/${encodeURIComponent(rec.productCode)}/${rec.ingredientId}`, "PATCH", { status });
      setMatched((prev) => prev.map((m) => (m.productCode === rec.productCode && m.ingredientId === rec.ingredientId ? { ...m, ingredientStatus: status } : m)));
      setNotice(status === "confirmed" ? "ยืนยันแล้ว" : "ปฏิเสธแล้ว");
    } catch (e) {
      setError(e.message);
    }
  }

  async function bulkMatched(status) {
    const decisions = matched
      .filter((m) => matchedSelected.has(`${m.productCode}|${m.ingredientId}`))
      .map((m) => ({ productCode: m.productCode, ingredientId: m.ingredientId, status }));
    if (!decisions.length) return;
    try {
      const data = await mutate(`/product-ingredients/confirm-batch`, "POST", { decisions });
      setMatched((prev) => prev.map((m) => (matchedSelected.has(`${m.productCode}|${m.ingredientId}`) ? { ...m, ingredientStatus: status } : m)));
      setMatchedSelected(new Set());
      setNotice(`อัปเดต ${data.updated ?? decisions.length} รายการ`);
    } catch (e) {
      setError(e.message);
    }
  }

  // category options for rule picker
  useEffect(() => {
    if (subTab !== "dictionary" || !detail) return;
    let active = true;
    apiFetch(`${ING_API}/categories?search=${encodeURIComponent(ruleCategory.trim())}`)
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => { if (active) setCategoryOptions(d.records || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [ruleCategory, subTab, detail]);

  // ── action handlers ───────────────────────────────────────────────────────────
  const addSynonym = () => runMutation(async () => {
    const t = newSynonym.trim();
    if (!t) return;
    await mutate(`/ingredients/${detail.ingredientId}/synonyms`, "POST", { synonymText: t, language: "en" });
    setNewSynonym("");
  }, "เพิ่มคำพ้องแล้ว");

  const toggleSynonym = (s) => runMutation(async () => {
    const next = s.status === "deprecated" ? "active" : "deprecated";
    await mutate(`/synonyms/${s.synonymId}`, "PATCH", { status: next });
  });

  const addDrugClass = () => runMutation(async () => {
    const name = newDrugClass.trim();
    if (!name) return;
    await mutate(`/ingredients/${detail.ingredientId}/drug-classes`, "POST", { name });
    setNewDrugClass("");
  }, "เชื่อมกลุ่มยาแล้ว");

  const toggleDrugClass = (d) => runMutation(async () => {
    const next = d.status === "rejected" ? "confirmed" : "rejected";
    await mutate(`/ingredients/${detail.ingredientId}/drug-classes/${d.drugClassId}`, "PATCH", { status: next });
  });

  const addIndication = () => runMutation(async () => {
    const name = newIndication.trim();
    if (!name) return;
    await mutate(`/ingredients/${detail.ingredientId}/indications`, "POST", { name });
    setNewIndication("");
  }, "เชื่อมข้อบ่งใช้แล้ว");

  const toggleIndication = (i) => runMutation(async () => {
    const next = i.status === "rejected" ? "confirmed" : "rejected";
    await mutate(`/ingredients/${detail.ingredientId}/indications/${i.indicationId}`, "PATCH", { status: next });
  });

  const addCategoryRule = () => runMutation(async () => {
    const categoryName = ruleCategory.trim();
    if (!categoryName) return;
    await mutate(`/ingredients/${detail.ingredientId}/category-rules`, "POST", {
      categoryName,
      priority: parseInt(rulePriority, 10) || 100,
    });
    setRuleCategory("");
  }, "เพิ่มกฎหมวดแล้ว");

  const toggleRule = (r) => runMutation(async () => {
    const next = r.ruleStatus === "active" ? "inactive" : "active";
    await mutate(`/category-rules/${r.ruleId}`, "PATCH", { ruleStatus: next });
  });

  const changeRulePriority = (r, delta) => runMutation(async () => {
    await mutate(`/category-rules/${r.ruleId}`, "PATCH", { priority: Math.max(0, r.priority + delta) });
  });

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <section className="panel id-panel">
      <div className="panel-header">
        <h2>พจนานุกรมสารสำคัญ</h2>
        <p>จัดการความรู้สารสำคัญ — คำพ้อง กลุ่มยา ข้อบ่งใช้ และกฎหมวด (อ่าน/แก้ไขโดยเภสัชกร)</p>
      </div>

      <div className="id-subtabs">
        {[
          { key: "dictionary", label: "พจนานุกรม" },
          { key: "matched", label: "สินค้าที่จับคู่แล้ว" },
          { key: "discoveries", label: "คำที่ยังไม่รู้จัก" },
          { key: "all", label: "📋 ดูทั้งหมด" },
          { key: "check", label: "🔍 ตรวจคำพ้อง" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={subTab === t.key ? "id-subtab active" : "id-subtab"}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="notice error compact">{error}</p>}
      {notice && <p className="notice success compact">{notice}</p>}

      {/* ── DICTIONARY ── */}
      {subTab === "dictionary" && (
        <div className="id-dictionary">
          <div className="id-list-col">
            <div className="id-search-row">
              <div className="id-search-stack">
                <label className="id-search-box">
                  <span className="id-search-icon" aria-hidden="true">⌕</span>
                  <input
                    type="text"
                    className="rq-search"
                    placeholder="ค้นหา: ชื่อสาร / คำพ้อง / กลุ่มยา / ข้อบ่งใช้"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") loadList(); }}
                  />
                </label>
                <label className="id-status-box">
                  <span className="id-status-dot" aria-hidden="true" />
                  <select className="id-select" value={statusFilter} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">ทุกสถานะ</option>
                    <option value="active">ใช้งาน</option>
                    <option value="needs_review">ต้องทบทวน</option>
                    <option value="deprecated">ปิดใช้</option>
                  </select>
                  <span className="id-status-chevron" aria-hidden="true">⌄</span>
                </label>
              </div>
              <button type="button" className="id-search-button" onClick={loadList}>
                <span className="id-search-button-icon" aria-hidden="true">⌕</span>
                <span>ค้นหา</span>
              </button>
            </div>
            <div className="id-list-meta">{total.toLocaleString()} สาร</div>
            <div className="id-list">
              {loadingList ? (
                <p className="empty-state">กำลังโหลด...</p>
              ) : list.length === 0 ? (
                <p className="empty-state">ไม่พบสารสำคัญ</p>
              ) : (
                list.map((row) => (
                  <button
                    key={row.ingredientId}
                    type="button"
                    className={`id-list-item${selectedId === row.ingredientId ? " active" : ""}`}
                    onClick={() => setSelectedId(row.ingredientId)}
                  >
                    <div className="id-list-name">
                      {row.displayName}
                      {row.status !== "active" && <span className="id-badge muted">{ingStatusLabel(row.status)}</span>}
                    </div>
                    <div className="id-list-sub">
                      {row.drugClassNames || "ไม่มีกลุ่มยา"}
                    </div>
                    <div className="id-list-counts">
                      <span title="คำพ้อง">🔤 {row.synonymCount}</span>
                      <span title="กลุ่มยา">💊 {row.drugClassCount}</span>
                      <span title="ข้อบ่งใช้">🩺 {row.indicationCount}</span>
                      <span title="กฎหมวด">📂 {row.categoryRuleCount}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="id-detail-col">
            {!detail ? (
              <p className="empty-state">เลือกสารสำคัญทางซ้ายเพื่อดูรายละเอียด</p>
            ) : loadingDetail ? (
              <p className="empty-state">กำลังโหลด...</p>
            ) : (
              <>
                <div className="id-detail-head">
                  <h3>{detail.displayName}</h3>
                  <code>{detail.canonicalName}</code>
                  <span className={`id-badge ${detail.status === "active" ? "good" : "muted"}`}>{ingStatusLabel(detail.status)}</span>
                </div>
                <div className="id-detail-dates">
                  สร้าง: {new Date(detail.createdAt).toLocaleString("th-TH")} · แก้ไขล่าสุด: {new Date(detail.updatedAt).toLocaleString("th-TH")}
                </div>

                {/* Synonyms */}
                <div className="id-section">
                  <div className="id-section-title">คำพ้อง (Synonyms)</div>
                  <ul className="id-rows">
                    {detail.synonyms.map((s) => (
                      <li key={s.synonymId} className={s.status === "deprecated" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">{s.synonymText}</span>
                        <span className="id-row-meta">{s.language || "-"} · {s.source || "-"} · {ingStatusLabel(s.status)}</span>
                        <button type="button" className="ghost-button id-mini" onClick={() => toggleSynonym(s)}>
                          {s.status === "deprecated" ? "เปิดใช้" : "ปิดใช้"}
                        </button>
                      </li>
                    ))}
                    {detail.synonyms.length === 0 && <li className="id-row empty">ยังไม่มีคำพ้อง</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" placeholder="เพิ่มคำพ้องใหม่..." value={newSynonym}
                      onChange={(e) => setNewSynonym(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSynonym(); }} />
                    <button type="button" className="primary-button id-mini" onClick={addSynonym} disabled={!newSynonym.trim()}>เพิ่ม</button>
                  </div>
                </div>

                {/* Drug classes */}
                <div className="id-section">
                  <div className="id-section-title">กลุ่มยา (Drug Classes)</div>
                  <ul className="id-rows">
                    {detail.drugClasses.map((d) => (
                      <li key={d.drugClassId} className={d.status === "rejected" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">{d.name}</span>
                        <span className="id-row-meta">
                          {d.confidence != null ? `conf ${d.confidence}` : "conf -"} · {d.source || "-"} · {ingStatusLabel(d.status)}
                        </span>
                        <button type="button" className="ghost-button id-mini" onClick={() => toggleDrugClass(d)}>
                          {d.status === "rejected" ? "เปิดใช้" : "ปิดใช้"}
                        </button>
                      </li>
                    ))}
                    {detail.drugClasses.length === 0 && <li className="id-row empty">ยังไม่มีกลุ่มยา</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" placeholder="เพิ่ม/เชื่อมกลุ่มยา..." value={newDrugClass}
                      onChange={(e) => setNewDrugClass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addDrugClass(); }} />
                    <button type="button" className="primary-button id-mini" onClick={addDrugClass} disabled={!newDrugClass.trim()}>เชื่อม</button>
                  </div>
                </div>

                {/* Indications */}
                <div className="id-section">
                  <div className="id-section-title">ข้อบ่งใช้ (Indications)</div>
                  <ul className="id-rows">
                    {detail.indications.map((i) => (
                      <li key={i.indicationId} className={i.status === "rejected" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">{i.name}</span>
                        <span className="id-row-meta">{i.source || "-"} · {ingStatusLabel(i.status)}</span>
                        <button type="button" className="ghost-button id-mini" onClick={() => toggleIndication(i)}>
                          {i.status === "rejected" ? "เปิดใช้" : "ปิดใช้"}
                        </button>
                      </li>
                    ))}
                    {detail.indications.length === 0 && <li className="id-row empty">ยังไม่มีข้อบ่งใช้</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" placeholder="เพิ่ม/เชื่อมข้อบ่งใช้..." value={newIndication}
                      onChange={(e) => setNewIndication(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addIndication(); }} />
                    <button type="button" className="primary-button id-mini" onClick={addIndication} disabled={!newIndication.trim()}>เชื่อม</button>
                  </div>
                </div>

                {/* Category rules */}
                <div className="id-section">
                  <div className="id-section-title">กฎหมวด (Category Rules)</div>
                  <ul className="id-rows">
                    {detail.categoryRules.map((r) => (
                      <li key={r.ruleId} className={r.ruleStatus !== "active" ? "id-row off" : "id-row"}>
                        <span className="id-row-main">
                          {detail.displayName}
                          {r.drugClassName && <> → {r.drugClassName}</>}
                          {r.indicationName && <> → {r.indicationName}</>}
                          {" → "}<strong>{r.categoryName}</strong>
                        </span>
                        <span className="id-row-meta">priority {r.priority} · {ingStatusLabel(r.ruleStatus)}</span>
                        <span className="id-row-actions">
                          <button type="button" className="ghost-button id-mini" onClick={() => changeRulePriority(r, -10)} title="ลำดับสำคัญขึ้น">▲</button>
                          <button type="button" className="ghost-button id-mini" onClick={() => changeRulePriority(r, 10)} title="ลำดับสำคัญลง">▼</button>
                          <button type="button" className="ghost-button id-mini" onClick={() => toggleRule(r)}>
                            {r.ruleStatus === "active" ? "ปิดใช้" : "เปิดใช้"}
                          </button>
                        </span>
                      </li>
                    ))}
                    {detail.categoryRules.length === 0 && <li className="id-row empty">ยังไม่มีกฎหมวด</li>}
                  </ul>
                  <div className="id-add-row">
                    <input type="text" className="rq-search" list="id-category-options" placeholder="เลือกหมวดที่มีอยู่แล้ว..." value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value)} />
                    <datalist id="id-category-options">
                      {categoryOptions.map((c) => <option key={c.categoryName} value={c.categoryName}>{`${c.categoryName} (${c.productCount})`}</option>)}
                    </datalist>
                    <input type="number" className="id-priority-input" value={rulePriority} onChange={(e) => setRulePriority(e.target.value)} title="priority" />
                    <button type="button" className="primary-button id-mini" onClick={addCategoryRule} disabled={!ruleCategory.trim()}>เพิ่มกฎ</button>
                  </div>
                  <p className="id-hint">* เลือกได้เฉพาะหมวดที่ยืนยันแล้วในระบบ — ไม่สร้างหมวดใหม่ และไม่กระทบการยืนยันหมวดสินค้า</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MATCHED PRODUCTS ── */}
      {subTab === "matched" && (
        <div className="id-matched">
          <div className="id-search-row">
            <input type="text" className="rq-search" placeholder="ค้นหา: รหัส / ชื่อสินค้า / สาร" value={matchedSearch}
              onChange={(e) => setMatchedSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") loadMatched(0); }} />
            <label className="id-filter-label">
              <span>ยืนยัน</span>
              <select
                className="id-select"
                value={matchedStatusFilter}
                onChange={(e) => {
                  setMatchedStatusFilter(e.target.value);
                  setMatchedOffset(0);
                }}
                title="กรองสถานะการยืนยัน"
              >
                <option value="">ทั้งหมดที่ยังไม่ถูกปฏิเสธ</option>
                <option value="proposed">รอยืนยัน</option>
                <option value="confirmed">ยืนยันแล้ว</option>
                <option value="needs_review">ต้องทบทวน</option>
                <option value="rejected">ปฏิเสธแล้ว</option>
              </select>
            </label>
            <button type="button" className="ghost-button" onClick={() => loadMatched(0)}>ค้นหา</button>
          </div>
          <div className="id-matched-toolbar">
            <span className="id-list-meta">{matchedTotal.toLocaleString()} รายการ — กดยืนยัน/ปฏิเสธสารที่ระบบเดาไว้</span>
            {matchedSelected.size > 0 && (
              <span className="id-bulk-bar">
                เลือก {matchedSelected.size} รายการ:
                <button type="button" className="primary-button id-mini" onClick={() => bulkMatched("confirmed")}>✓ ยืนยันที่เลือก</button>
                <button type="button" className="ghost-button id-mini" onClick={() => bulkMatched("rejected")}>✗ ปฏิเสธที่เลือก</button>
                <button type="button" className="ghost-button id-mini" onClick={() => setMatchedSelected(new Set())}>ล้าง</button>
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table className="id-table">
              <thead>
                <tr>
                  <th></th>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th>สารที่จับคู่</th>
                  <th>ที่มา</th>
                  <th>สถานะ</th>
                  <th>
                    <label className="id-th-filter">
                      <span>ยืนยัน</span>
                      <select
                        value={matchedStatusFilter}
                        onChange={(e) => {
                          setMatchedStatusFilter(e.target.value);
                          setMatchedOffset(0);
                        }}
                        aria-label="กรองสถานะยืนยัน"
                      >
                        <option value="">ทั้งหมด</option>
                        <option value="proposed">รอยืนยัน</option>
                        <option value="confirmed">ยืนยันแล้ว</option>
                        <option value="needs_review">ต้องทบทวน</option>
                        <option value="rejected">ปฏิเสธแล้ว</option>
                      </select>
                    </label>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingMatched ? (
                  <tr><td colSpan={7} className="empty-state">กำลังโหลด...</td></tr>
                ) : matched.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">ยังไม่มีสินค้าที่จับคู่ใน product_ingredients</td></tr>
                ) : (
                  matched.map((m, idx) => {
                    const key = `${m.productCode}|${m.ingredientId}`;
                    return (
                      <tr key={`${m.productCode}-${idx}`} className={m.ingredientStatus === "rejected" ? "id-row-rejected" : ""}>
                        <td><input type="checkbox" checked={matchedSelected.has(key)} onChange={() => toggleMatchedSelect(key)} /></td>
                        <td><code>{m.productCode}</code></td>
                        <td>{m.productName}</td>
                        <td>{m.matchedIngredient}{m.strengthValue != null && <span className="id-strength"> {m.strengthValue}{m.strengthUnit || ""}</span>}</td>
                        <td>{m.matchSource}</td>
                        <td><span className={`id-badge ${m.ingredientStatus === "confirmed" ? "good" : m.ingredientStatus === "rejected" ? "muted" : ""}`}>{ingStatusLabel(m.ingredientStatus)}</span></td>
                        <td className="id-confirm-cell">
                          <button type="button" className={`id-confirm-btn ok${m.ingredientStatus === "confirmed" ? " on" : ""}`} title="ยืนยัน" onClick={() => confirmMatched(m, "confirmed")}>✓</button>
                          <button type="button" className={`id-confirm-btn no${m.ingredientStatus === "rejected" ? " on" : ""}`} title="ปฏิเสธ" onClick={() => confirmMatched(m, "rejected")}>✗</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="id-pager">
            <button type="button" className="ghost-button" disabled={matchedOffset === 0 || loadingMatched} onClick={() => loadMatched(Math.max(0, matchedOffset - MATCHED_PAGE))}>← ก่อนหน้า</button>
            <span>{matchedTotal === 0 ? 0 : matchedOffset + 1}–{Math.min(matchedOffset + MATCHED_PAGE, matchedTotal)} / {matchedTotal}</span>
            <button type="button" className="ghost-button" disabled={matchedOffset + MATCHED_PAGE >= matchedTotal || loadingMatched} onClick={() => loadMatched(matchedOffset + MATCHED_PAGE)}>ถัดไป →</button>
          </div>
        </div>
      )}

      {/* ── POTENTIAL DISCOVERIES ── */}
      {subTab === "discoveries" && (
        <div className="id-discoveries">
          <div className="id-list-meta">
            คำที่พบบ่อยในชื่อสินค้าที่ยังจับคู่ไม่ได้ — ใช้เป็นตัวช่วยขยายพจนานุกรม
            {discoveryTotal > 0 && <> (จากทั้งหมด {discoveryTotal.toLocaleString()} สินค้า)</>}
          </div>
          <div className="id-search-row">
            <input
              type="text"
              className="rq-search"
              placeholder="ค้นหาคำ..."
              value={discoverySearch}
              onChange={(e) => setDiscoverySearch(e.target.value)}
            />
            {discoverySearch && (
              <button type="button" className="ghost-button" onClick={() => setDiscoverySearch("")}>ล้าง</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="id-table">
              <thead>
                <tr><th>#</th><th>คำ</th><th>จำนวนสินค้า</th><th>% ของแคตตาล็อก</th></tr>
              </thead>
              <tbody>
                {loadingDiscoveries ? (
                  <tr><td colSpan={4} className="empty-state">กำลังสแกนชื่อสินค้า...</td></tr>
                ) : discoveries.length === 0 ? (
                  <tr><td colSpan={4} className="empty-state">ไม่มีข้อมูล</td></tr>
                ) : (() => {
                  const q = discoverySearch.trim().toLowerCase();
                  const filtered = q ? discoveries.filter((d) => d.token.toLowerCase().includes(q)) : discoveries;
                  return filtered.length === 0 ? (
                    <tr><td colSpan={4} className="empty-state">ไม่พบคำที่ค้นหา</td></tr>
                  ) : (
                    filtered.map((d, idx) => (
                      <tr key={d.token}>
                        <td>{idx + 1}</td>
                        <td><strong>{d.token}</strong></td>
                        <td>{d.productCount.toLocaleString()}</td>
                        <td>{d.coveragePct.toFixed(2)}%</td>
                      </tr>
                    ))
                  );
                })()}
              </tbody>
            </table>
          </div>
          <p className="id-hint">* คำเหล่านี้รวมชื่อยี่ห้อ/บรรจุภัณฑ์ด้วย — เภสัชกรควรเลือกเฉพาะที่เป็นสารสำคัญจริงก่อนเพิ่มเข้าพจนานุกรม</p>
        </div>
      )}

      {/* ── ALL INGREDIENTS (read-only browse) ── */}
      {subTab === "all" && (() => {
        const q = allSearch.trim().toLowerCase();
        const catQ = allCatFilter.trim().toLowerCase();
        const filtered = allList.filter((r) => {
          if (catQ && !r.drugClassNames.toLowerCase().includes(catQ)) return false;
          if (!q) return true;
          return (
            r.displayName.toLowerCase().includes(q) ||
            r.canonicalName.toLowerCase().includes(q) ||
            r.drugClassNames.toLowerCase().includes(q) ||
            r.indicationNames.toLowerCase().includes(q)
          );
        });

        const uniqueCats = [...new Set(
          allList.flatMap((r) => r.drugClassNames ? r.drugClassNames.split(", ").map((s) => s.trim()) : [])
        )].sort();

        return (
          <div className="id-all-wrap">
            <div className="id-search-row">
              <input
                type="text"
                className="rq-search"
                placeholder="ค้นหา: ชื่อสาร / canonical / กลุ่มยา / ข้อบ่งใช้"
                value={allSearch}
                onChange={(e) => setAllSearch(e.target.value)}
              />
              <select
                className="id-select"
                value={allCatFilter}
                onChange={(e) => setAllCatFilter(e.target.value)}
              >
                <option value="">กลุ่มยาทั้งหมด</option>
                {uniqueCats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" className="ghost-button" onClick={() => loadAll(allOffset)}>รีเฟรช</button>
            </div>
            <div className="id-list-meta">
              {loadingAll
                ? "กำลังโหลด..."
                : `แสดง ${(allOffset + 1).toLocaleString()}–${Math.min(allOffset + allList.length, allTotal).toLocaleString()} จาก ${allTotal.toLocaleString()} สาร (หน้า ${Math.floor(allOffset / ALL_PAGE) + 1}/${Math.ceil(allTotal / ALL_PAGE)})`}
            </div>
            <div className="table-wrap">
              <table className="id-table id-all-table">
                <thead>
                  <tr>
                    <th style={{ width: "2rem" }}>#</th>
                    <th>ชื่อแสดง</th>
                    <th>Canonical name</th>
                    <th>กลุ่มยา</th>
                    <th>ข้อบ่งใช้</th>
                    <th style={{ width: "4rem", textAlign: "center" }}>คำพ้อง</th>
                    <th style={{ width: "4rem", textAlign: "center" }}>กฎหมวด</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAll ? (
                    <tr><td colSpan={7} className="empty-state">กำลังโหลด...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} className="empty-state">ไม่พบสารสำคัญ</td></tr>
                  ) : (
                    filtered.map((r, idx) => (
                      <tr
                        key={r.ingredientId}
                        className="id-all-row"
                        onClick={() => { setSubTab("dictionary"); setSelectedId(r.ingredientId); }}
                        title="คลิกเพื่อดูรายละเอียด"
                      >
                        <td className="id-all-idx">{idx + 1}</td>
                        <td><strong>{r.displayName}</strong></td>
                        <td className="id-all-canonical">{r.canonicalName}</td>
                        <td className="id-all-meta">{r.drugClassNames || <span className="id-all-empty">—</span>}</td>
                        <td className="id-all-meta">{r.indicationNames || <span className="id-all-empty">—</span>}</td>
                        <td className="id-all-count">{r.synonymCount}</td>
                        <td className="id-all-count">{r.categoryRuleCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {allTotal > ALL_PAGE && (
              <div className="id-pager">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => loadAll(Math.max(0, allOffset - ALL_PAGE))}
                  disabled={loadingAll || allOffset === 0}
                >
                  ← หน้าก่อน
                </button>
                <span>
                  หน้า {Math.floor(allOffset / ALL_PAGE) + 1} / {Math.ceil(allTotal / ALL_PAGE)}
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => loadAll(allOffset + ALL_PAGE)}
                  disabled={loadingAll || allOffset + ALL_PAGE >= allTotal}
                >
                  หน้าถัดไป →
                </button>
              </div>
            )}
            <p className="id-hint">* คลิกแถวใดก็ได้เพื่อเปิดรายละเอียดในแท็บ "พจนานุกรม" · search/filter ทำงานบน 200 รายการที่โหลดอยู่</p>
          </div>
        );
      })()}

      {/* ── SYNONYM CHECKER ── */}
      {subTab === "check" && (() => {
        const newOnes = checkResults ? checkResults.filter((r) => !r.exists).map((r) => r.synonymText) : [];

        async function runCheck() {
          const lines = checkInput.split("\n").map((l) => l.trim()).filter(Boolean);
          if (!lines.length) return;
          setCheckLoading(true);
          setError("");
          try {
            const res = await apiFetch(`${ING_API}/synonyms/check-bulk`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ synonyms: lines }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setCheckResults(data.results || []);
          } catch (e) {
            setError("ตรวจไม่สำเร็จ: " + e.message);
          } finally {
            setCheckLoading(false);
          }
        }

        return (
          <div className="id-check-wrap">
            <div className="id-check-top">
              <div className="id-check-input-col">
                <label className="id-check-label">วางคำที่ต้องการตรวจ (ทีละบรรทัด)</label>
                <textarea
                  className="id-check-textarea"
                  rows={14}
                  placeholder={"ไซเลียมฮัสก์\npsyllium husk\nispaghula husk\n..."}
                  value={checkInput}
                  onChange={(e) => { setCheckInput(e.target.value); setCheckResults(null); }}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="primary-button"
                  onClick={runCheck}
                  disabled={checkLoading || !checkInput.trim()}
                >
                  {checkLoading ? "กำลังตรวจ..." : "ตรวจสอบ"}
                </button>
              </div>

              {checkResults && (
                <div className="id-check-result-col">
                  <div className="id-check-summary">
                    ตรวจ {checkResults.length} คำ · มีแล้ว {checkResults.filter((r) => r.exists).length} · <span className="id-check-new-count">ยังไม่มี {newOnes.length} คำ</span>
                  </div>
                  <ul className="id-check-list">
                    {checkResults.map((r, i) => (
                      <li key={i} className={`id-check-item ${r.exists ? "found" : "missing"}`}>
                        <span className="id-check-icon">{r.exists ? "✓" : "✗"}</span>
                        <span className="id-check-word">{r.synonymText}</span>
                        {r.exists && (
                          <span className="id-check-meta">
                            → {r.ingredientDisplay}
                            {r.status !== "active" && <span className="id-badge muted">{ingStatusLabel(r.status)}</span>}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {checkResults && newOnes.length > 0 && (
              <div className="id-check-new-block">
                <div className="id-check-new-head">
                  <span>คำที่ยังไม่มีในระบบ ({newOnes.length} คำ) — copy ไปส่ง Claude seed ต่อได้เลย</span>
                  <button
                    type="button"
                    className="ghost-button id-mini"
                    onClick={() => navigator.clipboard.writeText(newOnes.join("\n")).then(() => setNotice("คัดลอกแล้ว")).catch(() => {})}
                  >
                    คัดลอก
                  </button>
                </div>
                <textarea
                  className="id-check-new-textarea"
                  readOnly
                  rows={Math.min(newOnes.length + 1, 10)}
                  value={newOnes.join("\n")}
                />
              </div>
            )}

            {checkResults && newOnes.length === 0 && (
              <p className="id-check-all-found">ทุกคำมีอยู่ในพจนานุกรมแล้ว</p>
            )}
          </div>
        );
      })()}
    </section>
  );
}

export default IngredientDictionaryPanel;
