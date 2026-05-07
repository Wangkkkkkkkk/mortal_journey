/**
 * @fileoverview 命运抉择：仅表单状态、灵根/词条随机与 JSON 结果构造（不计算角色属性）。
 */

import { computed, ref } from "vue";
import type { TraitRarity, TraitSample } from "./traits";
import { traitSamples } from "./traits";
import type { BirthDefinition, TraitRarityWeightRow } from "./types";
import {
  CREATION_BIRTHS,
  CREATION_GENDERS,
  CUSTOM_REALM_MAJORS,
  CUSTOM_REALM_MINORS,
  LINGGEN_TYPE_PREFIXES,
  rollRandomLinggenName,
  START_REALM_MAJOR,
  START_REALM_STAGE,
  TRAIT_RARITY_WEIGHTS,
} from "./types";
import type { CustomBirthPayload, FateChoiceResult, NarrationPerson } from "./types";
import "./fateChoice.css";

// ---------------------------------------------------------------------------
// 公共类型与工具函数
// ---------------------------------------------------------------------------

export interface TraitOption extends TraitSample {
  locked: boolean;
}

/**
 * 从出生定义中取出地点名称（展示用）。
 *
 * @param {BirthDefinition|undefined} bd 出生配置；缺省时视为无地点。
 * @return {string} 去首尾空白后的地点名；无则为 `""`。
 */
function resolveBirthLocationNameFromDef(bd: BirthDefinition | undefined): string {
  if (!bd) return "";
  return String(bd.location ?? "").trim();
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

function cloneTraitForOption(t: TraitSample): TraitOption {
  return { name: t.name, rarity: t.rarity, desc: t.desc, locked: false };
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
    out.push(cloneTraitForOption(pickFrom[idx]!));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 出身内部工具
// ---------------------------------------------------------------------------

function buildOrderedBirthKeys(): string[] {
  const raw = Object.keys(CREATION_BIRTHS);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "自定义") out.push(raw[i]!);
  }
  const idx = out.indexOf("黄枫谷弟子");
  if (idx >= 0) out.splice(idx + 1, 0, "自定义");
  else out.push("自定义");
  return out;
}

