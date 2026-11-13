import {parsePrintedDate} from './label-dates.mjs';
export const LABEL_ROLES=['lot','mfg','exp'];
export const ROLE_NAMES={lot:'LOT · เลขล็อต',mfg:'MFG · วันที่ผลิต',exp:'EXP · วันหมดอายุ'};
const anchors=/\b(?:EXP(?:IRY|IRATION)?|USE\s*BY|BEST\s*BEFORE|MFG|MFD|MANUFACTURE[DR]?|PROD(?:UCTION)?(?:\s*DATE)?|LOT(?:\s*(?:NO\.?|NUMBER))?|BATCH(?:\s*(?:NO\.?|NUMBER))?|B\.?\s*N\.?)(?![A-Z])|วันหมดอายุ|หมดอายุ|วันที่ผลิต|วันผลิต|เลขที่ผลิต|เลขล็อต|批号|批號|有效期限|生产日期|製造日期/ig;
const roleOf=t=>/EXP|USE|BEST|หมดอายุ|有效/i.test(t)?'exp':/MFG|MFD|MANUF|PROD|วันที่ผลิต|วันผลิต|生产|製造/i.test(t)?'mfg':'lot';
export function parseLabelText(text){
 const found=[],matches=[...String(text).matchAll(anchors)];
 for(let i=0;i<matches.length;i++){const a=matches[i],role=roleOf(a[0]),tail=String(text).slice(a.index+a[0].length,Math.min(matches[i+1]?.index??Infinity,a.index+a[0].length+80)).replace(/^[\s:/#=.-]+/,'');
  if(role==='lot'){const tokens=tail.match(/[A-Z0-9][A-Z0-9._/-]{1,79}/ig)||[];const raw=tokens.find(t=>/\d/.test(t));if(raw)found.push({role,value:raw,raw,anchor:a[0]});}
  else{const d=parsePrintedDate(tail);if(d)found.push({role,...d,anchor:a[0]});}
 }
 return found;
}
export function flattenOcr(data){
 const lines=[];for(const b of data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[]){const words=(l.words||[]).filter(w=>w.text?.trim()&&w.bbox);if(words.length)lines.push({text:words.map(w=>w.text).join(' '),bbox:l.bbox,words});}
 return lines;
}
export function proposeLabelBoxes(data){
 const lines=flattenOcr(data),words=lines.flatMap(l=>l.words),fields=parseLabelText(data.text),boxes=[];
 for(const f of fields){const normalized=s=>String(s).replace(/\s/g,'').toUpperCase();const hits=words.filter(w=>normalized(w.text).includes(normalized(f.raw)));if(!hits.length)continue;
  // Use a nearby recognized label to resolve repeated printed date tokens.
  const labels=words.filter(w=>normalized(w.text).includes(normalized(f.anchor)));let best=hits[0],bestDistance=Infinity;
  for(const w of hits)for(const label of labels.length?labels:[w]){const d=Math.abs(w.bbox.y0-label.bbox.y0)*4+Math.abs(w.bbox.x0-label.bbox.x1);if(d<bestDistance){best=w;bestDistance=d;}}
  if(boxes.some(b=>b.role===f.role&&b.value===f.value))continue;boxes.push({...f,id:crypto.randomUUID(),bbox:{...best.bbox},automatic:true});
 }
 return {boxes,lines};
}
