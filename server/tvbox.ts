/**
 * TVBox 订阅适配层
 *
 * 支持范围（浏览器可执行部分）：
 *   - type 1  : 苹果CMS / 标准 JSON 采集站，全量支持列表、分类、搜索、详情、播放
 *   - type 4  : 聚合 API，可递归展开其内部站点
 *   - type 0  : 仅解析 / 列表（当前订阅中未使用，保留兼容）
 *   - type 3  : csp_* 通过服务端 JVM 桥接执行
 */
import {
  getJsonSetting,
  getSetting,
  setJsonSetting,
  setSetting,
} from "./db.ts";

/** 订阅响应需要用 TVBox 客户端的 UA，否则服务端返回 HTML 介绍页 */
export const TVBOX_UA = "okhttp/3.12.1";

export interface RawSite {
  key: string;
  name: string;
  type: number;
  api?: string;
  searchable?: number;
  quickSearch?: number;
  filterable?: number;
  categories?: string[];
  jar?: string;
  ext?: unknown;
  playerType?: number;
}

/** 规范化后的站点 */
export interface Site {
  key: string;
  name: string;
  type: number;
  api: string;
  /** 是否可由本服务代理执行 */
  supported: boolean;
  /** 不支持的原因 */
  reason?: string;
  searchable: boolean;
  categories: string[];
}

export interface Subscription {
  spider?: string;
  sites: RawSite[];
  lives: unknown[];
  parses: unknown[];
  flags: string[];
  /** 拉取时间 */
  fetchedAt: number;
  /** 来源地址 */
  source: string;
}

export interface SubscriptionSource {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}

const SUB_LIST_KEY = "tvbox.subscriptions";
const ACTIVE_ID_KEY = "tvbox.active";
const LEGACY_SUB_KEY = "tvbox.subscription";
const LEGACY_URL_KEY = "tvbox.url";
const LEGACY_ENABLED_KEY = "tvbox.enabled";

function subCacheKey(id: string) {
  return "tvbox.subscription." + id;
}

function enabledKey(id: string) {
  return "tvbox.enabled." + id;
}

function now() {
  return Date.now();
}

function newId() {
  return (
    "sub_" + now().toString(36) + "_" + Math.random().toString(36).slice(2, 8)
  );
}

function inferName(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname || url;
  } catch {
    return url;
  }
}

function normalizeSources(raw: unknown): SubscriptionSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => {
      const row = it as Record<string, unknown>;
      const url = String(row.url ?? "").trim();
      if (!url) return null;
      const id = String(row.id ?? "").trim() || newId();
      return {
        id,
        name: String(row.name ?? "").trim() || inferName(url),
        url,
        createdAt: Number(row.createdAt ?? 0) || now(),
        updatedAt: Number(row.updatedAt ?? 0) || now(),
      } satisfies SubscriptionSource;
    })
    .filter(Boolean) as SubscriptionSource[];
}

function migrateLegacy(): void {
  const hasList = getJsonSetting<unknown[]>(SUB_LIST_KEY, []);
  if (Array.isArray(hasList) && hasList.length) return;

  const url = getSetting(LEGACY_URL_KEY, "").trim();
  const sub = getJsonSetting<Subscription | null>(LEGACY_SUB_KEY, null);
  if (!url && !sub) return;

  const id = newId();
  const source: SubscriptionSource = {
    id,
    name: inferName(url || sub?.source || "默认订阅"),
    url: url || sub?.source || "",
    createdAt: now(),
    updatedAt: now(),
  };
  setJsonSetting(SUB_LIST_KEY, [source]);
  setSetting(ACTIVE_ID_KEY, id);
  if (sub) setJsonSetting(subCacheKey(id), sub);
  const enabled = getJsonSetting<Record<string, boolean>>(
    LEGACY_ENABLED_KEY,
    {},
  );
  if (Object.keys(enabled).length) setJsonSetting(enabledKey(id), enabled);
}

/* ============================== 订阅管理 ============================== */

