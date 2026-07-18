/**
 * 效果系统（effect pool）—— 法宝/功法/丹药所有效果的唯一真相源。
 *
 * 一切物品效果都是 Effect：主动战斗效果、被动战斗效果、丹药消耗效果、法宝转换效果。
 * 物品统一持有一个 effect: EffectBundle（见 items.ts）。AI 从 EFFECT_VOCABULARY 选 kind，
 * 程序按品阶填数值。
 */
import type { PrimaryStatKey } from "./playInfo";
import { PRIMARY_STAT_KEY_TO_ZH } from "./playInfo";

// ═══════════════════════════════════════════════════════════════════════════
// 基础：品阶
// ═══════════════════════════════════════════════════════════════════════════

export type ItemGrade = "下品" | "中品" | "上品" | "极品" | "仙品" | "神品";

export const GRADE_INDEX: Readonly<Record<string, number>> = {
  "下品": 0, "中品": 1, "上品": 2, "极品": 3, "仙品": 4, "神品": 5,
};

export const GRADE_ORDER: readonly ItemGrade[] = ["下品", "中品", "上品", "极品", "仙品", "神品"];

// ═══════════════════════════════════════════════════════════════════════════
// 层级数值系统：[第1层, 第10层] 端点，运行时线性插值
// ═══════════════════════════════════════════════════════════════════════════

export type LayerEndpoints = readonly [number, number];
export type LayerValue = number | LayerEndpoints;

export function expandTo10(endpoints: LayerEndpoints): readonly number[] {
  const [a, b] = endpoints;
  const r: number[] = [];
  for (let i = 0; i < 10; i++) r.push(Math.round(a + (b - a) * i / 9));
  return r;
}
export function atLayer(val: LayerValue, layer: number): number {
  if (typeof val === "number") return val;
  const arr = val.length === 2 ? expandTo10(val) : val;
  return arr[Math.max(0, Math.min(layer - 1, arr.length - 1))];
}
function expandTo10Float(endpoints: LayerEndpoints): readonly number[] {
  const [a, b] = endpoints;
  const r: number[] = [];
  for (let i = 0; i < 10; i++) r.push(a + (b - a) * i / 9);
  return r;
}
export function atLayerFloat(val: LayerValue, layer: number): number {
  if (typeof val === "number") return val;
  const arr = val.length === 2 ? expandTo10Float(val) : val;
  return arr[Math.max(0, Math.min(layer - 1, arr.length - 1))];
}

export type ScalingStat = PrimaryStatKey;

// ═══════════════════════════════════════════════════════════════════════════
// Effect —— 统一效果联合（战斗 + 消耗 + 转换）
// ═══════════════════════════════════════════════════════════════════════════

export type Effect =
  // 主动·伤害
  | { type: "dealDamage"; damageType: "physical" | "magical"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat }
  | { type: "dealDamageExecute"; damageType: "physical" | "magical"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat; threshold: number; bonusPercent: number }
  | { type: "dealDamagePierce"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat }
  | { type: "lifesteal"; damageType: "physical" | "magical"; damagePercent: LayerValue }
  | { type: "dealDamageBySummon"; damageType: "physical" | "magical"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat; summonName: string }
  | { type: "consumePoisonDamage" }
  | { type: "sacrificeHp"; percent: LayerValue }
  // 主动·持续/控制
  | { type: "applyStatus"; statusType: string; tickValue: LayerValue; isPercent: boolean; duration: number; maxStacks: number }
  | { type: "applyCc"; ccType: string; chance: LayerValue; duration: number }
  // 主动·辅助
  | { type: "heal"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat }
  | { type: "cleanse" }
  | { type: "dispel" }
  | { type: "stealth"; duration: number }
  | { type: "summon"; name: string; trigger: string; summonDamage: LayerValue; duration: number; scalingRatio?: LayerValue; scalingStat?: ScalingStat; countPerCast?: LayerValue }
  | { type: "revive"; hpPercent: number }
  | { type: "gaugeManipulate"; value: number }
  // 被动·战斗
  | { type: "applyModifier"; modifierType: string; value: LayerValue; duration: number; maxStacks: number; targetSelf?: boolean }
  | { type: "shield"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat }
  | { type: "counter"; baseValue: LayerValue; scalingRatio: LayerValue; scalingStat: ScalingStat; duration: number }
  | { type: "reflect"; percent: LayerValue; duration: number }
  | { type: "damageShare"; percent: LayerValue; duration: number }
  | { type: "deathWard"; duration: number }
  | { type: "extraAction"; chance: number }
  // 丹药·消耗
  | { type: "healHp"; value: LayerValue; isPercent: boolean }
  | { type: "healMp"; value: LayerValue; isPercent: boolean }
  | { type: "statBoost"; statKey: PrimaryStatKey; value: LayerValue }
  | { type: "xiuweiBoost"; value: LayerValue; isPercent: boolean }
  | { type: "shouyuanBoost"; value: LayerValue }
  // 法宝·转换（仙品/神品）
  | { type: "conversion"; mode: "bonus" | "transfer"; target: "stat" | "mpToHp" | "hpToMp"; from?: PrimaryStatKey; to?: PrimaryStatKey; ratio: number }
  ;

/** 效果分类：用于桥接层分流。 */
export type EffectFamily = "activeBattle" | "passiveBattle" | "consumable" | "conversion";

const ACTIVE_BATTLE_TYPES = new Set([
  "dealDamage", "dealDamageExecute", "dealDamagePierce", "lifesteal", "sacrificeHp",
  "applyStatus", "applyCc", "heal", "cleanse", "dispel", "stealth", "summon", "revive", "gaugeManipulate",
]);
const PASSIVE_BATTLE_TYPES = new Set([
  "applyModifier", "shield", "counter", "reflect", "damageShare", "deathWard", "extraAction",
]);
const CONSUMABLE_TYPES = new Set(["healHp", "healMp", "statBoost", "xiuweiBoost", "shouyuanBoost"]);

