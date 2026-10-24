import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./lib/apiClient.js";
import "./MembersPanel.css";
import AdaMemberLinking from './AdaMemberLinking.jsx';

const base = "/api/admin/sccrm-members";
const number = value => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 6 });
const money = value => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function date(value, withTime = false) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" } : {}) }).format(new Date(value));
}
async function get(path, signal) {
  const response = await apiFetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? "กรุณาเข้าสู่ระบบใหม่" : response.status === 403 ? "หน้านี้สำหรับบัญชีแอดมินเท่านั้น" : response.status === 404 ? "ไม่พบสมาชิกนี้" : "โหลดข้อมูลไม่ได้ กรุณาลองใหม่"), { status: response.status });
  return response.json();
}

function PurchaseHistory({ member, onClose, onAccessDenied }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const request = useRef(null);
  const load = useCallback(async cursor => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "25", ...(cursor ? { cursor } : {}) });
      const value = await get(`${base}/${encodeURIComponent(member.id)}/purchase-history?${query}`, controller.signal);
      if (!Array.isArray(value.purchases) || value.memberId !== member.id) throw new Error("ข้อมูลประวัติไม่ถูกต้อง กรุณาลองใหม่");
      if (!controller.signal.aborted) setData(previous => ({ ...value, purchases: cursor ? [...(previous?.purchases || []), ...value.purchases] : value.purchases }));
    } catch (failure) {
      if (!controller.signal.aborted) {
        if ([401, 403].includes(failure.status)) { setData(null); onAccessDenied(failure.message); }
        else setError(failure.message);
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [member.id, onAccessDenied]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function key(event) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const buttons = [...dialog.current.querySelectorAll("button:not(:disabled), a[href], [tabindex='0']")];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [onClose]);
  return <div className="members-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="members-history" role="dialog" aria-modal="true" aria-labelledby="member-history-title">
      <header className="members-history-header"><div><span className="members-eyebrow">ประวัติการซื้อของสมาชิก</span><h3 id="member-history-title">{member.name || "ไม่ระบุชื่อ"}</h3><p>{member.memberCode || "—"} · {member.phone || "ไม่ระบุเบอร์โทร"}</p></div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="ปิดประวัติการซื้อ">×</button></header>
      <div className="members-history-body">
        <p className="members-hint">แสดงบิลที่พนักงานผูกกับสมาชิกและยืนยันบันทึกแล้ว · วันเวลาไทย (UTC+7)</p>
        {error && <div className="notice error" role="alert">{error} <button type="button" disabled={busy} onClick={() => load(data?.nextCursor)}>ลองใหม่</button></div>}
        {data?.purchases.length === 0 && <p className="members-empty">ยังไม่มีประวัติการซื้อที่บันทึกให้สมาชิกคนนี้</p>}
        {data?.purchases.map(purchase => <article className="member-receipt" key={purchase.claimId}>
          <header><div><strong>บิล {purchase.receiptNo}</strong><p><time dateTime={purchase.soldAt}>{date(purchase.soldAt, true)}</time> · สาขา {purchase.branchCode || "ไม่ระบุ"}{purchase.posCode && ` · POS ${purchase.posCode}`}</p></div><div className="member-receipt-total"><span>ยอดบิล</span><strong>{money(purchase.totalAmount)} บาท</strong>{purchase.totalAmountSource !== "pos_header" && <small>ยอดจากข้อมูลเดิม{purchase.totalAmountSource === "item_sum" ? " (รวมรายการสินค้า)" : ""}</small>}</div></header>
          {purchase.items?.length ? <div className="members-table-scroll" tabIndex="0" aria-label={`รายการสินค้าบิล ${purchase.receiptNo}`}><table className="members-table member-items"><thead><tr><th>SKU</th><th>สินค้า</th><th>หน่วย</th><th className="numeric">จำนวน</th><th className="numeric">ราคา/หน่วย</th><th className="numeric">ยอดรายการ</th></tr></thead><tbody>
            {purchase.items.map((item, index) => <tr key={`${item.seq || index}-${index}`}><td className="member-code">{item.productCode || "ไม่ระบุ"}</td><td>{item.productName || "ไม่ระบุชื่อสินค้า"}</td><td>{item.unitName || item.unitCode || "ไม่ระบุ"}</td><td className="numeric">{number(item.qty)}</td><td className="numeric">{money(item.unitPrice)}</td><td className="numeric">{money(item.lineTotal)}</td></tr>)}
          </tbody></table></div> : <p className="members-hint">บิลนี้ไม่มีรายละเอียดสินค้าในข้อมูลเดิม</p>}
          {purchase.returns?.map(refund => <p className="member-refund" key={refund.refundDocNo}>คืนสินค้า · {refund.refundDocNo} · {date(refund.refundedAt, true)} · {number(refund.returnedQty)} หน่วย · {money(refund.refundTotal)} บาท</p>)}
        </article>)}
        {busy && <p role="status">กำลังโหลดประวัติการซื้อ…</p>}
        {data?.hasMore && !error && <button type="button" className="members-primary" disabled={busy} onClick={() => load(data.nextCursor)}>โหลดประวัติเพิ่ม</button>}
      </div>
    </section>
  </div>;
}

