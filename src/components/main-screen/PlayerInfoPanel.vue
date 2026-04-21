<script setup lang="ts">
/**
 * 左栏：主角档案。类名与 `mortal_journey/css/main.css` 左栏（mj-*）对齐；数据为 `playInfo.ProtagonistPlayInfo`。
 * 展示派生逻辑见 `lib/protagonistPanelDisplay.ts`；详情弹窗见 `ProtagonistDetailModal.vue`。
 */
import { computed, ref } from "vue";
import type { ProtagonistPlayInfo } from "../../types/playInfo";
import { PLAYER_STAT_KEY_TO_ZH } from "../../types/zhPlayerStats";
import {
  buildGongfaDetailPayload,
  buildInventoryStackDetailPayload,
  buildTraitDetailPayload,
  buildWearableDetailPayload,
  type ProtagonistDetailAction,
  type ProtagonistDetailPayload,
} from "../../lib/protagonistDetailPayload";
import { getProtagonistDerivedStats } from "../../lib/protagonistDerivedStats";
import { applyProtagonistDetailAction } from "../../lib/protagonistManager";
import {
  formatLinggenElements,
  formatRealmLine,
  getCultivationUiState,
  getEquipSlotRows,
  getHpMpBarState,
  getInventoryBagDisplaySlots,
  getTraitSlots,
  gongfaCellParts,
  gongfaTypeClass,
  displayStatInt,
  gradeToTraitRarity,
  inventorySlotParts,
  traitSlotInnerText,
  traitSlotRarity,
  traitSlotTitle,
  type EquipSlotKey,
} from "../../lib/protagonistPanelDisplay";
import ProtagonistDetailModal from "./ProtagonistDetailModal.vue";
import MajorBreakthroughModal from "./MajorBreakthroughModal.vue";
import { getMajorBreakthroughReadyContext } from "../../lib/majorBreakthrough";
import {
  calendarYearsElapsed,
  formatWorldTimeZhDisplay,
  type WorldTime,
} from "../../lib/worldTime";

const props = defineProps<{
  protagonist: ProtagonistPlayInfo | null;
  worldTime: WorldTime;
  worldTimeBaseline: WorldTime;
}>();

const worldTimeTitle = computed(() => formatWorldTimeZhDisplay(props.worldTime));

/**
 * 面板年龄：档案开局年龄 + 自 `worldTimeBaseline` 至 `worldTime` 的整年差（仅当存在主角时在模板中展示）。
 * 推进 `worldTime` 的年份即可同步长龄，无需把世界时间存成字符串再解析。
 */
const panelAgeForDisplay = computed(() => {
  const p = props.protagonist;
  if (!p) return 0;
  return p.age + calendarYearsElapsed(props.worldTimeBaseline, props.worldTime);
});

const cultivationUi = computed(() => getCultivationUiState(props.protagonist));
const derivedStats = computed(() => getProtagonistDerivedStats(props.protagonist));
const hpMp = computed(() => getHpMpBarState(props.protagonist, derivedStats.value));
const equipSlots = computed(() => getEquipSlotRows(props.protagonist));
const traitSlots = computed(() => getTraitSlots(props.protagonist));
const inventoryBagDisplaySlots = computed(() =>
  props.protagonist ? getInventoryBagDisplaySlots(props.protagonist.inventorySlots) : [],
);

const detailOpen = ref(false);
const detailPayload = ref<ProtagonistDetailPayload | null>(null);
const majorBreakOpen = ref(false);

const majorBreakReady = computed(() => getMajorBreakthroughReadyContext(props.protagonist));

function closeDetail() {
  detailOpen.value = false;
  detailPayload.value = null;
}

function openDetail(p: ProtagonistDetailPayload | null) {
  if (!p) return;
  detailPayload.value = p;
  detailOpen.value = true;
}

function onTraitSlotClick(index: number) {
  const p = props.protagonist;
  if (!p) return;
  const t = p.traits[index];
  if (t == null) return;
  openDetail(buildTraitDetailPayload(t));
}

