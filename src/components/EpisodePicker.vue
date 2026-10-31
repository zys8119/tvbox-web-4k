<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

/**
 * 选集弹层：悬浮于播放器上，展示当前线路全部剧集供点选。
 * 必须放置在全屏容器（playerWrap）内部，保证进入全屏后依然可见可操作。
 */
defineProps<{
  episodes: { name: string; url: string }[];
  /** 当前播放剧集的 url，用于高亮 */
  currentUrl: string;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "select", url: string): void;
  (e: "close"): void;
}>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <!-- 右侧选集面板：非全屏时相对整个手机屏幕定位（position:fixed）。
       全屏时容器即全屏画面，fixed 同样铺满；顶部预留状态栏安全区（--sys-inset-top） -->
  <div class="ep-picker-open fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm" @click.self="emit('close')">
    <div class="ml-auto flex h-full w-1/2 min-w-0 flex-col border-l border-white/10 bg-[#0e1017] shadow-2xl"
      :style="{ paddingTop: 'var(--sys-inset-top, 0px)' }">
      <div class="flex items-center justify-between border-b border-white/5 px-4 py-3.5">
        <h3 class="text-sm font-medium">
          {{ title ?? "选集" }}
          <span class="ml-1 text-xs font-normal text-gray-500">{{ episodes.length }} 集</span>
        </h3>
        <button class="b-none btn text-xs px-2 py-1 bg-white/[0.05] hover:bg-white/[0.11] text-gray-300"
          @click="emit('close')">
          关闭
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="episodes.length" class="grid grid-cols-4 gap-2 sm:grid-cols-6">
          <button v-for="ep in episodes" :key="ep.url"
            class="b-none px-2 py-2 text-center text-xs rounded-lg truncate transition-all duration-200" :class="ep.url === currentUrl
              ? 'text-white bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_8px_22px_-10px_rgba(99,102,241,1)]'
              : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.11] hover:text-white'
              " :title="ep.name" @click="emit('select', ep.url)">
            {{ ep.name }}
          </button>
        </div>
        <p v-else class="py-8 text-center text-sm text-gray-500">暂无剧集</p>
      </div>
    </div>
  </div>
</template>