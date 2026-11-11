import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/apiClient.js";

const BASE = "/api/admin/ky9-documents/archive";
const blank = { q: "", branch: "", dateFrom: "", dateTo: "", lot: "" };
function query(filters, offset = 0) {
  const p = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  p.set("offset", String(offset)); p.set("limit", "50"); return p.toString();
}
function date(value) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}$/.test(value)) return `${value.slice(5)}/${Number(value.slice(0, 4)) + 543}`;
  const parsed = new Date(value + "T00:00:00+07:00");
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}
async function read(path, signal) {
  const res = await apiFetch(BASE + path, { signal }); const body = await res.json();
  if (!res.ok) throw new Error(body.error || "โหลดคลังร่างไม่สำเร็จ"); return body;
}
export default function Ky9ArchivePanel() {
  const [form, setForm] = useState(blank), [applied, setApplied] = useState(blank), [offset, setOffset] = useState(0);
  const [batches, setBatches] = useState([]), [result, setResult] = useState(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [detail, setDetail] = useState(null), [exporting, setExporting] = useState(false);
  const detailSeq = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; detailSeq.current += 1; }; }, []);
  useEffect(() => {
    const c = new AbortController();
    read("/batches", c.signal).then(v => setBatches(v.batches || [])).catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController(); setLoading(true); setResult(null); setDetail(null); setError(""); detailSeq.current += 1;
    read("/rows?" + query(applied, offset), c.signal).then(setResult).catch(e => { if (!c.signal.aborted) setError(e.message); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [applied, offset]);
  const dirty = JSON.stringify(form) !== JSON.stringify(applied);
  const rows = result?.rows || [], total = result?.total || 0;
  async function show(row) {
    const seq = ++detailSeq.current; setDetail(null);
    try { const value = await read(`/rows/${row.row_key}?batch=${row.batch_id}`); if (alive.current && seq === detailSeq.current) setDetail(value); }
    catch (e) { if (alive.current && seq === detailSeq.current) setError(e.message); }
  }
  async function download() {
    setExporting(true); setError("");
    try {
      const value = await read("/handoff?" + query(applied));
      if (!alive.current) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "StockDay_KY9_receiving_lots_for_KY10_KY11.json";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setExporting(false); }
  }
  const input = (name, label, type = "text") => <label className="ky9-field"><span>{label}</span><input type={type} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} /></label>;
  return <section className="ky9-card ky9-archive" aria-label="คลังร่างรับเข้าและล็อต">
    <h3>ค้นสินค้าและล็อตข้ามเดือน</h3>
    <p className="ky9-scope-note">ข้อมูลร่าง ขย.9 แยกจากยอดสต๊อกจริง · ล็อตที่เป็นข้อเสนอยังคงรอเภสัชกรตรวจ</p>
    <div className="ky9-archive-batches">{batches.filter(b => b.is_current).map(b => <span key={b.id} title={b.label}>
      {b.period.slice(5)}/{Number(b.period.slice(0, 4)) + 543} · {b.row_count.toLocaleString()} รายการ · {b.label}
    </span>)}</div>
    <form aria-label="ค้นคลังร่าง" onSubmit={e => { e.preventDefault(); setOffset(0); setApplied({ ...form }); }}>
      <div className="ky9-archive-filters">
        {input("q", "สินค้า / SKU / ล็อต / ใบรับ / ใบโอน")}
        <label className="ky9-field"><span>สาขา</span><select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}>
          <option value="">ทุกสาขา</option>{["000", "001", "003", "004", "005"].map(b => <option key={b}>{b}</option>)}
        </select></label>
        {input("dateFrom", "รับตั้งแต่วันที่", "date")}{input("dateTo", "รับถึงวันที่", "date")}{input("lot", "ล็อตตรงตัว")}
      </div>
      <div className="ky9-actions"><button type="submit" className="primary-button">ค้นรายการ</button>
        <button type="button" className="ghost-button" onClick={() => { setForm(blank); setApplied({ ...blank }); setOffset(0); }}>ล้างตัวกรอง</button>
        <button type="button" className="ghost-button" disabled={loading || dirty || exporting || !total} onClick={download}>
          {exporting ? "กำลังเตรียมข้อมูล…" : "ส่งต่อ ขย.10/11 (JSON)"}</button></div>
      {dirty ? <p className="ky9-muted">กดค้นรายการเพื่อใช้ตัวกรองใหม่ก่อนส่งออก</p> : null}
    </form>
    {error ? <p role="alert" className="ky9-warning">{error}</p> : null}
    {loading ? <p role="status">กำลังค้นคลังร่าง…</p> : result ? <>
      <p aria-live="polite">พบ {total.toLocaleString()} รายการ{total ? ` · แสดง ${offset + 1}–${Math.min(offset + 50, total)}` : ""}</p>
      {!rows.length ? <p className="ky9-muted">ยังไม่มีรายการตามตัวกรองนี้</p> : <div className="ky9-archive-scroll"><table className="ky9-archive-table">
        <thead><tr>{["วันที่รับ / สาขา", "สินค้า", "ล็อต / หมดอายุ", "จำนวนตามร่าง", "ใบรับ / ใบโอน / ใบกำกับ", "ที่มา"].map(t => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={`${r.batch_id}:${r.row_key}`}>
          <td>{date(r.received_date)}<br />สาขา {r.branch_code}</td><td><strong>{r.product_name}</strong><br /><small>{r.product_code}</small></td>
          <td>{r.lot || "ไม่ระบุล็อต"}<br /><small>{r.expiry ? `หมดอายุ ${date(r.expiry)}` : ""}</small>
            {r.movement_type === "transfer_receipt" && r.physical_lot_confirmed !== true ? <p className="ky9-muted">ล็อตเสนอให้ตรวจ</p> : null}</td>
          <td>{r.quantity_display || `${r.quantity ?? ""} ${r.unit || ""}`}{r.free_goods ? <small> · ของแถม</small> : null}</td>
          <td>{r.document_no}<br /><small>{r.invoice_no}</small><br /><small>{r.supplier}</small></td>
          <td><button type="button" className="ghost-button" onClick={() => show(r)}>ดูหลักฐานรายการ</button><br /><small>{r.batch_label}</small></td>
        </tr>)}</tbody></table></div>}
      <div className="ky9-actions"><button type="button" className="ghost-button" disabled={offset === 0 || loading} onClick={() => setOffset(v => Math.max(0, v - 50))}>หน้าก่อน</button>
        <button type="button" className="ghost-button" disabled={offset + 50 >= total || loading} onClick={() => setOffset(v => v + 50)}>หน้าถัดไป</button></div>
    </> : null}
    {detail ? <section className="ky9-archive-detail" aria-label="หลักฐานของรายการ">
      <div className="ky9-section-heading"><h4>{detail.product_name} · {detail.product_code}</h4><button type="button" className="ghost-button" onClick={() => { detailSeq.current += 1; setDetail(null); }}>ปิดหลักฐาน</button></div>
      <p>ไฟล์ {detail.source_file || "—"} · ชุด {detail.batch_label} · เลขเอกสาร {detail.document_no}</p>
      <p className="ky9-pre">SHA ของภาพ: {detail.source_sha256 || "ไม่ระบุ"}</p>
      <p>คงข้อมูลและข้อยกเว้นตามร่างต้นทาง ยังไม่ใช่การยืนยันล็อตจริงหรือการลงนาม</p>
      <details><summary>ข้อมูลรายการและที่มาเดิม</summary><pre>{JSON.stringify({ row: detail.data, archiveManifest: detail.manifest }, null, 2)}</pre></details>
    </section> : null}
  </section>;
}
