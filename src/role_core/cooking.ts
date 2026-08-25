/**
 * @fileoverview 烹饪系统：纯逻辑（无副作用、不触碰库存）。
 *
 * 规则：
 *   - 投入 3 份「食材」，加权随机出基础品阶，再按【烹饪】熟练度掷品阶跃迁。
 *   - 膳食类型按 {@link COOKING_TYPE_WEIGHTS} 加权随机。
 *   - 除「点心」外，每种膳食都是**攻防互换**：一项主属性提升，对应的另一项下降。
 *     「点心」纯增益无代价，故以更低的出现权重与更低的增益幅度平衡。
 *   - 增益为百分比、限时（见 `timedBuff.ts`），食用后按品阶持续若干天。
 *   - 100% 出餐，无失败。
 */

import type { ItemGrade } from "./types/itemInfo";
import type { PrimaryStatKey } from "./types/playInfo";
import { GRADE_INDEX } from "./types/gameConstants";
import { rollAlchemyGrade } from "./alchemy";
import { applyCraftGradeUpgrade } from "./craft";
import { COOKING_NAME_TABLE } from "./craftTables";

/** 餐食物品定义。食用后获得限时增益，不进入战斗消耗品。 */
export interface FoodItemDefinition {
  itemType: "餐食";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  /** 膳食类型（茶/酒/素菜/荤菜/点心）。 */
  foodType: string;
  /** 主属性百分比增减：正为增益，负为代价。 */
  statPercents: Partial<Record<PrimaryStatKey, number>>;
  /** 食用后增益持续天数。 */
  durationDays: number;
}

// ---------------------------------------------------------------------------
// 膳食类型 → 增益/代价属性
// ---------------------------------------------------------------------------

/**
 * 每种膳食提升与削弱的主属性。
 *
 * 战斗属性到主属性的映射沿用 `battleInit`：
 * 物攻=劲力(strength)，物防=护体(guard)，法攻=神识(perception)，
 * 法防=灵御(resistance)，速度=身法(agility)。
 */
interface CookingTypeSpec {
  /** 受增益的主属性。 */
  buff: PrimaryStatKey;
  /** 受代价的主属性；`null` 表示纯增益无代价。 */
  penalty: PrimaryStatKey | null;
}

export const COOKING_TYPE_SPECS: Readonly<Record<string, CookingTypeSpec>> = {
  "茶":   { buff: "resistance", penalty: "perception" },  // 法防↑ 法攻↓
  "酒":   { buff: "perception", penalty: "resistance" },  // 法攻↑ 法防↓
  "素菜": { buff: "guard",      penalty: "strength" },    // 物防↑ 物攻↓
  "荤菜": { buff: "strength",   penalty: "guard" },       // 物攻↑ 物防↓
  "点心": { buff: "agility",    penalty: null },          // 身法↑ 无代价
};

/**
 * 膳食类型随机权重。
 *
 * 「点心」纯增益无代价，故权重明显低于其余四类（约为其一半），
 * 与其较低的增益幅度共同构成平衡手段。
 */
export const COOKING_TYPE_WEIGHTS: Readonly<Record<string, number>> = {
  "茶": 22,
  "酒": 22,
  "素菜": 22,
  "荤菜": 22,
  "点心": 12,
};

// ---------------------------------------------------------------------------
// 品阶数值表（下品 → 神品）
// ---------------------------------------------------------------------------

/** 标准增益幅度（%）。 */
const COOKING_BUFF_PERCENT: readonly number[] = [8, 12, 18, 25, 35, 50];

/** 代价幅度（%）：取增益的一半（向上取整）。 */
const COOKING_PENALTY_PERCENT: readonly number[] = [4, 6, 9, 13, 18, 25];

/** 无代价膳食（点心）的增益幅度（%）：约为标准的六成。 */
const COOKING_NO_PENALTY_BUFF_PERCENT: readonly number[] = [5, 7, 11, 15, 21, 30];

/** 增益持续天数。 */
const COOKING_DURATION_DAYS: readonly number[] = [3, 5, 7, 10, 15, 30];

function atGrade(table: readonly number[], grade: ItemGrade): number {
  const idx = GRADE_INDEX[grade] ?? 0;
  return table[Math.min(idx, table.length - 1)];
}

/** 可烹饪的膳食类型（取自命名表的键）。 */
export const COOKING_TYPES: readonly string[] = Object.keys(COOKING_NAME_TABLE);

/** 按权重随机一个膳食类型。 */
export function rollCookingType(): string {
  const entries = COOKING_TYPES.map((t) => [t, COOKING_TYPE_WEIGHTS[t] ?? 0] as const)
    .filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return COOKING_TYPES[0] ?? "";
  let roll = Math.random() * total;
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name;
  }
  return entries[entries.length - 1][0];
}

/** 组装某类型某品阶的主属性百分比增减。 */
export function buildCookingStatPercents(
  foodType: string,
  grade: ItemGrade,
): Partial<Record<PrimaryStatKey, number>> {
  const spec = COOKING_TYPE_SPECS[foodType];
  if (!spec) return {};
  if (spec.penalty === null) {
    return { [spec.buff]: atGrade(COOKING_NO_PENALTY_BUFF_PERCENT, grade) };
  }
  return {
    [spec.buff]: atGrade(COOKING_BUFF_PERCENT, grade),
    [spec.penalty]: -atGrade(COOKING_PENALTY_PERCENT, grade),
  };
}

export interface CookingMaterialInput {
  grade: ItemGrade;
}

/**
 * 烹饪核心：根据 3 份食材产出餐食定义（不写入库存）。
 *
 * @param materials 食材品阶数组（调用方应保证长度为 3）。
 * @param proficiency 【烹饪】熟练度，用于掷品阶跃迁；缺省 0（不跃迁）。
 * @returns 完整的餐食物品定义（count = 1）；命名表为空时返回 null。
 */
export function craftFoodDef(
  materials: readonly CookingMaterialInput[],
  proficiency = 0,
): FoodItemDefinition | null {
  const foodType = rollCookingType();
  if (!foodType) return null;

  const grade = applyCraftGradeUpgrade(rollAlchemyGrade(materials.map((m) => m.grade)), proficiency);
  const entry = COOKING_NAME_TABLE[foodType][grade];

  return {
    itemType: "餐食",
    name: entry.name,
    desc: entry.desc,
    grade,
    count: 1,
    foodType,
    statPercents: buildCookingStatPercents(foodType, grade),
    durationDays: atGrade(COOKING_DURATION_DAYS, grade),
  };
}
