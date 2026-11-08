"""Shipping JVM session against an explicit loopback fixture after restart.
No Android hardware or live production compatibility claim.
"""
import argparse,json,subprocess,urllib.request
from pathlib import Path
p=argparse.ArgumentParser()
for n in ['fixture-origin','device-directory','invitation','jvm-classes','json-jar','proof','out']:p.add_argument('--'+n,required=True)
p.add_argument('--counts-disabled',action='store_true');a=p.parse_args();assert a.fixture_origin.startswith('http://127.0.0.1:')
proc=subprocess.Popen(['java','-cp',a.jvm_classes+':'+a.json_jar,'th.co.scgroup1989.scpda.NativeReadHarness',a.fixture_origin,a.device_directory,a.invitation],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
local=urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
 origin='http://127.0.0.1:'+str(json.loads(proc.stdout.readline())['port'])
 def invoke(op,body={}):return json.load(local.open(urllib.request.Request(origin+'/invoke',json.dumps({'op':op,'body':body}).encode(),{'Content-Type':'application/json'})))
 assert invoke('status')['data']['paired'];login=invoke('login',{'username':'01001','password':'1111'});assert login['ok'];assert login['data']['countUploadAvailable']==(not a.counts_disabled)
 read=invoke('products',{'keyword':'0001234567890'});assert read['ok'];proof=json.loads(Path(a.proof).read_text());receipts=[]
 if not a.counts_disabled:
  for key in ['lateEventId','offlineEventId','lostReplyEventId','correctionEventId']:
   r=invoke('countReceipt',{'id':proof[key]});assert r['ok'];d=r['data'];assert d['eventId']==proof[key] and d['officialStockWrites']==False;receipts.append({'eventId':d['eventId'],'receiptId':d['receiptId']})
  assert receipts[0]['receiptId']==proof['lateReceiptId'];assert invoke('countHistory')['ok']
 else:
  r=invoke('countSubmit',{});assert not r['ok'] and r['status']==401
 assert invoke('logout')['ok'];assert invoke('countHistory')['status']==401
 result={'environment':'isolated loopback actual HTTP/PostgreSQL with shipping host JVM','countsEnabled':not a.counts_disabled,'existingDeviceCertificateRetained':True,'readerLoginAndReadPassed':True,'countNegotiationMatchesFlag':True,'durableReceipts':receipts,'postLogoutRejected':True,'officialStockWrites':False,'liveOrStagingVerified':False,'physicalAndroidVerified':False}
 Path(a.out).write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:proc.terminate();proc.wait(timeout=10)
