/**
 * 境界 · 基础属性 / 修为需求 / 寿元 / 大境界突破概率查表。
 * 化神与其它大境界一致，均为初期 / 中期 / 后期；查表须同时传入 `realm` 与 `stage`。
 * （mortal_journey 旧版 `realm_state.js` 中化神为单行 `stage: null`，本文件数据与 API 已按三期拆分。）
 *
 * 表中十维字段与 `playInfo.PlayerBaseStats` 一致；英→中对照用 `zhPlayerStats.PLAYER_STAT_KEY_TO_ZH`。
 */

import type { PlayerBaseStats } from "../types/playInfo";
import {
  PLAYER_STAT_BONUS_KEYS,
  PLAYER_STAT_KEY_TO_ZH,
  type PlayerStatBonusKey,
  type ZhPlayerStatBonusKey,
} from "../types/zhPlayerStats";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 查表行：境界键 + `PlayerBaseStats` 十维 */
export interface RealmBaseStatsRow extends PlayerBaseStats {
  realm: string;
  stage: string;
}

/** 与 `PlayerBaseStats` 同构（查表返回的纯数值块，历史别名保留） */
export type RealmBaseStatsEight = PlayerBaseStats;

export interface RealmEquipBonusRatioRow {
  realm: string;
  stage: string;
  ratio: number;
}

export interface RealmCultivationRow {
  realm: string;
  stage: string;
  xiuwei: number;
}

export interface RealmShouyuanRow {
  realm: string;
  stage: string;
  shouyuan: number;
}

/** 相邻大境界突破成功概率 chance ∈ [0,1] */
export interface MajorBreakthroughRow {
  from: string;
  to: string;
  chance: number;
}

// ---------------------------------------------------------------------------
// 常量表（与 realm_state.js 一致）
// ---------------------------------------------------------------------------

export const REALM_ORDER = ["练气", "筑基", "结丹", "元婴", "化神"] as const;

export const SUB_STAGES = ["初期", "中期", "后期"] as const;

/** 大境界顺序（由低到高） */
export type RealmMajor = (typeof REALM_ORDER)[number];

/** 常规小境界（各大大境界含化神均为 初期 / 中期 / 后期） */
export type RealmSubStage = (typeof SUB_STAGES)[number];

export const TABLE = [
  { realm: "练气", stage: "初期", hp: 200, mp: 50, patk: 10, pdef: 5, matk: 20, mdef: 5, sense: 10, luck: 5, dodge: 5, tenacity: 5 },
  { realm: "练气", stage: "中期", hp: 300, mp: 75, patk: 15, pdef: 5, matk: 30, mdef: 5, sense: 20, luck: 5, dodge: 5, tenacity: 5 },
  { realm: "练气", stage: "后期", hp: 400, mp: 100, patk: 20, pdef: 5, matk: 40, mdef: 5, sense: 30, luck: 5, dodge: 5, tenacity: 5 },
  { realm: "筑基", stage: "初期", hp: 600, mp: 150, patk: 30, pdef: 10, matk: 60, mdef: 10, sense: 50, luck: 20, dodge: 10, tenacity: 10 },
  { realm: "筑基", stage: "中期", hp: 700, mp: 175, patk: 35, pdef: 10, matk: 70, mdef: 10, sense: 70, luck: 20, dodge: 10, tenacity: 10 },
  { realm: "筑基", stage: "后期", hp: 800, mp: 200, patk: 40, pdef: 10, matk: 80, mdef: 10, sense: 90, luck: 20, dodge: 10, tenacity: 10 },
  { realm: "结丹", stage: "初期", hp: 1000, mp: 250, patk: 50, pdef: 20, matk: 100, mdef: 20, sense: 120, luck: 50, dodge: 15, tenacity: 15 },
  { realm: "结丹", stage: "中期", hp: 1300, mp: 325, patk: 65, pdef: 20, matk: 130, mdef: 20, sense: 150, luck: 50, dodge: 15, tenacity: 15 },
  { realm: "结丹", stage: "后期", hp: 1600, mp: 400, patk: 80, pdef: 20, matk: 160, mdef: 20, sense: 180, luck: 50, dodge: 15, tenacity: 15 },
  { realm: "元婴", stage: "初期", hp: 2000, mp: 500, patk: 100, pdef: 50, matk: 200, mdef: 50, sense: 230, luck: 100, dodge: 20, tenacity: 20 },
  { realm: "元婴", stage: "中期", hp: 4000, mp: 1000, patk: 200, pdef: 50, matk: 400, mdef: 50, sense: 280, luck: 100, dodge: 20, tenacity: 20 },
  { realm: "元婴", stage: "后期", hp: 6000, mp: 1500, patk: 300, pdef: 50, matk: 600, mdef: 50, sense: 330, luck: 100, dodge: 20, tenacity: 20 },
  { realm: "化神", stage: "初期", hp: 10000, mp: 2500, patk: 500, pdef: 100, matk: 1000, mdef: 100, sense: 400, luck: 200, dodge: 25, tenacity: 25 },
  { realm: "化神", stage: "中期", hp: 20000, mp: 5000, patk: 1000, pdef: 100, matk: 2000, mdef: 100, sense: 450, luck: 200, dodge: 25, tenacity: 25 },
  { realm: "化神", stage: "后期", hp: 30000, mp: 7500, patk: 1500, pdef: 100, matk: 3000, mdef: 100, sense: 500, luck: 200, dodge: 25, tenacity: 25 },
] as const satisfies readonly RealmBaseStatsRow[];