function onEquipSlotClick(key: EquipSlotKey) {
  const p = props.protagonist;
  if (!p) return;
  const it = p.equippedSlots[key];
  if (!it) return;
  openDetail(buildWearableDetailPayload(it, { type: "equipped", equipSlot: key }, p.realm));
}

function onGongfaSlotClick(index: number) {
  const p = props.protagonist;
  if (!p) return;
  const cell = p.gongfaSlots[index];
  if (!cell) return;
  openDetail(buildGongfaDetailPayload(cell, { type: "bar", gongfaIndex: index }, p.realm));
}

function onBagSlotClick(index: number) {
  const p = props.protagonist;
  if (!p) return;
  const cell = p.inventorySlots[index];
  if (!cell) return;
  openDetail(buildInventoryStackDetailPayload(cell, index, p.linggen));
}

function onDetailAction(a: ProtagonistDetailAction) {
  applyProtagonistDetailAction(a);
  closeDetail();
}

function onSlotKeydown(e: KeyboardEvent, fn: () => void) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  fn();
}
</script>

<template>
  <section class="main-panel main-panel--player mj-pane--player" aria-label="主角信息">
    <ProtagonistDetailModal
      :open="detailOpen"
      :payload="detailPayload"
      @close="closeDetail"
      @action="onDetailAction"
    />
    <MajorBreakthroughModal
      :open="majorBreakOpen"
      :protagonist="protagonist"
      @close="majorBreakOpen = false"
    />
    <header class="main-panel__meta-strip" aria-label="世界时间" :title="worldTimeTitle">
      <p class="main-panel__meta-strip-text">{{ worldTimeTitle }}</p>
    </header>
    <div class="main-panel__body">
      <template v-if="!protagonist">
        <p class="main-panel__placeholder">完成命运抉择后将在此显示主角档案。</p>
      </template>
      <div v-else class="mj-player-body">
        <div class="mj-player-avatar-wrap">
          <img
            v-if="protagonist.avatarUrl"
            class="mj-player-avatar"
            :src="protagonist.avatarUrl"
            :alt="protagonist.displayName"
          />
          <div v-else class="mj-player-avatar mj-player-avatar--placeholder" aria-hidden="true">头像</div>
          <div class="mj-player-name-vertical">{{ protagonist.displayName }}</div>
        </div>

        <p class="mj-realm-line">{{ formatRealmLine(protagonist.realm) }}</p>

        <div class="mj-resource-row">
          <div class="mj-cultivation-head">
            <div class="mj-resource-label mj-resource-label--cultivation">
              <span>修为</span>
              <span class="mj-resource-nums">
                {{ cultivationUi.displayCur
                }}<template v-if="cultivationUi.req != null && cultivationUi.req > 0">
                  / {{ cultivationUi.req }}</template
                >
              </span>
            </div>
            <button
              v-if="majorBreakReady"
              type="button"
              class="mj-major-breakthrough-btn"
              @click="majorBreakOpen = true"
            >
              突破
            </button>
          </div>
          <template v-if="cultivationUi.req != null && cultivationUi.req > 0">
            <div
              class="mj-bar"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Math.round(cultivationUi.pct)"
            >
              <div
                class="mj-bar-fill mj-bar-fill--cultivation"
                :style="{ width: cultivationUi.pct + '%' }"
              />
            </div>
          </template>
          <p v-else class="mj-player-info-muted">当前境界无修为阶段需求表项。</p>
        </div>

        <div class="mj-player-identity">
          <div class="mj-stat-pair-row">
            <div class="mj-stat-cell">
              <span class="mj-stat-k">性别</span>
              <span class="mj-stat-v">{{ protagonist.gender || "—" }}</span>
            </div>
            <div class="mj-stat-cell">
              <span class="mj-stat-k">灵根</span>
              <span class="mj-stat-v">{{ formatLinggenElements(protagonist.linggen) }}</span>
            </div>
          </div>
          <div class="mj-stat-pair-row">
            <div class="mj-stat-cell">
              <span class="mj-stat-k">年龄</span>
              <span class="mj-stat-v">{{ panelAgeForDisplay }}</span>
            </div>
            <div class="mj-stat-cell">
              <span class="mj-stat-k">寿元</span>
              <span class="mj-stat-v">{{ protagonist.shouyuan }}</span>
            </div>
          </div>
        </div>

        <div v-if="hpMp" class="mj-resource-row">
          <div class="mj-resource-label">
            <span>血量</span>
            <span class="mj-resource-nums"
              >{{ displayStatInt(hpMp.curH) }} / {{ displayStatInt(hpMp.maxH) }}</span
            >
          </div>
          <div class="mj-bar" role="progressbar" :aria-valuenow="Math.round(hpMp.hpPct)">
            <div class="mj-bar-fill mj-bar-fill--hp" :style="{ width: hpMp.hpPct + '%' }" />
          </div>
        </div>
        <div v-if="hpMp" class="mj-resource-row">
          <div class="mj-resource-label">
            <span>法力</span>
            <span class="mj-resource-nums"
              >{{ displayStatInt(hpMp.curM) }} / {{ displayStatInt(hpMp.maxM) }}</span
            >
          </div>
          <div class="mj-bar" role="progressbar" :aria-valuenow="Math.round(hpMp.mpPct)">
            <div class="mj-bar-fill mj-bar-fill--mp" :style="{ width: hpMp.mpPct + '%' }" />
          </div>
        </div>

        <div class="mj-combat-stats">
          <h3 class="mj-attr-section-title mj-attr-section-title--first">属性</h3>
          <div class="mj-stat-pair-row">
            <div v-for="k in ['patk', 'pdef'] as const" :key="k" class="mj-stat-cell">
              <span class="mj-stat-k">{{ PLAYER_STAT_KEY_TO_ZH[k] }}</span>
              <span class="mj-stat-v">{{
                displayStatInt(derivedStats?.[k] ?? protagonist.playerBase[k])
              }}</span>
            </div>
          </div>
          <div class="mj-stat-pair-row">
            <div v-for="k in ['matk', 'mdef'] as const" :key="k" class="mj-stat-cell">
              <span class="mj-stat-k">{{ PLAYER_STAT_KEY_TO_ZH[k] }}</span>
              <span class="mj-stat-v">{{
                displayStatInt(derivedStats?.[k] ?? protagonist.playerBase[k])
              }}</span>
            </div>
          </div>
          <div class="mj-stat-pair-row">
            <div v-for="k in ['sense', 'luck'] as const" :key="k" class="mj-stat-cell">
              <span class="mj-stat-k">{{ PLAYER_STAT_KEY_TO_ZH[k] }}</span>
              <span class="mj-stat-v">{{
                displayStatInt(derivedStats?.[k] ?? protagonist.playerBase[k])
              }}</span>
            </div>
          </div>
          <div class="mj-stat-pair-row">
            <div v-for="k in ['dodge', 'tenacity'] as const" :key="k" class="mj-stat-cell">
              <span class="mj-stat-k">{{ PLAYER_STAT_KEY_TO_ZH[k] }}</span>
              <span class="mj-stat-v">{{
                displayStatInt(derivedStats?.[k] ?? protagonist.playerBase[k])
              }}</span>
            </div>
          </div>
        </div>

        <div class="mj-talent-block">
          <h3 class="mj-attr-section-title">天赋</h3>
          <div class="mj-talent-row" role="list">
            <div
              v-for="(t, ti) in traitSlots"
              :key="ti"
              class="mj-trait-slot"
              :class="t ? 'mj-trait-slot--filled' : 'mj-trait-slot--empty'"
              :data-rarity="traitSlotRarity(t)"
              :title="traitSlotTitle(t) + (t ? '\n（点击查看详情）' : '')"
              role="listitem"
              :tabindex="t ? 0 : -1"
              @click="t && onTraitSlotClick(ti)"
              @keydown="t && onSlotKeydown($event, () => onTraitSlotClick(ti))"
            >
              <span class="mj-trait-slot-inner">{{ traitSlotInnerText(t) }}</span>
            </div>
          </div>
        </div>

        <div class="mj-equip-block">
          <h3 class="mj-attr-section-title">装备佩戴</h3>
          <div class="mj-equip-row mj-equip-row--three" role="group">
            <div
              v-for="slot in equipSlots"
              :key="slot.key"
              class="mj-equip-slot"
              :class="slot.item ? 'mj-equip-slot--filled' : 'mj-equip-slot--empty'"
              :data-rarity="slot.item ? gradeToTraitRarity(slot.item.grade) : undefined"
              :tabindex="slot.item ? 0 : -1"
              @click="slot.item && onEquipSlotClick(slot.key)"
              @keydown="slot.item && onSlotKeydown($event, () => onEquipSlotClick(slot.key))"
            >
              <span class="mj-equip-slot-k">{{ slot.label }}</span>
              <span class="mj-equip-slot-name">{{ slot.item ? slot.item.name : "—" }}</span>
            </div>
          </div>
        </div>

        <div class="mj-player-bag-stack">
          <h3 class="mj-attr-section-title">功法</h3>
          <div class="mj-bag-grid-scroll mj-bag-grid-scroll--gongfa">
            <div class="mj-inventory-grid mj-gongfa-grid" aria-label="功法栏八格">
              <div
                v-for="(cell, gi) in protagonist.gongfaSlots"
                :key="gi"
                class="mj-inventory-slot"
                :class="cell ? 'mj-gongfa-slot--filled' : ''"
                :data-rarity="cell ? gradeToTraitRarity(cell.grade) : undefined"
                :title="cell ? `${gongfaCellParts(cell).name}\n（点击查看详情）` : '功法空位'"
                :tabindex="cell ? 0 : -1"
                @click="cell && onGongfaSlotClick(gi)"
                @keydown="cell && onSlotKeydown($event, () => onGongfaSlotClick(gi))"
              >
                <div class="mj-gongfa-slot-stack">
                  <template v-if="cell">
                    <span class="mj-gongfa-slot-label">{{ gongfaCellParts(cell).name }}</span>
                    <span :class="gongfaTypeClass(gongfaCellParts(cell).subtype)">{{
                      gongfaCellParts(cell).subtype
                    }}</span>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mj-player-bag-stack">
          <h3 class="mj-attr-section-title">储物袋</h3>
          <div class="mj-bag-grid-scroll mj-bag-grid-scroll--inventory" role="region" aria-label="储物袋格子">
            <div id="mj-inventory-grid" class="mj-inventory-grid">
              <div
                v-for="(cell, bi) in inventoryBagDisplaySlots"
                :key="bi"
                class="mj-inventory-slot"
                :class="{
                  'mj-inventory-slot--empty': !inventorySlotParts(cell).filled,
                  'mj-inventory-slot--filled': inventorySlotParts(cell).filled,
                  'mj-inventory-slot--lingshi': inventorySlotParts(cell).lingshi,
                }"
                :data-rarity="inventorySlotParts(cell).rarity"
                :title="
                  cell
                    ? `${inventorySlotParts(cell).label}${inventorySlotParts(cell).qty ? ' ×' + inventorySlotParts(cell).qty : ''}\n（点击查看详情）`
                    : `格 ${bi + 1}`
                "
                :tabindex="cell ? 0 : -1"
                @click="cell && onBagSlotClick(bi)"
                @keydown="cell && onSlotKeydown($event, () => onBagSlotClick(bi))"
              >
                <span class="mj-inventory-slot-label">{{ inventorySlotParts(cell).label }}</span>
                <span v-if="inventorySlotParts(cell).qty" class="mj-inventory-slot-qty">{{
                  inventorySlotParts(cell).qty
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
