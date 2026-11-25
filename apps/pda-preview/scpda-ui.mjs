import {restoreScpdaSession} from './scpda-startup.mjs';
import {takeDailySelfie,showStoreQr,chooseCompanion,chooseDeviceProfile,scanStoreQr,SCPDA_VERSION_NAME} from './scpda-daily-ui.mjs';
import {DAILY_PAIRS,dailyOperatorBranch,isCompanionOperator,operatorBranch} from './scpda-daily-contract.mjs';
import {validScpdaCredential} from './scpda-credential.mjs';
import {priceCheckHtml,priceStockInfoHtml} from './scpda-price-check.mjs';
import {PriceCheckRefresh} from './scpda-price-refresh.mjs';
import {RecentProductBook,recentProduct,touchRecent} from './scpda-recent-products.mjs';
import {Scpda004Picks} from './scpda-004-picks.mjs';
import {ScpdaCountUI} from './scpda-count-ui.mjs';
import {ScpdaAppCenter} from './scpda-app-center.mjs';
import {ScpdaAnnualUI} from './scpda-annual-ui.mjs';
import { StockDayLookup, requireScpdaActor } from './stockday-live-contract.mjs';
import { CameraScanner } from './camera-scanner.mjs';
window.__scpdaScanStoreQr=scanStoreQr;
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dailyExpiryTimer=null;
const pending=new Map();let serial=0,actor=null,generation=0,selected=null,busy=false,paired=false,recentItems=[],activeTab='count',currentView='lookup',lookupMode='count';
const recentBook=new RecentProductBook();
window.__scpdaReceive=(id,reply)=>{const row=pending.get(id);if(!row)return;clearTimeout(row.timer);pending.delete(id);if(reply.ok)row.resolve(reply.data);else{const e=Object.assign(new Error(reply.error||'เชื่อมต่อระบบไม่ได้'),{status:reply.status,code:reply.code});row.reject(e);}};
function native(op,body={}){return new Promise((resolve,reject)=>{if(!window.SCPDAHost?.invoke){reject(new Error('เปิดผ่านแอป SCPDA บน Android เพื่อเชื่อมระบบจริง'));return;}const id=String(++serial),timer=setTimeout(()=>{pending.delete(id);reject(new Error('ระบบตอบช้า กรุณาลองใหม่'));},['activateDevice','annualExport'].includes(op)?300000:45000);pending.set(id,{resolve,reject,timer});try{window.SCPDAHost.invoke(id,op,JSON.stringify(body));}catch{clearTimeout(timer);pending.delete(id);reject(new Error('เชื่อมกับแอปไม่ได้ กรุณาเปิดแอปใหม่'));}});}
function status(text,tone='error'){$('#status').hidden=!text;$('#status').textContent=text;$('#status').dataset.tone=tone;}
function deviceBranch(state){if(!state.paired)return;const branch=state.branchCode;if(state.operatorCode&&isCompanionOperator(state.operatorCode)&&![...$('#username').options].some(o=>o.value===state.operatorCode)){const option=document.createElement('option');option.value=option.textContent=state.operatorCode;$('#username').append(option);}for(const o of $('#username').options){const own=operatorBranch(o.value)===branch;const eligible=own&&(state.operatorCode?o.value===state.operatorCode:!isCompanionOperator(o.value));o.hidden=!eligible;o.disabled=!eligible;}$('#username').value=state.operatorCode|| (branch==='004'?'01004':branch==='005'?'01005':'01001');}
function loggedOut(){annualUI.disconnect();clearTimeout(dailyExpiryTimer);$('#resumeDaily').hidden=true;priceRefresh.stop();$('#priceStockInfo').close();countUI?.disconnect();picks?.disconnect();$('#countAreaLabel').hidden=true;$('#areaMode').hidden=true;actor=null;selected=null;activeTab='count';currentView='lookup';recentItems=[];renderRecent();generation++;$('#staffSelfie').hidden=true;$('#staffSelfie').removeAttribute('src');$('#sessionBar').hidden=true;$('#mainTabs').hidden=true;$('#preorderPane').hidden=true;$('#pricePane').hidden=true;camera.close();$('#activationPane').hidden=paired;$('#loginPane').hidden=!paired;$('#lookupPane').hidden=true;$('#productPane').hidden=true;$('#choices').hidden=true;$('#profile').textContent='ยังไม่ได้เชื่อมบัญชี';$('#logoutButton').hidden=true;$('#createCompanionQr').hidden=true;$('#accountDialog').close();}
function handle(e){if((window.SCPDA_WEB_COMPANION||isCompanionOperator($('#username').value))&&(e.status===401||['QR_REQUIRED','QR_EXPIRED','QR_USED','QR_INVALID'].includes(e.code))&&e.code!=='LOGIN_REJECTED'&&e.code!=='DEVICE_PROOF_INVALID'){paired=false;loggedOut();status(e.code==='LOGIN_REQUIRED'?'สแกน QR จากเครื่องหลักก่อนเข้าใช้':e.message||'สแกน QR จากเครื่องหลักสำหรับวันนี้');return;}if(e.code==='LOGIN_REJECTED'||e.code==='DEVICE_PROOF_INVALID'){status(e.message);return;}if(['DEVICE_CERT_INVALID','DEVICE_ACTIVATION_REQUIRED','DEVICE_REVOKED'].includes(e.code)){paired=false;loggedOut();status(e.message);return;}if(e.status===401){loggedOut();status('เซสชันหมดอายุ กรุณาใส่รหัสผ่านอีกครั้ง');}else status(e.message||'เชื่อมต่อระบบไม่ได้');}
async function request(op,body){const currentActor=actor;try{return await native(op,body);}catch(e){if(e.status===401&&actor===currentActor)loggedOut();throw e;}}
const annualUI=new ScpdaAnnualUI({mount:$('#lookupPane'),request});
const lookup=new StockDayLookup(request);
function countNavigate(view){
 if(['count','history'].includes(view)&&activeTab!=='count'){countUI.close();return;}
 if(view!=='price'){priceRefresh.stop();$('#priceStockInfo').close();}
 currentView=view;
 if(view!=='lookup')camera.close();
 $('#internalPickPane').hidden=view!=='pick';$('#localCountPane').hidden=view!=='count';$('#localHistoryPane').hidden=view!=='history';
 $('.scpda-scanner').hidden=view!=='lookup';$('#productPane').hidden=view!=='product';$('#pricePane').hidden=view!=='price';$('#recentPane').hidden=view!=='lookup'||!recentItems.length;
 $('#lookupPane').classList.toggle('has-product',view!=='lookup'||recentItems.length>0);$('#choices').hidden=true;$('#websiteButton').hidden=!['lookup','product'].includes(view);
 if(view==='lookup')renderRecent();else document.querySelector(view==='count'?'#localCountPane':view==='history'?'#localHistoryPane':view==='price'?'#pricePane':view==='pick'?'#internalPickPane':'#productPane').scrollIntoView({block:'start'});
}
function switchTab(tab){
 if(!actor||!['count','preorder','price'].includes(tab))return;
 annualUI.button.hidden=tab!=='count'||actor.branchCode!=='005'||actor.annualCountAvailable!==true;
 if(tab==='count'&&annualUI.actor!==actor)annualUI.connect(actor);
 if(currentView==='count')countUI.autosave();priceRefresh.stop();$('#priceStockInfo').close();camera.close();countUI.close();generation++;selected=null;lookupMode='count';activeTab=tab;currentView='lookup';
 status('');$('#lookupPane').hidden=tab==='preorder';$('#preorderPane').hidden=tab!=='preorder';$('#localHistoryButton').hidden=tab!=='count';
 for(const b of document.querySelectorAll('[data-app-tab]'))b.setAttribute('aria-pressed',String(b.dataset.appTab===tab));
 $('#scanActionLabel').textContent=tab==='price'?'สแกนเช็คราคา':'ใช้กล้องสแกน';$('#lookupLabel').textContent=tab==='price'?'บาร์โค้ด / รหัส SKU':'บาร์โค้ด / รหัส IC';$('#barcode').inputMode=tab==='price'?'text':'numeric';
 $('#areaMode').hidden=tab!=='count'||!actor.canRecordInternalPick;for(const b of document.querySelectorAll('[data-lookup-mode]'))b.setAttribute('aria-pressed',String(b.dataset.lookupMode===lookupMode));if(tab!=='preorder')countNavigate('lookup');
}
let priceInfoState={refreshing:false,error:null};
const priceLookup=new StockDayLookup(native);
const priceRefresh=new PriceCheckRefresh({
 load:async p=>{const r=await priceLookup.candidates(p.productCode),matches=r.candidates.filter(c=>c.code===p.productCode&&(p.skuId===null||String(c.skuId)===p.skuId));if(matches.length!==1)throw Object.assign(Error('รหัสสินค้าเปลี่ยน กรุณาสแกนใหม่'),{code:'IDENTITY_CHANGED'});return priceLookup.resolve(matches[0],r.query,r.stockRows);},
 onData:p=>{selected=p;renderPriceProduct();},
 onState:s=>{priceInfoState=s;if(s.error?.code==='IDENTITY_CHANGED'){countNavigate('lookup');status(s.error.message);return;}if(s.error&&(s.error.status===401||['DEVICE_CERT_INVALID','DEVICE_ACTIVATION_REQUIRED','DEVICE_REVOKED'].includes(s.error.code))){handle(s.error);return;}renderPriceInfo();}
});
function renderPriceInfo(){if(selected&&$('#priceStockInfo').open)$('#priceStockInfoBody').innerHTML=priceStockInfoHtml(selected,priceInfoState);}
function renderPriceProduct(){const root=$('#pricePane');root.innerHTML=priceCheckHtml(selected);root.querySelector('#priceCheckBack').onclick=()=>countNavigate('lookup');root.querySelector('#priceStockInfoButton').onclick=()=>{$('#priceStockInfoBody').innerHTML=priceStockInfoHtml(selected,priceInfoState);$('#priceStockInfo').showModal();priceRefresh.refresh();};renderPriceInfo();}
function showPriceProduct(p){countUI.close();selected=p;priceInfoState={refreshing:false,error:null};renderPriceProduct();countNavigate('price');priceRefresh.start(p);}
$('#closePriceStockInfo').onclick=()=>$('#priceStockInfo').close();


