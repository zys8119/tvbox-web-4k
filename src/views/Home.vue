<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { fetchHome, fetchHomeVideo, type ClassItem, type VodItem } from "../api";
import VodGrid from "../components/VodGrid.vue";

const classes = ref<ClassItem[]>([]);
const recommends = ref<VodItem[]>([]);
const loading = ref(true);
const error = ref("");

/** 轮播推荐：取前 3 部 */
const heroes = ref<VodItem[]>([]);
const active = ref(0);

const current = computed<VodItem | null>(
  () => heroes.value[active.value] ?? null,
);

let timer: number | undefined;

function stopAuto() {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

/** 启动自动轮播（仅在多于 1 部时生效） */
function startAuto() {
  stopAuto();
  if (heroes.value.length < 2) return;
  timer = window.setInterval(() => {
    active.value = (active.value + 1) % heroes.value.length;
  }, 6000);
}

/** 跳转到指定项并重置计时 */
function go(i: number) {
  const n = heroes.value.length;
  if (!n) return;
  active.value = ((i % n) + n) % n;
  startAuto();
}

onMounted(async () => {
  try {
    const [home, video] = await Promise.all([fetchHome(), fetchHomeVideo()]);
    classes.value = home.class;
    recommends.value = video.list;
    heroes.value = video.list.slice(0, 3);
    startAuto();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(stopAuto);
</script>

<template>
  <div>
    <!-- 顶部推荐位：3 部轮播，铺满屏幕宽度 -->
    <section v-if="heroes.length"
      class="hero group relative w-full overflow-hidden min-h-[380px] md:min-h-[560px] bg-[#0a0b0f]"
      @mouseenter="stopAuto" @mouseleave="startAuto">
      <!-- 背景层：所有推荐图叠放，仅当前项可见 -->
      <div class="absolute inset-0">
        <img v-for="(h, i) in heroes" :key="h.vod_id" :src="h.vod_pic"
          class="absolute inset-0 w-full h-full object-cover blur-xl brightness-[0.55] transition-all duration-[1200ms] ease-out"
          :class="i === active
            ? 'opacity-100 scale-125'
            : 'opacity-0 scale-110'
            " :alt="h.vod_name" referrerpolicy="no-referrer" />
      </div>

      <!-- 渐变遮罩：左深右浅 + 底部融入页面底色 -->
      <div class="absolute inset-0 bg-gradient-to-r from-[#0a0b0f] via-[#0a0b0f]/75 to-transparent" />
      <div class="absolute inset-0 bg-gradient-to-t from-[#0a0b0f] via-[#0a0b0f]/20 to-transparent" />

      <!-- 内容层 -->
      <div class="relative page-wrap h-full min-h-[380px] md:min-h-[560px] flex flex-col justify-end pb-10 md:pb-16">
        <div class="flex items-end gap-6 md:gap-10">
          <!-- 左：文字信息 -->
          <div class="flex-1 min-w-0">
            <Transition name="hero-fade" mode="out-in">
              <div v-if="current" :key="current.vod_id" class="max-w-2xl">
                <p
                  class="inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase text-indigo-300 mb-3 px-2.5 py-1 rounded-full bg-indigo-500/20 backdrop-blur-md">
                  <span class="i-carbon-star-filled text-[10px]" />
                  今日推荐
                </p>
                <h1 class="text-2xl md:text-5xl font-bold mb-3 line-clamp-1 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                  {{ current.vod_name }}
                </h1>
                <p class="text-sm md:text-base text-gray-300/90 mb-6 line-clamp-2 max-w-xl">
                  {{ current.vod_remarks || "高清在线播放" }}
                </p>
                <div class="flex items-center gap-3">
                  <RouterLink :to="`/detail/${current.vod_id}`" class="btn-primary">
                    <span class="i-carbon-play-filled" />
                    立即观看
                  </RouterLink>
                  <RouterLink :to="`/detail/${current.vod_id}`"
                    class="b-none btn text-sm px-4 py-2 bg-white/[0.08] hover:bg-white/[0.16] text-gray-200">
                    查看详情
                  </RouterLink>
                </div>
              </div>
            </Transition>

            <!-- 指示器：序号 + 进度点 -->
            <div class="mt-8 flex items-center gap-4">
              <div class="flex items-center gap-2">
                <button v-for="(h, i) in heroes" :key="h.vod_id"
                  class="b-none relative h-1 rounded-full overflow-hidden transition-all duration-500" :class="i === active
                    ? 'w-10 bg-white/25'
                    : 'w-4 bg-white/15 hover:bg-white/30'
                    " :title="h.vod_name" @click="go(i)">
                  <span v-if="i === active"
                    class="absolute inset-0 bg-gradient-to-r from-indigo-400 to-violet-400 rounded-full" />
                </button>
              </div>
              <span class="text-[11px] text-gray-400 tabular-nums">
                {{ String(active + 1).padStart(2, "0") }} /
                {{ String(heroes.length).padStart(2, "0") }}
              </span>
            </div>
          </div>

          <!-- 右：清晰海报，完整显示不裁切 -->
          <Transition name="hero-fade" mode="out-in">
            <div v-if="current" :key="current.vod_id"
              class="hidden sm:block shrink-0 w-[170px] md:w-[230px] lg:w-[260px]">
              <RouterLink :to="`/detail/${current.vod_id}`" class="group/poster block">
                <div
                  class="rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,1)] ring-1 ring-white/10 transition-transform duration-500 ease-out hover:-translate-y-1">
                  <!-- object-contain：完整显示，不裁切 -->
                  <img :src="current.vod_pic" :alt="current.vod_name"
                    class="w-full h-auto max-h-[300px] md:max-h-[360px] object-contain bg-black/40"
                    referrerpolicy="no-referrer" />
                </div>
              </RouterLink>
            </div>
          </Transition>
        </div>
      </div>

      <!-- 左右切换 -->
      <button v-if="heroes.length > 1"
        class="b-none absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md text-white/80 hover:text-white hover:bg-black/55 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center"
        title="上一部" @click="go(active - 1)">
        <span class="i-carbon-chevron-left" />
      </button>
      <button v-if="heroes.length > 1"
        class="b-none absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 backdrop-blur-md text-white/80 hover:text-white hover:bg-black/55 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center"
        title="下一部" @click="go(active + 1)">
        <span class="i-carbon-chevron-right" />
      </button>
    </section>

    <div class="page-wrap py-6">
      <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

      <!-- 分类快捷入口 -->
      <section v-if="classes.length" class="mb-10">
        <h2 class="section-title mb-4">
          <span class="title-bar" />
          分类
        </h2>
        <div class="flex flex-wrap gap-2">
          <RouterLink v-for="c in classes" :key="c.type_id" :to="`/category/${c.type_id}`" class="chip chip-idle">
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
        <p v-if="!loading && !recommends.length" class="text-center text-gray-500 py-16">
          暂无推荐数据
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero-fade-enter-active,
.hero-fade-leave-active {
  transition:
    opacity 0.45s ease,
    transform 0.45s ease;
}

.hero-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.hero-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
