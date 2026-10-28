<script setup lang="ts">
import type { VodItem } from "../api";

defineProps<{ item: VodItem }>();
</script>

<template>
  <RouterLink :to="`/detail/${item.vod_id}`"
    class="group block card glass-hover hover:-translate-y-1.5 duration-300 ease-out">
    <div class="relative aspect-[3/4] overflow-hidden bg-white/5">
      <img v-if="item.vod_pic" :src="item.vod_pic" :alt="item.vod_name" loading="lazy"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        referrerpolicy="no-referrer" />
      <div v-else class="w-full h-full flex items-center justify-center text-gray-600 text-xs">
        暂无封面
      </div>
      <span v-if="item.vod_remarks"
        class="absolute left-2 bottom-2 max-w-[calc(100%-1rem)] px-2 py-1 rounded-md text-[11px] leading-tight text-gray-100 bg-black/55 backdrop-blur-md ring-1 ring-white/15 truncate">
        {{ item.vod_remarks }}
      </span>
      <span
        class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-gradient-to-t from-black/70 via-black/25 to-transparent backdrop-blur-[2px]">
        <span
          class="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/40 flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(99,102,241,0.95)] scale-90 group-hover:scale-100 transition-transform duration-300">
          <span class="i-carbon-play-filled text-white text-lg" />
        </span>
      </span>
    </div>
    <div class="px-2 py-2">
      <p class="text-sm text-gray-100 truncate" :title="item.vod_name">
        {{ item.vod_name }}
      </p>
    </div>
  </RouterLink>
</template>
