package th.co.scgroup1989.scpda;
import org.json.*;
import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.util.*;
// Dedicated device proof, no operator token or stock privileges.
public final class AppCenterClient {
 public static final String SIGNER="3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a";
 private final StockDaySession.DeviceProof device;private final StockDaySession.Wire wire;
 public AppCenterClient(StockDaySession.DeviceProof d){this(d,new Wire());}
 AppCenterClient(StockDaySession.DeviceProof d,StockDaySession.Wire w){device=d;wire=w;}
 private JSONObject post(String path,JSONObject body)throws Exception{StockDaySession.Reply reply=wire.send("POST",path,body,Collections.<String,String>emptyMap(),new CookieManager(null,CookiePolicy.ACCEPT_NONE));if(reply.status!=200)throw new Exception(reply.data.optString("error","ตรวจอัปเดตไม่สำเร็จ"));if(!reply.data.optString("contract").equals("sc-app-center-v1"))throw new Exception("ข้อมูล App Center ไม่ถูกต้อง");return reply.data;}
 public JSONObject check(int installed)throws Exception{
  if(device.certificate()==null||device.certificate().isEmpty())return new JSONObject().put("updateAvailable",false).put("paired",false);
  JSONObject c=post("/api/app-center/device/challenge",new JSONObject().put("deviceCertificate",device.certificate()));String id=c.getString("challengeId"),nonce=c.getString("nonce"),ref=c.getString("deviceRef");
  if(!id.matches("[a-f0-9-]{36}")||!nonce.matches("[A-Za-z0-9_-]{43}")||!ref.matches("[a-f0-9]{64}"))throw new Exception("คำขอตรวจอัปเดตไม่ถูกต้อง");
  JSONObject result=post("/api/app-center/device/check",new JSONObject().put("deviceCertificate",device.certificate()).put("challengeId",id).put("installedVersionCode",installed).put("signature",device.sign("SC-APP-CENTER-V1\n"+id+"\n"+nonce+"\n"+ref+"\n"+installed)));
  JSONObject r=result.optJSONObject("release");if(r!=null){int code=r.getInt("versionCode"),size=r.getInt("sizeBytes");if(code<1||size<1024||size>16777216||r.getString("versionName").length()>100||!r.getString("sha256").matches("[a-f0-9]{64}")||!r.getString("signerSha256").equals(SIGNER))throw new Exception("รุ่นแอปไม่ถูกต้อง");if(result.optBoolean("updateAvailable")!=(code>installed))throw new Exception("เลขรุ่นไม่ตรงกัน");if(code>installed&&!validPath(result.optString("downloadPath")))throw new Exception("ลิงก์อัปเดตไม่ถูกต้อง");}else if(result.optBoolean("updateAvailable"))throw new Exception("ไม่พบรุ่นแอป");return result;
 }
 static boolean validPath(String path){return path!=null&&path.length()<2048&&path.matches("/api/app-center/releases/[a-f0-9-]{36}/apk\\?ticket=[A-Za-z0-9_.-]+$");}
 static HttpURLConnection connection(String path)throws Exception{if(!path.startsWith("/api/app-center/")||path.contains("\r")||path.contains("\n"))throw new Exception("ลิงก์ไม่ถูกต้อง");HttpURLConnection c=(HttpURLConnection)new URL(StockDaySession.ORIGIN+path).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(5000);c.setReadTimeout(10000);c.setRequestProperty("Cache-Control","no-store");return c;}
 private static final class Wire implements StockDaySession.Wire{
  public StockDaySession.Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager ignored)throws Exception{
   HttpURLConnection c=connection(path);try{c.setRequestMethod(method);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Content-Type","application/json; charset=utf-8");c.setDoOutput(true);byte[] raw=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(raw.length);try(OutputStream out=c.getOutputStream()){out.write(raw);}int status=c.getResponseCode();InputStream input=status>=400?c.getErrorStream():c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream();if(input!=null)try(InputStream in=input){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>65536)throw new Exception("ข้อมูลมากเกินไป");out.write(b,0,n);}}return new StockDaySession.Reply(status,new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8)));}finally{c.disconnect();}
  }
 }
}
