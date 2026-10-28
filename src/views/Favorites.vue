<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  fetchFavorites,
  removeFavoriteApi,
  type FavoriteItem,
} from "../api";

const list = ref<FavoriteItem[]>([]);
const loading = ref(true);
const error = ref("");
/** 搜索关键词 */
const keyword = ref("");

/** 搜索过滤：片名、备注 */
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return list.value;
  return list.value.filter((x) =>
    [x.vod_name, x.remarks].join(" ").toLowerCase().includes(kw),
  );
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchFavorites();
    list.value = data.list;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function remove(id: string) {
  try {
    await removeFavoriteApi(id);
    list.value = list.value.filter((x) => x.vod_id !== id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-wrap py-6">
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <h2 class="section-title">
        <span class="title-bar" />
        我的收藏
        <span class="text-xs font-normal text-gray-500 ml-1">
          共 {{ list.length }} 部
        </span>
      </h2>
    </div>

    <!-- 搜索 -->
    <div v-if="list.length"
      class="search-field mb-5 flex items-center rounded-xl px-3 h-10 bg-white/[0.05] transition-colors focus-within:bg-white/[0.09]">
      <span class="i-carbon-search text-gray-500 text-sm" />
      <input v-model="keyword" type="text"
        class="bg-transparent border-0 border-none outline-none ring-0 shadow-none appearance-none text-sm px-2 flex-1 placeholder:text-gray-500 focus:outline-none focus:ring-0"
        placeholder="搜索片名、备注…" />
      <button v-if="keyword"
        class="b-none w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"
        title="清空搜索" @click="keyword = ''">
        <span class="i-carbon-close text-xs" />
      </button>
    </div>

    <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

    <div v-if="loading"
      class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
      <div v-for="i in 14" :key="i" class="card animate-pulse">
        <div class="aspect-[3/4] bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
      </div>
    </div>

    <p v-else-if="!list.length && !error" class="text-center text-gray-500 py-20">
      还没有收藏任何内容
    </p>

    <p v-else-if="!filtered.length && !error" class="text-center text-gray-500 py-20">
      没有匹配「{{ keyword }}」的收藏
    </p>

    <div v-else class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
      <div v-for="f in filtered" :key="f.vod_id"
        class="group card glass-hover hover:-translate-y-1.5 duration-300 ease-out relative">
        <RouterLink :to="`/detail/${f.vod_id}`" class="block">
          <div class="relative aspect-[3/4] overflow-hidden bg-white/5">
            <img v-if="f.vod_pic" :src="f.vod_pic" :alt="f.vod_name" loading="lazy"
              class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              referrerpolicy="no-referrer" />
            <div v-else class="w-full h-full flex items-center justify-center text-gray-600 text-xs">
              暂无封面
            </div>
            <span v-if="f.remarks"
              class="absolute left-2 bottom-2 max-w-[calc(100%-1rem)] px-2 py-1 rounded-md text-[11px] leading-tight text-gray-100 bg-black/65 backdrop-blur-md truncate">
              {{ f.remarks }}
            </span>
          </div>
          <div class="px-2 py-2">
            <p class="text-sm text-gray-100 truncate" :title="f.vod_name">
              {{ f.vod_name }}
            </p>
          </div>
        </RouterLink>

        <button
          class="b-none absolute right-2 top-2 w-7 h-7 rounded-lg bg-black/45 backdrop-blur-md text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-300 hover:bg-red-500/25 transition-all flex items-center justify-center"
          title="取消收藏" @click="remove(f.vod_id)">
          <span class="i-carbon-trash-can text-xs" />
        </button>
      </div>
    </div>
  </div>
</template>
