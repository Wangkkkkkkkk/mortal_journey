<script setup lang="ts">
/**
 * 左栏：主角档案。类名与 `mortal_journey/css/main.css` 左栏（mj-*）对齐；数据为 `playInfo.ProtagonistPlayInfo`。
 * 展示派生逻辑见 `lib/protagonistPanelDisplay.ts`；详情弹窗见 `ProtagonistDetailModal.vue`。
 */
import { computed, ref } from "vue";
import { Protagonist } from "../role_core/Protagonist";
import { PRIMARY_STAT_KEY_TO_ZH, PRIMARY_STAT_KEYS, PRIMARY_STAT_KEY_DESC, formatLinggenBonusText, type EquipSlotKey, type PrimaryStatKey } from "../role_core/types/playInfo";
import type { GongfaItemDefinition } from "../role_core/types/itemInfo";
import { computeLinggenCombatBonuses } from "../role_core/types/gameConstants";
import { computePanelCombatStats } from "../battle_engine/panelStats";
import { CRAFT_SKILL_KEYS, CRAFT_SKILL_TO_ZH, CRAFT_SKILL_DESC, craftUpgradeChance } from "../role_core/craft";
import { timedBuffDaysLeft } from "../role_core/timedBuff";
import { PRIMARY_STAT_KEY_TO_ZH as STAT_ZH } from "../role_core/types/playInfo";
import type { DerivedStatValues } from "./protagonistDetailPayload";
import {
  buildGongfaDetailPayload,
  buildInventoryStackDetailPayload,
  buildTraitDetailPayload,
  buildWearableDetailPayload,
  type ProtagonistDetailAction,
  type ProtagonistDetailPayload,
} from "./protagonistDetailPayload";
import {
  getCultivationUiState,
  getEquipSlotRows,
  getHpMpBarState,
  getInventoryBagDisplaySlots,
  gongfaCellName,
  displayStatInt,
  gradeToTraitRarity,
  inventorySlotParts,
  traitSlotInnerText,
  traitSlotRarity,
  traitSlotTitle,
  treasureCellName,
  gongfaMasteryLabel,
  gongfaMasteryThresholdText,
  getShouyuanWarningLevel,
} from "./protagonistPanelDisplay";
import ProtagonistDetailModal from "./ProtagonistDetailModal.vue";
import GongfaCultivateModal from "./GongfaCultivateModal.vue";
import type { CultivationInput, CultivationConfirmPayload } from "../ai/cultivation_types";
import {
  calendarYearsElapsed,
  formatWorldTimeZhDisplay,
  type WorldTime,
} from "../role_core/worldTime";
import { getSpiritStoneCount } from "../role_core/CharacterInventory";
import { getGongfaMasteryProgress } from "./protagonistPanelDisplay";
import { writeActiveSave } from "../save/gameSave";
import { generateProtagonistPortrait, isImageApiConfigured } from "../image_generate";
import PortraitHistoryModal from "./PortraitHistoryModal.vue";

const props = defineProps<{
  protagonist: Protagonist | null;
  worldTime: WorldTime;
  worldTimeBaseline: WorldTime;
}>();

const emit = defineEmits<{
  "update:worldTime": [value: WorldTime];
  "cultivate": [value: CultivationInput];
}>();
const worldTimeTitle = computed(() => formatWorldTimeZhDisplay(props.worldTime));

/**
 * 面板年龄：档案开局年龄 + 自 `worldTimeBaseline` 至 `worldTime` 的整年差（仅当存在主角时在模板中展示）。
 * 推进 `worldTime` 的年份即可同步长龄，无需把世界时间存成字符串再解析。
 */
const panelAgeForDisplay = computed(() => {
  const p = props.protagonist;
  if (!p || !p.ageConfirmed) return "—";
  return p.age + calendarYearsElapsed(props.worldTimeBaseline, props.worldTime);
});

const cultivationUi = computed(() => getCultivationUiState(props.protagonist));
const primaryStats = computed(() => props.protagonist?.getPrimaryStats() ?? null);

