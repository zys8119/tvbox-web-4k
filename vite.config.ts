import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import UnoCSS from "unocss/vite";
import { fileURLToPath, URL } from "node:url";
import Devtools from "vite-plugin-vue-devtools";

// 后端 Node 服务（node/main.ts）默认 3001，可用 VITE_API_TARGET 覆盖
export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    Devtools({
      launchEditor: "./editor.sh",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
