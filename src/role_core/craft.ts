/**
 * @fileoverview 技艺系统公共地基：材料分类、技艺属性、品阶跃迁与熟练度。
 *
 * 四门技艺（医术/毒术/烹饪/锻造）共用同一套规则：
 *   1. 由投入材料按各自品阶加权随机出「基础品阶」（见 `alchemy.ts` 的 rollAlchemyGrade）。
 *   2. 按该技艺当前熟练度掷「品阶跃迁」，命中则基础品阶 +1 档（神品封顶）。
 *   3. 产出后按最终品阶回馈熟练度。
 *
 * 技艺属性值本身即熟练度 X（无独立等级概念），随制作产物累积增长。
 */

import type { ItemGrade } from "./types/itemInfo";
import { GRADE_INDEX } from "./types/gameConstants";
import { ALCHEMY_GRADES } from "./alchemy";

// ---------------------------------------------------------------------------
// 材料分类
// ---------------------------------------------------------------------------

/** 材料分类：决定该材料可用于哪门技艺。 */
export type MaterialCategory = "药材" | "毒物" | "食材" | "器材";

export const MATERIAL_CATEGORIES: readonly MaterialCategory[] = [
  "药材", "毒物", "食材", "器材",
];

/** 校验并归一化材料分类；非法值回退「药材」。 */
export function parseMaterialCategory(raw: unknown): MaterialCategory {
  if (typeof raw === "string") {
    const t = raw.trim();
    if ((MATERIAL_CATEGORIES as readonly string[]).includes(t)) return t as MaterialCategory;
  }
  return "药材";
}

// ---------------------------------------------------------------------------
// 技艺属性
// ---------------------------------------------------------------------------

/** 四门技艺。 */
export type CraftSkillKey = "medicine" | "poison" | "cooking" | "forging";

export const CRAFT_SKILL_KEYS = ["medicine", "poison", "cooking", "forging"] as const;

export const CRAFT_SKILL_TO_ZH: Readonly<Record<CraftSkillKey, string>> = {
  medicine: "医术",
  poison: "毒术",
  cooking: "烹饪",
  forging: "锻造",
};

/** 各技艺消耗的材料分类。 */
export const CRAFT_SKILL_MATERIAL: Readonly<Record<CraftSkillKey, MaterialCategory>> = {
  medicine: "药材",
  poison: "毒物",
  cooking: "食材",
  forging: "器材",
};

export const CRAFT_SKILL_DESC: Readonly<Record<CraftSkillKey, string>> = {
  medicine: "炼丹造诣。以药材炼制丹药，熟练度越高越易炼出高品阶丹药。",
  poison: "用毒造诣。以毒物制毒淬毒，熟练度越高越易制出高品阶毒物。",
  cooking: "庖厨造诣。以食材烹制餐食，熟练度越高越易做出高品阶膳食。",
  forging: "器道造诣。以器材锻造精炼，熟练度越高越易锻出高品阶器物。",
};

/** 技艺熟练度表：技艺 → 累计熟练度。 */
export type CraftSkillState = Record<CraftSkillKey, number>;

export function createDefaultCraftSkills(): CraftSkillState {
  return { medicine: 0, poison: 0, cooking: 0, forging: 0 };
}

/** 归一化技艺熟练度（用于反序列化）：缺失/非法项补 0，负值截为 0。 */
export function normalizeCraftSkills(raw: unknown): CraftSkillState {
  const out = createDefaultCraftSkills();
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const key of CRAFT_SKILL_KEYS) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = Math.floor(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 品阶跃迁与熟练度回馈
// ---------------------------------------------------------------------------

/**
 * 品阶跃迁概率（百分比）：`Y = 100X / (X + 100)`。
 *
 * X 为该技艺当前熟练度。X=0 → 0%；X=100 → 50%；X=300 → 75%；趋近但不达 100%。
 */
export function craftUpgradeChance(proficiency: number): number {
  const x = Number.isFinite(proficiency) && proficiency > 0 ? proficiency : 0;
  return (100 * x) / (x + 100);
}

/**
 * 按熟练度对基础品阶掷跃迁：命中则升一档，神品封顶。
 *
 * @param baseGrade 由材料加权随机得到的基础品阶。
 * @param proficiency 该技艺当前熟练度。
 * @return 最终品阶。
 */
export function applyCraftGradeUpgrade(baseGrade: ItemGrade, proficiency: number): ItemGrade {
  const idx = GRADE_INDEX[baseGrade] ?? 0;
  if (idx >= ALCHEMY_GRADES.length - 1) return baseGrade;
  if (Math.random() * 100 < craftUpgradeChance(proficiency)) {
    return ALCHEMY_GRADES[idx + 1];
  }
  return baseGrade;
}

/** 产出各品阶回馈的熟练度：下品→神品依次 1/2/4/8/16/32。 */
export const CRAFT_PROFICIENCY_GAIN: readonly number[] = [1, 2, 4, 8, 16, 32];

/** 查某品阶产物回馈的熟练度。 */
export function craftProficiencyGain(grade: ItemGrade): number {
  const idx = GRADE_INDEX[grade] ?? 0;
  return CRAFT_PROFICIENCY_GAIN[Math.min(idx, CRAFT_PROFICIENCY_GAIN.length - 1)];
}
