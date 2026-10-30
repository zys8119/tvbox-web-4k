package com.tvbox.web4k;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 系统栏透明化：配合 Web 端 StatusBar.setOverlaysWebView 实现播放全屏时
        // 系统菜单栏（状态栏 + 导航栏）透明悬浮在界面之上；Android 15+ 本身强制
        // edge-to-edge，此处保证低版本系统行为一致。
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
    }
}