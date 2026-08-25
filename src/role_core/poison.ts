/**
 * @fileoverview 毒术系统：制毒（战斗消耗品）与淬毒（法宝附毒）的纯逻辑。
 *
 * 制毒规则：
 *   - 投入 3 份「毒物」，加权随机出基础品阶，再按【毒术】熟练度掷品阶跃迁。
 *   - 毒性类型从 {@link POISON_NAME_TABLE} 均匀随机，决定该毒药的战斗效果。
 *   - 100% 出毒，无失败。
 *
 * 效果口径：
 *   - 持续伤害 / 延迟伤害：按目标**最大血量百分比**结算，跨境界自适应。
 *   - 六类削弱：映射到战斗引擎既有的修正类型（见 {@link POISON_KIND_SPECS}），
 *     不新增引擎机制。
 */

import type { ItemGrade } from "./types/itemInfo";
import type { ModifierType } from "../battle_engine/types";
import { GRADE_INDEX } from "./types/gameConstants";
import { rollAlchemyGrade } from "./alchemy";
import { applyCraftGradeUpgrade } from "./craft";
import { POISON_NAME_TABLE } from "./craftTables";

/** 毒药物品定义。战斗中对敌方使用，不可自用。 */
export interface PoisonItemDefinition {
  itemType: "毒药";
  name: string;
  desc: string;
  grade: ItemGrade;
  count: number;
  /** 毒性类型（与 {@link POISON_NAME_TABLE} 的键一致）。 */
  poisonType: string;
  /** 战斗效果类别。 */
  kind: "dot" | "delayed" | "modifier";
  /** DoT/延迟：目标最大血量百分比；削弱：修正百分点。 */
  value: number;
  /** 削弱类毒药对应的引擎修正类型。 */
  modifierType?: ModifierType;
  /** 持续回合；延迟伤害为引爆前的回合数。 */
  duration: number;
}

// ---------------------------------------------------------------------------
// 毒性类型 → 引擎效果
// ---------------------------------------------------------------------------

interface PoisonKindSpec {
  kind: "dot" | "delayed" | "modifier";
  /** 仅 modifier 类使用。 */
  modifierType?: ModifierType;
  /**
   * 修正符号：`-1` 表示削弱攻击（负修正），`+1` 表示放大承伤（正修正）。
   * DoT / 延迟不使用。
   */
  sign?: 1 | -1;
}

/**
 * 八类毒性到战斗引擎效果的映射。
 *
 * 「降低物防/法防」以放大对应类型承伤实现，「降低减伤」放大全类型承伤——
 * 二者的区别在于前者只影响单一伤害类型，后者影响所有类型的伤害。
 */
export const POISON_KIND_SPECS: Readonly<Record<string, PoisonKindSpec>> = {
  "持续伤害": { kind: "dot" },
  "延迟伤害": { kind: "delayed" },
  "降低物攻": { kind: "modifier", modifierType: "physDamageDealt", sign: -1 },
  "降低物防": { kind: "modifier", modifierType: "physDamageTaken", sign: 1 },
  "降低法攻": { kind: "modifier", modifierType: "magDamageDealt", sign: -1 },
  "降低法防": { kind: "modifier", modifierType: "magDamageTaken", sign: 1 },
  "降低速度": { kind: "modifier", modifierType: "speed", sign: -1 },
  "降低减伤": { kind: "modifier", modifierType: "damageTaken", sign: 1 },
};

// ---------------------------------------------------------------------------
// 品阶数值表（下品 → 神品）
// ---------------------------------------------------------------------------

/** 持续伤害：每回合损失目标最大血量的百分比。 */
const POISON_DOT_PERCENT: readonly number[] = [2, 3, 4, 6, 8, 10];

/** 延迟伤害：引爆时一次性损失目标最大血量的百分比。 */
const POISON_DELAYED_PERCENT: readonly number[] = [15, 22, 30, 42, 55, 70];

/** 属性削弱幅度（百分点）。 */
const POISON_MODIFIER_PERCENT: readonly number[] = [8, 12, 18, 25, 35, 50];

/** 持续回合数（DoT 与削弱共用）。 */
const POISON_DURATION: readonly number[] = [3, 3, 4, 4, 5, 5];

/** 延迟伤害的潜伏回合数（固定，不随品阶变化——品阶只影响爆发威力）。 */
const POISON_DELAY_TURNS = 3;

