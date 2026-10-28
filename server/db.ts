/**
 * 本地数据持久化：基于 Node 内置 node:sqlite（Node >= 22.5），无需额外依赖。
 *
 * 表设计：
 *   history   —— 观看历史（按 vod_id 唯一，记录最后观看的线路/剧集）
 *   favorites —— 收藏
 *   progress  —— 播放进度（按 vod_id + flag 唯一，记录每部剧在每条线路看到第几集第几秒）
 *   marks     —— 片头/片尾标记（按 vod_id 唯一，全线路共享）
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS history (
    vod_id    TEXT PRIMARY KEY,
    vod_name  TEXT NOT NULL DEFAULT '',
    vod_pic   TEXT NOT NULL DEFAULT '',
    remarks   TEXT NOT NULL DEFAULT '',
    flag      TEXT NOT NULL DEFAULT '',
    ep_name   TEXT NOT NULL DEFAULT '',
    ep_url    TEXT NOT NULL DEFAULT '',
    vod       TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS favorites (
    vod_id   TEXT PRIMARY KEY,
    vod_name TEXT NOT NULL DEFAULT '',
    vod_pic  TEXT NOT NULL DEFAULT '',
    remarks  TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS progress (
    vod_id    TEXT NOT NULL,
    flag      TEXT NOT NULL,
    ep_url    TEXT NOT NULL DEFAULT '',
    ep_name   TEXT NOT NULL DEFAULT '',
    position  REAL NOT NULL DEFAULT 0,
    duration  REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (vod_id, flag)
  );

  CREATE TABLE IF NOT EXISTS marks (
    vod_id    TEXT PRIMARY KEY,
    intro     REAL NOT NULL DEFAULT 0,
    outro     REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

const now = () => Date.now();

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
  updated_at: number;
}

export function upsertHistory(o: {
  vod_id: string;
  vod_name?: string;
  vod_pic?: string;
  remarks?: string;
  flag?: string;
  ep_name?: string;
  ep_url?: string;
  vod?: string;
}): void {
  if (!o.vod_id) return;
  db.prepare(
    `INSERT INTO history (vod_id, vod_name, vod_pic, remarks, flag, ep_name, ep_url, vod, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vod_id) DO UPDATE SET
       vod_name = COALESCE(NULLIF(excluded.vod_name, ''), history.vod_name),
       vod_pic  = COALESCE(NULLIF(excluded.vod_pic, ''), history.vod_pic),
       remarks  = COALESCE(NULLIF(excluded.remarks, ''), history.remarks),
       flag     = COALESCE(NULLIF(excluded.flag, ''), history.flag),
       ep_name  = COALESCE(NULLIF(excluded.ep_name, ''), history.ep_name),
       ep_url   = COALESCE(NULLIF(excluded.ep_url, ''), history.ep_url),
       vod      = COALESCE(NULLIF(excluded.vod, ''), history.vod),
       updated_at = excluded.updated_at`,
  ).run(
    o.vod_id,
    o.vod_name ?? "",
    o.vod_pic ?? "",
    o.remarks ?? "",
    o.flag ?? "",
    o.ep_name ?? "",
    o.ep_url ?? "",
    o.vod ?? "",
    now(),
  );
  // 只保留最近 1000 条，避免历史表无限增长
  trimHistory();
}

/** 历史上限 */
const HISTORY_LIMIT = 1000;

/** 删除超出上限的旧记录 */
function trimHistory(): void {
  db.prepare(
    `DELETE FROM history WHERE vod_id NOT IN (
       SELECT vod_id FROM history ORDER BY updated_at DESC LIMIT ?
     )`,
  ).run(HISTORY_LIMIT);
}

