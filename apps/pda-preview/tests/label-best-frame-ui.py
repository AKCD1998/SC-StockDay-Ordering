"""Real OCR with a degraded shutter feed; conflict test injects a labelled cached alternative only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,json
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True);checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
fixture=r'''(()=>{window.f={blur:0,offset:0,streams:[],lot:'A2601'};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=1280;c.height=1600;const x=c.getContext('2d'),raw=document.createElement('canvas');raw.width=1280;raw.height=1600;const r=raw.getContext('2d');let tick=0;const draw=()=>{tick++;r.fillStyle='white';r.fillRect(0,0,1280,1600);r.fillStyle='black';r.font='32px Arial';r.fillText('SYNTHETIC SHUTTER STRESS',80,120);r.font='64px Arial';r.fillText('LOT '+f.lot,100+f.offset,500);r.fillText('MFG 03 2026',100+f.offset,800);r.fillText('EXP 02 2028',100+f.offset,1100);x.filter='blur('+f.blur+'px)';x.drawImage(raw,0,0);x.filter='none';};draw();const stream=c.captureStream(15),timer=setInterval(draw,66);for(const t of stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();}}f.streams.push(stream);return stream}})();'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page.add_init_script(fixture);errors=[];methods=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:methods.append(r.method));page.goto('http://127.0.0.1:4187/');page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('7');page.locator('[data-label-photo]').first.click()
 page.wait_for_function("['lot','mfg','exp'].every(r=>document.querySelector('#labelBoxes g[data-role='+r+']'))",timeout=120000)
 check('all three values are genuinely read on the live feed before stress',True)
 # Badges must be outside the data rectangle, not piled above adjacent rows.
 check('field badges sit beside the reading instead of covering it',page.locator('#labelBoxes g[data-role=lot]').evaluate("g=>{const r=g.querySelector('rect'),t=g.querySelector('text');return +t.getAttribute('x')>+r.getAttribute('x') + +r.getAttribute('width') || +t.getAttribute('x')<+r.getAttribute('x')}"))
 page.locator('#labelCapture').screenshot(path=str(out/'SIDE-BADGES-SYNTHETIC.png'))
 page.evaluate('f.blur=3');page.wait_for_timeout(300);page.locator('#labelShoot').click();page.wait_for_function("!document.querySelector('#labelToReview').disabled&&!document.querySelector('#labelBoxActions').hidden",timeout=90000)
 check('shutter finishes and stops camera after short burst',page.evaluate("f.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"))
 status=page.locator('#labelStatus').inner_text();page.locator('#labelToReview').click();values={r:page.locator('#label-review-'+r).input_value() for r in ['lot','mfg','exp']};print(json.dumps({'blurredShutterReview':values,'status':status}),flush=True)
 check('blurred shutter does not erase an already-read lot',values['lot']=='A2601')
 check('all label fields and month precision survive degraded shutter',values=={'lot':'A2601','mfg':'2026-03','exp':'2028-02'})
 page.locator('#labelApply').click();check('applying labels preserves employee quantity',page.locator('#lot-qty-0').input_value()=='7')
 # Isolated class instance exercises a conflicting cache against real fresh OCR.
 page.evaluate("""async()=>{const {LabelCapture}=await import('./label-capture.mjs?aim=4');window.c=new LabelCapture();window.applied=null;c.open({context:'SYNTHETIC CONFLICT TEST',current:{},onApply:p=>window.applied=p});const x=document.createElement('canvas');x.width=1100;x.height=650;const r=x.getContext('2d');r.fillStyle='white';r.fillRect(0,0,1100,650);r.fillStyle='black';r.font='48px Arial';r.fillText('LOT A2601',80,230);r.fillText('MFG 03 2026',80,360);r.fillText('EXP 02 2028',80,490);await c.photo(x,[],{frameId:'synthetic-test',source:'fault-injected-cache-test',usedRecent:true,retained:[{id:'cached-lot',role:'lot',value:'A260I',raw:'A260I',bbox:{x0:180,y0:190,x1:340,y1:240}}]})}""")
 page.locator('#labelCapture').last.locator('#labelToReview').click();dialog=page.locator('#labelCapture').last
 check('different same-image lot readings are explicit unresolved choices',dialog.locator('.label-reading-conflict').count()==1 and dialog.locator('#label-review-lot').input_value()=='' and not dialog.locator('[data-use=lot]').is_checked())
 dialog.locator('[data-use=lot]').check();dialog.locator('#labelApply').click();check('unresolved conflict cannot apply',page.evaluate('window.applied===null'))
 dialog.locator('[data-role=lot][data-value=A2601]').click();dialog.locator('#labelApply').click();check('employee can explicitly resolve lot conflict',page.evaluate("window.applied.lot==='A2601'"))
 # Closing a capture mid-burst must not revive its overlay.
 page.evaluate("c.open({context:'CANCEL TEST',current:{},onApply:()=>{}})");page.wait_for_function("window.c.q('#labelVideo').videoWidth>0");dialog=page.locator('#labelCapture').last;dialog.locator('#labelShoot').click();dialog.locator('#labelClose').click();page.wait_for_timeout(500)
 check('X cancels pending burst and clears image buffers',page.evaluate("!c.dialog.open&&c.recentFrames.length===0&&c.readFrames.length===0&&!c.imageCanvas"))
 check('all camera tracks stop after cancelled capture',page.evaluate("f.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))"))
 check('no browser errors or image/stock uploads',not errors and all(m=='GET' for m in methods))
 report={'scope':'Chromium; real Tesseract; synthetic blurred-shutter stress plus explicit cached-conflict fault injection','passed':len(checks),'checks':checks,'blurredShutterValues':values,'errors':errors,'physicalPhoneVerified':False,'productionBackendOrApkChanged':False}
 (out/'BEST-FRAME-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True);b.close()
