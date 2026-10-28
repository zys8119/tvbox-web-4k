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
      class="group relative rounded-3xl overflow-hidden mb-10 min-h-[260px] md:min-h-[360px] flex items-end ring-1 ring-white/10 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)]"
    >
      <img
        :src="hero.vod_pic"
        class="absolute inset-0 w-full h-full object-cover scale-110 blur-[2px] brightness-[0.75] transition-transform duration-[1200ms] ease-out group-hover:scale-[1.14]"
        referrerpolicy="no-referrer"
      />
      <div
        class="absolute inset-0 bg-gradient-to-r from-[#0a0b0f] via-[#0a0b0f]/78 to-transparent"
      />
      <div
        class="absolute inset-0 bg-gradient-to-t from-[#0a0b0f] via-transparent to-transparent"
      />
      <div class="relative p-6 md:p-10 max-w-2xl">
        <p
          class="inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase text-indigo-300 mb-3 px-2.5 py-1 rounded-full bg-indigo-500/15 ring-1 ring-indigo-400/30 backdrop-blur-md">
          <span class="i-carbon-star-filled text-[10px]" />
          今日推荐
        </p>
        <h1
          class="text-2xl md:text-4xl font-bold mb-3 line-clamp-1 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
        >
          {{ hero.vod_name }}
        </h1>
        <p class="text-sm text-gray-300/90 mb-6 line-clamp-2 max-w-xl">
          {{ hero.vod_remarks || "高清在线播放" }}
        </p>
        <RouterLink :to="`/detail/${hero.vod_id}`" class="btn-primary">
          <span class="i-carbon-play-filled" />
          立即观看
        </RouterLink>
      </div>
    </section>

    <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

    <!-- 分类快捷入口 -->
    <section v-if="classes.length" class="mb-10">
      <h2 class="section-title mb-4">
        <span class="title-bar" />
        分类
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="c in classes"
          :key="c.type_id"
          :to="`/category/${c.type_id}`"
          class="chip chip-idle"
        >
          {{ c.type_name }}
        </RouterLink>
      </div>
    </section>

    <!-- 推荐列表 -->
    <section>
      <h2 class="section-title mb-4">
        <span class="title-bar" />
        最新推荐
      </h2>
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
