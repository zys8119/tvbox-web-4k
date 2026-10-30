/**
 * 本地数据持久化：基于 Node 内置 node:sqlite（Node >= 22.5），无需额外依赖。
 *
 * 表设计（所有业务数据均绑定订阅地址 sub_id）：
 *   history        —— 观看历史（(sub_id, vod_id) 唯一，记录最后观看的线路/剧集）
 *   favorites      —— 收藏（(sub_id, vod_id) 唯一）
 *   progress       —— 播放进度（(sub_id, vod_id, flag) 唯一，记录每部剧在每条线路看到第几集第几秒）
 *   marks          —— 片头/片尾标记（(sub_id, vod_id) 唯一）
 *   search_history —— 搜索记录（(sub_id, scope, word) 唯一，scope 区分页面）
 *   settings       —— 键值设置
 *
 * 隔离规则：
 *   - 主站数据（无 site 来源）写入 sub_id = ''（全局区，任何订阅下均可见）
 *   - 订阅站点数据（带 site 来源）写入 sub_id = 当前激活订阅 id
 *   - 查询时传递当前订阅 id；无订阅时返回全部，有订阅时返回 sub_id IN ('', 订阅id)
 *   - 删除订阅时通过 clearBySubscription 级联清理该订阅的数据
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openDatabase, type SqlDatabase } from "./sqlite.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db: SqlDatabase = await openDatabase(path.join(DATA_DIR, "app.db"));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS history (
    sub_id    TEXT NOT NULL DEFAULT '',
    vod_id    TEXT NOT NULL,
    vod_name  TEXT NOT NULL DEFAULT '',
    vod_pic   TEXT NOT NULL DEFAULT '',
    remarks   TEXT NOT NULL DEFAULT '',
    flag      TEXT NOT NULL DEFAULT '',
    ep_name   TEXT NOT NULL DEFAULT '',
    ep_url    TEXT NOT NULL DEFAULT '',
    vod       TEXT NOT NULL DEFAULT '',
    site      TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sub_id, vod_id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    sub_id   TEXT NOT NULL DEFAULT '',
    vod_id   TEXT NOT NULL,
    vod_name TEXT NOT NULL DEFAULT '',
    vod_pic  TEXT NOT NULL DEFAULT '',
    remarks  TEXT NOT NULL DEFAULT '',
    site     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sub_id, vod_id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    sub_id    TEXT NOT NULL DEFAULT '',
    vod_id    TEXT NOT NULL,
    flag      TEXT NOT NULL,
    ep_url    TEXT NOT NULL DEFAULT '',
    ep_name   TEXT NOT NULL DEFAULT '',
    position  REAL NOT NULL DEFAULT 0,
    duration  REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sub_id, vod_id, flag)
  );

  CREATE TABLE IF NOT EXISTS marks (
    sub_id    TEXT NOT NULL DEFAULT '',
    vod_id    TEXT NOT NULL,
    intro     REAL NOT NULL DEFAULT 0,
    outro     REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sub_id, vod_id)
  );

  CREATE TABLE IF NOT EXISTS search_history (
    sub_id    TEXT NOT NULL DEFAULT '',
    scope     TEXT NOT NULL DEFAULT '',
    word      TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sub_id, scope, word)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

/** 检查某表是否存在某列（用于旧库迁移） */
function hasColumn(table: string, col: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as {
      name: string;
    }[];
    return rows.some((r) => r.name === col);
  } catch {
    return false;
  }
}

