package th.co.scgroup1989.scpda;
import android.os.Bundle;
// The preserved count demo has no native/network bridge and no live session.
public final class DemoActivity extends AssetActivity {
 @Override public void onCreate(Bundle b){super.onCreate(b);createView("count-demo.html");}
}
