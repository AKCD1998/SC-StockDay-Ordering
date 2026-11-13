"""Browser acceptance; optional --photo stays local and is never bundled or uploaded."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse,json
p=argparse.ArgumentParser();p.add_argument('--origin',default='http://127.0.0.1:4187');p.add_argument('--photo');p.add_argument('--output',required=True);args=p.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 page=b.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append({'method':r.method,'url':r.url.split('?')[0]}))
 page.add_init_script("""(()=>{window.__streams=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...a)=>{const s=await get(...a);window.__streams.push(s);return s;};})()""")
 page.goto(args.origin);page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('7');page.locator('#lot-code-0').fill('KEEP')
 page.locator('[data-label-photo]').first.click();page.wait_for_function("document.querySelector('#labelVideo').videoWidth>0")
 label_height=page.locator('#labelStage').bounding_box()['height']
 page.locator('#labelClose').click();page.wait_for_function("window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))")
 check('X closes label camera, stops tracks and preserves draft quantity and lot',page.locator('#lot-qty-0').input_value()=='7' and page.locator('#lot-code-0').input_value()=='KEEP')
 def wait_read():page.wait_for_function("!document.querySelector('#labelToReview').disabled && !document.querySelector('#labelBoxActions').hidden",timeout=120000)
 def tap(x,y):
  pt=page.locator('#labelBoxes').evaluate('(s,p)=>{const d=new DOMPoint(p[0],p[1]).matrixTransform(s.getScreenCTM());return {x:d.x,y:d.y}}',[x,y])
  page.touchscreen.tap(pt['x'],pt['y']);wait_read()
 if args.photo:
  page.locator('[data-label-photo]').first.click()
  with page.expect_file_chooser() as fc:page.locator('#labelFile').click()
  fc.value.set_files(args.photo);wait_read()
  check('provided busy-background photo honestly requires guidance',page.locator('#labelBoxes g').count()==0)
  page.locator('#labelGuide').click();tap(420,540)
  check('guided box starts green LOT',page.locator('#labelBoxes g text').last.text_content()=='LOT')
  tap(420,540);check('same rectangle cycles to red MFG',page.locator('#labelBoxes g text').last.text_content()=='MFG' and page.locator('#labelBoxes g rect').nth(1).get_attribute('stroke')=='#bd283d')
  tap(420,540);check('same rectangle cycles to blue EXP',page.locator('#labelBoxes g text').last.text_content()=='EXP' and page.locator('#labelBoxes g rect').nth(1).get_attribute('stroke')=='#2457d6')
  tap(420,588);tap(650,569);tap(650,569)
  page.locator('#labelToReview').click()
  values={r:page.locator('#label-review-'+r).input_value() for r in ['lot','mfg','exp']}
  print(json.dumps({'providedPhotoRead':values}),flush=True)
  check('touch-guided OCR reads supplied lot and expiry, leaving unclear manufacture unconfirmed',values['lot']=='202308' and values['exp']=='2026-02' and values['mfg'] in ['', '2023-02'])
  manual=[]
  if values['mfg']!='2023-02':
   manual.append('mfg')
   box=page.locator('#label-review-mfg').locator('..');box.locator('.label-date-precision').select_option('month');box.locator('.label-date-month').select_option('2');box.locator('.label-date-year').fill('2023')
  check('employee can correct uncertain month-only manufacture before applying',page.locator('#label-review-mfg').input_value()=='2023-02')
  check('existing manual lot is not silently selected for replacement',not page.locator('[data-use=lot]').is_checked())
  check('OCR does not apply before employee confirmation',page.locator('#lot-code-0').input_value()=='KEEP')
  page.locator('[data-use=lot]').check();page.locator('#labelApply').click()
  check('confirmed OCR fills selected label fields and preserves quantity',page.locator('#lot-code-0').input_value()=='202308' and page.locator('#lot-qty-0').input_value()=='7' and page.locator('#lot-exp-0').input_value()=='2026-02')
 else:values={'status':'not-run-without-photo'};manual=[]
 for width in [360,390,430]:
  page.set_viewport_size({'width':width,'height':844})
  check('date controls stay within phone at '+str(width),page.locator('[data-date-field]').evaluate_all('els=>els.every(e=>e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().right<=innerWidth)'))
 page.set_viewport_size({'width':390,'height':844});page.locator('.lot-card').screenshot(path=str(out/'DATE-FIELDS.png'))
 page.locator('#countForm button[type=submit]').click()
 check('absolute count saves without treating label weight as quantity',not page.locator('#countDialog').is_visible())
 rows=page.evaluate("JSON.parse(localStorage.getItem('sc-pda-preview-v1')).events")
 saved=rows[-1];check('saved observation keeps counted quantity',saved['quantity']==7)
 if args.photo:
  check('month precision and confirmed extraction evidence survive save',saved['lots'][0]['mfg']=='2023-02' and saved['lots'][0]['exp']=='2026-02' and saved['lots'][0]['labelCapture']['imageStored']==False)
 page.reload();page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click()
 check('accepted local observation survives reload',page.evaluate("JSON.parse(localStorage.getItem('sc-pda-preview-v1')).events.at(-1).quantity")==7)
 # Exercise automatic boxes on a separate, clearly synthetic sharp label.
 page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('2');page.locator('[data-label-photo]').first.click()
 raw=page.evaluate("""()=>{const c=document.createElement('canvas');c.width=1100;c.height=650;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='32px Arial';x.fillText('SYNTHETIC TEST LABEL',80,90);x.font='48px Arial';x.fillText('LOT A2601',80,230);x.fillText('MFG 01/2026',80,360);x.fillText('EXP 01/2028',80,490);return c.toDataURL('image/png').split(',')[1]}""")
 import base64
 with page.expect_file_chooser() as fc:page.locator('#labelFile').click()
 fc.value.set_files({'name':'synthetic-label.png','mimeType':'image/png','buffer':base64.b64decode(raw)})
 wait_read();check('automatic OCR overlay is actually visible and aligned',page.locator('#labelBoxes').is_visible() and page.locator('#labelBoxes g rect').first.bounding_box()['width']>25);check('sharp synthetic label gets three real automatic OCR rectangles',page.locator('#labelBoxes g').count()==3)
 page.locator('#labelCapture').screenshot(path=str(out/'AUTOMATIC-BOXES-SYNTHETIC.png'))
 page.locator('#labelToReview').click();synthetic={r:page.locator('#label-review-'+r).input_value() for r in ['lot','mfg','exp']}
 check('automatic synthetic OCR preserves date precision',synthetic=={'lot':'A2601','mfg':'2026-01','exp':'2028-01'})
 page.locator('#labelClose').click();check('X also discards unapplied OCR suggestions',page.locator('#lot-code-0').input_value()=='')
 # Blank label fields are normal; an explicit count remains mandatory.
 page.locator('#countForm button[type=submit]').click();check('absent lot and dates do not block a counted quantity',not page.locator('#countDialog').is_visible())
 page.locator('[data-action=camera]').first.click();page.wait_for_function("document.querySelector('#cameraVideo').videoWidth>0")
 barcode_height=page.locator('#cameraView').bounding_box()['height'];check('label viewport is larger than barcode viewport',label_height>barcode_height*1.5)
 page.locator('#cameraClose').click();check('barcode camera still closes and stops tracks',page.evaluate("window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"))
 page.locator('[data-action=sample]').first.click();page.locator('#countForm button[type=submit]').click();check('missing quantity is not silently counted as zero',page.locator('#countDialog').is_visible() and bool(page.locator('#countError').inner_text()))
 page.locator('[data-label-photo]').first.click();page.locator('#labelClose').click();page.wait_for_timeout(500)
 check('fast camera close does not leave a late stream alive',page.evaluate("window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"))
 check('no uncaught browser errors',not errors)
 check('no photo or count network upload in this preview',all(r['method']=='GET' for r in requests))
 ocr_network=[r for r in requests if '/tesseract/' in r['url']];check('OCR assets are self hosted',bool(ocr_network) and all(r['url'].startswith(args.origin) for r in ocr_network))
 report={'scope':'existing-site-static-preview-only','checks':checks,'passed':len(checks),'providedPhotoBeforeReview':values,'employeeEnteredFields':manual,'synthetic':synthetic,'cameraHeights':{'label':label_height,'barcode':barcode_height},'uncaughtErrors':errors,'photoUploaded':False,'backendOrAPKChanged':False,'physicalPhoneVerified':False,'ocrRequests':ocr_network}
 (out/'BROWSER-RESULTS.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print(json.dumps(report,ensure_ascii=False),flush=True)
 b.close()
