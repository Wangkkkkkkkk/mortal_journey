/**
 * 命运抉择：类型定义 + 开局静态配置（出身、性别、种族、阵营、灵根随机、词条稀有度权重）。
 * 与 `mortal_journey/js/data/mjCreationConfig.js` 等对齐。
 */

import type { TraitRarity } from "./traits";
import type { TraitEffect } from "./traitEffect";
import type { PrimaryStatKey } from "../role_core/types/playInfo";
import type { WorldLocation } from "../role_core/types/worldLocation";

// ---------------------------------------------------------------------------
// 基础类型
// ---------------------------------------------------------------------------

/** 叙事人称（第几人称）。 */
export type NarrationPerson = "first" | "second" | "third";

/** 难度等级。 */
export type DifficultyLevel = "简单" | "正常" | "困难";

/** 难度选项（UI 展示用）。 */
export interface DifficultyOption {
  key: DifficultyLevel;
  title: string;
  desc: string;
}

/** 难度选项列表。 */
export const DIFFICULTY_OPTIONS: readonly DifficultyOption[] = [
  { key: "简单", title: "简单", desc: "休闲模式。主角和同伴都不会真正死亡，也没有寿命压力，可以慢慢修炼、安心探索。" },
  { key: "正常", title: "正常", desc: "标准体验。寿命有限，要赶在寿元耗尽前突破境界；主角和同伴都可能战死，一步走错就可能万劫不复。" },
  { key: "困难", title: "困难", desc: "硬核挑战。在正常的基础上，你遇到的修士都远比常人强大，步步凶险，适合追求挑战的玩家。" },
] as const;

/** 出身定义：`location` 为四級地点，`desc` 为简介（卡片与开局摘要）。 */
export interface BirthDefinition {
  location: WorldLocation;
  desc: string;
}

/**
 * 种族 / 阵营定义：`desc` 为卡片说明并写入 AI 主角摘要；
 * `effect` 可选，与天赋共用同一套结算器（{@link TraitEffect}），开局一次性发放。
 */
export interface OriginTagDefinition {
  desc: string;
  effect?: TraitEffect;
}

/** 轮盘上一格天赋（共五条）。 */
export interface FateChoiceTrait {
  name: string;
  rarity: string;
  desc: string;
  /** 具体效果；开局时由 `Protagonist.fromFateChoice` 结算。 */
  effect?: TraitEffect;
}

/**
 * 自定义出身表单提交结构（仅 UI / 内部状态用，不直接作为最终结果字段）。
 */
export interface CustomBirthPayload {
  tag: string;
  name: string;
  location: WorldLocation;
  realmMajor: string;
  realmMinor: string | null;
  realmText: string;
  background: string;
  presetBirthKey?: string;
}

// ---------------------------------------------------------------------------
// 结果接口
// ---------------------------------------------------------------------------

/**
 * 基础信息：姓名、人称、境界、出生地、出身叙述、灵根元素等。
 */
export interface FateChoiceBasics {
  /** 姓名 */
  playerName: string;
  /** 第几人称（叙事视角） */
  narrationPerson: NarrationPerson;
  /** 性别（预设三项之一，或玩家自填的文本） */
  gender: string;
  /** 年龄；`null` 表示不指定，交由开局管线按境界推导 */
  age: number | null;
  /** 种族（{@link CREATION_RACES} 的键） */
  race: string;
  /** 阵营（{@link CREATION_FACTIONS} 的键） */
  faction: string;
  /** 大境界 */
  realmMajor: string;
  /** 小境界（初期 / 中期 / 后期）；与所有大境界一致 */
  realmMinor: string | null;
  /** 出生地（四级地点） */
  birthPlace: WorldLocation;
  /**
   * 出身信息：预设出身时为卡片说明与地点描述等合并文案；自定义出身时为填写的背景长文。
   */
  originStory: string;
  /**
   * 灵根五行元素列表。
   */
  linggen: string[];
  /** 难度等级。 */
  difficulty: DifficultyLevel;
  /**
   * 购点加成的主属性：键为主属性，值为加在境界基准值之上的点数。
   * 由 `Protagonist.fromFateChoice` 直接累加，不经天赋结算。
   */
  statPurchase: Partial<Record<PrimaryStatKey, number>>;
}

/**
 * 命运抉择完成后的唯一结果类型：`basics` + 五个 `traits`。
 */
