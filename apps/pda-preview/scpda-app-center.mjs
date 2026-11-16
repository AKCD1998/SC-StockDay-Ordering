const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class ScpdaAppCenter{
 constructor({request,prepareInstall}){
  this.request=request;this.prepareInstall=prepareInstall;this.generation=0;this.data=null;this.timer=null;
  this.dialog=document.createElement('dialog');this.dialog.id='scpdaAppCenter';this.dialog.className='scpda-app-center';this.dialog.setAttribute('aria-labelledby','scpdaAppCenterTitle');
  this.dialog.innerHTML='<header><div><small>SC APP CENTER</small><h2 id="scpdaAppCenterTitle">อัปเดตแอป</h2></div><button type="button" id="closeScpdaAppCenter" aria-label="ปิด App Center">×</button></header><div id="scpdaAppCenterBody"></div><p id="scpdaAppCenterMessage" role="status"></p><progress id="scpdaAppCenterProgress" max="100" hidden></progress><button type="button" id="scpdaAppCenterAction" class="scpda-primary">ตรวจอัปเดต</button><button type="button" id="scpdaAppCenterLater" class="scpda-secondary">ไว้ภายหลัง</button>';
  document.body.append(this.dialog);this.q('#closeScpdaAppCenter').onclick=this.q('#scpdaAppCenterLater').onclick=()=>this.dialog.close();this.dialog.addEventListener('close',()=>{if(!this.dialog.open){if(this.dialogGeneration===this.generation)this.generation++;clearTimeout(this.timer);}});this.q('#scpdaAppCenterAction').onclick=()=>this.action();window.addEventListener('scpda-foreground',()=>{if(this.dialog.open)this.poll();});
 }
 q(selector){return this.dialog.querySelector(selector);}
 render(){
  const d=this.data||{},r=d.release,phase=d.phase,button=this.q('#scpdaAppCenterAction');
  this.q('#scpdaAppCenterBody').innerHTML='<div class="scpda-app-center-product"><img src="./scpda-icon.png" alt=""><div><h3>SCPDA</h3><p>นับสินค้า · เช็คราคา</p></div></div><p class="scpda-app-center-version">รุ่นที่ติดตั้ง '+esc(d.installedVersion||'—')+'</p>'+(r?'<div class="scpda-app-center-release"><strong>'+(d.updateAvailable?'รุ่นใหม่ ':'รุ่นล่าสุด ')+esc(r.versionName)+'</strong><span>'+((r.sizeBytes||0)/1048576).toFixed(1)+' MB</span><h4>มีอะไรใหม่</h4><p>'+esc(r.notes)+'</p></div>':'');this.q('#scpdaAppCenterTitle').textContent=d.updateAvailable?'มีอัปเดต SCPDA':'อัปเดตแอป';
  const messages={checking:'กำลังตรวจอัปเดต…',current:'คุณใช้รุ่นล่าสุดแล้ว',unpaired:'เชื่อมเครื่อง SCPDA ก่อนตรวจอัปเดต',available:'ติดตั้งทับแอปเดิม ประวัตินับและการเชื่อมเครื่องยังอยู่',downloading:'กำลังดาวน์โหลด '+(d.percent||0)+'%',ready:'ดาวน์โหลดพร้อมแล้ว',permission:d.canInstall?'อนุญาตแล้ว แตะติดตั้งอัปเดต':'อนุญาตให้ SCPDA ติดตั้งแอป แล้วกลับมาแตะติดตั้งอัปเดต',installing:'ยืนยันอัปเดตในหน้าต่าง Android',error:d.error||'ตรวจอัปเดตไม่ได้ กรุณาลองใหม่'};
  this.q('#scpdaAppCenterMessage').textContent=messages[phase]||'';const progress=this.q('#scpdaAppCenterProgress');progress.hidden=phase!=='downloading';progress.value=d.percent||0;button.disabled=['checking','downloading','installing'].includes(phase);button.textContent=['ready','permission'].includes(phase)?'ติดตั้งอัปเดต':phase==='available'?'อัปเดตตอนนี้':phase==='downloading'?'กำลังดาวน์โหลด…':'ตรวจอัปเดต';
 }
 async check({manual=false}={}){
  const generation=++this.generation;if(manual){document.querySelector('#accountDialog')?.close();this.data={...this.data,phase:'checking'};this.render();this.dialogGeneration=generation;if(!this.dialog.open)this.dialog.showModal();}
  try{const data=await this.request('checkAppUpdate');if(generation!==this.generation)return;this.data=data;const version=document.querySelector('#scpdaInstalledVersion');if(version)version.textContent=data.installedVersion||'—';this.render();if(!manual&&data.updateAvailable&&!document.querySelector('dialog[open]')){await this.prepareInstall();if(generation===this.generation){this.dialogGeneration=generation;this.dialog.showModal();}}}
  catch(e){if(generation!==this.generation)return;if(manual){this.data={...this.data,phase:'error',error:e.message};this.render();}}
 }
 async action(){
  if(['checking','downloading','installing'].includes(this.data?.phase))return;if(!['available','ready','permission'].includes(this.data?.phase)){await this.check({manual:true});return;}this.q('#scpdaAppCenterAction').disabled=true;
  try{await this.prepareInstall();this.data=await this.request(['ready','permission'].includes(this.data.phase)?'installAppUpdate':'startAppUpdate');this.render();this.poll();}catch(e){this.data={...this.data,phase:'error',error:e.message};this.render();}
 }
 poll(){clearTimeout(this.timer);if(!this.dialog.open||document.hidden)return;this.timer=setTimeout(async()=>{try{this.data=await this.request('appUpdateStatus');if(this.dialog.open)this.render();}catch{}if(['downloading','permission','installing'].includes(this.data?.phase))this.poll();},600);}
}
