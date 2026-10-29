<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Hls from "hls.js";
import { fetchTvboxDetail, fetchTvboxParse, type PlayLine } from "../api";

const route = useRoute();
const router = useRouter();

const video = ref<HTMLVideoElement | null>(null);
const loading = ref(true);
const error = ref("");
const title = ref("");
const lines = ref<PlayLine[]>([]);
const desc = ref(false);
/** 直链/嗅探均失败的兜底：用 iframe 播放原始页面 */
const iframeSrc = ref("");

let hls: Hls | null = null;

/** 与后端正则保持一致的视频直链判断 */
const DIRECT_RE = /^.*\.(mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(\?.*)?$/i;

const site = computed(() => String(route.query.site ?? ""));
const flag = computed(() => String(route.query.flag ?? ""));
const playId = computed(() => String(route.query.id ?? ""));
const vodId = computed(() => String(route.query.vod ?? ""));

/** 当前线路：由 URL flag 推导，保证切换后高亮同步 */
const lineIndex = computed(() => {
  const i = lines.value.findIndex((l) => l.from === flag.value);
  return i >= 0 ? i : 0;
});
const currentLine = computed<PlayLine | null>(
  () => lines.value[lineIndex.value] ?? null,
);
const episodes = computed(() => currentLine.value?.episodes ?? []);
const sortedEpisodes = computed(() =>
  desc.value ? [...episodes.value].reverse() : episodes.value,
);
const currentIndex = computed(() =>
  episodes.value.findIndex((e) => e.url === playId.value),
);
const prevEp = computed(() =>
  currentIndex.value > 0 ? episodes.value[currentIndex.value - 1] : null,
);
const nextEp = computed(() =>
  currentIndex.value >= 0 && currentIndex.value < episodes.value.length - 1
    ? episodes.value[currentIndex.value + 1]
    : null,
);

function destroyHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

/** 采集站返回的通常是直链 m3u8/mp4，直接播放；HTML 页面则先嗅探，失败用 iframe 兜底 */
async function attach(url: string) {
  // 重置 iframe 兜底，让 video 元素重新出现
  iframeSrc.value = "";
  await nextTick();
  const el = video.value;
  if (!el) return;
  destroyHls();
  const isM3u8 = /\.m3u8(\?|$)/i.test(url);
  if (isM3u8 && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, lowLatencyMode: false });
    hls.loadSource(url);
    hls.attachMedia(el);
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) error.value = "视频加载失败：" + data.type;
    });
  } else if (DIRECT_RE.test(url)) {
    el.src = url;
  } else {
    // url 可能是正常 html 页面而非视频资源：先尝试嗅探解析出页面中的视频
    try {
      const r = await fetchTvboxParse(url);
      if (r.url && DIRECT_RE.test(r.url)) {
        await attach(r.url);
        return;
      }
    } catch {
      /* 嗅探失败，走 iframe 兜底 */
    }
    iframeSrc.value = url;
    return;
  }
  el.play().catch(() => {
    /* 浏览器可能拦截自动播放 */
  });
}

