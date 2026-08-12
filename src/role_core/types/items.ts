/**
 * 物品领域模型（统一）：法宝 / 功法 / 丹药 / 材料 / 杂物。
 *
 * 每件物品持有一个 effect: EffectBundle（来自效果池 effects.ts）。
 *   - 法宝 = 效果（被动战斗 + 转换）
 *   - 丹药 = 效果（消耗）
 *   - 功法 = 属性（bonus）+ 效果
 */
import type { SpiritStoneInventoryStack } from "./spiritStone";
import type { ZhStatBonusMap } from "./playInfo";
import type { PrimaryStatKey } from "./playInfo";
import type { Effect, EffectBundle, ItemGrade, EffectEntry } from "./effects";
import {
  GRADE_INDEX,
  expandEffectKind,
  isActiveKind,
  isPassiveKind,
  kindLabel,
  rollConversionEffect,
  TREASURE_MODIFIER_NAMES,
  TREASURE_MODIFIER_TYPES,
  MODIFIER_VALUE_RANGES,
  ACTIVE_MP_COST_BY_GRADE,
  ACTIVE_COOLDOWN_BY_GRADE,
  EFFECT_NUMBERS,
  type TreasureModifierType,
} from "./effects";
import { getLinggenElementBonus } from "./gameConstants";

// ---------------------------------------------------------------------------
// 共用
// ---------------------------------------------------------------------------

export type { ItemGrade, Effect, EffectBundle, EffectParams, EffectEntry } from "./effects";

export type ItemBonusMap = ZhStatBonusMap | Record<string, number>;

// ---------------------------------------------------------------------------
// 物品定义
// ---------------------------------------------------------------------------

export interface TreasureItemDefinition {
  itemType: "法宝";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  effect?: EffectBundle;
}

export interface GongfaItemDefinition {
  itemType: "功法";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  bonus: ItemBonusMap;
  effect?: EffectBundle;
  mastery?: number;
  masteryExp?: number;
}

export interface ElixirItemDefinition {
  itemType: "丹药";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  effect?: EffectBundle;
}

export interface TalismanItemDefinition {
  itemType: "符箓";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  effect?: EffectBundle;
}

export interface FormationItemDefinition {
  itemType: "阵法";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  effect?: EffectBundle;
}

export interface AlchemyMaterialItemDefinition { itemType: "炼丹材料"; name: string; desc: string; grade: ItemGrade; count: number; }
export interface ForgingMaterialItemDefinition { itemType: "炼器材料"; name: string; desc: string; grade: ItemGrade; count: number; }
export type MaterialItemDefinition = AlchemyMaterialItemDefinition | ForgingMaterialItemDefinition;
export interface MiscItemDefinition { itemType: "杂物"; name: string; desc: string; grade: ItemGrade; count: number; }

export type CategorizedItemDefinition =
  | TreasureItemDefinition | GongfaItemDefinition | ElixirItemDefinition
  | TalismanItemDefinition | FormationItemDefinition
  | AlchemyMaterialItemDefinition | ForgingMaterialItemDefinition
  | MiscItemDefinition;

export type { SpiritStoneInventoryStack };
export type TreasureBagStack = TreasureItemDefinition;
export type GongfaBagStack = GongfaItemDefinition;
export type ElixirBagStack = ElixirItemDefinition;
export type TalismanBagStack = TalismanItemDefinition;
export type FormationBagStack = FormationItemDefinition;
export type MaterialBagStack = MaterialItemDefinition;
export type MiscBagStack = MiscItemDefinition;
export type InventoryStackItem = SpiritStoneInventoryStack | CategorizedItemDefinition;

// ---------------------------------------------------------------------------
// 品阶校验
// ---------------------------------------------------------------------------

/** 品阶合法集合（仍保留 REALM_GRADE_FLOOR 供其他用途查阅）。 */
const VALID_GRADES: readonly ItemGrade[] = ["下品", "中品", "上品", "极品", "仙品", "神品"];
const REALM_GRADE_FLOOR: Readonly<Record<string, ItemGrade>> = { 练气: "下品", 筑基: "中品", 结丹: "上品", 元婴: "极品", 化神: "仙品" };

