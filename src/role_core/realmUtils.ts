/**
 * 境界相关功能函数：主属性查询、修为需求、寿元、叙事年龄等。
 * 类型和常量数据表定义在 `types/playInfo.ts`。
 */

import type { PrimaryStatKey } from "./types/playInfo";
import type { GongfaItemDefinition } from "./types/items";
import {
  TABLE,
  REALM_ORDER,
  SUB_STAGES,
  CULTIVATION_VALUES,
  SHOUYUAN_VALUES,
  MIN_NARRATIVE_AGE_BY_MAJOR,
  MAX_NARRATIVE_AGE_BY_MAJOR,
  GONGFA_MASTERY_THRESHOLDS,
  realmStageIndex,
  type RealmPrimaryStatsRow,
  type RealmMajor,
  type GongfaSlotsState,
} from "./types/playInfo";

let _byKey: Record<string, RealmPrimaryStatsRow> | null = null;

function getByKey(): Record<string, RealmPrimaryStatsRow> {
  if (!_byKey) {
    _byKey = {};
    for (const row of TABLE) {
      _byKey[row.realm + "\u0001" + row.stage] = row;
    }
  }
  return _byKey;
}

function clonePrimaryStatsFromRow(row: RealmPrimaryStatsRow): Record<PrimaryStatKey, number> {
  return {
    physique: row.physique,
    spirit: row.spirit,
    strength: row.strength,
    perception: row.perception,
    guard: row.guard,
    resistance: row.resistance,
    agility: row.agility,
    insight: row.insight,
  };
}

export function getRealmPrimaryStats(realm: string, stage?: string | null): Record<PrimaryStatKey, number> | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const row = getByKey()[realm + "\u0001" + stage];
  return row ? clonePrimaryStatsFromRow(row) : null;
}

export function getRow(realm: string, stage?: string | null): RealmPrimaryStatsRow | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const r = getByKey()[realm + "\u0001" + stage];
  return r ? { ...r } : null;
}

export function hasRow(realm: string, stage?: string | null): boolean {
  return getRow(realm, stage) != null;
}

export function getTable(): readonly RealmPrimaryStatsRow[] {
  return TABLE;
}

export function getCultivationRequired(realm: string, stage?: string | null): number | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const idx = realmStageIndex(realm, stage) - 1;
  if (idx < 0 || idx >= CULTIVATION_VALUES.length) return null;
  return CULTIVATION_VALUES[idx];
}

/**
 * 返回修为圆满后"下一阶"的具体描述，供 AI 输入串使用。
 * 小境界（初期/中期）圆满 → 需一次轻量触发事件即可突破至下一小境界；
 * 大境界（仅后期）圆满 → 需丹药/机缘并完成突破任务才能进入下一大境界。
 */
export function describeNextBreakthrough(major: string, minor: string): string {
  const minorIdx = (SUB_STAGES as readonly string[]).indexOf(minor);
  const majorIdx = (REALM_ORDER as readonly string[]).indexOf(major);
  if (minorIdx < 0 || majorIdx < 0) return "修为已圆满";
  if (minorIdx < SUB_STAGES.length - 1) {
    const nextMinor = SUB_STAGES[minorIdx + 1];
    return `修为已圆满，下一阶为${major}${nextMinor}（小境界，需一次轻量触发事件如顿悟/机缘/丹药辅助即可突破）`;
  }
  if (majorIdx < REALM_ORDER.length - 1) {
    const next = REALM_ORDER[majorIdx + 1];
    return `修为已圆满，下一阶为${next}（大境界，需${next}丹/机缘并完成突破任务）`;
  }
  return "修为已圆满（已达化神后期，无法再突破）";
}

export function getShouyuanForRealm(realm: string, stage?: string | null): number | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const idx = realmStageIndex(realm, stage) - 1;
  if (idx < 0 || idx >= SHOUYUAN_VALUES.length) return null;
  return SHOUYUAN_VALUES[idx];
}

export function getMinNarrativeAgeForMajor(major: string): number {
  let m = major != null ? String(major).trim() : "";
  if (m.endsWith("期")) m = m.slice(0, -1).trim();
  if (Object.prototype.hasOwnProperty.call(MIN_NARRATIVE_AGE_BY_MAJOR, m)) {
    return MIN_NARRATIVE_AGE_BY_MAJOR[m]!;
  }
  return MIN_NARRATIVE_AGE_BY_MAJOR.练气;
}

export function getMaxNarrativeAgeForMajor(major: string): number {
  let m = major != null ? String(major).trim() : "";
  if (m.endsWith("期")) m = m.slice(0, -1).trim();
  if (Object.prototype.hasOwnProperty.call(MAX_NARRATIVE_AGE_BY_MAJOR, m)) {
    return MAX_NARRATIVE_AGE_BY_MAJOR[m]!;
  }
  return MAX_NARRATIVE_AGE_BY_MAJOR.练气;
}

export interface CustomBirthSlice {
  background?: string;
  realmMajor?: string;
}

export interface FateChoiceSliceForAge {
  customBirth?: CustomBirthSlice;
  realm?: { major?: string };
}

export interface GameSliceForNarrativeAge {
  age?: number;
  realm?: { major?: string };
  fateChoice?: FateChoiceSliceForAge;
}