export function listSubscriptionSources(): SubscriptionSource[] {
  migrateLegacy();
  return normalizeSources(getJsonSetting<unknown[]>(SUB_LIST_KEY, [])).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

export function getActiveSubscriptionId(): string {
  migrateLegacy();
  const id = getSetting(ACTIVE_ID_KEY, "");
  if (id) return id;
  const first = listSubscriptionSources()[0];
  return first?.id ?? "";
}

export function getActiveSubscriptionSource(): SubscriptionSource | null {
  const id = getActiveSubscriptionId();
  return listSubscriptionSources().find((x) => x.id === id) ?? null;
}

export function getSubscriptionUrl(): string {
  return getActiveSubscriptionSource()?.url ?? "";
}

export function getCachedSubscription(
  id = getActiveSubscriptionId(),
): Subscription | null {
  if (!id) return null;
  return getJsonSetting<Subscription | null>(subCacheKey(id), null);
}

export function saveSubscriptionSource(input: {
  url: string;
  name?: string;
  id?: string;
}): SubscriptionSource {
  const url = input.url.trim();
  if (!url) throw new Error("缺少订阅地址");
  const list = listSubscriptionSources();
  const stamp = now();
  const current = input.id ? list.find((x) => x.id === input.id) : undefined;
  const source: SubscriptionSource = current
    ? {
        ...current,
        name: input.name?.trim() || current.name || inferName(url),
        url,
        updatedAt: stamp,
      }
    : {
        id: newId(),
        name: input.name?.trim() || inferName(url),
        url,
        createdAt: stamp,
        updatedAt: stamp,
      };
  const next = current
    ? list.map((x) => (x.id === current.id ? source : x))
    : [source, ...list];
  setJsonSetting(SUB_LIST_KEY, next);
  setSetting(ACTIVE_ID_KEY, source.id);
  return source;
}

export function setActiveSubscription(id: string): SubscriptionSource {
  const list = listSubscriptionSources();
  const source = list.find((x) => x.id === id);
  if (!source) throw new Error("订阅不存在");
  setSetting(ACTIVE_ID_KEY, source.id);
  return source;
}

export function removeSubscription(id: string): void {
  const list = listSubscriptionSources();
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) throw new Error("订阅不存在");
  setJsonSetting(SUB_LIST_KEY, next);
  const active = getActiveSubscriptionId();
  if (active === id) {
    setSetting(ACTIVE_ID_KEY, next[0]?.id ?? "");
  }
}

export async function setSubscriptionUrl(
  url: string,
  name?: string,
  id?: string,
): Promise<Subscription> {
  const source = saveSubscriptionSource({ url, name, id });
  return await refreshSubscription(source.id);
}

export function getEnabledMap(
  id = getActiveSubscriptionId(),
): Record<string, boolean> {
  if (!id) return {};
  return getJsonSetting<Record<string, boolean>>(enabledKey(id), {});
}

/** 带超时的 fetch */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 尝试把订阅响应解析成 JSON，兼容纯 JSON、Base64、带混淆代码的 Base64 */
function parseSubscriptionJson(text: string): Record<string, unknown> {
  const toJson = (s: string): Record<string, unknown> | null => {
    const t = s.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) return null;
    try {
      return JSON.parse(t) as Record<string, unknown>;
    } catch {
      try {
        return new Function("return " + t)();
      } catch {
        return null;
      }
    }
  };

  // 1) 直接是 JSON
  const direct = toJson(text);
  if (direct) return direct;

  // 2) 整个响应就是 Base64
  const wholeDecoded = Buffer.from(text, "base64").toString("utf8");
  const fromWhole = toJson(wholeDecoded);
  if (fromWhole) return fromWhole;

  // 3) 内容里混着混淆代码，提取最长的 Base64 段
  const matches = text.match(/[A-Za-z0-9+/]{100,}={0,2}/g);
  if (matches?.length) {
    const base64 = matches.sort((a, b) => b.length - a.length)[0];
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    // 删除以 // 开头的整行注释
    const cleaned = decoded
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    const fromExtracted = toJson(cleaned);
    if (fromExtracted) return fromExtracted;
  }

  throw new Error(
    "订阅返回的不是 JSON，请确认地址正确（部分站点需 TVBox 客户端 UA）",
  );
}

/** 拉取并解析订阅 */
export async function refreshSubscription(
  id = getActiveSubscriptionId(),
): Promise<Subscription> {
  const source = id
    ? (listSubscriptionSources().find((x) => x.id === id) ?? null)
    : null;
  const url = source?.url?.trim() ?? "";
  if (!source || !url) throw new Error("尚未设置订阅地址");

  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": TVBOX_UA,
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error("订阅请求失败：HTTP " + res.status);

  const text = (await res.text()).trim();
  const raw = parseSubscriptionJson(text);

  const sub: Subscription = {
    spider: typeof raw.spider === "string" ? raw.spider : undefined,
    sites: Array.isArray(raw.sites) ? (raw.sites as RawSite[]) : [],
    lives: Array.isArray(raw.lives) ? raw.lives : [],
    parses: Array.isArray(raw.parses) ? raw.parses : [],
    flags: Array.isArray(raw.flags) ? (raw.flags as string[]) : [],
    fetchedAt: Date.now(),
    source: url,
  };

  setJsonSetting(subCacheKey(source.id), sub);
  return sub;
}

