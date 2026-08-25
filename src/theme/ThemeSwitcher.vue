<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "./themeManager";

const { currentTheme, toggleTheme } = useTheme();
const isIceBlue = computed(() => currentTheme.value === "ice-blue");
const currentLabel = computed(() => (isIceBlue.value ? "冰蓝" : "默认"));
const nextLabel = computed(() => (isIceBlue.value ? "默认风格" : "冰蓝风格"));
</script>

<template>
  <button
    class="mj-theme-switcher"
    type="button"
    :class="{ 'mj-theme-switcher--ice': isIceBlue }"
    :aria-pressed="isIceBlue"
    :aria-label="`当前为${currentLabel}风格，点击切换至${nextLabel}`"
    :title="`切换至${nextLabel}`"
    @click="toggleTheme"
  >
    <span class="mj-theme-switcher__orb" aria-hidden="true" />
    <span class="mj-theme-switcher__text">
      <span class="mj-theme-switcher__caption">界面风格</span>
      <span class="mj-theme-switcher__value">{{ currentLabel }}</span>
    </span>
    <span class="mj-theme-switcher__arrow" aria-hidden="true">⇄</span>
  </button>
</template>
