package th.co.scgroup1989.scpda;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.hardware.Camera;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.WebView;
import android.widget.FrameLayout;
import org.json.*;
import java.io.ByteArrayOutputStream;
import java.util.*;

/** Owns the scanner camera, so touch focus does not depend on WebView camera constraints.
 * Camera's compatibility API supports the existing API26+ fleet without new dependencies.
 * Every request is scoped to one scanner session; late callbacks cannot affect a new one.
 */
@SuppressWarnings("deprecation")
final class AndroidScannerCamera {
 interface Reply {void send(String id,JSONObject value);}
 private final Activity activity;private final WebView web;private final Reply reply;
 private final Handler ui=new Handler(Looper.getMainLooper()),cameraHandler;
 private final HandlerThread thread=new HandlerThread("scpda-scanner-camera");
 private FrameLayout layer,frame;private TextureView texture;private Reticle reticle;
 private volatile Camera camera;private volatile String session;private String openId,captureId;
 private volatile boolean ready,closing;private boolean focusing,decoding;private int focusSequence,previewWidth,previewHeight,rotation,sensorOrientation;
 private JSONObject layout;private Runnable restoreFocus,pendingShot;
 AndroidScannerCamera(Activity activity,WebView web,Reply reply){this.activity=activity;this.web=web;this.reply=reply;thread.start();cameraHandler=new Handler(thread.getLooper());}
 private void answer(String id,boolean ok,JSONObject data,String error){if(id==null)return;try{JSONObject value=new JSONObject().put("ok",ok);if(ok)value.put("data",data==null?new JSONObject():data);else value.put("status",400).put("code","SCANNER_CAMERA").put("error",error);reply.send(id,value);}catch(JSONException ignored){}}
 void execute(String id,String operation,JSONObject args){
  try{
   String requested=args.getString("session");if(!requested.matches("[a-zA-Z0-9-]{1,64}"))throw new Exception();
   if(operation.equals("scannerOpen")){open(id,requested,args);return;}
   if(!requested.equals(session)){if(operation.equals("scannerClose"))answer(id,true,null,null);else answer(id,false,null,"กล้องรอบนี้ปิดแล้ว");return;}
   if(operation.equals("scannerClose")){close();answer(id,true,null,null);}
   else if(operation.equals("scannerLayout")){setLayout(args);answer(id,true,null,null);}
   else if(operation.equals("scannerCapture"))capture(id);
   else answer(id,false,null,"คำสั่งกล้องไม่ถูกต้อง");
  }catch(Exception e){answer(id,false,null,"ข้อมูลตำแหน่งกล้องไม่ถูกต้อง");}
 }
 private void open(String id,String requested,JSONObject args)throws Exception{
  close();session=requested;openId=id;layout=args;closing=false;
  if(activity.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){activity.requestPermissions(new String[]{Manifest.permission.CAMERA},42);return;}
  attach();
 }
 void permissionResult(boolean granted){if(session==null||openId==null)return;if(granted)attach();else fail(session,"ยังไม่ได้รับอนุญาตใช้กล้อง กรุณาอนุญาตกล้องแล้วลองอีกครั้ง");}
 private void attach(){
  final String current=session;if(current==null)return;
  layer=new FrameLayout(activity);layer.setClipChildren(true);
  frame=new FrameLayout(activity);frame.setBackgroundColor(Color.rgb(16,32,48));frame.setClipChildren(true);
  texture=new TextureView(activity);frame.addView(texture,new FrameLayout.LayoutParams(-1,-1));
  reticle=new Reticle(activity);frame.addView(reticle,new FrameLayout.LayoutParams(-1,-1));layer.addView(frame,new FrameLayout.LayoutParams(1,1));
  activity.addContentView(layer,new ViewGroup.LayoutParams(-1,-1));
  layer.addOnLayoutChangeListener((view,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom)->{if(current.equals(session))try{setLayout(layout);}catch(Exception e){fail(current,"ไม่สามารถจัดตำแหน่งกล้องได้ กรุณาเปิดกล้องใหม่");}});
  texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
   public void onSurfaceTextureAvailable(SurfaceTexture surface,int width,int height){startCamera(current,surface);}
   public void onSurfaceTextureSizeChanged(SurfaceTexture surface,int width,int height){transform();}
   public boolean onSurfaceTextureDestroyed(SurfaceTexture surface){if(current.equals(session))close();return true;}
   public void onSurfaceTextureUpdated(SurfaceTexture surface){if(current.equals(session)&&ready&&openId!=null){String id=openId;openId=null;answer(id,true,new JSONObject(),null);}}
  });
  texture.setOnTouchListener((view,event)->{Rect clip=frame==null?null:frame.getClipBounds();if(clip!=null&&!clip.contains((int)event.getX(),(int)event.getY()))return false;if(event.getAction()==android.view.MotionEvent.ACTION_UP){focus(event.getX(),event.getY());view.performClick();}return true;});
  try{setLayout(layout);}catch(Exception e){fail(current,"ไม่สามารถจัดตำแหน่งกล้องได้ กรุณาเปิดกล้องใหม่");}
 }
 private void setLayout(JSONObject args)throws Exception{
  double viewport=args.getDouble("viewportWidth"),x=args.getDouble("x"),y=args.getDouble("y"),width=args.getDouble("width"),height=args.getDouble("height");
  if(!Double.isFinite(viewport)||!Double.isFinite(x)||!Double.isFinite(y)||!Double.isFinite(width)||!Double.isFinite(height)||viewport<=0||viewport>8192||width<=0||height<=0||width>8192||height>8192||Math.abs(x)>16384||Math.abs(y)>16384||x+width>viewport+2)throw new Exception();
  layout=args;decoding="decoding".equals(args.optString("phase"));
  if(frame==null)return;float scale=(float)(web.getWidth()/viewport);int[] webAt=new int[2],layerAt=new int[2];web.getLocationInWindow(webAt);layer.getLocationInWindow(layerAt);
  FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(Math.max(1,Math.round((float)width*scale)),Math.max(1,Math.round((float)height*scale)));
  p.leftMargin=webAt[0]-layerAt[0]+Math.round((float)x*scale);p.topMargin=webAt[1]-layerAt[1]+Math.round((float)y*scale);frame.setLayoutParams(p);
  int left=Math.max(0,Math.min(p.width,(int)Math.round(args.optDouble("clipLeft",0)*scale))),top=Math.max(0,Math.min(p.height,(int)Math.round(args.optDouble("clipTop",0)*scale))),right=Math.max(left,Math.min(p.width,(int)Math.round(args.optDouble("clipRight",width)*scale))),bottom=Math.max(top,Math.min(p.height,(int)Math.round(args.optDouble("clipBottom",height)*scale)));frame.setClipBounds(new Rect(left,top,right,bottom));
  reticle.read(args);updateRotation();transform();
 }
 private void startCamera(final String current,final SurfaceTexture surface){cameraHandler.post(()->{
  Camera opened=null;
  try{
   if(!current.equals(session))return;int back=-1;Camera.CameraInfo info=new Camera.CameraInfo();
   for(int i=0;i<Camera.getNumberOfCameras();i++){Camera.getCameraInfo(i,info);if(info.facing==Camera.CameraInfo.CAMERA_FACING_BACK){back=i;break;}}
   if(back<0)throw new Exception();opened=Camera.open(back);Camera.CameraInfo selected=new Camera.CameraInfo();Camera.getCameraInfo(back,selected);
   int display=activity.getWindowManager().getDefaultDisplay().getRotation(),degrees=display==Surface.ROTATION_90?90:display==Surface.ROTATION_180?180:display==Surface.ROTATION_270?270:0;
   final int displayRotation=(selected.orientation-degrees+360)%360;opened.setDisplayOrientation(displayRotation);
   Camera.Parameters p=opened.getParameters();final Camera.Size size=chooseSize(p.getSupportedPreviewSizes());p.setPreviewSize(size.width,size.height);
   List<String> modes=p.getSupportedFocusModes();if(modes!=null&&modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);else if(modes!=null&&modes.contains(Camera.Parameters.FOCUS_MODE_AUTO))p.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
   List<String> flash=p.getSupportedFlashModes();if(flash!=null&&flash.contains(Camera.Parameters.FLASH_MODE_OFF))p.setFlashMode(Camera.Parameters.FLASH_MODE_OFF);
   opened.setParameters(p);surface.setDefaultBufferSize(size.width,size.height);opened.setPreviewTexture(surface);
   if(!current.equals(session)){opened.release();return;}
   final Camera owner=opened;opened.setErrorCallback((error,source)->ui.post(()->{if(current.equals(session))fail(current,"กล้องหยุดทำงาน กรุณาเปิดกล้องใหม่");}));
   final int sensor=selected.orientation;opened.startPreview();ui.post(()->{if(current.equals(session)){camera=owner;previewWidth=size.width;previewHeight=size.height;sensorOrientation=sensor;rotation=displayRotation;ready=true;updateRotation();transform();}else cameraHandler.post(()->{try{owner.stopPreview();owner.release();}catch(Exception ignored){}});});
  }catch(Exception e){if(opened!=null){if(camera==opened)camera=null;try{opened.release();}catch(Exception ignored){}}ui.post(()->fail(current,"เปิดกล้องไม่ได้ กล้องอาจถูกใช้งานอยู่ กรุณาปิดแล้วลองอีกครั้ง"));}
 });}
 private Camera.Size chooseSize(List<Camera.Size> sizes){
  Camera.Size best=sizes.get(0);long bestScore=Long.MAX_VALUE;
  for(Camera.Size size:sizes){long pixels=(long)size.width*size.height,score=Math.abs(pixels-1280L*720L)+(pixels>1920L*1080L?10000000L:0);if(score<bestScore){best=size;bestScore=score;}}
  return best;
 }
 private void transform(){if(texture==null||previewWidth<=0||texture.getWidth()<=0||texture.getHeight()<=0)return;float[] scale=ScannerGeometry.coverScale(texture.getWidth(),texture.getHeight(),previewWidth,previewHeight,rotation);Matrix m=new Matrix();m.setScale(scale[0],scale[1],texture.getWidth()/2f,texture.getHeight()/2f);texture.setTransform(m);}
 private void updateRotation(){final Camera owner=camera;if(owner==null||!ready)return;int display=activity.getWindowManager().getDefaultDisplay().getRotation(),degrees=display==Surface.ROTATION_90?90:display==Surface.ROTATION_180?180:display==Surface.ROTATION_270?270:0;final int wanted=(sensorOrientation-degrees+360)%360;if(wanted==rotation)return;final String current=session;cameraHandler.post(()->{if(owner!=camera||!Objects.equals(current,session))return;try{owner.setDisplayOrientation(wanted);ui.post(()->{if(owner==camera&&Objects.equals(current,session)){rotation=wanted;transform();}});}catch(Exception ignored){}});}
 private void focus(float x,float y){
  final Camera owner=camera;final String current=session;if(owner==null||!ready||decoding||captureId!=null)return;
  int[] point=ScannerGeometry.meteringPoint(x,y,texture.getWidth(),texture.getHeight(),previewWidth,previewHeight,rotation),rect=ScannerGeometry.meteringRect(point[0],point[1]);
  int sequence=++focusSequence;focusing=true;reticle.focus(x,y,0,"กำลังโฟกัส…");if(restoreFocus!=null)ui.removeCallbacks(restoreFocus);
  cameraHandler.post(()->{
   if(owner!=camera||!current.equals(session))return;
   try{
    Camera.Parameters p=owner.getParameters();List<String> modes=p.getSupportedFocusModes();
    if(modes==null||!modes.contains(Camera.Parameters.FOCUS_MODE_AUTO)){final boolean continuous=modes!=null&&(modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)||modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO));ui.post(()->focusDone(current,sequence,x,y,false,continuous?"กล้องนี้ใช้โฟกัสอัตโนมัติของเครื่อง":"กล้องนี้ใช้โฟกัสคงที่"));return;}
    owner.cancelAutoFocus();p.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);boolean targeted=p.getMaxNumFocusAreas()>0;
    List<Camera.Area> area=Collections.singletonList(new Camera.Area(new Rect(rect[0],rect[1],rect[2],rect[3]),1000));
    if(targeted)p.setFocusAreas(area);if(p.getMaxNumMeteringAreas()>0)p.setMeteringAreas(area);owner.setParameters(p);
    owner.autoFocus((success,source)->ui.post(()->{if(source==camera)focusDone(current,sequence,targeted?x:texture.getWidth()/2f,targeted?y:texture.getHeight()/2f,success,success?(targeted?"โฟกัสแล้ว · แตะอ่านบาร์โค้ด":"โฟกัสอัตโนมัติแล้ว"):"ลองแตะใหม่ หรือขยับระยะกล้อง");}));
   }catch(Exception e){ui.post(()->focusDone(current,sequence,x,y,false,"ปรับโฟกัสไม่ได้ ลองขยับระยะกล้อง"));}
  });
  ui.postDelayed(()->{if(current.equals(session)&&sequence==focusSequence&&focusing)focusDone(current,sequence,x,y,false,"ลองแตะใหม่ หรือขยับระยะกล้อง");},1800);
 }
 private void focusDone(String current,int sequence,float x,float y,boolean success,String message){
  if(!current.equals(session)||sequence!=focusSequence||!focusing)return;focusing=false;reticle.focus(x,y,success?1:2,message);
  if(pendingShot!=null){Runnable shot=pendingShot;pendingShot=null;shot.run();return;}
  restoreFocus=()->{if(!current.equals(session)||sequence!=focusSequence||decoding)return;final Camera owner=camera;cameraHandler.post(()->{if(owner==null||owner!=camera)return;try{owner.cancelAutoFocus();Camera.Parameters p=owner.getParameters();List<String> modes=p.getSupportedFocusModes();if(modes!=null&&modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)){p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);if(p.getMaxNumFocusAreas()>0)p.setFocusAreas(null);if(p.getMaxNumMeteringAreas()>0)p.setMeteringAreas(null);owner.setParameters(p);}}catch(Exception ignored){}});reticle.resetFocus();};ui.postDelayed(restoreFocus,3000);
 }
 private void capture(String id){
  if(!ready||camera==null||texture==null||!texture.isAvailable()||captureId!=null){answer(id,false,null,"กล้องยังไม่พร้อมอ่าน กรุณาลองอีกครั้ง");return;}
  captureId=id;final String current=session;decoding=true;reticle.invalidate();
  Runnable shot=()->snapshot(current,id);if(focusing){pendingShot=shot;ui.postDelayed(()->{if(current.equals(session)&&pendingShot==shot){pendingShot=null;focusing=false;shot.run();}},1400);}else shot.run();
 }
 private void snapshot(final String current,final String id){
  if(!current.equals(session)||!id.equals(captureId))return;
  try{
   Bitmap full=texture.getBitmap();if(full==null)throw new Exception();
   Rect crop=reticle.crop(full.getWidth(),full.getHeight());Bitmap selected=Bitmap.createBitmap(full,crop.left,crop.top,crop.width(),crop.height());if(selected!=full)full.recycle();
   final Bitmap image=selected;cameraHandler.post(()->{try{ByteArrayOutputStream out=new ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.JPEG,95,out);JSONObject value=new JSONObject().put("image","data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));ui.post(()->{if(current.equals(session)&&id.equals(captureId)){captureId=null;answer(id,true,value,null);}});}catch(Exception e){ui.post(()->{if(current.equals(session)&&id.equals(captureId)){captureId=null;answer(id,false,null,"อ่านภาพจากกล้องไม่ได้ กรุณาลองอีกครั้ง");}});}finally{image.recycle();}});
  }catch(Exception e){captureId=null;answer(id,false,null,"อ่านภาพจากกล้องไม่ได้ กรุณาลองอีกครั้ง");}
 }
 private void fail(String current,String message){if(!Objects.equals(current,session))return;String id=openId;openId=null;close();if(id!=null)answer(id,false,null,message);else try{JSONObject detail=new JSONObject().put("session",current).put("error",message);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('scpda-camera-ended',{detail:"+detail.toString()+"}));",null);}catch(JSONException ignored){}}
 void close(){
  if(closing)return;closing=true;String waiting=openId,shot=captureId;openId=null;captureId=null;session=null;ready=false;focusing=false;decoding=false;++focusSequence;pendingShot=null;if(restoreFocus!=null)ui.removeCallbacks(restoreFocus);restoreFocus=null;
  final Camera owner=camera;camera=null;if(owner!=null)cameraHandler.post(()->{try{owner.cancelAutoFocus();owner.stopPreview();}catch(Exception ignored){}try{owner.release();}catch(Exception ignored){}});
  FrameLayout old=layer;layer=null;frame=null;texture=null;reticle=null;previewWidth=0;previewHeight=0;
  if(old!=null&&old.getParent() instanceof ViewGroup)((ViewGroup)old.getParent()).removeView(old);
  answer(waiting,false,null,"กล้องรอบนี้ปิดแล้ว");answer(shot,false,null,"กล้องรอบนี้ปิดแล้ว");closing=false;
 }
 void destroy(){close();thread.quitSafely();}
 private final class Reticle extends View {
  final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);float tx=.08f,ty=.25f,tw=.84f,th=.43f,fx,fy;int focused=-1;String note="แตะภาพตรงสินค้าเพื่อโฟกัส";
  Reticle(Activity a){super(a);setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);setWillNotDraw(false);}
  void read(JSONObject args){tx=(float)args.optDouble("targetX",.08);ty=(float)args.optDouble("targetY",.25);tw=(float)args.optDouble("targetWidth",.84);th=(float)args.optDouble("targetHeight",.43);if(!Float.isFinite(tx)||!Float.isFinite(ty)||!Float.isFinite(tw)||!Float.isFinite(th)||tx<0||ty<0||tw<=0||th<=0||tx+tw>1.001f||ty+th>1.001f){tx=.08f;ty=.25f;tw=.84f;th=.43f;}invalidate();}
  Rect crop(int width,int height){int left=Math.max(0,Math.min(width-1,Math.round(tx*width))),top=Math.max(0,Math.min(height-1,Math.round(ty*height)));return new Rect(left,top,Math.max(left+1,Math.min(width,Math.round((tx+tw)*width))),Math.max(top+1,Math.min(height,Math.round((ty+th)*height))));}
  void focus(float x,float y,int status,String message){fx=x;fy=y;focused=status;note=message;invalidate();}
  void resetFocus(){focused=-1;note="แตะภาพตรงสินค้าเพื่อโฟกัส";invalidate();}
  protected void onDraw(Canvas c){super.onDraw(c);float density=getResources().getDisplayMetrics().density,w=getWidth(),h=getHeight();Rect r=crop(getWidth(),getHeight());paint.setStyle(Paint.Style.FILL);paint.setColor(0x80102030);c.drawRect(0,0,w,r.top,paint);c.drawRect(0,r.bottom,w,h,paint);c.drawRect(0,r.top,r.left,r.bottom,paint);c.drawRect(r.right,r.top,w,r.bottom,paint);paint.setColor(0xfff6e96b);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(3*density);float k=22*density;for(int corner=0;corner<4;corner++){float x=corner%2==0?r.left:r.right,y=corner<2?r.top:r.bottom;c.drawLine(x,y,x+(corner%2==0?k:-k),y,paint);c.drawLine(x,y,x,y+(corner<2?k:-k),paint);}if(focused>=0){paint.setColor(focused==1?0xff76e89f:focused==2?0xffffc66d:0xffffffff);float f=24*density;c.drawRoundRect(fx-f,fy-f,fx+f,fy+f,5*density,5*density,paint);}paint.setStyle(Paint.Style.FILL);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(12*density);paint.setColor(Color.WHITE);c.drawText(decoding?"กำลังอ่านภาพนี้":note,w/2,Math.max(22*density,r.top-18*density),paint);paint.setTextSize(11*density);c.drawText("วางบาร์โค้ด 1 รายการในกรอบนี้",w/2,Math.min(h-12*density,r.bottom+26*density),paint);}
 }
}
