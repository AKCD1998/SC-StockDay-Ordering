"""Scanner lifecycle with the real decoder and a simulated native camera transport.
No physical camera / Android WebView claim. Serves only loopback source assets.
"""
import argparse, base64, functools, http.server, json, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--out',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[3]
out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
sample='data:image/png;base64,'+base64.b64encode((root/'apps/pda-preview/assets/sample-barcode.png').read_bytes()).decode()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/apps/pda-preview/style.css"><script type="module">
import {CameraScanner} from '/apps/pda-preview/camera-scanner.mjs';
window.calls=[];window.captureMode='image';window.confirmed=[];
window.scanner=new CameraScanner({catalog:[],onConfirm:v=>confirmed.push(v),nativeCamera:async(op,body)=>{
 calls.push({op,body});
 if(op==='scannerCapture'){
  if(captureMode==='defer')return new Promise(resolve=>window.finishCapture=resolve);
  if(captureMode==='failure')throw Error('fixture camera failure');
  return {image:window.sample};
 }
 return {};
}});
</script>'''
class Handler(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/__scanner-test':
   data=fixture.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
  else:super().do_GET()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/__scanner-test');page.wait_for_function('!!window.scanner')
  page.evaluate('(sample)=>{window.sample=sample;window.scanner.open()}',sample)
  page.wait_for_function("scanner.phase==='aiming'")
  assert page.locator('#cameraTorch,#cameraSound,.camera-tools').count()==0
  assert page.evaluate("calls.filter(x=>x.op==='scannerCapture').length")==0
  page.locator('#cameraView').click(position={'x':70,'y':80})
  assert page.evaluate("calls.filter(x=>x.op==='scannerCapture').length")==0,'Tapping must never decode or confirm a product'
  initial=page.evaluate("calls.find(x=>x.op==='scannerOpen').body")
  assert initial['width']>0 and initial['targetWidth']>0 and initial['targetX']+initial['targetWidth']<=1.001
  page.set_viewport_size({'width':700,'height':500})
  page.wait_for_function("calls.some(x=>x.op==='scannerLayout'&&x.body.viewportWidth===700)")
  page.screenshot(path=str(out/'scanner-without-torch-or-sound.png'))
  page.evaluate('scanner.capture()');page.wait_for_function("scanner.phase==='result'")
  assert page.locator('#cameraResult .mono').inner_text().strip()=='8850000000028'
  assert page.evaluate("calls.some(x=>x.op==='scannerClose'&&x.body.session===calls.find(x=>x.op==='scannerOpen').body.session)")
  assert page.evaluate('confirmed.length')==0
  # A failed capture can be retried; hardware failures leave a restart action.
  page.evaluate("window.captureMode='failure';scanner.start()")
  page.wait_for_function("scanner.phase==='aiming'")
  page.evaluate('scanner.capture()');page.wait_for_function("scanner.phase==='aiming'&&document.querySelector('#cameraMessage').textContent.includes('อ่านภาพนี้ไม่ได้')")
  session=page.evaluate('scanner.nativeSession')
  page.evaluate("session=>window.dispatchEvent(new CustomEvent('scpda-camera-ended',{detail:{session,error:'fixture hardware stopped'}}))",session)
  page.wait_for_function("scanner.phase==='error'&&!scanner.nativeSession")
  assert page.locator('#cameraRestart').is_visible()
  # A capture reply from the old camera session must not replace a newly opened view.
  page.evaluate("window.captureMode='defer';scanner.start()")
  page.wait_for_function("scanner.phase==='aiming'")
  page.evaluate('void scanner.capture()');page.wait_for_function('!!window.finishCapture')
  old=page.evaluate('scanner.nativeSession')
  page.evaluate("scanner.close();window.captureMode='image';scanner.open()")
  page.wait_for_function("scanner.phase==='aiming'")
  assert page.evaluate('scanner.nativeSession')!=old
  page.evaluate('finishCapture({image:sample})')
  page.wait_for_timeout(100)
  assert page.evaluate("scanner.phase==='aiming'&&scanner.result===null")
  # Hidden/background view releases the camera, and a late end event is ignored.
  current=page.evaluate('scanner.nativeSession')
  page.evaluate("window.dispatchEvent(new Event('pagehide'))")
  assert page.evaluate('!scanner.dialog.open&&!scanner.nativeSession')
  page.evaluate("window.dispatchEvent(new CustomEvent('scpda-camera-ended',{detail:{session:'old-session',error:'stale'}}))")
  assert page.evaluate('!scanner.dialog.open')
  assert not errors,errors
  report={'realWasmBarcodeDecode':True,'barcode':'8850000000028','nativeTransportSimulated':True,'touchDoesNotCapture':True,'torchAndSoundRemoved':True,'layoutTracksViewport':True,'staleCaptureIgnored':True,'captureFailureRetry':True,'hardwareFailureRestart':True,'closeReleasesNativeSession':True,'physicalAndroidCameraTested':False,'browserErrors':errors}
  (out/'scanner-browser-report.json').write_text(json.dumps(report,indent=2))
  print(json.dumps(report));browser.close()
finally:server.shutdown();server.server_close()
