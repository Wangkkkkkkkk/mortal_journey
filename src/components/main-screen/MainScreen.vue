<script setup lang="ts">
import { computed, toRef } from "vue";
import { useOpeningStoryFromFateChoice } from "../../composables/useOpeningStory";
import { protagonist } from "../../lib/protagonistManager";
import type { FateChoiceResult } from "../../fate_choice/types";
import SideToolbarPanel from "./SideToolbarPanel.vue";
import PlayerInfoPanel from "./PlayerInfoPanel.vue";
import StoryChatPanel from "./StoryChatPanel.vue";

const props = defineProps<{
  visible: boolean;
  fateChoice?: FateChoiceResult | null;
  apiUrl?: string;
  apiKey?: string;
  apiModel?: string;
}>();

const fateChoiceRef = toRef(props, "fateChoice");
const apiSlice = computed(() => ({
  apiUrl: props.apiUrl ?? "",
  apiKey: props.apiKey ?? "",
  apiModel: props.apiModel ?? "",
}));

const { storyBody, phase, errorMessage, worldTime, worldTimeBaseline, worldLocation } =
  useOpeningStoryFromFateChoice(fateChoiceRef, apiSlice);

const emit = defineEmits<{
  back: [];
}>();

function onBack() {
  emit("back");
}
</script>

<template>
  <div
    v-show="visible"
    class="main-screen"
    role="application"
    aria-label="凡人修仙传主界面"
  >
    <header class="main-screen__toolbar">
      <h1 class="main-screen__title">凡人修仙传</h1>
      <div class="main-screen__toolbar-actions">
        <button type="button" class="main-screen__btn" @click="onBack">返回标题</button>
      </div>
    </header>
    <div class="main-screen__body">
      <aside class="main-screen__pane main-screen__pane--player" aria-label="左栏：主角与世界时间">
        <PlayerInfoPanel
          :protagonist="protagonist"
          :world-time="worldTime"
          :world-time-baseline="worldTimeBaseline"
        />
      </aside>
      <main class="main-screen__pane main-screen__pane--chat" aria-label="中栏：剧情">
        <StoryChatPanel
          :story-text="storyBody"
          :phase="phase"
          :error-message="errorMessage"
          :api-url="props.apiUrl"
          :api-key="props.apiKey"
          :api-model="props.apiModel"
          :current-world-location="worldLocation"
          @update:world-location="worldLocation = $event"
        />
      </main>
      <aside class="main-screen__pane main-screen__pane--side" aria-label="右栏：功能面板">
        <SideToolbarPanel />
      </aside>
    </div>
  </div>
</template>