/** 旧库迁移：为业务表补 sub_id 复合主键与 site 字段，旧数据归入全局区（''） */
function migrateLegacyTables(): void {
  if (hasColumn("history", "sub_id")) return;

  db.exec(`BEGIN;
    CREATE TABLE history_new (
      sub_id    TEXT NOT NULL DEFAULT '',
      vod_id    TEXT NOT NULL,
      vod_name  TEXT NOT NULL DEFAULT '',
      vod_pic   TEXT NOT NULL DEFAULT '',
      remarks   TEXT NOT NULL DEFAULT '',
      flag      TEXT NOT NULL DEFAULT '',
      ep_name   TEXT NOT NULL DEFAULT '',
      ep_url    TEXT NOT NULL DEFAULT '',
      vod       TEXT NOT NULL DEFAULT '',
      site      TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sub_id, vod_id)
    );
    INSERT INTO history_new (sub_id, vod_id, vod_name, vod_pic, remarks, flag, ep_name, ep_url, vod, site, updated_at)
      SELECT '', vod_id, vod_name, vod_pic, remarks, flag, ep_name, ep_url, vod, '', updated_at FROM history;
    DROP TABLE history;
    ALTER TABLE history_new RENAME TO history;

    CREATE TABLE favorites_new (
      sub_id   TEXT NOT NULL DEFAULT '',
      vod_id   TEXT NOT NULL,
      vod_name TEXT NOT NULL DEFAULT '',
      vod_pic  TEXT NOT NULL DEFAULT '',
      remarks  TEXT NOT NULL DEFAULT '',
      site     TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sub_id, vod_id)
    );
    INSERT INTO favorites_new (sub_id, vod_id, vod_name, vod_pic, remarks, site, created_at)
      SELECT '', vod_id, vod_name, vod_pic, remarks, '', created_at FROM favorites;
    DROP TABLE favorites;
    ALTER TABLE favorites_new RENAME TO favorites;

    CREATE TABLE progress_new (
      sub_id    TEXT NOT NULL DEFAULT '',
      vod_id    TEXT NOT NULL,
      flag      TEXT NOT NULL,
      ep_url    TEXT NOT NULL DEFAULT '',
      ep_name   TEXT NOT NULL DEFAULT '',
      position  REAL NOT NULL DEFAULT 0,
      duration  REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sub_id, vod_id, flag)
    );
    INSERT INTO progress_new (sub_id, vod_id, flag, ep_url, ep_name, position, duration, updated_at)
      SELECT '', vod_id, flag, ep_url, ep_name, position, duration, updated_at FROM progress;
    DROP TABLE progress;
    ALTER TABLE progress_new RENAME TO progress;

    CREATE TABLE marks_new (
      sub_id    TEXT NOT NULL DEFAULT '',
      vod_id    TEXT NOT NULL,
      intro     REAL NOT NULL DEFAULT 0,
      outro     REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sub_id, vod_id)
    );
    INSERT INTO marks_new (sub_id, vod_id, intro, outro, updated_at)
      SELECT '', vod_id, intro, outro, updated_at FROM marks;
    DROP TABLE marks;
    ALTER TABLE marks_new RENAME TO marks;

    COMMIT;`);
}

migrateLegacyTables();

const now = () => Date.now();

/**
 * 可见数据过滤：查询时传递当前订阅 id。
 * 返回不带 WHERE/AND 前缀的裸条件，由 joinWhere 统一拼接：
 *   - 查询已有 WHERE 条件时追加 AND
 *   - 查询无 WHERE 条件时以 WHERE 开头
 * 订阅数据严格隔离；主站数据（''）始终可见作为兜底；
 * 无订阅（subId 为空）时返回空条件（查询全部）。
 */
function visibleClause(subId: string): {
  where: string;
  args: (string | number)[];
} {
  if (!subId) return { where: "", args: [] };
  return { where: "sub_id IN ('', ?)", args: [subId] };
}

/** 把裸条件拼进 SQL：base 为已有 WHERE 条件（无则空），返回完整 WHERE 片段（含前缀） */
function joinWhere(base: string, cond: string): string {
  if (!cond) return base ? `WHERE ${base}` : "";
  return base ? `WHERE ${base} AND ${cond}` : `WHERE ${cond}`;
}

/** 清空条件：清掉当前视图可见的所有数据（主站 + 当前订阅） */
function clearClause(subId: string): {
  where: string;
  args: (string | number)[];
} {
  if (!subId) return { where: "", args: [] };
  return { where: "WHERE sub_id IN ('', ?)", args: [subId] };
}

/* ============================== 历史记录 ============================== */

export interface HistoryRow {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  remarks: string;
  flag: string;
  ep_name: string;
  ep_url: string;
  vod: string;
  site: string;
  updated_at: number;
}

