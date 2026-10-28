<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchHome, type ClassItem } from "./api";

const router = useRouter();
const navs = ref<ClassItem[]>([]);
const keyword = ref("");
const menuOpen = ref(false);

onMounted(async () => {
  try {
    const home = await fetchHome();
    navs.value = home.class;
  } catch {
    navs.value = [];
  }
});

function doSearch() {
  const wd = keyword.value.trim();
  if (!wd) return;
  router.push({ name: "search", query: { wd } });
  menuOpen.value = false;
}
</script>

<template>
  <div class="min-h-full flex flex-col bg-[#0b0c10]">
    <!-- 顶部导航 -->
    <header
      class="sticky top-0 z-30 backdrop-blur bg-[#0b0c10]/85 border-b border-white/5"
    >
      <div class="page-wrap h-16 flex items-center gap-4">
        <RouterLink to="/" class="flex items-center gap-2 shrink-0">
          <span
            class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-sm font-bold"
          >
            橘
          </span>
          <span class="text-lg font-semibold tracking-wide">橘汁影视</span>
        </RouterLink>

        <!-- 桌面端分类 -->
        <nav class="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
          <RouterLink
            v-for="n in navs"
            :key="n.type_id"
            :to="`/category/${n.type_id}`"
            class="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 whitespace-nowrap"
            active-class="!text-white !bg-white/10"
          >
            {{ n.type_name }}
          </RouterLink>
        </nav>

        <!-- 搜索 -->
        <div class="flex items-center gap-2 ml-auto">
          <div
            class="hidden sm:flex items-center bg-white/5 rounded-lg px-3 h-9 border border-white/10 focus-within:border-indigo-400/60"
          >
            <span class="i-carbon-search text-gray-400" />
            <input
              v-model="keyword"
              class="bg-transparent outline-none text-sm px-2 w-40 lg:w-56 placeholder:text-gray-500"
              placeholder="搜索片名、演员…"
              @keyup.enter="doSearch"
            />
          </div>
          <button class="md:hidden btn bg-white/5 p-2" @click="menuOpen = !menuOpen">
            <span class="i-carbon-menu" />
          </button>
        </div>
      </div>

      <!-- 移动端抽屉 -->
      <div v-if="menuOpen" class="md:hidden border-t border-white/5 px-4 py-3">
        <div
          class="flex items-center bg-white/5 rounded-lg px-3 h-9 mb-3 border border-white/10"
        >
          <span class="i-carbon-search text-gray-400" />
          <input
            v-model="keyword"
            class="bg-transparent outline-none text-sm px-2 flex-1"
            placeholder="搜索片名…"
            @keyup.enter="doSearch"
          />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <RouterLink
            v-for="n in navs"
            :key="n.type_id"
            :to="`/category/${n.type_id}`"
            class="px-2 py-2 text-center rounded-lg text-sm bg-white/5 hover:bg-white/10"
            @click="menuOpen = false"
          >
            {{ n.type_name }}
          </RouterLink>
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="flex-1">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="border-t border-white/5 py-6 text-center text-xs text-gray-500">
      橘汁影视 · 仅供学习交流使用
    </footer>
  </div>
</template>
