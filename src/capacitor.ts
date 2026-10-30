import { Capacitor } from "@capacitor/core";
import { Nodejs } from "@capawesome/capacitor-nodejs";

export const BACKEND_BASE = "http://127.0.0.1:3001";
let started = false;

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