export interface FateChoiceResult {
  basics: FateChoiceBasics;
  traits: FateChoiceTrait[];
}

// ---------------------------------------------------------------------------
// 境界与灵根常量
// ---------------------------------------------------------------------------

/** 默认起始大境界。 */
export const START_REALM_MAJOR = "练气";

/** 默认起始小阶段。 */
export const START_REALM_STAGE = "初期";

/** 自定义出身可选大境界列表。 */
export const CUSTOM_REALM_MAJORS = ["练气", "筑基", "结丹", "元婴", "化神"] as const;

/** 自定义出身可选小阶段列表。 */
export const CUSTOM_REALM_MINORS = ["初期", "中期", "后期"] as const;

/** 灵根类型前缀，用于从 `rollRandomLinggenName()` 结果中剥掉前缀只保留元素。 */
export const LINGGEN_TYPE_PREFIXES: ReadonlySet<string> = new Set(["天灵根", "真灵根", "伪灵根", "无灵根"]);

export const LINGGEN_ELEMENT_POOL: readonly string[] = ["金", "木", "水", "火", "土"];

/**
 * 灵根元素效果对照表。
 *
 * | 元素 | 效果         |
 * | ---- | ------------ |
 * | 金   | 提升暴击伤害 |
 * | 木   | 提升丹药效果 |
 * | 水   | 提升技能冷却速度 |
 * | 火   | 提升恢复效果 |
 * | 土   | 提高护盾效果 |
 */
export const LINGGEN_ELEMENT_EFFECTS: Readonly<Record<string, string>> = {
  金: "提升暴击伤害",
  木: "提升丹药效果",
  水: "提升功法冷却速度",
  火: "提升恢复效果",
  土: "提升护盾效果",
};


// ---------------------------------------------------------------------------
// 购点开局配置（占位数值，按需自行调整）
// ---------------------------------------------------------------------------

/** 点数总额输入框的默认值。 */
export const DEFAULT_POINT_BUDGET = 100;

/** 点数总额可填范围。 */
export const POINT_BUDGET_MIN = 0;
export const POINT_BUDGET_MAX = 9999;

/** 「随机抽取」一次给出的词条条数（不扣点数）。 */
export const RANDOM_TRAIT_COUNT = 5;

/** 购买主属性时每次点击的步长（点属性值）。 */
export const STAT_PURCHASE_STEP = 5;

/** 每 1 点主属性值消耗的点数（固定单价，占位）。 */
export const STAT_POINT_COST: Readonly<Record<PrimaryStatKey, number>> = {
  physique: 1,
  spirit: 1,
  strength: 1,
  perception: 1,
  guard: 1,
  resistance: 1,
  agility: 2,
  insight: 2,
};

/** 单个主属性最多可购买的点数上限。 */
export const STAT_PURCHASE_MAX = 100;

/**
 * 指定灵根的点数消耗：键为选中的五行元素个数。
 * 元素越少灵根越纯、消耗越高；0 个元素即「无灵根」，不消耗点数。
 */
export const LINGGEN_PURCHASE_COST: Readonly<Record<number, number>> = {
  0: 0,
  1: 60,
  2: 40,
  3: 25,
  4: 10,
  5: 5,
};

/**
 * 由选中的元素个数推导灵根类型，与 {@link rollRandomLinggenName} 的分布口径一致。
 *
 * @param count 选中的五行元素个数。
 * @return 灵根类型名。
 */
export function linggenTypeForElementCount(count: number): string {
  if (count <= 0) return "无灵根";
  if (count === 1) return "天灵根";
  if (count <= 3) return "真灵根";
  return "伪灵根";
}

// ---------------------------------------------------------------------------
// 出身配置
// ---------------------------------------------------------------------------

export const CREATION_GENDERS = ["男性", "女性","双性"] as const;

/** 年龄可填范围。 */
export const CREATION_AGE_MIN = 1;
export const CREATION_AGE_MAX = 9999;

export const CREATION_BIRTHS: Readonly<Record<string, BirthDefinition>> = {
  黄枫谷弟子: {
    location: { region: "天南", country: "越国", area: "黄枫谷", detail: "外门" },
    desc: "出身于越国七大宗门之一的黄枫谷外门，以剑修传承闻名，门规严谨。",
  },
  乱星海散修: {
    location: { region: "乱星海", country: "魁星岛", area: "天都街", detail: "街道" },
    desc: "出身在乱星海，资源多被大小宗门与星宫势力把持。你无依无靠，灵石、丹药、功法皆需自行挣取，或冒险猎妖，或接取散修任务，稍有不慎便是身死道消。",
  },
};

