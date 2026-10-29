import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import type { RawSite } from "./tvbox.ts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

type BridgeResponse = {
  id: string;
  ok: boolean;
  result?: string | null;
  error?: string;
};

type Pending = {
  resolve: (value: string | null) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

type VodItem = {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks: string;
};

type PlayEpisode = {
  name: string;
  url: string;
  direct: boolean;
  play_url: string;
  payload?: Record<string, string>;
};

type PlayLine = {
  from: string;
  episodes: PlayEpisode[];
};

const BRIDGE_DIR = path.resolve(process.cwd(), "server/jarbridge");
const BUILD_DIR = path.join(BRIDGE_DIR, "build/classes");
const BRIDGE_CLASS = path.join(BUILD_DIR, "bridge/Bridge.class");
const LIB_DIR = path.join(BRIDGE_DIR, "lib");
const CACHE_DIR = path.join(BRIDGE_DIR, ".cache");
const JAVA_FLAGS = [
  "-XX:+UnlockDiagnosticVMOptions",
  "-XX:-BytecodeVerificationRemote",
  "-XX:-BytecodeVerificationLocal",
];
const REQUEST_TIMEOUT_MS = 60000;
const DIRECT_RE = /^.*\.(mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(\?.*)?$/i;
let compileChecked = false;

type ProcState = {
  proc: ChildProcessWithoutNullStreams;
  pending: Map<string, Pending>;
  seq: number;
  stderrTail: string;
  key: string;
};

const procPool = new Map<string, ProcState>();

function pickExecutable(kind: "java" | "javac", fallback: string): string {
  const envBin = process.env[kind === "java" ? "JAVA_BIN" : "JAVAC_BIN"];
  if (envBin && existsSync(envBin)) return envBin;
  if (process.env.JAVA_HOME) {
    const byHome = path.join(process.env.JAVA_HOME, "bin", kind);
    if (existsSync(byHome)) return byHome;
  }
  const common = `/opt/homebrew/opt/openjdk/bin/${kind}`;
  if (existsSync(common)) return common;
  return fallback;
}

function runtimeClasspath(): string[] {
  return [
    BUILD_DIR,
    path.join(LIB_DIR, "gson.jar"),
    path.join(LIB_DIR, "okhttp.jar"),
    path.join(LIB_DIR, "okio.jar"),
    path.join(LIB_DIR, "json.jar"),
    path.join(LIB_DIR, "protobuf.jar"),
    path.join(LIB_DIR, "slf4j-api.jar"),
    path.join(LIB_DIR, "slf4j-simple.jar"),
  ];
}

function classpath(spiderJar?: string | null): string {
  return [
    BUILD_DIR,
    spiderJar || path.join(LIB_DIR, "new-jvm.jar"),
    ...runtimeClasspath().slice(1),
  ].join(":");
}

function ensureCompiled(): void {
  if (compileChecked && existsSync(BRIDGE_CLASS)) return;
  if (existsSync(BRIDGE_CLASS)) {
    compileChecked = true;
    return;
  }
  const javac = pickExecutable("javac", "javac");
  const cmd =
    `mkdir -p build/classes && ` +
    `${JSON.stringify(javac)} -nowarn -encoding UTF-8 -cp 'lib/*' -d build/classes $(find src -name '*.java')`;
  const ret = spawnSync("zsh", ["-lc", cmd], {
    cwd: BRIDGE_DIR,
    encoding: "utf8",
  });
  if (ret.status !== 0 || !existsSync(BRIDGE_CLASS)) {
    throw new Error(
      "jarbridge 编译失败: " +
        (ret.stderr?.trim() || ret.stdout?.trim() || `exit ${ret.status}`),
    );
  }
  compileChecked = true;
}

function startProcess(spiderJar?: string | null): ProcState {
  ensureCompiled();
  const java = pickExecutable("java", "java");
  const key = classpath(spiderJar);
  const child = spawn(java, [...JAVA_FLAGS, "-cp", key, "bridge.Bridge"], {
    cwd: BRIDGE_DIR,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const state: ProcState = {
    proc: child,
    pending: new Map(),
    seq: 0,
    stderrTail: "",
    key,
  };
  child.stdin.setDefaultEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    state.stderrTail = (state.stderrTail + chunk).slice(-8000);
  });
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let msg: BridgeResponse | null = null;
    try {
      msg = JSON.parse(line) as BridgeResponse;
    } catch {
      return;
    }
    const task = state.pending.get(msg.id);
    if (!task) return;
    state.pending.delete(msg.id);
    clearTimeout(task.timer);
    if (msg.ok) task.resolve(msg.result ?? null);
    else task.reject(new Error(msg.error || "jarbridge 调用失败"));
  });
  child.on("exit", (code, signal) => {
    const err = new Error(
      `jarbridge 进程退出: ${signal ?? code ?? "unknown"}${state.stderrTail ? `\n${state.stderrTail.trim()}` : ""}`,
    );
    for (const [, task] of state.pending) {
      clearTimeout(task.timer);
      task.reject(err);
    }
    state.pending.clear();
    procPool.delete(state.key);
  });
  procPool.set(key, state);
  return state;
}

