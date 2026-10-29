<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  addSearchHistory,
  fetchTvboxCategory,
  fetchTvboxHome,
  fetchTvboxSearch,
  fetchTvboxSites,
  type AggregatedItem,
  type ClassItem,
  type TvboxSite,
  type VodItem,
} from "../api";
import VodGrid from "../components/VodGrid.vue";
import PagerBar from "../components/PagerBar.vue";
import SearchBox from "../components/SearchBox.vue";

/** 供全局 KeepAlive（include="Sites"）命中，缓存页面状态 */
defineOptions({ name: "Sites" });

const route = useRoute();
const router = useRouter();

const sites = ref<TvboxSite[]>([]);
const loading = ref(true);
const error = ref("");

/** 当前站点 key（来自 URL query） */
const siteKey = computed(() => String(route.query.site ?? ""));
/** 当前分类 */
const tid = computed(() => String(route.query.tid ?? ""));
/** 当前页码 */
const page = computed(() => Number(route.query.page ?? 1) || 1);

const classes = ref<ClassItem[]>([]);
const list = ref<VodItem[]>([]);
const pagecount = ref(1);
const listLoading = ref(false);

/** 跨站聚合搜索关键词 */
const keyword = ref("");
const searchList = ref<AggregatedItem[]>([]);
const searching = ref(false);
const searched = ref(false);

/** 可用站点（已启用且浏览器可执行） */
const activeSites = computed(() =>
  sites.value.filter((s) => s.supported && s.enabled),
);


/** 订阅修订号 Key：Settings 页修改订阅后写入，用于 KeepAlive 缓存失效检测 */
const REV_KEY = "subs-rev";
let lastRev = String(localStorage.getItem(REV_KEY) ?? 0);

/**
 * 加载站点列表并恢复浏览内容。
 * @param refresh 为 true 时表示订阅刚变化，需清空旧缓存与搜索态后重载
 */
async function loadAll(refresh: boolean) {
  loading.value = true;
  error.value = "";
  if (refresh) {
    searched.value = false;
    keyword.value = "";
    searchList.value = [];
    classes.value = [];
    list.value = [];
    pagecount.value = 1;
  }
  try {
    const data = await fetchTvboxSites();
    sites.value = data.list;
    if (!data.cached) {
      error.value = "尚未配置订阅，请先前往设置页添加";
      return;
    }
    // 从 URL 恢复搜索（如刷新后 /sites?kw=片名）
    const kw = String(route.query.kw ?? "").trim();
    if (kw) {
      keyword.value = kw;
      if (!searched.value) await doSearch();
      return;
    }
    // 未指定站点时，默认选第一个可用站点
    if (!siteKey.value && activeSites.value.length) {
      router.replace({ query: { ...route.query, site: activeSites.value[0].key } });
      return;
    }
    if (siteKey.value) await loadSite();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadAll(false));

/** KeepAlive 命中缓存返回本页时：订阅修订号变化则强制刷新，避免展示旧配置 */
onActivated(async () => {
  const rev = String(localStorage.getItem(REV_KEY) ?? 0);
  if (rev === lastRev) return;
  lastRev = rev;
  await loadAll(true);
});

/** 加载当前站点首页或分类 */
async function loadSite() {
  if (!siteKey.value) return;
  listLoading.value = true;
  error.value = "";
  try {
    if (!tid.value) {
      const home = await fetchTvboxHome(siteKey.value);
      classes.value = home.class;
      list.value = home.list;
      pagecount.value = 1;
    } else {
      const data = await fetchTvboxCategory(
        siteKey.value,
        tid.value,
        page.value,
      );
      list.value = data.list;
      pagecount.value = data.pagecount;
      // 分类接口不返回 class，沿用首页缓存或补拉
      if (!classes.value.length) {
        const home = await fetchTvboxHome(siteKey.value);
        classes.value = home.class;
      }
    }
  } catch (e) {
    error.value = (e as Error).message;
    list.value = [];
  } finally {
    listLoading.value = false;
  }
}

watch(
  () => [siteKey.value, tid.value, page.value],
  () => {
    // 搜索态下（如从详情返回）不重新加载站点列表，保留搜索内容
    if (searched.value) return;
    if (siteKey.value) loadSite();
  },
);

/** 关键词同步到 URL（kw），刷新/直链/从详情返回都能恢复 */
watch(
  () => String(route.query.kw ?? ""),
  (kw) => {
    if (!kw) return;
    if (keyword.value.trim() === kw) return;
    keyword.value = kw;
    if (!searched.value) doSearch();
    else searchList.value = [...searchList.value]; // 兜底触发重渲染
  },
);

/** 切换站点：重置分类与页码 */
function pickSite(key: string) {
  classes.value = [];
  list.value = [];
  searchList.value = [];
  searched.value = false;
  router.push({ query: { site: key } });
}

/** 切换分类 */
function pickClass(id: string) {
  const q: Record<string, string> = { site: siteKey.value };
  if (id) q.tid = id;
  router.push({ query: q });
}

function changePage(p: number) {
  router.push({
    query: { site: siteKey.value, tid: tid.value, page: String(p) },
  });
}

/** 跨站聚合搜索 */
async function doSearch() {
  const wd = keyword.value.trim();
  if (!wd) return;
  // 关键词写入 URL（kw），刷新/直链也能恢复搜索
  router.replace({ query: { ...route.query, kw: wd } });
  // 写入跨站搜索记录（scope=sites，绑定当前订阅）
  addSearchHistory("sites", wd).catch(() => { });
  searching.value = true;
  error.value = "";
  try {
    const data = await fetchTvboxSearch(wd);
    searchList.value = data.list;
  } catch (e) {
    error.value = (e as Error).message;
    searchList.value = [];
  } finally {
    searching.value = false;
    searched.value = true;
  }
}

function clearSearch() {
  keyword.value = "";
  searchList.value = [];
  searched.value = false;
  // 从 URL 移除 kw 参数，恢复浏览态；站点变化交给 watch，未变化则直接重载列表
  const site = siteKey.value || activeSites.value[0]?.key || "";
  const q: Record<string, string> = {};
  if (site) q.site = site;
  router.replace({ query: q, force: true });
  if (site && site === siteKey.value) loadSite();
}

/** 搜索结果按站点分组展示 */
const grouped = computed(() => {
  const map = new Map<string, { name: string; items: AggregatedItem[] }>();
  for (const it of searchList.value) {
    const g = map.get(it.site_key) ?? { name: it.site_name, items: [] };
    g.items.push(it);
    map.set(it.site_key, g);
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v }));
});
</script>