// ---------------------------------------------------------------------------
// 种族 / 阵营配置（占位，待填表）
// ---------------------------------------------------------------------------

/**
 * 可选种族。键即卡片标题与存档中的 `race` 值。

 */
export const CREATION_RACES: Readonly<Record<string, OriginTagDefinition>> = {
  人族: { desc: "人族修士，对修炼体系更为熟悉",effect: { kind: "statBonus", stats: { insight: 10 } } },
  妖族: { desc: "罕见的妖族修行者，力量惊人，悟性稍低",effect: { kind: "statBonus", stats: { strength: 20, insight: -10 } } } ,
};

/**
 * 可选阵营。键即卡片标题与存档中的 `faction` 值。
 * `effect` 用法同 {@link CREATION_RACES}。
 */
export const CREATION_FACTIONS: Readonly<Record<string, OriginTagDefinition>> = {
  太上正道: { desc: "恪守天规戒律，以身护道，普度苍生万灵。" },
  仁心济世: { desc: "不拘门派规矩，顺从本心，广施恩泽救苦难。" },
  狂侠任气: { desc: "蔑视陈规戒律，率性而为，快意恩仇斩不平。" },
  天道无情: { desc: "奉行宗门法度，视万物为刍狗，唯规矩是从。" },
  太虚忘机: { desc: "清静无为避世，顺应自然造化，不沾红尘因果。" },
  逍遥散仙: { desc: "随心所欲独行，不受世俗约束，全凭一己喜怒。" },
  魔宗森罗: { desc: "以严苛尊卑御下，巧立名目，行专制掠夺之事。" },
  唯我独尊: { desc: "追逐长生力量，视苍生如草芥，冷血利己夺机缘。" },
  乱世狂煞: { desc: "肆意屠戮杀伐，坏天地纲常，沉溺于毁灭本能。" },
};

/**
 * 组装喂给 AI 主角摘要的种族/阵营两行（附条目说明，便于 AI 理解设定）。
 * 未选或条目已从表中删除时输出「—」。
 */
export function originTagLines(race: string, faction: string): string[] {
  const fmt = (table: Readonly<Record<string, OriginTagDefinition>>, key: string): string => {
    if (!key) return "—";
    const desc = table[key]?.desc?.trim();
    return desc ? `${key}（${desc}）` : key;
  };
  return [`种族：${fmt(CREATION_RACES, race)}`, `阵营：${fmt(CREATION_FACTIONS, faction)}`];
}

// ---------------------------------------------------------------------------
// 词条稀有度权重
// ---------------------------------------------------------------------------

/** 词条随机时「先抽稀有度」所用的权重行。 */
export interface TraitRarityWeightRow {
  rarity: TraitRarity;
  weight: number;
}

/** 命运抉择随机词条：各稀有度权重（与主工程分布意图一致）。 */
export const TRAIT_RARITY_WEIGHTS: readonly TraitRarityWeightRow[] = [
  { rarity: "平庸", weight: 40 },
  { rarity: "普通", weight: 25 },
  { rarity: "稀有", weight: 15 },
  { rarity: "史诗", weight: 10 },
  { rarity: "传说", weight: 6 },
  { rarity: "神迹", weight: 4 },
];

// ---------------------------------------------------------------------------
// 灵根随机函数
// ---------------------------------------------------------------------------

/**
 * 与主工程 `rollRandomLinggenName` 相同分布：天灵根 / 真灵根 / 伪灵根 + 元素组合。
 */
export function rollRandomLinggenName(): string {
  const pool = [...LINGGEN_ELEMENT_POOL];
  const r = Math.random() * 100;
  let count: number;
  let type: string;
  if (r < 20) {
    count = 1;
    type = "天灵根";
  } else if (r < 40) {
    count = 2;
    type = "真灵根";
  } else if (r < 60) {
    count = 3;
    type = "真灵根";
  } else {
    count = 4;
    type = "伪灵根";
  }
  const bag = pool.slice();
  const elements: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * bag.length);
    elements.push(bag.splice(idx, 1)[0]!);
  }
  return type + " " + elements.join(", ");
}
