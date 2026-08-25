/**
 * 物品领域模型：共享类型 + 材料/杂物 + 储物袋联合类型。
 * 法宝/功法/丹药的完整定义分别在 treasure.ts / gongfa.ts / elixir.ts。
 */

import type { SpiritStoneInventoryStack } from "./spiritStone";
import type { ZhStatBonusMap } from "./playInfo";
import type { TreasureItemDefinition } from "./treasure";
import type { GongfaItemDefinition } from "./gongfa";
import type { ElixirItemDefinition, ElixirEffectType, ElixirEffects } from "./elixir";
import type { MaterialCategory } from "../craft";
import type { FoodItemDefinition } from "../cooking";
import type { PoisonItemDefinition } from "../poison";

// re-export per-type item definitions（保持旧 import 路径兼容）
export type { TreasureItemDefinition } from "./treasure";
export type { TreasureSpecialEffect, TreasureConversionMode, TreasureConversion, TreasureConversionEffect } from "./treasure";
export type { GongfaItemDefinition } from "./gongfa";
export type { GongfaSpecialEffect, GongfaSystem, GongfaRole } from "./gongfa";
export type { ElixirItemDefinition, ElixirEffectType, ElixirEffects } from "./elixir";
export type { FoodItemDefinition } from "../cooking";
export type { PoisonItemDefinition } from "../poison";

// ---------------------------------------------------------------------------
// 共用枚举与基底
// ---------------------------------------------------------------------------

/** worldbook：品阶仅能为以下之一 */
export type ItemGrade = "下品" | "中品" | "上品" | "极品" | "仙品" | "神品";
/**
 * 材料分类的别名。真正的定义在 `../craft` 的 {@link MaterialCategory}——
 * 这里只做转发，避免同一套分类在两处各写一份、日后改一处忘另一处。
 */
export type ItemCategory = MaterialCategory;
/** 配置表或 AI 条目上的中文加成；允许表外键 */
export type ItemBonusMap = ZhStatBonusMap | Record<string, number>;

// ---------------------------------------------------------------------------
// 材料与杂物
// ---------------------------------------------------------------------------

export interface MaterialItemDefinition {
  itemType: "材料";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  /** 材料分类：决定可用于哪门技艺（药材/毒物/食材/器材）。 */
  category: MaterialCategory;
}

export interface MiscItemDefinition {
  itemType: "杂物";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
}

// ---------------------------------------------------------------------------
// 总联合（按大类区分）
// ---------------------------------------------------------------------------

export type CategorizedItemDefinition =
  | TreasureItemDefinition
  | GongfaItemDefinition
  | ElixirItemDefinition
  | FoodItemDefinition
  | PoisonItemDefinition
  | MaterialItemDefinition
  | MiscItemDefinition;

// ---------------------------------------------------------------------------
// 储物袋单格堆叠
// ---------------------------------------------------------------------------

export type { SpiritStoneInventoryStack };

export type TreasureBagStack = TreasureItemDefinition;
export type GongfaBagStack = GongfaItemDefinition;
export type ElixirBagStack = ElixirItemDefinition;
export type FoodBagStack = FoodItemDefinition;
export type PoisonBagStack = PoisonItemDefinition;
export type MaterialBagStack = MaterialItemDefinition;
export type MiscBagStack = MiscItemDefinition;

export type InventoryStackItem =
  | SpiritStoneInventoryStack
  | CategorizedItemDefinition;

// ---------------------------------------------------------------------------
// 品阶掉落概率表
// ---------------------------------------------------------------------------

export interface GradeDropRate {
  下品: number;
  中品: number;
  上品: number;
  极品: number;
  仙品: number;
  神品: number;
}

export { GRADE_DROP_TABLE } from "./gameConstants";
