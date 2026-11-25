export const SCPDA_VERSION_CODE=23;
export const SCPDA_VERSION_NAME='0.9.1-test.23';
export const DAILY_PAIRS=Object.freeze({'01004':'02004','01004SHPEE':'02004SHPEE','01005':'02005'});
const companionParts=code=>typeof code==='string'?code.match(/^(0[2-9]|[1-9]\d{1,3})(004|005)(SHPEE)?$/):null;
export const isCompanionOperator=code=>{const m=companionParts(code);return !!m&&!(m[2]==='005'&&m[3]);};
export const dailyOperatorBranch=code=>['01004','01004SHPEE'].includes(code)?'004':code==='01005'?'005':isCompanionOperator(code)?companionParts(code)[2]:null;
export const operatorBranch=code=>['01001','02001','03001'].includes(code)?'001':dailyOperatorBranch(code);
export const operatorCountScope=code=>operatorBranch(code)==='004'?(code.endsWith('SHPEE')?'004-shopee':'004-front'):null;
const webOrigin='https://sc-stockday-ordering.onrender.com';
export function enrollmentFromUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('QR ไม่ถูกต้อง');}
 const match=u.hash.match(/^#enroll=([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})(?:&operator=([0-9]{5,7}(?:SHPEE)?))?$/);
 if(u.origin!==webOrigin||u.pathname!=='/scpda/'||u.search||!match||match[3]&&!isCompanionOperator(match[3]))throw Error('ใช้ QR จากเครื่องหลัก SCPDA เท่านั้น');
 return {grantId:match[1],secret:match[2],...(match[3]?{operatorCode:match[3],branchCode:dailyOperatorBranch(match[3])}:{})};
}
