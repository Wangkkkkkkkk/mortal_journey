/**
 * @fileoverview 精炼系统：在已有法宝上增删改词条（纯逻辑，不触碰库存）。
 *
 * 三种操作：
 *   - 提升：全部现有词条数值上调，上限为该词条品阶区间上限的 150%。
 *   - 增添：随机追加一条新词条，总数上限为「品阶初始词条数 + 1」。
 *   - 剔除：移除指定词条（必定成功，且只耗 1 份器材）。
 *
 * 失败机制：提升/增添按**现有词条数**决定失败率（词条越多越难精炼），
 * 失败时材料照常消耗但法宝不变。剔除不设失败率——它本就是降级操作。
 *
 * 数值全部复用 `treasure.ts` 的既有品阶表，精炼不引入独立数值体系。
 */

import type { ItemGrade } from "./types/itemInfo";
import type {
  TreasureItemDefinition,
  TreasureModifier,
  TreasureModifierType,
  TreasureSpecialEffect,
} from "./types/treasure";
import { craftUpgradeChance } from "./craft";
import {
  GRADE_MODIFIER_COUNT,
  MODIFIER_VALUE_RANGES,
  WEIGHTED_POOL,
  formatTreasureFunctionName,
} from "./types/treasure";

/** 精炼可达的词条数上限相对品阶初始数量的增量。 */
const REFINE_EXTRA_MODIFIER_SLOTS = 1;

/** 每次「提升」的幅度：该词条品阶区间上限的比例（至少 +1）。 */
const REFINE_BOOST_RATIO = 0.1;

/** 词条数值上限：该词条品阶区间上限的比例。 */
const REFINE_VALUE_CAP_RATIO = 1.5;

/** 每条现有词条带来的失败率（百分点）。 */
const REFINE_FAILURE_PER_MODIFIER = 15;

/** 失败率上限（百分点）。 */
const REFINE_FAILURE_MAX = 75;

/** 失败率下限（百分点）：熟练度再高也保留一分风险。 */
const REFINE_FAILURE_MIN = 5;

/** 该品阶法宝经精炼后可持有的词条数上限。 */
export function refineModifierCap(grade: ItemGrade): number {
  return (GRADE_MODIFIER_COUNT[grade] ?? 1) + REFINE_EXTRA_MODIFIER_SLOTS;
}

/**
 * 精炼失败概率（百分比）。
 *
 * 基础失败率与现有词条数线性相关（1 条 15%、2 条 30%……），
 * 再减去【锻造】熟练度带来的百分点——沿用与品阶跃迁相同的收益曲线
 * {@link craftUpgradeChance}（熟练度 100 减 50 点，300 减 75 点）。
 * 结果夹在 [{@link REFINE_FAILURE_MIN}, {@link REFINE_FAILURE_MAX}] 之间，
 * 熟练度再高也保留一分风险。
 *
 * @param modifierCount 目标法宝现有词条数。
 * @param forgingProficiency 【锻造】熟练度；缺省 0（无减免）。
 */
export function refineFailureChance(modifierCount: number, forgingProficiency = 0): number {
  const n = Number.isFinite(modifierCount) && modifierCount > 0 ? modifierCount : 0;
  const base = Math.min(REFINE_FAILURE_MAX, n * REFINE_FAILURE_PER_MODIFIER);
  const reduced = base - craftUpgradeChance(forgingProficiency);
  return Math.max(REFINE_FAILURE_MIN, Math.round(reduced));
}

/** 掷一次精炼成败。 */
export function rollRefineSuccess(modifierCount: number, forgingProficiency = 0): boolean {
  return Math.random() * 100 >= refineFailureChance(modifierCount, forgingProficiency);
}

/** 单条词条在该品阶下可被精炼到的数值上限。 */
export function modifierValueCap(type: TreasureModifierType, grade: ItemGrade): number {
  const range = MODIFIER_VALUE_RANGES[type]?.[grade];
  if (!range) return 0;
  return Math.round(range[1] * REFINE_VALUE_CAP_RATIO);
}

/** 单条词条每次提升的增量（至少 1）。 */
export function modifierBoostStep(type: TreasureModifierType, grade: ItemGrade): number {
  const range = MODIFIER_VALUE_RANGES[type]?.[grade];
  if (!range) return 1;
  return Math.max(1, Math.round(range[1] * REFINE_BOOST_RATIO));
}

/** 法宝的全部词条是否都已达数值上限。 */
export function isFullyBoosted(tr: TreasureItemDefinition): boolean {
  const mods = tr.function?.modifiers ?? [];
  if (mods.length === 0) return true;
  return mods.every((m) => m.value >= modifierValueCap(m.modifierType, tr.grade));
}

/**
 * 提升：全部现有词条各上调一个增量，已达上限的保持不变。
 *
 * @return 新的词条组；无词条时返回 null。
 */
export function boostModifiers(tr: TreasureItemDefinition): TreasureSpecialEffect | null {
  const mods = tr.function?.modifiers ?? [];
  if (mods.length === 0) return null;
  const next: TreasureModifier[] = mods.map((m) => {
    const cap = modifierValueCap(m.modifierType, tr.grade);
    const step = modifierBoostStep(m.modifierType, tr.grade);
    return { modifierType: m.modifierType, value: Math.min(cap, m.value + step) };
  });
  return { name: formatTreasureFunctionName(next), modifiers: next };
}

/**
 * 增添：随机追加一条当前未持有的词条，初值取该品阶区间内随机。
 *
 * @return 新的词条组；已达数量上限或无可选类型时返回 null。
 */
export function addRandomModifier(tr: TreasureItemDefinition): TreasureSpecialEffect | null {
  const mods = tr.function?.modifiers ?? [];
  if (mods.length >= refineModifierCap(tr.grade)) return null;

  const used = new Set(mods.map((m) => m.modifierType));
  const candidates = WEIGHTED_POOL.filter((t) => !used.has(t));
  if (candidates.length === 0) return null;

  const type = candidates[Math.floor(Math.random() * candidates.length)];
  const [lo, hi] = MODIFIER_VALUE_RANGES[type][tr.grade];
  const value = lo + Math.floor(Math.random() * (hi - lo + 1));

  const next = [...mods, { modifierType: type, value }];
  return { name: formatTreasureFunctionName(next), modifiers: next };
}

/**
 * 剔除：移除指定下标的词条。
 *
 * @return 新的词条组；下标越界时返回 null。
 */
export function removeModifierAt(
  tr: TreasureItemDefinition,
  index: number,
): TreasureSpecialEffect | null {
  const mods = tr.function?.modifiers ?? [];
  if (index < 0 || index >= mods.length) return null;
  const next = mods.filter((_, i) => i !== index);
  return { name: formatTreasureFunctionName(next), modifiers: next };
}
