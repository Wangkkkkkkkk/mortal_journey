/**
 * @fileoverview 命运抉择：仅表单状态、购点结算与 JSON 结果构造（不计算角色属性）。
 */

import { computed, ref } from "vue";
import type { TraitRarity, TraitSample } from "./traits";
import { traitSamples, traitsByCategory, TRAIT_RARITY_COST } from "./traits";
import type { BirthDefinition, DifficultyLevel, TraitRarityWeightRow } from "./types";
import type { PrimaryStatKey } from "../role_core/types/playInfo";
import { PRIMARY_STAT_KEYS } from "../role_core/types/playInfo";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { formatWorldLocationDash } from "../role_core/types/worldLocation";
import {
  CREATION_AGE_MAX,
  CREATION_AGE_MIN,
  CREATION_BIRTHS,
  CREATION_FACTIONS,
  CREATION_GENDERS,
  CREATION_RACES,
  CUSTOM_REALM_MAJORS,
  CUSTOM_REALM_MINORS,
  DEFAULT_POINT_BUDGET,
  DIFFICULTY_OPTIONS,
  LINGGEN_ELEMENT_POOL,
  LINGGEN_PURCHASE_COST,
  LINGGEN_TYPE_PREFIXES,
  POINT_BUDGET_MAX,
  POINT_BUDGET_MIN,
  RANDOM_TRAIT_COUNT,
  linggenTypeForElementCount,
  rollRandomLinggenName,
  START_REALM_MAJOR,
  START_REALM_STAGE,
  STAT_POINT_COST,
  STAT_PURCHASE_MAX,
  STAT_PURCHASE_STEP,
  TRAIT_RARITY_WEIGHTS,
} from "./types";
import type { CustomBirthPayload, FateChoiceResult, NarrationPerson } from "./types";
import "./fateChoice.css";

// ---------------------------------------------------------------------------
// 公共类型与工具函数
// ---------------------------------------------------------------------------

/** 性别卡中代表「自填」的哨兵键。 */
export const CUSTOM_GENDER_KEY = "自定义";

export interface TraitOption extends TraitSample {
  /** 由「随机抽取」给出，不计入点数消耗。仅 UI/内部状态，不进入最终结果。 */
  free?: boolean;
}

/**
 * 从出生定义中取出地点名称（展示用）。
 *
 * @param {BirthDefinition|undefined} bd 出生配置；缺省时视为无地点。
 * @return {string} 去首尾空白后的地点名；无则为 `""`。
 */
function resolveBirthLocationFromDef(bd: BirthDefinition | undefined): WorldLocation | null {
  if (!bd) return null;
  return bd.location;
}

/**
 * 从出生定义中取出地点/背景描述文案。
 *
 * @param {BirthDefinition|undefined} bd 出生配置；缺省时视为无描述。
 * @return {string} 去首尾空白后的描述；无则为 `""`。
 */
function resolveBirthLocationDescFromDef(bd: BirthDefinition | undefined): string {
  if (!bd) return "";
  return String(bd.desc ?? "").trim();
}

/**
 * 从自定义境界文案中解析大境界与小阶段（按出现优先级匹配）。
 *
 * @param {string} text 用户或配置中的境界描述字符串。
 * @return {{major: string, minor: string|null}|null} 解析到的大/小境界；无法识别大境界时为 `null`。
 */
export function parseRealmFromCustomText(text: string): { major: string; minor: string | null } | null {
  const s = String(text || "").trim();
  if (!s) return null;
  let major = "";
  for (let mi = 0; mi < CUSTOM_REALM_MAJORS.length; mi++) {
    if (s.includes(CUSTOM_REALM_MAJORS[mi]!)) {
      major = CUSTOM_REALM_MAJORS[mi]!;
      break;
    }
  }
  if (!major) return null;
  let minor = "";
  for (let si = 0; si < CUSTOM_REALM_MINORS.length; si++) {
    if (s.includes(CUSTOM_REALM_MINORS[si]!)) {
      minor = CUSTOM_REALM_MINORS[si]!;
      break;
    }
  }
  return { major, minor };
}

/**
 * 从完整灵根文案中取出五行元素部分（去掉首段类型词）。
 *
 * @param {string|null|undefined} roll 完整灵根文案，例如 `天灵根 木`、`真灵根 金, 水`；空则视为无内容。
 * @return {string} 元素串，例如 `木`、`金, 水`；仅类型无元素或无法解析时为 `""`。
 */
