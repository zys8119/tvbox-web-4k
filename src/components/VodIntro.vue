<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { type VodDetail } from "../api";
import { cleanPicUrl } from "../utils/pic";
import { looksLikeHtml, sanitizeHtml } from "../utils/sanitize";

/**
 * 简介弹层：悬浮于播放器上展示影片详情（片名/封面/演职员/剧情简介）。
 * 交互与 EpisodePicker 对齐：相对视频容器定位、右侧半屏、遮罩/Esc 关闭，
 * 必须放置在全屏容器（playerWrap）内部，保证进入全屏后依然可见可操作。
 */
const props = defineProps<{
  detail: VodDetail;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

/** 主演展示文本：兼容字符串与字符串数组 */
const actorText = computed(() => {
  const a = props.detail.vod_actor;
  return Array.isArray(a) ? a.join(" / ") : a ?? "";
});

/** 剧情简介富文本判断与清洗 */
const introIsHtml = computed(() => looksLikeHtml(props.detail.vod_content));
const safeIntro = computed(() => sanitizeHtml(props.detail.vod_content));

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <!-- 右侧简介面板：相对视频容器定位，宽度为视频的一半、高度撑满，左侧遮罩点击关闭 -->
  <div class="ep-picker-open absolute inset-0 z-50 flex bg-black/50 backdrop-blur-sm" @click.self="emit('close')">
    <div class="ml-auto flex h-full w-1/2 min-w-0 flex-col border-l border-white/10 bg-[#0e1017] shadow-2xl">
      <div class="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <h3 class="truncate text-sm font-medium">{{ detail.vod_name || "影片简介" }}</h3>
        <button class="b-none btn text-xs px-2 py-1 shrink-0 ml-3 bg-white/[0.05] hover:bg-white/[0.11] text-gray-300"
          @click="emit('close')">关闭</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <div class="flex gap-4">
          <div v-if="detail.vod_pic" class="w-24 md:w-28 shrink-0">
            <div class="card aspect-[3/4] overflow-hidden rounded-lg shadow-lg">
              <img :src="cleanPicUrl(detail.vod_pic)" :alt="detail.vod_name" class="w-full h-full object-cover"
                referrerpolicy="no-referrer" loading="lazy" />
            </div>
          </div>
          <div class="min-w-0 space-y-2 text-sm">
            <div v-if="actorText" class="flex gap-2">
              <span class="shrink-0 text-gray-500">主演</span>
              <span class="line-clamp-2 text-gray-300/90">{{ actorText }}</span>
            </div>
            <div v-if="detail.vod_director" class="flex gap-2">
              <span class="shrink-0 text-gray-500">导演</span>
              <span class="truncate text-gray-300/90">{{ detail.vod_director }}</span>
            </div>
            <div v-if="detail.vod_year || detail.vod_area || detail.vod_remarks" class="flex flex-wrap gap-2">
              <span v-if="detail.vod_year" class="px-2 py-0.5 rounded-md bg-white/[0.07] text-gray-300">
                {{ detail.vod_year }}
              </span>
              <span v-if="detail.vod_area" class="px-2 py-0.5 rounded-md bg-white/[0.07] text-gray-300">
                {{ detail.vod_area }}
              </span>
              <span v-if="detail.vod_remarks" class="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">
                {{ detail.vod_remarks }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="detail.vod_content" class="mt-4">
          <h4 class="mb-2 text-xs font-medium text-gray-500">剧情简介</h4>
          <div v-if="introIsHtml" class="rich-text text-[13px] leading-6 text-gray-300/90"
            v-html="safeIntro" />
          <p v-else class="text-[13px] leading-6 text-gray-300/90 whitespace-pre-wrap">
            {{ detail.vod_content }}
          </p>
        </div>
        <p v-else class="mt-4 py-8 text-center text-sm text-gray-500">暂无简介</p>
      </div>
    </div>
  </div>
</template>