function ensureProcess(spiderJar?: string | null): ProcState {
  const key = classpath(spiderJar);
  const state = procPool.get(key);
  if (state && !state.proc.killed && state.proc.exitCode === null) return state;
  return startProcess(spiderJar);
}

function spiderClassName(api: string): string {
  const raw = String(api || "").trim();
  if (!raw) throw new Error("缺少 csp api");
  if (raw.includes(".")) return raw;
  const simple = raw.startsWith("csp_") ? raw.slice(4) : raw;
  return `com.github.catvod.spider.${simple}`;
}

function siteExtend(site: RawSite): string {
  if (typeof site.ext === "string") return site.ext;
  if (site.ext == null) return "";
  return JSON.stringify(site.ext);
}

function siteJarUrl(site: RawSite): string {
  const raw = typeof site.jar === "string" ? site.jar : "";
  const url = raw.split(";")[0]?.trim() ?? "";
  return /^https?:\/\//i.test(url) ? url : "";
}

function siteJarKey(site: RawSite): string {
  const url = siteJarUrl(site);
  return createHash("sha1")
    .update(`${site.api || ""}\n${url}`)
    .digest("hex");
}

function listJarClasses(jarPath: string): string[] {
  const javaJar = pickExecutable("java", "/opt/homebrew/opt/openjdk/bin/jar");
  const ret = spawnSync(javaJar.replace(/\/java$/, "/jar"), ["tf", jarPath], {
    cwd: BRIDGE_DIR,
    encoding: "utf8",
  });
  if (ret.status !== 0) return [];
  return ret.stdout
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasDexNative(jarPath: string): boolean {
  return listJarClasses(jarPath).includes(
    "com/github/catvod/spider/DexNative.class",
  );
}

async function ensureExternalJar(site: RawSite): Promise<string | null> {
  const url = siteJarUrl(site);
  if (!url) return null;
  const key = siteJarKey(site);
  const dir = path.join(CACHE_DIR, key);
  const sourceJar = path.join(dir, "source.jar");
  const vmJar = path.join(dir, "runtime.jar");
  await mkdir(dir, { recursive: true });

  if (!existsSync(sourceJar)) {
    const res = await fetch(url, {
      headers: { "User-Agent": "okhttp/3.12.1", Accept: "*/*" },
    });
    if (!res.ok) throw new Error(`下载站点 jar 失败：HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(sourceJar, buf);
  }

  if (existsSync(vmJar)) {
    if (hasDexNative(vmJar)) {
      throw new Error("该站点依赖 Android Native(DexNative/.so)，当前服务端 JVM 无法执行");
    }
    return vmJar;
  }

  const entries = listJarClasses(sourceJar);
  const hasDex = entries.includes("classes.dex");
  const hasClass = entries.some((x) => x.endsWith(".class"));

  if (hasClass && !hasDex) {
    await writeFile(vmJar, await readFile(sourceJar));
    if (hasDexNative(vmJar)) {
      throw new Error(
        "该站点依赖 Android Native(DexNative/.so)，当前服务端 JVM 无法执行",
      );
    }
    return vmJar;
  }

  if (!hasDex) {
    throw new Error("站点 jar 既不含 .class 也不含 classes.dex");
  }

  const d2j = pickExecutable("java", "java").replace(/\/java$/, "/d2j-dex2jar");
  const dex2jar = existsSync(d2j) ? d2j : "d2j-dex2jar";
  const ret = spawnSync(dex2jar, ["-f", "-o", vmJar, sourceJar], {
    cwd: BRIDGE_DIR,
    encoding: "utf8",
  });
  if (ret.status !== 0 || !existsSync(vmJar)) {
    throw new Error(
      "dex2jar 转换失败: " +
        (ret.stderr?.trim() || ret.stdout?.trim() || `exit ${ret.status}`),
    );
  }
  if (hasDexNative(vmJar)) {
    throw new Error(
      "该站点依赖 Android Native(DexNative/.so)，当前服务端 JVM 无法执行",
    );
  }
  return vmJar;
}

async function invokeSpider(
  site: RawSite,
  method: string,
  args: JsonValue[],
): Promise<string | null> {
  const extraJar = await ensureExternalJar(site);
  const state = ensureProcess(extraJar);
  const id = String(++state.seq);
  return await new Promise<string | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(
        new Error(
          `jarbridge 调用超时: ${site.key}/${method}${state.stderrTail ? `\n${state.stderrTail.trim()}` : ""}`,
        ),
      );
    }, REQUEST_TIMEOUT_MS);
    state.pending.set(id, { resolve, reject, timer });
    state.proc.stdin.write(
      JSON.stringify({
        id,
        class: spiderClassName(site.api || ""),
        method,
        args,
        extend: siteExtend(site),
      }) + "\n",
    );
  });
}

function isDirectUrl(url: string): boolean {
  return DIRECT_RE.test(url || "");
}

function selfBase(): string {
  return "http://127.0.0.1:" + Number(process.env.PORT ?? 3001);
}

function parsePlayList(playFrom: string, playUrl: string): PlayLine[] {
  if (!playFrom || !playUrl) return [];
  const froms = playFrom.split("$$$");
  const groups = playUrl.split("$$$");
  const lines: PlayLine[] = [];
  for (let i = 0; i < froms.length; i++) {
    const episodes: PlayEpisode[] = [];
    const flag = froms[i] ?? `线路${i + 1}`;
    for (const item of (groups[i] ?? "").split("#")) {
      if (!item) continue;
      const pos = item.indexOf("$");
      const name = pos < 0 ? item : item.slice(0, pos);
      const url = pos < 0 ? "" : item.slice(pos + 1);
      const direct = isDirectUrl(url);
      const ep: PlayEpisode = {
        name,
        url,
        direct,
        play_url:
          selfBase() +
          "/play?flag=" +
          encodeURIComponent(flag) +
          "&id=" +
          encodeURIComponent(url),
      };
      if (!direct && url) {
        try {
          const decoded = JSON.parse(
            Buffer.from(url, "base64").toString("utf8"),
          ) as Record<string, unknown>;
          ep.payload = Object.fromEntries(
            Object.entries(decoded).map(([k, v]) => [k, String(v ?? "")]),
          );
        } catch {
          // 保持 payload 为空
        }
      }
      episodes.push(ep);
    }
    lines.push({ from: flag, episodes });
  }
  return lines;
}

function toListItem(v: Record<string, unknown>): VodItem {
  return {
    vod_id: String(v.vod_id ?? ""),
    vod_name: String(v.vod_name ?? ""),
    vod_pic: String(v.vod_pic ?? ""),
    vod_remarks: String(v.vod_remarks ?? ""),
  };
}

function parseJson(raw: string | null, hint: string): Record<string, unknown> {
  if (!raw) throw new Error(`${hint} 返回为空`);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`${hint} 返回非 JSON`);
  }
}

function asList(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

export async function jarHome(site: RawSite): Promise<Record<string, unknown>> {
  const data = parseJson(
    await invokeSpider(site, "homeContent", [false]),
    `${site.name} 首页`,
  );
  return {
    class: asList(data.class).map((c) => ({
      type_id: String(c.type_id ?? ""),
      type_name: String(c.type_name ?? ""),
    })),
    list: asList(data.list).map(toListItem),
    filters:
      data.filters && typeof data.filters === "object"
        ? (data.filters as Record<string, unknown>)
        : {},
  };
}

export async function jarCategory(
  site: RawSite,
  tid: string,
  page: number,
  ext?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const data = parseJson(
    await invokeSpider(site, "categoryContent", [
      tid,
      String(page),
      true,
      ext ?? {},
    ]),
    `${site.name} 分类`,
  );
  return {
    page: Number(data.page ?? page) || page,
    pagecount: Number(data.pagecount ?? 1) || 1,
    limit: Number(data.limit ?? 20) || 20,
    total: Number(data.total ?? 0) || 0,
    list: asList(data.list).map(toListItem),
  };
}

export async function jarDetail(
  site: RawSite,
  id: string,
): Promise<Record<string, unknown>> {
  const data = parseJson(
    await invokeSpider(site, "detailContent", [[id]]),
    `${site.name} 详情`,
  );
  const v = asList(data.list)[0];
  if (!v) throw new Error("未找到该影片");
  const playFrom = String(v.vod_play_from ?? "");
  const playUrl = String(v.vod_play_url ?? "");
  return {
    vod_id: String(v.vod_id ?? ""),
    vod_name: String(v.vod_name ?? ""),
    vod_pic: String(v.vod_pic ?? ""),
    vod_actor: String(v.vod_actor ?? ""),
    vod_director: String(v.vod_director ?? ""),
    vod_tag: String(v.vod_tag ?? v.type_name ?? v.vod_class ?? ""),
    vod_area: String(v.vod_area ?? ""),
    vod_year: String(v.vod_year ?? ""),
    vod_remarks: String(v.vod_remarks ?? ""),
    vod_content: String(v.vod_content ?? ""),
    vod_play_from: playFrom,
    vod_play_url: playUrl,
    vod_play_list: parsePlayList(playFrom, playUrl),
  };
}

export async function jarSearch(site: RawSite, wd: string): Promise<VodItem[]> {
  const data = parseJson(
    await invokeSpider(site, "searchContent", [wd, false]),
    `${site.name} 搜索`,
  );
  return asList(data.list).map(toListItem);
}
