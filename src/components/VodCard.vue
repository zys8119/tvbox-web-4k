<script setup lang="ts">
import type { VodItem } from "../api";

defineProps<{ item: VodItem }>();
</script>

<template>
  <RouterLink
    :to="`/detail/${item.vod_id}`"
    class="group block card ring-1 ring-white/5 hover:ring-indigo-400/50 transition-all duration-200 hover:-translate-y-1"
  >
    <div class="relative aspect-[3/4] overflow-hidden bg-white/5">
      <img
        v-if="item.vod_pic"
        :src="item.vod_pic"
        :alt="item.vod_name"
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        referrerpolicy="no-referrer"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-gray-600 text-xs"
      >
        暂无封面
      </div>
      <span
        v-if="item.vod_remarks"
        class="absolute left-0 right-0 bottom-0 px-2 py-1.5 text-[11px] leading-tight bg-gradient-to-t from-black/90 to-transparent text-gray-200 truncate"
      >
        {{ item.vod_remarks }}
      </span>
      <span
        class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
      >
        <span class="w-11 h-11 rounded-full bg-indigo-500/90 flex items-center justify-center">
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
