// Map the on-screen target through object-fit:cover to the original camera frame.
export function targetCrop(videoWidth, videoHeight, viewportWidth, viewportHeight, target) {
  if ([videoWidth,videoHeight,viewportWidth,viewportHeight].some(v=>!Number.isFinite(v)||v<=0)) throw new Error('Camera frame is not ready');
  const scale=Math.max(viewportWidth/videoWidth,viewportHeight/videoHeight);
  const offsetX=(videoWidth*scale-viewportWidth)/2,offsetY=(videoHeight*scale-viewportHeight)/2;
  const x=Math.max(0,(target.x+offsetX)/scale),y=Math.max(0,(target.y+offsetY)/scale);
  return {x,y,width:Math.min(target.width/scale,videoWidth-x),height:Math.min(target.height/scale,videoHeight-y)};
}
export function selectCapture(results,catalog){
  const codes=[...new Set(results.filter(r=>r.valid!==false).map(r=>String(r.value||'').trim()).filter(Boolean))];
  if(!codes.length)return {kind:'empty'};
  if(codes.length!==1)return {kind:'multiple',count:codes.length};
  const value=codes[0];
  const product=catalog.find(p=>p.barcode===value)||(/^\d{12}$/.test(value)?catalog.find(p=>p.barcode==='0'+value):null);
  return {kind:product?'known':'unknown',value,product:product||null};
}
export class CaptureGate {
  constructor(){this.phase='idle';this.generation=0;}
  arm(){this.generation++;this.phase='aiming';return this.generation;}
  begin(){if(this.phase!=='aiming')return null;this.phase='decoding';return this.generation;}
  finish(token,success){if(token!==this.generation||this.phase!=='decoding')return false;this.phase=success?'result':'aiming';return true;}
  stop(){this.generation++;this.phase='idle';}
}
