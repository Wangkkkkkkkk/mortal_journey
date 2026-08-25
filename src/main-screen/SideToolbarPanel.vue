<script setup lang="ts">
import { ref } from "vue";
import type { WorldLocation } from "../role_core/types/worldLocation";
import WorldMapModal from "./WorldMapModal.vue";
import AlchemyModal from "./AlchemyModal.vue";
import PoisonModal from "./PoisonModal.vue";
import CoatModal from "./CoatModal.vue";
import ForgeModal from "./ForgeModal.vue";
import RefineModal from "./RefineModal.vue";
import CookModal from "./CookModal.vue";

const props = defineProps<{
  currentLocation?: WorldLocation | null;
  testDisabled?: boolean;
}>();

const emit = defineEmits<{
  testBattle: [];
}>();

const mapModalOpen = ref(false);
const alchemyModalOpen = ref(false);
const poisonModalOpen = ref(false);
const coatModalOpen = ref(false);
const forgeModalOpen = ref(false);
const refineModalOpen = ref(false);
const cookModalOpen = ref(false);

function openMapModal() {
  mapModalOpen.value = true;
}

function closeMapModal() {
  mapModalOpen.value = false;
}

function openAlchemyModal() {
  alchemyModalOpen.value = true;
}

function closeAlchemyModal() {
  alchemyModalOpen.value = false;
}

function openPoisonModal() {
  poisonModalOpen.value = true;
}

function closePoisonModal() {
  poisonModalOpen.value = false;
}

function openCoatModal() {
  coatModalOpen.value = true;
}

function closeCoatModal() {
  coatModalOpen.value = false;
}

function openForgeModal() {
  forgeModalOpen.value = true;
}

function closeForgeModal() {
  forgeModalOpen.value = false;
}

function openRefineModal() {
  refineModalOpen.value = true;
}

function closeRefineModal() {
  refineModalOpen.value = false;
}

function openCookModal() {
  cookModalOpen.value = true;
}

function closeCookModal() {
  cookModalOpen.value = false;
}
</script>

<template>
  <section class="main-panel main-panel--side" aria-label="功能面板">
    <div class="main-panel__body">
      <div class="side-btn-group">
        <button type="button" class="main-screen__btn side-btn" @click="openMapModal">世界地图</button>
        <button type="button" class="main-screen__btn side-btn" @click="openAlchemyModal">炼丹</button>
        <button type="button" class="main-screen__btn side-btn" @click="openPoisonModal">制毒</button>
        <button type="button" class="main-screen__btn side-btn" @click="openCoatModal">淬毒</button>
        <button type="button" class="main-screen__btn side-btn" @click="openForgeModal">锻造</button>
        <button type="button" class="main-screen__btn side-btn" @click="openRefineModal">精炼</button>
        <button type="button" class="main-screen__btn side-btn" @click="openCookModal">烹饪</button>
        <button type="button" class="main-screen__btn side-btn" @click="emit('testBattle')" :disabled="props.testDisabled">战斗测试</button>
      </div>
    </div>
    <WorldMapModal
      :open="mapModalOpen"
      :current-location="props.currentLocation"
      @close="closeMapModal"
    />
    <AlchemyModal
      :open="alchemyModalOpen"
      @close="closeAlchemyModal"
    />
    <PoisonModal
      :open="poisonModalOpen"
      @close="closePoisonModal"
    />
    <CoatModal
      :open="coatModalOpen"
      @close="closeCoatModal"
    />
    <ForgeModal
      :open="forgeModalOpen"
      @close="closeForgeModal"
    />
    <RefineModal
      :open="refineModalOpen"
      @close="closeRefineModal"
    />
    <CookModal
      :open="cookModalOpen"
      @close="closeCookModal"
    />
  </section>
</template>

<style scoped>
.side-btn {
  width: 100%;
  margin-bottom: 6px;
}

.side-btn:disabled {
  color: #888;
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
