import { requireUniqueFixtureMapping } from '../pda-preview/mobile-contract.mjs';
// Synthetic fixtures only. These are the SAME publicly documented preview PINs.
// They are never loaded by the production admin-api and grant no remote access.
export const actors = [
 {id:'staff01',name:'พนักงาน 01',short:'01',role:'sales',branchCode:'004',pin:'1111'},
 {id:'staff02',name:'พนักงาน 02',short:'02',role:'sales',branchCode:'004',pin:'2222'},
 {id:'lead03',name:'หัวหน้าสาขา',short:'03',role:'manager',branchCode:'004',pin:'3333'},
];
export const catalog = [
 {code:'DEMO-001',name:'วิตามินซี 1,000 มก.',unit:'ขวด',barcode:'8850000000011',hourly:24,full:28},
 {code:'DEMO-002',name:'แอลกอฮอล์ 70% · 450 มล.',unit:'ขวด',barcode:'8850000000028',hourly:6,full:8},
 {code:'DEMO-003',name:'น้ำเกลือล้างแผล · 500 มล.',unit:'ขวด',barcode:'8850000000035',hourly:18,full:20},
 {code:'DEMO-004',name:'หน้ากากอนามัย · 50 ชิ้น',unit:'กล่อง',barcode:'8850000000042',hourly:0,full:5},
 {code:'DEMO-005',name:'สำลีแผ่น · 100 กรัม',unit:'ถุง',barcode:'8850000000059',hourly:null,full:12},
 {code:'DEMO-006',name:'พลาสเตอร์ปิดแผล · 20 ชิ้น',unit:'กล่อง',barcode:'8850000000066',hourly:null,full:null},
].map(p=>({...p,canonicalStockCode:p.code,canonicalFactor:1,catalogVersion:'synthetic-catalog-v1',fixture:true}));
export const assignments = [
 {id:'fixture-004-a',branchCode:'004',staffId:'staff01',revision:1,location:'all-branch',scope:'complete-product-or-survey',productCodes:catalog.slice(0,3).map(p=>p.code)},
 {id:'fixture-004-b',branchCode:'004',staffId:'staff02',revision:1,location:'all-branch',scope:'complete-product-or-survey',productCodes:catalog.slice(3).map(p=>p.code)},
 {id:'fixture-004-lead',branchCode:'004',staffId:'lead03',revision:1,location:'all-branch',scope:'complete-product-or-survey',productCodes:catalog.map(p=>p.code)},
];

// Fail closed if fixture identity becomes ambiguous; never rely on LIMIT 1.
for(const p of catalog)requireUniqueFixtureMapping(catalog,p.barcode);
