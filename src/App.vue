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

function doSearch() {
  const wd = keyword.value.trim();
  if (!wd) return;
  router.push({ name: "search", query: { wd } });
  menuOpen.value = false;
}
</script>

<template>
  <div class="min-h-full flex flex-col">
    <!-- 顶部导航 -->
    <header
      class="sticky top-0 z-30 bg-[#0a0b0f]/70 backdrop-blur-2xl border-b border-white/[0.07] shadow-[0_8px_32px_-16px_rgba(0,0,0,0.9)] pt-[env(safe-area-inset-top)]">
      <div class="page-wrap h-16 flex items-center gap-4">
        <RouterLink to="/" class="group flex items-center gap-2 shrink-0">
          <img src="/images/logo.png" alt="方盒子影视"
            class="relative w-9 h-9 rounded-xl bg-white/95 p-0.5 object-contain shadow-[0_6px_20px_-6px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover:scale-105" />
          <span
            class="text-lg font-semibold tracking-wide bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            方盒子影视
          </span>
        </RouterLink>

        <!-- 桌面端分类 -->
        <nav class="hidden md:flex items-center gap-1.5 flex-1 overflow-x-auto">
          <RouterLink v-for="n in navs" :key="n.type_id" :to="`/category/${n.type_id}`" class="chip chip-idle !py-1.5"
            active-class="chip-active">
            {{ n.type_name }}
          </RouterLink>
        </nav>

        <!-- 搜索 -->
        <div class="flex items-center gap-2 ml-auto">
          <!-- 历史 / 收藏入口 -->
          <RouterLink to="/history"
            class="b-none btn p-2 bg-white/5 hover:bg-white/[0.11] text-gray-400 hover:text-white" title="观看历史"
            active-class="!text-white !bg-white/10">
            <span class="i-carbon-time" />
          </RouterLink>
          <RouterLink to="/favorites"
            class="b-none btn p-2 bg-white/5 hover:bg-white/[0.11] text-gray-400 hover:text-white" title="我的收藏"
            active-class="!text-white !bg-white/10">
            <span class="i-carbon-favorite" />
          </RouterLink>
          <RouterLink to="/sites" class="b-none btn p-2 bg-white/5 hover:bg-white/[0.11] text-gray-400 hover:text-white"
            title="订阅站点" active-class="!text-white !bg-white/10">
            <span class="i-carbon-catalog" />
          </RouterLink>
          <RouterLink to="/settings"
            class="b-none btn p-2 bg-white/5 hover:bg-white/[0.11] text-gray-400 hover:text-white" title="设置"
            active-class="!text-white !bg-white/10">
            <span class="i-carbon-settings" />
          </RouterLink>

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

            <!-- 右侧提示区（无按钮）：有内容时提示回车，无内容时展示快捷键 -->
            <div class="pointer-events-none absolute right-3 flex items-center">
              <kbd v-if="!keyword"
                class="hidden lg:flex items-center px-1.5 h-5 rounded-md bg-white/[0.09] text-[10px] text-gray-500 select-none">
                ⌘K
              </kbd>
              <span v-else class="hidden lg:inline text-[10px] text-gray-500">↵</span>
            </div>
          </div>

          <button class="md:hidden b-none btn bg-white/5 p-2" @click="menuOpen = !menuOpen">
            <span class="i-carbon-menu" />
          </button>
        </div>
      </div>

      <!-- 移动端抽屉 -->
      <div v-if="menuOpen" class="md:hidden border-t border-white/[0.07] px-4 py-3">
        <div class="search-field flex items-center rounded-xl px-3 h-10 mb-3 bg-white/[0.07]">
          <span class="i-carbon-search text-gray-400" />
          <input v-model="keyword"
            class="bg-transparent border-0 border-none outline-none ring-0 shadow-none appearance-none text-sm px-2 flex-1 placeholder:text-gray-500 focus:outline-none focus:ring-0"
            placeholder="搜索片名…" @keyup.enter="doSearch" />
        </div>
        <div class="grid grid-cols-3 gap-2">
          <RouterLink v-for="n in navs" :key="n.type_id" :to="`/category/${n.type_id}`"
            class="chip chip-idle text-center justify-center" active-class="chip-active" @click="menuOpen = false">
            {{ n.type_name }}
          </RouterLink>
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="flex-1">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <KeepAlive include="Sites">
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </main>

    <footer
      class="mt-8 border-t border-white/[0.07] py-8 text-center text-xs text-gray-500 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <p class="tracking-wide">方盒子影视 · 仅供学习交流使用</p>
    </footer>
  </div>
</template>
