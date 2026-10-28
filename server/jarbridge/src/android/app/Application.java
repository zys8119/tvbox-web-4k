package android.app;

import android.content.Context;
import android.content.res.Configuration;

/** 最小 Application 桩，继承 Context 以满足 Init 的强制转换 */
@SuppressWarnings({"unused","rawtypes","deprecation","unchecked"})
public class Application extends Context {
  public Application() {}

  public void onCreate() {}

  public void onTerminate() {}

  public void onConfigurationChanged(Configuration newConfig) {}

  public void onLowMemory() {}

  public void onTrimMemory(int level) {}

  public void registerActivityLifecycleCallbacks(ActivityLifecycleCallbacks cb) {}

  public void unregisterActivityLifecycleCallbacks(ActivityLifecycleCallbacks cb) {}

  public interface ActivityLifecycleCallbacks {
    void onActivityCreated(Activity activity, android.os.Bundle savedInstanceState);

    void onActivityStarted(Activity activity);

    void onActivityResumed(Activity activity);

    void onActivityPaused(Activity activity);

    void onActivityStopped(Activity activity);

    void onActivitySaveInstanceState(Activity activity, android.os.Bundle outState);

    void onActivityDestroyed(Activity activity);
  }
}
