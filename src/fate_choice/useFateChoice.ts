/**
 * @fileoverview 命运抉择：仅表单状态、灵根/词条随机与 JSON 结果构造（不计算角色属性）。
 */

import { computed, ref } from "vue";
import type { TraitRarity, TraitSample } from "../config/traits";
import { traitSamples } from "../config/traits";
import type { BirthDefinition, TraitRarityWeightRow } from "../config/creation";
import {
  CREATION_BIRTHS,
  CREATION_GENDERS,
  rollRandomLinggenName,
  TRAIT_RARITY_WEIGHTS,
} from "../config/creation";
import type { CustomBirthPayload, FateChoiceResult, NarrationPerson } from "./types";
import "./fateChoice.css";

export type { NarrationPerson, CustomBirthPayload, FateChoiceTrait, FateChoiceBasics, FateChoiceResult } from "./types";

const START_REALM_MAJOR = "练气";
const START_REALM_STAGE = "初期";

const CUSTOM_REALM_MAJORS = ["练气", "筑基", "结丹", "元婴", "化神"] as const;
const CUSTOM_REALM_MINORS = ["初期", "中期", "后期"] as const;

export interface TraitOption extends TraitSample {
  locked: boolean;
}

/** 与 `rollRandomLinggenName()` 返回串中首段类型一致，用于从结果里剥掉前缀只保留元素。 */
const LINGGEN_TYPE_PREFIXES = new Set(["天灵根", "真灵根", "伪灵根", "无灵根"]);

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
 * 与 {@link linggenElementsFromRoll} 语义一致，将元素段按逗号拆成数组（去空白、去空项）。
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

/**
 * 从自定义境界文案中解析大境界与小阶段（按出现优先级匹配）。
 *
 * @param {string} text 用户或配置中的境界描述字符串。
 * @return {{major: string, minor: string|null}|null} 解析到的大/小境界；无法识别大境界时为 `null`。
 */
