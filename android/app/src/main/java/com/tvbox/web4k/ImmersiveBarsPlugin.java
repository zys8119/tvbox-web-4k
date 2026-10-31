package com.tvbox.web4k;

import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 沉浸式系统栏插件：隐藏/恢复状态栏与导航栏（“直接关闭菜单栏”）。
 * 全屏播放时前端调用 hide()，退出全屏调用 show()。
 *
 * 隐藏手段（多路叠加 + 轨道式压制，保证菜单栏真正被关闭）：
 * 1. WindowInsetsControllerCompat.hide()（Android 11+ 标准手段）；
 * 2. 窗口级 FLAG_FULLSCREEN（Android 15 以下有效，更高版本忽略但无害）；
 * 3. legacy View.SYSTEM_UI_FLAG_*（Android 10 及以下仍需）；
 * 4. insets 即时响应：压制态下 decor 层一旦监测到系统栏重现，立刻再次隐藏
 *    （对抗全屏 custom view 切换、锁屏/通知栏/最近任务等造成系统栏重显的情形）；
 * 5. 周期兜底：压制态下后台按“快->稳”节奏反复隐藏，直到前端 show() 解除压制。
 *
 * 说明：Android 的“游戏模式”（GameManager#setGameMode）需要系统级签名权限，
 * 普通 App 无法调用；此处“直接关闭菜单栏”的强制沉浸式隐藏即等效效果。
 */
@CapacitorPlugin(name = "ImmersiveBars")
public class ImmersiveBarsPlugin extends Plugin {

    private final Handler handler = new Handler(Looper.getMainLooper());

    /** 压制态：为 true 时持续把系统栏隐藏（insets 即时响应 + 周期兜底），show() 后置 false 中止 */
    private volatile boolean pendingHide = false;
    private Runnable hideRetry;
    /** 压制态收尾的稳定兜底间隔（毫秒） */
    private static final long PERSIST_INTERVAL = 3000;
    /** 进入压制态后的快速重试节奏（毫秒），随后转入 PERSIST_INTERVAL 稳定兜底 */
    private static final long[] QUICK_DELAYS = {150, 350, 700, 1200, 2000};

    private WindowInsetsControllerCompat controller() {
        Window window = getActivity().getWindow();
        return WindowCompat.getInsetsController(window, window.getDecorView());
    }

    /** 当前线程必须为 UI 线程；叠加所有隐藏手段（幂等，可重复调用） */
    private void applyHide() {
        Window window = getActivity().getWindow();
        View decorView = window.getDecorView();

        // 1) insets controller：状态栏 + 导航栏，滑动屏幕边缘可临时唤出后自动收起
        WindowInsetsControllerCompat controller = controller();
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());

        // 2) 窗口级 FLAG_FULLSCREEN：强隐藏头部状态栏
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

        // 3) legacy flags（Android 10 及以下仍需；11+ 已废弃但保留无害）
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /**
     * 注册 decor 视图的 insets 监听（被动观察，不消费 insets）：
     * 压制态下系统栏（状态栏/导航栏）一旦重新变成可见，立即再隐藏。
     * 相比定时重试这是“即时响应”，全屏 custom view 切换、通知栏下拉、
     * 锁屏/最近任务返回等瞬间触发的重显都能被第一时间压制。
     */
    private void watchInsets(View decorView) {
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, insets) -> {
            if (pendingHide) {
                if (insets.isVisible(WindowInsetsCompat.Type.statusBars())
                        || insets.isVisible(WindowInsetsCompat.Type.navigationBars())) {
                    applyHide();
                }
            }
            return insets; // 原样透传，不干扰子视图的正常 insets 分发
        });
    }

    /** 隐藏状态栏与导航栏（沉浸式：滑动屏幕边缘可临时唤出，短暂停留后自动收起） */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            pendingHide = true;
            View decorView = getActivity().getWindow().getDecorView();
            watchInsets(decorView);
            applyHide();
            // 压制态：先按快速节奏反复隐藏（对抗全屏切换/方向锁定的瞬态重显），
            // 之后转稳定兜底持续压制，直到前端主动 show()。
            if (hideRetry != null) handler.removeCallbacks(hideRetry);
            hideRetry = new Runnable() {
                int n = 0;

                @Override
                public void run() {
                    if (!pendingHide) return;
                    applyHide();
                    long delay = n < QUICK_DELAYS.length ? QUICK_DELAYS[n++] : PERSIST_INTERVAL;
                    handler.postDelayed(this, delay);
                }
            };
            handler.postDelayed(hideRetry, 100);
        });
        call.resolve();
    }

    /** 恢复显示状态栏与导航栏 */
    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            pendingHide = false;
            if (hideRetry != null) {
                handler.removeCallbacks(hideRetry);
                hideRetry = null;
            }
            Window window = getActivity().getWindow();
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            // 恢复系统栏显示（保持 edge-to-edge 透明悬浮式样）
            WindowInsetsControllerCompat controller = controller();
            controller.show(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // 深色界面：保持浅色图标
                controller.setAppearanceLightStatusBars(false);
            }
        });
        call.resolve();
    }

    /** 返回系统栏当前实际高度（px）：top=状态栏高度（隐藏时为 0），bottom=导航栏高度（隐藏时为 0）。 */
    @PluginMethod
    public void getInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            int top = 0;
            int bottom = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsets insets =
                        getActivity().getWindow().getDecorView().getRootWindowInsets();
                if (insets != null) {
                    // getInsets 返回"当前可见"的系统栏 insets：隐藏时返回 0，
                    // 与前端全屏隐藏逻辑保持一致（隐藏成功后无需额外偏移）
                    android.graphics.Insets statusBar =
                            insets.getInsets(WindowInsets.Type.statusBars());
                    android.graphics.Insets navBar =
                            insets.getInsets(WindowInsets.Type.navigationBars());
                    top = statusBar.top;
                    bottom = navBar.bottom;
                }
            } else {
                // Android 10 及以下无 WindowInsets API，读取系统资源兜底
                top = systemBarDimension("status_bar_height");
                bottom = systemBarDimension("navigation_bar_height");
            }
            JSObject ret = new JSObject();
            ret.put("top", top);
            ret.put("bottom", bottom);
            call.resolve(ret);
        });
    }

    /** 读取系统资源定义的系统栏高度（px），找不到时返回 0 */
    private int systemBarDimension(String name) {
        try {
            int id = getActivity().getResources()
                    .getIdentifier(name, "dimen", "android");
            if (id > 0) return getActivity().getResources().getDimensionPixelSize(id);
        } catch (Exception ignored) {
            /* 忽略，返回 0 */
        }
        return 0;
    }
}