package th.co.scgroup1989.scpda;
import android.app.Activity;import android.content.*;import android.content.pm.*;import android.net.Uri;import android.os.Build;import android.provider.Settings;
import org.json.*;import java.io.*;import java.net.*;import java.security.*;import java.util.concurrent.*;
public final class ScpdaAppUpdater {
 public static final String SIGNER=AppCenterClient.SIGNER;
 private final Context context;private final AppCenterClient client;private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private JSONObject release;private String downloadPath;private volatile String phase="idle",error="";private volatile int percent=0;
 public ScpdaAppUpdater(Context c,StockDaySession.DeviceProof d){context=c.getApplicationContext();client=new AppCenterClient(d);}
 @SuppressWarnings("deprecation") private static int signingFlags(){return PackageManager.GET_SIGNATURES|(Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:0);}
 private PackageInfo installed()throws Exception{return context.getPackageManager().getPackageInfo(context.getPackageName(),signingFlags());}
 private static int code(PackageInfo p){return (int)(Build.VERSION.SDK_INT>=28?p.getLongVersionCode():p.versionCode);}
 public synchronized JSONObject state()throws Exception{return new JSONObject().put("phase",phase).put("percent",percent).put("error",error).put("installedVersion",installed().versionName).put("installedCode",code(installed())).put("release",release==null?JSONObject.NULL:new JSONObject(release.toString())).put("updateAvailable",release!=null&&release.getInt("versionCode")>code(installed())).put("canInstall",context.getPackageManager().canRequestPackageInstalls());}
 public synchronized JSONObject check()throws Exception{if(phase.equals("downloading")||phase.equals("ready")||phase.equals("permission"))return state();JSONObject r=client.check(code(installed()));release=r.optJSONObject("release");downloadPath=r.optString("downloadPath",null);error="";phase=r.optBoolean("updateAvailable")?"available":r.optBoolean("paired",true)?"current":"unpaired";return state();}
 public synchronized JSONObject start()throws Exception{
  if(phase.equals("downloading"))return state();if(release==null||release.getInt("versionCode")<=code(installed())||!AppCenterClient.validPath(downloadPath))throw new Exception("ตรวจอัปเดตก่อนดาวน์โหลด");
  final JSONObject target=new JSONObject(release.toString());final String path=downloadPath;phase="downloading";percent=0;error="";
  worker.submit(()->{File partial=new File(context.getCacheDir(),"updates/scpda-update.part.apk");try{partial.getParentFile().mkdirs();HttpURLConnection c=AppCenterClient.connection(path);try{c.setReadTimeout(20000);if(c.getResponseCode()!=200||c.getContentLengthLong()!=target.getLong("sizeBytes"))throw new Exception("ดาวน์โหลดไม่ครบ กรุณาตรวจอัปเดตใหม่");MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0;try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(partial)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedException();total+=n;if(total>target.getLong("sizeBytes"))throw new Exception("ขนาดไฟล์ไม่ตรงกัน");digest.update(b,0,n);out.write(b,0,n);percent=(int)(100*total/target.getLong("sizeBytes"));}}if(total!=target.getLong("sizeBytes")||!hex(digest.digest()).equals(target.getString("sha256")))throw new Exception("ไฟล์อัปเดตไม่ครบ กรุณาดาวน์โหลดใหม่");verifyArchive(partial,target);File ready=file(context);if(ready.exists()&&!ready.delete()||!partial.renameTo(ready))throw new Exception("บันทึกไฟล์อัปเดตไม่ได้");phase="ready";}finally{c.disconnect();}}catch(Exception e){partial.delete();error=e.getMessage()==null?"ดาวน์โหลดไม่สำเร็จ":e.getMessage();phase="error";}});return state();
 }
 static File file(Context c){return new File(c.getCacheDir(),"updates/scpda-update.apk");}
 private static String hex(byte[] bytes){StringBuilder b=new StringBuilder();for(byte v:bytes)b.append(String.format(java.util.Locale.ROOT,"%02x",v&255));return b.toString();}
 private static byte[][] bytes(android.content.pm.Signature[] signatures){if(signatures==null)return null;byte[][] out=new byte[signatures.length][];for(int i=0;i<signatures.length;i++)out[i]=signatures[i]==null?null:signatures[i].toByteArray();return out;}
 @SuppressWarnings("deprecation") private String signer(PackageInfo info)throws Exception{if(info==null)return null;android.content.pm.Signature[] modern=null;if(Build.VERSION.SDK_INT>=28&&info.signingInfo!=null)modern=info.signingInfo.getApkContentsSigners();return AppSigningIdentity.fingerprint(bytes(modern),bytes(info.signatures));}
 @SuppressWarnings("deprecation") private void verifyArchive(File f,JSONObject target)throws Exception{
  PackageManager pm=context.getPackageManager();PackageInfo info=pm.getPackageArchiveInfo(f.getPath(),signingFlags()),local=installed();
  if(info==null||!context.getPackageName().equals(info.packageName)||code(info)!=target.getInt("versionCode")||code(info)<=code(local)||target.getInt("minSdk")>Build.VERSION.SDK_INT)throw new Exception("ไฟล์นี้อัปเดต SCPDA เครื่องนี้ไม่ได้");
  String archiveSigner=signer(info),installedSigner=signer(local);
  // Some Android package parsers omit signingInfo. Ask for the legacy certificate
  // metadata explicitly, retaining the same single-signer and pinned-key checks.
  if(archiveSigner==null){PackageInfo legacy=pm.getPackageArchiveInfo(f.getPath(),PackageManager.GET_SIGNATURES);if(legacy!=null&&info.packageName.equals(legacy.packageName)&&code(info)==code(legacy))archiveSigner=signer(legacy);}
  if(installedSigner==null)installedSigner=signer(pm.getPackageInfo(context.getPackageName(),PackageManager.GET_SIGNATURES));
  AppSigningIdentity.requireTrusted(installedSigner,archiveSigner,target.getString("signerSha256"),SIGNER);
 }
 public synchronized JSONObject install(Activity activity)throws Exception{
  if(!phase.equals("ready")&&!phase.equals("permission"))throw new Exception("ดาวน์โหลดแอปให้เสร็จก่อน");File f=file(context);if(!f.isFile())throw new Exception("ไม่พบไฟล์อัปเดต กรุณาดาวน์โหลดใหม่");MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}if(!hex(digest.digest()).equals(release.getString("sha256")))throw new Exception("ไฟล์อัปเดตเปลี่ยน กรุณาดาวน์โหลดใหม่");verifyArchive(f,release);
  if(!context.getPackageManager().canRequestPackageInstalls()){phase="permission";activity.runOnUiThread(()->{try{activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+context.getPackageName())));}catch(Exception e){error="เปิดสิทธิ์ติดตั้งไม่ได้ กรุณาตั้งค่าจาก Android";phase="error";}});}
  else{phase="installing";activity.runOnUiThread(()->{try{Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://"+context.getPackageName()+".updates/scpda.apk"),"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivityForResult(intent,54);}catch(Exception e){error="เปิดตัวติดตั้ง Android ไม่ได้";phase="error";}});}return state();
 }
 public synchronized void installerReturned(){if(phase.equals("installing"))phase="ready";}
 public void close(){worker.shutdownNow();}
}
