<script setup lang="ts">
import { ref, watch } from "vue";
import DebugLogPanel from "./log/DebugLogPanel.vue";
import FateChoiceScreen from "./fate_choice/FateChoiceScreen.vue";
import MainScreen from "./components/main-screen/MainScreen.vue";
import { useSplash } from "./composables/useSplash";
import { gameLog } from "./log/gameLog";
import type { FateChoiceResult } from "./fate_choice/types";

const {
  apiModalOpen,
  saveModalOpen,
  apiUrl,
  apiKey,
  apiModel,
  apiStatus,
  apiStatusOk,
  saveStatus,
  saveStatusOk,
  saves,
  canStart,
  fmtTime,
  openApiSettings,
  closeApiSettings,
  saveApiSettings,
  clearApiSettings,
  testApiSettings,
  openSaveLoad,
  closeSaveLoad,
  refreshSaveList,
  loadSave,
  deleteSave,
  deleteAllSaves,
} = useSplash();

const fateChoiceVisible = ref(false);
const mainScreenVisible = ref(false);
const lastFateChoice = ref<FateChoiceResult | null>(null);

function openFateChoice() {
  fateChoiceVisible.value = true;
}

function closeFateChoice() {
  fateChoiceVisible.value = false;
}

function onFateChoiceComplete(payload: FateChoiceResult) {
  gameLog.info("[App] 命运抉择 JSON: " + JSON.stringify(payload, null, 2));
  lastFateChoice.value = payload;
  fateChoiceVisible.value = false;
  mainScreenVisible.value = true;
}

function onMainScreenBack() {
  mainScreenVisible.value = false;
}

function onApiBackdropKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeApiSettings();
    e.preventDefault();
  }
}

function onSaveBackdropKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeSaveLoad();
    e.preventDefault();
  }
}

watch(canStart, refreshGateTitles, { immediate: true });

function refreshGateTitles() {
  var tip = canStart.value ? "" : "请先在「API设置」中配置 API URL / Key / 模型（本地代理可不填 Key）。";
  var startBtn = document.getElementById("start-new-life-btn");
  var loadBtn = document.getElementById("load-life-btn");
  if (startBtn) {
    if (!canStart.value) startBtn.setAttribute("title", tip);
    else startBtn.removeAttribute("title");
  }
  if (loadBtn) {
    if (!canStart.value) loadBtn.setAttribute("title", tip);
    else loadBtn.removeAttribute("title");
  }
}
</script>

