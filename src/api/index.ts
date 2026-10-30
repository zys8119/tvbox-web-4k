/** 后端 Node 服务（node/main.ts）的接口封装 */

/** 基地址：开发时走 Vite 代理（/api）；APK 内嵌后端时通过 VITE_API_BASE 注入（如 http://127.0.0.1:3001/api） */
const BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

export interface VodItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks: string;
}

export interface FilterValue {
  n: string;
  v: string;
}

export interface FilterGroup {
  key: string;
  name: string;
  value: FilterValue[];
}

export interface ClassItem {
  type_id: string;
  type_name: string;
}

export interface HomeData {
  class: ClassItem[];
  filters: Record<string, FilterGroup[]>;
}

export interface ListData {
  page: number;
  pagecount: number;
  limit: number;
  total: number;
  list: VodItem[];
}

export interface PlayEpisode {
  name: string;
  url: string;
  direct: boolean;
  play_url: string;
  payload?: Record<string, string>;
}

export interface PlayLine {
  from: string;
  episodes: PlayEpisode[];
}

export interface VodDetail {
  vod_id: string;
  /** 服务端兜底解析时可能返回实际数据源站点 key */
  site_key?: string;
  vod_name: string;
  vod_pic: string;
  vod_actor: string | string[];
  vod_director: string;
  vod_tag: string;
  vod_area: string;
  vod_year: string;
  vod_remarks: string;
  vod_content: string;
  vod_play_from: string;
  vod_play_url: string;
  vod_play_list: PlayLine[];
}

export interface PlayResult {
  parse?: number;
  url?: string;
  header?: string;
  msg?: string;
}

async function getJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== ""),
      ).toString()
    : "";
  const res = await fetch(BASE + path + qs);
  if (!res.ok) throw new Error("请求失败：HTTP " + res.status);
  return (await res.json()) as T;
}

/** 首页分类与筛选器 */
export const fetchHome = () => getJson<HomeData>("/home");

/** 首页推荐 */
export const fetchHomeVideo = () =>
  getJson<{ list: VodItem[] }>("/home/video");

/** 分类列表 */
export const fetchCategory = (
  tid: string,
  page: number,
  ext?: Record<string, string>,
) =>
  getJson<ListData>("/category", {
    tid,
    page: String(page),
    ...(ext && Object.keys(ext).length ? { ext: JSON.stringify(ext) } : {}),
  });

/** 详情 */
export const fetchDetail = (id: string) =>
  getJson<{ list: VodDetail[] }>("/detail", { id });

/** 播放解析 */
export const fetchPlay = (flag: string, id: string) =>
  getJson<PlayResult>("/play", { flag, id });

/** 搜索 */
export const fetchSearch = (wd: string) =>
  getJson<{ list: VodItem[] }>("/search", { wd });

/* ============================== 本地数据（SQLite） ============================== */

/** 带 JSON body 的请求 */
async function sendJson<T>(
  path: string,
  method: "POST" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("请求失败：HTTP " + res.status);
  return (await res.json()) as T;
}

export interface HistoryItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  remarks: string;
  flag: string;
  ep_name: string;
  ep_url: string;
  vod: string;
  /** 数据来源站点 key，非空表示订阅站点记录 */
  site: string;
  updated_at: number;
}

export interface FavoriteItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  remarks: string;
  /** 数据来源站点 key，非空表示订阅站点收藏 */
  site: string;
  created_at: number;
}

export interface ProgressInfo {
  vod_id?: string;
  flag?: string;
  ep_url?: string;
  ep_name?: string;
  position?: number;
  duration?: number;
  updated_at?: number;
}

export interface Marks {
  intro: number;
  outro: number;
}

/** 历史列表 */
export const fetchHistory = () =>
  getJson<{ list: HistoryItem[] }>("/api/history");

/** 写入/更新历史 */
export const pushHistory = (o: {
  vod_id: string;
  vod_name?: string;
  vod_pic?: string;
  remarks?: string;
  flag?: string;
  ep_name?: string;
  ep_url?: string;
  vod?: string;
  site?: string;
}) => sendJson<{ ok: boolean }>("/api/history", "POST", o);

/** 删除单条历史；不传 id 则清空 */
export const removeHistory = (id?: string) =>
  sendJson<{ ok: boolean }>(
    "/api/history" + (id ? "?id=" + encodeURIComponent(id) : ""),
    "DELETE",
  );

/** 收藏列表 */
export const fetchFavorites = () =>
  getJson<{ list: FavoriteItem[] }>("/api/favorites");

/** 是否已收藏 */
export const fetchFavoriteStatus = (id: string) =>
  getJson<{ favorited: boolean }>("/api/favorites/status", { id });

/** 添加收藏 */
export const addFavoriteApi = (o: {
  vod_id: string;
  vod_name?: string;
  vod_pic?: string;
  remarks?: string;
  site?: string;
}) => sendJson<{ ok: boolean }>("/api/favorites", "POST", o);

/** 取消收藏 */
export const removeFavoriteApi = (id: string) =>
  sendJson<{ ok: boolean }>(
    "/api/favorites?id=" + encodeURIComponent(id),
    "DELETE",
  );

/** 取播放进度；不传 flag 则返回该影片最近一次进度 */
export const fetchProgress = (vod: string, flag?: string) =>
  getJson<ProgressInfo>("/api/progress", {
    vod,
    ...(flag ? { flag } : {}),
  });

/** 保存播放进度 */
export const saveProgressApi = (o: {
  vod_id: string;
  flag: string;
  ep_url?: string;
  ep_name?: string;
  position?: number;
  duration?: number;
  site?: string;
}) => sendJson<{ ok: boolean }>("/api/progress", "POST", o);

