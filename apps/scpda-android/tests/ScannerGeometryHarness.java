package th.co.scgroup1989.scpda;

/** Run on a host JVM; checks image-coordinate semantics independently of hardware. */
public final class ScannerGeometryHarness {
 private static void equal(int[] actual,int x,int y){if(actual[0]!=x||actual[1]!=y)throw new AssertionError(actual[0]+","+actual[1]+" != "+x+","+y);}
 public static void main(String[] args){
  // A landscape 1280x720 frame fills a 400x300 viewport: 160px is cropped on each side.
  equal(ScannerGeometry.meteringPoint(0,150,400,300,1280,720,0),-750,0);
  equal(ScannerGeometry.meteringPoint(400,150,400,300,1280,720,0),750,0);
  for(int rotation:new int[]{0,90,180,270})equal(ScannerGeometry.meteringPoint(200,150,400,300,1280,720,rotation),0,0);
  // With a square preview no crop is involved: undo each display rotation before metering.
  equal(ScannerGeometry.meteringPoint(100,200,400,400,720,720,0),-500,0);
  equal(ScannerGeometry.meteringPoint(100,200,400,400,720,720,90),0,500);
  equal(ScannerGeometry.meteringPoint(100,200,400,400,720,720,180),500,0);
  equal(ScannerGeometry.meteringPoint(100,200,400,400,720,720,270),0,-500);
  for(int rotation:new int[]{0,90,180,270})for(float x:new float[]{0,1,200,399,400})for(float y:new float[]{0,1,150,299,300}){
   int[] point=ScannerGeometry.meteringPoint(x,y,400,300,1280,720,rotation),r=ScannerGeometry.meteringRect(point[0],point[1]);
   if(r[0]<-1000||r[1]<-1000||r[2]>1000||r[3]>1000||r[2]-r[0]!=200||r[3]-r[1]!=200)throw new AssertionError("Metering region outside camera coordinates");
  }
  System.out.println("Scanner coordinate rotation, cover crop, center and edge metering passed");
 }
}