/** 写入历史：传 site 表示订阅站点数据（归属 subId），否则归主站全局区 */
export function upsertHistory(
  subId: string,
  o: {
    vod_id: string;
    vod_name?: string;
    vod_pic?: string;
    remarks?: string;
    flag?: string;
    ep_name?: string;
    ep_url?: string;
    vod?: string;
    site?: string;
  },
): void {
  if (!o.vod_id) return;
  const owner = o.site ? subId : "";
  db.prepare(
    `INSERT INTO history (sub_id, vod_id, vod_name, vod_pic, remarks, flag, ep_name, ep_url, vod, site, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sub_id, vod_id) DO UPDATE SET
       vod_name = COALESCE(NULLIF(excluded.vod_name, ''), history.vod_name),
       vod_pic  = COALESCE(NULLIF(excluded.vod_pic, ''), history.vod_pic),
       remarks  = COALESCE(NULLIF(excluded.remarks, ''), history.remarks),
       flag     = COALESCE(NULLIF(excluded.flag, ''), history.flag),
       ep_name  = COALESCE(NULLIF(excluded.ep_name, ''), history.ep_name),
       ep_url   = COALESCE(NULLIF(excluded.ep_url, ''), history.ep_url),
       vod      = COALESCE(NULLIF(excluded.vod, ''), history.vod),
       site     = COALESCE(NULLIF(excluded.site, ''), history.site),
       updated_at = excluded.updated_at`,
  ).run(
    owner,
    o.vod_id,
    o.vod_name ?? "",
    o.vod_pic ?? "",
    o.remarks ?? "",
    o.flag ?? "",
    o.ep_name ?? "",
    o.ep_url ?? "",
    o.vod ?? "",
    o.site ?? "",
    now(),
  );
  // 只保留每个主键维度下最近 1000 条，避免历史表无限增长
  trimHistory(subId);
}

/** 历史上限 */
const HISTORY_LIMIT = 1000;

/** 删除超出上限的旧记录（仅清理当前订阅可见范围内） */
function trimHistory(subId: string): void {
  if (!subId) return;
  db.prepare(
    `DELETE FROM history WHERE sub_id IN ('', ?) AND rowid NOT IN (
       SELECT rowid FROM history WHERE sub_id IN ('', ?) ORDER BY updated_at DESC LIMIT ?
     )`,
  ).run(subId, subId, HISTORY_LIMIT);
}

export function listHistory(subId: string, limit = 1000): HistoryRow[] {
  const v = visibleClause(subId);
  return db
    .prepare(
      `SELECT vod_id, vod_name, vod_pic, remarks, flag, ep_name, ep_url, vod, site, updated_at
       FROM history ${joinWhere("", v.where)} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...v.args, limit) as unknown as HistoryRow[];
}

export function getHistory(subId: string, vodId: string): HistoryRow | null {
  const row = db
    .prepare("SELECT * FROM history WHERE sub_id = ? AND vod_id = ?")
    .get(subId, vodId) as unknown as HistoryRow | undefined;
  return row ?? null;
}

export function deleteHistory(subId: string, vodId: string): void {
  db.prepare("DELETE FROM history WHERE sub_id = ? AND vod_id = ?").run(
    subId,
    vodId,
  );
}

/** 清空：清掉当前订阅可见范围内的历史 */
export function clearHistory(subId: string): void {
  const c = clearClause(subId);
  db.prepare(`DELETE FROM history ${c.where}`).run(...c.args);
}

/* ============================== 收藏 ============================== */

export interface FavoriteRow {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  remarks: string;
  site: string;
  created_at: number;
}

export function addFavorite(
  subId: string,
  o: {
    vod_id: string;
    vod_name?: string;
    vod_pic?: string;
    remarks?: string;
    site?: string;
  },
): void {
  if (!o.vod_id) return;
  const owner = o.site ? subId : "";
  db.prepare(
    `INSERT INTO favorites (sub_id, vod_id, vod_name, vod_pic, remarks, site, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sub_id, vod_id) DO UPDATE SET
       vod_name = COALESCE(NULLIF(excluded.vod_name, ''), favorites.vod_name),
       vod_pic  = COALESCE(NULLIF(excluded.vod_pic, ''), favorites.vod_pic),
       remarks  = COALESCE(NULLIF(excluded.remarks, ''), favorites.remarks),
       site     = COALESCE(NULLIF(excluded.site, ''), favorites.site),
       created_at = excluded.created_at`,
  ).run(
    owner,
    o.vod_id,
    o.vod_name ?? "",
    o.vod_pic ?? "",
    o.remarks ?? "",
    o.site ?? "",
    now(),
  );
}

export function removeFavorite(subId: string, vodId: string): void {
  db.prepare("DELETE FROM favorites WHERE sub_id = ? AND vod_id = ?").run(
    subId,
    vodId,
  );
}

export function listFavorites(subId: string, limit = 200): FavoriteRow[] {
  const v = visibleClause(subId);
  return db
    .prepare(
      `SELECT vod_id, vod_name, vod_pic, remarks, site, created_at
       FROM favorites ${joinWhere("", v.where)} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...v.args, limit) as unknown as FavoriteRow[];
}

