<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  fetchTvboxConfig,
  fetchTvboxSites,
  refreshTvbox,
  removeTvboxSubscription,
  setTvboxSiteEnabled,
  setTvboxSitesEnabled,
  setTvboxSubscription,
  switchTvboxSubscription,
  type TvboxConfigInfo,
  type TvboxSite,
  type TvboxSubscription,
} from "../api";
import { useSearchHistory } from "../utils/useSearchHistory";
import SearchBox from "../components/SearchBox.vue";

const cfg = ref<TvboxConfigInfo | null>(null);
const sites = ref<TvboxSite[]>([]);
const name = ref("");
const url = ref("");
const editingId = ref("");
const loading = ref(true);
const saving = ref(false);
const refreshing = ref(false);
const switchingId = ref("");
const removingId = ref("");
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

/** 关键词过滤站点名；默认过滤 JVM（type 3）与不支持类型 */
const hideJvm = ref(true);
const shown = computed(() => {
  const kw = filter.value.trim().toLowerCase();
  const base = supported.value.filter(
    (s) => !hideJvm.value || s.type !== 3,
  );
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
    editingId.value = c.activeId ?? "";
    name.value = c.name ?? "";
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
    const r = await setTvboxSubscription(u, name.value.trim(), editingId.value);
    tip.value = `${editingId.value ? "订阅已更新" : "订阅已添加"}：${r.counts.sites} 个站点`;
    addUrl(u);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

function editSub(s: TvboxSubscription) {
  editingId.value = s.id;
  name.value = s.name;
  url.value = s.url;
  tip.value = "";
  error.value = "";
}

function newSub() {
  editingId.value = "";
  name.value = "";
  url.value = "";
  tip.value = "";
  error.value = "";
}

function resetEditor() {
  editingId.value = cfg.value?.activeId ?? "";
  name.value = cfg.value?.name ?? "";
  url.value = cfg.value?.url ?? "";
}

async function switchSub(s: TvboxSubscription) {
  if (s.active) return;
  switchingId.value = s.id;
  error.value = "";
  tip.value = "";
  try {
    const r = await switchTvboxSubscription(s.id);
    tip.value = `已切换订阅：${s.name}（${r.counts.sites} 个站点）`;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    switchingId.value = "";
  }
}

async function removeSub(s: TvboxSubscription) {
  if (!window.confirm(`确定删除订阅「${s.name}」吗？`)) return;
  removingId.value = s.id;
  error.value = "";
  tip.value = "";
  try {
    await removeTvboxSubscription(s.id);
    if (editingId.value === s.id) resetEditor();
    tip.value = `已删除订阅：${s.name}`;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    removingId.value = "";
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
        支持保存多个 TVBox 订阅地址，当前激活项会用于站点列表、搜索与浏览。
      </p>

      <div v-if="cfg?.subscriptions?.length" class="mb-4 space-y-2">
        <div v-for="s in cfg.subscriptions" :key="s.id" class="rounded-xl bg-white/[0.04] px-3 py-3">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-gray-100">{{ s.name }}</span>
                <span v-if="s.active" class="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">
                  当前
                </span>
                <span v-else-if="s.cached" class="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.06] text-gray-400">
                  已缓存
                </span>
              </div>
              <p class="mt-1 text-[11px] text-gray-500 break-all">{{ s.url }}</p>
              <p class="mt-1 text-[11px] text-gray-600">
                {{ s.counts.sites }} 站点 · {{ s.counts.lives }} 直播 · {{ s.counts.parses }} 解析
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]"
                :disabled="switchingId === s.id || s.active" @click="switchSub(s)">
                {{ switchingId === s.id ? "切换中" : s.active ? "当前订阅" : "切换" }}
              </button>
              <button class="b-none btn text-xs px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.11]" @click="editSub(s)">
                编辑
              </button>
              <button class="b-none btn text-xs px-2.5 py-1 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                :disabled="removingId === s.id" @click="removeSub(s)">
                {{ removingId === s.id ? "删除中" : "删除" }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)] gap-2 mb-2">
        <input v-model="name" type="text"
          class="h-10 rounded-xl px-3 text-sm bg-white/[0.05] text-gray-100 placeholder:text-gray-500 border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus:bg-white/[0.09] transition-colors"
          placeholder="订阅名称（可选）" />
        <input v-model="url" type="text"
          class="flex-1 h-10 rounded-xl px-3 text-sm bg-white/[0.05] text-gray-100 placeholder:text-gray-500 border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus:bg-white/[0.09] transition-colors"
          placeholder="https://api.tvbox.xin/" @keyup.enter="save" />
      </div>

      <div class="flex flex-col sm:flex-row gap-2">
        <button class="b-none btn btn-primary text-sm px-4 h-10 shrink-0" :disabled="saving" @click="save">
          <span v-if="saving" class="i-carbon-circle-dash animate-spin" />
          {{ saving ? "加载中" : editingId ? "保存并切换" : "新增并加载" }}
        </button>
        <button class="b-none btn text-sm px-3 h-10 shrink-0 bg-white/[0.05] hover:bg-white/[0.11]" @click="newSub">
          新建订阅
        </button>
        <button class="b-none btn text-sm px-3 h-10 shrink-0 bg-white/[0.05] hover:bg-white/[0.11]"
          :disabled="!cfg?.activeId" @click="resetEditor">
          回到当前订阅
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

      <div class="mb-3 flex items-center gap-3">
        <div class="flex-1">
          <SearchBox v-model="filter" scope="settings-sites" placeholder="搜索站点名…" />
        </div>
        <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none shrink-0">
          <input type="checkbox" v-model="hideJvm" class="accent-indigo-500 w-3.5 h-3.5 cursor-pointer" />
          过滤 JVM(type3)
        </label>
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
        以下站点仍未被当前服务端适配，因此不会参与搜索与浏览。
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
