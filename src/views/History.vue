<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  fetchDetail,
  fetchHistory,
  removeHistory,
  type HistoryItem,
} from "../api";
import { haystackOf, matchKeyword } from "../utils/search";
import SearchBox from "../components/SearchBox.vue";

const router = useRouter();

const list = ref<HistoryItem[]>([]);
const loading = ref(true);
const error = ref("");
/** 正在解析跳转的记录 id（用于显示加载态并防止重复点击） */
const opening = ref("");
/** 搜索关键词 */
const keyword = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchHistory();
    list.value = data.list;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function remove(id: string) {
  try {
    await removeHistory(id);
    list.value = list.value.filter((x) => x.vod_id !== id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function clearAll() {
  if (!window.confirm("确定清空全部观看历史？")) return;
  try {
    await removeHistory();
    list.value = [];
  } catch (e) {
    error.value = (e as Error).message;
  }
}

/** 搜索过滤：片名、线路、集名、备注，支持中文/全拼/首字母 */
const filtered = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return list.value;
  return list.value.filter((x) =>
    matchKeyword(
      haystackOf(x, [x.vod_name, x.flag, x.ep_name, x.remarks].join(" ")),
      kw,
    ),
  );
});

interface Group {
  /** 分组标题 */
  label: string;
  /** 组内记录 */
  items: HistoryItem[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 取某天 00:00 的时间戳 */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 按时间分组：今天 / 昨天 / 前天 / 一周内 / 一月内(日期) /
 * 具体月份(YYYY-MM) / 具体年份(YYYY)。
 */
const groups = computed<Group[]>(() => {
  const now = new Date();
  const today = startOfDay(now);
  const DAY = 86400000;
  const yesterday = today - DAY;
  const beforeYesterday = today - 2 * DAY;
  const weekAgo = today - 6 * DAY;
  const monthAgo = today - 29 * DAY;

  const buckets = new Map<string, HistoryItem[]>();
  const push = (k: string, it: HistoryItem) => {
    const arr = buckets.get(k) ?? [];
    arr.push(it);
    buckets.set(k, arr);
  };

  for (const it of filtered.value) {
    const ts = it.updated_at;
    if (!ts) {
      push("更早", it);
      continue;
    }
    const d = new Date(ts);
    const day = startOfDay(d);

    if (day === today) push("今天", it);
    else if (day === yesterday) push("昨天", it);
    else if (day === beforeYesterday) push("前天", it);
    else if (day > weekAgo) push("一周内", it);
    else if (day > monthAgo) {
      // 一月内按具体日期分组
      push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, it);
    } else if (d.getFullYear() === now.getFullYear()) {
      // 同年更早：按月份
      push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, it);
    } else {
      // 跨年：按年份
      push(String(d.getFullYear()), it);
    }
  }

  // 固定顺序：今天 → 昨天 → 前天 → 一周内 → 其余按时间倒序
  const fixedOrder = ["今天", "昨天", "前天", "一周内"];
  const restKeys = [...buckets.keys()].filter((k) => !fixedOrder.includes(k));
  restKeys.sort((a, b) => b.localeCompare(a));

  const result: Group[] = [];
  for (const k of [...fixedOrder, ...restKeys]) {
    const items = buckets.get(k);
    if (items && items.length) result.push({ label: k, items });
  }
  return result;
});

/** 是否有任何记录（用于空态判断） */
const hasAny = computed(() => list.value.length > 0);

/**
 * 打开历史记录：优先直达上次观看的线路与集数；
 * 该集已失效时回退到详情页第一集，仍无则回详情页。
 */
async function open(h: HistoryItem) {
  if (opening.value) return;
  opening.value = h.vod_id;
  try {
    // 有完整线路与集地址，直接跳播放页
    if (h.flag && h.ep_url) {
      router.push({
        name: "play",
        query: {
          flag: h.flag,
          id: h.ep_url,
          vod: h.vod || h.vod_id,
          name: h.vod_name,
        },
      });
      return;
    }

    // 历史缺少集地址时，拉详情重新定位
    const data = await fetchDetail(h.vod_id);
    const d = data.list[0];
    if (!d || !d.vod_play_list.length) {
      router.push(`/detail/${h.vod_id}`);
      return;
    }

    // 优先匹配历史记录的线路，找不到则用第一条线路
    const line =
      d.vod_play_list.find((l) => l.from === h.flag) ?? d.vod_play_list[0];
    if (!line || !line.episodes.length) {
      router.push(`/detail/${h.vod_id}`);
      return;
    }

    // 优先匹配历史记录的集地址，找不到则用第一集
    const ep =
      line.episodes.find((e) => e.url === h.ep_url) ?? line.episodes[0];

    router.push({
      name: "play",
      query: {
        flag: line.from,
        id: ep.url,
        vod: h.vod || h.vod_id,
        name: d.vod_name || h.vod_name,
      },
    });
  } catch {
    // 详情拉取失败时退化为跳详情页
    router.push(`/detail/${h.vod_id}`);
  } finally {
    opening.value = "";
  }
}

/** 格式化时间为相对时间 */
function relTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + " 分钟前";
  const h = Math.floor(min / 60);
  if (h < 24) return h + " 小时前";
  const d = Math.floor(h / 24);
  if (d < 30) return d + " 天前";
  return new Date(ts).toLocaleDateString();
}

