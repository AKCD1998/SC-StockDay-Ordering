"""Real Tesseract on generated camera-stream frames; no stock/API writes."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,argparse
p=argparse.ArgumentParser();p.add_argument('--origin',default='http://127.0.0.1:4187');p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
fixture=r'''(()=>{
 const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__labelFixture={streams:[],ticks:0,blank:false,offset:0,requests:0};
 navigator.mediaDevices.getUserMedia=async options=>{
  const f=window.__labelFixture;f.requests++;if(options.video?.height?.ideal!==1600)return original(options);
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1600;const c=canvas.getContext('2d');
  const draw=()=>{f.ticks++;c.fillStyle='white';c.fillRect(0,0,1280,1600);c.fillStyle='black';c.font='34px Arial';c.fillText('SYNTHETIC CAMERA STREAM',100,130);if(!f.blank){c.font='64px Arial';c.fillText('LOT A2601',100+f.offset,500);c.fillText('MFG 01/2026',100+f.offset,800);c.fillText('EXP 01/2028',100+f.offset,1100);}c.fillStyle='#b6c4d4';c.fillRect(1150,Math.floor(f.ticks%80)*2,10,12);};draw();
  const stream=canvas.captureStream(10),timer=setInterval(draw,100);for(const t of stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};}f.streams.push(stream);return stream;
 };
})();'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page.add_init_script(fixture)
 errors=[];network=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:network.append({'method':r.method,'url':r.url.split('?')[0]}))
 page.goto(a.origin);page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('7');page.locator('#lot-code-0').fill('KEEP');page.locator('[data-label-photo]').first.click();page.wait_for_function("document.querySelector('#labelVideo').videoWidth>0")
 page.wait_for_function("document.querySelectorAll('#labelBoxes g[data-role]').length===3",timeout=120000)
 check('real OCR produces automatic boxes before shutter is pressed',page.locator('#labelVideo').is_visible() and not page.locator('#labelImage').is_visible() and page.locator('#labelCameraActions').is_visible())
 check('three live fields have distinct roles and visible rectangles',sorted(page.locator('#labelBoxes g').evaluate_all('gs=>gs.map(g=>g.dataset.role)'))==['exp','lot','mfg'] and page.locator('#labelBoxes g rect').first.bounding_box()['width']>30)
 page.locator('#labelCapture').screenshot(path=str(out/'LIVE-AUTOMATIC-SYNTHETIC.png'))
 def at(x,y):
  return page.locator('#labelBoxes').evaluate('(s,p)=>{const v=s.viewBox.baseVal;const d=new DOMPoint(v.width*p[0],v.height*p[1]).matrixTransform(s.getScreenCTM());return {x:d.x,y:d.y}}',[x,y])
 def hold(x,y):
  pt=at(x,y);cdp=page.context.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':pt['x'],'y':pt['y']}]});page.wait_for_timeout(650);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach()
 # Nothing detected: hold arbitrary region while camera is still live.
 page.evaluate('window.__labelFixture.blank=true')
 page.wait_for_function("document.querySelectorAll('#labelBoxes g[data-role]').length===0",timeout=15000)
 check('camera movement/change clears stale automatic boxes',True)
 hold(.5,.4);page.wait_for_selector('#labelRolePicker:not([hidden])')
 ticks=page.evaluate('window.__labelFixture.ticks');video_time=page.locator('#labelVideo').evaluate('(v)=>v.currentTime');page.wait_for_timeout(300)
 check('long press opens explicit LOT/MFG/EXP choice without freezing video',page.evaluate('window.__labelFixture.ticks')>ticks and page.locator('#labelVideo').evaluate('(v)=>!v.paused&&v.currentTime')>video_time and page.locator('#labelVideo').is_visible() and page.locator('[data-label-role]').count()==3)
 page.locator('#labelCapture').screenshot(path=str(out/'LIVE-HOLD-MENU-SYNTHETIC.png'))
 page.locator('[data-label-role=exp]').click()
 check('expiry is chosen directly instead of colour cycling',page.locator('#labelBoxes g[data-manual=true][data-role=exp]').count()==1 and not page.locator('#labelRolePicker').is_visible())
 # A normal tap on blank space does not create a region or change a field.
 pt=at(.88,.15);page.touchscreen.tap(pt['x'],pt['y']);check('short empty-space tap does not accidentally create a box',not page.locator('#labelRolePicker').is_visible() and page.locator('#labelBoxes g[data-manual=true]').count()==1)
 # Hold existing manual box, change to manufacture in one explicit selection.
 hold(.5,.4);page.locator('[data-label-role=mfg]').click();check('existing box can be explicitly reclassified',page.locator('#labelBoxes g[data-manual=true][data-role=mfg]').count()==1 and page.locator('#labelBoxes g[data-manual=true][data-role=exp]').count()==0)
 hold(.5,.4);page.locator('#labelDeleteRegion').click();check('manual region can be removed',page.locator('#labelBoxes g[data-manual=true]').count()==0)
 # Cancel choice leaves no pending rectangle.
 hold(.65,.53);page.locator('#labelCancelRole').click();check('cancel dismisses the pending region without taking a photo',page.locator('#labelBoxes g[data-role=pending]').count()==0 and page.locator('#labelVideo').is_visible())
 # Restore a readable scene and explicitly label LOT in live aiming.
 page.evaluate('window.__labelFixture.blank=false')
 page.wait_for_function("document.querySelectorAll('#labelBoxes g[data-role=lot]').length===1",timeout=120000)
 lot=page.locator('#labelBoxes g[data-role=lot]').evaluate('(g)=>{const r=g.querySelector(\'rect\').getBBox(),s=g.ownerSVGElement.viewBox.baseVal;return [(r.x+r.width/2)/s.width,(r.y+r.height/2)/s.height]}')
 hold(*lot);page.locator('[data-label-role=lot]').click();check('manual choice is made on the live camera before capture',page.locator('#labelVideo').is_visible() and page.locator('#labelBoxes g[data-manual=true][data-role=lot]').count()==1)
 page.locator('#labelShoot').click();page.wait_for_function("!document.querySelector('#labelToReview').disabled && !document.querySelector('#labelBoxActions').hidden",timeout=120000)
 check('capture stops the camera stream and carries only region hints',page.evaluate("window.__labelFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))") and page.locator('#labelImage').is_visible() and page.locator('#labelBoxes g[data-manual=true][data-role=lot]').count()==1)
 page.locator('#labelToReview').click();values={r:page.locator('#label-review-'+r).input_value() for r in ['lot','mfg','exp']}
 check('captured image is OCRed again for review with month precision intact',values=={'lot':'A2601','mfg':'2026-01','exp':'2028-01'})
 check('live OCR and shutter do not silently change the count form',page.locator('#lot-code-0').input_value()=='KEEP' and page.locator('#lot-qty-0').input_value()=='7')
 page.locator('[data-use=lot]').check();page.locator('#labelApply').click();check('only explicit review applies label values and preserves quantity',page.locator('#lot-code-0').input_value()=='A2601' and page.locator('#lot-qty-0').input_value()=='7')
 # X from aiming with menu open returns safely; late OCR must not reopen it.
 page.locator('[data-label-photo]').first.click();page.wait_for_function("document.querySelector('#labelVideo').videoWidth>0");hold(.6,.4);page.locator('#labelClose').click();page.wait_for_timeout(1200)
 check('X works with choice menu open and leaves no camera or late overlay',not page.locator('#labelCapture').is_visible() and page.evaluate("window.__labelFixture.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))") and page.locator('#lot-qty-0').input_value()=='7')
 check('no uncaught browser errors',not errors);check('no photo or count upload',all(r['method']=='GET' for r in network))
 report={'scope':'cloud Chromium; real Tesseract, generated live camera stream; existing static preview','passed':len(checks),'checks':checks,'capturedValues':values,'errors':errors,'physicalPhoneVerified':False,'productionBackendChanged':False,'installedApkChanged':False,'cameraFixture':'synthetic generated frames, OCR engine is not mocked','photoUploaded':False}
 (out/'LIVE-BROWSER-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True);b.close()
