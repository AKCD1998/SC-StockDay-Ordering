"""Prepare the existing SCPDA UI with real browser auth transport; no deploy.
Uses the accepted APK UI assets rather than a new product/layout or mock host.
"""
import argparse,subprocess,zipfile,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--apk',required=True);p.add_argument('--out',required=True);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(root/'node_modules/esbuild/bin/esbuild'),str(root/'apps/pda-preview/scpda-browser-host.mjs'),'--bundle','--format=iife','--global-name=SCPDAWeb','--target=chrome109,safari16','--outfile='+str(out/'browser-host.js')],cwd=root,check=True)
with zipfile.ZipFile(a.apk) as z:html=z.read('assets/scpda.html').decode();icon=z.read('assets/scpda-icon.png')
origin='https://paasrtsm-project.onrender.com'
csp="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; media-src blob:; connect-src "+origin+"; base-uri 'none'; form-action 'none'"
host=(out/'browser-host.js').read_text().replace('</script','<\\/script')
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"><script>'+host+'\nSCPDAWeb.installBrowserHost();</script>',1)
html=html.replace('<title>SCPDA</title>','<title>SCPDA · StockDay 001</title>')
html=html.replace('<button id="demoButton" class="scpda-secondary">','<button id="demoButton" class="scpda-secondary" hidden>')
html=html.replace('รุ่นทดสอบ 0.4.0 · ตรวจสินค้าและเก็บผลนับในเครื่อง','SCPDA · เชื่อม StockDay สาขา 001')
(out/'index.html').write_text(html);(out/'scpda-icon.png').write_bytes(icon)
(out/'BUILD.json').write_text(json.dumps({'sourceApkSha256':hashlib.sha256(Path(a.apk).read_bytes()).hexdigest(),'entrySha256':hashlib.sha256(html.encode()).hexdigest(),'apiOrigin':origin,'mockTransport':False,'fixedOrigin':True,'requiresApprovedCorsAndRegisteredBrowserDevice':True,'productionActivated':False},indent=2))
print(json.dumps({'entry':str(out/'index.html'),'mockTransport':False,'productionActivated':False}))
