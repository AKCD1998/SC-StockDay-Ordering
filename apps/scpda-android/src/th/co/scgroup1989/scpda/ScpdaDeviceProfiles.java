package th.co.scgroup1989.scpda;

import org.json.*;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/** Public admission certificates/day IDs; no operator passwords or bearer tokens. */
public final class ScpdaDeviceProfiles {
 public static JSONObject identity(String cert){try{
  JSONObject payload=new JSONObject(new String(Base64.getUrlDecoder().decode(cert.split("\\.")[1]),StandardCharsets.UTF_8));
  String branch=payload.optString("branch_code"),operator=payload.optString("operator_code","primary");
  if(!(branch.equals("001")||branch.equals("004")||branch.equals("005"))||!(operator.equals("primary")||operator.matches("[0-9]{5,7}(SHPEE)?")))return null;
  return new JSONObject().put("key",branch+":"+operator).put("branchCode",branch).put("operatorCode",operator.equals("primary")?JSONObject.NULL:operator);
 }catch(Exception invalid){return null;}}
 public static JSONObject remember(JSONObject profiles,String cert,String daily)throws Exception{
  JSONObject next=new JSONObject(profiles.toString()),id=identity(cert);
  if(id!=null)next.put(id.getString("key"),new JSONObject().put("certificate",cert).put("dailySessionId",daily));
  return next;
 }
 public static JSONArray records(JSONObject profiles,String current)throws Exception{
  JSONObject active=identity(current);JSONArray rows=new JSONArray();Iterator<String> keys=profiles.keys();
  while(keys.hasNext()){String key=keys.next();JSONObject value=profiles.getJSONObject(key),id=identity(value.optString("certificate"));
   if(id!=null&&id.getString("key").equals(key))rows.put(id.put("active",active!=null&&active.getString("key").equals(key)).put("dailyResumeAvailable",!value.optString("dailySessionId").isEmpty()));
  }return rows;
 }
 private ScpdaDeviceProfiles(){}
}
