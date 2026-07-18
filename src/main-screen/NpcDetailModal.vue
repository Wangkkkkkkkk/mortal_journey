<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from "vue";
import type { Npc } from "../role_core/Npc";
import { Character } from "../role_core/Character";
import {
  PRIMARY_STAT_KEY_TO_ZH,
  PRIMARY_STAT_KEYS,
  type EquipSlotKey,
} from "../role_core/types/playInfo";
import { computeLinggenCombatBonuses } from "../role_core/types/gameConstants";
import type { GongfaItemDefinition } from "../role_core/types/items";
import {
  buildWearableDetailPayload,
  buildGongfaDetailPayload,
  buildInventoryStackDetailPayload,
  type ProtagonistDetailPayload,
  type DerivedStatValues,
} from "./protagonistDetailPayload";
import {
  treasureCellName,
  gongfaCellName,
  gongfaMasteryLabel,
  gradeToTraitRarity,
  inventorySlotParts,
  getInventoryBagDisplaySlots,
} from "./protagonistPanelDisplay";
import ProtagonistDetailModal from "./ProtagonistDetailModal.vue";
import { useScrollLock } from "../composables/useScrollLock";
import { writeActiveSave } from "../save/gameSave";
import { npcStore } from "../role_core/npcStore";
import { npcColorTheme } from "../role_core/npcTheme";
import { generateNpcPortrait, isImageApiConfigured } from "../image_generate";
import PortraitHistoryModal from "./PortraitHistoryModal.vue";

