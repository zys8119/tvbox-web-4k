import { existsSync } from "node:fs";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
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
const JAVA_FLAGS = [
  "-XX:+UnlockDiagnosticVMOptions",
  "-XX:-BytecodeVerificationRemote",
  "-XX:-BytecodeVerificationLocal",
];
const REQUEST_TIMEOUT_MS = 60000;
const DIRECT_RE = /^.*\.(mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(\?.*)?$/i;

let proc: ChildProcessWithoutNullStreams | null = null;
let pending = new Map<string, Pending>();
let seq = 0;
let compileChecked = false;
let stderrTail = "";

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

function classpath(): string {
  return [
    BUILD_DIR,
    path.join(LIB_DIR, "new-jvm.jar"),
    path.join(LIB_DIR, "gson.jar"),
    path.join(LIB_DIR, "okhttp.jar"),
    path.join(LIB_DIR, "okio.jar"),
    path.join(LIB_DIR, "json.jar"),
    path.join(LIB_DIR, "protobuf.jar"),
    path.join(LIB_DIR, "slf4j-api.jar"),
    path.join(LIB_DIR, "slf4j-simple.jar"),
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

function startProcess(): ChildProcessWithoutNullStreams {
  ensureCompiled();
  const java = pickExecutable("java", "java");
  const child = spawn(
    java,
    [...JAVA_FLAGS, "-cp", classpath(), "bridge.Bridge"],
    {
      cwd: BRIDGE_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.setDefaultEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-8000);
  });
  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let msg: BridgeResponse | null = null;
    try {
      msg = JSON.parse(line) as BridgeResponse;
    } catch {
      return;
    }
    const task = pending.get(msg.id);
    if (!task) return;
    pending.delete(msg.id);
    clearTimeout(task.timer);
    if (msg.ok) task.resolve(msg.result ?? null);
    else task.reject(new Error(msg.error || "jarbridge 调用失败"));
  });
  child.on("exit", (code, signal) => {
    const err = new Error(
      `jarbridge 进程退出: ${signal ?? code ?? "unknown"}${stderrTail ? `\n${stderrTail.trim()}` : ""}`,
    );
    for (const [, task] of pending) {
      clearTimeout(task.timer);
      task.reject(err);
    }
    pending.clear();
    proc = null;
  });
  return child;
}

function ensureProcess(): ChildProcessWithoutNullStreams {
  if (proc && !proc.killed && proc.exitCode === null) return proc;
  proc = startProcess();
  return proc;
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

async function invokeSpider(
  site: RawSite,
  method: string,
  args: JsonValue[],
): Promise<string | null> {
  const child = ensureProcess();
  const id = String(++seq);
  return await new Promise<string | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          `jarbridge 调用超时: ${site.key}/${method}${stderrTail ? `\n${stderrTail.trim()}` : ""}`,
        ),
      );
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(
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
