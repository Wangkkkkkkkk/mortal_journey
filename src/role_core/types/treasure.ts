import type { ItemGrade } from "./itemInfo";
import type { PrimaryStatKey } from "./playInfo";

// ═══════════════════════════════════════════════════════════════════════════
// 法宝特殊效果 — 百分比属性加成，直接映射战斗引擎 ModifierType
// ═══════════════════════════════════════════════════════════════════════════

export type TreasureModifierType =
  | "damageDealt"
  | "damageTaken"
  | "hpRecover"
  | "mpRecover"
  | "speed"
  | "critRate"
  | "critDmg"
  | "dodgeRate"
  | "lifesteal"
  | "defensePenetration"
  | "physDamageDealt"
  | "magDamageDealt"
  | "physDamageTaken"
  | "magDamageTaken"
  | "physDefensePenetration"
  | "magDefensePenetration";

export interface TreasureModifier {
  modifierType: TreasureModifierType;
  value: number;
}

export interface TreasureSpecialEffect {
  name: string;
  modifiers: readonly TreasureModifier[];
  /** 淬毒：命中敌方时施加的毒性效果。未淬毒时为空。 */
  coating?: TreasureCoating;
}

/**
 * 法宝淬毒涂层：命中造成伤害后，对目标叠加一层毒性 DoT。
 *
 * 与毒药消耗品的区别是「随攻击反复触发、层数累积」（对齐毒修功法的既有设计），
 * 因此只支持 DoT 一种形态——延迟爆发与属性削弱适合一次性投放，若可叠层会失衡。
 */
