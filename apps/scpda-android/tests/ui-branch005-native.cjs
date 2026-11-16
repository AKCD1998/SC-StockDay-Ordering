'use strict';
// Exact APK → shipping JVM session → actual isolated read/auth HTTP → PostgreSQL.
// Software QA device proof, not Android Keystore or production enrollment.
const fs=require('fs'),path=require('path'),http=require('http'),{spawn,execFileSync}=require('child_process'),{once}=require('events'),{chromium}=require('playwright');
const [apk,out,fixture,folder,classes,jsonJar,web]=process.argv.slice(2);
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture||'')||!out||!classes||!jsonJar)throw Error('Explicit isolated fixture arguments required');
fs.mkdirSync(out,{recursive:true});
const asset=name=>execFileSync('python',['-c','import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',apk,name],{maxBuffer:16*1024*1024});
const html=asset('assets/scpda.html'),icon=asset('assets/scpda-icon.png');
(async()=>{
 const java=spawn('java',['-cp',classes+':'+jsonJar,'th.co.scgroup1989.scpda.NativeReadHarness',fixture,path.join(folder,'java-device-005'),path.join(folder,'java-invitation-005.json')],{stdio:['ignore','pipe','pipe']});
 let first='';for await(const chunk of java.stdout){first+=chunk;if(first.includes('\n'))break;}
 const nativeOrigin='http://127.0.0.1:'+JSON.parse(first.split('\n')[0]).port;
 const invoke=async(op,body={})=>(await fetch(nativeOrigin+'/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,body})})).json();
 const server=http.createServer(async(q,s)=>{try{
  if(q.url==='/invoke'){let data='';for await(const chunk of q)data+=chunk;const reply=await fetch(nativeOrigin+'/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:data});s.setHeader('Content-Type','application/json');s.end(await reply.text());}
  else{s.setHeader('Content-Type',q.url==='/scpda-icon.png'?'image/png':'text/html; charset=utf-8');s.end(q.url==='/scpda-icon.png'?icon:html);}
 }catch{s.statusCode=500;s.end('{}');}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),checks=[],errors=[];
 const assert=(v,m)=>{if(!v)throw Error(m)};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{window.SCPDAHost={invoke(id,op,raw){fetch('/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,body:JSON.parse(raw)})}).then(r=>r.json()).then(reply=>window.__scpdaReceive(id,reply));}};});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#activationPane').waitFor({state:'visible'});await page.locator('#activateDevice').click();await page.locator('#loginPane').waitFor({state:'visible'});
  assert(await page.locator('#username').inputValue()==='01005','005 user not automatically selected');assert(await page.locator('#username option[value="01001"]').isDisabled(),'Foreign001 identity selectable');checks.push('new005 invitation pairs a005-only software device and selects01005');
  assert(await page.locator('#password').getAttribute('maxlength')==='64','Password still truncated');assert(await page.locator('#password').getAttribute('inputmode')==='text','Letters unavailable');assert(await page.locator('label[for=password]').innerText()==='รหัสผ่าน','Numeric PIN copy retained');checks.push('exact APK exposes a text-capable 64-character password field');
  await page.locator('#password').fill('wrongRead9!');await page.locator('#loginButton').click();await page.waitForFunction(()=>!document.querySelector('#loginButton').disabled);assert((await page.locator('#status').innerText()).includes('ไม่ถูกต้อง'),'Wrong password not rejected');assert(await page.locator('#password').inputValue()==='','Wrong password retained');
  await page.locator('#password').fill('fixture005password');assert(await page.locator('#password').inputValue()==='fixture005password','Password truncated before Java');await page.locator('#loginButton').click();await page.locator('#mainTabs').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#loginButton').disabled);assert(await page.locator('#password').inputValue()==='','Successful password retained');checks.push('full alphanumeric password reaches shipping Java and actual bcrypt/device-proof login; wrong password is rejected and field cleared');
  await page.locator('[data-app-tab=price]').click();await page.locator('#barcode').fill('0001234567890');await page.locator('#lookupButton').click();await page.locator('#pricePane').waitFor({state:'visible'});assert((await page.locator('#pricePane').innerText()).includes('QA-001'),'Real fixture product missing');assert(await page.locator('.scpda-price-stock>strong').innerText()==='11','Real SQL stock missing');checks.push('authenticated reader still opens existing price and branch005 stock through real HTTP/PostgreSQL');
  await page.locator('[data-app-tab=count]').click();await page.locator('.scpda-recent-count').first().click();await page.locator('#localCountPane').waitFor({state:'visible'});
  assert(await page.locator('#localUnit').inputValue()==='เม็ด','005 unit default missing');await page.locator('#localCategory').selectOption('pharma');
  await page.locator('#local-lot-0-code').fill('R12-JVM005');await page.locator('#local-lot-0-mfg').fill('2026-10-01');await page.locator('#local-lot-0-exp').fill('2027-01-01');await page.locator('#local-lot-0-qty').fill('3');
  await page.locator('#localCountReviewButton').click();assert(await page.locator('#localCountReviewSave').innerText()==='ยืนยันและส่ง','005 count access missing');await page.locator('#localCountReviewSave').click();
  await page.waitForFunction(()=>document.querySelector('#localHistoryPane').textContent.includes('Receipt '));
  const history=await invoke('countHistory');assert(history.ok,'005 history unavailable');const record=history.data.records.find(r=>r.event.lots.some(l=>l.code==='R12-JVM005'));
  assert(record?.branchCode==='005'&&record.event.operatorCode==='01005'&&record.event.quantity==='3','Native receipt branch/actor/quantity wrong');assert(record.event.referenceAtSubmit.quantity===11,'005 count used001 stock');assert(record.event.lots[0].manufacturedOn==='2026-10-01'&&record.event.lots[0].expiresOn==='2027-01-01','Label dates lost');checks.push('exact APK count form → shipping JVM → actual HTTP/Postgres stores005 quantity and dates with durable receipt');
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(web||''),'Explicit loopback web required');
  const admin=await browser.newContext({viewport:{width:1440,height:1000}});const auth=await admin.request.post(fixture+'/admin/auth/login',{data:{username:'fixture-admin',password:'fixture-admin-only-password'}});assert(auth.status()===200,'Admin login failed');
  const ap=await admin.newPage();ap.on('pageerror',e=>errors.push(e.message));await ap.goto(web+'/#/stock-check');await ap.getByRole('combobox',{name:'สาขาผลนับ PDA'}).selectOption('005');
  await ap.waitForFunction(()=>document.querySelector('.stock-check-table tbody')?.textContent.includes('3'));const actual=await(await admin.request.get(fixture+'/api/stock-check?branchCode=005')).json();assert(actual.records[0].latestCount.receiptId===record.receiptId,'Web does not show same phone receipt');
  await ap.locator('.stock-check-table tbody>tr').first().getByRole('button',{name:'ดูล็อต / วันที่'}).click();await ap.getByText('ล็อต R12-JVM005',{exact:true}).waitFor();await ap.locator('.stock-check-panel').screenshot({path:path.join(out,'WEB-005-RECEIPT.png')});
  await ap.locator('.stock-check-table tbody>tr').first().getByRole('button',{name:'ทบทวน',exact:true}).click();const card=ap.locator('[data-count-event="'+record.eventId+'"]');await card.waitFor();assert((await card.innerText()).includes('สาขา 005'),'Review opened wrong branch');await card.locator('summary').click();await card.locator('textarea').fill('ตรวจหลักฐาน005จาก native fixture');await card.getByRole('button',{name:'รับรองผลนับ',exact:true}).click();
  await page.locator('#localSyncButton').click();await page.waitForFunction(()=>document.querySelector('#localHistoryPane').textContent.includes('ตรวจหลักฐาน005จาก native fixture'));checks.push('actual admin website selects005, reads same receipt/dates and CSRF review returns to005 phone history');
  const branch=await browser.newContext();await branch.request.post(fixture+'/admin/auth/login',{data:{username:'fixture-001',password:'fixture-only-password'}});assert((await branch.request.get(fixture+'/api/stock-check?branchCode=005')).status()===403,'001 web can read005');const one=await(await admin.request.get(fixture+'/api/stock-check')).json();assert(one.records.every(r=>r.latestCount?.receiptId!==record.receiptId),'005 leaked into001 catalog');checks.push('005 receipt remains separate from001 stock and branch web access');
  await page.screenshot({path:path.join(out,'PHONE-005-RECEIPT.png'),fullPage:true});fs.writeFileSync(path.join(out,'NATIVE-005-RECEIPT.json'),JSON.stringify({eventId:record.eventId,receiptId:record.receiptId,branchCode:'005',syntheticOnly:true},null,2));
  await page.locator('#accountButton').click();await page.locator('#logoutButton').click();await page.locator('#loginPane').waitFor({state:'visible'});const after=await invoke('products',{keyword:'QA-001'});assert(after.ok===false,'Logout retained read capability');assert(!errors.length,errors.join('\n'));checks.push('durable logout clears the native session without JavaScript errors');
  fs.writeFileSync(path.join(out,'BRANCH005-NATIVE-CHECK.json'),JSON.stringify({status:'PASS',scope:'Exact APK UI → shipping StockDaySession JVM → actual isolated branch005 HTTP/PostgreSQL plus actual React admin website; software device proof',checks,errors,physicalAndroidVerified:false,productionDeviceCreated:false,liveAuthenticationVerified:false,credentialsPersistedByPage:false},null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,errors}));await context.close();
 }finally{await browser.close();await new Promise(ok=>server.close(ok));java.kill('SIGTERM');await once(java,'exit');}
})().catch(e=>{console.error(e);process.exit(1)});
