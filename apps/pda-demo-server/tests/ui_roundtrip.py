import json,os,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path(os.environ.get('PDA_EVIDENCE_DIR',tempfile.mkdtemp(prefix='sc-pda-ui-evidence-')));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:4180/',wait_until='networkidle')
 page.locator('#pin').fill('1111');page.locator('#loginForm button[type=submit]').click()
 page.wait_for_function("!document.querySelector('#loginDialog').open")
 page.wait_for_function("document.querySelector('.mode-label').textContent.includes('SHARED API')")
 page.locator('#scanInput').fill('8850000000028');page.locator('#scanInput').press('Enter')
 page.locator('[data-key=code]').fill('UI-LOT-ONE');page.locator('[data-key=quantity]').fill('3')
 page.locator('[data-key=mfg]').fill('2025-01-01');page.locator('[data-key=exp]').fill('2027-01-01')
 page.locator('#completeCount').check();page.locator('#countForm button[type=submit]').click()
 page.locator('#rechecked').check();page.locator('#differenceReason').fill('Synthetic full-branch recount confirmed 3')
 with page.expect_response(lambda r:'/api/demo/count-events' in r.url and r.request.method=='POST') as response:
  page.locator('#differenceForm button[type=submit]').click()
 ack=response.value.json();assert response.value.status==201,ack
 assert ack['status']=='synced',ack
 page.wait_for_function("!document.querySelector('#helpDialog').open")
 page.locator('.bottomnav [data-nav=history]').click();assert 'Receipt' in page.locator('#event-'+ack['eventId']).inner_text()
 page.screenshot(path=str(out/'ui-receipt-mobile.png'),full_page=True)
 ctx2=b.new_context(viewport={'width':390,'height':844});second=ctx2.new_page()
 second.goto('http://127.0.0.1:4180/',wait_until='networkidle')
 second.locator('#pin').fill('3333');second.locator('[data-account="2"]').click();second.locator('#pin').fill('3333');second.locator('#loginForm button[type=submit]').click()
 second.wait_for_function("!document.querySelector('#loginDialog').open")
 second.locator('.bottomnav [data-nav=history]').click();assert second.locator('#event-'+ack['eventId']).is_visible()
 second.screenshot(path=str(out/'another-client-history.png'),full_page=True)
 # A correction is a fresh immutable record containing the corrected absolute total.
 page.locator('[data-correct="'+ack['eventId']+'"]').click();page.locator('#addLot').click()
 page.locator('[data-key=code]').nth(1).fill('UI-LOT-TWO');page.locator('[data-key=quantity]').nth(1).fill('3')
 page.locator('[data-key=mfg]').nth(1).fill('2025-02-01');page.locator('[data-key=exp]').nth(1).fill('2027-02-01')
 page.locator('#correctionReason').fill('Synthetic omitted lot found upstairs')
 page.locator('#countForm button[type=submit]').click();page.locator('#rechecked').check();page.locator('#differenceReason').fill('Recounted all lots; corrected total six')
 with page.expect_response(lambda r:'/api/demo/count-events' in r.url and r.request.method=='POST') as corrected_response:
  page.locator('#differenceForm button[type=submit]').click()
 corrected=corrected_response.value.json();assert corrected['status']=='synced',corrected
 assert corrected['event']['supersedesId']==ack['eventId']
 second.reload(wait_until='networkidle');second.wait_for_function("!document.querySelector('#loginDialog').open")
 second.locator('.bottomnav [data-nav=history]').click()
 assert second.locator('#event-'+ack['eventId']).is_visible() and second.locator('#event-'+corrected['eventId']).is_visible()
 assert 'Synthetic omitted lot found upstairs' in second.locator('#event-'+corrected['eventId']).inner_text()
 # Real network offline + reload: the IDB outbox survives; restore sends once.
 page.wait_for_function("!document.querySelector('#helpDialog').open")
 page.locator('.bottomnav [data-nav=overview]').click();page.locator('[data-count=DEMO-001]').click()
 page.locator('[data-key=code]').fill('UI-OFFLINE');page.locator('[data-key=quantity]').fill('24')
 page.locator('[data-unknown=mfg]').check();page.locator('[data-unknown=exp]').check();page.locator('#completeCount').check()
 ctx.set_offline(True);page.locator('#countForm button[type=submit]').click()
 page.wait_for_function("!document.querySelector('#countDialog').open")
 queued=page.evaluate("JSON.parse(localStorage.getItem('sc-pda-api-v1')).events.filter(e=>e.status==='pending')")
 assert len(queued)==1,queued
 # Reopen page while network is back; original stable ID must be the one accepted.
 ctx.set_offline(False)
 page.reload(wait_until='networkidle');page.wait_for_function("!document.querySelector('#loginDialog').open")
 page.wait_for_function("JSON.parse(localStorage.getItem('sc-pda-api-v1')).events.some(e=>e.id==='"+queued[0]['id']+"'&&e.status==='synced')")
 page.locator('.bottomnav [data-nav=history]').click()
 with page.expect_response(lambda r:'/api/demo/bootstrap' in r.url) as refreshed:
  page.locator('[data-action=sync]').click()
 server=refreshed.value.json();assert len([e for e in server['events'] if e['id']==queued[0]['id']])==1
 assert server['officialStockWrites'] is False
 assert not errors,errors
 evidence={'environment':'isolated-fixture-demo','officialStockWrites':False,'ui_event_id':ack['eventId'],'receipt_id':ack['receiptId'],'correction_event_id':corrected['eventId'],'offline_event_id':queued[0]['id'],'another_client_saw_records':True,'offline_reopen_deduplicated':True,'lot_dates_roundtrip':corrected['event']['lots'],'source_history_count':len(server['sourceHistory']),'browser_errors':errors}
 (out/'ui-roundtrip-evidence.json').write_text(json.dumps(evidence,indent=2))
 print(json.dumps(evidence))
 b.close()
