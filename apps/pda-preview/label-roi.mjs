import {locateText,pixels,intersection} from './label-vision.mjs?aim=4';
import {proposeLabelBoxes} from './label-parser.mjs?aim=5';

const union=items=>({x0:Math.min(...items.map(b=>b.x0)),y0:Math.min(...items.map(b=>b.y0)),x1:Math.max(...items.map(b=>b.x1)),y1:Math.max(...items.map(b=>b.y1))});
// Plan from the same contrast detector as the yellow outlines. Include nearby
// printed labels, not just a date/value: vertical position never assigns a role.
export function textRegionPlan(regions,w,h){
 const candidates=regions.filter(c=>c.quality>=2).slice(0,10),groups=[];
 for(const c of candidates){let group=null;for(const g of groups){if(g.polarity!==c.polarity)continue;const b=union(g.items.map(i=>i.bbox)),r=c.bbox,mh=Math.max(r.y1-r.y0,...g.items.map(i=>i.bbox.y1-i.bbox.y0)),dx=Math.max(0,b.x0-r.x1,r.x0-b.x1),dy=Math.max(0,b.y0-r.y1,r.y0-b.y1),joined=union([b,r]);if(dx<=mh*4&&dy<=mh*2&&joined.y1-joined.y0<h*.38&&joined.x1-joined.x0<w*.8){group=g;break;}}
  if(group)group.items.push(c);else groups.push({polarity:c.polarity,items:[c]});
 }
 return groups.map(g=>{const b=union(g.items.map(i=>i.bbox)),height=Math.max(...g.items.map(i=>i.bbox.y1-i.bbox.y0)),spread=Math.max(...g.items.map(i=>i.bbox.x0))-b.x0,left=spread>height*1.5?height*.7:Math.min(height*4,(b.x1-b.x0)*.65),bbox={x0:Math.max(0,Math.floor(b.x0-left)),y0:Math.max(0,Math.floor(b.y0-height*.65)),x1:Math.min(w,Math.ceil(b.x1+height*.8)),y1:Math.min(h,Math.ceil(b.y1+height*.65))},distance=Math.hypot((b.x0+b.x1)/2/w-.5,(b.y0+b.y1)/2/h-.5);return {bbox,height,polarity:g.polarity,candidates:g.items.length,score:g.items.reduce((n,i)=>n+i.quality,0)/(1+distance*2)};}).sort((a,b)=>b.score-a.score).filter((r,i,all)=>!all.slice(0,i).some(o=>intersection(o.bbox,r.bbox)>.85)).slice(0,6);
}
export function mapCropBox(bbox,crop){
 return {x0:Math.max(crop.bbox.x0,(bbox.x0-crop.pad)/crop.scale+crop.bbox.x0),y0:Math.max(crop.bbox.y0,(bbox.y0-crop.pad)/crop.scale+crop.bbox.y0),x1:Math.min(crop.bbox.x1,(bbox.x1-crop.pad)/crop.scale+crop.bbox.x0),y1:Math.min(crop.bbox.y1,(bbox.y1-crop.pad)/crop.scale+crop.bbox.y0)};
}
export function cropTextRegion(image,job){
 const b=job.bbox,scale=job.fallback?1:Math.min(3,Math.max((b.y1-b.y0)/job.height<3.3?1:1.5,32/Math.max(1,job.height))),pad=16,canvas=document.createElement('canvas');canvas.width=Math.ceil((b.x1-b.x0)*scale+pad*2);canvas.height=Math.ceil((b.y1-b.y0)*scale+pad*2);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle=job.polarity===1?'black':'white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,b.x0,b.y0,b.x1-b.x0,b.y1-b.y0,pad,pad,(b.x1-b.x0)*scale,(b.y1-b.y0)*scale);
 // White print on dark packaging is inverted before recognition. Keep an affine
 // transform (no deskew) so every recognized word maps to the exact source crop.
 const singleLine=(b.y1-b.y0)/job.height<3.3;
 if(job.polarity===1||singleLine){const d=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<d.data.length;i+=4){if(job.polarity===1){d.data[i]=255-d.data[i];d.data[i+1]=255-d.data[i+1];d.data[i+2]=255-d.data[i+2];}if(singleLine){const gray=.299*d.data[i]+.587*d.data[i+1]+.114*d.data[i+2],v=gray<210?0:255;d.data[i]=d.data[i+1]=d.data[i+2]=v;}}
  // Context padding can cross from a dark label onto white carton. After
  // inversion that carton becomes a solid black strip, not a printed character.
  // Remove only near-solid columns spanning the padded row; source is unchanged.
  if(singleLine&&job.polarity===1){for(let x=pad;x<canvas.width-pad;x++){let ink=0;for(let y=pad;y<canvas.height-pad;y++)if(d.data[(y*canvas.width+x)*4]<100)ink++;if(ink/(canvas.height-pad*2)>.88)for(let y=pad;y<canvas.height-pad;y++){const i=(y*canvas.width+x)*4;d.data[i]=d.data[i+1]=d.data[i+2]=255;}}}
  ctx.putImageData(d,0,0);}
 return {canvas,bbox:b,scale,pad};
}
function mappedData(data,crop){return {...data,blocks:(data.blocks||[]).map(b=>({...b,paragraphs:(b.paragraphs||[]).map(p=>({...p,lines:(p.lines||[]).map(l=>({...l,bbox:mapCropBox(l.bbox,crop),words:(l.words||[]).map(w=>({...w,bbox:mapCropBox(w.bbox,crop)}))}))}))}))};}
export async function readTextRegions(worker,image,{valid=()=>true,allowFallback=false,onProgress=()=>{}}={}){
 // Redetect on this exact OCR input after model initialization. A moving camera's
 // old screen rectangles must never be applied to a different image.
 const frame=pixels(image),detected=locateText(frame.gray,frame.w,frame.h),sx=image.width/frame.w,sy=image.height/frame.h,jobs=textRegionPlan(detected,frame.w,frame.h).map(j=>({...j,height:j.height*sy,bbox:{x0:j.bbox.x0*sx,y0:j.bbox.y0*sy,x1:j.bbox.x1*sx,y1:j.bbox.y1*sy}})),boxes=[],lines=[],blocks=[],diagnostics={mode:'yellow-region-first-v1',detected:detected.filter(c=>c.quality>=2).slice(0,10).length,inputs:[],fullFrameFallback:false};
 if(!jobs.length&&allowFallback){jobs.push({bbox:{x0:0,y0:0,x1:image.width,y1:image.height},height:42,polarity:-1,fallback:true});diagnostics.fullFrameFallback=true;}
 for(const job of jobs){if(!valid())return null;const crop=cropTextRegion(image,job);await worker.setParameters({tessedit_pageseg_mode:job.fallback?'11':(job.bbox.y1-job.bbox.y0)/job.height<3.3?'7':'11'});if(!valid())return null;const result=await worker.recognize(crop.canvas,{},{text:true,blocks:true});if(!valid())return null;const data=mappedData(result.data,crop),p=proposeLabelBoxes(data);diagnostics.inputs.push({sourceBox:job.bbox,inputWidth:crop.canvas.width,inputHeight:crop.canvas.height,mode:job.fallback?'full-frame-fallback':'detected-text-crop'});blocks.push(...data.blocks);lines.push(...p.lines);for(const b of p.boxes)if(!boxes.some(o=>o.role===b.role&&o.value===b.value))boxes.push({...b,readingSource:'yellow-region-ocr'});onProgress({boxes:[...boxes],lines:[...lines],diagnostics});if(['lot','mfg','exp'].every(r=>boxes.some(b=>b.role===r&&b.value)))break;
 }
 return {boxes,lines,data:{blocks},diagnostics};
}
