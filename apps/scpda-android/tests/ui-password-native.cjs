'use strict';
// Exact APK → shipping JVM session → actual isolated read/auth HTTP → PostgreSQL.
// Software QA device proof, not Android Keystore or production enrollment.
const fs=require('fs'),path=require('path'),http=require('http'),{spawn,execFileSync}=require('child_process'),{once}=require('events'),{chromium}=require('playwright');
const [apk,out,fixture,folder,classes,jsonJar]=process.argv.slice(2);
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture||'')||!out||!classes||!jsonJar)throw Error('Explicit isolated fixture arguments required');
fs.mkdirSync(out,{recursive:true});
const asset=name=>execFileSync('python',['-c','import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',apk,name],{maxBuffer:16*1024*1024});
const html=asset('assets/scpda.html'),icon=asset('assets/scpda-icon.png');
(async()=>{
 const java=spawn('java',['-cp',classes+':'+jsonJar,'th.co.scgroup1989.scpda.NativeReadHarness',fixture,path.join(folder,'java-device'),path.join(folder,'java-invitation.json')],{stdio:['ignore','pipe','pipe']});
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
  assert(await page.locator('#password').getAttribute('maxlength')==='64','Password still truncated');assert(await page.locator('#password').getAttribute('inputmode')==='text','Letters unavailable');assert(await page.locator('label[for=password]').innerText()==='รหัสผ่าน','Numeric PIN copy retained');checks.push('exact APK exposes a text-capable 64-character password field');
  await page.locator('#password').fill('wrongRead9!');await page.locator('#loginButton').click();await page.waitForFunction(()=>!document.querySelector('#loginButton').disabled);assert((await page.locator('#status').innerText()).includes('ไม่ถูกต้อง'),'Wrong password not rejected');assert(await page.locator('#password').inputValue()==='','Wrong password retained');
  await page.locator('#password').fill('qaRead7!');assert(await page.locator('#password').inputValue()==='qaRead7!','Password truncated before Java');await page.locator('#loginButton').click();await page.locator('#mainTabs').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#loginButton').disabled);assert(await page.locator('#password').inputValue()==='','Successful password retained');checks.push('full alphanumeric password reaches shipping Java and actual bcrypt/device-proof login; wrong password is rejected and field cleared');
  await page.locator('[data-app-tab=price]').click();await page.locator('#barcode').fill('0001234567890');await page.locator('#lookupButton').click();await page.locator('#pricePane').waitFor({state:'visible'});assert((await page.locator('#pricePane').innerText()).includes('QA-001'),'Real fixture product missing');assert(await page.locator('.scpda-price-stock>strong').innerText()==='6','Real SQL stock missing');checks.push('authenticated reader still opens existing price and branch001 stock through real HTTP/PostgreSQL');
  const denied=await invoke('countSubmit',{event:{}});assert(denied.ok===false,'Read-only server allowed count submit');const ledger=await(await fetch(fixture+'/fixture/evidence')).json();assert(ledger.stock.find(r=>r.product_code==='QA-001').qty_branch_001==='6','Official stock changed');checks.push('count writes remain unavailable and fixture stock stays unchanged');
  await page.locator('#accountButton').click();await page.locator('#logoutButton').click();await page.locator('#loginPane').waitFor({state:'visible'});const after=await invoke('products',{keyword:'QA-001'});assert(after.ok===false,'Logout retained read capability');assert(!errors.length,errors.join('\n'));checks.push('durable logout clears the native session without JavaScript errors');
  fs.writeFileSync(path.join(out,'PASSWORD-NATIVE-CHECK.json'),JSON.stringify({status:'PASS',scope:'Exact APK UI → shipping StockDaySession JVM → actual isolated reader HTTP/PostgreSQL; software device proof',checks,errors,physicalAndroidVerified:false,productionDeviceCreated:false,liveAuthenticationVerified:false,credentialsPersistedByPage:false},null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,errors}));await context.close();
 }finally{await browser.close();await new Promise(ok=>server.close(ok));java.kill('SIGTERM');await once(java,'exit');}
})().catch(e=>{console.error(e);process.exit(1)});
