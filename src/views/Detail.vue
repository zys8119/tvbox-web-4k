<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchDetail, type VodDetail } from "../api";

const route = useRoute();
const detail = ref<VodDetail | null>(null);
const loading = ref(true);
const error = ref("");
const lineIndex = ref(0);
const expanded = ref(false);

const id = computed(() => String(route.params.id ?? ""));

onMounted(async () => {
  try {
    const data = await fetchDetail(id.value);
    detail.value = data.list[0] ?? null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

const lines = computed(() => detail.value?.vod_play_list ?? []);
const currentLine = computed(() => lines.value[lineIndex.value] ?? null);
const episodes = computed(() => currentLine.value?.episodes ?? []);
const shownEpisodes = computed(() =>
  expanded.value ? episodes.value : episodes.value.slice(0, 30),
);

/** 跳转到本站播放页（flag=线路名，id=剧集地址，vod=影片id 用于选集） */
function playTo(from: string, url: string) {
  return {
    name: "play",
    query: { flag: from, id: url, vod: id.value, name: detail.value?.vod_name ?? "" },
  };
}
</script>

<template>
  <div class="page-wrap py-6">
    <p v-if="loading" class="text-center text-gray-500 py-24">加载中…</p>
    <p v-else-if="error" class="text-center text-red-400 py-24">{{ error }}</p>

    <template v-else-if="detail">
      <!-- 基本信息 -->
      <section class="flex flex-col md:flex-row gap-6 mb-8">
        <div class="w-40 md:w-56 shrink-0 mx-auto md:mx-0">
          <div class="card aspect-[3/4] overflow-hidden ring-1 ring-white/10">
            <img v-if="detail.vod_pic" :src="detail.vod_pic" class="w-full h-full object-cover"
              referrerpolicy="no-referrer" />
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <h1 class="text-2xl md:text-3xl font-bold mb-2">{{ detail.vod_name }}</h1>
          <div class="flex flex-wrap gap-2 text-xs mb-4">
            <span v-if="detail.vod_year" class="px-2 py-1 rounded bg-white/5">{{ detail.vod_year }}</span>
            <span v-if="detail.vod_area" class="px-2 py-1 rounded bg-white/5">{{ detail.vod_area }}</span>
            <span v-if="detail.vod_remarks" class="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300">
              {{ detail.vod_remarks }}
            </span>
          </div>

          <dl class="text-sm space-y-1.5 text-gray-300 mb-4">
            <div v-if="detail.vod_director" class="flex gap-2">
              <dt class="text-gray-500 shrink-0">导演</dt>
              <dd class="truncate">{{ detail.vod_director }}</dd>
            </div>
            <div v-if="detail.vod_actor" class="flex gap-2">
              <dt class="text-gray-500 shrink-0">主演</dt>
              <dd class="line-clamp-2">{{ detail.vod_actor }}</dd>
            </div>
            <div v-if="detail.vod_tag" class="flex gap-2">
              <dt class="text-gray-500 shrink-0">标签</dt>
              <dd class="line-clamp-2">{{ detail.vod_tag }}</dd>
            </div>
          </dl>

          <div class="flex gap-2">
            <RouterLink v-if="episodes.length && currentLine" :to="playTo(currentLine.from, episodes[0].url)"
              class="btn-primary inline-flex items-center gap-2">
              <span class="i-carbon-play-filled" />
              播放第 1 集
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- 线路 -->
      <section v-if="lines.length" class="mb-6">
        <h2 class="text-lg font-semibold mb-3">播放线路</h2>
        <div class="flex flex-wrap gap-2">
          <button v-for="(l, i) in lines" :key="l.from" class="px-3.5 py-1.5 rounded-lg text-sm transition-colors"
            :class="i === lineIndex
              ? 'bg-indigo-500 text-white'
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
              " @click="lineIndex = i; expanded = false">
            {{ l.from }}
            <span class="text-xs opacity-60 ml-1">{{ l.episodes.length }}</span>
          </button>
        </div>
      </section>

      <!-- 剧集 -->
      <section v-if="episodes.length" class="mb-8">
        <h2 class="text-lg font-semibold mb-3">选集</h2>
        <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
          <RouterLink v-for="ep in shownEpisodes" :key="ep.url" :to="playTo(currentLine?.from ?? '', ep.url)"
            class="px-2 py-2 text-center text-sm rounded-lg bg-white/5 hover:bg-indigo-500/80 truncate transition-colors"
            :title="ep.name">
            {{ ep.name }}
          </RouterLink>
        </div>
        <button v-if="episodes.length > 30" class="btn bg-white/5 hover:bg-white/10 text-sm mt-3 w-full"
          @click="expanded = !expanded">
          {{ expanded ? "收起" : `展开全部 ${episodes.length} 集` }}
        </button>
      </section>

      <!-- 简介 -->
      <section v-if="detail.vod_content">
        <h2 class="text-lg font-semibold mb-3">剧情简介</h2>
        <p class="text-sm leading-7 text-gray-300 whitespace-pre-wrap">
          {{ detail.vod_content }}
        </p>
      </section>
    </template>
  </div>
</template>
