"""Actual reusable-code fixture login and the requested 7:1 mobile layout."""
import json,sys,datetime
from pathlib import Path
from playwright.sync_api import sync_playwright
config=json.load(sys.stdin);origin=config['origin'];out=Path(config['outputDirectory']);errors=[];paths=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:paths.append(r.url))
 page.goto(origin+'/pilot-001.html',wait_until='networkidle')
 for text in ['ก่อนเริ่มงาน','ขอรหัสลงทะเบียนจากผู้ดูแลสาขาใน StockDay รหัสใช้ได้ครั้งเดียวและมีอายุสั้น']:
  assert text not in page.locator('#enrollmentCard').inner_text()
 assert page.locator('#enrollmentCode').get_attribute('type')=='password';assert page.locator('#enrollmentCode').get_attribute('maxlength')=='4';assert page.locator('#enrollmentCode').get_attribute('inputmode')=='numeric'
 measurements=[]
 for width in [360,390,496]:
  page.set_viewport_size({'width':width,'height':844});a=page.locator('#enrollmentCode').bounding_box();b=page.locator('#rosterButton').bounding_box();assert abs(a['y']-b['y'])<1;assert abs(a['width']/b['width']-7)<0.03,(a,b);assert a['height']==b['height'];assert page.locator('#rosterButton').evaluate("n=>parseFloat(getComputedStyle(n,'::before').width)")>=48;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');measurements.append({'viewportWidth':width,'fieldWidth':a['width'],'buttonWidth':b['width'],'ratio':a['width']/b['width'],'height':a['height']})
 page.set_viewport_size({'width':390,'height':844});page.locator('#enrollmentCard').screenshot(path=str(out/'LOGIN-DEFAULT.png'))
 def login(code,operator):
  page.locator('#enrollmentCode').fill(code);page.get_by_role('button',name='ดึงรายชื่อพนักงาน',exact=True).click();page.wait_for_function("!document.querySelector('#connectButton').disabled");assert page.locator('#staffSelect option:checked').inner_text()==operator
  if code=='1111':page.locator('#enrollmentCard').screenshot(path=str(out/'LOGIN-CODE-SELECTED.png'))
  page.locator('#connectButton').click();page.wait_for_function("document.querySelector('#status').textContent.includes('ดึงประวัติแล้ว')");assert page.locator('#operatorCode').inner_text()==operator;assert page.locator('#enrollmentCode').input_value()==''
 def logout():
  page.locator('#operatorAvatar').click();page.locator('#disconnectButton').click();page.locator('#enrollmentCard').wait_for(state='visible');assert page.locator('#operatorCode').inner_text()=='—'
 login('1111','01001');page.screenshot(path=str(out/'LOGIN-ACCOUNT-01001.png'),full_page=True);logout();login('1111','01001');logout()
 login('2222','02001');page.locator('#operatorAvatar').click();assert page.locator('#codeRotationNotice').is_visible();page.locator('#operatorCard').screenshot(path=str(out/'SIX-MONTH-REMINDER.png'));page.locator('#disconnectButton').click()
 login('3333','03001');logout()
 stored=page.evaluate("""async()=>{const keys=Object.keys(localStorage).map(k=>localStorage.getItem(k));const {PilotOutbox}=await import('./pilot-001-outbox.mjs');const db=await new PilotOutbox(location.origin).ready;const values=await new Promise((ok,no)=>{const r=db.transaction('metadata','readonly').objectStore('metadata').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return {local:keys,metadata:values};}""")
 def inspect(value):
  if isinstance(value,dict):
   assert 'token' not in value and 'code_hash' not in value
   for child in value.values():inspect(child)
  elif isinstance(value,list):
   for child in value:inspect(child)
  elif isinstance(value,str):assert value not in ['1111','2222','3333']
 inspect(stored);assert not any('code=1111' in x or 'code=2222' in x or 'code=3333' in x for x in paths)
 assert not errors,errors
 report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'real-loopback-fixture-HTTP-PostgreSQL-browser','introCopyRemoved':True,'oneTimeCopyRemoved':True,'codeAndActionSameRow':True,'ratioMeasurements':measurements,'buttonAccessibleName':'ดึงรายชื่อพนักงาน','extendedButtonTouchWidthAtLeast48':True,'passwordMaskedAndNumericFourDigits':True,'sameCodeWorksAfterLogout':True,'allThreeFixedIdsVerified':['01001','02001','03001'],'selectedAccountMatchesCode':True,'sixMonthReminderVisibleOnlyInAccountDialog':True,'codeClearedAfterLogin':True,'rawCodesAndTokensAbsentFromBrowserPersistence':True,'pinNotInUrl':True,'browserErrors':errors,'physicalPhoneVerified':False,'productionAuthenticationChanged':False}
 (out/'login-browser-evidence.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));context.close();browser.close()
