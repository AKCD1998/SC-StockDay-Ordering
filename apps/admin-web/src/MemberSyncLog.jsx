import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './lib/apiClient.js';

const when = value => value && !Number.isNaN(Date.parse(value))
  ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : '—';

export default function MemberSyncLog({ member, csrfToken, onClose, onAccessDenied }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef(null), dialog = useRef(null), closeButton = useRef(null), retrying = useRef(false);
  const base = '/api/admin/sccrm-members/' + encodeURIComponent(member.id) + '/sync-status';
  const load = useCallback(async () => {
    if (retrying.current) return;
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setBusy(true); setError('');
    try {
      const response = await apiFetch(base, { signal: next.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.error || 'ยังอ่านประวัติการส่งไม่ได้'), { status: response.status });
      if (body.member?.id !== member.id || !Array.isArray(body.jobs) || !Array.isArray(body.events)) throw Error('ข้อมูลสมาชิกไม่ตรง กรุณาโหลดใหม่');
      if (!next.signal.aborted) setData(body);
    } catch (failure) { if (!next.signal.aborted) { if ([401, 403].includes(failure.status)) onAccessDenied(failure.message); else setError(failure.message); } }
    finally { if (!next.signal.aborted) setBusy(false); }
  }, [base, member.id, onAccessDenied]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 10000);
    return () => { clearInterval(timer); controller.current?.abort(); }; }, [load]);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    function key(event) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = [...dialog.current.querySelectorAll('button:not(:disabled),[tabindex="0"]')], first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [onClose]);
  async function retry(jobId) {
    if (busy || retrying.current || !csrfToken) return;
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    retrying.current = true; setBusy(true); setError('');
    let succeeded = false;
    try {
      const response = await apiFetch(base + '/retry', { method: 'POST', signal: next.signal,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ jobId }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw Object.assign(Error(body.error || 'ยังรับคำขอลองใหม่ไม่ได้'), { status: response.status });
      succeeded = true;
    } catch (failure) { if (!next.signal.aborted) { if ([401, 403].includes(failure.status)) onAccessDenied(failure.message); else setError(failure.message); } }
    finally { retrying.current = false; if (!next.signal.aborted) { setBusy(false); if (succeeded) void load(); } }
  }
  return <div className="members-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="members-history member-sync-dialog" role="dialog" aria-modal="true" aria-labelledby="member-sync-title">
      <header className="members-history-header"><div><span className="members-eyebrow">ประวัติการส่งข้อมูล SCCRM ↔ Ada</span><h3 id="member-sync-title">{member.name || 'สมาชิก'}</h3><p>{member.memberCode || 'รอรหัส Ada'} · {member.phone || 'ไม่ระบุเบอร์'}</p></div>
        <button type="button" ref={closeButton} aria-label="ปิดประวัติการส่งข้อมูล" onClick={onClose}>×</button></header>
      <div className="members-history-body">
        <p className="members-hint">ข้อมูลที่บันทึกใน SCCRM เปิดดูได้ก่อน งานส่ง Ada ทำต่อเบื้องหลัง · ตรวจสถานะใหม่ทุก 10 วินาที · เวลาไทย</p>
        <button type="button" className="member-history-button" disabled={busy} onClick={load}>โหลดสถานะใหม่</button>
        {error && <p role="alert" className="notice error">{error}</p>}
        {busy && <p role="status">กำลังตรวจสถานะ…</p>}
        {data && <>
          <p className={'member-sync-summary ' + data.summary?.state}>{data.summary?.label || 'ยังไม่มีผลตรวจการส่ง'}</p>
          <div className="member-sync-stages"><div><strong>SCCRM</strong><span>บันทึกสมาชิกแล้ว</span></div><div><strong>Ada HQ 000</strong><span>{data.summary?.hqReady ? 'ตรวจพบสมาชิกแล้ว' : 'รอส่งข้อมูล'}</span><small>{data.summary?.adaCode}</small></div>
            {data.summary?.branches?.map(branch => <div key={branch.branchCode}><strong>สาขา {branch.branchCode}</strong><span>{branch.ready ? 'ตรวจพบสมาชิกแล้ว' : branch.state === 'review' ? 'ต้องตรวจสอบ' : 'รอส่ง / รอตรวจ'}</span><small>{when(branch.completedAt)}</small></div>)}
          </div>
          {data.jobs.length > 0 && <><h4>รายการที่ติดตาม</h4><div className="members-table-scroll"><table className="members-table"><thead><tr><th>รายการ</th><th>สถานะ</th><th>ตรวจแล้ว</th><th>ดำเนินการ</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td>{job.kind === 'member' ? 'สมัครสมาชิก' : `บิล ${job.receiptNo}`}<small className="member-sync-small">สาขา {job.branchCode}</small></td><td>{job.label}{job.deliveries?.map(delivery => <small className="member-sync-small" key={delivery.branchCode}>{delivery.branchCode === '000' ? 'HQ 000' : 'สาขา ' + delivery.branchCode}: {delivery.state === 'succeeded' ? 'ตรวจพบข้อมูลแล้ว' : delivery.label}</small>)}</td><td>{job.attempts} ครั้ง</td><td>{!['running', 'succeeded'].includes(job.state) && <button type="button" className="member-history-button" disabled={busy || !csrfToken} onClick={() => retry(job.id)}>ลองใหม่</button>}</td></tr>)}</tbody></table></div></>}
          <h4>ประวัติการส่งและตรวจข้อมูล</h4>
          {data.events.length ? <ol className="member-sync-timeline">{data.events.map((event, index) => <li key={`${event.at}-${event.code}-${index}`}><time dateTime={event.at}>{when(event.at)}</time><strong>{event.label}</strong>{event.branch_code && <span>{event.branch_code === '000' ? 'HQ 000' : 'สาขา ' + event.branch_code}</span>}{event.receipt_no && <span>บิล {event.receipt_no}</span>}</li>)}</ol> : <p className="members-hint">ยังไม่มีประวัติการส่งที่บันทึกไว้สำหรับสมาชิกนี้</p>}
        </>}
      </div>
    </section>
  </div>;
}
