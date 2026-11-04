"""Targeted worker UI acceptance against the existing isolated fixture only.
Uses Chromium fake camera; no real phone/camera/HID usability claim.
Does not submit counts. Feed {origin, outputDirectory} on stdin.
"""
import json,sys
from urllib.parse import urlsplit
from pathlib import Path
from playwright.sync_api import sync_playwright
config=json.load(sys.stdin)
origin=config['origin'];out=Path(config['outputDirectory'])
parsed=urlsplit(origin)
assert parsed.scheme=='http' and parsed.hostname=='127.0.0.1' and parsed.port and parsed.path=='', 'Explicit isolated loopback origin required'
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 context=browser.new_context(viewport={'width':390,'height':844},permissions=['camera'])
 page=context.new_page();errors=[];writes=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda request:writes.append(request.method) if request.url.endswith('/api/mobile/counts') and request.method=='POST' else None)
 page.goto(origin+'/pilot-001.html',wait_until='networkidle')
 assert 'ขอรหัสจากผู้ดูแล' in page.locator('#status').text_content()
 page.screenshot(path=str(out/'pda-login-mobile.png'),full_page=True)
 login=context.request.post(origin+'/admin/auth/login',data={'username':'fixture-branch001','password':'fixture-only-password'})
 assert login.status==200
 enrolled=context.request.post(origin+'/api/mobile/enroll/start',data={},headers={'X-CSRF-Token':login.json()['csrf_token']})
 assert enrolled.status==201, enrolled.status
 page.locator('#enrollmentCode').fill(enrolled.json()['code']);page.locator('#rosterButton').click();page.wait_for_function("!document.querySelector('#staffSelect').disabled");page.locator('#staffSelect').select_option('1');page.locator('#connectButton').click();page.wait_for_function("document.querySelector('#status').textContent.includes('ดึงประวัติแล้ว')")
 # Background/history refresh must not close evidence that the operator is reading.
 page.locator('[data-pane=history]').click()
 detail=page.locator('[data-event] details').first
 detail.locator('summary').click()
 with page.expect_response(lambda r:r.url.endswith('/api/mobile/counts/history')):
  page.locator('#syncButton').click()
 assert detail.evaluate('(n)=>n.open')
 page.locator('#nextItemButton').click()
 page.wait_for_timeout(200)
 page.screenshot(path=str(out/'pda-scan-mobile.png'),full_page=True)
 page.locator('#cameraButton').click()
 page.wait_for_function("!document.querySelector('#cameraCapture').disabled")
 assert page.locator('#cameraTorch').inner_text() in ['ไฟฉาย: ปิด','ไฟฉาย: ไม่รองรับ']
 assert page.locator('#cameraResult').is_hidden()
 assert page.locator('#countForm').is_hidden()
 assert page.locator('#cameraCapture').bounding_box()['height']>=48
 assert page.locator('#cameraClose').bounding_box()['height']>=48
 page.wait_for_timeout(200)
 page.screenshot(path=str(out/'pda-camera-mobile.png'),full_page=True)
 page.locator('#cameraClose').click()
 page.locator('#barcode').fill('0001234567890');page.locator('#barcode').press('Enter');page.locator('#countForm').wait_for(state='visible');page.locator('#unitSize').select_option('S')
 assert page.locator('#productIdentity').inner_text().endswith('0001234567890')
 assert page.locator('#unitSize').input_value()=='S'
 assert 'ตัวคูณ' not in page.locator('#unitSize option:checked').inner_text()
 row=page.locator('.pilot-lot').first;row.locator('.lot-quantity').fill('3');row.locator('.lot-code').fill('UX-REVIEW-ONLY');row.locator('.mfg-unknown').check();row.locator('.exp-unknown').check()
 # A missing value in a closed lot must become visible above the sticky action bar.
 row.locator('.lot-quantity').fill('');row.locator('summary').click();page.locator('#countForm button[type=submit]').click()
 q=row.locator('.lot-quantity');assert q.evaluate('(n)=>n===document.activeElement');assert row.evaluate('(n)=>n.open')
 field=q.bounding_box();bar=page.locator('.pilot-submit-bar').bounding_box();assert field['y']+field['height']<=bar['y'] or field['y']>=bar['y']+bar['height'],(field,bar)
 q.fill('3');page.locator('#countForm button[type=submit]').click();assert page.locator('#reviewDialog').evaluate('(n)=>n.open')
 page.screenshot(path=str(out/'pda-review-mobile.png'),full_page=False)
 page.keyboard.press('Escape');assert not page.locator('#reviewDialog').evaluate('(n)=>n.open');assert page.locator('#stepCount').get_attribute('aria-current')=='step'
 assert q.input_value()=='3'
 page.locator('#productName').scroll_into_view_if_needed();page.screenshot(path=str(out/'pda-count-mobile.png'),full_page=True)
 sizes={}
 for width in [360,390,768]:
  page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  sizes[str(width)]={'quantityInput':q.bounding_box()['height'],'reviewButton':page.locator('#countForm button[type=submit]').bounding_box()['height']}
  assert min(sizes[str(width)].values())>=48
 page.locator('#operatorAvatar').click();page.locator('#disconnectButton').click();page.wait_for_function("document.querySelector('[data-pane=count]').disabled");assert page.locator('[data-pane=count]').is_disabled()
 assert writes==[],'Targeted UI/camera check must not save a count'
 assert errors==[],errors
 report={'environment':'cloud-loopback-existing-postgresql-fixture','cameraSource':'Chromium fake camera, not physical Android','loginAndOperatorViews':True,'deliberateAimingNoCountWrite':True,'torchDefaultOffOrUnsupported':True,'cameraTouchControls48px':True,'exactBarcodeAndExplicitUnit':True,'invalidFieldVisibleAboveStickyBar':True,'escapeFromReviewPreservesDraft':True,'logoutDisablesCounting':True,'touchControlSizes':sizes,'noHorizontalOverflow':True,'historyRefreshPreservesExpandedReceipt':True,'countPostRequests':len(writes),'browserErrors':errors,'physicalPhoneVerified':False,'hostedPreviewChanged':False,'productionOrStagingVerified':False}
 (out/'targeted-ui-checks.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
 context.close();browser.close()