export const REALM_EQUIP_BONUS_RATIO_TABLE = [
    { realm: "练气", stage: "初期", ratio: 1.1 },
    { realm: "练气", stage: "中期", ratio: 1.25 },
    { realm: "练气", stage: "后期", ratio: 1.5 },
    { realm: "筑基", stage: "初期", ratio: 2.5 },
    { realm: "筑基", stage: "中期", ratio: 3.0 },
    { realm: "筑基", stage: "后期", ratio: 3.5 },
    { realm: "结丹", stage: "初期", ratio: 5.5 },
    { realm: "结丹", stage: "中期", ratio: 6.0 },
    { realm: "结丹", stage: "后期", ratio: 6.5 },
    { realm: "元婴", stage: "初期", ratio: 8.5 },
    { realm: "元婴", stage: "中期", ratio: 9.0 },
    { realm: "元婴", stage: "后期", ratio: 9.5 },
    { realm: "化神", stage: "初期", ratio: 10.0 },
    { realm: "化神", stage: "中期", ratio: 12.5 },
    { realm: "化神", stage: "后期", ratio: 15.0 },
  ] as const satisfies readonly RealmEquipBonusRatioRow[];

export const CULTIVATION_TABLE = [
  { realm: "练气", stage: "初期", xiuwei: 100 },
  { realm: "练气", stage: "中期", xiuwei: 200 },
  { realm: "练气", stage: "后期", xiuwei: 1000 },
  { realm: "筑基", stage: "初期", xiuwei: 2000 },
  { realm: "筑基", stage: "中期", xiuwei: 5000 },
  { realm: "筑基", stage: "后期", xiuwei: 10000 },
  { realm: "结丹", stage: "初期", xiuwei: 20000 },
  { realm: "结丹", stage: "中期", xiuwei: 50000 },
  { realm: "结丹", stage: "后期", xiuwei: 100000 },
  { realm: "元婴", stage: "初期", xiuwei: 200000 },
  { realm: "元婴", stage: "中期", xiuwei: 500000 },
  { realm: "元婴", stage: "后期", xiuwei: 1000000 },
  { realm: "化神", stage: "初期", xiuwei: 10000000 },
  { realm: "化神", stage: "中期", xiuwei: 20000000 },
  { realm: "化神", stage: "后期", xiuwei: 30000000 },
] as const satisfies readonly RealmCultivationRow[];

