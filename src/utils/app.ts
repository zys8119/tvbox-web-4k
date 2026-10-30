/**
 * 运行环境工具：识别 Capacitor 原生 App（如 Android WebView），
 * 并提供屏幕横屏方向的锁定与恢复能力（用于 App 端横屏播放）。
 */

/** 是否运行在 Capacitor 原生 App 内（WebView 中注入 window.Capacitor 全局对象） */
export function isNativeApp(): boolean {
  const c = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return !!c?.isNativePlatform?.();
}

/**
 * 请求横屏播放：优先通过 Capacitor 屏幕方向插件锁定，不可用时回退到
 * WebView 的 Screen Orientation API；均失败则静默忽略（用户可手动旋转）。
 */
export async function lockLandscape(): Promise<void> {
  try {
    const cap = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            ScreenOrientation?: {
              lock?: (o: { orientation: string }) => Promise<void>;
            };
          };
        };
      }
    ).Capacitor;
    if (cap?.Plugins?.ScreenOrientation?.lock) {
      await cap.Plugins.ScreenOrientation.lock({ orientation: "landscape" });
      return;
    }
  } catch {
    /* 插件不可用，回退 WebView API */
  }
  try {
    const so = (
      screen as unknown as {
        orientation?: { lock?: (o: string) => Promise<void> };
      }
    ).orientation;
    if (so?.lock) await so.lock("landscape");
  } catch {
    /* 不支持或无权限时忽略 */
  }
}

/** 恢复系统自动方向（离开播放页时调用，避免后续页面停留在横屏） */
export async function unlockOrientation(): Promise<void> {
  try {
    const so = (
      screen as unknown as { orientation?: { unlock?: () => Promise<void> } }
    ).orientation;
    if (so?.unlock) await so.unlock();
  } catch {
    /* 忽略 */
  }
}