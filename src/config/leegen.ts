/**
 * @fileoverview 灵根与基础属性的对应及大境界倍率（与 mortal_journey `leegen_state.js` / `LinggenState` 对齐）。
 *
 * 规则：
 * - 金 → 物攻、法攻；木 → 神识；水 → 法力；火 → 血量；土 → 物防、法防
 * - 倍率按大境界：练气 1.05，筑基 1.10，结丹 1.20，元婴 1.5，化神 2.0（与初/中/后期无关）
 *
 * 用法（与 PlayerBaseRuntime 一致：须在境界表 + 全部平面加成合并之后再乘）：
 * `applyToBase(已含天赋装备等加成的面板, "练气", "真灵根 金, 木")`
 */

import type { PlayerBaseStats } from "../types/playInfo";
import type { PlayerStatBonusKey } from "../types/zhPlayerStats";

// ---------------------------------------------------------------------------
// 常量表（与 leegen_state.js 一致）
// ---------------------------------------------------------------------------

/** 五行字符（用于从灵根描述中解析）。 */
export const ELEMENT_CHARS = ["金", "木", "水", "火", "土"] as const;

/** 五行单字类型。 */
export type FiveElement = (typeof ELEMENT_CHARS)[number];

/**
 * 各灵根影响的属性键（与 `PlayerBaseStats` / CharacterAttribute base 一致）。
 */
export const ELEMENT_TO_STATS = {
  金: ["patk"],
  木: ["matk"],
  水: ["mp"],
  火: ["hp"],
  土: ["pdef", "mdef"],
} as const satisfies Readonly<Record<FiveElement, readonly PlayerStatBonusKey[]>>;

/**
 * 大境界 → 灵根倍率（练气含初/中/后期，均用同一倍率）。
 */
export const REALM_LINGGEN_MULT = {
  练气: 1.05,
  筑基: 1.1,
  结丹: 1.2,
  元婴: 1.5,
  化神: 2.0,
} as const satisfies Readonly<Record<string, number>>;

/** 境界未命中表时的默认倍率。 */
export const DEFAULT_LINGGEN_REALM_MULT = 1.0;

// ---------------------------------------------------------------------------
// 工具函数（与 LinggenState API 对齐）
// ---------------------------------------------------------------------------

/**
 * 规范化大境界名（支持「练气期」、去尾部「期」与 trim）。
 *
 * @param realm - 原始大境界字符串。
 * @returns 规范化后的键；空入参返回空串。
 */
export function normalizeLinggenRealm(realm: string | null | undefined): string {
  if (realm == null) return "";
  let s = String(realm).trim();
  if (s.endsWith("期")) s = s.slice(0, -1).trim();
  return s;
}

/**
 * 取当前大境界下，灵根提供的属性倍率（未知境界为 `DEFAULT_LINGGEN_REALM_MULT`）。
 *
 * @param realm - 大境界，如「练气」或「练气期」。
 * @returns 倍率数值。
 */
export function getRealmLinggenMultiplier(realm: string): number {
  const key = normalizeLinggenRealm(realm);
  const m = (REALM_LINGGEN_MULT as Readonly<Record<string, number>>)[key];
  return typeof m === "number" && Number.isFinite(m) ? m : DEFAULT_LINGGEN_REALM_MULT;
}

/**
 * 从灵根字符串中解析出现的五行（去重，按首次出现顺序）。
 * 例：`"真灵根 金, 木"` → `["金","木"]`；`"无灵根"` → `[]`。
 *
 * @param linggenText - 灵根完整描述或元素拼接文案。
 * @returns 五行字符数组。
 */
export function parseLinggenElements(linggenText: string | null | undefined): FiveElement[] {
  if (linggenText == null || linggenText === "") return [];
  const text = String(linggenText);
  const seen = new Set<FiveElement>();
  const out: FiveElement[] = [];
  const allowed = new Set<string>(ELEMENT_CHARS);
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (!allowed.has(ch)) continue;
    const el = ch as FiveElement;
    if (seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

/**
 * 查询某一五行灵根影响的属性键列表。
 *
 * @param element - `金` | `木` | `水` | `火` | `土`。
 * @returns 受影响的 `PlayerStatBonusKey` 只读列表；非法元素返回空数组。
 */
export function getAffectedStatKeysByElement(element: string): readonly PlayerStatBonusKey[] {
  if (element in ELEMENT_TO_STATS) {
    return ELEMENT_TO_STATS[element as FiveElement];
  }
  return [];
}

/**
 * 将灵根倍率应用到「已合并平面加成后」的基础十维（不修改入参，返回新对象）。
 * 多种灵根各乘各自负责属性；同一属性被多条规则命中时会多次相乘（五行分工下通常不重叠）。
 *
 * @param baseStats - 已含境界底数与装备/功法等加成的 `PlayerBaseStats`。
 * @param realm - 大境界。
 * @param linggenText - 灵根描述或仅含五行的串（如建档 roll 文案，或 `["金","木"].join("")`）。
 * @returns 乘算后的新 `PlayerBaseStats`。
 */
export function applyLinggenToPlayerBase(
  baseStats: PlayerBaseStats,
  realm: string,
  linggenText: string,
): PlayerBaseStats {
  const out: PlayerBaseStats = { ...baseStats };
  const elements = parseLinggenElements(linggenText);
  if (elements.length === 0) return out;

  const mult = getRealmLinggenMultiplier(realm);
  if (mult === DEFAULT_LINGGEN_REALM_MULT) return out;

  for (const el of elements) {
    const stats = ELEMENT_TO_STATS[el];
    if (!stats) continue;
    for (const key of stats) {
      const v = out[key];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      out[key] = v * mult;
    }
  }

  return out;
}