/** 取片头片尾标记 */
export const fetchMarks = (vod: string) =>
  getJson<Marks>("/api/marks", { vod });

/** 保存片头片尾；传 0 表示取消该标记 */
export const saveMarksApi = (o: {
  vod_id: string;
  intro?: number;
  outro?: number;
  site?: string;
}) => sendJson<Marks>("/api/marks", "POST", o);

/* ============================== TVBox 订阅 ============================== */

export interface TvboxConfigInfo {
  activeId: string;
  url: string;
  name: string;
  cached: boolean;
  fetchedAt: number;
  spider: string;
  counts: { sites: number; lives: number; parses: number; flags: number };
  subscriptions: TvboxSubscription[];
}

export interface TvboxSubscription {
  id: string;
  name: string;
  url: string;
  active: boolean;
  cached: boolean;
  fetchedAt: number;
  spider: string;
  counts: { sites: number; lives: number; parses: number; flags: number };
}

export interface TvboxSite {
  key: string;
  name: string;
  type: number;
  api: string;
  supported: boolean;
  reason?: string;
  searchable: boolean;
  categories: string[];
  enabled: boolean;
}

export interface AggregatedItem extends VodItem {
  site_key: string;
  site_name: string;
}

/** 读取订阅配置信息 */
export const fetchTvboxConfig = () =>
  getJson<TvboxConfigInfo>("/api/tvbox/config");

/** 新增或更新订阅地址并立即拉取，同时切换为当前激活项 */
export const setTvboxSubscription = (url: string, name = "", id = "") =>
  sendJson<{
    ok: boolean;
    activeId: string;
    counts: { sites: number; lives: number; parses: number };
  }>("/api/tvbox/config", "POST", { url, name, id });

/** 切换当前订阅 */
export const switchTvboxSubscription = (id: string) =>
  sendJson<{
    ok: boolean;
    activeId: string;
    counts: { sites: number; lives: number; parses: number; flags: number };
  }>("/api/tvbox/config/active", "POST", { id });

/** 删除保存的订阅 */
export const removeTvboxSubscription = (id: string) =>
  sendJson<{ ok: boolean; activeId: string }>("/api/tvbox/config/remove", "POST", {
    id,
  });

/** 重新拉取订阅 */
export const refreshTvbox = () =>
  sendJson<{ ok: boolean; sites: number }>("/api/tvbox/refresh", "POST");

/** 站点列表（含启用状态） */
export const fetchTvboxSites = () =>
  getJson<{ list: TvboxSite[]; cached: boolean }>("/api/tvbox/sites");

/** 批量启用/停用站点 */
export const setTvboxSitesEnabled = (keys: string[], enabled: boolean) =>
  sendJson<{ ok: boolean }>("/api/tvbox/sites/enabled", "POST", {
    keys,
    enabled,
  });

/** 单站点启用/停用 */
export const setTvboxSiteEnabled = (key: string, enabled: boolean) =>
  sendJson<{ ok: boolean }>("/api/tvbox/site/enabled", "POST", {
    key,
    enabled,
  });

/** 某站点首页（分类 + 推荐） */
export const fetchTvboxHome = (site: string) =>
  getJson<{ class: ClassItem[]; list: VodItem[] }>("/api/tvbox/home", {
    site,
  });

/** 某站点分类列表 */
export const fetchTvboxCategory = (
  site: string,
  tid: string,
  page: number,
  ext?: Record<string, string>,
) =>
  getJson<ListData>("/api/tvbox/category", {
    site,
    tid,
    page: String(page),
    ...(ext && Object.keys(ext).length ? { ext: JSON.stringify(ext) } : {}),
  });

/** 某站点详情（name 用于主站无详情实现时跨站兜底搜索） */
export const fetchTvboxDetail = (site: string, id: string, name = "") =>
  getJson<{ list: VodDetail[] }>("/api/tvbox/detail", { site, id, name });

/** 跨站点聚合搜索 */
export const fetchTvboxSearch = (wd: string, site?: string) =>
  getJson<{ list: AggregatedItem[] }>("/api/tvbox/search", {
    wd,
    ...(site ? { site } : {}),
  });

/** 播放地址解析 / 嗅探：非视频直链时抓取页面提取 HTML 中的真实视频资源 */
export interface PlayResolveResult {
  url: string;
  msg?: string;
}
export const fetchTvboxParse = (url: string) =>
  getJson<PlayResolveResult>("/api/tvbox/parse", { url });

/* ============================== 搜索记录 / 自动播放 ============================== */

/** 搜索记录（服务端存储，绑定当前订阅） */
export interface SearchHistoryItem {
  word: string;
  updated_at: number;
}

/** 读取某作用域的搜索记录 */
export const fetchSearchHistory = (scope: string) =>
  getJson<{ list: SearchHistoryItem[] }>("/api/search-history", { scope });

/** 添加搜索记录 */
export const addSearchHistory = (scope: string, word: string) =>
  sendJson<{ ok: boolean }>("/api/search-history", "POST", { scope, word });

/** 删除一条搜索记录；word 为空则清空该作用域 */
export const removeSearchHistory = (scope: string, word = "") =>
  sendJson<{ ok: boolean }>(
    "/api/search-history?scope=" +
      encodeURIComponent(scope) +
      (word ? "&word=" + encodeURIComponent(word) : ""),
    "DELETE",
  );

/** 自动播放上下集设置 */
export const fetchAutoPlay = () =>
  getJson<{ enabled: boolean }>("/api/autoplay");

export const setAutoPlay = (enabled: boolean) =>
  sendJson<{ ok: boolean; enabled: boolean }>("/api/autoplay", "POST", {
    enabled,
  });

/** 把后端返回的 header 字符串解析成对象 */
export function parseHeader(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
