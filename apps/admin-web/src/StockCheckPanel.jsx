import {Fragment,useEffect,useRef,useState} from 'react';
import {apiFetch} from './lib/apiClient.js';
import ScpdaLotsWorkspace from './ScpdaLotsWorkspace.jsx';
import './stock-check.css';
const categories=[['all','ทั้งหมด'],['pharma','เภสัช'],['normal','ปกติ'],['common','สามัญ']];
const when=value=>value?new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'—';
const day=value=>value?new Date(value+'T00:00:00Z').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok'}):'ไม่ระบุ';
const reviewNames={received:'รอตรวจ','needs-review':'ต้องทบทวน','accepted-observation':'รับรองผลนับ','recount-requested':'ขอให้นับใหม่',dismissed:'ไม่ใช้ผลนับ',reopened:'เปิดทบทวน'};
const quantity=value=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:20}).format(value);
export default function StockCheckPanel({isAdminUser=false,csrfToken}){
 const[branch,setBranch]=useState('001');
 const[category,setCategory]=useState('all'),[input,setInput]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(null),[reviewCode,setReviewCode]=useState(null);
 const lastQuery=useRef('');const limit=50;
 useEffect(()=>{
  const controller=new AbortController(),key=JSON.stringify([branch,category,search,offset]);
  if(lastQuery.current!==key){setData(null);setExpanded(null);lastQuery.current=key;}
  setLoading(true);setError('');
  const params=new URLSearchParams({category,search,limit:String(limit),offset:String(offset),...(branch==='001'?{}:{branchCode:branch})});
  apiFetch('/api/stock-check?'+params,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   const result=await response.json();if(!response.ok)throw Error(response.status===403?'บัญชีนี้ยังไม่เปิดใช้เช็คสินค้า':result.error||'อ่านผลนับไม่สำเร็จ');
   if(result.contract!=='scpda-stock-check-001-v1'||result.branchCode!==branch||!Array.isArray(result.records)||!Number.isInteger(result.pagination?.total)||result.pagination.total<0)throw Error('ข้อมูลตอบกลับไม่ครบ');
   if(!controller.signal.aborted)setData(result);
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message||'อ่านผลนับไม่สำเร็จ');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[branch,category,search,offset,revision]);
 useEffect(()=>{
  const refresh=()=>{if(!document.hidden)setRevision(n=>n+1);},timer=setInterval(refresh,30000);
  document.addEventListener('visibilitychange',refresh);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 const total=data?.pagination.total||0;
 return <section className="panel stock-check-panel">
  <div className="panel-header"><h2>เช็คสินค้า</h2>{isAdminUser&&(import.meta.env.VITE_FEATURE_SCPDA_BRANCH_004==='true'||import.meta.env.VITE_FEATURE_SCPDA_BRANCH_005==='true')?<label>สาขา <select aria-label="สาขาผลนับ PDA" value={branch} onChange={e=>{setOffset(0);setReviewCode(null);setBranch(e.target.value);}}><option value="001">001</option>{import.meta.env.VITE_FEATURE_SCPDA_BRANCH_004==='true'&&<option value="004">004</option>}{import.meta.env.VITE_FEATURE_SCPDA_BRANCH_005==='true'&&<option value="005">005</option>}</select></label>:<span>สาขา {branch}</span>}</div>
  <div className="stock-check-controls">
   <form onSubmit={e=>{e.preventDefault();setOffset(0);setSearch(input.trim());setRevision(n=>n+1);}}><label htmlFor="stock-check-search" className="sr-only">ค้นหาสินค้า</label><input id="stock-check-search" value={input} onChange={e=>setInput(e.target.value)} maxLength={200} placeholder="รหัส SKU ชื่อสินค้า หรือบาร์โค้ด"/><button className="ghost-button" type="submit">ค้นหา</button></form>
   <div className="stock-check-categories" role="group" aria-label="หมวดสินค้า">{categories.map(([value,label])=><button key={value} type="button" className="ghost-button" aria-pressed={category===value} onClick={()=>{setOffset(0);setCategory(value);}}>{label}</button>)}</div>
   <button className="ghost-button" type="button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>รีเฟรช</button>
  </div>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {loading&&<p className="stock-check-message" role="status">กำลังอ่านข้อมูล…</p>}
  <div className="stock-check-table-wrap"><table className="stock-check-table"><thead><tr><th>รหัส SKU</th><th>ชื่อสินค้า</th><th>ผลนับที่ส่งล่าสุด</th><th>ส่งจาก PDA เมื่อ</th><th>ล็อต / วันที่</th>{isAdminUser&&<th>ทบทวน</th>}</tr></thead><tbody>
   {data?.records.map(product=>{const count=product.latestCount;return <Fragment key={product.productCode}><tr><td>{product.productCode}</td><td className="stock-check-name">{product.name}</td><td>{count?<><strong className="stock-check-quantity">{quantity(count.quantity)}</strong> {count.unit}<small className="stock-check-review">{reviewNames[count.reviewStatus]||'รอตรวจ'}</small></>:<span className="stock-check-missing">ยังไม่มีผลนับ</span>}</td><td>{count?when(count.receivedAt):'—'}</td><td>{count&&<button type="button" className="ghost-button" aria-expanded={expanded===product.productCode} onClick={()=>setExpanded(value=>value===product.productCode?null:product.productCode)}>ดูล็อต / วันที่</button>}</td>{isAdminUser&&<td>{count&&<button className="ghost-button" type="button" onClick={()=>setReviewCode(product.productCode)}>ทบทวน</button>}</td>}</tr>
   {expanded===product.productCode&&count&&<tr><td colSpan={isAdminUser?6:5}><div className="stock-check-lot-details"><p>นับเมื่อ {when(count.observedAt)} · {count.operatorCode} · รอบ {count.round} · {count.completeProduct?'ตรวจครบทุกพื้นที่':'เฉพาะส่วนที่นับ'}</p><ul>{count.lots.map((lot,i)=><li key={i}><strong>ล็อต {lot.code||'ไม่ระบุ'}</strong><span>{quantity(lot.quantity)} {count.unit}</span><span>ผลิต {day(lot.manufacturedOn)}</span><span>หมดอายุ {day(lot.expiresOn)}</span></li>)}</ul><small>ใบรับ {count.receiptId}</small></div></td></tr>}</Fragment>;})}
  </tbody></table></div>
  {!loading&&data&&!data.records.length&&<p className="stock-check-message">ไม่พบสินค้าตามเงื่อนไข</p>}
  <div className="stock-check-pagination"><span>{total?`${offset+1}–${Math.min(offset+limit,total)} จาก ${total} รายการ`:'0 รายการ'}</span><button type="button" className="ghost-button" disabled={loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-limit))}>ก่อนหน้า</button><button type="button" className="ghost-button" disabled={loading||offset+limit>=total} onClick={()=>setOffset(n=>n+limit)}>ถัดไป</button></div>
  {reviewCode&&isAdminUser&&<ScpdaLotsWorkspace productCode={reviewCode} initialBranch={branch} csrfToken={csrfToken} onClose={()=>{setReviewCode(null);setRevision(n=>n+1);}}/>}
 </section>;
}
