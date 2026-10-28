<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  fetchTvboxConfig,
  fetchTvboxSites,
  refreshTvbox,
  setTvboxSiteEnabled,
  setTvboxSitesEnabled,
  setTvboxSubscription,
  type TvboxConfigInfo,
  type TvboxSite,
} from "../api";
import { useSearchHistory } from "../utils/useSearchHistory";
import SearchBox from "../components/SearchBox.vue";

const cfg = ref<TvboxConfigInfo | null>(null);
const sites = ref<TvboxSite[]>([]);
const url = ref("");
const loading = ref(true);
const saving = ref(false);
const refreshing = ref(false);
const error = ref("");
const tip = ref("");
const filter = ref("");

/** 订阅地址历史（复用搜索记录能力，用于快速回填） */
const { history: urlHistory, add: addUrl } = useSearchHistory("settings");

/** 站点按可用性分组 */
const supported = computed(() => sites.value.filter((s) => s.supported));
const unsupported = computed(() => sites.value.filter((s) => !s.supported));
const enabledCount = computed(
  () => supported.value.filter((s) => s.enabled).length,
);

/** 关键词过滤站点名 */
const shown = computed(() => {
  const kw = filter.value.trim().toLowerCase();
  const base = supported.value;
  if (!kw) return base;
  return base.filter((s) => s.name.toLowerCase().includes(kw));
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [c, s] = await Promise.all([
      fetchTvboxConfig(),
      fetchTvboxSites(),
    ]);
    cfg.value = c;
    url.value = c.url;
    sites.value = s.list;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

/** 保存订阅地址：后端会用 TVBox UA 拉取并规范化 */
async function save() {
  const u = url.value.trim();
  if (!u) {
    error.value = "请填写订阅地址";
    return;
  }
  saving.value = true;
  error.value = "";
  tip.value = "";
  try {
    const r = await setTvboxSubscription(u);
    tip.value = `订阅已加载：${r.counts.sites} 个站点`;
    addUrl(u);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

/** 重新拉取（订阅内容可能已更新） */
async function refresh() {
  refreshing.value = true;
  error.value = "";
  tip.value = "";
  try {
    const r = await refreshTvbox();
    tip.value = `已刷新：${r.sites} 个站点`;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    refreshing.value = false;
  }
}

/** 单站点开关 */
async function toggle(s: TvboxSite) {
  const next = !s.enabled;
  s.enabled = next;
  try {
    await setTvboxSiteEnabled(s.key, next);
  } catch (e) {
    s.enabled = !next;
    error.value = (e as Error).message;
  }
}

/** 全开 / 全关 */
async function toggleAll(on: boolean) {
  const keys = supported.value.map((s) => s.key);
  if (!keys.length) return;
  supported.value.forEach((s) => (s.enabled = on));
  try {
    await setTvboxSitesEnabled(keys, on);
  } catch (e) {
    error.value = (e as Error).message;
    await load();
  }
}

onMounted(load);
</script>

<template>
  <div class="page-wrap py-6 max-w-4xl">
    <h2 class="section-title mb-5">
      <span class="title-bar" />
      设置
    </h2>

    <p v-if="error" class="mb-4 text-sm text-red-400">{{ error }}</p>
    <p v-if="tip" class="mb-4 text-sm text-emerald-400">{{ tip }}</p>

    <!-- 订阅配置 -->
    <section class="panel mb-5">
      <h3 class="text-sm font-medium text-gray-200 mb-1">订阅地址</h3>
      <p class="text-[11px] text-gray-500 mb-3">
        填写 TVBox 订阅地址（JSON 配置），保存后由服务端拉取并解析。
      </p>

      <div class="flex flex-col sm:flex-row gap-2">
        <input v-model="url" type="text"
          class="flex-1 h-10 rounded-xl px-3 text-sm bg-white/[0.05] text-gray-100 placeholder:text-gray-500 border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus:bg-white/[0.09] transition-colors"
          placeholder="https://api.tvbox.xin/" @keyup.enter="save" />
        <button class="b-none btn btn-primary text-sm px-4 h-10 shrink-0" :disabled="saving" @click="save">
          <span v-if="saving" class="i-carbon-circle-dash animate-spin" />
          {{ saving ? "加载中" : "保存并加载" }}
        </button>
        <button class="b-none btn text-sm px-3 h-10 shrink-0 bg-white/[0.05] hover:bg-white/[0.11]"
          :disabled="refreshing || !cfg?.cached" @click="refresh">
          <span class="i-carbon-renew" :class="refreshing ? 'animate-spin' : ''" />
          刷新
        </button>
      </div>

      <!-- 最近使用过的订阅地址 -->
      <div v-if="urlHistory.length" class="mt-3 flex flex-wrap gap-1.5">
        <button v-for="h in urlHistory" :key="h" class="b-none chip chip-idle !py-1 !px-2 text-[11px]" :title="h"
          @click="url = h">
          <span class="max-w-[16rem] truncate">{{ h }}</span>
        </button>
      </div>

      <!-- 订阅概览 -->
      <dl v-if="cfg?.cached" class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div class="rounded-lg bg-white/[0.04] px-3 py-2">
          <dt class="text-gray-500">站点</dt>
          <dd class="text-gray-100 tabular-nums mt-0.5">
            {{ cfg.counts.sites }}
          </dd>
        </div>
        <div class="rounded-lg bg-white/[0.04] px-3 py-2">
          <dt class="text-gray-500">直播源</dt>
          <dd class="text-gray-100 tabular-nums mt-0.5">
            {{ cfg.counts.lives }}
          </dd>
        </div>
        <div class="rounded-lg bg-white/[0.04] px-3 py-2">
          <dt class="text-gray-500">解析</dt>
          <dd class="text-gray-100 tabular-nums mt-0.5">
            {{ cfg.counts.parses }}
          </dd>
        </div>
        <div class="rounded-lg bg-white/[0.04] px-3 py-2">
          <dt class="text-gray-500">可用站点</dt>
          <dd class="text-gray-100 tabular-nums mt-0.5">
            {{ enabledCount }} / {{ supported.length }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- 站点管理 -->
    <section v-if="supported.length" class="panel">
      <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 class="text-sm font-medium text-gray-200">
          可用站点
          <span class="text-[11px] font-normal text-gray-500 ml-1">
            {{ enabledCount }}/{{ supported.length }} 已启用
          </span>
        </h3>
        <div class="flex items-center gap-2">
          <button class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]" @click="toggleAll(true)">
            全开
          </button>
          <button class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]"
            @click="toggleAll(false)">
            全关
          </button>
        </div>
      </div>

      <div class="mb-3">
        <SearchBox v-model="filter" scope="settings-sites" placeholder="搜索站点名…" />
      </div>

      <div class="space-y-1.5">
        <label v-for="s in shown" :key="s.key"
          class="flex items-center gap-3 rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer">
          <input type="checkbox" :checked="s.enabled" class="accent-indigo-500 w-4 h-4 cursor-pointer"
            @change="toggle(s)" />
          <span class="text-sm text-gray-200 truncate flex-1">
            {{ s.name }}
          </span>
          <span class="text-[11px] text-gray-600 shrink-0">
            {{ s.key }} · type{{ s.type }}
          </span>
        </label>
      </div>

      <p v-if="!shown.length" class="text-center text-gray-500 py-6 text-sm">
        没有匹配的站点
      </p>
    </section>

    <!-- 不可用站点说明 -->
    <section v-if="unsupported.length" class="panel mt-5">
      <h3 class="text-sm font-medium text-gray-200 mb-1">
        不可用站点
        <span class="text-[11px] font-normal text-gray-500 ml-1">
          {{ unsupported.length }} 个
        </span>
      </h3>
      <p class="text-[11px] text-gray-500 mb-3">
        以下站点依赖 Android JAR（csp_* 爬虫）运行，浏览器环境无法执行，故不参与搜索与浏览。
      </p>
      <div class="flex flex-wrap gap-1.5">
        <span v-for="s in unsupported" :key="s.key"
          class="px-2 py-1 rounded-md text-[11px] bg-white/[0.04] text-gray-500" :title="s.reason">
          {{ s.name }}
        </span>
      </div>
    </section>

    <p v-if="loading" class="text-center text-gray-500 py-10 text-sm">
      加载中…
    </p>
  </div>
</template>
