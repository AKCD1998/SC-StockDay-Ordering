"""Replay camera pixels from the reported failure, never mock OCR or insert boxes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,base64,json,time
p=argparse.ArgumentParser();p.add_argument('--frames',required=True);p.add_argument('--output',required=True);p.add_argument('--origin',default='http://127.0.0.1:4187');a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
frames=['data:image/jpeg;base64,'+base64.b64encode(p.read_bytes()).decode() for p in sorted(Path(a.frames).glob('*.jpg'))]
# Human-annotated printed-value rectangles, in the 640x696 camera-only replay.
truth=[(1,[(225,264,320,292),(225,294,318,323),(234,326,326,354)]),(11,[(229,156,320,184),(230,190,319,220),(236,222,327,253)]),(21,[(207,184,302,212),(210,217,304,246),(213,250,307,281)])]
checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':696},is_mobile=True,has_touch=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.origin)
 page.evaluate("""async urls=>{const images=await Promise.all(urls.map(async src=>{const i=new Image();i.src=src;await i.decode();return i}));const c=document.createElement('canvas');c.width=640;c.height=696;const x=c.getContext('2d');window.replay={index:1,images,streams:[],tick:0};navigator.mediaDevices.getUserMedia=async()=>{const draw=()=>{replay.tick++;replay.blank?(x.fillStyle='white',x.fillRect(0,0,640,696)):x.drawImage(images[replay.index],0,0,640,696)};draw();const stream=c.captureStream(8),timer=setInterval(draw,125);for(const t of stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop()}}replay.streams.push(stream);return stream}}""",frames)
 # Force OCR to be unavailable: aiming must still find real image regions.
 page.route('**/vendor/tesseract/tesseract.min.js',lambda route:route.abort())
 page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('7');start=time.monotonic();page.locator('[data-label-photo]').first.click()
 def boxes():return page.evaluate("()=>{const root=document.querySelector('#labelBoxes'),v=root.viewBox.baseVal;return [...root.querySelectorAll('g')].map(g=>{const r=g.querySelector('rect');return {role:g.dataset.role,x0:+r.getAttribute('x')/v.width,y0:+r.getAttribute('y')/v.height,x1:(+r.getAttribute('x') + +r.getAttribute('width'))/v.width,y1:(+r.getAttribute('y') + +r.getAttribute('height'))/v.height}})}")
 def covered(current,rect):
  x0,y0,x1,y1=rect;cx=(x0+x1)/1280;cy=(y0+y1)/1392
  return any(b['x0']-.012<=cx<=b['x1']+.012 and b['y0']-.009<=cy<=b['y1']+.009 and b['x1']-b['x0']<.32 and b['y1']-b['y0']<.10 for b in current)
 observations=[]
 for index,rects in truth:
  page.evaluate('(i)=>replay.index=i',index)
  for attempt in range(40):
   page.wait_for_timeout(100);current=boxes()
   if all(covered(current,r) for r in rects):break
  check('actual recorded frame '+str(index)+' locates all three printed value lines without OCR',all(covered(current,r) for r in rects));observations.append({'frame':index,'candidateCount':len(current),'printedLinesCovered':3})
  if index==1:first_ms=round((time.monotonic()-start)*1000)
 page.evaluate('replay.blank=true');page.wait_for_function("document.querySelectorAll('#labelBoxes g').length===0",timeout=8000);check('blank negative control produces no fabricated aiming boxes',True);page.evaluate('replay.blank=false');page.wait_for_timeout(500)
 check('candidate boxes are unclassified rather than invented LOT/MFG/EXP readings',all(b['role']=='text' for b in boxes()))
 check('no fixed outer guide is presented as detection',not page.locator('#labelAim').is_visible())
 # Save no screenshot of real footage; only numeric coverage evidence.
 page.evaluate('replay.index=11');page.wait_for_timeout(400)
 pt=page.locator('#labelBoxes').evaluate("s=>{const v=s.viewBox.baseVal;const p=new DOMPoint(v.width*274/640,v.height*205/696).matrixTransform(s.getScreenCTM());return {x:p.x,y:p.y}}")
 cdp=page.context.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[pt]});page.wait_for_timeout(650);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach();check('real recorded label supports long-press type choice while OCR is unavailable',page.locator('#labelRolePicker').is_visible());page.locator('[data-label-role=lot]').click();check('manual LOT choice does not fill quantity or submit',page.locator('#labelBoxes g[data-manual=true][data-role=lot]').count()==1 and page.locator('#lot-qty-0').input_value()=='7')
 page.locator('#labelClose').click();check('X stops recorded stream and preserves draft',page.evaluate("replay.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))") and page.locator('#lot-qty-0').input_value()=='7')
 # Now permit the real engine, hold an actual recorded frame, capture and inspect OCR.
 page.unroute('**/vendor/tesseract/tesseract.min.js');page.locator('[data-label-photo]').first.click();page.wait_for_function("document.querySelector('#labelVideo').videoWidth>0");page.locator('#labelShoot').click();page.wait_for_function("!document.querySelector('#labelToReview').disabled && !document.querySelector('#labelBoxActions').hidden",timeout=90000);page.locator('#labelToReview').click();values={r:page.locator('#label-review-'+r).input_value() for r in ['lot','mfg','exp']};print(json.dumps({'actualRecordedFrameOcr':values}),flush=True)
 check('recorded spaced month/year dates preserve printed precision',values['mfg']=='2026-03' and values['exp']=='2028-02')
 check('ambiguous lot characters are surfaced for review',page.locator('.label-lot-warning').is_visible())
 check('no uncaught browser errors',not errors)
 report={'scope':'camera-only pixels from supplied failure recording, replayed locally in Chromium; not a physical-device retest','passed':len(checks),'checks':checks,'firstThreeLineDetectionMs':first_ms,'observations':observations,'ocrValuesBeforeManualReview':values,'errors':errors,'originalVideoUploaded':False,'originalVideoPackaged':False,'physicalPhoneRetested':False}
 (out/'RECORDED-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True);b.close()
