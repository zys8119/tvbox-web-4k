<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  addFavoriteApi,
  fetchFavoriteStatus,
  fetchTvboxDetail,
  removeFavoriteApi,
  type VodDetail,
} from "../api";
import { looksLikeHtml, sanitizeHtml } from "../utils/sanitize";

const route = useRoute();

const detail = ref<VodDetail | null>(null);
const loading = ref(true);
const error = ref("");
const lineIndex = ref(0);
const expanded = ref(false);
const desc = ref(false);

/** 是否已收藏（订阅站点收藏，归属当前订阅） */
const favorited = ref(false);
/** 收藏按钮防抖 */
const favBusy = ref(false);

const site = computed(() => String(route.query.site ?? ""));
const id = computed(() => String(route.query.id ?? ""));

/** 详情实际数据源站点：主站无详情时服务端可能返回其它站点的兜底结果（site_key） */
const dataSourceSite = computed(() => detail.value?.site_key || site.value);

/** 收藏标识：优先使用真实 vod_id（站点详情 id 可能为搜索聚合 id） */
const favKey = computed(() => detail.value?.vod_id || id.value);

onMounted(async () => {
  try {
    const data = await fetchTvboxDetail(
      site.value,
      id.value,
      String(route.query.name ?? ""),
    );
    detail.value = data.list[0] ?? null;
    // 查询收藏状态
    if (favKey.value) {
      try {
        const s = await fetchFavoriteStatus(favKey.value);
        favorited.value = s.favorited;
      } catch {
        favorited.value = false;
      }
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

/** 切换收藏 */
async function toggleFavorite() {
  const vid = favKey.value;
  if (!vid || !detail.value || favBusy.value) return;
  favBusy.value = true;
  try {
    if (favorited.value) {
      await removeFavoriteApi(vid);
      favorited.value = false;
    } else {
      await addFavoriteApi({
        vod_id: vid,
        vod_name: detail.value.vod_name,
        vod_pic: detail.value.vod_pic,
        remarks: detail.value.vod_remarks,
        site: dataSourceSite.value,
      });
      favorited.value = true;
    }
  } catch {
    /* 收藏失败保持原状态 */
  } finally {
    favBusy.value = false;
  }
}

const lines = computed(() => detail.value?.vod_play_list ?? []);
const currentLine = computed(() => lines.value[lineIndex.value] ?? null);
const episodes = computed(() => currentLine.value?.episodes ?? []);
const sortedEpisodes = computed(() =>
  desc.value ? [...episodes.value].reverse() : episodes.value,
);
const shownEpisodes = computed(() =>
  expanded.value ? sortedEpisodes.value : sortedEpisodes.value.slice(0, 30),
);

const introIsHtml = computed(() => looksLikeHtml(detail.value?.vod_content));
const safeIntro = computed(() => sanitizeHtml(detail.value?.vod_content));

/** 主演展示文本：兼容字符串与字符串数组（部分 JVM 爬虫返回数组） */
const actorText = computed(() => {
  const a = detail.value?.vod_actor;
  return Array.isArray(a) ? a.join(" / ") : a ?? "";
});

/** 跳到播放页（组播放使用数据源站点） */
function playTo(from: string, url: string) {
  return {
    name: "site-play",
    query: {
      site: dataSourceSite.value,
      flag: from,
      id: url,
      vod: detail.value?.vod_id || id.value,
      name: detail.value?.vod_name ?? "",
    },
  };
}
</script>

<template>
  <div class="page-wrap py-6">
    <p v-if="loading" class="text-center text-gray-500 py-24">加载中…</p>
    <p v-else-if="error" class="text-center text-red-400 py-24">{{ error }}</p>

    <template v-else-if="detail">
      <div class="flex items-center gap-2 mb-4">
        <RouterLink :to="{ name: 'sites', query: { site: dataSourceSite } }"
          class="b-none btn text-sm px-3 bg-white/[0.05] hover:bg-white/[0.11]">
          <span class="i-carbon-arrow-left" /> 返回站点
        </RouterLink>
        <span class="text-[11px] text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-500/20">
          {{ dataSourceSite }}
        </span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 items-start">
        <!-- 左：基本信息 -->
        <section class="panel !p-5 md:!p-6">
          <div class="w-36 md:w-44 mx-auto">
            <div class="card aspect-[3/4] overflow-hidden shadow-[0_18px_50px_-20px_rgba(0,0,0,0.95)]">
              <img v-if="detail.vod_pic" :src="detail.vod_pic" class="w-full h-full object-cover"
                referrerpolicy="no-referrer" />
            </div>
          </div>

          <div class="mt-5 min-w-0">
            <h1
              class="text-xl md:text-2xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              {{ detail.vod_name }}
            </h1>
            <div class="flex flex-wrap gap-2 text-xs mb-4">
              <span v-if="detail.vod_year" class="px-2.5 py-1 rounded-md bg-white/[0.09] text-gray-300">
                {{ detail.vod_year }}
              </span>
              <span v-if="detail.vod_area" class="px-2.5 py-1 rounded-md bg-white/[0.09] text-gray-300">
                {{ detail.vod_area }}
              </span>
              <span v-if="detail.vod_remarks" class="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-300">
                {{ detail.vod_remarks }}
              </span>
            </div>

            <dl class="text-sm space-y-2 text-gray-300 mb-5">
              <div v-if="detail.vod_director" class="flex gap-2">
                <dt class="shrink-0 text-gray-500 w-10">导演</dt>
                <dd class="truncate">{{ detail.vod_director }}</dd>
              </div>
              <div v-if="actorText" class="flex gap-2">
                <dt class="shrink-0 text-gray-500 w-10">主演</dt>
                <dd class="line-clamp-2 text-gray-300/90">{{ actorText }}</dd>
              </div>
              <div v-if="detail.vod_tag" class="flex gap-2">
                <dt class="shrink-0 text-gray-500 w-10">标签</dt>
                <dd class="line-clamp-2 text-gray-300/90">{{ detail.vod_tag }}</dd>
              </div>
            </dl>

            <RouterLink v-if="episodes.length && currentLine" :to="playTo(currentLine.from, episodes[0].url)"
              class="btn-primary w-full">
              <span class="i-carbon-play-filled" />
              播放第 1 集
            </RouterLink>

            <button class="b-none btn w-full mt-3 !py-2.5" :class="favorited
              ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
              : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.11]'
              " :disabled="favBusy" :title="favorited ? '取消收藏' : '加入收藏'" @click="toggleFavorite">
              <span class="i-carbon-favorite" />
              {{ favorited ? "已收藏" : "收藏" }}
            </button>
          </div>
        </section>

        <!-- 右：线路 + 选集 -->
        <div class="space-y-6 min-w-0">
          <section v-if="lines.length" class="panel">
            <h2 class="section-title mb-3">
              <span class="title-bar" />
              播放线路
            </h2>
            <div class="flex flex-wrap gap-2">
              <button v-for="(l, i) in lines" :key="l.from" class="b-none chip"
                :class="i === lineIndex ? 'chip-active' : 'chip-idle'" @click="lineIndex = i; expanded = false">
                {{ l.from }}
                <span class="text-xs opacity-60 ml-1">
                  {{ l.episodes.length }}
                </span>
              </button>
            </div>
          </section>

          <section v-if="episodes.length" class="panel">
            <div class="flex items-center justify-between mb-3">
              <h2 class="section-title">
                <span class="title-bar" />
                选集
                <span class="text-xs font-normal text-gray-500 ml-1">
                  共 {{ episodes.length }} 集
                </span>
              </h2>
              <button class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]"
                :title="desc ? '切换为正序' : '切换为倒序'" @click="desc = !desc">
                <span class="i-carbon-switch-layer-2" :class="desc ? 'rotate-180' : ''" />
                {{ desc ? "倒序" : "正序" }}
              </button>
            </div>
            <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              <RouterLink v-for="ep in shownEpisodes" :key="ep.url" :to="playTo(currentLine?.from ?? '', ep.url)"
                class="px-2 py-2 text-center text-sm rounded-lg truncate bg-white/[0.05] hover:bg-white/[0.11] hover:text-white transition-all duration-200"
                :title="ep.name">
                {{ ep.name }}
              </RouterLink>
            </div>
            <button v-if="episodes.length > 30"
              class="b-none btn text-sm mt-3 w-full bg-white/[0.05] hover:bg-white/[0.11]"
              @click="expanded = !expanded">
              {{ expanded ? "收起" : `展开全部 ${episodes.length} 集` }}
            </button>
          </section>
        </div>
      </div>

      <section v-if="detail.vod_content" class="panel mt-6">
        <h2 class="section-title mb-3">
          <span class="title-bar" />
          剧情简介
        </h2>
        <div v-if="introIsHtml" class="rich-text text-sm leading-7 text-gray-300/90" v-html="safeIntro" />
        <p v-else class="text-sm leading-7 text-gray-300/90 whitespace-pre-wrap">
          {{ detail.vod_content }}
        </p>
      </section>
    </template>
  </div>
</template>
