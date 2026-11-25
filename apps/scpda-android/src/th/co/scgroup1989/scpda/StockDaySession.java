package th.co.scgroup1989.scpda;
import org.json.*;
import java.security.MessageDigest;
import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.util.*;
// Separate reader sessions, not StockDay web cookies. Private device keys remain
// in Android Keystore; admission certificates are public, PINs/tokens are not saved.
public final class StockDaySession {
 public static final String ORIGIN="https://paasrtsm-project.onrender.com",CONTRACT="scpda-read-001-v1";
 public interface Wire {Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager jar)throws Exception;}
 public interface DeviceProof {String publicKey()throws Exception;String deviceId();String certificate();void saveCertificate(String c);String sign(String text)throws Exception;default String dailySessionId(){return "";}default void saveDailySessionId(String id){} }
 public static final class Reply {public final int status;public final JSONObject data;public Reply(int s,JSONObject d){status=s;data=d;}}
 public static final class ApiError extends Exception {public final int status;public final String code;public ApiError(int s,String m){this(s,"REQUEST_REJECTED",m);}public ApiError(int s,String c,String m){super(m);status=s;code=c;}}
 private final Wire wire;private final DeviceProof device;private final CookieManager emptyJar=new CookieManager(null,CookiePolicy.ACCEPT_NONE);private String token,countToken,branch="001";private final int versionCode;
 public StockDaySession(DeviceProof d){this(new HttpsWire(),d,0);}public StockDaySession(DeviceProof d,int version){this(new HttpsWire(),d,version);}StockDaySession(Wire w,DeviceProof d){this(w,d,16);}StockDaySession(Wire w,DeviceProof d,int version){wire=w;device=d;versionCode=version;}
 public synchronized JSONObject execute(String operation,JSONObject args)throws Exception{
  if(operation.equals("status"))return status();
  if(operation.equals("login"))return login(args);
  if(operation.equals("dailyPolicy"))return dailyPolicy();
  if(operation.equals("resume"))return resume();
  if(operation.equals("logout")){try{if(token!=null)call("POST","/api/scpda/auth/logout",new JSONObject(),true);}finally{token=null;countToken=null;device.saveDailySessionId("");}return new JSONObject().put("ok",true);}
  if(token==null)throw new ApiError(401,"LOGIN_REQUIRED","เข้าสู่ระบบ SCPDA ก่อน");
  if(operation.equals("createCompanionQr"))return createCompanionQr(args);
  if(operation.equals("companionDevices"))return call("GET","/api/scpda/daily/companions",null,true);
  if(operation.equals("dailySelfie"))return call("GET","/api/scpda/daily/selfie",null,true);
  if(operation.equals("annualOverview"))return call("GET","/api/scpda/annual",null,true);
  if(operation.equals("annualRequest"))return call("POST","/api/scpda/annual/request",args,true);
  if(operation.equals("annualAssign"))return call("POST","/api/scpda/annual/assign",args,true);
  if(operation.equals("annualSave"))return call("POST","/api/scpda/annual/save",args,true);
  if(operation.equals("annualExport"))return call("POST","/api/scpda/annual/export",args,true);
  if(operation.equals("internalPickSubmit"))return countCall("POST","/api/scpda/counts/internal-picks",args,countToken);
  if(operation.equals("internalPickHistory"))return countCall("GET","/api/scpda/counts/internal-picks/history",null,countToken);
  if(operation.equals("countCapabilities"))return countCall("GET","/api/scpda/counts/capabilities",null,countToken);
  if(operation.equals("countCheck"))return countCall("POST","/api/scpda/counts/check",args,countToken);
  if(operation.equals("countSubmit"))return countCall("POST","/api/scpda/counts",args,countToken);
  if(operation.equals("countHistory"))return countCall("GET","/api/scpda/counts/history",null,countToken);
  if(operation.equals("countReceipt")){String id=text(args,"id",36);if(!id.matches("[a-fA-F0-9-]{36}"))throw new ApiError(400,"รหัสผลนับไม่ถูกต้อง");return countCall("GET","/api/scpda/counts/events/"+id,null,countToken);}
  if(operation.equals("products"))return call("GET","/api/scpda/products?keyword="+encoded(text(args,"keyword",160))+"&limit=200&offset=0",null,true);
  if(operation.equals("product")){String id=text(args,"skuId",15);if(!id.matches("[1-9][0-9]*"))throw new ApiError(400,"SKU ไม่ถูกต้อง");return call("GET","/api/scpda/products/"+id,null,true);}
  if(operation.equals("stock"))return call("GET","/api/scpda/stock?search="+encoded(text(args,"search",160))+"&limit=200&offset=0",null,true);
  throw new ApiError(400,"แอปนี้รองรับเฉพาะการตรวจสินค้า");
 }
 public synchronized JSONObject status()throws Exception{boolean paired=false;String bound=null,expires=null,c=device.certificate();try{JSONObject p=new JSONObject(new String(Base64.getUrlDecoder().decode(c.split("\\.")[1]),StandardCharsets.UTF_8));String b=p.optString("branch_code");paired=(b.equals("001")||b.equals("004")||b.equals("005"))&&p.optString("public_key").equals(device.publicKey())&&p.optString("device_id").equals(device.deviceId())&&p.optLong("exp",0)>System.currentTimeMillis()/1000;if(paired){branch=b;bound=p.optString("operator_code",null);}expires=java.time.Instant.ofEpochSecond(p.optLong("exp",0)).toString();}catch(Exception ignored){}return new JSONObject().put("contract","scpda-read-"+branch+"-v1").put("branchCode",branch).put("paired",paired).put("operatorCode",bound==null?JSONObject.NULL:bound).put("dailyResumeAvailable",!device.dailySessionId().isEmpty()).put("expiresAt",expires==null?JSONObject.NULL:expires);}
 public synchronized JSONObject activate(JSONObject invitation)throws Exception{
  if(!invitation.optString("contract").equals("scpda-device-invitation-v1")||!(invitation.optString("branchCode").equals("001")||invitation.optString("branchCode").equals("004")||invitation.optString("branchCode").equals("005"))||!invitation.optString("apiOrigin").equals(ORIGIN))throw new ApiError(400,"ไฟล์เชื่อมเครื่องไม่ถูกต้อง");
  branch=invitation.getString("branchCode");JSONObject r=call("POST","/api/scpda/device/pair",new JSONObject().put("invitationId",text(invitation,"invitationId",100)).put("code",text(invitation,"activationCode",200)).put("publicKey",device.publicKey()).put("deviceId",device.deviceId()),false);
  String cert=r.optString("deviceCertificate","");if(cert.isEmpty())throw new ApiError(502,"ระบบไม่ส่งใบยืนยันเครื่อง");device.saveCertificate(cert);JSONObject state=status();if(!state.optBoolean("paired"))throw new ApiError(502,"ใบยืนยันเครื่องไม่ตรงกัน");return state;
 }
 private JSONObject login(JSONObject args)throws Exception{
  token=null;countToken=null;if(!status().optBoolean("paired"))throw new ApiError(409,"DEVICE_ACTIVATION_REQUIRED","เลือกไฟล์เชื่อมเครื่องก่อนเริ่มใช้งาน");String user=text(args,"username",16);Object raw=args.opt("password");if(!(raw instanceof String))throw new ApiError(400,"เลือกผู้ใช้งานและกรอกรหัสผ่าน");String pin=(String)raw;if(!user.matches("(?:0[123]001|01004|01004SHPEE|01005)")||!(pin.matches("[0-9]{4}")||pin.matches("[!-~]{6,64}")))throw new ApiError(400,"เลือกผู้ใช้งานและกรอกรหัสผ่าน");
  if(!((user.equals("01004")||user.equals("01004SHPEE"))?"004":user.equals("01005")?"005":"001").equals(branch))throw new ApiError(403,"DEVICE_BRANCH_MISMATCH","บัญชีไม่ตรงกับสาขาของเครื่อง");try{String cert=device.certificate();JSONObject c=call("POST","/api/scpda/auth/challenge",new JSONObject().put("deviceCertificate",cert),false);String message="SCPDA-LOGIN-V1\n"+c.getString("challengeId")+"\n"+c.getString("nonce")+"\n"+user+"\n"+c.getString("deviceRef");
   JSONObject r=call("POST","/api/scpda/auth/login",new JSONObject().put("operatorCode",user).put("pin",pin).put("deviceCertificate",cert).put("challengeId",c.getString("challengeId")).put("signature",device.sign(message)),false);token=r.optString("token","");JSONObject u=r.optJSONObject("user");if(token.isEmpty()||u==null||!u.optString("operatorCode").equals(user)||!u.optString("branchCode").equals(branch)||!u.optString("role").equals("reader"))throw new ApiError(502,"ข้อมูลบัญชี SCPDA ไม่ตรงกัน");
   if((user.equals("01005")||user.equals("01004")||user.equals("01004SHPEE"))&&dailyPolicy().optBoolean("enabled")){
    String image=args.optString("selfie","");String imageHash=sha256Image(image);JSONObject challenge=call("POST","/api/scpda/daily/primary/challenge",new JSONObject(),true);
    String parent=sessionId(),proof="SCPDA-DAILY-PRIMARY-V1\n"+challenge.getString("challengeId")+"\n"+challenge.getString("nonce")+"\n"+parent+"\n"+imageHash+"\n"+versionCode;
    JSONObject daily=call("POST","/api/scpda/daily/primary/start",new JSONObject().put("deviceCertificate",cert).put("challengeId",challenge.getString("challengeId")).put("selfie",image).put("versionCode",versionCode).put("signature",device.sign(proof)),true);token=daily.getString("token");device.saveDailySessionId(daily.getString("dailySessionId"));
   }
   JSONObject me=call("GET","/api/scpda/session",null,true);if(me.optBoolean("officialStockWrites",true)||me.optBoolean("countSubmissionAvailable",true)||!me.getJSONObject("user").optString("operatorCode").equals(user))throw new ApiError(502,"ขอบเขตเซสชันไม่ตรงกัน");try{negotiateCountAccess(user);}catch(Exception unavailable){countToken=null;}me.put("countUploadAvailable",countToken!=null);return me;
  }catch(Exception e){token=null;countToken=null;throw e;}
 }
 private JSONObject dailyPolicy()throws Exception{if(!branch.equals("005")&&!branch.equals("004"))return new JSONObject().put("enabled",false);try{return call("GET","/api/scpda/daily/policy?branchCode="+branch,null,false);}catch(ApiError e){if(e.status==404||e.status==405)return new JSONObject().put("enabled",false);throw e;}}
 private String sessionId()throws Exception{if(token==null)throw new ApiError(401,"LOGIN_REQUIRED","เข้าสู่ระบบก่อน");return new JSONObject(new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]),StandardCharsets.UTF_8)).getString("jti");}
 private static String sha256Image(String image)throws Exception{if(!image.startsWith("data:image/jpeg;base64,")||image.length()>273072)throw new ApiError(400,"SELFIE_REQUIRED","ถ่ายเซลฟี่ก่อนเริ่มงาน");byte[] digest=MessageDigest.getInstance("SHA-256").digest(Base64.getDecoder().decode(image.substring(23)));StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
 private JSONObject createCompanionQr(JSONObject args)throws Exception{JSONObject c=call("POST","/api/scpda/daily/qr/challenge",new JSONObject(),true);String target=args.optString("target","");if(target.length()>16)throw new ApiError(400,"เลือกเครื่องย่อยให้ถูกต้อง");String proof=(target.isEmpty()?"SCPDA-COMPANION-QR-V1":"SCPDA-COMPANION-QR-V2")+"\n"+c.getString("challengeId")+"\n"+c.getString("nonce")+"\n"+sessionId()+"\n"+versionCode+(target.isEmpty()?"":"\n"+target);JSONObject body=new JSONObject().put("deviceCertificate",device.certificate()).put("challengeId",c.getString("challengeId")).put("versionCode",versionCode).put("signature",device.sign(proof));if(!target.isEmpty())body.put("target",target);return call("POST","/api/scpda/daily/qr",body,true);}

 private JSONObject resume()throws Exception{status();String id=device.dailySessionId();if((!branch.equals("005")&&!branch.equals("004"))||id.isEmpty())throw new ApiError(401,"DAILY_LOGIN_REQUIRED","เข้าสู่ระบบสำหรับวันนี้");try{JSONObject c=call("POST","/api/scpda/daily/resume/challenge",new JSONObject().put("sessionId",id),false);String proof="SCPDA-DAILY-RESUME-V2\n"+c.getString("challengeId")+"\n"+c.getString("nonce")+"\n"+id+"\n"+versionCode;JSONObject r=call("POST","/api/scpda/daily/resume",new JSONObject().put("sessionId",id).put("challengeId",c.getString("challengeId")).put("versionCode",versionCode).put("signature",device.sign(proof)),false);JSONObject u=r.getJSONObject("user");String user=u.optString("operatorCode");if(!(branch.equals("005")?user.equals("01005"):(user.equals("01004")||user.equals("01004SHPEE")))||!r.optString("dailySessionId").equals(id))throw new ApiError(502,"IDENTITY_INVALID","ข้อมูลเครื่องหลักไม่ตรงกัน");token=r.getString("token");JSONObject me=call("GET","/api/scpda/session",null,true);try{negotiateCountAccess(user);}catch(Exception unavailable){countToken=null;}return me.put("countUploadAvailable",countToken!=null);}catch(Exception e){token=null;countToken=null;throw e;}}
 private void negotiateCountAccess(String user)throws Exception{
  JSONObject admission=countCall("GET","/api/scpda/counts/admission",null,token);if(!admission.optBoolean("canRequestCountAccess"))return;
  JSONObject c=countCall("POST","/api/scpda/counts/access/challenge",new JSONObject().put("deviceCertificate",device.certificate()),token);
  if(!c.optString("operatorCode").equals(user))throw new ApiError(502,"บัญชีสิทธิ์นับไม่ตรงกัน");
  String message="SCPDA-COUNT-ACCESS-V1\n"+c.getString("challengeId")+"\n"+c.getString("nonce")+"\n"+user+"\n"+c.getString("deviceRef")+"\n"+c.getString("parentSessionId");
  JSONObject r=countCall("POST","/api/scpda/counts/access/authorize",new JSONObject().put("deviceCertificate",device.certificate()).put("challengeId",c.getString("challengeId")).put("signature",device.sign(message)),token);
  if(!r.optString("operatorCode").equals(user)||r.optString("countToken").isEmpty())throw new ApiError(502,"สิทธิ์นับไม่ครบ");countToken=r.getString("countToken");
  if(!countCall("GET","/api/scpda/counts/capabilities",null,countToken).optBoolean("canSubmit"))countToken=null;
 }
 private JSONObject countCall(String method,String path,JSONObject body,String bearer)throws Exception{
  if(bearer==null)throw new ApiError(401,"COUNT_ACCESS_REQUIRED","ยังไม่เชื่อมระบบรับผลนับ");Map<String,String> h=new HashMap<>();h.put("Authorization","Bearer "+bearer);Reply r=wire.send(method,path,body,h,emptyJar);
  if(r.status<200||r.status>=300){if(r.status==401&&bearer.equals(countToken))countToken=null;throw new ApiError(r.status,r.data.optString("code","COUNT_REJECTED"),r.data.optString("error","ระบบรับผลนับยังไม่พร้อม"));}
  if(!r.data.optString("contract").equals("scpda-counts-"+branch+"-v1")||!r.data.optString("branchCode").equals(branch))throw new ApiError(502,"COUNT_CONTRACT","ข้อมูลผลนับตอบกลับไม่ตรงกัน");return r.data;
 }
 private JSONObject call(String method,String path,JSONObject body,boolean authenticated)throws Exception{
  Map<String,String> headers=new HashMap<>();if(authenticated){if(token==null)throw new ApiError(401,"LOGIN_REQUIRED","เข้าสู่ระบบ SCPDA ก่อน");headers.put("Authorization","Bearer "+token);}Reply r=wire.send(method,path,body,headers,emptyJar);if(r.status<200||r.status>=300){if(r.status==401&&authenticated)token=null;throw new ApiError(r.status,r.data.optString("code","REQUEST_REJECTED"),r.data.optString("error","ระบบตอบกลับ HTTP "+r.status));}if(!r.data.optString("contract").equals("scpda-read-"+branch+"-v1")||!r.data.optString("branchCode").equals(branch))throw new ApiError(502,"SCPDA_CONTRACT","ระบบ SCPDA ตอบกลับไม่ตรงกัน");return r.data;
 }
 private static String text(JSONObject a,String key,int max)throws Exception{Object v=a.opt(key);if(!(v instanceof String)||((String)v).trim().isEmpty()||((String)v).length()>max)throw new ApiError(400,"ข้อมูลไม่ถูกต้อง");return ((String)v).trim();}
 private static String encoded(String s)throws Exception{return URLEncoder.encode(s,"UTF-8");}
 private static final class HttpsWire implements Wire {
  public Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager jar) throws Exception {
   URL url=new URL(ORIGIN+path);if(!url.getProtocol().equals("https")||!url.getHost().equals("paasrtsm-project.onrender.com")||!path.startsWith("/"))throw new ApiError(400,"API origin rejected");
   HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setRequestMethod(method);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-store");c.setRequestProperty("User-Agent","SCPDA-Android/0.4.0");
   for(Map.Entry<String,List<String>> h:jar.get(url.toURI(),Collections.<String,List<String>>emptyMap()).entrySet())c.setRequestProperty(h.getKey(),join(h.getValue()));for(Map.Entry<String,String> h:headers.entrySet())c.setRequestProperty(h.getKey(),h.getValue());
   try{if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");byte[] b=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(b.length);try(OutputStream o=c.getOutputStream()){o.write(b);}}
    int code=c.getResponseCode();jar.put(url.toURI(),c.getHeaderFields());if(code>=300&&code<400)throw new ApiError(code,"ระบบเปลี่ยนเส้นทาง กรุณาตรวจการเชื่อมต่อ");InputStream stream=code>=400?c.getErrorStream():c.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(stream!=null)try(InputStream in=stream){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>4*1024*1024)throw new ApiError(502,"ข้อมูลตอบกลับมากเกินไป");bytes.write(buf,0,n);}}
    try{return new Reply(code,new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)));}catch(JSONException e){throw new ApiError(code>=400?code:502,"เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง");}
   }finally{c.disconnect();}
  }
  private static String join(List<String> v){StringBuilder b=new StringBuilder();for(String s:v){if(b.length()>0)b.append("; ");b.append(s);}return b.toString();}
 }
}
