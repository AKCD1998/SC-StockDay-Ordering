import { MobileCountPilotClient } from './mobile-count-pilot.mjs';
import { PilotOutbox } from './pilot-001-outbox.mjs';
import { CameraScanner } from './camera-scanner.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fixture = location.hostname === '127.0.0.1' && location.protocol === 'http:' && document.querySelector('meta[name="pda-pilot-fixture"]')?.content === 'enabled';
const api = new MobileCountPilotClient(fixture ? { allowLocalFixture: true, fixtureOrigin: location.origin } : {apiOrigin:document.querySelector('meta[name="sc-pda-api-origin"]')?.content||'https://paasrtsm-project.onrender.com'});
const outbox = new PilotOutbox(api.origin);
const deviceKey = 'sc-pda-001-device-v1';
const deviceId = localStorage.getItem(deviceKey) || crypto.randomUUID(); localStorage.setItem(deviceKey, deviceId);
let product = null, correction = null, capturedAt = null, reviewed = null, records = [], busy = false;
let scopeList=[],offlineIdentity=null,draftTimer=null;
const identity=()=>api.identity||offlineIdentity;
const draftKey=who=>'draft:'+who.staffId+':'+who.deviceId;
const message = text => { $('#status').textContent = text; };
const date = value => value ? new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ไม่ทราบ';
const qty = value => value === null ? 'ไม่ทราบยอด' : String(value);
function handle(error) { if(error.staleAuthentication)return;message(error.message); if (error.status === 401) cacheDraft().catch(()=>{}).finally(disconnected); }
function disconnected() {
  api.disconnect(); offlineIdentity=null; $('#connectionBadge').textContent = 'ยังไม่เชื่อมต่อ';
  $('#enrollmentCard').hidden = false; $('#scanCard').hidden = true; $('#countForm').hidden = true; $('#syncButton').disabled = true;
  $('#history').innerHTML = ''; records = []; product = null; correction = null;
}
$('#rosterButton').onclick = async () => {
  $('#staffSelect').disabled=true;$('#staffSelect').value='';$('#connectButton').disabled=true;
  try { const roster = await api.roster($('#enrollmentCode').value);
    $('#staffSelect').innerHTML = '<option value="">เลือกผู้ปฏิบัติงาน</option>' + roster.staff.map(staff => `<option value="${esc(staff.staffId)}">${esc(staff.displayName)}</option>`).join('');
    $('#staffSelect').disabled = false; $('#connectButton').disabled = true; message('ตรวจพบรายชื่อสาขา 001 · เลือกชื่อแล้วเชื่อมเครื่อง');
  } catch (error) { handle(error); }
};
$('#staffSelect').onchange=()=>{$('#connectButton').disabled=!$('#staffSelect').value;};
$('#enrollmentCode').oninput=()=>{$('#staffSelect').disabled=true;$('#connectButton').disabled=true;};
$('#connectButton').onclick = async () => {
  $('#connectButton').disabled = true;
  try {
    // Preserve the former actor's draft before authenticating another operator.
    await cacheDraft();$('#countForm').hidden=true;product=null;correction=null;reviewed=null;$('#scopeSelect').disabled=false;
    await api.enroll({ code: $('#enrollmentCode').value, staffId: $('#staffSelect').value, deviceId, deviceLabel: 'SC PDA branch001 pilot' });
    $('#enrollmentCode').value = '';
    await api.connect();
    offlineIdentity=api.identity;scopeList=await api.scopes();showScopes();
    await outbox.saveData('context',{identity:api.identity,scopeList,explicitLogout:false});
    $('#connectionBadge').textContent = (fixture ? 'LOCAL FIXTURE · ' : '') + '001 · ' + api.identity.staffName;
    $('#scopeNotice').textContent = fixture ? 'กำลังตรวจรับกับ PostgreSQL จำลองในเครื่อง ไม่ใช่ระบบจริง และไม่เปลี่ยนสต๊อกทางการ' : 'เชื่อม API ผลนับสาขา 001 แล้ว · ผลนับเก็บเป็นหลักฐาน ยังไม่แทนยอดสต๊อกทางการ';
    $('#enrollmentCard').hidden = true; $('#scanCard').hidden = false; $('#syncButton').disabled = false;
    message('เชื่อมต่อแล้ว · สแกนหรือกรอกบาร์โค้ดเพื่อเริ่มนับ'); await restoreDraft();await sync();
  } catch (error) { handle(error); } finally { $('#connectButton').disabled = false; }
};
$('#disconnectButton').onclick = async () => {await cacheDraft();await outbox.saveData('context',{explicitLogout:true});camera.close(); disconnected(); message('ล้าง token ในหน่วยความจำแล้ว · คิวเดิมคงอยู่ การถอนสิทธิ์เครื่องใช้ระบบผู้ดูแลเดิม'); };
function showScopes(selected=null){$('#scopeSelect').innerHTML=scopeList.map(item=>`<option value="${item.id}">${esc(item.label)} · รอบ ${item.round}</option>`).join('');if(selected)$('#scopeSelect').value=selected;}
async function openProduct(barcode, original = null, known = null, restoring=false) {
  const scopeId=original?.event.scopeId||$('#scopeSelect').value;
  const found = known || await api.lookup(barcode,scopeId);
  product = found; correction = original; capturedAt = new Date().toISOString();
  $('#scopeSelect').value=found.scope.id;$('#scopeSelect').disabled=true;
  $('#countForm').reset(); $('#countForm').hidden = false;
  $('#productName').textContent = found.name; $('#productIdentity').textContent = found.productCode + ' · ' + found.barcode;
  $('#stockReference').textContent = 'ยอดอ้างอิงระบบ: ' + qty(found.stock.quantity) + ' · Full Sync\nเวลาสต๊อกและหน่วยอ้างอิง: ยังไม่ทราบ · ยังเทียบผลต่างหรือตัดสินว่ายอดใดถูกไม่ได้\nแหล่งที่เลือกจาก backend: '+(found.sourceResolution?.selected.source||'full-sync')+' · ผลนับยังเป็นหลักฐานอ้างอิง';
  $('#unitSize').innerHTML = '<option value="">เลือกหน่วยที่นับจริง</option>' + found.units.filter(unit => unit.name).map(unit => `<option value="${unit.size}">${esc(unit.name)} (${unit.size}) · ตัวคูณอ้างอิง ${unit.factor ?? 'ไม่ทราบ'}</option>`).join('');
  $('#lots').innerHTML = ''; $('#reasonGroup').hidden = !original; $('#correctionNotice').hidden = !original;
  if (original) {
    $('#unitSize').value = original.event.unitSize; $('#unitSize').disabled = true;
    $('#complete').checked = original.event.complete; $('#countNote').value = original.event.note;
    $('#correctionNotice').textContent = 'แก้ไขรายการ ' + original.eventId.slice(0, 8) + ' · คงเวลาเดิม ' + date(original.event.observedAt) + ' และหลักฐานเดิมทั้งหมด';
    original.event.lots.forEach(addLot);
  } else { $('#unitSize').disabled = false; addLot(); }
  $('#complete').parentElement.lastChild.textContent=found.scope.coverage==='whole-branch'?'ตรวจครบทุกชั้นและทุกพื้นที่ของสินค้านี้แล้ว':'ตรวจครบสินค้านี้ในพื้นที่ที่เลือกแล้ว (ไม่ใช่ทั้งสาขา)';
  total(); if(!restoring)await cacheDraft();$('#countForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#lookupButton').onclick = () => openProduct($('#barcode').value).catch(handle);
$('#barcode').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#lookupButton').click(); } });
class PilotCamera extends CameraScanner {
  async showResult(result) {
    const token = this.token;
    try {
      const found = await api.lookup(result.value,$('#scopeSelect').value);
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
  const node = document.createElement('section'); node.className = 'pilot-lot'; const id = ++lotNumber;
  node.innerHTML = `<div class="row between"><h3>ล็อต</h3><button type="button" class="link-btn remove-lot">ลบล็อต</button></div><label for="lot-${id}">เลขล็อต</label><input id="lot-${id}" class="lot-code" maxlength="100"><label class="check-label"><input type="checkbox" class="lot-unknown">ไม่ทราบเลขล็อต</label><label for="quantity-${id}">จำนวนในล็อตนี้</label><input id="quantity-${id}" class="lot-quantity" inputmode="decimal" placeholder="0.000" required><label for="mfg-${id}">วันผลิต</label><input id="mfg-${id}" type="date" class="lot-mfg"><label class="check-label"><input type="checkbox" class="mfg-unknown">ไม่ทราบวันผลิต</label><label for="expiry-${id}">วันหมดอายุ</label><input id="expiry-${id}" type="date" class="lot-exp"><label class="check-label"><input type="checkbox" class="exp-unknown">ไม่ทราบวันหมดอายุ</label>`;
  for (const [unknown, field] of [['lot-unknown', 'lot-code'], ['mfg-unknown', 'lot-mfg'], ['exp-unknown', 'lot-exp']]) node.querySelector('.' + unknown).onchange = event => { node.querySelector('.' + field).disabled = event.target.checked; };
  node.querySelector('.remove-lot').onclick = () => { node.remove(); total();cacheDraft().catch(handle); };
  node.querySelector('.lot-quantity').oninput = total;
  if (value) {
    node.querySelector('.lot-code').value = value.code || ''; node.querySelector('.lot-quantity').value = value.quantity;
    node.querySelector('.lot-mfg').value = value.manufacturedOn || ''; node.querySelector('.lot-exp').value = value.expiresOn || '';
    for (const [key, flag, field] of [['code', 'lot-unknown', 'lot-code'], ['manufacturedOn', 'mfg-unknown', 'lot-mfg'], ['expiresOn', 'exp-unknown', 'lot-exp']]) { node.querySelector('.' + flag).checked = value[key] === null; node.querySelector('.' + field).disabled = value[key] === null; }
  }
  $('#lots').append(node); total();
}
function milli(text) {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(text)) throw new Error('กรอกจำนวนตั้งแต่ 0 และทศนิยมไม่เกิน 3 ตำแหน่ง');
  const [whole, fraction = ''] = text.split('.'); return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
const decimal = value => `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, '0')}`;
function total() { try { $('#total').textContent = decimal([...document.querySelectorAll('.lot-quantity')].reduce((sum, field) => sum + milli(field.value || '0'), 0)); } catch { $('#total').textContent = 'ตรวจจำนวน'; } }
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
    return { code: get('lot-code', 'lot-unknown'), quantity: decimal(milli(node.querySelector('.lot-quantity').value)), manufacturedOn: get('lot-mfg', 'mfg-unknown'), expiresOn: get('lot-exp', 'exp-unknown') };
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
  try { reviewed = draft(); const unit = product.units.find(unit => unit.size === reviewed.unitSize).name;
    $('#reviewText').innerHTML = `<p>เว็บไซต์: <strong>${esc(qty(product.stock.quantity))}</strong> · Full Sync · หน่วยและเวลาสต๊อกยังไม่ทราบ</p><p>ผลนับ: <strong>${reviewed.quantity} ${esc(unit)}</strong> · ${reviewed.lots.length} ล็อต</p><p>${reviewed.complete ? 'ยืนยันตรวจครบทุกพื้นที่' : 'สำรวจบางล็อต ยังไม่ครบทั้งสินค้า'}</p><p class="pilot-quiet">เก็บเป็นหลักฐานพร้อมใบรับ ยังไม่แทนยอดสต๊อกทางการ${correction ? ' · รายการเดิมยังคงอยู่ในประวัติ' : ''}</p>`;
    $('#reviewDialog').showModal();
  } catch (error) { handle(error); }
};
$('#reviewCancel').onclick = () => { reviewed = null; $('#reviewDialog').close(); };
$('#reviewSave').onclick = async () => {
  if (!reviewed || !identity()) return;
  $('#reviewSave').disabled = true;
  try { await outbox.enqueue(identity(), reviewed); await outbox.saveData(draftKey(identity()),null); reviewed = null; $('#reviewDialog').close(); $('#countForm').hidden = true;$('#scopeSelect').disabled=false;
    message('เก็บคำขอเดิมในอุปกรณ์แล้ว · รอใบรับจากเซิร์ฟเวอร์'); await renderHistory();await sync();
  } catch (error) { handle(error); } finally { $('#reviewSave').disabled = false; }
};
async function renderHistory() {
  if (!identity()) return;
  const local = await outbox.forIdentity(identity()), known = new Set(records.map(record => record.eventId));
  const latest = new Map();
  for (const record of records) { const key = record.event.productCode + ':' + record.event.unitSize+':'+record.event.scopeId; if (!latest.has(key)) latest.set(key, record.eventId); }
  $('#history').innerHTML = local.filter(item => !known.has(item.id)).map(item => { const request = JSON.parse(item.original); return `<article class="pilot-record"><strong>${esc(request.productCode)} · ${request.quantity}</strong><p>${item.status === 'conflict' ? 'ข้อมูลชนกัน · คงคำขอเดิมไว้ กรุณาตรวจนับใหม่' : item.status === 'rejected' ? 'เซิร์ฟเวอร์ปฏิเสธ · คงคำขอเดิมไว้' : item.status === 'accepted' ? 'เซิร์ฟเวอร์รับแล้ว · ใบรับคงอยู่ในเครื่อง' : 'รอส่ง · ยังไม่มีใบรับ'}</p><p>${esc(item.detail || '')}</p><p class="mono pilot-quiet">${item.id}</p></article>`; }).join('') + records.map(record => `<article class="pilot-record" data-event="${record.eventId}"><strong>${esc(record.event.productCode)} · ${record.event.quantity} ${esc(record.event.unit)}</strong><p>${esc(record.event.scope?.label||'ตรวจรายสินค้า')} · รอบ ${record.event.scope?.round||1}</p><p>${esc(record.event.staffName || record.event.staffId)} · นับ ${date(record.event.observedAt)}</p>${record.event.lots.map(lot => `<p>ล็อต ${esc(lot.code || 'ไม่ทราบ')} × ${lot.quantity}<br>ผลิต ${esc(lot.manufacturedOn || 'ไม่ทราบ')} · หมดอายุ ${esc(lot.expiresOn || 'ไม่ทราบ')}</p>`).join('')}<p class="pilot-quiet">${record.event.correctionOf ? 'แก้ไขจาก ' + esc(record.event.correctionOf) + ' · ' + esc(record.event.reason) : 'หลักฐานต้นฉบับ'}</p><p class="pilot-quiet">อ้างอิงตอนเปิด ${esc(qty(record.event.referenceAtCapture?.quantity??null))} · ตอนส่ง ${esc(qty(record.event.referenceAtSubmit?.quantity??null))} · Full Sync · เวลาสต๊อกไม่ทราบ</p><p class="pilot-quiet mono">Receipt ${record.receiptId}<br>เซิร์ฟเวอร์รับ ${date(record.receivedAt)}</p><p class="pilot-quiet">เก็บผลนับแล้ว · ไม่แทนยอดสต๊อกทางการ</p>${latest.get(record.event.productCode + ':' + record.event.unitSize+':'+record.event.scopeId) !== record.eventId ? '<p class="pilot-quiet">มีรายการใหม่กว่า · คงหลักฐานเดิม</p>' : record.event.staffId === identity().staffId || identity().role === 'manager' ? `<button class="button secondary correct-count" data-id="${record.eventId}">แก้ไขโดยเก็บประวัติเดิม</button>` : ''}</article>`).join('');
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
window.addEventListener('offline', () => message('ออฟไลน์ · บันทึกคำขอในเครื่องได้ แต่ยังไม่มีใบรับจนเชื่อมต่ออีกครั้ง'));
setInterval(() => { if (navigator.onLine) sync(); }, 15000);
message('API เป้าหมาย: ' + api.origin + ' · ต้องยืนยันสิทธิ์และสัญญา API ก่อนส่งผลนับ');
async function cacheDraft(){if(!product||$('#countForm').hidden||!identity())return;const lots=[...document.querySelectorAll('.pilot-lot')].map(node=>({code:node.querySelector('.lot-code').value,quantity:node.querySelector('.lot-quantity').value,mfg:node.querySelector('.lot-mfg').value,exp:node.querySelector('.lot-exp').value,lotUnknown:node.querySelector('.lot-unknown').checked,mfgUnknown:node.querySelector('.mfg-unknown').checked,expUnknown:node.querySelector('.exp-unknown').checked}));await outbox.saveData(draftKey(identity()),{product,correction,capturedAt,unitSize:$('#unitSize').value,lots,complete:$('#complete').checked,note:$('#countNote').value,reason:$('#correctionReason').value});}
async function restoreDraft(){if(!identity())return;const saved=await outbox.readData(draftKey(identity()));if(!saved)return;await openProduct(saved.product.barcode,saved.correction,saved.product,true);capturedAt=saved.capturedAt;$('#unitSize').value=saved.unitSize;$('#complete').checked=saved.complete;$('#countNote').value=saved.note;$('#correctionReason').value=saved.reason;$('#lots').innerHTML='';for(const value of saved.lots){addLot({code:value.lotUnknown?null:value.code,quantity:value.quantity,manufacturedOn:value.mfgUnknown?null:value.mfg,expiresOn:value.expUnknown?null:value.exp});}total();await cacheDraft();message('กู้ร่างเดิมแล้ว · หน่วย/เวลา/ขอบเขตเดิมยังอยู่ ตรวจข้อมูลก่อนยืนยัน');}
for(const eventName of ['input','change'])$('#countForm').addEventListener(eventName,()=>{clearTimeout(draftTimer);draftTimer=setTimeout(()=>cacheDraft().catch(handle),100);});
window.addEventListener('pagehide',()=>{cacheDraft().catch(()=>{});});
async function initialize(){const context=await outbox.readData('context');if(context?.identity&&!context.explicitLogout&&Date.parse(context.identity.expiresAt)>Date.now()){
  // navigator.onLine is advisory and can be true on an offline cold navigation.
  // A cached public identity restores local drafts only, never API authentication.
  offlineIdentity=context.identity;scopeList=context.scopeList;showScopes();$('#connectionBadge').textContent='LOCAL DRAFT · ร่างในเครื่อง · '+offlineIdentity.staffName;$('#scanCard').hidden=false;$('#scopeNotice').textContent='ร่างในเครื่อง · ยังไม่ได้ยืนยันตัวตนกับเซิร์ฟเวอร์ เก็บร่าง/คิวเดิมได้ ต้องลงทะเบียนใหม่ก่อนส่งจริง';await restoreDraft();await renderHistory();}
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/pilot-001-worker.js',{scope:'/pilot-001.html'}).catch(()=>message('ยังเตรียมหน้าออฟไลน์ไม่ได้ คิวที่บันทึกแล้วคงอยู่'));
}
initialize().catch(handle);
