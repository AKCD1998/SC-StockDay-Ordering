"""Exact R6 APK UI plus shipping JVM against an explicitly marked fixture.
Uses synthetic operator credentials, never live PINs or Android hardware.
"""
import argparse,datetime,hashlib,json,subprocess,threading,urllib.request,zipfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
for key in ['apk','fixture-origin','pg-port','invitation','device-directory','jvm-classes','json-jar','out']:
 p.add_argument('--'+key,required=True)
a=p.parse_args();assert a.fixture_origin.startswith('http://127.0.0.1:') and a.pg_port.isdigit()
out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
pgscript="""
const {Pool}=require('pg');(async()=>{const d=new Pool({host:'127.0.0.1',port:Number(process.argv[1]),user:'scpda_fixture',password:'scpda-fixture-only',database:'scpda_read_fixture',ssl:false});try{
if((await d.query('SELECT marker FROM public.scpda_fixture_marker')).rows[0]?.marker!=='scpda-counts-synthetic-only')throw Error('Wrong fixture');
let result;if(process.argv[2]==='name'){await d.query('UPDATE public.skus SET display_name=$1 WHERE company_code=$2',[process.argv[3],'QA-001']);result={updated:true};}
else if(process.argv[2]==='records'){result={rows:(await d.query("SELECT event_id::text,receipt_id::text,round_no,operator_code,complete_product,evidence->>'quantity' AS quantity FROM ordering.scpda_observations WHERE event_id=ANY($1::uuid[]) ORDER BY round_no",[JSON.parse(process.argv[3])])).rows,stock:(await d.query('SELECT qty_branch_001 FROM ada.branch_stock_snapshots ORDER BY product_code')).rows};}
else result=(await d.query("SELECT display_name FROM public.skus WHERE company_code='QA-001'")).rows[0];console.log(JSON.stringify(result));}finally{await d.end()}})().catch(e=>{console.error(e.message);process.exit(1)});
"""
def pg(op='read',value=''):
 return json.loads(subprocess.check_output(['node','-e',pgscript,a.pg_port,op,value],text=True))
