<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from "vue";
import { worldMapStore } from "../role_core/worldMapStore";
import { npcStore } from "../role_core/npcStore";
import { locationImageStore } from "../role_core/locationImageStore";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { isWorldLocationEqual, formatWorldLocation } from "../role_core/types/worldLocation";
import type { Npc } from "../role_core/Npc";
import { npcColorTheme } from "../role_core/npcTheme";
import { favorBarGeometry, favorabilityLabel } from "./npcDetailPayload";
import { useScrollLock } from "../composables/useScrollLock";
import NpcDetailModal from "./NpcDetailModal.vue";
import PortraitHistoryModal from "./PortraitHistoryModal.vue";
import { generateLocationBackground, isImageApiConfigured } from "../image_generate";
import { writeActiveSave } from "../save/gameSave";

const props = defineProps<{
  open: boolean;
  currentLocation?: WorldLocation | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const scrollLock = useScrollLock();

const selectedRegion = ref("");
const selectedCountry = ref("");
const selectedArea = ref("");
const selectedDetail = ref("");

const detailOpen = ref(false);
const detailNpc = shallowRef<Npc | null>(null);

// ── 地点背景生成 ──────────────────────────────────────────────────────────
const generatingBg = ref(false);
const bgGenError = ref("");
const imageApiReady = computed(() => isImageApiConfigured());
const locationHistoryOpen = ref(false);

const locationImageData = computed(() => {
  const loc = selectedFullLocation.value;
  if (!loc) return null;
  return locationImageStore.get(loc) ?? null;
});

async function onGenerateLocationBg() {
  const loc = selectedFullLocation.value;
  if (!loc || generatingBg.value) return;
  generatingBg.value = true;
  bgGenError.value = "";
  try {
    const dataUrl = await generateLocationBackground(loc);
    locationImageStore.addCandidate(loc, dataUrl);
    writeActiveSave();
  } catch (err) {
    bgGenError.value = err instanceof Error ? err.message : "背景生成失败。";
  } finally {
    generatingBg.value = false;
  }
}

function onLocationUpload(dataUrl: string) {
  const loc = selectedFullLocation.value;
  if (!loc) return;
  locationImageStore.addCandidate(loc, dataUrl);
  writeActiveSave();
}

function onLocationSelect(url: string) {
  const loc = selectedFullLocation.value;
  if (!loc) return;
  locationImageStore.selectCandidate(loc, url);
  writeActiveSave();
}

function onLocationRemove(url: string) {
  const loc = selectedFullLocation.value;
  if (!loc) return;
  locationImageStore.removeCandidate(loc, url);
  writeActiveSave();
}

const regions = computed(() => worldMapStore.getRegions());

const countries = computed(() => {
  if (!selectedRegion.value) return [];
  return worldMapStore.getCountries(selectedRegion.value);
});

const areas = computed(() => {
  if (!selectedRegion.value || !selectedCountry.value) return [];
  return worldMapStore.getAreas(selectedRegion.value, selectedCountry.value);
});

const details = computed(() => {
  if (!selectedRegion.value || !selectedCountry.value || !selectedArea.value) return [];
  return worldMapStore.getDetails(selectedRegion.value, selectedCountry.value, selectedArea.value);
});

const selectedFullLocation = computed<WorldLocation | null>(() => {
  if (!selectedRegion.value || !selectedCountry.value || !selectedArea.value || !selectedDetail.value) return null;
  return {
    region: selectedRegion.value,
    country: selectedCountry.value,
    area: selectedArea.value,
    detail: selectedDetail.value,
  };
});

// 直接查 npcStore 按 currentLocation 过滤——单一数据源，避免与 locationNpcMap 不同步。
const npcEntries = computed(() => {
  const loc = selectedFullLocation.value;
  if (!loc) return [];
  return npcStore.allNpcs()
    .filter(n => n.currentLocation && isWorldLocationEqual(n.currentLocation, loc))
    .map(npc => ({ npc, name: npc.displayName }));
});

function selectRegion(r: string) {
  selectedRegion.value = r;
  selectedCountry.value = "";
  selectedArea.value = "";
  selectedDetail.value = "";
}

function selectCountry(c: string) {
  selectedCountry.value = c;
  selectedArea.value = "";
  selectedDetail.value = "";
}

function selectArea(a: string) {
  selectedArea.value = a;
  selectedDetail.value = "";
}

function selectDetail(d: string) {
  selectedDetail.value = d;
}

function autoSelectCurrentLocation() {
  const loc = props.currentLocation;
  if (!loc) return;
  if (loc.region) selectedRegion.value = loc.region;
  if (loc.country) selectedCountry.value = loc.country;
  if (loc.area) selectedArea.value = loc.area;
  if (loc.detail) selectedDetail.value = loc.detail;
}

function isCurrentRegion(r: string): boolean {
  const loc = props.currentLocation;
  return !!loc && !!loc.region && r === loc.region;
}

function isCurrentCountry(c: string): boolean {
  const loc = props.currentLocation;
  return !!loc && selectedRegion.value === loc.region && !!loc.country && c === loc.country;
}

function isCurrentArea(a: string): boolean {
  const loc = props.currentLocation;
  return (
    !!loc &&
    selectedRegion.value === loc.region &&
    selectedCountry.value === loc.country &&
    !!loc.area &&
    a === loc.area
  );
}

function isCurrentDetail(d: string): boolean {
  const loc = props.currentLocation;
  if (!loc) return false;
  return isWorldLocationEqual(
    { region: selectedRegion.value, country: selectedCountry.value, area: selectedArea.value, detail: d },
    loc,
  );
}

function openNpcDetail(npc: NonNullable<ReturnType<typeof npcStore.getNpc>>) {
  detailNpc.value = npc;
  detailOpen.value = true;
}

function closeNpcDetail() {
  detailOpen.value = false;
  detailNpc.value = null;
}

function onBackdropClick() {
  emit("close");
}

function onCloseClick() {
  emit("close");
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && props.open && !detailOpen.value) {
    ev.preventDefault();
    emit("close");
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      scrollLock.acquire();
      autoSelectCurrentLocation();
    } else {
      scrollLock.release();
    }
  },
);

onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="mj-backdrop">
      <div
        v-if="open"
        class="side-modal-overlay"
        role="presentation"
        aria-hidden="false"
      >
        <div
          class="side-modal-overlay__backdrop"
          tabindex="-1"
          aria-label="关闭"
          @click="onBackdropClick"
        />
        <Transition name="mj-modal" appear>
          <div
            class="side-modal side-modal--map"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="side-modal__header">
              <h4 class="side-modal__title">世界地图</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>
            <div class="side-modal__body map-panel">
              <div class="map-cascader">
                <div class="map-cascader__column">
                  <div class="map-cascader__label">大区域</div>
                  <div class="map-cascader__list">
                    <button
                      v-for="r in regions"
                      :key="r"
                      type="button"
                      class="map-loc-btn"
                      :class="{ 'map-loc-btn--active': selectedRegion === r, 'map-loc-btn--current': isCurrentRegion(r) }"
                      @click="selectRegion(r)"
                    >{{ r }}</button>
                    <div v-if="regions.length === 0" class="map-panel__empty">暂无</div>
                  </div>
                </div>
                <div class="map-cascader__column">
                  <div class="map-cascader__label">国家/势力</div>
                  <div class="map-cascader__list">
                    <button
                      v-for="c in countries"
                      :key="c"
                      type="button"
                      class="map-loc-btn"
                      :class="{ 'map-loc-btn--active': selectedCountry === c, 'map-loc-btn--current': isCurrentCountry(c) }"
                      @click="selectCountry(c)"
                    >{{ c }}</button>
                    <div v-if="countries.length === 0" class="map-panel__empty">—</div>
                  </div>
                </div>
                <div class="map-cascader__column">
                  <div class="map-cascader__label">区域/宗门</div>
                  <div class="map-cascader__list">
                    <button
                      v-for="a in areas"
                      :key="a"
                      type="button"
                      class="map-loc-btn"
                      :class="{ 'map-loc-btn--active': selectedArea === a, 'map-loc-btn--current': isCurrentArea(a) }"
                      @click="selectArea(a)"
                    >{{ a }}</button>
                    <div v-if="areas.length === 0" class="map-panel__empty">—</div>
                  </div>
                </div>
                <div class="map-cascader__column">
                  <div class="map-cascader__label">具体地点</div>
                  <div class="map-cascader__list">
                    <button
                      v-for="d in details"
                      :key="d"
                      type="button"
                      class="map-loc-btn"
                      :class="{ 'map-loc-btn--active': selectedDetail === d, 'map-loc-btn--current': isCurrentDetail(d) }"
                      @click="selectDetail(d)"
                    >{{ d }}</button>
                    <div v-if="details.length === 0" class="map-panel__empty">—</div>
                  </div>
                </div>
              </div>
              <div class="map-panel__npcs">
                <div class="map-cascader__label">场景NPC</div>
                <div v-if="selectedFullLocation" class="map-location-bg">
                  <div class="map-location-bg-preview">
                    <img
                      v-if="locationImageData?.avatarUrl"
                      :src="locationImageData.avatarUrl"
                      class="map-location-bg-img"
                      alt="地点背景"
                    />
                    <div v-else class="map-location-bg-placeholder">暂无背景</div>
                  </div>
                  <div class="map-location-bg-actions">
                    <button
                      type="button"
                      class="main-screen__btn map-location-gen-btn"
                      :disabled="!imageApiReady || generatingBg"
                      :title="imageApiReady ? '生成地点背景' : '未配置文生图'"
                      @click="onGenerateLocationBg"
                    >{{ generatingBg ? '生成中…' : '✨ 生成背景' }}</button>
                    <button
                      type="button"
                      class="main-screen__btn map-location-hist-btn"
                      title="管理历史背景"
                      @click="locationHistoryOpen = true"
                    >📜 历史<span v-if="locationImageData?.avatarCandidates.length" class="map-location-hist-count">{{ locationImageData.avatarCandidates.length }}</span></button>
                  </div>
                  <p v-if="!imageApiReady" class="map-location-bg-hint">未配置文生图</p>
                  <p v-if="bgGenError" class="map-location-bg-error">{{ bgGenError }}</p>
                </div>
                <template v-if="!selectedFullLocation">
                  <div class="map-panel__empty">请选择完整地点查看NPC</div>
                </template>
                <template v-else-if="npcEntries.length === 0">
                  <div class="map-panel__empty">暂无NPC记录</div>
                </template>
                <template v-else>
                  <div
                    v-for="entry in npcEntries"
                    :key="entry.name"
                    class="map-npc-card"
                    :class="{ 'map-npc-card--dead': entry.npc?.isDead }"
                    :data-npc-theme="entry.npc ? npcColorTheme(entry.npc.gender, entry.npc.race) : 'default'"
                    @click="entry.npc && openNpcDetail(entry.npc)"
                  >
                    <div class="map-npc-avatar">
                      <img v-if="entry.npc?.avatarUrl" class="map-npc-avatar-img" :src="entry.npc.avatarUrl" :alt="entry.name" />
                      <span v-else class="map-npc-avatar-placeholder">
                        {{ entry.name.slice(0, 1) }}
                      </span>
                    </div>
                    <div class="map-npc-info">
                      <div class="map-npc-top">
                        <span class="map-npc-name">
                          <template v-if="entry.npc?.isDead">
                            <s>{{ entry.name }}</s>
                          </template>
                          <template v-else>{{ entry.name }}</template>
                        </span>
                        <span v-if="entry.npc" class="map-npc-realm">
                          {{ entry.npc.realm.major }}{{ entry.npc.realm.minor }}
                        </span>
                      </div>
                      <div class="map-npc-identity">
                        {{ entry.npc?.identity ?? "未知" }}
                        <span v-if="entry.npc?.relation" class="map-npc-relation">{{ entry.npc.relation }}</span>
                      </div>
                      <div v-if="entry.npc" class="map-npc-bars">
                        <div class="map-npc-bar-row">
                          <span class="map-npc-bar-label">HP</span>
                          <div class="map-npc-bar">
                            <div
                              class="map-npc-bar-fill map-npc-bar-fill--hp"
                              :style="{ width: (entry.npc.maxHp > 0 ? Math.round(entry.npc.currentHp / entry.npc.maxHp * 100) : 0) + '%' }"
                            />
                          </div>
                        </div>
                        <div class="map-npc-bar-row">
                          <span class="map-npc-bar-label">MP</span>
                          <div class="map-npc-bar">
                            <div
                              class="map-npc-bar-fill map-npc-bar-fill--mp"
                              :style="{ width: (entry.npc.maxMp > 0 ? Math.round(entry.npc.currentMp / entry.npc.maxMp * 100) : 0) + '%' }"
                            />
                          </div>
                        </div>
                        <div class="map-npc-bar-row" :title="`好感 ${entry.npc.favorability}（${favorabilityLabel(entry.npc.favorability)}）`">
                          <span class="map-npc-bar-label">好感</span>
                          <div class="map-npc-bar map-npc-bar--favor">
                            <div
                              class="map-npc-bar-fill map-npc-bar-fill--favor"
                              :class="favorBarGeometry(entry.npc.favorability).side === 'negative'
                                ? 'map-npc-bar-fill--favor-neg'
                                : 'map-npc-bar-fill--favor-pos'"
                              :style="{ width: favorBarGeometry(entry.npc.favorability).widthPct + '%' }"
                            />
                          </div>
                          <span class="map-npc-favor-value">{{ entry.npc.favorability }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
    <NpcDetailModal
      :open="detailOpen"
      :npc="detailNpc"
      @close="closeNpcDetail"
    />
    <PortraitHistoryModal
      :open="locationHistoryOpen && !!selectedFullLocation"
      :display-name="selectedFullLocation ? formatWorldLocation(selectedFullLocation) : ''"
      :candidates="locationImageData?.avatarCandidates ?? []"
      :avatar-url="locationImageData?.avatarUrl ?? ''"
      aspect-ratio="4/3"
      @close="locationHistoryOpen = false"
      @select="onLocationSelect"
      @remove="onLocationRemove"
      @upload="onLocationUpload"
    />
  </Teleport>
</template>

<style scoped>
.map-npc-card--dead {
  opacity: 0.45;
}
</style>