export function validateGrade(raw: unknown, _realmMajor?: string): ItemGrade | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!VALID_GRADES.includes(trimmed as ItemGrade)) return null;
  return trimmed as ItemGrade;
}

/**
 * 品阶确定性兜底：取该大境界的参照下限（练气=下品 … 化神=仙品）。
 * 未知境界回退下品。用于 AI 缺失/输出非法品阶时替代旧的随机 rollGrade。
 */
export function realmFloorGrade(realmMajor: string): ItemGrade {
  return REALM_GRADE_FLOOR[realmMajor] ?? "下品";
}

// ---------------------------------------------------------------------------
// 效果解析（EffectEntry[] + grade → EffectBundle）
// ---------------------------------------------------------------------------

/** 把多条 Entry 展开为扁平 Effect[]，并给出合成名。 */
function expandEntries(entries: readonly EffectEntry[], grade: ItemGrade): { effects: Effect[]; name: string; isAoE: boolean } {
  const effects: Effect[] = [];
  const labels: string[] = [];
  let isAoE = false;
  for (const e of entries) {
    if (!e || typeof e.kind !== "string") continue;
    effects.push(...expandEffectKind(e.kind, e.params ?? {}, grade));
    labels.push(kindLabel(e.kind, e.params ?? {}));
    if (e.params?.isAoE) isAoE = true;
  }
  return { effects, name: labels.filter(Boolean).join("·") || "效果", isAoE };
}

/** 功法效果 → EffectBundle。由多条 Entry 组合；任一为主动 kind 即为主动技能。 */
export function resolveGongfaEffect(entries: readonly EffectEntry[], grade: ItemGrade): EffectBundle {
  const list = entries.length > 0 ? entries : [{ kind: "dealDamage", params: {} }];
  const { effects, name, isAoE } = expandEntries(list, grade);
  const active = list.some(e => typeof e.kind === "string" && isActiveKind(e.kind));
  return {
    name,
    intro: "",
    effects,
    type: active ? "主动" : "被动",
    mpCost: active ? ACTIVE_MP_COST_BY_GRADE[grade] : 0,
    cooldown: active ? ACTIVE_COOLDOWN_BY_GRADE[grade] : 0,
    isAoE,
  };
}

function rollModifierValue(type: TreasureModifierType, grade: ItemGrade): number {
  const range = MODIFIER_VALUE_RANGES[type]?.[grade] ?? [1, 2];
  const val = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  const isReduction = type === "damageTaken" || type === "physDamageTaken" || type === "magDamageTaken";
  return isReduction ? -val : val;
}

/** 法宝效果 → EffectBundle。多条 Entry（应为被动 kind）；仙品/神品附带 conversion。 */
export function resolveTreasureEffect(entries: readonly EffectEntry[], grade: ItemGrade): EffectBundle {
  const effects: Effect[] = [];
  const labels: string[] = [];
  for (const e of entries) {
    if (!e || typeof e.kind !== "string") continue;
    if (e.kind === "applyModifier") {
      const mt = (e.params?.modifierType && (TREASURE_MODIFIER_TYPES as readonly string[]).includes(e.params.modifierType) ? e.params.modifierType : "damageDealt") as TreasureModifierType;
      const value = rollModifierValue(mt, grade);
      effects.push({ type: "applyModifier", modifierType: mt, value, duration: 99, maxStacks: 1 });
      labels.push(`${TREASURE_MODIFIER_NAMES[mt]}+${Math.abs(value)}%`);
    } else {
      effects.push(...expandEffectKind(e.kind, e.params ?? {}, grade));
      labels.push(kindLabel(e.kind, e.params ?? {}));
    }
  }
  if (effects.length === 0) {
    // 回退：增伤
    const value = rollModifierValue("damageDealt", grade);
    effects.push({ type: "applyModifier", modifierType: "damageDealt", value, duration: 99, maxStacks: 1 });
    labels.push(`增伤+${value}%`);
  }
  const conv = rollConversionEffect(grade);
  if (conv) effects.push(conv);
  return { name: labels.filter(Boolean).join(" ") || "法宝效果", intro: "", effects, type: "被动" };
}