/* ============================== 站点列表 ============================== */

/** 判断站点是否可由本服务代理 */
function judge(s: RawSite): { supported: boolean; reason?: string } {
  if (s.type === 1) {
    return s.api && /^https?:\/\//i.test(s.api)
      ? { supported: true }
      : { supported: false, reason: "缺少有效 api 地址" };
  }
  if (s.type === 4) {
    return s.api && /^https?:\/\//i.test(s.api)
      ? { supported: true }
      : { supported: false, reason: "缺少有效 api 地址" };
  }
  if (s.type === 3) {
    return s.api
      ? { supported: true }
      : { supported: false, reason: "缺少有效 csp api" };
  }
  if (s.type === 0) {
    return { supported: true };
  }
  return { supported: false, reason: "未支持的站点类型 " + s.type };
}

/** 把订阅里的原始站点规范化 */
export function normalizeSites(sub: Subscription): Site[] {
  return sub.sites.map((s) => {
    const j = judge(s);
    return {
      key: String(s.key ?? ""),
      name: String(s.name ?? s.key ?? ""),
      type: Number(s.type ?? 0),
      api: String(s.api ?? ""),
      supported: j.supported,
      reason: j.reason,
      searchable: s.searchable !== 0,
      categories: Array.isArray(s.categories) ? s.categories : [],
    };
  });
}

/** 设置某站点是否启用 */
export function setSiteEnabled(
  key: string,
  enabled: boolean,
  id = getActiveSubscriptionId(),
): void {
  const map = getEnabledMap(id);
  map[key] = enabled;
  if (id) setJsonSetting(enabledKey(id), map);
}

/** 批量设置站点启用状态 */
export function setSitesEnabled(
  keys: string[],
  enabled: boolean,
  id = getActiveSubscriptionId(),
): void {
  const map = getEnabledMap(id);
  for (const k of keys) map[k] = enabled;
  if (id) setJsonSetting(enabledKey(id), map);
}

/** 只返回已启用且可代理的站点 */
export function activeSites(sub: Subscription): Site[] {
  const enabled = getEnabledMap();
  return normalizeSites(sub).filter(
    (s) =>
      s.supported && (enabled[s.key] === undefined ? true : enabled[s.key]),
  );
}

/** 返回已启用且可代理的原始站点配置 */
export function activeRawSites(sub: Subscription): RawSite[] {
  const enabled = getEnabledMap();
  return sub.sites.filter((s) => {
    const key = String(s.key ?? "");
    const j = judge(s);
    return j.supported && (enabled[key] === undefined ? true : enabled[key]);
  });
}

/* ============================== 苹果CMS 请求 ============================== */

/** 苹果CMS 接口返回结构（只声明用到的字段） */
export interface MacCmsItem {
  vod_id: number | string;
  vod_name: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_play_from?: string;
  vod_play_url?: string;
  vod_content?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_area?: string;
  vod_year?: string;
  vod_class?: string;
  type_name?: string;
  [k: string]: unknown;
}

export interface MacCmsList {
  code?: number;
  msg?: string;
  page?: number | string;
  pagecount?: number;
  limit?: number | string;
  total?: number;
  list?: MacCmsItem[];
  class?: { type_id: number | string; type_name: string }[];
}

/**
 * 把站点 api 转成真正可用的接口地址。
 * 采集站通常给的是 `...?ac=list`，需要替换 ac 参数并追加页码等。
 */
