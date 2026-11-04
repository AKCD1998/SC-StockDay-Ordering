// Uses the existing enrolled mobile transport. No tokens, model API or stock writes.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states={'open':'เปิดประเด็น','waiting-for-branch':'รอคำตอบจากสาขา','under-review':'ผู้ตรวจกำลังทบทวน','resolved':'สรุปการตรวจแล้ว'};
export function initAuditInbox({api,onError}){
  const load=document.querySelector('#auditLoad'),box=document.querySelector('#auditCases');
  let generation=0;const pending=new Map();
  const identityKey=()=>{const who=api.identity;return who?JSON.stringify([who.branchCode,who.staffId,who.deviceId]):null;};
  const reset=()=>{generation++;pending.clear();box.replaceChildren();load.disabled=false;};
  load.onclick=async()=>{
    const actor=identityKey(),ticket=++generation;load.disabled=true;
    try{
      api.requireConnection();const data=await api.request('/api/mobile/counts/audit/cases');
      if(actor!==identityKey()||ticket!==generation)return;
      if(data.contract!=='sc-pda-audit-001-v1'||data.branchCode!=='001'||!Array.isArray(data.cases))throw Error('รูปแบบคำถามจากผู้ตรวจไม่ตรงกับระบบนี้');
      box.innerHTML=data.cases.length?data.cases.map(item=>`<article class="pilot-record" data-audit-case="${esc(item.caseId)}"><strong>${esc(item.title)}</strong><p>${esc(item.productCode)} · ${esc(states[item.status]||item.status)}</p><p class="audit-question">${esc(item.question||'ไม่มีคำถามเพิ่มเติม')}</p><label>คำตอบจากสาขา<textarea rows="3" maxlength="2000" class="audit-reply" aria-label="คำตอบจากสาขา"></textarea></label><button type="button" class="button secondary audit-send">ส่งคำตอบให้ผู้ตรวจ</button><p class="audit-reply-status" role="status"></p></article>`).join(''):'<p class="pilot-quiet">ยังไม่มีคำถามจากผู้ตรวจ</p>';
      if(data.truncated)box.insertAdjacentHTML('beforeend','<p>แสดง 100 รายการแรก</p>');
      for(const item of data.cases){
        const node=box.querySelector('[data-audit-case="'+CSS.escape(item.caseId)+'"]'),field=node.querySelector('.audit-reply'),button=node.querySelector('.audit-send'),status=node.querySelector('.audit-reply-status');
        const saved=pending.get(item.caseId);if(saved){field.value=saved.message;field.readOnly=true;button.textContent='ส่งรายการเดิมอีกครั้ง';}
        button.onclick=async()=>{
          if(actor!==identityKey()||ticket!==generation)return;
          const old=pending.get(item.caseId),message=field.value.trim();if(!old&&!message){field.focus();status.textContent='กรอกคำตอบก่อนส่ง';return;}
          const body=old||{requestId:crypto.randomUUID(),expectedVersion:item.version,message};pending.set(item.caseId,body);field.readOnly=true;button.disabled=true;
          try{
            const receipt=await api.request('/api/mobile/counts/audit/cases/'+encodeURIComponent(item.caseId)+'/replies',{method:'POST',body});
            if(actor!==identityKey()||ticket!==generation)return;
            if(receipt.contract!=='sc-pda-audit-001-v1'||receipt.caseId!==item.caseId||receipt.eventId!==body.requestId||!receipt.receiptId)throw Error('ยังไม่มีใบรับคำตอบที่ตรวจสอบได้');
            status.textContent='ผู้ตรวจได้รับคำตอบแล้ว · ใบรับ '+receipt.receiptId;item.version=receipt.version;pending.delete(item.caseId);field.value='';field.readOnly=false;button.textContent='ส่งคำตอบให้ผู้ตรวจ';
          }catch(error){
            if(actor!==identityKey()||ticket!==generation)return;
            status.textContent='ยังไม่ยืนยันการส่ง · เก็บคำตอบเดิมไว้ กดส่งซ้ำได้';button.textContent='ส่งรายการเดิมอีกครั้ง';
            if(error.code==='AUDIT_VERSION_CONFLICT'){
              try{const fresh=await api.request('/api/mobile/counts/audit/cases/'+encodeURIComponent(item.caseId));if(actor!==identityKey()||ticket!==generation)return;item.version=fresh.version;node.querySelector('.audit-question').textContent=fresh.question||'ไม่มีคำถามเพิ่มเติม';pending.delete(item.caseId);field.readOnly=false;status.textContent='ข้อมูลเปลี่ยนแล้ว · คำตอบยังอยู่ ตรวจคำถามล่าสุดแล้วกดส่งอีกครั้ง';button.textContent='ส่งคำตอบหลังตรวจข้อมูลล่าสุด';}catch{/* Keep the original request if the refresh cannot be verified. */}
            }
            onError(error);
          }
          finally{if(actor===identityKey()&&ticket===generation)button.disabled=false;}
        };
      }
    }catch(error){if(actor===identityKey()&&ticket===generation)onError(error);}
    finally{if(ticket===generation)load.disabled=false;}
  };
  return {reset};
}
