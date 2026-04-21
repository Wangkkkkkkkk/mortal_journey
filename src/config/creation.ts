/**
 * @fileoverview 命运抉择所需的最小开局静态数据（出身、性别、灵根随机、词条稀有度权重），与 `mortal_journey/js/data/mjCreationConfig.js` 等对齐。
 */

import type { TraitRarity } from "./traits";

export type CreationGender = "男性" | "女性";

/** 出身定义：`location` 为地点名，`desc` 为简介（卡片与开局摘要）。 */
export interface BirthDefinition {
  location: string;
  desc: string;
}

export const CREATION_GENDERS: readonly CreationGender[] = ["男性", "女性"];

export const CREATION_BIRTHS: Readonly<Record<string, BirthDefinition>> = {
  凡人: {
    location: "凡人家庭",
    desc: "出身于凡人家庭，多务农为生，生活清苦，希望改变命运。",
  },
  黄枫谷弟子: {
    location: "黄枫谷外门",
    desc: "出身于越国七大宗门之一的黄枫谷外门，以剑修传承闻名，门规严谨。",
  },
};

export const LINGGEN_ELEMENT_POOL: readonly string[] = ["金", "木", "水", "火", "土"];

/** 词条随机时「先抽稀有度」所用的权重行。 */
export interface TraitRarityWeightRow {
  rarity: TraitRarity;
  weight: number;
}

/** 命运抉择随机词条：各稀有度权重（与主工程分布意图一致）。 */
export const TRAIT_RARITY_WEIGHTS: readonly TraitRarityWeightRow[] = [
  { rarity: "平庸", weight: 50 },
  { rarity: "普通", weight: 25 },
  { rarity: "稀有", weight: 15 },
  { rarity: "史诗", weight: 9 },
  { rarity: "传说", weight: 0.9 },
  { rarity: "神迹", weight: 0.1 },
];

/**
 * 与主工程 `rollRandomLinggenName` 相同分布：天灵根 / 真灵根 / 伪灵根 + 元素组合。
 */
export function rollRandomLinggenName(): string {
  const pool = [...LINGGEN_ELEMENT_POOL];
  const r = Math.random() * 100;
  let count: number;
  let type: string;
  if (r < 20) {
    count = 1;
    type = "天灵根";
  } else if (r < 40) {
    count = 2;
    type = "真灵根";
  } else if (r < 60) {
    count = 3;
    type = "真灵根";
  } else {
    count = 4;
    type = "伪灵根";
  }
  const bag = pool.slice();
  const elements: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * bag.length);
    elements.push(bag.splice(idx, 1)[0]!);
  }
  return type + " " + elements.join(", ");
}
