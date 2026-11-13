export const DATE_PRECISION='iso-day-or-month-v1';
export function validLabelDate(value){
 if(typeof value!=='string')return false;
 if(/^\d{4}-\d{2}$/.test(value))return +value.slice(5)>=1&&+value.slice(5)<=12;
 return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function dateBounds(value){
 if(!validLabelDate(value))return null;if(value.length===10)return {first:value,last:value};
 const first=value+'-01',d=new Date(first+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return {first,last:d.toISOString().slice(0,10)};
}
export const dateOrderInvalid=(mfg,exp)=>!!(dateBounds(mfg)&&dateBounds(exp)&&dateBounds(mfg).first>dateBounds(exp).last);
export function labelDateText(value){
 if(!validLabelDate(value))return 'ไม่ระบุ';const p=value.split('-');return (p.length===3?p[2]+' ':'')+['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][+p[1]-1]+' '+p[0]+(p.length===2?' · เดือน/ปี':'');
}
export function parsePrintedDate(raw){
 const text=String(raw||'').trim();const year=text.match(/(?:^|[^0-9])(\d{4})(?:$|[^0-9])/);if(year&&(+year[1]<1900||+year[1]>=2200))return null;const p=text.replace(/[.]/g,'/').replace(/\s+/g,' ');let m;
 if((m=p.match(/\b(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)\b/))){const iso=[m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-');return validLabelDate(iso)?{value:iso,precision:'day',raw:m[0]}:null;}
 if((m=p.match(/\b([0-3]?\d)[-/]([0-3]?\d)[-/](\d{4})\b/))){const a=+m[1],b=+m[2],make=(d,n)=>`${m[3]}-${String(n).padStart(2,'0')}-${String(d).padStart(2,'0')}`,choices=[make(a,b),make(b,a)].filter(validLabelDate);const unique=[...new Set(choices)];return unique.length===1?{value:unique[0],precision:'day',raw:m[0]}:unique.length>1?{value:null,ambiguous:true,choices:unique,raw:m[0]}:null;}
 if((m=p.match(/\b([01]?\d)[-/](\d{4})\b/))){const iso=m[2]+'-'+m[1].padStart(2,'0');return validLabelDate(iso)?{value:iso,precision:'month',raw:m[0]}:null;}
 if((m=p.match(/\b(\d{4})[-/]([01]?\d)\b/))){const iso=m[1]+'-'+m[2].padStart(2,'0');return validLabelDate(iso)?{value:iso,precision:'month',raw:m[0]}:null;}
 const names=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];m=text.toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[ /.-]*(\d{4})\b/);
 if(m)return {value:m[2]+'-'+String(names.indexOf(m[1])+1).padStart(2,'0'),precision:'month',raw:m[0]};
 return null;
}
