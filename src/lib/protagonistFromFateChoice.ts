/**
 * 由命运抉择结果构造 `ProtagonistPlayInfo` 开局占位（与 mortal_journey 读档后再 enrich 的路径分离）。
 * 字段严格符合 `playInfo`；储物袋含丹药 / 突破丹药 / 五档灵石 / 材料 / 杂物示例；功法栏前两格为攻击 / 辅助示例；三佩戴为 `EXAMPLE_EQUIPPED_*` 示例装备便于测试。
 */

import type { FateChoiceResult } from "../fate_choice/types";
import type {
  ArmorItemDefinition,
  AssistGongfaDefinition,
  AttackGongfaDefinition,
  BreakthroughElixirDefinition,
  ElixirItemDefinition,
  FaqiItemDefinition,
  MaterialItemDefinition,
  MiscItemDefinition,
  SpiritStoneInventoryStack,
  WeaponItemDefinition,
} from "../types/itemInfo";
import type { GongfaSlotsState, InventoryStackItem, ProtagonistPlayInfo } from "../types/playInfo";
import {
  createSpiritStoneInventoryStack,
  SPIRIT_STONE_TABLE_KEY_HIGH,
  SPIRIT_STONE_TABLE_KEY_IMMORTAL,
  SPIRIT_STONE_TABLE_KEY_LOW,
  SPIRIT_STONE_TABLE_KEY_MEDIUM,
  SPIRIT_STONE_TABLE_KEY_TOP,
  type SpiritStoneName,
} from "../types/spiritStone";
import { getBaseStats, getProtagonistNarrativeAge, getShouyuanForRealm } from "../config/realm_state";
import { getProtagonistDerivedStats } from "./protagonistDerivedStats";
import type { InitStateParsed } from "../ai/init_state_generate";
import {
  buildEquippedSlotsFromParsed,
  buildGongfaSlotsFromParsed,
  buildInventoryFromParsed,
} from "../ai/init_state_generate";

/** 开局储物袋格数（与存档规范化一致） */
export const DEFAULT_INVENTORY_SLOT_COUNT = 12;

/**
 * `addToInventory` 在袋满时追加的空位数；与左栏储物袋 4 列网格一致（每次扩一行）。
 */
export const INVENTORY_SLOT_EXPAND_STEP = 4;

/** 测试 / UI 联调：开局佩戴的示例武器（`WeaponItemDefinition`） */
export const EXAMPLE_EQUIPPED_WEAPON: WeaponItemDefinition = {
  name: "测试木剑",
  desc: "开发调试用：木剑示例，含物攻加成与倍率。",
  grade: "下品",
  value: 10,
  count: 1,
  itemType: "装备",
  equipType: "武器",
  bonus: { 物攻: 2 },
  magnification: { 物攻: 1.05 },
};

/** 测试 / UI 联调：开局佩戴的示例法器 */
export const EXAMPLE_EQUIPPED_FAQI: FaqiItemDefinition = {
  name: "测试铜铃",
  desc: "开发调试用：法器示例。",
  grade: "中品",
  value: 150,
  count: 1,
  itemType: "装备",
  equipType: "法器",
  bonus: { 法攻: 3 },
};

/** 测试 / UI 联调：开局佩戴的示例防具 */
export const EXAMPLE_EQUIPPED_ARMOR: ArmorItemDefinition = {
  name: "测试布衣",
  desc: "开发调试用：防具示例。",
  grade: "上品",
  value: 8500,
  count: 1,
  itemType: "装备",
  equipType: "防具",
  bonus: { 物防: 2, 法防: 1 },
};

/** 测试 / UI 联调：攻击功法示例（`AttackGongfaDefinition`） */
export const EXAMPLE_ATTACK_GONGFA: AttackGongfaDefinition = {
  name: "测试火弹术",
  desc: "开发调试用：攻击功法示例，含法力消耗与倍率。",
  grade: "极品",
  value: 20000,
  count: 1,
  itemType: "功法",
  subtype: "攻击",
  manacost: 10,
  bonus: { 法攻: 5 },
  magnification: { 法攻: 1.1 },
};

