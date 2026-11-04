import { MobileCountPilotClient } from './mobile-count-pilot.mjs';
import { PilotOutbox } from './pilot-001-outbox.mjs';
import { CameraScanner } from './camera-scanner.mjs';
import { operatorDisplayCode, FIXTURE_OPERATOR_NUMBERS } from './operator-display.mjs';
import { COUNT_CATEGORIES, FIXTURE_CATEGORY_SESSIONS, APPROVED_CATEGORY_SESSIONS, scopeForChoice, choiceForScope } from './count-choice.mjs';
import { parseCountMilli, formatQuantity, COUNT_INPUT_MODE, COUNT_INPUT_PATTERN } from './quantity-policy.mjs';
import { initAuditInbox } from './pilot-audit-inbox.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fixture = location.hostname === '127.0.0.1' && location.protocol === 'http:' && document.querySelector('meta[name="pda-pilot-fixture"]')?.content === 'enabled';
const reusableCodeFixture=fixture&&document.querySelector('meta[name="pda-reusable-code-fixture"]')?.content==='enabled';
const api = new MobileCountPilotClient(fixture ? { allowLocalFixture: true, fixtureOrigin: location.origin,allowReusableCodeFixture:reusableCodeFixture } : {apiOrigin:document.querySelector('meta[name="sc-pda-api-origin"]')?.content||'https://paasrtsm-project.onrender.com'});
if(reusableCodeFixture){$('#enrollmentCode').inputMode='numeric';$('#enrollmentCode').maxLength=4;$('#enrollmentCode').minLength=4;$('#enrollmentCode').placeholder='รหัส 4 หลัก';}
const outbox = new PilotOutbox(api.origin);
const auditInbox=initAuditInbox({api,onError:error=>handle(error)});
const categorySessions=fixture?FIXTURE_CATEGORY_SESSIONS:APPROVED_CATEGORY_SESSIONS;
const deviceKey = 'sc-pda-001-device-v1';
const deviceId = localStorage.getItem(deviceKey) || crypto.randomUUID(); localStorage.setItem(deviceKey, deviceId);
let product = null, correction = null, capturedAt = null, reviewed = null, records = [], busy = false;
let scopeList=[],offlineIdentity=null,draftTimer=null;
const identity=()=>api.identity||offlineIdentity;
const draftKey=who=>'draft:'+who.staffId+':'+who.deviceId;
const message = (text, tone='info') => { const status=$('#status');status.textContent=text;status.dataset.tone=tone;status.hidden=tone==='info'; };
// View state only: no API, authentication, count payload or outbox changes.
function showPane(name, scroll=true) {
  if(name==='count'&&$('#countForm').hidden){$('#scanTools').open=true;step('Scan');}
  document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==name);
  document.querySelectorAll('[data-pane]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.pane===name));
    if(button.dataset.pane!=='operator')button.disabled=!identity();
  });
  const code=operatorDisplayCode(identity(),fixture?FIXTURE_OPERATOR_NUMBERS:{});
  $('#operatorCode').textContent=code||'—';
  $('#operatorCode').setAttribute('aria-label',code?'ผู้ใช้งาน '+code.slice(0,2)+' · สาขา '+code.slice(2):'ยังไม่มีรหัสแสดงผลของผู้ใช้งาน');
  $('#operatorAvatar').disabled=!identity();
  $('#codeRotationNotice').hidden=!identity()?.rotationDueAt||Date.parse(identity().rotationDueAt)>Date.now();
  if(!identity())$('#operatorCard').close();
  $('#operatorCard').hidden=!identity();
  $('#accountCode').textContent=code||'บัญชี';
  $('#operatorName').textContent=identity()?identity().staffName+' · สาขา 001':'';
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
function step(name){$('.pilot-wrap').classList.toggle('is-counting',name!=='Scan');for(const key of ['Scan','Count','Review']){const node=$('#step'+key);if(key===name)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');}}
for(const button of document.querySelectorAll('[data-pane]'))button.onclick=()=>showPane(button.dataset.pane);
$('#operatorAvatar').onclick=()=>{if(identity())$('#operatorCard').showModal();};
$('#accountClose').onclick=()=>$('#operatorCard').close();
$('#nextItemButton').onclick=()=>{showPane('count');$('#scanTools').open=true;step($('#countForm').hidden?'Scan':'Count');$('#barcode').focus();};
function focusProblem(field,text){field.closest('.pilot-lot')?.setAttribute('open','');field.setAttribute('aria-invalid','true');field.focus();field.scrollIntoView({block:'center',behavior:'instant'});message(text,'error');}
function revealMissingField(){
  $('#countForm').querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  if(!$('#unitSize').value){focusProblem($('#unitSize'),'เลือกหน่วยที่นับจริงก่อน');return true;}
  for(const node of document.querySelectorAll('.pilot-lot')){
    for(const [field,unknown,label] of [['lot-code','lot-unknown','เลขล็อต'],['lot-quantity',null,'จำนวน'],['lot-mfg','mfg-unknown','วันผลิต'],['lot-exp','exp-unknown','วันหมดอายุ']]){
      const input=node.querySelector('.'+field);
      if((!unknown||!node.querySelector('.'+unknown).checked)&&!input.value.trim()){focusProblem(input,'กรอก'+label+(unknown?' หรือเลือกไม่ทราบ':''));return true;}
      if(field==='lot-quantity'){try{parseCountMilli(input.value);}catch(error){focusProblem(input,error.message);return true;}}
    }
  }
  if(correction&&$('#correctionReason').value.trim().length<3){focusProblem($('#correctionReason'),'ระบุเหตุผลที่แก้ไข');return true;}
  return false;
}
const date = value => value ? new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ไม่ทราบ';
const qty = value => value === null ? 'ไม่ทราบยอด' : String(value);
function handle(error) { if(error.staleAuthentication)return;message(error.message,'error'); if (error.status === 401) cacheDraft().catch(()=>{}).finally(disconnected); }
function disconnected() {
  auditInbox.reset();
  api.disconnect(); offlineIdentity=null;
  $('#enrollmentCard').hidden = false; $('#scanCard').hidden = true; $('#countForm').hidden = true; $('#syncButton').disabled = true;
  $('#history').innerHTML = ''; records = []; product = null; correction = null; $('#queueBadge').hidden=true;showPane('operator');
}
$('#rosterButton').onclick = async () => {
  $('#staffSelect').disabled=true;$('#staffSelect').value='';$('#connectButton').disabled=true;
  try { const roster = await api.roster($('#enrollmentCode').value);
    $('#staffSelect').innerHTML = '<option value="">เลือกผู้ปฏิบัติงาน</option>' + roster.staff.map(staff => `<option value="${esc(staff.staffId)}">${esc(staff.displayName)}</option>`).join('');
    $('#staffSelect').disabled = false;$('#staffSelect').value=roster.staff.length===1?roster.staff[0].staffId:''; $('#connectButton').disabled = !$('#staffSelect').value; message('ตรวจพบรายชื่อสาขา 001 · เลือกชื่อแล้วเชื่อมเครื่อง');
  } catch (error) { handle(error); }
};
$('#staffSelect').onchange=()=>{$('#connectButton').disabled=!$('#staffSelect').value;};
$('#enrollmentCode').oninput=()=>{$('#staffSelect').disabled=true;$('#connectButton').disabled=true;};
$('#connectButton').onclick = async () => {
  $('#connectButton').disabled = true;
  try {
    // Preserve the former actor's draft before authenticating another operator.
    await cacheDraft();$('#countForm').hidden=true;product=null;correction=null;reviewed=null;lockCountChoice(false);
    await api.enroll({ code: $('#enrollmentCode').value, staffId: $('#staffSelect').value, deviceId, deviceLabel: 'SC PDA branch001 pilot' });
    $('#enrollmentCode').value = '';
    await api.connect();
    offlineIdentity=api.identity;scopeList=await api.scopes();showScopes();
    await outbox.saveData('context',{identity:api.identity,scopeList,explicitLogout:false});
    $('#enrollmentCard').hidden = true; $('#scanCard').hidden = false; $('#syncButton').disabled = false;
    showPane('count');$('#scanTools').open=true;step('Scan');message('เชื่อมต่อแล้ว · สแกนหรือกรอกบาร์โค้ดเพื่อเริ่มนับ'); await restoreDraft();await sync();
  } catch (error) { handle(error); } finally { $('#connectButton').disabled = false; }
};
$('#disconnectButton').onclick = async () => {await cacheDraft();await outbox.saveData('context',{explicitLogout:true});$('#operatorCard').close();camera.close(); disconnected(); message('ออกจากการเชื่อมต่อแล้ว · ร่างและคิวเดิมยังอยู่ ต้องเชื่อมใหม่ก่อนส่ง'); };
function showScopes(selected=null){
  $('#scopeSelect').innerHTML=scopeList.map(item=>`<option value="${item.id}">${esc(item.label)} · รอบ ${item.round}</option>`).join('');
  const previous=$('#categorySelect').value;
  $('#categorySelect').innerHTML=COUNT_CATEGORIES.map(item=>`<option value="${item.key}">${item.label}</option>`).join('');
  $('#categorySelect').value=COUNT_CATEGORIES.some(item=>item.key===previous)?previous:'pharma';
  if(selected){
    const choice=choiceForScope(scopeList,selected,categorySessions);
    if(choice){$('#categorySelect').value=choice.category;renderRoundChoices(choice.round);$('#scopeSelect').value=selected;}
    else {$('#categorySelect').insertAdjacentHTML('beforeend','<option value="legacy">หมวดเดิมยังไม่ระบุ</option>');$('#categorySelect').value='legacy';const old=scopeList.find(item=>item.id===selected);$('#roundSelect').innerHTML=`<option value="${old?.round||''}">${old?'รอบ '+old.round:'รอบเดิม'}</option>`;$('#scopeSelect').value=selected;}
  }else{renderRoundChoices(1);applyCountChoice();}
}
function renderRoundChoices(round=Number($('#roundSelect').value)||1){
  $('#roundSelect').innerHTML=[1,2,3].map(value=>`<option value="${value}" ${scopeForChoice(scopeList,$('#categorySelect').value,value,categorySessions)?'':'disabled'}>รอบ ${value}</option>`).join('');
  $('#roundSelect').value=String(round);
}
function applyCountChoice(){
  const scope=scopeForChoice(scopeList,$('#categorySelect').value,Number($('#roundSelect').value),categorySessions);
  $('#scopeSelect').value=scope?.id||'';
  const unavailable=!scope;
  $('#lookupButton').disabled=unavailable;$('#cameraButton').disabled=unavailable;
  if(unavailable)message('ยังไม่มีงานนับที่ตรวจสอบแล้วสำหรับหมวดและรอบนี้','error');
  else message('เลือกหมวดและรอบแล้ว · สแกนสินค้าเพื่อเริ่มนับ');
}
function lockCountChoice(locked){$('#scopeSelect').disabled=locked;$('#categorySelect').disabled=locked;$('#roundSelect').disabled=locked;}
function requireCountScope(){const id=$('#scopeSelect').value;if(!id)throw new Error('เลือกหมวดและรอบที่มีงานนับจากเซิร์ฟเวอร์ก่อน');return id;}
$('#categorySelect').onchange=()=>{renderRoundChoices();applyCountChoice();};
$('#roundSelect').onchange=applyCountChoice;
async function openProduct(barcode, original = null, known = null, restoring=false) {
  const scopeId=original?.event.scopeId||requireCountScope();
  const found = known || await api.lookup(barcode,scopeId);
  product = found; correction = original; capturedAt = new Date().toISOString();
  if(!scopeList.some(item=>item.id===found.scope.id))scopeList.push(found.scope);showScopes(found.scope.id);lockCountChoice(true);
  $('#countForm').reset(); $('#countForm').hidden = false;
  $('#productName').textContent = found.name; $('#productIdentity').textContent = found.productCode + ' · ' + found.barcode;
  $('#stockReference').textContent = 'ยอดระบบ: ' + qty(found.stock.quantity) + ' · Full Sync\nหน่วยและเวลาสต๊อกยังไม่ทราบ จึงยังเทียบผลต่างไม่ได้';
  $('#unitSize').innerHTML = '<option value="">เลือกหน่วยที่นับจริง</option>' + found.units.filter(unit => unit.name).map(unit => `<option value="${unit.size}">${esc(unit.name)} (${unit.size})</option>`).join('');
  $('#lots').innerHTML = ''; $('#reasonGroup').hidden = !original; $('#correctionNotice').hidden = !original;
  if (original) {
    $('#unitSize').value = original.event.unitSize; $('#unitSize').disabled = true;
    $('#complete').checked = original.event.complete; $('#countNote').value = original.event.note;
    $('#correctionNotice').textContent = 'แก้ไขรายการ ' + original.eventId.slice(0, 8) + ' · คงเวลาเดิม ' + date(original.event.observedAt) + ' และหลักฐานเดิมทั้งหมด';
    original.event.lots.forEach(addLot);
  } else { $('#unitSize').disabled = false; addLot(); }
  $('#complete').parentElement.lastChild.textContent=found.scope.coverage==='whole-branch'?'ตรวจครบทุกชั้นและทุกพื้นที่ของสินค้านี้แล้ว':'ตรวจครบสินค้านี้ในพื้นที่ที่เลือกแล้ว (ไม่ใช่ทั้งสาขา)';
  total();showPane('count',false);$('#scanTools').open=false;step('Count'); if(!restoring)await cacheDraft();$('#countForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#lookupButton').onclick = () => openProduct($('#barcode').value).catch(handle);
$('#barcode').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#lookupButton').click(); } });
class PilotCamera extends CameraScanner {
  async showResult(result) {
    const token = this.token;
    try {
      const found = await api.lookup(result.value,requireCountScope());
      if (token !== this.token || !this.dialog.open) return;
      this.resolved = found;
      super.showResult({ ...result, kind: 'known', product: { code: found.productCode, barcode: found.barcode, name: found.name } });
    } catch (error) {
      if (token !== this.token || !this.dialog.open) return;
      super.showResult(result); this.message(error.message);
    }
  }
  render() { super.render(); this.q('#cameraSample').closest('.camera-demo').hidden = true; }
}
const camera = new PilotCamera({ catalog: [], onConfirm: barcode => openProduct(barcode, null, camera.resolved).catch(handle) });
$('#cameraButton').onclick = () => camera.open();
let lotNumber = 0;
function addLot(value = null) {
  document.querySelectorAll('.pilot-lot').forEach(lot=>lot.open=false);
  const node = document.createElement('details'); node.className = 'pilot-lot'; node.open=true; const id = ++lotNumber;
  node.innerHTML = `<summary><div><strong>ล็อตที่ ${document.querySelectorAll('.pilot-lot').length+1}</strong><span class="lot-summary">ยังไม่กรอก</span></div></summary><div class="pilot-lot-body"><label for="quantity-${id}">จำนวนในล็อตนี้</label><input id="quantity-${id}" class="lot-quantity" inputmode="${COUNT_INPUT_MODE}" pattern="${COUNT_INPUT_PATTERN}" placeholder="กรอกจำนวน" required><label for="lot-${id}">เลขล็อต</label><input id="lot-${id}" class="lot-code" maxlength="100" placeholder="อ่านจากฉลากสินค้า"><label class="check-label"><input type="checkbox" class="lot-unknown">ไม่ทราบเลขล็อต</label><div class="pilot-date-pair"><label for="mfg-${id}">วันผลิต</label><input id="mfg-${id}" type="date" class="lot-mfg"><label class="check-label"><input type="checkbox" class="mfg-unknown">ไม่ทราบวันผลิต</label><label for="expiry-${id}">วันหมดอายุ</label><input id="expiry-${id}" type="date" class="lot-exp"><label class="check-label"><input type="checkbox" class="exp-unknown">ไม่ทราบวันหมดอายุ</label></div><button type="button" class="remove-lot">ลบล็อตนี้</button></div>`;
  for (const [unknown, field] of [['lot-unknown', 'lot-code'], ['mfg-unknown', 'lot-mfg'], ['exp-unknown', 'lot-exp']]) node.querySelector('.' + unknown).onchange = event => { node.querySelector('.' + field).disabled = event.target.checked; };
  node.querySelector('.remove-lot').onclick = () => { node.remove(); total();cacheDraft().catch(handle); };
  node.querySelector('.lot-quantity').oninput = total;
  if (value) {
    node.querySelector('.lot-code').value = value.code || ''; node.querySelector('.lot-quantity').value = formatQuantity(value.quantity);
    node.querySelector('.lot-mfg').value = value.manufacturedOn || ''; node.querySelector('.lot-exp').value = value.expiresOn || '';
    for (const [key, flag, field] of [['code', 'lot-unknown', 'lot-code'], ['manufacturedOn', 'mfg-unknown', 'lot-mfg'], ['expiresOn', 'exp-unknown', 'lot-exp']]) { node.querySelector('.' + flag).checked = value[key] === null; node.querySelector('.' + field).disabled = value[key] === null; }
  }
  $('#lots').append(node);node.addEventListener('input',total);node.addEventListener('change',total); total();
}
// The wire format and historical records still use exact three-place decimals.
function milli(text) {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(text)) throw new Error('กรอกจำนวนตั้งแต่ 0 และทศนิยมไม่เกิน 3 ตำแหน่ง');
  const [whole, fraction = ''] = text.split('.'); return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
const decimal = value => `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, '0')}`;
function total() {
  $('#totalUnit').textContent=product?.units.find(unit=>unit.size===$('#unitSize').value)?.name||'เลือกหน่วย';
  document.querySelectorAll('.pilot-lot').forEach((node,index)=>{node.querySelector('summary strong').textContent='ล็อตที่ '+(index+1);const code=node.querySelector('.lot-unknown').checked?'ไม่ทราบล็อต':node.querySelector('.lot-code').value||'ยังไม่กรอกล็อต';node.querySelector('.lot-summary').textContent=code+' · '+(node.querySelector('.lot-quantity').value||'ยังไม่กรอกจำนวน');});
  try { $('#total').textContent = formatQuantity(decimal([...document.querySelectorAll('.lot-quantity')].reduce((sum, field) => sum + parseCountMilli(field.value || '0'), 0))); } catch { $('#total').textContent = 'ตรวจจำนวน'; } }
$('#unitSize').addEventListener('change',total);
$('#addLotButton').onclick = () => { if (document.querySelectorAll('.pilot-lot').length < 100) addLot();cacheDraft().catch(handle); };
$('#zeroButton').onclick = () => { $('#lots').innerHTML = ''; total();cacheDraft().catch(handle);message('ระบุผลนับ 0 · ยืนยันพื้นที่ที่ตรวจแล้วก่อนบันทึก'); };
function draft() {
  const unitSize = $('#unitSize').value;
  if (!unitSize) throw new Error('เลือกหน่วยที่นับจริงก่อน');
  const lots = [...document.querySelectorAll('.pilot-lot')].map(node => {
    const get = (field, unknown) => {
      if (node.querySelector('.' + unknown).checked) return null;
      const value = node.querySelector('.' + field).value.trim(); if (!value) throw new Error('กรอกเลขล็อตและวันที่ หรือเลือกไม่ทราบอย่างชัดเจน'); return value;
    };
    return { code: get('lot-code', 'lot-unknown'), quantity: decimal(parseCountMilli(node.querySelector('.lot-quantity').value)), manufacturedOn: get('lot-mfg', 'mfg-unknown'), expiresOn: get('lot-exp', 'exp-unknown') };
  });
  const quantity = decimal(lots.reduce((sum, lot) => sum + milli(lot.quantity), 0));
  const observedAt = correction?.event.observedAt || new Date().toISOString();
  const reason = $('#correctionReason').value.trim(); if (correction && reason.length < 3) throw new Error('ระบุเหตุผลที่แก้ไข');
  return { id: crypto.randomUUID(), barcode: product.barcode, productCode: product.productCode, catalogVersion: product.catalogVersion,
    scopeId:product.scope.id,
    unitSize, quantity, lots, complete: $('#complete').checked, observedAt, capturedAt,
    baseRevision: product.revisions[unitSize] || 0, correctionOf: correction?.eventId || null, reason: correction ? reason : null, note: $('#countNote').value,
    referenceAtCapture: { source: 'full-sync', quantity: product.stock.quantity, observedAt: null, fetchedAt: product.stock.fetchedAt } };
}
$('#countForm').onsubmit = event => {
  event.preventDefault();
  if(revealMissingField())return;
  message('ตรวจจำนวน หน่วย ล็อต และพื้นที่ให้ครบก่อนส่ง');
  try { reviewed = draft(); const unit = product.units.find(unit => unit.size === reviewed.unitSize).name;
    const shownQuantity=formatQuantity;
    $('#reviewText').innerHTML = `<p class="confirm-product"><strong>${esc(product.productCode)}</strong> : ${esc(product.name)}</p><p class="confirm-meta"><span>หน่วย: <strong>${esc(unit)}</strong></span><span>บาร์โค้ด: <span class="mono">${esc(product.barcode)}</span></span></p><div class="confirm-lots">${reviewed.lots.length?reviewed.lots.map(lot=>`<div class="confirm-lot"><span class="confirm-lot-code">ล็อต ${esc(lot.code??'ไม่ทราบ')} :</span><strong class="confirm-quantity">${esc(shownQuantity(lot.quantity))} <small>${esc(unit)}</small></strong></div>`).join(''):`<div class="confirm-lot"><span>จำนวนที่ส่ง :</span><strong class="confirm-quantity">0 <small>${esc(unit)}</small></strong></div>`}</div>${reviewed.lots.length>1?`<p class="confirm-total">รวม <strong>${esc(shownQuantity(reviewed.quantity))} ${esc(unit)}</strong></p>`:''}`;
    step('Review');$('#reviewDialog').showModal();
  } catch (error) { handle(error); }
};
$('#reviewDialog').oncancel=()=>{reviewed=null;step('Count');};
$('#reviewCancel').onclick = () => { reviewed = null; $('#reviewDialog').close();step('Count'); };
$('#reviewSave').onclick = async () => {
  if (!reviewed || !identity()) return;
  $('#reviewSave').disabled = true;
  try { await outbox.enqueue(identity(), reviewed); await outbox.saveData(draftKey(identity()),null); reviewed = null; $('#reviewDialog').close(); $('#countForm').hidden = true;lockCountChoice(false);if($('#categorySelect').value==='legacy')showScopes();
    showPane('history');step('Scan');message('เก็บคำขอเดิมในอุปกรณ์แล้ว · รอใบรับจากเซิร์ฟเวอร์'); await renderHistory();await sync();
  } catch (error) { handle(error); } finally { $('#reviewSave').disabled = false; }
};
async function renderHistory() {
  if (!identity()) return;
  const expanded=new Set([...$('#history').querySelectorAll('[data-event] details[open]')].map(node=>node.closest('[data-event]').dataset.event));
  const local = await outbox.forIdentity(identity()), known = new Set(records.map(record => record.eventId));
  const waiting=local.filter(item=>item.status==='pending').length;$('#queueBadge').hidden=!waiting;$('#queueBadge').textContent=String(waiting);
  const latest = new Map();
  for (const record of records) { const key = record.event.productCode + ':' + record.event.unitSize+':'+record.event.scopeId; if (!latest.has(key)) latest.set(key, record.eventId); }
  $('#history').innerHTML = local.filter(item => !known.has(item.id)).map(item => { const request = JSON.parse(item.original); return `<article class="pilot-record" data-state="${item.status}"><span class="pilot-record-state">${item.status==='pending'?'รอส่ง':item.status==='accepted'?'รับแล้ว':item.status==='conflict'?'ต้องตรวจใหม่':'ส่งไม่ผ่าน'}</span><br><strong>${esc(request.productCode)} · ${esc(formatQuantity(request.quantity))}</strong><p>${item.status === 'conflict' ? 'ข้อมูลชนกัน · คงคำขอเดิมไว้ กรุณาตรวจนับใหม่' : item.status === 'rejected' ? 'เซิร์ฟเวอร์ปฏิเสธ · คงคำขอเดิมไว้' : item.status === 'accepted' ? 'เซิร์ฟเวอร์รับแล้ว · ใบรับคงอยู่ในเครื่อง' : 'รอส่ง · ยังไม่มีใบรับ'}</p><p>${esc(item.detail || '')}</p><details><summary>ดูหมายเลขคำขอ</summary><p class="mono pilot-quiet">${item.id}</p></details></article>`; }).join('') + records.map(record => `<article class="pilot-record" data-event="${record.eventId}" data-state="accepted"><span class="pilot-record-state">รับแล้ว · มีใบรับ</span><br><strong>${esc(record.event.productCode)} · ${esc(formatQuantity(record.event.quantity))} ${esc(record.event.unit)}</strong><p>${esc(record.event.scope?.label||'ตรวจรายสินค้า')} · รอบ ${record.event.scope?.round||1}</p><p>${esc(record.event.staffName || record.event.staffId)} · นับ ${date(record.event.observedAt)}</p><details><summary>ดู ${record.event.lots.length} ล็อต / วันที่ / ใบรับ</summary>${record.event.lots.map(lot => `<p>ล็อต ${esc(lot.code || 'ไม่ทราบ')} × ${esc(formatQuantity(lot.quantity))}<br>ผลิต ${esc(lot.manufacturedOn || 'ไม่ทราบ')} · หมดอายุ ${esc(lot.expiresOn || 'ไม่ทราบ')}</p>`).join('')}<p class="pilot-quiet">${record.event.correctionOf ? 'แก้ไขจาก ' + esc(record.event.correctionOf) + ' · ' + esc(record.event.reason) : 'หลักฐานต้นฉบับ'}</p><p class="pilot-quiet">อ้างอิงตอนเปิด ${esc(qty(record.event.referenceAtCapture?.quantity??null))} · ตอนส่ง ${esc(qty(record.event.referenceAtSubmit?.quantity??null))} · Full Sync · เวลาสต๊อกไม่ทราบ</p><p class="pilot-quiet mono">Receipt ${record.receiptId}<br>เซิร์ฟเวอร์รับ ${date(record.receivedAt)}</p><p class="pilot-quiet">เก็บผลนับแล้ว · ไม่แทนยอดสต๊อกทางการ</p></details>${latest.get(record.event.productCode + ':' + record.event.unitSize+':'+record.event.scopeId) !== record.eventId ? '<p class="pilot-quiet">มีรายการใหม่กว่า · คงหลักฐานเดิม</p>' : record.event.staffId === identity().staffId || identity().role === 'manager' ? `<button class="button secondary correct-count" data-id="${record.eventId}">แก้ไขโดยเก็บประวัติเดิม</button>` : ''}</article>`).join('')||'<p class="pilot-quiet">ยังไม่มีรายการ · เริ่มนับได้ที่เมนูนับสินค้า</p>';
  for(const id of expanded){const detail=$('#history').querySelector('[data-event="'+CSS.escape(id)+'"] details');if(detail)detail.open=true;}
  document.querySelectorAll('.correct-count').forEach(button => { button.onclick = () => { const original = records.find(record => record.eventId === button.dataset.id); openProduct(original.event.barcode, original).catch(handle); }; });
}
async function sync() {
  if (busy || !api.identity) return; busy = true;
  try {
    const pending = (await outbox.forIdentity(api.identity)).filter(item => item.status === 'pending');
    for (const item of pending) {
      try { const receipt = await api.submit(JSON.parse(item.original)); await outbox.mark(item.id, 'accepted', receipt.receiptId); }
      catch (error) { if ([400, 403, 409].includes(error.status)) { await outbox.mark(item.id, error.status===409?'conflict':'rejected', error.message); } else throw error; }
    }
    records = await api.history(); await renderHistory(); message('ดึงประวัติแล้ว · ใบรับยืนยันเฉพาะการเก็บผลนับ ไม่ใช่การปรับคลัง');
  } catch (error) { await renderHistory(); handle(error); } finally { busy = false; }
}
$('#syncButton').onclick = sync; window.addEventListener('online', sync);
window.addEventListener('offline', () => message('ออฟไลน์ · บันทึกคำขอในเครื่องได้ แต่ยังไม่มีใบรับจนเชื่อมต่ออีกครั้ง','warning'));
setInterval(() => { if (navigator.onLine) sync(); }, 15000);
message('ขอรหัสจากผู้ดูแล แล้วเลือกชื่อของคุณเพื่อเริ่มงาน');
async function cacheDraft(){if(!product||$('#countForm').hidden||!identity())return;const lots=[...document.querySelectorAll('.pilot-lot')].map(node=>({code:node.querySelector('.lot-code').value,quantity:node.querySelector('.lot-quantity').value,mfg:node.querySelector('.lot-mfg').value,exp:node.querySelector('.lot-exp').value,lotUnknown:node.querySelector('.lot-unknown').checked,mfgUnknown:node.querySelector('.mfg-unknown').checked,expUnknown:node.querySelector('.exp-unknown').checked}));await outbox.saveData(draftKey(identity()),{product,correction,capturedAt,unitSize:$('#unitSize').value,lots,complete:$('#complete').checked,note:$('#countNote').value,reason:$('#correctionReason').value});}
async function restoreDraft(){if(!identity())return;const saved=await outbox.readData(draftKey(identity()));if(!saved)return;await openProduct(saved.product.barcode,saved.correction,saved.product,true);capturedAt=saved.capturedAt;$('#unitSize').value=saved.unitSize;$('#complete').checked=saved.complete;$('#countNote').value=saved.note;$('#correctionReason').value=saved.reason;$('#lots').innerHTML='';for(const value of saved.lots){addLot({code:value.lotUnknown?null:value.code,quantity:value.quantity,manufacturedOn:value.mfgUnknown?null:value.mfg,expiresOn:value.expUnknown?null:value.exp});}total();await cacheDraft();message('กู้ร่างเดิมแล้ว · หน่วย/เวลา/ขอบเขตเดิมยังอยู่ ตรวจข้อมูลก่อนยืนยัน');}
for(const eventName of ['input','change'])$('#countForm').addEventListener(eventName,event=>{event.target.removeAttribute('aria-invalid');clearTimeout(draftTimer);draftTimer=setTimeout(()=>cacheDraft().catch(handle),100);});
window.addEventListener('pagehide',()=>{cacheDraft().catch(()=>{});});
async function initialize(){const context=await outbox.readData('context');if(context?.identity&&!context.explicitLogout&&Date.parse(context.identity.expiresAt)>Date.now()){
  // navigator.onLine is advisory and can be true on an offline cold navigation.
  // A cached public identity restores local drafts only, never API authentication.
  offlineIdentity=context.identity;scopeList=context.scopeList;showScopes();$('#scanCard').hidden=false;showPane('count',false);step('Scan');await restoreDraft();await renderHistory();}
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/pilot-001-worker.js',{scope:'/pilot-001.html'}).catch(()=>message('ยังเตรียมหน้าออฟไลน์ไม่ได้ คิวที่บันทึกแล้วคงอยู่'));
}
initialize().catch(handle);
