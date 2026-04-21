/**
 * 物品领域模型：武器 / 法器 / 防具、攻击·辅助功法、丹药与突破丹药、材料、杂物。
 * 对齐 mortal_journey 中 worldbook（init_state_rules）、state_generate.ensureGeneratedItemStats、
 * normalizeBagItem 等口径。
 * 储物袋单格为 discriminated union（`InventoryStackItem`），避免丹药带 magnification、功法带 recover 等混用。
 */

import type { SpiritStoneInventoryStack } from "./spiritStone";
import type { ZhStatBonusMap } from "./zhPlayerStats";

// ---------------------------------------------------------------------------
// 共用枚举与基底
// ---------------------------------------------------------------------------

/** worldbook：品阶仅能为以下之一 */
export type ItemGrade = "下品" | "中品" | "上品" | "极品" | "仙品";

/** 佩戴类部位（主界面三槽为 武器 / 法器 / 防具） */
export type WearEquipType = "武器" | "法器" | "防具";

/**
 * 储物袋 / item_add 等 JSON 里常见的大类（突破丹药在运行时常规化为 type「丹药」并带 breakthrough效果）。
 */
export type ItemCategoryLabel =
  | WearEquipType
  | "攻击功法"
  | "辅助功法"
  | "丹药"
  | "突破丹药"
  | "材料"
  | "杂物";

/** 功法子类（与 player_base_runtime 推断「攻击」「辅助」一致） */
export type GongfaSubtype = "攻击" | "辅助";

/** 配置表或 AI 条目上的中文加成；允许表外键 */
export type ItemBonusMap = ZhStatBonusMap | Record<string, number>;

/** 倍率块（如 物攻 / 法攻 伤害倍率） */
export type ItemMagnificationMap = Record<string, number>;

/** 普通丹药：按品阶生成的恢复量（无恢复的一侧填 0） */
export interface PillRecoverEffect {
  hp: number;
  mp: number;
}

/** 突破丹药：大境界跃迁与成功率加成（chanceBonus 为比例，如 0.12 表示 +12%） */
export interface BreakthroughEffectEntry {
  from: string;
  to: string;
  chanceBonus: number;
}

/** 普通丹药效果 */
export interface ItemElixirEffects {
  recover: PillRecoverEffect;
}

/** 突破丹药专用效果 */
export interface BreakthroughElixirEffects {
  breakthrough: BreakthroughEffectEntry[];
}

/**
 * 各类物品的公共头（name 必填；`desc` 与 mortal_journey 储物袋格、describe 表一致）。
 */
export interface ItemDefinitionBase {
  name: string;
  desc: string;
  grade: ItemGrade;
  value: number;
  count: number;
}

// ---------------------------------------------------------------------------
// 佩戴装备（武器 / 法器 / 防具）
// ---------------------------------------------------------------------------

export interface WeaponItemDefinition extends ItemDefinitionBase {
  itemType: "装备";
  equipType: "武器";
  bonus: ItemBonusMap;
  magnification: ItemMagnificationMap;
}

export interface FaqiItemDefinition extends ItemDefinitionBase {
  itemType: "装备";
  equipType: "法器";
  bonus: ItemBonusMap;
}

export interface ArmorItemDefinition extends ItemDefinitionBase {
  itemType: "装备";
  equipType: "防具";
  bonus: ItemBonusMap;
}

export type WearableItemDefinition =
  | WeaponItemDefinition
  | FaqiItemDefinition
  | ArmorItemDefinition;

// ---------------------------------------------------------------------------
// 功法（攻击 / 辅助）
// ---------------------------------------------------------------------------

export interface AttackGongfaDefinition extends ItemDefinitionBase {
  itemType: "功法";
  subtype: "攻击";
  manacost: number;
  bonus: ItemBonusMap;
  magnification: ItemMagnificationMap;
}

export interface AssistGongfaDefinition extends ItemDefinitionBase {
  itemType: "功法";
  subtype: "辅助";
  bonus: ItemBonusMap;
}

export type GongfaItemDefinition = AttackGongfaDefinition | AssistGongfaDefinition;

// ---------------------------------------------------------------------------
// 丹药（含突破丹药）
// ---------------------------------------------------------------------------

export interface ElixirItemDefinition extends ItemDefinitionBase {
  itemType: "丹药";
  effects: ItemElixirEffects;
}

/**
 * AI 原始类型「突破丹药」；入库后常与 ElixirItemDefinition 一样标 type「丹药」并带 effects.breakthrough。
 */
export interface BreakthroughElixirDefinition extends ItemDefinitionBase {
  itemType: "突破丹药";
  /** 中品→练气筑基、上品→筑基结丹、极品→结丹元婴、仙品→元婴化神 */
  grade: ItemGrade;
  effects: BreakthroughElixirEffects;
}

export type PillItemDefinition = ElixirItemDefinition | BreakthroughElixirDefinition;

// ---------------------------------------------------------------------------
// 材料与杂物
// ---------------------------------------------------------------------------

export interface MaterialItemDefinition extends ItemDefinitionBase {
  itemType: "材料";
}

export interface MiscItemDefinition extends ItemDefinitionBase {
  itemType: "杂物";
}

// ---------------------------------------------------------------------------
// 总联合（按大类区分）
// ---------------------------------------------------------------------------

export type CategorizedItemDefinition =
  | WearableItemDefinition
  | GongfaItemDefinition
  | PillItemDefinition
  | MaterialItemDefinition
  | MiscItemDefinition;

// ---------------------------------------------------------------------------
// 储物袋单格堆叠
// ---------------------------------------------------------------------------

/** 灵石堆叠类型见 `spiritStone.ts`（`createSpiritStoneInventoryStack` 等同模块）。 */
export type { SpiritStoneInventoryStack };

/**
 * 储物袋非灵石格与上方 `CategorizedItemDefinition` 同形，避免装备/功法/丹药各写两套类型。
 * 下列别名仅语义提示，便于对照旧脚本里的「bag」命名。
 */
export type WeaponBagStack = WeaponItemDefinition;
export type FaqiBagStack = FaqiItemDefinition;
export type ArmorBagStack = ArmorItemDefinition;
export type AttackGongfaBagStack = AttackGongfaDefinition;
export type AssistGongfaBagStack = AssistGongfaDefinition;
export type ElixirBagStack = ElixirItemDefinition;
export type BreakthroughElixirBagStack = BreakthroughElixirDefinition;
export type MaterialBagStack = MaterialItemDefinition;
export type MiscBagStack = MiscItemDefinition;

/**
 * 储物袋一格：灵石栈 + 与配置表一致的物品定义联合。
 * 判别：灵石用五档灵石名且 `type` 为「灵石」而无 `itemType`；其余用 `itemType` / `equipType` / `subtype`。
 */
export type InventoryStackItem =
  | SpiritStoneInventoryStack
  | CategorizedItemDefinition;
