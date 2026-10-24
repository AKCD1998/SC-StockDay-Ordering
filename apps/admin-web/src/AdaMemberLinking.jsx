import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './lib/apiClient.js';

const base = '/api/admin/sccrm-members';
const date = value => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value)) : 'ยังไม่พบบิล';
async function request(path, options = {}) {
  const response = await apiFetch(base + path, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'กรุณาเข้าสู่ระบบใหม่' : response.status === 403 ? 'สิทธิ์หรือเซสชันเปลี่ยนแล้ว กรุณาโหลดหน้าเว็บใหม่' : body.error || 'โหลดข้อมูลไม่ได้ กรุณาลองใหม่'), { status: response.status });
  return body;
}

function LinkDialog({ member, csrfToken, onClose, onLinked, onAccessDenied }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(''), [confirmed, setConfirmed] = useState(false);
  const dialog = useRef(null), closeButton = useRef(null), controller = useRef(null);
  const load = useCallback(async () => {
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setData(null); setSelected(''); setConfirmed(false); setError(''); setBusy(true);
    try {
      const value = await request('/' + encodeURIComponent(member.id) + '/ada-links', { signal: next.signal });
      if (value.member?.id !== member.id || !Array.isArray(value.candidates) || !Array.isArray(value.linkedCodes)) throw new Error('ข้อมูลสมาชิกไม่ถูกต้อง กรุณาโหลดใหม่');
      if (!next.signal.aborted) setData(value);
    } catch (failure) { if (!next.signal.aborted) { if ([401, 403].includes(failure.status)) onAccessDenied(failure.message); else setError(failure.message); } }
    finally { if (!next.signal.aborted) setBusy(false); }
  }, [member.id, onAccessDenied]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    function key(event) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')], first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [onClose]);
  const choice = data?.candidates.find(c => c.adaCode === selected);
  async function save(event) {
    event.preventDefault();
    if (!choice || !confirmed || busy || !csrfToken || data.linkedCodes.length) return;
    const next = new AbortController(); controller.current = next; setBusy(true); setError('');
    try {
      const value = await request('/' + encodeURIComponent(member.id) + '/ada-links', { method: 'POST', signal: next.signal,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ adaCode: choice.adaCode, reviewToken: choice.reviewToken }) });
      if (value.memberId !== member.id || value.adaCode !== choice.adaCode) throw new Error('ยังยืนยันผลไม่ได้ กรุณาโหลดรายการใหม่ก่อนลองอีกครั้ง');
      if (!next.signal.aborted) onLinked(choice.adaCode);
    } catch (failure) { if (!next.signal.aborted) { setSelected(''); setConfirmed(false); if ([401, 403].includes(failure.status)) onAccessDenied(failure.message); else setError(failure.message); } }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  return <div className="members-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="members-history ada-link-dialog" role="dialog" aria-modal="true" aria-labelledby="ada-link-title">
      <header className="members-history-header"><div><span className="members-eyebrow">เลือกรหัสลูกค้าเดิมใน Ada</span><h3 id="ada-link-title">{member.name}</h3><p>{member.memberCode} · {member.phone}</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label="ปิดหน้าผูกรหัส Ada">×</button></header>
      <form className="members-history-body" onSubmit={save}>
        <p className="members-hint">รหัสด้านล่างมีเบอร์ตรงกับสมาชิกคนนี้ ตรวจชื่อและประวัติก่อนเลือก · การผูกจะนำประวัติมาแสดงใน SCCRM โดยเก็บข้อมูลเดิมใน Ada ไว้</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        {busy && <p role="status">{data ? 'กำลังยืนยันการผูก…' : 'กำลังโหลดรหัส Ada…'}</p>}
        {data?.linkedCodes.length > 0 && <p className="ada-link-notice" role="status">สมาชิกนี้ผูกกับ {data.linkedCodes.join(', ')} แล้ว โหลดรายการใหม่เพื่อดูสถานะล่าสุด</p>}
        {data?.candidates.length === 0 && <p className="members-empty">ไม่พบรหัส Ada ที่เบอร์ตรงกันแล้ว กรุณาโหลดรายการใหม่</p>}
        <fieldset className="ada-candidates" disabled={busy || Boolean(data?.linkedCodes.length)}><legend>เลือกรหัส Ada ของลูกค้าคนนี้</legend>
          {data?.candidates.map(c => {
            const taken = c.linkedMemberId && c.linkedMemberId !== member.id;
            return <label className={`ada-candidate ${selected === c.adaCode ? 'selected' : ''}`} key={c.adaCode}>
              <input type="radio" name="ada-code" value={c.adaCode} disabled={Boolean(taken)} checked={selected === c.adaCode} onChange={() => { setSelected(c.adaCode); setConfirmed(false); }} aria-label={`${c.adaCode} ${c.name}`} />
              <span><strong className="member-code">{c.adaCode}</strong><strong className="ada-candidate-name">{c.name || 'ไม่ระบุชื่อ'}</strong><span>{c.phone || 'ไม่ระบุเบอร์'} · สาขา {c.branchCode || 'ไม่ระบุ'} · {c.isActive ? 'ใช้งานใน Ada' : 'ปิดใช้งานใน Ada'}</span><span>บิลขาย {c.saleCount} ใบ · ใบคืน {c.returnCount} ใบ · ซื้อล่าสุด {date(c.lastSaleAt)}</span>{taken && <span className="ada-link-warning">ผูกกับ {c.linkedMemberName || 'สมาชิกอื่น'} แล้ว เลือกรหัสนี้ไม่ได้</span>}</span>
            </label>;
          })}
        </fieldset>
        {choice && <div className="ada-link-confirm"><p>นำประวัติจาก <strong>{choice.adaCode} — {choice.name}</strong> มาแสดงให้ <strong>{member.name} ({member.memberCode})</strong></p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />ตรวจสอบแล้วว่าเป็นลูกค้าคนเดียวกัน</label></div>}
        {!csrfToken && <p className="notice error">กรุณาโหลดหน้าเว็บใหม่ก่อนยืนยันการผูก</p>}
        <div className="ada-link-actions"><button type="button" className="member-history-button" disabled={busy} onClick={load}>โหลดรายการใหม่</button><button type="submit" className="members-primary" disabled={!choice || !confirmed || busy || !csrfToken || Boolean(data?.linkedCodes.length)}>ยืนยันผูกรหัส Ada</button></div>
      </form>
    </section>
  </div>;
}

