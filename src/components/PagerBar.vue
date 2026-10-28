<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ page: number }>();
const emit = defineEmits<{ (e: "change", page: number): void }>();

interface PageItem {
  page: number;
  ellipsis: boolean;
}

const pages = computed<PageItem[]>(() => {
  const cur = props.page;
  const nums = [...new Set<number>([1, cur - 2, cur - 1, cur, cur + 1, cur + 2])]
    .filter((p) => p >= 1)
    .sort((a, b) => a - b);
  return nums.map((p, i) => ({
    page: p,
    ellipsis: i > 0 && p - nums[i - 1] > 1,
  }));
});

function go(p: number) {
  if (p < 1 || p === props.page) return;
  emit("change", p);
}
</script>

<template>
  <div class="flex items-center justify-center gap-1.5 py-8 flex-wrap">
    <button
      class="btn text-sm px-3 bg-white/[0.05] hover:bg-white/[0.11]"
      @click="go(page - 1)"
    >
      上一页
    </button>
    <template v-for="it in pages" :key="it.page">
      <span v-if="it.ellipsis" class="text-gray-600 px-1">…</span>
      <button
        class="btn text-sm min-w-9 px-2"
        :class="
          it.page === page
            ? 'text-white bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_8px_22px_-10px_rgba(99,102,241,1)]'
            : 'bg-white/[0.05] hover:bg-white/[0.11]'
        "
        @click="go(it.page)"
      >
        {{ it.page }}
      </button>
    </template>
    <button
      class="btn text-sm px-3 bg-white/[0.05] hover:bg-white/[0.11]"
      @click="go(page + 1)"
    >
      下一页
    </button>
  </div>
</template>
