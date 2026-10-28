<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchHome, type ClassItem } from "./api";

const router = useRouter();
const navs = ref<ClassItem[]>([]);
const keyword = ref("");
const menuOpen = ref(false);

/** 搜索框引用与聚焦态（用于展开动画、图标高亮） */
const searchInput = ref<HTMLInputElement | null>(null);
const searchFocus = ref(false);

onMounted(async () => {
  try {
    const home = await fetchHome();
    navs.value = home.class;
  } catch {
    navs.value = [];
  }
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});

/** 全局快捷键：⌘/Ctrl + K 或 / 聚焦搜索 */
function onGlobalKeydown(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  const typing =
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable);
  const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
  const slash = e.key === "/" && !typing;
  if (!cmdK && !slash) return;
  e.preventDefault();
  searchInput.value?.focus();
}

function clearKeyword() {
  keyword.value = "";
  searchInput.value?.focus();
}

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
    <header class="sticky top-0 z-30 backdrop-blur bg-[#0b0c10]/85 border-b border-white/5">
      <div class="page-wrap h-16 flex items-center gap-4">
        <RouterLink to="/" class="flex items-center gap-2 shrink-0">
          <span
            class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-sm font-bold">
            橘
          </span>
          <span class="text-lg font-semibold tracking-wide">橘汁影视</span>
        </RouterLink>

        <!-- 桌面端分类 -->
        <nav class="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
          <RouterLink v-for="n in navs" :key="n.type_id" :to="`/category/${n.type_id}`"
            class="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 whitespace-nowrap"
            active-class="!text-white !bg-white/10">
            {{ n.type_name }}
          </RouterLink>
        </nav>

        <!-- 搜索 -->
        <div class="flex items-center gap-2 ml-auto">
          <div
            class="search-field group relative hidden sm:flex items-center h-10 rounded-xl overflow-hidden transition-[width,background-color,box-shadow] duration-300 ease-out"
            :class="searchFocus
              ? 'w-64 lg:w-80 bg-white/[0.09] shadow-[0_12px_30px_-12px_rgba(99,102,241,0.75)]'
              : 'w-44 lg:w-60 bg-white/5 hover:bg-white/[0.07]'
              ">
            <!-- 左侧图标：聚焦时高亮 -->
            <span class="pointer-events-none absolute left-3 i-carbon-search text-base transition-colors duration-300"
              :class="searchFocus ? 'text-indigo-300' : 'text-gray-500 group-hover:text-gray-400'" />

            <input ref="searchInput" v-model="keyword" type="text" enterkeyhint="search"
              class="w-full h-full bg-transparent border-0 border-none outline-none ring-0 appearance-none shadow-none text-sm pl-9 pr-20 text-gray-100 placeholder:text-gray-500 placeholder:transition-colors focus:outline-none focus:ring-0"
              placeholder="搜索片名、演员…" @focus="searchFocus = true" @blur="searchFocus = false" @keyup.enter="doSearch" />

            <!-- 右侧操作区 -->
            <div class="absolute right-2 flex items-center gap-1">
              <button v-if="keyword"
                class="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="清空" @click="clearKeyword">
                <span class="i-carbon-close text-xs" />
              </button>
              <kbd v-else
                class="hidden lg:flex items-center px-1.5 h-5 rounded border border-white/10 bg-white/5 text-[10px] text-gray-500 select-none">
                ⌘K
              </kbd>
              <button v-if="keyword"
                class="w-6 h-6 rounded-md bg-indigo-500/90 text-white flex items-center justify-center hover:bg-indigo-400 transition-colors"
                title="搜索" @click="doSearch">
                <span class="i-carbon-arrow-right text-xs" />
              </button>
            </div>

          </div>

          <button class="md:hidden btn bg-white/5 p-2" @click="menuOpen = !menuOpen">
            <span class="i-carbon-menu" />
          </button>
        </div>
      </div>

      <!-- 移动端抽屉 -->
      <div v-if="menuOpen" class="md:hidden border-t border-white/5 px-4 py-3">
        <div class="flex items-center bg-white/5 rounded-lg px-3 h-9 mb-3 border border-white/10">
          <span class="i-carbon-search text-gray-400" />
          <input v-model="keyword" class="bg-transparent outline-none text-sm px-2 flex-1" placeholder="搜索片名…"
            @keyup.enter="doSearch" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <RouterLink v-for="n in navs" :key="n.type_id" :to="`/category/${n.type_id}`"
            class="px-2 py-2 text-center rounded-lg text-sm bg-white/5 hover:bg-white/10" @click="menuOpen = false">
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
