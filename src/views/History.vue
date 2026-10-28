<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchHistory, removeHistory, type HistoryItem } from "../api";

const list = ref<HistoryItem[]>([]);
const loading = ref(true);
const error = ref("");

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
    <div class="flex items-center justify-between mb-5">
      <h2 class="section-title">
        <span class="title-bar" />
        观看历史
        <span class="text-xs font-normal text-gray-500 ml-1">
          共 {{ list.length }} 条
        </span>
      </h2>
      <button v-if="list.length"
        class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-red-500/20 hover:text-red-300 text-gray-400"
        @click="clearAll">
        <span class="i-carbon-trash-can text-[10px]" /> 清空
      </button>
    </div>

    <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div v-for="i in 6" :key="i" class="panel animate-pulse h-24" />
    </div>

    <p v-else-if="!list.length && !error" class="text-center text-gray-500 py-20">
      还没有观看记录
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div v-for="h in list" :key="h.vod_id"
        class="panel group relative flex gap-3 !p-3 hover:bg-white/[0.06] transition-colors">
        <RouterLink :to="`/detail/${h.vod_id}`" class="shrink-0 w-16">
          <div class="aspect-[3/4] rounded-lg overflow-hidden bg-white/5">
            <img v-if="h.vod_pic" :src="h.vod_pic" :alt="h.vod_name" class="w-full h-full object-cover"
              referrerpolicy="no-referrer" />
          </div>
        </RouterLink>

        <div class="flex-1 min-w-0 flex flex-col">
          <RouterLink :to="`/detail/${h.vod_id}`"
            class="text-sm font-medium text-gray-100 truncate hover:text-indigo-300">
            {{ h.vod_name }}
          </RouterLink>
          <p class="text-[11px] text-gray-500 mt-1 truncate">
            {{ h.flag || "默认线路" }}
            <span v-if="h.ep_name"> · {{ h.ep_name }}</span>
          </p>
          <p class="text-[11px] text-gray-600 mt-auto">
            {{ relTime(h.updated_at) }}
          </p>
        </div>

        <button
          class="b-none absolute right-2 top-2 w-6 h-6 rounded-md bg-black/40 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-300 hover:bg-red-500/20 transition-all flex items-center justify-center"
          title="删除这条记录" @click="remove(h.vod_id)">
          <span class="i-carbon-close text-[10px]" />
        </button>
      </div>
    </div>
  </div>
</template>
