<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import type { GameLogLine } from "./gameLog";
import { gameLog, AI_DIRECTION_LABEL } from "./gameLog";

const showPanel = ref(gameLog.showPanel);
const lines = ref<GameLogLine[]>(gameLog.getLines());
const collapsed = ref(true);
const enlarged = ref(false);
const autoScroll = ref(true);
const bodyEl = ref<HTMLElement | null>(null);
const expandedLines = ref(new Set<number>());

let unsub = () => {};

function isAiLine(row: GameLogLine): boolean {
  return row.category != null;
}

/** 根据分类返回徽章配色组名，用于 CSS 类。 */
function badgeGroup(category: string): string {
  if (!category) return "default";
  if (category === "剧情生成" || category === "开局剧情" || category === "结局") return "story";
  if (category.startsWith("状态更新") || category === "开局状态") return "state";
  if (category === "修炼") return "cultivation";
  if (category === "图片生成") return "image";
  if (category === "API测试") return "api";
  if (category === "NPC重评估" || category === "叙事方向" || category === "大总结") return "aux";
  return "default";
}

function directionLabel(row: GameLogLine): string {
  return row.direction ? AI_DIRECTION_LABEL[row.direction] : "";
}

function toggleExpand(idx: number) {
  const s = new Set(expandedLines.value);
  if (s.has(idx)) {
    s.delete(idx);
  } else {
    s.add(idx);
  }
  expandedLines.value = s;
}

function syncLines() {
  lines.value = gameLog.getLines();
  expandedLines.value = new Set();
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

function toggleEnlarge() {
  enlarged.value = !enlarged.value;
  if (autoScroll.value) {
    nextTick(function () {
      const el = bodyEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}

function clear() {
  gameLog.clear();
  syncLines();
}

function copyAll() {
  const text = lines.value
    .map(function (row) {
      const cat = row.category ? `[${row.category} ${directionLabel(row)}] ` : "";
      return row.time + " " + row.level.toUpperCase() + " " + cat + row.text;
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
    :class="{ 'mj-log-panel--collapsed': collapsed, 'mj-log-panel--enlarged': enlarged }"
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
      <button id="mj-log-enlarge" type="button" @click="toggleEnlarge">
        {{ enlarged ? "\u8FD8\u539F" : "\u653E\u5927" }}
      </button>
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
        :class="{ 'mj-log-line--ai': isAiLine(row), 'mj-log-line--ai-expanded': isAiLine(row) && expandedLines.has(idx) }"
      >
        <span class="mj-log-time">{{ row.time }}</span>
        <span class="mj-log-level" :class="'mj-log-level--' + row.level">{{ row.level.toUpperCase() }}</span>
        <template v-if="isAiLine(row)">
          <span class="mj-log-badge" :class="'mj-log-badge--' + badgeGroup(row.category || '')">{{ row.category }}</span>
          <span class="mj-log-dir" :class="'mj-log-dir--' + row.direction">{{ directionLabel(row) }}</span>
          <span class="mj-log-ai-toggle" @click="toggleExpand(idx)">
            <template v-if="expandedLines.has(idx)">▼ 收起</template>
            <template v-else>▶ 点击展开</template>
          </span>
          <div v-if="expandedLines.has(idx)" class="mj-log-ai-content">{{ row.text }}</div>
        </template>
        <template v-else>
          <span class="mj-log-msg">{{ row.text }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
