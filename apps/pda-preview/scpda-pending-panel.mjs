const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// A saved local-only count is not a queued upload: its explicit send stays on
// the original card. Received observations awaiting review are already sent.
export function pendingCountItems(records,uploads){
 const byId=new Map(uploads.map(u=>[u.id,u]));
 return records.flatMap(record=>{
  const upload=byId.get(record.id);
  if(upload?.receipt||!upload&&!record.uploadIntent)return [];
  const status=upload?.status||'pending';
  return [{record,status,retryable:!['reason-required','conflict','accepted'].includes(status)}];
 }).sort((a,b)=>String(a.record.recordedOnDeviceAt||'').localeCompare(String(b.record.recordedOnDeviceAt||'')));
}

export function pendingPanelHtml(items,{available,flushing,online}){
 if(!items.length)return '';
 const retryable=items.some(item=>item.retryable);
 const hint=!available?'เข้าสู่ระบบอีกครั้งเพื่อส่งรายการค้าง':!online?'ยังไม่มีอินเทอร์เน็ต · เก็บรายการไว้ในเครื่องแล้ว':!retryable?'ตรวจรายการที่ต้องแก้ไขก่อนส่ง':'';
 return `<section class="scpda-pending-panel" aria-labelledby="localPendingTitle"><h3 id="localPendingTitle">รายการค้างส่ง (${items.length})</h3><ul>${items.map(({record:r,status})=>`<li><div><strong>${esc(r.productName)}</strong><small>รอบ ${esc(r.round)} · ${esc(r.quantity)} ${esc(r.unit)}</small></div>${status==='reason-required'?`<button type="button" class="scpda-pending-detail" data-late-reason="${esc(r.id)}">ระบุเหตุผล</button>`:['conflict','accepted'].includes(status)?`<button type="button" class="scpda-pending-detail" data-pending-record="${esc(r.id)}">ตรวจข้อมูล</button>`:'<span class="scpda-pending-state">รอส่ง</span>'}</li>`).join('')}</ul>${hint?`<p class="scpda-pending-hint">${hint}</p>`:''}<button type="button" id="localSyncButton" class="scpda-pending-send" ${!available||!online||!retryable||flushing?'disabled':''}>${flushing?'กำลังส่งรายการค้าง…':'ส่งรายการค้าง'}</button></section>`;
}
