import { DatabaseSync } from 'node:sqlite';
import { createHash,randomUUID } from 'node:crypto';
import { mkdirSync,existsSync,writeFileSync } from 'node:fs';
import { dirname,isAbsolute } from 'node:path';
import { resolveStock,validateCount,compareCount,confirmationMatches } from '../pda-preview/domain.mjs';
import { catalog,assignments } from './fixtures.mjs';
export class DemoError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
const fail=(s,c,m)=>{throw new DemoError(s,c,m);};
const hash=v=>createHash('sha256').update(v).digest('hex');
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const milli=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e9||Math.abs(v*1000-Math.round(v*1000))>1e-5)fail(400,'INVALID_QUANTITY','Use a nonnegative quantity with at most 3 decimal places');return Math.round(v*1000);};
export class DemoStore {
 constructor(file,{now=()=>Date.now()}={}){
  if(!isAbsolute(file)||file.includes('://'))throw new Error('An absolute isolated SQLite file is required');
  mkdirSync(dirname(file),{recursive:true});if(!existsSync(file))writeFileSync(file,'',{mode:0o600});
  this.now=now;this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  this.db.exec(`
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,branch TEXT NOT NULL,actor TEXT NOT NULL,device TEXT NOT NULL,payload TEXT NOT NULL,request_hash TEXT NOT NULL,received_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS lots(event_id TEXT NOT NULL REFERENCES events(id),seq INTEGER NOT NULL,lot_code TEXT NOT NULL,quantity_milli INTEGER NOT NULL CHECK(quantity_milli>=0),mfg TEXT,exp TEXT,PRIMARY KEY(event_id,seq));
   CREATE TABLE IF NOT EXISTS receipts(event_id TEXT PRIMARY KEY REFERENCES events(id),receipt_id TEXT NOT NULL UNIQUE,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS revisions(branch TEXT NOT NULL,product TEXT NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(branch,product));
   CREATE TABLE IF NOT EXISTS selection_history(id TEXT PRIMARY KEY,branch TEXT NOT NULL,product TEXT NOT NULL,recorded_at TEXT NOT NULL,reason TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS selections(branch TEXT NOT NULL,product TEXT NOT NULL,fingerprint TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(branch,product));
   CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,actor TEXT NOT NULL,device TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS login_limits(account TEXT PRIMARY KEY,failures INTEGER NOT NULL,locked_until INTEGER NOT NULL);
  `);
  for(const table of ['events','lots','receipts','selection_history'])for(const op of ['UPDATE','DELETE'])this.db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'append-only evidence'); END;`);
  this.db.prepare('INSERT OR IGNORE INTO meta VALUES (?,?)').run('fixture_observed_at',new Date(this.now()).toISOString());
  this.fixtureAt=Date.parse(this.db.prepare('SELECT value FROM meta WHERE key=?').get('fixture_observed_at').value);
  this.createMobileFixtureSchema();
 }
 close(){this.db.close();}
 createMobileFixtureSchema(){
  // The original JS mobile-products router executes its real SELECTs here.
  // This attached database is explicitly synthetic; no production DB connection.
  this.db.exec(`ATTACH DATABASE ':memory:' AS ada;
   CREATE TABLE ada.products(product_code TEXT PRIMARY KEY,product_name_th TEXT,product_name TEXT,unit_small TEXT,factor_small REAL,unit_medium TEXT,factor_medium REAL,unit_large TEXT,factor_large REAL);
   CREATE TABLE ada.product_barcodes(barcode TEXT PRIMARY KEY,product_code TEXT);
   CREATE TABLE ada.branch_stock_snapshots(product_code TEXT PRIMARY KEY,product_name_thai TEXT,product_name_eng TEXT,qty_total_all_branches REAL,${['000','001','002','003','004','005'].flatMap(b=>[`qty_branch_${b} REAL`,`cost_avg_branch_${b} REAL`]).join(',')});
   CREATE TABLE ada.product_effective_branch_prices(branch_code TEXT,product_code TEXT,channel TEXT,unit_size TEXT,price_level INTEGER,price_amount REAL,price_source TEXT,unit_name TEXT,factor REAL,allow_branch_override INTEGER,source_updated_at TEXT,source_synced_at TEXT);`);
  for(const p of catalog){
   this.db.prepare('INSERT INTO ada.products VALUES (?,?,?,?,?,?,?,?,?)').run(p.code,p.name,'Synthetic '+p.code,p.unit,1,null,null,null,null);
   this.db.prepare('INSERT INTO ada.product_barcodes VALUES (?,?)').run(p.barcode,p.code);
   this.db.prepare('INSERT INTO ada.branch_stock_snapshots (product_code,product_name_thai,product_name_eng,qty_total_all_branches,qty_branch_004,cost_avg_branch_004) VALUES (?,?,?,?,?,?)').run(p.code,p.name,'Synthetic '+p.code,p.full,p.full,1.25);
   for(const channel of ['retail','wholesale'])this.db.prepare('INSERT INTO ada.product_effective_branch_prices VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('004',p.code,channel,'S',1,channel==='retail'?10:8,'synthetic-fixture',p.unit,1,0,null,new Date(this.fixtureAt).toISOString());
  }
 }
 mobileDb(){return {query:async(sql,params=[])=>{
  if(!/^\s*SELECT\b/i.test(sql)||!sql.includes('ada.'))throw new Error('Fixture adapter only permits the original mobile read queries');
  const bindings=[];const text=sql.replace(/\$(\d+)/g,(_,n)=>{bindings.push(typeof params[Number(n)-1]==='boolean'?Number(params[Number(n)-1]):params[Number(n)-1]);return '?';});
  const rows=this.db.prepare(text).all(...bindings);return {rows,rowCount:rows.length};
 }};}
 events(branch){return this.db.prepare('SELECT r.body FROM receipts r JOIN events e ON e.id=r.event_id WHERE e.branch=? ORDER BY e.received_at,e.rowid').all(branch).map(r=>{const receipt=JSON.parse(r.body);return {...receipt.event,receiptId:receipt.receiptId};});}
 revision(branch,product){return this.db.prepare('SELECT value FROM revisions WHERE branch=? AND product=?').get(branch,product)?.value||0;}
 references(branch,product){
  const p=catalog.find(p=>p.code===product);if(!p)fail(404,'UNKNOWN_PRODUCT','Product is not in the synthetic catalog');
  const events=this.events(branch);const human=events.filter(e=>e.productCode===product&&e.status==='synced'&&e.complete&&!events.some(c=>c.supersedesId===e.id&&c.status==='synced')).sort((a,b)=>b.observedAt.localeCompare(a.observedAt))[0];
  return {human:human?{...human,eligible:true}:null,hourly:p.hourly===null?null:{quantity:p.hourly,observedAt:new Date(this.fixtureAt-25*60000).toISOString(),eligible:true},full:p.full===null?null:{quantity:p.full,observedAt:new Date(this.fixtureAt-3*3600000).toISOString(),eligible:true},now:this.now()};
 }
 selection(branch,product,reason='read-freshness-evaluation'){
  const refs=this.references(branch,product);const selected=resolveStock(refs);const eventId=selected.source==='human'?refs.human.id:null;
  const result={...selected,eventId,branchCode:branch,productCode:product,unit:catalog.find(p=>p.code===product).unit,quantityKind:selected.source==='human'?'observed':'fixture-reference',fixture:true,policyVersion:'isolated-demo-v1'};
  const fingerprint=hash(stable(result));const previous=this.db.prepare('SELECT fingerprint,body FROM selections WHERE branch=? AND product=?').get(branch,product);
  if(previous?.fingerprint!==fingerprint){this.db.prepare('INSERT INTO selection_history VALUES (?,?,?,?,?,?,?)').run(randomUUID(),branch,product,new Date(this.now()).toISOString(),reason,previous?.body||null,JSON.stringify(result));this.db.prepare('INSERT INTO selections VALUES (?,?,?,?) ON CONFLICT(branch,product) DO UPDATE SET fingerprint=excluded.fingerprint,body=excluded.body').run(branch,product,fingerprint,JSON.stringify(result));}
  return {...result,fetchedAt:new Date(this.now()).toISOString(),cached:false};
 }
 bootstrap(actor){
  const stockByProduct=Object.fromEntries(catalog.map(p=>[p.code,this.selection(actor.branchCode,p.code)]));
  const own=assignments.filter(a=>a.staffId===actor.id);
  return {environment:'isolated-fixture-demo',officialStockWrites:false,serverTime:new Date(this.now()).toISOString(),identity:actor,catalogVersion:'synthetic-catalog-v1',products:catalog,assignments:own,seedAt:this.fixtureAt,events:this.events(actor.branchCode),revisions:Object.fromEntries(catalog.map(p=>[p.code,this.revision(actor.branchCode,p.code)])),stockByProduct,sourceHistory:this.db.prepare('SELECT * FROM selection_history WHERE branch=? ORDER BY rowid DESC LIMIT 200').all(actor.branchCode).map(r=>({id:r.id,productCode:r.product,recordedAt:r.recorded_at,reason:r.reason,before:r.before_json?JSON.parse(r.before_json):null,after:JSON.parse(r.after_json)}))};
 }
 submit(actor,device,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||!uuid.test(body.id))fail(400,'INVALID_EVENT_ID','A stable UUID event ID is required');
  if(body.branchCode!==actor.branchCode||body.staffId!==actor.id)fail(403,'IDENTITY_SCOPE','Branch and actor must match the authenticated session');
  const allowed=new Set(['id','branchCode','staffId','productCode','unit','canonicalStockCode','canonicalFactor','catalogVersion','assignmentId','assignmentRevision','startedAt','observedAt','baseRevision','lots','quantity','complete','note','referenceAtScan','supersedesId','incidentId','correctionReason','discrepancyConfirmation']);
  if(Object.keys(body).some(k=>!allowed.has(k)))fail(400,'UNEXPECTED_FIELD','Unknown count field');
  const payloadHash=hash(stable(body));this.db.exec('BEGIN IMMEDIATE');
  try{
   const old=this.db.prepare('SELECT e.actor,e.device,e.branch,e.request_hash,r.body FROM events e JOIN receipts r ON r.event_id=e.id WHERE e.id=?').get(body.id);
   if(old){if(old.actor!==actor.id||old.device!==device||old.branch!==actor.branchCode||old.request_hash!==payloadHash)fail(409,'IDEMPOTENCY_MISMATCH','Event ID already exists with a different payload or scope');this.db.exec('COMMIT');return {...JSON.parse(old.body),replayed:true};}
   const p=catalog.find(p=>p.code===body.productCode);if(!p)fail(404,'UNKNOWN_PRODUCT','Unknown synthetic product');
   const task=assignments.find(a=>a.id===body.assignmentId&&a.staffId===actor.id&&a.branchCode===actor.branchCode&&a.productCodes.includes(p.code));
   if(!task||body.assignmentRevision!==task.revision)fail(403,'ASSIGNMENT_SCOPE','This actor is not assigned to this product or assignment revision');
   if(body.unit!==p.unit||body.canonicalStockCode!==p.code||body.canonicalFactor!==1||body.catalogVersion!==p.catalogVersion)fail(409,'UNIT_IDENTITY_CHANGED','Canonical item/unit mapping must match the server catalog');
   if(!iso(body.observedAt)||!iso(body.startedAt)||Date.parse(body.startedAt)>Date.parse(body.observedAt)||Date.parse(body.observedAt)>this.now()+30000)fail(400,'INVALID_TIMESTAMP','Use original timezone-qualified capture times with valid ordering');
   if(!Number.isSafeInteger(body.baseRevision)||body.baseRevision<0||!Array.isArray(body.lots)||body.lots.length>100)fail(400,'INVALID_PAYLOAD','Invalid revision or lot count');
   if(body.lots.some(l=>!l||typeof l!=='object'||typeof l.code!=='string'||l.code.length>80))fail(400,'INVALID_LOT','Lot code must be text');
   if(body.correctionReason!==null&&body.correctionReason!==undefined&&typeof body.correctionReason!=='string')fail(400,'INVALID_CORRECTION','Correction reason must be text');
   if(body.discrepancyConfirmation&&typeof body.discrepancyConfirmation.reason!=='string')fail(400,'INVALID_CONFIRMATION','Confirmation reason must be text');
   if(body.supersedesId!==null&&body.supersedesId!==undefined&&!uuid.test(body.supersedesId))fail(400,'INVALID_CORRECTION','Original event ID must be a UUID');
   if(body.incidentId!==null&&body.incidentId!==undefined&&!uuid.test(body.incidentId))fail(400,'INVALID_INCIDENT','Incident ID must be a UUID');
   const claim=body.referenceAtScan;if(claim&&(typeof claim!=='object'||!['human','hourly','full','unknown'].includes(claim.source)||(claim.quantity!==null&&(typeof claim.quantity!=='number'||!Number.isFinite(claim.quantity)))||(claim.observedAt!==null&&!iso(claim.observedAt))))fail(400,'INVALID_REFERENCE','Reference claim must preserve quantity/source/observation semantics');
   const confirmation=body.discrepancyConfirmation;if(confirmation&&(confirmation.reason.length>300||typeof confirmation.rechecked!=='boolean'||typeof confirmation.countQuantity!=='number'||typeof confirmation.referenceQuantity!=='number'||!['human','hourly','full','unknown'].includes(confirmation.referenceSource)||(confirmation.referenceObservedAt!==null&&!iso(confirmation.referenceObservedAt))))fail(400,'INVALID_CONFIRMATION','Invalid discrepancy confirmation');
   const errors=validateCount(body,this.now());if(errors.length)fail(400,'INVALID_COUNT',errors.join('; '));
   let total=0;for(const l of body.lots){total+=milli(l.quantity);for(const k of ['mfg','exp'])if(!Object.hasOwn(l,k)||(l[k]!==null&&(typeof l[k]!=='string'||!l[k])))fail(400,'DATE_PRECISION','A date must be explicit YYYY-MM-DD or null (unknown)');}
   if(total!==milli(body.quantity))fail(400,'TOTAL_MISMATCH','Server lot total differs from supplied quantity');
   if(typeof body.note!=='string'||body.note.length>300||body.lots.some(l=>l.code.length>80))fail(400,'INVALID_TEXT','Text is too long');
   const original=body.supersedesId?this.db.prepare('SELECT payload,actor FROM events WHERE id=? AND branch=?').get(body.supersedesId,actor.branchCode):null;
   if(body.supersedesId&&(!original||JSON.parse(original.payload).productCode!==p.code||(!body.correctionReason?.trim())||body.correctionReason.length>300||(original.actor!==actor.id&&actor.role!=='manager')))fail(403,'CORRECTION_SCOPE','A correction needs a same-product original, authorized actor and reason');
   const current=this.revision(actor.branchCode,p.code);const reference=this.selection(actor.branchCode,p.code,'before-count');const comparison=compareCount(body,reference);
   const children=body.supersedesId?this.events(actor.branchCode).filter(e=>e.supersedesId===body.supersedesId&&e.status==='synced'):[];
   let status=current!==body.baseRevision||children.length?'conflict':comparison.kind==='discrepancy'&&!confirmationMatches(body,reference)?'review':'synced';
   if(status==='synced'&&(Date.parse(body.observedAt)>this.now()||this.now()-Date.parse(body.observedAt)>4*3600000))status='review';
   const receivedAt=new Date(this.now()).toISOString();const nextRevision=status==='conflict'?current:current+1;
   const event={...body,staffName:actor.name,status,quantity:total/1000,receivedAt,comparison,referenceAtSubmit:reference,receiptRevision:nextRevision,serverValidated:true,fixture:true};
   const receipt={receiptId:randomUUID(),eventId:body.id,status,receivedAt,event,officialStockWrites:false,environment:'isolated-fixture-demo',replayed:false};
   this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(body.id,actor.branchCode,actor.id,device,JSON.stringify(body),payloadHash,receivedAt);
   for(const [i,l] of body.lots.entries())this.db.prepare('INSERT INTO lots VALUES (?,?,?,?,?,?)').run(body.id,i,l.code,milli(l.quantity),l.mfg,l.exp);
   this.db.prepare('INSERT INTO receipts VALUES (?,?,?)').run(body.id,receipt.receiptId,JSON.stringify(receipt));
   if(status!=='conflict')this.db.prepare('INSERT INTO revisions VALUES (?,?,?) ON CONFLICT(branch,product) DO UPDATE SET value=excluded.value').run(actor.branchCode,p.code,nextRevision);
   this.selection(actor.branchCode,p.code,status==='synced'?(body.supersedesId?'accepted-correction':'accepted-count'):'evidence-held-'+status);
   this.db.exec('COMMIT');return receipt;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
