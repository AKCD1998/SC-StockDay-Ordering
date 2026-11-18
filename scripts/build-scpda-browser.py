"""Prepare the existing SCPDA UI with real browser auth transport; no deploy.
Uses the accepted APK UI assets rather than a new product/layout or mock host.
"""
import argparse,subprocess,zipfile,hashlib,json,io
from PIL import Image
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--apk',required=True);p.add_argument('--out',required=True);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(root/'node_modules/esbuild/bin/esbuild'),str(root/'apps/pda-preview/scpda-browser-host.mjs'),'--bundle','--format=iife','--global-name=SCPDAWeb','--target=chrome109,safari16','--outfile='+str(out/'browser-host.js')],cwd=root,check=True)
with zipfile.ZipFile(a.apk) as z:html=z.read('assets/scpda.html').decode();icon=z.read('assets/scpda-icon.png');licenses=z.read('assets/licenses.txt')
origin='https://paasrtsm-project.onrender.com'
csp="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; media-src blob:; connect-src 'self' "+origin+"; worker-src 'self'; base-uri 'none'; form-action 'none'"
host=(out/'browser-host.js').read_text().replace('</script','<\\/script')
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"><script>'+host+'\nSCPDAWeb.installBrowserHost({companion:true});</script>',1)
html=html.replace('<title>SCPDA</title>','<title>SCPDA</title>')
html=html.replace('<button id="demoButton" class="scpda-secondary">','<button id="demoButton" class="scpda-secondary" hidden>')
html=html.replace('รุ่นทดสอบ 0.4.0 · ตรวจสินค้าและเก็บผลนับในเครื่อง','SCPDA · เชื่อม StockDay สาขา 001')
html=html.replace('</head>','<link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="./scpda-icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="SCPDA"></head>')
html=html.replace('</body>','<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");</script></body>')
manifest={'id':'/scpda/','name':'SCPDA','short_name':'SCPDA','start_url':'/scpda/','scope':'/scpda/','display':'standalone','background_color':'#f6f8fc','theme_color':'#0b1fb8','icons':[{'src':'./scpda-icon-'+str(size)+'.png','sizes':str(size)+'x'+str(size),'type':'image/png','purpose':'any'} for size in [192,512]]}
for size in [192,512]:Image.open(io.BytesIO(icon)).convert('RGB').resize((size,size),Image.Resampling.LANCZOS).save(out/('scpda-icon-'+str(size)+'.png'))
(out/'licenses.txt').write_bytes(licenses)
(out/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False))
cache='scpda-shell-'+hashlib.sha256(html.encode()).hexdigest()[:16]
(out/'sw.js').write_text("const CACHE="+json.dumps(cache)+";self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./scpda-icon.png','./scpda-icon-192.png','./scpda-icon-512.png','./manifest.webmanifest'])))});self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('scpda-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith('/scpda/')||!['/scpda/','/scpda/index.html','/scpda/scpda-icon.png','/scpda/scpda-icon-192.png','/scpda/scpda-icon-512.png','/scpda/manifest.webmanifest'].includes(u.pathname))return;e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request).then(r=>r||Response.error())))});")
(out/'index.html').write_text(html);(out/'scpda-icon.png').write_bytes(icon)
(out/'BUILD.json').write_text(json.dumps({'sourceApkSha256':hashlib.sha256(Path(a.apk).read_bytes()).hexdigest(),'entrySha256':hashlib.sha256(html.encode()).hexdigest(),'apiOrigin':origin,'mockTransport':False,'fixedOrigin':True,'requiresApprovedCorsAndRegisteredBrowserDevice':True,'companionOperator':'02005','branchCode':'005','requiresStandaloneInstallation':True,'permanentHardwareAttestation':False,'requiresDailyQrSelfieAndSamePublicIp':True,'productionActivated':False},indent=2))
print(json.dumps({'entry':str(out/'index.html'),'mockTransport':False,'productionActivated':False}))
