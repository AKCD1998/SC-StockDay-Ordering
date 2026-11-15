'use strict';
// Execute the exact APK assets with a synthetic read host and real IndexedDB.
// This is not a production query or a physical Android camera test.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const [apk,out]=process.argv.slice(2);if(!apk||!out)throw Error('Use APK and output directory');
fs.mkdirSync(out,{recursive:true});
const asset=name=>execFileSync('python',['-c','import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',apk,name],{maxBuffer:16*1024*1024});
const html=asset('assets/scpda.html'),icon=asset('assets/scpda-icon.png');
const bridge=()=>{
 const f=window.fixture={actor:null,delay:0,fail:false,calls:[],products:[
  {skuId:'1844',code:'IC-000981',barcode:'8855451002767',name:'ปกติ สามเบียน วิตามินบี 1 6 12 10 เม็ด',unit:'แผง',qty:45,syncedAt:'2026-11-15T01:21:30.724Z',prices:[['3 ชิ้น',90],['โหล',300],['แผง',40]]},
  {skuId:'63001',code:'630000001',barcode:'000000063001',name:'เภสัช ชื่อยาภาษาไทยแบบเต็มที่ยาวมากสำหรับทดสอบการตัดขึ้นบรรทัดใหม่พร้อมรายละเอียดขนาดและหน่วยบรรจุ 500 มก. กล่อง 100 เม็ด',unit:null,qty:null,syncedAt:null,prices:[['กล่อง',145]]}
 ]};
 window.SCPDAHost={invoke(id,op,raw){const args=JSON.parse(raw);f.calls.push({op,args});setTimeout(()=>{try{
  let data;
  if(op==='status')data={paired:true};
  else if(op==='login'){f.actor=args.username;data={contract:'scpda-read-001-v1',branchCode:'001',countUploadAvailable:false,user:{id:f.actor,operatorCode:f.actor,role:'reader',branchCode:'001',rotationDueAt:'2027-05-08T00:00:00Z',rotationDue:false}};}
  else if(op==='logout'){f.actor=null;data={ok:true};}
  else{
   if(!f.actor)throw Object.assign(Error('เข้าสู่ระบบ'),{status:401});
   if(f.fail)throw Object.assign(Error('เครือข่ายทดสอบไม่พร้อม'),{status:503});
   const matches=q=>f.products.filter(p=>p.code===q||p.barcode===q);
   if(op==='products'){const rows=matches(args.keyword);data={total:rows.length,rows:rows.map(p=>({sku_id:p.skuId}))};}
   else if(op==='product'){const p=f.products.find(p=>p.skuId===args.skuId);data={ok:true,product:{sku_id:p.skuId,company_code:p.code,display_name:p.name,barcodes:[{barcode:p.barcode}],unit_prices:p.prices.map(([unit,amount])=>({unit,retail_price:String(amount),currency:'THB'}))}};}
   else if(op==='stock'){const rows=matches(args.search);data={records:rows.map(p=>({productCode:p.code,productNameThai:p.name,barcode:p.barcode,unit:p.unit,qtyBranch001:p.qty,syncedAt:p.syncedAt,stockNullsPreserved:true,pdaQuantity:999})),pagination:{total:rows.length}};}
   else throw Error('Unexpected operation '+op);
  }
  window.__scpdaReceive(id,{ok:true,data});
 }catch(e){window.__scpdaReceive(id,{ok:false,status:e.status||0,error:e.message});}},f.delay);}};
};
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/scpda-icon.png'?'image/png':'text/html; charset=utf-8');res.end(req.url==='/scpda-icon.png'?icon:html);});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),checks=[],errors=[];
 const assert=(value,message)=>{if(!value)throw Error(message);};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(bridge);
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('http://127.0.0.1:'+server.address().port);
  assert(await page.locator('#mainTabs').isHidden(),'Tabs visible before authentication');
  await page.locator('#loginPane').waitFor({state:'visible'});await page.locator('#password').fill('1111');await page.locator('#loginButton').click();
  await page.locator('#mainTabs').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#loginButton').disabled);
  const tab=name=>page.locator('[data-app-tab="'+name+'"]');
  const search=async value=>{await page.locator('#barcode').fill(value);await page.locator('#lookupButton').click();await page.waitForFunction(()=>!document.querySelector('#lookupButton').disabled);};
  assert(await page.locator('#mainTabs button').allTextContents().then(a=>a.join('|').includes('นับสต๊อก')&&a.join('|').includes('พรีออเดอร์')&&a.join('|').includes('เช็คราคา')),'Missing main tabs');
  assert(await tab('count').getAttribute('aria-pressed')==='true','Default count tab lost');checks.push('authenticated three-tab navigation retains count as the default');
  await tab('price').click();await search('8855451002767');await page.locator('#pricePane').waitFor({state:'visible'});
  assert(await page.locator('.scpda-price-name').innerText()==='ปกติ สามเบียน วิตามินบี 1 6 12 10 เม็ด','Wrong full name');
  assert((await page.locator('#pricePane .scpda-price-code').innerText()).includes('IC-000981'),'Company code lost');
  assert((await page.locator('.scpda-price-single').innerText()).includes('แผง\n40.00 บาท'),'Wrong single price');
  const bundles=await page.locator('.scpda-price-bundles').innerText();assert(bundles.includes('3 ชิ้น')&&bundles.includes('90.00 บาท')&&bundles.includes('300.00 บาท'),'Bundle prices lost');
  assert(await page.locator('.scpda-price-stock>strong').innerText()==='45','Stock was replaced by extra PDA-shaped field');
  assert(!(await page.locator('#pricePane').innerText()).includes('08:21'),'Metadata still crowds main page');
  assert((await page.locator('#pricePane .scpda-price-code').innerText()).includes('รหัส SKU'),'SKU label not updated');
  assert(await page.locator('.scpda-price-stock>strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=56,'Stock quantity too small');
  assert(await page.locator('#priceStockInfoButton').evaluate(e=>e.getBoundingClientRect().width>=44),'Info tap target too small');
  await page.locator('#priceStockInfoButton').click();await page.locator('#priceStockInfo').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#priceStockInfoBody').innerText.includes('ตรวจข้อมูลทุก 1 นาที'));
  assert((await page.locator('#priceStockInfoBody').innerText()).includes('08:21'),'Actual sync time missing from popup');
  assert((await page.locator('#priceStockInfoBody').innerText()).includes('08:30'),'Routine missing from popup');
  await page.screenshot({path:path.join(out,'SCPDA-R9-STOCK-INFO.png'),fullPage:true});
  await page.evaluate(()=>{fixture.products[0].qty=46;fixture.products[0].syncedAt='2026-11-15T01:40:00Z'});await page.clock.fastForward(60001);
  await page.waitForFunction(()=>document.querySelector('.scpda-price-stock>strong').innerText==='46');
  assert((await page.locator('#priceStockInfoBody').innerText()).includes('08:40'),'Popup not refreshed with quantity');
  await page.locator('#closePriceStockInfo').click();await page.evaluate(()=>{fixture.fail=true});await page.locator('#priceStockInfoButton').click();
  await page.waitForFunction(()=>document.querySelector('#priceStockInfoBody').innerText.includes('ตรวจข้อมูลล่าสุดไม่สำเร็จ'));
  assert(await page.locator('.scpda-price-stock>strong').innerText()==='46','Failed refresh changed quantity');
  assert((await page.locator('#priceStockInfoBody').innerText()).includes('08:40'),'Failed refresh fabricated a new sync time');
  await page.evaluate(()=>{fixture.fail=false;window.dispatchEvent(new Event('scpda-background'))});
  const pausedCalls=await page.evaluate(()=>fixture.calls.length);await page.clock.fastForward(120000);assert(await page.evaluate(()=>fixture.calls.length)===pausedCalls,'Polling continued in background');
  await page.evaluate(()=>{fixture.products[0].qty=45;fixture.products[0].syncedAt='2026-11-15T01:21:30.724Z';window.dispatchEvent(new Event('scpda-foreground'))});
  await page.waitForFunction(()=>document.querySelector('.scpda-price-stock>strong').innerText==='45');
  await page.locator('#closePriceStockInfo').click();
  checks.push('SKU label, 56px stock and orange info popup; fresh popup/minute/resume reads, background pause and honest offline timestamps');
  assert(await page.locator('#startLocalCount').isVisible()===false,'Count action appears in price pane');
  checks.push('barcode reads exact SKU, full Thai name, 40/90/300 unit prices and Full Sync 45 at 08:21 without inferred promotion rules');
  await page.screenshot({path:path.join(out,'SCPDA-R9-PRICE-CHECK.png'),fullPage:true});
  assert(await page.evaluate(()=>window.__scpdaBack())===true,'Back did not return from price');
  await page.locator('.scpda-recent-count').first().waitFor({state:'visible'});
  assert(await page.locator('.scpda-recent-count').first().innerText()==='เช็คราคา','Recent action did not follow price tab');
  await page.locator('.scpda-recent-count').first().click();await page.locator('#pricePane').waitFor({state:'visible'});
  await page.locator('#priceCheckBack').click();await search('630000001');await page.locator('#pricePane').waitFor({state:'visible'});
  assert((await page.locator('#pricePane .scpda-price-code').innerText()).includes('630000001'),'630 code lookup lost');
  assert(await page.locator('.scpda-price-stock>strong').innerText()==='ยังไม่มียอด','Missing stock became zero');
  assert(await page.locator('.scpda-price-name').innerText()===await page.evaluate(()=>fixture.products[1].name),'Long name truncated');
  for(const width of [320,390,496]){
   await page.setViewportSize({width,height:740});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+width);
   assert(await page.locator('.scpda-price-name').evaluate(e=>e.offsetHeight>parseFloat(getComputedStyle(e).lineHeight)*2),'Full name is not wrapping '+width);
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
   assert(await page.locator('#pricePane').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('#mainTabs').getBoundingClientRect().top),'Footer hides content '+width);
  }
  checks.push('IC/630 searches, price-tab shortcuts, unknown stock/time and long Thai names fit 320/390/496px above the fixed footer');
  await page.setViewportSize({width:390,height:844});await tab('count').click();await search('IC-000981');await page.locator('[data-product-code="IC-000981"] .scpda-recent-count').click();
  await page.locator('#localCountForm').waitFor();await page.locator('#local-lot-0-code').fill('TAB-DRAFT');await page.locator('.local-mfg-unknown').check();await page.locator('.local-exp-unknown').check();await page.locator('#local-lot-0-qty').fill('7');
  await tab('price').click();await search('IC-000981');assert(await page.locator('.scpda-price-stock>strong').innerText()==='45','Local draft overrode StockDay stock');
  await tab('count').click();await page.locator('[data-product-code="IC-000981"] .scpda-recent-count').click();await page.locator('#localCountForm').waitFor();
  assert(await page.locator('#local-lot-0-qty').inputValue()==='7','Draft lost across tabs');assert(await page.locator('#local-lot-0-code').inputValue()==='TAB-DRAFT','Lot draft lost across tabs');
  await page.locator('#localCountReviewButton').click();await page.locator('#localCountReviewSave').click();await page.locator('#localHistoryPane').waitFor({state:'visible'});
  await tab('price').click();await search('IC-000981');assert(await page.locator('.scpda-price-stock>strong').innerText()==='45','Saved local count overrode StockDay stock');
  checks.push('switching tabs saves the seven-unit lot draft; draft and saved local counts never replace the 45-unit StockDay reference');
  await page.evaluate(()=>{fixture.delay=100});await page.locator('#priceStockInfoButton').click();await page.locator('#closePriceStockInfo').click();await tab('preorder').click();
  await page.waitForTimeout(400);assert(!await page.locator('#priceStockInfo').isVisible(),'Stock popup leaked across tabs');assert(await page.locator('#lookupPane').isHidden(),'Late auto-refresh reopened price view');
  await page.evaluate(()=>{fixture.delay=0});await tab('price').click();await search('IC-000981');
  checks.push('in-flight stock-info refresh cannot reopen a popup or price view after tab change');
  const before=await page.evaluate(()=>fixture.calls.length);await tab('preorder').click();await page.locator('#preorderPane').waitFor({state:'visible'});
  assert((await page.locator('#preorderPane').innerText()).includes('กำลังเตรียมเปิดใช้งาน'),'Preorder falsely reports availability');
  await page.evaluate(()=>window.dispatchEvent(new Event('scpda-volume')));assert(await page.locator('dialog[open]').count()===0,'Volume opened camera on preorder');
  assert(await page.evaluate(()=>fixture.calls.length)===before,'Pending preorder sent requests');checks.push('preorder remains an honest pending tab with no mock cases, role picker or business writes');
  await tab('price').click();await page.evaluate(()=>{fixture.delay=100});await page.locator('#barcode').fill('IC-000981');await page.locator('#lookupButton').click();await tab('preorder').click();
  await page.waitForFunction(()=>!document.querySelector('#lookupButton').disabled);assert(await page.locator('#lookupPane').isHidden(),'Late price response reopened lookup on preorder');
  await page.evaluate(()=>{fixture.delay=0});await tab('price').click();await search('IC-000981');await page.locator('#priceCheckBack').click();await page.evaluate(()=>{fixture.fail=true});await search('IC-000981');assert(await page.locator('#pricePane').isHidden(),'Failed lookup displayed cached price');
  await page.evaluate(()=>{fixture.fail=false});assert(await page.evaluate(()=>window.__scpdaBack())===true,'Back from price lookup not consumed');assert(await tab('count').getAttribute('aria-pressed')==='true','Back did not restore count tab');assert(await page.evaluate(()=>window.__scpdaBack())===false,'Count home should permit native exit');
  checks.push('late reads cannot change another tab; failed reads have no stale fallback; native back navigates before exit');
  const ops=await page.evaluate(()=>[...new Set(fixture.calls.map(c=>c.op))]);assert(ops.every(op=>['status','login','products','product','stock'].includes(op)),'Unexpected server mutation '+ops);
  await page.locator('#accountButton').click();await page.locator('#logoutButton').click();await page.locator('#loginPane').waitFor({state:'visible'});assert(await page.locator('#mainTabs').isHidden(),'Logout retained main navigation');
  assert(!errors.length,errors.join('\n'));checks.push('price path uses only reader operations and logout clears visible navigation without JavaScript errors');
  fs.writeFileSync(path.join(out,'PRICE-UI-CHECK.json'),JSON.stringify({status:'PASS',scope:'Exact APK UI; synthetic read host; real browser IndexedDB. No live API, production write or physical camera claim.',checks,errors,physicalDeviceVerified:false,productionChanged:false},null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,errors}));await context.close();
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error(e);process.exit(1)});