export function isFavorite(subId: string, vodId: string): boolean {
  const v = visibleClause(subId);
  const row = db
    .prepare(
      `SELECT 1 AS x FROM favorites ${joinWhere("vod_id = ?", v.where)} LIMIT 1`,
    )
    .get(vodId, ...v.args) as unknown as { x: number } | undefined;
  return !!row;
}

/* ============================== 播放进度 ============================== */

export interface ProgressRow {
  vod_id: string;
  flag: string;
  ep_url: string;
  ep_name: string;
  position: number;
  duration: number;
  updated_at: number;
}

/** 写入进度：传 site 表示订阅站点数据（归属 subId），否则归主站全局区 */
export function saveProgress(
  subId: string,
  o: {
    vod_id: string;
    flag: string;
    ep_url?: string;
    ep_name?: string;
    position?: number;
    duration?: number;
    site?: string;
  },
): void {
  if (!o.vod_id || !o.flag) return;
  const owner = o.site ? subId : "";
  db.prepare(
    `INSERT INTO progress (sub_id, vod_id, flag, ep_url, ep_name, position, duration, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sub_id, vod_id, flag) DO UPDATE SET
       ep_url   = COALESCE(NULLIF(excluded.ep_url, ''), progress.ep_url),
       ep_name  = COALESCE(NULLIF(excluded.ep_name, ''), progress.ep_name),
       position = excluded.position,
       duration = excluded.duration,
       updated_at = excluded.updated_at`,
  ).run(
    owner,
    o.vod_id,
    o.flag,
    o.ep_url ?? "",
    o.ep_name ?? "",
    o.position ?? 0,
    o.duration ?? 0,
    now(),
  );
}

