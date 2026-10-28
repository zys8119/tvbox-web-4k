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
      <section class="panel flex flex-col md:flex-row gap-6 mb-6 !p-5 md:!p-6">
        <div class="w-40 md:w-56 shrink-0 mx-auto md:mx-0">
          <div class="card aspect-[3/4] overflow-hidden shadow-[0_18px_50px_-20px_rgba(0,0,0,0.95)]">
            <img v-if="detail.vod_pic" :src="detail.vod_pic" class="w-full h-full object-cover"
              referrerpolicy="no-referrer" />
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <h1
            class="text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {{ detail.vod_name }}
          </h1>
          <div class="flex flex-wrap gap-2 text-xs mb-4">
            <span v-if="detail.vod_year" class="px-2.5 py-1 rounded-md bg-white/[0.09] text-gray-300">{{ detail.vod_year
              }}</span>
            <span v-if="detail.vod_area" class="px-2.5 py-1 rounded-md bg-white/[0.09] text-gray-300">{{ detail.vod_area
              }}</span>
            <span v-if="detail.vod_remarks" class="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-300">
              {{ detail.vod_remarks }}
            </span>
          </div>

          <dl class="text-sm space-y-2 text-gray-300 mb-5">
            <div v-if="detail.vod_director" class="flex gap-2">
              <dt class="shrink-0 text-gray-500 w-10">导演</dt>
              <dd class="truncate">{{ detail.vod_director }}</dd>
            </div>
            <div v-if="detail.vod_actor" class="flex gap-2">
              <dt class="shrink-0 text-gray-500 w-10">主演</dt>
              <dd class="line-clamp-2 text-gray-300/90">{{ detail.vod_actor }}</dd>
            </div>
            <div v-if="detail.vod_tag" class="flex gap-2">
              <dt class="shrink-0 text-gray-500 w-10">标签</dt>
              <dd class="line-clamp-2 text-gray-300/90">{{ detail.vod_tag }}</dd>
            </div>
          </dl>

          <div class="flex gap-2">
            <RouterLink v-if="episodes.length && currentLine" :to="playTo(currentLine.from, episodes[0].url)"
              class="btn-primary">
              <span class="i-carbon-play-filled" />
              播放第 1 集
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- 线路 -->
      <section v-if="lines.length" class="mb-6">
        <h2 class="section-title mb-3">
          <span class="title-bar" />
          播放线路
        </h2>
        <div class="flex flex-wrap gap-2">
          <button v-for="(l, i) in lines" :key="l.from" class="chip border-none"
            :class="i === lineIndex ? 'chip-active' : 'chip-idle'" @click="lineIndex = i; expanded = false">
            {{ l.from }}
            <span class="text-xs opacity-60 ml-1">{{ l.episodes.length }}</span>
          </button>
        </div>
      </section>

      <!-- 剧集 -->
      <section v-if="episodes.length" class="mb-8">
        <h2 class="section-title mb-3">
          <span class="title-bar" />
          选集
        </h2>
        <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
          <RouterLink v-for="ep in shownEpisodes" :key="ep.url" :to="playTo(currentLine?.from ?? '', ep.url)"
            class="px-2 py-2 text-center text-sm rounded-lg truncate bg-white/[0.05] hover:bg-white/[0.11] hover:text-white transition-all duration-200"
            :title="ep.name">
            {{ ep.name }}
          </RouterLink>
        </div>
        <button v-if="episodes.length > 30" class="btn text-sm mt-3 w-full bg-white/[0.05] hover:bg-white/[0.11]"
          @click="expanded = !expanded">
          {{ expanded ? "收起" : `展开全部 ${episodes.length} 集` }}
        </button>
      </section>

      <!-- 简介 -->
      <section v-if="detail.vod_content">
        <h2 class="section-title mb-3">
          <span class="title-bar" />
          剧情简介
        </h2>
        <p class="text-sm leading-7 text-gray-300/90 whitespace-pre-wrap">
          {{ detail.vod_content }}
        </p>
      </section>
    </template>
  </div>
</template>
