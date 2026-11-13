import {labelRegion} from './label-image.mjs?aim=3';
import {LabelVision,pixels,patchFeature,matchPatch,intersection} from './label-vision.mjs?aim=3';
import {parseLabelText,proposeLabelBoxes,ROLE_NAMES} from './label-parser.mjs?aim=3';
import {parsePrintedDate,validLabelDate,labelDateText,dateBounds,dateOrderInvalid} from './label-dates.mjs?aim=3';
import {dateField,bindDateFields} from './label-date-field.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={lot:'#087545',mfg:'#bd283d',exp:'#2457d6'};
const base=()=>globalThis.SCPDA_LABEL_OCR_ASSET_BASE||'./vendor/tesseract/';
let library;
async function loadLibrary(){if(window.Tesseract)return window.Tesseract;if(!library)library=new Promise((ok,no)=>{const script=document.createElement('script');script.src=new URL('tesseract.min.js',new URL(base(),location.href)).href;script.onload=()=>ok(window.Tesseract);script.onerror=()=>{library=null;no(Error('เปิดตัวอ่านฉลากไม่ได้ ลองเชื่อมต่อแล้วเปิดใหม่'));};document.head.append(script);});return library;}
import {visibleFrame,normalizedBox,frameBox,regionAt,overlaps} from './label-camera.mjs';
export class LabelCapture {
 constructor(){
  this.sequence=0;this.phase='closed';this.worker=null;this.workerPromise=null;
  this.dialog=document.createElement('dialog');this.dialog.className='label-capture';this.dialog.id='labelCapture';this.dialog.setAttribute('aria-label','อ่านฉลากสินค้า');document.body.append(this.dialog);
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.menuOpen?this.dismissPicker():this.close();});
  window.addEventListener('pagehide',()=>this.close());window.addEventListener('scpda-background',()=>this.close());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.close();});
 }
 q(s){return this.dialog.querySelector(s);}
 valid(seq){return seq===this.sequence&&this.dialog.open;}
 status(text){const el=this.q('#labelStatus');if(el)el.textContent=text;}
 open({context,current,onApply}){
  this.close();this.current=current;this.onApply=onApply;this.boxes=[];this.lines=[];this.hints=[];this.preferred={};this.hintRevision=0;
  this.dialog.innerHTML=`<header class="label-capture-head"><div><small>${esc(context)}</small><h2>อ่านฉลากสินค้า</h2></div><button type="button" id="labelClose" class="label-close" aria-label="กลับไปกรอกจำนวน">×</button></header><div class="label-capture-scroll"><section id="labelStage" class="label-stage"><video id="labelVideo" autoplay muted playsinline></video><img id="labelImage" alt="ฉลากที่ถ่าย" hidden><svg id="labelBoxes" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="img" aria-label="กรอบข้อความ กดค้างเพื่อเลือกประเภท หรือกด Enter เพื่อเลือกบริเวณกลางภาพ" hidden></svg><div id="labelAim" class="label-aim"><span>กดค้างเพื่อเลือกประเภท</span></div><div id="labelPlaceholder" class="label-placeholder">ถ่ายให้เห็นบริเวณฉลาก</div><span id="labelLiveBadge" class="label-live-badge" hidden>กำลังเล็ง</span></section><p id="labelStatus" role="status" aria-live="polite"></p><div id="labelLegend" class="label-legend" hidden>${Object.keys(colors).map(r=>`<span class="${r}">${ROLE_NAMES[r]}</span>`).join('')}</div><section id="labelReview" hidden></section></div><footer class="label-capture-actions"><div id="labelCameraActions"><button id="labelShoot" class="label-primary" type="button">ถ่ายฉลาก</button><button id="labelFile" class="label-secondary" type="button">เลือกรูป</button></div><div id="labelBoxActions" hidden><button id="labelToReview" class="label-primary" type="button">ตรวจข้อมูล</button><button id="labelRetake" type="button" class="label-quiet">ถ่ายใหม่ / เลือกรูป</button></div><div id="labelReviewActions" hidden><button id="labelApply" class="label-primary" type="button">ใช้ข้อมูลที่เลือก</button><button id="labelBackBoxes" class="label-quiet" type="button">กลับไปแก้กรอบ</button></div></footer><section id="labelRolePicker" class="label-role-picker" role="group" aria-labelledby="labelRoleTitle" hidden><h3 id="labelRoleTitle">กรอบนี้เป็นข้อมูลอะไร?</h3><div class="label-role-choices">${Object.keys(colors).map(role=>`<button type="button" data-label-role="${role}" class="label-role-choice ${role}"><span class="label-role-dot"></span>${ROLE_NAMES[role]}</button>`).join('')}</div><button id="labelDeleteRegion" class="label-quiet" type="button" hidden>ลบกรอบนี้</button><button id="labelCancelRole" class="label-secondary" type="button">ยกเลิก</button></section>`;
  this.q('#labelClose').onclick=()=>this.close();this.q('#labelFile').onclick=()=>this.pick();this.q('#labelShoot').onclick=()=>this.capture();this.q('#labelRetake').onclick=()=>this.camera();this.q('#labelToReview').onclick=()=>this.review();this.q('#labelApply').onclick=()=>this.apply();this.q('#labelBackBoxes').onclick=()=>{this.phase='photo';this.boxView();this.draw();};
  for(const button of this.dialog.querySelectorAll('[data-label-role]'))button.onclick=()=>this.chooseRole(button.dataset.labelRole);
  this.q('#labelCancelRole').onclick=()=>this.dismissPicker();this.q('#labelDeleteRegion').onclick=()=>this.deleteRegion();
  this.bindPress();this.dialog.showModal();window.SCPDA_LABEL_CAPTURE_OPEN=true;this.camera();
 }
 release(){if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=null;const v=this.q('#labelVideo');if(v){v.pause();v.srcObject=null;}}
 stopLive(){this.vision?.close();this.vision=null;clearInterval(this.visionTimer);this.liveFrame=null;this.candidateBoxes=[];this.semanticTracks=[];clearTimeout(this.liveTimer);clearInterval(this.motionTimer);this.cancelPress();this.liveTimer=null;this.motionTimer=null;this.lastSignature=null;this.displaySignature=null;clearTimeout(this.staleTimer);}
 async camera(){
  this.stopLive();const seq=++this.sequence;this.release();this.cancelWorker();this.phase='live';this.busy=false;this.liveBusy=false;this.readerError=false;this.imageCanvas=null;this.boxes=[];this.lines=[];this.hints=[];this.preferred={};this.sceneRevision=0;this.hintRevision++;this.lastMotionAt=0;this.dismissPicker(false);
  this.q('#labelImage').removeAttribute('src');this.q('#labelReview').hidden=true;this.q('#labelStage').hidden=false;this.q('#labelVideo').hidden=false;this.q('#labelImage').hidden=true;this.q('#labelBoxes').setAttribute('hidden','');this.q('#labelAim').hidden=true;this.q('#labelLegend').hidden=true;this.q('#labelCameraActions').hidden=false;this.q('#labelBoxActions').hidden=true;this.q('#labelReviewActions').hidden=true;this.q('#labelPlaceholder').hidden=false;this.q('#labelShoot').disabled=true;this.q('#labelLiveBadge').hidden=true;this.status('');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:1600}},audio:false});
   if(!this.valid(seq)){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;this.q('#labelVideo').srcObject=stream;await this.q('#labelVideo').play();if(!this.valid(seq))return;
   const first=visibleFrame(this.q('#labelVideo'),this.q('#labelStage'),1280);if(first){this.frameSize={w:first.width,h:first.height};this.q('#labelBoxes').setAttribute('viewBox',`0 0 ${first.width} ${first.height}`);this.draw();}this.q('#labelPlaceholder').hidden=true;this.q('#labelShoot').disabled=false;this.q('#labelLiveBadge').hidden=false;this.q('#labelBoxes').removeAttribute('hidden');this.status('กำลังหาแนวข้อความ · กดค้างเพื่อเลือกประเภท');
   this.semanticTracks=[];this.candidateBoxes=[];this.vision=new LabelVision({onFrame:frame=>{if(this.valid(seq)&&this.phase==='live')this.showVision(frame);},onError:()=>{if(this.valid(seq))this.status('หาแนวข้อความไม่ได้ · กดค้างเลือกบริเวณได้');}});const scan=()=>{if(this.valid(seq)&&this.phase==='live'&&!this.menuOpen){const f=visibleFrame(this.q('#labelVideo'),this.q('#labelStage'),640);if(f)this.vision?.scan(f);}};scan();this.visionTimer=setInterval(scan,180);this.scheduleLive(seq,150);
  }catch{if(this.valid(seq))this.status('เปิดกล้องไม่ได้ ใช้ “เลือกรูป” หรือกรอกเองได้');}
 }
 showVision(frame){
  if(this.menuOpen)return;this.liveFrame=frame;this.frameSize={w:frame.w,h:frame.h};this.q('#labelBoxes').setAttribute('viewBox',`0 0 ${frame.w} ${frame.h}`);
  const previous=this.candidateBoxes||[],usedIds=new Set(),candidates=frame.regions.filter(c=>c.quality>=2).slice(0,10).map(c=>{const old=previous.find(b=>!usedIds.has(b.id)&&intersection(b.bbox,c.bbox)>.5);if(old)usedIds.add(old.id);return {...c,id:old?.id||crypto.randomUUID(),role:'text',raw:'',value:null,feature:patchFeature(frame,c.bbox)};});
  this.candidateBoxes=candidates;this.lines=candidates.map(c=>({bbox:c.bbox,text:''}));const manual=[];
  for(const hint of this.hints){const matched=hint.feature?matchPatch(hint,candidates,frame):null;if(matched)hint.region=normalizedBox(matched.bbox,frame.w,frame.h);manual.push({...hint,bbox:frameBox(hint.region,frame.w,frame.h),raw:'',value:null,manual:true});}
  const semantic=[];this.semanticTracks=(this.semanticTracks||[]).filter(t=>performance.now()-t.seenAt<6000);
  for(const track of this.semanticTracks){if(this.hints.some(h=>h.role===track.role))continue;const matched=matchPatch(track,candidates,frame);if(matched){track.region=normalizedBox(matched.bbox,frame.w,frame.h);semantic.push({...track,bbox:matched.bbox,automatic:true});}}
  this.boxes=this.mergeBoxes([...candidates,...semantic],manual).filter(b=>b.role!=='text'||!semantic.some(s=>overlaps(s.bbox,b.bbox)));this.draw();
  this.q('#labelLiveBadge').textContent=candidates.length?'พบแนวข้อความ':'กำลังหาข้อความ';
  if(!this.readerLoading)this.status(this.readerError?'พบแนวข้อความ · ตัวอ่านยังไม่พร้อม กดค้างเลือกประเภทได้':semantic.length?'กดค้างเพื่อเลือกประเภท · พร้อมแล้วถ่ายฉลาก':candidates.length?'กรอบสีอ่อน = พบข้อความ · กดค้างเลือก LOT / MFG / EXP':'ยังไม่พบแนวข้อความ · กดค้างเลือกบริเวณได้');
 }
 scheduleLive(seq,delay=900){clearTimeout(this.liveTimer);if(this.valid(seq)&&this.phase==='live')this.liveTimer=setTimeout(()=>this.analyzeLive(seq),delay);}
 async analyzeLive(seq){
  if(!this.valid(seq)||this.phase!=='live')return;
  if(this.liveBusy||this.menuOpen){this.scheduleLive(seq,300);return;}
  const canvas=visibleFrame(this.q('#labelVideo'),this.q('#labelStage'),1280);if(!canvas){this.scheduleLive(seq);return;}
  this.liveBusy=true;
  const hintsVersion=this.hintRevision,source=pixels(visibleFrame(this.q('#labelVideo'),this.q('#labelStage'),640));
  try{
   const worker=await this.getWorker(seq);if(!worker||!this.valid(seq))return;
   await worker.setParameters({tessedit_pageseg_mode:'11'});const result=await worker.recognize(canvas,{},{text:true,blocks:true});
   if(!this.valid(seq)||this.phase!=='live'||hintsVersion!==this.hintRevision)return;const proposals=proposeLabelBoxes(result.data);
   this.semanticTracks=proposals.boxes.map(b=>{const region=normalizedBox(b.bbox,canvas.width,canvas.height);return {...b,region,feature:patchFeature(source,frameBox(region,source.w,source.h)),seenAt:performance.now()};});
   if(this.liveFrame&&!this.menuOpen)this.showVision(this.liveFrame);
  }catch{if(this.valid(seq)&&this.phase==='live'){this.readerLoading=false;this.readerError=true;this.status('ตัวอ่านยังไม่พร้อม · กดค้างเลือกกรอบ หรือกรอกเองได้');}}
  finally{if(this.valid(seq)){this.liveBusy=false;this.scheduleLive(seq);}}
 }
 mergeBoxes(automatic,manual){return [...automatic.filter(b=>!manual.some(m=>overlaps(m.bbox,b.bbox))),...manual];}
 async readRegion(worker,canvas,hint){
  const bbox=frameBox(hint.region,canvas.width,canvas.height),r={left:Math.floor(bbox.x0),top:Math.floor(bbox.y0),width:Math.max(1,Math.ceil(bbox.x1-bbox.x0)),height:Math.max(1,Math.ceil(bbox.y1-bbox.y0))};
  await worker.setParameters({tessedit_pageseg_mode:'7'});const result=await worker.recognize(labelRegion(canvas,r),{},{text:true,blocks:true});return this.interpret({...hint,bbox,raw:result.data.text.trim().slice(0,300),automatic:false,manual:true});
 }
 pick(){
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;this.dialog.append(input);input.onchange=async()=>{
   const f=input.files?.[0];input.remove();if(!f)return;const seq=this.sequence;
   try{if(!f.type.startsWith('image/')||f.size>20*1024*1024)throw Error('เลือกรูปภาพขนาดไม่เกิน 20 MB');const url=URL.createObjectURL(f),image=new Image();try{image.src=url;await image.decode();if(!this.valid(seq))return;const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);this.photo(canvas,[]);}finally{URL.revokeObjectURL(url);}}catch(e){if(this.valid(seq))this.status(e.message);}
  };input.oncancel=()=>input.remove();input.click();
 }
 capture(){if(this.menuOpen||this.phase!=='live')return;const canvas=visibleFrame(this.q('#labelVideo'),this.q('#labelStage'),2000);if(canvas)this.photo(canvas,this.hints.map(h=>({...h})));}
 async photo(canvas,hints=[]){
  this.stopLive();this.release();const seq=++this.sequence;this.cancelWorker();clearTimeout(this.staleTimer);this.phase='photo';this.busy=false;this.liveBusy=false;this.imageCanvas=canvas;this.frameSize={w:canvas.width,h:canvas.height};this.boxes=[];this.lines=[];this.hints=hints;this.preferred=Object.fromEntries(hints.map(h=>[h.role,h.id]));this.dismissPicker(false);
  this.q('#labelVideo').hidden=true;this.q('#labelLiveBadge').hidden=true;this.q('#labelImage').hidden=false;this.q('#labelImage').src=canvas.toDataURL('image/jpeg',.94);this.q('#labelAim').hidden=true;this.q('#labelPlaceholder').hidden=true;this.boxView();this.q('#labelBoxes').setAttribute('viewBox',`0 0 ${canvas.width} ${canvas.height}`);this.draw();await this.recognizePhoto(seq);
 }
 async getWorker(seq){
  if(this.worker)return this.worker;if(this.workerPromise)return this.workerPromise;
  const pending=(async()=>{const T=await loadLibrary();if(!this.valid(seq))return null;const path=new URL(base(),location.href).href;
   const worker=await T.createWorker('eng+tha',1,{workerPath:path+'worker.min.js',corePath:path,langPath:path,workerBlobURL:false,logger:m=>{if(this.valid(seq)&&!this.menuOpen){if(this.phase==='photo')this.status(m.status==='recognizing text'?'กำลังอ่านข้อความ '+Math.round(m.progress*100)+'%':'เตรียมตัวอ่านฉลาก…');else if(/loading|initializing/.test(m.status)){this.readerLoading=true;this.status('เตรียมตัวอ่าน '+Math.round((m.progress||0)*100)+'% · เลือกกรอบได้ระหว่างรอ');}}}});
   if(!this.valid(seq)){await worker.terminate();return null;}this.worker=worker;this.readerLoading=false;this.readerError=false;await worker.setParameters({preserve_interword_spaces:'1'});return worker;})();
  this.workerPromise=pending;try{return await pending;}finally{if(this.workerPromise===pending)this.workerPromise=null;}
 }
 async recognizePhoto(seq){
  this.busy=true;this.q('#labelToReview').disabled=true;
  try{const worker=await this.getWorker(seq);if(!worker||!this.valid(seq))return;await worker.setParameters({tessedit_pageseg_mode:'11'});const result=await worker.recognize(this.imageCanvas,{},{text:true,blocks:true});if(!this.valid(seq))return;const p=proposeLabelBoxes(result.data),manual=[];
   for(const hint of this.hints){if(!this.valid(seq))return;manual.push(await this.readRegion(worker,this.imageCanvas,hint));}if(!this.valid(seq))return;
   this.boxes=this.mergeBoxes(p.boxes,manual);this.lines=p.lines;this.status(this.boxes.length?'กดค้างที่กรอบเพื่อเลือกประเภท หรือแตะ “ตรวจข้อมูล”':'ยังไม่พบข้อมูล · กดค้างบริเวณที่ต้องการ');this.draw();
  }catch{if(this.valid(seq))this.status('อ่านไม่ชัด กดค้างเลือกบริเวณ ถ่ายใหม่ หรือกรอกเองได้');}
  finally{if(this.valid(seq)){this.busy=false;this.q('#labelToReview').disabled=false;}}
 }
 interpret(box){const candidates=parseLabelText(box.raw),specific=candidates.find(c=>c.role===box.role);if(box.role==='lot'){box.value=specific?.value||(box.raw.match(/[A-Z0-9][A-Z0-9._/-]{1,79}/ig)||[]).find(s=>/\d/.test(s))||null;box.ambiguous=false;}else{const date=specific||parsePrintedDate(box.raw);box.value=date?.value||null;box.choices=date?.choices;box.ambiguous=date?.ambiguous||false;}return box;}
 draw(){
  const {w,h}=this.frameSize||{};if(!w||!this.q('#labelBoxes'))return;const pad=w*.008,font=w*.035,items=[...this.boxes];
  if(this.pendingRegion)items.push({id:'pending-region',role:'pending',bbox:frameBox(this.pendingRegion.region,w,h)});
  this.q('#labelBoxes').innerHTML=items.map(b=>{const r=b.bbox,x=Math.max(0,r.x0-pad),y=Math.max(0,r.y0-pad),bw=Math.min(w-x,r.x1-r.x0+pad*2),bh=r.y1-r.y0+pad*2,color=colors[b.role]||'#f4d449',dash=b.manual&&!b.value||b.role==='pending'?`stroke-dasharray="${w*.014} ${w*.008}"`:'';return `<g data-box="${b.id}" data-role="${b.role}" data-manual="${!!b.manual}"><rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${color}18" stroke="white" stroke-width="${w*.006}"/><rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="none" stroke="${color}" stroke-width="${w*.004}" ${dash}/>${['pending','text'].includes(b.role)?'':`<rect x="${x}" y="${Math.max(0,y-font*1.3)}" width="${font*2.9}" height="${font*1.3}" rx="${font*.15}" fill="${color}"/><text x="${x+font*.25}" y="${Math.max(font,y-font*.28)}" fill="white" font-family="system-ui" font-size="${font}" font-weight="700">${b.role.toUpperCase()}</text>`}</g>`;}).join('');this.q('#labelLegend').hidden=!items.some(b=>colors[b.role]);
 }
 point(event){const svg=this.q('#labelBoxes'),m=svg?.getScreenCTM();if(!m||!this.frameSize)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());return p.x>=0&&p.y>=0&&p.x<=this.frameSize.w&&p.y<=this.frameSize.h?p:null;}
 hit(p){const pad=(this.frameSize?.w||1)*.006;return this.boxes.filter(b=>p.x>=b.bbox.x0-pad&&p.x<=b.bbox.x1+pad&&p.y>=b.bbox.y0-pad&&p.y<=b.bbox.y1+pad).sort((a,b)=>Math.abs((a.bbox.y0+a.bbox.y1)/2-p.y)-Math.abs((b.bbox.y0+b.bbox.y1)/2-p.y))[0];}
 bindPress(){
  const svg=this.q('#labelBoxes');svg.oncontextmenu=e=>e.preventDefault();svg.onpointerdown=e=>{
   if(e.isPrimary===false||e.button>0||this.phase==='review')return;const point=this.point(e);if(!point)return;this.cancelPress();this.press={id:e.pointerId,x:e.clientX,y:e.clientY,point,normalized:{x:point.x/this.frameSize.w,y:point.y/this.frameSize.h},opened:false};svg.setPointerCapture?.(e.pointerId);
   this.pressTimer=setTimeout(()=>{if(this.press){this.press.opened=true;this.openPicker(this.pressedPoint());}},500);
  };
  svg.onpointermove=e=>{if(this.press&&Math.hypot(e.clientX-this.press.x,e.clientY-this.press.y)>12)this.cancelPress();};
  svg.onpointerup=e=>{if(this.press&&!this.press.opened&&this.hit(this.pressedPoint()))this.openPicker(this.pressedPoint());this.cancelPress();};svg.onpointercancel=()=>this.cancelPress();svg.onlostpointercapture=()=>this.cancelPress();
  svg.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(this.frameSize)this.openPicker({x:this.frameSize.w/2,y:this.frameSize.h/2});}};
  this.q('#labelRolePicker').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.dismissPicker();}if(e.key==='Tab'){const fields=[...this.q('#labelRolePicker').querySelectorAll('button:not([hidden])')],i=fields.indexOf(document.activeElement),next=(i+(e.shiftKey?-1:1)+fields.length)%fields.length;e.preventDefault();fields[next].focus();}};
 }
 pressedPoint(){return this.press?.normalized&&this.frameSize?{x:this.press.normalized.x*this.frameSize.w,y:this.press.normalized.y*this.frameSize.h}:this.press?.point;}
 cancelPress(){clearTimeout(this.pressTimer);this.pressTimer=null;this.press=null;}
 openPicker(point){
  if(!['live','photo'].includes(this.phase))return;if(this.phase==='photo'&&this.busy){this.status('กำลังอ่านข้อความ รอสักครู่');return;}const {w,h}=this.frameSize||{};if(!w)return;const existing=this.hit(point),bbox=existing?.bbox||regionAt(point,w,h,this.lines);
  this.pendingRegion={id:existing?.id||crypto.randomUUID(),region:normalizedBox(bbox,w,h),existing:!!existing};this.menuOpen=true;this.q('#labelRolePicker').hidden=false;this.q('#labelDeleteRegion').hidden=!existing;this.q('#labelShoot').disabled=true;this.q('#labelToReview').disabled=true;this.draw();this.q('[data-label-role]').focus();
 }
 dismissPicker(redraw=true){this.menuOpen=false;this.pendingRegion=null;const el=this.q('#labelRolePicker');if(el)el.hidden=true;if(this.q('#labelShoot'))this.q('#labelShoot').disabled=!this.stream;if(this.q('#labelToReview'))this.q('#labelToReview').disabled=!!this.busy;if(redraw){this.draw();this.q('#labelBoxes')?.focus({preventScroll:true});}}
 chooseRole(role){
  if(!colors[role]||!this.pendingRegion)return;const pending=this.pendingRegion,hint={id:pending.id,role,region:{...pending.region},manual:true,automatic:false,raw:'',value:null};
  const before=this.boxes.find(b=>b.id===hint.id);if(before&&this.preferred[before.role]===hint.id)delete this.preferred[before.role];
  this.hints=this.hints.filter(h=>h.id!==hint.id&&h.role!==role);this.hints.push(hint);this.hintRevision++;this.preferred[role]=hint.id;
  const box={...hint,bbox:frameBox(hint.region,this.frameSize.w,this.frameSize.h)};if(this.phase==='live'&&this.liveFrame){hint.feature=patchFeature(this.liveFrame,box.bbox);}this.boxes=this.boxes.filter(b=>b.id!==hint.id&&!(b.manual&&b.role===role)&&!overlaps(b.bbox,box.bbox));this.boxes.push(box);this.dismissPicker();this.status('เลือก '+ROLE_NAMES[role]+' แล้ว · เล็งให้อยู่ในกรอบ');
  if(this.phase==='live')this.scheduleLive(this.sequence,0);else this.readChosenPhoto(hint);
 }
 async readChosenPhoto(hint){
  if(this.busy)return;const seq=this.sequence,revision=this.hintRevision;this.busy=true;this.q('#labelToReview').disabled=true;
  try{const worker=await this.getWorker(seq);if(!worker||!this.valid(seq))return;const box=await this.readRegion(worker,this.imageCanvas,hint);if(!this.valid(seq)||revision!==this.hintRevision)return;this.boxes=this.boxes.map(b=>b.id===hint.id?box:b);this.draw();this.status(box.value?'ตรวจข้อมูลก่อนใช้':'อ่านไม่ชัด · ตรวจและกรอกเองได้');}
  catch{if(this.valid(seq))this.status('อ่านไม่ชัด · ตรวจและกรอกเองได้');}finally{if(this.valid(seq)){this.busy=false;this.q('#labelToReview').disabled=this.menuOpen;}}
 }
 deleteRegion(){if(!this.pendingRegion)return;const id=this.pendingRegion.id;this.hints=this.hints.filter(h=>h.id!==id);this.boxes=this.boxes.filter(b=>b.id!==id);for(const role of Object.keys(this.preferred))if(this.preferred[role]===id)delete this.preferred[role];this.hintRevision++;this.dismissPicker();}
 boxView(){this.q('#labelStage').hidden=false;this.q('#labelReview').hidden=true;this.q('#labelCameraActions').hidden=true;this.q('#labelBoxActions').hidden=false;this.q('#labelReviewActions').hidden=true;this.q('#labelBoxes').removeAttribute('hidden');}
 review(){if(this.phase!=='photo'||this.busy||this.menuOpen)return;this.phase='review';const values={};for(const role of ['lot','mfg','exp']){const list=this.boxes.filter(b=>b.role===role),b=list.find(b=>b.id===this.preferred[role])||(list.length===1?list[0]:null);values[role]={box:b,value:b?.value||'',choices:b?.choices||[]};}this.reviewValues=values;this.q('#labelStage').hidden=true;this.q('#labelLegend').hidden=true;this.q('#labelBoxActions').hidden=true;this.q('#labelReviewActions').hidden=false;const r=this.q('#labelReview');r.hidden=false;r.innerHTML='<h3>ตรวจข้อมูลก่อนใช้</h3>'+Object.entries(values).map(([role,v])=>{const old=this.current[role]||'',checked=v.value&&(!old||old===v.value);return `<section class="label-review-field ${role}"><label class="label-use"><input type="checkbox" data-use="${role}" ${checked?'checked':''}>${ROLE_NAMES[role]}</label>${v.box?.raw?`<small>อ่านได้: ${esc(v.box.raw)}</small>`:'<small>ยังไม่พบ · เว้นไว้ได้</small>'}${v.box&&!v.value&&role!=='lot'?'<small class="label-date-warning">ตรวจปี / รูปแบบวันที่ แล้วกรอกเองได้</small>':''}${role==='lot'&&v.value&&/[O0I1l]/.test(v.value)?'<small class="label-lot-warning">ตรวจตัว O / เลข 0 และตัว I / เลข 1 กับฉลากอีกครั้ง</small>':''}${old?`<small>ค่าเดิม: ${esc(role==='lot'?old:labelDateText(old))}</small>`:''}${role==='lot'?`<input id="label-review-lot" maxlength="120" value="${esc(v.value)}" aria-label="เลขล็อตที่อ่านได้">`:dateField({id:'label-review-'+role,value:v.value,attrs:`data-review-role="${role}"`})}${v.choices.map(value=>`<button type="button" class="label-date-choice" data-role="${role}" data-date="${value}">${labelDateText(value)}</button>`).join('')}</section>`;}).join('');bindDateFields(r);r.oninput=e=>{const role=e.target.id==='label-review-lot'?'lot':e.target.dataset.reviewRole;if(role)r.querySelector(`[data-use="${role}"]`).checked=true;};for(const b of r.querySelectorAll('[data-date]'))b.onclick=()=>{const value=b.dataset.date,role=b.dataset.role,box=r.querySelector('#label-review-'+role).closest('[data-date-field]');box.outerHTML=dateField({id:'label-review-'+role,value,attrs:`data-review-role="${role}"`});bindDateFields(r);r.querySelector(`[data-use="${role}"]`).checked=true;};this.status('ช่องที่ไม่มีข้อมูลเว้นไว้ได้ · จำนวนยังต้องนับเอง');}
 apply(){const patch={},fields={};for(const role of ['lot','mfg','exp']){if(!this.q(`[data-use="${role}"]`).checked)continue;const value=this.q('#label-review-'+role).value.trim();if(role!=='lot'&&value&&!validLabelDate(value)){this.status('ตรวจวันที่ '+ROLE_NAMES[role]);return;}patch[role]=value||null;fields[role]={raw:this.reviewValues[role].box?.raw?.slice(0,160)||'',confirmedValue:value||null};}const mfg=patch.mfg===undefined?this.current.mfg:patch.mfg,exp=patch.exp===undefined?this.current.exp:patch.exp,today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);if(dateBounds(mfg)?.first>today){this.status('วันผลิตอยู่ในอนาคต กรุณาตรวจปีบนฉลาก');return;}if(dateOrderInvalid(mfg,exp)){this.status('วันหมดอายุต้องไม่ก่อนวันผลิต กรุณาตรวจฉลาก');return;}if(!Object.keys(patch).length){this.status('เลือกข้อมูลที่ต้องการใช้ หรือกด × เพื่อกลับ');return;}patch.labelCapture={provider:'tesseract.js@6.0.1',parserVersion:'label-keywords-v2',interaction:'independent-text-aiming-v3',confirmedAt:new Date().toISOString(),fields,imageStored:false};const apply=this.onApply;this.close();apply(patch);}
 cancelWorker(){if(this.worker){this.worker.terminate().catch(()=>{});this.worker=null;}this.workerPromise=null;}
 close(){
  this.sequence++;this.phase='closed';this.stopLive();clearTimeout(this.staleTimer);this.release();this.cancelWorker();this.busy=false;this.liveBusy=false;this.readerLoading=false;this.menuOpen=false;this.pendingRegion=null;
  if(this.dialog.open)this.dialog.close();this.imageCanvas=null;this.frameSize=null;window.SCPDA_LABEL_CAPTURE_OPEN=false;this.boxes=[];this.lines=[];this.hints=[];this.preferred={};this.reviewValues=null;this.current=null;this.onApply=null;this.dialog.innerHTML='';
 }
}
