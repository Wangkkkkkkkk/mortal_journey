/**
 * @fileoverview 炼丹系统：纯逻辑（无副作用、不触碰库存）。
 *
 * 规则：
 *   - 投入 3 份「材料」，每份材料为其品阶投 1/3 权重，加权随机出丹药品阶。
 *     例：3 份下品 → 100% 下品；2 份下品 + 1 份中品 → 约 66.7% 下品 / 33.3% 中品。
 *   - 丹药效果类型按 {@link ELIXIR_EFFECT_WEIGHTS} 随机（恢复类高权重）。
 *   - 效果数值由 {@link ELIXIR_GRADE_EFFECT_TABLE} 按品阶查表。
 *   - 丹药名称/简介查 {@link ELIXIR_NAME_TABLE}（72 条独立命名）。
 *   - 100% 出丹，无失败。
 */

import type { ItemGrade } from "./types/items";
import type { ElixirItemDefinition } from "./types/items";
import { resolveElixirEffect } from "./types/items";
import type { EffectParams } from "./types/effects";

/** 丹药效果类型中文 → {kind, params}（供炼丹随机选取后映射到统一效果池）。 */
const ELIXIR_TYPE_TO_KIND: Record<string, { kind: string; params: EffectParams }> = {
  "恢复血量": { kind: "healHp", params: {} },
  "恢复法力": { kind: "healMp", params: {} },
  "提升修为": { kind: "xiuweiBoost", params: {} },
  "提升寿元": { kind: "shouyuanBoost", params: {} },
  "提升体魄": { kind: "statBoost", params: { statKey: "physique" } },
  "提升灵力": { kind: "statBoost", params: { statKey: "spirit" } },
  "提升劲力": { kind: "statBoost", params: { statKey: "strength" } },
  "提升神识": { kind: "statBoost", params: { statKey: "perception" } },
  "提升护体": { kind: "statBoost", params: { statKey: "guard" } },
  "提升灵御": { kind: "statBoost", params: { statKey: "resistance" } },
  "提升身法": { kind: "statBoost", params: { statKey: "agility" } },
  "提升悟性": { kind: "statBoost", params: { statKey: "insight" } },
};

const ELIXIR_TYPE_WEIGHTS: Record<string, number> = {
  "恢复血量": 25, "恢复法力": 25,
  "提升体魄": 5, "提升灵力": 5, "提升劲力": 5, "提升神识": 5, "提升护体": 5, "提升灵御": 5, "提升身法": 5, "提升悟性": 5,
  "提升修为": 5, "提升寿元": 5,
};

function rollElixirType(): string {
  const entries = Object.entries(ELIXIR_TYPE_WEIGHTS);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of entries) { r -= w; if (r <= 0) return name; }
  return "恢复血量";
}

/** 品阶固定枚举（与 ItemGrade 一致，但保证顺序用于遍历）。 */
export const ALCHEMY_GRADES: readonly ItemGrade[] = [
  "下品", "中品", "上品", "极品", "仙品", "神品",
];

/**
 * 加权随机出丹药品阶：每个材料为其品阶投 1/3 权重。
 *
 * @param grades 三份材料的品阶数组（长度任意，但炼丹调用方固定传 3）。
 * @returns 加权随机得到的品阶；输入为空时回退为「下品」。
 */
export function rollAlchemyGrade(grades: readonly ItemGrade[]): ItemGrade {
  if (grades.length === 0) return "下品";
  const weight: Record<ItemGrade, number> = {
    下品: 0, 中品: 0, 上品: 0, 极品: 0, 仙品: 0, 神品: 0,
  };
  for (const g of grades) {
    if (g in weight) weight[g] += 1;
  }
  const total = grades.length;
  let roll = Math.random() * total;
  for (const g of ALCHEMY_GRADES) {
    roll -= weight[g];
    if (roll <= 0) return g;
  }
  return "下品";
}

/**
 * 计算品阶分布概率（百分比，保留 1 位小数）。用于 UI 预览。
 */
export function computeAlchemyGradeOdds(grades: readonly ItemGrade[]): { grade: ItemGrade; percent: number }[] {
  if (grades.length === 0) return [];
  const weight: Record<ItemGrade, number> = {
    下品: 0, 中品: 0, 上品: 0, 极品: 0, 仙品: 0, 神品: 0,
  };
  for (const g of grades) {
    if (g in weight) weight[g] += 1;
  }
  const total = grades.length;
  return ALCHEMY_GRADES
    .filter((g) => weight[g] > 0)
    .map((g) => ({ grade: g, percent: Math.round((weight[g] / total) * 1000) / 10 }));
}

/**
 * 默认丹药命名表：12 效果 × 6 品阶 = 72 条独立命名 + 简介。
 */
