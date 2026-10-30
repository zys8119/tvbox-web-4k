<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capgo/capacitor-screen-orientation";
import { hideSystemBars, showSystemBars } from "../capacitor";

/** 当前是否为原生平台（App 模式）：改变画面点击/双击交互语义 */
const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * 自定义播放器控制条（替代原生 controls）。
 *
 * 特性：
 * - 按钮化控制：播放/暂停、进度拖拽、音量、倍速（1x/1.5x/1.7x/2x/2.5x/2.7x/3x/4x/5x）、全屏；
 * - 显隐策略：鼠标悬浮时显示、闲置 2.6s 后自动隐藏、鼠标离开播放器立即隐藏（仅播放时），
 *   暂停时保持显示；全屏下鼠标活动立即显示、闲置自动隐藏；
 * - 键盘快捷键：Space/K 播放暂停，←/→ 快退/快进 5s（长按持续快退/快进），↑/↓ 音量，M 静音，F 全屏（输入框内不生效）；
 * - 中心 OSD：音量、进度、倍速变化时视频中心临时显示当前数值，操作停止后自动消失；
 * - 全屏：对包含 video 的容器元素（wrap）请求全屏，控制条随容器一起全屏展示；
 * - 可插拔：通过 #top / #extras 插槽接入扩展按钮（片头片尾标记、自动连播、画面裁切、选集等），
 *   第三方插件也可直接对 video 元素挂载（事件监听均附加在 video 元素上，互不冲突）。
 */
const props = defineProps<{
  /** 受控的 video 元素（响应式 ref，元素挂载后传入） */
  video: HTMLVideoElement | null;
  /** 包含 video 与控制条的全屏容器元素 */
  wrap: HTMLElement | null;
}>();

/** 插槽声明：#title（左侧标题）/ #top / #extras（均可接收当前全屏状态） */
defineSlots<{
  title(props: { fs: boolean }): any;
  top(props: { fs: boolean }): any;
  extras(props: { fs: boolean }): any;
}>();

/** 事件：全屏状态下点击左上角返回键（由父页面退出全屏并返回上一页） */
const emit = defineEmits<{ (e: "back"): void }>();

/** 触摸手势状态：触摸画面滑动控制快进/快退（水平）与音量（垂直） */
let gesture:
  | {
    startX: number;
    startY: number;
    /** 方向锁定：h=水平(进度) / v=垂直(音量)，斜率超过阈值后锁定 */
    dir: "h" | "v" | null;
    /** 手势开始时的时间（秒）与音量，作为增量基准 */
    baseTime: number;
    baseVol: number;
    w: number;
    h: number;
    /** 画面已放大时单指拖动为平移可视区域（false 时才走快进/音量手势） */
    pan: boolean;
    startOffsetX: number;
    startOffsetY: number;
  }
  | null = null;
/** 到该时间戳为止忽略 click（滑动后释放产生的 click 不触发播放暂停） */
let suppressClickUntil = 0;

/* ---- App 模式单击/双击判定 ---- */

/** 单击判定窗口（毫秒）：窗口内再次点击视为双击 */
const TAP_TIMEOUT = 250;
/** 单击延迟确认计时器（App 模式：单击延迟后切换控制条显隐，双击取消该动作） */
let tapTimer: ReturnType<typeof setTimeout> | undefined;
/** 上一次点击时间戳，用于双击判定 */
let lastTapAt = 0;

/** 视频画面缩放：scale 1..4，scale > 1 时单指拖动为平移可视区域 */
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const SCALE_MIN = 1;
const SCALE_MAX = 4;
/** 双指缩放手势状态（双指同时触下后开始，单指手势让位） */
let pinch:
  | {
    startDist: number;
    startScale: number;
    startOffsetX: number;
    startOffsetY: number;
  }
  | null = null;

/** 将缩放/平移应用到 video 元素（origin 居中，scale 保持中心点不动） */
function applyTransform(el: HTMLVideoElement | null, animate = false) {
  if (!el) return;
  el.style.transition = animate ? "transform 0.25s ease" : "none";
  el.style.transform = `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`;
}