/** 战斗属性区块：基础值 + 灵根 + 法宝词条 + 被动功法修正的静态汇总（与战斗初始化同源）。 */
const combatStatRows = computed(() => {
  const p = props.protagonist;
  if (!p) return [];
  const c = computePanelCombatStats(p);
  const fmt = (v: number) => `${Math.round(v * 10) / 10}%`;
  return [
    { k: "暴击率", v: fmt(c.critRate), tip: "攻击造成暴击的概率，来自法宝词条与被动功法" },
    { k: "暴击伤害", v: fmt(c.critDmg), tip: "暴击时造成的伤害倍率（基础150%，金灵根提升）" },
    { k: "闪避率", v: fmt(c.dodgeRate), tip: "完全闪避一次攻击的概率" },
    { k: "吸血", v: fmt(c.lifesteal), tip: "造成伤害后按比例回复血量" },
    { k: "增伤", v: fmt(c.damageDealt), tip: "造成的最终伤害提升" },
    { k: "减伤", v: fmt(c.damageReduction), tip: "受到的最终伤害降低" },
    { k: "回血", v: fmt(c.hpRecoverPerTurn), tip: "战斗中每回合自动恢复最大血量的百分比（火灵根增强）" },
    { k: "回蓝", v: fmt(c.mpRecoverPerTurn), tip: "战斗中每回合自动恢复最大法力的百分比" },
  ];
});
const hpMp = computed(() => getHpMpBarState(props.protagonist, props.protagonist ? { hp: props.protagonist.maxHp, mp: props.protagonist.maxMp } : null));
const equipSlots = computed(() => getEquipSlotRows(props.protagonist));
/** 天赋平铺列表：条数不再固定为 5，直接铺开主角实际持有的全部天赋。 */
const traitRows = computed(() => props.protagonist?.traits ?? []);
const inventoryBagDisplaySlots = computed(() =>
  props.protagonist ? getInventoryBagDisplaySlots(props.protagonist.inventorySlots) : [],
);
const shouyuanWarning = computed(() => getShouyuanWarningLevel(props.protagonist, props.worldTimeBaseline, props.worldTime));

