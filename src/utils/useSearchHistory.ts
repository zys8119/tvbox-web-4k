import { ref, watch } from "vue";

const PREFIX = "tvbox:search-history:";
/** 每个作用域最多保留的搜索词条数 */
const MAX = 12;

/**
 * 搜索记录（localStorage 持久化）
 *
 * 去重规则：
 *   - 大小写不敏感（统一按小写比较）
 *   - 前后空格忽略
 *   - 重复提交时把该词提到最前，不新增副本
 *
 * @param scope 作用域标识，例如 history / favorites，各自独立存储
 */
export function useSearchHistory(scope: string) {
  const key = PREFIX + scope;
  const history = ref<string[]>(read());

  function read(): string[] {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  function persist(list: string[]) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      /* 隐私模式等写入失败时忽略 */
    }
  }

  /** 记录一个搜索词 */
  function add(word: string) {
    const w = word.trim();
    if (!w) return;
    const lower = w.toLowerCase();
    // 先剔除已有的同义词（忽略大小写），再插到最前
    const rest = history.value.filter((x) => x.toLowerCase() !== lower);
    history.value = [w, ...rest].slice(0, MAX);
    persist(history.value);
  }

  /** 删除单条 */
  function remove(word: string) {
    const lower = word.toLowerCase();
    history.value = history.value.filter((x) => x.toLowerCase() !== lower);
    persist(history.value);
  }

  /** 清空全部 */
  function clear() {
    history.value = [];
    persist(history.value);
  }

  // 变更后自动落盘
  watch(history, persist, { deep: true });

  return { history, add, remove, clear };
}