/** 双指缩放：以手势中点（屏幕坐标）为锚点缩放，画面跟随手指移动 */
function handlePinchMove(e: TouchEvent) {
  if (!pinch || e.touches.length < 2) return;
  e.preventDefault();
  poke();
  const el = props.video;
  if (!el) return;
  const t1 = e.touches[0];
  const t2 = e.touches[1];
  const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const ns = Math.min(
    SCALE_MAX,
    Math.max(SCALE_MIN, pinch.startScale * (pinch.startDist > 0 ? dist / pinch.startDist : 1)),
  );
  const midX = (t1.clientX + t2.clientX) / 2;
  const midY = (t1.clientY + t2.clientY) / 2;
  const w = el.clientWidth;
  const h = el.clientHeight;
  // 反推未变换前的布局中心：当前 rect 中心减去已有 offset（transform 中心缩放不改变中心）
  const rect = el.getBoundingClientRect();
  const baseCX = rect.left + rect.width / 2 - offsetX.value;
  const baseCY = rect.top + rect.height / 2 - offsetY.value;
  // 锚定手势中点不动：offset' = (g - baseC)*(1 - k) + offset，k = ns / pinch.startScale
  const k = pinch.startScale > 0 ? ns / pinch.startScale : ns;
  let ox = (midX - baseCX) * (1 - k) + pinch.startOffsetX;
  let oy = (midY - baseCY) * (1 - k) + pinch.startOffsetY;
  // 限制平移范围：内容放大部分允许的最大位移
  const rx = (w * ns - w) / 2;
  const ry = (h * ns - h) / 2;
  ox = Math.max(-rx, Math.min(rx, ox));
  oy = Math.max(-ry, Math.min(ry, oy));
  scale.value = ns;
  offsetX.value = ox;
  offsetY.value = oy;
  applyTransform(el);
  showOsd(`${Math.round(ns * 100)}%`);
}

const playing = ref(false);
const ready = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const buffered = ref(0);
const volume = ref(1);
const muted = ref(false);
const fs = ref(false);
const visible = ref(false);
/** 控件锁定（app 防误触）：锁定后控制条隐藏、画面点击/手势全部失效，仅中央解锁按钮可操作 */
const locked = ref(false);
/** 控制条是否应展示：未锁定且显隐状态为真 */
const showBars = computed(() => visible.value && !locked.value);
/** 是否正在拖拽进度（拖拽时优先展示预览位置） */
const seeking = ref(false);
/** 拖拽预览位置（0..1） */
const seekPos = ref(0);
/** 拖拽进度前视频是否在播放（拖拽结束后恢复） */
const wasPlaying = ref(false);
/** 拖拽中实时显示的时间点（秒） */
const dragTime = ref(0);
/** 拖拽中捕获的关键帧预览图（dataURL；跨域受限或内容异常时为空） */
const previewImg = ref("");
/** 关键帧预览是否可用（捕获失败自动关闭，仅保留时间点显示） */
const previewOk = ref(true);
/** 预览浮层水平位置（clamp 防止贴边溢出） */
const thumbLeft = computed(() => `${Math.min(86, Math.max(14, seekPos.value * 100))}%`);

const barEl = ref<HTMLDivElement | null>(null);

/** 播放倍速档位：点击循环切换 */
const RATES = [1, 1.5, 1.7, 2, 2.5, 2.7, 3, 4, 5] as const;
/** 当前倍速 */
const rate = ref<number>(1);

/** 视频中心临时提示（音量/进度/倍速变化时显示，停止操作后自动消失） */
const osdText = ref("");
const osdVisible = ref(false);

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let osdTimer: ReturnType<typeof setTimeout> | undefined;
/** 方向键长按持续快进/快退的状态 */
let seekHold: "left" | "right" | null = null;
let seekTimer: ReturnType<typeof setInterval> | undefined;
/** 关键帧捕获画布（惰性创建，320x180） */
let thumbCanvas: HTMLCanvasElement | null = null;
/** 是否正在执行捕获态跳转（同一时刻仅允许一次） */
let previewSeekBusy = false;
/** 上一次实际应用的捕获时间点（秒） */
let lastPreviewApplied = -1;
/** 拖拽期间最新的目标时间点 */
const previewTarget = { t: 0 };

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

/* ============================== 中心 OSD 提示 ============================== */

/** 在视频中心临时提示数值，操控停止后（900ms）自动消失 */
function showOsd(text: string) {
  osdText.value = text;
  osdVisible.value = true;
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => {
    osdVisible.value = false;
  }, 900);
}

/** 按增量（秒）跳转进度并提示当前时间；负数表示快退 */
function seekBy(delta: number) {
  const el = props.video;
  if (!el) return;
  el.currentTime = Math.min(Math.max(0, el.currentTime + delta), el.duration || 0);
  showOsd(fmtTime(el.currentTime));
}

/** 方向键长按：开始持续快进/快退（间隔 200ms） */
function beginSeekHold(dir: "left" | "right") {
  seekHold = dir;
  seekBy(dir === "left" ? -5 : 5);
  clearInterval(seekTimer);
  seekTimer = setInterval(() => seekBy(dir === "left" ? -5 : 5), 200);
}