export function effectFamily(e: Effect): EffectFamily {
  if (e.type === "conversion") return "conversion";
  if (CONSUMABLE_TYPES.has(e.type)) return "consumable";
  if (PASSIVE_BATTLE_TYPES.has(e.type)) return "passiveBattle";
  return "activeBattle";
}

// ═══════════════════════════════════════════════════════════════════════════
// EffectBundle —— 命名效果集合（物品的 effect 字段）
// ═══════════════════════════════════════════════════════════════════════════

export type EffectBundleType = "主动" | "被动";

export interface EffectBundle {
  name: string;
  intro: string;
  effects: readonly Effect[];
  /** 功法/法宝用：主动（可施放）/ 被动（常驻）。丹药可缺省。 */
  type?: EffectBundleType;
  mpCost?: LayerValue;
  cooldown?: number;
  isAoE?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 修正类型（applyModifier 的 modifierType 取值，亦映射战斗引擎 ModifierType）
// ═══════════════════════════════════════════════════════════════════════════

export type TreasureModifierType =
  | "damageDealt" | "damageTaken" | "hpRecover" | "mpRecover"
  | "speed" | "critRate" | "critDmg" | "dodgeRate"
  | "lifesteal" | "defensePenetration"
  | "physDamageDealt" | "magDamageDealt"
  | "physDamageTaken" | "magDamageTaken"
  | "physDefensePenetration" | "magDefensePenetration";

export const TREASURE_MODIFIER_NAMES: Readonly<Record<TreasureModifierType, string>> = {
  damageDealt: "增伤", damageTaken: "减伤", hpRecover: "血量恢复", mpRecover: "法力恢复",
  speed: "速度", critRate: "暴击", critDmg: "暴伤", dodgeRate: "闪避",
  lifesteal: "吸血", defensePenetration: "穿透",
  physDamageDealt: "物理增伤", magDamageDealt: "法术增伤",
  physDamageTaken: "物理减伤", magDamageTaken: "法术减伤",
  physDefensePenetration: "破甲", magDefensePenetration: "破法",
};

export const TREASURE_MODIFIER_TYPES: readonly TreasureModifierType[] = [
  "damageDealt", "damageTaken", "hpRecover", "mpRecover",
  "speed", "critRate", "critDmg", "dodgeRate",
  "lifesteal", "defensePenetration",
  "physDamageDealt", "magDamageDealt",
  "physDamageTaken", "magDamageTaken",
  "physDefensePenetration", "magDefensePenetration",
];

export const MODIFIER_VALUE_RANGES: Readonly<Record<TreasureModifierType, Readonly<Record<ItemGrade, readonly [number, number]>>>> = {
  damageDealt:  { "下品": [2, 4],  "中品": [3, 6],   "上品": [5, 9],   "极品": [7, 13],  "仙品": [10, 16], "神品": [12, 20] },
  damageTaken:  { "下品": [1, 2],  "中品": [1, 3],   "上品": [2, 4],   "极品": [3, 6],   "仙品": [5, 8],   "神品": [6, 10] },
  hpRecover:    { "下品": [1, 1],  "中品": [2, 2],   "上品": [3, 3],   "极品": [4, 4],   "仙品": [5, 5],   "神品": [6, 6] },
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
// 转换效果（conversion Effect）模板与应用
// ═══════════════════════════════════════════════════════════════════════════

interface ConversionTemplate {
  name: string; intro: string; grade: ItemGrade;
  mode: "bonus" | "transfer"; target: "stat" | "mpToHp" | "hpToMp";
  from?: PrimaryStatKey; to?: PrimaryStatKey; ratio: number;
}

const CONVERSION_TEMPLATES: readonly ConversionTemplate[] = [
  { name: "摄神化劲鼎", intro: "鼎身遍刻神识铭文，祭炼之际引一丝神识入体，于劲力之中平添几分威能。", grade: "仙品", mode: "bonus", target: "stat", from: "perception", to: "strength", ratio: 30 },
  { name: "淬灵铸体炉", intro: "炉中灵火温养肉身，以灵力淬炼筋骨，体魄愈发坚韧雄浑。", grade: "仙品", mode: "bonus", target: "stat", from: "spirit", to: "physique", ratio: 30 },
  { name: "卸甲摧锋环", intro: "灵环卸去护体之韧，反哺筋骨化为摧锋之力，守转为攻，劲力大盛。", grade: "仙品", mode: "bonus", target: "stat", from: "guard", to: "strength", ratio: 30 },
  { name: "散御凝神镜", intro: "古镜散去灵御之防，反照灵台，于神识之中洞开一片清明。", grade: "仙品", mode: "bonus", target: "stat", from: "resistance", to: "perception", ratio: 30 },
  { name: "噬神铸力钟", intro: "钟鸣噬神，强夺自身神识尽数灌入劲脉，舍神识而求蛮力。", grade: "仙品", mode: "transfer", target: "stat", from: "perception", to: "strength", ratio: 50 },
  { name: "焚灵炼体塔", intro: "宝塔焚炼自身灵力，熔铸于肉身之中，灵力骤损而体魄暴涨。", grade: "仙品", mode: "transfer", target: "stat", from: "spirit", to: "physique", ratio: 50 },
  { name: "凝元化血珠", intro: "珠中氤氲法力，反哺血肉，血气因法力而绵长不绝。", grade: "仙品", mode: "bonus", target: "mpToHp", ratio: 30 },
  { name: "吞元化血葫芦", intro: "葫芦吞元化血，将半数法力尽数化为精血，法力锐减而血气暴涨。", grade: "仙品", mode: "transfer", target: "mpToHp", ratio: 50 },
  { name: "万神铸力鼎", intro: "上古神鼎，引万神之识熔铸己身，神识愈盛则劲力愈强，势不可挡。", grade: "神品", mode: "bonus", target: "stat", from: "perception", to: "strength", ratio: 50 },
  { name: "九转金身炉", intro: "太古仙炉，九转金身之法，灵力尽数凝于肉身，铸就不灭金身。", grade: "神品", mode: "bonus", target: "stat", from: "spirit", to: "physique", ratio: 50 },
  { name: "灭神吞力钟", intro: "上古魔钟，神识尽毁而蛮力无双，一身神识尽数化作摧山之力。", grade: "神品", mode: "transfer", target: "stat", from: "perception", to: "strength", ratio: 100 },
  { name: "造化凝血珠", intro: "造化神珠，法力如渊，源源不绝反哺血肉，寿元血气皆因之而旺。", grade: "神品", mode: "bonus", target: "mpToHp", ratio: 50 },
  { name: "噬元血魂葫芦", intro: "太古血葫，噬元啖法，一身法力尽数化作精血，法力尽失而血气滔天。", grade: "神品", mode: "transfer", target: "mpToHp", ratio: 100 },
];

/** 仙品/神品法宝随机生成一个 conversion 效果（含命名）；其余品阶返回 null。 */
export function rollConversionEffect(grade: ItemGrade): Effect | null {
  if (grade !== "仙品" && grade !== "神品") return null;
  const candidates = CONVERSION_TEMPLATES.filter(t => t.grade === grade);
  if (candidates.length === 0) return null;
  const t = candidates[Math.floor(Math.random() * candidates.length)];
  return { type: "conversion", mode: t.mode, target: t.target, from: t.from, to: t.to, ratio: t.ratio };
}

/** 转换效果的展示名/简介（供 UI）。 */
export function conversionEffectMeta(e: Extract<Effect, { type: "conversion" }>): { name: string; intro: string } {
  const t = CONVERSION_TEMPLATES.find(c => c.mode === e.mode && c.target === e.target && c.from === e.from && c.to === e.to && c.ratio === e.ratio);
  return t ? { name: t.name, intro: t.intro } : { name: "转换", intro: "" };
}

/** 主属性转换应用（读取 base 快照，统一回写）。 */
export function applyStatConversions(base: Readonly<Record<PrimaryStatKey, number>>, conversions: readonly Effect[]): Record<PrimaryStatKey, number> {
  const result = { ...base };
  const deltas: Partial<Record<PrimaryStatKey, number>> = {};
  for (const c of conversions) {
    if (c.type !== "conversion" || c.target !== "stat" || !c.from || !c.to) continue;
    const srcVal = base[c.from] ?? 0;
    const amount = Math.floor((c.ratio / 100) * srcVal);
    if (amount <= 0) continue;
    if (c.mode === "transfer") deltas[c.from] = (deltas[c.from] ?? 0) - amount;
    deltas[c.to] = (deltas[c.to] ?? 0) + amount;
  }
  for (const k of Object.keys(deltas) as PrimaryStatKey[]) {
    const d = deltas[k] ?? 0;
    if (d !== 0) result[k] = Math.max(0, Math.trunc((result[k] ?? 0) + d));
  }
  return result;
}

/** 血量/法力上限转换应用。 */
export function applyResourceConversions(baseHp: number, baseMp: number, conversions: readonly Effect[]): { maxHp: number; maxMp: number } {
  let hpDelta = 0, mpDelta = 0;
  for (const c of conversions) {
    if (c.type !== "conversion") continue;
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
  return { maxHp: Math.max(1, Math.round(baseHp + hpDelta)), maxMp: Math.max(1, Math.round(baseMp + mpDelta)) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 枚举
// ═══════════════════════════════════════════════════════════════════════════

export const DAMAGE_TYPES = ["physical", "magical", "true"] as const;
export const STATUS_TYPES = ["poison", "burn", "bleed", "hpRegen", "mpDrain"] as const;
export const CC_TYPES = ["stun", "freeze", "silence", "taunt", "fear", "confusion"] as const;
export const SUMMON_TRIGGERS = ["on_attack", "on_hit", "on_turn_start", "on_turn_end", "on_kill", "on_crit", "on_dodge"] as const;
export const SCALING_STATS: readonly ScalingStat[] = ["strength", "perception", "spirit", "physique", "guard", "resistance", "agility", "insight"];

const DAMAGE_TYPE_LABELS: Record<string, string> = { physical: "物理", magical: "法术", true: "真实" };
const STATUS_TYPE_LABELS: Record<string, string> = { poison: "中毒", burn: "灼烧", bleed: "流血", hpRegen: "生命恢复", mpDrain: "法力流失" };
const CC_TYPE_LABELS: Record<string, string> = { stun: "眩晕", freeze: "冰冻", silence: "沉默", taunt: "嘲讽", fear: "恐惧", confusion: "混乱" };
const SCALING_STAT_LABELS: Record<string, string> = {
  strength: "劲力", perception: "神识", spirit: "灵力", physique: "体魄",
  guard: "护体", resistance: "灵御", agility: "身法", insight: "悟性",
};

// ═══════════════════════════════════════════════════════════════════════════
// 数值表（按 kind × 品阶）
// ═══════════════════════════════════════════════════════════════════════════

type NumProfile = {
  baseValue?: [number, number]; scalingRatio?: [number, number]; tickValue?: [number, number];
  chance?: number; percent?: number; damagePercent?: [number, number];
  duration?: number; maxStacks?: number; threshold?: number; bonusPercent?: number; hpPercent?: number; value?: number;
};

function bv(lo: number[], hi: number[]): Record<string, [number, number]> {
  return { 下品: [lo[0], hi[0]], 中品: [lo[1], hi[1]], 上品: [lo[2], hi[2]], 极品: [lo[3], hi[3]], 仙品: [lo[4], hi[4]], 神品: [lo[5], hi[5]] };
}
const ratioTbl = bv([0.5, 0.7, 0.9, 1.1, 1.3, 1.5], [1.8, 2.2, 2.8, 3.4, 4.0, 5.0]);
const pierceRatioTbl = bv([0.3, 0.4, 0.5, 0.6, 0.8, 1.0], [1.0, 1.3, 1.6, 2.0, 2.6, 3.2]);

export const EFFECT_NUMBERS: Record<string, Partial<Record<ItemGrade, NumProfile>>> = {
  dealDamage: { 下品: { baseValue: [30, 300], scalingRatio: ratioTbl.下品 }, 中品: { baseValue: [60, 500], scalingRatio: ratioTbl.中品 }, 上品: { baseValue: [120, 900], scalingRatio: ratioTbl.上品 }, 极品: { baseValue: [200, 1400], scalingRatio: ratioTbl.极品 }, 仙品: { baseValue: [300, 2000], scalingRatio: ratioTbl.仙品 }, 神品: { baseValue: [500, 3000], scalingRatio: ratioTbl.神品 } },
  dealDamageExecute: { 下品: { baseValue: [40, 350], scalingRatio: ratioTbl.下品, threshold: 0.5, bonusPercent: 50 }, 中品: { baseValue: [80, 600], scalingRatio: ratioTbl.中品, threshold: 0.5, bonusPercent: 50 }, 上品: { baseValue: [150, 1000], scalingRatio: ratioTbl.上品, threshold: 0.5, bonusPercent: 50 }, 极品: { baseValue: [250, 1600], scalingRatio: ratioTbl.极品, threshold: 0.5, bonusPercent: 50 }, 仙品: { baseValue: [350, 2200], scalingRatio: ratioTbl.仙品, threshold: 0.5, bonusPercent: 50 }, 神品: { baseValue: [600, 3500], scalingRatio: ratioTbl.神品, threshold: 0.5, bonusPercent: 50 } },
  dealDamagePierce: { 下品: { baseValue: [20, 200], scalingRatio: pierceRatioTbl.下品 }, 中品: { baseValue: [40, 350], scalingRatio: pierceRatioTbl.中品 }, 上品: { baseValue: [80, 600], scalingRatio: pierceRatioTbl.上品 }, 极品: { baseValue: [120, 830], scalingRatio: pierceRatioTbl.极品 }, 仙品: { baseValue: [180, 1200], scalingRatio: pierceRatioTbl.仙品 }, 神品: { baseValue: [280, 1800], scalingRatio: pierceRatioTbl.神品 } },
  lifesteal: { 下品: { damagePercent: [15, 25] }, 中品: { damagePercent: [20, 30] }, 上品: { damagePercent: [25, 35] }, 极品: { damagePercent: [30, 40] }, 仙品: { damagePercent: [35, 45] }, 神品: { damagePercent: [40, 50] } },
  applyStatus: { 下品: { tickValue: [20, 120], duration: 3, maxStacks: 3 }, 中品: { tickValue: [40, 200], duration: 3, maxStacks: 3 }, 上品: { tickValue: [80, 400], duration: 3, maxStacks: 3 }, 极品: { tickValue: [120, 600], duration: 3, maxStacks: 3 }, 仙品: { tickValue: [180, 900], duration: 4, maxStacks: 3 }, 神品: { tickValue: [300, 1500], duration: 4, maxStacks: 3 } },
  applyCc: { 下品: { chance: 0.30, duration: 1 }, 中品: { chance: 0.40, duration: 1 }, 上品: { chance: 0.50, duration: 2 }, 极品: { chance: 0.60, duration: 2 }, 仙品: { chance: 0.70, duration: 2 }, 神品: { chance: 0.80, duration: 3 } },
  heal: { 下品: { baseValue: [60, 500], scalingRatio: ratioTbl.下品 }, 中品: { baseValue: [100, 800], scalingRatio: ratioTbl.中品 }, 上品: { baseValue: [150, 1100], scalingRatio: ratioTbl.上品 }, 极品: { baseValue: [200, 1500], scalingRatio: ratioTbl.极品 }, 仙品: { baseValue: [300, 2000], scalingRatio: ratioTbl.仙品 }, 神品: { baseValue: [500, 3000], scalingRatio: ratioTbl.神品 } },
  shield: { 下品: { baseValue: [50, 400], scalingRatio: [0.5, 1.5] }, 中品: { baseValue: [80, 600], scalingRatio: [0.6, 1.8] }, 上品: { baseValue: [120, 900], scalingRatio: [0.8, 2.2] }, 极品: { baseValue: [200, 1200], scalingRatio: [1.0, 2.8] }, 仙品: { baseValue: [300, 1800], scalingRatio: [1.2, 3.4] }, 神品: { baseValue: [500, 3000], scalingRatio: [1.5, 4.5] } },
  counter: { 下品: { baseValue: [40, 300], scalingRatio: pierceRatioTbl.下品, duration: 99 }, 中品: { baseValue: [60, 500], scalingRatio: pierceRatioTbl.中品, duration: 99 }, 上品: { baseValue: [100, 800], scalingRatio: pierceRatioTbl.上品, duration: 99 }, 极品: { baseValue: [150, 1100], scalingRatio: pierceRatioTbl.极品, duration: 99 }, 仙品: { baseValue: [220, 1500], scalingRatio: pierceRatioTbl.仙品, duration: 99 }, 神品: { baseValue: [350, 2200], scalingRatio: pierceRatioTbl.神品, duration: 99 } },
  reflect: { 下品: { percent: 12, duration: 99 }, 中品: { percent: 16, duration: 99 }, 上品: { percent: 20, duration: 99 }, 极品: { percent: 25, duration: 99 }, 仙品: { percent: 32, duration: 99 }, 神品: { percent: 40, duration: 99 } },
  damageShare: { 下品: { percent: 20, duration: 99 }, 中品: { percent: 25, duration: 99 }, 上品: { percent: 30, duration: 99 }, 极品: { percent: 35, duration: 99 }, 仙品: { percent: 40, duration: 99 }, 神品: { percent: 45, duration: 99 } },
  deathWard: { 下品: { duration: 99 }, 中品: { duration: 99 }, 上品: { duration: 99 }, 极品: { duration: 99 }, 仙品: { duration: 99 }, 神品: { duration: 99 } },
  extraAction: { 下品: { chance: 0.05 }, 中品: { chance: 0.07 }, 上品: { chance: 0.10 }, 极品: { chance: 0.12 }, 仙品: { chance: 0.15 }, 神品: { chance: 0.18 } },
  revive: { 下品: { hpPercent: 30 }, 中品: { hpPercent: 35 }, 上品: { hpPercent: 40 }, 极品: { hpPercent: 45 }, 仙品: { hpPercent: 50 }, 神品: { hpPercent: 60 } },
  gaugeManipulate: { 下品: { value: -20 }, 中品: { value: -30 }, 上品: { value: -40 }, 极品: { value: -50 }, 仙品: { value: -60 }, 神品: { value: -80 } },
  sacrificeHp: { 下品: { percent: 5 }, 中品: { percent: 8 }, 上品: { percent: 10 }, 极品: { percent: 12 }, 仙品: { percent: 15 }, 神品: { percent: 20 } },
  stealth: { 下品: { duration: 2 }, 中品: { duration: 2 }, 上品: { duration: 2 }, 极品: { duration: 3 }, 仙品: { duration: 3 }, 神品: { duration: 3 } },
  summon: { 下品: { baseValue: [30, 300], scalingRatio: [0.5, 1.5] }, 中品: { baseValue: [60, 500], scalingRatio: [0.7, 2.0] }, 上品: { baseValue: [100, 800], scalingRatio: [0.9, 2.5] }, 极品: { baseValue: [150, 1100], scalingRatio: [1.1, 3.0] }, 仙品: { baseValue: [220, 1500], scalingRatio: [1.3, 3.5] }, 神品: { baseValue: [350, 2200], scalingRatio: [1.5, 4.5] } },
  // 丹药消耗数值（按 effectType 中文键）
  healHp: { 下品: { value: 50 }, 中品: { value: 100 }, 上品: { value: 1000 }, 极品: { value: 30 }, 仙品: { value: 50 }, 神品: { value: 80 } },
  healMp: { 下品: { value: 50 }, 中品: { value: 100 }, 上品: { value: 1000 }, 极品: { value: 30 }, 仙品: { value: 50 }, 神品: { value: 80 } },
  xiuweiBoost: { 下品: { value: 200 }, 中品: { value: 1000 }, 上品: { value: 5000 }, 极品: { value: 10 }, 仙品: { value: 20 }, 神品: { value: 30 } },
  shouyuanBoost: { 下品: { value: 5 }, 中品: { value: 10 }, 上品: { value: 20 }, 极品: { value: 50 }, 仙品: { value: 100 }, 神品: { value: 200 } },
  statBoost: { 下品: { value: 2 }, 中品: { value: 5 }, 上品: { value: 8 }, 极品: { value: 12 }, 仙品: { value: 20 }, 神品: { value: 30 } },
  cleanse: {}, dispel: {},
};

export const ACTIVE_MP_COST_BY_GRADE: Record<ItemGrade, [number, number]> = { 下品: [50, 500], 中品: [75, 750], 上品: [100, 1000], 极品: [200, 2000], 仙品: [300, 3000], 神品: [500, 5000] };
export const ACTIVE_COOLDOWN_BY_GRADE: Record<ItemGrade, number> = { 下品: 1, 中品: 2, 上品: 4, 极品: 6, 仙品: 8, 神品: 10 };

// ═══════════════════════════════════════════════════════════════════════════
// 效果原型目录（供 AI 选择）
// ═══════════════════════════════════════════════════════════════════════════

export type EffectApplicability = "active" | "passive" | "elixir";
export interface EffectKindDef { kind: string; label: string; desc: string; applicability: EffectApplicability; params?: { damageType?: true; statusType?: true; ccType?: true; modifierType?: true; scalingStat?: true; summonTrigger?: true; statKey?: true } }

export const EFFECT_VOCABULARY: readonly EffectKindDef[] = [
  { kind: "dealDamage", label: "直接伤害", desc: "造成物理/法术/真实伤害", applicability: "active", params: { damageType: true, scalingStat: true } },
  { kind: "dealDamageExecute", label: "斩杀伤害", desc: "目标血量越低伤害越高", applicability: "active", params: { damageType: true, scalingStat: true } },
  { kind: "dealDamagePierce", label: "破防伤害", desc: "无视防御造成伤害", applicability: "active", params: { scalingStat: true } },
  { kind: "lifesteal", label: "吸血", desc: "造成伤害并吸取生命", applicability: "active", params: { damageType: true } },
  { kind: "applyStatus", label: "施加持续状态", desc: "中毒/灼烧/流血/生命恢复/法力流失", applicability: "active", params: { statusType: true } },
  { kind: "applyCc", label: "施加控制", desc: "眩晕/冰冻/沉默/嘲讽/恐惧/混乱", applicability: "active", params: { ccType: true } },
  { kind: "heal", label: "治疗", desc: "恢复单体生命", applicability: "active", params: { scalingStat: true } },
  { kind: "cleanse", label: "净化", desc: "解除自身控制与持续伤害", applicability: "active" },
  { kind: "dispel", label: "驱散", desc: "解除目标增益", applicability: "active" },
  { kind: "stealth", label: "隐匿", desc: "隐匿数回合", applicability: "active" },
  { kind: "summon", label: "召唤", desc: "召唤灵体/飞剑协同作战", applicability: "active", params: { summonTrigger: true } },
  { kind: "revive", label: "复活", desc: "复活同伴并恢复生命", applicability: "active" },
  { kind: "gaugeManipulate", label: "操纵行动", desc: "削减目标行动条", applicability: "active" },
  { kind: "applyModifier", label: "属性修正", desc: "常驻百分比修正（增减伤/暴击/速度/穿透/恢复等）", applicability: "passive", params: { modifierType: true } },
  { kind: "shield", label: "护盾", desc: "常驻护盾吸收伤害", applicability: "passive" },
  { kind: "counter", label: "反击", desc: "受击时反弹反击伤害", applicability: "passive" },
  { kind: "reflect", label: "反伤", desc: "反弹一定比例伤害", applicability: "passive" },
  { kind: "damageShare", label: "伤害分摊", desc: "与同伴分摊伤害", applicability: "passive" },
  { kind: "deathWard", label: "免死护体", desc: "致命伤害时保留1点生命", applicability: "passive" },
  { kind: "extraAction", label: "神速连击", desc: "概率获得额外行动", applicability: "passive" },
  { kind: "healHp", label: "恢复血量", desc: "战斗中/外恢复生命", applicability: "elixir" },
  { kind: "healMp", label: "恢复法力", desc: "战斗中/外恢复法力", applicability: "elixir" },
  { kind: "statBoost", label: "永久提升属性", desc: "永久提升一项主属性", applicability: "elixir", params: { statKey: true } },
  { kind: "xiuweiBoost", label: "提升修为", desc: "增加修为值", applicability: "elixir" },
  { kind: "shouyuanBoost", label: "提升寿元", desc: "延长寿命", applicability: "elixir" },
];

const ACTIVE_KINDS = new Set(EFFECT_VOCABULARY.filter(k => k.applicability === "active").map(k => k.kind));
const PASSIVE_KINDS = new Set(EFFECT_VOCABULARY.filter(k => k.applicability === "passive").map(k => k.kind));

export interface EffectParams {
  damageType?: string; statusType?: string; ccType?: string; modifierType?: string;
  scalingStat?: string; summonTrigger?: string; statKey?: string; isAoE?: boolean;
}

/** 一条 AI 效果选择：kind + 参数。一件物品的 effect 可由多条 Entry 组合而成。 */
export interface EffectEntry {
  kind: string;
  params: EffectParams;
}

function pick<T extends string>(raw: unknown, valid: readonly T[], fallback: T): T {
  if (typeof raw === "string" && (valid as readonly string[]).includes(raw)) return raw as T;
  return fallback;
}
function num(kind: string, grade: ItemGrade): NumProfile {
  return (EFFECT_NUMBERS[kind]?.[grade] ?? EFFECT_NUMBERS[kind]?.下品 ?? {}) as NumProfile;
}
function rollRange([lo, hi]: [number, number]): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
function defaultScalingStat(damageType: string): ScalingStat {
  return damageType === "magical" ? "perception" : "strength";
}

/** 把 kind+params 展开为 1~2 条 Effect（语义包展开为多条）。 */
export function expandEffectKind(kind: string, p: EffectParams, grade: ItemGrade): Effect[] {
  const n = num(kind, grade);
  const dt = pick(p.damageType, DAMAGE_TYPES, "physical") as "physical" | "magical" | "true";
  const dt2 = dt === "true" ? "physical" : dt;
  const stat = (p.scalingStat && (SCALING_STATS as readonly string[]).includes(p.scalingStat) ? p.scalingStat : defaultScalingStat(dt)) as ScalingStat;
  switch (kind) {
    case "dealDamage": return [{ type: "dealDamage", damageType: dt2, baseValue: n.baseValue!, scalingRatio: n.scalingRatio!, scalingStat: stat }];
    case "dealDamageExecute": return [{ type: "dealDamageExecute", damageType: dt2, baseValue: n.baseValue!, scalingRatio: n.scalingRatio!, scalingStat: stat, threshold: n.threshold ?? 0.5, bonusPercent: n.bonusPercent ?? 50 }];
    case "dealDamagePierce": return [{ type: "dealDamagePierce", baseValue: n.baseValue!, scalingRatio: n.scalingRatio!, scalingStat: stat }];
    case "lifesteal": return [{ type: "lifesteal", damageType: dt2, damagePercent: n.damagePercent! }];
    case "applyStatus": return [{ type: "applyStatus", statusType: pick(p.statusType, STATUS_TYPES, "burn"), tickValue: n.tickValue!, isPercent: false, duration: n.duration ?? 3, maxStacks: n.maxStacks ?? 3 }];
    case "applyCc": return [{ type: "applyCc", ccType: pick(p.ccType, CC_TYPES, "stun"), chance: n.chance ?? 0.4, duration: n.duration ?? 1 }];
    case "heal": return [{ type: "heal", baseValue: n.baseValue!, scalingRatio: n.scalingRatio!, scalingStat: stat }];
    case "cleanse": return [{ type: "cleanse" }];
    case "dispel": return [{ type: "dispel" }];
    case "stealth": return [{ type: "stealth", duration: n.duration ?? 2 }];
    case "summon": return [{ type: "summon", name: "灵体", trigger: pick(p.summonTrigger, SUMMON_TRIGGERS, "on_attack"), summonDamage: n.baseValue!, duration: 99, scalingRatio: n.scalingRatio, scalingStat: stat }];
    case "revive": return [{ type: "revive", hpPercent: n.hpPercent ?? 50 }];
    case "gaugeManipulate": return [{ type: "gaugeManipulate", value: n.value ?? -40 }];
    case "shield": return [{ type: "shield", baseValue: n.baseValue!, scalingRatio: n.scalingRatio!, scalingStat: stat }];
    case "counter": return [{ type: "counter", baseValue: n.baseValue!, scalingRatio: n.scalingRatio!, scalingStat: stat, duration: n.duration ?? 99 }];
    case "reflect": return [{ type: "reflect", percent: n.percent ?? 20, duration: n.duration ?? 99 }];
    case "damageShare": return [{ type: "damageShare", percent: n.percent ?? 30, duration: n.duration ?? 99 }];
    case "deathWard": return [{ type: "deathWard", duration: n.duration ?? 99 }];
    case "extraAction": return [{ type: "extraAction", chance: n.chance ?? 0.1 }];
    case "healHp": return [{ type: "healHp", value: n.value ?? 50, isPercent: GRADE_INDEX[grade] >= 3 }];
    case "healMp": return [{ type: "healMp", value: n.value ?? 50, isPercent: GRADE_INDEX[grade] >= 3 }];
    case "statBoost": return [{ type: "statBoost", statKey: (p.statKey && (SCALING_STATS as readonly string[]).includes(p.statKey) ? p.statKey : "physique") as PrimaryStatKey, value: n.value ?? 2 }];
    case "xiuweiBoost": return [{ type: "xiuweiBoost", value: n.value ?? 200, isPercent: GRADE_INDEX[grade] >= 3 }];
    case "shouyuanBoost": return [{ type: "shouyuanBoost", value: n.value ?? 5 }];
    default: return [{ type: "dealDamage", damageType: "physical", baseValue: [30, 300], scalingRatio: [0.5, 1.8], scalingStat: "strength" }];
  }
}

export function isActiveKind(kind: string): boolean { return ACTIVE_KINDS.has(kind); }
export function isPassiveKind(kind: string): boolean { return PASSIVE_KINDS.has(kind); }

export function kindLabel(kind: string, p: EffectParams): string {
  const def = EFFECT_VOCABULARY.find(k => k.kind === kind);
  const base = def?.label ?? kind;
  const extras: string[] = [];
  if (p.damageType && DAMAGE_TYPE_LABELS[p.damageType]) extras.push(DAMAGE_TYPE_LABELS[p.damageType]);
  if (p.statusType && STATUS_TYPE_LABELS[p.statusType]) extras.push(STATUS_TYPE_LABELS[p.statusType]);
  if (p.ccType && CC_TYPE_LABELS[p.ccType]) extras.push(CC_TYPE_LABELS[p.ccType]);
  if (p.modifierType && TREASURE_MODIFIER_NAMES[p.modifierType as TreasureModifierType]) extras.push(TREASURE_MODIFIER_NAMES[p.modifierType as TreasureModifierType]);
  return extras.length ? `${base}·${extras.join("")}` : base;
}

// ═══════════════════════════════════════════════════════════════════════════
// 描述（展示用）
// ═══════════════════════════════════════════════════════════════════════════

const MODIFIER_LABELS: Record<string, string> = {
  damageDealt: "攻击伤害", physDamageDealt: "物理伤害", magDamageDealt: "法术伤害",
  damageTaken: "受到伤害", healReceived: "受到治疗", hpRecover: "生命恢复", mpRecover: "法力恢复",
  speed: "速度", critRate: "暴击率", critDmg: "暴击伤害", dodgeRate: "闪避率", lifesteal: "吸血",
  defensePenetration: "穿透", physDamageTaken: "物理减伤", magDamageTaken: "法术减伤",
  physDefensePenetration: "破甲", magDefensePenetration: "破法",
  normalAttackHpRatio: "血量附加", normalAttackDefRatio: "护体附加", normalAttackResRatio: "灵御附加",
  healOverflowToShield: "溢出转盾",
};

function bakeValue(eff: Effect, getStat: (k: PrimaryStatKey) => number, masteryMult: number, layer: number): number | undefined {
  if ("baseValue" in eff && "scalingRatio" in eff && "scalingStat" in eff) {
    const bv = atLayer(eff.baseValue, layer);
    const sr = atLayerFloat(eff.scalingRatio, layer);
    return Math.round((bv + sr * getStat(eff.scalingStat)) * masteryMult);
  }
  return undefined;
}

function formatScaled(eff: Effect, v: number | undefined, layer: number, showFormula: boolean): string {
  if (v == null) return "0";
  if (!showFormula || !("baseValue" in eff) || !("scalingRatio" in eff) || !("scalingStat" in eff)) return String(v);
  const sr = atLayerFloat(eff.scalingRatio, layer);
  if (sr === 0) return String(v);
  const bv = atLayer(eff.baseValue, layer);
  const sl = (eff as { scalingStat: ScalingStat }).scalingStat;
  return `${v}（${bv} + ${Number(sr.toFixed(2))}×${PRIMARY_STAT_KEY_TO_ZH[sl] ?? sl}）`;
}

export function resolveEffectDesc(eff: Effect, getStat: (k: PrimaryStatKey) => number, masteryMult: number, layer: number, showFormula = true, selfByDefault = false, isAoE = false): string {
  const v = bakeValue(eff, getStat, masteryMult, layer);
  const sv = formatScaled(eff, v, layer, showFormula);
  const dur = (d: number) => selfByDefault ? "" : (d >= 99 ? "（永久）" : `，持续${d}回合`);
  switch (eff.type) {
    case "dealDamage": return `造成${sv}点${isAoE ? "群体" : ""}${DAMAGE_TYPE_LABELS[eff.damageType] ?? "物理"}伤害`;
    case "dealDamageExecute": return `造成${sv}点${isAoE ? "群体" : ""}${DAMAGE_TYPE_LABELS[eff.damageType] ?? "物理"}伤害（目标低于${Math.round(eff.threshold * 100)}%血量时伤害+${eff.bonusPercent}%）`;
    case "dealDamagePierce": return `造成${sv}点${isAoE ? "群体" : ""}真实伤害（无视防御）`;
    case "dealDamageBySummon": return `基于「${eff.summonName}」数量造成${DAMAGE_TYPE_LABELS[eff.damageType] ?? "物理"}伤害，每柄${sv}点`;
    case "consumePoisonDamage": return `引爆目标身上所有中毒层数，立即结算剩余全部真实伤害并移除中毒`;
    case "lifesteal": { const pct = atLayer(eff.damagePercent, layer); return `${isAoE ? "群体" : ""}造成${pct}%伤害并吸取等量生命`; }
    case "sacrificeHp": return `消耗自身${atLayer(eff.percent, layer)}%最大生命`;
    case "applyStatus": { const tick = atLayer(eff.tickValue, layer); const stack = eff.maxStacks > 1 ? `（最多叠${eff.maxStacks}层）` : ""; return `${isAoE ? "群体" : ""}每回合${eff.isPercent ? `按最大生命${tick}%` : `${tick}点`}${STATUS_TYPE_LABELS[eff.statusType] ?? eff.statusType}，持续${eff.duration}回合${stack}`; }
    case "applyCc": return `${isAoE ? "群体" : ""}${CC_TYPE_LABELS[eff.ccType] ?? eff.ccType}（${Math.round(atLayerFloat(eff.chance, layer) * 100)}%概率），持续${eff.duration}回合`;
    case "heal": return `${isAoE ? "群体" : ""}恢复${sv}点生命`;
    case "cleanse": return "净化自身所有控制与持续伤害效果";
    case "dispel": return isAoE ? "群体驱散目标所有增益效果" : "驱散目标所有增益效果";
    case "stealth": return `隐匿${eff.duration}回合`;
    case "summon": { const baseDmg = atLayer(eff.summonDamage, layer); return `召唤${eff.name}，每回合造成${baseDmg}点伤害${eff.duration >= 99 ? "（永久）" : `，持续${eff.duration}回合`}`; }
    case "revive": return `复活并恢复${eff.hpPercent}%生命`;
    case "gaugeManipulate": return eff.value > 0 ? `行动条增加${eff.value}` : `行动条减少${Math.abs(eff.value)}`;
    case "applyModifier": { const label = MODIFIER_LABELS[eff.modifierType] ?? eff.modifierType; const val = atLayer(eff.value, layer); const sign = val > 0 ? "+" : ""; const stack = eff.maxStacks > 1 ? `（最多叠${eff.maxStacks}层）` : ""; const target = isAoE ? (eff.targetSelf ? "全体我方" : "全体敌方") : ((eff.targetSelf || selfByDefault) ? "自身" : "目标"); return `${target}${label}${sign}${val}%${dur(eff.duration)}${stack}`; }
    case "shield": return selfByDefault ? `开局获得${sv}点护盾` : `获得${sv}点护盾`;
    case "counter": return `受击时反击${sv}点伤害${dur(eff.duration)}`;
    case "reflect": return `反弹${atLayer(eff.percent, layer)}%受到的伤害${dur(eff.duration)}`;
    case "damageShare": return `分摊${atLayer(eff.percent, layer)}%队友受到的伤害${dur(eff.duration)}`;
    case "deathWard": return `免死护盾：致命伤害时保留1点生命${dur(eff.duration)}`;
    case "extraAction": return `${Math.round(eff.chance * 100)}%概率获得额外行动`;
    case "healHp": return `恢复${eff.isPercent ? `${atLayer(eff.value, layer)}%` : `${atLayer(eff.value, layer)}点`}生命`;
    case "healMp": return `恢复${eff.isPercent ? `${atLayer(eff.value, layer)}%` : `${atLayer(eff.value, layer)}点`}法力`;
    case "statBoost": return `永久提升${PRIMARY_STAT_KEY_TO_ZH[eff.statKey] ?? eff.statKey}+${atLayer(eff.value, layer)}`;
    case "xiuweiBoost": return `提升修为${eff.isPercent ? `${atLayer(eff.value, layer)}%` : `${atLayer(eff.value, layer)}`}`;
    case "shouyuanBoost": return `提升寿元${atLayer(eff.value, layer)}年`;
    case "conversion": { const m = conversionEffectMeta(eff); return m.intro || "属性转换"; }
  }
}

export function resolveEffectBundleDisplay(bundle: EffectBundle, getStat: (k: PrimaryStatKey) => number, masteryMult: number, layer: number, cooldownReduce = 0): string {
  const selfByDefault = bundle.type === "被动";
  const parts = bundle.effects.map(e => resolveEffectDesc(e, getStat, masteryMult, layer, true, selfByDefault, bundle.isAoE === true)).join("；");
  const lines = [parts];
  const mp = bundle.mpCost != null ? atLayer(bundle.mpCost, layer) : 0;
  if (mp > 0) lines.push(`法力消耗：${mp}`);
  if (bundle.type === "主动") lines.push(`冷却：${Math.max(0, (bundle.cooldown ?? 0) - cooldownReduce)}回合`);
  return lines.join("\n");
}
