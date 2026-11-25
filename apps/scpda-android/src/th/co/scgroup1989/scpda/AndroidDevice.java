package th.co.scgroup1989.scpda;
import android.content.*;import android.security.keystore.*;import java.security.*;import java.security.spec.ECGenParameterSpec;import java.util.*;import org.json.*;
// Non-exportable signing key. The stored admission certificate is public and
// unusable without a fresh signature from this installation's private key.
public final class AndroidDevice implements StockDaySession.DeviceProof {
 private static final String ALIAS="scpda-001-device-v1";private final android.content.SharedPreferences prefs;
 public AndroidDevice(Context context){prefs=context.getSharedPreferences("scpda-device",Context.MODE_PRIVATE);if(!prefs.contains("id"))if(!prefs.edit().putString("id",UUID.randomUUID().toString()).commit())throw new IllegalStateException("บันทึกตัวตนเครื่องไม่สำเร็จ");}
 private KeyStore keys()throws Exception{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);if(!k.containsAlias(ALIAS)){KeyPairGenerator g=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");g.initialize(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256).build());g.generateKeyPair();}return k;}
 public String publicKey()throws Exception{return Base64.getEncoder().encodeToString(keys().getCertificate(ALIAS).getPublicKey().getEncoded());}
 private JSONObject profilesSaved()throws Exception{return ScpdaDeviceProfiles.remember(new JSONObject(prefs.getString("profiles-v1","{}")),certificate(),dailySessionId());}
 private void persist(String cert,String daily,JSONObject profiles)throws Exception{if(!prefs.edit().putString("certificate",cert).putString("dailySessionId",daily).putString("profiles-v1",profiles.toString()).commit())throw new Exception("บันทึกการเชื่อมต่อในเครื่องไม่สำเร็จ");}
 public String deviceId(){return prefs.getString("id","");}
 public synchronized String certificate(){return prefs.getString("certificate","");}
 public synchronized void saveCertificate(String cert){try{JSONObject profiles=profilesSaved(),id=ScpdaDeviceProfiles.identity(cert),old=ScpdaDeviceProfiles.identity(certificate());String key=id==null?"":id.getString("key");String daily=old!=null&&old.getString("key").equals(key)?dailySessionId():profiles.optJSONObject(key)==null?"":profiles.getJSONObject(key).optString("dailySessionId");persist(cert,daily,ScpdaDeviceProfiles.remember(profiles,cert,daily));}catch(Exception e){throw new IllegalStateException("บันทึกการเชื่อมต่อในเครื่องไม่สำเร็จ",e);}}
 public synchronized String dailySessionId(){return prefs.getString("dailySessionId","");}
 public synchronized void saveDailySessionId(String id){try{persist(certificate(),id,ScpdaDeviceProfiles.remember(profilesSaved(),certificate(),id));}catch(Exception e){throw new IllegalStateException("บันทึกเซสชันในเครื่องไม่สำเร็จ",e);}}
 public synchronized JSONArray profiles()throws Exception{return ScpdaDeviceProfiles.records(profilesSaved(),certificate());}
 public synchronized void useProfile(String key)throws Exception{JSONObject profiles=profilesSaved(),profile=profiles.optJSONObject(key);if(profile==null)throw new Exception("ไม่พบสาขาที่เคยเชื่อม");persist(profile.getString("certificate"),profile.optString("dailySessionId"),profiles);}
 public String sign(String text)throws Exception{Signature s=Signature.getInstance("SHA256withECDSA");s.initSign((PrivateKey)keys().getKey(ALIAS,null));s.update(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));return Base64.getEncoder().encodeToString(s.sign());}
}