export const SHOUYUAN_TABLE = [
  { realm: "练气", stage: "初期", shouyuan: 100 },
  { realm: "练气", stage: "中期", shouyuan: 110 },
  { realm: "练气", stage: "后期", shouyuan: 120 },
  { realm: "筑基", stage: "初期", shouyuan: 200 },
  { realm: "筑基", stage: "中期", shouyuan: 225 },
  { realm: "筑基", stage: "后期", shouyuan: 250 },
  { realm: "结丹", stage: "初期", shouyuan: 500 },
  { realm: "结丹", stage: "中期", shouyuan: 550 },
  { realm: "结丹", stage: "后期", shouyuan: 600 },
  { realm: "元婴", stage: "初期", shouyuan: 1000 },
  { realm: "元婴", stage: "中期", shouyuan: 1250 },
  { realm: "元婴", stage: "后期", shouyuan: 1500 },
  { realm: "化神", stage: "初期", shouyuan: 2000 },
  { realm: "化神", stage: "中期", shouyuan: 2500 },
  { realm: "化神", stage: "后期", shouyuan: 3000 },
] as const satisfies readonly RealmShouyuanRow[];

export const MAJOR_BREAKTHROUGH_TABLE = [
  { from: "练气", to: "筑基", chance: 0.5 },
  { from: "筑基", to: "结丹", chance: 0.3 },
  { from: "结丹", to: "元婴", chance: 0.2 },
  { from: "元婴", to: "化神", chance: 0.1 },
] as const satisfies readonly MajorBreakthroughRow[];

const SEP = "\u0001";
const PAIR_SEP = "\u0002";

function rowKey(realm: string, stage: string | null | undefined): string {
  return stage == null || stage === "" ? realm : realm + SEP + stage;
}

function majorPairKey(fromRealm: string, toRealm: string): string {
  return (
    String(fromRealm == null ? "" : fromRealm).trim() +
    PAIR_SEP +
    String(toRealm == null ? "" : toRealm).trim()
  );
}

function buildStatsByKey(): Readonly<Record<string, RealmBaseStatsRow>> {
  const o: Record<string, RealmBaseStatsRow> = {};
  for (const row of TABLE) {
    o[rowKey(row.realm, row.stage)] = row;
  }
  return o;
}

function buildCultivationByKey(): Readonly<Record<string, number>> {
  const o: Record<string, number> = {};
  for (const row of CULTIVATION_TABLE) {
    o[rowKey(row.realm, row.stage)] = row.xiuwei;
  }
  return o;
}

function buildShouyuanMaps(): {
  byKey: Readonly<Record<string, number>>;
  rowByKey: Readonly<Record<string, RealmShouyuanRow>>;
} {
  const byKey: Record<string, number> = {};
  const rowByKey: Record<string, RealmShouyuanRow> = {};
  for (const row of SHOUYUAN_TABLE) {
    const k = rowKey(row.realm, row.stage);
    byKey[k] = row.shouyuan;
    rowByKey[k] = row;
  }
  return { byKey, rowByKey };
}

function buildMajorBreakthroughByPair(): Readonly<Record<string, number>> {
  const o: Record<string, number> = {};
  for (const row of MAJOR_BREAKTHROUGH_TABLE) {
    o[majorPairKey(row.from, row.to)] = row.chance;
  }
  return o;
}

const BY_KEY = buildStatsByKey();
const CULTIVATION_BY_KEY = buildCultivationByKey();
const { byKey: SHOUYUAN_BY_KEY, rowByKey: SHOUYUAN_ROW_BY_KEY } = buildShouyuanMaps();
const MAJOR_BREAKTHROUGH_BY_PAIR = buildMajorBreakthroughByPair();

function buildEquipBonusRatioByKey(): Readonly<Record<string, number>> {
  const o: Record<string, number> = {};
  for (const row of REALM_EQUIP_BONUS_RATIO_TABLE) {
    o[rowKey(row.realm, row.stage)] = row.ratio;
  }
  return o;
}

const EQUIP_BONUS_RATIO_BY_KEY = buildEquipBonusRatioByKey();

/**
 * 当前境界对「已佩戴装备 / 已上阵功法」属性 bonus 的倍率（与 mortal_journey `getEquipBonusRealmRatio` 一致：逐项乘 ratio 后加算）。
 * 须同时传入大、小境界（含化神初期 / 中期 / 后期）；查不到时返回 `1`。
 */
