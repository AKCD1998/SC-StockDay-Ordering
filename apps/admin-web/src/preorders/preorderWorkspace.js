// Proposed R3 server contract. This is UI admission, never backend authorization.
// The separate build flag stays off until the server policy is provisioned and reviewed.
const PURCHASE=['cases.read.all','commercial.review','commercial.quote','commercial.order','commercial.unavailable','commercial.reopen','catalog.match','messages.send','messages.internal'];
const FULFILLMENT=['cases.read.all','receipts.link','receipts.physical.record','eta.override'];
const BRANCH=['cases.read.branch','cases.create','customer.decision','customer.info','messages.send'];
const ALLOWED={purchasing:PURCHASE,fulfillment:FULFILLMENT,branch:BRANCH};
export const WORKSPACE_CONTRACT='sc-preorder-three-role-r3-v1';
export function admitWorkspace(data,{userId,isAdmin,branchCode}={}){
 if(data?.contractVersion!==WORKSPACE_CONTRACT||!ALLOWED[data?.workRole]||!Array.isArray(data.capabilities)||!userId||data.subjectUserId!==userId)throw Error('ยังไม่พร้อมเปิดพื้นที่ทำงานนี้ กรุณาติดต่อผู้ดูแล');
 if(data.workRole==='purchasing'&&!isAdmin)throw Error('ไม่พบสิทธิ์ยืนยันราคาและจัดซื้อ');
 if(data.workRole==='branch'&&(!/^\d{3}$/.test(data.branchCode||'')||data.branchCode!==branchCode))throw Error('สาขาของบัญชีไม่ตรงกับพื้นที่ทำงาน');
 const permitted=new Set(data.capabilities.filter(c=>ALLOWED[data.workRole].includes(c))),required=data.workRole==='branch'?'cases.read.branch':'cases.read.all';if(!permitted.has(required))throw Error('ไม่พบสิทธิ์อ่านคำขอในพื้นที่ทำงานนี้');
 return Object.freeze({role:data.workRole,can:capability=>permitted.has(capability),branchCode:data.workRole==='branch'?data.branchCode:null});
}
export const WORKSPACE_TITLES={purchasing:'CEO · ราคาและจัดซื้อ',fulfillment:'พี่บูม · รับของและจัดส่ง',branch:'สาขา · รับเรื่องและดูแลลูกค้า'};
const ACTION_CAPS={'start-review':'commercial.review','request-info':'commercial.review',quote:'commercial.quote',ordered:'commercial.order',unavailable:'commercial.unavailable',reopen:'commercial.reopen',decision:'customer.decision','provide-info':'customer.info','confirm-arrival':'branch.arrival','customer-notified':'customer.notify',complete:'customer.complete',cancel:'cases.cancel'};
export function admittedActions(modes,workspace){return workspace?modes.filter(([mode])=>workspace.can(ACTION_CAPS[mode])):modes;}