function endSeekHold(dir: "left" | "right") {
  if (seekHold !== dir) return;
  seekHold = null;
  clearInterval(seekTimer);
  seekTimer = undefined;
}

function stopSeekHold() {
  seekHold = null;
  clearInterval(seekTimer);
  seekTimer = undefined;
}

/** 循环切换播放倍速：1x / 1.5x / 1.7x / 2x / 2.5x / 2.7x / 3x / 4x / 5x */
function cycleRate() {
  const el = props.video;
  if (!el) return;
  const i = RATES.indexOf(rate.value as (typeof RATES)[number]);
  rate.value = RATES[(i + 1) % RATES.length];
  el.playbackRate = rate.value;
  showOsd(`倍速 ${rate.value}x`);
}

/* ============================== 倍速下拉 ============================== */

/** 倍速下拉是否展开（悬浮展开，点击选项直接切换） */
const rateOpen = ref(false);
let rateOpenTimer: ReturnType<typeof setTimeout> | undefined;

/** 直接设置指定倍速 */
function setRate(r: (typeof RATES)[number]) {
  const el = props.video;
  if (!el) return;
  rate.value = r;
  el.playbackRate = r;
  showOsd(`倍速 ${r}x`);
  rateOpen.value = false;
}

/** 悬浮在倍速控件上：展开全部档位（微延迟，避免误触） */
function openRate() {
  clearTimeout(rateOpenTimer);
  rateOpenTimer = setTimeout(() => {
    rateOpen.value = true;
  }, 200);
}

/** 离开倍速控件：收起下拉 */
function closeRate() {
  clearTimeout(rateOpenTimer);
  rateOpen.value = false;
}

/** 暂停时中央播放按钮在锁定态下也由解锁按钮替代，播放键同样隐藏 */
function toggleLock() {
  locked.value = !locked.value;
  if (locked.value) {
    // 锁定：立即收起控制条与暂停态提示
    clearTimeout(hideTimer);
    visible.value = false;
  } else {
    poke();
  }
}

/* ============================== 显隐控制 ============================== */

