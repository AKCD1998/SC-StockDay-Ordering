"""The delivered single HTML needs no inventory backend or external assets, even in an opaque frame.
Also verify an explicitly configured backend never falls back to fake demo data.
"""
import json,sys,threading,datetime
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from playwright.sync_api import sync_playwright
entry=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True);html=entry.read_text();errors=[];external=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  data=(html.replace('</head>','<meta name="sc-pda-api-origin" content="https://pda-backend.invalid"></head>') if self.path.startswith('/configured') else html).encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();preview_url='http://127.0.0.1:'+str(server.server_port)+'/pilot-001.html'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
  context=browser.new_context(viewport={'width':390,'height':844},permissions=['camera'])
  context.route('**/*',lambda route:route.continue_() if route.request.url.startswith('http://127.0.0.1:'+str(server.server_port)+'/') else (external.append(route.request.url),route.abort('failed')))
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(preview_url,wait_until='load');page.locator('#previewModeBadge').wait_for(state='visible');page.evaluate('document.fonts.ready')
  assert page.locator('#previewModeBadge').inner_text()=='ทดลอง'
  assert page.locator('#loginBrand').is_visible();assert page.locator('.pilot-nav').is_hidden();assert page.evaluate("document.fonts.check('400 16px \"SC Plex\"','ภาษาไทย') && document.fonts.check('600 16px \"SC Plex\"','ภาษาไทย')")
  page.screenshot(path=str(out/'SC-LOGIN.png'),full_page=False)
  ratios=[]
  for width in [360,390,496]:
   page.set_viewport_size({'width':width,'height':844});a=page.locator('#enrollmentCode').bounding_box();b=page.locator('#rosterButton').bounding_box();assert abs(a['width']/b['width']-7)<.04;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');ratios.append({'width':width,'ratio':a['width']/b['width']})
  page.set_viewport_size({'width':390,'height':844})
  def login(subject,code,operator):
   subject.locator('#enrollmentCode').fill(code);subject.locator('#rosterButton').click();subject.wait_for_function("!document.querySelector('#connectButton').disabled");assert subject.locator('#staffSelect option:checked').inner_text()==operator;subject.locator('#connectButton').click();subject.wait_for_function("document.querySelector('#operatorCode').textContent==='"+operator+"' && document.querySelector('#enrollmentCard').hidden")
  def logout(subject):
   subject.locator('#operatorAvatar').click();subject.locator('#disconnectButton').click();subject.locator('#enrollmentCard').wait_for(state='visible')
  def fill(subject,n,lot):
   unit=subject.locator('#unitSize');assert unit.input_value()=='S' if unit.is_disabled() else True
   if not unit.is_disabled():unit.select_option('S')
   r=subject.locator('.pilot-lot').last;r.locator('.lot-code').fill(lot);r.locator('.lot-quantity').fill(str(n));r.locator('.mfg-unknown').check();r.locator('.exp-unknown').check()
  def save(subject):
   subject.locator('#countReviewButton').click();subject.locator('#reviewDialog').wait_for(state='visible');assert 'Full Sync' not in subject.locator('#reviewText').inner_text();subject.locator('#reviewSave').click();subject.locator('#reviewDialog').wait_for(state='hidden');subject.wait_for_timeout(150)
  page.locator('#enrollmentCode').fill('0000');page.locator('#rosterButton').click();assert 'รหัสทดลองไม่ถูกต้อง' in page.locator('#status').inner_text()
  login(page,'1111','01001');assert page.locator('#status').is_hidden();assert page.locator('#loginBrand').is_hidden();assert page.locator('#previewModeBadge').is_visible()
  page.wait_for_timeout(250);page.screenshot(path=str(out/'SC-SCAN.png'),full_page=False,animations='disabled')
  # The original scanner reads the embedded sample with no asset/network request.
  page.locator('#cameraButton').click();page.locator('#cameraSample').wait_for(state='visible');assert 'เปิด' not in page.locator('#cameraTorch').inner_text();page.locator('#cameraSample').click();page.wait_for_function("!document.querySelector('#cameraResult').hidden && document.querySelector('#cameraResult').textContent.includes('8850000000028')")
  page.locator('#cameraConfirm').click();page.locator('#countForm').wait_for(state='visible');fill(page,3,'PREVIEW-LOT-A');page.locator('.lot-quantity').fill('3.5');page.locator('#countReviewButton').click();assert not page.locator('#reviewDialog').is_visible();assert 'จำนวนเต็ม' in page.locator('#status').inner_text();assert page.locator('.lot-quantity').input_value()=='3.5';page.locator('.lot-quantity').fill('3');page.locator('#complete').check()
  page.locator('#countReviewButton').click();page.locator('#reviewDialog').screenshot(path=str(out/'SC-CONFIRM.png'));page.locator('#reviewSave').click();page.wait_for_timeout(200)
  assert page.locator('#history [data-event]').count()==1;assert 'บันทึกในเดโม' in page.locator('#history').inner_text()
  page.locator('.correct-count').click();page.locator('#addLotButton').click();fill(page,3,'PREVIEW-LOT-B');page.locator('#correctionReason').fill('พบอีกล็อตที่ชั้นบน');save(page);assert page.locator('#history [data-event]').count()==2
  page.locator('#history [data-event] details').first.evaluate('(n)=>n.open=true');page.screenshot(path=str(out/'SC-HISTORY.png'),full_page=True);assert 'Receipt' not in page.locator('#history').inner_text();assert 'เซิร์ฟเวอร์' not in page.locator('#history').inner_text()
  def records(subject):return subject.evaluate("""async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('sc-stockday-browser-preview-v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return await new Promise((ok,no)=>{const r=db.transaction('events').objectStore('events').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});}""")
  stored=records(page);original=next(x for x in stored if not x['receipt']['event'].get('correctionOf'));corrected=next(x for x in stored if x['receipt']['event'].get('correctionOf'));assert original['receipt']['event']['quantity']=='3.000';assert corrected['receipt']['event']['quantity']=='6.000';assert corrected['receipt']['event']['observedAt']==original['receipt']['event']['observedAt'];assert all(x['receipt']['previewOnly'] and x['receipt']['receiptId'].startswith('demo-') for x in stored)
  page.close();page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(preview_url,wait_until='load');page.locator('#previewModeBadge').wait_for(state='visible');page.locator('[data-pane=history]').click();assert page.locator('#history [data-event]').count()==2
  logout(page);login(page,'2222','02001');page.locator('#roundSelect').select_option('2');page.locator('#previewSample').click();fill(page,4,'PREVIEW-ROUND-TWO');save(page)
  heads=page.evaluate("""async()=>{const r=indexedDB.open('sc-stockday-browser-preview-v1',1);const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));return await new Promise(ok=>{const q=db.transaction('heads').objectStore('heads').getAll();q.onsuccess=()=>ok(q.result)});}""");assert len(heads)==2
  # Two tabs read one revision; only one new head can commit.
  page.locator('[data-pane=count]').click();page.locator('#categorySelect').select_option('common');page.locator('#roundSelect').select_option('1');page.locator('#previewSample').click();fill(page,1,'PREVIEW-CONCURRENT')
  # The second tab restores the unsent draft, including its locked category/round.
  other=context.new_page();other.on('pageerror',lambda e:errors.append(str(e)));other.goto(preview_url,wait_until='load');other.locator('#countForm').wait_for(state='visible');assert other.locator('#categorySelect').input_value()=='common';assert other.locator('#roundSelect').input_value()=='1';fill(other,1,'PREVIEW-CONCURRENT');save(page);save(other);other.locator('[data-state=conflict]').wait_for();assert len([e for e in records(other) if e['receipt']['event']['productCode']=='DEMO-002'])==1;other.close()
  logout(page);login(page,'3333','03001');assert page.locator('#operatorCode').inner_text()=='03001';logout(page)
  assert not external,external
  # An opaque embedded preview cannot persist data; it must still log in honestly.
  host=context.new_page();host.on('pageerror',lambda e:errors.append(str(e)));host.set_content('<iframe id="preview" sandbox="allow-scripts" style="width:390px;height:844px;border:0"></iframe>');host.evaluate('(html)=>document.querySelector("iframe").srcdoc=html',html);frame=host.frames[1];frame.locator('#previewModeBadge').wait_for(state='visible');assert frame.locator('#previewModeBadge').inner_text()=='ทดลองชั่วคราว';login(frame,'1111','01001');frame.locator('#previewSample').click();fill(frame,1,'TEMPORARY-PREVIEW');save(frame);assert 'บันทึกในเดโม' in frame.locator('#history').inner_text();host.close()
  context.close()
  # Configured mode fails clearly instead of using local demo profiles or data.
  configured=browser.new_context(viewport={'width':390,'height':844});blocked=[];configured.route('https://pda-backend.invalid/**',lambda route:(blocked.append(route.request.url),route.abort('failed')));live=configured.new_page();live.on('pageerror',lambda e:errors.append(str(e)));live.goto('http://127.0.0.1:'+str(server.server_port)+'/configured.html',wait_until='load');live.locator('#enrollmentCode').fill('1111');live.locator('#rosterButton').click();live.wait_for_function("document.querySelector('#status').textContent.includes('เชื่อมต่อระบบไม่ได้')");assert live.locator('#previewModeBadge').is_hidden();assert live.locator('#connectButton').is_disabled();assert len(blocked)==1;configured.close()
  assert not errors,errors
  report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'artifact':str(entry),'staticHtmlPreviewWithoutInventoryBackend':True,'directFileNavigationBlockedByQaAdministratorPolicy':True,'allExternalAndBackendNetworkBlockedDuringPreview':True,'externalRequests':external,'allThreeProfilesVerified':['01001','02001','03001'],'exactSevenToOne':ratios,'embeddedFontAndActualWasmSampleDecoderWorked':True,'torchOffDefault':True,'wholeNumberEntryPreserved':True,'originalThreeAndCorrectionSixPreserved':True,'originalObservationTimePreserved':True,'newPageReopenRetainsPreviewRecords':True,'independentRoundsNotAdded':True,'twoTabStaleRevisionRetainedAsConflict':True,'opaqueFrameMemoryFallbackWorksAndIsLabeled':True,'configuredBackendNeverSilentlyFallsBack':True,'previewReferencesNeverCalledServerReceipts':True,'browserErrors':errors,'realBackendAuthChanged':False,'productionOrStagingVerified':False,'physicalAndroidOrIphoneVerified':False}
  (out/'browser-recovery-evidence.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close();thread.join()