export default function AdaMemberLinking({ csrfToken, onLinked, onAccessDenied }) {
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [data, setData] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [selected, setSelected] = useState(null);
  const close = useCallback(() => setSelected(null), []);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    request('/ada-links?' + new URLSearchParams({ page: String(page), limit: '25' }), { signal: controller.signal })
      .then(value => { if (!Array.isArray(value.members)) throw new Error('ข้อมูลรายการรอผูกไม่ถูกต้อง'); if (!controller.signal.aborted) setData(value); })
      .catch(failure => { if (!controller.signal.aborted) { if ([401, 403].includes(failure.status)) onAccessDenied(failure.message); else setError(failure.message); } });
    return () => controller.abort();
  }, [page, refresh, onAccessDenied]);
  function linked(code) { setSelected(null); setMessage(`ผูกกับ ${code} แล้ว ประวัติการซื้อจะอยู่ที่สมาชิกคนเดิม`); setPage(1); setRefresh(x => x + 1); onLinked(); }
  return <section className="ada-linking" aria-labelledby="ada-pending-title">
    <div className="members-header"><div><h3 id="ada-pending-title">สมาชิกที่รอเลือกรหัส Ada</h3><p>เลือกด้วยบัญชีแอดมิน เมื่อเบอร์ตรงกับลูกค้าเดิมใน Ada</p></div><button className="member-history-button" type="button" onClick={() => setRefresh(x => x + 1)}>โหลดรายการรอผูกใหม่</button></div>
    {message && <p className="ada-link-notice" role="status">{message}</p>}{error && <p className="notice error" role="alert">{error}</p>}
    {!data && !error && <p role="status">กำลังโหลดรายการรอผูก…</p>}
    {data?.total === 0 && <p className="members-empty">ไม่มีสมาชิกที่รอเลือกรหัส Ada เมื่อมีเบอร์ตรงกับลูกค้าเดิม รายชื่อจะปรากฏที่นี่</p>}
    {data?.members.map(m => <div className="ada-pending-member" key={m.id}><div><strong>{m.name}</strong><p>{m.memberCode} · {m.phone} · พบ {m.candidateCount} รหัส Ada</p></div><button className="member-history-button" type="button" onClick={() => { setMessage(''); setSelected(m); }}>เลือกรหัส Ada ให้ {m.name}</button></div>)}
    {data?.total > 25 && <nav className="members-pagination" aria-label="หน้ารายการรอผูก Ada"><button type="button" disabled={page === 1} onClick={() => setPage(x => x - 1)}>ก่อนหน้า</button><span>หน้า {page} / {Math.ceil(data.total / 25)}</span><button type="button" disabled={page * 25 >= data.total} onClick={() => setPage(x => x + 1)}>ถัดไป</button></nav>}
    {selected && <LinkDialog key={selected.id} member={selected} csrfToken={csrfToken} onClose={close} onLinked={linked} onAccessDenied={onAccessDenied} />}
  </section>;
}