export interface TreasureCoating {
  /** 毒性名称（取自制毒命名表）。 */
  name: string;
  /** **每层**每回合损失目标最大血量的百分比。 */
  tickPercent: number;
  /** 持续回合数；每次命中刷新，决定停手后毒性残留多久。 */
  duration: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 展示名称
// ═══════════════════════════════════════════════════════════════════════════

export const TREASURE_MODIFIER_NAMES: Readonly<Record<TreasureModifierType, string>> = {
  damageDealt: "增伤",
  damageTaken: "减伤",
  hpRecover: "血量恢复",
  mpRecover: "法力恢复",
  speed: "速度",
  critRate: "暴击",
  critDmg: "暴伤",
  dodgeRate: "闪避",
  lifesteal: "吸血",
  defensePenetration: "穿透",
  physDamageDealt: "物理增伤",
  magDamageDealt: "法术增伤",
  physDamageTaken: "物理减伤",
  magDamageTaken: "法术减伤",
  physDefensePenetration: "破甲",
  magDefensePenetration: "破法",
};

// ═══════════════════════════════════════════════════════════════════════════
// 品阶效果数量
// ═══════════════════════════════════════════════════════════════════════════

/** 各品阶法宝初始携带的词条数（精炼上限以此为基准）。 */
export const GRADE_MODIFIER_COUNT: Readonly<Record<ItemGrade, number>> = {
  "下品": 1,
  "中品": 2,
  "上品": 3,
  "极品": 4,
  "仙品": 4,
  "神品": 4,
};

// ═══════════════════════════════════════════════════════════════════════════
// 每个类型 × 每个品阶的 [min%, max%] 范围
// ═══════════════════════════════════════════════════════════════════════════

/** 「词条类型 × 品阶」的数值区间 [min%, max%]。精炼的提升幅度与上限均由此派生。 */
export const MODIFIER_VALUE_RANGES: Readonly<Record<TreasureModifierType, Readonly<Record<ItemGrade, readonly [number, number]>>>> = {
  damageDealt:  { "下品": [2, 4],  "中品": [3, 6],   "上品": [5, 9],   "极品": [7, 13],  "仙品": [10, 16], "神品": [12, 20] },
  damageTaken:  { "下品": [1, 2],  "中品": [1, 3],   "上品": [2, 4],   "极品": [3, 6],   "仙品": [5, 8],   "神品": [6, 10] },
  hpRecover:   { "下品": [1, 1],  "中品": [2, 2],   "上品": [3, 3],   "极品": [4, 4],   "仙品": [5, 5],   "神品": [6, 6] },
  mpRecover:    { "下品": [1, 1],  "中品": [2, 2],   "上品": [3, 3],   "极品": [4, 4],   "仙品": [5, 5],   "神品": [6, 6] },
  speed:        { "下品": [2, 4],  "中品": [3, 6],   "上品": [5, 9],   "极品": [7, 13],  "仙品": [10, 18], "神品": [15, 25] },
  critRate:     { "下品": [2, 4],  "中品": [3, 6],   "上品": [5, 9],   "极品": [8, 15],  "仙品": [12, 20], "神品": [15, 25] },
  critDmg:      { "下品": [4, 8],  "中品": [6, 12],  "上品": [10, 18], "极品": [15, 28], "仙品": [22, 38], "神品": [30, 50] },
  dodgeRate:    { "下品": [1, 3],  "中品": [2, 4],   "上品": [3, 6],   "极品": [5, 9],   "仙品": [6, 12],  "神品": [8, 15] },
  lifesteal:          { "下品": [1, 2],  "中品": [2, 3],   "上品": [3, 4],   "极品": [4, 6],   "仙品": [5, 7],   "神品": [6, 8] },
  defensePenetration: { "下品": [2, 4],  "中品": [3, 6],   "上品": [5, 9],   "极品": [7, 13],  "仙品": [10, 16], "神品": [12, 20] },
  physDamageDealt:          { "下品": [3, 6],  "中品": [5, 9],   "上品": [7, 13],  "极品": [11, 19], "仙品": [15, 24], "神品": [18, 30] },
  magDamageDealt:           { "下品": [3, 6],  "中品": [5, 9],   "上品": [7, 13],  "极品": [11, 19], "仙品": [15, 24], "神品": [18, 30] },
  physDamageTaken:          { "下品": [2, 3],  "中品": [2, 4],   "上品": [3, 6],   "极品": [5, 9],   "仙品": [7, 12],  "神品": [9, 15] },
  magDamageTaken:           { "下品": [2, 3],  "中品": [2, 4],   "上品": [3, 6],   "极品": [5, 9],   "仙品": [7, 12],  "神品": [9, 15] },
  physDefensePenetration:   { "下品": [3, 6],  "中品": [5, 9],   "上品": [7, 13],  "极品": [11, 19], "仙品": [15, 24], "神品": [18, 30] },
  magDefensePenetration:    { "下品": [3, 6],  "中品": [5, 9],   "上品": [7, 13],  "极品": [11, 19], "仙品": [15, 24], "神品": [18, 30] },
};

// ═══════════════════════════════════════════════════════════════════════════
// 加权随机池（通用属性高权重，专用属性低权重）
// ═══════════════════════════════════════════════════════════════════════════

const MODIFIER_WEIGHTS: Readonly<Record<TreasureModifierType, number>> = {
  damageDealt: 3, damageTaken: 3, hpRecover: 2, mpRecover: 2,
  speed: 2, critRate: 2, critDmg: 2, dodgeRate: 2,
  lifesteal: 1, defensePenetration: 1,
  physDamageDealt: 1, magDamageDealt: 1,
  physDamageTaken: 1, magDamageTaken: 1,
  physDefensePenetration: 1, magDefensePenetration: 1,
};

/** 词条类型加权池（通用词条权重高）。精炼新增词条时复用。 */
export const WEIGHTED_POOL: readonly TreasureModifierType[] = (() => {
  const pool: TreasureModifierType[] = [];
  for (const [type, weight] of Object.entries(MODIFIER_WEIGHTS) as [TreasureModifierType, number][]) {
    for (let i = 0; i < weight; i++) pool.push(type);
  }
  return pool;
})();

export function rollTreasureFunction(grade: ItemGrade): TreasureSpecialEffect {
  const count = GRADE_MODIFIER_COUNT[grade];
  const modifiers: TreasureModifier[] = [];
  const usedTypes = new Set<TreasureModifierType>();

  for (let i = 0; i < count; i++) {
    let type: TreasureModifierType;
    let attempts = 0;
    do {
      type = WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
      attempts++;
    } while (usedTypes.has(type) && attempts < 20);
    usedTypes.add(type);

    const [lo, hi] = MODIFIER_VALUE_RANGES[type][grade];
    const value = lo + Math.floor(Math.random() * (hi - lo + 1));
    modifiers.push({ modifierType: type, value });
  }

  return { name: formatTreasureFunctionName(modifiers), modifiers };
}

/**
 * 由词条列表拼装法宝功能名（如「增伤+5% 速度+3%」）。
 *
 * 词条增删改后必须用本函数重建 `name`，否则展示会与实际词条脱节。
 */
export function formatTreasureFunctionName(modifiers: readonly TreasureModifier[]): string {
  return modifiers
    .map(m => `${TREASURE_MODIFIER_NAMES[m.modifierType]}+${m.value}%`)
    .join(" ");
}

// ═══════════════════════════════════════════════════════════════════════════
// 法宝特殊效果 — 主属性 / 血量法力 转换（仅仙品、神品）
//
// 数值语义（务必遵守）：转换量始终来自「源数值」，原样加到目标，
// 绝非目标自身的百分比。
//   bonus 模式：source 不变，dest += floor(ratio% × source)
//   transfer 模式：amount = floor(ratio% × source)；source -= amount；dest += amount
// transfer 的 ratio 量级高于 bonus（转移型牺牲源，故幅度更大）。
// ═══════════════════════════════════════════════════════════════════════════

export type TreasureConversionMode = "bonus" | "transfer";

export type TreasureConversion =
  | { mode: TreasureConversionMode; target: "stat"; from: PrimaryStatKey; to: PrimaryStatKey; ratio: number }
  | { mode: TreasureConversionMode; target: "mpToHp"; ratio: number }
  | { mode: TreasureConversionMode; target: "hpToMp"; ratio: number };

export interface TreasureConversionEffect {
  /** 法宝技名（仿功法 function.name），便于后续直接作为命名法宝使用。 */
  name: string;
  /** 简介。 */
  intro: string;
  conversions: readonly TreasureConversion[];
}

/** 模板里不带 ratio 的转换结构，roll 时填入 ratio。 */
type TreasureConversionSpec =
  | { mode: TreasureConversionMode; target: "stat"; from: PrimaryStatKey; to: PrimaryStatKey }
  | { mode: TreasureConversionMode; target: "mpToHp" }
  | { mode: TreasureConversionMode; target: "hpToMp" };

interface TreasureConversionTemplate {
  name: string;
  intro: string;
  /** 该法宝所属品阶（仙品 / 神品），一品一法宝，互不混用。 */
  grade: ItemGrade;
  spec: TreasureConversionSpec;
  /** 固定比率（非随机）。 */
  ratio: number;
}

// 命名模板池（仿功法：带 name + intro）。一品一法宝，仙品 / 神品互不混用，比率固定。
// 口径：仙品 加成 30% / 转移 50%；神品 加成 50% / 转移 100%。
const TREASURE_CONVERSION_TEMPLATES: readonly TreasureConversionTemplate[] = [
  // ────────────── 仙品 ──────────────
  // —— 主属性 · 加成型（30%）——
  {
    name: "摄神化劲鼎",
    intro: "鼎身遍刻神识铭文，祭炼之际引一丝神识入体，于劲力之中平添几分威能。",
    grade: "仙品",
    spec: { mode: "bonus", target: "stat", from: "perception", to: "strength" },
    ratio: 30,
  },
  {
    name: "淬灵铸体炉",
    intro: "炉中灵火温养肉身，以灵力淬炼筋骨，体魄愈发坚韧雄浑。",
    grade: "仙品",
    spec: { mode: "bonus", target: "stat", from: "spirit", to: "physique" },
    ratio: 30,
  },
  {
    name: "卸甲摧锋环",
    intro: "灵环卸去护体之韧，反哺筋骨化为摧锋之力，守转为攻，劲力大盛。",
    grade: "仙品",
    spec: { mode: "bonus", target: "stat", from: "guard", to: "strength" },
    ratio: 30,
  },
  {
    name: "散御凝神镜",
    intro: "古镜散去灵御之防，反照灵台，于神识之中洞开一片清明。",
    grade: "仙品",
    spec: { mode: "bonus", target: "stat", from: "resistance", to: "perception" },
    ratio: 30,
  },
  // —— 主属性 · 转移型（50%）——
  {
    name: "噬神铸力钟",
    intro: "钟鸣噬神，强夺自身神识尽数灌入劲脉，舍神识而求蛮力。",
    grade: "仙品",
    spec: { mode: "transfer", target: "stat", from: "perception", to: "strength" },
    ratio: 50,
  },
  {
    name: "焚灵炼体塔",
    intro: "宝塔焚炼自身灵力，熔铸于肉身之中，灵力骤损而体魄暴涨。",
    grade: "仙品",
    spec: { mode: "transfer", target: "stat", from: "spirit", to: "physique" },
    ratio: 50,
  },
  {
    name: "碎甲铸力轮",
    intro: "宝轮碎尽护体之甲，尽数熔铸为劲力，舍防御而求蛮力。",
    grade: "仙品",
    spec: { mode: "transfer", target: "stat", from: "guard", to: "strength" },
    ratio: 50,
  },
  {
    name: "破御夺神网",
    intro: "魔网破去灵御之防，强夺其力灌入神识，灵御骤损而神识暴涨。",
    grade: "仙品",
    spec: { mode: "transfer", target: "stat", from: "resistance", to: "perception" },
    ratio: 50,
  },
  // —— 资源 · 加成型（30%）——
  {
    name: "凝元化血珠",
    intro: "珠中氤氲法力，反哺血肉，血气因法力而绵长不绝。",
    grade: "仙品",
    spec: { mode: "bonus", target: "mpToHp" },
    ratio: 30,
  },
  {
    name: "沥血养法瓶",
    intro: "瓶纳血煞之气，以血养法，法力上限随血气而滋长。",
    grade: "仙品",
    spec: { mode: "bonus", target: "hpToMp" },
    ratio: 30,
  },
  // —— 资源 · 转移型（50%）——
  {
    name: "吞元化血葫芦",
    intro: "葫芦吞元化血，将半数法力尽数化为精血，法力锐减而血气暴涨。",
    grade: "仙品",
    spec: { mode: "transfer", target: "mpToHp" },
    ratio: 50,
  },
  {
    name: "沥血化元幡",
    intro: "幡动血逆，化精血为法力灌入经脉，气血亏损而法力大盛。",
    grade: "仙品",
    spec: { mode: "transfer", target: "hpToMp" },
    ratio: 50,
  },
  // ────────────── 神品 ──────────────
  // —— 主属性 · 加成型（50%）——
  {
    name: "万神铸力鼎",
    intro: "上古神鼎，引万神之识熔铸己身，神识愈盛则劲力愈强，势不可挡。",
    grade: "神品",
    spec: { mode: "bonus", target: "stat", from: "perception", to: "strength" },
    ratio: 50,
  },
  {
    name: "九转金身炉",
    intro: "太古仙炉，九转金身之法，灵力尽数凝于肉身，铸就不灭金身。",
    grade: "神品",
    spec: { mode: "bonus", target: "stat", from: "spirit", to: "physique" },
    ratio: 50,
  },
  {
    name: "万甲归锋环",
    intro: "上古灵环，万甲归锋，一身护体之韧尽数化作摧山劲力。",
    grade: "神品",
    spec: { mode: "bonus", target: "stat", from: "guard", to: "strength" },
    ratio: 50,
  },
  {
    name: "玄御通神镜",
    intro: "太古神镜，玄御通神，灵御尽数化为神识，灵台通明万里。",
    grade: "神品",
    spec: { mode: "bonus", target: "stat", from: "resistance", to: "perception" },
    ratio: 50,
  },
  // —— 主属性 · 转移型（100%）——
  {
    name: "灭神吞力钟",
    intro: "上古魔钟，神识尽毁而蛮力无双，一身神识尽数化作摧山之力。",
    grade: "神品",
    spec: { mode: "transfer", target: "stat", from: "perception", to: "strength" },
    ratio: 100,
  },
  {
    name: "炼天铸体塔",
    intro: "通天灵塔，焚尽一身灵力铸就肉身，灵力全无而体魄登峰造极。",
    grade: "神品",
    spec: { mode: "transfer", target: "stat", from: "spirit", to: "physique" },
    ratio: 100,
  },
  {
    name: "灭甲吞力轮",
    intro: "通天魔轮，灭甲吞力，护体尽毁而蛮力无双。",
    grade: "神品",
    spec: { mode: "transfer", target: "stat", from: "guard", to: "strength" },
    ratio: 100,
  },
  {
    name: "诛御噬神网",
    intro: "上古魔网，诛御噬神，灵御全无而神识滔天。",
    grade: "神品",
    spec: { mode: "transfer", target: "stat", from: "resistance", to: "perception" },
    ratio: 100,
  },
  // —— 资源 · 加成型（50%）——
  {
    name: "造化凝血珠",
    intro: "造化神珠，法力如渊，源源不绝反哺血肉，寿元血气皆因之而旺。",
    grade: "神品",
    spec: { mode: "bonus", target: "mpToHp" },
    ratio: 50,
  },
  {
    name: "玄血聚灵瓶",
    intro: "玄血神瓶，以无尽血气聚敛天地灵机，气血愈盛则法力愈深。",
    grade: "神品",
    spec: { mode: "bonus", target: "hpToMp" },
    ratio: 50,
  },
  // —— 资源 · 转移型（100%）——
  {
    name: "噬元血魂葫芦",
    intro: "太古血葫，噬元啖法，一身法力尽数化作精血，法力尽失而血气滔天。",
    grade: "神品",
    spec: { mode: "transfer", target: "mpToHp" },
    ratio: 100,
  },
];

/**
 * 仅仙品 / 神品法宝生成转换型特殊效果；其余品阶返回 `undefined`。
 *
 * 从对应品阶的命名法宝中随机挑一件，比率固定（不随机）。
 *
 * @param grade 法宝品阶。
 * @returns 命名转换效果，或 `undefined`（非仙品/神品，或无可用模板）。
 */
export function rollTreasureSpecialEffect(grade: ItemGrade): TreasureConversionEffect | undefined {
  if (grade !== "仙品" && grade !== "神品") return undefined;
  const candidates = TREASURE_CONVERSION_TEMPLATES.filter(t => t.grade === grade);
  if (candidates.length === 0) return undefined;
  const tpl = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    name: tpl.name,
    intro: tpl.intro,
    conversions: [{ ...tpl.spec, ratio: tpl.ratio }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 转换应用 — 纯函数（基于快照计算 delta，避免顺序依赖）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 将主属性转换应用到基础属性上。
 *
 * 所有转换均读取传入的 `base` 快照，互不影响；最终统一回写。
 *
 * @param base 转换前的主属性。
 * @param conversions 生效中的转换列表（非 stat 项被忽略）。
 * @returns 转换后的主属性（新对象）。
 */
export function applyStatConversions(
  base: Readonly<Record<PrimaryStatKey, number>>,
  conversions: readonly TreasureConversion[],
): Record<PrimaryStatKey, number> {
  const result = { ...base };
  const deltas: Partial<Record<PrimaryStatKey, number>> = {};
  for (const c of conversions) {
    if (c.target !== "stat") continue;
    const srcVal = base[c.from] ?? 0;
    const amount = Math.floor((c.ratio / 100) * srcVal);
    if (amount <= 0) continue;
    if (c.mode === "transfer") {
      deltas[c.from] = (deltas[c.from] ?? 0) - amount;
    }
    deltas[c.to] = (deltas[c.to] ?? 0) + amount;
  }
  for (const k of Object.keys(deltas) as PrimaryStatKey[]) {
    const d = deltas[k] ?? 0;
    if (d !== 0) result[k] = Math.max(0, Math.trunc((result[k] ?? 0) + d));
  }
  return result;
}

/**
 * 将血量 / 法力上限转换应用到基础上。
 *
 * mpToHp / hpToMp 均读取 `baseHp` / `baseMp` 快照计算 delta，统一回写，
 * 故同时存在两类转换时也无顺序耦合。
 *
 * @param baseHp 转换前血量上限。
 * @param baseMp 转换前法力上限。
 * @param conversions 生效中的转换列表（非资源项被忽略）。
 * @returns 转换后的 `{ maxHp, maxMp }`（均至少为 1）。
 */
export function applyResourceConversions(
  baseHp: number,
  baseMp: number,
  conversions: readonly TreasureConversion[],
): { maxHp: number; maxMp: number } {
  let hpDelta = 0;
  let mpDelta = 0;
  for (const c of conversions) {
    if (c.target === "mpToHp") {
      const amount = Math.floor((c.ratio / 100) * baseMp);
      if (amount <= 0) continue;
      hpDelta += amount;
      if (c.mode === "transfer") mpDelta -= amount;
    } else if (c.target === "hpToMp") {
      const amount = Math.floor((c.ratio / 100) * baseHp);
      if (amount <= 0) continue;
      mpDelta += amount;
      if (c.mode === "transfer") hpDelta -= amount;
    }
  }
  return {
    maxHp: Math.max(1, Math.round(baseHp + hpDelta)),
    maxMp: Math.max(1, Math.round(baseMp + mpDelta)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 物品定义
// ═══════════════════════════════════════════════════════════════════════════

export interface TreasureItemDefinition {
  itemType: "法宝";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  function?: TreasureSpecialEffect;
  /** 仙品 / 神品法宝的转换型特殊效果；其余品阶通常为空。 */
  specialEffect?: TreasureConversionEffect;
}
