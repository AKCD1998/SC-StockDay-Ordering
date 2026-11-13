import {frameBox,normalizedBox} from './label-camera.mjs';
import {matchPatch,patchFeature,pixels,locateText} from './label-vision.mjs?aim=4';
export function focusScore(frame,regions){
 const areas=regions?.length?regions.map(r=>frameBox(r,frame.w,frame.h)):[{x0:frame.w*.2,y0:frame.h*.2,x1:frame.w*.8,y1:frame.h*.8}],scores=[];
 for(const b of areas){let sum=0,n=0;const x0=Math.max(1,Math.floor(b.x0)),x1=Math.min(frame.w-1,Math.ceil(b.x1)),y0=Math.max(1,Math.floor(b.y0)),y1=Math.min(frame.h-1,Math.ceil(b.y1));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=y*frame.w+x,v=4*frame.gray[i]-frame.gray[i-1]-frame.gray[i+1]-frame.gray[i-frame.w]-frame.gray[i+frame.w];sum+=Math.min(v*v,40000);n++;}if(n)scores.push(sum/n);}
 return scores.length?scores.sort((a,b)=>a-b)[Math.floor(scores.length/2)]:0;
}
export function makeCaptureFrame(canvas,boxes=[],at=performance.now(),candidateRegions=null){
 const frame=pixels(canvas),regions=candidateRegions?candidateRegions.map(r=>({...r,bbox:frameBox(r.region,frame.w,frame.h)})):locateText(frame.gray,frame.w,frame.h).filter(r=>r.quality>=2).slice(0,10),anchors=boxes.filter(b=>['lot','mfg','exp'].includes(b.role)).map(b=>{const region=normalizedBox(b.bbox,canvas.width,canvas.height);return {role:b.role,region,feature:patchFeature(frame,frameBox(region,frame.w,frame.h))};});
 return {id:crypto.randomUUID(),canvas,frame,regions,anchors,readings:boxes.map(b=>({...b})),at,quality:focusScore(frame,anchors.length?anchors.map(a=>a.region):regions.slice(0,3).map(r=>normalizedBox(r.bbox,frame.w,frame.h)))};
}
export function compatibleFrame(old,current){
 if(!old.anchors?.length)return false;const matches=old.anchors.map(a=>({role:a.role,match:matchPatch(a,current.regions,current.frame)}));
 const strong=matches.filter(m=>m.match?.similarity>=.76);return strong.length>=2&&(!matches.some(m=>m.role==='lot')||matches.some(m=>m.role==='lot'&&m.match?.similarity>=.82));
}
export function selectCaptureFrame(recent,burst,now=performance.now()){
 const current=burst.reduce((best,f)=>!best||f.quality>best.quality?f:best,null);if(!current)return null;
 const timely=recent.filter(r=>now-r.at<=(r.readings.length?4000:2200)),known=timely.filter(r=>r.readings.some(b=>b.role==='lot'&&b.value)),sameLabel=known.filter(r=>compatibleFrame(r,current));
 const recentEligible=timely.filter(r=>compatibleFrame(r,current)&&(!known.length||sameLabel.some(k=>k===r||compatibleFrame(k,r))));
 const lotValues=new Set(recentEligible.flatMap(r=>r.readings.filter(b=>b.role==='lot'&&b.value).map(b=>b.value)));
 const pool=[...(lotValues.size>1?[]:recentEligible),...burst],bestQuality=Math.max(1,...pool.map(f=>f.quality));let chosen=current,score=-Infinity;
 for(const f of pool){const coverage=new Set(f.readings.filter(b=>b.value).map(b=>b.role)).size,quality=f.quality/bestQuality;if(quality<.45&&f!==current)continue;const s=quality*50+coverage*35-Math.max(0,now-f.at)/1000*3;if(s>score){score=s;chosen=f;}}
 return {chosen,temporalLotConflict:lotValues.size>1,usedRecent:!burst.includes(chosen)};
}
export function mergeSameImageReadings(fresh,retained){
 const out=[...fresh];for(const r of retained){if(!r.value)continue;const same=out.find(b=>b.role===r.role&&b.value===r.value);if(same){same.agreed=true;continue;}out.push({...r,id:crypto.randomUUID(),retained:true});}
 for(const role of ['lot','mfg','exp']){const values=new Set(out.filter(b=>b.role===role&&b.value).map(b=>b.value));if(values.size>1)for(const b of out.filter(b=>b.role===role))b.conflicting=true;}
 return out;
}
// Presentation smoothing never changes the coordinates used for OCR or capture.
export class BoxSmoother{
 constructor(){this.items=new Map();}
 clear(){this.items.clear();}
 update(items,w,h){const next=new Map(),out=items.map(b=>{const key=b.manual?b.id:b.role==='text'?b.id:b.role+':'+b.value,old=this.items.get(key),r=b.bbox;let box=r;
  if(old){const delta=Math.hypot((r.x0+r.x1-old.x0-old.x1)/2/w,(r.y0+r.y1-old.y0-old.y1)/2/h);if(delta<.06)box=Object.fromEntries(['x0','y0','x1','y1'].map(k=>[k,Math.abs(r[k]-old[k])<w*.002?old[k]:old[k]*.4+r[k]*.6]));}
  next.set(key,box);const result={...b,renderBbox:box};return result;});this.items=next;return out;}
}

export function fieldSearchHints(data,canvas,frame,candidates){
 const roles=[['lot',/^(?:LOT|BATCH|BN)[.:]*$/i],['mfg',/^(?:MFG|MFD)[.:]*$/i],['exp',/^(?:EXP|EXPIRY)[.:]*$/i]],words=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]),out=[];
 for(const [role,pattern] of roles){const labels=words.filter(w=>pattern.test(w.text.trim()));for(const label of labels){const b={x0:label.bbox.x0/canvas.width*frame.w,y0:label.bbox.y0/canvas.height*frame.h,x1:label.bbox.x1/canvas.width*frame.w,y1:label.bbox.y1/canvas.height*frame.h},height=b.y1-b.y0;
 const nearby=candidates.filter(c=>c.bbox.x0>=b.x1&&Math.abs((c.bbox.y0+c.bbox.y1-b.y0-b.y1)/2)<height*2.5).sort((a,c)=>(Math.abs((a.bbox.y0+a.bbox.y1-b.y0-b.y1)/2)*3+a.bbox.x0-b.x1)-(Math.abs((c.bbox.y0+c.bbox.y1-b.y0-b.y1)/2)*3+c.bbox.x0-b.x1))[0];
 if(nearby)out.push({id:crypto.randomUUID(),role,region:normalizedBox(nearby.bbox,frame.w,frame.h)});}}
 return out;
}
