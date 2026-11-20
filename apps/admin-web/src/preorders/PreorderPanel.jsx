import {useCallback,useEffect,useMemo,useState} from "react";
import {createPreorderApi} from "./preorderApi.js";
import {summarizeStatuses} from "./preorderHelpers.js";
import PreorderCreateDialog from "./PreorderCreateDialog.jsx";
import PreorderTable from "./PreorderTable.jsx";
import PreorderDetailDrawer from "./PreorderDetailDrawer.jsx";
import "./preorder.css";

const STATUSES=["","SUBMITTED","IN_REVIEW","NEEDS_INFO","WAITING_CUSTOMER_DECISION","PROCUREMENT_PENDING","ORDERED","ARRIVED_AT_BRANCH","CUSTOMER_NOTIFIED","COMPLETED","UNAVAILABLE","CANCELLED"];

export default function PreorderPanel({enabled,csrfToken,isAdmin,branchCode,apiBaseUrl,onBadgeChanged,workspace}){
  const api=useMemo(()=>createPreorderApi(apiBaseUrl,csrfToken,workspace?.role||null),[apiBaseUrl,csrfToken,workspace?.role]);
  const [items,setItems]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [createOpen,setCreateOpen]=useState(false),[selectedId,setSelectedId]=useState("");
  const [filters,setFilters]=useState(()=>({search:"",branch:"",status:"",actionable:workspace?.role==="fulfillment"?"true":""}));
  const canReadAll=workspace?workspace.can("cases.read.all"):isAdmin;
  const canCreate=workspace?workspace.can("cases.create"):!isAdmin;
  const canCancel=workspace?workspace.can("cases.cancel"):!isAdmin;
  const counts=useMemo(()=>summarizeStatuses(items),[items]);
  const load=useCallback(async()=>{if(!enabled)return;setLoading(true);setError("");try{const data=await api.listCases(canReadAll?filters:{});setItems(data.items||[]);}catch(ex){setError(ex.message||"โหลดรายการไม่สำเร็จ");}finally{setLoading(false);}},[enabled,api,canReadAll,filters]);
  useEffect(()=>{const timer=setTimeout(load,filters.search?250:0);return()=>clearTimeout(timer);},[load,filters.search]);
  if(!enabled)return <section className="panel preorder-panel"><div className="panel-header stacked"><h2>พรีออเดอร์</h2><p>ระบบยังไม่เปิดใช้งานสำหรับ environment นี้</p></div></section>;
  return <section className="panel preorder-panel">
    <div className="panel-header preorder-heading"><div><h2>พรีออเดอร์</h2><p>{canReadAll?"คำขอจากทุกสาขา":`ติดตามคำขอของสาขา ${branchCode||"-"}`}</p></div>{canCreate&&<button className="primary" onClick={()=>setCreateOpen(true)}>สร้างรายการพรีออเดอร์</button>}</div>
    <div className="preorder-summary-cards"><article><span>รอฝ่ายจัดซื้อ</span><strong>{counts.waitingAdmin}</strong></article><article><span>รอคำตอบลูกค้า</span><strong>{counts.waitingCustomer}</strong></article><article><span>สั่งแล้ว / กำลังมา</span><strong>{counts.incoming}</strong></article><article><span>พร้อมรับ / เสร็จสิ้น</span><strong>{counts.ready}</strong></article></div>{workspace?.role==="fulfillment"&&<p className="preorder-fifo-note">คิวรับเข้าที่ HQ เรียงคำขอจากวันที่เก่าที่สุดก่อน · ตรวจจำนวนและรูปสินค้า ก่อนจัดสรรให้สาขา</p>}
    {canReadAll&&<div className="preorder-admin-toolbar" aria-label="ตัวกรองคิวฝ่ายจัดซื้อ"><label>ค้นหา<input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="เลขเคส ลูกค้า หรือเบอร์โทร"/></label><label>สาขา<input value={filters.branch} onChange={e=>setFilters({...filters,branch:e.target.value})} placeholder="รหัส 3 หลัก" maxLength="3"/></label><label>สถานะ<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}>{STATUSES.map(value=><option key={value} value={value}>{value||"ทุกสถานะ"}</option>)}</select></label><label>คิว<select value={filters.actionable} onChange={e=>setFilters({...filters,actionable:e.target.value})}><option value="">ทั้งหมด</option><option value="true">ต้องดำเนินการ</option><option value="stuck">ค้างเกิน 48 ชั่วโมง</option></select></label><button type="button" onClick={()=>setFilters({search:"",branch:"",status:"",actionable:""})}>ล้างตัวกรอง</button></div>}
    {error&&<div className="preorder-error" role="alert">{error}<button type="button" onClick={load}>ลองอีกครั้ง</button></div>}{loading?<div className="preorder-loading" aria-live="polite">กำลังโหลดรายการ…</div>:<PreorderTable items={items} onOpen={setSelectedId} api={api} canCancel={canCancel} onCancelled={load}/>}
    {createOpen&&<PreorderCreateDialog api={api} onClose={()=>setCreateOpen(false)} onCreated={async created=>{setCreateOpen(false);await load();onBadgeChanged?.();if(created?.public_id)setSelectedId(created.public_id);}}/>}
    {selectedId&&<PreorderDetailDrawer publicId={selectedId} api={api} isAdmin={isAdmin} workspace={workspace} onRead={onBadgeChanged} onChanged={load} onClose={()=>setSelectedId("")}/>}</section>;
}
