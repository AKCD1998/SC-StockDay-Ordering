import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiClient.js";
import "./pjk-documents.css";

const API = "/api/admin/pjk-documents";
const monthLabel = value => value ? `${value.slice(5)}/${Number(value.slice(0, 4)) + 543}` : "ไม่ระบุเดือนเวร";
export default function PjkDocumentsPanel() {
  const [form, setForm] = useState({ month: "", branch: "", q: "" });
  const [filters, setFilters] = useState(form), [offset, setOffset] = useState(0);
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setData(null);
    const params = new URLSearchParams({ ...filters, offset: String(offset) });
    apiFetch(`${API}/?${params}`, { signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw Error(body.error || "โหลดเอกสารไม่สำเร็จ");
      if (!controller.signal.aborted) setData(body);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, offset]);
  async function open(doc) {
    setOpening(doc.id); setError("");
    try {
      const response = await apiFetch(`${API}/${doc.id}/pdf`);
      if (!response.ok) throw Error("เปิด PDF ไม่สำเร็จ");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = `PJK-${doc.month || "legacy"}-${doc.branch}-${doc.id.slice(0, 12)}.pdf`;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError(e.message); } finally { setOpening(null); }
  }
  return <section className="pjk-panel" aria-label="คลังเอกสาร ภจก.1">
    <header><p className="pjk-eyebrow">เภสัชกร / เอกสารปฏิบัติการ</p><h2>ภจก.1</h2>
      <p>แบบแจ้งเภสัชกรเข้าปฏิบัติหน้าที่แทน แยกตามเดือนและสาขา</p>
      {data ? <p className="pjk-muted">รวม {data.archiveTotal} ฉบับ · รวบรวม ณ {data.asOf} · แนบภาพลายเซ็นผู้รับอนุญาตตามคำสั่งแล้ว</p> : null}</header>
    <form className="pjk-filters" onSubmit={e => { e.preventDefault(); setOffset(0); setFilters({ ...form }); }}>
      <label>เดือนเวร<select value={form.month} onChange={e => setForm({ ...form, month: e.target.value })}>
        <option value="">ทุกเดือน</option>{(data?.months || []).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        <option value="unknown">เอกสารเดิมไม่ระบุเดือนเวร</option></select></label>
      <label>สาขา<select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}>
        <option value="">ทุกสาขา</option>{["001", "003", "004", "005"].map(b => <option key={b}>{b}</option>)}</select></label>
      <label>ค้นหาเภสัชกร<input value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} placeholder="ชื่อ หรือเลขใบประกอบวิชาชีพ" /></label>
      <button className="primary-button">ค้นหา</button>
    </form>
    {error ? <p role="alert" className="pjk-error">{error}</p> : null}
    {loading ? <p role="status">กำลังโหลดเอกสาร…</p> : null}
    {data ? <><p>พบ {data.total} ฉบับ</p>
      {data.exclusions.length ? <details><summary>รายการที่เว้นไว้ตามคำสั่ง ({data.exclusions.length})</summary>
        {data.exclusions.map((x, i) => <p key={i}>{x.date} · สาขา {x.branch} · {x.reason}</p>)}</details> : null}
      <div className="pjk-table"><table><thead><tr><th>เดือน / สาขา</th><th>เภสัชกรและวันปฏิบัติงาน</th><th>ที่มา</th><th>เอกสาร</th></tr></thead>
        <tbody>{data.documents.map(d => <tr key={d.id}><td><strong>{monthLabel(d.month)}</strong><br />สาขา {d.branch}</td>
          <td>{d.slots.length ? d.slots.map((s, i) => <p key={i}><strong>{s.pharmacistName}</strong> · {s.pharmacistLicense}<br />{s.dateStart} – {s.dateEnd} · {s.timeStart}–{s.timeEnd}</p>) : "ไม่พบช่วงเวรในข้อมูลเดิม"}</td>
          <td>{d.sourceSheet || "ข้อมูลที่บันทึกใน DigitalPJK เดิม"}<br /><small>{d.provenance === "legacy-regenerated" ? "สร้าง PDF ใหม่จากข้อมูลเดิม" : "ไฟล์ PDF ที่สร้างจากตารางเวร"}</small>{d.note ? <p>{d.note}</p> : null}</td>
          <td><button type="button" className="ghost-button" disabled={opening === d.id} onClick={() => open(d)}>{opening === d.id ? "กำลังดาวน์โหลด…" : "ดาวน์โหลด PDF"}</button></td></tr>)}</tbody></table></div>
      {!data.documents.length ? <p>ไม่มีเอกสารตรงกับเงื่อนไข</p> : null}
      <div className="pjk-pager"><button type="button" disabled={!offset || loading} onClick={() => setOffset(v => Math.max(0, v - 50))}>ก่อนหน้า</button>
        <span>{data.total ? offset + 1 : 0}–{Math.min(offset + 50, data.total)} / {data.total}</span>
        <button type="button" disabled={offset + 50 >= data.total || loading} onClick={() => setOffset(v => v + 50)}>ถัดไป</button></div></> : null}
  </section>;
}
