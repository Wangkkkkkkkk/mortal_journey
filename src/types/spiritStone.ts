/**
 * 灵石：描述表、表键、储物袋堆叠形态与构造方法（与 mortal_journey `MjDescribeSpiritStones` 对齐）。
 * `value` 为灵石等价刻度，与装备、功法、杂物等 describe.value 同一数轴，用于比价，非「颗数」。
 */

// ---------------------------------------------------------------------------
// 名称 · 品阶 · 描述表
// ---------------------------------------------------------------------------

/** 描述表中的灵石名称（五档） */
export type SpiritStoneName =
  | "下品灵石"
  | "中品灵石"
  | "上品灵石"
  | "极品灵石"
  | "仙品灵石";

/** 灵石条目的品阶文案（与名称档位一致） */
export type SpiritStoneGrade = "下品" | "中品" | "上品" | "极品" | "仙品";

/** 单条灵石元数据 */
export interface SpiritStoneDefinition {
  desc: string;
  grade: SpiritStoneGrade;
  /** 等价刻度（整数）；与同项目其它物品 value 同刻度 */
  value: number;
}

/** 完整灵石表：名称 → 定义（键集与脚本对象一致） */
export type SpiritStoneCatalog = Record<SpiritStoneName, SpiritStoneDefinition>;

/**
 * 与 `mortal_journey/js/data/spirit_stone.js` 中 `MjDescribeSpiritStones` 数据一致（简介 / 品阶 /价值）。
 */
export const mjDescribeSpiritStones = {
  下品灵石: {
    desc: "修仙界基础货币，灵气较少，用于日常交易。",
    grade: "下品",
    value: 10,
  },
  中品灵石: {
    desc: "灵气精纯，催动法器、布阵的常见消耗品。",
    grade: "中品",
    value: 100,
  },
  上品灵石: {
    desc: "颇为稀有，用于大额交易或炼制高阶法宝。",
    grade: "上品",
    value: 1000,
  },
  极品灵石: {
    desc: "极为稀有，是提升修为的关键之物。",
    grade: "极品",
    value: 10000,
  },
  仙品灵石: {
    desc: "人界传说，灵气精纯至极，现世必引争夺。",
    grade: "仙品",
    value: 100000,
  },
} as const satisfies SpiritStoneCatalog;

// ---------------------------------------------------------------------------
// 表键（由低到高，与 `SpiritStoneGrade` 顺序一致）
// ---------------------------------------------------------------------------

export const SPIRIT_STONE_TABLE_KEY_LOW: SpiritStoneName = "下品灵石";
export const SPIRIT_STONE_TABLE_KEY_MEDIUM: SpiritStoneName = "中品灵石";
export const SPIRIT_STONE_TABLE_KEY_HIGH: SpiritStoneName = "上品灵石";
export const SPIRIT_STONE_TABLE_KEY_TOP: SpiritStoneName = "极品灵石";
export const SPIRIT_STONE_TABLE_KEY_IMMORTAL: SpiritStoneName = "仙品灵石";

/** 五档表键顺序数组（低 → 高），便于循环或下拉配置 */
export const SPIRIT_STONE_TABLE_KEYS_ORDERED: readonly SpiritStoneName[] = [
  SPIRIT_STONE_TABLE_KEY_LOW,
  SPIRIT_STONE_TABLE_KEY_MEDIUM,
  SPIRIT_STONE_TABLE_KEY_HIGH,
  SPIRIT_STONE_TABLE_KEY_TOP,
  SPIRIT_STONE_TABLE_KEY_IMMORTAL,
] as const;

// ---------------------------------------------------------------------------
// 储物袋堆叠（无 `itemType`，用 `type` 与装备/材料等区分）
// ---------------------------------------------------------------------------

/** 储物袋格子上灵石与 `CategorizedItemDefinition` 的判别字面量 */
export const SPIRIT_STONE_INVENTORY_KIND = "灵石" as const;

/** 五档灵石在储物袋中的堆叠形态；`name` 必为 `mjDescribeSpiritStones` 的键 */
export interface SpiritStoneInventoryStack {
  name: SpiritStoneName;
  count: number;
  desc: string;
  grade: SpiritStoneGrade;
  value: number;
  type: typeof SPIRIT_STONE_INVENTORY_KIND;
}

/**
 * 由描述表构造单格灵石堆叠。
 *
 * @param name - 五档灵石名（表键）
 * @param count - 颗数
 */
export function createSpiritStoneInventoryStack(name: SpiritStoneName, count: number): SpiritStoneInventoryStack {
  return {
    name,
    count,
    ...mjDescribeSpiritStones[name],
    type: SPIRIT_STONE_INVENTORY_KIND,
  };
}
