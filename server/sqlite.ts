/**
 * SQLite 兼容层（server/sqlite.ts）
 *
 * 优先使用 Node 内置 `node:sqlite`（Node >= 22.5，开发机 / 现代环境）；
 * 在内嵌运行时（nodejs-mobile / capawesome 的 Node 18 Android 运行时）中
 * 自动降级为 sql.js（WASM）：内存数据库 + debounce 导出文件持久化。
 *
 * 通过调用方以 ESM 顶层 await 完成初始化，保证模块加载完成后即可同步使用。
 * 同一进程内相同路径只初始化一份实例（单例），避免多模块并发写相互覆盖。
 *
 * 对外暴露与 node:sqlite DatabaseSync 一致风格的 API：
 *   exec(sql)、prepare(sql) -> { get(...), all(...), run(...) }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface SqlRow {
  [column: string]: unknown;
}

export interface SqlStatement {
  get(...args: unknown[]): SqlRow | undefined;
  all(...args: unknown[]): SqlRow[];
  run(...args: unknown[]): { changes: number; lastInsertRowid: number };
}

export interface SqlDatabase {
  readonly impl: "native" | "sql.js";
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
}

/** 按文件路径复用的实例缓存（保证 sql.js 降级模式下各模块共享同一内存库） */
const instanceCache = new Map<string, Promise<SqlDatabase>>();

export function openDatabase(file: string): Promise<SqlDatabase> {
  let p = instanceCache.get(file);
  if (!p) {
    p = initDatabase(file);
    instanceCache.set(file, p);
  }
  return p;
}

async function initDatabase(file: string): Promise<SqlDatabase> {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (process.env.TVBOX_FORCE_SQLJS === "1") {
    return initSqlJsDatabase(file);
  }

  try {
    // 原生路径：Node >= 22.5
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(file);
    return {
      impl: "native",
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const stmt = db.prepare(sql);
        return {
          get: (...args) =>
            stmt.get(...(args as never[])) as SqlRow | undefined,
          all: (...args) => stmt.all(...(args as never[])) as SqlRow[],
          run: (...args) => {
            const r = stmt.run(...(args as never[]));
            return {
              changes: Number(r.changes),
              lastInsertRowid: Number(r.lastInsertRowid),
            };
          },
        };
      },
    };
  } catch {
    // 降级路径：sql.js（WASM）
    return initSqlJsDatabase(file);
  }
}

type SqlJsStatement = import("sql.js").Statement;

/** sql.js 实现：内存库 + 写操作后 debounce 导出，进程退出前兜底落盘 */
async function initSqlJsDatabase(file: string): Promise<SqlDatabase> {
  const wasmFile =
    [
      path.join(here, "sql-wasm.wasm"),
      path.join(here, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    ].find((p) => fs.existsSync(p)) ?? "sql-wasm.wasm";
  const SQL = await initSqlJs({ locateFile: () => wasmFile });

  const seed = fs.existsSync(file)
    ? new Uint8Array(fs.readFileSync(file))
    : undefined;
  const sqlDb = new SQL.Database(seed);
  // 确保非 WAL 模式：sql.js 的 export 只能导出主库内容，
  // 若库处于 WAL 模式（如从桌面原生 node:sqlite 迁移而来）会丢掉 -wal 中的事务数据
  try {
    sqlDb.exec("PRAGMA journal_mode = DELETE;");
  } catch {
    /* 极少场景不支持该 pragma，忽略 */
  }

  let dirty = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const exportNow = () => {
    if (!dirty) return;
    dirty = false;
    try {
      const buf = Buffer.from(sqlDb.export());
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, file);
      // 清理 WAL 残留：sql.js 已把全部数据写回主文件，
      // 若不删除，原生 node:sqlite 打开时会重放旧的 -wal/-shm 覆盖最新数据
      for (const suffix of ["-wal", "-shm"]) {
        try {
          const f = file + suffix;
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {
          /* 忽略 */
        }
      }
    } catch (e) {
      console.error("[sqlite:sql.js] 持久化失败:", e);
    }
  };
  const persistSoon = () => {
    dirty = true;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      exportNow();
    }, 500);
  };
  process.on("exit", () => {
    if (flushTimer) clearTimeout(flushTimer);
    exportNow();
  });

  const scalar = (sql: string): number => {
    const r = sqlDb.exec(sql);
    const v = r?.[0]?.values?.[0]?.[0];
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const readRow = (stmt: SqlJsStatement): SqlRow => {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const o: SqlRow = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = vals[i];
    return o;
  };

  return {
    impl: "sql.js",
    exec: (sql) => {
      // sql.js 内存库不支持 journal_mode=WAL，去掉避免副作用
      sqlDb.exec(sql.replace(/PRAGMA\s+journal_mode\s*=\s*WAL\s*;?/gi, ""));
      persistSoon();
    },
    prepare: (sql) => {
      const stmt = sqlDb.prepare(sql);
      // 是否为写语句：写操作执行后必须触发落盘导出
      const isWrite =
        /^\s*(?:insert|update|delete|replace|create|drop|alter|vacuum)\b/i.test(
          sql,
        );
      return {
        get: (...args) => {
          try {
            stmt.reset();
            stmt.bind(args as never[]);
            if (stmt.step()) return readRow(stmt);
            return undefined;
          } finally {
            stmt.reset();
          }
        },
        all: (...args) => {
          try {
            stmt.reset();
            stmt.bind(args as never[]);
            const rows: SqlRow[] = [];
            while (stmt.step()) rows.push(readRow(stmt));
            return rows;
          } finally {
            stmt.reset();
          }
        },
        run: (...args) => {
          try {
            stmt.reset();
            stmt.bind(args as never[]);
            stmt.step();
            if (isWrite) persistSoon();
            return {
              changes: scalar("SELECT changes()"),
              lastInsertRowid: scalar("SELECT last_insert_rowid()"),
            };
          } finally {
            stmt.reset();
          }
        },
      };
    },
  };
}
