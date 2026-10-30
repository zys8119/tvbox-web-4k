<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

/**
 * 自定义播放器控制条（替代原生 controls）。
 *
 * 特性：
 * - 按钮化控制：播放/暂停、进度拖拽、音量、全屏；
 * - 显隐策略：鼠标悬浮时显示、闲置 2.6s 后自动隐藏、鼠标离开播放器立即隐藏（仅播放时），
 *   暂停时保持显示；全屏下鼠标活动立即显示、闲置自动隐藏；
 * - 键盘快捷键：Space/K 播放暂停，←/→ 快退/快进 5s，↑/↓ 音量，M 静音，F 全屏（输入框内不生效）；
 * - 全屏：对包含 video 的容器元素（wrap）请求全屏，控制条随容器一起全屏展示；
 * - 可插拔：通过 #top / #extras 插槽接入扩展按钮（片头片尾标记、自动连播、画面裁切等），
 *   第三方插件也可直接对 video 元素挂载（事件监听均附加在 video 元素上，互不冲突）。
 */
const props = defineProps<{
  /** 受控的 video 元素（响应式 ref，元素挂载后传入） */
  video: HTMLVideoElement | null;
  /** 包含 video 与控制条的全屏容器元素 */
  wrap: HTMLElement | null;
}>();

/** 插槽声明：#top / #extras（均可接收当前全屏状态） */
defineSlots<{
  top(props: { fs: boolean }): any;
  extras(props: { fs: boolean }): any;
}>();

const playing = ref(false);
const ready = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const buffered = ref(0);
const volume = ref(1);
const muted = ref(false);
const fs = ref(false);
const visible = ref(false);
/** 是否正在拖拽进度（拖拽时优先展示预览位置） */
const seeking = ref(false);
/** 拖拽预览位置（0..1） */
const seekPos = ref(0);

const barEl = ref<HTMLDivElement | null>(null);

let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** 当前播放进度比例（0..1），拖拽预览优先 */
const played = computed(() => {
  if (seeking.value) return duration.value > 0 ? Math.min(1, Math.max(0, seekPos.value)) : 0;
  return duration.value > 0 ? Math.min(1, Math.max(0, currentTime.value / duration.value)) : 0;
});

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

/* ============================== 显隐控制 ============================== */

function poke() {
  visible.value = true;
  clearTimeout(hideTimer);
  if (playing.value) {
    hideTimer = setTimeout(() => {
      if (!seeking.value) visible.value = false;
    }, 2600);
  }
}

/* ============================== 播放/暂停/进度 ============================== */

function togglePlay() {
  const el = props.video;
  if (!el) return;
  if (el.paused) {
    el.play().catch(() => { });
  } else {
    el.pause();
  }
  poke();
}

/** 事件坐标 -> 进度条比例（0..1） */
function ratioFromEvent(e: PointerEvent): number {
  const bar = barEl.value;
  if (!bar) return 0;
  const r = bar.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
}

function onSeekDown(e: PointerEvent) {
  seeking.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  seekPos.value = ratioFromEvent(e);
  poke();
}

function onSeekMove(e: PointerEvent) {
  if (!seeking.value) return;
  seekPos.value = ratioFromEvent(e);
}

function onSeekUp() {
  if (!seeking.value) return;
  seeking.value = false;
  const el = props.video;
  if (el && Number.isFinite(el.duration) && el.duration > 0) {
    el.currentTime = seekPos.value * el.duration;
  }
  poke();
}

/* ============================== 音量 ============================== */

function onVolumeInput(e: Event) {
  const el = props.video;
  if (!el) return;
  const v = Number((e.target as HTMLInputElement).value);
  el.volume = v;
  el.muted = v === 0;
}

function toggleMute() {
  const el = props.video;
  if (!el) return;
  el.muted = !el.muted;
}

/* ============================== 全屏 ============================== */

function toggleFs() {
  const w = props.wrap;
  if (!w) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => { });
  } else {
    w.requestFullscreen().catch(() => { });
  }
}

function onFsChange() {
  fs.value = !!document.fullscreenElement;
  poke();
}

