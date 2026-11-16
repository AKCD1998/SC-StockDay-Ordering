const pad=n=>String(n).padStart(2,'0');
const digits=value=>value.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
export const THAI_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
export function monthDays(year,month){return month===2?(year%4===0&&(year%100!==0||year%400===0)?29:28):[31,28,31,30,31,30,31,31,30,31,30,31][month-1];}
export function isoDate(year,month,day){
 if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>monthDays(year,month))throw Error('วันที่ไม่ถูกต้อง กรุณาตรวจวัน เดือน และปี');
 return String(year).padStart(4,'0')+'-'+pad(month)+'-'+pad(day);
}
// ISO input is explicitly Gregorian and remains unchanged. Local numeric entry
// accepts D/M/YYYY or DDMMYYYY; Thai Buddhist years2400–2999 convert explicitly.
export function normalizeManualDate(value){
 if(typeof value!=='string')throw Error('กรอกวัน เดือน และปีให้ครบตามฉลาก');
 const text=digits(value.trim()).replace(/\s+/g,'');let year,month,day;
 if(/^\d{4}-\d{2}-\d{2}$/.test(text)){[year,month,day]=text.split('-').map(Number);return isoDate(year,month,day);}
 const parts=text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
 if(parts){[,day,month,year]=parts;}
 else if(/^\d{8}$/.test(text)){day=text.slice(0,2);month=text.slice(2,4);year=text.slice(4);}
 else throw Error('กรอกวัน เดือน และปีให้ครบ เช่น 16112026');
 year=Number(year);if(year>=2400&&year<=2999)year-=543;
 return isoDate(year,Number(month),Number(day));
}
export function manualDateText(value){
 if(!value)return '';
 try{const date=normalizeManualDate(value),[year,month,day]=date.split('-');return Number(year)>=2400?date:day+'/'+month+'/'+year;}catch{return String(value);}
}
export function dateDraftValue(value){if(!value)return '';try{return normalizeManualDate(value);}catch{return value;}}
export function bangkokToday(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t).value;return get('year')+'-'+get('month')+'-'+get('day');}