async function loadPlay() {
  loading.value = true;
  error.value = "";
  title.value = String(route.query.name ?? "");
  // 采集站详情里直接带播放地址，无需额外解析接口
  if (!playId.value) {
    error.value = "缺少播放地址";
    loading.value = false;
    return;
  }
  try {
    await attach(playId.value);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function loadEpisodes() {
  if (!site.value || !vodId.value) return;
  try {
    const data = await fetchTvboxDetail(site.value, vodId.value);
    const d = data.list[0];
    if (!d) return;
    title.value = title.value || d.vod_name;
    lines.value = d.vod_play_list;
  } catch {
    /* 选集失败不影响播放 */
  }
}

function goEp(url: string, from: string) {
  router.push({
    name: "site-play",
    query: { ...route.query, flag: from, id: url },
  });
}

function switchLine(i: number) {
  if (i === lineIndex.value) return;
  const target = lines.value[i];
  if (!target || !target.episodes.length) return;
  const keep = currentIndex.value;
  const ep =
    keep >= 0 && keep < target.episodes.length
      ? target.episodes[keep]
      : target.episodes[0];
  goEp(ep.url, target.from);
}

function goBack() {
  router.push({
    name: "site-detail",
    query: { site: site.value, id: vodId.value },
  });
}

function onEnded() {
  if (nextEp.value) goEp(nextEp.value.url, flag.value);
}

watch(
  () => [playId.value, site.value, vodId.value],
  () => {
    loadPlay();
    loadEpisodes();
  },
  { immediate: true },
);

onBeforeUnmount(destroyHls);
</script>

<template>
  <div class="page-wrap py-4">
    <div class="mb-4 flex items-center gap-2 min-h-9">
      <button class="b-none btn text-sm px-3 bg-white/[0.05] hover:bg-white/[0.11]" @click="goBack">
        <span class="i-carbon-arrow-left" /> 返回
      </button>
      <h1 class="text-base md:text-lg font-medium truncate">
        {{ title || "正在播放" }}
        <span v-if="flag" class="text-[11px] text-indigo-300 ml-2 px-2 py-0.5 rounded-md bg-indigo-500/20">
          {{ flag }}
        </span>
      </h1>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6 items-start">
      <!-- 左：播放器 + 上下集 -->
      <div class="min-w-0">
        <div
          class="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_26px_70px_-30px_rgba(0,0,0,1)]">
          <video v-if="!iframeSrc" ref="video" class="w-full h-full" controls playsinline autoplay @ended="onEnded" />
          <iframe v-else :src="iframeSrc" class="w-full h-full border-0"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen
            referrerpolicy="no-referrer" />
          <div v-if="loading"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm text-sm text-gray-300">
            <span class="w-9 h-9 rounded-full border-2 border-white/15 border-t-indigo-400 animate-spin" />
            加载中…
          </div>
          <div v-if="error && !iframeSrc"
            class="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm text-sm text-red-400 px-6 text-center">
            {{ error }}
          </div>
        </div>

        <!-- 上下集：靠右 -->
        <div v-if="episodes.length" class="panel mt-4 flex flex-wrap items-center gap-2 !py-2.5">
          <span class="text-xs text-gray-500 mr-1">播放控制</span>
          <div class="ml-auto flex items-center gap-2">
            <button
              class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white/[0.05]"
              :disabled="!prevEp" @click="prevEp && goEp(prevEp.url, flag)">
              <span class="i-carbon-chevron-left text-[10px]" /> 上一集
            </button>
            <span class="text-[11px] text-gray-400 px-2 py-1 rounded-md bg-white/[0.05] tabular-nums">
              {{ currentIndex >= 0 ? currentIndex + 1 : "?" }} /
              {{ episodes.length }}
            </span>
            <button
              class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white/[0.05]"
              :disabled="!nextEp" @click="nextEp && goEp(nextEp.url, flag)">
              下一集 <span class="i-carbon-chevron-right text-[10px]" />
            </button>
          </div>
        </div>
      </div>

      <!-- 右：线路 tab + 选集 -->
      <div v-if="lines.length" class="panel min-w-0 flex gap-0 !p-0 overflow-hidden">
        <aside class="shrink-0 w-32 sm:w-36 flex flex-col max-h-[520px] bg-white/[0.015]">
          <div class="flex items-center gap-1.5 px-3.5 pt-3.5 pb-2.5">
            <span class="i-carbon-list text-[11px] text-indigo-300/70" />
            <p class="text-[11px] tracking-[0.18em] text-gray-500">线路</p>
            <span class="ml-auto text-[10px] text-gray-600 tabular-nums">
              {{ lines.length }}
            </span>
          </div>
          <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            <button v-for="(l, i) in lines" :key="l.from"
              class="b-none group relative w-full overflow-hidden rounded-xl px-2.5 py-2 text-left transition-all duration-300 ease-out"
              :class="i === lineIndex
                ? 'bg-gradient-to-r from-indigo-500/25 via-violet-500/15 to-transparent shadow-[0_6px_18px_-10px_rgba(99,102,241,0.95)]'
                : 'bg-[#12141c] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-[#171a24] hover:translate-x-[2px]'
                " :title="l.from + ' · ' + l.episodes.length + ' 集'" @click="switchLine(i)">
              <span
                class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-gradient-to-b from-indigo-400 via-violet-500 to-fuchsia-500 transition-all duration-300 ease-out"
                :class="i === lineIndex
                  ? 'h-8 opacity-100 shadow-[0_0_12px_rgba(139,92,246,1)]'
                  : 'h-0 opacity-0'
                  " />
              <span class="relative block truncate text-[13px] leading-snug transition-colors duration-200" :class="i === lineIndex
                ? 'text-white font-semibold'
                : 'text-gray-400 group-hover:text-gray-100'
                ">
                {{ l.from }}
              </span>
              <span
                class="relative mt-1 flex items-center gap-1 text-[10px] tabular-nums transition-colors duration-200"
                :class="i === lineIndex
                  ? 'text-indigo-300/90'
                  : 'text-gray-600 group-hover:text-gray-500'
                  ">
                <span class="i-carbon-video text-[9px]" />
                {{ l.episodes.length }} 集
              </span>
            </button>
          </div>
        </aside>

        <span class="w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />

        <div class="flex-1 min-w-0 p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="section-title !text-sm min-w-0">
              <span class="title-bar !h-3 shrink-0" />
              <span class="truncate">{{ currentLine?.from ?? "选集" }}</span>
              <span class="text-xs font-normal text-gray-500 ml-1 shrink-0">
                共 {{ episodes.length }} 集
              </span>
            </h2>
            <button class="b-none btn text-xs px-2.5 py-1 shrink-0 bg-white/[0.05] hover:bg-white/[0.11]"
              :title="desc ? '当前倒序，点击切换为正序' : '当前正序，点击切换为倒序'" @click="desc = !desc">
              <span class="i-carbon-switch-layer-2" :class="desc ? 'rotate-180' : ''" />
              {{ desc ? "倒序" : "正序" }}
            </button>
          </div>
          <div v-if="episodes.length"
            class="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-2 max-h-[420px] overflow-y-auto pr-1">
            <button v-for="ep in sortedEpisodes" :key="ep.url"
              class="px-2 b-none py-2 text-center text-sm rounded-lg truncate transition-all duration-200" :class="ep.url === playId
                ? 'text-white bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_8px_22px_-10px_rgba(99,102,241,1)]'
                : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.11] hover:text-white'
                " :title="ep.name" @click="goEp(ep.url, flag)">
              {{ ep.name }}
            </button>
          </div>
          <p v-else class="text-sm text-gray-500 py-8 text-center">
            该线路暂无剧集
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