export function getEquipBonusRealmRatio(
  major: string | null | undefined,
  minor: string | null | undefined,
): number {
  if (major == null || major === "" || minor == null || minor === "") return 1;
  const n = EQUIP_BONUS_RATIO_BY_KEY[rowKey(String(major).trim(), String(minor).trim())];
  return typeof n === "number" && isFinite(n) && n > 0 ? n : 1;
}

/** 同 `PLAYER_STAT_BONUS_KEYS`（保留 `RealmState`/旧调用名） */
export const STAT_KEYS = PLAYER_STAT_BONUS_KEYS;

export type RealmStatKey = PlayerStatBonusKey;

/** 同 `PLAYER_STAT_KEY_TO_ZH` */
export const STAT_KEY_TO_ZH = PLAYER_STAT_KEY_TO_ZH;

/** 中文列名（便于日志 / UI） */
export const STAT_LABEL_ZH: Readonly<Record<PlayerStatBonusKey, ZhPlayerStatBonusKey>> =
  PLAYER_STAT_KEY_TO_ZH;

function cloneStatsFromRow(row: RealmBaseStatsRow): PlayerBaseStats {
  return {
    hp: row.hp,
    mp: row.mp,
    patk: row.patk,
    pdef: row.pdef,
    matk: row.matk,
    mdef: row.mdef,
    sense: row.sense,
    luck: row.luck,
    dodge: row.dodge,
    tenacity: row.tenacity,
  };
}

/** 按境界 + 小境界查基础十维（化神与其它境界相同，须传 stage）；返回 `PlayerBaseStats` */
export function getBaseStats(realm: string, stage?: string | null): PlayerBaseStats | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const row = BY_KEY[rowKey(realm, stage)];
  return row ? cloneStatsFromRow(row) : null;
}

/** 该阶段所需修为（须传小境界，含化神） */
export function getCultivationRequired(realm: string, stage?: string | null): number | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const n = CULTIVATION_BY_KEY[rowKey(realm, stage)];
  return typeof n === "number" ? n : null;
}

export function getCultivationRow(realm: string, stage?: string | null): RealmCultivationRow | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const k = rowKey(realm, stage);
  for (const r of CULTIVATION_TABLE) {
    if (rowKey(r.realm, r.stage) === k) {
      return { realm: r.realm, stage: r.stage, xiuwei: r.xiuwei };
    }
  }
  return null;
}

/** 完整属性行（含 realm、stage） */
export function getRow(realm: string, stage?: string | null): RealmBaseStatsRow | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const r = BY_KEY[rowKey(realm, stage)];
  return r
    ? {
        realm: r.realm,
        stage: r.stage,
        hp: r.hp,
        mp: r.mp,
        patk: r.patk,
        pdef: r.pdef,
        matk: r.matk,
        mdef: r.mdef,
        sense: r.sense,
        luck: r.luck,
        dodge: r.dodge,
        tenacity: r.tenacity,
      }
    : null;
}

export function hasRow(realm: string, stage?: string | null): boolean {
  return getRow(realm, stage) != null;
}

export function getTable(): readonly RealmBaseStatsRow[] {
  return TABLE;
}

export function getCultivationTable(): readonly RealmCultivationRow[] {
  return CULTIVATION_TABLE;
}

/** 寿元上限参考（岁，须传小境界，含化神） */
export function getShouyuanForRealm(realm: string, stage?: string | null): number | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const sn = SHOUYUAN_BY_KEY[rowKey(realm, stage)];
  return typeof sn === "number" ? sn : null;
}

export function getShouyuanRow(realm: string, stage?: string | null): RealmShouyuanRow | null {
  if (realm == null || realm === "" || stage == null || stage === "") return null;
  const r1 = SHOUYUAN_ROW_BY_KEY[rowKey(realm, stage)];
  return r1 ? { realm: r1.realm, stage: r1.stage, shouyuan: r1.shouyuan } : null;
}