function makePresetCustomBirth(birthKey: string): CustomBirthPayload | null {
  const bd = CREATION_BIRTHS[birthKey];
  if (!bd) return null;
  const loc = resolveBirthLocationNameFromDef(bd) || "";
  const bg = resolveBirthLocationDescFromDef(bd) || "";
  return {
    tag: loc || birthKey,
    name: loc || birthKey,
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
 * 命运抉择表单与随机逻辑。
 * 内部状态按 UI 选择顺序排列：姓名 → 叙事人称 → 性别 → 出身 → 词条 → 灵根 → 提交。
 */
export function useFateChoice() {
  // ── 1. 姓名 ──────────────────────────────────────────────────────────────
  const playerName = ref("韩立");

  // ── 2. 叙事人称 ──────────────────────────────────────────────────────────
  const narrationPerson = ref<NarrationPerson>("first");

  // ── 3. 性别 ──────────────────────────────────────────────────────────────
  const selectedGender = ref<string>(CREATION_GENDERS[0]!);

  // ── 4. 出身 ──────────────────────────────────────────────────────────────
  const selectedBirth = ref("凡人");
  const customBirth = ref<CustomBirthPayload | null>(null);
  const birthLocation = ref<string | null>(null);
  const birthKeysOrdered = buildOrderedBirthKeys();

  /** 非「自定义」时，用当前选中的预设出生同步 `customBirth` 与 `birthLocation`。 */
  function syncCustomBirthForCurrentSelection(): void {
    if (selectedBirth.value === "自定义") return;
    const bd = CREATION_BIRTHS[selectedBirth.value];
    if (!bd) return;
    customBirth.value = makePresetCustomBirth(selectedBirth.value);
    const locName = resolveBirthLocationNameFromDef(bd);
    birthLocation.value = locName ? String(locName).trim() : null;
  }

  /** 选择预设出生（忽略名为 `自定义` 的调用）。 */
  function selectBirth(name: string): void {
    if (name === "自定义") return;
    selectedBirth.value = name;
    syncCustomBirthForCurrentSelection();
  }

  /** 应用用户自定义出生。 */
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

  /** 解析出生地展示名。 */
  function resolveStartBirthLocation(): string {
    if (birthLocation.value != null && String(birthLocation.value).trim() !== "") {
      return String(birthLocation.value).trim();
    }
    const bd = CREATION_BIRTHS[selectedBirth.value];
    if (bd) {
      const defaultLocName = resolveBirthLocationNameFromDef(bd);
      if (defaultLocName) return String(defaultLocName).trim();
    }
    return "";
  }

  /** 解析出身故事/背景。 */
  function resolveOriginStory(): string {
    const cb = customBirth.value;
    if (cb != null && String(cb.background || "").trim() !== "") {
      return String(cb.background).trim();
    }
    return "";
  }

  // ── 5. 天赋词条 ──────────────────────────────────────────────────────────
  const currentTraitOptions = ref<TraitOption[]>([]);

  /** 保留已锁定词条并随机刷新其余槽位（共五格）。 */
  function randomizeTraits(): void {
    const locked = (currentTraitOptions.value || []).filter((t) => t && t.locked);
    if (locked.length >= 5) return;
    const need = Math.max(0, 5 - locked.length);
    const exclude = locked.map((t) => t.name);
    const fresh = pickRandomTraits(traitSamples, exclude, need);
    currentTraitOptions.value = locked.concat(fresh);
  }

  /** 按词条名切换对应选项的锁定状态。 */
  function toggleTraitLock(traitName: string): void {
    const opts = currentTraitOptions.value || [];
    const idx = opts.findIndex((t) => t.name === traitName);
    if (idx <= -1) return;
    const next = opts.slice();
    const row = next[idx]!;
    next[idx] = { ...row, locked: !row.locked };
    currentTraitOptions.value = next;
  }

  const traitRandomizeDisabled = computed(() => {
    const locked = (currentTraitOptions.value || []).filter((t) => t?.locked).length;
    return locked >= 5;
  });

  const traitRandomizeTitle = computed(() =>
    traitRandomizeDisabled.value ? "五格均已锁定，请先解锁至少一格后再刷新。" : "",
  );

  // ── 6. 灵根 ──────────────────────────────────────────────────────────────
  const selectedLinggen = ref<string | null>(null);

  /** 随机 roll 一条灵根文案。 */
  function applyRandomLinggen(): void {
    selectedLinggen.value = rollRandomLinggenName();
  }

  // ── 7. 状态与提交 ────────────────────────────────────────────────────────
  const statusMessage = ref("");

  const isReady = computed(
    () =>
      !!selectedBirth.value &&
      !!selectedGender.value &&
      !!selectedLinggen.value &&
      (currentTraitOptions.value?.length ?? 0) > 0,
  );

  /** 根据当前表单状态组装提交用的 {@link FateChoiceResult}。 */
  function buildPayload(): FateChoiceResult {
    const er = getEffectiveStartRealm();
    const np: NarrationPerson =
      narrationPerson.value === "first" || narrationPerson.value === "third"
        ? narrationPerson.value
        : "second";
    return {
      basics: {
        playerName: String(playerName.value || "").trim() || "韩立",
        narrationPerson: np,
        gender: selectedGender.value,
        realmMajor: er.major,
        realmMinor: er.minor == null ? null : er.minor,
        birthPlace: resolveStartBirthLocation(),
        originStory: resolveOriginStory(),
        linggen: linggenElementsArrayFromRoll(selectedLinggen.value),
      },
      traits: (currentTraitOptions.value || []).map((t) => ({
        name: t.name,
        rarity: t.rarity,
        desc: t.desc,
        locked: !!t.locked,
      })),
    };
  }

  // ── 生命周期：重置与初始化 ────────────────────────────────────────────────

  /** 将表单恢复为默认值。 */
  function reset(): void {
    playerName.value = "韩立";
    narrationPerson.value = "first";
    selectedGender.value = CREATION_GENDERS[0]!;
    selectedBirth.value = "凡人";
    customBirth.value = null;
    birthLocation.value = null;
    currentTraitOptions.value = [];
    selectedLinggen.value = null;
    statusMessage.value = "";
    syncCustomBirthForCurrentSelection();
  }

  /** 若尚无灵根或词条，则各执行一次随机。 */
  function prepareInitialRolls(): void {
    if (!selectedLinggen.value) applyRandomLinggen();
    if (!currentTraitOptions.value.length) {
      currentTraitOptions.value = pickRandomTraits(traitSamples, [], 5);
    }
  }

  return {
    CREATION_BIRTHS,
    CREATION_GENDERS,
    CUSTOM_REALM_MAJORS,
    CUSTOM_REALM_MINORS,
    birthKeysOrdered,
    playerName,
    narrationPerson,
    selectedGender,
    selectedBirth,
    customBirth,
    selectBirth,
    applyCustomBirth,
    currentTraitOptions,
    randomizeTraits,
    toggleTraitLock,
    traitRandomizeDisabled,
    traitRandomizeTitle,
    selectedLinggen,
    applyRandomLinggen,
    statusMessage,
    isReady,
    buildPayload,
    reset,
    prepareInitialRolls,
    resolveBirthLocationDescFromDef,
  };
}
