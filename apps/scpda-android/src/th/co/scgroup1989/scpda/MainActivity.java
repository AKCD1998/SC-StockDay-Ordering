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
 private final ExecutorService executor=Executors.newSingleThreadExecutor();private StockDaySession api;private String activationRequestId;private volatile boolean scanningEnabled=false;
 @Override public void onCreate(Bundle b){super.onCreate(b);api=new StockDaySession(new AndroidDevice(this));createView("scpda.html");}
 @Override protected void configure(){super.configure();web.addJavascriptInterface(new Bridge(),"SCPDAHost");}
 @Override public boolean onKeyDown(int code,KeyEvent e){if(code==KeyEvent.KEYCODE_VOLUME_UP&&scanningEnabled){if(e.getRepeatCount()==0&&web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('scpda-volume'));",null);return true;}return super.onKeyDown(code,e);}
 @Override public boolean onKeyUp(int code,KeyEvent e){if(code==KeyEvent.KEYCODE_VOLUME_UP&&scanningEnabled)return true;return super.onKeyUp(code,e);}
 private void reply(String id,JSONObject data){runOnUiThread(()->{if(web!=null&&!isFinishing())web.evaluateJavascript("window.__scpdaReceive("+JSONObject.quote(id)+","+data.toString()+");",null);});}
 private final class Bridge {
  @JavascriptInterface public void invoke(final String id,final String operation,final String raw){
   if(id==null||!id.matches("[0-9]{1,12}")||operation==null||raw==null||raw.length()>4096)return;
   if(operation.equals("activateDevice")){runOnUiThread(()->{if(activationRequestId!=null){replyError(id,409,"กำลังเลือกไฟล์เชื่อมเครื่อง");return;}activationRequestId=id;try{Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);picker.addCategory(Intent.CATEGORY_OPENABLE);picker.setType("application/json");picker.putExtra(Intent.EXTRA_LOCAL_ONLY,true);startActivityForResult(picker,52);}catch(Exception e){activationRequestId=null;replyError(id,400,"เปิดตัวเลือกไฟล์ไม่ได้");}});return;}
   executor.submit(()->{JSONObject result=new JSONObject();try{JSONObject args=new JSONObject(raw),data;
    if(operation.equals("openWebsite")){runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://sc-stockday-ordering.onrender.com/#/"))));data=new JSONObject().put("ok",true);}
    else if(operation.equals("openDemo")){runOnUiThread(()->startActivity(new Intent(MainActivity.this,DemoActivity.class)));data=new JSONObject().put("ok",true);}
    else {if(operation.equals("logout")||operation.equals("login"))scanningEnabled=false;data=api.execute(operation,args);if(operation.equals("login"))scanningEnabled=true;else if(operation.equals("logout"))scanningEnabled=false;}
    result.put("ok",true).put("data",data);
   }catch(Exception e){try{int status=e instanceof StockDaySession.ApiError?((StockDaySession.ApiError)e).status:0;if(status==401)scanningEnabled=false;result.put("ok",false).put("status",status).put("code",e instanceof StockDaySession.ApiError?((StockDaySession.ApiError)e).code:"NETWORK_ERROR").put("error",status>0?e.getMessage():"เชื่อมต่อ StockDay ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");}catch(JSONException ignored){}}
   reply(id,result);});
  }
 }
 private void replyError(String id,int status,String message){try{reply(id,new JSONObject().put("ok",false).put("status",status).put("error",message));}catch(JSONException ignored){}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request!=52||activationRequestId==null)return;String id=activationRequestId;activationRequestId=null;if(result!=RESULT_OK||data==null||data.getData()==null){replyError(id,400,"ยกเลิกการเลือกไฟล์");return;}final android.net.Uri uri=data.getData();executor.submit(()->{try(java.io.InputStream in=getContentResolver().openInputStream(uri)){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buf=new byte[2048];int n;while((n=in.read(buf))!=-1){if(out.size()+n>16384)throw new Exception();out.write(buf,0,n);}JSONObject invitation=new JSONObject(new String(out.toByteArray(),java.nio.charset.StandardCharsets.UTF_8));JSONObject state=api.activate(invitation);reply(id,new JSONObject().put("ok",true).put("data",state));}catch(Exception e){replyError(id,e instanceof StockDaySession.ApiError?((StockDaySession.ApiError)e).status:400,e instanceof StockDaySession.ApiError?e.getMessage():"ไฟล์เชื่อมเครื่องไม่ถูกต้อง");}});}
 @Override protected void onDestroy(){executor.shutdownNow();super.onDestroy();}
}