export function listHistory(limit = 1000): HistoryRow[] {
  return db
    .prepare(
      `SELECT vod_id, vod_name, vod_pic, remarks, flag, ep_name, ep_url, vod, updated_at
       FROM history ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as HistoryRow[];
}

export function getHistory(vodId: string): HistoryRow | null {
  const row = db
    .prepare("SELECT * FROM history WHERE vod_id = ?")
    .get(vodId) as unknown as HistoryRow | undefined;
  return row ?? null;
}

export function deleteHistory(vodId: string): void {
  db.prepare("DELETE FROM history WHERE vod_id = ?").run(vodId);
}

export function clearHistory(): void {
  db.exec("DELETE FROM history");
}

/* ============================== 收藏 ============================== */

export interface FavoriteRow {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  remarks: string;
  created_at: number;
}

export function addFavorite(o: {
  vod_id: string;
  vod_name?: string;
  vod_pic?: string;
  remarks?: string;
}): void {
  if (!o.vod_id) return;
  db.prepare(
    `INSERT INTO favorites (vod_id, vod_name, vod_pic, remarks, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(vod_id) DO UPDATE SET
       vod_name = COALESCE(NULLIF(excluded.vod_name, ''), favorites.vod_name),
       vod_pic  = COALESCE(NULLIF(excluded.vod_pic, ''), favorites.vod_pic),
       remarks  = COALESCE(NULLIF(excluded.remarks, ''), favorites.remarks)`,
  ).run(o.vod_id, o.vod_name ?? "", o.vod_pic ?? "", o.remarks ?? "", now());
}

export function removeFavorite(vodId: string): void {
  db.prepare("DELETE FROM favorites WHERE vod_id = ?").run(vodId);
}

export function listFavorites(limit = 200): FavoriteRow[] {
  return db
    .prepare(
      `SELECT vod_id, vod_name, vod_pic, remarks, created_at
       FROM favorites ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as FavoriteRow[];
}

export function isFavorite(vodId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS x FROM favorites WHERE vod_id = ?")
    .get(vodId);
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

export function saveProgress(o: {
  vod_id: string;
  flag: string;
  ep_url?: string;
  ep_name?: string;
  position?: number;
  duration?: number;
}): void {
  if (!o.vod_id || !o.flag) return;
  db.prepare(
    `INSERT INTO progress (vod_id, flag, ep_url, ep_name, position, duration, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vod_id, flag) DO UPDATE SET
       ep_url   = COALESCE(NULLIF(excluded.ep_url, ''), progress.ep_url),
       ep_name  = COALESCE(NULLIF(excluded.ep_name, ''), progress.ep_name),
       position = excluded.position,
       duration = excluded.duration,
       updated_at = excluded.updated_at`,
  ).run(
    o.vod_id,
    o.flag,
    o.ep_url ?? "",
    o.ep_name ?? "",
    o.position ?? 0,
    o.duration ?? 0,
    now(),
  );
}

export function getProgress(vodId: string, flag: string): ProgressRow | null {
  const row = db
    .prepare("SELECT * FROM progress WHERE vod_id = ? AND flag = ?")
    .get(vodId, flag) as unknown as ProgressRow | undefined;
  return row ?? null;
}

/** 取该影片任意线路的最近进度（用于从历史记录续播） */
export function getLatestProgress(vodId: string): ProgressRow | null {
  const row = db
    .prepare(
      "SELECT * FROM progress WHERE vod_id = ? ORDER BY updated_at DESC LIMIT 1",
    )
    .get(vodId) as unknown as ProgressRow | undefined;
  return row ?? null;
}

export function clearProgress(vodId: string, flag?: string): void {
  if (flag) {
    db.prepare("DELETE FROM progress WHERE vod_id = ? AND flag = ?").run(
      vodId,
      flag,
    );
  } else {
    db.prepare("DELETE FROM progress WHERE vod_id = ?").run(vodId);
  }
}

/* ============================== 片头 / 片尾标记 ============================== */

export interface MarksRow {
  vod_id: string;
  intro: number;
  outro: number;
  updated_at: number;
}

export function getMarks(vodId: string): { intro: number; outro: number } {
  const row = db
    .prepare("SELECT intro, outro FROM marks WHERE vod_id = ?")
    .get(vodId) as unknown as { intro: number; outro: number } | undefined;
  return { intro: row?.intro ?? 0, outro: row?.outro ?? 0 };
}

export function saveMarks(
  vodId: string,
  m: { intro?: number; outro?: number },
): { intro: number; outro: number } {
  const cur = getMarks(vodId);
  const intro = m.intro === undefined ? cur.intro : m.intro;
  const outro = m.outro === undefined ? cur.outro : m.outro;
  db.prepare(
    `INSERT INTO marks (vod_id, intro, outro, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(vod_id) DO UPDATE SET
       intro = excluded.intro,
       outro = excluded.outro,
       updated_at = excluded.updated_at`,
  ).run(vodId, intro, outro, now());
  return { intro, outro };
}

export default db;
