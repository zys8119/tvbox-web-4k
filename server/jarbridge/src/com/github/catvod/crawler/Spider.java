package com.github.catvod.crawler;

import android.content.Context;
import java.util.HashMap;
import java.util.Map;
import okhttp3.Dns;

/**
 * TVBox 爬虫基类（桥接实现）。
 *
 * 原生实现由 Android 端注入，本桥接只保留爬虫会覆写/调用的方法，
 * 默认实现返回空结果，避免未覆写时抛异常。
 */
@SuppressWarnings({"unused","rawtypes"})
public class Spider {
  protected SpiderApi api;

  public Spider() {}

  /** 旧版初始化入口 */
  public void init(Context context) {}

  /** 新版初始化入口：context + extend 配置 */
  public void init(Context context, String extend) {}

  public void initApi(SpiderApi api) {
    this.api = api;
  }

  public static Dns safeDns() {
    return null;
  }

  public String homeContent(boolean filter) {
    return "";
  }

  public String homeVideoContent() {
    return "";
  }

  public String categoryContent(
      String tid, String pg, boolean filter, HashMap<String, String> extend) {
    return "";
  }

  public String detailContent(java.util.List<String> ids) {
    return "";
  }

  public String searchContent(String key, boolean quick) {
    return "";
  }

  public String playerContent(String flag, String id, java.util.List<String> vipFlags) {
    return "";
  }

  public boolean isVideoFormat(String url) {
    return false;
  }

  public boolean manualVideoCheck() {
    return false;
  }

  public boolean isVideoFormat(String url, String flag) {
    return isVideoFormat(url);
  }

  public Object[] proxyLocal(HashMap<String, String> params) {
    return null;
  }

  public Object[] proxy(Map<String, String> params) {
    return null;
  }

  public String action(String action) {
    return "";
  }
}
