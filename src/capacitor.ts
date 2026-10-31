import { Capacitor, registerPlugin } from "@capacitor/core";
import { Nodejs } from "@capawesome/capacitor-nodejs";

export const BACKEND_BASE = "http://127.0.0.1:3001";
let started = false;

/** 沉浸式系统栏插件（原生端 ImmersiveBarsPlugin）：hide 隐藏状态栏/导航栏，show 恢复 */
interface ImmersiveBarsPlugin {
  hide(): Promise<void>;
  show(): Promise<void>;
  getInsets(): Promise<{ top: number; bottom: number }>;
}
export const ImmersiveBars = registerPlugin<ImmersiveBarsPlugin>("ImmersiveBars");

/** 读取系统栏当前可见高度（px），并将其写入全局 CSS 变量，供全屏控制条做安全区偏移 */
export async function refreshSystemInsets(): Promise<void> {
  let top = 0;
  let bottom = 0;
  if (isNative()) {
    try {
      const insets = await ImmersiveBars.getInsets();
      top = insets.top;
      bottom = insets.bottom;
    } catch {
      /* 读取失败时按 0 处理 */
    }
  }
  const root = document.documentElement;
  root.style.setProperty("--sys-inset-top", `${top}px`);
  root.style.setProperty("--sys-inset-bottom", `${bottom}px`);
}

/** 隐藏系统菜单栏（状态栏 + 导航栏），仅在原生平台有效 */
export function hideSystemBars(): void {
  if (!isNative()) return;
  ImmersiveBars.hide().catch(() => {});
}

/** 恢复系统菜单栏显示，仅在原生平台有效 */
export function showSystemBars(): void {
  if (!isNative()) return;
  ImmersiveBars.show().catch(() => {});
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function useEmbeddedBackend(): boolean {
  return isNative();
}

export async function startEmbeddedBackend(): Promise<void> {
  if (!isNative() || started) return;
  started = true;
  try {
    await Nodejs.start({
      script: "index.mjs",
      env: { TVBOX_NO_JVM: "1", TVBOX_FORCE_SQLJS: "1", PORT: "3001" },
    });
  } catch (e) {
    console.warn("[embedded-node] start error:", e);
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BACKEND_BASE}/`);
      if (r.ok) return;
    } catch {
      /* 未就绪，重试 */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  console.warn("[embedded-node] backend not ready within 15s");
}