original=pg()['display_name'];errors=[];checks=[]
with zipfile.ZipFile(a.apk) as z:html=z.read('assets/scpda.html');icon=z.read('assets/scpda-icon.png')
java=subprocess.Popen(['java','-cp',a.jvm_classes+':'+a.json_jar,'th.co.scgroup1989.scpda.NativeReadHarness',a.fixture_origin,a.device_directory,a.invitation],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
native='http://127.0.0.1:'+str(json.loads(java.stdout.readline())['port'])
local=urllib.request.build_opener(urllib.request.ProxyHandler({}))
class H(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  data=icon if self.path=='/scpda-icon.png' else html
  self.send_response(200);self.send_header('Content-Type','image/png' if self.path=='/scpda-icon.png' else 'text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  n=int(self.headers.get('Content-Length','0'))
  if self.path!='/invoke' or n>65536:self.send_error(400);return
  reply=local.open(urllib.request.Request(native+'/invoke',self.rfile.read(n),{'Content-Type':'application/json'}),timeout=35).read()
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(reply)
server=ThreadingHTTPServer(('127.0.0.1',0),H);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin='http://127.0.0.1:'+str(server.server_port)
bridge="""window.SCPDAHost={invoke(id,op,raw){fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,body:JSON.parse(raw)})}).then(r=>r.json()).then(v=>window.__scpdaReceive(id,v)).catch(()=>window.__scpdaReceive(id,{ok:false,status:0,error:'Fixture network error'}));}};"""
records="""async()=>new Promise(ok=>{const q=indexedDB.open('scpda-local-counts-001-v1',2);q.onsuccess=()=>{const d=q.result,r=d.transaction('records').objectStore('records').getAll();r.onsuccess=()=>{d.close();ok(r.result)};}})"""
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  def open_count(name):
   pg('name',name);ctx=browser.new_context(viewport={'width':390,'height':844});ctx.add_init_script(bridge);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin)
   page.wait_for_function("!document.querySelector('#loginPane').hidden || !document.querySelector('#activationPane').hidden")
   if page.locator('#activationPane').is_visible():page.locator('#activateDevice').click()
   page.locator('#loginPane').wait_for(state='visible');page.locator('#username').select_option('01001');page.locator('#password').fill('1111');page.locator('#loginButton').click();page.locator('#lookupPane').wait_for(state='visible')
   def lookup():
    page.locator('#barcode').fill('0001234567890');page.locator('#lookupButton').click();page.locator('.scpda-recent-count').first.wait_for();page.locator('.scpda-recent-count').first.click();page.locator('#localCountForm').wait_for()
   lookup();return ctx,page,lookup
  ctx,page,lookup=open_count('เภสัช ยาทดสอบ 500 มก.')
  assert page.locator('#localCategory').input_value()=='pharma' and page.locator('#localCategory').get_attribute('type')=='hidden'
  assert page.locator('.scpda-category-value').inner_text()=='เภสัช';assert page.locator('#localUnit').input_value()=='เม็ด';assert page.locator('.local-unit-label').inner_text()=='เม็ด'
  checks.append('pharma prefix is prefilled without a category dropdown; Ada unit default retained')
  assert page.locator('.scpda-round-hint').inner_text()=='ส่งได้ทีละรอบ'
  stamp=datetime.datetime.now().strftime('%H%M%S');event_ids=[]
  def submit(round_no,qty):
   page.locator('#localRound').select_option(str(round_no));page.locator('#local-lot-0-code').fill('R6-'+stamp+'-R'+str(round_no));page.locator('.local-mfg-unknown').check();page.locator('.local-exp-unknown').check();page.locator('#local-lot-0-qty').fill(str(qty));assert not page.locator('#localComplete').is_checked()
   page.locator('#localCountReviewButton').click();assert page.locator('#localCountReviewSave').inner_text()=='ยืนยันและส่ง';page.locator('#localCountReviewSave').click();page.locator('#localHistoryPane').wait_for(state='visible')
   row=next(r for r in page.evaluate(records) if r['lots'][0]['code']=='R6-'+stamp+'-R'+str(round_no));event_ids.append(row['id'])
   page.wait_for_function("""async id=>new Promise(ok=>{const q=indexedDB.open('scpda-local-counts-001-v1',2);q.onsuccess=()=>{const d=q.result,r=d.transaction('uploads').objectStore('uploads').get(id);r.onsuccess=()=>{d.close();ok(!!r.result?.receipt)};};})""",arg=row['id'])
  page.locator('#local-lot-0-code').fill('R6-DRAFT');page.locator('#local-lot-0-qty').fill('4');page.locator('#localCountBack').click();lookup();assert page.locator('#local-lot-0-code').input_value()=='R6-DRAFT' and page.locator('#local-lot-0-qty').input_value()=='4'
  checks.append('auto category and entered lot/quantity survive draft reopen')
  page.screenshot(path=str(out/'SCPDA-R6-CATEGORY-LOGO.png'),full_page=True)
  for width in [320,390,496]:
   page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  checks.append('category, round hint and form fit 320/390/496px')
  submit(1,2);page.locator('#localHistoryBack').click();lookup();submit(2,3)
  proof=pg('records',json.dumps(event_ids));assert [(r['round_no'],r['quantity'],r['operator_code'],r['complete_product']) for r in proof['rows']]==[(1,'2','01001',False),(2,'3','01001',False)]
  assert [r['qty_branch_001'] for r in proof['stock']]==['6',None,'-2']
  checks.append('same pilot operator submits round1 and round2 independently with durable receipts, no round3 or complete-product prerequisite')
  checks.append('round quantities stay 2 and 3; fixture reference stock stays unchanged')
  page.screenshot(path=str(out/'SCPDA-R6-INDEPENDENT-ROUND-RECEIPTS.png'),full_page=True);ctx.close()
  for name,category in [('สามัญ สำลีทดสอบ','common'),('ปกติ ครีมทดสอบ','normal')]:
   ctx,page,lookup=open_count(name);assert page.locator('#localCategory').input_value()==category and page.locator('#localCategory').get_attribute('type')=='hidden';ctx.close()
  checks.append('common and normal prefixes also render a fixed default category')
  ctx,page,lookup=open_count('สินค้าไม่ระบุหมวด');assert page.locator('#localCategory').evaluate('e=>e.tagName')=='SELECT';page.locator('#localCategory').select_option('common');page.locator('#local-lot-0-qty').fill('9');page.locator('#localCountBack').click();pg('name','เภสัช เปลี่ยนชื่อภายหลัง');lookup();assert page.locator('#localCategory').input_value()=='common' and page.locator('#local-lot-0-qty').input_value()=='9'
  checks.append('unknown prefix allows explicit choice; later name changes preserve an existing draft category/quantity')
  assert not errors,errors;ctx.close();browser.close()
  report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'exact R6 APK assets → shipping host JVM → existing marked loopback HTTP/PostgreSQL fixture','apkSha256':hashlib.sha256(Path(a.apk).read_bytes()).hexdigest(),'entrySha256':hashlib.sha256(html).hexdigest(),'iconSha256':hashlib.sha256(icon).hexdigest(),'checks':checks,'roundEvidence':proof['rows'],'browserErrors':errors,'productionChanged':False,'officialStockWrites':False,'physicalAndroidOrWebViewVerified':False}
  (out/'CATEGORY-ROUND-CHECK.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report,ensure_ascii=False))
finally:
 pg('name',original);server.shutdown();server.server_close();thread.join();java.terminate();java.wait(timeout=10)