function poke() {
  visible.value = true;
  clearTimeout(hideTimer);
  // App 全屏：控制层持久显示（触摸端无悬停语义，显示/隐藏由单击画面切换）；
  // 其余场景（浏览器 / 非全屏）保持闲置 2.6s 自动隐藏
  if (playing.value && !(IS_NATIVE && fs.value)) {
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
  const el = props.video;
  if (el) {
    // 冻结播放态：拖拽期间暂停以便稳定捕获关键帧，结束后按原状态恢复
    wasPlaying.value = !el.paused;
    el.pause();
  }
  requestPreview();
  poke();
}

function onSeekMove(e: PointerEvent) {
  if (!seeking.value) return;
  seekPos.value = ratioFromEvent(e);
  requestPreview();
}

/* ============================== 拖拽关键帧预览 / 实时时间点 ============================== */

/** 取 video 当前帧绘制到缩略图画布（cover 居中裁切）；跨域受限等异常则关闭预览能力 */
function capturePreviewFrame() {
  const el = props.video;
  if (!el) return;
  try {
    if (!thumbCanvas) {
      thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 320;
      thumbCanvas.height = 180;
    }
    const ctx = thumbCanvas.getContext("2d");
    if (!ctx || el.videoWidth <= 0 || el.videoHeight <= 0) return;
    const scale = Math.max(thumbCanvas.width / el.videoWidth, thumbCanvas.height / el.videoHeight);
    const dw = el.videoWidth * scale;
    const dh = el.videoHeight * scale;
    ctx.drawImage(el, (thumbCanvas.width - dw) / 2, (thumbCanvas.height - dh) / 2, dw, dh);
    previewImg.value = thumbCanvas.toDataURL("image/jpeg", 0.72);
  } catch {
    // canvas 被跨域污染（SecurityError）等情况：关闭预览，仅保留时间点显示
    previewOk.value = false;
    previewImg.value = "";
  }
}

/** 拖拽期间按 seekPos 请求捕获关键帧（节流：一次 capture seek 进行中则跳过，seeked 后追帧） */
function requestPreview() {
  const el = props.video;
  if (!el || !seeking.value) return;
  const dur = el.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  dragTime.value = Math.min(Math.max(0, seekPos.value * dur), dur);
  if (!previewOk.value) return;
  if (Math.abs(dragTime.value - lastPreviewApplied) < 0.1) return;
  previewTarget.t = dragTime.value;
  if (previewSeekBusy) return;
  previewSeekBusy = true;
  lastPreviewApplied = dragTime.value;
  el.currentTime = dragTime.value;
}

/** seeked：捕获当前帧；拖拽期间目标在持续移动时继续追帧，实现连续预览 */
function onSeeked() {
  if (!seeking.value || !previewOk.value) return;
  const el = props.video;
  if (!el) return;
  capturePreviewFrame();
  previewSeekBusy = false;
  if (seeking.value && Math.abs(previewTarget.t - lastPreviewApplied) >= 0.1) {
    previewSeekBusy = true;
    lastPreviewApplied = previewTarget.t;
    el.currentTime = previewTarget.t;
  }
}

function onSeekUp() {
  if (!seeking.value) return;
  seeking.value = false;
  const el = props.video;
  if (el && Number.isFinite(el.duration) && el.duration > 0) {
    el.currentTime = seekPos.value * el.duration;
    if (wasPlaying.value) el.play().catch(() => { });
    showOsd(fmtTime(el.currentTime));
  }
  previewImg.value = "";
  previewSeekBusy = false;
  lastPreviewApplied = -1;
  poke();
}

/* ============================== 音量 ============================== */

function onVolumeInput(e: Event) {
  const el = props.video;
  if (!el) return;
  const v = Number((e.target as HTMLInputElement).value);
  el.volume = v;
  el.muted = v === 0;
  volume.value = v;
  muted.value = v === 0;
  showOsd(el.muted ? "静音" : `音量 ${Math.round(v * 100)}%`);
}

function toggleMute() {
  const el = props.video;
  if (!el) return;
  el.muted = !el.muted;
  muted.value = el.muted;
  showOsd(el.muted ? "静音" : `音量 ${Math.round(el.volume * 100)}%`);
}

/* ============================== 全屏 ============================== */

/** Screen Orientation API 的 lock/unlock 为实验性接口，不在标准 lib.dom 中（仅 Web 降级用） */
interface ScreenOrientationExt extends ScreenOrientation {
  lock(orientation: "landscape" | "portrait"): Promise<void>;
  unlock(): void;
}

/**
 * 锁横屏并感应重力：原生平台调用 Capacitor 插件（对应 Android
 * SCREEN_ORIENTATION_SENSOR_LANDSCAPE，允许 0°/180° 双向跟随重力）；
 * Web 环境降级使用 screen.orientation.lock（部分浏览器仍支持）。
 */
async function lockLandscape() {
  try {
    if (Capacitor.isNativePlatform()) {
      await ScreenOrientation.lock({ orientation: "landscape" });
    } else {
      const so = screen.orientation as ScreenOrientationExt | null;
      if (so && typeof so.lock === "function") {
        await so.lock("landscape").catch(() => { /* 部分环境不支持，忽略 */ });
      }
    }
  } catch {
    /* 忽略 */
  }
}

/**
 * 退出全屏：恢复竖屏模式。App 为竖屏界面，原生平台调用插件锁定 portrait
 * （SENSOR_PORTRAIT，0°/180° 跟随重力）；Web 环境解除方向锁定即可。
 */
async function restorePortrait() {
  try {
    if (Capacitor.isNativePlatform()) {
      await ScreenOrientation.lock({ orientation: "portrait" });
    } else {
      const so = screen.orientation as ScreenOrientationExt | null;
      if (so && typeof so.unlock === "function") so.unlock();
    }
  } catch {
    /* 忽略 */
  }
}

function toggleFs() {
  const w = props.wrap;
  if (!w) return;
  if (document.fullscreenElement) {
    // 先恢复系统栏，再退出全屏，避免退出瞬间界面跳动
    showSystemBars();
    document.exitFullscreen().catch(() => { });
  } else {
    // 先隐藏系统栏，再进入全屏：规避 WebView custom view 切换瞬间系统重显状态栏
    hideSystemBars();
    w.requestFullscreen().then(lockLandscape).catch(() => { });
  }
}

/**
 * 复位画面缩放/平移（退出全屏、切换视频时调用）。
 * 注：系统栏沉浸（edge-to-edge 透明悬浮）由原生层 MainActivity 全局配置，
 * 全屏/退出全屏均无需前端干预。
 */
function resetZoom() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  applyTransform(props.video, true);
}

function onFsChange() {
  const isFs = !!document.fullscreenElement;
  fs.value = isFs;
  if (isFs) {
    lockLandscape();
    // 全屏播放：隐藏系统菜单栏（状态栏 + 导航栏），画面铺满整个屏幕
    hideSystemBars();
  } else {
    restorePortrait();
    resetZoom();
    // 退出全屏：恢复系统菜单栏显示
    showSystemBars();
  }
  poke();
}

