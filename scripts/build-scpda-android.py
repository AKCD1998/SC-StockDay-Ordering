"""Build/sign a local internal-test APK with the verified Android SDK. No deploy."""
import argparse,os,subprocess,pathlib,zipfile,json,hashlib,secrets,shutil
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--sdk',required=True);p.add_argument('--out',required=True);p.add_argument('--signing-dir',required=True);a=p.parse_args();root=pathlib.Path(__file__).resolve().parent.parent;app=root/'apps/scpda-android';out=pathlib.Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);sdk=pathlib.Path(a.sdk).resolve();bt=sdk/'build-tools/35.0.0' if (sdk/'build-tools/35.0.0').exists() else sdk/'build-tools/android-15';android=sdk/'platforms/android-35/android.jar' if (sdk/'platforms/android-35/android.jar').exists() else sdk/'platform/android-35/android.jar';private=pathlib.Path(a.signing_dir).resolve();private.mkdir(parents=True,exist_ok=True,mode=0o700)
env={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'}
def run(*cmd):subprocess.run([str(c) for c in cmd],cwd=root,env=env,check=True)
work=out/'build'
if out==root or out.is_relative_to(root/'apps') or out==pathlib.Path('/'):raise RuntimeError('Use a separate artifact output directory')
marker=work/'.scpda-local-build'
if work.exists() and not marker.exists():raise RuntimeError('Refusing to overwrite unmarked build directory')
work.mkdir(exist_ok=True);marker.write_text('SCPDA internal-test build only')
assets=work/'assets';run('node',root/'scripts/build-scpda-android-assets.mjs','--out',assets)
res=work/'res';shutil.copytree(app/'res',res,dirs_exist_ok=True);(res/'drawable-nodpi').mkdir(exist_ok=True);im=Image.open(app/'branding/scpda-icon-source.png');im.resize((432,432),Image.Resampling.LANCZOS).save(res/'drawable-nodpi/scpda_foreground.png')
# Keep only three explicit assets and notices in the APK, never build/source/DB files.
if (work/'count-demo-build').exists():shutil.rmtree(work/'count-demo-build')
(assets/'demo-build').rename(work/'count-demo-build')
run(bt/'aapt2','compile','--dir',res,'-o',work/'resources.zip');run(bt/'aapt2','link','-o',work/'base.apk','-I',android,'--manifest',app/'AndroidManifest.xml','-A',assets,work/'resources.zip')
classes=work/'classes'
if classes.exists():shutil.rmtree(classes)
classes.mkdir();run('java','com.sun.tools.javac.Main','-source','8','-target','8','-encoding','UTF-8','-classpath',android,'-d',classes,*sorted((app/'src').rglob('*.java')))
run('java','sun.tools.jar.Main','--create','--file',work/'classes.jar','-C',classes,'.');dex=work/'dex'
if dex.exists():shutil.rmtree(dex)
dex.mkdir();run('java','-cp',bt/'lib/d8.jar','com.android.tools.r8.D8','--lib',android,'--min-api','26','--output',dex,work/'classes.jar')
shutil.copyfile(work/'base.apk',work/'unaligned.apk')
with zipfile.ZipFile(work/'unaligned.apk','a',zipfile.ZIP_DEFLATED) as z:
 for f in dex.glob('classes*.dex'):z.write(f,f.name)
run(bt/'zipalign','-P','16','-f','4',work/'unaligned.apk',work/'aligned.apk')
store=private/'scpda-internal-test.p12';password_file=private/'keystore-password.txt'
if not store.exists():
 if password_file.exists():raise RuntimeError('Signing key missing but password exists; inspect without overwriting')
 password_file.write_text(secrets.token_urlsafe(32));password_file.chmod(0o600);env['SCPDA_TEST_KEY_PASSWORD']=password_file.read_text();run('keytool','-genkeypair','-keystore',store,'-storetype','PKCS12','-storepass:env','SCPDA_TEST_KEY_PASSWORD','-keypass:env','SCPDA_TEST_KEY_PASSWORD','-alias','scpda-internal-test','-keyalg','RSA','-keysize','3072','-validity','365','-dname','CN=SCPDA Internal Test,O=SC Group 1989,C=TH');store.chmod(0o600)
else:env['SCPDA_TEST_KEY_PASSWORD']=password_file.read_text()
apk=out/'SCPDA-0.1.0-test.1.apk';run(bt/'apksigner','sign','--ks',store,'--ks-key-alias','scpda-internal-test','--ks-pass','env:SCPDA_TEST_KEY_PASSWORD','--key-pass','env:SCPDA_TEST_KEY_PASSWORD','--out',apk,work/'aligned.apk');run(bt/'apksigner','verify','--verbose','--print-certs',apk);run(bt/'zipalign','-c','-P','16','4',apk)
with zipfile.ZipFile(apk) as z:
 assert z.testzip() is None;assert 'classes.dex' in z.namelist();assert b'NativeReadHarness' not in z.read('classes.dex');assert all(not n.endswith(('.p12','.sqlite','.db','.env')) for n in z.namelist());assert b'SCPDAHost' not in z.read('assets/count-demo.html')
identity={'artifact':'SCPDA-ANDROID-READ-R1','file':apk.name,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'package':'th.co.scgroup1989.scpda.preview','label':'SCPDA','versionName':'0.1.0-test.1','minAndroid':8,'targetSdk':35,'internalTestSigning':True,'realReadRequiresUserBranch001Login':True,'liveCountWritesAvailable':False,'physicalDeviceAccepted':False,'productionDeployment':False};(out/'APK-IDENTITY.json').write_text(json.dumps(identity,indent=2));print(json.dumps(identity))
