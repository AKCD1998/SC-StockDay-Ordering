// Owner-confirmed read contract at PaaSRTSM 40ef239a43b7. This module does NOT
// turn its Full Sync value into a fresh count or infer pack/conversion identity.
export function exactBarcode(value){if(typeof value!=='string'||!value.trim())throw new Error('Barcode must be a nonempty string');return value.trim();}
export function normalizeMobileRead(raw,{branchCode,requestedBarcode,fetchedAt=new Date().toISOString()}){
 const barcode=exactBarcode(requestedBarcode);
 if(!raw||raw.barcode!==barcode||raw.branchCode!==branchCode||typeof raw.productCode!=='string'||!raw.productCode)throw new Error('Mobile response identity/scope mismatch');
 const quantity=raw.stockByBranch?.[branchCode];
 if(quantity!==null&&(typeof quantity!=='number'||!Number.isFinite(quantity)))throw new Error('Mobile stock must be a number or null');
 const total=raw.stockByBranch?.total;if(total!==null&&(typeof total!=='number'||!Number.isFinite(total)))throw new Error('Mobile total must be a number or null');
 return {barcode,branchCode,productCode:raw.productCode,nameTh:raw.nameTh,nameEn:raw.nameEn,units:raw.units,retailPrice:raw.retailPrice,unitPrices:raw.unitPrices||[],
  stock:{source:'full-sync',quantity,total,observedAt:null,fetchedAt,freshness:'unknown',includesHourly:false,includesShopee:false},
  identity:{barcodeUniqueness:'unknown',scannedPack:'unknown',canonicalStockOwner:null,conversionRuleVersion:null},
  countEligibility:{allowed:false,reasons:['pack-identity-unknown','canonical-owner-unknown','conversion-rule-version-unknown','barcode-uniqueness-unproven','stock-observed-at-unknown']},
  priceTimestampsAreStockTimestamps:false,rawResponse:raw};
}
// Read-only future native transport. Not wired to the hosted preview: the owner
// observed CORS 403 there. No token minting, no refresh endpoint, no proxy.
export class ExistingMobileReadClient {
 constructor({identityProvider,fetchImpl=globalThis.fetch}){this.identityProvider=identityProvider;this.fetch=fetchImpl;}
 async lookup(value){
  const barcode=exactBarcode(value);const identity=await this.identityProvider();if(!identity?.token||!identity.branchCode)throw new Error('An existing enrolled mobile identity is required');
  const url='https://paasrtsm-project.onrender.com/api/mobile/products/by-barcode/'+encodeURIComponent(barcode);
  const response=await this.fetch(url,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+identity.token}});
  if(response.status===401)throw new Error('Mobile enrollment expired or revoked; re-enrollment is required');
  if(!response.ok)throw new Error('Mobile read rejected: '+response.status);
  return normalizeMobileRead(await response.json(),{branchCode:identity.branchCode,requestedBarcode:barcode});
 }
}
export function requireUniqueFixtureMapping(rows,barcode){
 const matches=rows.filter(r=>r.barcode===exactBarcode(barcode));
 if(matches.length!==1)throw new Error(matches.length?'Ambiguous barcode mapping':'Unknown barcode mapping');
 const p=matches[0];if(!p.fixture||!p.canonicalStockCode||p.canonicalFactor!==1||!p.catalogVersion)throw new Error('Explicit fixture mapping required');return p;
}