const linggenTooltip = computed(() => {
  const p = props.protagonist;
  if (!p) return "";
  const major = p.realm.major;
  return p.linggen
    .map(el => {
      const text = formatLinggenBonusText(el, major);
      return text ? `${el}：${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
});

/** 技艺区块：四门技艺的熟练度与当前品阶跃迁概率。 */
const craftSkillRows = computed(() => {
  const p = props.protagonist;
  if (!p) return [];
  return CRAFT_SKILL_KEYS.map((k) => {
    const prof = p.craftSkills[k] ?? 0;
    return {
      k,
      label: CRAFT_SKILL_TO_ZH[k],
      value: prof,
      tip: `${CRAFT_SKILL_DESC[k]}
当前熟练度 ${prof}，品阶跃迁概率 ${(Math.round(craftUpgradeChance(prof) * 10) / 10)}%`,
    };
  });
});

/** 生效中的限时增益（餐食等），含剩余天数与效果文案。 */
const activeBuffRows = computed(() => {
  const p = props.protagonist;
  if (!p) return [];
  return p.getActiveTimedBuffs().map((b) => {
    const parts = Object.entries(b.statPercents)
      .filter(([, v]) => typeof v === "number" && v !== 0)
      .map(([k, v]) => `${STAT_ZH[k as PrimaryStatKey]} ${(v as number) > 0 ? "+" : ""}${v}%`);
    return {
      id: b.id,
      name: b.name,
      effectText: parts.join("　"),
      daysLeft: timedBuffDaysLeft(b, props.worldTime),
      tip: `${b.desc}
${parts.join("，")}`,
    };
  });
});

const detailOpen = ref(false);
const detailPayload = ref<ProtagonistDetailPayload | null>(null);

// ── 主角立绘生成 ──────────────────────────────────────────────────────────
const generatingPortrait = ref(false);
const portraitGenError = ref("");
const imageApiReady = computed(() => isImageApiConfigured());
const historyModalOpen = ref(false);

async function onGeneratePortrait() {
  const p = props.protagonist;
  if (!p || generatingPortrait.value) return;
  generatingPortrait.value = true;
  portraitGenError.value = "";
  try {
    const dataUrl = await generateProtagonistPortrait(p);
    p.addPortraitCandidate(dataUrl);
    writeActiveSave();
  } catch (err) {
    portraitGenError.value = err instanceof Error ? err.message : "立绘生成失败。";
  } finally {
    generatingPortrait.value = false;
  }
}

function onSelectCandidate(url: string) {
  const p = props.protagonist;
  if (!p) return;
  p.selectPortrait(url);
  writeActiveSave();
}

function onRemoveCandidate(url: string) {
  const p = props.protagonist;
  if (!p) return;
  p.removePortraitCandidate(url);
  writeActiveSave();
}

function openHistoryModal() {
  historyModalOpen.value = true;
}
function closeHistoryModal() {
  historyModalOpen.value = false;
}

function onHistoryUpload(dataUrl: string) {
  const p = props.protagonist;
  if (!p) return;
  p.addPortraitCandidate(dataUrl);
  writeActiveSave();
}

function closeDetail() {
  detailOpen.value = false;
  detailPayload.value = null;
}

function openDetail(p: ProtagonistDetailPayload | null) {
  if (!p) return;
  detailPayload.value = p;
  detailOpen.value = true;
}

const ZH_STAT_TO_KEY: Readonly<Record<string, PrimaryStatKey>> = (() => {
  const o: Record<string, PrimaryStatKey> = {};
  for (const en of Object.keys(PRIMARY_STAT_KEY_TO_ZH) as PrimaryStatKey[]) {
    o[PRIMARY_STAT_KEY_TO_ZH[en]] = en;
  }
  return o;
})();

function getGongfaScalingStat(p: Protagonist, gf: GongfaItemDefinition): number {
  const bonus = gf.bonus as Record<string, number>;
  const firstKey = Object.keys(bonus)[0];
  if (!firstKey) return 0;
  const statKey = ZH_STAT_TO_KEY[firstKey];
  if (!statKey) return 0;
  return p.getPrimaryStats()[statKey] ?? 0;
}

function getGongfaScalingStatName(gf: GongfaItemDefinition): string {
  const bonus = gf.bonus as Record<string, number>;
  return Object.keys(bonus)[0] ?? "";
}

function getGongfaDerivedStats(p: Protagonist): DerivedStatValues {
  const ps = p.getPrimaryStats();
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
  const statGetter = () => getGongfaScalingStat(p, cell);
  const nameGetter = () => getGongfaScalingStatName(cell);
  const dsGetter = () => getGongfaDerivedStats(p);
  openDetail(buildGongfaDetailPayload(cell, { type: "bar", gongfaIndex: index }, p.linggen, statGetter, nameGetter, dsGetter, computeLinggenCombatBonuses(p.linggen, p.realm.major).cooldownReduce));
}

function onBagSlotClick(index: number) {
  const p = props.protagonist;
  if (!p) return;
  const cell = p.inventorySlots[index];
  if (!cell) return;
  const gfg = (gf: GongfaItemDefinition) => getGongfaScalingStat(p, gf);
  const sng = (gf: GongfaItemDefinition) => getGongfaScalingStatName(gf);
  const dsg = (gf: GongfaItemDefinition) => getGongfaDerivedStats(p);
  openDetail(buildInventoryStackDetailPayload(cell, index, p.linggen, gfg, sng, dsg, computeLinggenCombatBonuses(p.linggen, p.realm.major).cooldownReduce, p.realm.major));
}

function onDetailAction(a: ProtagonistDetailAction) {
  if (a.id === "cultivateGongfa") {
    cultivateGongfaIndex.value = a.gongfaIndex;
    closeDetail();
    cultivateOpen.value = true;
    return;
  }
  props.protagonist?.applyDetailAction(a);
  writeActiveSave();
  closeDetail();
}

const cultivateOpen = ref(false);
const cultivateGongfaIndex = ref(-1);

const cultivateGongfa = computed(() => {
  const p = props.protagonist;
  if (!p || cultivateGongfaIndex.value < 0) return null;
  return p.gongfaSlots[cultivateGongfaIndex.value] ?? null;
});

const spiritStoneCount = computed(() => {
  return props.protagonist ? getSpiritStoneCount(props.protagonist) : 0;
});

function closeCultivate() {
  cultivateOpen.value = false;
  cultivateGongfaIndex.value = -1;
}

function onCultivateConfirm(payload: CultivationConfirmPayload) {
  const p = props.protagonist;
  const gf = cultivateGongfa.value;
  if (!p || !gf || payload.spiritStoneCount <= 0) return;

  const mp = getGongfaMasteryProgress(gf);

  emit("cultivate", {
    gongfaIndex: cultivateGongfaIndex.value,
    gongfaName: gf.name,
    gongfaGrade: gf.grade,
    gongfaSystem: gf.system ?? "法修",
    currentMastery: mp.mastery,
    currentMasteryExp: mp.exp,
    masteryThreshold: mp.threshold,
    spiritStoneCount: payload.spiritStoneCount,
    estimatedMonths: payload.estimatedMonths,
  });

  closeCultivate();
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
    <GongfaCultivateModal
      :open="cultivateOpen"
      :gongfa="cultivateGongfa"
      :spirit-stone-count="spiritStoneCount"
      :linggen-count="protagonist?.linggen?.length ?? 0"
      :insight="protagonist?.getPrimaryStats()?.insight ?? 0"
      @close="closeCultivate"
      @confirm="onCultivateConfirm"
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
          <div class="mj-player-avatar-row">


            <div class="mj-player-avatar-area">
              <img
                v-if="protagonist.avatarUrl"
                class="mj-player-avatar"
                :src="protagonist.avatarUrl"
                :alt="protagonist.displayName"
              />
              <div v-else class="mj-player-avatar mj-player-avatar--placeholder" aria-hidden="true">头像</div>
            </div>
            <div class="mj-player-portrait-actions">
              <button
                type="button"
                class="mj-player-gen-btn"
                :disabled="!imageApiReady || generatingPortrait"
                :title="imageApiReady ? '生成修仙立绘' : '未配置文生图'"
                @click.stop="onGeneratePortrait"
              >{{ generatingPortrait ? '…' : '✨' }}</button>
              <button
                type="button"
                class="mj-player-history-btn"
                title="管理历史立绘"
                @click.stop="openHistoryModal"
              >📜</button>
            </div>
          </div>
          <div class="mj-player-name-vertical">{{ protagonist.displayName }}</div>
          <p v-if="!imageApiReady && !portraitGenError" class="mj-player-gen-hint">未配置文生图</p>
          <p v-if="portraitGenError" class="mj-player-gen-error">{{ portraitGenError }}</p>
        </div>

        <p class="mj-realm-line">{{ Protagonist.formatRealm(protagonist.realm) }}<template v-if="protagonist.realmComplete">·圆满</template></p>

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
            <div class="mj-stat-cell" :title="linggenTooltip">
              <span class="mj-stat-k">灵根</span>
              <span class="mj-stat-v">{{ Protagonist.formatLinggenElements(protagonist.linggen) }}</span>
            </div>
          </div>
          <div class="mj-stat-pair-row">
            <div class="mj-stat-cell">
              <span class="mj-stat-k">年龄</span>
              <span class="mj-stat-v">{{ panelAgeForDisplay }}</span>
            </div>
            <div class="mj-stat-cell">
              <span class="mj-stat-k">寿元</span>
              <span class="mj-stat-v" :class="{ 'mj-stat-v--danger': shouyuanWarning === 'danger', 'mj-stat-v--warning': shouyuanWarning === 'warning' }">{{ protagonist.shouyuan }}</span>
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
          <div class="mj-attr-section-header">
            <h3 class="mj-attr-section-title mj-attr-section-title--first">属性</h3>
          </div>
          <div v-for="row in Math.ceil(PRIMARY_STAT_KEYS.length / 2)" :key="row" class="mj-stat-pair-row">
            <template v-for="col in [0, 1]" :key="col">
               <div v-if="PRIMARY_STAT_KEYS[(row - 1) * 2 + col]" class="mj-stat-cell" :class="col === 1 ? 'mj-stat-cell--right' : ''">
                 <span class="mj-stat-k mj-stat-k--tip" :data-tip="PRIMARY_STAT_KEY_DESC[PRIMARY_STAT_KEYS[(row - 1) * 2 + col]]">{{ PRIMARY_STAT_KEY_TO_ZH[PRIMARY_STAT_KEYS[(row - 1) * 2 + col]] }}</span>
                <span class="mj-stat-v">{{ primaryStats ? (primaryStats[PRIMARY_STAT_KEYS[(row - 1) * 2 + col]] ?? 0) : 0 }}</span>
              </div>
            </template>
          </div>
        </div>

        <div class="mj-combat-stats">
          <div class="mj-attr-section-header">
            <h3 class="mj-attr-section-title">战斗属性</h3>
          </div>
          <div v-for="row in Math.ceil(combatStatRows.length / 2)" :key="row" class="mj-stat-pair-row">
            <template v-for="col in [0, 1]" :key="col">
              <div v-if="combatStatRows[(row - 1) * 2 + col]" class="mj-stat-cell" :class="col === 1 ? 'mj-stat-cell--right' : ''">
                <span class="mj-stat-k mj-stat-k--tip" :data-tip="combatStatRows[(row - 1) * 2 + col].tip">{{ combatStatRows[(row - 1) * 2 + col].k }}</span>
                <span class="mj-stat-v">{{ combatStatRows[(row - 1) * 2 + col].v }}</span>
              </div>
            </template>
          </div>
        </div>

        <div class="mj-combat-stats">
          <div class="mj-attr-section-header">
            <h3 class="mj-attr-section-title">技艺</h3>
          </div>
          <div v-for="row in Math.ceil(craftSkillRows.length / 2)" :key="'craft-' + row" class="mj-stat-pair-row">
            <template v-for="col in [0, 1]" :key="col">
              <div v-if="craftSkillRows[(row - 1) * 2 + col]" class="mj-stat-cell" :class="col === 1 ? 'mj-stat-cell--right' : ''">
                <span class="mj-stat-k mj-stat-k--tip" :data-tip="craftSkillRows[(row - 1) * 2 + col].tip">{{ craftSkillRows[(row - 1) * 2 + col].label }}</span>
                <span class="mj-stat-v">{{ craftSkillRows[(row - 1) * 2 + col].value }}</span>
              </div>
            </template>
          </div>
        </div>

        <div v-if="activeBuffRows.length > 0" class="mj-combat-stats">
          <div class="mj-attr-section-header">
            <h3 class="mj-attr-section-title">增益</h3>
          </div>
          <div v-for="b in activeBuffRows" :key="b.id" class="mj-stat-cell mj-buff-row" :title="b.tip">
            <span class="mj-stat-k">{{ b.name }}</span>
            <span class="mj-stat-v mj-buff-effect">{{ b.effectText }}</span>
            <span class="mj-buff-days">余{{ b.daysLeft }}天</span>
          </div>
        </div>

        <div class="mj-talent-block">
          <h3 class="mj-attr-section-title">天赋</h3>
          <div class="mj-talent-row" role="list" style="flex-direction: column; gap: 2px">
            <div
              v-for="(t, ti) in traitRows"
              :key="ti"
              class="mj-stat-cell"
              :title="traitSlotTitle(t) + '\n（点击查看详情）'"
              role="listitem"
              tabindex="0"
              @click="onTraitSlotClick(ti)"
              @keydown="onSlotKeydown($event, () => onTraitSlotClick(ti))"
            >
              <span class="mj-stat-k">{{ traitSlotInnerText(t) }}</span>
              <span class="mj-stat-v">{{ traitSlotRarity(t) ?? "" }}</span>
            </div>
            <div v-if="!traitRows.length" class="mj-stat-cell">
              <span class="mj-stat-k">暂无天赋</span>
            </div>
          </div>
        </div>

        <div class="mj-equip-block">
          <h3 class="mj-attr-section-title">法宝</h3>
          <div class="mj-inventory-grid mj-treasure-grid" aria-label="法宝栏四格">
            <div
              v-for="slot in equipSlots"
              :key="slot.key"
              class="mj-inventory-slot"
              :class="slot.item ? 'mj-treasure-slot--filled' : ''"
              :data-rarity="slot.item ? gradeToTraitRarity(slot.item.grade) : undefined"
              :title="slot.item ? `${treasureCellName(slot.item)}\n（点击查看详情）` : '法宝空位'"
              :tabindex="slot.item ? 0 : -1"
              @click="slot.item && onEquipSlotClick(slot.key)"
              @keydown="slot.item && onSlotKeydown($event, () => onEquipSlotClick(slot.key))"
            >
              <span class="mj-treasure-slot-label">{{ slot.item ? treasureCellName(slot.item) : "" }}</span>
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
                :title="cell ? `${gongfaCellName(cell)}（第${cell.mastery ?? 1}层${cell.masteryExp ? ' ' + cell.masteryExp + '/' + gongfaMasteryThresholdText(cell) : ''}）\n（点击查看详情）` : '功法空位'"
                :tabindex="cell ? 0 : -1"
                @click="cell && onGongfaSlotClick(gi)"
                @keydown="cell && onSlotKeydown($event, () => onGongfaSlotClick(gi))"
              >
                <span class="mj-gongfa-slot-label">{{ cell ? gongfaCellName(cell) : "" }}</span>
                <span v-if="cell" class="mj-gongfa-slot-mastery">{{ gongfaMasteryLabel(cell) }}</span>
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

  <PortraitHistoryModal
    :open="historyModalOpen && !!protagonist"
    :display-name="protagonist?.displayName ?? ''"
    :candidates="protagonist?.avatarCandidates ?? []"
    :avatar-url="protagonist?.avatarUrl ?? ''"
    @close="closeHistoryModal"
    @select="onSelectCandidate"
    @remove="onRemoveCandidate"
    @upload="onHistoryUpload"
  />
</template>

<style scoped>
.mj-buff-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
}

.mj-buff-effect {
  flex: 1;
  font-size: 12px;
}

.mj-buff-days {
  font-size: 12px;
  opacity: 0.7;
  white-space: nowrap;
}
</style>

