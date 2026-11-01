import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
config=json.load(sys.stdin)
out=Path(config['outputDirectory'])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(config['origin']+'/stockday/#/branch-stock',wait_until='networkidle')
    page.locator('input[autocomplete=username]').fill('fixture-branch001');page.locator('input[autocomplete=current-password]').fill('fixture-only-password');page.get_by_role('button',name='เข้าสู่ระบบ',exact=True).click()
    page.get_by_role('button',name='ล็อตและประวัตินับ PDA-TEST-001').click()
    page.get_by_role('heading',name='ใบรับและลำดับการแก้ไข').wait_for()
    assert page.get_by_text('อ้างอิงตอนเปิดนับ: 6',exact=False).count()>0
    contrast=page.locator('#sc-count-title').evaluate("""node=>{const rgb=getComputedStyle(node).color.match(/[\\d.]+/g).slice(0,3).map(Number);const l=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return 1.05/(.2126*l[0]+.7152*l[1]+.0722*l[2]+.05)}""")
    assert contrast>=4.5,contrast
    page.screenshot(path=str(out/'stockday-source-summary-desktop.png'),full_page=False)
    page.get_by_role('button',name='ล็อตใกล้หมดอายุ / หมดอายุ',exact=True).click()
    page.get_by_role('heading',name='ล็อตใกล้หมดอายุ / หมดอายุ',exact=True).wait_for()
    page.screenshot(path=str(out/'stockday-expiry-visual-desktop.png'),full_page=False)
    assert errors==[],errors
    report={'environment':'cloud-local-real-stockday-react-fixture','headingContrastOnWhite':contrast,'browserErrors':errors,'countWritesPerformed':False,'productionChanges':False,'fullRoundtripRepeated':False}
    (out/'website-visual.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report));context.close();browser.close()
