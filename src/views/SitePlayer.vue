<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Hls from "hls.js";
import {
  fetchAutoPlay,
  fetchMarks,
  fetchProgress,
  fetchTvboxDetail,
  fetchTvboxParse,
  pushHistory,
  saveMarksApi,
  saveProgressApi,
  setAutoPlay,
  type Marks,
  type PlayLine,
} from "../api";

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

/** 实际用于收藏/历史/进度/标记的影片标识（vod 参数缺失时回退到详情里的 real vod_id） */
const vodKey = ref("");

/* ============================== 进度 / 片头片尾 / 自动连播 ============================== */

/** 片头、片尾时间点（秒），0 表示未设置 */
const marks = ref<Marks>({ intro: 0, outro: 0 });

/** 自动播放上下集（绑定当前订阅） */
const autoPlay = ref(true);

/** 播放进度保存节流标记 */
let lastSaved = 0;

/** 秒 -> mm:ss / hh:mm:ss */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "00:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/** 片头按钮文案 */
const introLabel = computed(() =>
  marks.value.intro > 0 ? `片头：${fmtTime(marks.value.intro)}` : "片头",
);

/** 片尾按钮文案 */
const outroLabel = computed(() =>
  marks.value.outro > 0 ? `片尾：${fmtTime(marks.value.outro)}` : "片尾",
);

/** 加载自动连播设置 */
async function loadAutoPlay() {
  try {
    autoPlay.value = (await fetchAutoPlay()).enabled;
  } catch {
    autoPlay.value = true;
  }
}

/** 切换自动连播并同步到服务端（绑定当前订阅） */
async function toggleAutoPlay() {
  autoPlay.value = !autoPlay.value;
  try {
    await setAutoPlay(autoPlay.value);
  } catch {
    /* 保存失败不影响本地开关 */
  }
}

/** 点击「片头」：未设置则记录当前时间，已设置则取消 */
async function toggleIntro() {
  if (!vodKey.value) return;
  const el = video.value;
  if (marks.value.intro > 0) {
    marks.value = await saveMarksApi({
      vod_id: vodKey.value,
      intro: 0,
      site: site.value,
    });
    return;
  }
  if (!el) return;
  marks.value = await saveMarksApi({
    vod_id: vodKey.value,
    intro: Math.floor(el.currentTime),
    site: site.value,
  });
}

/** 点击「片尾」：未设置则记录当前时间，已设置则取消 */
async function toggleOutro() {
  if (!vodKey.value) return;
  const el = video.value;
  if (marks.value.outro > 0) {
    marks.value = await saveMarksApi({
      vod_id: vodKey.value,
      outro: 0,
      site: site.value,
    });
    return;
  }
  if (!el) return;
  marks.value = await saveMarksApi({
    vod_id: vodKey.value,
    outro: Math.floor(el.currentTime),
    site: site.value,
  });
}

/** 跳到指定时间点 */
function seekTo(sec: number) {
  const el = video.value;
  if (!el || sec <= 0) return;
  el.currentTime = sec;
  el.play().catch(() => {});
}

/** 加载片头片尾标记 */
async function loadMarks() {
  if (!vodKey.value) return;
  try {
    marks.value = await fetchMarks(vodKey.value);
  } catch {
    marks.value = { intro: 0, outro: 0 };
  }
}

/** 保存播放进度（节流：距上次保存 >= 5 秒） */
function saveProgress(force = false) {
  const el = video.value;
  if (!el || !vodKey.value || !flag.value) return;
  const t = Math.floor(el.currentTime);
  if (!force && Math.abs(t - lastSaved) < 5) return;
  lastSaved = t;
  const ep = episodes.value[currentIndex.value];
  saveProgressApi({
    vod_id: vodKey.value,
    flag: flag.value,
    ep_url: playId.value,
    ep_name: ep?.name ?? "",
    position: t,
    duration: Math.floor(el.duration || 0),
    site: site.value,
  }).catch(() => {
    /* 进度保存失败不影响播放 */
  });
}

/** 记录观看历史（含来源站点，供历史列表跳转与订阅隔离） */
function recordHistory() {
  if (!vodKey.value) return;
  const ep = episodes.value[currentIndex.value];
  pushHistory({
    vod_id: vodKey.value,
    vod_name: title.value,
    flag: flag.value,
    ep_name: ep?.name ?? "",
    ep_url: playId.value,
    vod: vodId.value || vodKey.value,
    site: site.value,
  }).catch(() => {});
}

