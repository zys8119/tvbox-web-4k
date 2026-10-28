import { pinyin } from "pinyin-pro";

/** 拼音匹配索引缓存：避免每次输入都重算 */
const cache = new WeakMap<object, string>();

/**
 * 生成一段文本的检索串，包含：
 *   - 原文（小写）
 *   - 全拼（lianxu 连写）
 *   - 全拼首字母（lxsl）
 * 匹配时用 includes，因此「lianxu」「lx」「连」都能命中「连续」。
 */
export function buildHaystack(text: string): string {
  if (!text) return "";
  const plain = text.toLowerCase();
  let full = "";
  let initials = "";
  try {
    full = pinyin(text, { toneType: "none", type: "array" })
      .join("")
      .toLowerCase();
    initials = pinyin(text, { pattern: "first", toneType: "none", type: "array" })
      .join("")
      .toLowerCase();
  } catch {
    // 拼音库异常时退化为纯原文匹配
    return plain;
  }
  return plain + " " + full + " " + initials;
}

/** 带缓存的 haystack（obj 为缓存键，通常是列表项对象） */
export function haystackOf(obj: object, text: string): string {
  const hit = cache.get(obj);
  if (hit !== undefined) return hit;
  const s = buildHaystack(text);
  cache.set(obj, s);
  return s;
}

/**
 * 判断关键词是否命中。支持：
 *   - 中文直接匹配
 *   - 全拼、首字母匹配
 *   - 多关键词空格分隔（需全部命中）
 */
export function matchKeyword(haystack: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  // 空格分隔的多个关键词，要求全部命中
  return kw.split(/\s+/).every((part) => haystack.includes(part));
}
