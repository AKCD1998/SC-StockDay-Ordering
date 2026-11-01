import { useEffect, useRef, useState } from 'react';
import './stock-counts.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const show = value => value === null || value === undefined ? 'ไม่ทราบ' : String(value);
const time = value => value ? new Date(value).toLocaleString('th-TH', { timeZone:'Asia/Bangkok' }) : 'ไม่ทราบเวลา';
const reasons = {
  'partial-coverage':'ตรวจเพียงบางส่วน', 'location-not-full-branch':'ยังไม่ครอบคลุมทั้งสาขา',
  'independent-rounds-not-reconciled':'รอบนับยังไม่กระทบยอด', 'stock-unit-identity-unverified':'หน่วยและสต๊อกร่วมยังไม่ยืนยัน',
  'after-count-movements-unverified':'ยังยืนยันการเคลื่อนไหวหลังนับไม่ได้',
  'count-not-validated-for-selection':'ยังไม่ผ่านการยืนยันเป็นยอดใช้งาน',
  'current-human-quantity-unverified':'ยังยืนยันยอดปัจจุบันจากผลนับไม่ได้', 'no-count-observation':'ยังไม่มีผลนับ',
};
export default function StockCountWorkspace({ productCode = null, csrfToken, onClose }) {
  const [cap,setCap]=useState(null),[scopes,setScopes]=useState([]),[view,setView]=useState(null),[expiry,setExpiry]=useState(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[days,setDays]=useState('180'),[scope,setScope]=useState('');
  const [enrollment,setEnrollment]=useState(null),[activeProduct,setActiveProduct]=useState(productCode),[revision,setRevision]=useState(0);
  const first=useRef(null),previousFocus=useRef(null);
  async function request(path,options={}) {
    const response=await fetch(apiBase+path,{credentials:'include',cache:'no-store',...options,
      headers:{...(options.body?{'Content-Type':'application/json','X-CSRF-Token':csrfToken}:{}),...options.headers}});
    let data;try{data=await response.json();}catch{throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง');}
    if(!response.ok)throw new Error(response.status===401?'เซสชันหมดอายุ กรุณาเข้าสู่ระบบ StockDay อีกครั้ง':response.status===404?'ยังไม่เปิด API ผลนับใน environment นี้':data.error||'อ่านข้อมูลไม่สำเร็จ');
    return data;
  }
  useEffect(()=>{previousFocus.current=document.activeElement;first.current?.focus();return()=>previousFocus.current?.focus?.();},[]);
  useEffect(()=>{let current=true;setLoading(true);setError('');
    Promise.all([request('/api/stock-counts/capabilities'),request('/api/stock-counts/scopes'),activeProduct
      ?request('/api/stock-counts/products/'+encodeURIComponent(activeProduct))
      :request('/api/stock-counts/expiry?days='+days+(scope?'&scopeId='+encodeURIComponent(scope):''))])
      .then(([capability,scopeData,data])=>{if(!current)return;setCap(capability);setScopes(scopeData.scopes);if(activeProduct){setView(data);setExpiry(null);}else{setExpiry(data);setView(null);}})
      .catch(e=>current&&setError(e.message)).finally(()=>current&&setLoading(false));
    return()=>{current=false;};
  },[activeProduct,days,scope,revision]);
  async function mintEnrollment(){try{setError('');setEnrollment(await request('/api/mobile/enroll/start',{method:'POST',body:'{}'}));}catch(e){setError(e.message);}}
  async function createScope(event){event.preventDefault();const form=event.currentTarget,values=new FormData(form);
    try{setError('');await request('/api/stock-counts/scopes',{method:'POST',body:JSON.stringify({sessionKey:values.get('sessionKey'),locationKey:values.get('locationKey'),label:values.get('label'),round:Number(values.get('round')),coverage:values.get('coverage')})});form.reset();setRevision(value=>value+1);}catch(e){setError(e.message);}
  }
  async function loadOriginal(id){try{setError('');const record=await request('/api/stock-counts/events/'+encodeURIComponent(id));setView(current=>({...current,history:current.history.some(item=>item.eventId===id)?current.history:[...current.history,record]}));setTimeout(()=>document.getElementById('stock-count-'+id)?.scrollIntoView?.({behavior:'smooth'}),0);}catch(e){setError(e.message);}}
  async function moreHistory(){try{const older=await request('/api/stock-counts/products/'+encodeURIComponent(activeProduct)+'?before='+view.nextBefore);setView(current=>({...current,history:[...current.history,...older.history],hasMore:older.hasMore,nextBefore:older.nextBefore}));}catch(e){setError(e.message);}}
  function keys(event){if(event.key==='Escape')onClose();if(event.key==='Tab'){
    const controls=[...event.currentTarget.querySelectorAll('button,input,select,textarea,a[href]')].filter(node=>!node.disabled&&!node.hidden);
    if(controls.length&&(event.shiftKey&&document.activeElement===controls[0]||!event.shiftKey&&document.activeElement===controls.at(-1))){event.preventDefault();(event.shiftKey?controls.at(-1):controls[0]).focus();}
  }}
  return <div className="sc-count-backdrop"><section className="sc-count-workspace" role="dialog" aria-modal="true" aria-labelledby="sc-count-title" onKeyDown={keys}>
    <header><div><span>SC STOCKDAY · 001</span><h2 id="sc-count-title">ผลนับสินค้า ล็อต และประวัติ</h2></div><button ref={first} type="button" onClick={onClose} aria-label="ปิดผลนับ">ปิด</button></header>
    <div className="sc-count-toolbar"><button type="button" onClick={()=>setActiveProduct(null)}>ล็อตใกล้หมดอายุ / หมดอายุ</button><button type="button" onClick={()=>setRevision(value=>value+1)} disabled={loading}>รีเฟรชผลนับ</button>{cap?.canEnroll&&<button type="button" onClick={mintEnrollment}>ลงทะเบียน PDA สาขา 001</button>}</div>
    {error&&<p role="alert" className="sc-count-error">{error}</p>}{loading&&<p role="status">กำลังอ่านผลนับจาก StockDay…</p>}
    {enrollment&&<div className="sc-count-warning"><strong>รหัสลงทะเบียนเครื่อง: <span className="sc-enrollment-code">{enrollment.code}</span></strong><p>สาขา {enrollment.branchCode} · ใช้ครั้งเดียว · หมดอายุ {time(enrollment.expiresAt)}</p><p>เปิดหน้า PDA แล้วใส่รหัสนี้เพื่อเลือกชื่อ ไม่ต้องคัดลอก Bearer token</p><button type="button" onClick={()=>setEnrollment(null)}>ซ่อนรหัส</button></div>}
    {view&&<>
      <h3>{view.product.name} · <span>{view.product.code}</span></h3>
      <div className="sc-count-reference"><strong>ยอดอ้างอิงระบบ: {show(view.systemReference.quantity)}</strong><p>Full Sync · หน่วยอ้างอิงและเวลาสต๊อก: ไม่ทราบ</p><p>แหล่งที่เลือก: {view.sourceResolution.selected.source} · {show(view.sourceResolution.selected.quantity)} · ยังไม่ยืนยันเป็นยอดปัจจุบัน</p><ul>{view.sourceResolution.human.reasons.map(reason=><li key={reason}>{reasons[reason]||reason}</li>)}</ul></div>
      <h3>ผลนับล่าสุดแต่ละขอบเขตและหน่วย</h3><p>รอบนับอิสระใช้เปรียบเทียบ ไม่รวมจำนวนเข้าด้วยกัน</p>
      {view.activeObservations.length===0&&<p>ยังไม่มีผลนับ</p>}
      {view.activeObservations.map(record=><article className="sc-count-card" key={record.eventId}><strong>{record.event.quantity} {record.event.unit}</strong><p>{record.scope.label} · รอบ {record.scope.round} · {record.event.complete?'ตรวจครบขอบเขตนี้':'ตรวจบางส่วน'}</p><p>{record.event.staffName||record.event.staffId} · นับล่าสุดเมื่อ {time(record.event.observedAt)}</p><p>เซิร์ฟเวอร์รับแล้ว · ยังไม่ถูกเลือกแทนยอดระบบ</p><LotRows lots={record.event.lots}/></article>)}
      <h3>ใบรับและลำดับการแก้ไข</h3>
      {view.history.map(record=><article className="sc-count-card" id={'stock-count-'+record.eventId} data-count-event={record.eventId} key={record.eventId}>
        <strong>{record.event.quantity} {record.event.unit} · {record.event.complete?'ครบขอบเขต':'บางส่วน'}</strong><p>{record.event.scope?.label||'ตรวจรายสินค้า'} · รอบ {record.event.scope?.round||1}</p>
        <p>ผู้บันทึก: {record.event.staffName||record.event.staffId} · นับเมื่อ {time(record.event.observedAt)}</p><p>เซิร์ฟเวอร์รับ: {time(record.receivedAt)}{record.correctedAt?' · แก้ไขเมื่อ '+time(record.correctedAt):''}</p>
        <p>อ้างอิงตอนเปิดนับ: {show(record.event.referenceAtCapture?.quantity)} · Full Sync · เวลาสต๊อก/หน่วยอ้างอิงยังไม่ทราบ</p>
        <p>อ้างอิงตอนส่ง: {show(record.event.referenceAtSubmit?.quantity)} · Full Sync · เก็บแยกจากผลนับ</p>
        <p className="sc-count-id">Receipt {record.receiptId}</p><LotRows lots={record.event.lots}/>
        {record.event.correctionOf?<div className="sc-count-warning"><p>แก้ไข: {record.event.reason}</p><button type="button" onClick={()=>loadOriginal(record.event.correctionOf)}>ดูต้นฉบับ {record.event.correctionOf}</button></div>:<p>หลักฐานต้นฉบับ · ไม่ถูกเขียนทับ</p>}
      </article>)}{view.hasMore&&<button type="button" onClick={moreHistory}>อ่านประวัติเพิ่ม</button>}
      <details><summary>เหตุผลและประวัติการเลือกแหล่งสต๊อก</summary>{view.sourceHistory.map(item=><p key={item.event_id}>{time(item.recorded_at)} · {item.reason}</p>)}</details>
    </>}
    {expiry&&<>
      <h3>ล็อตใกล้หมดอายุ / หมดอายุ</h3><p className="sc-count-warning">จำนวนจากการนับล่าสุดของแต่ละขอบเขต/รอบ ไม่ใช่ยอดล็อตคงเหลือปัจจุบัน การขายหลังนับยังไม่ระบุล็อต จึงไม่นำแถวเหล่านี้มารวมเป็นยอดคลัง</p>
      <div className="sc-count-toolbar"><label>ภายใน <select aria-label="ช่วงหมดอายุ" value={days} onChange={event=>setDays(event.target.value)}><option value="30">30 วัน</option><option value="90">90 วัน</option><option value="180">180 วัน</option><option value="365">365 วัน</option></select></label><label>ขอบเขต <select aria-label="ขอบเขตล็อต" value={scope} onChange={event=>setScope(event.target.value)}><option value="">ทุกขอบเขต/รอบ แสดงแยกกัน</option>{scopes.map(item=><option value={item.id} key={item.id}>{item.label} · รอบ {item.round}</option>)}</select></label></div>
      {expiry.rows.length===0&&<p>ไม่พบล็อตในช่วงนี้</p>}
      {expiry.rows.map(row=><article className="sc-count-card" key={row.event_id+':'+row.ordinal}><button type="button" onClick={()=>setActiveProduct(row.product_code)}>{row.product_code}</button><p>ล็อต {row.lot_code||'ไม่ทราบ'} · {row.quantity} {row.unit_name}</p><p>ผลิต {row.manufactured_on||'ไม่ทราบ'} · หมดอายุ {row.expires_on||'ไม่ทราบ'} · {row.expiry_status==='expired'?'หมดอายุแล้ว':row.expiry_status==='unknown'?'ไม่ทราบวันหมดอายุ':'ใกล้หมดอายุ'}</p><p>{row.scope.label} · รอบ {row.scope.round} · นับล่าสุดเมื่อ {time(row.observed_at)} · {row.staff_name}</p></article>)}
      {expiry.truncated&&<p>แสดง 500 แถวแรก กรุณากรองขอบเขตให้แคบลง</p>}
    </>}
    {cap?.canManageScopes&&<details className="sc-count-scopes"><summary>กำหนดขอบเขตงาน / รอบนับอิสระ</summary><form onSubmit={createScope}>
      <label>รหัสงาน <input name="sessionKey" required pattern="[a-zA-Z0-9_-]{1,80}" placeholder="2026-count-1"/></label><label>รหัสพื้นที่ <input name="locationKey" required pattern="[a-zA-Z0-9_-]{1,80}" placeholder="floor-1"/></label><label>ชื่อที่พนักงานเห็น <input name="label" required maxLength={200}/></label>
      <label>รอบ <select name="round"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label><label>ครอบคลุม <select name="coverage"><option value="location">พื้นที่ที่ระบุ</option><option value="whole-branch">ทั้งสาขา</option></select></label><button type="submit">สร้างขอบเขตรอบนับ</button><p>รอบต่างกันใช้คนละผู้ตรวจนับสินค้าเดียวกัน ไม่รวมยอดและไม่เปลี่ยนข้อมูลขอบเขตเดิม</p>
    </form></details>}
  </section></div>;
}
function LotRows({lots}) {return <div className="sc-count-lots">{lots.map((lot,index)=><div key={index}><strong>ล็อต {lot.code||'ไม่ทราบ'} · {lot.quantity} {lot.unit||''}</strong><p>วันผลิต {lot.manufacturedOn||'ไม่ทราบ'} · วันหมดอายุ {lot.expiresOn||'ไม่ทราบ'}</p></div>)}</div>;}