onMounted(load);
</script>

<template>
  <div class="page-wrap py-6">
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <h2 class="section-title">
        <span class="title-bar" />
        观看历史
        <span class="text-xs font-normal text-gray-500 ml-1">
          共 {{ list.length }} 条
        </span>
      </h2>
      <button v-if="hasAny"
        class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-red-500/20 hover:text-red-300 text-gray-400"
        @click="clearAll">
        <span class="i-carbon-trash-can text-[10px]" /> 清空
      </button>
    </div>

    <!-- 搜索：支持拼音/首字母，带搜索记录 -->
    <div v-if="hasAny" class="mb-5">
      <SearchBox v-model="keyword" scope="history" placeholder="搜索片名、线路、集名，支持拼音…" />
    </div>

    <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div v-for="i in 6" :key="i" class="panel animate-pulse h-24" />
    </div>

    <p v-else-if="!hasAny && !error" class="text-center text-gray-500 py-20">
      还没有观看记录
    </p>

    <p v-else-if="!groups.length && !error" class="text-center text-gray-500 py-20">
      没有匹配「{{ keyword }}」的记录
    </p>

    <!-- 分组列表 -->
    <div v-else class="space-y-7">
      <section v-for="g in groups" :key="g.label">
        <h3 class="flex items-center gap-2 mb-3 text-sm text-gray-400">
          <span class="w-1 h-3.5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
          {{ g.label }}
          <span class="text-[11px] text-gray-600 tabular-nums">
            {{ g.items.length }}
          </span>
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div v-for="h in g.items" :key="h.vod_id"
            class="panel group relative flex gap-3 !p-3 hover:bg-white/[0.06] transition-colors cursor-pointer"
            :class="opening === h.vod_id ? 'opacity-60 pointer-events-none' : ''" @click="open(h)">
            <!-- 封面 -->
            <div class="shrink-0 w-16">
              <div class="aspect-[3/4] rounded-lg overflow-hidden bg-white/[0.06] flex items-center justify-center">
                <img v-if="h.vod_pic" :src="h.vod_pic" :alt="h.vod_name" class="w-full h-full object-cover"
                  referrerpolicy="no-referrer" />
                <span v-else class="i-carbon-image text-gray-600 text-lg" />
              </div>
            </div>

            <div class="flex-1 min-w-0 flex flex-col">
              <p class="text-sm font-medium text-gray-100 truncate group-hover:text-indigo-300 transition-colors">
                {{ h.vod_name }}
              </p>
              <p class="text-[11px] text-gray-500 mt-1 truncate">
                {{ h.flag || "默认线路" }}
                <span v-if="h.ep_name"> · {{ h.ep_name }}</span>
              </p>
              <p class="text-[11px] text-gray-600 mt-auto flex items-center gap-1">
                <span class="i-carbon-time text-[10px]" />
                {{ relTime(h.updated_at) }}
              </p>
            </div>

            <span
              class="b-none absolute right-2 bottom-2 text-[11px] text-indigo-300/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              继续观看 <span class="i-carbon-arrow-right text-[10px]" />
            </span>

            <button
              class="b-none absolute right-2 top-2 w-6 h-6 rounded-md bg-black/40 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-300 hover:bg-red-500/20 transition-all flex items-center justify-center"
              title="删除这条记录" @click.stop="remove(h.vod_id)">
              <span class="i-carbon-close text-[10px]" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
