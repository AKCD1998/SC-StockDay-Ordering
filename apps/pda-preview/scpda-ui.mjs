import {RecentProductBook,recentProduct,touchRecent} from './scpda-recent-products.mjs';
import {ScpdaCountUI} from './scpda-count-ui.mjs';
import { StockDayLookup, requireScpda001 } from './stockday-live-contract.mjs';
import { CameraScanner } from './camera-scanner.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pending=new Map();let serial=0,actor=null,generation=0,selected=null,busy=false,paired=false,recentItems=[];
const recentBook=new RecentProductBook();
window.__scpdaReceive=(id,reply)=>{const row=pending.get(id);if(!row)return;clearTimeout(row.timer);pending.delete(id);if(reply.ok)row.resolve(reply.data);else{const e=Object.assign(new Error(reply.error||'เชื่อมต่อระบบไม่ได้'),{status:reply.status,code:reply.code});row.reject(e);}};
function native(op,body={}){return new Promise((resolve,reject)=>{if(!window.SCPDAHost?.invoke){reject(new Error('เปิดผ่านแอป SCPDA บน Android เพื่อเชื่อมระบบจริง'));return;}const id=String(++serial),timer=setTimeout(()=>{pending.delete(id);reject(new Error('ระบบตอบช้า กรุณาลองใหม่'));},op==='activateDevice'?300000:45000);pending.set(id,{resolve,reject,timer});try{window.SCPDAHost.invoke(id,op,JSON.stringify(body));}catch{clearTimeout(timer);pending.delete(id);reject(new Error('เชื่อมกับแอปไม่ได้ กรุณาเปิดแอปใหม่'));}});}
function status(text,tone='error'){$('#status').hidden=!text;$('#status').textContent=text;$('#status').dataset.tone=tone;}
function loggedOut(){countUI?.disconnect();actor=null;selected=null;recentItems=[];renderRecent();generation++;camera.close();$('#activationPane').hidden=paired;$('#loginPane').hidden=!paired;$('#lookupPane').hidden=true;$('#productPane').hidden=true;$('#choices').hidden=true;$('#profile').textContent='ยังไม่ได้เชื่อมบัญชี';$('#logoutButton').hidden=true;$('#accountDialog').close();}
function handle(e){if(e.code==='LOGIN_REJECTED'||e.code==='DEVICE_PROOF_INVALID'){status(e.message);return;}if(['DEVICE_CERT_INVALID','DEVICE_ACTIVATION_REQUIRED','DEVICE_REVOKED'].includes(e.code)){paired=false;loggedOut();status(e.message);return;}if(e.status===401){loggedOut();status('เซสชันหมดอายุ กรุณาใส่ PIN อีกครั้ง');}else status(e.message||'เชื่อมต่อระบบไม่ได้');}
async function request(op,body){try{return await native(op,body);}catch(e){if(e.status===401)loggedOut();throw e;}}
const lookup=new StockDayLookup(request);
function countNavigate(view){
 if(view!=='lookup')camera.close();
 $('#localCountPane').hidden=view!=='count';$('#localHistoryPane').hidden=view!=='history';
 $('.scpda-scanner').hidden=view!=='lookup';$('#productPane').hidden=view!=='product';$('#recentPane').hidden=view!=='lookup'||!recentItems.length;
 $('#lookupPane').classList.toggle('has-product',view!=='lookup'||recentItems.length>0);$('#choices').hidden=true;$('#websiteButton').hidden=!['lookup','product'].includes(view);
 if(view==='lookup')renderRecent();else document.querySelector(view==='count'?'#localCountPane':view==='history'?'#localHistoryPane':'#productPane').scrollIntoView({block:'start'});
}
function renderRecent(){
 const pane=$('#recentPane'),list=$('#recentList');if(!pane||!list)return;
 $('#recentCount').textContent=String(recentItems.length)+'/10';
 list.innerHTML=recentItems.map((p,i)=>`<li class="scpda-recent-row" data-product-code="${esc(p.productCode)}"><button type="button" class="scpda-recent-open" data-recent-open="${i}" aria-label="ดู ${esc(p.name)} รหัส ${esc(p.productCode)}" ${busy?'disabled':''}>${esc(p.name)}</button><button type="button" class="scpda-recent-count" data-recent-count="${i}" aria-label="นับ ${esc(p.name)}" ${busy?'disabled':''}>นับสินค้า</button></li>`).join('');
 for(const button of list.querySelectorAll('[data-recent-open]'))button.onclick=()=>search(recentItems[Number(button.dataset.recentOpen)].lookupCode,{intent:'product',expected:recentItems[Number(button.dataset.recentOpen)]});
 for(const button of list.querySelectorAll('[data-recent-count]'))button.onclick=()=>search(recentItems[Number(button.dataset.recentCount)].lookupCode,{intent:'count',expected:recentItems[Number(button.dataset.recentCount)]});
 pane.hidden=!actor||!recentItems.length;
}
function lookupBusy(value){busy=value;$('#lookupButton').disabled=value;$('#scanButton').disabled=value;for(const b of document.querySelectorAll('.scpda-recent-row button,[data-choice]'))b.disabled=value;}
async function acceptProduct(p,intent='recent'){
 selected=p;recentItems=touchRecent(recentItems,p);const who={...actor};recentBook.remember(who,p).catch(()=>{});renderRecent();
 if(intent==='count'){countUI.close();await countUI.start(p);return;}
 if(intent==='product'){showProduct(p);return;}
 countUI.close();countNavigate('lookup');$('#recentPane').scrollIntoView({block:'nearest'});
}
const countUI=new ScpdaCountUI({getActor:()=>actor,navigate:countNavigate,message:status,request:native});
$('#localHistoryButton').onclick=()=>countUI.showHistory();
$('#loginButton').onclick=async()=>{if(busy)return;const username=$('#username').value.trim(),password=$('#password').value;if(!username||!password){status('เลือกผู้ใช้งานและกรอก PIN 4 หลัก');return;}busy=true;$('#loginButton').disabled=true;status('กำลังเข้าสู่ระบบ SCPDA…','info');try{const data=await native('login',{username,password});actor=requireScpda001(data);generation++;const loginGeneration=generation;try{recentItems=await recentBook.list(actor);}catch{recentItems=[];}if(generation!==loginGeneration||!actor){recentItems=[];return;}$('#loginPane').hidden=true;$('#lookupPane').hidden=false;$('#profile').textContent=actor.operatorCode+' · สาขา 001';$('#accountLabel').textContent=actor.operatorCode+' · สาขา 001';$('#pinRotation').hidden=!actor.rotationDue;$('#logoutButton').hidden=false;status('');countNavigate('lookup');countUI.connect(data.countUploadAvailable===true);$('#countConnectionHint').textContent=data.countUploadAvailable?'ส่งผลนับเป็นหลักฐาน · รอผู้ดูแลทบทวน':'เก็บผลนับในเครื่อง · ยังไม่เชื่อมการส่ง';countUI.badge();$('#barcode').focus();}catch(e){handle(e);}finally{$('#password').value='';busy=false;$('#loginButton').disabled=false;}};
$('#password').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#loginButton').click();}};
const number=v=>v===null?'ไม่ระบุ':new Intl.NumberFormat('th-TH',{maximumFractionDigits:20}).format(v),money=v=>v===null?'ไม่ระบุ':new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const at=v=>v?new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'ไม่ระบุ';
function showProduct(p){countUI.close();selected=p;const root=$('#productPane');root.innerHTML=`<button type="button" class="scpda-back" id="productBack">← กลับ</button><p class="scpda-ic">IC ${esc(p.productCode)}</p><h2 class="scpda-product-name">${esc(p.name)}</h2><p class="subtle">บาร์โค้ด / รหัสที่ค้น: <span class="mono">${esc(p.barcode)}</span></p><div class="scpda-qty-card"><span>ยอดตามเว็บไซต์<br><small>สาขา 001 · Full Sync</small></span><strong>${esc(number(p.stock.quantity))}</strong></div>${p.stock.zeroMayRepresentMissing?'<p class="scpda-warning">ยอด 0 นี้อาจเป็นข้อมูลที่ยังไม่ครบ จึงยังไม่ยืนยันว่าของหมด</p>':''}${!p.stock.recordPresent?'<p class="scpda-warning">ยังไม่พบยอดอ้างอิงของ IC นี้ ไม่ได้หมายถึงจำนวน 0</p>':''}<h3>ราคาขายปลีก</h3><ul class="scpda-price-list">${p.prices.length?p.prices.map(r=>`<li><span>${esc(r.unit||'หน่วยยังไม่ระบุ')}</span><strong>${esc(money(r.amount))} <small>${esc(r.currency==='THB'?'บาท':r.currency)}</small></strong></li>`).join(''):'<li>ยังไม่พบข้อมูลราคา</li>'}</ul><details class="scpda-meta"><summary>ข้อมูลอ้างอิง</summary><p>หน่วยบนเว็บไซต์: ${esc(p.stock.displayUnit||'ไม่ระบุ')}<br>หน่วยอ้างอิงของยอดสต๊อกและแพ็กที่สแกน: ยังไม่ยืนยัน<br>เวลาที่สินค้าคงเหลือถูกตรวจจริง: ไม่ระบุ<br>ดึงข้อมูลเมื่อ ${esc(at(p.fetchedAt))}<br>อ่านจาก StockDay ซึ่งซิงก์ข้อมูล Ada เข้ามา ไม่ใช่ผลนับหน้าร้าน</p></details><button class="scpda-primary" id="startLocalCount">นับสินค้า</button>`;$('#productBack').onclick=()=>countNavigate('lookup');$('#startLocalCount').onclick=()=>search(p.barcode,{intent:'count',expected:recentProduct(p)});countNavigate('product');}
async function search(value=$('#barcode').value,{intent='recent',expected=null}={}){
 if(!actor||busy)return;lookupBusy(true);const round=++generation;countNavigate('lookup');$('#choices').hidden=true;$('#productPane').hidden=true;selected=null;status('กำลังตรวจข้อมูลใน StockDay…','info');
 try{
  const result=await lookup.candidates(value);if(round!==generation||!actor)return;
  let candidates=result.candidates;
  if(expected){candidates=candidates.filter(p=>p.code===expected.productCode&&(expected.skuId===null||String(p.skuId)===expected.skuId));if(candidates.length!==1)throw Error('รหัสสินค้าเปลี่ยน กรุณาสแกนใหม่');}
  if(!candidates.length){status('ไม่พบรหัสที่ตรงกัน กรอกบาร์โค้ดหรือรหัส IC ให้ครบ');return;}
  if(candidates.length>1){
   const box=$('#choices');$('#lookupPane').classList.add('has-product');box.hidden=false;box.innerHTML='<h2>พบรหัสตรงกันหลายสินค้า</h2><p class="subtle">ตรวจ IC และชื่อก่อนเลือก</p>'+candidates.map((p,i)=>`<button class="scpda-choice" data-choice="${i}">${esc(p.name)}<small>IC ${esc(p.code)}</small></button>`).join('');
   for(const button of box.querySelectorAll('[data-choice]'))button.onclick=async()=>{if(busy||!actor)return;lookupBusy(true);status('กำลังอ่านรายละเอียดสินค้า…','info');try{const p=await lookup.resolve(candidates[Number(button.dataset.choice)],result.query,result.stockRows);if(round===generation&&actor){await acceptProduct(p,intent);status('');}}catch(e){if(round===generation)handle(e);}finally{lookupBusy(false);}};
   status('');return;
  }
  const product=await lookup.resolve(candidates[0],result.query,result.stockRows);if(round!==generation||!actor)return;await acceptProduct(product,intent);status('');
 }catch(e){if(round===generation)handle(e);}finally{lookupBusy(false);}
}
$('#lookupButton').onclick=()=>search();$('#barcode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search();}};
class LiveCamera extends CameraScanner {
 render(){super.render();this.q('.camera-demo').hidden=true;this.q('#cameraConfirm').textContent='เลือกสินค้า';}
 async showResult(result){const token=this.token;this.release();this.message('กำลังตรวจบาร์โค้ดใน StockDay…');try{const r=await lookup.candidates(result.value);if(token!==this.token||!this.dialog.open)return;if(r.candidates.length!==1){this.close();$('#barcode').value=result.value;await search(result.value);return;}this.resolved=await lookup.resolve(r.candidates[0],r.query,r.stockRows);if(token!==this.token||!this.dialog.open)return;super.showResult({...result,kind:'known',product:{barcode:result.value,name:this.resolved.name}});this.q('#cameraResult small').textContent='ตรวจชื่อสินค้าแล้วเปิดรายละเอียด ยังไม่มีการส่งผลนับ';this.message('อ่านสำเร็จ · กล้องหยุดแล้ว');}catch(e){if(token!==this.token||!this.dialog.open)return;this.result=null;this.update('error');this.message(e.message||'ตรวจข้อมูลไม่ได้ กรุณาลองใหม่');if(e.status===401)handle(e);}}
}
const camera=new LiveCamera({catalog:[],onConfirm:barcode=>{$('#barcode').value=barcode;if(camera.resolved&&actor){acceptProduct(camera.resolved).catch(handle);status('');}}});
window.addEventListener('scpda-background',()=>camera.close());
$('#scanButton').onclick=()=>{if(actor&&!busy)camera.open();};window.addEventListener('scpda-volume',()=>{if(!actor||busy)return;if(!camera.dialog.open)camera.open();else if(camera.phase==='aiming')camera.capture();});
$('#accountButton').onclick=()=>$('#accountDialog').showModal();$('#closeAccount').onclick=()=>$('#accountDialog').close();$('#logoutButton').onclick=async()=>{loggedOut();status('ออกจากระบบแล้ว','info');try{await native('logout');}catch{/* Native logout clears its reader token even on network failure. */}};
$('#websiteButton').onclick=()=>native('openWebsite').catch(handle);$('#demoButton').onclick=()=>native('openDemo').catch(handle);
async function activate(){if(busy)return;busy=true;$('#activateDevice').disabled=true;$('#activateFromSettings').disabled=true;$('#accountDialog').close();try{const state=await native('activateDevice');paired=state.paired===true;loggedOut();status('เชื่อมเครื่องแล้ว เลือกผู้ใช้งานและใส่ PIN','info');}catch(e){handle(e);}finally{busy=false;$('#activateDevice').disabled=false;$('#activateFromSettings').disabled=false;}}
$('#activateDevice').onclick=$('#activateFromSettings').onclick=activate;
loggedOut();if(!window.SCPDAHost?.invoke){$('#activationPane').hidden=true;$('#loginPane').hidden=false;$('#hostHint').hidden=false;$('#loginButton').disabled=true;}else native('status').then(s=>{paired=s.paired===true;loggedOut();}).catch(handle);
