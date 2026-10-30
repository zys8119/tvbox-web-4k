/**
 * Capacitor 原生平台桥接
 *
 * - 仅在原生 APK（Capacitor）环境中生效；
 * - 通过 @capawesome/capacitor-nodejs 内嵌 Node.js 运行时启动本地后端服务
 *   （http://127.0.0.1:3001），前端 API 全部走该服务，实现离线自包含。
 */
import { Capacitor } from "@capacitor/core";
import { Nodejs } from "@capawesome/capacitor-nodejs";

/** 内嵌 Node 后端地址（与 server/main.ts 默认 PORT 一致） */
export const BACKEND_BASE = "http://127.0.0.1:3001";

let started = false;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 是否启用内嵌后端（APK 中为 true，浏览器/桌面为 false） */
export function useEmbeddedBackend(): boolean {
  return isNative();
}

/**
 * 启动内嵌 Node 后端，并轮询等待 HTTP 服务就绪。
 * 幂等：重复调用只启动一次。
 */
export async function startEmbeddedBackend(): Promise<void> {
  if (!isNative() || started) return;
  started = true;
  try {
    await Nodejs.start({
      script: "index.mjs",
      env: {
        TVBOX_NO_JVM: "1",
        TVBOX_FORCE_SQLJS: "1",
        PORT: "3001",
      },
    });
  } catch (e) {
    // 启动失败时放行（如已由 auto 模式启动），后续轮询兜底
    console.warn("[embedded-node] start error:", e);
  }
  // 等待服务监听就绪（Node 线程启动后 HTTP listen 为异步）
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