export function linggenElementsFromRoll(roll: string | null | undefined): string {
  const s = String(roll ?? "").trim();
  if (!s) return "";
  const spaceIdx = s.indexOf(" ");
  if (spaceIdx === -1) {
    return LINGGEN_TYPE_PREFIXES.has(s) ? "" : s;
  }
  const first = s.slice(0, spaceIdx).trim();
  const rest = s.slice(spaceIdx + 1).trim();
  if (rest) return rest;
  return LINGGEN_TYPE_PREFIXES.has(first) ? "" : s;
}

/**
 * 将灵根元素段按逗号拆成数组（去空白、去空项）。
 *
 * @param {string|null|undefined} roll 完整灵根文案，例如 `真灵根 金, 火`。
 * @return {string[]} 元素名数组，例如 `["金", "火"]`；无元素时为 `[]`。
 */
export function linggenElementsArrayFromRoll(roll: string | null | undefined): string[] {
  const part = linggenElementsFromRoll(roll);
  if (!part) return [];
  return part
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

// ---------------------------------------------------------------------------
// 购点内部工具
// ---------------------------------------------------------------------------

/**
 * 查表得到一条天赋的点数单价。
 *
 * @param rarity 稀有度。
 * @return 点数；表中缺项时为 0。
 */
export function traitCost(rarity: TraitRarity): number {
  const c = TRAIT_RARITY_COST[rarity];
  return typeof c === "number" && isFinite(c) && c > 0 ? c : 0;
}

/**
 * 查表得到指定元素个数的灵根点数消耗。
 *
 * @param count 五行元素个数。
 * @return 点数；表中缺项时为 0。
 */
export function linggenCost(count: number): number {
  const c = LINGGEN_PURCHASE_COST[count];
  return typeof c === "number" && isFinite(c) && c > 0 ? c : 0;
}

// ---------------------------------------------------------------------------
// 词条随机内部工具
// ---------------------------------------------------------------------------

function rollTraitRarityFromWeights(rows: readonly TraitRarityWeightRow[]): TraitRarity {
  if (!rows.length) return "平庸";
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    const w = rows[i]!.weight;
    sum += typeof w === "number" && isFinite(w) && w > 0 ? w : 0;
  }
  if (sum <= 0) return rows[0]!.rarity || "平庸";
  const r = Math.random() * sum;
  let acc = 0;
  for (let j = 0; j < rows.length; j++) {
    const wj = rows[j]!.weight;
    const nw = typeof wj === "number" && isFinite(wj) && wj > 0 ? wj : 0;
    if (nw <= 0) continue;
    acc += nw;
    if (r < acc) return rows[j]!.rarity || "平庸";
  }
  return rows[rows.length - 1]!.rarity || "平庸";
}

function cloneTraitForOption(t: TraitSample, free: boolean): TraitOption {
  return { name: t.name, rarity: t.rarity, category: t.category, desc: t.desc, effect: t.effect, free };
}

