import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/apiClient.js";
import "./ky9-documents.css";

export const BRANCHES = ["000", "001", "003", "004", "005"];
const COVERAGE = { in_progress: "กำลังรวบรวม / ตรวจ", collected: "ครบตามหลักฐานที่รวบรวมได้", reconciled: "ตรวจเทียบครบทั้งงวดแล้ว" };
const REVIEW = { not_sent: "ยังไม่ส่งตรวจ", sent: "ส่งตรวจที่สถานที่แล้ว", signed: "บันทึกว่าตรวจและเซ็นเก็บแล้ว" };
const STATUS = { investigating: "กำลังตรวจสอบ", waiting: "รอข้อมูล / รอแก้ไข", closed: "บันทึกข้อยุติแล้ว" };
const ACTION = { created: "เปิดรายการ", updated: "แก้ไขรายละเอียด", closed: "บันทึกข้อยุติ", reopened: "เปิดติดตามอีกครั้ง",
  progress_updated: "ปรับความคืบหน้า", added: "เพิ่มหมายเหตุ", registered: "ลงทะเบียนรุ่นเอกสาร", draft_review_reset: "เริ่มส่งตรวจรุ่นใหม่" };
const EMPTY_INCIDENT = {
  title: "", branchCodes: ["000"], supplier: "", products: "", invoiceRefs: "", stockRefs: "",
  facts: "", hypotheses: "", checks: "", evidence: "", owner: "", nextAction: "", impact: "",
  status: "investigating", blocksPeriod: true, resolutionType: "", conclusion: "",
};
const stamp = value => new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
function bangkokMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find(x => x.type === "year").value}-${parts.find(x => x.type === "month").value}`;
}
function Field({ label, children }) { return <label className="ky9-field"><span>{label}</span>{children}</label>; }
function Text({ label, value, onChange, required = false, maxLength = 12000, multiline = false }) {
  const props = { value, onChange: e => onChange(e.target.value), required, maxLength };
  return <Field label={label}>{multiline ? <textarea rows={3} {...props} /> : <input {...props} />}</Field>;
}
function Select({ label, value, onChange, options }) {
  return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)}>
    {Object.entries(options).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
  </select></Field>;
}

const HISTORY_FIELDS = {
  title: "หัวข้อ", branchCodes: "สาขา", supplier: "บริษัท", products: "สินค้า / SKU", invoiceRefs: "ใบกำกับ", stockRefs: "ใบรับ / ใบโอน",
  facts: "ข้อเท็จจริง", hypotheses: "ข้อสันนิษฐาน", checks: "ตรวจแล้ว", evidence: "หลักฐาน", owner: "ผู้รับผิดชอบ",
  nextAction: "สิ่งที่รอ", impact: "ผลต่องวด", status: "สถานะเคส", blocksPeriod: "ขวางการปิดงวด",
  resolutionType: "ข้อยุติ", conclusion: "ข้อสรุป", closed_by: "ผู้บันทึกข้อยุติ", closed_at: "วันบันทึกข้อยุติ",
  body: "ข้อความ", recorded_by: "ผู้บันทึก", created_at: "วันบันทึก", period: "งวด", version: "รุ่นข้อมูล",
  branch_code: "สาขา", label: "รุ่นเอกสาร", reference: "แหล่งเก็บ", url: "ลิงก์",
};
function HistorySnapshot({ value }) {
  if (!value) return <p className="ky9-muted">ยังไม่มีรายการ</p>;
  const flattened = { ...value, ...value.data };
  return <div className="ky9-history-snapshot">
    {Object.entries(HISTORY_FIELDS).filter(([key]) => flattened[key] != null && flattened[key] !== "").map(([key, title]) => {
      const raw = flattened[key];
      const display = key === "status" ? STATUS[raw] : key === "resolutionType"
        ? raw === "corrected" ? "แก้ไขแล้ว" : "ยุติการสืบค้นและคงข้อแตกต่าง"
        : typeof raw === "boolean" ? raw ? "ใช่" : "ไม่ใช่" : Array.isArray(raw) ? raw.join(", ")
        : key.endsWith("_at") ? stamp(raw) : String(raw);
      return <p key={key} className="ky9-pre"><strong>{title}:</strong> {display}</p>;
    })}
    {value.branches ? BRANCHES.map(code => <div key={code}><strong>สาขา {code}</strong>
      <p>{COVERAGE[value.branches[code].coverage]} · {REVIEW[value.branches[code].review]}</p>
      {value.branches[code].pendingReason ? <p className="ky9-pre">รอ: {value.branches[code].pendingReason}</p> : null}
      {value.branches[code].reviewReference ? <p className="ky9-pre">หลักฐานการตรวจ: {value.branches[code].reviewReference}</p> : null}
    </div>) : null}
  </div>;
}

function IncidentForm({ incident, saving, onSave, onCancel }) {
  const formRef = useRef(null);
  const [data, setData] = useState(() => incident ? structuredClone(incident.data) : { ...EMPTY_INCIDENT });
  const [reason, setReason] = useState(incident?.sourceKey ? "นำบันทึกหลักฐานเดิมมาทบทวนและสร้างเคส" : "");
  useEffect(() => { formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); formRef.current?.querySelector("input")?.focus({ preventScroll: true }); }, []);
  const set = (key, value) => setData(current => ({ ...current, [key]: value }));
  return <form ref={formRef} className="ky9-card ky9-editor" aria-label="บันทึกเคส" onSubmit={e => {
    e.preventDefault(); onSave(incident, { data, reason, expectedVersion: incident?.version });
  }}>
    <h3>{incident?.id ? "รายละเอียดและข้อยุติของเคส" : "เปิดเคสปัญหา"}</h3>
    {incident?.sourceKey ? <p className="ky9-warning">เตรียมจากหลักฐานเดิม ณ {incident.evidenceAsOf} กรุณาทบทวนก่อนบันทึก ไม่ใช่ผลตรวจข้อมูลสด</p> : null}
    <fieldset disabled={saving}>
      <Text label="หัวข้อเคส" required value={data.title} onChange={v => set("title", v)} maxLength={300} />
      <div className="ky9-field"><span>สาขาที่เกี่ยวข้อง</span><div className="ky9-checks">
        {BRANCHES.map(code => <label key={code}><input type="checkbox" checked={data.branchCodes.includes(code)}
          onChange={e => set("branchCodes", e.target.checked ? [...data.branchCodes, code] : data.branchCodes.filter(x => x !== code))} />{code}</label>)}
      </div></div>
      <div className="ky9-two">
        <Text label="บริษัท / ผู้จำหน่าย" value={data.supplier} onChange={v => set("supplier", v)} maxLength={500} />
        <Text label="สินค้า / SKU (หนึ่งรายการต่อบรรทัด)" multiline value={data.products} onChange={v => set("products", v)} maxLength={4000} />
        <Text label="เลขใบกำกับ" value={data.invoiceRefs} onChange={v => set("invoiceRefs", v)} maxLength={2000} />
        <Text label="เลขใบรับ / ใบโอน" value={data.stockRefs} onChange={v => set("stockRefs", v)} maxLength={4000} />
      </div>
      <Text label="ข้อเท็จจริงที่พบ" required multiline value={data.facts} onChange={v => set("facts", v)} />
      <Text label="ข้อสันนิษฐาน (ยังไม่ยืนยัน)" multiline value={data.hypotheses} onChange={v => set("hypotheses", v)} />
      <Text label="ตรวจอะไรไปแล้ว / ตัดความเป็นไปได้อะไรแล้ว" multiline value={data.checks} onChange={v => set("checks", v)} />
      <Text label="หลักฐาน / แหล่งเก็บ / sourceID / คำยืนยัน" multiline required={data.status === "closed"}
        value={data.evidence} onChange={v => set("evidence", v)} />
      <div className="ky9-two">
        <Text label="ผู้รับผิดชอบ" value={data.owner} onChange={v => set("owner", v)} maxLength={300} />
        <Text label="สิ่งที่รอ / งานถัดไป" multiline value={data.nextAction} onChange={v => set("nextAction", v)} maxLength={4000} />
        <Select label="สถานะเคส" value={data.status} options={STATUS} onChange={v => setData(current => ({
          ...current, status: v, blocksPeriod: v === "closed" ? false : current.blocksPeriod,
          resolutionType: v === "closed" ? current.resolutionType || "documented_unresolved" : "",
        }))} />
        <Text label="ผลต่องวด / รายการและรุ่นเอกสารที่ต้องแก้" multiline required={data.status === "closed"}
          value={data.impact} onChange={v => set("impact", v)} maxLength={4000} />
      </div>
      <label className="ky9-inline"><input type="checkbox" checked={data.blocksPeriod} disabled={data.status === "closed"}
        onChange={e => set("blocksPeriod", e.target.checked)} />ยังขวางการปิดงวด</label>
      {data.status === "closed" ? <div className="ky9-closure">
        <Select label="ข้อยุติ" value={data.resolutionType} onChange={v => set("resolutionType", v)} options={{
          documented_unresolved: "ยุติการสืบค้น — เก็บข้อแตกต่างที่ยังแก้ไม่ได้",
          corrected: "แก้ไขแล้ว — ระบุสิ่งที่แก้และหลักฐาน",
        }} />
        <Text label="ข้อสรุปและวิธีจัดการต่อ" required multiline value={data.conclusion} onChange={v => set("conclusion", v)} />
        <p>การบันทึกข้อยุติไม่เปลี่ยนข้อมูลใน Ada และไม่ถือว่าเภสัชกรตรวจหรือเซ็นแล้ว</p>
      </div> : null}
      <Text label="เหตุผลการบันทึกครั้งนี้" required value={reason} onChange={setReason} maxLength={4000} />
      <div className="ky9-actions"><button className="primary-button" type="submit">{saving ? "กำลังบันทึก…" : "บันทึกเคส"}</button>
        <button className="ghost-button" type="button" onClick={onCancel}>ยกเลิก</button></div>
    </fieldset>
    {incident?.closed_at ? <p className="ky9-muted">ข้อยุติบันทึกโดย {incident.closed_by} · {stamp(incident.closed_at)}</p> : null}
  </form>;
}

function ProgressForm({ period, saving, onSave }) {
  const [branches, setBranches] = useState(() => structuredClone(period.branches));
  const [reason, setReason] = useState("");
  const set = (code, key, value) => setBranches(current => ({ ...current, [code]: { ...current[code], [key]: value } }));
  return <details className="ky9-card"><summary>ปรับความคืบหน้าของแต่ละสาขา</summary>
    <form onSubmit={e => { e.preventDefault(); onSave({ branches, reason, expectedVersion: period.version }); }}>
      <fieldset disabled={saving}>
        {BRANCHES.map(code => <div className="ky9-progress-edit" key={code}><h4>สาขา {code}</h4>
          <div className="ky9-two">
            <Select label={`ความครบของข้อมูล ${code}`} options={COVERAGE} value={branches[code].coverage} onChange={v => set(code, "coverage", v)} />
            <Select label={`ตรวจและลงนาม ${code}`} options={REVIEW} value={branches[code].review} onChange={v => set(code, "review", v)} />
            <Text label={`สิ่งที่รอ ${code}`} value={branches[code].pendingReason} onChange={v => set(code, "pendingReason", v)} maxLength={4000} />
            <Text label={`หลักฐานการตรวจลงนาม ${code}`} required={branches[code].review === "signed"}
              value={branches[code].reviewReference} onChange={v => set(code, "reviewReference", v)} maxLength={4000} />
          </div>
        </div>)}
        <Text label="เหตุผลการปรับความคืบหน้า" required value={reason} onChange={setReason} maxLength={4000} />
        <button className="primary-button" type="submit">บันทึกความคืบหน้า</button>
      </fieldset>
    </form>
  </details>;
}

function DraftForm({ bundle, saving, onSave }) {
  const [data, setData] = useState({ branchCode: "000", label: "", reference: "", url: "", reason: "" });
  const set = (key, value) => setData(current => ({ ...current, [key]: value }));
  const current = bundle.drafts.find(d => d.is_current && d.branch_code === data.branchCode);
  return <details className="ky9-card"><summary>ลงทะเบียนร่าง PDF / รุ่นเอกสาร</summary>
    <p className="ky9-muted">อ้างอิงไฟล์ที่จัดทำแล้ว รุ่นใหม่จะแทนรุ่นเดิมและเริ่มสถานะส่งตรวจของสาขานี้ใหม่</p>
    <form onSubmit={e => { e.preventDefault(); onSave({ ...data, expectedVersion: bundle.period.version, supersedes: current?.id || null }); }}>
      <fieldset disabled={saving}>
        <div className="ky9-two">
          <Select label="สาขาของเอกสาร" value={data.branchCode} onChange={v => set("branchCode", v)}
            options={Object.fromEntries(BRANCHES.map(code => [code, code]))} />
          <Text label="รุ่นเอกสาร" required value={data.label} onChange={v => set("label", v)} maxLength={300} />
        </div>
        <Text label="ชื่อไฟล์ / แหล่งเก็บ PDF" required value={data.reference} onChange={v => set("reference", v)} maxLength={4000} />
        <Text label="ลิงก์ HTTPS (ถ้ามี)" value={data.url} onChange={v => set("url", v)} maxLength={2000} />
        <Text label="เหตุผล / สิ่งที่แก้ในรุ่นนี้" required value={data.reason} onChange={v => set("reason", v)} maxLength={4000} />
        {current ? <p>แทนรุ่น {current.label} · {current.reference}</p> : null}
        <button className="primary-button" type="submit">บันทึกรุ่นเอกสาร</button>
      </fieldset>
    </form>
  </details>;
}

// This boundary also protects standalone rendering; API enforces the same role.
export default function Ky9DocumentsPanel({ isAdminUser, csrfToken }) {
  return isAdminUser ? <AdminDocuments csrfToken={csrfToken} /> : null;
}

function AdminDocuments({ csrfToken }) {
  const [period, setPeriod] = useState(bangkokMonth);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [branch, setBranch] = useState("all");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState(null);
  const [note, setNote] = useState("");
  const [noteCase, setNoteCase] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const requestSeq = useRef(0);
  const writeInFlight = useRef(false);
  const mounted = useRef(true);
  const [reload, setReload] = useState(0);
  const path = `/api/admin/ky9-documents/${period}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const read = useCallback(async (signal) => {
    const res = await apiFetch(path, { signal });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "โหลดทะเบียนเอกสารไม่สำเร็จ");
    return body;
  }, [path]);
  useEffect(() => {
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    setLoading(true); setBundle(null); setError(""); setMessage(""); setEditor(null); setNote(""); setNoteCase("");
    read(controller.signal).then(body => {
      if (seq === requestSeq.current) setBundle(body);
    }).catch(err => {
      if (!controller.signal.aborted && seq === requestSeq.current) setError(err.message);
    }).finally(() => { if (seq === requestSeq.current) setLoading(false); });
    return () => controller.abort();
  }, [read, reload]);
  async function perform(suffix, method, body, success) {
    if (writeInFlight.current) return false;
    writeInFlight.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await apiFetch(path + suffix, {
        method, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
      // A failed refresh after a successful write must not look like a failed write.
      try { const fresh = await read(); if (mounted.current) setBundle(fresh); }
      catch { if (mounted.current) setError("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดโหลดข้อมูลล่าสุด"); }
      if (mounted.current) setMessage(success);
      return true;
    } catch (err) { if (mounted.current) setError(err.message); return false; }
    finally { writeInFlight.current = false; if (mounted.current) setSaving(false); }
  }
  async function moreHistory() {
    const seq = requestSeq.current;
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`${path}/events?before=${bundle.nextBefore}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "โหลดประวัติไม่สำเร็จ");
      if (seq === requestSeq.current) setBundle(current => ({
        ...current, events: [...current.events, ...data.events], nextBefore: data.nextBefore,
      }));
    } catch (err) { if (seq === requestSeq.current) setError(err.message); }
    finally { if (mounted.current) setHistoryLoading(false); }
  }
  const hasPeriod = Boolean(bundle?.period);
  const incidents = bundle?.incidents || [];
  const visible = incidents.filter(item => (branch === "all" || item.data.branchCodes.includes(branch))
    && (filter === "all" || (filter === "blocking" ? item.data.blocksPeriod : item.data.status === filter)));
  const blockers = incidents.filter(item => item.data.blocksPeriod);
  const unresolved = incidents.filter(item => item.data.status === "closed" && item.data.resolutionType === "documented_unresolved");
  const year = Number(period.slice(0, 4));
  return <section className="ky9-documents" aria-label="เอกสาร ขย.9">
    <header className="ky9-document-hero">
      <div><span className="ky9-eyebrow">ทะเบียนเอกสาร · สำหรับ admin</span><h2>เอกสาร ขย.9</h2>
        <p>ติดตามงวดเอกสาร ข้อแตกต่าง และข้อยุติของแต่ละสาขา</p></div>
      <div className="ky9-period-picker">
        <Field label="เดือนเอกสาร"><select aria-label="เดือนเอกสาร" value={period.slice(5)} disabled={saving}
          onChange={e => setPeriod(`${year}-${e.target.value}`)}>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>
            {new Intl.DateTimeFormat("th-TH", { month: "long" }).format(new Date(2026, i, 1))}
          </option>)}
        </select></Field>
        <Field label="ปี พ.ศ."><select aria-label="ปี พ.ศ." value={year} disabled={saving}
          onChange={e => setPeriod(`${e.target.value}-${period.slice(5)}`)}>
          {Array.from({ length: 100 }, (_, i) => <option key={i} value={2000 + i}>{2543 + i}</option>)}
        </select></Field>
      </div>
    </header>
    <p className="ky9-scope-note">งวดตามวันที่รับสินค้า · วันที่บันทึกงานเก็บแยกในประวัติ · การเก็บสแกนครบไม่เท่ากับตรวจใบรับครบทั้งเดือน</p>
    <div className="ky9-actions">
      <button type="button" className="ghost-button" disabled={saving || loading} onClick={() => setReload(x => x + 1)}>โหลดข้อมูลล่าสุด</button>
      <span className="ky9-muted">การโหลดใหม่จะปิดแบบฟอร์มเคสที่ยังไม่บันทึก</span>
    </div>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    {message ? <p className="notice success" role="status">{message}</p> : null}
    {loading ? <p role="status">กำลังโหลดทะเบียนเอกสาร…</p> : !bundle ? null : !hasPeriod ? <div className="ky9-card ky9-empty">
      <h3>ยังไม่ได้เปิดงวด {period.slice(5)}/{year + 543}</h3>
      <p>เปิดงวดเพื่อเริ่มบันทึกสถานะ เคส และหมายเหตุของบริษัท</p>
      <button className="primary-button" disabled={saving} onClick={() => perform("", "POST", { reason: "เปิดงวดเอกสาร ขย.9" }, "เปิดงวดแล้ว")}>เปิดงวดนี้</button>
    </div> : <>
      {bundle.preparedIncidents?.length ? <p className="ky9-warning">
        มีบันทึกหลักฐานเดิม {bundle.preparedIncidents.length} เคสรอทบทวนด้านล่าง ยังไม่รวมในสถานะของเคสที่บันทึกแล้ว
      </p> : null}
      <div className="ky9-summary">
        <div><strong>{BRANCHES.filter(code => bundle.period.branches[code].coverage === "reconciled").length}/5</strong><span>สาขาที่ตรวจเทียบครบทั้งงวด</span></div>
        <div><strong>{blockers.length}</strong><span>เคสที่ยังขวางการปิดงวด</span></div>
        <div><strong>{unresolved.length}</strong><span>ยุติการสืบค้นโดยคงข้อแตกต่าง</span></div>
        <div><strong>{BRANCHES.filter(code => bundle.period.branches[code].review === "signed").length}/5</strong><span>สาขาที่บันทึกตรวจและเซ็นเก็บแล้ว</span></div>
      </div>
      <div className="ky9-branches" role="region" aria-label="ความคืบหน้ารายสาขา">{BRANCHES.map(code => {
        const state = bundle.period.branches[code];
        const current = bundle.drafts.find(d => d.branch_code === code && d.is_current);
        const waiting = blockers.filter(x => x.data.branchCodes.includes(code));
        return <article key={code} className="ky9-card ky9-branch"><h3>สาขา {code}{code === "000" ? " · สำนักงานใหญ่" : ""}</h3>
          <p>{COVERAGE[state.coverage]}</p>
          <p className="ky9-muted">{REVIEW[state.review]}</p>
          <p>{current ? `ร่างล่าสุด: ${current.label}` : "ยังไม่ลงทะเบียนร่าง PDF"}</p>
          {current ? <p className="ky9-pre">{current.reference} {current.url ? <a href={current.url} target="_blank" rel="noopener noreferrer">เปิด PDF รุ่นปัจจุบัน</a> : null}</p> : null}
          {state.reviewReference ? <p className="ky9-pre">หลักฐานการตรวจ: {state.reviewReference}</p> : null}
          {waiting.length ? <p className="ky9-warning">ติด {waiting.length} เคส · {waiting.map(x => x.data.title).join(" / ")}</p> : null}
          {state.pendingReason ? <p className="ky9-pre">รอ: {state.pendingReason}</p> : null}
        </article>;
      })}</div>
      <ProgressForm key={`${period}-${bundle.period.version}`} period={bundle.period} saving={saving}
        onSave={body => perform("", "PUT", body, "บันทึกความคืบหน้าแล้ว")} />
      {bundle.preparedIncidents?.length ? <details className="ky9-card"><summary>บันทึกหลักฐานเดิมที่เตรียมให้ทบทวน ({bundle.preparedIncidents.length})</summary>
        <p className="ky9-muted">ยังไม่สร้างหรือยุติเคสให้อัตโนมัติ กรุณาทบทวนวันที่และหลักฐานก่อนบันทึก</p>
        {bundle.preparedIncidents.map(item => <div className="ky9-case" key={item.sourceKey}>
          <div><h4>{item.data.title}</h4><p className="ky9-pre">{item.data.facts}</p></div>
          <button type="button" className="ghost-button" disabled={saving} onClick={() => setEditor(item)}>ทบทวนและสร้างเคส</button>
        </div>)}
      </details> : null}
      <section className="ky9-card">
        <div className="ky9-section-heading"><div><h3>เคสปัญหาและข้อยุติ</h3><p className="ky9-muted">เก็บข้อเท็จจริง สิ่งที่ตรวจแล้ว และเหตุผล เพื่อไม่ค้นซ้ำ</p></div>
          <button type="button" className="primary-button" disabled={saving} onClick={() => setEditor("new")}>เปิดเคสใหม่</button></div>
        <div className="ky9-two">
          <Select label="กรองสาขา" value={branch} onChange={setBranch} options={{ all: "ทุกสาขา", ...Object.fromEntries(BRANCHES.map(code => [code, code])) }} />
          <Select label="กรองสถานะ" value={filter} onChange={setFilter} options={{ all: "ทุกสถานะ", blocking: "ยังขวางการปิดงวด", ...STATUS }} />
        </div>
        {!visible.length ? <p className="ky9-muted">ไม่มีเคสในเงื่อนไขนี้</p> : <div className="ky9-case-list">{visible.map(item =>
          <article className="ky9-case" key={item.id}>
            <div><span className={`ky9-badge ${item.data.status === "closed" ? "closed" : ""}`}>{STATUS[item.data.status]}</span>
              {item.data.blocksPeriod ? <span className="ky9-badge blocking">ขวางการปิดงวด</span> : null}
              <h4>{item.data.title}</h4><p>{item.data.supplier || "ไม่ระบุบริษัท"} · สาขา {item.data.branchCodes.join(", ")}</p>
              <p className="ky9-pre">{item.data.facts}</p>
              {item.data.nextAction && item.data.status !== "closed" ? <p className="ky9-pre">รอ: {item.data.nextAction}</p> : null}
              {item.data.status === "closed" ? <p className="ky9-pre"><strong>{item.data.resolutionType === "corrected" ? "แก้ไขแล้ว" : "ยุติการสืบค้น · ยังมีข้อแตกต่าง"}</strong><br />{item.data.conclusion}</p> : null}
            </div><button type="button" className="ghost-button" disabled={saving} onClick={() => setEditor(item)}>เปิดรายละเอียด</button>
          </article>)}</div>}
      </section>
      {editor ? <IncidentForm key={editor === "new" ? "new" : editor.id || editor.sourceKey} incident={editor === "new" ? null : editor}
        saving={saving} onCancel={() => setEditor(null)} onSave={async (item, body) => {
          if (await perform(item?.id ? `/incidents/${item.id}` : "/incidents", item?.id ? "PUT" : "POST",
            { ...body, ...(item?.sourceKey ? { sourceKey: item.sourceKey } : {}) }, "บันทึกเคสและประวัติแล้ว")) setEditor(null);
        }} /> : null}
      <section className="ky9-card"><h3>หมายเหตุประจำงวด / บันทึกติดตาม</h3>
        <form onSubmit={async e => { e.preventDefault(); if (await perform("/notes", "POST", { body: note, incidentId: noteCase || null }, "เพิ่มหมายเหตุแล้ว")) { setNote(""); setNoteCase(""); } }}>
          <fieldset disabled={saving}>
            <Select label="เชื่อมเคส (ไม่จำเป็น)" value={noteCase} onChange={setNoteCase}
              options={{ "": "หมายเหตุทั่วไปของงวด", ...Object.fromEntries(incidents.map(item => [item.id, item.data.title])) }} />
            <Text label="ข้อความ / คำยืนยัน / กติกาที่ตกลง" required multiline value={note} onChange={setNote} />
            <button type="submit" className="primary-button">เพิ่มหมายเหตุ</button>
          </fieldset>
        </form>
        {bundle.notes.map(item => <article className="ky9-note" key={item.id}>
          <p className="ky9-pre">{item.body}</p><p className="ky9-muted">{item.recorded_by} · {stamp(item.created_at)}
            {item.incident_id ? ` · ${incidents.find(x => x.id === item.incident_id)?.data.title || "เคสที่เชื่อม"}` : ""}</p>
        </article>)}
      </section>
      <DraftForm key={`draft-${period}-${bundle.period.version}`} bundle={bundle} saving={saving}
        onSave={body => perform("/drafts", "POST", body, "บันทึกร่างรุ่นใหม่แล้ว กรุณาส่งตรวจฉบับนี้อีกครั้ง")} />
      {bundle.drafts.some(d => !d.is_current) ? <details className="ky9-card"><summary>ร่างที่ถูกแทนที่ — ใช้ฉบับปัจจุบันในการส่งตรวจ</summary>
        {bundle.drafts.filter(d => !d.is_current).map(d => <p key={d.id} className="ky9-pre">สาขา {d.branch_code} · {d.label} · {d.reference} · เก็บไว้เป็นประวัติ</p>)}
      </details> : null}
      <details className="ky9-card"><summary>ประวัติการบันทึกและเปลี่ยนสถานะ</summary>
        {bundle.events.map(item => <details className="ky9-history" key={item.id}>
          <summary>{stamp(item.created_at)} · {item.actor} · {ACTION[item.action] || item.action}</summary>
          <p className="ky9-pre">เหตุผล: {item.reason}</p>
          <div className="ky9-two"><div><strong>ก่อนเปลี่ยน</strong><HistorySnapshot value={item.before_data} /></div>
            <div><strong>หลังเปลี่ยน</strong><HistorySnapshot value={item.after_data} /></div></div>
        </details>)}
        {bundle.nextBefore ? <button type="button" className="ghost-button" disabled={historyLoading} onClick={moreHistory}>
          {historyLoading ? "กำลังโหลด…" : "ดูประวัติก่อนหน้า"}</button> : null}
      </details>
    </>}
  </section>;
}
