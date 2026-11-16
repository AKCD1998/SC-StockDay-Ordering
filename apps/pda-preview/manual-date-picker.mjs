import {THAI_MONTHS,normalizeManualDate,manualDateText,isoDate,monthDays,bangkokToday} from './manual-label-date.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clampYear=year=>Math.max(1,Math.min(9999,year));
export class ManualDatePicker{
 constructor(){
  this.dialog=document.createElement('dialog');this.dialog.id='manualDatePicker';this.dialog.className='scpda-manual-date-dialog';this.dialog.setAttribute('aria-labelledby','manualDateTitle');
  this.dialog.innerHTML=`<header class="scpda-manual-date-header"><h2 id="manualDateTitle">เลือกวันที่</h2><button type="button" id="manualDateClose" aria-label="ปิดเลือกวันที่">×</button></header><label for="manualDateText">วัน / เดือน / ปี</label><input id="manualDateText" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off" autocapitalize="none" maxlength="10" placeholder="วว/ดด/ปปปป"><p class="scpda-manual-date-hint">กรอกได้ทั้ง ค.ศ. / พ.ศ. · แสดงเป็น ค.ศ.</p><p id="manualDateError" class="scpda-manual-date-error" role="alert" hidden></p><nav class="scpda-manual-date-nav" aria-label="เลือกเดือนและปี"><button type="button" id="manualDatePrev" aria-label="ปีก่อน">‹ ปี</button><div><button type="button" id="manualDateMonth"></button><button type="button" id="manualDateYear"></button></div><button type="button" id="manualDateNext" aria-label="ปีถัดไป">ปี ›</button></nav><div id="manualDateGrid"></div><footer class="scpda-manual-date-actions"><button type="button" id="manualDateCancel">ยกเลิก</button><button type="button" id="manualDateApply">ตกลง</button></footer>`;
  document.body.append(this.dialog);this.text=this.dialog.querySelector('#manualDateText');
  this.dialog.querySelector('#manualDateClose').onclick=this.dialog.querySelector('#manualDateCancel').onclick=()=>this.close();
  this.dialog.querySelector('#manualDateApply').onclick=()=>this.apply();
  this.dialog.querySelector('#manualDateMonth').onclick=()=>{this.view=this.view==='month'?'day':'month';this.render();};
  this.dialog.querySelector('#manualDateYear').onclick=()=>{this.view=this.view==='year'?'day':'year';this.yearStart=Math.max(1,Math.floor(this.year/12)*12);this.render();};
  this.dialog.querySelector('#manualDatePrev').onclick=()=>this.shift(-1);this.dialog.querySelector('#manualDateNext').onclick=()=>this.shift(1);
  this.text.oninput=()=>{this.error('');try{this.select(normalizeManualDate(this.text.value),false);this.render();}catch{this.selected=null;this.render();}};
  this.text.onblur=()=>{if(!this.text.value)return;try{this.select(normalizeManualDate(this.text.value));this.render();}catch{/* Keep incomplete typing until explicit confirmation. */}};
  this.text.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();this.apply();}};
  this.dialog.addEventListener('close',()=>{const opener=this.opener;this.target=null;this.opener=null;if(opener?.isConnected)opener.focus({preventScroll:true});});
 }
 bind(root){
  for(const input of root.querySelectorAll('.local-manual-date'))input.addEventListener('blur',()=>{if(!input.value)return;try{input.value=manualDateText(normalizeManualDate(input.value));input.dispatchEvent(new Event('change',{bubbles:true}));}catch{/* Validation on confirm preserves the raw draft. */}});
  for(const button of root.querySelectorAll('[data-pick-date]'))button.onclick=()=>this.open(document.getElementById(button.dataset.pickDate),button.dataset.dateLabel);
 }
 open(input,label){
  if(!input||input.disabled)return;this.target=input;this.opener=document.activeElement;this.view='day';this.error('');this.text.value=input.value;
  const today=bangkokToday().split('-').map(Number);this.year=today[0];this.month=today[1];this.selected=null;
  try{this.select(normalizeManualDate(input.value));}catch{/* No default date is silently selected. */}
  this.dialog.querySelector('#manualDateTitle').textContent=label;this.render();this.dialog.showModal();this.dialog.querySelector('#manualDateClose').focus({preventScroll:true});
 }
 close(){if(this.dialog.open)this.dialog.close();}
 error(message){const box=this.dialog.querySelector('#manualDateError');box.textContent=message;box.hidden=!message;}
 select(date,format=true){const [year,month]=date.split('-').map(Number);this.selected=date;this.year=year;this.month=month;if(format)this.text.value=manualDateText(date);}
 changePeriod(year,month){
  this.year=clampYear(year);this.month=month;
  if(this.selected){const day=Number(this.selected.slice(8));try{this.select(isoDate(this.year,this.month,day));this.error('');}catch{this.selected=null;this.text.value='';this.error('เดือนที่เลือกไม่มีวันที่ '+day+' กรุณาเลือกวันใหม่');}}
 }
 shift(direction){if(this.view==='year')this.yearStart=Math.max(1,Math.min(9988,this.yearStart+direction*12));else this.changePeriod(this.year+direction,this.month);this.render();}
 render(){
  const monthButton=this.dialog.querySelector('#manualDateMonth'),yearButton=this.dialog.querySelector('#manualDateYear'),prev=this.dialog.querySelector('#manualDatePrev'),next=this.dialog.querySelector('#manualDateNext');
  monthButton.textContent=THAI_MONTHS[this.month-1];monthButton.setAttribute('aria-label','เลือกเดือน '+THAI_MONTHS[this.month-1]);monthButton.setAttribute('aria-expanded',String(this.view==='month'));
  yearButton.textContent=String(this.year);yearButton.setAttribute('aria-label','เลือกปี '+this.year);yearButton.setAttribute('aria-expanded',String(this.view==='year'));
  prev.textContent=this.view==='year'?'‹ 12 ปี':'‹ ปี';next.textContent=this.view==='year'?'12 ปี ›':'ปี ›';prev.setAttribute('aria-label',this.view==='year'?'ช่วงปีก่อน':'ปีก่อน');next.setAttribute('aria-label',this.view==='year'?'ช่วงปีถัดไป':'ปีถัดไป');
  const grid=this.dialog.querySelector('#manualDateGrid');
  if(this.view==='year'){
   grid.innerHTML=`<p class="scpda-year-range">${this.yearStart}–${Math.min(9999,this.yearStart+11)}</p><div class="scpda-period-grid">${Array.from({length:12},(_,i)=>this.yearStart+i).filter(year=>year<=9999).map(year=>`<button type="button" data-year="${year}" aria-pressed="${year===this.year}">${year}</button>`).join('')}</div>`;
   for(const b of grid.querySelectorAll('[data-year]'))b.onclick=()=>{this.changePeriod(Number(b.dataset.year),this.month);this.view='month';this.render();};
  }else if(this.view==='month'){
   grid.innerHTML=`<div class="scpda-period-grid">${THAI_MONTHS.map((name,i)=>`<button type="button" data-month="${i+1}" aria-pressed="${i+1===this.month}">${name}</button>`).join('')}</div>`;
   for(const b of grid.querySelectorAll('[data-month]'))b.onclick=()=>{this.changePeriod(this.year,Number(b.dataset.month));this.view='day';this.render();};
  }else{
   const start=new Date(isoDate(this.year,this.month,1)+'T00:00:00Z').getUTCDay();
   grid.innerHTML=`<div class="scpda-day-grid">${['อา','จ','อ','พ','พฤ','ศ','ส'].map(day=>`<span class="scpda-weekday">${day}</span>`).join('')}${'<span></span>'.repeat(start)}${Array.from({length:monthDays(this.year,this.month)},(_,i)=>{const day=i+1,date=isoDate(this.year,this.month,day);return `<button type="button" data-day="${day}" aria-label="${day} ${esc(THAI_MONTHS[this.month-1])} ${this.year} ค.ศ." aria-pressed="${date===this.selected}">${day}</button>`;}).join('')}</div>`;
   for(const b of grid.querySelectorAll('[data-day]'))b.onclick=()=>{this.select(isoDate(this.year,this.month,Number(b.dataset.day)));this.error('');this.render();};
  }
 }
 apply(){
  try{const value=normalizeManualDate(this.text.value);if(!this.target?.isConnected){this.close();return;}this.target.value=manualDateText(value);this.target.dispatchEvent(new Event('change',{bubbles:true}));this.close();}
  catch(error){this.error(error.message);this.text.focus();}
 }
}
