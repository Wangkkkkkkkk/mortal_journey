<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useFateChoice, CUSTOM_GENDER_KEY } from "./useFateChoice";
import type { FateChoiceResult, NarrationPerson, DifficultyLevel } from "./types";
import type { TraitOption } from "./useFateChoice";
import type { TraitSample } from "./traits";
import { parseRealmFromCustomText } from "./useFateChoice";
import { CUSTOM_REALM_MAJORS, CUSTOM_REALM_MINORS, LINGGEN_ELEMENT_EFFECTS } from "./types";
import type { PrimaryStatKey } from "../role_core/types/playInfo";
import { PRIMARY_STAT_KEYS, PRIMARY_STAT_KEY_TO_ZH } from "../role_core/types/playInfo";
import { formatWorldLocationDash } from "../role_core/types/worldLocation";
import TraitDetailModal from "./TraitDetailModal.vue";
import LinggenDetailModal from "./LinggenDetailModal.vue";
import CustomBirthModal from "./CustomBirthModal.vue";

const props = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  complete: [payload: FateChoiceResult];
}>();

const {
  CREATION_BIRTHS,
  CREATION_RACES,
  CREATION_FACTIONS,
  DIFFICULTY_OPTIONS,
  LINGGEN_ELEMENT_POOL,
  STAT_POINT_COST,
  STAT_PURCHASE_STEP,
  traitsByCategory,
  traitCost,
  linggenCost,
  birthKeysOrdered,
  genderKeysOrdered,
  selectedDifficulty,
  selectedBirth,
  customBirth,
  selectedGender,
  customGender,
  ageInput,
  raceKeysOrdered,
  factionKeysOrdered,
  selectedRace,
  selectedFaction,
  narrationPerson,
  playerName,
  pointBudgetInput,
  pointsSpent,
  pointsLeft,
  selectedTraits,
  isTraitSelected,
  toggleTrait,
  randomizeTraits,
  clearTraits,
  statPurchase,
  buyStat,
  sellStat,
  linggenElements,
  linggenType,
  linggenPointsSpent,
  toggleLinggenElement,
  applyRandomLinggen,
  statusMessage,
  isReady,
  reset,
  prepareInitialRolls,
  buildPayload,
  selectBirth,
  applyCustomBirth,
  resolveBirthLocationDescFromDef,
} = useFateChoice();

/** 当前页签：基础信息 / 天赋购点。 */
const activeTab = ref<"basics" | "talent">("basics");

const TAB_ROWS = [
  { key: "basics", title: "基础", desc: "难度、姓名、人称、性别、年龄、种族、阵营与出身。" },
  { key: "talent", title: "天赋", desc: "点数总额、灵根、基础属性与天赋词条的自选购点。" },
] as const;

function setTab(key: string): void {
  if (key === "basics" || key === "talent") activeTab.value = key;
}

function birthCardBlurb(birthKey: string): string {
  const bd = CREATION_BIRTHS[birthKey];
  return bd ? resolveBirthLocationDescFromDef(bd) : "";
}

const traitDetailTrait = ref<TraitOption | null>(null);
const linggenDetailOpen = ref(false);
const customModalOpen = ref(false);

const customModalInitial = computed(() => {
  const cb = customBirth.value;
  const fill = selectedBirth.value === "自定义" && cb && !cb.presetBirthKey;
  if (!fill || !cb) {
    return {
      location: { region: "", country: "", area: "", detail: "" } as import("../role_core/types/worldLocation").WorldLocation,
      realmMajor: CUSTOM_REALM_MAJORS[0]!,
      realmMinor: CUSTOM_REALM_MINORS[0]!,
      background: "",
    };
  }
  let maj: string = CUSTOM_REALM_MAJORS[0]!;
  let mino: string = CUSTOM_REALM_MINORS[0]!;
  if (cb.realmMajor && (CUSTOM_REALM_MAJORS as readonly string[]).includes(cb.realmMajor)) {
    maj = cb.realmMajor;
    if (cb.realmMinor && (CUSTOM_REALM_MINORS as readonly string[]).includes(cb.realmMinor)) {
      mino = cb.realmMinor;
    }
  } else if (cb.realmText) {
    const parsed = parseRealmFromCustomText(cb.realmText);
    if (parsed?.major) {
      maj = parsed.major;
      if (parsed.minor && (CUSTOM_REALM_MINORS as readonly string[]).includes(parsed.minor)) mino = parsed.minor;
    }
  }
  return {
    location: cb.location ?? { region: "", country: "", area: "", detail: "" },
    realmMajor: maj,
    realmMinor: mino,
    background: cb.background ?? "",
  };
});