/**
 * 淬毒涂层：**每层**每回合损失目标最大血量的百分比。
 *
 * 与一次性投放的毒药不同，涂层随每次命中叠层且层数无上限（对齐毒修功法
 * `maxStacks: 9999` 的既有设计），因此单层数值必须远低于毒药的 DoT 口径，
 * 靠战斗中反复命中累积威力。
 */
const COATING_TICK_PERCENT: readonly number[] = [0.3, 0.5, 0.8, 1.2, 1.8, 2.5];

/** 涂层持续回合数：每次命中都会刷新，故只决定停手后毒性残留多久。 */
const COATING_DURATION: readonly number[] = [3, 3, 4, 4, 5, 5];

/** 涂层层数上限。对齐毒修功法的既有约定，实质为无上限。 */
export const COATING_MAX_STACKS = 9999;

function atGrade(table: readonly number[], grade: ItemGrade): number {
  const idx = GRADE_INDEX[grade] ?? 0;
  return table[Math.min(idx, table.length - 1)];
}

/** 可制作的毒性类型（取自命名表的键）。 */
export const POISON_TYPES: readonly string[] = Object.keys(POISON_NAME_TABLE);

/** 均匀随机一个毒性类型。 */
export function rollPoisonType(): string {
  if (POISON_TYPES.length === 0) return "";
  return POISON_TYPES[Math.floor(Math.random() * POISON_TYPES.length)];
}

/** 组装某毒性某品阶的战斗效果参数。 */
export function buildPoisonEffect(
  poisonType: string,
  grade: ItemGrade,
): Pick<PoisonItemDefinition, "kind" | "value" | "modifierType" | "duration"> | null {
  const spec = POISON_KIND_SPECS[poisonType];
  if (!spec) return null;

  if (spec.kind === "dot") {
    return { kind: "dot", value: atGrade(POISON_DOT_PERCENT, grade), duration: atGrade(POISON_DURATION, grade) };
  }
  if (spec.kind === "delayed") {
    return { kind: "delayed", value: atGrade(POISON_DELAYED_PERCENT, grade), duration: POISON_DELAY_TURNS };
  }
  return {
    kind: "modifier",
    value: atGrade(POISON_MODIFIER_PERCENT, grade) * (spec.sign ?? 1),
    modifierType: spec.modifierType,
    duration: atGrade(POISON_DURATION, grade),
  };
}

/**
 * 组装某品阶的淬毒涂层参数。
 *
 * @param grade 由毒物加权并经【毒术】跃迁后的品阶。
 * @return 每层每回合伤害百分比与持续回合数。
 */
export function buildCoatingEffect(grade: ItemGrade): { tickPercent: number; duration: number } {
  return {
    tickPercent: atGrade(COATING_TICK_PERCENT, grade),
    duration: atGrade(COATING_DURATION, grade),
  };
}

/** 毒药效果的展示文案。 */
export function formatPoisonEffect(p: PoisonItemDefinition): string {
  if (p.kind === "dot") return `每回合损失最大血量 ${p.value}%，持续 ${p.duration} 回合`;
  if (p.kind === "delayed") return `${p.duration} 回合后毒发，损失最大血量 ${p.value}%`;
  const sign = p.value > 0 ? "+" : "";
  return `${p.poisonType} ${sign}${p.value}%，持续 ${p.duration} 回合`;
}

export interface PoisonMaterialInput {
  grade: ItemGrade;
}

/**
 * 制毒核心：根据 3 份毒物产出毒药定义（不写入库存）。
 *
 * @param materials 毒物品阶数组（调用方应保证长度为 3）。
 * @param proficiency 【毒术】熟练度，用于掷品阶跃迁；缺省 0（不跃迁）。
 * @returns 完整的毒药物品定义（count = 1）；命名表为空时返回 null。
 */
export function craftPoisonDef(
  materials: readonly PoisonMaterialInput[],
  proficiency = 0,
): PoisonItemDefinition | null {
  const poisonType = rollPoisonType();
  if (!poisonType) return null;

  const grade = applyCraftGradeUpgrade(rollAlchemyGrade(materials.map((m) => m.grade)), proficiency);
  const entry = POISON_NAME_TABLE[poisonType][grade];
  const effect = buildPoisonEffect(poisonType, grade);
  if (!effect) return null;

  return {
    itemType: "毒药",
    name: entry.name,
    desc: entry.desc,
    grade,
    count: 1,
    poisonType,
    ...effect,
  };
}
