"""Exact APK assets → shipping host-JVM session → isolated HTTP/PostgreSQL.
The JS callback and software key stand in for Android hardware. No live writes.
Requires the explicitly marked backend fixture and an existing admin Vite fixture.
"""
import argparse, datetime, hashlib, json, subprocess, threading, time, urllib.request, zipfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
for name in ['fixture-origin','invitation','device-directory','jvm-classes','json-jar','apk','admin-origin','out']:
 p.add_argument('--'+name,required=True)
a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
assert a.fixture_origin.startswith('http://127.0.0.1:') and a.admin_origin=='http://127.0.0.1:5197'
local=urllib.request.build_opener(urllib.request.ProxyHandler({}));errors=[];checks=[];ops=[]
chaos={'offline':False,'loseNextSubmitReply':False}
with zipfile.ZipFile(a.apk) as z:html=z.read('assets/scpda.html');icon=z.read('assets/scpda-icon.png')
java=subprocess.Popen(['java','-cp',a.jvm_classes+':'+a.json_jar,'th.co.scgroup1989.scpda.NativeReadHarness',a.fixture_origin,a.device_directory,a.invitation],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
native='http://127.0.0.1:'+str(json.loads(java.stdout.readline())['port'])
class H(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  body=icon if self.path=='/scpda-icon.png' else html
  self.send_response(200);self.send_header('Content-Type','image/png' if self.path=='/scpda-icon.png' else 'text/html; charset=utf-8');self.end_headers();self.wfile.write(body)
 def do_POST(self):
  n=int(self.headers.get('Content-Length','0'))
  if self.path!='/invoke' or n>65536:self.send_error(400);return
  raw=self.rfile.read(n);request=json.loads(raw);op=request['op'];ops.append(op)
  if chaos['offline'] and op!='status':reply={'ok':False,'status':0,'error':'เครือข่ายขัดข้อง (synthetic test)'}
  else:
   reply=json.loads(local.open(urllib.request.Request(native+'/invoke',raw,{'Content-Type':'application/json'}),timeout=35).read())
   if op=='countSubmit' and chaos['loseNextSubmitReply'] and reply.get('ok'):
    chaos['loseNextSubmitReply']=False;reply={'ok':False,'status':0,'error':'ขาดการเชื่อมต่อหลังส่ง (synthetic test)'}
  body=json.dumps(reply,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',0),H);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin='http://127.0.0.1:'+str(server.server_port)
bridge="""window.SCPDAHost={invoke(id,op,raw){fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,body:JSON.parse(raw)})}).then(r=>r.json()).then(reply=>window.__scpdaReceive(id,reply)).catch(()=>window.__scpdaReceive(id,{ok:false,status:0,error:'เชื่อมต่อไม่ได้'}));}};"""
db_read="""async()=>new Promise((resolve,reject)=>{let r=indexedDB.open('scpda-local-counts-001-v1',2);r.onsuccess=()=>{let db=r.result,t=db.transaction(['records','uploads'],'readonly'),v={};for(let n of ['records','uploads']){let q=t.objectStore(n).getAll();q.onsuccess=()=>v[n]=q.result;}t.oncomplete=()=>{db.close();resolve(v);};};r.onerror=reject;})"""
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
  ctx=browser.new_context(viewport={'width':390,'height':844},permissions=['camera']);ctx.add_init_script(bridge)
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(origin);page.wait_for_function("!document.querySelector('#activationPane').hidden || !document.querySelector('#loginPane').hidden")
  if page.locator('#activationPane').is_visible():page.locator('#activateDevice').click()
  def login(page,user='01001',pin='1111'):
   page.locator('#loginPane').wait_for(state='visible');page.locator('#username').select_option(user);page.locator('#password').fill(pin);page.locator('#loginButton').click();page.locator('#lookupPane').wait_for(state='visible');page.wait_for_timeout(200)
  login(page);page.locator('#accountButton').click();assert 'ส่งผลนับเป็นหลักฐาน' in page.locator('#countConnectionHint').inner_text();page.locator('#closeAccount').click();checks.append('native fresh-purpose count access negotiated without exposing count token')
  def search():
   page.locator('#barcode').fill('0001234567890');page.locator('#lookupButton').click();page.locator('#productPane').wait_for(state='visible')
  def enter(lot,qty,complete=False):
   search();page.locator('#startLocalCount').click();page.locator('#localCategory').select_option('pharma');page.locator('#localUnit').select_option('เม็ด');page.locator('#local-lot-0-code').fill(lot);page.locator('#local-lot-0-mfg').fill('2026-10-01');page.locator('#local-lot-0-exp').fill('2027-01-01');page.locator('#local-lot-0-qty').fill(qty);page.locator('#localComplete').set_checked(complete);page.locator('#localCountReviewButton').click();assert page.locator('#localCountReviewSave').inner_text()=='ยืนยันและส่ง';page.locator('#localCountReviewSave').click();page.locator('#localHistoryPane').wait_for(state='visible')
  enter('LOT-A','2');page.locator('[data-late-reason]').wait_for(state='visible');page.locator('[data-late-reason]').click();page.screenshot(path=str(out/'SCPDA-LATE-LOT-REASON.png'));page.locator('#localLateReasonCode').select_option('found-existing');page.locator('#localLateReasonNote').fill('พบกล่องยาที่เก็บอยู่ชั้นบน');page.locator('#localLateReasonSave').click();page.wait_for_function("document.querySelector('#localHistoryPane').textContent.includes('Receipt ')")
  data=page.evaluate(db_read);late=next(r for r in data['records'] if r['lots'][0]['code']=='LOT-A')
  def wait_upload(event_id):
   deadline=time.monotonic()+35
   while time.monotonic()<deadline:
    if any(u['id']==event_id and u.get('receipt') for u in page.evaluate(db_read)['uploads']):return
    page.wait_for_timeout(100)
   raise AssertionError('No receipt for '+event_id+'; '+json.dumps(page.evaluate(db_read)['uploads'],ensure_ascii=False))
  wait_upload(late['id']);data=page.evaluate(db_read);accepted=next(u for u in data['uploads'] if u['id']==late['id']);(out/'browser-local-fixture.json').write_text(json.dumps(data,indent=2,ensure_ascii=False));assert accepted['receipt']['event']['lateReason']['code']=='found-existing';assert accepted['receipt']['reviewStatus']=='needs-review';page.screenshot(path=str(out/'SCPDA-SERVER-RECEIPT.png'),full_page=True);checks.append('previously estimated empty lot accepted only after reason; real server receipt retained')
  # Existing real React component, real admin session and CSRF, same PostgreSQL record.
  admin=browser.new_context(viewport={'width':1440,'height':1000});ap=admin.new_page();ap.on('pageerror',lambda e:errors.append(str(e)));ap.goto(a.admin_origin+'/tests/fixtures/scpda-lots-browser.html');ap.locator('input[name=password]').fill('fixture-admin-only-password');ap.get_by_role('button',name='Sign in').click();ap.locator('#openQueue').click();card=ap.locator('[data-count-event="'+late['id']+'"]');card.wait_for();assert 'พบกล่องยาที่เก็บอยู่ชั้นบน' in card.inner_text();assert 'ไม่ได้สรุปว่าพนักงานผิด' in card.inner_text();ap.screenshot(path=str(out/'STOCKDAY-ADMIN-LOT-QUEUE.png'),full_page=True);card.locator('summary').click();card.locator('textarea').fill('ตรวจพบกล่องเดิมจริง เก็บเป็นหลักฐานผลนับ');card.get_by_role('button',name='รับรองผลนับ',exact=True).click();card.wait_for(state='detached');ap.get_by_role('button',name='ปิดล็อต PDA').click();ap.locator('#openLots').click();card=ap.locator('[data-count-event="'+late['id']+'"]');card.wait_for();assert 'รับรองผลนับ' in card.inner_text();ap.screenshot(path=str(out/'STOCKDAY-ADMIN-LOT-DETAIL.png'),full_page=True);checks.append('actual admin component sees same lot/reason/receipt and appends CSRF-protected review')
  page.locator('#localSyncButton').click();page.wait_for_function("document.querySelector('#localHistoryPane').textContent.includes('ตรวจพบกล่องเดิมจริง')");checks.append('admin decision returns to original phone history')
  # A fresh observation is distinct from a correction of an earlier count.
  page.locator('#localHistoryBack').click();enter('OFFLINE-B','4');page.wait_for_timeout(300)
  # The preceding record is online; now create another with native network unavailable.
  page.locator('#localHistoryBack').click();search();page.locator('#startLocalCount').click();page.locator('#localCategory').select_option('pharma');page.locator('#localUnit').select_option('เม็ด');page.locator('#local-lot-0-code').fill('COLD-REOPEN');page.locator('.local-mfg-unknown').check();page.locator('.local-exp-unknown').check();page.locator('#local-lot-0-qty').fill('5');chaos['offline']=True;page.locator('#localCountReviewButton').click();page.locator('#localCountReviewSave').click();page.locator('#localHistoryPane').wait_for(state='visible');before=page.evaluate(db_read);pending=next(r for r in before['records'] if r['lots'][0]['code']=='COLD-REOPEN');assert next(u for u in before['uploads'] if u['id']==pending['id'])['receipt'] is None
  page.close();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin);persisted=page.evaluate(db_read);assert next(r for r in persisted['records'] if r['id']==pending['id'])['quantity']==5;assert next(u for u in persisted['uploads'] if u['id']==pending['id'])['receipt'] is None
  chaos['offline']=False;login(page);page.locator('#localHistoryButton').click();page.wait_for_function("document.querySelector('#localHistoryPane').textContent.includes('COLD-REOPEN')");page.locator('#localSyncButton').click();wait_upload(pending['id']);checks.append('native network outage queues immutable record; cold reopen preserves it; re-login retry receives one receipt')
  page.locator('#localHistoryBack').click();chaos['loseNextSubmitReply']=True;enter('LOST-REPLY','1');d=page.evaluate(db_read);lost=next(r for r in d['records'] if r['lots'][0]['code']=='LOST-REPLY');assert next(u for u in d['uploads'] if u['id']==lost['id'])['receipt'] is None;submits=ops.count('countSubmit');page.locator('#localSyncButton').click();page.wait_for_function("document.querySelector('#localHistoryPane').textContent.includes('Receipt ')");page.wait_for_timeout(300);d=page.evaluate(db_read);assert next(u for u in d['uploads'] if u['id']==lost['id'])['receipt'];assert ops.count('countSubmit')==submits;checks.append('accepted response lost: receipt recovery avoids resubmission and duplicate count')
  # Correct the latest count while retaining its original timestamp and evidence.
  rcard=page.locator('.scpda-local-record').filter(has=page.locator('[data-correct="0"]'));rcard.locator('[data-correct]').click();page.locator('#local-lot-0-qty').fill('3');page.locator('#localCorrectionReason').fill('นับตกหล่นอีกสองเม็ด');page.locator('#localCountReviewButton').click();page.locator('#localCountReviewSave').click();page.locator('#localHistoryPane').wait_for(state='visible');page.wait_for_timeout(250);d=page.evaluate(db_read);correction=next(r for r in d['records'] if r.get('supersedesId')==lost['id']);assert next(r for r in d['records'] if r['id']==lost['id'])['quantity']==1;assert correction['quantity']==3;assert next(u for u in d['uploads'] if u['id']==correction['id'])['receipt'];checks.append('append-only correction retains original 1 and linked corrected 3')
  # A separate browser store uses authenticated server history, not copied local data.
  other=browser.new_context(viewport={'width':390,'height':844});other.add_init_script(bridge);sp=other.new_page();sp.goto(origin);login(sp);sp.locator('#localHistoryButton').click();sp.wait_for_function("document.querySelector('#localHistoryPane').textContent.includes('ผลนับจากเซิร์ฟเวอร์')");assert lost['productCode'] in sp.locator('#localHistoryPane').inner_text();checks.append('second clean browser client sees shared authenticated server history')
  # Scanner remains aim-first and the previous requested copy and red action remain.
  page.locator('#localHistoryBack').click();page.locator('#scanButton').click();page.locator('#cameraDialog').wait_for(state='visible');page.wait_for_function("!document.querySelector('#cameraCapture').disabled");assert page.locator('#cameraCapture').inner_text().replace('◎','').strip()=='อ่านบาร์โค้ด';assert page.locator('#cameraDialog').get_attribute('data-phase')=='aiming';assert 'เปิด' not in page.locator('#cameraTorch').inner_text();page.wait_for_timeout(300);assert page.locator('#cameraCapture').evaluate('e=>{const c=getComputedStyle(e).backgroundColor.match(/[0-9]+/g).map(Number);return c[0]>c[1]*3&&c[0]>c[2]*3;}');page.screenshot(path=str(out/'SCPDA-SCANNER-R4.png'));page.locator('#cameraClose').click();checks.append('scanner aim-first, red shortened action and torch-off default preserved with synthetic camera')
  for w in [360,390,496]:page.set_viewport_size({'width':w,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not page.evaluate('Object.keys(localStorage).length');assert page.evaluate('document.cookie')=='';assert not errors,errors
  evidence=json.load(local.open(a.fixture_origin+'/fixture/evidence'));assert [r['qty_branch_001'] for r in evidence['stock']]==['6',None,'-2']
  report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'cloud exact APK assets → shipping host JVM → isolated HTTP/PostgreSQL → actual admin React component','apkSha256':hashlib.sha256(Path(a.apk).read_bytes()).hexdigest(),'entrySha256':hashlib.sha256(html).hexdigest(),'checks':checks,'lateEventId':late['id'],'lateReceiptId':accepted['receipt']['receiptId'],'offlineEventId':pending['id'],'lostReplyEventId':lost['id'],'correctionEventId':correction['id'],'browserErrors':errors,'officialStockWrites':False,'liveOrStagingVerified':False,'physicalAndroidOrWebViewVerified':False,'syntheticCameraOnly':True}
  (out/'ui-count-roundtrip.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report,ensure_ascii=False));other.close();admin.close();ctx.close();browser.close()
finally:
 server.shutdown();server.server_close();thread.join();java.terminate();java.wait(timeout=10)