const props = defineProps<{
  open: boolean;
  npc: Npc | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const scrollLock = useScrollLock();

const itemDetailOpen = ref(false);
const itemDetailPayload = shallowRef<ProtagonistDetailPayload | null>(null);

// ── NPC 文生图（立绘生成 / 候选池切换）──────────────────────────────────────
const generatingPortrait = ref(false);
const portraitGenError = ref("");
const imageApiReady = computed(() => isImageApiConfigured());

/** 历史立绘弹窗是否打开。 */
const historyModalOpen = ref(false);
function openHistoryModal() {
  historyModalOpen.value = true;
}
function closeHistoryModal() {
  historyModalOpen.value = false;
}

/** 重新生成一张立绘：追加到候选池并自动选用（已有立绘也可重生）。 */
async function onGeneratePortrait() {
  const npc = props.npc;
  if (!npc || generatingPortrait.value) return;
  generatingPortrait.value = true;
  portraitGenError.value = "";
  try {
    const dataUrl = await generateNpcPortrait(npc);
    npc.addPortraitCandidate(dataUrl);
    npcStore.setNpc(npc);
    writeActiveSave();
  } catch (err) {
    portraitGenError.value = err instanceof Error ? err.message : "立绘生成失败。";
  } finally {
    generatingPortrait.value = false;
  }
}

/** 从候选池切换当前立绘。 */
function onSelectCandidate(url: string) {
  const npc = props.npc;
  if (!npc) return;
  npc.selectPortrait(url);
  npcStore.setNpc(npc);
  writeActiveSave();
}

/** 从候选池删除一张立绘。 */
function onRemoveCandidate(url: string) {
  const npc = props.npc;
  if (!npc) return;
  npc.removePortraitCandidate(url);
  npcStore.setNpc(npc);
  writeActiveSave();
}

function onHistoryUpload(dataUrl: string) {
  const npc = props.npc;
  if (!npc) return;
  npc.addPortraitCandidate(dataUrl);
  npcStore.setNpc(npc);
  writeActiveSave();
}

const primaryStats = computed(() => props.npc?.getPrimaryStats() ?? null);

const npcTheme = computed(() =>
  props.npc ? npcColorTheme(props.npc.gender, props.npc.race) : "default",
);

const equipSlots = computed(() => {
  const npc = props.npc;
  if (!npc) return [];
  const rows: Array<{ key: EquipSlotKey; item: typeof npc.equippedSlots[0] }> = [];
  for (let i = 0; i < npc.equippedSlots.length; i++) {
    rows.push({ key: i as EquipSlotKey, item: npc.equippedSlots[i] });
  }
  return rows;
});

const gongfaSlots = computed(() => props.npc?.gongfaSlots ?? []);
const bagSlots = computed(() => getInventoryBagDisplaySlots(props.npc?.inventorySlots ?? null));

function getNpcDerivedStats(npc: Npc): DerivedStatValues {
  const ps = npc.getPrimaryStats();
  return {
    physique: ps.physique,
    spirit: ps.spirit,
    strength: ps.strength,
    perception: ps.perception,
    guard: ps.guard,
    resistance: ps.resistance,
    agility: ps.agility,
    insight: ps.insight,
  };
}

function openEquipDetail(key: EquipSlotKey) {
  const npc = props.npc;
  if (!npc) return;
  const it = npc.equippedSlots[key];
  if (!it) return;
  itemDetailPayload.value = buildWearableDetailPayload(it);
  itemDetailOpen.value = true;
}

function openGongfaDetail(index: number) {
  const npc = props.npc;
  if (!npc) return;
  const cell = npc.gongfaSlots[index];
  if (!cell) return;
  itemDetailPayload.value = buildGongfaDetailPayload(cell, undefined, npc.linggen, undefined, undefined, () => getNpcDerivedStats(npc), computeLinggenCombatBonuses(npc.linggen, npc.realm.major).cooldownReduce);
  itemDetailOpen.value = true;
}

function openBagDetail(index: number) {
  const npc = props.npc;
  if (!npc) return;
  const cell = npc.inventorySlots[index];
  if (!cell) return;
  itemDetailPayload.value = buildInventoryStackDetailPayload(cell, undefined, npc.linggen, undefined, undefined, () => getNpcDerivedStats(npc), computeLinggenCombatBonuses(npc.linggen, npc.realm.major).cooldownReduce);
  itemDetailOpen.value = true;
}

function closeItemDetail() {
  itemDetailOpen.value = false;
  itemDetailPayload.value = null;
}

function onBackdropClick() {
  if (itemDetailOpen.value) {
    closeItemDetail();
    return;
  }
  emit("close");
}

function onCloseClick() {
  if (itemDetailOpen.value) {
    closeItemDetail();
    return;
  }
  emit("close");
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key !== "Escape" || !props.open) return;
  if (itemDetailOpen.value) {
    ev.preventDefault();
    closeItemDetail();
    return;
  }
  ev.preventDefault();
  emit("close");
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      scrollLock.acquire();
    } else {
      scrollLock.release();
      itemDetailOpen.value = false;
      itemDetailPayload.value = null;
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
        v-if="open && npc"
        class="mj-trait-modal-root mj-protagonist-detail-root"
        role="presentation"
        aria-hidden="false"
      >
        <div
          class="mj-trait-modal-backdrop"
          tabindex="-1"
          aria-label="关闭"
          @click="onBackdropClick"
        />
        <Transition name="mj-modal" appear>
          <div
            class="mj-trait-modal mj-npc-detail-panel"
            role="dialog"
            aria-modal="true"
            :data-rarity="npc.realm.major === '化神' ? '传说' : npc.realm.major === '元婴' ? '史诗' : npc.realm.major === '结丹' ? '稀有' : npc.realm.major === '筑基' ? '精良' : undefined"
            :data-npc-theme="npcTheme"
            @click.stop
          >
            <button type="button" class="mj-trait-modal-close" aria-label="关闭" @click="onCloseClick">
              ×
            </button>
            <h4 class="mj-trait-modal-title">
              <template v-if="npc.isDead">
                <s>{{ npc.displayName }}</s>
                <span class="mj-npc-dead-tag">（已故）</span>
              </template>
              <template v-else>{{ npc.displayName }}</template>
            </h4>
            <div class="mj-trait-modal-rarity">
              {{ npc.identity }} · {{ Character.formatRealm(npc.realm) }}
            </div>

            <div class="mj-npc-layout">
              <div class="mj-npc-portrait-col">
                <div class="mj-npc-avatar-wrap">
                  <img v-if="npc.avatarUrl" class="mj-npc-avatar" :src="npc.avatarUrl" :alt="npc.displayName" />
                  <div v-else class="mj-npc-avatar mj-npc-avatar--placeholder">{{ npc.displayName.slice(0, 1) }}</div>
                </div>

                <div class="mj-npc-portrait-actions">
                  <button
                    type="button"
                    class="main-screen__btn mj-npc-gen-btn"
                    :disabled="!imageApiReady || generatingPortrait"
                    :title="imageApiReady ? '生成一张修仙立绘' : '未配置文生图'"
                    @click="onGeneratePortrait"
                  >
                    {{ generatingPortrait ? '生成中…' : (npc.avatarUrl ? '✨ 重新生成' : '✨ 生成立绘') }}
                  </button>
                  <button
                    type="button"
                    class="main-screen__btn mj-npc-history-btn"
                    title="管理历史立绘"
                    @click="openHistoryModal"
                  >
                    📜 历史<span v-if="npc.avatarCandidates.length" class="mj-npc-history-count">{{ npc.avatarCandidates.length }}</span>
                  </button>
                </div>

                <p v-if="!imageApiReady" class="mj-npc-avatar-hint">
                  未配置文生图，无法生成立绘
                </p>
                <p v-if="portraitGenError" class="mj-npc-avatar-error">{{ portraitGenError }}</p>
              </div>

              <div class="mj-npc-content-col">
                <div class="mj-npc-section-title">基础</div>
                <div class="mj-npc-story-grid">
                  <div class="mj-stat-cell">
                    <span class="mj-stat-k">性别</span>
                    <span class="mj-stat-v">{{ npc.gender || '—' }}</span>
                  </div>
                  <div class="mj-stat-cell">
                    <span class="mj-stat-k">灵根</span>
                    <span class="mj-stat-v">{{ Character.formatLinggenElements(npc.linggen) }}</span>
                  </div>
                  <div class="mj-stat-cell">
                    <span class="mj-stat-k">年龄</span>
                    <span class="mj-stat-v">{{ npc.age }}</span>
                  </div>
                  <div class="mj-stat-cell">
                    <span class="mj-stat-k">寿元</span>
                    <span class="mj-stat-v">{{ npc.shouyuan }}</span>
                  </div>
                </div>

                <div class="mj-npc-hpmp-row">
                  <div class="mj-resource-label">
                    <span>血量</span>
                    <span class="mj-resource-nums">{{ npc.currentHp }} / {{ npc.maxHp }}</span>
                  </div>
                  <div class="mj-bar">
                    <div
                      class="mj-bar-fill mj-bar-fill--hp"
                      :style="{ width: (npc.maxHp > 0 ? Math.round(npc.currentHp / npc.maxHp * 100) : 0) + '%' }"
                    />
                  </div>
                </div>
                <div class="mj-npc-hpmp-row">
                  <div class="mj-resource-label">
                    <span>法力</span>
                    <span class="mj-resource-nums">{{ npc.currentMp }} / {{ npc.maxMp }}</span>
                  </div>
                  <div class="mj-bar">
                    <div
                      class="mj-bar-fill mj-bar-fill--mp"
                      :style="{ width: (npc.maxMp > 0 ? Math.round(npc.currentMp / npc.maxMp * 100) : 0) + '%' }"
                    />
                  </div>
                </div>

                <div class="mj-npc-section-title">属性</div>
                <div class="mj-npc-stats-grid">
                  <template v-for="row in Math.ceil(PRIMARY_STAT_KEYS.length / 2)" :key="row">
                    <template v-for="col in [0, 1]" :key="col">
                      <div v-if="PRIMARY_STAT_KEYS[(row - 1) * 2 + col]" class="mj-stat-cell">
                        <span class="mj-stat-k">{{ PRIMARY_STAT_KEY_TO_ZH[PRIMARY_STAT_KEYS[(row - 1) * 2 + col]] }}</span>
                        <span class="mj-stat-v">{{ primaryStats ? (primaryStats[PRIMARY_STAT_KEYS[(row - 1) * 2 + col]] ?? 0) : 0 }}</span>
                      </div>
                    </template>
                  </template>
                </div>

                <div class="mj-npc-section-title">法宝</div>
                <div class="mj-inventory-grid mj-treasure-grid">
                  <div
                    v-for="slot in equipSlots"
                    :key="slot.key"
                    class="mj-inventory-slot"
                    :class="slot.item ? 'mj-treasure-slot--filled' : ''"
                    :data-rarity="slot.item ? gradeToTraitRarity(slot.item.grade) : undefined"
                    :title="slot.item ? `${treasureCellName(slot.item)}\n（点击查看详情）` : '法宝空位'"
                    :tabindex="slot.item ? 0 : -1"
                    @click="slot.item && openEquipDetail(slot.key)"
                    @keydown="slot.item && ($event.key === 'Enter' || $event.key === ' ') && (openEquipDetail(slot.key), $event.preventDefault())"
                  >
                    <span class="mj-treasure-slot-label">{{ slot.item ? treasureCellName(slot.item) : '' }}</span>
                  </div>
                </div>

                <div class="mj-npc-section-title">功法</div>
                <div class="mj-inventory-grid mj-gongfa-grid">
                  <div
                    v-for="(cell, gi) in gongfaSlots"
                    :key="gi"
                    class="mj-inventory-slot"
                    :class="cell ? 'mj-gongfa-slot--filled' : ''"
                    :data-rarity="cell ? gradeToTraitRarity(cell.grade) : undefined"
                    :title="cell ? `${gongfaCellName(cell)}（第${cell.mastery ?? 1}层）\n（点击查看详情）` : '功法空位'"
                    :tabindex="cell ? 0 : -1"
                    @click="cell && openGongfaDetail(gi)"
                    @keydown="cell && ($event.key === 'Enter' || $event.key === ' ') && (openGongfaDetail(gi), $event.preventDefault())"
                  >
                    <span class="mj-gongfa-slot-label">{{ cell ? gongfaCellName(cell) : '' }}</span>
                    <span v-if="cell" class="mj-gongfa-slot-mastery">{{ gongfaMasteryLabel(cell) }}</span>
                  </div>
                </div>

                <div class="mj-npc-section-title">储物袋</div>
                <div class="mj-inventory-grid">
                  <div
                    v-for="(cell, bi) in bagSlots"
                    :key="bi"
                    class="mj-inventory-slot"
                    :class="{
                      'mj-inventory-slot--empty': !inventorySlotParts(cell).filled,
                      'mj-inventory-slot--filled': inventorySlotParts(cell).filled,
                      'mj-inventory-slot--lingshi': inventorySlotParts(cell).lingshi,
                    }"
                    :data-rarity="inventorySlotParts(cell).rarity"
                    :title="cell ? `${inventorySlotParts(cell).label}${inventorySlotParts(cell).qty ? ' ×' + inventorySlotParts(cell).qty : ''}\n（点击查看详情）` : `格 ${bi + 1}`"
                    :tabindex="cell ? 0 : -1"
                    @click="cell && openBagDetail(bi)"
                    @keydown="cell && ($event.key === 'Enter' || $event.key === ' ') && (openBagDetail(bi), $event.preventDefault())"
                  >
                    <span class="mj-inventory-slot-label">{{ inventorySlotParts(cell).label }}</span>
                    <span v-if="inventorySlotParts(cell).qty" class="mj-inventory-slot-qty">{{ inventorySlotParts(cell).qty }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
    <ProtagonistDetailModal
      :open="itemDetailOpen"
      :payload="itemDetailPayload"
      @close="closeItemDetail"
    />
  </Teleport>

  <PortraitHistoryModal
    :open="historyModalOpen && !!npc"
    :display-name="npc?.displayName ?? ''"
    :candidates="npc?.avatarCandidates ?? []"
    :avatar-url="npc?.avatarUrl ?? ''"
    @close="closeHistoryModal"
    @select="onSelectCandidate"
    @remove="onRemoveCandidate"
    @upload="onHistoryUpload"
  />
</template>

<style scoped>
.mj-trait-modal.mj-npc-detail-panel {
  max-width: 670px;
  max-height: min(82vh, 680px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 性别配色（修仙者/人形妖兽；妖兽沿用基类默认色）——仅改边框，背景保持默认 */
.mj-trait-modal.mj-npc-detail-panel[data-npc-theme="male"] {
  border-color: rgba(80, 120, 190, 0.55);
}

.mj-trait-modal.mj-npc-detail-panel[data-npc-theme="female"] {
  border-color: rgba(190, 116, 146, 0.55);
}

.mj-npc-layout {
  display: flex;
  gap: 14px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.mj-npc-portrait-col {
  width: min(360px, 44vh);
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.mj-npc-avatar-wrap {
  position: relative;
  display: block;
  width: 100%;
  flex: none;
  aspect-ratio: 2 / 3;
}

.mj-npc-avatar {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
  object-position: top;
  border: 1px solid var(--mj-border, rgba(140, 120, 83, 0.45));
}

.mj-npc-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: var(--mj-muted, #8a9088);
  font-size: 1.8rem;
  font-weight: 600;
  user-select: none;
}

.mj-npc-portrait-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
  margin-top: 8px;
  flex-shrink: 0;
}

.mj-npc-portrait-actions > button {
  flex: 1 1 0;
  min-width: 0;
  margin-top: 0;
}

.mj-npc-history-btn {
  padding: 8px 10px;
  font-size: 0.82rem;
}

.mj-npc-history-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mj-npc-history-count {
  display: inline-block;
  margin-left: 5px;
  padding: 0 6px;
  min-width: 16px;
  font-size: 0.68rem;
  line-height: 16px;
  text-align: center;
  border-radius: 9px;
  background: rgba(232, 197, 71, 0.18);
  color: var(--mj-gold, #e8c547);
}

.mj-npc-avatar-error {
  margin: 4px 0 0;
  font-size: 0.72rem;
  color: #e8a598;
  text-align: center;
}

.mj-npc-gen-btn {
  padding: 8px 10px;
  font-size: 0.82rem;
}

.mj-npc-gen-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.mj-npc-avatar-hint {
  margin: 4px 0 0;
  font-size: 0.7rem;
  color: var(--mj-muted, #8a9088);
  text-align: center;
  opacity: 0.8;
}

.mj-npc-content-col {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 4px;
}

@media (max-width: 639px) {
  .mj-trait-modal.mj-npc-detail-panel {
    max-width: 92vw;
    overflow: auto;
  }
  .mj-npc-layout {
    flex-direction: column;
    flex: none;
  }
  .mj-npc-portrait-col {
    width: min(280px, 60vw);
    max-width: 100%;
    margin: 0 auto;
    align-self: center;
  }
  .mj-npc-content-col {
    overflow-y: visible;
    padding-right: 0;
  }
  .mj-inventory-grid {
    grid-template-columns: repeat(auto-fill, minmax(52px, 58px));
    justify-content: start;
  }
}

.mj-npc-dead-tag {
  font-size: 0.78rem;
  color: #c62828;
  font-weight: normal;
}

.mj-npc-hpmp-row {
  margin-bottom: 8px;
}

.mj-npc-hpmp-row .mj-resource-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.84rem;
  color: var(--mj-muted, #8a9088);
  margin-bottom: 4px;
}

.mj-npc-hpmp-row .mj-resource-nums {
  font-size: 1em;
  color: var(--mj-gold, #e8c547);
  font-variant-numeric: tabular-nums;
}

.mj-npc-hpmp-row .mj-bar {
  height: 10px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mj-npc-hpmp-row .mj-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.2s ease;
}

.mj-npc-hpmp-row .mj-bar-fill--hp {
  background: linear-gradient(90deg, #8b2942, #c62828);
}

.mj-npc-hpmp-row .mj-bar-fill--mp {
  background: linear-gradient(90deg, #1565c0, #4fc3f7);
}

.mj-npc-section-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--mj-gold-dim, #b89a4a);
  margin: 12px 0 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.mj-npc-section-title:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.mj-npc-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
}

.mj-stat-cell {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.mj-stat-k {
  font-size: 0.72rem;
  color: var(--mj-muted, #8a9088);
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.mj-stat-v {
  font-size: 0.85rem;
  color: var(--mj-text, #e8e4dc);
}

.mj-npc-story-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.mj-npc-story-section {
  margin-top: 10px;
}

.mj-npc-story-text {
  font-size: 0.85rem;
  color: var(--mj-text, #e8e4dc);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 3px;
}

/* ---- inventory grids ---- */

.mj-inventory-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 4px;
}

.mj-inventory-slot {
  aspect-ratio: 1;
  min-height: 36px;
  border: 1px dashed rgba(140, 120, 83, 0.4);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 5px;
  box-sizing: border-box;
  position: relative;
}

.mj-inventory-slot--empty {
}

.mj-inventory-slot--filled {
  border-style: solid;
  cursor: pointer;
}

.mj-inventory-slot--filled[data-rarity] {
  border-color: var(--mj-rarity-active);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mj-rarity-active) 25%, transparent);
}

.mj-inventory-slot--filled:focus-visible {
  outline: 2px solid var(--mj-gold, #e8c547);
  outline-offset: 1px;
}

/* treasure */

.mj-treasure-slot--filled {
  border-style: solid;
  cursor: pointer;
}

.mj-treasure-slot--filled[data-rarity] {
  border-color: var(--mj-rarity-active);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mj-rarity-active) 25%, transparent);
}

.mj-treasure-slot--filled:focus-visible {
  outline: 2px solid var(--mj-gold, #e8c547);
  outline-offset: 1px;
}

.mj-treasure-slot-label {
  width: 100%;
  max-height: 100%;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  color: var(--mj-text, #e8e4dc);
}

/* gongfa */

.mj-gongfa-slot--filled {
  border-style: solid;
  cursor: pointer;
}

.mj-gongfa-slot--filled[data-rarity] {
  border-color: var(--mj-rarity-active);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mj-rarity-active) 25%, transparent);
}

.mj-gongfa-slot--filled:focus-visible {
  outline: 2px solid var(--mj-gold, #e8c547);
  outline-offset: 1px;
}

.mj-gongfa-slot-label {
  width: 100%;
  max-height: 100%;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  color: var(--mj-text, #e8e4dc);
}

.mj-gongfa-slot-mastery {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 0.65rem;
  color: var(--mj-gold-dim, #a89040);
  opacity: 0.85;
}

/* inventory bag slots */

.mj-inventory-slot-label {
  font-size: 0.8rem;
  line-height: 1.15;
  text-align: center;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  color: var(--mj-text, #e8e4dc);
}

.mj-inventory-slot--empty .mj-inventory-slot-label {
  color: transparent;
}

.mj-inventory-slot-qty {
  position: absolute;
  bottom: 3px;
  right: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--mj-gold-dim, #b89a4a);
  line-height: 1;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}
</style>