export function customBirthBackgroundImpliesAgeException(
  fc: FateChoiceSliceForAge | null | undefined,
): boolean {
  try {
    const cb = fc?.customBirth;
    if (!cb || typeof cb.background !== "string") return false;
    return /灌(?:\u9876|\u9802)|催熟|夺舍|透支/.test(cb.background);
  } catch {
    return false;
  }
}

export function resolveEffectiveMajorForNarrativeAge(
  fc: FateChoiceSliceForAge | null | undefined,
  G: GameSliceForNarrativeAge | null | undefined,
): string {
  const r = (G && G.realm) || (fc && fc.realm) || {};
  const majFromRealm = r.major != null ? String(r.major).trim() : "";
  const majFromCB =
    fc?.customBirth?.realmMajor != null ? String(fc.customBirth.realmMajor).trim() : "";

  function rank(mm: string): number {
    if (!mm) return -1;
    const idx = REALM_ORDER.indexOf(mm as RealmMajor);
    return idx >= 0 ? idx : -1;
  }
  const a = rank(majFromRealm);
  const b = rank(majFromCB);
  if (b > a && majFromCB) return majFromCB;
  if (majFromRealm) return majFromRealm;
  return majFromCB || "练气";
}

export function getProtagonistNarrativeAge(
  G: GameSliceForNarrativeAge | null | undefined,
  fc?: FateChoiceSliceForAge | null,
  options?: { defaultAge?: number },
): number {
  const g = G && typeof G === "object" ? G : {};
  const fc0 = fc != null ? fc : g.fateChoice;
  let defAge = 16;
  if (typeof options?.defaultAge === "number" && isFinite(options.defaultAge)) {
    defAge = Math.max(0, Math.floor(options.defaultAge));
  }
  const base =
    typeof g.age === "number" && isFinite(g.age) ? Math.max(0, Math.floor(g.age)) : defAge;
  if (customBirthBackgroundImpliesAgeException(fc0)) return base;
  const maj = resolveEffectiveMajorForNarrativeAge(fc0, g);
  const floor = getMinNarrativeAgeForMajor(maj);
  return Math.max(base, floor);
}

export function getGongfaMasteryThreshold(masteryLevel: number): number {
  if (masteryLevel < 1 || masteryLevel >= 10) return Infinity;
  return GONGFA_MASTERY_THRESHOLDS[masteryLevel - 1];
}

export function addGongfaMasteryExp(
  gongfa: GongfaItemDefinition,
  expIncrease: number,
): { leveledUp: boolean; newMastery: number } {
  if (expIncrease <= 0) return { leveledUp: false, newMastery: gongfa.mastery ?? 1 };

  let mastery = gongfa.mastery ?? 1;
  let exp = gongfa.masteryExp ?? 0;

  if (mastery >= 10) {
    gongfa.masteryExp = exp;
    return { leveledUp: false, newMastery: 10 };
  }

  exp += expIncrease;
  let leveledUp = false;

  while (mastery < 10) {
    const threshold = getGongfaMasteryThreshold(mastery);
    if (exp < threshold) break;
    exp -= threshold;
    mastery++;
    leveledUp = true;
  }

  if (mastery >= 10) {
    mastery = 10;
    exp = 0;
  }

  gongfa.mastery = mastery;
  gongfa.masteryExp = exp;

  return { leveledUp, newMastery: mastery };
}

/**
 * 给定一门功法的熟练度预算，按 `GONGFA_MASTERY_THRESHOLDS` 阈值表反推它应处的
 * mastery 层数（1-10）与剩余 masteryExp。
 *
 * 用于 NPC 新建/重评估时，按境界修为总量均分给各功法，推算合理的功法层数，
 * 使 NPC 功法强度与其境界匹配（而非一律 1 层）。
 */
export function computeGongfaMasteryFromBudget(budget: number): { mastery: number; masteryExp: number } {
  if (!Number.isFinite(budget) || budget <= 0) return { mastery: 1, masteryExp: 0 };
  let mastery = 1;
  let exp = Math.floor(budget);
  while (mastery < 10) {
    const threshold = getGongfaMasteryThreshold(mastery);
    if (exp < threshold) break;
    exp -= threshold;
    mastery++;
  }
  if (mastery >= 10) {
    mastery = 10;
    exp = 0;
  }
  return { mastery, masteryExp: Math.max(0, exp) };
}

/**
 * 按 NPC 当前境界的修为总量，均分给所有非空功法，设置每门功法的 mastery 与
 * masteryExp，使 NPC 功法层数与其境界匹配。
 *
 * - 修为总量取自 `getCultivationRequired(realmMajor, realmMinor)`（该境界阶段的累计修为阈值）。
 * - 均分给 gongfaSlots 中所有非空功法（功法越多每门层数越低——精力分散）。
 * - 境界无效或无功法时直接返回，不做改动。
 */
export function applyNpcGongfaMasteryByRealm(
  gongfaSlots: GongfaSlotsState,
  realmMajor: string,
  realmMinor: string,
): void {
  const totalBudget = getCultivationRequired(realmMajor, realmMinor);
  if (totalBudget == null || totalBudget <= 0) return;
  const gongfas = gongfaSlots.filter((g): g is GongfaItemDefinition => g !== null);
  if (gongfas.length === 0) return;
  const perGongfa = totalBudget / gongfas.length;
  for (const gf of gongfas) {
    const { mastery, masteryExp } = computeGongfaMasteryFromBudget(perGongfa);
    gf.mastery = mastery;
    gf.masteryExp = masteryExp;
  }
}
