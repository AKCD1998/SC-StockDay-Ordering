import { useEffect, useState } from 'react';
import './member-registration-targets.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const number = value => value == null ? '—' : Number(value).toLocaleString('th-TH');
const thaiDate = value => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00+07:00`));
const thaiTime = value => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
function currentMonth() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

export default function MemberRegistrationTargets() {
  const [month, setMonth] = useState(() => currentMonth() < '2026-11' ? '2026-11' : currentMonth());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true; setLoading(true); setError('');
      const requestController = new AbortController();
      const abort = () => requestController.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 20_000);
      try {
        const response = await fetch(`${apiBaseUrl}/api/member-registration-targets?month=${encodeURIComponent(month)}`, {
          credentials: 'include', cache: 'no-store', signal: requestController.signal,
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw Error(body.error || 'โหลดข้อมูลสมัครสมาชิกไม่สำเร็จ');
        if (body.month !== month || !Array.isArray(body.branches) || !Array.isArray(body.daily)) throw Error('ข้อมูลสมัครสมาชิกไม่สมบูรณ์');
        if (!controller.signal.aborted) setReport(body);
      } catch (failure) {
        if (!controller.signal.aborted) { setReport(null); setError(failure.name === 'AbortError' ? 'เชื่อมต่อ SCCRM นานเกินไป กรุณาลองใหม่' : failure.message || 'โหลดข้อมูลสมัครสมาชิกไม่สำเร็จ'); }
      } finally { clearTimeout(timeout); controller.signal.removeEventListener('abort', abort); pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    setReport(null); load();
    const timer = setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [month, refreshKey]);

  const isCurrentMonth = report?.asOfDate.startsWith(month);
  return (
    <section className="mrt-section fp-section" aria-labelledby="mrt-title" aria-busy={loading}>
      <header className="mrt-header">
        <div><span className="mrt-eyebrow">CRM · สมาชิกใหม่</span><h3 id="mrt-title">เป้าสมัครสมาชิกใหม่รายสาขา</h3><p>เริ่ม 1 พฤศจิกายน 2569 · เป้ารายเดือน · อัปเดตอัตโนมัติทุก 1 นาที</p></div>
        <div className="mrt-controls"><label htmlFor="mrt-month">เดือนที่รายงาน<input id="mrt-month" type="month" min="2026-11" max="2099-12" value={month} onChange={event => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value >= '2026-11') setMonth(event.target.value); }} /></label><button type="button" className="fp-btn-secondary" disabled={loading} onClick={() => setRefreshKey(key => key + 1)}>{loading ? 'กำลังโหลด…' : 'รีเฟรชยอด'}</button></div>
      </header>
      {error && <div className="fp-form-error" role="alert">{error} <button className="fp-btn-link" type="button" onClick={() => setRefreshKey(key => key + 1)}>ลองใหม่</button></div>}
      {loading && !report && <p role="status">กำลังโหลดข้อมูลสมัครสมาชิกจาก SCCRM…</p>}
      {report && <>
        {report.partialMonth && <p className="mrt-notice">เริ่มเก็บยอดแยกสาขา {thaiTime(report.trackingStartedAt)} · ยอดก่อนหน้านี้ยังไม่มีข้อมูลยืนยันและไม่รวมในรายงาน</p>}
        <div className="mrt-cards">
          {report.branches.map(branch => <article className="mrt-card" key={branch.branchCode}>
            <div className="mrt-card-heading"><h4>สาขา {branch.branchCode}</h4><span className={`mrt-badge${branch.remaining === 0 ? ' is-achieved' : ''}`}>{branch.remaining === 0 ? 'ถึงเป้าแล้ว' : `เหลือ ${number(branch.remaining)} คน`}</span></div>
            <div className="mrt-count"><strong>{number(branch.total)}</strong><span>/ {number(branch.target)} คน</span></div>
            <progress aria-label={`ความคืบหน้าสาขา ${branch.branchCode}`} max={branch.target} value={Math.min(branch.total, branch.target)} />
            <div className="mrt-card-footer"><span>{isCurrentMonth ? `วันนี้ +${number(branch.today)} คน` : 'ยอดสะสมในเดือนที่เลือก'}</span><strong>{number(branch.percent)}%</strong></div>
          </article>)}
        </div>
        {report.unassignedTotal > 0 && <p className="mrt-notice">ยังไม่ระบุสาขา {number(report.unassignedTotal)} คน · แสดงแยกจากเป้าสาขา</p>}
        <details className="mrt-daily" open><summary>ยอดสมัครใหม่รายวัน <span>เวลาไทย (Asia/Bangkok)</span></summary><div className="mrt-table-wrap"><table className="mrt-table"><caption className="sr-only">ยอดสมัครใหม่รายวัน เดือน {month}</caption><thead><tr><th scope="col">วันที่</th>{report.branches.map(branch => <th scope="col" key={branch.branchCode}>สาขา {branch.branchCode}</th>)}{report.unassignedTotal != null && <th scope="col">ไม่ระบุสาขา</th>}<th scope="col">รวม</th></tr></thead><tbody>
          {report.daily.map(day => <tr key={day.date} className={day.date === report.asOfDate ? 'is-today' : ''}><th scope="row">{thaiDate(day.date)}{day.date === report.asOfDate && <span className="mrt-today">วันนี้</span>}</th>{report.branches.map(branch => <td key={branch.branchCode}>{number(day.byBranch[branch.branchCode])}</td>)}{report.unassignedTotal != null && <td>{number(day.unassigned)}</td>}<td>{day.status === 'recorded' ? number(Object.values(day.byBranch).reduce((sum, value) => sum + (value || 0), day.unassigned || 0)) : day.status === 'future' ? '—' : 'ยังไม่เก็บข้อมูล'}</td></tr>)}
        </tbody><tfoot><tr><th scope="row">รวมเดือนนี้</th>{report.branches.map(branch => <td key={branch.branchCode}>{number(branch.total)}</td>)}{report.unassignedTotal != null && <td>{number(report.unassignedTotal)}</td>}<td>{number(report.branches.reduce((sum, branch) => sum + branch.total, report.unassignedTotal || 0))}</td></tr></tfoot></table></div></details>
        <p className="mrt-source">ข้อมูลสมัครใหม่จาก SCCRM · ไม่รวมการนำเข้าหรือซิงก์สมาชิกเดิม · ล่าสุด {thaiTime(report.generatedAt)}</p>
      </>}
    </section>
  );
}