export function parseRealmFromCustomText(text: string): { major: string; minor: string | null } | null {
  const s = String(text || "").trim();
  if (!s) return null;
  const majors = ["化神", "元婴", "结丹", "筑基", "练气"];
  const stages = ["后期", "中期", "初期"];
  let major = "";
  for (let mi = 0; mi < majors.length; mi++) {
    if (s.includes(majors[mi]!)) {
      major = majors[mi]!;
      break;
    }
  }
  if (!major) return null;
  let minor = "初期";
  for (let si = 0; si < stages.length; si++) {
    if (s.includes(stages[si]!)) {
      minor = stages[si]!;
      break;
    }
  }
  return { major, minor };
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
 * 构造界面用的出生选项 key 顺序：`自定义` 插在 `黄枫谷弟子` 之后，其余保持配置 key 顺序。
 *
 * @return {string[]} 排序后的出生 key 列表。
 */
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

/**
 * 将预设出生 key 转为自定义出生载荷（默认练气初期、地点与背景来自配置）。
 *
 * @param {string} birthKey `CREATION_BIRTHS` 中的 key。
 * @return {CustomBirthPayload|null} 成功时为载荷；key 无效时为 `null`。
 */
function makePresetCustomBirth(birthKey: string): CustomBirthPayload | null {
  const bd = CREATION_BIRTHS[birthKey];
  if (!bd) return null;
  const loc = resolveBirthLocationNameFromDef(bd) || "";
  const locDesc = resolveBirthLocationDescFromDef(bd) || "";
  const bg = locDesc;
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

/**
 * 按权重加权随机抽取一条词条稀有度；忽略非正或非有限权重。
 *
 * @param {readonly TraitRarityWeightRow[]} rows 稀有度与权重行。
 * @return {TraitRarity} 抽中的稀有度；无有效权重时回退为第一行或 `平庸`。
 */
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

/**
 * 将样本词条复制为选项行（初始未锁定）。
 *
 * @param {TraitSample} t 词条样本。
 * @return {TraitOption} 带 `locked: false` 的选项副本。
 */
function cloneTraitForOption(t: TraitSample): TraitOption {
  return {
    name: t.name,
    rarity: t.rarity,
    desc: t.desc,
    locked: false,
  };
}

/**
 * 从池中不放回地随机抽取若干词条，先按稀有度权重抽档再在该档或全池中取一条。
 *
 * @param {readonly TraitSample[]} pool 候选词条池。
 * @param {string[]} excludeNames 按名称排除（通常已锁定词条）。
 * @param {number} count 需要抽取的数量。
 * @return {TraitOption[]} 抽取结果列表（长度不超过 `count` 与可用池大小）。
 */
function pickRandomTraits(pool: readonly TraitSample[], excludeNames: string[], count: number): TraitOption[] {
  let bag = pool.filter((t) => t && t.name && excludeNames.indexOf(t.name) === -1);
  const out: TraitOption[] = [];
  const weights = TRAIT_RARITY_WEIGHTS;
  for (let i = 0; i < count && bag.length; i++) {
    const rarity = rollTraitRarityFromWeights(weights);
    let candidates = bag.filter((x) => x.rarity === rarity);
    const pickFrom = candidates.length ? candidates : bag;
    const idx = Math.floor(Math.random() * pickFrom.length);
    const t = pickFrom[idx]!;
    const pickedName = t.name;
    bag = bag.filter((x) => !x || x.name !== pickedName);
    out.push(cloneTraitForOption(t));
  }
  return out;
}

/**
 * 浅拷贝当前展示中的词条选项（含 `locked` 状态）。
 *
 * @param {TraitOption[]} options 界面上的词条选项。
 * @return {TraitOption[]} 新数组，元素为浅拷贝。
 */
function getAllDisplayedTraitsCloned(options: TraitOption[]): TraitOption[] {
  return options.map((t) => ({ ...t, locked: !!t.locked }));
}

/**
 * 命运抉择表单与随机逻辑：refs、计算属性与构建提交载荷的方法。
 *
 * @return {object} 状态 refs、有序出生 key、配置常量及同步/随机/重置/组包等方法。
 */
export function useFateChoice() {
  const selectedBirth = ref("凡人");
  const customBirth = ref<CustomBirthPayload | null>(null);
  const selectedGender = ref<string>(CREATION_GENDERS[0]!);
  const narrationPerson = ref<NarrationPerson>("first");
  const playerName = ref("韩立");
  const currentTraitOptions = ref<TraitOption[]>([]);
  const selectedLinggen = ref<string | null>(null);
  const birthLocation = ref<string | null>(null);
  const statusMessage = ref("");

  const birthKeysOrdered = buildOrderedBirthKeys();

  /**
   * 根据当前自定义出生载荷解析有效起始大/小境界；无有效自定义时返回默认练气初期。
   *
   * @return {{major: string, minor: string|null}} 大境界与小阶段（小阶段可能为 `null`）。
   */
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

  /**
   * 非「自定义」时，用当前选中的预设出生同步 `customBirth` 与 `birthLocation`。
   *
   * @return {void}
   */
  function syncCustomBirthForCurrentSelection(): void {
    if (selectedBirth.value === "自定义") return;
    const bd = CREATION_BIRTHS[selectedBirth.value];
    if (!bd) return;
    customBirth.value = makePresetCustomBirth(selectedBirth.value);
    const locName = resolveBirthLocationNameFromDef(bd);
    birthLocation.value = locName ? String(locName).trim() : null;
  }

  /**
   * 随机roll一条灵根文案并写入 `selectedLinggen`。
   *
   * @return {void}
   */
  function applyRandomLinggen(): void {
    selectedLinggen.value = rollRandomLinggenName();
  }

  /**
   * 在未锁定格子数量允许时，保留已锁定词条并随机刷新其余槽位（共五格）。
   *
   * @return {void}
   */
  function randomizeTraits(): void {
    const locked = (currentTraitOptions.value || []).filter((t) => t && t.locked);
    if (locked.length >= 5) return;
    const need = Math.max(0, 5 - locked.length);
    const exclude = locked.map((t) => t.name);
    const fresh = pickRandomTraits(traitSamples, exclude, need);
    currentTraitOptions.value = locked.concat(fresh);
  }

  /**
   * 按词条名切换对应选项的锁定状态。
   *
   * @param {string} traitName 词条名称。
   * @return {void}
   */
  function toggleTraitLock(traitName: string): void {
    const opts = currentTraitOptions.value || [];
    const idx = opts.findIndex((t) => t.name === traitName);
    if (idx <= -1) return;
    const next = opts.slice();
    const row = next[idx]!;
    next[idx] = { ...row, locked: !row.locked };
    currentTraitOptions.value = next;
  }

  /**
   * 将表单与随机状态恢复为默认值，并同步当前预设出生的自定义载荷。
   *
   * @return {void}
   */
  function reset(): void {
    selectedBirth.value = "凡人";
    customBirth.value = null;
    selectedGender.value = CREATION_GENDERS[0]!;
    narrationPerson.value = "first";
    playerName.value = "韩立";
    currentTraitOptions.value = [];
    selectedLinggen.value = null;
    birthLocation.value = null;
    statusMessage.value = "";
    syncCustomBirthForCurrentSelection();
  }

  /**
   * 若尚无灵根或词条，则各执行一次随机，便于首次进入界面即有展示。
   *
   * @return {void}
   */
  function prepareInitialRolls(): void {
    if (!selectedLinggen.value) applyRandomLinggen();
    if (!currentTraitOptions.value.length) {
      currentTraitOptions.value = pickRandomTraits(traitSamples, [], 5);
    }
  }

  const isReady = computed(
    () =>
      !!selectedBirth.value &&
      !!selectedGender.value &&
      !!selectedLinggen.value &&
      (currentTraitOptions.value?.length ?? 0) > 0,
  );

  const traitRandomizeDisabled = computed(() => {
    const locked = (currentTraitOptions.value || []).filter((t) => t?.locked).length;
    return locked >= 5;
  });

  const traitRandomizeTitle = computed(() =>
    traitRandomizeDisabled.value ? "五格均已锁定，请先解锁至少一格后再刷新。" : "",
  );

  /**
   * 解析出生地展示名：优先 `birthLocation`，否则当前预设出生的配置地点。
   *
   * @return {string} 去空白后的地点名；无则为 `""`。
   */
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

  /**
   * 解析出身故事/背景：来自自定义出生载荷的 `background`。
   *
   * @return {string} 去空白后的背景文案；无则为 `""`。
   */
  function resolveOriginStory(): string {
    const cb = customBirth.value;
    if (cb != null && String(cb.background || "").trim() !== "") {
      return String(cb.background).trim();
    }
    return "";
  }

  /**
   * 根据当前表单状态组装提交用的 {@link FateChoiceResult}（不计算数值属性）。
   *
   * @return {FateChoiceResult} 基础信息与词条列表。
   */
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
      traits: getAllDisplayedTraitsCloned(currentTraitOptions.value || []).map((t) => ({
        name: t.name,
        rarity: t.rarity,
        desc: t.desc,
        locked: !!t.locked,
      })),
    };
  }

  /**
   * 选择预设出生（忽略名为 `自定义` 的调用）；会更新 `selectedBirth` 并同步自定义载荷。
   *
   * @param {string} name 预设出生的显示名或 key，与 `CREATION_BIRTHS` 一致。
   * @return {void}
   */
  function selectBirth(name: string): void {
    if (name === "自定义") return;
    selectedBirth.value = name;
    syncCustomBirthForCurrentSelection();
  }

  /**
   * 应用用户自定义出生：切换为「自定义」并写入地点与完整载荷。
   *
   * @param {CustomBirthPayload} payload 自定义出生数据。
   * @return {void}
   */
  function applyCustomBirth(payload: CustomBirthPayload): void {
    selectedBirth.value = "自定义";
    birthLocation.value = payload.location;
    customBirth.value = payload;
  }

  return {
    CREATION_BIRTHS,
    CREATION_GENDERS,
    CUSTOM_REALM_MAJORS,
    CUSTOM_REALM_MINORS,
    birthKeysOrdered,
    selectedBirth,
    customBirth,
    selectedGender,
    narrationPerson,
    playerName,
    currentTraitOptions,
    selectedLinggen,
    birthLocation,
    statusMessage,
    isReady,
    traitRandomizeDisabled,
    traitRandomizeTitle,
    getEffectiveStartRealm,
    syncCustomBirthForCurrentSelection,
    applyRandomLinggen,
    randomizeTraits,
    toggleTraitLock,
    reset,
    prepareInitialRolls,
    buildPayload,
    selectBirth,
    applyCustomBirth,
    resolveBirthLocationNameFromDef,
    resolveBirthLocationDescFromDef,
  };
}