/** 应用续播：优先恢复同一剧集的进度；否则在设置了片头时自动跳过片头 */
async function applyResume() {
  const el = video.value;
  if (!el || !vodKey.value) return;
  try {
    const p = await fetchProgress(vodKey.value, flag.value);
    if (p.ep_url && p.ep_url === playId.value && (p.position ?? 0) > 3) {
      el.currentTime = p.position as number;
      lastSaved = Math.floor(p.position as number);
      return;
    }
  } catch {
    /* 进度读取失败则忽略 */
  }
  if (marks.value.intro > 0) {
    el.currentTime = marks.value.intro;
    lastSaved = marks.value.intro;
  }
}

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

  // 元数据就绪后应用续播/跳片头
  el.onloadedmetadata = async () => {
    await applyResume();
    el.play().catch(() => {
      /* 浏览器可能拦截自动播放 */
    });
  };

  // 播放时间更新：节流保存进度 + 到达片尾标记时自动跳下一集
  el.ontimeupdate = () => {
    saveProgress();
    const o = marks.value.outro;
    if (o > 0 && el.duration && el.currentTime >= o) {
      if (autoPlay.value && nextEp.value) goEp(nextEp.value.url, flag.value);
    }
  };

  el.onplay = () => recordHistory();
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
    vodKey.value = d.vod_id || vodId.value;
    lines.value = d.vod_play_list;
    await loadMarks();
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
  if (autoPlay.value && nextEp.value) goEp(nextEp.value.url, flag.value);
}

watch(
  () => [playId.value, site.value, vodId.value],
  () => {
    vodKey.value = vodId.value;
    loadAutoPlay();
    if (vodKey.value) loadMarks();
    loadPlay();
    loadEpisodes();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  // 离开页面前强制保存一次进度，避免最后一次进度丢失
  saveProgress(true);
  destroyHls();
});
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
      <!-- 左：播放器 + 跳过设置/上下集 -->
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

        <!-- 片头/片尾设置 + 自动连播 + 上下集 -->
        <div v-if="vodKey" class="panel mt-4 flex flex-wrap items-center gap-2 !py-2.5">
          <span class="text-xs text-gray-500 mr-1">跳过设置</span>

          <button class="b-none btn text-xs px-2.5 py-1" :class="marks.intro > 0
            ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.11]'
            " :title="marks.intro > 0
              ? '点击取消片头标记（当前 ' + fmtTime(marks.intro) + '）'
              : '点击记录当前播放位置为片头'
              " @click="toggleIntro">
            <span class="i-carbon-skip-forward text-[10px]" />
            {{ introLabel }}
          </button>

          <button class="b-none btn text-xs px-2.5 py-1" :class="marks.outro > 0
            ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.11]'
            " :title="marks.outro > 0
              ? '点击取消片尾标记（当前 ' + fmtTime(marks.outro) + '）'
              : '点击记录当前播放位置为片尾'
              " @click="toggleOutro">
            <span class="i-carbon-skip-backward text-[10px]" />
            {{ outroLabel }}
          </button>

          <button v-if="marks.intro > 0"
            class="b-none btn text-xs px-2 py-1 bg-white/[0.05] hover:bg-white/[0.11] text-gray-400" title="跳到片头位置"
            @click="seekTo(marks.intro)">
            跳片头
          </button>
          <button v-if="marks.outro > 0"
            class="b-none btn text-xs px-2 py-1 bg-white/[0.05] hover:bg-white/[0.11] text-gray-400" title="跳到片尾位置"
            @click="seekTo(marks.outro)">
            跳片尾
          </button>

          <button class="b-none btn text-xs px-2.5 py-1" :class="autoPlay
            ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.11]'
            " :title="autoPlay ? '当前开启，点击关闭' : '当前关闭，点击开启'" @click="toggleAutoPlay">
            <span class="i-carbon-playlist" :class="autoPlay ? 'text-indigo-300' : ''" />
            自动连播
          </button>

          <!-- 上下集：靠右 -->
          <div v-if="episodes.length" class="ml-auto flex items-center gap-2">
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