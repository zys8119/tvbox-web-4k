package com.tvbox.web4k;

import android.view.Window;

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
 */
@CapacitorPlugin(name = "ImmersiveBars")
public class ImmersiveBarsPlugin extends Plugin {

    private WindowInsetsControllerCompat controller() {
        Window window = getActivity().getWindow();
        return WindowCompat.getInsetsController(window, window.getDecorView());
    }

    /** 隐藏状态栏与导航栏（沉浸式：滑动屏幕边缘可临时唤出，短暂停留后自动收起） */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat controller = controller();
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        });
        call.resolve();
    }

    /** 恢复显示状态栏与导航栏 */
    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            controller().show(WindowInsetsCompat.Type.systemBars());
        });
        call.resolve();
    }
}