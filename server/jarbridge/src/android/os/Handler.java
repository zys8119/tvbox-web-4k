package android.os;

/**
 * 最小 Handler 桩：服务端没有消息循环，post 直接同步执行，
 * 保证爬虫 post 到主线程的逻辑仍会运行。
 */
@SuppressWarnings({"unused","rawtypes","deprecation","unchecked"})
public class Handler {
  private final Looper looper;

  public Handler() {
    this.looper = null;
  }

  public Handler(Looper looper) {
    this.looper = looper;
  }

  public Handler(Looper looper, Callback callback) {
    this.looper = looper;
  }

  public Handler(Callback callback) {
    this.looper = null;
  }

  public Looper getLooper() {
    return looper;
  }

  public boolean post(Runnable r) {
    if (r == null) return false;
    try {
      r.run();
      return true;
    } catch (Throwable t) {
      return false;
    }
  }

  public boolean postDelayed(Runnable r, long delayMillis) {
    return post(r);
  }

  public void removeCallbacks(Runnable r) {}

  public void removeCallbacksAndMessages(Object token) {}

  public interface Callback {
    boolean handleMessage(Message msg);
  }
}