/** 丹药/符箓/阵法效果 → EffectBundle */
export function resolveElixirEffect(entries: readonly EffectEntry[], grade: ItemGrade): EffectBundle {
  const list = entries.length > 0 ? entries : [{ kind: "healHp", params: {} }];
  const { effects, name } = expandEntries(list, grade);
  return { name, intro: "", effects };
}

/** 随机法宝 EffectBundle（天赋授予等用）。 */
const MODIFIER_WEIGHTS: Readonly<Record<TreasureModifierType, number>> = {
  damageDealt: 3, damageTaken: 3, hpRecover: 2, mpRecover: 2, speed: 2, critRate: 2, critDmg: 2, dodgeRate: 2,
  lifesteal: 1, defensePenetration: 1, physDamageDealt: 1, magDamageDealt: 1, physDamageTaken: 1, magDamageTaken: 1, physDefensePenetration: 1, magDefensePenetration: 1,
};
const GRADE_MODIFIER_COUNT: Record<ItemGrade, number> = { 下品: 1, 中品: 2, 上品: 3, 极品: 4, 仙品: 4, 神品: 4 };
const WEIGHTED_POOL: TreasureModifierType[] = (() => {
  const pool: TreasureModifierType[] = [];
  for (const [t, w] of Object.entries(MODIFIER_WEIGHTS) as [TreasureModifierType, number][]) for (let i = 0; i < w; i++) pool.push(t);
  return pool;
})();

export function rollTreasureEffect(grade: ItemGrade): EffectBundle {
  const count = GRADE_MODIFIER_COUNT[grade];
  const effects: Effect[] = [];
  const used = new Set<TreasureModifierType>();
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    let t: TreasureModifierType; let attempts = 0;
    do { t = WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)]; attempts++; } while (used.has(t) && attempts < 20);
    used.add(t);
    const value = rollModifierValue(t, grade);
    effects.push({ type: "applyModifier", modifierType: t, value, duration: 99, maxStacks: 1 });
    parts.push(`${TREASURE_MODIFIER_NAMES[t]}+${Math.abs(value)}%`);
  }
  const conv = rollConversionEffect(grade);
  if (conv) effects.push(conv);
  return { name: parts.join(" "), intro: "", effects, type: "被动" };
}

// ---------------------------------------------------------------------------
// 丹药消耗辅助
// ---------------------------------------------------------------------------

/** 木灵根契合：丹药获取时烘焙，提升 healHp/healMp 效果数值。原地修改。 */
export function applyLinggenElixirBoost(item: InventoryStackItem, linggen: readonly string[], realmMajor: string): void {
  if (!("itemType" in item) || item.itemType !== "丹药") return;
  const elixir = item as ElixirItemDefinition;
  if (!elixir.effect) return;
  if (!linggen.includes("木")) return;
  const bonus = getLinggenElementBonus(realmMajor, "木");
  if (bonus <= 0) return;
  let boosted = false;
  for (const e of elixir.effect.effects) {
    if ((e.type === "healHp" || e.type === "healMp") && typeof e.value === "number") {
      e.value = Math.round(e.value * (1 + bonus / 100));
      boosted = true;
    }
  }
  void boosted;
}

/** 读取丹药效果中 statBoost 的 statKey（供 consumeElixir）。 */
export function elixirStatBoostKey(item: ElixirItemDefinition): PrimaryStatKey | null {
  if (!item.effect) return null;
  const e = item.effect.effects.find(x => x.type === "statBoost");
  return e && e.type === "statBoost" ? e.statKey : null;
}