export default function MembersPanel({ isAdmin, csrfToken }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ search: "", page: 1, refresh: 0 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [denied, setDenied] = useState(false);
  const [showLinking, setShowLinking] = useState(false);
  const refreshMembers = useCallback(() => setQuery(value => ({ ...value, page: 1, refresh: value.refresh + 1 })), []);
  const close = useCallback(() => setSelected(null), []);
  const accessDenied = useCallback(message => { setDenied(true); setSelected(null); setData(null); setError(message); }, []);
  useEffect(() => {
    if (!isAdmin) { setData(null); setSelected(null); return; }
    const controller = new AbortController();
    setData(null); setError(""); setDenied(false);
    get(`${base}?${new URLSearchParams({ search: query.search, page: String(query.page), limit: "25" })}`, controller.signal)
      .then(value => { if (!Array.isArray(value.members)) throw new Error("ข้อมูลสมาชิกไม่ถูกต้อง"); if (!controller.signal.aborted) setData(value); })
      .catch(failure => { if (!controller.signal.aborted) { if ([401, 403].includes(failure.status)) accessDenied(failure.message); else setError(failure.message); } });
    return () => controller.abort();
  }, [query, isAdmin, accessDenied]);
  if (!isAdmin) return <section className="panel"><h2>สมาชิก</h2><p>ตารางสมาชิกและประวัติการซื้อเปิดดูได้ด้วยบัญชีแอดมิน</p></section>;
  return <section className="panel members-panel" aria-labelledby="members-title">
    <header className="members-header"><div><span className="members-eyebrow">SCCRM · สมาชิกส่วนกลาง</span><h2 id="members-title">ข้อมูลสมาชิก</h2><p>สมาชิกที่สมัครผ่าน QR และพนักงาน · ข้อมูลชุดเดียวกับหน้าร้าน</p></div><div className="ada-link-actions"><button className="member-history-button" type="button" aria-expanded={showLinking} onClick={() => setShowLinking(value => !value)}>{showLinking ? 'ซ่อนรายการรอผูก Ada' : 'จัดการรหัส Ada'}</button><button type="button" className="ghost-button" onClick={() => { setSelected(null); setQuery(value => ({ ...value, refresh: value.refresh + 1 })); }}>โหลดข้อมูลใหม่</button></div></header>
    {showLinking && !denied && <AdaMemberLinking csrfToken={csrfToken} onLinked={refreshMembers} onAccessDenied={accessDenied} />}
    <form className="members-search" onSubmit={event => { event.preventDefault(); setQuery({ search: search.trim(), page: 1, refresh: query.refresh + 1 }); }}><label htmlFor="members-search-input">ค้นหาสมาชิก<input id="members-search-input" type="search" maxLength={100} placeholder="ชื่อ เบอร์โทร หรือรหัสสมาชิก" value={search} onChange={event => setSearch(event.target.value)} /></label><button className="members-primary" type="submit">ค้นหา</button></form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!data && !error && <p role="status">กำลังโหลดสมาชิก…</p>}
    {data && <><div className="members-table-caption">พบ {number(data.total)} คน{query.search && ` · ผลค้นหา “${query.search}”`}</div>
      {data.members.length ? <div className="members-table-scroll"><table className="members-table"><thead><tr><th>รหัสสมาชิก</th><th>ชื่อ–นามสกุล</th><th>เบอร์โทร</th><th>วันที่สมัคร</th><th>สถานะ</th><th>ประวัติการซื้อ</th></tr></thead><tbody>{data.members.map(member => <tr key={member.id}><td className="member-code">{member.memberCode || "—"}</td><td><strong>{member.name || "ไม่ระบุชื่อ"}</strong></td><td>{member.phone || "—"}</td><td>{date(member.registeredAt)}</td><td><span className={`member-status ${member.isActive ? "active" : "inactive"}`}>{member.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</span></td><td><button type="button" className="member-history-button" aria-label={`ดูประวัติการซื้อ ${member.name || member.memberCode}`} onClick={() => setSelected(member)}>ดูประวัติการซื้อ <span aria-hidden="true">↗</span></button></td></tr>)}</tbody></table></div> : <p className="members-empty">{query.search ? "ไม่พบสมาชิกที่ตรงกับคำค้นหา" : "ยังไม่มีสมาชิก"}</p>}
      <nav className="members-pagination" aria-label="หน้าตารางสมาชิก"><span>หน้า {query.page} / {Math.max(1, Math.ceil(data.total / 25))}</span><div><button type="button" disabled={query.page === 1} onClick={() => setQuery(value => ({ ...value, page: value.page - 1 }))}>ก่อนหน้า</button><button type="button" disabled={query.page * 25 >= data.total} onClick={() => setQuery(value => ({ ...value, page: value.page + 1 }))}>ถัดไป</button></div></nav>
    </>}
    {selected && !denied && <PurchaseHistory key={selected.id} member={selected} onClose={close} onAccessDenied={accessDenied} />}
  </section>;
}
