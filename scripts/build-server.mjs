/**
 * 打包 server 端为单文件 ESM bundle，供 APK 内嵌 Node 运行时使用
 * （@capawesome/capacitor-nodejs，nodejs-mobile Node 18.20.4）。
 *
 * 产物输出到 dist/nodejs/：
 *   - index.mjs     服务端全部代码（esbuild -> ESM，保留顶层 await）
 *   - sql-wasm.wasm sql.js 的 WASM 运行时（sqlite.ts 按同目录定位）
 *
 * Linux 上 esbuild issue vs node 无直接关系；bundle 时会自动 external node: 内置模块。
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist", "nodejs");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "server", "main.ts")],
  outfile: path.join(outDir, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  // node: 内置模块由 nodejs-mobile 运行时提供；sql.js 为 emscripten UMD（内部有
  // 运行时 require），打包会导致 Dynamic require 失败，故原样复制到 bundle 目录
  external: ["node:*", "sql.js"],
  logLevel: "info",
});

// sql.js 包按运行时解析复制到 dist/nodejs/node_modules/sql.js（保留 CJS 语义）
fs.cpSync(
  path.join(root, "node_modules", "sql.js"),
  path.join(outDir, "node_modules", "sql.js"),
  {
    recursive: true,
    filter: (src) => !src.includes("node_modules/sql.js/README"),
  },
);

fs.copyFileSync(
  path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  path.join(outDir, "sql-wasm.wasm"),
);

console.log("[build-server] bundle ready:", path.relative(root, outDir));
