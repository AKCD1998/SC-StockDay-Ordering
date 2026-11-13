"""Delayed initialization with real OCR; second pass failure is explicitly injected."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse,json
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
s=Path(__file__).with_name('label-best-frame-ui.py').read_text();fixture=s.split("fixture=r'''",1)[1].split("'''",1)[0]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});page.add_init_script(fixture);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:4187/')
 page.evaluate("""async()=>{const {LabelCapture}=await import('./label-capture.mjs?aim=4');window.c=new LabelCapture();window.applied=null;window.original=c.getWorker.bind(c);c.getWorker=async seq=>{await new Promise(r=>setTimeout(r,800));return original(seq)};c.open({context:'SYNTHETIC DELAY TEST',current:{},onApply:p=>window.applied=p})}""")
 page.wait_for_function("c.q('#labelVideo').videoWidth>0");page.wait_for_timeout(100);page.evaluate("f.lot='B7788'")
 page.wait_for_function("c.readFrames.length>0",timeout=90000)
 snapshot=page.evaluate("({lot:c.readFrames.at(-1).readings.find(b=>b.role==='lot')?.value,roles:c.readFrames.at(-1).readings.map(b=>b.role)})");assert snapshot['lot']=='B7788',snapshot
 checks=['first real OCR frame is sampled after initialization, so changed label is read','live recognition has manufacture, expiry and lot']
 assert all(r in snapshot['roles'] for r in ['lot','mfg','exp'])
 page.evaluate("""async()=>{window.snapshot=c.readFrames.at(-1);c.getWorker=async()=>{throw Error('intentional second-pass failure')};await c.photo(snapshot.canvas,[],{frameId:snapshot.id,source:'test-selected-same-image',usedRecent:true,retained:snapshot.readings})}""")
 assert page.locator('#labelCapture g[data-role=lot]').count()==1;checks.append('second-pass failure leaves the selected image’s known LOT box visible')
 page.locator('#labelCapture #labelToReview').click();values={r:page.locator('#label-review-'+r).input_value() for r in ['lot','mfg','exp']};assert values=={'lot':'B7788','mfg':'2026-03','exp':'2028-02'},values;checks.append('all three same-image readings survive an OCR repeat failure')
 page.locator('#labelApply').click();assert page.evaluate("applied.lot==='B7788'&&applied.labelCapture.imageStored===false&&applied.labelCapture.fields.lot.readingSource==='same-image-live'");checks.append('explicit apply records retained-value provenance without an image')
 page.evaluate("c.getWorker=original;c.open({context:'NEW COUNT SESSION',current:{},onApply:()=>{}})");assert page.evaluate('c.readFrames.length===0&&c.recentFrames.length===0&&!c.captureEvidence');page.evaluate('c.close()');checks.append('opening a new camera/count session clears earlier readings and images')
 assert not errors;checks.append('no uncaught browser errors')
 report={'scope':'Chromium real OCR on generated stream; delayed initialization; intentional second-pass failure','passed':len(checks),'checks':checks,'firstLiveRead':snapshot,'reviewAfterFailure':values,'errors':errors,'physicalPhoneVerified':False,'imageUploaded':False}
 (out/'COLD-RETENTION-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));b.close()