/** 全屏左上角返回键：退出全屏并通知父页面返回上一页 */
function onBackClick() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  emit("back");
}

/* ============================== 下载 ============================== */

/**
 * 下载当前视频：直链（mp4 等）用 fetch 转 Blob 下载，文件名取资源名；
 * 流媒体（blob:/m3u8）无法直接下载，给出提示；跨域受限时降级为新窗口打开资源。
 */
function downloadVideo() {
  const el = props.video;
  if (!el) return;
  const src = el.currentSrc || el.src;
  if (!src) {
    showOsd("暂无下载地址");
    return;
  }
  if (src.startsWith("blob:") || /\.m3u8(\?.*)?$/i.test(src)) {
    showOsd("流媒体暂不支持直接下载");
    return;
  }
  const name = src.split("/").pop()?.split("?")[0] || "video";
  fetch(src)
    .then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showOsd("开始下载");
    })
    .catch(() => {
      // 跨域受限（如未带缓存头）：直接以新窗口打开，便于浏览器原生处理
      window.open(src, "_blank");
    });
}

/* ============================== 画中画 ============================== */

/** 当前是否处于画中画状态 */
const pipActive = ref(false);

function togglePip() {
  const el = props.video;
  if (!el) return;
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => { });
    return;
  }
  if (!document.pictureInPictureEnabled) {
    showOsd("当前浏览器不支持画中画");
    return;
  }
  // 画中画与全屏互斥：进入画中画前先退出全屏
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  el.requestPictureInPicture().catch(() => showOsd("画中画启动失败"));
}

function onEnterPip() {
  pipActive.value = true;
  poke();
}

