"""Source UI + real IndexedDB with synthetic transport. No APK build/live calls."""
import argparse,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[2]/'pda-preview'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/pending-fixture':
   html=(root/'scpda.html').read_text().replace('<script type="module" src="./scpda-ui.mjs"></script>','')
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  else:super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda route:route.continue_() if route.request.url.startswith('http://127.0.0.1:') or route.request.url.startswith('data:') else route.abort())
  page.goto('http://127.0.0.1:'+str(server.server_port)+'/pending-fixture')
  result=page.evaluate("""async()=>{
   const {ScpdaCountUI}=await import('./scpda-count-ui.mjs'),{countSubmission}=await import('./scpda-count-sync.mjs');
   const assert=(v,m)=>{if(!v)throw Error(m)},checks=[],ops=[];
   let actor={branchCode:'005',operatorCode:'01005'},serverFails=false,reviewed=false;
   window.fixtureOnline=true;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>window.fixtureOnline});
   const names={sent:'เภสัช รายการส่งสำเร็จ',pending:'เภสัช รายการค้างส่งชื่อยาภาษาไทยยาวสำหรับทดสอบการตัดบรรทัด',local:'ปกติ เก็บไว้เฉพาะเครื่อง',blocked:'สามัญ ต้องระบุเหตุผล',foreign:'เภสัช สาขา001'};
   const make=(name,n,extra={})=>({schema:'scpda-local-count-v1',id:crypto.randomUUID(),branchCode:'005',operatorCode:'01005',skuId:'1',productCode:'QA-'+n,barcode:'0001234567890',productName:name,quantity:n,unit:'แผง',category:'pharma',round:1,completeProduct:true,countedAt:'2026-11-16T03:00:00Z',recordedOnDeviceAt:'2026-11-16T03:00:00Z',lots:[{code:'QA',quantity:n,manufacturedOn:null,expiresOn:null}],uploadIntent:true,...extra});
   const receipt=r=>({contract:'scpda-counts-'+r.branchCode+'-v1',branchCode:r.branchCode,eventId:r.id,receiptId:crypto.randomUUID(),receivedAt:'2026-11-16T03:00:01Z',event:{productName:r.productName,quantity:String(r.quantity),unitLabel:r.unit,operatorCode:r.operatorCode,observedAt:r.countedAt},reviewStatus:'received',reviewRevision:1,officialStockWrites:false});
   const sent=make(names.sent,6),pending=make(names.pending,3),local=make(names.local,2,{uploadIntent:false}),foreign=make(names.foreign,9,{branchCode:'001',operatorCode:'01001'}),store=new Map([[sent.id,receipt(sent)]]);
   const ui=new ScpdaCountUI({getActor:()=>actor,navigate:view=>{document.querySelector('#lookupPane').hidden=false;for(const q of ['.scpda-scanner','#choices','#recentPane','#productPane','#pricePane'])document.querySelector(q).hidden=true;ui.root.hidden=view!=='count';ui.history.hidden=view!=='history';},message:()=>{},request:async(op,payload)=>{
    ops.push({op,id:payload?.id,operator:actor.operatorCode});
    if(serverFails)throw Object.assign(Error('fixture network unavailable'),{status:0});
    if(op==='countHistory')return {records:[...store.values()].filter(r=>r.branchCode===actor.branchCode).map(r=>({...r,reviewStatus:reviewed?'accepted-observation':'received',reviewRevision:reviewed?2:1,reviewReason:reviewed?'ตรวจผลนับเรียบร้อย':''}))};
    if(op==='countReceipt'){if(store.has(payload.id))return store.get(payload.id);throw Object.assign(Error('not found'),{status:404});}
    if(op==='countCheck')return {reasonRequired:false};
    if(op==='countSubmit'){assert(payload.capturedByOperator===actor.operatorCode,'wrong actor sent');const record=payload.id===pending.id?pending:foreign;const r=receipt(record);store.set(payload.id,r);return r;}
    throw Error('Unexpected '+op);
   }});window.pendingFixture={ui,ops,checks,names,sent,pending,local,foreign,getActor:()=>actor,setActor:value=>actor=value,setFailure:value=>serverFails=value,setReviewed:value=>reviewed=value};
   await ui.book.append(sent,'none');await ui.book.enqueue(sent,countSubmission(sent));await ui.book.markUpload(sent.id,{status:'accepted',receipt:store.get(sent.id)});await ui.book.append(local,'none');await ui.book.append(foreign,'none');await ui.book.enqueue(foreign,countSubmission(foreign));ui.sync.available=true;
   await ui.showHistory();await new Promise(ok=>setTimeout(ok,50));
   assert(!document.querySelector('.scpda-pending-panel')&&!document.querySelector('#localSyncButton'),'normal received history shows retry control');assert(ui.history.textContent.includes(names.sent),'sent count missing');assert(!ui.history.textContent.includes(names.foreign),'foreign branch leaked');checks.push('received observations awaiting review show no queue panel/button and branch001 stays separate');
   assert(!ops.some(o=>o.op==='countSubmit'),'local-only history was silently sent');checks.push('historical local-only record keeps its explicit individual-send action and is not queued');
   await ui.book.append(pending,'none');await ui.book.enqueue(pending,countSubmission(pending));serverFails=true;await ui.showHistory();await new Promise(ok=>setTimeout(ok,50));
   const panel=document.querySelector('.scpda-pending-panel'),button=document.querySelector('#localSyncButton');assert(panel&&panel.textContent.includes(names.pending),'pending medicine absent');assert(panel.textContent.includes('3 แผง'),'quantity/unit absent');assert(!panel.textContent.includes(names.sent)&&!panel.textContent.includes(names.local)&&!panel.textContent.includes(names.foreign),'nonqueued item shown');assert(button.textContent==='ส่งรายการค้าง','ambiguous label retained');assert(getComputedStyle(button).color==='rgb(255, 255, 255)'&&getComputedStyle(button).backgroundColor==='rgb(190, 18, 60)','retry button is not red/white');checks.push('pending-only pale-red panel lists medicine/quantity/round with red-white clear retry action');
   window.fixtureOnline=false;await ui.showHistory({refreshOnly:true});assert(document.querySelector('#localSyncButton').disabled,'offline send enabled');assert(panel.textContent.includes(names.pending),'offline queue lost');checks.push('offline queue remains visible with disabled action and connection hint');window.fixtureOnline=true;
   return {checks,syntheticTransport:true,realIndexedDB:true,apkBuilt:false};
  }""")
  for width in [320,390,496]:
   page.set_viewport_size({'width':width,'height':844});page.evaluate("pendingFixture.ui.showHistory({refreshOnly:true})")
   assert page.locator('.scpda-pending-panel').is_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow'
  page.set_viewport_size({'width':390,'height':844});page.locator('.scpda-pending-panel').screenshot(path=str(out/'PENDING-QUEUE.png'))
  page.evaluate('pendingFixture.setFailure(false)');page.locator('#localSyncButton').click();page.wait_for_function("!document.querySelector('.scpda-pending-panel')")
  page.evaluate("""async()=>{
   const f=pendingFixture,u=await f.ui.book.upload(f.pending.id);if(!u.receipt||u.status!=='accepted')throw Error('No stored receipt after retry');
   if(f.ops.filter(o=>o.op==='countSubmit'&&o.id===f.pending.id).length!==1)throw Error('Retry duplicated count');
   if(f.ops.some(o=>o.op==='countSubmit'&&(o.id===f.local.id||o.id===f.foreign.id)))throw Error('Unintended count sent');
   f.checks.push('retry reuses original record, stores one receipt, hides panel and preserves local-only/foreign counts');document.querySelector('[data-local-record=\"'+f.sent.id+'\"] details').open=true;f.setReviewed(true);
  }""")
  page.evaluate("window.dispatchEvent(new Event('focus'))");page.wait_for_function("document.querySelector('#localHistoryPane').textContent.includes('ตรวจผลนับเรียบร้อย')")
  page.locator('#localHistoryPane').screenshot(path=str(out/'RECEIVED-NO-QUEUE.png'))
  page.evaluate("""async()=>{
   const f=pendingFixture;if(document.querySelector('#localSyncButton'))throw Error('Refresh-only button returned');if(!document.querySelector('[data-local-record=\"'+f.sent.id+'\"] details').open)throw Error('Automatic refresh collapsed open lot details');if(f.ops.filter(o=>o.op==='countSubmit').length!==1)throw Error('Review refresh submitted a count');f.checks.push('foreground refresh updates admin-review status without a queue button or extra count POST');
   const blocked={...f.pending,id:crypto.randomUUID(),productName:f.names.blocked};await f.ui.book.append(blocked,'none');await f.ui.book.enqueue(blocked,{id:blocked.id});await f.ui.book.markUpload(blocked.id,{status:'reason-required'});f.ui.sync.available=false;await f.ui.showHistory();if(!document.querySelector('.scpda-pending-panel [data-late-reason]'))throw Error('Required reason action absent');if(!document.querySelector('#localSyncButton').disabled)throw Error('Blocked-only send enabled');f.checks.push('reason-required queue exposes its corrective action rather than pretending a blind retry fixes it');
   f.ui.disconnect();f.setActor({branchCode:'001',operatorCode:'01001'});await f.ui.showHistory();const panel=document.querySelector('.scpda-pending-panel');if(!panel||!panel.textContent.includes(f.names.foreign)||panel.textContent.includes(f.names.pending)||panel.textContent.includes(f.names.blocked))throw Error('Queue actor separation failed');f.checks.push('account switch renders only that branch/operator queue');clearInterval(f.ui.historyRefreshTimer);
  }""")
  checks=page.evaluate('pendingFixture.checks');assert not errors,errors
  result={'scope':'Source UI and real IndexedDB with synthetic transport; no APK build/deploy', 'checks':checks,'browserErrors':errors,'apkBuilt':False,'productionDataWritten':False}
  (out/'PENDING-UI-CHECK.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':'PASS','checks':len(checks),'browserErrors':errors}));browser.close()
finally:server.shutdown();server.server_close();thread.join()
