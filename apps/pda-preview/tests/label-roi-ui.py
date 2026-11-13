"""Actual Tesseract ROI inputs and count-form integration; no image upload.

Optional --photo is a local camera-only frame from the user's screen recording.
It is never copied into output artifacts, screenshots, or the hosted Site.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,json,hashlib
p=argparse.ArgumentParser();p.add_argument('--origin',default='http://127.0.0.1:4187');p.add_argument('--photo');p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True);checks=[]
def check(name,value):
 assert value,name
 checks.append(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);errors=[];methods=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:methods.append(r.method));page.goto(a.origin)
 page.evaluate("""async()=>{const {LabelCapture}=await import('./label-capture.mjs?aim=5');const original=LabelCapture.prototype.getWorker;LabelCapture.prototype.getWorker=async function(seq){window.activeCapture=this;return original.call(this,seq)};}""")
 page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('7');page.locator('[data-label-photo]').first.click()
 real=None
 if a.photo:
  with page.expect_file_chooser() as chooser:page.locator('#labelFile').click()
  chooser.value.set_files(a.photo);page.wait_for_function("window.activeCapture&&activeCapture.imageCanvas&&!activeCapture.busy&&activeCapture.ocrDiagnostics",timeout=90000)
  real=page.evaluate("({diagnostics:activeCapture.ocrDiagnostics,fields:activeCapture.boxes.map(b=>({role:b.role,value:b.value,bbox:b.bbox})),w:activeCapture.imageCanvas.width,h:activeCapture.imageCanvas.height})")
  check('recorded-image recognition actually uses yellow-region crops without whole-frame OCR',not real['diagnostics']['fullFrameFallback'] and len(real['diagnostics']['inputs'])>0 and all(i['mode']=='detected-text-crop' and (i['sourceBox']['x1']-i['sourceBox']['x0'])*(i['sourceBox']['y1']-i['sourceBox']['y0'])<real['w']*real['h']*.5 for i in real['diagnostics']['inputs']))
  check('both dates from the supplied recording are extracted at month precision',all(any(f['role']==role and f['value']==value for f in real['fields']) for role,value in [('mfg','2025-10'),('exp','2028-10')]))
  check('three mapped value boxes lie on the printed black label panel',len(real['fields'])==3 and all(380<f['bbox']['x0']<480 and 720<f['bbox']['y0']<960 for f in real['fields']))
  page.locator('#labelToReview').click();check('recorded lot is offered for review with O/0 and I/1 warning',bool(page.locator('#label-review-lot').input_value()) and page.locator('.label-lot-warning').count()==1)
  page.locator('#labelApply').click();check('reviewed dates populate existing draft without changing the employee count',page.locator('#lot-qty-0').input_value()=='7' and page.locator('#lot-mfg-0').input_value()=='2025-10' and page.locator('#lot-exp-0').input_value()=='2028-10')
 else:page.locator('#labelClose').click()
 # Direct component with true OCR on generated, reordered field labels.
 page.evaluate("""async()=>{const {LabelCapture}=await import('./label-capture.mjs?aim=5');window.c=new LabelCapture();c.open({context:'SYNTHETIC REORDERED LABEL',current:{},onApply:p=>window.applied=p});const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1300;const x=canvas.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1000,1300);x.fillStyle='black';x.fillRect(150,340,690,480);x.fillStyle='white';x.font='54px Arial';x.fillText('EXP 2028. 10',210,430);x.fillText('LOT A2601',210,590);x.fillText('MFG 2025. 10',210,750);await c.photo(canvas)}""")
 fields=page.evaluate('c.boxes.map(b=>({role:b.role,value:b.value}))');check('reordered EXP LOT MFG layout is read by printed labels rather than row order: '+json.dumps(fields),all(any(f['role']==r and f['value']==v for f in fields) for r,v in [('exp','2028-10'),('lot','A2601'),('mfg','2025-10')]))
 check('synthetic black-on-white and inverted white-print path uses only detected crops',page.evaluate("c.ocrDiagnostics.inputs.length>0&&!c.ocrDiagnostics.fullFrameFallback"))
 # Missing printed labels must not turn top/bottom dates into MFG/EXP.
 page.evaluate("""async()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1300;const x=canvas.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1000,1300);x.fillStyle='black';x.font='50px Arial';x.fillText('2025. 10',250,430);x.fillText('2028. 10',250,750);await c.photo(canvas)}""")
 check('unlabelled dates remain unassigned instead of guessing their roles',page.evaluate('c.boxes.length===0&&!c.ocrDiagnostics.fullFrameFallback'))
 # Explicit staff choice on an unassigned yellow text row remains available.
 page.evaluate("c.openPicker({x:420,y:730})");page.locator('#labelCapture').last.locator('[data-label-role=exp]').click();page.wait_for_function('!c.busy');check('explicit region assignment can read a date with no printed field label',page.evaluate("c.boxes.some(b=>b.role==='exp'&&b.value==='2028-10'&&b.manual)"))
 page.locator('#labelCapture').last.locator('#labelClose').click();check('X clears source images and ROI diagnostics',page.evaluate('!c.dialog.open&&!c.imageCanvas&&!c.ocrDiagnostics'))
 check('no uncaught browser errors or image/count uploads',not errors and all(m=='GET' for m in methods))
 report={'scope':'cloud Chromium; real local Tesseract; generated varied layouts plus optional recorded camera-only still; no physical-phone claim','passed':len(checks),'checks':checks,'recordedFrame':real,'sourceImageSha256':hashlib.sha256(Path(a.photo).read_bytes()).hexdigest() if a.photo else None,'syntheticReorderedFields':fields,'errors':errors,'imageUploaded':False,'physicalPhoneVerified':False,'backendChanged':False,'installedApkChanged':False}
 (out/'ROI-BROWSER-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True);b.close()
