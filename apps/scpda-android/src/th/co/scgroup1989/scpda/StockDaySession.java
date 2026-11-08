package th.co.scgroup1989.scpda;
import org.json.*;
import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.util.*;
// Separate reader sessions, not StockDay web cookies. Private device keys remain
// in Android Keystore; admission certificates are public, PINs/tokens are not saved.
public final class StockDaySession {
 public static final String ORIGIN="https://paasrtsm-project.onrender.com",CONTRACT="scpda-read-001-v1";
 public interface Wire {Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager jar)throws Exception;}
 public interface DeviceProof {String publicKey()throws Exception;String deviceId();String certificate();void saveCertificate(String c);String sign(String text)throws Exception;}
 public static final class Reply {public final int status;public final JSONObject data;public Reply(int s,JSONObject d){status=s;data=d;}}
 public static final class ApiError extends Exception {public final int status;public final String code;public ApiError(int s,String m){this(s,"REQUEST_REJECTED",m);}public ApiError(int s,String c,String m){super(m);status=s;code=c;}}
 private final Wire wire;private final DeviceProof device;private final CookieManager emptyJar=new CookieManager(null,CookiePolicy.ACCEPT_NONE);private String token;
 public StockDaySession(DeviceProof d){this(new HttpsWire(),d);}StockDaySession(Wire w,DeviceProof d){wire=w;device=d;}
 public synchronized JSONObject execute(String operation,JSONObject args)throws Exception{
  if(operation.equals("status"))return status();
  if(operation.equals("login"))return login(args);
  if(operation.equals("logout")){try{if(token!=null)call("POST","/api/scpda/auth/logout",new JSONObject(),true);}finally{token=null;}return new JSONObject().put("ok",true);}
  if(token==null)throw new ApiError(401,"LOGIN_REQUIRED","เข้าสู่ระบบ SCPDA ก่อน");
  if(operation.equals("products"))return call("GET","/api/scpda/products?keyword="+encoded(text(args,"keyword",160))+"&limit=200&offset=0",null,true);
  if(operation.equals("product")){String id=text(args,"skuId",15);if(!id.matches("[1-9][0-9]*"))throw new ApiError(400,"SKU ไม่ถูกต้อง");return call("GET","/api/scpda/products/"+id,null,true);}
  if(operation.equals("stock"))return call("GET","/api/scpda/stock?search="+encoded(text(args,"search",160))+"&limit=200&offset=0",null,true);
  throw new ApiError(400,"แอปนี้รองรับเฉพาะการตรวจสินค้า");
 }
 public synchronized JSONObject status()throws Exception{boolean paired=false;String expires=null,c=device.certificate();try{JSONObject p=new JSONObject(new String(Base64.getUrlDecoder().decode(c.split("\\.")[1]),StandardCharsets.UTF_8));paired=p.optString("public_key").equals(device.publicKey())&&p.optString("device_id").equals(device.deviceId())&&p.optLong("exp",0)>System.currentTimeMillis()/1000;expires=java.time.Instant.ofEpochSecond(p.optLong("exp",0)).toString();}catch(Exception ignored){}return new JSONObject().put("contract",CONTRACT).put("branchCode","001").put("paired",paired).put("expiresAt",expires==null?JSONObject.NULL:expires);}
 public synchronized JSONObject activate(JSONObject invitation)throws Exception{
  if(!invitation.optString("contract").equals("scpda-device-invitation-v1")||!invitation.optString("branchCode").equals("001")||!invitation.optString("apiOrigin").equals(ORIGIN))throw new ApiError(400,"ไฟล์เชื่อมเครื่องไม่ถูกต้อง");
  JSONObject r=call("POST","/api/scpda/device/pair",new JSONObject().put("invitationId",text(invitation,"invitationId",100)).put("code",text(invitation,"activationCode",200)).put("publicKey",device.publicKey()).put("deviceId",device.deviceId()),false);
  String cert=r.optString("deviceCertificate","");if(cert.isEmpty())throw new ApiError(502,"ระบบไม่ส่งใบยืนยันเครื่อง");device.saveCertificate(cert);JSONObject state=status();if(!state.optBoolean("paired"))throw new ApiError(502,"ใบยืนยันเครื่องไม่ตรงกัน");return state;
 }
 private JSONObject login(JSONObject args)throws Exception{
  token=null;if(!status().optBoolean("paired"))throw new ApiError(409,"DEVICE_ACTIVATION_REQUIRED","เลือกไฟล์เชื่อมเครื่องก่อนเริ่มใช้งาน");String user=text(args,"username",5),pin=text(args,"password",4);if(!user.matches("0[123]001")||!pin.matches("[0-9]{4}"))throw new ApiError(400,"เลือกผู้ใช้งานและกรอก PIN 4 หลัก");
  try{String cert=device.certificate();JSONObject c=call("POST","/api/scpda/auth/challenge",new JSONObject().put("deviceCertificate",cert),false);String message="SCPDA-LOGIN-V1\n"+c.getString("challengeId")+"\n"+c.getString("nonce")+"\n"+user+"\n"+c.getString("deviceRef");
   JSONObject r=call("POST","/api/scpda/auth/login",new JSONObject().put("operatorCode",user).put("pin",pin).put("deviceCertificate",cert).put("challengeId",c.getString("challengeId")).put("signature",device.sign(message)),false);token=r.optString("token","");JSONObject u=r.optJSONObject("user");if(token.isEmpty()||u==null||!u.optString("operatorCode").equals(user)||!u.optString("branchCode").equals("001")||!u.optString("role").equals("reader"))throw new ApiError(502,"ข้อมูลบัญชี SCPDA ไม่ตรงกัน");
   JSONObject me=call("GET","/api/scpda/session",null,true);if(me.optBoolean("officialStockWrites",true)||me.optBoolean("countSubmissionAvailable",true)||!me.getJSONObject("user").optString("operatorCode").equals(user))throw new ApiError(502,"ขอบเขตเซสชันไม่ตรงกัน");return me;
  }catch(Exception e){token=null;throw e;}
 }
 private JSONObject call(String method,String path,JSONObject body,boolean authenticated)throws Exception{
  Map<String,String> headers=new HashMap<>();if(authenticated){if(token==null)throw new ApiError(401,"LOGIN_REQUIRED","เข้าสู่ระบบ SCPDA ก่อน");headers.put("Authorization","Bearer "+token);}Reply r=wire.send(method,path,body,headers,emptyJar);if(r.status<200||r.status>=300){if(r.status==401&&authenticated)token=null;throw new ApiError(r.status,r.data.optString("code","REQUEST_REJECTED"),r.data.optString("error","ระบบตอบกลับ HTTP "+r.status));}if(!r.data.optString("contract").equals(CONTRACT)||!r.data.optString("branchCode").equals("001"))throw new ApiError(502,"SCPDA_CONTRACT","ระบบ SCPDA ตอบกลับไม่ตรงกัน");return r.data;
 }
 private static String text(JSONObject a,String key,int max)throws Exception{Object v=a.opt(key);if(!(v instanceof String)||((String)v).trim().isEmpty()||((String)v).length()>max)throw new ApiError(400,"ข้อมูลไม่ถูกต้อง");return ((String)v).trim();}
 private static String encoded(String s)throws Exception{return URLEncoder.encode(s,"UTF-8");}
 private static final class HttpsWire implements Wire {
  public Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager jar) throws Exception {
   URL url=new URL(ORIGIN+path);if(!url.getProtocol().equals("https")||!url.getHost().equals("paasrtsm-project.onrender.com")||!path.startsWith("/"))throw new ApiError(400,"API origin rejected");
   HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setRequestMethod(method);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-store");c.setRequestProperty("User-Agent","SCPDA-Android/0.2.0");
   for(Map.Entry<String,List<String>> h:jar.get(url.toURI(),Collections.<String,List<String>>emptyMap()).entrySet())c.setRequestProperty(h.getKey(),join(h.getValue()));for(Map.Entry<String,String> h:headers.entrySet())c.setRequestProperty(h.getKey(),h.getValue());
   try{if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");byte[] b=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(b.length);try(OutputStream o=c.getOutputStream()){o.write(b);}}
    int code=c.getResponseCode();jar.put(url.toURI(),c.getHeaderFields());if(code>=300&&code<400)throw new ApiError(code,"ระบบเปลี่ยนเส้นทาง กรุณาตรวจการเชื่อมต่อ");InputStream stream=code>=400?c.getErrorStream():c.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(stream!=null)try(InputStream in=stream){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>4*1024*1024)throw new ApiError(502,"ข้อมูลตอบกลับมากเกินไป");bytes.write(buf,0,n);}}
    try{return new Reply(code,new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)));}catch(JSONException e){throw new ApiError(code>=400?code:502,"เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง");}
   }finally{c.disconnect();}
  }
  private static String join(List<String> v){StringBuilder b=new StringBuilder();for(String s:v){if(b.length()>0)b.append("; ");b.append(s);}return b.toString();}
 }
}
