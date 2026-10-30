package com.tvbox.web4k;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 注册沉浸式系统栏插件（前端全屏播放时隐藏/恢复系统菜单栏）
        registerPlugin(ImmersiveBarsPlugin.class);
        Window window = getWindow();
        // 沉浸式 edge-to-edge：布局延伸到系统栏之后，系统栏（状态栏 + 导航栏）
        // 作为透明悬浮层呈现，不占用可视区域（Android 15+ 强制 edge-to-edge，
        // 此调用在低版本通过 SYSTEM_UI_FLAG_LAYOUT_* 实现同样效果）。
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        // 深色界面：系统栏图标使用浅色（白色），保证在深色页面上清晰可见
        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(window, window.getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
        insetsController.setAppearanceLightNavigationBars(false);
    }
}