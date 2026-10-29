<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
    fetchCategory,
    fetchHome,
    type ClassItem,
    type FilterGroup,
    type VodItem,
} from "../api";
import VodGrid from "../components/VodGrid.vue";
import PagerBar from "../components/PagerBar.vue";

const route = useRoute();
const router = useRouter();

const tid = computed(() => String(route.params.tid ?? ""));
const page = computed(() => Number(route.query.page ?? 1) || 1);

const classes = ref<ClassItem[]>([]);
const groups = ref<FilterGroup[]>([]);
const list = ref<VodItem[]>([]);
const loading = ref(true);
const error = ref("");

/** 当前选中的筛选项（从 URL query 还原） */
const selected = computed<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const g of groups.value) {
        const v = route.query[g.key];
        if (typeof v === "string" && v) o[g.key] = v;
    }
    return o;
});

onMounted(async () => {
    try {
        const home = await fetchHome();
        classes.value = home.class;
        groups.value = home.filters[tid.value] ?? [];
    } catch {
        classes.value = [];
    }
    await load();
});

async function load() {
    loading.value = true;
    error.value = "";
    try {
        const data = await fetchCategory(tid.value, page.value, selected.value);
        list.value = data.list;
    } catch (e) {
        error.value = (e as Error).message;
        list.value = [];
    } finally {
        loading.value = false;
    }
}

function pick(key: string, value: string) {
    const q: Record<string, string> = { ...(route.query as Record<string, string>) };
    if (!value || q[key] === value) delete q[key];
    else q[key] = value;
    q.page = "1";
    router.push({ query: q });
}

function changePage(p: number) {
    router.push({ query: { ...(route.query as Record<string, string>), page: String(p) } });
}

// 切换分类时重新加载筛选器
watch(tid, async (nextTid) => {
    try {
        const home = await fetchHome();
        groups.value = home.filters[nextTid] ?? [];
    } catch {
        groups.value = [];
    }
});

// 页码或筛选项变化时重新拉取列表
// tid 来自 route.params（顶部主导航切换分类），必须纳入依赖，否则会显示上一分类的旧数据
watch(
    () => tid.value + "|" + page.value + "|" + JSON.stringify(route.query),
    () => load(),
);
</script>

<template>
    <div class="page-wrap py-5">
        <!-- 分类 Tab -->
        <div class="flex items-center gap-2 overflow-x-auto pb-3 mb-3">
            <RouterLink v-for="c in classes" :key="c.type_id" :to="`/category/${c.type_id}`" class="chip"
                :class="c.type_id === tid ? 'chip-active' : 'chip-idle'">
                {{ c.type_name }}
            </RouterLink>
        </div>

        <!-- 筛选器 -->
        <div v-if="groups.length" class="panel mb-6 space-y-2.5">
            <div v-for="g in groups" :key="g.key" class="flex items-start gap-3 text-sm">
                <span class="shrink-0 w-14 pt-1 text-[13px] text-gray-500">{{ g.name }}</span>
                <div class="flex flex-wrap gap-1.5">
                    <button class="b-none chip !py-1 !px-2.5" :class="!selected[g.key] ? 'chip-active' : 'chip-idle'"
                        @click="pick(g.key, '')">
                        全部
                    </button>
                    <button v-for="v in g.value" :key="v.v" class="b-none chip !py-1 !px-2.5"
                        :class="selected[g.key] === v.v ? 'chip-active' : 'chip-idle'" @click="pick(g.key, v.v)">
                        {{ v.n }}
                    </button>
                </div>
            </div>
        </div>

        <p v-if="error" class="text-center text-red-400 py-20">{{ error }}</p>

        <VodGrid :list="list" :loading="loading" :skeleton="21" />

        <p v-if="!loading && !list.length && !error" class="text-center text-gray-500 py-16">
            没有找到内容
        </p>

        <PagerBar v-if="list.length" :page="page" @change="changePage" />
    </div>
</template>
