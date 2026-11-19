package th.co.scgroup1989.scpda;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Locale;

/** Signer policy independent of Android's modern/legacy metadata transport. */
final class AppSigningIdentity {
 private AppSigningIdentity() {}
 static String fingerprint(byte[][] modern,byte[][] legacy)throws GeneralSecurityException{
  byte[][] signatures=modern!=null&&modern.length>0?modern:legacy;
  if(signatures==null||signatures.length==0)return null;
  if(signatures.length!=1)throw new GeneralSecurityException("แอปนี้มีผู้ลงนามมากกว่าหนึ่งราย จึงอัปเดตไม่ได้");
  if(signatures[0]==null||signatures[0].length==0)throw new GeneralSecurityException("ข้อมูลลายเซ็นแอปไม่สมบูรณ์ กรุณาดาวน์โหลดใหม่");
  StringBuilder hex=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(signatures[0]))hex.append(String.format(Locale.ROOT,"%02x",b&255));return hex.toString();
 }
 static void requireTrusted(String installed,String archive,String declared,String pinned)throws GeneralSecurityException{
  if(installed==null||archive==null)throw new GeneralSecurityException("Android อ่านข้อมูลลายเซ็นไม่ได้ กรุณาเปิดไฟล์ติดตั้งจากลิงก์ผู้ดูแลเพื่อติดตั้งทับ");
  if(!pinned.equals(archive)||!pinned.equals(declared))throw new GeneralSecurityException("ลายเซ็นไฟล์อัปเดตไม่ตรงกับ SCPDA");
  if(!installed.equals(archive))throw new GeneralSecurityException("ลายเซ็นไฟล์อัปเดตต่างจากแอปที่ติดตั้งอยู่");
 }
}
