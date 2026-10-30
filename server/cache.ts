/**
 * 站点页面缓存：基于 Node 内置 node:sqlite（Node >= 22.5），无需额外依赖。
 *
 * 为每个站点的首页 / 分类 / 详情 / 搜索页面做短时缓存，避免每次请求都穿透到源站。
 * 缓存键由 订阅 + 站点 + 接口签名(api/jar) + 参数 共同决定：
 * 订阅刷新或站点配置变化后，旧缓存键自然失效，无需手动清理。
 *
 * 自动清理机制：
 *   - 写入时删除已过期条目
 *   - 条目数超过上限时，淘汰最久未更新的记录
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS site_cache (
    key        TEXT PRIMARY KEY,
    sub_id     TEXT NOT NULL DEFAULT '',
    site_key   TEXT NOT NULL DEFAULT '',
    payload    TEXT NOT NULL,
    expire_at  INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_site_cache_sub ON site_cache(sub_id, site_key);
  CREATE INDEX IF NOT EXISTS idx_site_cache_expire ON site_cache(expire_at);
`);

/** 缓存条目上限，超出后淘汰最久未更新的条目 */
const MAX_ENTRIES = 3000;

const now = () => Date.now();

/** 删除已过期条目；条目过多时按更新时间淘汰最旧的 */
function cleanup(): void {
  db.prepare("DELETE FROM site_cache WHERE expire_at <= ?").run(now());
  const { c } = db
    .prepare("SELECT COUNT(*) AS c FROM site_cache")
    .get() as unknown as { c: number };
  if (c > MAX_ENTRIES) {
    db.prepare(
      `DELETE FROM site_cache WHERE key NOT IN (
         SELECT key FROM site_cache ORDER BY updated_at DESC LIMIT ?
       )`,
    ).run(MAX_ENTRIES);
  }
}

/** 稳定序列化：对象字段按 key 排序，保证相同参数生成相同缓存键 */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return (
      "{" +
      Object.keys(obj)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}

/** 生成站点页面缓存键 */
export function siteCacheKey(
  subId: string,
  siteKey: string,
  type: string,
  params: Record<string, unknown> = {},
): string {
  return createHash("sha1")
    .update(
      [subId || "", siteKey || "", type, stableStringify(params)].join("\n"),
    )
    .digest("hex");
}

interface CacheEntry<T> {
  data: T;
  /** 是否已过期（源站异常时可供回退） */
  stale: boolean;
}

export function getSiteCache<T>(key: string): CacheEntry<T> | null {
  const row = db
    .prepare("SELECT payload, expire_at FROM site_cache WHERE key = ?")
    .get(key) as unknown as { payload: string; expire_at: number } | undefined;
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload) as T, stale: row.expire_at < now() };
  } catch {
    return null;
  }
}

export function setSiteCache(
  key: string,
  subId: string,
  siteKey: string,
  payload: unknown,
  expireAt: number,
): void {
  db.prepare(
    `INSERT INTO site_cache (key, sub_id, site_key, payload, expire_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       payload = excluded.payload,
       expire_at = excluded.expire_at,
       updated_at = excluded.updated_at`,
  ).run(key, subId, siteKey, JSON.stringify(payload), expireAt, now());
  cleanup();
}

/**
 * 带缓存的页面拉取：
 *   - 有未过期缓存 → 直接返回，不请求源站
 *   - 无缓存 / 已过期 → 调 loader 拉取新数据并写回缓存
 *   - 源站异常但有旧缓存 → 回退旧缓存，避免页面直接报错
 */
export async function withSiteCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  subId = "",
  siteKey = "",
): Promise<T> {
  const hit = getSiteCache<T>(key);
  if (hit && !hit.stale) return hit.data;
  try {
    const data = await loader();
    setSiteCache(key, subId, siteKey, data, now() + ttlMs);
    return data;
  } catch (e) {
    if (hit) return hit.data;
    throw e;
  }
}
