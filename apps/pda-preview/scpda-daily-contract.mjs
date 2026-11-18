export const SCPDA_VERSION_CODE=17;
export const SCPDA_VERSION_NAME='0.8.0-test.17';
const webOrigin='https://sc-stockday-ordering.onrender.com';
export function enrollmentFromUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('QR ไม่ถูกต้อง');}
 const match=u.hash.match(/^#enroll=([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/i);
 if(u.origin!==webOrigin||u.pathname!=='/scpda/'||u.search||!match)throw Error('ใช้ QR จากเครื่องหลัก SCPDA เท่านั้น');
 return {grantId:match[1],secret:match[2]};
}
