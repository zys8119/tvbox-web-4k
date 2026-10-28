<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchHome, fetchHomeVideo, type ClassItem, type VodItem } from "../api";
import VodGrid from "../components/VodGrid.vue";

const classes = ref<ClassItem[]>([]);
const recommends = ref<VodItem[]>([]);
const loading = ref(true);
const error = ref("");
const hero = ref<VodItem | null>(null);

onMounted(async () => {
  try {
    const [home, video] = await Promise.all([fetchHome(), fetchHomeVideo()]);
    classes.value = home.class;
    recommends.value = video.list;
    hero.value = video.list[0] ?? null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="page-wrap py-5">
    <!-- 顶部推荐位 -->
    <section
      v-if="hero"
      class="relative rounded-2xl overflow-hidden mb-8 min-h-[240px] md:min-h-[320px] flex items-end"
    >
      <img
        :src="hero.vod_pic"
        class="absolute inset-0 w-full h-full object-cover scale-105 blur-[1px]"
        referrerpolicy="no-referrer"
      />
      <div
        class="absolute inset-0 bg-gradient-to-r from-[#0b0c10] via-[#0b0c10]/80 to-transparent"
      />
      <div class="relative p-5 md:p-8 max-w-2xl">
        <p class="text-xs text-indigo-300 mb-2">今日推荐</p>
        <h1 class="text-2xl md:text-4xl font-bold mb-2 line-clamp-1">
          {{ hero.vod_name }}
        </h1>
        <p class="text-sm text-gray-300 mb-4 line-clamp-2">
          {{ hero.vod_remarks || "高清在线播放" }}
        </p>
        <RouterLink :to="`/detail/${hero.vod_id}`" class="btn-primary inline-flex items-center gap-2">
          <span class="i-carbon-play-filled" />
          立即观看
        </RouterLink>
      </div>
    </section>

    <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

    <!-- 分类快捷入口 -->
    <section v-if="classes.length" class="mb-8">
      <h2 class="text-lg font-semibold mb-3">分类</h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="c in classes"
          :key="c.type_id"
          :to="`/category/${c.type_id}`"
          class="px-4 py-2 rounded-lg bg-white/5 hover:bg-indigo-500/80 text-sm transition-colors"
        >
          {{ c.type_name }}
        </RouterLink>
      </div>
    </section>

    <!-- 推荐列表 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">最新推荐</h2>
      <VodGrid :list="recommends" :loading="loading" :skeleton="14" />
      <p
        v-if="!loading && !recommends.length"
        class="text-center text-gray-500 py-16"
      >
        暂无推荐数据
      </p>
    </section>
  </div>
</template>