function renderRecent(){
 const pane=$('#recentPane'),list=$('#recentList');if(!pane||!list)return;
 $('#recentCount').textContent=String(recentItems.length)+'/10';const action=activeTab==='price'?'เช็คราคา':lookupMode==='pick'?'หยิบ':'นับสินค้า';
 list.innerHTML=recentItems.map((p,i)=>`<li class="scpda-recent-row" data-product-code="${esc(p.productCode)}"><button type="button" class="scpda-recent-open" data-recent-open="${i}" aria-label="ดู ${esc(p.name)} รหัส ${esc(p.productCode)}" ${busy?'disabled':''}>${esc(p.name)}</button><button type="button" class="scpda-recent-count" data-recent-count="${i}" aria-label="${action} ${esc(p.name)}" ${busy?'disabled':''}>${action}</button></li>`).join('');
 for(const button of list.querySelectorAll('[data-recent-open]'))button.onclick=()=>search(recentItems[Number(button.dataset.recentOpen)].lookupCode,{intent:activeTab==='price'?'price':'product',expected:recentItems[Number(button.dataset.recentOpen)]});
 for(const button of list.querySelectorAll('[data-recent-count]'))button.onclick=()=>search(recentItems[Number(button.dataset.recentCount)].lookupCode,{intent:activeTab==='price'?'price':lookupMode==='pick'?'pick':'count',expected:recentItems[Number(button.dataset.recentCount)]});
 pane.hidden=!actor||!recentItems.length;
}
function lookupBusy(value){busy=value;$('#lookupButton').disabled=value;$('#scanButton').disabled=value;for(const b of document.querySelectorAll('.scpda-recent-row button,[data-choice]'))b.disabled=value;}
async function acceptProduct(p,intent='recent'){
 selected=p;recentItems=touchRecent(recentItems,p);const who={...actor};recentBook.remember(who,p).catch(()=>{});renderRecent();
 if(intent==='pick'){countUI.close();await picks.open(p);return;}
 if(intent==='count'){countUI.close();await countUI.start(p);return;}
 if(intent==='product'){showProduct(p);return;}
 if(intent==='price'){showPriceProduct(p);return;}
 countUI.close();countNavigate('lookup');$('#recentPane').scrollIntoView({block:'nearest'});
}
const picks=new Scpda004Picks({getActor:()=>actor,request:native,navigate:countNavigate,message:status});
const countUI=new ScpdaCountUI({getActor:()=>actor,navigate:countNavigate,message:status,request:native});
$('#localHistoryButton').onclick=()=>countUI.showHistory();
async function acceptSession(data){clearTimeout(dailyExpiryTimer);if(data.dailySession===true&&Number.isFinite(Date.parse(data.expiresAt))){dailyExpiryTimer=setTimeout(async()=>{await countUI.autosave().catch(()=>{});if(window.SCPDA_WEB_COMPANION)paired=false;loggedOut();status('ขึ้นวันใหม่แล้ว กรุณาเข้าสู่ระบบอีกครั้ง','info');},Math.max(0,Date.parse(data.expiresAt)-Date.now()));}actor=requireScpdaActor(data);generation++;const loginGeneration=generation;try{recentItems=await recentBook.list(actor);}catch{recentItems=[];}if(generation!==loginGeneration||!actor){recentItems=[];return;}$('#loginPane').hidden=true;$('#lookupPane').hidden=false;$('#sessionBar').hidden=false;$('#mainTabs').hidden=false;$('#profile').textContent=actor.operatorCode+' · สาขา '+actor.branchCode;$('#accountLabel').textContent=actor.operatorCode+' · สาขา '+actor.branchCode;$('#pinRotation').hidden=!actor.rotationDue;$('#logoutButton').hidden=false;status('');switchTab('count');countUI.connect(data.countUploadAvailable===true);picks.connect(data.countUploadAvailable===true);$('#countAreaLabel').hidden=!actor.countScope;$('#countAreaLabel').textContent=actor.countScope?'นับ: '+actor.countScope.label:'';$('#countConnectionHint').textContent=data.countUploadAvailable?'ส่งผลนับเป็นหลักฐาน · รอผู้ดูแลทบทวน':'เก็บผลนับในเครื่อง · ยังไม่เชื่อมการส่ง';countUI.badge();$('#barcode').focus();$('#createCompanionQr').hidden=!(Object.hasOwn(DAILY_PAIRS,actor.operatorCode)&&data.dailySession===true);if(data.dailySession===true){const current=generation;native('dailySelfie').then(photo=>{if(current===generation&&actor&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo.image||'')){$('#staffSelfie').src=photo.image;$('#staffSelfie').hidden=false;}}).catch(()=>{});}}
$('#loginButton').onclick=async()=>{if(busy)return;const username=$('#username').value.trim(),password=$('#password').value;if(!username||!validScpdaCredential(password)){status('เลือกผู้ใช้งานและกรอกรหัสผ่าน');return;}busy=true;$('#loginButton').disabled=true;status('กำลังเข้าสู่ระบบ SCPDA…','info');try{let selfie; if(dailyOperatorBranch(username)){const policy=await native('dailyPolicy');if(policy.enabled)selfie=await takeDailySelfie();}const data=await native('login',{username,password,...(selfie?{selfie}:{})});await acceptSession(data);}catch(e){handle(e);}finally{$('#password').value='';busy=false;$('#loginButton').disabled=false;}};
$('#password').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#loginButton').click();}};
const number=v=>v===null?'ไม่ระบุ':new Intl.NumberFormat('th-TH',{maximumFractionDigits:20}).format(v),money=v=>v===null?'ไม่ระบุ':new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const at=v=>v?new Date(v).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'ไม่ระบุ';
function showProduct(p){countUI.close();selected=p;const root=$('#productPane');root.innerHTML=`<button type="button" class="scpda-back" id="productBack">← กลับ</button><p class="scpda-ic">IC ${esc(p.productCode)}</p><h2 class="scpda-product-name">${esc(p.name)}</h2><p class="subtle">บาร์โค้ด / รหัสที่ค้น: <span class="mono">${esc(p.barcode)}</span></p><div class="scpda-qty-card"><span>ยอดตามเว็บไซต์<br><small>สาขา ${esc(p.branchCode)} · Full Sync</small></span><strong>${esc(number(p.stock.quantity))}</strong></div>${p.stock.zeroMayRepresentMissing?'<p class="scpda-warning">ยอด 0 นี้อาจเป็นข้อมูลที่ยังไม่ครบ จึงยังไม่ยืนยันว่าของหมด</p>':''}${!p.stock.recordPresent?'<p class="scpda-warning">ยังไม่พบยอดอ้างอิงของ IC นี้ ไม่ได้หมายถึงจำนวน 0</p>':''}<h3>ราคาขายปลีก</h3><ul class="scpda-price-list">${p.prices.length?p.prices.map(r=>`<li><span>${esc(r.unit||'หน่วยยังไม่ระบุ')}</span><strong>${esc(money(r.amount))} <small>${esc(r.currency==='THB'?'บาท':r.currency)}</small></strong></li>`).join(''):'<li>ยังไม่พบข้อมูลราคา</li>'}</ul><details class="scpda-meta"><summary>ข้อมูลอ้างอิง</summary><p>หน่วยบนเว็บไซต์: ${esc(p.stock.displayUnit||'ไม่ระบุ')}<br>หน่วยอ้างอิงของยอดสต๊อกและแพ็กที่สแกน: ยังไม่ยืนยัน<br>เวลาที่สินค้าคงเหลือถูกตรวจจริง: ไม่ระบุ<br>ดึงข้อมูลเมื่อ ${esc(at(p.fetchedAt))}<br>อ่านจาก StockDay ซึ่งซิงก์ข้อมูล Ada เข้ามา ไม่ใช่ผลนับหน้าร้าน</p></details><button class="scpda-primary" id="startLocalCount">นับสินค้า</button>`;$('#productBack').onclick=()=>countNavigate('lookup');$('#startLocalCount').onclick=()=>search(p.barcode,{intent:'count',expected:recentProduct(p)});countNavigate('product');}
async function search(value=$('#barcode').value,{intent=activeTab==='price'?'price':lookupMode==='pick'?'pick':'recent',expected=null}={}){
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
const camera=new LiveCamera({catalog:[],nativeCamera:window.SCPDAHost?.hasNativeScanner?.()?native:null,onConfirm:barcode=>{$('#barcode').value=barcode;if(camera.resolved&&actor){acceptProduct(camera.resolved,activeTab==='price'?'price':lookupMode==='pick'?'pick':'recent').catch(handle);status('');}}});
window.addEventListener('scpda-background',()=>{camera.close();priceRefresh.pause(true);});
window.addEventListener('scpda-foreground',()=>priceRefresh.pause(false));
document.addEventListener('visibilitychange',()=>priceRefresh.pause(document.hidden));
$('#scanButton').onclick=()=>{if(actor&&!busy&&activeTab!=='preorder')camera.open();};window.addEventListener('scpda-volume',()=>{if(!actor||busy||activeTab==='preorder')return;if(!camera.dialog.open)camera.open();else if(camera.phase==='aiming')camera.capture();});
$('#accountButton').onclick=()=>$('#accountDialog').showModal();$('#closeAccount').onclick=()=>$('#accountDialog').close();$('#logoutButton').onclick=async()=>{loggedOut();status('ออกจากระบบแล้ว','info');try{await native('logout');}catch{/* Native logout clears its reader token even on network failure. */}};
$('#resumeDaily').onclick=async()=>{try{const data=await native('resume');$('#resumeDaily').hidden=true;await acceptSession(data);}catch(e){handle(e);}};
$('#createCompanionQr').onclick=async()=>{const button=$('#createCompanionQr');button.disabled=true;try{const devices=await native('companionDevices');$('#accountDialog').close();const target=await chooseCompanion(devices.records||[]);if(!target)return;const data=await native('createCompanionQr',{target});showStoreQr(data);}catch(e){handle(e);}finally{button.disabled=false;}};
$('#websiteButton').onclick=()=>native('openWebsite').catch(handle);$('#demoButton').onclick=()=>native('openDemo').catch(handle);
async function activate(){if(busy)return;busy=true;$('#activateDevice').disabled=true;$('#activateFromSettings').disabled=true;$('#accountDialog').close();try{const state=await native('activateDevice');paired=state.paired===true;deviceBranch(state);loggedOut();status('เชื่อมเครื่องแล้ว เลือกผู้ใช้งานและใส่รหัสผ่าน','info');}catch(e){handle(e);}finally{busy=false;$('#activateDevice').disabled=false;$('#activateFromSettings').disabled=false;}}
$('#activateDevice').onclick=$('#activateFromSettings').onclick=activate;
async function checkpointBeforeSwitch(){
 if(annualUI.dialog.open&&annualUI.body.querySelector('[data-editing-point], input:invalid'))throw Error('ตรวจจำนวนและบันทึกจุดนับก่อนเปลี่ยนสาขา');
 if(!countUI.root.hidden)await countUI.autosave();await annualUI.checkpoint();camera.close();
}
async function joinBranch(){
 if(busy)return;busy=true;$('#loginButton').disabled=true;
 try{await checkpointBeforeSwitch();$('#accountDialog').close();const grant=await scanStoreQr();
  const state=await native('setCompanionGrant',grant);paired=state.paired===true;deviceBranch(state);loggedOut();
  status('กำลังเชื่อมสาขา '+state.branchCode+' · '+state.operatorCode+' · ใส่รหัสผ่านเพื่อเริ่มงาน','info');
 }catch(error){handle(error);}finally{busy=false;$('#loginButton').disabled=false;}
}
$('#joinBranchQr').onclick=$('#joinBranchFromActivation').onclick=joinBranch;
$('#switchDeviceProfile').onclick=async()=>{
 if(busy)return;busy=true;$('#loginButton').disabled=true;
 try{await checkpointBeforeSwitch();const data=await native('deviceProfiles');const key=await chooseDeviceProfile(data.records||[]);if(!key)return;
  const state=await native('switchDeviceProfile',{profileKey:key});paired=state.paired===true;deviceBranch(state);loggedOut();$('#accountDialog').close();await startup();
 }catch(error){handle(error);}finally{busy=false;$('#loginButton').disabled=false;}
};

for(const b of document.querySelectorAll('[data-lookup-mode]'))b.onclick=()=>{lookupMode=b.dataset.lookupMode;for(const row of document.querySelectorAll('[data-lookup-mode]'))row.setAttribute('aria-pressed',String(row===b));countNavigate('lookup');$('#scanActionLabel').textContent=lookupMode==='pick'?'สแกนสินค้าที่จะหยิบ':'ใช้กล้องสแกน';renderRecent();};$('#openPickHistory').onclick=()=>picks.showHistory();
for(const b of document.querySelectorAll('[data-app-tab]'))b.onclick=()=>switchTab(b.dataset.appTab);
window.__scpdaBack=()=>{if(!actor)return false;if(annualUI.dialog.open){annualUI.dialog.close();return true;}if(currentView!=='lookup'){if(currentView==='count')countUI.autosave();countUI.close();countNavigate('lookup');return true;}if(activeTab!=='count'){switchTab('count');return true;}return false;};

const appCenter=new ScpdaAppCenter({request:native,prepareInstall:async()=>{camera.close();if(!countUI.root.hidden)await countUI.autosave();}});
$('#openScpdaAppCenter').onclick=async()=>{if(window.SCPDA_WEB_COMPANION){try{await countUI.autosave();const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();location.reload();}catch(e){handle(e);}}else appCenter.check({manual:true});};
let restoringSession=false;
function startupLoading(phase='loading',message='กำลังตรวจสอบการเข้าสู่ระบบ'){
 const overlay=$('#sessionLoading');overlay.hidden=phase==='done';overlay.dataset.state=phase;
 if(phase==='loading'){$('#loginPane').hidden=true;$('#activationPane').hidden=true;}
 $('#sessionLoadingMessage').textContent=message;
 $('#sessionLoadingRetry').hidden=phase!=='retry';$('#sessionLoadingLogin').hidden=phase!=='retry'||!paired;
 document.querySelector('main').setAttribute('aria-busy',String(phase==='loading'));document.querySelector('main').inert=phase!=='done';
}
async function startup(){
 if(restoringSession)return;restoringSession=true;
 try{
  await restoreScpdaSession({status:()=>native('status'),resume:()=>native('resume'),
   busy:()=>startupLoading(),device:s=>{paired=s.paired===true;deviceBranch(s);loggedOut();if(s.dailyResumeAvailable){$('#loginPane').hidden=true;$('#activationPane').hidden=true;}},
   authenticated:acceptSession,ready:()=>startupLoading('done'),
   needsLogin:error=>{if(error)handle(error);startupLoading('done');},
   retryable:error=>startupLoading('retry',error.message||'ยังเชื่อมต่อไม่ได้ งานที่บันทึกไว้ยังอยู่ในเครื่อง')});
 }finally{restoringSession=false;}
 if(paired&&$('#sessionLoading').hidden)void appCenter.check();
}
$('#sessionLoadingRetry').onclick=startup;
$('#sessionLoadingLogin').onclick=()=>{startupLoading('done');loggedOut();};
loggedOut();if(!window.SCPDAHost?.invoke){$('#activationPane').hidden=true;$('#loginPane').hidden=false;$('#hostHint').hidden=false;$('#loginButton').disabled=true;startupLoading('done');}else void startup();

if(window.SCPDA_WEB_COMPANION){$('#joinBranchFromActivation').hidden=true;$('#openScpdaAppCenter').textContent='อัปเดตเว็บแอป';$('#username').value='02005';$('#activationPane h2').textContent='เชื่อมกับเครื่องร้าน';$('#activationPane .subtle').textContent=(navigator.standalone||matchMedia('(display-mode: standalone)').matches)?'เชื่อม Wi-Fi ร้าน แล้วสแกน QR จากเครื่องหลัก':'Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิด SCPDA จากไอคอน';$('#activateDevice').textContent=$('#activateFromSettings').textContent='สแกน QR จากเครื่องหลัก';$('#demoButton').hidden=true;}
