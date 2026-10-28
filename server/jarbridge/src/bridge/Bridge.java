package bridge;

import android.content.Context;
import com.github.catvod.crawler.Spider;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * csp_* 爬虫桥接进程。
 *
 * 协议：stdin/stdout 各一行一个 JSON，字段与 Node 侧一致。
 *   请求  {"id":"1","class":"csp_Douban","method":"homeContent","args":[true],"extend":""}
 *   响应  {"id":"1","ok":true,"result":"..."}
 *         {"id":"1","ok":false,"error":"..."}
 *
 * 设计要点：
 *   - 每个 class 一个实例并缓存，避免重复 init 与丢失内部状态
 *   - 反射调用，参数按方法签名做基础类型转换
 *   - 只把 JSON 写到 stdout，日志一律走 stderr，避免污染协议
 */
public class Bridge {
  private static final PrintStream OUT =
      new PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true, StandardCharsets.UTF_8);
  private static final Map<String, Spider> CACHE = new HashMap<>();
  private static final Context CTX = new BridgeContext();

  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    String line;
    while ((line = in.readLine()) != null) {
      line = line.trim();
      if (line.isEmpty()) continue;
      String id = "";
      try {
        Map<String, Object> req = (Map<String, Object>) Json.parse(line);
        id = str(req.get("id"));
        String cls = str(req.get("class"));
        String method = str(req.get("method"));
        List<Object> argList = req.get("args") instanceof List ? (List<Object>) req.get("args") : new ArrayList<>();
        String extend = str(req.get("extend"));

        Spider sp = obtain(cls, extend);
        Object result = invoke(sp, method, argList);
        StringBuilder sb = new StringBuilder();
        sb.append("{\"id\":").append(Json.quote(id)).append(",\"ok\":true,\"result\":");
        if (result == null) sb.append("null");
        else sb.append(Json.quote(String.valueOf(result)));
        sb.append('}');
        OUT.println(sb);
      } catch (Throwable t) {
        String msg = t.getClass().getSimpleName() + ": " + String.valueOf(t.getMessage());
        OUT.println("{\"id\":" + Json.quote(id) + ",\"ok\":false,\"error\":" + Json.quote(msg) + "}");
        t.printStackTrace(System.err);
      }
    }
  }

  /** 取实例，首次创建时完成 init */
  private static Spider obtain(String cls, String extend) throws Exception {
    Spider sp = CACHE.get(cls);
    if (sp != null) return sp;
    Class<?> c = Class.forName(cls);
    sp = (Spider) c.getDeclaredConstructor().newInstance();
    // 优先调用带 extend 的重载，失败则退回单参
    try {
      Method m = c.getMethod("init", Context.class, String.class);
      m.invoke(sp, CTX, extend == null ? "" : extend);
    } catch (NoSuchMethodException e) {
      Method m = c.getMethod("init", Context.class);
      m.invoke(sp, CTX);
    }
    CACHE.put(cls, sp);
    return sp;
  }

  /** 反射调用，按形参类型转换实参 */
  private static Object invoke(Spider sp, String name, List<Object> args) throws Exception {
    for (Method m : sp.getClass().getMethods()) {
      if (!m.getName().equals(name)) continue;
      Class<?>[] ps = m.getParameterTypes();
      if (ps.length != args.size()) continue;
      Object[] conv = new Object[ps.length];
      boolean ok = true;
      for (int i = 0; i < ps.length; i++) {
        try {
          conv[i] = coerce(args.get(i), ps[i]);
        } catch (Exception e) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      return m.invoke(sp, conv);
    }
    throw new NoSuchMethodException(name + " with " + args.size() + " args");
  }

  private static Object coerce(Object v, Class<?> t) {
    if (v == null) return null;
    if (t.isInstance(v)) return v;
    if (t == String.class) return String.valueOf(v);
    if (t == boolean.class || t == Boolean.class) {
      if (v instanceof Boolean) return v;
      return Boolean.parseBoolean(String.valueOf(v));
    }
    if (t == int.class || t == Integer.class) return ((Number) num(v)).intValue();
    if (t == long.class || t == Long.class) return num(v).longValue();
    if (t == HashMap.class && v instanceof Map) return new HashMap<>((Map<?, ?>) v);
    if (t == List.class && v instanceof List) return v;
    if (t == Context.class) return CTX;
    return v;
  }

  private static Number num(Object v) {
    if (v instanceof Number) return (Number) v;
    try {
      return Double.valueOf(String.valueOf(v));
    } catch (Exception e) {
      return 0;
    }
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }

  /** 极简 JSON：只覆盖桥接协议用到的对象/数组/字符串/数字/布尔 */
  static final class Json {
    private final String s;
    private int i;

    private Json(String s) {
      this.s = s;
    }

    static Object parse(String s) {
      Json j = new Json(s);
      j.ws();
      Object v = j.value();
      return v;
    }

    static String quote(String v) {
      if (v == null) return "null";
      StringBuilder sb = new StringBuilder("\"");
      for (char c : v.toCharArray()) {
        switch (c) {
          case '"': sb.append("\\\""); break;
          case '\\': sb.append("\\\\"); break;
          case '\n': sb.append("\\n"); break;
          case '\r': sb.append("\\r"); break;
          case '\t': sb.append("\\t"); break;
          default:
            if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
      }
      return sb.append('"').toString();
    }

    private void ws() {
      while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
    }

    private Object value() {
      ws();
      char c = s.charAt(i);
      if (c == '{') return obj();
      if (c == '[') return arr();
      if (c == '"') return string();
      if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
      if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
      if (s.startsWith("null", i)) { i += 4; return null; }
      return number();
    }

    private Map<String, Object> obj() {
      Map<String, Object> m = new LinkedHashMap<>();
      i++;
      ws();
      if (s.charAt(i) == '}') { i++; return m; }
      while (true) {
        ws();
        String k = string();
        ws();
        i++; // :
        m.put(k, value());
        ws();
        char c = s.charAt(i++);
        if (c == '}') break;
      }
      return m;
    }

    private List<Object> arr() {
      List<Object> l = new ArrayList<>();
      i++;
      ws();
      if (s.charAt(i) == ']') { i++; return l; }
      while (true) {
        l.add(value());
        ws();
        char c = s.charAt(i++);
        if (c == ']') break;
      }
      return l;
    }

    private String string() {
      StringBuilder sb = new StringBuilder();
      i++;
      while (true) {
        char c = s.charAt(i++);
        if (c == '"') break;
        if (c == '\\') {
          char e = s.charAt(i++);
          switch (e) {
            case 'n': sb.append('\n'); break;
            case 'r': sb.append('\r'); break;
            case 't': sb.append('\t'); break;
            case 'b': sb.append('\b'); break;
            case 'f': sb.append('\f'); break;
            case 'u':
              sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
              i += 4;
              break;
            default: sb.append(e);
          }
        } else sb.append(c);
      }
      return sb.toString();
    }

    private Number number() {
      int st = i;
      while (i < s.length() && "-+.eE0123456789".indexOf(s.charAt(i)) >= 0) i++;
      String t = s.substring(st, i);
      if (t.contains(".") || t.contains("e") || t.contains("E")) return Double.valueOf(t);
      try {
        return Long.valueOf(t);
      } catch (Exception e) {
        return 0L;
      }
    }
  }
}