/* ============================== 容器鼠标事件 ============================== */

/** 鼠标在播放器内活动：立即显示控制条并进入闲置倒计时 */
function onWrapMove() {
  poke();
}

/** 鼠标离开播放器：播放中立即隐藏控制条（暂停时保持显示，便于点击播放） */
function onWrapLeave() {
  if (playing.value) {
    clearTimeout(hideTimer);
    visible.value = false;
  }
}

/* ============================== 键盘快捷键 ============================== */

/**
 * 全局播放快捷键：Space/K 播放暂停，←/→ 快退/快进 5s，↑/↓ 音量，M 静音，F 全屏。
 * 输入框/文本编辑态以及带修饰键（Ctrl/⌘/Alt）的按键不拦截。
 */
function onKeydown(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  const typing =
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable);
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const v = props.video;
  if (!v) return;
  const k = e.key.toLowerCase();
  switch (k) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "arrowleft":
      e.preventDefault();
      v.currentTime = Math.max(0, v.currentTime - 5);
      poke();
      break;
    case "arrowright":
      e.preventDefault();
      v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
      poke();
      break;
    case "arrowup":
      e.preventDefault();
      v.muted = false;
      v.volume = Math.min(1, v.volume + 0.1);
      volume.value = v.volume;
      muted.value = false;
      break;
    case "arrowdown":
      e.preventDefault();
      v.volume = Math.max(0, v.volume - 0.1);
      v.muted = v.volume === 0;
      volume.value = v.volume;
      muted.value = v.volume === 0;
      break;
    case "m":
      e.preventDefault();
      toggleMute();
      break;
    case "f":
      e.preventDefault();
      toggleFs();
      break;
  }
}

function onVideoClick() {
  togglePlay();
}

function onVideoDblClick() {
  toggleFs();
}

/* ============================== 事件挂载 ============================== */

function onTimeUpdate() {
  const el = props.video;
  if (!el) return;
  currentTime.value = el.currentTime;
  try {
    const b = el.buffered;
    if (b.length > 0) buffered.value = b.end(b.length - 1) / (el.duration || 1);
  } catch {
    /* 缓冲信息不可用时忽略 */
  }
}

function onLoadedMetadata() {
  const el = props.video;
  if (!el) return;
  duration.value = el.duration || 0;
  currentTime.value = el.currentTime || 0;
  volume.value = el.volume;
  muted.value = el.muted;
  ready.value = true;
  poke();
}

function onPlay() {
  playing.value = true;
  poke();
}

function onPause() {
  playing.value = false;
  clearTimeout(hideTimer);
  visible.value = true;
}

function onEnded_() {
  playing.value = false;
  visible.value = true;
}

function onReset() {
  ready.value = false;
  playing.value = false;
  currentTime.value = 0;
  duration.value = 0;
  buffered.value = 0;
  seeking.value = false;
  clearTimeout(hideTimer);
}

function attachEvents(el: HTMLVideoElement) {
  el.addEventListener("loadedmetadata", onLoadedMetadata);
  el.addEventListener("durationchange", onReset);
  el.addEventListener("emptied", onReset);
  el.addEventListener("timeupdate", onTimeUpdate);
  el.addEventListener("play", onPlay);
  el.addEventListener("pause", onPause);
  el.addEventListener("ended", onEnded_);
  el.addEventListener("click", onVideoClick);
  el.addEventListener("dblclick", onVideoDblClick);
}

function detachEvents(el: HTMLVideoElement) {
  el.removeEventListener("loadedmetadata", onLoadedMetadata);
  el.removeEventListener("durationchange", onReset);
  el.removeEventListener("emptied", onReset);
  el.removeEventListener("timeupdate", onTimeUpdate);
  el.removeEventListener("play", onPlay);
  el.removeEventListener("pause", onPause);
  el.removeEventListener("ended", onEnded_);
  el.removeEventListener("click", onVideoClick);
  el.removeEventListener("dblclick", onVideoDblClick);
}

watch(
  () => props.video,
  (el, old) => {
    if (old && old !== el) {
      detachEvents(old);
      onReset();
    }
    if (el) attachEvents(el);
  },
  { immediate: true },
);

