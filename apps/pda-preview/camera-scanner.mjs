import { targetCrop, selectCapture, CaptureGate } from './scanner-core.mjs';
import { prepareBarcodeDecoder } from './barcode-decoder.mjs';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cameraErrors={NotAllowedError:'ยังไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่',NotFoundError:'ไม่พบกล้องบนอุปกรณ์นี้ ลองอ่านภาพตัวอย่างแทนได้',NotReadableError:'กล้องอาจถูกใช้งานโดยแอปอื่น ปิดแอปนั้นแล้วลองอีกครั้ง',OverconstrainedError:'กล้องไม่รองรับค่าที่ร้องขอ กรุณาลองกล้องอื่น'};
export class CameraScanner {
  constructor({catalog,onConfirm}){this.catalog=catalog;this.onConfirm=onConfirm;this.gate=new CaptureGate();this.stream=null;this.audio=null;this.decode=null;this.torch=false;this.supportsTorch=false;this.result=null;this.token=0;this.sound=true;
    this.dialog=document.createElement('dialog');this.dialog.id='cameraDialog';this.dialog.className='camera-dialog';this.dialog.setAttribute('aria-labelledby','cameraTitle');document.body.append(this.dialog);
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.dialog.open){++this.token;this.release();this.gate.stop();this.message('');this.update('paused');}});
    window.addEventListener('pagehide',()=>this.close());
  }
  open(){if(this.dialog.open)return;this.render();this.dialog.showModal();this.start();}
  render(){this.dialog.innerHTML=`<div class="camera-header"><div><h2 id="cameraTitle">สแกนบาร์โค้ด</h2></div><button type="button" id="cameraClose" class="camera-icon" aria-label="ปิดกล้อง">✕</button></div><div class="camera-view" id="cameraView"><video id="cameraVideo" autoplay muted playsinline></video><canvas id="cameraStill" hidden></canvas><div class="camera-placeholder" id="cameraPlaceholder"><span>⌖</span><p>กล้องจะยังไม่อ่านบาร์โค้ด<br>จนกว่าคุณแตะปุ่มอ่าน</p></div><div class="camera-target" id="cameraTarget" aria-hidden="true"><i></i><i></i><i></i><i></i><span>วางบาร์โค้ด 1 รายการในกรอบนี้</span></div><span class="camera-state" id="cameraPhase">กำลังเปิดกล้อง…</span></div><div class="camera-body"><p id="cameraMessage" class="camera-message" role="status" aria-live="polite">กำลังขอสิทธิ์ใช้กล้องหลัง</p><div id="cameraResult" hidden></div><div class="camera-tools"><button type="button" id="cameraTorch" class="button secondary" disabled>ไฟฉาย: ไม่รองรับ</button><button type="button" id="cameraSound" class="button secondary" aria-pressed="${this.sound}">เสียง: ${this.sound?'เปิด':'ปิด'}</button></div><button class="camera-trigger" id="cameraCapture" type="button" disabled><span>◎</span> อ่านบาร์โค้ด</button><div class="camera-result-actions" id="cameraResultActions" hidden><button class="button secondary" id="cameraRetry" type="button">เล็งใหม่</button><button class="button" id="cameraConfirm" type="button">ยืนยันสินค้า → เริ่มนับ</button></div><button class="button secondary" id="cameraRestart" type="button" hidden>เปิดกล้องอีกครั้ง</button><div class="camera-demo"><button id="cameraSample" type="button">อ่านภาพบาร์โค้ดตัวอย่าง</button><small>ทดสอบการอ่านจริงโดยไม่ใช้กล้อง · ข้อมูลทดลอง</small></div></div>`;
    const q=s=>this.dialog.querySelector(s);q('#cameraClose').onclick=()=>this.close();q('#cameraCapture').onclick=()=>this.capture();q('#cameraTorch').onclick=()=>this.setTorch(!this.torch);q('#cameraSound').onclick=()=>{this.sound=!this.sound;q('#cameraSound').textContent='เสียง: '+(this.sound?'เปิด':'ปิด');q('#cameraSound').setAttribute('aria-pressed',String(this.sound));};q('#cameraRetry').onclick=q('#cameraRestart').onclick=()=>this.start();q('#cameraConfirm').onclick=()=>{if(this.result?.kind!=='known')return;const barcode=this.result.product.barcode;this.close();this.onConfirm(barcode);};q('#cameraSample').onclick=()=>this.sample();
  }
  q(s){return this.dialog.querySelector(s);}
  message(value){const el=this.q('#cameraMessage');if(el){el.textContent=value;el.hidden=!value;}}
  update(phase){this.phase=phase;this.dialog.dataset.phase=phase;const aiming=phase==='aiming',result=phase==='result';
    this.q('#cameraPhase').textContent=({loading:'กำลังเตรียมกล้อง',aiming:'พร้อมเล็ง · ยังไม่อ่าน',decoding:'กำลังอ่านภาพนี้',result:'อ่านแล้ว · รอยืนยัน',error:'กล้องยังไม่พร้อม',paused:'หยุดกล้องแล้ว'})[phase]||phase;
    this.q('#cameraCapture').disabled=!aiming||!this.decode;this.q('#cameraCapture').hidden=result;this.q('#cameraResultActions').hidden=!result;this.q('#cameraRestart').hidden=!['error','paused'].includes(phase);
    this.q('#cameraTarget').hidden=!['loading','aiming','decoding'].includes(phase);this.q('#cameraTorch').disabled=!this.supportsTorch||!this.stream||phase==='decoding';
    this.q('#cameraConfirm').disabled=this.result?.kind!=='known';
  }
  async ensureDecoder(){if(!this.decode)this.decode=await prepareBarcodeDecoder();return this.decode;}
  async start(){this.release();this.result=null;this.q('#cameraResult').hidden=true;this.q('#cameraStill').hidden=true;this.q('#cameraVideo').hidden=false;this.q('#cameraPlaceholder').hidden=false;this.update('loading');this.message('');
    const token=++this.token;this.gate.stop();
    const decoderReady=this.ensureDecoder();decoderReady.catch(()=>{});
    try{
      if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('ต้องเปิดลิงก์ HTTPS ใน Chrome และอนุญาตกล้อง หรือใช้ภาพตัวอย่างด้านล่าง');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(token!==this.token||!this.dialog.open){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;const video=this.q('#cameraVideo');video.srcObject=stream;await video.play();
      if(token!==this.token||!this.dialog.open)return;
      const track=stream.getVideoTracks()[0];const caps=track.getCapabilities?.()||{};this.supportsTorch=caps.torch===true;
      track.addEventListener('ended',()=>{if(this.stream===stream){this.release();this.gate.stop();this.update('paused');this.message('');}},{once:true});
      // Best effort; camera-specific autofocus must be verified on actual phones.
      if(caps.focusMode?.includes('continuous'))try{await track.applyConstraints({advanced:[{focusMode:'continuous'}]});}catch{}
      if(token!==this.token||!this.dialog.open)return;
      // Ambient light is the default: a bright torch can wash out glossy labels.
      // Browser torch control is binary; never pretend an on-screen dimmer can
      // reduce the physical LED output. Users may turn the light on explicitly.
      if(this.supportsTorch)await this.setTorch(false);
      else this.q('#cameraTorch').textContent='ไฟฉาย: ไม่รองรับ';
      await decoderReady;
      if(token!==this.token||!this.dialog.open)return;
      this.q('#cameraPlaceholder').hidden=true;this.gate.arm();this.update('aiming');this.message('');
    }catch(error){if(token!==this.token||!this.dialog.open)return;this.release();this.gate.stop();this.update('error');this.message(cameraErrors[error.name]||error.message||'เปิดกล้องไม่ได้ กรุณาลองใหม่');}
  }
  async setTorch(enabled){const stream=this.stream;if(!stream||!this.supportsTorch)return;try{const track=stream.getVideoTracks()[0];await track.applyConstraints({advanced:[{torch:enabled}]});if(this.stream!==stream)return;this.torch=track.getSettings?.().torch??enabled;this.q('#cameraTorch').textContent='ไฟฉาย: '+(this.torch?'เปิด':'ปิด');this.q('#cameraTorch').setAttribute('aria-pressed',String(this.torch));}catch{this.supportsTorch=false;this.torch=false;this.q('#cameraTorch').textContent='ไฟฉาย: ใช้ไม่ได้บนเบราว์เซอร์นี้';this.q('#cameraTorch').disabled=true;}}
  prepareAudio(){if(!this.sound)return;try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;this.audio??=new Audio();this.audio.resume().catch(()=>{});}catch{}}
  beep(){if(!this.sound||!this.audio)return;try{const o=this.audio.createOscillator(),gain=this.audio.createGain();o.type='sine';o.frequency.value=1120;gain.gain.setValueAtTime(.0001,this.audio.currentTime);gain.gain.exponentialRampToValueAtTime(.12,this.audio.currentTime+.01);gain.gain.exponentialRampToValueAtTime(.0001,this.audio.currentTime+.13);o.connect(gain);gain.connect(this.audio.destination);o.start();o.stop(this.audio.currentTime+.14);}catch{}}
  async capture(){if(!this.decode)return;const generation=this.gate.begin();if(generation===null)return;this.prepareAudio();this.update('decoding');this.message('กำลังอ่านเฉพาะภาพในกรอบนี้…');
    try{const video=this.q('#cameraVideo'),view=this.q('#cameraView'),target=this.q('#cameraTarget'),vr=view.getBoundingClientRect(),tr=target.getBoundingClientRect();
      const crop=targetCrop(video.videoWidth,video.videoHeight,vr.width,vr.height,{x:tr.left-vr.left,y:tr.top-vr.top,width:tr.width,height:tr.height});
      const canvas=this.q('#cameraStill');canvas.width=Math.round(crop.width);canvas.height=Math.round(crop.height);canvas.getContext('2d',{willReadFrequently:true}).drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
      const result=selectCapture(await this.decode(canvas),this.catalog);if(!this.gate.finish(generation,['known','unknown'].includes(result.kind)))return;
      if(['empty','multiple'].includes(result.kind)){this.update('aiming');this.message(result.kind==='multiple'?'พบมากกว่า 1 บาร์โค้ดในกรอบ จัดให้เหลือรายการเดียวแล้วแตะอ่านใหม่':'ยังอ่านไม่ชัด จัดกรอบหรือแสงใหม่ แล้วแตะอ่านอีกครั้ง');return;}
      this.showResult(result);
    }catch{if(this.gate.finish(generation,false)){this.update('aiming');this.message('อ่านภาพนี้ไม่ได้ กรุณาเล็งใหม่แล้วแตะอ่านอีกครั้ง');}}
  }
  showResult(result){this.result=result;this.release();this.q('#cameraVideo').hidden=true;this.q('#cameraStill').hidden=false;this.q('#cameraPlaceholder').hidden=true;this.q('#cameraResult').hidden=false;this.q('#cameraResult').innerHTML=`<span class="eyebrow">${result.kind==='known'?'PRODUCT FOUND':'BARCODE READ'}</span><h3>${result.product?escape(result.product.name):'อ่านได้ แต่ไม่อยู่ในแค็ตตาล็อกทดลอง'}</h3><p class="mono">${escape(result.value)}</p><small>${result.product?'ตรวจชื่อสินค้าแล้วกดยืนยันเพื่อเปิดฟอร์มนับ ยังไม่มีการบันทึกจำนวน':'ลองสินค้าทดลองหรือเล็งใหม่ ไม่สร้างสินค้าและไม่เลือกสินค้าทดแทน'}</small>`;this.update('result');this.message(result.kind==='known'?'อ่านสำเร็จ กล้องหยุดแล้ว ตรวจชื่อสินค้าก่อนเริ่มนับ':'อ่านบาร์โค้ดสำเร็จ แต่ยังไม่มีข้อมูลสินค้านี้ในพรีวิว');this.beep();try{navigator.vibrate?.(40);}catch{}}
  async sample(){this.prepareAudio();this.release();const token=++this.token;const generation=this.gate.arm();this.gate.begin();this.result=null;this.q('#cameraResult').hidden=true;this.update('decoding');this.message('กำลังอ่านภาพตัวอย่างด้วยตัวถอดบาร์โค้ดจริง');try{const img=new Image();img.src=new URL('./assets/sample-barcode.png',import.meta.url).href;await img.decode();if(token!==this.token||!this.dialog.open)return;const canvas=this.q('#cameraStill');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);const decode=await this.ensureDecoder();const result=selectCapture(await decode(canvas),this.catalog);if(!this.gate.finish(generation,true))return;if(!['known','unknown'].includes(result.kind))throw new Error('Sample decoding failed');this.showResult(result);}catch{if(token!==this.token||!this.dialog.open)return;this.gate.stop();this.update('error');this.message('อ่านภาพตัวอย่างไม่ได้ กรุณาลองใหม่');}}
  release(){const stream=this.stream;this.stream=null;if(stream)stream.getTracks().forEach(t=>t.stop());const video=this.q('#cameraVideo');if(video){video.pause();video.srcObject=null;}this.torch=false;this.supportsTorch=false;const torch=this.q('#cameraTorch');if(torch){torch.disabled=true;torch.textContent='ไฟฉาย: ปิด';}}
  close(){++this.token;this.gate.stop();this.release();this.result=null;if(this.dialog.open)this.dialog.close();}
}
