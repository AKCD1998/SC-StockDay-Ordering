import qrcode from './vendor/qrcode-generator/qrcode.js';
import {prepareBarcodeDecoder} from './barcode-decoder.mjs';
import {enrollmentFromUrl} from './scpda-daily-contract.mjs';
export {enrollmentFromUrl,SCPDA_VERSION_CODE,SCPDA_VERSION_NAME} from './scpda-daily-contract.mjs';
export function qrSvg(url){enrollmentFromUrl(url);const qr=qrcode(0,'M');qr.addData(url);qr.make();return qr.createSvgTag({cellSize:5,margin:4,scalable:true});}
function cameraDialog(title){
 const dialog=document.createElement('dialog');dialog.className='scpda-account scpda-daily-camera';
 const head=document.createElement('header');head.className='scpda-dialog-header';const h=document.createElement('h2');h.textContent=title;const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','ปิดกล้อง');close.textContent='✕';head.append(h,close);
 const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');
 const canvas=document.createElement('canvas');canvas.hidden=true;const message=document.createElement('p');message.className='subtle';message.setAttribute('role','status');dialog.append(head,video,canvas,message);document.body.append(dialog);
 return {dialog,video,canvas,message,close};
}
// No upload from this dialog: the photo joins the signed daily login request.
export async function takeDailySelfie(){
 const ui=cameraDialog('ถ่ายรูปก่อนเริ่มงาน');let stream=null,settled=false,generation=0;
 return new Promise((resolve,reject)=>{
  const finish=(value,err)=>{if(settled)return;settled=true;generation++;stream?.getTracks().forEach(t=>t.stop());ui.video.srcObject=null;document.removeEventListener('visibilitychange',background);window.removeEventListener('scpda-background',cancel);ui.dialog.close();ui.dialog.remove();err?reject(err):resolve(value);};
  const cancel=()=>finish(null,Error('ยกเลิกการถ่ายรูป'));const background=()=>{if(document.hidden)cancel();};
  const capture=document.createElement('button'),retake=document.createElement('button'),accept=document.createElement('button');capture.className=accept.className='scpda-primary';retake.className='scpda-secondary';capture.textContent='ถ่ายรูป';retake.textContent='ถ่ายใหม่';accept.textContent='ใช้รูปนี้';capture.disabled=true;retake.hidden=accept.hidden=true;ui.dialog.append(capture,retake,accept);let photo=null;
  ui.close.onclick=cancel;ui.dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});document.addEventListener('visibilitychange',background);window.addEventListener('scpda-background',cancel);ui.dialog.showModal();
  navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:640}}}).then(async s=>{if(settled){s.getTracks().forEach(t=>t.stop());return;}stream=s;ui.video.srcObject=s;try{await ui.video.play();if(!settled)capture.disabled=false;}catch{cancel();}}).catch(()=>finish(null,Error('เปิดกล้องหน้าไม่ได้ กรุณาอนุญาตใช้กล้อง')));
  capture.onclick=()=>{if(!ui.video.videoWidth||!ui.video.videoHeight)return;const scale=Math.min(1,640/Math.max(ui.video.videoWidth,ui.video.videoHeight));ui.canvas.width=Math.round(ui.video.videoWidth*scale);ui.canvas.height=Math.round(ui.video.videoHeight*scale);ui.canvas.getContext('2d').drawImage(ui.video,0,0,ui.canvas.width,ui.canvas.height);photo=ui.canvas.toDataURL('image/jpeg',.65);if(photo.length>273072){ui.message.textContent='รูปใหญ่เกินไป กรุณาถ่ายใหม่';return;}ui.video.hidden=true;ui.canvas.hidden=false;capture.hidden=true;retake.hidden=accept.hidden=false;ui.message.textContent='เก็บรูปใน Drive 90 วัน แล้วลบอัตโนมัติ';};
  retake.onclick=()=>{photo=null;ui.video.hidden=false;ui.canvas.hidden=true;capture.hidden=false;retake.hidden=accept.hidden=true;};accept.onclick=()=>{if(photo)finish(photo);};
 });
}
export async function scanStoreQr(){
 const ui=cameraDialog('สแกน QR จากเครื่องร้าน');let stream=null,timer=null,settled=false,reading=false;
 return new Promise((resolve,reject)=>{
  const stop=(value,err)=>{if(settled)return;settled=true;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());ui.video.srcObject=null;document.removeEventListener('visibilitychange',background);window.removeEventListener('scpda-background',cancel);ui.dialog.close();ui.dialog.remove();err?reject(err):resolve(value);};
  const cancel=()=>stop(null,Error('ยกเลิกการสแกน'));const background=()=>{if(document.hidden)cancel();};ui.close.onclick=cancel;ui.dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});document.addEventListener('visibilitychange',background);window.addEventListener('scpda-background',cancel);ui.dialog.showModal();
  (async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'environment',width:{ideal:960}}});if(settled){s.getTracks().forEach(t=>t.stop());return;}stream=s;ui.video.srcObject=s;await ui.video.play();const decode=await prepareBarcodeDecoder();
   const read=async()=>{if(settled||reading)return;reading=true;try{if(ui.video.videoWidth){const scale=Math.min(1,960/ui.video.videoWidth);ui.canvas.width=Math.round(ui.video.videoWidth*scale);ui.canvas.height=Math.round(ui.video.videoHeight*scale);ui.canvas.getContext('2d',{willReadFrequently:true}).drawImage(ui.video,0,0,ui.canvas.width,ui.canvas.height);const rows=await decode(ui.canvas);for(const row of rows)try{const value=enrollmentFromUrl(row.value);stop(value);break;}catch{ui.message.textContent='ใช้ QR ที่สร้างจาก SCPDA เครื่องหลัก';}}}catch{ui.message.textContent='เล็ง QR ให้อยู่ในภาพ';}finally{reading=false;if(!settled)timer=setTimeout(read,500);}};void read();
  }catch{stop(null,Error('เปิดกล้องอ่าน QR ไม่ได้ กรุณาอนุญาตใช้กล้อง'));}})();
 });
}
export function showStoreQr(data){
 const dialog=document.createElement('dialog');dialog.className='scpda-account scpda-store-qr';dialog.innerHTML='<header class="scpda-dialog-header"><h2>เชื่อมเครื่องย่อย · 02005</h2><button aria-label="ปิด">✕</button></header><div class="qr-image"></div><p>เปิด SCPDA บนเครื่องย่อย แล้วสแกน QR นี้</p><p class="subtle">เชื่อม Wi-Fi ร้าน · QR ใช้ได้ 2 นาที</p>';
 if(data.initialPassword){const credentials=document.createElement('p');credentials.textContent='รหัสผ่านเริ่มต้น: '+data.initialPassword;dialog.append(credentials);}dialog.querySelector('h2').textContent='เชื่อมเครื่องย่อย · '+(data.operatorCode||'02005');dialog.querySelector('.qr-image').innerHTML=qrSvg(data.url);let timer;const close=()=>{clearTimeout(timer);dialog.close();dialog.remove();};dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(dialog);dialog.showModal();timer=setTimeout(()=>{dialog.querySelector('.qr-image').replaceChildren();dialog.querySelector('p').textContent='QR หมดอายุแล้ว ปิดแล้วสร้างใหม่';},Math.max(0,Date.parse(data.expiresAt)-Date.now()));
}
export function chooseCompanion(records){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='scpda-account';let settled=false;
  const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
  const header=document.createElement('header');header.className='scpda-dialog-header';const title=document.createElement('h2');title.textContent='QR เชื่อมเครื่องย่อย';const close=document.createElement('button');close.textContent='✕';close.setAttribute('aria-label','ปิด');close.onclick=()=>finish(null);header.append(title,close);dialog.append(header);
  const hint=document.createElement('p');hint.className='subtle';hint.textContent='เลือกเครื่องเดิมสำหรับวันนี้ หรือเพิ่มเครื่องให้พนักงานอีกคน';dialog.append(hint);
  for(const row of records){const button=document.createElement('button');button.type='button';button.className='scpda-secondary';button.textContent=row.operatorCode+' · '+(row.paired?'เครื่องเดิม':'ยังไม่เชื่อมเครื่อง');button.onclick=()=>finish(row.operatorCode);dialog.append(button);}
  const add=document.createElement('button');add.type='button';add.className='scpda-primary';add.textContent='＋ เพิ่มเครื่องย่อย';add.onclick=()=>finish('new');dialog.append(add);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});document.body.append(dialog);dialog.showModal();
 });
}

export function chooseDeviceProfile(records){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='scpda-account';
  const title=document.createElement('h2');title.textContent='สาขาที่เคยเชื่อม';dialog.append(title);const hint=document.createElement('p');hint.textContent='การเชื่อมต่อเดิมยังอยู่ ระบบจะตรวจสิทธิ์สำหรับวันนี้อีกครั้ง';dialog.append(hint);
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};
  for(const row of records){const b=document.createElement('button');b.type='button';b.className='scpda-secondary';b.textContent='สาขา '+row.branchCode+' · '+(row.operatorCode||'เครื่องเดิม')+(row.active?' · กำลังใช้':'');b.onclick=()=>finish(row.key);dialog.append(b);}
  const cancel=document.createElement('button');cancel.textContent='ยกเลิก';cancel.className='scpda-secondary';cancel.onclick=()=>finish(null);dialog.append(cancel);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});document.body.append(dialog);dialog.showModal();
 });
}