export function getProgress(
  subId: string,
  vodId: string,
  flag: string,
): ProgressRow | null {
  const v = visibleClause(subId);
  const row = db
    .prepare(
      `SELECT vod_id, flag, ep_url, ep_name, position, duration, updated_at
       FROM progress ${joinWhere("vod_id = ? AND flag = ?", v.where)} ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(vodId, flag, ...v.args) as unknown as ProgressRow | undefined;
  return row ?? null;
}

/** 取该影片任意线路的最近进度（用于从历史记录续播） */
export function getLatestProgress(
  subId: string,
  vodId: string,
): ProgressRow | null {
  const v = visibleClause(subId);
  const row = db
    .prepare(
      `SELECT vod_id, flag, ep_url, ep_name, position, duration, updated_at
       FROM progress ${joinWhere("vod_id = ?", v.where)} ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(vodId, ...v.args) as unknown as ProgressRow | undefined;
  return row ?? null;
}

export function clearProgress(
  subId: string,
  vodId: string,
  flag?: string,
): void {
  if (flag) {
    db.prepare(
      "DELETE FROM progress WHERE sub_id = ? AND vod_id = ? AND flag = ?",
    ).run(subId, vodId, flag);
  } else {
    db.prepare("DELETE FROM progress WHERE sub_id = ? AND vod_id = ?").run(
      subId,
      vodId,
    );
  }
}

/* ============================== 片头 / 片尾标记 ============================== */

export interface MarksRow {
  vod_id: string;
  intro: number;
  outro: number;
  updated_at: number;
}

export function getMarks(
  subId: string,
  vodId: string,
): { intro: number; outro: number } {
  const v = visibleClause(subId);
  const row = db
    .prepare(
      `SELECT intro, outro FROM marks ${joinWhere("vod_id = ?", v.where)} ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(vodId, ...v.args) as unknown as
    | { intro: number; outro: number }
    | undefined;
  return { intro: row?.intro ?? 0, outro: row?.outro ?? 0 };
}

export function saveMarks(
  subId: string,
  vodId: string,
  m: { intro?: number; outro?: number },
  site?: string,
): { intro: number; outro: number } {
  const owner = site ? subId : "";
  const cur = getMarks(owner === "" ? owner : subId, vodId);
  const intro = m.intro === undefined ? cur.intro : m.intro;
  const outro = m.outro === undefined ? cur.outro : m.outro;
  db.prepare(
    `INSERT INTO marks (sub_id, vod_id, intro, outro, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sub_id, vod_id) DO UPDATE SET
       intro = excluded.intro,
       outro = excluded.outro,
       updated_at = excluded.updated_at`,
  ).run(owner, vodId, intro, outro, now());
  return { intro, outro };
}

/* ============================== 搜索记录 ============================== */

export interface SearchHistoryRow {
  word: string;
  updated_at: number;
}

const SEARCH_HISTORY_LIMIT = 12;

/** 添加一条搜索记录（scope 区分页面；去重置顶、上限 12 条） */
export function addSearchHistory(
  subId: string,
  scope: string,
  word: string,
): void {
  const w = word.trim();
  if (!w || !scope) return;
  db.prepare(
    `INSERT INTO search_history (sub_id, scope, word, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(sub_id, scope, word) DO UPDATE SET updated_at = excluded.updated_at`,
  ).run(subId, scope, w, now());
  db.prepare(
    `DELETE FROM search_history WHERE sub_id = ? AND scope = ? AND rowid NOT IN (
       SELECT rowid FROM search_history WHERE sub_id = ? AND scope = ? ORDER BY updated_at DESC LIMIT ?
     )`,
  ).run(subId, scope, subId, scope, SEARCH_HISTORY_LIMIT);
}

export function listSearchHistory(
  subId: string,
  scope: string,
): SearchHistoryRow[] {
  return db
    .prepare(
      `SELECT word, updated_at FROM search_history
       WHERE sub_id = ? AND scope = ? ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(subId, scope, SEARCH_HISTORY_LIMIT) as unknown as SearchHistoryRow[];
}

/** 删除单条；word 为空则清空该作用域 */
export function removeSearchHistory(
  subId: string,
  scope: string,
  word?: string,
): void {
  if (word) {
    db.prepare(
      "DELETE FROM search_history WHERE sub_id = ? AND scope = ? AND word = ?",
    ).run(subId, scope, word);
  } else {
    db.prepare("DELETE FROM search_history WHERE sub_id = ? AND scope = ?").run(
      subId,
      scope,
    );
  }
}

/* ============================== 订阅数据级联清理 ============================== */

/** 删除订阅时清理该订阅名下的全部本地数据（主站全局数据不受影响） */
export function clearBySubscription(subId: string): void {
  if (!subId) return;
  for (const table of [
    "history",
    "favorites",
    "progress",
    "marks",
    "search_history",
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE sub_id = ?`).run(subId);
  }
}

/* ============================== 设置（订阅等） ============================== */

/** 读取单个设置项 */
export function getSetting(key: string, fallback = ""): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as unknown as { value: string } | undefined;
  return row?.value ?? fallback;
}

/** 写入单个设置项 */
export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(key, value, now());
}

/** 读取 JSON 形式的设置项 */
export function getJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key, "");
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 写入 JSON 形式的设置项 */
export function setJsonSetting(key: string, value: unknown): void {
  setSetting(key, JSON.stringify(value));
}

export default db;
