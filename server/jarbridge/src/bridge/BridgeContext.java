package bridge;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Resources;
import android.content.pm.PackageManager;
import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * 最小的 Android Context 实现。
 *
 * 只满足爬虫在 init 阶段可能读取的属性（包名、缓存目录、SharedPreferences），
 * 其余能力返回安全默认值，避免 NPE。
 */
@SuppressWarnings({"unused","rawtypes","deprecation"})
public class BridgeContext extends Application {
  private final File cacheDir;
  private final File filesDir;
  private final SharedPreferences prefs = new MemoryPrefs();

  public BridgeContext() {
    File base = new File(System.getProperty("java.io.tmpdir", "/tmp"), "tvbox-jarbridge");
    base.mkdirs();
    cacheDir = new File(base, "cache");
    filesDir = new File(base, "files");
    cacheDir.mkdirs();
    filesDir.mkdirs();
  }

  @Override
  public Context getApplicationContext() {
    return this;
  }

  @Override
  public String getPackageName() {
    return "com.github.catvod.spider";
  }

  @Override
  public File getCacheDir() {
    return cacheDir;
  }

  @Override
  public File getFilesDir() {
    return filesDir;
  }

  public File getExternalCacheDir() {
    return cacheDir;
  }

  public File getExternalFilesDir(String type) {
    return filesDir;
  }

  @Override
  public SharedPreferences getSharedPreferences(String name, int mode) {
    return prefs;
  }

  @Override
  public Object getSystemService(String name) {
    return null;
  }

  @Override
  public Resources getResources() {
    return null;
  }

  private final PackageManager pm = new PackageManager();

  @Override
  public PackageManager getPackageManager() {
    return pm;
  }

  @Override
  public android.content.ContentResolver getContentResolver() {
    return null;
  }

  /** 纯内存 SharedPreferences */
  static final class MemoryPrefs implements SharedPreferences {
    private final Map<String, Object> data = new HashMap<>();

    @Override
    public Map<String, ?> getAll() {
      return new HashMap<>(data);
    }

    @Override
    public String getString(String key, String def) {
      Object v = data.get(key);
      return v == null ? def : String.valueOf(v);
    }

    @Override
    public java.util.Set<String> getStringSet(String key, java.util.Set<String> def) {
      return def;
    }

    @Override
    public int getInt(String key, int def) {
      Object v = data.get(key);
      return v instanceof Number ? ((Number) v).intValue() : def;
    }

    @Override
    public long getLong(String key, long def) {
      Object v = data.get(key);
      return v instanceof Number ? ((Number) v).longValue() : def;
    }

    @Override
    public float getFloat(String key, float def) {
      Object v = data.get(key);
      return v instanceof Number ? ((Number) v).floatValue() : def;
    }

    @Override
    public boolean getBoolean(String key, boolean def) {
      Object v = data.get(key);
      return v instanceof Boolean ? (Boolean) v : def;
    }

    @Override
    public boolean contains(String key) {
      return data.containsKey(key);
    }

    @Override
    public Editor edit() {
      return new Editor() {
        private final Map<String, Object> pending = new HashMap<>();
        private boolean clear = false;

        @Override
        public Editor putString(String key, String value) {
          pending.put(key, value);
          return this;
        }

        @Override
        public Editor putStringSet(String key, java.util.Set<String> values) {
          pending.put(key, values);
          return this;
        }

        @Override
        public Editor putInt(String key, int value) {
          pending.put(key, value);
          return this;
        }

        @Override
        public Editor putLong(String key, long value) {
          pending.put(key, value);
          return this;
        }

        @Override
        public Editor putFloat(String key, float value) {
          pending.put(key, value);
          return this;
        }

        @Override
        public Editor putBoolean(String key, boolean value) {
          pending.put(key, value);
          return this;
        }

        @Override
        public Editor remove(String key) {
          pending.remove(key);
          data.remove(key);
          return this;
        }

        @Override
        public Editor clear() {
          clear = true;
          return this;
        }

        @Override
        public boolean commit() {
          if (clear) data.clear();
          data.putAll(pending);
          return true;
        }

        @Override
        public void apply() {
          commit();
        }
      };
    }

    @Override
    public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}

    @Override
    public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener l) {}
  }
}
