<script setup lang="ts">
import { watch } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { SaveIndexEntry } from "./useSplash";
import "./start_frame.css";

const props = defineProps<{
  mainScreenVisible: boolean;
  canStart: boolean;
  apiModalOpen: boolean;
  saveModalOpen: boolean;
  apiUrl: string;
  apiKey: string;
  apiModel: string;
  apiStatus: string;
  apiStatusOk: boolean;
  saveStatus: string;
  saveStatusOk: boolean;
  saves: SaveIndexEntry[];
  fmtTime: (ts: number | undefined) => string;
}>();

const emit = defineEmits<{
  (e: "start-new-life"): void;
  (e: "open-save-load"): void;
  (e: "open-api-settings"): void;
  (e: "close-api-settings"): void;
  (e: "save-api-settings"): void;
  (e: "clear-api-settings"): void;
  (e: "test-api-settings"): void;
  (e: "close-save-load"): void;
  (e: "refresh-save-list"): void;
  (e: "load-save", it: SaveIndexEntry): void;
  (e: "delete-save", it: SaveIndexEntry): void;
  (e: "delete-all-saves"): void;
  (e: "update:apiUrl", value: string): void;
  (e: "update:apiKey", value: string): void;
  (e: "update:apiModel", value: string): void;
}>();

watch(
  () => props.canStart,
  () => {
    const tip = props.canStart
      ? ""
      : "请先在「API设置」中配置 API URL / Key / 模型（本地代理可不填 Key）。";
    const startBtn = document.getElementById("start-new-life-btn");
    const loadBtn = document.getElementById("load-life-btn");
    if (startBtn) {
      if (!props.canStart) startBtn.setAttribute("title", tip);
      else startBtn.removeAttribute("title");
    }
    if (loadBtn) {
      if (!props.canStart) loadBtn.setAttribute("title", tip);
      else loadBtn.removeAttribute("title");
    }
  },
  { immediate: true },
);

function onApiBackdropKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close-api-settings");
    e.preventDefault();
  }
}

function onSaveBackdropKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close-save-load");
    e.preventDefault();
  }
}
</script>

<template>
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
          @click="emit('start-new-life')"
        >
          开始新人生
        </button>
        <button
          id="load-life-btn"
          class="splash-btn"
          type="button"
          :disabled="!canStart"
          @click="emit('open-save-load')"
        >
          读取人生
        </button>
        <button class="splash-btn" id="api-settings-btn" type="button" @click="emit('open-api-settings')">
          API设置
        </button>
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
    <div class="splash-modal-backdrop" tabindex="-1" @click="emit('close-api-settings')"></div>
    <div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
      <button type="button" class="splash-modal-close" aria-label="关闭" @click="emit('close-api-settings')">×</button>
      <h3 id="api-settings-title" class="splash-modal-title">API 设置</h3>
      <p class="splash-modal-sub">目前仅支持OpenAI格式的api。</p>

      <div class="splash-form">
        <label class="splash-field">
          <span class="splash-field-k">API URL</span>
          <input
            :value="apiUrl"
            class="splash-field-input"
            type="text"
            placeholder="https://api.example.com/v1"
            @input="emit('update:apiUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="splash-field">
          <span class="splash-field-k">API Key</span>
          <input
            :value="apiKey"
            class="splash-field-input"
            type="password"
            placeholder="sk-..."
            @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="splash-field">
          <span class="splash-field-k">模型</span>
          <input
            :value="apiModel"
            class="splash-field-input"
            type="text"
            placeholder="gpt-4.1-mini"
            @input="emit('update:apiModel', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <div class="splash-modal-actions splash-modal-actions--3">
        <button type="button" class="splash-btn splash-btn--secondary" @click="emit('clear-api-settings')">
          清除
        </button>
        <button type="button" class="splash-btn splash-btn--secondary" @click="emit('test-api-settings')">
          测试
        </button>
        <button type="button" class="splash-btn" @click="emit('save-api-settings')">保存</button>
      </div>
      <div
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
    <div class="splash-modal-backdrop" tabindex="-1" @click="emit('close-save-load')"></div>
    <div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="save-load-title">
      <button type="button" class="splash-modal-close" aria-label="关闭" @click="emit('close-save-load')">×</button>
      <h3 id="save-load-title" class="splash-modal-title">读取人生</h3>
      <p class="splash-modal-sub">选择一个存档继续修行（存档保存在本机浏览器中）。</p>
      <div class="save-load-list">
        <p v-if="!saves.length" class="save-load-empty">暂无存档。请先在「开始新人生」里创建一个存档。</p>
        <div v-for="it in saves" :key="it.id" class="save-load-row">
          <div class="save-load-info">
            <p class="save-load-name">{{ it.name || it.id }}</p>
            <p class="save-load-meta">更新：{{ fmtTime(it.updatedAt) }} · 创建：{{ fmtTime(it.createdAt) }}</p>
          </div>
          <div class="save-load-actions">
            <button type="button" class="splash-btn" @click="emit('load-save', it)">读取</button>
            <button type="button" class="splash-btn splash-btn--secondary" @click="emit('delete-save', it)">
              删除
            </button>
          </div>
        </div>
      </div>
      <div class="splash-modal-actions splash-modal-actions--2">
        <button type="button" class="splash-btn splash-btn--secondary" @click="emit('refresh-save-list')">
          刷新
        </button>
        <button type="button" class="splash-btn splash-btn--secondary" @click="emit('delete-all-saves')">清空</button>
      </div>
      <div
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
