"""Candidate pilot UI acceptance over actual loopback HTTP/PostgreSQL fixtures.
The runner supplies synthetic enrollment codes on stdin; no live credentials.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

config = json.load(sys.stdin)
out = Path(config['outputDirectory'])
out.mkdir(parents=True, exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))

    def connect(tab, code, staff_id):
        tab.locator('#enrollmentCode').fill(code)
        tab.locator('#rosterButton').click()
        try:
            tab.wait_for_function("!document.querySelector('#staffSelect').disabled", timeout=5000)
        except Exception:
            print(json.dumps({'uiStatus': tab.locator('#status').inner_text(), 'browserErrors': errors}), file=sys.stderr)
            raise
        tab.locator('#staffSelect').select_option(staff_id)
        tab.locator('#connectButton').click()
        tab.locator('#scanCard').wait_for(state='visible')
        tab.wait_for_function("document.querySelector('#status').textContent.includes('ดึงประวัติแล้ว')")

    def open_count():
        page.locator('#barcode').fill('0001234567890')
        page.locator('#barcode').press('Enter')
        page.locator('#countForm').wait_for(state='visible')
        page.locator('#unitSize').select_option('S')

    def unknown_dates(row):
        row.locator('.mfg-unknown').check()
        row.locator('.exp-unknown').check()

    def save_count():
        page.locator('#countForm button[type=submit]').click()
        assert 'PDA-TEST-001' in page.locator('#reviewText').inner_text()
        with page.expect_response(lambda response: response.url.endswith('/api/mobile/counts') and response.request.method == 'POST') as received:
            page.locator('#reviewSave').click()
        response = received.value
        body = response.json()
        assert response.status == 201, body
        page.locator('[data-event="' + body['eventId'] + '"]').wait_for()
        return body

    def queued():
        return page.evaluate("""async origin => {
            const db = await new Promise((resolve,reject) => { const r=indexedDB.open('sc-pda-count-pilot-001:'+origin,1); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
            return await new Promise((resolve,reject) => { const r=db.transaction('events','readonly').objectStore('events').getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
        }""", config['origin'])

    page.goto(config['origin'] + '/pilot-001.html', wait_until='networkidle')
    connect(page, config['aliceCode'], '1')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
    open_count()
    assert '6' in page.locator('#stockReference').inner_text()
    row = page.locator('.pilot-lot').first
    row.locator('.lot-code').fill('BROWSER-LOT-ONE')
    row.locator('.lot-quantity').fill('3')
    row.locator('.lot-mfg').fill('2026-01-15')
    row.locator('.lot-exp').fill('2027-01-15')
    page.locator('#complete').check()
    first = save_count()
    assert first['event']['catalogFactor'] is None
    assert first['event']['referenceAtSubmit']['observedAt'] is None
    assert first['officialStockWrites'] is False

    second_context = browser.new_context(viewport={'width': 390, 'height': 844})
    second = second_context.new_page()
    second.goto(config['origin'] + '/pilot-001.html', wait_until='networkidle')
    connect(second, config['bobCode'], '2')
    assert second.locator('[data-event="' + first['eventId'] + '"]').is_visible()
    assert second.locator('[data-event="' + first['eventId'] + '"] .correct-count').count() == 0

    page.locator('[data-event="' + first['eventId'] + '"] .correct-count').click()
    page.locator('#countForm').wait_for(state='visible')
    page.locator('#addLotButton').click()
    row = page.locator('.pilot-lot').nth(1)
    row.locator('.lot-code').fill('BROWSER-SECOND-FLOOR')
    row.locator('.lot-quantity').fill('3')
    unknown_dates(row)
    page.locator('#correctionReason').fill('Found the existing second-floor lot during recheck')
    corrected = save_count()
    assert corrected['event']['correctionOf'] == first['eventId']
    assert corrected['event']['observedAt'] == first['event']['observedAt']
    assert corrected['event']['quantity'] == '6.000'
    assert page.locator('[data-event="' + first['eventId'] + '"]').is_visible()
    page.screenshot(path=str(out / 'pilot-001-correction-mobile.png'), full_page=True)

    open_count()
    row = page.locator('.pilot-lot').first
    row.locator('.lot-code').fill('BROWSER-OFFLINE-REOPEN')
    row.locator('.lot-quantity').fill('7')
    unknown_dates(row)
    context.set_offline(True)
    page.locator('#countForm button[type=submit]').click()
    page.locator('#reviewSave').click()
    page.wait_for_function("!document.querySelector('#reviewDialog').open")
    pending = [event for event in queued() if event['status'] == 'pending']
    assert len(pending) == 1
    original = pending[0]['original']
    original_request = json.loads(original)
    assert 'Bearer ' not in json.dumps(queued())
    # Close while still offline so the old page's online handler cannot upload
    # before this test verifies a new page and new enrollment.
    page.close()
    context.set_offline(False)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(config['origin'] + '/pilot-001.html', wait_until='networkidle')
    assert page.locator('#enrollmentCard').is_visible(), 'Tokens must not persist across reload'
    assert next(event for event in queued() if event['id'] == original_request['id'])['original'] == original
    with page.expect_response(lambda response: response.url.endswith('/api/mobile/counts') and response.request.method == 'POST') as received:
        connect(page, config['aliceReopenCode'], '1')
    reopened = received.value.json()
    assert received.value.status == 201, reopened
    assert reopened['eventId'] == original_request['id']
    assert reopened['event']['observedAt'] == original_request['observedAt']
    assert next(event for event in queued() if event['id'] == original_request['id'])['original'] == original
    assert next(event for event in queued() if event['id'] == original_request['id'])['status'] == 'accepted'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out / 'pilot-001-receipt-mobile.png'), full_page=True)
    assert not errors, errors
    evidence = {
        'environment': 'cloud-isolated-postgres16-browser-fixture',
        'firstEventId': first['eventId'], 'firstReceiptId': first['receiptId'],
        'correctionEventId': corrected['eventId'], 'correctionReceiptId': corrected['receiptId'],
        'offlineRequestEventId': reopened['eventId'], 'offlineReceiptId': reopened['receiptId'],
        'checks': ['branch001 existing enrollment UI', 'explicit unit and Full Sync unknown basis', 'UI-to-HTTP-to-PostgreSQL receipt', 'second enrolled browser client', 'linked correction retains both observations', 'real browser offline queue', 'online page reopen requires enrollment again', 'original request survives IDB reload and sends once', '390px layout without horizontal overflow', 'no browser script errors'],
        'offlineColdShellReopenVerified': False,
        'physicalPhoneVerified': False, 'productionOrStagingVerified': False,
        'officialStockWrites': False, 'browserErrors': errors,
    }
    (out / 'browser-roundtrip.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    print(json.dumps(evidence))
    second_context.close()
    context.close()
    browser.close()
