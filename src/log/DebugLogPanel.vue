<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import type { GameLogLine } from "./gameLog";
import { gameLog } from "./gameLog";

const showPanel = ref(gameLog.showPanel);
const lines = ref<GameLogLine[]>(gameLog.getLines());
const collapsed = ref(false);
const autoScroll = ref(true);
const bodyEl = ref<HTMLElement | null>(null);

let unsub = () => {};

function syncLines() {
  lines.value = gameLog.getLines();
  if (autoScroll.value) {
    nextTick(function () {
      const el = bodyEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}

function toggle() {
  collapsed.value = !collapsed.value;
}

function clear() {
  gameLog.clear();
  syncLines();
}

function copyAll() {
  const text = lines.value
    .map(function (row) {
      return row.time + " " + row.level.toUpperCase() + " " + row.text;
    })
    .join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch (_e) {}
  document.body.removeChild(ta);
}

onMounted(function () {
  unsub = gameLog.subscribe(syncLines);
  if (showPanel.value) {
    gameLog.info("[GameLog] 面板已就绪");
  }
});

onUnmounted(function () {
  unsub();
});
</script>

<template>
  <div
    v-if="showPanel"
    id="mj-log-panel"
    class="vue-debug-log-panel"
    role="region"
    aria-label="调试日志"
    :class="{ 'mj-log-panel--collapsed': collapsed }"
  >
    <div id="mj-log-header" title="点击折叠/展开" @click="toggle">
      <span id="mj-log-header-title">调试日志</span>
      <button
        id="mj-log-toggle"
        type="button"
        :aria-expanded="collapsed ? 'false' : 'true'"
        @click.stop="toggle"
      >
        {{ collapsed ? "\u25B2" : "\u25BC" }}
      </button>
    </div>
    <div id="mj-log-toolbar">
      <button id="mj-log-clear" type="button" @click="clear">清空</button>
      <button id="mj-log-copy" type="button" @click="copyAll">复制全部</button>
      <label>
        <input id="mj-log-autoscroll" v-model="autoScroll" type="checkbox" />
        自动滚动
      </label>
    </div>
    <div id="mj-log-body" ref="bodyEl">
      <div
        v-for="(row, idx) in lines"
        :key="idx"
        class="mj-log-line"
      >
        <span class="mj-log-time">{{ row.time }}</span>
        <span class="mj-log-level" :class="'mj-log-level--' + row.level">{{ row.level.toUpperCase() }}</span>
        <span class="mj-log-msg">{{ row.text }}</span>
      </div>
    </div>
  </div>
</template>
