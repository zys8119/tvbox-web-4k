<script setup lang="ts">
import { computed, ref } from "vue";
import { useSearchHistory } from "../utils/useSearchHistory";

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  /** 搜索记录作用域，不同页面独立存储 */
  scope: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const { history, add, remove, clear } = useSearchHistory(props.scope);

/** 输入框是否聚焦（决定是否展示搜索记录面板） */
const focus = ref(false);

/**
 * 展示搜索记录的条件：
 *   - 聚焦时，或输入框已有内容
 *   - 且确有历史记录
 */
const showHistory = computed(
  () => (focus.value || !!props.modelValue) && history.value.length > 0,
);

/** 当前关键词对应的已去重记录（用于高亮提示） */
const deduped = computed(() => {
  const kw = props.modelValue.trim().toLowerCase();
  if (!kw) return history.value;
  return history.value.filter((x) => x.toLowerCase() !== kw);
});

function setValue(v: string) {
  emit("update:modelValue", v);
}

function onInput(e: Event) {
  setValue((e.target as HTMLInputElement).value);
}

/** 回车提交：写入搜索记录（内部已去重） */
function commit() {
  const w = props.modelValue.trim();
  if (w) add(w);
}

/** 点击某条记录：回填并置顶 */
function pick(word: string) {
  setValue(word);
  add(word);
}

function clearKeyword() {
  setValue("");
}

function blurLater() {
  // 延迟失焦，避免点击记录时面板先消失导致点不中
  window.setTimeout(() => {
    focus.value = false;
  }, 150);
}
</script>

<template>
  <div class="relative">
    <div
      class="search-field flex items-center rounded-xl px-3 h-10 bg-white/[0.05] transition-colors focus-within:bg-white/[0.09]"
    >
      <span class="i-carbon-search text-gray-500 text-sm" />
      <input
        :value="modelValue"
        type="text"
        :placeholder="placeholder ?? '搜索…'"
        class="bg-transparent border-0 border-none outline-none ring-0 shadow-none appearance-none text-sm px-2 flex-1 placeholder:text-gray-500 focus:outline-none focus:ring-0"
        @input="onInput"
        @focus="focus = true"
        @blur="blurLater"
        @keyup.enter="commit"
      />
      <button
        v-if="modelValue"
        class="b-none w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"
        title="清空"
        @click="clearKeyword"
      >
        <span class="i-carbon-close text-xs" />
      </button>
    </div>

    <!-- 搜索记录面板 -->
    <div
      v-if="showHistory"
      class="absolute z-20 left-0 right-0 top-[calc(100%+6px)] rounded-xl p-2 bg-[#12141c] shadow-[0_18px_40px_-16px_rgba(0,0,0,1)] max-h-72 overflow-y-auto"
    >
      <div class="flex items-center justify-between px-1.5 pb-1.5">
        <span class="text-[11px] text-gray-500">搜索记录</span>
        <button
          class="b-none text-[11px] text-gray-500 hover:text-red-300"
          @click="clear"
        >
          清空
        </button>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="w in deduped"
          :key="w"
          class="b-none group/tag inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/[0.05] text-gray-300 hover:bg-white/[0.11] hover:text-white transition-colors"
          :title="w"
          @click="pick(w)"
        >
          <span class="max-w-[10rem] truncate">{{ w }}</span>
          <span
            class="i-carbon-close text-[10px] text-gray-600 hover:text-red-300"
            @click.stop="remove(w)"
          />
        </button>
      </div>
    </div>
  </div>
</template>
