"""Existing StockDay React app + PDA + real candidate HTTP/PostgreSQL.
All accounts, product-list data and inventory are explicitly synthetic fixtures.
Enrollment is issued by the web UI and redeemed by the PDA UI; tokens are never
copied, persisted in test evidence, or sent to production.
"""
import json
import sys
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

config=json.load(sys.stdin)
out=Path(config['outputDirectory'])
origin=config['origin']
errors=[]
api_status=[]

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    web_context=browser.new_context(viewport={'width':1440,'height':1000})
    web=web_context.new_page()
    web.on('pageerror',lambda error:errors.append(str(error)))
    web.goto(origin+'/stockday/#/branch-stock',wait_until='networkidle')
    web.locator('input[autocomplete=username]').fill('fixture-branch001')
    web.locator('input[autocomplete=current-password]').fill('fixture-only-password')
    web.get_by_role('button',name='เข้าสู่ระบบ',exact=True).click()
    web.get_by_role('heading',name='สต็อกแยกตามสาขา',exact=True).wait_for()
    web.get_by_role('button',name='ล็อตและประวัตินับ PDA-TEST-001').click()
    web.get_by_role('dialog').get_by_role('heading',name='ใบรับและลำดับการแก้ไข').wait_for()

    def enrollment_code():
        web.get_by_role('button',name='ลงทะเบียน PDA สาขา 001',exact=True).click()
        web.locator('.sc-enrollment-code').wait_for()
        code=web.locator('.sc-enrollment-code').inner_text()
        web.get_by_role('button',name='ซ่อนรหัส',exact=True).click()
        return code

    mobile_context=browser.new_context(viewport={'width':390,'height':844})
    mobile=mobile_context.new_page()
    mobile.on('pageerror',lambda error:errors.append(str(error)))
    mobile.on('response',lambda response:api_status.append({'path':__import__('urllib.parse',fromlist=['urlsplit']).urlsplit(response.url).path,'status':response.status}) if '/api/mobile/' in response.url else None)
    mobile.goto(origin+'/pilot-001.html',wait_until='networkidle')

    def connect(code,tab=None,staff='1'):
        tab=tab or mobile
        tab.locator('[data-pane=operator]').click()
        tab.locator('#enrollmentCode').fill(code)
        tab.locator('#rosterButton').click()
        tab.wait_for_function("!document.querySelector('#staffSelect').disabled")
        tab.locator('#staffSelect').select_option(staff)
        tab.locator('#connectButton').click()
        try:
            tab.locator('#scanCard').wait_for(state='visible',timeout=6000)
        except Exception:
            print(json.dumps({'connectStatus':tab.locator('#status').inner_text(),'apiStatuses':api_status[-20:],'browserErrors':errors}),file=sys.stderr)
            raise
        tab.wait_for_function("document.querySelector('#status').textContent.includes('ดึงประวัติแล้ว')")

    def lookup():
        mobile.locator('[data-pane=count]').click()
        mobile.locator('#scanTools').evaluate('(node)=>node.open=true')
        mobile.locator('#barcode').fill('0001234567890')
        with mobile.expect_response(lambda response:'/api/mobile/counts/products/by-barcode/' in response.url) as response:
            mobile.locator('#barcode').press('Enter')
        mobile.locator('#countForm').wait_for(state='visible')
        mobile.locator('#unitSize').select_option('S')
        return response.value.json()

    def save():
        mobile.locator('#countForm button[type=submit]').click()
        with mobile.expect_response(lambda response:response.url.endswith('/api/mobile/counts') and response.request.method=='POST') as received:
            mobile.locator('#reviewSave').click()
        result=received.value.json()
        assert received.value.status==201,result
        mobile.locator('[data-event="'+result['eventId']+'"]').wait_for()
        return result

    def refresh_web():
        with web.expect_response(lambda response:'/api/stock-counts/products/PDA-TEST-001' in response.url) as response:
            web.get_by_role('button',name='รีเฟรชผลนับ',exact=True).click()
        return response.value.json()

    def events(tab=None):
        return (tab or mobile).evaluate("""async origin=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sc-pda-count-pilot-001:'+origin);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return await new Promise((resolve,reject)=>{const r=db.transaction('events','readonly').objectStore('events').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}""",origin)

    connect(enrollment_code())
    mobile.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('pilot-001-worker.js')")
    mobile.screenshot(path=str(out/'pda-scan-mobile.png'),full_page=True)
    product=lookup()
    mobile.locator('#unitSize').select_option('')
    mobile.locator('#countForm button[type=submit]').click()
    assert mobile.locator('#unitSize').evaluate('(node)=>node===document.activeElement')
    assert mobile.locator('#unitSize').get_attribute('aria-invalid')=='true'
    assert not mobile.locator('#reviewDialog').evaluate('(node)=>node.open')
    mobile.locator('#unitSize').select_option('S')
    row=mobile.locator('.pilot-lot').first
    row.locator('.lot-code').fill('INTEGRATED-LOT-ONE')
    row.locator('.lot-quantity').fill('3')
    row.locator('.lot-mfg').fill('2026-01-15')
    row.locator('.lot-exp').fill('2026-10-30')
    # Collapsed invalid lot reopens and receives focus instead of silently failing.
    row.locator('.lot-exp').fill('')
    row.locator('summary').click()
    mobile.locator('#countForm button[type=submit]').click()
    assert row.evaluate('(node)=>node.open')
    assert row.locator('.lot-exp').evaluate('(node)=>node===document.activeElement')
    row.locator('.lot-exp').fill('2026-10-30')
    assert mobile.locator('#totalUnit').inner_text()=='ชิ้น'
    mobile.screenshot(path=str(out/'pda-count-mobile.png'),full_page=True)
    mobile.locator('#countForm button[type=submit]').click()
    mobile.screenshot(path=str(out/'pda-review-mobile.png'),full_page=False)
    mobile.locator('#reviewCancel').click()
    assert row.locator('.lot-quantity').input_value()=='3'
    first=save()
    assert first['event']['complete'] is False
    view=refresh_web()
    web.locator('[data-count-event="'+first['eventId']+'"]').wait_for()
    assert 'Fixture Alice' in web.locator('[data-count-event="'+first['eventId']+'"]').inner_text()
    assert '2026-01-15' in web.locator('[data-count-event="'+first['eventId']+'"]').inner_text()
    assert view['sourceResolution']['human']['eligible'] is False
    assert 'partial-coverage' in view['sourceResolution']['human']['reasons']
    assert view['sourceResolution']['selected']['quantity']==6

    mobile.locator('[data-event="'+first['eventId']+'"] .correct-count').click()
    mobile.locator('#countForm').wait_for(state='visible')
    mobile.locator('#addLotButton').click()
    row=mobile.locator('.pilot-lot').nth(1)
    row.locator('.lot-code').fill('INTEGRATED-SECOND-FLOOR')
    row.locator('.lot-quantity').fill('3')
    row.locator('.mfg-unknown').check()
    row.locator('.lot-exp').fill('2027-01-15')
    mobile.locator('#complete').check()
    mobile.locator('#correctionReason').fill('Found the omitted existing second-floor lot')
    corrected=save()
    assert corrected['event']['correctionOf']==first['eventId']
    assert corrected['event']['observedAt']==first['event']['observedAt']
    assert corrected['correctedAt'] is not None
    view=refresh_web()
    web.locator('[data-count-event="'+corrected['eventId']+'"]').wait_for()
    assert web.locator('[data-count-event="'+first['eventId']+'"]').is_visible()
    web.locator('[data-count-event="'+corrected['eventId']+'"]').get_by_role('button',name='ดูต้นฉบับ '+first['eventId']).click()
    assert view['activeObservations'][0]['event']['quantity']=='6.000'
    assert len(view['activeObservations'][0]['event']['lots'])==2
    web.screenshot(path=str(out/'stockday-lot-history-desktop.png'),full_page=True)
    assert mobile.locator('.pilot-lot[open]').count()==1
    mobile.locator('[data-event="'+corrected['eventId']+'"] details summary').click()
    assert corrected['receiptId'] in mobile.locator('[data-event="'+corrected['eventId']+'"]').inner_text()
    mobile.screenshot(path=str(out/'pda-receipt-mobile.png'),full_page=True)
    mobile.locator('#nextItemButton').click()
    assert mobile.locator('#barcode').evaluate('(node)=>node===document.activeElement')
    for width in [360,390,768]:
        mobile.set_viewport_size({'width':width,'height':844})
        assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
    mobile.set_viewport_size({'width':390,'height':844})

    # A web cold reload restores the ordinary cookie session and reads the same
    # database evidence without any manual count import.
    web.reload(wait_until='networkidle')
    web.get_by_role('button',name='ล็อตและประวัตินับ PDA-TEST-001').click()
    web.locator('[data-count-event="'+corrected['eventId']+'"]').wait_for()
    mobile_product=lookup()
    view=refresh_web()
    assert mobile_product['sourceResolution']['selected']==view['sourceResolution']['selected']

    # Persist an unfinished draft, then cold reopen while genuinely offline.
    row=mobile.locator('.pilot-lot').first
    row.locator('.lot-code').fill('INTEGRATED-OFFLINE')
    row.locator('.lot-quantity').fill('7')
    row.locator('.mfg-unknown').check()
    row.locator('.exp-unknown').check()
    mobile.wait_for_function("""async origin=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sc-pda-count-pilot-001:'+origin);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const read=key=>new Promise(resolve=>{const r=db.transaction('metadata','readonly').objectStore('metadata').get(key);r.onsuccess=()=>resolve(r.result)});const context=await read('context');const draft=await read('draft:'+context.identity.staffId+':'+context.identity.deviceId);return draft?.lots[0]?.quantity==='7'&&draft?.lots[0]?.expUnknown;}""",arg=origin)
    mobile_context.set_offline(True)
    mobile.close()
    mobile=mobile_context.new_page()
    mobile.on('pageerror',lambda error:errors.append(str(error)))
    mobile.on('response',lambda response:api_status.append({'path':__import__('urllib.parse',fromlist=['urlsplit']).urlsplit(response.url).path,'status':response.status}) if '/api/mobile/' in response.url else None)
    mobile.goto(origin+'/pilot-001.html',wait_until='domcontentloaded')
    try:
        mobile.locator('#countForm').wait_for(state='visible',timeout=5000)
    except Exception:
        state=mobile.evaluate("""async origin=>{const db=await new Promise(resolve=>{const r=indexedDB.open('sc-pda-count-pilot-001:'+origin);r.onsuccess=()=>resolve(r.result)});const context=await new Promise(resolve=>{const r=db.transaction('metadata','readonly').objectStore('metadata').get('context');r.onsuccess=()=>resolve(r.result)});return {hasContext:!!context,hasIdentity:!!context?.identity,expiresAt:context?.identity?.expiresAt,explicitLogout:context?.explicitLogout,online:navigator.onLine,now:new Date().toISOString()}}""",origin)
        print(json.dumps({'offlineStatus':mobile.locator('#status').inner_text(),'cacheState':state,'browserErrors':errors}),file=sys.stderr)
        raise
    assert mobile.locator('.lot-quantity').first.input_value()=='7'
    assert mobile.locator('.lot-code').first.input_value()=='INTEGRATED-OFFLINE'
    mobile.locator('#countForm button[type=submit]').click()
    mobile.locator('#reviewSave').click()
    mobile.wait_for_function("!document.querySelector('#reviewDialog').open")
    queued=[item for item in events() if item['status']=='pending']
    assert len(queued)==1
    immutable=queued[0]['original']
    request=json.loads(immutable)
    assert 'Bearer ' not in json.dumps(events())
    mobile.close()
    mobile=mobile_context.new_page()
    mobile.on('pageerror',lambda error:errors.append(str(error)))
    mobile.on('response',lambda response:api_status.append({'path':__import__('urllib.parse',fromlist=['urlsplit']).urlsplit(response.url).path,'status':response.status}) if '/api/mobile/' in response.url else None)
    mobile.goto(origin+'/pilot-001.html',wait_until='domcontentloaded')
    mobile.wait_for_function("document.querySelector('#history').textContent.includes('รอส่ง')")
    assert next(item for item in events() if item['id']==request['id'])['original']==immutable
    mobile.locator('[data-pane=history]').click()
    mobile.screenshot(path=str(out/'pda-offline-reopen-mobile.png'),full_page=True)
    code=enrollment_code()
    mobile_context.set_offline(False)
    with mobile.expect_response(lambda response:response.url.endswith('/api/mobile/counts') and response.request.method=='POST') as received:
        connect(code)
    offline=received.value.json()
    assert received.value.status==201,offline
    assert offline['eventId']==request['id']
    assert offline['event']['observedAt']==request['observedAt']
    assert offline['event']['capturedAt']==request['capturedAt']
    assert next(item for item in events() if item['id']==request['id'])['original']==immutable
    view=refresh_web()
    web.locator('[data-count-event="'+offline['eventId']+'"]').wait_for()
    assert 'INTEGRATED-OFFLINE' in web.locator('[data-count-event="'+offline['eventId']+'"]').inner_text()
    with web.expect_response(lambda response:'/api/stock-counts/expiry?' in response.url) as response:
        web.get_by_role('button',name='ล็อตใกล้หมดอายุ / หมดอายุ',exact=True).click()
    expiry=response.value.json()
    assert expiry['currentLotBalancesVerified'] is False
    assert all(row['event_id']!=first['eventId'] for row in expiry['rows'])
    assert any(row['lot_code']=='INTEGRATED-LOT-ONE' and row['expiry_status']=='expired' for row in expiry['rows'])
    web.screenshot(path=str(out/'stockday-expiry-desktop.png'),full_page=True)
    # Expire only this synthetic enrolled device in the isolated DB. The real
    # enrollment-row middleware must deny the request; the original queue stays.
    lookup()
    row=mobile.locator('.pilot-lot').first
    row.locator('.lot-code').fill('INTEGRATED-SESSION-EXPIRED')
    row.locator('.lot-quantity').fill('8')
    row.locator('.mfg-unknown').check();row.locator('.exp-unknown').check()
    device=mobile.evaluate("localStorage.getItem('sc-pda-001-device-v1')")
    script="""const {Pool}=require(process.argv[1]+'/node_modules/pg');(async()=>{const db=new Pool({host:'127.0.0.1',port:Number(process.argv[2]),user:'pda_fixture',password:'pda-fixture-only',database:'pda_001_fixture',ssl:false});if((await db.query('SELECT current_database() AS name')).rows[0].name!=='pda_001_fixture')throw Error('Wrong DB');await db.query('UPDATE ordering.enrolled_devices SET expires_at=now()-interval \\'1 second\\' WHERE device_id=$1',[process.argv[3]]);await db.end()})().catch(()=>process.exit(1))"""
    subprocess.run(['node','-e',script,config['backendRoot'],str(config['fixturePostgresPort']),device],check=True,stdout=subprocess.DEVNULL)
    mobile.locator('#countForm button[type=submit]').click()
    with mobile.expect_response(lambda response:response.url.endswith('/api/mobile/counts') and response.request.method=='POST') as denied:
        mobile.locator('#reviewSave').click()
    assert denied.value.status==401
    mobile.locator('#enrollmentCard').wait_for(state='visible')
    expired_pending=next(item for item in events() if item['status']=='pending')
    expired_original=expired_pending['original']
    with mobile.expect_response(lambda response:response.url.endswith('/api/mobile/counts') and response.request.method=='POST') as resumed:
        connect(enrollment_code())
    assert resumed.value.status==201
    resumed_receipt=resumed.value.json()
    assert resumed_receipt['eventId']==expired_pending['id']
    assert next(item for item in events() if item['id']==expired_pending['id'])['original']==expired_original

    # Two actual PDA clients open the same revision. One wins; the other keeps
    # its immutable request as conflict, with no fabricated server receipt.
    bob_context=browser.new_context(viewport={'width':390,'height':844})
    bob=bob_context.new_page();bob.goto(origin+'/pilot-001.html',wait_until='networkidle')
    connect(enrollment_code(),bob,'2')
    bob.locator('#barcode').fill('0001234567890');bob.locator('#barcode').press('Enter')
    bob.locator('#countForm').wait_for(state='visible');bob.locator('#unitSize').select_option('S')
    row=bob.locator('.pilot-lot').first;row.locator('.lot-code').fill('INTEGRATED-CONFLICT');row.locator('.lot-quantity').fill('10');row.locator('.mfg-unknown').check();row.locator('.exp-unknown').check()
    lookup();row=mobile.locator('.pilot-lot').first;row.locator('.lot-code').fill('INTEGRATED-NEWER');row.locator('.lot-quantity').fill('9');row.locator('.mfg-unknown').check();row.locator('.exp-unknown').check();newer=save()
    bob.locator('#countForm button[type=submit]').click()
    with bob.expect_response(lambda response:response.url.endswith('/api/mobile/counts') and response.request.method=='POST') as conflict_response:
        bob.locator('#reviewSave').click()
    assert conflict_response.value.status==409
    bob.wait_for_function("document.querySelector('#history').textContent.includes('ข้อมูลชนกัน')")
    conflict=next(item for item in events(bob) if item['status']=='conflict')
    assert conflict['detail']
    bob_context.close()
    # Cold reopen with a saved Alice draft, then authenticate Bob on the same
    # device. The old draft must not appear as Bob's editable count.
    lookup();row=mobile.locator('.pilot-lot').first;row.locator('.lot-code').fill('ACTOR-BOUND-DRAFT');row.locator('.lot-quantity').fill('11');row.locator('.mfg-unknown').check();row.locator('.exp-unknown').check()
    mobile.wait_for_timeout(250)
    mobile.close();mobile=mobile_context.new_page();mobile.goto(origin+'/pilot-001.html',wait_until='networkidle')
    mobile.locator('#countForm').wait_for(state='visible')
    connect(enrollment_code(),staff='2')
    assert mobile.locator('#countForm').is_hidden(),'Alice draft was relabelled as Bob'
    mobile.locator('[data-pane=operator]').click();mobile.locator('#disconnectButton').click();mobile.locator('#enrollmentCard').wait_for(state='visible')
    connect(enrollment_code(),staff='1')
    assert mobile.locator('.lot-code').first.input_value()=='ACTOR-BOUND-DRAFT'
    assert mobile.locator('.lot-quantity').first.input_value()=='11'
    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
    api_cache=mobile.evaluate("async()=>{const names=await caches.keys();const keys=(await Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(request=>request.url)))).flat();return keys.filter(url=>new URL(url).pathname.startsWith('/api/'));}")
    assert api_cache==[]
    assert errors==[],errors
    report={'environment':'cloud-isolated-postgres16-full-stockday-react-and-pda','checkedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'firstEventId':first['eventId'],'firstReceiptId':first['receiptId'],'correctionEventId':corrected['eventId'],'correctionReceiptId':corrected['receiptId'],'offlineEventId':offline['eventId'],'offlineReceiptId':offline['receiptId'],
        'enrollmentThroughExistingWebAndPdaUi':True,'sameDatabaseVisibleFromSeparateWebSession':True,'webReloadReadsDurableRecords':True,'originalAndCorrectionVisible':True,'sharedSourceDecisionMatches':True,'partialCountHeldAsReference':True,
        'draftAndQueueOfflineColdReopen':True,'reauthenticationPreservesOriginalPayload':True,'expiredEnrollmentQueueRecovered':True,'expiredEnrollmentEventId':resumed_receipt['eventId'],'conflictVisibleAndOriginalQueueRetained':True,'conflictEventId':conflict['id'],'draftNotRelabelledAcrossActors':True,'apiResponsesCached':False,'browserErrors':errors,'productionOrStagingVerified':False,'physicalPhoneVerified':False,'officialStockWrites':False,'guidedViewsVerified':True,'invalidCollapsedLotRevealed':True,'reviewCancelPreservesDraft':True,'nextScanFocused':True,'viewportWidthsChecked':[360,390,768]}
    (out/'full-browser-roundtrip.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
    mobile_context.close();web_context.close();browser.close()
