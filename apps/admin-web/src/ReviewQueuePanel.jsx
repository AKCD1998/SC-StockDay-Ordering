import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function normalizeFilterValue(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeCategorySearchValue(value) {
  return normalizeFilterValue(value).toLowerCase();
}

// ── Review Queue — fast keyboard-driven human category verification ───────────
// ── Ingredient Knowledge Layer (read-only display) ───────────────────────────
// Cache supervision payloads per product code so navigating back/forth in the
// queue does not re-hit the backend.
const ingredientSupervisionCache = new Map();

const INGREDIENT_STATUS_LABELS = {
  proposed:     "รอตรวจ",
  confirmed:    "ยืนยันแล้ว",
  needs_review: "ต้องทบทวน",
  rejected:     "ปฏิเสธ",
};

function formatIngredientStrength(ingredient) {
  const value = ingredient?.strengthValue;
  const unit  = ingredient?.strengthUnit;
  if (value == null && !unit) return "";
  if (value == null) return unit || "";
  return `${value}${unit || ""}`;
}

function IngredientSuggestions({ productCode, onUseCategory, csrfToken }) {
  const [state, setState] = useState({ status: "loading", data: null });
  const [busyId, setBusyId] = useState(null);

  const fetchSupervision = useCallback(async (force) => {
    const res = await apiFetch(`/api/admin/products/${encodeURIComponent(productCode)}/ingredient-supervision`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    ingredientSupervisionCache.set(productCode, json);
    return json;
  }, [productCode]);

  useEffect(() => {
    if (!productCode) return undefined;
    let active = true;

    const cached = ingredientSupervisionCache.get(productCode);
    if (cached) {
      setState({ status: "ready", data: cached });
      return undefined;
    }

    setState({ status: "loading", data: null });
    fetchSupervision()
      .then((json) => { if (active) setState({ status: "ready", data: json }); })
      .catch(() => { if (active) setState({ status: "error", data: null }); });

    return () => { active = false; };
  }, [productCode, fetchSupervision]);

  async function setIngredientStatus(ing, status) {
    setBusyId(ing.ingredientId);
    try {
      const res = await apiFetch(`/api/admin/ingredient-dictionary/product-ingredients/${encodeURIComponent(productCode)}/${ing.ingredientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ingredientSupervisionCache.delete(productCode);
      const json = await fetchSupervision(true);
      setState({ status: "ready", data: json });
    } catch (e) {
      // surface minimally; keep panel usable
      setState((prev) => ({ ...prev }));
    } finally {
      setBusyId(null);
    }
  }

  const title = <div className="rq-ing-title">สารสำคัญ</div>;

  if (state.status === "loading") {
    return <div className="rq-ing"><div className="rq-ing-card">{title}<p className="rq-ing-muted">⏳ กำลังโหลด...</p></div></div>;
  }
  if (state.status === "error") {
    return <div className="rq-ing"><div className="rq-ing-card">{title}<p className="rq-ing-muted">โหลดข้อมูลสารสำคัญไม่สำเร็จ</p></div></div>;
  }

  const ingredients = state.data?.ingredients || [];
  const categorySuggestions = state.data?.categorySuggestions || [];

  if (!ingredients.length && !categorySuggestions.length) {
    return <div className="rq-ing"><div className="rq-ing-card">{title}<p className="rq-ing-muted">ยังไม่มีข้อมูลสารสำคัญ</p></div></div>;
  }

  return (
    <div className="rq-ing">
      <div className="rq-ing-card">
        {title}

        {ingredients.length > 0 && (
          <ul className="rq-ing-list">
            {ingredients.map((ing) => {
              const strength = formatIngredientStrength(ing);
              const drugClasses = (ing.drugClasses || []).map((dc) => dc.name).filter(Boolean);
              const indications = (ing.indications || []).map((ind) => ind.name).filter(Boolean);
              return (
                <li key={ing.ingredientId} className={`rq-ing-item${ing.status === "rejected" ? " rq-ing-item-rejected" : ""}`}>
                  <div className="rq-ing-head">
                    <span className="rq-ing-name">
                      {ing.displayName || ing.canonicalName}
                      {strength && <span className="rq-ing-strength"> {strength}</span>}
                    </span>
                    {ing.status && (
                      <span className={`rq-ing-status rq-ing-status-${ing.status}`}>
                        {INGREDIENT_STATUS_LABELS[ing.status] || ing.status}
                      </span>
                    )}
                    <span className="rq-ing-actions">
                      <button
                        type="button"
                        className={`id-confirm-btn ok${ing.status === "confirmed" ? " on" : ""}`}
                        title="ยืนยันสารนี้"
                        disabled={busyId === ing.ingredientId}
                        onClick={() => setIngredientStatus(ing, "confirmed")}
                      >✓</button>
                      <button
                        type="button"
                        className={`id-confirm-btn no${ing.status === "rejected" ? " on" : ""}`}
                        title="ปฏิเสธสารนี้"
                        disabled={busyId === ing.ingredientId}
                        onClick={() => setIngredientStatus(ing, "rejected")}
                      >✗</button>
                    </span>
                  </div>
                  {drugClasses.length > 0 && (
                    <div className="rq-ing-line rq-ing-class">{drugClasses.join(" · ")}</div>
                  )}
                  {indications.length > 0 && (
                    <div className="rq-ing-line rq-ing-indication">{indications.join(" / ")}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {categorySuggestions.length > 0 && (
          <div className="rq-ing-suggest">
            <div className="rq-ing-suggest-title">หมวดที่แนะนำจากสารสำคัญ</div>
            {categorySuggestions.map((sug, i) => (
              <button
                key={`${sug.categoryName}-${i}`}
                type="button"
                className="rq-ing-suggest-btn"
                onClick={() => onUseCategory && onUseCategory(sug.categoryName)}
                title={sug.reason || sug.categoryName}
              >
                <span className="rq-ing-suggest-cat">{sug.categoryName}</span>
                {sug.reason && <span className="rq-ing-suggest-reason">{sug.reason}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewQueuePanel({ csrfToken }) {
  // phase: idle → reviewing → summary → done
  const [phase, setPhase]           = useState("idle");
  const [queue, setQueue]           = useState([]);          // current batch of products
  const [allCategories, setAllCats] = useState([]);          // every known confirmed category
  const [totalInQueue, setTotal]    = useState(null);
  const [loading, setLoading]       = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Per-session state
  const [decisions, setDecisions]   = useState([]);          // [{productCode,productNameThai,categoryName,isNew?,skipped?}]
  const [currentIdx, setCurrentIdx] = useState(0);           // index into queue[]
  const [search, setSearch]         = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState("");

  const searchRef  = useRef(null);
  const newCatRef  = useRef(null);

  // ── Load queue ──────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async (filter) => {
    setLoading(true);
    try {
      const f = filter || statusFilter;
      const response = await apiFetch(`/api/admin/review-queue?limit=80&status=${f}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setQueue(data.records || []);
      setAllCats(data.allCategories || []);
      setTotal(data.total || 0);
      return (data.records || []).length;
    } catch (e) {
      setSubmitMsg("โหลดคิวไม่สำเร็จ: " + e.message);
      return 0;
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // ── Current product ─────────────────────────────────────────────────────────
  const product = queue[currentIdx] || null;

  // Category options sorted: proposed first (if any), then by similarity
  const options = useMemo(() => {
    if (!product) return [];
    const opts = [...(product.options || [])];
    if (product.currentCategory && !opts.find(o => o.category_name === product.currentCategory)) {
      opts.unshift({ category_name: product.currentCategory, similarity: null, isProposed: true });
    }
    return opts;
  }, [product]);

  const searchableCategories = useMemo(() => {
    const byName = new Map();

    for (const option of options) {
      const name = normalizeFilterValue(option?.category_name);
      if (!name) continue;
      byName.set(name, {
        category_name: name,
        similarity: option?.similarity ?? null,
        isProposed: Boolean(option?.isProposed),
      });
    }

    for (const category of allCategories) {
      const name = normalizeFilterValue(category);
      if (!name || byName.has(name)) continue;
      byName.set(name, {
        category_name: name,
        similarity: null,
        isProposed: false,
      });
    }

    return [...byName.values()].sort((left, right) => {
      if (left.isProposed && !right.isProposed) return -1;
      if (!left.isProposed && right.isProposed) return 1;
      return left.category_name.localeCompare(right.category_name, "th", {
        sensitivity: "base",
        numeric: true,
      });
    });
  }, [options, allCategories]);

  // Filtered options for search
  const filteredOptions = useMemo(() => {
    const q = normalizeCategorySearchValue(search);
    if (!q) return options.slice(0, 9);
    return searchableCategories
      .filter((option) => normalizeCategorySearchValue(option.category_name).includes(q))
      .slice(0, 9);
  }, [search, options, searchableCategories]);

  // ── Decision helpers ────────────────────────────────────────────────────────
  const pickCategory = useCallback((categoryName, isNew = false) => {
    if (!product) return;
    setDecisions(prev => {
      const next = prev.filter(d => d.productCode !== product.productCode);
      next.push({ productCode: product.productCode, productNameThai: product.productNameThai, categoryName, isNew, skipped: false });
      return next;
    });
    setSearch("");
    setShowNewCat(false);
    setNewCatName("");
    if (currentIdx + 1 >= queue.length) {
      setPhase("summary");
    } else {
      setCurrentIdx(i => i + 1);
    }
  }, [product, currentIdx, queue.length]);

  const skipProduct = useCallback(() => {
    if (!product) return;
    setDecisions(prev => {
      const next = prev.filter(d => d.productCode !== product.productCode);
      next.push({ productCode: product.productCode, productNameThai: product.productNameThai, categoryName: null, skipped: true });
      return next;
    });
    setSearch("");
    if (currentIdx + 1 >= queue.length) {
      setPhase("summary");
    } else {
      setCurrentIdx(i => i + 1);
    }
  }, [product, currentIdx, queue.length]);

  const goBack = useCallback(() => {
    if (currentIdx === 0) return;
    setDecisions(prev => prev.filter(d => d.productCode !== (queue[currentIdx - 1]?.productCode)));
    setSearch("");
    setShowNewCat(false);
    setCurrentIdx(i => i - 1);
  }, [currentIdx, queue]);

  const createNewCategory = useCallback(() => {
    const name = newCatName.trim();
    if (!name) return;
    apiFetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
    setAllCats(prev => [...new Set([...prev, name])].sort());
    pickCategory(name, true);
  }, [newCatName, csrfToken, pickCategory]);

  // ── Keyboard handler ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "reviewing") return;
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && filteredOptions[n - 1]) {
        e.preventDefault();
        pickCategory(filteredOptions[n - 1].category_name);
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        goBack();
      } else if ((e.key === "s" || e.key === "S") && !e.ctrlKey) {
        e.preventDefault();
        skipProduct();
      } else if ((e.key === "n" || e.key === "N") && !e.ctrlKey) {
        e.preventDefault();
        setShowNewCat(true);
        setTimeout(() => newCatRef.current?.focus(), 50);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, filteredOptions, pickCategory, goBack, skipProduct]);

  // ── Confirm batch ───────────────────────────────────────────────────────────
  async function confirmAll() {
    const toConfirm = decisions.filter(d => !d.skipped && d.categoryName);
    if (!toConfirm.length) return;
    setSubmitting(true);
    setSubmitMsg("");
    try {
      const response = await apiFetch("/api/admin/review-queue/confirm-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({ decisions: toConfirm.map(d => ({ productCode: d.productCode, categoryName: d.categoryName, isNewCategory: d.isNew || false })) }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setSubmitMsg(`ยืนยันสำเร็จ ${toConfirm.length} รายการ`);
      setPhase("done");
    } catch (e) {
      setSubmitMsg("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startSession() {
    setDecisions([]);
    setCurrentIdx(0);
    setSearch("");
    setShowNewCat(false);
    setNewCatName("");
    setSubmitMsg("");
    setPhase("reviewing");
  }

  function resetAll() {
    setPhase("idle");
    setQueue([]);
    setDecisions([]);
    setCurrentIdx(0);
    setTotal(null);
    setSubmitMsg("");
  }

  const confirmed  = decisions.filter(d => !d.skipped && d.categoryName).length;
  const skipped    = decisions.filter(d => d.skipped).length;
  const progress   = queue.length ? Math.round(((confirmed + skipped) / queue.length) * 100) : 0;

  // ── IDLE ────────────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "done") {
    return (
      <section className="panel rq-panel">
        <div className="panel-header">
          <h2>ตรวจหมวดสินค้า</h2>
          <p>ยืนยันหมวดของสินค้าที่ระบบยังไม่แน่ใจ — แต่ละรายการใช้เวลาไม่กี่วินาที</p>
        </div>

        {submitMsg && <p className="notice success compact">{submitMsg}</p>}

        <div className="rq-start-grid">
          {[
            { key: "all",          label: "ทั้งหมด",                desc: "รอตรวจ + ต้องทบทวน" },
            { key: "proposed",     label: "รอตรวจ",                  desc: "ระบบเดาไว้ รอ approve" },
            { key: "needs_review", label: "ต้องทบทวน",               desc: "ระบบไม่รู้ ต้องหาเอง" },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`rq-start-card${statusFilter === opt.key ? " active" : ""}`}
              onClick={() => setStatusFilter(opt.key)}
            >
              <strong>{opt.label}</strong>
              <span>{opt.desc}</span>
            </button>
          ))}
        </div>

        <div className="rq-start-actions">
          <button
            type="button"
            className="primary-button"
            onClick={async () => {
              const loaded = await loadQueue(statusFilter);
              if (loaded > 0) {
                startSession();
              } else {
                setSubmitMsg("ไม่พบสินค้าในคิวสำหรับตัวกรองนี้");
              }
            }}
            disabled={loading}
          >
            {loading ? "กำลังโหลด..." : "เริ่มตรวจ →"}
          </button>
          {totalInQueue !== null && (
            <span className="rq-queue-count">
              {totalInQueue.toLocaleString()} รายการในคิว
            </span>
          )}
        </div>
      </section>
    );
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  if (phase === "summary") {
    return (
      <section className="panel rq-panel">
        <div className="rq-summary-header">
          <h2>สรุปก่อนยืนยัน</h2>
          <p>ตรวจสอบรายการด้านล่าง แก้ไขได้ก่อนกด "ยืนยันทั้งหมด"</p>
        </div>

        {submitMsg && <p className={`notice ${submitMsg.includes("ผิด") ? "error" : "success"} compact`}>{submitMsg}</p>}

        <div className="rq-summary-stats">
          <span className="rq-stat good">{confirmed} รายการพร้อม</span>
          {skipped > 0 && <span className="rq-stat muted">{skipped} ข้าม</span>}
        </div>

        <div className="rq-summary-list">
          {decisions.filter(d => !d.skipped).map((d, i) => (
            <div key={d.productCode} className="rq-summary-row">
              <span className="rq-summary-name">{d.productNameThai}</span>
              <span className={`rq-summary-cat${d.isNew ? " new" : ""}`}>
                {d.categoryName}
                {d.isNew && <span className="rq-new-badge">ใหม่</span>}
              </span>
              <button
                type="button"
                className="ghost-button rq-edit-btn"
                onClick={() => {
                  setCurrentIdx(i);
                  setDecisions(prev => prev.filter((_, idx) => idx !== i));
                  setPhase("reviewing");
                }}
              >
                แก้
              </button>
            </div>
          ))}
        </div>

        <div className="rq-summary-actions">
          <button type="button" className="ghost-button" onClick={() => setPhase("reviewing")}>
            ← กลับตรวจต่อ
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={confirmAll}
            disabled={submitting || confirmed === 0}
          >
            {submitting ? "กำลังบันทึก..." : `✓ ยืนยัน ${confirmed} รายการ`}
          </button>
        </div>
      </section>
    );
  }

  // ── REVIEWING ───────────────────────────────────────────────────────────────
  if (!product) {
    return (
      <section className="panel rq-panel">
        <p className="empty-state">คิวว่าง — ไม่มีสินค้าที่ต้องตรวจ</p>
        <button type="button" className="ghost-button" onClick={resetAll}>กลับ</button>
      </section>
    );
  }

  return (
    <section className="panel rq-panel rq-reviewing">
      {/* ── top bar ── */}
      <div className="rq-topbar">
        <button type="button" className="ghost-button rq-back-btn" onClick={goBack} disabled={currentIdx === 0} title="← กลับ (ArrowLeft)">
          ←
        </button>
        <div className="rq-progress-wrap">
          <div className="rq-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <span className="rq-counter">{currentIdx + 1} / {queue.length}</span>
        <button type="button" className="ghost-button rq-summary-btn" onClick={() => setPhase("summary")}>
          สรุป ({confirmed})
        </button>
      </div>

      {/* ── product name ── */}
      <div className="rq-product">
        <div className="rq-product-name">{product.productNameThai}</div>
        {product.productNameEng && <div className="rq-product-eng">{product.productNameEng}</div>}
        <div className="rq-product-meta">
          {product.productCode}
          {product.barcode && <> · {product.barcode}</>}
          {product.reviewStatus === "proposed" && product.currentCategory && (
            <span className="rq-proposed-badge">ระบบเดา: {product.currentCategory}</span>
          )}
        </div>
      </div>

      {/* ── ingredient knowledge layer (read-only) ── */}
      <IngredientSuggestions productCode={product.productCode} onUseCategory={pickCategory} csrfToken={csrfToken} />

      {/* ── category buttons ── */}
      {!showNewCat && (
        <div className="rq-options">
          {filteredOptions.map((opt, i) => (
            <button
              key={opt.category_name}
              type="button"
              className={`rq-option${opt.category_name === product.currentCategory ? " rq-option-proposed" : ""}`}
              onClick={() => pickCategory(opt.category_name)}
              title={opt.similarity ? `${Math.round(opt.similarity * 100)}% similarity` : ""}
            >
              <span className="rq-option-key">{i + 1}</span>
              <span className="rq-option-name">{opt.category_name}</span>
              {opt.similarity != null && (
                <span className="rq-option-sim">{Math.round(opt.similarity * 100)}%</span>
              )}
            </button>
          ))}
          {!filteredOptions.length && (
            <div className="rq-option-empty">
              ไม่พบหมวดที่ตรงกับคำค้น ลองพิมพ์คำอื่นหรือสร้างหมวดใหม่
            </div>
          )}
        </div>
      )}

      {/* ── search ── */}
      {!showNewCat && (
        <div className="rq-search-row">
          <input
            ref={searchRef}
            type="text"
            className="rq-search"
            placeholder="/ ค้นหาหมวด..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") { setSearch(""); e.target.blur(); }
              if (e.key === "Enter" && filteredOptions.length === 1) pickCategory(filteredOptions[0].category_name);
            }}
          />
        </div>
      )}

      {/* ── new category ── */}
      {showNewCat ? (
        <div className="rq-newcat-row">
          <input
            ref={newCatRef}
            type="text"
            className="rq-search"
            placeholder="ชื่อหมวดใหม่..."
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") createNewCategory();
              if (e.key === "Escape") { setShowNewCat(false); setNewCatName(""); }
            }}
            autoFocus
          />
          <button type="button" className="primary-button" onClick={createNewCategory} disabled={!newCatName.trim()}>
            สร้าง + เลือก
          </button>
          <button type="button" className="ghost-button" onClick={() => { setShowNewCat(false); setNewCatName(""); }}>
            ยกเลิก
          </button>
        </div>
      ) : (
        <div className="rq-footer-actions">
          <button type="button" className="ghost-button rq-newcat-btn" onClick={() => { setShowNewCat(true); setTimeout(() => newCatRef.current?.focus(), 50); }} title="N">
            + สร้างหมวดใหม่
          </button>
          <button type="button" className="ghost-button rq-skip-btn" onClick={skipProduct} title="S">
            ข้ามไปก่อน
          </button>
        </div>
      )}

      {/* ── keyboard hint ── */}
      <div className="rq-hints">
        <span>1–9 เลือก</span><span>/ ค้นหา</span><span>N หมวดใหม่</span><span>S ข้าม</span><span>← กลับ</span>
      </div>
    </section>
  );
}

export default ReviewQueuePanel;
