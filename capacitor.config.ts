import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tvbox.web4k",
  appName: "TVBox 4K",
  webDir: "dist",
  plugins: {
    Nodejs: {
      startMode: "manual",
      nodeDir: "nodejs",
    },
  },
};

export default config;