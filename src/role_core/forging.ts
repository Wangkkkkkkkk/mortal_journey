/**
 * @fileoverview 锻造系统：纯逻辑（无副作用、不触碰库存）。
 *
 * 规则：
 *   - 投入 3 份「器材」，每份为其品阶投 1/3 权重，加权随机出基础品阶（复用炼丹的品阶掷骰）。
 *   - 基础品阶再按【锻造】熟练度掷品阶跃迁（见 `craft.ts`），命中则升一档。
 *   - 器物类型从 {@link FORGING_NAME_TABLE} 均匀随机；类型只决定名称与描述。
 *   - 法宝词条与转换型特效由品阶决定（复用 `treasure.ts` 的既有生成器），与器物类型无关。
 *   - 100% 出器，无失败。
 */

import type { ItemGrade, TreasureItemDefinition } from "./types/itemInfo";
import { rollTreasureFunction, rollTreasureSpecialEffect } from "./types/treasure";
import { rollAlchemyGrade } from "./alchemy";
import { applyCraftGradeUpgrade } from "./craft";
import { FORGING_NAME_TABLE } from "./craftTables";

export interface ForgingMaterialInput {
  grade: ItemGrade;
}

/** 可锻造的器物类型（取自命名表的键）。 */
export const FORGING_TYPES: readonly string[] = Object.keys(FORGING_NAME_TABLE);

/** 均匀随机一个器物类型。 */
export function rollForgingType(): string {
  if (FORGING_TYPES.length === 0) return "";
  return FORGING_TYPES[Math.floor(Math.random() * FORGING_TYPES.length)];
}

/**
 * 锻造核心：根据 3 份器材产出法宝定义（不写入库存）。
 *
 * @param materials 器材品阶数组（调用方应保证长度为 3）。
 * @param proficiency 【锻造】熟练度，用于掷品阶跃迁；缺省 0（不跃迁）。
 * @returns 完整的法宝物品定义（count = 1）；命名表为空时返回 null。
 */
export function craftTreasureDef(
  materials: readonly ForgingMaterialInput[],
  proficiency = 0,
): TreasureItemDefinition | null {
  const type = rollForgingType();
  if (!type) return null;

  const grade = applyCraftGradeUpgrade(rollAlchemyGrade(materials.map((m) => m.grade)), proficiency);
  const entry = FORGING_NAME_TABLE[type][grade];

  return {
    itemType: "法宝",
    name: entry.name,
    desc: entry.desc,
    grade,
    count: 1,
    function: rollTreasureFunction(grade),
    specialEffect: rollTreasureSpecialEffect(grade),
  };
}