<template>
  <DebugLogPanel />
  <FateChoiceScreen :visible="fateChoiceVisible" @close="closeFateChoice" @complete="onFateChoiceComplete" />
  <MainScreen
    :visible="mainScreenVisible"
    :fate-choice="lastFateChoice"
    :api-url="apiUrl"
    :api-key="apiKey"
    :api-model="apiModel"
    @back="onMainScreenBack"
  />
  <div id="splash-screen" :class="{ hidden: mainScreenVisible }">
    <div id="splash-bg" aria-hidden="true"></div>

    <div id="splash-content">
      <h1 id="splash-title">凡人修仙传</h1>
      <p id="splash-info">作者: KAI&nbsp;&nbsp;|&nbsp;&nbsp;版本: 2.0.0</p>

      <div id="splash-buttons">
        <button
          id="start-new-life-btn"
          class="splash-btn"
          type="button"
          :disabled="!canStart"
          @click="openFateChoice"
        >
          开始新人生
        </button>
        <button
          id="load-life-btn"
          class="splash-btn"
          type="button"
          :disabled="!canStart"
          @click="openSaveLoad"
        >
          读取人生
        </button>
        <button class="splash-btn" id="api-settings-btn" type="button" @click="openApiSettings">API设置</button>
      </div>
    </div>
  </div>

  <div
    id="api-settings-root"
    class="splash-modal-root"
    :class="{ hidden: !apiModalOpen }"
    :aria-hidden="apiModalOpen ? 'false' : 'true'"
    @keydown="onApiBackdropKeydown"
  >
    <div class="splash-modal-backdrop" tabindex="-1" @click="closeApiSettings"></div>
    <div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
      <button type="button" class="splash-modal-close" aria-label="关闭" @click="closeApiSettings">×</button>
      <h3 id="api-settings-title" class="splash-modal-title">API 设置</h3>
      <p class="splash-modal-sub">
        目前仅支持OpenAI格式的api。
      </p>

      <div class="splash-form">
        <label class="splash-field">
          <span class="splash-field-k">API URL</span>
          <input v-model="apiUrl" class="splash-field-input" type="text" placeholder="https://api.example.com/v1" />
        </label>
        <label class="splash-field">
          <span class="splash-field-k">API Key</span>
          <input v-model="apiKey" class="splash-field-input" type="password" placeholder="sk-..." />
        </label>
        <label class="splash-field">
          <span class="splash-field-k">模型</span>
          <input v-model="apiModel" class="splash-field-input" type="text" placeholder="gpt-4.1-mini" />
        </label>
      </div>

      <div class="splash-modal-actions splash-modal-actions--3">
        <button type="button" class="splash-btn splash-btn--secondary" @click="clearApiSettings">清除</button>
        <button type="button" class="splash-btn splash-btn--secondary" @click="testApiSettings">测试</button>
        <button type="button" class="splash-btn" @click="saveApiSettings">保存</button>
      </div>
      <div
        id="api-settings-status"
        class="splash-modal-status"
        :class="{
          'splash-modal-status--ok': apiStatusOk && apiStatus,
          'splash-modal-status--bad': !apiStatusOk && apiStatus,
        }"
        aria-live="polite"
      >
        {{ apiStatus }}
      </div>
    </div>
  </div>

  <div
    id="save-load-root"
    class="splash-modal-root"
    :class="{ hidden: !saveModalOpen }"
    :aria-hidden="saveModalOpen ? 'false' : 'true'"
    @keydown="onSaveBackdropKeydown"
  >
    <div class="splash-modal-backdrop" tabindex="-1" @click="closeSaveLoad"></div>
    <div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="save-load-title">
      <button type="button" class="splash-modal-close" aria-label="关闭" @click="closeSaveLoad">×</button>
      <h3 id="save-load-title" class="splash-modal-title">读取人生</h3>
      <p class="splash-modal-sub">选择一个存档继续修行（存档保存在本机浏览器中）。</p>
      <div id="save-load-list" class="save-load-list">
        <p v-if="!saves.length" class="save-load-empty">暂无存档。请先在「开始新人生」里创建一个存档。</p>
        <div v-for="it in saves" :key="it.id" class="save-load-row">
          <div class="save-load-info">
            <p class="save-load-name">{{ it.name || it.id }}</p>
            <p class="save-load-meta">
              更新：{{ fmtTime(it.updatedAt) }} · 创建：{{ fmtTime(it.createdAt) }}
            </p>
          </div>
          <div class="save-load-actions">
            <button type="button" class="splash-btn" @click="loadSave(it)">读取</button>
            <button type="button" class="splash-btn splash-btn--secondary" @click="deleteSave(it)">删除</button>
          </div>
        </div>
      </div>
      <div class="splash-modal-actions splash-modal-actions--2">
        <button type="button" class="splash-btn splash-btn--secondary" @click="refreshSaveList">刷新</button>
        <button type="button" class="splash-btn splash-btn--secondary" @click="deleteAllSaves">清空</button>
      </div>
      <div
        id="save-load-status"
        class="splash-modal-status"
        :class="{
          'splash-modal-status--ok': saveStatusOk && saveStatus,
          'splash-modal-status--bad': !saveStatusOk && saveStatus,
        }"
        aria-live="polite"
      >
        {{ saveStatus }}
      </div>
    </div>
  </div>
</template>