function buildApiUrl(
  api: string,
  params: Record<string, string | number | undefined>,
): string {
  const u = new URL(api);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/** 请求苹果CMS接口 */
async function callMacCms(
  api: string,
  params: Record<string, string | number | undefined>,
): Promise<MacCmsList> {
  const url = buildApiUrl(api, params);
  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": TVBOX_UA,
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error("接口请求失败：HTTP " + res.status);
  const text = (await res.text()).trim();
  try {
    return JSON.parse(text) as MacCmsList;
  } catch {
    throw new Error("接口返回非 JSON，站点可能已失效");
  }
}

/** 首页：返回分类 + 首页推荐 */
export async function macHome(api: string) {
  // ac=list 只返回轻量字段，用于拿分类
  const list = await callMacCms(api, { ac: "list" });
  const classes = (list.class ?? []).map((c) => ({
    type_id: String(c.type_id),
    type_name: String(c.type_name),
  }));

  // 再取第一页详情作为首页推荐
  const detail = await callMacCms(api, { ac: "detail", pg: 1 });
  const videos = (detail.list ?? []).map(toListItem);
  return { class: classes, list: videos };
}

/** 剥离 TVBox 源在图片地址后附加的 @Referer=xx@User-Agent=xx 参数段 */
export function cleanPic(raw: unknown): string {
  const s = String(raw ?? "");
  const at = s.indexOf("@");
  if (at <= 0) return s;
  // 仅当 @ 后是键值参数（如 Referer=/User-Agent=）时剥离，避免误伤普通 URL
  if (/^@[A-Za-z-]+\s*=/.test(s.slice(at))) return s.slice(0, at);
  return s;
}

/** 统一成前端 VodItem 结构 */
export function toListItem(v: MacCmsItem) {
  return {
    vod_id: String(v.vod_id),
    vod_name: String(v.vod_name ?? ""),
    vod_pic: cleanPic(v.vod_pic),
    vod_remarks: String(v.vod_remarks ?? ""),
  };
}

/** 分类列表 */
export async function macCategory(
  api: string,
  tid: string,
  page: number,
  ext?: Record<string, string>,
) {
  const params: Record<string, string | number | undefined> = {
    ac: "detail",
    t: tid,
    pg: page,
  };
  // 采集站扩展筛选：class / year / area / by
  if (ext?.class) params.class = ext.class;
  if (ext?.year) params.year = ext.year;
  if (ext?.area) params.area = ext.area;
  if (ext?.by) params.by = ext.by;

  const data = await callMacCms(api, params);
  return {
    page: Number(data.page ?? page) || page,
    pagecount: Number(data.pagecount ?? 1) || 1,
    limit: Number(data.limit ?? 20) || 20,
    total: Number(data.total ?? 0) || 0,
    list: (data.list ?? []).map(toListItem),
  };
}

/** 搜索 */
export async function macSearch(api: string, wd: string, page = 1) {
  const data = await callMacCms(api, { ac: "detail", wd, pg: page });
  return (data.list ?? []).map(toListItem);
}

/** 详情：把 vod_play_from / vod_play_url 解析成结构化线路 */
export async function macDetail(api: string, ids: string) {
  const data = await callMacCms(api, { ac: "detail", ids });
  const v = (data.list ?? [])[0];
  if (!v) throw new Error("未找到该影片");

  const froms = String(v.vod_play_from ?? "").split("$$$");
  const urls = String(v.vod_play_url ?? "").split("$$$");

  const lines = froms.map((from, i) => {
    const raw = urls[i] ?? "";
    const episodes = raw
      .split("#")
      .filter(Boolean)
      .map((item) => {
        const pos = item.indexOf("$");
        const name = pos < 0 ? item : item.slice(0, pos);
        const url = pos < 0 ? "" : item.slice(pos + 1);
        return { name, url, direct: true };
      });
    return { from: from || "线路" + (i + 1), episodes };
  });

  return {
    vod_id: String(v.vod_id),
    vod_name: String(v.vod_name ?? ""),
    vod_pic: cleanPic(v.vod_pic),
    vod_actor: String(v.vod_actor ?? ""),
    vod_director: String(v.vod_director ?? ""),
    vod_tag: String(v.vod_class ?? ""),
    vod_area: String(v.vod_area ?? ""),
    vod_year: String(v.vod_year ?? ""),
    vod_remarks: String(v.vod_remarks ?? ""),
    vod_content: String(v.vod_content ?? ""),
    vod_play_list: lines,
  };
}

/* ============================== type 4 聚合 ============================== */

/**
 * 聚合 API 返回的通常也是标准 TVBox 配置（含 sites）。
 * 这里只取其 sites 并加上前缀，避免 key 冲突。
 */
export async function expandAggregate(
  api: string,
  prefix: string,
): Promise<RawSite[]> {
  const res = await fetchWithTimeout(api, {
    headers: { "User-Agent": TVBOX_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("聚合接口请求失败：HTTP " + res.status);
  const text = (await res.text()).trim();
  if (!text.startsWith("{")) throw new Error("聚合接口未返回 JSON");
  const json = JSON.parse(text) as { sites?: RawSite[] };
  return (json.sites ?? []).map((s) => ({
    ...s,
    key: prefix + "_" + s.key,
  }));
}
