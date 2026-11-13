"""Real WebCrypto/browser transport → actual isolated HTTP/PostgreSQL handlers.
No Java/Android bridge emulation or production credentials. Fixture data only.
"""
import argparse,json,time,urllib.request,subprocess,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--fixtures',required=True);p.add_argument('--backend-root',required=True);p.add_argument('--pg-port',required=True);p.add_argument('--primary-invitation');p.add_argument('--second-invitation');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True);fixtures=Path(a.fixtures);api='http://127.0.0.1:39963';origin='http://127.0.0.1:5197';errors=[];submits=[];chaos={'offline':False,'lose':False};runlot='WEB-'+str(uuid.uuid4())[:8]
readbook="""async()=>new Promise(ok=>{let q=indexedDB.open('scpda-local-counts-001-v1',2);q.onsuccess=()=>{let db=q.result,t=db.transaction(['records','uploads'],'readonly'),r={};for(const n of ['records','uploads']){const g=t.objectStore(n).getAll();g.onsuccess=()=>r[n]=g.result;}t.oncomplete=()=>{db.close();ok(r);};};})"""
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 def route(r):
  if r.request.url.startswith(api):
   if chaos['offline']:r.abort('failed');return
   if r.request.method=='POST' and r.request.url==api+'/api/scpda/counts':
    submits.append(r.request.post_data_json['id'])
    if chaos['lose']:
     chaos['lose']=False;r.fetch();r.abort('failed');return
  r.continue_()
 ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def pair(page,inv):
  page.goto(origin);page.locator('#activationPane').wait_for(state='visible')
  with page.expect_file_chooser() as chooser:page.locator('#activateDevice').click()
  chooser.value.set_files(str(inv));page.locator('#loginPane').wait_for(state='visible')
 def login(page):page.locator('#password').fill('1111');page.locator('#loginButton').click();page.locator('#lookupPane').wait_for(state='visible')
 def wait_receipt(event):
  end=time.monotonic()+30
  while time.monotonic()<end:
   row=next((u for u in page.evaluate(readbook)['uploads'] if u['id']==event),None)
   if row and row.get('receipt'):return row['receipt']
   page.wait_for_timeout(100)
  raise AssertionError('No server receipt; '+json.dumps(page.evaluate(readbook)['uploads'],ensure_ascii=False))
 def start(lot,qty,complete=False):
  page.locator('#barcode').fill('0001234567890');page.locator('#lookupButton').click();page.locator('#productPane').wait_for(state='visible');page.locator('#startLocalCount').click();page.locator('#localCategory').select_option('pharma');page.locator('#localUnit').select_option('เม็ด');page.locator('#local-lot-0-code').fill(lot);page.locator('#local-lot-0-mfg').fill('2026-10-01');page.locator('#local-lot-0-exp').fill('2027-01-01');page.locator('#local-lot-0-qty').fill(qty);page.locator('#localComplete').set_checked(complete)
 def save():page.locator('#localCountReviewButton').click();page.locator('#localCountReviewSave').click();page.locator('#localHistoryPane').wait_for(state='visible');return sorted(page.evaluate(readbook)['records'],key=lambda r:r['recordedOnDeviceAt'])[-1]
 pair(page,Path(a.primary_invitation) if a.primary_invitation else fixtures/'invitation.json');login(page);page.locator('#accountButton').click();assert 'ส่งผลนับเป็นหลักฐาน' in page.locator('#countConnectionHint').inner_text();page.locator('#closeAccount').click();start(runlot,'3',True);page.screenshot(path=str(out/'BROWSER-REAL-CONTRACT-COUNT.png'));base=save();base_receipt=wait_receipt(base['id']);assert base_receipt['event']['barcode']=='0001234567890';assert base_receipt['event']['stockObservationTime'] is None;assert base_receipt['event']['unitFactor'] is None
 # Trusted synthetic coverage seed is explicit, not a live Ada movement provider.
 subprocess.run(['node',str(Path(a.backend_root)/'tests/fixtures/scpda-fefo-browser-seed.cjs'),a.pg_port],cwd=a.backend_root,check=True,stdout=subprocess.PIPE)
 page.locator('#localHistoryBack').click();start(runlot,'2');late=save();page.locator('[data-late-reason]').click();page.locator('#localLateReasonDialog').wait_for(state='visible');page.screenshot(path=str(out/'BROWSER-LATE-LOT-REASON.png'));page.locator('#localLateReasonCode').select_option('found-existing');page.locator('#localLateReasonNote').fill('พบกล่องเดิมที่ชั้นสอง');page.locator('#localLateReasonSave').click();late_receipt=wait_receipt(late['id']);assert late_receipt['reviewStatus']=='needs-review';assert late_receipt['event']['lateReason']['note']=='พบกล่องเดิมที่ชั้นสอง'
 # Native browser network failure: local assets still reopen, API is unavailable.
 page.locator('#localHistoryBack').click();start('OFFLINE-WEB','4');chaos['offline']=True;pending=save();assert next(u for u in page.evaluate(readbook)['uploads'] if u['id']==pending['id'])['receipt'] is None;page.reload();page.locator('#loginPane').wait_for(state='visible');assert any(r['id']==pending['id'] for r in page.evaluate(readbook)['records']);chaos['offline']=False;login(page);wait_receipt(pending['id'])
 page.locator('#localHistoryButton').click();page.locator('#localHistoryBack').click();start('LOST-WEB','1');chaos['lose']=True;lost=save();assert next(u for u in page.evaluate(readbook)['uploads'] if u['id']==lost['id'])['receipt'] is None;page.locator('#localSyncButton').click();wait_receipt(lost['id']);assert submits.count(lost['id'])==1
 page.locator('.scpda-local-record').filter(has=page.locator('[data-correct="0"]')).locator('[data-correct]').click();page.locator('#local-lot-0-qty').fill('3');page.locator('#localCorrectionReason').fill('นับตกหล่นอีกสองเม็ด');correction=save();wait_receipt(correction['id']);assert correction['supersedesId']==lost['id'];assert next(r for r in page.evaluate(readbook)['records'] if r['id']==lost['id'])['quantity']==1
 device=page.evaluate("""async()=>new Promise(ok=>{const q=indexedDB.open('scpda-web-device-001-v1',1);q.onsuccess=()=>{const db=q.result,r=db.transaction('device').objectStore('device').get('identity');r.onsuccess=()=>{const v=r.result;db.close();ok({privateKeyExtractable:v.privateKey.extractable,deviceId:v.deviceId});};};})""");assert device['privateKeyExtractable']==False;assert page.evaluate('Object.keys(localStorage).length')==0;assert 'Bearer ' not in json.dumps(page.evaluate(readbook))
 # A separate browser key uses the second disposable admission and sees shared history.
 other=b.new_context(viewport={'width':390,'height':844});second=other.new_page();second.on('pageerror',lambda e:errors.append(str(e)));pair(second,Path(a.second_invitation) if a.second_invitation else fixtures/'java-invitation.json');login(second);second.locator('#localHistoryButton').click();second.get_by_text('ผลนับจากเซิร์ฟเวอร์',exact=True).wait_for();assert 'QA-001' in second.locator('#localHistoryPane').inner_text()
 # Actual admin auth + CSRF review roundtrip; no fabricated admin JWT.
 c=ctx.request.post(api+'/admin/auth/login',data={'username':'fixture-admin','password':'fixture-admin-only-password'});assert c.ok;csrf=c.json()['csrf_token'];review=ctx.request.post(api+'/api/stock-lots/events/'+late['id']+'/reviews',data={'action':'accepted-observation','reason':'ตรวจกล่องที่ชั้นสองแล้ว ยืนยันผลนับ','expectedRevision':1},headers={'X-CSRF-Token':csrf});assert review.status==201
 page.locator('#localSyncButton').click();page.get_by_text('ตรวจกล่องที่ชั้นสองแล้ว',exact=False).first.wait_for();page.screenshot(path=str(out/'BROWSER-SERVER-RECEIPTS.png'));page.locator('#accountButton').click();page.locator('#logoutButton').click();page.locator('#loginPane').wait_for(state='visible')
 assert not errors,errors
 evidence=json.load(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(api+'/fixture/evidence'));assert [s['qty_branch_001'] for s in evidence['stock']]==['6',None,'-2']
 result={'environment':'cloud browser WebCrypto → actual isolated HTTP/auth/PostgreSQL','syntheticDataOnly':True,'checks':['fresh nonextractable browser key and registered device/PIN proof','separate count-purpose grant','leading-zero lookup and unknown unit/time preserved','actual count receipt and lot/date persistence','late-lot reason and needs-review receipt','offline cold reopen and retry','lost accepted response recovered without second POST','append-only correction','second registered browser client sees shared history','actual CSRF admin review returns to original client','no session/PIN stored in localStorage/count records','logout'],'baseEventId':base['id'],'baseReceiptId':base_receipt['receiptId'],'lateEventId':late['id'],'lateReceiptId':late_receipt['receiptId'],'offlineEventId':pending['id'],'lostEventId':lost['id'],'correctionEventId':correction['id'],'nonextractablePrivateKey':True,'browserErrors':errors,'productionOrStagingVerified':False,'officialInventoryWrites':False,'physicalAndroidAccepted':False};(out/'browser-roundtrip.json').write_text(json.dumps(result,indent=2,ensure_ascii=False));print(json.dumps(result,ensure_ascii=False));other.close();ctx.close();b.close()
