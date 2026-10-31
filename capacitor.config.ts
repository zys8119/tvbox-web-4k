import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tvbox.web4k",
  appName: "方盒子影视",
  webDir: "dist",
  android: {
    // 页面为 https://localhost，允许加载 http 封面图/解析源（防混合内容拦截）
    allowMixedContent: true,
  },
  plugins: {
    Nodejs: {
      startMode: "manual",
      nodeDir: "nodejs",
    },
  },
};

export default config;