function onLeavePip() {
  pipActive.value = false;
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

/* ============================== 触摸手势（移动端滑动控制） ============================== */

/** 水平滑动整个画面宽度对应的快进秒数（约 5 分钟，手感明显且可控） */
const GESTURE_FULL_WIDTH_SEC = 300;

function onTouchStart(e: TouchEvent) {
  if (locked.value) return;
  const el = props.video;
  const w = props.wrap;
  // 双指同时触下：进入双指缩放（让位于单指快进/音量手势）
  if (e.touches.length === 2) {
    gesture = null;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    pinch = {
      startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
      startScale: scale.value,
      startOffsetX: offsetX.value,
      startOffsetY: offsetY.value,
    };
    e.preventDefault();
    return;
  }
  if (pinch) return; // 缩放中，忽略额外单指
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  gesture = {
    startX: t.clientX,
    startY: t.clientY,
    dir: null,
    baseTime: el?.currentTime ?? 0,
    baseVol: el?.volume ?? 1,
    w: w?.clientWidth || el?.clientWidth || window.innerWidth,
    h: w?.clientHeight || el?.clientHeight || window.innerHeight,
    /** 画面已放大时单指拖动为平移可视区域 */
    pan: scale.value > 1,
    startOffsetX: offsetX.value,
    startOffsetY: offsetY.value,
  };
}

function onTouchMove(e: TouchEvent) {
  // 双指及以上：交由捏合缩放手势处理（平移/电量等单指手势让位）
  if (e.touches.length >= 2) {
    handlePinchMove(e);
    return;
  }
  if (!gesture || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - gesture.startX;
  const dy = t.clientY - gesture.startY;
  // 画面已放大：单指拖动为平移可视区域（仅在有放大余量时生效）
  if (gesture.pan) {
    e.preventDefault();
    poke();
    const el = props.video;
    if (!el) return;
    const rx = (el.clientWidth * scale.value - el.clientWidth) / 2;
    const ry = (el.clientHeight * scale.value - el.clientHeight) / 2;
    if (rx > 0 || ry > 0) {
      offsetX.value = Math.max(-rx, Math.min(rx, gesture.startOffsetX + dx));
      offsetY.value = Math.max(-ry, Math.min(ry, gesture.startOffsetY + dy));
      applyTransform(el);
    }
    return;
  }
  // 未锁定方向时按斜率判定，并设置 10px 起步阈值避免轻触误判
  if (!gesture.dir) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
    gesture.dir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    // 切换到滑动模式后，手势剩余位移基于起点绝对值计算
  }
  // 阻止页面滚动/缩放及滑动后的模拟 click
  e.preventDefault();
  poke();

  const el = props.video;
  if (!el) return;
  if (gesture.dir === "h") {
    // 水平滑动：按宽度比例映射快进/快退秒数（全宽 = 5 分钟），持续跳转并提示时间
    const delta = (dx / gesture.w) * GESTURE_FULL_WIDTH_SEC;
    const target = Math.min(
      Math.max(0, gesture.baseTime + delta),
      el.duration || 0,
    );
    currentTime.value = target;
    el.currentTime = target;
    // 显示 快进/快退 方向 + 时间
    showOsd(delta < -0.5 ? `快退 ${fmtTime(target)}` : `快进 ${fmtTime(target)}`);
  } else {
    // 垂直滑动：向上增大音量、向下减小（全高 = 120%），静音同步
    const ratio = dy / gesture.h;
    const v = Math.min(1, Math.max(0, gesture.baseVol - ratio * 1.2));
    el.volume = v;
    el.muted = v === 0;
    volume.value = v;
    muted.value = v === 0;
    showOsd(el.muted ? "静音" : `音量 ${Math.round(v * 100)}%`);
  }
}

function onTouchEnd() {
  // 发生过滑动：抑制随后产生的 click，避免误触发播放暂停
  if (gesture && gesture.dir) suppressClickUntil = Date.now() + 300;
  gesture = null;
  // 双指捏合结束（任一指离开）：复位捏合状态，后续单指回落为点击/平移
  pinch = null;
}

/* ============================== 键盘快捷键 ============================== */

/**
 * 全局播放快捷键：Space/K 播放暂停，←/→ 快退/快进 5s（长按持续），↑/↓ 音量（中心 OSD 提示），
 * M 静音，F 全屏。输入框/文本编辑态以及带修饰键（Ctrl/⌘/Alt）的按键不拦截。
 */
function onKeydown(e: KeyboardEvent) {
  // 控件锁定时不响应任何播放快捷键（防误触）
  if (locked.value) return;
  const el = e.target as HTMLElement | null;
  const typing =
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable);
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const v = props.video;
  if (!v) return;
  // 选集弹层打开时不响应播放快捷键（选集弹层自身处理 Esc 关闭）
  if (document.querySelector(".ep-picker-open")) return;
  const k = e.key.toLowerCase();
  switch (k) {
    case " ":
    case "k":
      e.preventDefault();
      togglePlay();
      break;
    case "arrowleft":
      e.preventDefault();
      if (!e.repeat) beginSeekHold("left");
      break;
    case "arrowright":
      e.preventDefault();
      if (!e.repeat) beginSeekHold("right");
      break;
    case "arrowup":
      e.preventDefault();
      v.muted = false;
      v.volume = Math.min(1, v.volume + 0.1);
      volume.value = v.volume;
      muted.value = false;
      showOsd(`音量 ${Math.round(v.volume * 100)}%`);
      break;
    case "arrowdown":
      e.preventDefault();
      v.volume = Math.max(0, v.volume - 0.1);
      v.muted = v.volume === 0;
      volume.value = v.volume;
      muted.value = v.volume === 0;
      showOsd(v.muted ? "静音" : `音量 ${Math.round(v.volume * 100)}%`);
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

/** 松开方向键：结束长按快进/快退 */
function onKeyup(e: KeyboardEvent) {
  const k = e.key.toLowerCase();
  if (k === "arrowleft") endSeekHold("left");
  else if (k === "arrowright") endSeekHold("right");
}

/** 窗口失焦：兜底结束长按，避免快进/快退持续执行 */
function onWindowBlur() {
  stopSeekHold();
}

/** 单击画面：切换控制条显示/隐藏（App 模式） */
function toggleBars() {
  if (visible.value) {
    clearTimeout(hideTimer);
    visible.value = false;
  } else {
    poke();
  }
}

function onVideoClick(e: MouseEvent) {
  // 控件锁定：画面点击无效（防误触）
  if (locked.value) return;
  // 仅当事件目标是 video 自身时才切换播放，避免经冒泡到达的点击误触
  if (e.target !== props.video) return;
  // 滑动手势结束后 300ms 内产生的 click 忽略（滑动已 handled）
  if (Date.now() < suppressClickUntil) return;
  // Web 模式（浏览器）：单击切换播放/暂停，维持原有交互
  if (!IS_NATIVE) {
    togglePlay();
    return;
  }
  // App 模式：250ms 内再次点击判为双击 → 播放/暂停；
  // 单次点击延迟确认后切换控制条显隐（避免双击误先隐藏控制条）
  const now = Date.now();
  if (now - lastTapAt < TAP_TIMEOUT) {
    clearTimeout(tapTimer);
    lastTapAt = 0;
    togglePlay();
    return;
  }
  lastTapAt = now;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => {
    lastTapAt = 0;
    toggleBars();
  }, TAP_TIMEOUT);
}

function onVideoDblClick(e: MouseEvent) {
  if (locked.value) return;
  if (e.target !== props.video) return;
  // App 模式：双击播放/暂停已由 click 时间窗口统一处理，此处避免二次触发
  if (IS_NATIVE) return;
  // Web 模式：双击全屏
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
  rate.value = el.playbackRate || 1;
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
  previewImg.value = "";
  previewSeekBusy = false;
  lastPreviewApplied = -1;
  // 切换视频/清空时复位画面缩放与平移
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  applyTransform(props.video);
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
  el.addEventListener("seeked", onSeeked);
  el.addEventListener("click", onVideoClick);
  el.addEventListener("dblclick", onVideoDblClick);
  // 触摸滑动（passive:false 以便阻止页面滚动/缩放）
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  el.addEventListener("enterpictureinpicture", onEnterPip);
  el.addEventListener("leavepictureinpicture", onLeavePip);
}

function detachEvents(el: HTMLVideoElement) {
  el.removeEventListener("loadedmetadata", onLoadedMetadata);
  el.removeEventListener("durationchange", onReset);
  el.removeEventListener("emptied", onReset);
  el.removeEventListener("timeupdate", onTimeUpdate);
  el.removeEventListener("play", onPlay);
  el.removeEventListener("pause", onPause);
  el.removeEventListener("ended", onEnded_);
  el.removeEventListener("seeked", onSeeked);
  el.removeEventListener("click", onVideoClick);
  el.removeEventListener("dblclick", onVideoDblClick);
  el.removeEventListener("touchstart", onTouchStart);
  el.removeEventListener("touchmove", onTouchMove);
  el.removeEventListener("touchend", onTouchEnd);
  el.removeEventListener("enterpictureinpicture", onEnterPip);
  el.removeEventListener("leavepictureinpicture", onLeavePip);
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
document.addEventListener("keyup", onKeyup);
window.addEventListener("blur", onWindowBlur);

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", onFsChange);
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("keyup", onKeyup);
  window.removeEventListener("blur", onWindowBlur);
  if (props.video) detachEvents(props.video);
  if (props.wrap) {
    props.wrap.removeEventListener("mousemove", onWrapMove);
    props.wrap.removeEventListener("mouseleave", onWrapLeave);
  }
  // 卸载兜底：若停留横屏则恢复竖屏、若停留全屏则恢复系统菜单栏
  restorePortrait();
  showSystemBars();
  clearTimeout(hideTimer);
  clearTimeout(osdTimer);
  clearTimeout(rateOpenTimer);
  clearTimeout(tapTimer);
  stopSeekHold();
});
</script>

