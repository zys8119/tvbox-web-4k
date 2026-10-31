package com.tvbox.web4k;

import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 沉浸式系统栏插件：隐藏/恢复状态栏与导航栏。
 * 全屏播放时前端调用 hide()，退出全屏调用 show()。
 *
 * 隐藏手段（三重叠加，提高可靠性）：
 * 1. WindowInsetsControllerCompat.hide()（Android 11+ 标准手段）；
 * 2. 窗口级 FLAG_FULLSCREEN（强隐藏头部状态栏的手段）；
 * 3. legacy View.SYSTEM_UI_FLAG_*（Android 10 及以下）；
 * 并重复延迟执行，对抗 WebView 全屏 custom view 切换瞬间系统重新显示状态栏。
 */
@CapacitorPlugin(name = "ImmersiveBars")
public class ImmersiveBarsPlugin extends Plugin {

    private final Handler handler = new Handler(Looper.getMainLooper());

    /** 是否处于隐藏态：为 true 时延迟重试继续生效；show() 后置 false 中止 */
    private volatile boolean pendingHide = false;
    private Runnable hideRetry;

    /** 延迟重试间隔（毫秒）：全屏切换/方向锁定时系统栏多次被系统或 WebView 重新显示 */
    private static final int[] RETRY_DELAYS = {200, 500, 1200, 2500, 5000, 10000};

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

        // 2) 窗口级 FLAG_FULLSCREEN：强隐藏头部状态栏（所有 API 级别可用）
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

    /** 隐藏状态栏与导航栏（沉浸式：滑动屏幕边缘可临时唤出，短暂停留后自动收起） */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            pendingHide = true;
            applyHide();
            // 全屏切换（WebView custom view）期间系统可能重新显示系统栏，延迟重复执行
            if (hideRetry != null) handler.removeCallbacks(hideRetry);
            hideRetry = new Runnable() {
                int index = 0;

                @Override
                public void run() {
                    if (!pendingHide) return;
                    applyHide();
                    if (++index < RETRY_DELAYS.length) {
                        handler.postDelayed(this, RETRY_DELAYS[index]);
                    }
                }
            };
            handler.postDelayed(hideRetry, RETRY_DELAYS[0]);
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
}