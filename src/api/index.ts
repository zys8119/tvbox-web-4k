/** 后端 Node 服务（node/main.ts）的接口封装 */

const BASE = "/api";

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
  vod_name: string;
  vod_pic: string;
  vod_actor: string;
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
  updated_at: number;
}

export interface FavoriteItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  remarks: string;
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
}) => sendJson<{ ok: boolean }>("/api/progress", "POST", o);

/** 取片头片尾标记 */
export const fetchMarks = (vod: string) =>
  getJson<Marks>("/api/marks", { vod });

/** 保存片头片尾；传 0 表示取消该标记 */
export const saveMarksApi = (o: {
  vod_id: string;
  intro?: number;
  outro?: number;
}) => sendJson<Marks>("/api/marks", "POST", o);

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
