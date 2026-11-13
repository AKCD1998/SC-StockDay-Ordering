from pathlib import Path
from playwright.sync_api import sync_playwright
import json,argparse
p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
s=Path(__file__).with_name('label-live-ui.py').read_text();fixture=s.split("fixture=r'''",1)[1].split("'''",1)[0]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page.add_init_script(fixture)
 page.add_init_script("""(()=>{const W=window.Worker;window.Worker=class extends W{constructor(url,opts){super(url,opts);this.delay=String(url).includes('label-vision-worker')?350:0;}set onmessage(fn){super.onmessage=e=>setTimeout(()=>fn(e),this.delay||0)}}})()""")
 page.goto('http://127.0.0.1:4187/');page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.locator('[data-action=sample]').first.click();page.locator('#lot-qty-0').fill('7');page.locator('[data-label-photo]').first.click();page.wait_for_function("document.querySelector('#labelVideo').videoWidth>0")
 pt=page.locator('#labelBoxes').evaluate("s=>{const v=s.viewBox.baseVal,p=new DOMPoint(v.width*.6,v.height*.4).matrixTransform(s.getScreenCTM());return {x:p.x,y:p.y,width:v.width}}")
 assert pt['width']>700
 cdp=page.context.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':pt['x'],'y':pt['y']}]});page.wait_for_timeout(650);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach();assert page.locator('#labelRolePicker').is_visible()
 point=page.locator('#labelBoxes g[data-role=pending] rect').first.evaluate("r=>{const v=r.ownerSVGElement.viewBox.baseVal;return {x:(+r.getAttribute('x') + +r.getAttribute('width')/2)/v.width,y:(+r.getAttribute('y') + +r.getAttribute('height')/2)/v.height,width:v.width}}")
 assert point['width']<700 and abs(point['x']-.6)<.025 and abs(point['y']-.4)<.025,point
 page.locator('#labelClose').click();assert page.locator('#lot-qty-0').input_value()=='7'
 report={'passed':3,'checks':['hold starts before first vision frame','selected region stays under finger when analysis resolution changes','X preserves quantity'],'beforeWidth':pt['width'],'afterWidth':point['width'],'selectedNormalizedPoint':point,'scope':'Chromium synthetic stream, real vision worker with delayed message; no physical phone claim'}
 (out/'EARLY-HOLD-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));b.close()
