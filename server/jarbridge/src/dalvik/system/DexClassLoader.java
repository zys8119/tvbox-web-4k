package dalvik.system;

/**
 * 最小 DexClassLoader 桩。
 *
 * Android 爬虫里通常只是在初始化阶段构造它，真正的 dex 装载在服务端桥接场景下
 * 已由 Node 侧预先完成，因此这里退化成普通 ClassLoader 包装即可。
 */
@SuppressWarnings({"unused", "rawtypes", "deprecation", "unchecked"})
public class DexClassLoader extends ClassLoader {
  public DexClassLoader(
      String dexPath, String optimizedDirectory, String librarySearchPath, ClassLoader parent) {
    super(parent);
  }

  @Override
  public Class<?> loadClass(String name) throws ClassNotFoundException {
    return super.loadClass(name);
  }
}
