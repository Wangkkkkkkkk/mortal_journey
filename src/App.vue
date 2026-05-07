<script setup lang="ts">
import { ref } from "vue";
import DebugLogPanel from "./log/DebugLogPanel.vue";
import StartFrame from "./start_frame/StartFrame.vue";
import FateChoiceScreen from "./fate_choice/FateChoiceScreen.vue";
import MainScreen from "./components/main-screen/MainScreen.vue";
import { useSplash } from "./start_frame/useSplash";
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
</script>

<template>
  <DebugLogPanel />
  <StartFrame
    :main-screen-visible="mainScreenVisible"
    :can-start="canStart"
    :api-modal-open="apiModalOpen"
    :save-modal-open="saveModalOpen"
    :api-url="apiUrl"
    :api-key="apiKey"
    :api-model="apiModel"
    :api-status="apiStatus"
    :api-status-ok="apiStatusOk"
    :save-status="saveStatus"
    :save-status-ok="saveStatusOk"
    :saves="saves"
    :fmt-time="fmtTime"
    @start-new-life="openFateChoice"
    @open-save-load="openSaveLoad"
    @open-api-settings="openApiSettings"
    @close-api-settings="closeApiSettings"
    @save-api-settings="saveApiSettings"
    @clear-api-settings="clearApiSettings"
    @test-api-settings="testApiSettings"
    @close-save-load="closeSaveLoad"
    @refresh-save-list="refreshSaveList"
    @load-save="loadSave"
    @delete-save="deleteSave"
    @delete-all-saves="deleteAllSaves"
    @update:api-url="apiUrl = $event"
    @update:api-key="apiKey = $event"
    @update:api-model="apiModel = $event"
  />
  <FateChoiceScreen :visible="fateChoiceVisible" @close="closeFateChoice" @complete="onFateChoiceComplete" />
  <MainScreen
    :visible="mainScreenVisible"
    :fate-choice="lastFateChoice"
    :api-url="apiUrl"
    :api-key="apiKey"
    :api-model="apiModel"
    @back="onMainScreenBack"
  />
</template>
