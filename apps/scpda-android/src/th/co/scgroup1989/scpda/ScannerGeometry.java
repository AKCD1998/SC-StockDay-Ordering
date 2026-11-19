package th.co.scgroup1989.scpda;

/** Coordinates shared by the preview, touch metering and captured barcode crop. */
final class ScannerGeometry {
 private ScannerGeometry() {}
 static float clamp(float n,float lo,float hi){return Math.max(lo,Math.min(hi,n));}
 static float[] coverScale(int width,int height,int previewWidth,int previewHeight,int rotation){
  if(width<=0||height<=0||previewWidth<=0||previewHeight<=0)throw new IllegalArgumentException("Camera dimensions");
  boolean swap=rotation==90||rotation==270;
  float aspect=(float)(swap?previewHeight:previewWidth)/(swap?previewWidth:previewHeight),viewAspect=(float)width/height;
  return new float[]{Math.max(1f,aspect/viewAspect),Math.max(1f,viewAspect/aspect)};
 }
 static int[] meteringPoint(float x,float y,int width,int height,int previewWidth,int previewHeight,int rotation){
  float[] scale=coverScale(width,height,previewWidth,previewHeight,rotation);
  float nx=clamp((x/width-.5f)/scale[0]+.5f,0f,1f),ny=clamp((y/height-.5f)/scale[1]+.5f,0f,1f),sx,sy;
  switch(rotation){case 0:sx=nx;sy=ny;break;case 90:sx=ny;sy=1f-nx;break;case 180:sx=1f-nx;sy=1f-ny;break;case 270:sx=1f-ny;sy=nx;break;default:throw new IllegalArgumentException("Camera rotation");}
  return new int[]{Math.round(sx*2000f-1000f),Math.round(sy*2000f-1000f)};
 }
 static int[] meteringRect(int x,int y){
  int left=Math.max(-1000,Math.min(800,x-100)),top=Math.max(-1000,Math.min(800,y-100));
  return new int[]{left,top,left+200,top+200};
 }
}
