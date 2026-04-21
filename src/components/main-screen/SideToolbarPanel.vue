<script setup lang="ts">
/**
 * 右栏：功能按钮面板。后续各按钮点击后可展开对应面板（弹窗/抽屉/内嵌）。
 * 世界地图弹窗：左侧为到访地点列表，右侧为选中地点的 NPC 列表。
 */
import { ref, computed } from "vue";
import { worldLocationSnapshots } from "../../lib/npcManager";

const showWorldMap = ref(false);
const selectedLocation = ref<string | null>(null);

const locations = computed(() => worldLocationSnapshots.value.map((s) => s.name));

const selectedNpcs = computed(() => {
  if (!selectedLocation.value) return [];
  const snapshot = worldLocationSnapshots.value.find(
    (s) => s.name === selectedLocation.value,
  );
  return snapshot ? snapshot.npcs : [];
});

function openWorldMap() {
  showWorldMap.value = true;
  if (!selectedLocation.value && locations.value.length > 0) {
    selectedLocation.value = locations.value[0];
  }
}

function closeWorldMap() {
  showWorldMap.value = false;
}

function selectLocation(name: string) {
  selectedLocation.value = name;
}

function onNpcClick(_npcName: string) {
  // 后续：打开 NPC 详情面板
}
</script>

<template>
  <section class="main-panel main-panel--side" aria-label="功能面板">
    <div class="main-panel__body">
      <div class="side-btn-group">
        <button type="button" class="side-btn" @click="openWorldMap">
          <span class="side-btn__icon">🗺</span>
          <span class="side-btn__label">世界地图</span>
        </button>
      </div>

      <Teleport to="body">
        <div v-if="showWorldMap" class="side-modal-overlay" @click.self="closeWorldMap">
          <div class="side-modal side-modal--map">
            <header class="side-modal__header">
              <h3 class="side-modal__title">世界地图</h3>
              <button type="button" class="side-modal__close" @click="closeWorldMap">✕</button>
            </header>
            <div class="side-modal__body map-panel">
              <aside class="map-panel__locations">
                <template v-if="locations.length > 0">
                  <button
                    v-for="loc in locations"
                    :key="loc"
                    type="button"
                    class="map-loc-btn"
                    :class="{ 'map-loc-btn--active': loc === selectedLocation }"
                    @click="selectLocation(loc)"
                  >
                    {{ loc }}
                  </button>
                </template>
                <p v-else class="map-panel__empty">暂无到访地点</p>
              </aside>
              <section class="map-panel__npcs">
                <template v-if="selectedNpcs.length > 0">
                  <button
                    v-for="npc in selectedNpcs"
                    :key="npc.id"
                    type="button"
                    class="map-npc-btn"
                    @click="onNpcClick(npc.displayName)"
                  >
                    {{ npc.displayName }}
                  </button>
                </template>
                <p v-else-if="selectedLocation" class="map-panel__empty">该地点暂无NPC</p>
                <p v-else class="map-panel__empty">请选择一个地点</p>
              </section>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </section>
</template>
