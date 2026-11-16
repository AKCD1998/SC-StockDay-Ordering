package th.co.scgroup1989.scpda;
import android.content.*;import android.database.*;import android.net.Uri;import android.os.*;import android.provider.OpenableColumns;import java.io.*;
// Read-only URI grant for exactly one verified APK, never an arbitrary path.
public final class UpdateApkProvider extends ContentProvider {
 @Override public boolean onCreate(){return true;}
 private File target(Uri u){if(!"/scpda.apk".equals(u.getPath()))throw new SecurityException("Invalid update URI");return ScpdaAppUpdater.file(getContext());}
 @Override public String getType(Uri u){target(u);return "application/vnd.android.package-archive";}
 @Override public ParcelFileDescriptor openFile(Uri u,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new SecurityException("Read only");return ParcelFileDescriptor.open(target(u),ParcelFileDescriptor.MODE_READ_ONLY);}
 @Override public Cursor query(Uri u,String[] projection,String selection,String[] args,String order){File f=target(u);String[] names=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor c=new MatrixCursor(names,1);Object[] values=new Object[names.length];for(int i=0;i<names.length;i++){if(OpenableColumns.DISPLAY_NAME.equals(names[i]))values[i]="SCPDA-update.apk";else if(OpenableColumns.SIZE.equals(names[i]))values[i]=f.length();}c.addRow(values);return c;}
 @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
 @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
 @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}
