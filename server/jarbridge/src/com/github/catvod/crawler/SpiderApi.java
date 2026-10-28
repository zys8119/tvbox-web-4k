package com.github.catvod.crawler;

import java.util.Map;

/**
 * TVBox 运行时向爬虫暴露的能力接口。
 * 服务端桥接场景下仅需保留方法签名，实现由桥接层提供。
 */
@SuppressWarnings({"unused","rawtypes"})
public interface SpiderApi {
  Object[] proxy(Map<String, String> params);

  Object[] json(String json);

  String getFrom() throws Exception;

  String getProxy(boolean local);
}
