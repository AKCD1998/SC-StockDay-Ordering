package th.co.scgroup1989.scpda;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

// Existing web-session authentication, memory only. No DB/JWT/sync keys.
// The APK cannot request inventory/count writes: only the operations below exist.
public final class StockDaySession {
 public static final String ORIGIN="https://paasrtsm-project.onrender.com";
 public interface Wire { Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager jar) throws Exception; }
 public static final class Reply { public final int status;public final JSONObject data;public Reply(int s,JSONObject d){status=s;data=d;} }
 public static final class ApiError extends Exception {public final int status;public ApiError(int s,String m){super(m);status=s;}}
 private final Wire wire;private CookieManager cookies=new CookieManager(null,CookiePolicy.ACCEPT_ORIGINAL_SERVER);private JSONObject user;private String csrf;
 public StockDaySession(){this(new HttpsWire());}
 StockDaySession(Wire w){wire=w;}
 public synchronized JSONObject execute(String operation,JSONObject args) throws Exception {
  if(operation.equals("login"))return login(args);
  if(operation.equals("logout")){try{if(user!=null)call("POST","/admin/auth/logout",new JSONObject(),true);}finally{clear();}return new JSONObject().put("ok",true);}
  if(user==null)throw new ApiError(401,"เข้าสู่ระบบ StockDay ก่อน");
  if(operation.equals("products"))return call("GET","/admin/products?keyword="+encoded(text(args,"keyword",160))+"&limit=200&offset=0",null,false);
  if(operation.equals("product")){String id=text(args,"skuId",18);if(!id.matches("[1-9][0-9]*"))throw new ApiError(400,"SKU ไม่ถูกต้อง");return call("GET","/admin/products/"+id,null,false);}
  if(operation.equals("stock"))return call("GET","/api/branch-stock?search="+encoded(text(args,"search",160))+"&limit=200&offset=0",null,false);
  throw new ApiError(400,"แอปนี้รองรับเฉพาะการตรวจสินค้า");
 }
 private JSONObject login(JSONObject args) throws Exception {
  clear();String name=text(args,"username",200),pass=args.optString("password","");if(pass.length()==0||pass.length()>1000)throw new ApiError(400,"กรอกรหัสผ่าน StockDay");
  try{JSONObject result=call("POST","/admin/auth/login",new JSONObject().put("username",name).put("password",pass),false);csrf=result.optString("csrf_token","");JSONObject me=call("GET","/admin/me",null,false);JSONObject u=me.optJSONObject("user");String branch=u==null?"":u.optString("effective_branch_code",u.optString("branch_code",""));
   if(u==null||!u.optString("role").equals("branch")||!branch.equals("001")){try{call("POST","/admin/auth/logout",new JSONObject(),true);}finally{clear();}throw new ApiError(403,"ใช้บัญชี StockDay ของสาขา 001 สำหรับรุ่นทดสอบนี้");}
   if(csrf.length()==0)throw new ApiError(502,"ระบบไม่ส่งข้อมูลยืนยันเซสชัน");user=u;return new JSONObject().put("ok",true).put("user",u);
  }catch(Exception e){clear();throw e;}
 }
 private JSONObject call(String method,String path,JSONObject body,boolean protect) throws Exception {
  Map<String,String> headers=new HashMap<>();if(protect&&csrf!=null)headers.put("X-CSRF-Token",csrf);
  Reply r=wire.send(method,path,body,headers,cookies);if(r.status<200||r.status>=300){if(r.status==401)clear();throw new ApiError(r.status,r.data.optString("error",r.data.optString("message","ระบบตอบกลับ HTTP "+r.status)));}return r.data;
 }
 private void clear(){user=null;csrf=null;cookies.getCookieStore().removeAll();}
 private static String text(JSONObject a,String key,int max) throws Exception {Object value=a.opt(key);if(!(value instanceof String)||((String)value).trim().length()==0||((String)value).length()>max)throw new ApiError(400,"ข้อมูล "+key+" ไม่ถูกต้อง");return ((String)value).trim();}
 private static String encoded(String s) throws Exception {return URLEncoder.encode(s,"UTF-8");}
 private static final class HttpsWire implements Wire {
  public Reply send(String method,String path,JSONObject body,Map<String,String> headers,CookieManager jar) throws Exception {
   URL url=new URL(ORIGIN+path);if(!url.getProtocol().equals("https")||!url.getHost().equals("paasrtsm-project.onrender.com")||!path.startsWith("/"))throw new ApiError(400,"API origin rejected");
   HttpURLConnection c=(HttpURLConnection)url.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setRequestMethod(method);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-store");c.setRequestProperty("User-Agent","SCPDA-Android/0.1.0");
   for(Map.Entry<String,List<String>> h:jar.get(url.toURI(),Collections.<String,List<String>>emptyMap()).entrySet())c.setRequestProperty(h.getKey(),join(h.getValue()));for(Map.Entry<String,String> h:headers.entrySet())c.setRequestProperty(h.getKey(),h.getValue());
   try{if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");byte[] b=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(b.length);try(OutputStream o=c.getOutputStream()){o.write(b);}}
    int code=c.getResponseCode();jar.put(url.toURI(),c.getHeaderFields());if(code>=300&&code<400)throw new ApiError(code,"ระบบเปลี่ยนเส้นทาง กรุณาตรวจการเชื่อมต่อ");InputStream stream=code>=400?c.getErrorStream():c.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(stream!=null)try(InputStream in=stream){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(bytes.size()+n>4*1024*1024)throw new ApiError(502,"ข้อมูลตอบกลับมากเกินไป");bytes.write(buf,0,n);}}
    try{return new Reply(code,new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)));}catch(JSONException e){throw new ApiError(code>=400?code:502,"เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง");}
   }finally{c.disconnect();}
  }
  private static String join(List<String> v){StringBuilder b=new StringBuilder();for(String s:v){if(b.length()>0)b.append("; ");b.append(s);}return b.toString();}
 }
}
