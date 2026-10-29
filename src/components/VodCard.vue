<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import type { VodItem } from "../api";
import { cleanPicUrl } from "../utils/pic";

const props = withDefaults(defineProps<{ item: VodItem; site?: string }>(), {
  site: "",
});

/** 传入 site 时跳转站点详情（site-detail），否则走站内 /detail/:id */
const to = computed<RouteLocationRaw>(() =>
  props.site
    ? {
      name: "site-detail",
      query: { site: props.site, id: props.item.vod_id, name: props.item.vod_name },
    }
    : { path: `/detail/${props.item.vod_id}` },
);
</script>

<template>
  <RouterLink :to="to" class="group block card glass-hover hover:-translate-y-1.5 duration-300 ease-out">
    <div class="relative aspect-[3/4] overflow-hidden bg-white/5">
      <img v-if="item.vod_pic" :src="cleanPicUrl(item.vod_pic)" :alt="item.vod_name" loading="lazy"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        referrerpolicy="no-referrer" />
      <div v-else class="w-full h-full flex items-center justify-center text-gray-600 text-xs">
        暂无封面
      </div>
      <span v-if="item.vod_remarks"
        class="absolute left-2 bottom-2 max-w-[calc(100%-1rem)] px-2 py-1 rounded-md text-[11px] leading-tight text-gray-100 bg-black/65 backdrop-blur-md truncate">
        {{ item.vod_remarks }}
      </span>
      <span
        class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-gradient-to-t from-black/70 via-black/25 to-transparent backdrop-blur-[2px]">
        <span
          class="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(99,102,241,0.95)] scale-90 group-hover:scale-100 transition-transform duration-300">
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