function pickRandomTraits(pool: readonly TraitSample[], excludeNames: string[], count: number): TraitOption[] {
  let bag = pool.filter((t) => t && t.name && excludeNames.indexOf(t.name) === -1);
  const out: TraitOption[] = [];
  for (let i = 0; i < count && bag.length; i++) {
    const rarity = rollTraitRarityFromWeights(TRAIT_RARITY_WEIGHTS);
    const candidates = bag.filter((x) => x.rarity === rarity);
    const pickFrom = candidates.length ? candidates : bag;
    const idx = Math.floor(Math.random() * pickFrom.length);
    const pickedName = pickFrom[idx]!.name;
    bag = bag.filter((x) => !x || x.name !== pickedName);
    out.push(cloneTraitForOption(pickFrom[idx]!, true));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 出身内部工具
// ---------------------------------------------------------------------------

function buildOrderedBirthKeys(): string[] {
  const out = Object.keys(CREATION_BIRTHS).filter((k) => k !== "自定义");
  out.push("自定义");
  return out;
}

function makePresetCustomBirth(birthKey: string): CustomBirthPayload | null {
  const bd = CREATION_BIRTHS[birthKey];
  if (!bd) return null;
  const loc = bd.location;
  const bg = resolveBirthLocationDescFromDef(bd) || "";
  const locStr = formatWorldLocationDash(loc) || birthKey;
  return {
    tag: locStr,
    name: locStr,
    location: loc,
    realmMajor: START_REALM_MAJOR,
    realmMinor: START_REALM_STAGE,
    realmText: START_REALM_MAJOR + START_REALM_STAGE,
    background: bg,
    presetBirthKey: birthKey,
  };
}

// ===========================================================================
// useFateChoice：按 UI 选择顺序组织
// ===========================================================================

/**
 * 命运抉择表单与购点逻辑。
 * 内部状态分两个页签：基础（难度/姓名/人称/性别/年龄/种族/阵营/出身）与天赋（点数/灵根/属性/词条）。
 */
export function useFateChoice() {
  // ── 0. 难度 ──────────────────────────────────────────────────────────────
  const selectedDifficulty = ref<DifficultyLevel>("简单");

  // ── 1. 姓名 ──────────────────────────────────────────────────────────────
  const playerName = ref("无限");

  // ── 2. 叙事人称 ──────────────────────────────────────────────────────────
  const narrationPerson = ref<NarrationPerson>("first");

  // ── 3. 性别 / 年龄 / 种族 / 阵营 ─────────────────────────────────────────
  const genderKeysOrdered = [...CREATION_GENDERS, CUSTOM_GENDER_KEY];
  const selectedGender = ref<string>(CREATION_GENDERS[0]!);
  const customGender = ref("");
  /** 空串表示不指定年龄，交由开局管线按境界推导。 */
  const ageInput = ref("");
  const raceKeysOrdered = Object.keys(CREATION_RACES);
  const factionKeysOrdered = Object.keys(CREATION_FACTIONS);
  const selectedRace = ref<string>(raceKeysOrdered[0] ?? "");
  const selectedFaction = ref<string>(factionKeysOrdered[0] ?? "");

  /** 最终写入结果的性别文本：自填卡时取输入框，否则取卡片名。 */
  const effectiveGender = computed(() =>
    selectedGender.value === CUSTOM_GENDER_KEY ? customGender.value.trim() : selectedGender.value,
  );

  /** 解析年龄输入；空串或非法值为 `null`（不指定）。 */
  const effectiveAge = computed<number | null>(() => {
    const n = Math.floor(Number(ageInput.value));
    if (!Number.isFinite(n) || n < CREATION_AGE_MIN || n > CREATION_AGE_MAX) return null;
    return n;
  });

  // ── 4. 出身 ──────────────────────────────────────────────────────────────
  const birthKeysOrdered = buildOrderedBirthKeys();
  const DEFAULT_BIRTH_KEY = birthKeysOrdered[0] ?? "自定义";
  const selectedBirth = ref(DEFAULT_BIRTH_KEY);
  const customBirth = ref<CustomBirthPayload | null>(null);
  const birthLocation = ref<WorldLocation | null>(null);

  /** 非「自定义」时，用当前选中的预设出生同步 `customBirth` 与 `birthLocation`。 */
  function syncCustomBirthForCurrentSelection(): void {
    if (selectedBirth.value === "自定义") return;
    const bd = CREATION_BIRTHS[selectedBirth.value];
    if (!bd) return;
    customBirth.value = makePresetCustomBirth(selectedBirth.value);
    birthLocation.value = resolveBirthLocationFromDef(bd);
  }

  /** 选择预设出生（忽略名为 `自定义` 的调用）。 */
  function selectBirth(name: string): void {
    if (name === "自定义") return;
    selectedBirth.value = name;
    syncCustomBirthForCurrentSelection();
  }

  function applyCustomBirth(payload: CustomBirthPayload): void {
    selectedBirth.value = "自定义";
    birthLocation.value = payload.location;
    customBirth.value = payload;
  }

  /** 根据当前出生载荷解析有效起始大/小境界。 */
  function getEffectiveStartRealm(): { major: string; minor: string | null } {
    const cb = customBirth.value;
    if (cb) {
      if (cb.realmMajor && (CUSTOM_REALM_MAJORS as readonly string[]).includes(cb.realmMajor)) {
        const mn =
          cb.realmMinor && (CUSTOM_REALM_MINORS as readonly string[]).includes(cb.realmMinor)
            ? cb.realmMinor
            : START_REALM_STAGE;
        return { major: cb.realmMajor, minor: mn };
      }
      if (cb.realmText) {
        const p = parseRealmFromCustomText(cb.realmText);
        if (p && p.major) return { major: p.major, minor: p.minor };
      }
    }
    return { major: START_REALM_MAJOR, minor: START_REALM_STAGE };
  }

  function resolveStartBirthLocation(): WorldLocation {
    if (birthLocation.value != null) {
      return birthLocation.value;
    }
    const bd = CREATION_BIRTHS[selectedBirth.value];
    if (bd) {
      const loc = resolveBirthLocationFromDef(bd);
      if (loc) return loc;
    }
    return { region: "", country: "", area: "", detail: "" };
  }

  /** 解析出身故事/背景。 */
  function resolveOriginStory(): string {
    const cb = customBirth.value;
    if (cb != null && String(cb.background || "").trim() !== "") {
      return String(cb.background).trim();
    }
    return "";
  }

  // ── 5. 点数总额 ──────────────────────────────────────────────────────────
  const pointBudgetInput = ref(String(DEFAULT_POINT_BUDGET));

  /** 解析后的点数总额；非法输入按 0 计。 */
  const pointBudget = computed(() => {
    const n = Math.floor(Number(pointBudgetInput.value));
    if (!Number.isFinite(n)) return 0;
    return Math.max(POINT_BUDGET_MIN, Math.min(POINT_BUDGET_MAX, n));
  });

  // ── 6. 灵根（购点 / 随机） ───────────────────────────────────────────────
  const linggenElements = ref<string[]>([]);
  /** 由「随机灵根」得到，不计入点数消耗；手动改动元素后置 false。 */
  const linggenFree = ref(true);

  const linggenType = computed(() => linggenTypeForElementCount(linggenElements.value.length));
  const linggenPointsSpent = computed(() =>
    linggenFree.value ? 0 : linggenCost(linggenElements.value.length),
  );

  /** 随机 roll 一条灵根（不消耗点数）。 */
  function applyRandomLinggen(): void {
    linggenElements.value = linggenElementsArrayFromRoll(rollRandomLinggenName());
    linggenFree.value = true;
  }

  // ── 7. 主属性购点 ────────────────────────────────────────────────────────
  const statPurchase = ref<Partial<Record<PrimaryStatKey, number>>>({});

  const statPointsSpent = computed(() => {
    let sum = 0;
    for (const key of PRIMARY_STAT_KEYS) {
      sum += (statPurchase.value[key] ?? 0) * (STAT_POINT_COST[key] ?? 0);
    }
    return sum;
  });

  // ── 8. 天赋词条 ──────────────────────────────────────────────────────────
  const selectedTraits = ref<TraitOption[]>([]);

  const traitPointsSpent = computed(() => {
    let sum = 0;
    for (const t of selectedTraits.value) {
      if (!t.free) sum += traitCost(t.rarity);
    }
    return sum;
  });

  // ── 9. 点数结算 ──────────────────────────────────────────────────────────
  const pointsSpent = computed(
    () => traitPointsSpent.value + statPointsSpent.value + linggenPointsSpent.value,
  );
  const pointsLeft = computed(() => pointBudget.value - pointsSpent.value);

  function isTraitSelected(name: string): boolean {
    return selectedTraits.value.some((t) => t.name === name);
  }

  /** 选中则取消（并退点），未选中则在点数足够时购入。 */
  function toggleTrait(sample: TraitSample): void {
    if (isTraitSelected(sample.name)) {
      selectedTraits.value = selectedTraits.value.filter((t) => t.name !== sample.name);
      return;
    }
    if (traitCost(sample.rarity) > pointsLeft.value) return;
    selectedTraits.value = [...selectedTraits.value, cloneTraitForOption(sample, false)];
  }

  /** 随机抽取一整套词条替换当前选择；随机所得不消耗点数。 */
  function randomizeTraits(): void {
    selectedTraits.value = pickRandomTraits(traitSamples, [], RANDOM_TRAIT_COUNT);
  }

  /** 清空已选词条（退还全部词条点数）。 */
  function clearTraits(): void {
    selectedTraits.value = [];
  }

  /**
   * 切换一个五行元素。灵根按「元素总数」整体计价，故先退回当前灵根消耗再校验新价。
   */
  function toggleLinggenElement(el: string): void {
    const has = linggenElements.value.includes(el);
    const next = has
      ? linggenElements.value.filter((x) => x !== el)
      : LINGGEN_ELEMENT_POOL.filter((x) => linggenElements.value.includes(x) || x === el);
    const refunded = pointsLeft.value + linggenPointsSpent.value;
    if (linggenCost(next.length) > refunded) return;
    linggenElements.value = next;
    linggenFree.value = false;
  }

  /** 购买一档主属性（步长见 `STAT_PURCHASE_STEP`）。 */
  function buyStat(key: PrimaryStatKey): void {
    const current = statPurchase.value[key] ?? 0;
    if (current + STAT_PURCHASE_STEP > STAT_PURCHASE_MAX) return;
    if ((STAT_POINT_COST[key] ?? 0) * STAT_PURCHASE_STEP > pointsLeft.value) return;
    statPurchase.value = { ...statPurchase.value, [key]: current + STAT_PURCHASE_STEP };
  }

  /** 退还一档主属性。 */
  function sellStat(key: PrimaryStatKey): void {
    const current = statPurchase.value[key] ?? 0;
    if (current <= 0) return;
    statPurchase.value = { ...statPurchase.value, [key]: Math.max(0, current - STAT_PURCHASE_STEP) };
  }

  // ── 10. 状态与提交 ───────────────────────────────────────────────────────
  const statusMessage = ref("");

  const isReady = computed(
    () =>
      !!playerName.value.trim() &&
      !!effectiveGender.value &&
      !!selectedBirth.value &&
      pointsLeft.value >= 0,
  );

  /** 根据当前表单状态组装提交用的 {@link FateChoiceResult}。 */
  function buildPayload(): FateChoiceResult {
    const er = getEffectiveStartRealm();
    const np: NarrationPerson =
      narrationPerson.value === "first" || narrationPerson.value === "third"
        ? narrationPerson.value
        : "second";
    const stats: Partial<Record<PrimaryStatKey, number>> = {};
    for (const key of PRIMARY_STAT_KEYS) {
      const v = statPurchase.value[key] ?? 0;
      if (v > 0) stats[key] = v;
    }
    return {
      basics: {
        playerName: String(playerName.value || "").trim() || "无限",
        narrationPerson: np,
        gender: effectiveGender.value,
        age: effectiveAge.value,
        race: selectedRace.value,
        faction: selectedFaction.value,
        realmMajor: er.major,
        realmMinor: er.minor == null ? null : er.minor,
        birthPlace: resolveStartBirthLocation(),
        originStory: resolveOriginStory(),
        linggen: linggenElements.value.slice(),
        difficulty: selectedDifficulty.value,
        statPurchase: stats,
      },
      traits: selectedTraits.value.map((t) => ({
        name: t.name,
        rarity: t.rarity,
        desc: t.desc,
        effect: t.effect,
      })),
    };
  }

  // ── 生命周期：重置与初始化 ────────────────────────────────────────────────

  /** 将表单恢复为默认值。 */
  function reset(): void {
    selectedDifficulty.value = "简单";
    playerName.value = "无限";
    narrationPerson.value = "first";
    selectedGender.value = CREATION_GENDERS[0]!;
    customGender.value = "";
    ageInput.value = "";
    selectedRace.value = raceKeysOrdered[0] ?? "";
    selectedFaction.value = factionKeysOrdered[0] ?? "";
    selectedBirth.value = DEFAULT_BIRTH_KEY;
    customBirth.value = null;
    birthLocation.value = null;
    pointBudgetInput.value = String(DEFAULT_POINT_BUDGET);
    selectedTraits.value = [];
    statPurchase.value = {};
    linggenElements.value = [];
    linggenFree.value = true;
    statusMessage.value = "";
    syncCustomBirthForCurrentSelection();
  }

  /** 若尚无灵根或词条，则各执行一次随机（均不消耗点数）。 */
  function prepareInitialRolls(): void {
    if (!linggenElements.value.length) applyRandomLinggen();
    if (!selectedTraits.value.length) randomizeTraits();
  }

  return {
    CREATION_BIRTHS,
    CREATION_RACES,
    CREATION_FACTIONS,
    CUSTOM_REALM_MAJORS,
    CUSTOM_REALM_MINORS,
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
    playerName,
    narrationPerson,
    selectedGender,
    customGender,
    effectiveGender,
    ageInput,
    raceKeysOrdered,
    factionKeysOrdered,
    selectedRace,
    selectedFaction,
    selectedBirth,
    customBirth,
    selectBirth,
    applyCustomBirth,
    pointBudgetInput,
    pointBudget,
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
    buildPayload,
    reset,
    prepareInitialRolls,
    resolveBirthLocationDescFromDef,
  };
}
