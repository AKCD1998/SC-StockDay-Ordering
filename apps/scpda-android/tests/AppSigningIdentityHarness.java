package th.co.scgroup1989.scpda;

import java.io.InputStream;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/** Exercises the shipping signer policy with the actual release certificate. */
public final class AppSigningIdentityHarness {
 private static final String PIN="3d11b6af0d2f472632e313d6b94fab745cc4af8c360dfe356be7bf627847c20a";
 interface Check {void run()throws Exception;}
 private static void rejected(Check check)throws Exception{try{check.run();}catch(GeneralSecurityException expected){return;}throw new AssertionError("Untrusted identity accepted");}
 private static void equal(Object actual,Object expected){if(!java.util.Objects.equals(actual,expected))throw new AssertionError(actual+" != "+expected);}
 public static void main(String[] args)throws Exception{
  byte[] certificate;
  // Reading the complete signed entry also checks the actual APK's v1 signature.
  try(JarFile apk=new JarFile(args[0],true)){
   JarEntry dex=apk.getJarEntry("classes.dex");try(InputStream in=apk.getInputStream(dex)){byte[] b=new byte[8192];while(in.read(b)!=-1){}}
   Certificate[] certificates=dex.getCertificates();if(certificates==null||certificates.length!=1)throw new AssertionError("v1 certificate missing");certificate=certificates[0].getEncoded();
  }
  byte[][] valid={certificate},other={new byte[]{1,2,3}},empty={};
  equal(AppSigningIdentity.fingerprint(valid,null),PIN);
  equal(AppSigningIdentity.fingerprint(null,valid),PIN);
  equal(AppSigningIdentity.fingerprint(empty,valid),PIN);
  equal(AppSigningIdentity.fingerprint(valid,other),PIN);
  equal(AppSigningIdentity.fingerprint(null,null),null);
  equal(AppSigningIdentity.fingerprint(empty,empty),null);
  // The fallback must never hide an unexpected modern signer or multiple signers.
  String wrong=AppSigningIdentity.fingerprint(other,valid);if(PIN.equals(wrong))throw new AssertionError("Modern signer was bypassed");
  rejected(()->AppSigningIdentity.fingerprint(new byte[][]{certificate,certificate},valid));
  rejected(()->AppSigningIdentity.fingerprint(null,new byte[][]{certificate,certificate}));
  rejected(()->AppSigningIdentity.fingerprint(new byte[][]{null},valid));
  rejected(()->AppSigningIdentity.fingerprint(new byte[][]{new byte[0]},valid));
  AppSigningIdentity.requireTrusted(PIN,PIN,PIN,PIN);
  rejected(()->AppSigningIdentity.requireTrusted(null,PIN,PIN,PIN));
  rejected(()->AppSigningIdentity.requireTrusted(PIN,null,PIN,PIN));
  rejected(()->AppSigningIdentity.requireTrusted(wrong,PIN,PIN,PIN));
  rejected(()->AppSigningIdentity.requireTrusted(PIN,wrong,PIN,PIN));
  rejected(()->AppSigningIdentity.requireTrusted(PIN,PIN,wrong,PIN));
  rejected(()->AppSigningIdentity.requireTrusted(wrong,wrong,wrong,PIN));
  System.out.println("18 signer cases passed: real v1 release certificate, modern/legacy metadata, missing data, multiple signers and wrong-key rejection");
 }
}