<template>
  <div class="page-wrap py-6">
    <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <h2 class="section-title">
        <span class="title-bar" />
        订阅站点
        <span class="text-xs font-normal text-gray-500 ml-1">
          {{ activeSites.length }} 个可用
        </span>
      </h2>
      <RouterLink to="/settings" class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]">
        <span class="i-carbon-settings text-[10px]" /> 订阅设置
      </RouterLink>
    </div>

    <p v-if="error" class="text-center text-red-400 py-16">{{ error }}</p>

    <!-- 站点选择：允许换行展示全部站点 -->
    <div v-if="activeSites.length" class="flex flex-wrap items-center gap-2 pb-3 mb-3">
      <button v-for="s in activeSites" :key="s.key" class="b-none chip"
        :class="s.key === siteKey ? 'chip-active' : 'chip-idle'" @click="pickSite(s.key)">
        {{ s.name }}
      </button>
    </div>

    <!-- 聚合搜索 -->
    <div v-if="activeSites.length" class="mb-5">
      <div class="flex gap-2">
        <div class="flex-1">
          <SearchBox v-model="keyword" scope="sites" placeholder="跨站搜索片名…" @keyup.enter="doSearch" />
        </div>
        <button class="b-none btn btn-primary text-sm px-4 shrink-0" :disabled="searching" @click="doSearch">
          <span v-if="searching" class="i-carbon-circle-dash animate-spin" />
          {{ searching ? "搜索中" : "搜索" }}
        </button>
      </div>
      <p class="text-[11px] text-gray-500 mt-1.5">
        搜索会并发查询所有已启用站点，耗时取决于站点响应速度
      </p>
    </div>

    <!-- 搜索结果 -->
    <template v-if="searched">
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-400">
          “<span class="text-gray-200">{{ keyword }}</span>” 共
          {{ searchList.length }} 条结果
        </p>
        <button class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]" @click="clearSearch">
          返回浏览
        </button>
      </div>

      <p v-if="!searchList.length && !searching" class="text-center text-gray-500 py-16">
        没有找到相关内容
      </p>

      <div v-else class="space-y-7">
        <section v-for="g in grouped" :key="g.key">
          <h3 class="flex items-center gap-2 mb-3 text-sm text-gray-400">
            <span class="w-1 h-3.5 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
            {{ g.name }}
            <span class="text-[11px] text-gray-600 tabular-nums">
              {{ g.items.length }}
            </span>
          </h3>
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
            <RouterLink v-for="it in g.items" :key="g.key + '-' + it.vod_id" :to="{
              name: 'site-detail',
              query: { site: g.key, id: it.vod_id, name: it.vod_name },
            }" class="group card glass-hover hover:-translate-y-1.5 duration-300 ease-out">
              <div class="relative aspect-[3/4] overflow-hidden bg-white/5">
                <img v-if="it.vod_pic" :src="it.vod_pic" :alt="it.vod_name" loading="lazy"
                  class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerpolicy="no-referrer" />
                <div v-else class="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                  暂无封面
                </div>
                <span v-if="it.vod_remarks"
                  class="absolute left-2 bottom-2 max-w-[calc(100%-1rem)] px-2 py-1 rounded-md text-[11px] leading-tight text-gray-100 bg-black/65 backdrop-blur-md truncate">
                  {{ it.vod_remarks }}
                </span>
              </div>
              <div class="px-2 py-2">
                <p class="text-sm text-gray-100 truncate">
                  {{ it.vod_name }}
                </p>
              </div>
            </RouterLink>
          </div>
        </section>
      </div>
    </template>

    <!-- 正常浏览 -->
    <template v-else>
      <!-- 分类：允许换行展示全部 -->
      <div v-if="classes.length" class="flex flex-wrap items-center gap-2 pb-3 mb-4">
        <button class="b-none chip" :class="!tid ? 'chip-active' : 'chip-idle'" @click="pickClass('')">
          全部
        </button>
        <button v-for="c in classes" :key="c.type_id" class="b-none chip"
          :class="c.type_id === tid ? 'chip-active' : 'chip-idle'" @click="pickClass(c.type_id)">
          {{ c.type_name }}
        </button>
      </div>

      <VodGrid :list="list" :loading="listLoading" :skeleton="21" :site="siteKey" />

      <p v-if="!listLoading && !list.length && !error" class="text-center text-gray-500 py-16">
        该站点暂无内容
      </p>

      <PagerBar v-if="tid && list.length" :page="page" @change="changePage" />
    </template>

    <p v-if="loading" class="text-center text-gray-500 py-16">加载中…</p>
  </div>
</template>
