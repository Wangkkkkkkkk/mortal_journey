/**
 * @fileoverview 非战斗态的静态战斗属性汇总（主界面面板展示用）。
 *
 * 暴击率/闪避/吸血/回血等属性没有持久化字段：战斗中它们由法宝词条与被动功法
 * 转成的隐藏 modifier effect 提供（可被驱散；回血/回蓝由 EffectManager 每回合
 * 读取修正总量实时结算），因此不能拍平进 CombatantStats 静态存储。
 *
 * 本模块复用 `battleInit` 的同一套 effect 组装函数，把其中 category === "modifier"
 * 的静态修正按类型累加，得到「开战第 0 回合」的属性视图 —— 与战斗实际数值同源，
 * 仅用于展示，不参与战斗结算。
 *
 * 注意：被动功法的 HoT/护盾/反击等非修正类效果不计入本视图。
 */

import type { ModifierType } from "./types";
import { BASE_CRIT_DMG } from "./constants";
import { extractPassiveEffects, extractTreasurePassiveEffects } from "./battleInit";
import { computeLinggenCombatBonuses } from "../role_core/types/gameConstants";
import type { Character } from "../role_core/Character";

/** 面板战斗属性。均为百分比数值；未注明者基础为 0，仅靠法宝/被动功法提供。 */
export interface PanelCombatStats {
  /** 暴击率 %。 */
  critRate: number;
  /** 暴击伤害倍率 %（基础 150 + 金灵根加成 + 修正）。 */
  critDmg: number;
  /** 闪避率 %。 */
  dodgeRate: number;
  /** 吸血 %（造成伤害按比例回复血量）。 */
  lifesteal: number;
  /** 增伤 %（造成的最终伤害提升）。 */
  damageDealt: number;
  /** 减伤 %（受到的最终伤害降低；正数表示减伤）。 */
  damageReduction: number;
  /** 回血：每回合恢复最大血量的 %（已含火灵根恢复倍率）。 */
  hpRecoverPerTurn: number;
  /** 回蓝：每回合恢复最大法力的 %。 */
  mpRecoverPerTurn: number;
}

/**
 * 汇总角色当前装备与被动功法的静态战斗属性。
 *
 * 与 `createProtagonistCombatant` 走同一套 effect 组装管线，
 * 数值等价于开战瞬间（未受任何 buff/驱散影响）的修正总量。
 */
export function computePanelCombatStats(ch: Character): PanelCombatStats {
  const primaryStats = ch.getPrimaryStats();
  const getStat = (key: string) => (primaryStats as Record<string, number>)[key] ?? 0;
  const linggenBonus = computeLinggenCombatBonuses(ch.linggen, ch.realm.major);

  const effects = [
    ...extractPassiveEffects(ch.gongfaSlots, getStat, "panel"),
    ...extractTreasurePassiveEffects(ch.equippedSlots, "panel"),
  ];

  const totals: Partial<Record<ModifierType, number>> = {};
  for (const e of effects) {
    if (e.category !== "modifier" || e.modifierType == null) continue;
    totals[e.modifierType] = (totals[e.modifierType] ?? 0) + (e.modifierValue ?? 0);
  }
  const t = (k: ModifierType): number => totals[k] ?? 0;

  return {
    critRate: t("critRate"),
    critDmg: BASE_CRIT_DMG + linggenBonus.critDmgBonus + t("critDmg"),
    dodgeRate: t("dodgeRate"),
    lifesteal: t("lifesteal"),
    damageDealt: t("damageDealt"),
    // 引擎语义：法宝「减伤」词条以负 damageTaken 修正入场，展示时取反为正。
    damageReduction: -t("damageTaken"),
    hpRecoverPerTurn: t("hpRecover") * linggenBonus.healMult,
    mpRecoverPerTurn: t("mpRecover"),
  };
}