/** 测试 / UI 联调：辅助功法示例 */
export const EXAMPLE_ASSIST_GONGFA: AssistGongfaDefinition = {
  name: "测试引气诀",
  desc: "开发调试用：辅助功法示例。",
  grade: "仙品",
  value: 180000,
  count: 1,
  itemType: "功法",
  subtype: "辅助",
  bonus: { 法力: 10 },
};

function exampleGongfaSlots(): GongfaSlotsState {
  return [
    EXAMPLE_ATTACK_GONGFA,
    EXAMPLE_ASSIST_GONGFA,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
}

/** 测试用：普通丹药（恢复类） */
export const EXAMPLE_ELIXIR: ElixirItemDefinition = {
  name: "测试回血丹",
  desc: "开发调试用：普通丹药示例。",
  grade: "下品",
  value: 50,
  count: 3,
  itemType: "丹药",
  effects: { recover: { hp: 50, mp: 0 } },
};

/** 测试用：突破丹药 */
export const EXAMPLE_BREAKTHROUGH_ELIXIR: BreakthroughElixirDefinition = {
  name: "测试筑基丹",
  desc: "开发调试用：突破丹药示例。",
  grade: "中品",
  value: 100,
  count: 1,
  itemType: "突破丹药",
  effects: {
    breakthrough: [{ from: "练气", to: "筑基", chanceBonus: 0.05 }],
  },
};

/**
 * 开局储物袋示例灵石：逐行写明「种类（表键）+ 数量」，便于扫一眼知有哪些灵石。
 * 数量仅联调；`createSpiritStoneInventoryStack` 会从 `mjDescribeSpiritStones` 补全 desc/grade/value。
 */
const EXAMPLE_SPIRIT_STONE_BAG_SPECS: ReadonlyArray<{ name: SpiritStoneName; count: number }> = [
  { name: SPIRIT_STONE_TABLE_KEY_LOW, count: 99 },
  { name: SPIRIT_STONE_TABLE_KEY_MEDIUM, count: 50 },
  { name: SPIRIT_STONE_TABLE_KEY_HIGH, count: 20 },
  { name: SPIRIT_STONE_TABLE_KEY_TOP, count: 10 },
  { name: SPIRIT_STONE_TABLE_KEY_IMMORTAL, count: 3 },
];

export const EXAMPLE_SPIRIT_STONE_STACKS: SpiritStoneInventoryStack[] = EXAMPLE_SPIRIT_STONE_BAG_SPECS.map(
  ({ name, count }) => createSpiritStoneInventoryStack(name, count),
);

/** 测试用：材料 */
export const EXAMPLE_MATERIAL: MaterialItemDefinition = {
  name: "测试铁木",
  desc: "开发调试用：材料示例。",
  grade: "下品",
  value: 20,
  count: 5,
  itemType: "材料",
};

/** 测试用：杂物 */
export const EXAMPLE_MISC: MiscItemDefinition = {
  name: "测试游记",
  desc: "开发调试用：杂物示例。",
  grade: "下品",
  value: 10,
  count: 1,
  itemType: "杂物",
};

function exampleInventorySlots(): Array<InventoryStackItem | null> {
  const fixedLen = 2 + EXAMPLE_SPIRIT_STONE_STACKS.length + 2;
  const rest = DEFAULT_INVENTORY_SLOT_COUNT - fixedLen;
  return [
    EXAMPLE_ELIXIR,
    EXAMPLE_BREAKTHROUGH_ELIXIR,
    ...EXAMPLE_SPIRIT_STONE_STACKS,
    EXAMPLE_MATERIAL,
    EXAMPLE_MISC,
    ...Array.from({ length: Math.max(0, rest) }, () => null),
  ];
}

function emptyInventorySlots(): Array<InventoryStackItem | null> {
  return Array.from({ length: DEFAULT_INVENTORY_SLOT_COUNT }, () => null);
}

function emptyGongfaSlots(): GongfaSlotsState {
  return [null, null, null, null, null, null, null, null];
}

function zeroPlayerBase(): ProtagonistPlayInfo["playerBase"] {
  return {
    hp: 0,
    mp: 0,
    patk: 0,
    pdef: 0,
    matk: 0,
    mdef: 0,
    sense: 0,
    luck: 0,
    dodge: 0,
    tenacity: 0,
  };
}

/** 由 `FateChoiceResult` 生成主角档案（修为 0；储物袋含五类示例物品；功法栏含示例攻击 / 辅助功法；佩戴为示例装备；十维取境界表或回退练气初期）。 */
export function buildProtagonistPlayInfoFromFateChoice(fc: FateChoiceResult): ProtagonistPlayInfo {
  const { basics } = fc;
  const major = basics.realmMajor.trim() || "练气";
  const minor = (basics.realmMinor != null && String(basics.realmMinor).trim() !== ""
    ? String(basics.realmMinor).trim()
    : "初期") as string;

  const pb = getBaseStats(major, minor) ?? getBaseStats("练气", "初期") ?? zeroPlayerBase();
  const maxHp = Math.max(1, pb.hp);
  const maxMp = Math.max(1, pb.mp);
  const sy = getShouyuanForRealm(major, minor) ?? getShouyuanForRealm("练气", "初期") ?? 100;

  const age = getProtagonistNarrativeAge(
    { realm: { major }, age: undefined },
    { realm: { major } },
    { defaultAge: 16 },
  );

  const traits = fc.traits.map((t) => ({
    name: t.name,
    desc: t.desc,
    rarity: t.rarity,
    locked: t.locked,
  }));

  const protagonist: ProtagonistPlayInfo = {
    role: "protagonist",
    id: "protagonist",
    displayName: basics.playerName.trim() || "未命名",
    narrationPerson: basics.narrationPerson,
    birthPlace: basics.birthPlace.trim(),
    originStory: basics.originStory.trim(),
    realm: { major, minor },
    playerBase: { ...pb },
    maxHp,
    maxMp,
    currentHp: maxHp,
    currentMp: maxMp,
    avatarUrl: "",
    gender: basics.gender,
    linggen: basics.linggen.slice(),
    age,
    shouyuan: sy,
    inventorySlots: emptyInventorySlots(),
    gongfaSlots: emptyGongfaSlots(),
    equippedSlots: {
      weapon: null,
      faqi: null,
      armor: null,
    },
    traits,
    xiuwei: 0,
  };

  // 上限须与左栏推导一致（境界表 + 佩戴/功法加成 + 灵根倍率）；否则会出现「当前法力仍按旧上限满值、条上最大却含加成」的错位。
  const derived = getProtagonistDerivedStats(protagonist);
  if (derived) {
    const capH = Math.max(1, Math.round(derived.hp));
    const capM = Math.max(1, Math.round(derived.mp));
    protagonist.maxHp = capH;
    protagonist.maxMp = capM;
    protagonist.currentHp = capH;
    protagonist.currentMp = capM;
  }

  return protagonist;
}

export function applyInitStateToProtagonist(protagonist: ProtagonistPlayInfo, parsed: InitStateParsed): ProtagonistPlayInfo {
  protagonist.equippedSlots = buildEquippedSlotsFromParsed(parsed);
  protagonist.gongfaSlots = buildGongfaSlotsFromParsed(parsed);
  protagonist.inventorySlots = buildInventoryFromParsed(parsed, protagonist.realm.major, DEFAULT_INVENTORY_SLOT_COUNT);

  const derived = getProtagonistDerivedStats(protagonist);
  if (derived) {
    const capH = Math.max(1, Math.round(derived.hp));
    const capM = Math.max(1, Math.round(derived.mp));
    protagonist.maxHp = capH;
    protagonist.maxMp = capM;
    protagonist.currentHp = capH;
    protagonist.currentMp = capM;
  }

  return protagonist;
}