export function getShouyuanTable(): readonly RealmShouyuanRow[] {
  return SHOUYUAN_TABLE;
}

export function getMajorBreakthroughChance(fromRealm: string, toRealm: string): number | null {
  const k = majorPairKey(fromRealm, toRealm);
  if (k === PAIR_SEP) return null;
  const p = MAJOR_BREAKTHROUGH_BY_PAIR[k];
  return typeof p === "number" && isFinite(p) ? p : null;
}

export function rollMajorBreakthrough(
  fromRealm: string,
  toRealm: string,
  randomFn?: () => number,
): boolean {
  const p = getMajorBreakthroughChance(fromRealm, toRealm);
  if (p == null || p <= 0) return false;
  let rnd = typeof randomFn === "function" ? randomFn() : Math.random();
  if (typeof rnd !== "number" || !isFinite(rnd)) rnd = Math.random();
  return rnd < p;
}

/** 与 rollMajorBreakthrough 一致：rnd < p */
export function rollBreakthroughWithProbability(p: number, randomFn?: () => number): boolean {
  if (p == null || typeof p !== "number" || !isFinite(p)) return false;
  const cap = Math.min(1, Math.max(0, p));
  if (cap <= 0) return false;
  let rnd = typeof randomFn === "function" ? randomFn() : Math.random();
  if (typeof rnd !== "number" || !isFinite(rnd)) rnd = Math.random();
  return rnd < cap;
}

export function getMajorBreakthroughTable(): readonly MajorBreakthroughRow[] {
  return MAJOR_BREAKTHROUGH_TABLE;
}

/** 开局 / 摘要中与「大境界」自洽的常规年龄下限（岁） */
export const MIN_NARRATIVE_AGE_BY_MAJOR: Readonly<Record<string, number>> = {
  练气: 16,
  筑基: 100,
  结丹: 200,
  元婴: 500,
  化神: 1000,
};

export function getMinNarrativeAgeForMajor(major: string): number {
  let m = major != null ? String(major).trim() : "";
  if (m.endsWith("期")) m = m.slice(0, -1).trim();
  if (Object.prototype.hasOwnProperty.call(MIN_NARRATIVE_AGE_BY_MAJOR, m)) {
    return MIN_NARRATIVE_AGE_BY_MAJOR[m]!;
  }
  return MIN_NARRATIVE_AGE_BY_MAJOR.练气;
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

export function customBirthBackgroundImpliesAgeException(fc: FateChoiceSliceForAge | null | undefined): boolean {
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

/** 与主工程 `MjMainScreenPanelRealm.DEFAULT_AGE` 对齐时可传入 options.defaultAge */
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
  const base = typeof g.age === "number" && isFinite(g.age) ? Math.max(0, Math.floor(g.age)) : defAge;
  if (customBirthBackgroundImpliesAgeException(fc0)) return base;
  const maj = resolveEffectiveMajorForNarrativeAge(fc0, g);
  const floor = getMinNarrativeAgeForMajor(maj);
  return Math.max(base, floor);
}

/** 与脚本全局 `RealmState` 聚合导出同名，便于迁移调用方 */
export const RealmState = {
  TABLE,
  CULTIVATION_TABLE,
  SHOUYUAN_TABLE,
  MAJOR_BREAKTHROUGH_TABLE,
  REALM_ORDER,
  SUB_STAGES,
  STAT_KEYS,
  STAT_KEY_TO_ZH,
  STAT_LABEL_ZH,
  getBaseStats,
  getRow,
  hasRow,
  getTable,
  getCultivationRequired,
  getCultivationRow,
  getCultivationTable,
  getShouyuanForRealm,
  getShouyuanRow,
  getShouyuanTable,
  getMajorBreakthroughChance,
  rollMajorBreakthrough,
  rollBreakthroughWithProbability,
  getMajorBreakthroughTable,
  MIN_NARRATIVE_AGE_BY_MAJOR,
  getMinNarrativeAgeForMajor,
  getProtagonistNarrativeAge,
  REALM_EQUIP_BONUS_RATIO_TABLE,
  getEquipBonusRealmRatio,
} as const;
