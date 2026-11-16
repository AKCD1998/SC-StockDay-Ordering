"""Source App Center interaction; synthetic native/installer, real browser storage."""
import argparse,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True);root=Path(__file__).resolve().parents[2]/'pda-preview'
class H(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(root),**kw)
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/scpda-icon.png':
   self.send_response(200);self.send_header('Content-Type','image/png');self.end_headers();self.wfile.write((root.parent/'scpda-android/branding/scpda-icon-source.png').read_bytes());return
  if self.path=='/fixture':
   html=(root/'scpda.html').read_text().replace('<script type="module" src="./scpda-ui.mjs"></script>','');self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  else:super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),H);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':390,'height':844});errors=[];checks=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(10000);page.goto('http://127.0.0.1:'+str(server.server_port)+'/fixture')
  page.evaluate("""async()=>{const {ScpdaAppCenter}=await import('./scpda-app-center.mjs');window.updateOps=[];window.updatePrepared=0;window.updateState={phase:'current',installedVersion:'0.7.0-test.15',installedCode:15,updateAvailable:false,release:{versionName:'0.7.0-test.15',versionCode:15,sizeBytes:3000000,notes:'รุ่นที่ใช้อยู่'}};window.updateOffline=false;window.updateDelay=false;window.ac=new ScpdaAppCenter({prepareInstall:async()=>{await new Promise(ok=>setTimeout(ok,20));updatePrepared++;},request:async op=>{updateOps.push(op);if(updateOffline)throw Error('ไม่มีอินเทอร์เน็ต');if(updateDelay)await new Promise(ok=>window.updateRelease=ok);if(op==='startAppUpdate'){if(!updatePrepared)throw Error('Draft not prepared');updateState={...updateState,phase:'downloading',percent:0};}if(op==='installAppUpdate'){if(!updatePrepared)throw Error('Draft not prepared');updateState={...updateState,phase:'permission',canInstall:false};}return structuredClone(updateState);}});await ac.check();}""")
  assert not page.locator('#scpdaAppCenter').is_visible();page.evaluate('ac.check({manual:true})');page.get_by_text('คุณใช้รุ่นล่าสุดแล้ว',exact=True).wait_for();page.locator('#closeScpdaAppCenter').click();checks.append('current version does not interrupt startup; manual check shows installed/latest version')
  page.evaluate('updateOffline=true;ac.check()');assert not page.locator('#scpdaAppCenter').is_visible();page.evaluate('ac.check({manual:true})');page.get_by_text('ไม่มีอินเทอร์เน็ต',exact=True).wait_for();page.locator('#closeScpdaAppCenter').click();checks.append('offline startup stays usable; manual failure is retryable rather than a login/stock error')
  page.evaluate("updateOffline=false;updateState={...updateState,phase:'available',updateAvailable:true,release:{...updateState.release,versionCode:16,versionName:'0.7.1-test.16',notes:'รุ่นทดสอบจำลอง\\nเพิ่มฟีเจอร์ <script>window.badUpdate=true</script>'}};ac.check()")
  page.locator('#scpdaAppCenter').wait_for(state='visible');assert page.locator('#scpdaAppCenterTitle').inner_text()=='มีอัปเดต SCPDA';assert not page.evaluate('window.badUpdate===true');assert page.locator('#scpdaAppCenterAction').inner_text()=='อัปเดตตอนนี้';checks.append('newer version prompts with escaped release notes and an optional Later action')
  for w in [320,390,496]:
   page.set_viewport_size({'width':w,'height':844});assert page.locator('#scpdaAppCenter').evaluate('d=>d.scrollWidth<=d.clientWidth+1')
  page.set_viewport_size({'width':390,'height':844});page.locator('#scpdaAppCenter').screenshot(path=str(out/'PHONE-UPDATE-AVAILABLE.png'));checks.append('SC update detail fits320/390/496px')
  page.locator('#scpdaAppCenterAction').click();page.get_by_text('กำลังดาวน์โหลด 0%',exact=True).wait_for();assert page.locator('#scpdaAppCenterAction').is_disabled();assert page.evaluate('updateOps.filter(o=>o==="startAppUpdate").length')==1;page.evaluate("updateState={...updateState,phase:'ready',percent:100}");page.get_by_role('button',name='ติดตั้งอัปเดต',exact=True).wait_for();assert not page.evaluate('updateOps.includes("installAppUpdate")');checks.append('draft preparation precedes one download; progress does not claim installation or install without a tap')
  page.locator('#scpdaAppCenterAction').click();page.get_by_text('อนุญาตให้ SCPDA ติดตั้งแอป แล้วกลับมาแตะติดตั้งอัปเดต',exact=True).wait_for();page.evaluate('updateState.canInstall=true');page.get_by_text('อนุญาตแล้ว แตะติดตั้งอัปเดต',exact=True).wait_for();page.locator('#closeScpdaAppCenter').click();checks.append('Android installation permission has an explicit return-and-install step')
  page.evaluate('updateDelay=true;void ac.check({manual:true})');page.get_by_text('กำลังตรวจอัปเดต…',exact=True).wait_for();page.locator('#closeScpdaAppCenter').click();page.evaluate('updateDelay=false;updateRelease()');page.wait_for_timeout(60);assert not page.locator('#scpdaAppCenter').is_visible();checks.append('closing a pending check does not reopen a dismissed dialog')
  assert not errors,errors;(out/'APP-CENTER-UI-CHECK.json').write_text(json.dumps({'status':'PASS','checks':checks,'errors':errors,'scope':'Source browser UI; synthetic native download/Android installer only','physicalAndroidAccepted':False},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':'PASS','checks':len(checks),'errors':errors}));browser.close()
finally:server.shutdown();server.server_close();thread.join()
