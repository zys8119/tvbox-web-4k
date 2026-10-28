<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchSearch, type VodItem } from "../api";
import VodGrid from "../components/VodGrid.vue";

const route = useRoute();
const router = useRouter();

const wd = ref(String(route.query.wd ?? ""));
const list = ref<VodItem[]>([]);
const loading = ref(false);
const error = ref("");
const searched = ref(false);

async function run() {
  const kw = String(route.query.wd ?? "").trim();
  wd.value = kw;
  if (!kw) {
    list.value = [];
    searched.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchSearch(kw);
    list.value = data.list;
  } catch (e) {
    error.value = (e as Error).message;
    list.value = [];
  } finally {
    loading.value = false;
    searched.value = true;
  }
}

function submit() {
  const kw = wd.value.trim();
  if (!kw) return;
  router.push({ name: "search", query: { wd: kw } });
}

watch(() => route.query.wd, run, { immediate: true });
</script>

<template>
  <div class="page-wrap py-6">
    <div class="flex items-center gap-2 mb-6">
      <div
        class="search-field flex-1 flex items-center bg-white/5 rounded-xl px-4 h-11 transition-colors duration-200 focus-within:bg-white/[0.09]">
        <span class="i-carbon-search text-gray-400" />
        <input v-model="wd"
          class="bg-transparent border-0 border-none outline-none ring-0 shadow-none appearance-none text-sm px-3 flex-1 placeholder:text-gray-500 focus:outline-none focus:ring-0"
          placeholder="输入片名、演员、导演…" @keyup.enter="submit" />
      </div>
    </div>

    <p v-if="route.query.wd" class="text-sm text-gray-400 mb-5 flex items-center gap-2">
      <span class="i-carbon-search text-xs text-gray-500" />
      “<span class="text-gray-200">{{ route.query.wd }}</span>” 的搜索结果
    </p>

    <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

    <VodGrid :list="list" :loading="loading" :skeleton="14" />

    <p v-if="searched && !loading && !list.length && !error" class="text-center text-gray-500 py-16">
      没有找到相关内容，换个关键词试试
    </p>
  </div>
</template>
