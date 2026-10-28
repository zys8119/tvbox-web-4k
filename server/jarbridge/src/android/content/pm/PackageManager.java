package android.content.pm;

/** 最小 PackageManager 桩：返回非 null 的应用信息，避免爬虫读包名时 NPE */
@SuppressWarnings({"unused","rawtypes","deprecation","unchecked"})
public class PackageManager {
  private static final ApplicationInfo INFO = new ApplicationInfo();

  static {
    INFO.packageName = "com.github.catvod.spider";
    INFO.dataDir = System.getProperty("java.io.tmpdir", "/tmp") + "/tvbox-jarbridge/data";
    INFO.sourceDir = INFO.dataDir;
    INFO.targetSdkVersion = 33;
  }

  public PackageManager() {}

  public ApplicationInfo getApplicationInfo(String pkg, int flags) {
    return INFO;
  }

  public CharSequence getApplicationLabel(ApplicationInfo info) {
    return "TVBox";
  }

  public android.content.Intent getLaunchIntentForPackage(String pkg) {
    return null;
  }

  public PackageInfo getPackageInfo(String pkg, int flags) {
    return new PackageInfo();
  }

  public boolean hasSystemFeature(String feature) {
    return false;
  }

  public ResolveInfo resolveActivity(android.content.Intent intent, int flags) {
    return null;
  }

  public ProviderInfo resolveContentProvider(String name, int flags) {
    return null;
  }

  public static class NameNotFoundException extends Exception {}

  public static final int GET_META_DATA = 128;
  public static final int GET_ACTIVITIES = 1;
}