watch(
  () => props.wrap,
  (w, old) => {
    if (old) {
      old.removeEventListener("mousemove", onWrapMove);
      old.removeEventListener("mouseleave", onWrapLeave);
    }
    if (w) {
      w.addEventListener("mousemove", onWrapMove);
      w.addEventListener("mouseleave", onWrapLeave);
    }
  },
  { immediate: true },
);

document.addEventListener("fullscreenchange", onFsChange);
document.addEventListener("keydown", onKeydown);

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", onFsChange);
  document.removeEventListener("keydown", onKeydown);
  if (props.video) detachEvents(props.video);
  if (props.wrap) {
    props.wrap.removeEventListener("mousemove", onWrapMove);
    props.wrap.removeEventListener("mouseleave", onWrapLeave);
  }
  clearTimeout(hideTimer);
});
</script>

<template>
  <div v-if="video && ready" class="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
    :class="visible ? 'opacity-100' : 'opacity-0'">
    <!-- 顶部渐变条：右侧插槽（片头片尾标记 / 第三方扩展按钮等） -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end p-3 bg-gradient-to-b from-black/50 to-transparent transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'">
      <div class="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
        <slot name="top" :fs="fs" />
      </div>
    </div>

    <!-- 暂停时中央播放按钮 -->
    <button v-if="!playing"
      class="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 hover:scale-105 transition-all"
      title="播放" @click="togglePlay">
      <span class="i-carbon-play-filled text-3xl ml-1" />
    </button>

    <!-- 底部控制条 -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2 pt-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'">
      <div class="flex items-center gap-2.5">
        <!-- 播放/暂停 -->
        <button
          class="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 active:scale-95 transition-all"
          :title="playing ? '暂停' : '播放'" @click="togglePlay">
          <span :class="playing ? 'i-carbon-pause text-lg' : 'i-carbon-play-filled text-lg ml-0.5'" />
        </button>

        <!-- 进度条（点击/拖拽定位） -->
        <div ref="barEl" class="pointer-events-auto group/bar relative flex h-4 flex-1 cursor-pointer items-center py-2"
          @pointerdown="onSeekDown" @pointermove="onSeekMove" @pointerup="onSeekUp" @pointercancel="onSeekUp">
          <div
            class="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-all group-hover/bar:h-1.5 group-active/bar:h-1.5">
            <div class="absolute inset-y-0 left-0 bg-white/30" :style="{ width: buffered * 100 + '%' }" />
            <div class="absolute inset-y-0 left-0 bg-indigo-400" :style="{ width: played * 100 + '%' }">
              <span
                class="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
            </div>
          </div>
        </div>

        <!-- 时间 -->
        <span class="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-white/85">
          {{ fmtTime(currentTime) }} / {{ fmtTime(duration) }}
        </span>

        <!-- 扩展按钮插槽（第三方插件/自动连播/裁切/切集等） -->
        <slot name="extras" :fs="fs" />

        <!-- 音量 -->
        <div class="pointer-events-auto hidden shrink-0 items-center gap-1.5 sm:flex">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            :title="muted || volume === 0 ? '取消静音' : '静音'" @click="toggleMute">
            <span :class="muted || volume === 0 ? 'i-carbon-volume-mute text-base' : 'i-carbon-volume-up text-base'" />
          </button>
          <input type="range" min="0" max="1" step="0.05" class="w-16 accent-indigo-500" :value="muted ? 0 : volume"
            @input="onVolumeInput" :title="'音量 ' + Math.round((muted ? 0 : volume) * 100) + '%'" />
        </div>

        <!-- 全屏 -->
        <button
          class="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/10 hover:text-white transition-colors"
          :title="fs ? '退出全屏' : '全屏'" @click="toggleFs">
          <span :class="fs ? 'i-carbon-minimize text-base' : 'i-carbon-maximize text-base'" />
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* 全屏容器：去掉圆角与阴影，避免全屏时的边缘残留 */
.vc-wrap-fullscreen:fullscreen {
  border-radius: 0 !important;
  box-shadow: none !important;
}
</style>