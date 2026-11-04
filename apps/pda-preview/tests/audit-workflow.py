"""Actual existing web/PDA auth and audit API over isolated PostgreSQL.
Fixtures only. The one intercepted response is lost AFTER the real server accepts it.
"""
import json,sys,datetime
from pathlib import Path
from playwright.sync_api import sync_playwright
config=json.load(sys.stdin);origin=config['origin'];out=Path(config['outputDirectory']);errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 wc=browser.new_context(viewport={'width':1440,'height':1000});web=wc.new_page();web.on('pageerror',lambda e:errors.append(str(e)))
 web.goto(origin+'/stockday/#/branch-stock',wait_until='networkidle')
 web.locator('input[autocomplete=username]').fill('fixture-branch001');web.locator('input[autocomplete=current-password]').fill('fixture-only-password')
 web.get_by_role('button',name='เข้าสู่ระบบ',exact=True).click();web.get_by_role('button',name='ล็อตและประวัตินับ PDA-TEST-001').click()
 panel=web.locator('.sc-audit-panel');panel.locator('summary').click();panel.get_by_role('button',name='ดูคำถามและคำตอบ').first.click()
 web.get_by_text('ตรวจสินค้าที่หลังร้านและชั้นบนครบแล้วหรือยัง?',exact=True).first.wait_for()
 web.screenshot(path=str(out/'website-audit-case.png'),full_page=False)
 web.get_by_role('button',name='ลงทะเบียน PDA สาขา 001',exact=True).click();web.locator('.sc-enrollment-code').wait_for();code=web.locator('.sc-enrollment-code').inner_text();web.get_by_role('button',name='ซ่อนรหัส',exact=True).click()
 mc=browser.new_context(viewport={'width':390,'height':844});mobile=mc.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)))
 mobile.goto(origin+'/pilot-001.html',wait_until='networkidle');mobile.locator('#enrollmentCode').fill(code);mobile.locator('#rosterButton').click();mobile.wait_for_function("!document.querySelector('#staffSelect').disabled");mobile.locator('#staffSelect').select_option('1');mobile.locator('#connectButton').click();mobile.wait_for_function("document.querySelector('#status').textContent.includes('ดึงประวัติแล้ว')")
 mobile.locator('[data-pane=history]').click();mobile.locator('#auditInbox summary').click();mobile.locator('#auditLoad').click();mobile.locator('[data-audit-case]').first.wait_for()
 card=mobile.locator('[data-audit-case]').first;case_id=card.get_attribute('data-audit-case');card.locator('.audit-reply').fill('ตรวจหลังร้านและชั้นบนครบแล้ว ยืนยันล็อตที่นับ 6 ชิ้น')
 # Another reviewer changes the case before this reply: retain text and require a new explicit tap.
 panel.locator('#audit-review-form textarea').fill('ขอให้สาขายืนยันผลนับที่แก้ไขล่าสุด');panel.get_by_role('button',name='เปิดตรวจใหม่',exact=True).click();panel.get_by_text('ขอให้สาขายืนยันผลนับที่แก้ไขล่าสุด',exact=True).wait_for()
 card.locator('.audit-send').click();card.get_by_text('ข้อมูลเปลี่ยนแล้ว',exact=False).wait_for();assert card.locator('.audit-reply').input_value().endswith('6 ชิ้น');assert not card.locator('.audit-reply').get_attribute('readonly')
 lost={};request_ids=[]
 def lose_once(route):
  request_ids.append(route.request.post_data_json['requestId']);response=route.fetch();assert response.status in [200,201];lost.update(response.json());route.abort('failed')
 mc.route('**/api/mobile/counts/audit/cases/*/replies',lose_once,times=1)
 card.locator('.audit-send').click();card.get_by_text('ยังไม่ยืนยันการส่ง',exact=False).wait_for();assert card.locator('.audit-reply').input_value().startswith('ตรวจหลังร้าน')
 with mobile.expect_request(lambda r:'/audit/cases/' in r.url and r.url.endswith('/replies')) as retry:
  card.locator('.audit-send').click()
 request_ids.append(retry.value.post_data_json['requestId']);assert request_ids[0]==request_ids[1]
 card.get_by_text('ผู้ตรวจได้รับคำตอบแล้ว',exact=False).wait_for();assert lost['receiptId'] in card.locator('.audit-reply-status').inner_text()
 card.screenshot(path=str(out/'pda-auditor-reply.png'))
 panel.get_by_role('button',name='อัปเดตงานตรวจ',exact=True).click();panel.get_by_role('button',name='ดูคำถามและคำตอบ').first.click();panel.get_by_text('ตรวจหลังร้านและชั้นบนครบแล้ว ยืนยันล็อตที่นับ 6 ชิ้น',exact=True).wait_for()
 panel.locator('#audit-review-form textarea').fill('ทบทวนผลนับแล้ว เตรียมรายการโดยยังไม่ส่งปรับยอดจริง');panel.get_by_role('button',name='สรุปประเด็นตรวจสอบ',exact=True).click()
 panel.get_by_role('button',name='เตรียมรายการปรับยอด Ada',exact=True).click();preview=panel.locator('[aria-label="รายการปรับยอดที่เตรียม"]');preview.wait_for();assert preview.get_by_role('button',name='ส่งเข้า Ada · ยังไม่เปิดใช้งาน').is_disabled()
 preview.screenshot(path=str(out/'ada-adjustment-preview-blocked.png'))
 # A real cold offline app-shell reload must include the newly imported inbox.
 mobile.locator('[data-event] .correct-count').first.click();mobile.locator('#countForm').wait_for(state='visible');mobile.locator('#correctionReason').fill('ทดสอบกู้ร่างเดิมหลังเพิ่มกล่องคำถาม');mobile.wait_for_timeout(250)
 mobile.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('pilot-001-worker.js')");mc.set_offline(True);mobile.reload(wait_until='domcontentloaded');mobile.locator('#countForm').wait_for(state='visible');assert mobile.locator('.lot-quantity').first.input_value()=='3';assert mobile.locator('#correctionReason').input_value()=='ทดสอบกู้ร่างเดิมหลังเพิ่มกล่องคำถาม';assert mobile.locator('#operatorCode').inner_text()=='01001'
 assert mobile.evaluate("async()=>{const keys=await caches.keys();for(const key of keys){const c=await caches.open(key);if((await c.keys()).some(r=>new URL(r.url).pathname.startsWith('/api/')))return false;}return true;}")
 mc.set_offline(False);mobile.locator('#operatorAvatar').click();mobile.locator('#disconnectButton').click();assert mobile.locator('#auditCases').inner_text()==''
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'cloud-local-real-HTTP-PostgreSQL-and-existing-StockDay-PDA','caseId':case_id,'replyEventId':lost['eventId'],'replyReceiptId':lost['receiptId'],'replyLostAfterServerAccept':True,'retryUsedSameRequestId':True,'sameReceiptVisibleOnPhone':True,'staleReplyPreservesTextAndRequiresExplicitResubmit':True,'replyVisibleInSeparateWebsiteSession':True,'adjustmentPreviewShown':True,'adaSendDisabled':True,'actualOfflineColdReopenWithNewInboxModule':True,'originalCountDraftAndAliasPreserved':True,'apiResponsesNotCached':True,'logoutClearsInbox':True,'browserErrors':errors,'officialStockWrites':False,'externalLlmApiUsed':False,'scheduledTaskActivated':False,'productionOrStagingVerified':False,'physicalPhoneVerified':False}
 (out/'browser-audit-roundtrip.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));mc.close();wc.close();browser.close()
