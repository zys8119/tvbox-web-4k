package android.os;

@SuppressWarnings({"unused","rawtypes","deprecation","unchecked"})
public class StrictMode {
  public StrictMode() {}
  public static void setThreadPolicy(android.os.StrictMode.ThreadPolicy a0) {}
  public static class ThreadPolicy {
    public static class Builder {
      public android.os.StrictMode.ThreadPolicy build() { return null; }
      public android.os.StrictMode.ThreadPolicy.Builder permitAll() { return this; }
    }
  }
  public static class Builder {
    public android.os.StrictMode.ThreadPolicy build() { return null; }
    public android.os.StrictMode.Builder permitAll() { return this; }
  }
}