/** 切换某个元素后灵根的新报价，用于在元素卡上提示改价。 */
function linggenCostAfterToggle(el: string): number {
  const has = linggenElements.value.includes(el);
  return linggenCost(has ? linggenElements.value.length - 1 : linggenElements.value.length + 1);
}

/** 词条卡在当前点数下是否买不起（已选中的始终可点，用于退选）。 */
function traitUnaffordable(t: TraitSample): boolean {
  return !isTraitSelected(t.name) && traitCost(t.rarity) > pointsLeft.value;
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      reset();
      prepareInitialRolls();
      activeTab.value = "basics";
      traitDetailTrait.value = null;
      linggenDetailOpen.value = false;
      customModalOpen.value = false;
      statusMessage.value = "";
    }
  },
  { immediate: true },
);

function onBackdropKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (traitDetailTrait.value) {
      traitDetailTrait.value = null;
      e.preventDefault();
      return;
    }
    if (customModalOpen.value) {
      customModalOpen.value = false;
      e.preventDefault();
      return;
    }
    if (linggenDetailOpen.value) {
      linggenDetailOpen.value = false;
      e.preventDefault();
      return;
    }
  }
}

function onBirthCardClick(name: string): void {
  if (name === "自定义") {
    customModalOpen.value = true;
    return;
  }
  selectBirth(name);
}

function onCustomBirthConfirm(payload: import("./types").CustomBirthPayload): void {
  applyCustomBirth(payload);
  customModalOpen.value = false;
}

function onConfirm(): void {
  if (!isReady.value) {
    statusMessage.value = "请完成姓名、性别与出身，并确保点数没有超支。";
    return;
  }
  const payload = buildPayload();
  emit("complete", payload);
}

function narrationDesc(key: string): string {
  if (key === "first") return "我";
  if (key === "second") return "你";
  return String(playerName.value || "无限");
}

function setNarrationPerson(key: string): void {
  if (key === "first" || key === "second" || key === "third") {
    narrationPerson.value = key as NarrationPerson;
  }
}

function setDifficulty(key: string): void {
  if (key === "简单" || key === "正常" || key === "困难") {
    selectedDifficulty.value = key as DifficultyLevel;
  }
}

function statLabel(key: PrimaryStatKey): string {
  return PRIMARY_STAT_KEY_TO_ZH[key] ?? key;
}

function customBirthSummary(): string {
  if (selectedBirth.value !== "自定义" || !customBirth.value) {
    return "点击填写出身地点、境界与背景";
  }
  const c = customBirth.value;
  const a = formatWorldLocationDash(c.location) || String(c.tag || "").slice(0, 40);
  const b = String(c.realmText || "").slice(0, 16);
  return a + " · " + b;
}
</script>