export const ELIXIR_NAME_TABLE: Readonly<Record<string, Readonly<Record<ItemGrade, { name: string; desc: string }>>>> = {
  "恢复血量": {
    下品: { name: "回血丹",   desc: "寻常草药炼制的低阶丹药，服之可缓慢回复少许气血。" },
    中品: { name: "止血丹",   desc: "能迅速止住外伤出血、稳固气血的中阶丹药。" },
    上品: { name: "续命丹",   desc: "吊命续息的珍丹，可使重伤垂危之人重获生机。" },
    极品: { name: "小还丹",   desc: "固本培元的名丹，服后大补气血、复原伤势。" },
    仙品: { name: "九转还丹", desc: "经九转炼成的仙丹，起死回生、瞬回满血。" },
    神品: { name: "太乙神丹", desc: "太乙真君所传神丹，可令枯骨生肉、生死人肉白骨。" },
  },
  "恢复法力": {
    下品: { name: "凝气散",   desc: "散剂初阶丹方，能稍聚天地灵气补充法力。" },
    中品: { name: "回灵丹",   desc: "回转灵力所用，可较快恢复损耗的法力。" },
    上品: { name: "聚灵丹",   desc: "上品灵丹，聚四方灵气入体，大幅补益法力。" },
    极品: { name: "凝元丹",   desc: "凝结天地元气所成，服之令法力充盈。" },
    仙品: { name: "玄灵仙丹", desc: "仙人所赐玄妙仙丹，须臾之间法力如潮。" },
    神品: { name: "混元神丹", desc: "蕴含混元之力的神丹，法力绵绵不绝、用之不竭。" },
  },
  "提升修为": {
    下品: { name: "辟谷丹",   desc: "助人清心辟谷的低阶丹药，略增修为。" },
    中品: { name: "筑基丹",   desc: "筑基修士常用，可助凝练真元、增益修为。" },
    上品: { name: "凝煞丹",   desc: "凝炼天地煞气所成，能显著增进修为。" },
    极品: { name: "结金丹",   desc: "助力凝结金丹的珍药，修为大涨。" },
    仙品: { name: "元婴丹",   desc: "蕴养元婴的仙丹，服之一粒抵数十年苦修。" },
    神品: { name: "造化神丹", desc: "夺天地造化的神丹，一步登天、修为暴涨。" },
  },
  "提升寿元": {
    下品: { name: "延寿丹",   desc: "以草药炼制的延年丹药，可延寿数载。" },
    中品: { name: "益寿丹",   desc: "益寿延年的中阶丹药，固本培元、添寿一纪。" },
    上品: { name: "驻颜丹",   desc: "驻颜不老的上品丹药，常服可延寿百年。" },
    极品: { name: "长生丹",   desc: "长生久视的极品丹药，服之寿元大增。" },
    仙品: { name: "松鹤仙丹", desc: "仙家秘传的益寿仙丹，松鹤延年、寿逾千载。" },
    神品: { name: "与天同寿丹", desc: "与天地同寿的神丹，寿元无穷、近乎不死。" },
  },
  "提升体魄": {
    下品: { name: "锻体丹",   desc: "锻体强身的低阶丹药，略增体魄。" },
    中品: { name: "强骨丹",   desc: "强筋健骨的中阶丹药，体魄更胜从前。" },
    上品: { name: "玉骨丹",   desc: "玉骨冰肌的上品丹药，脱胎换骨。" },
    极品: { name: "龙象丹",   desc: "蕴含龙象之力的极品丹药，体魄霸悍。" },
    仙品: { name: "玄武仙丹", desc: "玄武之灵淬炼的仙丹，体若神兽。" },
    神品: { name: "盘古神丹", desc: "盘古血脉所凝神丹，肉身成圣。" },
  },
  "提升灵力": {
    下品: { name: "凝神丹",   desc: "凝神静气的低阶丹药，略增灵力。" },
    中品: { name: "通灵丹",   desc: "通达灵台的中阶丹药，灵力渐丰。" },
    上品: { name: "蕴灵丹",   desc: "蕴养灵根的上品丹药，灵力大增。" },
    极品: { name: "天灵丹",   desc: "天地灵气所凝极品丹，灵力浑厚。" },
    仙品: { name: "太清仙丹", desc: "太清境所赐仙丹，灵力通玄。" },
    神品: { name: "元始神丹", desc: "元始天尊所炼神丹，灵力无穷。" },
  },
  "提升劲力": {
    下品: { name: "力量丹",   desc: "增添气力的低阶丹药，劲力略涨。" },
    中品: { name: "千斤丹",   desc: "一丹千斤力的中阶丹药，膂力惊人。" },
    上品: { name: "巨力丹",   desc: "增长巨力的上品丹药，力能扛鼎。" },
    极品: { name: "霸王丹",   desc: "霸王之力所凝极品丹药，劲力绝伦。" },
    仙品: { name: "力魄仙丹", desc: "凝聚力魄的仙丹，举手投足皆有千钧。" },
    神品: { name: "擎天神丹", desc: "力能擎天的神丹，一拳可碎山岳。" },
  },
  "提升护体": {
    下品: { name: "护身丹",   desc: "护身御邪的低阶丹药，略增护体。" },
    中品: { name: "铁皮丹",   desc: "皮如铁石的中阶丹药，刀枪难入。" },
    上品: { name: "金钟丹",   desc: "金钟护体的上品丹药，护体真气绵密。" },
    极品: { name: "不坏丹",   desc: "金刚不坏的极品丹药，万法难伤。" },
    仙品: { name: "金刚仙丹", desc: "金刚之身的仙丹，护体无双。" },
    神品: { name: "不灭神丹", desc: "肉身不灭的神丹，万劫不坏。" },
  },
  "提升灵御": {
    下品: { name: "御灵丹",   desc: "御散灵力的低阶丹药，略增灵御。" },
    中品: { name: "辟邪丹",   desc: "辟除邪祟的中阶丹药，灵御渐固。" },
    上品: { name: "驱魔丹",   desc: "驱魔辟邪的上品丹药，灵御大成。" },
    极品: { name: "净体丹",   desc: "净体驱邪的极品丹药，万邪不侵。" },
    仙品: { name: "菩提仙丹", desc: "菩提净体的仙丹，灵御通明。" },
    神品: { name: "万法不侵丹", desc: "万法不侵的神丹，诸邪辟易。" },
  },
  "提升神识": {
    下品: { name: "清心丹",   desc: "清心明目的低阶丹药，略增神识。" },
    中品: { name: "明目丹",   desc: "明目开光的中阶丹药，神识更广。" },
    上品: { name: "慧根丹",   desc: "开启慧根的上品丹药，神识大增。" },
    极品: { name: "天眼丹",   desc: "开天眼的极品丹药，洞察秋毫。" },
    仙品: { name: "神照仙丹", desc: "神照千里的仙丹，神识无远弗届。" },
    神品: { name: "洞明神丹", desc: "洞明万物的神丹，神识遍及四海。" },
  },
  "提升身法": {
    下品: { name: "轻身丹",   desc: "轻身如燕的低阶丹药，略增身法。" },
    中品: { name: "疾风丹",   desc: "疾如风的中阶丹药，身法矫健。" },
    上品: { name: "御风丹",   desc: "御风而行的上品丹药，身若惊鸿。" },
    极品: { name: "缩地丹",   desc: "缩地成寸的极品丹药，瞬息千里。" },
    仙品: { name: "踏云仙丹", desc: "踏云而行的仙丹，身法通神。" },
    神品: { name: "瞬移神丹", desc: "瞬移千里的神丹，来去无踪。" },
  },
  "提升悟性": {
    下品: { name: "开窍丹",   desc: "开启灵窍的低阶丹药，略增悟性。" },
    中品: { name: "顿悟丹",   desc: "助人顿悟的中阶丹药，悟性渐开。" },
    上品: { name: "悟道丹",   desc: "感悟大道的上品丹药，悟性大增。" },
    极品: { name: "明心丹",   desc: "明心见性的极品丹药，悟性超凡。" },
    仙品: { name: "菩提悟道丹", desc: "菩提树下悟道的仙丹，一念通明。" },
    神品: { name: "天道神丹", desc: "契合天道的神丹，悟性逆天。" },
  },
};

export interface AlchemyMaterialInput {
  grade: ItemGrade;
}

/**
 * 炼丹核心：根据 3 份材料产出丹药定义（不写入库存）。
 *
 * 流程：rollAlchemyGrade → rollElixirEffectType → 查名表 → rollElixirValue → 组装。
 *
 * @param materials 材料品阶数组（调用方应保证长度为 3）。
 * @returns 完整的丹药物品定义（count = 1）。
 */
export function craftElixirDef(materials: readonly AlchemyMaterialInput[]): ElixirItemDefinition {
  const grades = materials.map((m) => m.grade);
  const grade = rollAlchemyGrade(grades);
  const effectType = rollElixirType();
  const entry = ELIXIR_NAME_TABLE[effectType][grade];
  const mapping = ELIXIR_TYPE_TO_KIND[effectType] ?? ELIXIR_TYPE_TO_KIND["恢复血量"];

  return {
    itemType: "丹药",
    name: entry.name,
    desc: entry.desc,
    grade,
    count: 1,
    effect: resolveElixirEffect([mapping], grade),
  };
}
