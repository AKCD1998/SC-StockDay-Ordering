"""Explicit reader-only live acceptance; never uploads counts or inventory.
Private input files are not copied into the evidence JSON. Uses normal TLS/proxy.
"""
import argparse,base64,datetime,hashlib,json,os,uuid,urllib.request,urllib.error
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes,serialization
p=argparse.ArgumentParser();p.add_argument('--private-directory',required=True);p.add_argument('--barcode',required=True);p.add_argument('--company-code',required=True);p.add_argument('--sku-id',required=True);p.add_argument('--output',required=True);a=p.parse_args()
root=Path(a.private_directory);inv=json.loads((root/'verification-device.json').read_text());pins=json.loads((root/'verification-logins.json').read_text());origin='https://paasrtsm-project.onrender.com'
assert inv['apiOrigin']==origin and inv['branchCode']=='001'
keyfile=root/'verification-p256.pem'
if keyfile.exists():raise SystemExit('Verification key already exists; inspect prior result before any repeat activation')
k=ec.generate_private_key(ec.SECP256R1());fd=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb')as f:f.write(k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
public=base64.b64encode(k.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)).decode();device_id=str(uuid.uuid4());calls=[]
def req(path,body=None,token=None,expected=200):
 headers={'Accept':'application/json','User-Agent':'SCPDA-controlled-reader-verification/0.2','Cache-Control':'no-store'}
 if body is not None:headers['Content-Type']='application/json'
 if token:headers['Authorization']='Bearer '+token
 request=urllib.request.Request(origin+path,json.dumps(body).encode()if body is not None else None,headers)
 try:
  with urllib.request.urlopen(request,timeout=45)as r:status=r.status;data=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 calls.append({'method':'POST'if body is not None else'GET','path':path.split('?')[0],'status':status})
 if status!=expected:raise RuntimeError('Reader acceptance failed: '+path.split('?')[0]+' HTTP '+str(status)+' '+str(data.get('code','')))
 return data
tokens=[]
try:
 r=req('/api/scpda/device/pair',{'invitationId':inv['invitationId'],'code':inv['activationCode'],'publicKey':public,'deviceId':device_id},expected=201);cert=r['deviceCertificate'];ref=r['deviceRef'];cert_expiry=r['expiresAt'];ids=[]
 for row in pins:
  code=row['operatorCode'];c=req('/api/scpda/auth/challenge',{'deviceCertificate':cert});message='SCPDA-LOGIN-V1\n'+c['challengeId']+'\n'+c['nonce']+'\n'+code+'\n'+ref;sig=base64.b64encode(k.sign(message.encode(),ec.ECDSA(hashes.SHA256()))).decode();r=req('/api/scpda/auth/login',{'operatorCode':code,'pin':row['pin'],'deviceCertificate':cert,'challengeId':c['challengeId'],'signature':sig});assert r['contract']=='scpda-read-001-v1'and r['user']['operatorCode']==code;token=r['token'];tokens.append(token);me=req('/api/scpda/session',token=token);assert me['user']['branchCode']=='001'and me['user']['role']=='reader'and me['officialStockWrites']is False and me['countSubmissionAvailable']is False;ids.append(code)
 from urllib.parse import quote
 r=req('/api/scpda/products?keyword='+quote(a.barcode)+'&limit=200&offset=0',token=tokens[0]);assert any(str(x['sku_id'])==a.sku_id and x['company_code']==a.company_code for x in r['rows']);d=req('/api/scpda/products/'+a.sku_id,token=tokens[0])['product'];assert a.barcode in [x['barcode']for x in d['barcodes']];assert not any(x in d for x in ['avg_cost','cost','wholesale_tiers']);assert any(x.get('unit') and x.get('retail_price') is not None for x in d['unit_prices']);s=req('/api/scpda/stock?search='+quote(a.company_code)+'&limit=200&offset=0',token=tokens[0]);stock=[x for x in s['records']if x['productCode']==a.company_code];assert len(stock)==1 and stock[0]['stockNullsPreserved']is True;assert s['stockObservedAt']is None and s['stockSource']=='full-sync';assert not any('qtyBranch004'in x for x in s['records'])
 req('/api/mobile/products/by-barcode/'+quote(a.barcode),token=tokens[0],expected=401)
 for token in tokens:req('/api/scpda/auth/logout',{},token);req('/api/scpda/session',token=token,expected=401)
 tokens.clear()
 req('/admin/health');assert not any('/counts'in x['path']or '/sync'in x['path']for x in calls)
 evidence={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'origin':origin,'contract':'scpda-read-001-v1','liveAuthenticatedApiRead':True,'physicalAndroidAccepted':False,'operatorIds':ids,'branch':'001','readOnlyRole':True,'verificationCertificateExpiresAt':cert_expiry,'verificationCertificateLifetimeSeconds':600,'ownerPhoneInvitationConsumed':False,'skuId':a.sku_id,'companyCode':a.company_code,'exactBarcodeMatched':True,'retailUnitPricesRead':len(d['unit_prices']),'stockQuantity':stock[0]['qtyBranch001'],'stockSource':s['stockSource'],'stockObservedAt':s['stockObservedAt'],'missingValuesPreserved':True,'otherBranchStockExcluded':True,'costFieldsExcluded':True,'legacyMobileRejectsReaderToken':True,'allVerificationSessionsLoggedOut':True,'schemaChanges':False,'countOrOfficialInventoryWrites':False,'requests':calls}
 Path(a.output).write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence))
finally:
 for token in tokens:
  try:req("/api/scpda/auth/logout",{},token)
  except Exception:pass
 keyfile.unlink(missing_ok=True)