<template>
  <Teleport to="body">
    <div
      id="fc-character-screen"
      class="fc-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fc-step-title"
      @keydown="onBackdropKeydown"
    >
      <div class="creation-container" tabindex="-1">
        <div class="creation-content">
          <div class="creation-step-header">
            <div>
              <div id="fc-step-title" class="creation-step-title">
                <i class="fas fa-scroll" aria-hidden="true"></i>
                <span>命运抉择</span>
              </div>
              <div class="creation-step-subtitle">完成配置后点击「确认选择」生成开局 JSON（属性由后续流程计算）</div>
            </div>
          </div>

          <div class="creation-grid" style="grid-template-columns: repeat(2, 1fr)">
            <div
              v-for="tab in TAB_ROWS"
              :key="tab.key"
              class="creation-card"
              :class="{ selected: activeTab === tab.key }"
              role="button"
              tabindex="0"
              @click="setTab(tab.key)"
              @keydown.enter="setTab(tab.key)"
            >
              <h4>{{ tab.title }}</h4>
              <p>{{ tab.desc }}</p>
            </div>
          </div>

          <!-- ══════════════ 页签一：基础 ══════════════ -->
          <template v-if="activeTab === 'basics'">
            <div class="creation-section-title"><i class="fas fa-skull-crossbones"></i> 难度</div>
            <div class="creation-grid">
              <div
                v-for="opt in DIFFICULTY_OPTIONS"
                :key="opt.key"
                class="creation-card"
                :class="{ selected: selectedDifficulty === opt.key }"
                role="button"
                tabindex="0"
                @click="setDifficulty(opt.key)"
                @keydown.enter="setDifficulty(opt.key)"
              >
                <h4>{{ opt.title }}</h4>
                <p>{{ opt.desc }}</p>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-user"></i> 姓名</div>
            <div style="max-width: 620px">
              <input
                v-model="playerName"
                type="text"
                maxlength="24"
                placeholder="请输入姓名"
                class="fc-name-input"
              />
            </div>

            <div class="creation-section-title"><i class="fas fa-pen-fancy"></i> 叙事人称</div>
            <div class="creation-grid">
              <div
                v-for="row in [
                  { key: 'first', title: '第一人称' },
                  { key: 'second', title: '第二人称' },
                  { key: 'third', title: '第三人称' },
                ]"
                :key="row.key"
                class="creation-card"
                :class="{ selected: narrationPerson === row.key }"
                role="button"
                tabindex="0"
                @click="setNarrationPerson(row.key)"
                @keydown.enter="setNarrationPerson(row.key)"
              >
                <h4>{{ row.title }}</h4>
                <p>{{ narrationDesc(row.key) }}</p>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-venus-mars"></i> 性别</div>
            <div class="creation-grid">
              <div
                v-for="name in genderKeysOrdered"
                :key="name"
                class="creation-card"
                :class="{ selected: selectedGender === name }"
                role="button"
                tabindex="0"
                @click="selectedGender = name"
                @keydown.enter="selectedGender = name"
              >
                <h4>{{ name }}</h4>
                <input
                  v-if="name === CUSTOM_GENDER_KEY"
                  v-model="customGender"
                  type="text"
                  maxlength="12"
                  placeholder="自行填写性别"
                  class="fc-name-input"
                  style="height: 36px; font-size: 14px"
                  @click.stop
                  @focus="selectedGender = CUSTOM_GENDER_KEY"
                />
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-hourglass-half"></i> 年龄</div>
            <div style="max-width: 620px">
              <input
                v-model="ageInput"
                type="number"
                min="1"
                placeholder="留空则由开局剧情按境界推定"
                class="fc-name-input"
              />
            </div>

            <div class="creation-section-title"><i class="fas fa-dna"></i> 种族</div>
            <div class="creation-grid">
              <div
                v-for="name in raceKeysOrdered"
                :key="name"
                class="creation-card"
                :class="{ selected: selectedRace === name }"
                role="button"
                tabindex="0"
                @click="selectedRace = name"
                @keydown.enter="selectedRace = name"
              >
                <h4><span>{{ name }}</span></h4>
                <p>{{ CREATION_RACES[name]?.desc }}</p>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-yin-yang"></i> 阵营</div>
            <div class="creation-grid">
              <div
                v-for="name in factionKeysOrdered"
                :key="name"
                class="creation-card"
                :class="{ selected: selectedFaction === name }"
                role="button"
                tabindex="0"
                @click="selectedFaction = name"
                @keydown.enter="selectedFaction = name"
              >
                <h4><span>{{ name }}</span></h4>
                <p>{{ CREATION_FACTIONS[name]?.desc }}</p>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-baby"></i> 选择出身</div>
            <div class="creation-grid">
              <template v-for="name in birthKeysOrdered" :key="name">
                <div
                  v-if="name === '自定义'"
                  class="creation-card"
                  :class="{ selected: selectedBirth === '自定义' }"
                  role="button"
                  tabindex="0"
                  @click="onBirthCardClick('自定义')"
                  @keydown.enter="onBirthCardClick('自定义')"
                >
                  <h4><span>自定义出身</span></h4>
                  <p>{{ customBirthSummary() }}</p>
                </div>
                <div
                  v-else-if="CREATION_BIRTHS[name]"
                  class="creation-card"
                  :class="{ selected: selectedBirth === name }"
                  role="button"
                  tabindex="0"
                  @click="onBirthCardClick(name)"
                  @keydown.enter="onBirthCardClick(name)"
                >
                  <h4><span>{{ name }}</span></h4>
                  <p v-if="birthCardBlurb(name)">{{ birthCardBlurb(name) }}</p>
                </div>
              </template>
            </div>
          </template>

          <!-- ══════════════ 页签二：天赋购点 ══════════════ -->
          <template v-else>
            <div class="creation-section-title"><i class="fas fa-coins"></i> 点数</div>
            <div class="creation-grid" style="grid-template-columns: repeat(2, 1fr)">
              <div class="creation-card" style="cursor: default">
                <h4>点数总额</h4>
                <input
                  v-model="pointBudgetInput"
                  type="number"
                  min="0"
                  class="fc-name-input"
                  style="height: 36px; font-size: 14px"
                />
              </div>
              <div class="creation-card" style="cursor: default">
                <h4>剩余 {{ pointsLeft }} / 已用 {{ pointsSpent }}</h4>
                <p>随机抽取的词条与随机灵根不消耗点数；手动选购的词条、灵根与基础属性按表计价，取消选择即退还。</p>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-bolt"></i> 灵根</div>
            <div class="fc-linggen-block">
              <div id="linggen-result-display" style="transform: scale(1.08)">
                <div class="linggen-orb" :class="'orb-type-' + linggenType">
                  <div class="linggen-tag" :class="'tag-type-' + linggenType">{{ linggenType }}</div>
                  <div class="linggen-elements">{{ linggenElements.join(" ") }}</div>
                  <button
                    type="button"
                    class="trait-detail-btn"
                    title="查看灵根详情"
                    @click.stop="linggenDetailOpen = true"
                  >
                    <i class="fas fa-info-circle"></i>
                  </button>
                </div>
              </div>
              <p class="fc-trait-hint">
                元素越少灵根越纯、点数越贵。当前消耗 {{ linggenPointsSpent }} 点{{
                  linggenPointsSpent === 0 && linggenElements.length ? "（随机所得，免费）" : ""
                }}。
              </p>
              <div class="creation-grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))">
                <div
                  v-for="el in LINGGEN_ELEMENT_POOL"
                  :key="el"
                  class="creation-card"
                  :class="{ selected: linggenElements.includes(el) }"
                  role="button"
                  tabindex="0"
                  @click="toggleLinggenElement(el)"
                  @keydown.enter="toggleLinggenElement(el)"
                >
                  <h4>{{ el }}</h4>
                  <p>{{ LINGGEN_ELEMENT_EFFECTS[el] }}</p>
                  <p>{{ linggenElements.includes(el) ? "移除后" : "选入后" }}共 {{ linggenCostAfterToggle(el) }} 点</p>
                </div>
              </div>
              <div class="action-buttons-grid fc-linggen-random-row">
                <button type="button" class="major-action-button" @click="applyRandomLinggen()">
                  <i class="fas fa-dice-d20"></i> 随机灵根（免费）
                </button>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-chart-simple"></i> 基础属性</div>
            <div class="creation-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))">
              <div
                v-for="key in PRIMARY_STAT_KEYS"
                :key="key"
                class="creation-card"
                :class="{ selected: (statPurchase[key] ?? 0) > 0 }"
                style="cursor: default"
              >
                <h4>{{ statLabel(key) }} +{{ statPurchase[key] ?? 0 }}</h4>
                <p>每 {{ STAT_PURCHASE_STEP }} 点消耗 {{ STAT_POINT_COST[key] * STAT_PURCHASE_STEP }} 点数</p>
                <div style="display: flex; gap: 8px">
                  <button
                    type="button"
                    class="major-action-button"
                    :disabled="(statPurchase[key] ?? 0) <= 0"
                    @click="sellStat(key)"
                  >
                    <i class="fas fa-minus"></i>
                  </button>
                  <button
                    type="button"
                    class="major-action-button"
                    :disabled="STAT_POINT_COST[key] * STAT_PURCHASE_STEP > pointsLeft"
                    @click="buyStat(key)"
                  >
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </div>
            </div>

            <div class="creation-section-title"><i class="fas fa-star"></i> 天赋词条（已选 {{ selectedTraits.length }} 条）</div>
            <div class="action-buttons-grid" style="width: 100%; max-width: 620px; margin: 0 auto">
              <button type="button" class="major-action-button" @click="randomizeTraits()">
                <i class="fas fa-dice"></i> 随机抽取（免费）
              </button>
              <button type="button" class="major-action-button" @click="clearTraits()">
                <i class="fas fa-eraser"></i> 清空已选
              </button>
              <p class="fc-trait-hint">
                「随机抽取」会替换当前全部已选词条，所得不消耗点数；点击下方词条卡可自行购入或退选。
              </p>
            </div>

            <template v-for="group in traitsByCategory" :key="group.key">
              <div class="creation-section-title">{{ group.title }}</div>
              <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px">
                <div
                  v-for="trait in group.traits"
                  :key="trait.name"
                  class="trait-card"
                  :class="{ selected: isTraitSelected(trait.name) }"
                  :data-rarity="trait.rarity"
                  :data-trait-name="trait.name"
                  :style="traitUnaffordable(trait) ? 'opacity: 0.4' : ''"
                  role="button"
                  tabindex="0"
                  @click="toggleTrait(trait)"
                  @keydown.enter="toggleTrait(trait)"
                >
                  <div class="trait-rarity">{{ trait.rarity }}</div>
                  <i v-if="isTraitSelected(trait.name)" class="fas fa-check selected-indicator"></i>
                  <div class="trait-name">{{ trait.name }}</div>
                  <div class="fc-trait-hint">{{ traitCost(trait.rarity) }} 点</div>
                  <button
                    type="button"
                    class="trait-detail-btn"
                    title="查看详情"
                    @click.stop="traitDetailTrait = trait"
                  >
                    <i class="fas fa-info-circle"></i>
                  </button>
                </div>
              </div>
            </template>
          </template>

          <div
            v-if="statusMessage"
            class="fc-status"
            style="margin: 10px 0 0; font-size: 13px; color: #e0b15a"
          >
            {{ statusMessage }}
          </div>
        </div>

        <div class="creation-nav">
          <div class="creation-nav-enhanced">
            <button type="button" class="major-action-button nav-btn nav-btn-back" @click="emit('close')">
              <i class="fas fa-home"></i>
              <span>返回</span>
            </button>
            <button
              type="button"
              class="major-action-button nav-btn nav-btn-next"
              :disabled="!isReady"
              @click="onConfirm"
            >
              <span>确认选择</span>
              <i class="fas fa-check"></i>
            </button>
          </div>
        </div>
      </div>

      <TraitDetailModal :trait="traitDetailTrait" @close="traitDetailTrait = null" />
      <LinggenDetailModal
        :open="linggenDetailOpen"
        :type="linggenType"
        :elements="linggenElements"
        @close="linggenDetailOpen = false"
      />
      <CustomBirthModal
        :open="customModalOpen"
        :initial-location="customModalInitial.location"
        :initial-realm-major="customModalInitial.realmMajor"
        :initial-realm-minor="customModalInitial.realmMinor"
        :initial-background="customModalInitial.background"
        @close="customModalOpen = false"
        @confirm="onCustomBirthConfirm"
      />
    </div>
  </Teleport>
</template>
