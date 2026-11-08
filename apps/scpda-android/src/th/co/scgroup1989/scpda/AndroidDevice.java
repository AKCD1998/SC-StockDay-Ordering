package th.co.scgroup1989.scpda;
import android.content.*;import android.security.keystore.*;import java.security.*;import java.security.spec.ECGenParameterSpec;import java.util.*;
// Non-exportable signing key. The stored admission certificate is public and
// unusable without a fresh signature from this installation's private key.
public final class AndroidDevice implements StockDaySession.DeviceProof {
 private static final String ALIAS="scpda-001-device-v1";private final android.content.SharedPreferences prefs;
 public AndroidDevice(Context context){prefs=context.getSharedPreferences("scpda-device",Context.MODE_PRIVATE);if(!prefs.contains("id"))prefs.edit().putString("id",UUID.randomUUID().toString()).apply();}
 private KeyStore keys()throws Exception{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);if(!k.containsAlias(ALIAS)){KeyPairGenerator g=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore");g.initialize(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY).setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256).build());g.generateKeyPair();}return k;}
 public String publicKey()throws Exception{return Base64.getEncoder().encodeToString(keys().getCertificate(ALIAS).getPublicKey().getEncoded());}
 public String deviceId(){return prefs.getString("id","");}public String certificate(){return prefs.getString("certificate","");}public void saveCertificate(String c){prefs.edit().putString("certificate",c).apply();}
 public String sign(String text)throws Exception{Signature s=Signature.getInstance("SHA256withECDSA");s.initSign((PrivateKey)keys().getKey(ALIAS,null));s.update(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));return Base64.getEncoder().encodeToString(s.sign());}
}