<template>
  <div v-if="video && ready" class="pointer-events-none absolute inset-0 z-10" @click.stop @dblclick.stop>
    <!-- 控制条整块：未锁定且显隐状态为真时展示（锁定/闲置时整体移除，避免残留可点击区域） -->
    <div v-show="showBars" class="absolute inset-0">
      <!-- 顶部渐变条：左侧标题（当前集名称）+ 右侧插槽（片头片尾标记 / 第三方扩展按钮等） -->
      <div
        class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 bg-gradient-to-b from-black/50 to-transparent">
        <div class="pointer-events-auto flex min-w-0 flex-1 items-center">
          <!-- 全屏状态下左上角返回键：退出全屏并返回上一页 -->
          <button v-if="fs"
            class="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30 active:scale-95 transition-all"
            title="退出全屏并返回" @click="onBackClick">
            <span class="i-carbon-arrow-left text-base" />
          </button>
          <slot name="title" :fs="fs" />
        </div>
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

      <!-- 视频中心临时提示：音量 / 进度 / 倍速变化时显示，停止操作后自动消失 -->
      <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div v-if="osdVisible"
          class="whitespace-nowrap rounded-xl bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm shadow-lg">
          {{ osdText }}
        </div>
      </div>

      <!-- 底部控制条 -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2 pt-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
        <div class="flex items-center gap-2.5">
          <!-- 播放/暂停 -->
          <button
            class="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30 active:scale-95 transition-all"
            :title="playing ? '暂停' : '播放'" @click="togglePlay">
            <span :class="playing ? 'i-carbon-pause text-lg' : 'i-carbon-play-filled text-lg ml-0.5'" />
          </button>

          <!-- 进度条（点击/拖拽定位；拖拽时实时预览时间点与关键帧） -->
          <div ref="barEl"
            class="pointer-events-auto group/bar relative flex h-4 flex-1 cursor-pointer items-center py-2"
            @pointerdown="onSeekDown" @pointermove="onSeekMove" @pointerup="onSeekUp" @pointercancel="onSeekUp">
            <!-- 拖拽实时浮层：当前时间点 + 关键帧预览（跨域受限时仅显示时间） -->
            <div v-if="seeking" :style="{ left: thumbLeft }"
              class="pointer-events-none absolute bottom-5 left-0 z-20 -translate-x-1/2 flex flex-col items-center gap-1 rounded-lg bg-black/85 px-2 py-1.5 shadow-xl">
              <img v-if="previewImg" :src="previewImg" alt=""
                class="h-[72px] w-[128px] rounded-md border border-white/15 object-cover" />
              <span class="text-[11px] font-medium tabular-nums text-white">{{ fmtTime(dragTime) }}</span>
            </div>
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

          <!-- 倍速：悬浮向上展开全部档位，点击直接切换（点击按钮本身仍可循环切换） -->
          <div class="pointer-events-auto relative shrink-0" @mouseenter="openRate" @mouseleave="closeRate">
            <div v-if="rateOpen"
              class="absolute bottom-full left-1/2 z-30 -translate-x-1/2 flex flex-col gap-0.5 rounded-xl border border-white/10 bg-[#0e1017]/95 p-1 pb-1.5 shadow-2xl backdrop-blur-sm">
              <button v-for="r in RATES" :key="r"
                class="b-none w-16 rounded-lg px-3 py-1 text-[11px] tabular-nums transition-colors"
                :class="r === rate ? 'bg-black/60 text-white' : 'text-gray-300 hover:bg-white/15 hover:text-white'"
                @click="setRate(r)">
                {{ r }}x
              </button>
            </div>
            <button
              class="w-10 rounded-full px-2 py-0.5 text-[11px] tabular-nums text-white/85 hover:bg-white/15 hover:text-white transition-colors"
              :title="`播放速度：当前 ${rate}x（悬浮展开选择，点击循环切换）`" @click="cycleRate">
              {{ rate }}x
            </button>
          </div>

          <!-- 扩展按钮插槽（第三方插件/自动连播/裁切/切集等） -->
          <div class="pointer-events-auto flex items-center gap-2.5">
            <slot name="extras" :fs="fs" />
          </div>

          <!-- 音量 -->
          <div class="pointer-events-auto hidden shrink-0 items-center gap-1.5 sm:flex">
            <button
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white transition-colors"
              :title="muted || volume === 0 ? '取消静音（快捷键 M）' : '静音（快捷键 M）'" @click="toggleMute">
              <span
                :class="muted || volume === 0 ? 'i-carbon-volume-mute text-base' : 'i-carbon-volume-up text-base'" />
            </button>
            <input type="range" min="0" max="1" step="0.05" class="w-16 accent-indigo-500" :value="muted ? 0 : volume"
              @input="onVolumeInput" :title="'音量 ' + Math.round((muted ? 0 : volume) * 100) + '%'" />
          </div>

          <!-- 下载 -->
          <button
            class="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white transition-colors"
            title="下载当前视频" @click="downloadVideo">
            <span class="i-carbon-download text-base" />
          </button>

          <!-- 画中画（视频脱离页面窗口置顶小窗播放，与全屏互斥） -->
          <button
            class="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
            :class="pipActive ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/15 hover:text-white'"
            :title="pipActive ? '退出画中画' : '画中画'" @click="togglePip">
            <span class="i-carbon-view-mode-2 text-base" />
          </button>

          <!-- 全屏 -->
          <button
            class="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white transition-colors"
            :title="fs ? '退出全屏' : '全屏'" @click="toggleFs">
            <span :class="fs ? 'i-carbon-minimize text-base' : 'i-carbon-maximize text-base'" />
          </button>

          <!-- 锁定播放控制（app 防误触）：锁定后控制条隐藏、画面交互全部失效 -->
          <button
            class="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white transition-colors"
            title="锁定播放控制" @click="toggleLock">
            <span class="i-carbon-locked text-base" />
          </button>
        </div>
      </div>
    </div>

    <!-- 控件锁定：画面中央唯一可交互的解锁按钮 -->
    <button v-if="locked"
      class="pointer-events-auto absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 hover:scale-105 transition-all"
      title="解除锁定" @click="toggleLock">
      <span class="i-carbon-locked text-2xl" />
    </button>
  </div>
</template>

<style>
/* 全屏容器：去掉圆角与阴影，避免全屏时的边缘残留 */
.vc-wrap-fullscreen:fullscreen {
  border-radius: 0 !important;
  box-shadow: none !important;
}
</style>