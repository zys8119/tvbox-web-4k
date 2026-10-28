package com.github.catvod.crawler;

/** 日志输出：桥接场景下写入 stderr，由 Node 侧收集 */
@SuppressWarnings({"unused"})
public class SpiderDebug {
  private static boolean enabled = true;

  public static void log(String msg) {
    if (enabled && msg != null) System.err.println("[spider] " + msg);
  }

  public static void log(Throwable e) {
    if (enabled && e != null) e.printStackTrace(System.err);
  }

  public static void log(String tag, String msg) {
    if (enabled) System.err.println("[spider:" + tag + "] " + msg);
  }

  public static void setEnabled(boolean on) {
    enabled = on;
  }
}
