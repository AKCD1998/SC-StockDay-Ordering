"""Real browser IndexedDB upgrade and account-switch recovery checks.
Transport in this test is synthetic; the separate pilot roundtrip uses HTTP/PG.
"""
import argparse,json,threading
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2]/'pda-preview'
class H(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),H);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();page.goto('http://127.0.0.1:'+str(server.server_port)+'/scpda.html')
  result=page.evaluate("""async()=>{
   const {LocalCountBook}=await import('./scpda-local-counts.mjs'),{CountSync}=await import('./scpda-count-sync.mjs');
   const checks=[],assert=(v,m)=>{if(!v)throw Error(m);},a={operatorCode:'01001',branchCode:'001'},b={operatorCode:'02001',branchCode:'001'};
   const make=id=>({id,branchCode:'001',operatorCode:'01001',skuId:'1',productCode:'QA-001',barcode:'0001234567890',unit:'เม็ด',category:'pharma',round:1,completeProduct:false,countedAt:'2026-11-08T10:00:00Z',recordedOnDeviceAt:'2026-11-08T10:00:00Z',lots:[{code:'A',quantity:2,manufacturedOn:null,expiresOn:null}],uploadIntent:false});
   // The production UI has not logged in and therefore has not written records.
   const current=await new Promise(ok=>{const q=indexedDB.open('scpda-local-counts-001-v1');q.onsuccess=()=>ok(q.result);});current.close();
   await new Promise((ok,no)=>{const q=indexedDB.deleteDatabase('scpda-local-counts-001-v1');q.onsuccess=ok;q.onerror=no;});
   const first=make('10000000-0000-4000-8000-000000000001');
   await new Promise((ok,no)=>{const q=indexedDB.open('scpda-local-counts-001-v1',1);q.onupgradeneeded=()=>{q.result.createObjectStore('records',{keyPath:'id'}).createIndex('correctionOf','supersedesId',{unique:true});q.result.createObjectStore('drafts',{keyPath:'key'});};q.onsuccess=()=>{const db=q.result,t=db.transaction(['records','drafts'],'readwrite');t.objectStore('records').add(first);t.objectStore('drafts').add({key:'legacy-draft',branchCode:'001',operatorCode:'01001',draft:{id:'preserve'},product:{}});t.oncomplete=()=>{db.close();ok();};};q.onerror=no;});
   const book=new LocalCountBook(),v=await book.list(a);assert(v.records[0].id===first.id&&v.drafts[0].draft.id==='preserve'&&v.uploads.length===0,'v1 data lost');checks.push('IndexedDB v1→v2 retains immutable counts and unfinished drafts');
   let actor=a,calls=[];const receipt=id=>({contract:'scpda-counts-001-v1',branchCode:'001',eventId:id,receiptId:'20000000-0000-4000-8000-000000000001',receivedAt:'2026-11-08T11:00:00Z',officialStockWrites:false});
   const request=async(op,p)=>{calls.push(op);if(op==='countHistory')return{records:[]};if(op==='countReceipt')throw Object.assign(Error('missing'),{status:404});if(op==='countCheck')return{reasonRequired:false};if(op==='countSubmit')return receipt(p.id);};
   const sync=new CountSync({book,getActor:()=>actor,request,onChange:()=>{}});sync.available=true;await sync.flush();assert(!calls.includes('countSubmit'),'legacy count auto-sent');checks.push('old local-only records are not uploaded automatically');
   await sync.queue(first);assert((await book.upload(first.id)).receipt.receiptId===receipt(first.id).receiptId,'explicit upload failed');await book.markUpload(first.id,{status:'pending'});assert((await book.upload(first.id)).status==='accepted','receipt downgraded');checks.push('explicit legacy send succeeds; accepted receipt cannot be downgraded');
   const next=make('10000000-0000-4000-8000-000000000002');await book.append(next,'none');await book.enqueue(next,{id:next.id});let release;const hold=new Promise(ok=>release=ok);let started;const entered=new Promise(ok=>started=ok),switched=[];
   const race=new CountSync({book,getActor:()=>actor,request:async(op)=>{switched.push({op,operator:actor.operatorCode});if(op==='countReceipt'){started();await hold;throw Object.assign(Error('missing'),{status:404});}return{records:[]};},onChange:()=>{}});race.available=true;const flight=race.flush();await entered;actor=b;race.connect(true);release();await flight;await new Promise(ok=>setTimeout(ok,20));assert(!switched.some(c=>c.op==='countSubmit'||c.op==='countCheck'),'old count used new actor');assert((await book.upload(next.id)).receipt===null,'old count misattributed');checks.push('account switch during recovery cannot send an old operator count under the new session');
   actor=a;const bad=new CountSync({book,getActor:()=>actor,request:async(op,p)=>{if(op==='countReceipt')return receipt('10000000-0000-4000-8000-000000000099');return{records:[]};},onChange:()=>{}});bad.available=true;await bad.flush();assert(!(await book.upload(next.id)).receipt,'wrong receipt accepted');checks.push('mismatched server receipt stays pending');
   // A new save while a previous history refresh is waiting must schedule work.
   let releaseHistory,enteredHistory;const historyHold=new Promise(ok=>releaseHistory=ok),historyStarted=new Promise(ok=>enteredHistory=ok);let firstHistory=true;
   const queued=new CountSync({book,getActor:()=>actor,request:async(op,p)=>{if(op==='countHistory'&&firstHistory){firstHistory=false;enteredHistory();await historyHold;return{records:[]};}return request(op,p);},onChange:()=>{}});queued.available=true;const refreshing=queued.flush();await historyStarted;const third=make('10000000-0000-4000-8000-000000000003');await book.append(third,'none');await queued.queue(third);releaseHistory();await refreshing;
   for(let i=0;i<100&&!(await book.upload(third.id))?.receipt;i++)await new Promise(ok=>setTimeout(ok,10));assert((await book.upload(third.id)).receipt,'save during refresh stranded');checks.push('save during in-flight sync schedules a subsequent flush');
   const all=await book.list(a);assert(all.records.length===3&&all.records[0].barcode==='0001234567890','identity changed');assert(JSON.stringify(all).includes('preserve'),'draft lost');checks.push('leading-zero identity and old draft remain after retries');
   (await book.ready).close();return{environment:'cloud real browser IndexedDB with synthetic transport',checks,productionOrStagingVerified:false};
  }""")
  Path(a.out).write_text(json.dumps(result,indent=2));print(json.dumps(result));b.close()
finally:server.shutdown();server.server_close();thread.join()
