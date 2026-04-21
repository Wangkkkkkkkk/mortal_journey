/**
 * @fileoverview 主角面板十维推导：境界表底数 + 佩戴与功法 `bonus`（中文键）平面合并 + 灵根倍率。
 * 顺序与 mortal_journey `leegen_state.applyToBase` 一致：先加算，再按灵根对负责属性相乘。
 */

import { getBaseStats, getEquipBonusRealmRatio } from "../config/realm_state";
import { applyLinggenToPlayerBase } from "../config/leegen";
import type { ItemBonusMap } from "../types/itemInfo";
import type { CharacterPlayInfoCommon, PlayerBaseStats, ProtagonistPlayInfo } from "../types/playInfo";
import { PLAYER_STAT_BONUS_KEYS, PLAYER_STAT_KEY_TO_ZH, type PlayerStatBonusKey } from "../types/zhPlayerStats";

/** 中文加成键 → 运行时 `PlayerBaseStats` 键（与 `PLAYER_STAT_KEY_TO_ZH` 互逆）。 */
const ZH_BONUS_TO_PLAYER_KEY: Readonly<Record<string, PlayerStatBonusKey>> = (() => {
  const o: Record<string, PlayerStatBonusKey> = {};
  for (const en of PLAYER_STAT_BONUS_KEYS) {
    o[PLAYER_STAT_KEY_TO_ZH[en]] = en;
  }
  return o;
})();

/**
 * 将灵根元素数组拼成可供 `parseLinggenElements` 扫描的串（与 UI `formatLinggenElements` 展示顺序一致）。
 *
 * @param linggen - 主角 `linggen` 字段。
 * @returns 连续五行字串，可能为空。
 */
export function linggenElementsToParseText(linggen: string[]): string {
  return linggen.map((x) => String(x).trim()).filter(Boolean).join("");
}

function realmTableBaseOrStored(c: CharacterPlayInfoCommon): PlayerBaseStats {
  const fromTable = getBaseStats(c.realm.major, c.realm.minor);
  if (fromTable) return { ...fromTable };
  return { ...c.playerBase };
}

/**
 * 把物品 `bonus`（中文键，允许表外键）按已知映射加算到 `target` 对应英文键上。
 *
 * @param target - 被原地累加的十维。
 * @param bonus - 装备的 `bonus` 或功法 `bonus`。
 * @param realmRatio - 境界对槽位 bonus 的倍率（默认 `1`）；每项按 `Math.trunc(v * ratio)` 加算（向零截断为整数）。
 */
export function addZhItemBonusInto(
  target: PlayerBaseStats,
  bonus: ItemBonusMap | undefined,
  realmRatio = 1,
): void {
  if (!bonus || typeof bonus !== "object") return;
  const r = typeof realmRatio === "number" && Number.isFinite(realmRatio) && realmRatio > 0 ? realmRatio : 1;
  for (const [zh, v] of Object.entries(bonus)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const key = ZH_BONUS_TO_PLAYER_KEY[zh];
    if (!key) continue;
    target[key] += Math.trunc(v * r);
  }
}

function addEquippedAndGongfaBonuses(c: CharacterPlayInfoCommon, target: PlayerBaseStats): void {
  const ratio = getEquipBonusRealmRatio(c.realm.major, c.realm.minor);
  const { weapon, faqi, armor } = c.equippedSlots;
  if (weapon) addZhItemBonusInto(target, weapon.bonus, ratio);
  if (faqi) addZhItemBonusInto(target, faqi.bonus, ratio);
  if (armor) addZhItemBonusInto(target, armor.bonus, ratio);
  for (const gf of c.gongfaSlots) {
    if (gf) addZhItemBonusInto(target, gf.bonus, ratio);
  }
}

/**
 * 境界表底数 + 佩戴与功法加成，尚未乘灵根。
 *
 * @param c - 角色档案（主角或NPC通用）。
 * @returns 合并后的十维（新对象）。
 */
export function getStatsBeforeLinggen(c: CharacterPlayInfoCommon): PlayerBaseStats {
  const merged = realmTableBaseOrStored(c);
  addEquippedAndGongfaBonuses(c, merged);
  return merged;
}

/**
 * @deprecated 使用 `getStatsBeforeLinggen` 替代。
 */
export function getProtagonistStatsBeforeLinggen(p: ProtagonistPlayInfo): PlayerBaseStats {
  return getStatsBeforeLinggen(p);
}

/**
 * 分步结果，便于调试或后续 UI 展示「来源」。
 */
export interface ProtagonistDerivedStatsBreakdown {
  /** 仅境界表（或表缺失时的 `playerBase` 快照）。 */
  realmTableBase: PlayerBaseStats;
  /** 表底 + 装备/功法加算后。 */
  preLinggen: PlayerBaseStats;
  /** 再乘灵根倍率后。 */
  final: PlayerBaseStats;
}

/**
 * 完整推导链的分步数据。
 *
 * @param c - 角色档案；`null` 时返回 `null`。
 */
export function getDerivedStatsBreakdown(c: CharacterPlayInfoCommon | null): ProtagonistDerivedStatsBreakdown | null {
  if (!c) return null;
  const realmTableBase = realmTableBaseOrStored(c);
  const preLinggen = { ...realmTableBase };
  addEquippedAndGongfaBonuses(c, preLinggen);
  const linggenText = linggenElementsToParseText(c.linggen);
  const final = applyLinggenToPlayerBase({ ...preLinggen }, c.realm.major, linggenText);
  return { realmTableBase, preLinggen, final };
}

/**
 * @deprecated 使用 `getDerivedStatsBreakdown` 替代。
 */
export function getProtagonistDerivedStatsBreakdown(p: ProtagonistPlayInfo | null): ProtagonistDerivedStatsBreakdown | null {
  return getDerivedStatsBreakdown(p);
}

/**
 * 角色面板应展示的十维最终值（境界 + 装备/功法 + 灵根）。
 *
 * @param c - 角色档案（主角或NPC通用）；`null` 时返回 `null`。
 */
export function getDerivedStats(c: CharacterPlayInfoCommon | null): PlayerBaseStats | null {
  if (!c) return null;
  const pre = getStatsBeforeLinggen(c);
  return applyLinggenToPlayerBase(pre, c.realm.major, linggenElementsToParseText(c.linggen));
}

/**
 * @deprecated 使用 `getDerivedStats` 替代。
 */
export function getProtagonistDerivedStats(p: ProtagonistPlayInfo | null): PlayerBaseStats | null {
  return getDerivedStats(p);
}
