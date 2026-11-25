package th.co.scgroup1989.scpda;
import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.view.KeyEvent;
import android.webkit.*;
import org.json.*;
import java.util.concurrent.*;

public final class MainActivity extends AssetActivity {
 private final ExecutorService executor=Executors.newSingleThreadExecutor(),updateExecutor=Executors.newSingleThreadExecutor();private StockDaySession api;private ScpdaAppUpdater updater;private AndroidScannerCamera scanner;private String activationRequestId;private volatile boolean scanningEnabled=false;
 private static final int ANNUAL_EXPORT_REQUEST=57;
 private String annualExportId;
 private byte[] annualExportBytes;
 @Override public void onCreate(Bundle b){super.onCreate(b);AndroidDevice device=new AndroidDevice(this);int installed=0;try{installed=getPackageManager().getPackageInfo(getPackageName(),0).versionCode;}catch(Exception ignored){}api=new StockDaySession(device,installed);updater=new ScpdaAppUpdater(this,device);createView("scpda.html");scanner=new AndroidScannerCamera(this,web,this::reply);}
 @Override protected void configure(){super.configure();web.addJavascriptInterface(new Bridge(),"SCPDAHost");}
 @Override public boolean onKeyDown(int code,KeyEvent e){if(code==KeyEvent.KEYCODE_VOLUME_UP&&scanningEnabled){if(e.getRepeatCount()==0&&web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('scpda-volume'));",null);return true;}return super.onKeyDown(code,e);}
 @Override public boolean onKeyUp(int code,KeyEvent e){if(code==KeyEvent.KEYCODE_VOLUME_UP&&scanningEnabled)return true;return super.onKeyUp(code,e);}
 private void reply(String id,JSONObject data){runOnUiThread(()->{if(web!=null&&!isFinishing())web.evaluateJavascript("window.__scpdaReceive("+JSONObject.quote(id)+","+data.toString()+");",null);});}
 private final class Bridge {
  @JavascriptInterface public boolean hasNativeScanner(){return true;}
  @JavascriptInterface public void invoke(final String id,final String operation,final String raw){
   if(id==null||!id.matches("[0-9]{1,12}")||operation==null||raw==null||raw.length()>("annualSave".equals(operation)?320000:"login".equals(operation)?300000:(("countSubmit".equals(operation)||"countCheck".equals(operation))?65536:4096)))return;
   if(operation.equals("scannerOpen")||operation.equals("scannerLayout")||operation.equals("scannerCapture")||operation.equals("scannerClose")){runOnUiThread(()->{if(scanner==null||isFinishing()){replyError(id,400,"กล้องยังไม่พร้อม");return;}if(!scanningEnabled&&!operation.equals("scannerClose")){replyError(id,401,"เข้าสู่ระบบก่อนสแกนสินค้า");return;}try{scanner.execute(id,operation,new JSONObject(raw));}catch(JSONException e){replyError(id,400,"ข้อมูลกล้องไม่ถูกต้อง");}});return;}
   if(operation.equals("logout")||operation.equals("login")||operation.equals("setCompanionGrant")||operation.equals("switchDeviceProfile")){scanningEnabled=false;runOnUiThread(()->{if(scanner!=null)scanner.close();});}
   if(operation.equals("checkAppUpdate")||operation.equals("appUpdateStatus")||operation.equals("startAppUpdate")||operation.equals("installAppUpdate")){updateExecutor.submit(()->{try{JSONObject data=operation.equals("checkAppUpdate")?updater.check():operation.equals("startAppUpdate")?updater.start():operation.equals("installAppUpdate")?updater.install(MainActivity.this):updater.state();reply(id,new JSONObject().put("ok",true).put("data",data));}catch(Exception e){replyError(id,400,e.getMessage()==null?"App Center ยังไม่พร้อม":e.getMessage());}});return;}
   if(operation.equals("activateDevice")){runOnUiThread(()->{if(activationRequestId!=null){replyError(id,409,"กำลังเลือกไฟล์เชื่อมเครื่อง");return;}activationRequestId=id;try{Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);picker.addCategory(Intent.CATEGORY_OPENABLE);picker.setType("application/json");picker.putExtra(Intent.EXTRA_LOCAL_ONLY,true);startActivityForResult(picker,52);}catch(Exception e){activationRequestId=null;replyError(id,400,"เปิดตัวเลือกไฟล์ไม่ได้");}});return;}
   executor.submit(()->{JSONObject result=new JSONObject();try{JSONObject args=new JSONObject(raw),data;
    if(operation.equals("openWebsite")){runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://sc-stockday-ordering.onrender.com/#/"))));data=new JSONObject().put("ok",true);}
    else if(operation.equals("openDemo")){runOnUiThread(()->startActivity(new Intent(MainActivity.this,DemoActivity.class)));data=new JSONObject().put("ok",true);}
    else {if(operation.equals("logout")||operation.equals("login")||operation.equals("setCompanionGrant")||operation.equals("switchDeviceProfile"))scanningEnabled=false;data=api.execute(operation,args);if(operation.equals("login")||operation.equals("resume"))scanningEnabled=true;else if(operation.equals("logout")||operation.equals("setCompanionGrant")||operation.equals("switchDeviceProfile"))scanningEnabled=false;}
    if(operation.equals("annualExport")){saveAnnualExport(id,data);return;}
    result.put("ok",true).put("data",data);
   }catch(Exception e){try{int status=e instanceof StockDaySession.ApiError?((StockDaySession.ApiError)e).status:0;if(status==401)scanningEnabled=false;result.put("ok",false).put("status",status).put("code",e instanceof StockDaySession.ApiError?((StockDaySession.ApiError)e).code:"NETWORK_ERROR").put("error",status>0?e.getMessage():"เชื่อมต่อ StockDay ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");}catch(JSONException ignored){}}
   reply(id,result);});
  }
 }
 private void replyError(String id,int status,String message){try{reply(id,new JSONObject().put("ok",false).put("status",status).put("error",message));}catch(JSONException ignored){}}
 private void saveAnnualExport(String id,JSONObject data)throws Exception {
  final String filename=data.getString("filename");
  final byte[] bytes=android.util.Base64.decode(data.getString("base64"),android.util.Base64.DEFAULT);
  if(!filename.endsWith(".xlsx")||filename.contains("/")||filename.contains("\\")||
     bytes.length<4||bytes.length>3*1024*1024||bytes[0]!=80||bytes[1]!=75) {
   replyError(id,502,"ไฟล์ Excel ที่ได้รับไม่ถูกต้อง");
   return;
  }
  runOnUiThread(()->{
   if(annualExportId!=null){replyError(id,409,"กำลังเลือกที่เก็บไฟล์ Excel");return;}
   annualExportId=id;
   annualExportBytes=bytes;
   try{
    Intent picker=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    picker.addCategory(Intent.CATEGORY_OPENABLE);
    picker.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    picker.putExtra(Intent.EXTRA_TITLE,filename);
    startActivityForResult(picker,ANNUAL_EXPORT_REQUEST);
   }catch(Exception e){annualExportId=null;annualExportBytes=null;replyError(id,400,"เปิดตัวเลือกบันทึก Excel ไม่ได้");}
  });
 }
 private void finishAnnualExport(int result,Intent data) {
  final String id=annualExportId;
  final byte[] bytes=annualExportBytes;
  annualExportId=null;
  annualExportBytes=null;
  if(id==null||bytes==null)return;
  if(result!=RESULT_OK||data==null||data.getData()==null){replyError(id,400,"ยกเลิกการบันทึก Excel");return;}
  final Uri target=data.getData();
  executor.submit(()->{
   try{
    try(java.io.OutputStream out=getContentResolver().openOutputStream(target,"wt")){
     if(out==null)throw new java.io.IOException("Missing document stream");
     out.write(bytes);
    }
    reply(id,new JSONObject().put("ok",true).put("data",new JSONObject().put("saved",true)));
   }catch(Exception e){replyError(id,400,"เขียนไฟล์ Excel ไม่สำเร็จ");}
  });
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==ANNUAL_EXPORT_REQUEST){finishAnnualExport(result,data);return;}if(request==54){updater.installerReturned();return;}if(request!=52||activationRequestId==null)return;String id=activationRequestId;activationRequestId=null;if(result!=RESULT_OK||data==null||data.getData()==null){replyError(id,400,"ยกเลิกการเลือกไฟล์");return;}final android.net.Uri uri=data.getData();executor.submit(()->{try(java.io.InputStream in=getContentResolver().openInputStream(uri)){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buf=new byte[2048];int n;while((n=in.read(buf))!=-1){if(out.size()+n>16384)throw new Exception();out.write(buf,0,n);}JSONObject invitation=new JSONObject(new String(out.toByteArray(),java.nio.charset.StandardCharsets.UTF_8));JSONObject state=api.activate(invitation);reply(id,new JSONObject().put("ok",true).put("data",state));}catch(Exception e){replyError(id,e instanceof StockDaySession.ApiError?((StockDaySession.ApiError)e).status:400,e instanceof StockDaySession.ApiError?e.getMessage():"ไฟล์เชื่อมเครื่องไม่ถูกต้อง");}});}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==42&&scanner!=null)scanner.permissionResult(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED);}
 @Override protected void onPause(){if(scanner!=null)scanner.close();super.onPause();}
 @Override protected void onDestroy(){if(scanner!=null)scanner.destroy();executor.shutdownNow();updateExecutor.shutdownNow();if(updater!=null)updater.close();super.onDestroy();}
}
