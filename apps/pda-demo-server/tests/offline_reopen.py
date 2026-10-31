import json,os,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('PDA_EVIDENCE_DIR',tempfile.mkdtemp(prefix='sc-pda-offline-evidence-')));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:4180/',wait_until='networkidle');page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click();page.wait_for_function("!document.querySelector('#loginDialog').open")
 page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller!==null')
 cache_urls=page.evaluate("caches.open('sc-pda-isolated-shell-v1').then(c=>c.keys()).then(keys=>keys.map(r=>new URL(r.url).pathname))")
 assert not any(u.startswith('/api/') for u in cache_urls)
 page.locator('[data-count=DEMO-003]').click();page.locator('[data-key=code]').fill('OFFLINE-COLD-REOPEN');page.locator('[data-key=quantity]').fill('18');page.locator('[data-unknown=mfg]').check();page.locator('[data-unknown=exp]').check();page.locator('#completeCount').check()
 ctx.set_offline(True);page.locator('#countForm button[type=submit]').click();page.wait_for_function("!document.querySelector('#countDialog').open")
 pending=page.evaluate("JSON.parse(localStorage.getItem('sc-pda-api-v1')).events.filter(e=>e.status==='pending')");assert len(pending)==1
 original=pending[0]
 page.reload(wait_until='networkidle');page.wait_for_function("!document.querySelector('#loginDialog').open")
 assert 'OFFLINE' in page.locator('.mode-label').inner_text()
 page.locator('.bottomnav [data-nav=history]').click();assert page.locator('#event-'+original['id']).is_visible()
 after=page.evaluate("JSON.parse(localStorage.getItem('sc-pda-api-v1')).events.find(e=>e.id==='"+original['id']+"')")
 assert after['apiRequest']==original['apiRequest'] and after['status']=='pending'
 page.screenshot(path=str(out/'offline-cold-reopen.png'),full_page=True)
 with page.expect_response(lambda r:'/api/demo/count-events' in r.url and r.request.method=='POST') as received:
  ctx.set_offline(False)
 ack=received.value.json();assert ack['eventId']==original['id'] and ack['status']=='synced',ack
 assert ack['event']['observedAt']==original['observedAt']
 page.wait_for_function("JSON.parse(localStorage.getItem('sc-pda-api-v1')).events.some(e=>e.id==='"+original['id']+"'&&e.status==='synced')")
 # The service worker did not make up a receipt; the real API returned it after reconnect.
 assert not errors,errors
 evidence={'passed':True,'real_offline_cold_reload':True,'api_not_cached':True,'request_bytes_semantically_preserved':True,'capture_time_preserved':True,'receipt_after_reconnect':ack['receiptId'],'event_id':original['id'],'browser_errors':errors,'environment':'isolated-fixture-demo'}
 (out/'offline-reopen-evidence.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence));b.close()
