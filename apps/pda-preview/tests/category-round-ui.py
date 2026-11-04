"""Focused round/category UI → existing HTTP/PG fixture check. Never live.
Feed {origin, outputDirectory} on stdin after the full fixture browser run.
"""
import json,sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
config=json.load(sys.stdin);origin=config['origin'];out=Path(config['outputDirectory']);parsed=urlsplit(origin)
assert parsed.scheme=='http' and parsed.hostname=='127.0.0.1' and parsed.port and parsed.path=='','Explicit isolated loopback origin required'
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 receipts=[];errors=[]
 for staff,status in [('2',201),('1',409)]:
  context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(origin+'/pilot-001.html',wait_until='networkidle')
  assert page.locator('meta[name=pda-pilot-fixture]').get_attribute('content')=='enabled'
  login=context.request.post(origin+'/admin/auth/login',data={'username':'fixture-branch001','password':'fixture-only-password'});assert login.status==200
  code=context.request.post(origin+'/api/mobile/enroll/start',data={},headers={'X-CSRF-Token':login.json()['csrf_token']});assert code.status==201
  page.locator('#enrollmentCode').fill(code.json()['code']);page.locator('#rosterButton').click();page.wait_for_function("!document.querySelector('#staffSelect').disabled");page.locator('#staffSelect').select_option(staff);page.locator('#connectButton').click();page.wait_for_function("document.querySelector('#status').textContent.includes('ดึงประวัติแล้ว')")
  page.locator('#categorySelect').select_option('pharma');page.locator('#roundSelect').select_option('2');selected_scope=page.locator('#scopeSelect').input_value()
  page.locator('#barcode').fill('0001234567890');page.locator('#barcode').press('Enter');page.locator('#countForm').wait_for(state='visible');assert page.locator('#categorySelect').is_disabled();assert page.locator('#roundSelect').is_disabled();assert page.locator('#roundSelect').input_value()=='2'
  page.locator('#unitSize').select_option('S');row=page.locator('.pilot-lot').first;row.locator('.lot-code').fill('CATEGORY-ROUND-2');row.locator('.lot-quantity').fill('6');row.locator('.mfg-unknown').check();row.locator('.exp-unknown').check()
  page.locator('#countForm button[type=submit]').click();assert 'PDA-TEST-001' in page.locator('#reviewText').inner_text();assert '6' in page.locator('#reviewText .confirm-quantity').inner_text();assert page.locator('#roundSelect').input_value()=='2'
  with page.expect_response(lambda r:r.url.endswith('/api/mobile/counts') and r.request.method=='POST') as received:page.locator('#reviewSave').click()
  body=received.value.json();assert received.value.status==status,{'status':received.value.status,'code':body.get('code')}
  if status==201:
   assert body['event']['scopeId']==selected_scope
   assert body['event']['scope']['round']==2 and body['event']['scope']['label']=='เภสัช'
   assert body['event']['scope']['sessionKey']=='fixture-001-pharma'
   assert body['event']['scope']['locationKey']=='whole-branch'
   assert body['officialStockWrites'] is False
   receipts.append({'eventId':body['eventId'],'receiptId':body['receiptId'],'scopeId':selected_scope,'round':2,'category':'เภสัช','staffId':body['event']['staffId']})
   page.locator('[data-event="'+body['eventId']+'"]').wait_for();page.screenshot(path=str(out/'round-2-receipt-mobile.png'),full_page=True)
   view=context.request.get(origin+'/api/stock-counts/products/PDA-TEST-001').json()
   category_heads=[item['event'] for item in view['activeObservations'] if item['event']['scope']['sessionKey']=='fixture-001-pharma']
   assert {item['scope']['round'] for item in category_heads}=={1,2}
   assert sorted(item['quantity'] for item in category_heads)==['6.000','9.000']
   assert view['sourceResolution']['selected']['quantity']==6 and view['sourceResolution']['selected']['source']=='full-sync'
  else:
   assert body['code']=='INDEPENDENT_COUNTER_REQUIRED',body.get('code')
   page.wait_for_function("document.querySelector('#history').textContent.includes('ข้อมูลชนกัน')")
  context.close()
 assert not errors,errors
 report={'environment':'cloud-loopback-existing-http-postgresql-fixture','secondCounterRound2':receipts[0],'firstAndSecondRoundsHaveSeparateHeads':True,'roundValuesComparedNotAdded':True,'sameCounterAcrossRoundsRejected409':True,'selectorsLockedDuringCount':True,'selectedCategoryAndRoundRetained':True,'reviewShowsSkuAndQuantity':True,'officialReferenceRemains6':True,'browserErrors':errors,'productionOrStagingVerified':False,'physicalPhoneVerified':False}
 (out/'category-round-roundtrip.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report,ensure_ascii=False));browser.close()
