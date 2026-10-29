import { onMounted, ref } from "vue";
import {
  addSearchHistory as addRemote,
  fetchSearchHistory,
  removeSearchHistory as removeRemote,
} from "../api";

/** 每个作用域最多保留的搜索词条数 */
const MAX = 12;

/**
 * 搜索记录（服务端 SQLite 存储，绑定当前订阅地址）
 *
 * 去重规则：
 *   - 大小写不敏感（统一按小写比较）
 *   - 前后空格忽略
 *   - 重复提交时把该词提到最前，不新增副本
 *
 * 数据随订阅隔离：切换订阅自动显示对应记录，删除订阅时服务端同步清理。
 *
 * @param scope 作用域标识，例如 sites / history / favorites，各自独立存储
 */
export function useSearchHistory(scope: string) {
  const history = ref<string[]>([]);

  async function load() {
    try {
      const data = await fetchSearchHistory(scope);
      history.value = data.list.map((x) => x.word).slice(0, MAX);
    } catch {
      /* 服务端不可用时忽略 */
    }
  }

  /** 记录一个搜索词 */
  async function add(word: string) {
    const w = word.trim();
    if (!w) return;
    const lower = w.toLowerCase();
    // 先剔除已有的同义词（忽略大小写），再插到最前
    const rest = history.value.filter((x) => x.toLowerCase() !== lower);
    history.value = [w, ...rest].slice(0, MAX);
    try {
      await addRemote(scope, w);
    } catch {
      /* 写入失败不影响本地展示 */
    }
  }

  /** 删除单条 */
  async function remove(word: string) {
    const lower = word.toLowerCase();
    history.value = history.value.filter((x) => x.toLowerCase() !== lower);
    try {
      await removeRemote(scope, word);
    } catch {
      /* 忽略 */
    }
  }

  /** 清空全部 */
  async function clear() {
    history.value = [];
    try {
      await removeRemote(scope);
    } catch {
      /* 忽略 */
    }
  }

  onMounted(load);

  return { history, add, remove, clear, load };
}