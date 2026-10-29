/**
 * TVBox 订阅适配层
 *
 * 支持范围（浏览器可执行部分）：
 *   - type 1  : 苹果CMS / 标准 JSON 采集站，全量支持列表、分类、搜索、详情、播放
 *   - type 4  : 聚合 API，可递归展开其内部站点
 *   - type 0  : 仅解析 / 列表（当前订阅中未使用，保留兼容）
 *   - type 3  : csp_* 通过服务端 JVM 桥接执行
 */
import { getJsonSetting, getSetting, setJsonSetting, setSetting } from "./db.ts";

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

const SUB_KEY = "tvbox.subscription";
const URL_KEY = "tvbox.url";
/** 站点启用状态：{ [siteKey]: boolean } */
const ENABLED_KEY = "tvbox.enabled";

/* ============================== 订阅管理 ============================== */

export function getSubscriptionUrl(): string {
  return getSetting(URL_KEY, "");
}

export async function setSubscriptionUrl(url: string): Promise<Subscription> {
  setSetting(URL_KEY, url.trim());
  return await refreshSubscription();
}

export function getCachedSubscription(): Subscription | null {
  return getJsonSetting<Subscription | null>(SUB_KEY, null);
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

/** 拉取并解析订阅 */
export async function refreshSubscription(): Promise<Subscription> {
  const url = getSubscriptionUrl();
  if (!url) throw new Error("尚未设置订阅地址");

  const res = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": TVBOX_UA,
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error("订阅请求失败：HTTP " + res.status);

  const text = (await res.text()).trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    throw new Error(
      "订阅返回的不是 JSON，请确认地址正确（部分站点需 TVBox 客户端 UA）",
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("订阅 JSON 解析失败");
  }

  const sub: Subscription = {
    spider: typeof raw.spider === "string" ? raw.spider : undefined,
    sites: Array.isArray(raw.sites) ? (raw.sites as RawSite[]) : [],
    lives: Array.isArray(raw.lives) ? raw.lives : [],
    parses: Array.isArray(raw.parses) ? raw.parses : [],
    flags: Array.isArray(raw.flags) ? (raw.flags as string[]) : [],
    fetchedAt: Date.now(),
    source: url,
  };

  setJsonSetting(SUB_KEY, sub);
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

/** 读取站点启用状态 */
export function getEnabledMap(): Record<string, boolean> {
  return getJsonSetting<Record<string, boolean>>(ENABLED_KEY, {});
}

/** 设置某站点是否启用 */
export function setSiteEnabled(key: string, enabled: boolean): void {
  const map = getEnabledMap();
  map[key] = enabled;
  setJsonSetting(ENABLED_KEY, map);
}

/** 批量设置站点启用状态 */
export function setSitesEnabled(keys: string[], enabled: boolean): void {
  const map = getEnabledMap();
  for (const k of keys) map[k] = enabled;
  setJsonSetting(ENABLED_KEY, map);
}

/** 只返回已启用且可代理的站点 */
export function activeSites(sub: Subscription): Site[] {
  const enabled = getEnabledMap();
  return normalizeSites(sub).filter(
    (s) => s.supported && (enabled[s.key] === undefined ? true : enabled[s.key]),
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

/** 统一成前端 VodItem 结构 */
export function toListItem(v: MacCmsItem) {
  return {
    vod_id: String(v.vod_id),
    vod_name: String(v.vod_name ?? ""),
    vod_pic: String(v.vod_pic ?? ""),
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
    vod_pic: String(v.vod_pic ?? ""),
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
