<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Hls from "hls.js";
import {
  fetchDetail,
  fetchPlay,
  parseHeader,
  type PlayLine,
} from "../api";

const route = useRoute();
const router = useRouter();

const video = ref<HTMLVideoElement | null>(null);
const loading = ref(true);
const error = ref("");
const title = ref("");
const lines = ref<PlayLine[]>([]);
const lineIndex = ref(0);

let hls: Hls | null = null;

const flag = computed(() => String(route.query.flag ?? ""));
const playId = computed(() => String(route.query.id ?? ""));
const vodId = computed(() => String(route.query.vod ?? ""));

/** 当前线路的剧集列表（由详情页传来 vod 时才有，用于选集/连播） */
const episodes = computed(() => lines.value[lineIndex.value]?.episodes ?? []);
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

async function attach(url: string, headers: Record<string, string>) {
  await nextTick();
  const el = video.value;
  if (!el) return;
  destroyHls();

  const isM3u8 = /\.m3u8(\?|$)/i.test(url);
  if (isM3u8 && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      xhrSetup: (xhr) => {
        for (const [k, v] of Object.entries(headers)) {
          try {
            xhr.setRequestHeader(k, v);
          } catch {
            /* 部分头不允许设置，忽略 */
          }
        }
      },
    });
    hls.loadSource(url);
    hls.attachMedia(el);
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) error.value = "视频加载失败：" + data.type;
    });
  } else {
    el.src = url;
  }
  el.play().catch(() => {
    /* 浏览器可能拦截自动播放，交由用户点击 */
  });
}

async function load() {
  loading.value = true;
  error.value = "";
  title.value = String(route.query.name ?? "");
  try {
    const res = await fetchPlay(flag.value, playId.value);
    if (!res.url) {
      error.value = res.msg || "解析失败";
      return;
    }
    await attach(res.url, parseHeader(res.header));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function loadEpisodes() {
  if (!vodId.value) return;
  try {
    const data = await fetchDetail(vodId.value);
    const d = data.list[0];
    if (!d) return;
    title.value = title.value || d.vod_name;
    lines.value = d.vod_play_list;
    const idx = lines.value.findIndex((l) => l.from === flag.value);
    lineIndex.value = idx >= 0 ? idx : 0;
  } catch {
    /* 选集信息失败不影响播放 */
  }
}

function goEp(url: string, from: string) {
  router.push({
    name: "play",
    query: { ...route.query, flag: from, id: url },
  });
}

function onEnded() {
  if (nextEp.value) goEp(nextEp.value.url, flag.value);
}

watch(
  () => [flag.value, playId.value],
  () => load(),
  { immediate: true },
);

watch(vodId, () => loadEpisodes(), { immediate: true });

onBeforeUnmount(destroyHls);
</script>

<template>
  <div class="page-wrap py-4">
    <div class="mb-3 flex items-center gap-2 min-h-8">
      <button class="btn bg-white/5 hover:bg-white/10 text-sm" @click="router.back()">
        <span class="i-carbon-arrow-left align-middle" /> 返回
      </button>
      <h1 class="text-base md:text-lg font-medium truncate">
        {{ title || "正在播放" }}
        <span v-if="flag" class="text-xs text-indigo-300 ml-2">[{{ flag }}]</span>
      </h1>
    </div>

    <div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden ring-1 ring-white/10">
      <video
        ref="video"
        class="w-full h-full"
        controls
        playsinline
        autoplay
        @ended="onEnded"
      />
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-gray-300"
      >
        解析中…
      </div>
      <div
        v-if="error"
        class="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-red-400 px-6 text-center"
      >
        {{ error }}
      </div>
    </div>

    <!-- 上下集 -->
    <div v-if="episodes.length" class="flex items-center justify-center gap-2 mt-3">
      <button
        class="btn bg-white/5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!prevEp"
        @click="prevEp && goEp(prevEp.url, flag)"
      >
        上一集
      </button>
      <span class="text-xs text-gray-400 px-2">
        {{ currentIndex >= 0 ? currentIndex + 1 : "?" }} / {{ episodes.length }}
      </span>
      <button
        class="btn bg-white/5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!nextEp"
        @click="nextEp && goEp(nextEp.url, flag)"
      >
        下一集
      </button>
    </div>

    <!-- 线路切换 -->
    <div v-if="lines.length > 1" class="mt-5">
      <h2 class="text-sm text-gray-400 mb-2">切换线路</h2>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="(l, i) in lines"
          :key="l.from"
          class="px-3 py-1.5 rounded-lg text-sm transition-colors"
          :class="
            i === lineIndex
              ? 'bg-indigo-500 text-white'
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
          "
          @click="
            l.episodes.length && goEp(l.episodes[0].url, l.from)
          "
        >
          {{ l.from }}
        </button>
      </div>
    </div>

    <!-- 选集 -->
    <div v-if="episodes.length" class="mt-5">
      <h2 class="text-sm text-gray-400 mb-2">选集</h2>
      <div class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
        <button
          v-for="ep in episodes"
          :key="ep.url"
          class="px-2 py-2 text-center text-sm rounded-lg truncate transition-colors"
          :class="
            ep.url === playId
              ? 'bg-indigo-500 text-white'
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
          "
          :title="ep.name"
          @click="goEp(ep.url, flag)"
        >
          {{ ep.name }}
        </button>
      </div>
    </div>
  </div>
</template>
