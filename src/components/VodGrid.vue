<script setup lang="ts">
import type { VodItem } from "../api";
import VodCard from "./VodCard.vue";
import VodSkeleton from "./VodSkeleton.vue";

defineProps<{ list: VodItem[]; loading?: boolean; skeleton?: number }>();
</script>

<template>
  <div
    class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4"
  >
    <template v-if="loading">
      <VodSkeleton v-for="i in skeleton ?? 14" :key="i" />
    </template>
    <template v-else>
      <VodCard v-for="item in list" :key="item.vod_id" :item="item" />
    </template>
  </div>
</template>
