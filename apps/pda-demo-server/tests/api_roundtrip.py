import urllib.request,urllib.error,http.cookiejar,json,uuid,tempfile,subprocess,time,sqlite3,copy
from pathlib import Path
import os
root=Path(__file__).resolve().parents[3];out=Path(os.environ.get('PDA_EVIDENCE_DIR',tempfile.mkdtemp(prefix='sc-pda-api-evidence-')));out.mkdir(parents=True,exist_ok=True);work=Path(tempfile.mkdtemp(prefix='verified-',dir=out));db=work/'counts.sqlite';base='http://127.0.0.1:4181';results=[]
class Client:
 def __init__(self,account=None,pin=None,device=None):
  self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=None;self.account=account;self.device=device or 'fixture-'+str(uuid.uuid4())
  if account:self.csrf=self.call('/api/demo/auth/login',{'accountId':account,'pin':pin,'deviceId':self.device})[1]['csrfToken']
 def call(self,path,body=None,headers=None,csrf=True):
  h={'Content-Type':'application/json'}
  if self.csrf and csrf:h['X-CSRF-Token']=self.csrf
  h.update(headers or {})
  request=urllib.request.Request(base+path,headers=h,data=json.dumps(body).encode() if body is not None else None)
  try:
   response=self.http.open(request,timeout=10);return response.status,json.load(response)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def state(self):return self.call('/api/demo/bootstrap')[1]
