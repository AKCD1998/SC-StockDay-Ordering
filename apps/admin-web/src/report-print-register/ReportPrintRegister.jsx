import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiClient.js';
import '../ky9-documents/ky9-documents.css';
import './report-print-register.css';

const BASE='/api/admin/report-print-register';
const BRANCHES=['000','001','003','004','005'];
const STATUS={waiting_confirmation:'รอยืนยัน',confirmed_printed:'ยืนยันพิมพ์แล้ว',partially_confirmed:'ยืนยันบางหน้า',confirmed_scope_unknown:'ยืนยันว่าพิมพ์แล้ว · ยังไม่ทราบหน้า'};
const KINDS={KY9:'ข.ย.9',KY10:'ข.ย.10',KY11:'ข.ย.11'};
const EVIDENCE={user_confirmation:'คำยืนยันผู้ใช้',printer_receipt:'หลักฐานจากเครื่องพิมพ์',photo:'ภาพกระดาษจริง'};
const blankFilters={kind:'',branch:'',month:'',version:'',status:''};
const fmtDate=v=>v?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric'}).format(new Date(v.length===10?v+'T12:00:00+07:00':v)):'ไม่ทราบ';
const range=r=>r?.map(([a,b])=>a===b?String(a):`${a}–${b}`).join(', ')||'ยังไม่ทราบเลขหน้า';
const period=d=>`${fmtDate(d.period_start)} – ${fmtDate(d.period_end)}`;
const inputNumber=v=>v===''?null:Number(v);
const newConfirmation=()=>({requestKey:crypto.randomUUID(),pages:'',unknownPages:false,printedOn:'',copies:'',printerName:'',evidenceType:'user_confirmation',evidenceReference:'',reason:'',physicalPrinted:false});
async function request(path='',options={}){const res=await apiFetch(BASE+path,options);const body=await res.json();if(!res.ok)throw new Error(body.error||'โหลดทะเบียนพิมพ์ไม่สำเร็จ');return body;}
function Field({label,children}){return <label className="ky9-field"><span>{label}</span>{children}</label>;}
function ConfirmForm({doc,saving,onSave}){
 const [form,setForm]=useState(newConfirmation);const set=(k,v)=>setForm(x=>({...x,[k]:v}));
 return <form aria-label="ยืนยันการพิมพ์กระดาษ" onSubmit={e=>{e.preventDefault();onSave({...form,copies:inputNumber(form.copies)});}} className="print-register-form">
  <h4>บันทึกว่าพิมพ์กระดาษแล้ว</h4><p>เลขหน้าอ้างถึงไฟล์ <strong>{doc.filename}</strong> · {doc.page_count??'ยังไม่ทราบจำนวน'} หน้า</p>
  {doc.sections?.length?<details><summary>เลขหน้าของแต่ละเดือนในไฟล์หลัก</summary><ul>{doc.sections.map(s=><li key={s.month}>{s.month} · หน้า {s.pageFrom}–{s.pageTo} · {s.filename}</li>)}</ul></details>:null}
  <fieldset disabled={saving}><div className="print-register-fields">
   <Field label="หน้าที่พิมพ์ในไฟล์หลัก"><input value={form.pages} disabled={form.unknownPages} required={!form.unknownPages} placeholder="เช่น 1-5,8,10" onChange={e=>set('pages',e.target.value)} /></Field>
   <Field label="วันที่พิมพ์ (เว้นว่างถ้าไม่ทราบ)"><input type="date" value={form.printedOn} onChange={e=>set('printedOn',e.target.value)} /></Field>
   <Field label="จำนวนชุด (เว้นว่างถ้าไม่ทราบ)"><input type="number" min="1" max="1000" value={form.copies} onChange={e=>set('copies',e.target.value)} /></Field>
   <Field label="เครื่องพิมพ์ (เว้นว่างถ้าไม่ทราบ)"><input value={form.printerName} maxLength={300} onChange={e=>set('printerName',e.target.value)} /></Field>
  </div>
  <label className="ky9-inline"><input type="checkbox" checked={form.unknownPages} onChange={e=>setForm(x=>({...x,unknownPages:e.target.checked,pages:''}))} />ยืนยันว่าพิมพ์แล้ว แต่ยังไม่ทราบเลขหน้าที่แน่นอน</label>
  {doc.page_count&&!form.unknownPages?<button className="ghost-button" type="button" onClick={()=>set('pages',`1-${doc.page_count}`)}>เลือกทุกหน้า 1–{doc.page_count}</button>:null}
  <Field label="ประเภทหลักฐาน"><select value={form.evidenceType} onChange={e=>set('evidenceType',e.target.value)}>{Object.entries(EVIDENCE).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
  <Field label="หลักฐาน / คำยืนยัน / ที่อยู่ภาพ"><textarea value={form.evidenceReference} required rows={3} maxLength={8000} onChange={e=>set('evidenceReference',e.target.value)} /></Field>
  <Field label="เหตุผลการบันทึก"><input value={form.reason} required maxLength={4000} onChange={e=>set('reason',e.target.value)} /></Field>
  <label className="ky9-inline"><input type="checkbox" required checked={form.physicalPrinted} onChange={e=>set('physicalPrinted',e.target.checked)} />ยืนยันว่าพิมพ์เป็นกระดาษแล้ว การสร้าง PDF หรือดาวน์โหลดอย่างเดียวไม่นับ</label>
  <button className="primary-button" type="submit" disabled={!form.physicalPrinted||saving}>{saving?'กำลังบันทึก…':'บันทึกการยืนยัน'}</button>
  </fieldset>
 </form>;
}
function RegisterForm({saving,onSave,onCancel}){
 const [form,setForm]=useState(()=>({sourceKey:'manual:'+crypto.randomUUID(),reportKind:'KY9',branchCode:'000',periodStart:'',periodEnd:'',version:'',filename:'',pageCount:'',sha256:'',sourceReference:'',reason:''}));
 const set=(k,v)=>setForm(x=>({...x,[k]:v}));
 return <form aria-label="ลงทะเบียนไฟล์รายงาน" className="ky9-card print-register-form" onSubmit={e=>{e.preventDefault();onSave({...form,pageCount:inputNumber(form.pageCount)});}}>
  <h3>ลงทะเบียนไฟล์รายงาน</h3><p>รายการใหม่จะเป็น “รอยืนยัน” จนกว่าจะมีหลักฐานการพิมพ์กระดาษ</p><fieldset disabled={saving}><div className="print-register-fields">
  <Field label="ประเภทรายงาน"><select value={form.reportKind} onChange={e=>set('reportKind',e.target.value)}>{Object.entries(KINDS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
  <Field label="สาขาของไฟล์"><select value={form.branchCode} onChange={e=>set('branchCode',e.target.value)}>{BRANCHES.map(v=><option key={v}>{v}</option>)}</select></Field>
  <Field label="เริ่มช่วงข้อมูล"><input type="date" required value={form.periodStart} onChange={e=>set('periodStart',e.target.value)} /></Field>
  <Field label="สิ้นสุดช่วงข้อมูล"><input type="date" required value={form.periodEnd} onChange={e=>set('periodEnd',e.target.value)} /></Field>
  <Field label="รุ่นเอกสาร"><input required maxLength={300} value={form.version} onChange={e=>set('version',e.target.value)} /></Field>
  <Field label="ชื่อไฟล์"><input required maxLength={500} value={form.filename} onChange={e=>set('filename',e.target.value)} /></Field>
  <Field label="จำนวนหน้า (เว้นว่างถ้ายังไม่ทราบ)"><input type="number" min="1" max="20000" value={form.pageCount} onChange={e=>set('pageCount',e.target.value)} /></Field>
  <Field label="SHA-256 ของไฟล์ (ถ้ามี)"><input maxLength={64} value={form.sha256} onChange={e=>set('sha256',e.target.value)} /></Field>
  </div><Field label="แหล่งเก็บไฟล์ / ที่มา"><textarea required maxLength={4000} value={form.sourceReference} onChange={e=>set('sourceReference',e.target.value)} /></Field>
  <Field label="เหตุผลที่ลงทะเบียน"><input required maxLength={4000} value={form.reason} onChange={e=>set('reason',e.target.value)} /></Field>
  <div className="ky9-actions"><button type="submit" className="primary-button">ลงทะเบียนโดยยังไม่ยืนยันการพิมพ์</button><button type="button" className="ghost-button" onClick={onCancel}>ยกเลิก</button></div></fieldset>
 </form>;
}
export default function ReportPrintRegister({csrfToken}){
 const [filters,setFilters]=useState(blankFilters),[applied,setApplied]=useState(blankFilters),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [detail,setDetail]=useState(null),[opening,setOpening]=useState(''),[register,setRegister]=useState(false),[saving,setSaving]=useState(false),[reload,setReload]=useState(0),[voidTarget,setVoidTarget]=useState(null),[voidReason,setVoidReason]=useState('');
 const alive=useRef(true),busy=useRef(false),detailSeq=useRef(0),detailElement=useRef(null);
 useEffect(()=>{detailElement.current?.scrollIntoView?.({behavior:'smooth',block:'start'});},[detail?.document.id]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;detailSeq.current+=1;};},[]);
 useEffect(()=>{const c=new AbortController();setLoading(true);setData(null);setError('');const qs=new URLSearchParams(Object.entries(applied).filter(([,v])=>v));request('?'+qs,{signal:c.signal}).then(v=>{if(!c.signal.aborted)setData(v);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[applied,reload]);
 async function show(id){const seq=++detailSeq.current;setOpening(id);setDetail(null);setVoidTarget(null);setError('');try{const v=await request('/'+id);if(alive.current&&seq===detailSeq.current)setDetail(v);}catch(e){if(alive.current&&seq===detailSeq.current)setError(e.message);}finally{if(alive.current&&seq===detailSeq.current)setOpening('');}}
 async function mutate(path,body,after){if(busy.current)return;busy.current=true;setSaving(true);setError('');setMessage('');try{await request(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(body)});if(alive.current){setReload(v=>v+1);setMessage('บันทึกประวัติแล้ว');await after?.();}}catch(e){if(alive.current)setError(e.message);}finally{busy.current=false;if(alive.current)setSaving(false);}}
 const docs=data?.documents||[],counts=Object.fromEntries(Object.keys(STATUS).map(k=>[k,docs.filter(d=>d.status===k).length]));
 return <section className="ky9-documents print-register" aria-label="ทะเบียนพิมพ์กลาง">
  <header className="ky9-document-hero"><div><span className="ky9-eyebrow">ทะเบียนเอกสาร · สำหรับ admin</span><h2>ทะเบียนพิมพ์ ข.ย.9 / ข.ย.10 / ข.ย.11</h2><p>ติดตามสาขา เดือน รุ่น และหน้าที่พิมพ์กระดาษแล้ว</p></div><button type="button" className="primary-button" disabled={saving} onClick={()=>setRegister(v=>!v)}>ลงทะเบียนไฟล์รายงาน</button></header>
  <p className="ky9-scope-note">สร้าง PDF หรือดาวน์โหลดแล้ว ยังเป็น “รอยืนยัน” · วันที่บันทึกประวัติแยกจากวันที่พิมพ์ · การลงทะเบียนนี้ไม่เปลี่ยนยอดสต๊อกหรือข้อมูลรายงาน</p>
  {register?<RegisterForm saving={saving} onCancel={()=>setRegister(false)} onSave={v=>mutate('',v,()=>setRegister(false))}/>:null}
  <form className="ky9-card" aria-label="ค้นทะเบียนพิมพ์" onSubmit={e=>{e.preventDefault();if(!saving){detailSeq.current+=1;setOpening('');setDetail(null);setApplied({...filters});}}}>
   <fieldset disabled={saving}><div className="print-register-fields">
   <Field label="ประเภทเอกสาร"><select value={filters.kind} onChange={e=>setFilters(f=>({...f,kind:e.target.value}))}><option value="">ทุกประเภท</option>{Object.entries(KINDS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
   <Field label="สาขา"><select value={filters.branch} onChange={e=>setFilters(f=>({...f,branch:e.target.value}))}><option value="">ทุกสาขา</option>{BRANCHES.map(v=><option key={v}>{v}</option>)}</select></Field>
   <Field label="เดือนเอกสาร"><input type="month" value={filters.month} onChange={e=>setFilters(f=>({...f,month:e.target.value}))}/></Field>
   <Field label="รุ่น"><input value={filters.version} maxLength={150} onChange={e=>setFilters(f=>({...f,version:e.target.value}))}/></Field>
   <Field label="สถานะการพิมพ์"><select value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}><option value="">ทุกสถานะ</option>{Object.entries(STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
   </div><div className="ky9-actions"><button className="primary-button" type="submit">ค้นทะเบียน</button><button type="button" className="ghost-button" onClick={()=>{setFilters(blankFilters);setApplied({...blankFilters});detailSeq.current+=1;setDetail(null);setOpening('');}}>ล้างตัวกรอง</button></div></fieldset>
  </form>
  {error?<p role="alert" className="ky9-warning">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  {loading?<p role="status">กำลังโหลดทะเบียนพิมพ์…</p>:<>
   <div className="print-register-counts">{Object.entries(STATUS).map(([k,label])=><span key={k}>{label} <strong>{counts[k]}</strong> ไฟล์</span>)}</div>
   <p className="ky9-muted">แสดง {docs.length} ไฟล์แยกตามรุ่น · ไฟล์รวมทุกสาขาและไฟล์แบ่งเดือนที่เป็นชุดเดียวกันไม่นับเป็นการพิมพ์เพิ่ม</p>
   <div className="ky9-archive-scroll"><table className="ky9-archive-table print-register-table"><thead><tr>{['ประเภท / สาขา','ช่วงข้อมูล / รุ่น','ไฟล์','หน้าที่ยืนยันแล้ว','สถานะ','รายละเอียด'].map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{docs.map(d=><tr key={d.id}>
    <td>{KINDS[d.report_kind]}<br/>สาขา {d.branch_code}</td><td>{period(d)}<br/><strong>{d.version_label}</strong></td><td className="print-register-file">{d.filename}<br/><small>{d.page_count??'ไม่ทราบจำนวน'} หน้า</small></td>
    <td>{d.monthPagesMapped?<>{d.confirmedRanges||'ยังไม่ยืนยันเลขหน้า'}<br/><small>{d.confirmedPages??'—'} / {d.scopeTotalPages??'—'} หน้า{d.selectedSection?' ในเดือนที่เลือก':''}</small></>:<>ทั้งเล่ม: {d.allConfirmedRanges||'ยังไม่ยืนยันเลขหน้า'}<br/><small>เลขหน้าแยกเดือนยังรอยืนยัน</small></>}</td>
    <td><span className={'print-register-status '+d.status}>{STATUS[d.status]}</span>{d.scopeUnknown?<small> มีประวัติที่ยังไม่ทราบเลขหน้าร่วมด้วย</small>:null}</td><td><button className="ghost-button" disabled={saving||Boolean(opening)} type="button" onClick={()=>show(d.id)}>{opening===d.id?'กำลังเปิด…':'ดูประวัติ / ยืนยัน'}</button></td>
   </tr>)}</tbody></table></div>{!docs.length?<p>ยังไม่มีไฟล์ตามตัวกรองนี้</p>:null}
   {data?.unmappedEvidence?.length?<section className="ky9-card" aria-label="หลักฐานที่ยังผูกไฟล์ไม่ได้"><h3>หลักฐานพิมพ์ที่ยังผูกไฟล์ไม่ได้</h3><p>มีหลักฐานการพิมพ์ แต่ยังไม่ยืนยันรุ่นไฟล์ จึงยังไม่เพิ่มหน้าที่ยืนยันให้ไฟล์ใด</p>{data.unmappedEvidence.map(e=><div key={e.id} className="print-register-evidence"><strong>{KINDS[e.report_kind]} · สาขา {e.branch_code} · {e.month}</strong><p>{e.summary}</p><p className="ky9-pre">{e.evidence_reference}</p></div>)}</section>:null}
  </>}
  {detail?<section ref={detailElement} className="ky9-card print-register-detail" aria-label="ประวัติการพิมพ์ของไฟล์"><div className="ky9-section-heading"><h3>{KINDS[detail.document.report_kind]} · สาขา {detail.document.branch_code} · {detail.document.version_label}</h3><button className="ghost-button" disabled={saving} onClick={()=>{detailSeq.current+=1;setDetail(null);setVoidTarget(null);}}>ปิดประวัติ</button></div>
   <p>{detail.document.filename} · {period(detail.document)}</p><details><summary>แหล่งเก็บไฟล์และรุ่น</summary><p className="ky9-pre">{detail.document.source_reference}</p><p className="ky9-pre">SHA-256: {detail.document.sha256||'ยังไม่มีข้อมูล'}</p><p>ลงทะเบียน {fmtDate(detail.document.created_at)} โดย {detail.document.registered_by}</p>{detail.document.supersedes?<p>เอกสารรุ่นก่อน: {detail.document.supersedes}</p>:null}</details>
   <h4>ประวัติการยืนยันและแก้ไข</h4>{!detail.events.length?<p>ยังไม่มีหลักฐานยืนยันการพิมพ์กระดาษ</p>:detail.events.map(e=>{const voided=detail.events.some(x=>x.voids_event_id===e.id);return <article key={e.id} className="print-register-evidence"><strong>{e.action==='voided'?'ยกเลิกการยืนยัน':voided?'การยืนยันที่ถูกยกเลิกแล้ว':'ยืนยันการพิมพ์'}</strong>{e.action==='confirmed'?<><p>หน้า {range(e.page_ranges)} · พิมพ์วันที่ {fmtDate(e.printed_on)} · {e.copies??'ไม่ทราบจำนวน'} ชุด · เครื่อง {e.printer_name||'ไม่ทราบ'}</p><p>{EVIDENCE[e.evidence_type]}: {e.evidence_reference}</p></>:null}<p>เหตุผล: {e.reason}</p><small>บันทึก {fmtDate(e.recorded_at)} โดย {e.recorded_by}</small>{e.action==='confirmed'&&!voided?<button className="ghost-button" disabled={saving} onClick={()=>{setVoidTarget(e.id);setVoidReason('');}}>แก้ไขการยืนยันนี้</button>:null}</article>;})}
   {voidTarget?<form aria-label="ยกเลิกการยืนยันโดยคงประวัติ" onSubmit={e=>{e.preventDefault();mutate(`/${detail.document.id}/confirmations/${voidTarget}/void`,{reason:voidReason},()=>show(detail.document.id));}}><Field label="เหตุผลยกเลิกการยืนยัน"><input required value={voidReason} onChange={e=>setVoidReason(e.target.value)}/></Field><button className="outline-button" disabled={saving}>ยกเลิกการยืนยันโดยคงประวัติ</button></form>:null}
   <ConfirmForm key={detail.document.id+':'+detail.events.length} doc={detail.document} saving={saving} onSave={v=>mutate(`/${detail.document.id}/confirmations`,v,()=>show(detail.document.id))}/>
  </section>:null}
 </section>;
}
