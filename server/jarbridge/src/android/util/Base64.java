package android.util;

/**
 * Android Base64 桩：委托给 JDK 的 java.util.Base64。
 *
 * 忽略 flags（NO_WRAP / URL_SAFE / NO_PADDING 等），
 * 采用标准编码并在需要时补齐 padding，满足绝大多数爬虫场景。
 */
@SuppressWarnings({"unused","rawtypes","deprecation","unchecked"})
public class Base64 {
  public static final int DEFAULT = 0;
  public static final int NO_PADDING = 1;
  public static final int NO_WRAP = 2;
  public static final int CRLF = 4;
  public static final int URL_SAFE = 8;
  public static final int NO_CLOSE = 16;

  public Base64() {}

  public static byte[] decode(String str, int flags) {
    if (str == null) return null;
    String s = str.trim().replace("\r", "").replace("\n", "");
    // 补齐 padding
    int rem = s.length() % 4;
    if (rem == 2) s = s + "==";
    else if (rem == 3) s = s + "=";
    try {
      if ((flags & URL_SAFE) != 0) return java.util.Base64.getUrlDecoder().decode(s);
      return java.util.Base64.getDecoder().decode(s);
    } catch (Exception e) {
      return null;
    }
  }

  public static byte[] decode(byte[] input, int flags) {
    if (input == null) return null;
    return decode(new String(input, java.nio.charset.StandardCharsets.UTF_8), flags);
  }

  public static byte[] encode(byte[] input, int flags) {
    if (input == null) return null;
    return encodeToString(input, flags).getBytes(java.nio.charset.StandardCharsets.UTF_8);
  }

  public static String encodeToString(byte[] input, int flags) {
    if (input == null) return null;
    String s =
        (flags & URL_SAFE) != 0
            ? java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(input)
            : java.util.Base64.getEncoder().encodeToString(input);
    if ((flags & NO_WRAP) != 0 || (flags & URL_SAFE) != 0) {
      s = s.replace("\r", "").replace("\n", "");
    }
    return s;
  }
}