def start():
 process=subprocess.Popen(['node',str(root/'apps/pda-demo-server/server.mjs'),'--fixture-demo','--database',str(db),'--port','4181'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 line=process.stdout.readline();assert 'isolated-fixture-demo' in line,line
 return process
process=start()
def check(label,condition):assert condition,label;results.append(label)
def event(client,code,quantity,reference=None,original=None):
 state=client.state();product=next(p for p in state['products'] if p['code']==code);assignment=next(a for a in state['assignments'] if code in a['productCodes']);now=state['serverTime'];ref=reference or state['stockByProduct'][code]
 body={'id':str(uuid.uuid4()),'branchCode':'004','staffId':client.account,'productCode':code,'unit':product['unit'],'canonicalStockCode':code,'canonicalFactor':1,'catalogVersion':product['catalogVersion'],'assignmentId':assignment['id'],'assignmentRevision':assignment['revision'],'startedAt':now,'observedAt':now,'baseRevision':state['revisions'][code],'lots':[{'code':'SYNTHETIC-LOT','quantity':quantity,'mfg':'2025-01-01','exp':'2027-01-01'}],'quantity':quantity,'complete':True,'note':'Synthetic integration evidence','referenceAtScan':ref,'supersedesId':original,'incidentId':str(uuid.uuid4()) if original else None,'correctionReason':'Synthetic correction after recount' if original else None}
 if ref['quantity'] is not None and ref['quantity']!=quantity:body['discrepancyConfirmation']={'rechecked':True,'reason':'Synthetic full recount checked','countQuantity':quantity,'referenceQuantity':ref['quantity'],'referenceSource':ref['source'],'referenceObservedAt':ref['observedAt']}
 return body
try:
 no=Client();check('unauthenticated read rejected',no.call('/api/demo/bootstrap')[0]==401)
 a=Client('staff01','1111','fixture-api-a');lead=Client('lead03','3333','fixture-api-lead');b=Client('staff02','2222','fixture-api-b')
 check('authenticated assignments returned',a.state()['assignments'][0]['staffId']=='staff01')
 scan=a.call('/api/mobile/products/by-barcode/8850000000028')[1]
 check('existing mobile handler reads exact fixture identity',scan['productCode']=='DEMO-002' and scan['branchCode']=='004')
 check('sales cost redacted by existing mobile handler','costByBranch' not in scan)
 check('Full Sync timestamp remains unknown','stockObservedAt' not in scan and 'observedAt' not in scan)
 check('manager role sees fixture cost','costByBranch' in lead.call('/api/mobile/products/by-barcode/8850000000028')[1])
 check('cross-branch query denied',a.call('/api/demo/bootstrap?branchCode=005')[0]==403)
 first=event(a,'DEMO-002',3)
 check('missing CSRF denied',a.call('/api/demo/count-events',first,csrf=False)[0]==403)
 check('cross-origin denied',a.call('/api/demo/count-events',first,headers={'Origin':'https://untrusted.example'})[0]==403)
 check('unassigned product denied',b.call('/api/demo/count-events',{**first,'staffId':'staff02','assignmentId':'fixture-004-b'})[0]==403)
 forged={**first,'branchCode':'005'};check('forged branch denied',a.call('/api/demo/count-events',forged)[0]==403)
 for field,value in [('unit','BOX'),('canonicalFactor',12),('catalogVersion','changed')]:
  check('unit/catalog mismatch '+field,a.call('/api/demo/count-events',{**first,field:value})[0]==409)
 check('forged acceptance rejected',a.call('/api/demo/count-events',{**first,'status':'synced'})[0]==400)
 check('total mismatch rejected',a.call('/api/demo/count-events',{**first,'quantity':4})[0]==400)
 broken=copy.deepcopy(first);broken['lots'][0]['mfg']='2028-01-01';check('invalid manufacturing/expiry chronology rejected',a.call('/api/demo/count-events',broken)[0]==400)
 broken=copy.deepcopy(first);broken['lots'][0]['code']=7;check('invalid lot type rejected',a.call('/api/demo/count-events',broken)[0]==400)
 check('future capture rejected',a.call('/api/demo/count-events',{**first,'observedAt':'2099-01-01T00:00:00Z'})[0]==400)
 status,ack=a.call('/api/demo/count-events',first);check('durable receipt on first submission',status==201 and ack['status']=='synced')
 status,replay=a.call('/api/demo/count-events',dict(reversed(list(first.items()))));check('same event retry returns original receipt',status==200 and replay['replayed'] and replay['receiptId']==ack['receiptId'] and replay['receivedAt']==ack['receivedAt'])
 check('altered retry denied',a.call('/api/demo/count-events',{**first,'note':'changed payload'})[0]==409)
 check('another client sees first record',any(e['id']==first['id'] for e in b.state()['events']))
 corrected=event(a,'DEMO-002',6,original=first['id']);_,correction=a.call('/api/demo/count-events',corrected)
 check('correction accepted as absolute total',correction['status']=='synced' and correction['event']['quantity']==6)
 con=sqlite3.connect(db);raw_before=con.execute('SELECT payload FROM events WHERE id=?',(first['id'],)).fetchone()[0]
 check('original evidence is unchanged',json.loads(raw_before)==first)
 check('lots/date rows durable',con.execute('SELECT quantity_milli,mfg,exp FROM lots WHERE event_id=?',(first['id'],)).fetchone()==(3000,'2025-01-01','2027-01-01'))
 try:con.execute('UPDATE events SET actor=? WHERE id=?',('lead03',first['id']));immutable=False
 except sqlite3.DatabaseError:immutable=True;con.rollback()
 check('database prohibits evidence overwrite',immutable)
 a2=Client('staff01','1111','fixture-api-second-device');one=event(a,'DEMO-001',24);two=event(a2,'DEMO-001',24)
 _,one_ack=a.call('/api/demo/count-events',one);_,two_ack=a2.call('/api/demo/count-events',two)
 check('concurrent stale revision retained as conflict',one_ack['status']=='synced' and two_ack['status']=='conflict')
 # Confirm against an old reference after another accepted count changed it.
 pending=event(a,'DEMO-002',5);newer=event(lead,'DEMO-002',7);lead.call('/api/demo/count-events',newer)
 pending['baseRevision']=a.state()['revisions']['DEMO-002']
 _,held=a.call('/api/demo/count-events',pending);check('changed reference requires recheck',held['status']=='review')
 # A response is intentionally discarded; the exact request is then replayed.
 lost=event(a,'DEMO-003',18)
 request=urllib.request.Request(base+'/api/demo/count-events',data=json.dumps(lost).encode(),headers={'Content-Type':'application/json','X-CSRF-Token':a.csrf})
 response=a.http.open(request,timeout=10);response.close()
 status,recovered=a.call('/api/demo/count-events',lost);check('lost-response replay deduplicated',status==200 and recovered['replayed'])
 before=lead.state();before_seed=before['seedAt'];before_ids=[e['id'] for e in before['events']];before_history=[e['id'] for e in before['sourceHistory']]
 pid1=process.pid;process.terminate();process.wait(timeout=10);process=start();pid2=process.pid
 after=lead.state();check('real process restart retains records and sessions',pid1!=pid2 and [e['id'] for e in after['events']]==before_ids)
 check('restart does not refresh fixture observation time',after['seedAt']==before_seed)
 check('source-selection history durable',all(i in [h['id'] for h in after['sourceHistory']] for i in before_history))
 status,restarted_replay=a.call('/api/demo/count-events',lost);check('retry after process restart returns same receipt',status==200 and restarted_replay['receiptId']==recovered['receiptId'])
 check('source selection never sums repeat counts',after['stockByProduct']['DEMO-001']['quantity']==24)
 check('all writes explicitly isolated',after['environment']=='isolated-fixture-demo' and after['officialStockWrites'] is False)
 check('logout invalidates session',a.call('/api/demo/auth/logout',{})[0]==200 and a.call('/api/demo/bootstrap')[0]==401)
 report={'passed':True,'environment':'isolated-fixture-demo','officialStockWrites':False,'database':str(db),'real_process_restart':{'before_pid':pid1,'after_pid':pid2},'checks':results,'count_records':len(after['events']),'source_history_records':len(after['sourceHistory']),'receipt_examples':[ack['receiptId'],correction['receiptId'],recovered['receiptId']],'mobile_handler_evidence':{'identity':scan['productCode'],'source':'full-sync','observedAt':None,'sales_cost_redacted':True},'production_read_runtime_verified':False}
 (out/'api-roundtrip-evidence.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
finally:
 process.terminate();process.wait(timeout=10)
