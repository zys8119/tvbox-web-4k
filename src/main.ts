import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import "virtual:uno.css";
import "./style.css";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { startEmbeddedBackend, useEmbeddedBackend } from "./capacitor";
import App from "./App.vue";
import Home from "./views/Home.vue";
import Category from "./views/Category.vue";
import Search from "./views/Search.vue";
import Detail from "./views/Detail.vue";
import Player from "./views/Player.vue";
import History from "./views/History.vue";
import Favorites from "./views/Favorites.vue";
import Settings from "./views/Settings.vue";
import Sites from "./views/Sites.vue";
import SiteDetail from "./views/SiteDetail.vue";
import SitePlayer from "./views/SitePlayer.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: Home },
    { path: "/category/:tid", name: "category", component: Category },
    { path: "/search", name: "search", component: Search },
    { path: "/detail/:id", name: "detail", component: Detail },
    { path: "/play", name: "play", component: Player },
    { path: "/history", name: "history", component: History },
    { path: "/favorites", name: "favorites", component: Favorites },
    { path: "/settings", name: "settings", component: Settings },
    { path: "/sites", name: "sites", component: Sites },
    { path: "/site/detail", name: "site-detail", component: SiteDetail },
    { path: "/site/play", name: "site-play", component: SitePlayer },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

async function bootstrap(): Promise<void> {
  if (useEmbeddedBackend()) {
    await startEmbeddedBackend();
  }
  createApp(App).use(router).mount("#app");
  // 原生平台（Android/iOS）接管系统返回键
  if (Capacitor.isNativePlatform()) {
    registerBackButton();
  }
}

/* ============================== 系统返回键 ============================== */

/** 首页再次按返回键的确认时间窗（毫秒） */
const BACK_AGAIN_WINDOW = 2000;
let lastBackAt = 0;
/** 首页"再按一次返回退出"提示元素（惰性创建） */
let exitHintEl: HTMLDivElement | null = null;
let exitHintTimer: ReturnType<typeof setTimeout> | undefined;

/** 在屏幕下方显示临时提示（与播放器 OSD 风格一致） */
function showExitHint() {
  if (!exitHintEl) {
    exitHintEl = document.createElement("div");
    exitHintEl.textContent = "再按一次返回退出";
    exitHintEl.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:96px",
      "transform:translateX(-50%)",
      "z-index:9999",
      "padding:10px 18px",
      "border-radius:12px",
      "background:rgba(0,0,0,.78)",
      "color:#fff",
      "font-size:14px",
      "backdrop-filter:blur(8px)",
      "box-shadow:0 8px 30px rgba(0,0,0,.5)",
      "transition:opacity .25s ease",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(exitHintEl);
  }
  exitHintEl.style.opacity = "1";
  clearTimeout(exitHintTimer);
  exitHintTimer = setTimeout(() => {
    if (exitHintEl) exitHintEl.style.opacity = "0";
  }, 2000);
}

/**
 * 系统返回键策略：
 * 1. 播放全屏中 → 先退出全屏（不返回页面）；
 * 2. 非首页 → 返回上一页（history 为空时回退到首页）；
 * 3. 首页 → 2 秒内再次按下才退出 App，否则提示"再按一次返回退出"。
 */
function registerBackButton(): void {
  CapApp.addListener("backButton", () => {
    // 全屏播放中：优先退出全屏（与界面左上角返回键一致）
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const route = router.currentRoute.value;
    if (route.name && route.name !== "home") {
      // 有上级页面可回则返回上一页，否则回退到首页
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push({ name: "home" });
      }
      return;
    }
    // 首页：双击确认退出
    const now = Date.now();
    if (now - lastBackAt < BACK_AGAIN_WINDOW) {
      CapApp.exitApp();
      return;
    }
    lastBackAt = now;
    showExitHint();
  });
}

void bootstrap();
