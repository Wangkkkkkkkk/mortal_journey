/**
 * 大境界突破：后期修为圆满后手动掷骰（与 `mortal_journey/js/ui/mainScreen_panel_realm.js` 对齐）。
 * 基础成功率来自 `realm_state.MAJOR_BREAKTHROUGH_TABLE`；突破丹药 `effects.breakthrough[].chanceBonus` 叠加上限 100%。
 */

import {
  getCultivationRequired,
  getMajorBreakthroughChance,
  REALM_ORDER,
  type RealmMajor,
} from "../config/realm_state";
import type { InventoryStackItem, ProtagonistPlayInfo } from "../types/playInfo";

/** 大境界失败时剩余修为 = 当前 × 该系数（与 MJ `MAJOR_BREAK_FAIL_XIUWEI_FACTOR` 一致） */
export const MAJOR_BREAK_FAIL_XIUWEI_FACTOR = 0.7;

export interface MajorBreakthroughReadyContext {
  major: string;
  minor: string;
  nextMaj: string;
  req: number;
  baseP: number;
}

function getNextMajorRealm(major: string): string | null {
  const maj = String(major || "").trim();
  const j = REALM_ORDER.indexOf(maj as RealmMajor);
  if (j < 0 || j >= REALM_ORDER.length - 1) return null;
  return REALM_ORDER[j + 1]!;
}

/**
 * 当前是否处于「大境界后期修为已满、可尝试下一跳大境界」（化神后期无下一跳）。
 */
export function getMajorBreakthroughReadyContext(
  p: ProtagonistPlayInfo | null,
): MajorBreakthroughReadyContext | null {
  if (!p) return null;
  const major = String(p.realm.major || "").trim() || "练气";
  const minor = String(p.realm.minor || "").trim() || "初期";
  if (major === "化神") return null;
  if (minor !== "后期") return null;
  const req = getCultivationRequired(major, minor);
  if (req == null || req <= 0) return null;
  const X = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;
  if (X < req) return null;
  const nextMaj = getNextMajorRealm(major);
  if (nextMaj == null) return null;
  const baseP = getMajorBreakthroughChance(major, nextMaj);
  if (baseP == null || baseP <= 0) return null;
  return { major, minor, nextMaj, req, baseP };
}

/**
 * 从物品定义读取对「fromRealm→toRealm」的突破成功率加成（比例，如 0.05 表示 +5%）。
 */
export function getPillBreakthroughBonusDelta(
  item: InventoryStackItem | null,
  fromRealm: string,
  toRealm: string,
): number {
  if (!item || !("itemType" in item)) return 0;
  const t = item.itemType;
  if (t !== "丹药" && t !== "突破丹药") return 0;
  const eff = (item as { effects?: unknown }).effects;
  if (!eff || typeof eff !== "object") return 0;
  const br = (eff as { breakthrough?: unknown }).breakthrough;
  if (!Array.isArray(br)) return 0;
  const fromS = String(fromRealm || "").trim();
  const toS = String(toRealm || "").trim();
  for (const bb of br) {
    if (!bb || typeof bb !== "object") continue;
    const b = bb as { from?: unknown; to?: unknown; chanceBonus?: unknown };
    if (String(b.from || "").trim() === fromS && String(b.to || "").trim() === toS) {
      const cb0 = b.chanceBonus;
      return typeof cb0 === "number" && Number.isFinite(cb0) ? Math.max(0, cb0) : 0;
    }
  }
  return 0;
}

export type MajorBreakModalSlotSelection = { bagIdx: number; name: string } | null;

/**
 * 弹窗内总成功率：基础概率 + 各格丹药加成，上限 1。
 */
export function computeMajorBreakModalTotalP(
  baseP: number,
  fromMajor: string,
  toMajor: string,
  slots: readonly MajorBreakModalSlotSelection[],
  getItem: (bagIdx: number) => InventoryStackItem | null,
): number {
  let add = 0;
  for (const s of slots) {
    if (!s) continue;
    const it = getItem(s.bagIdx);
    add += getPillBreakthroughBonusDelta(it, fromMajor, toMajor);
  }
  return Math.min(1, baseP + add);
}

/** UI 显示用：概率格式化为两位小数的百分比文案 */
export function formatMajorBreakthroughPctForUi(p: number): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "0%";
  return `${Math.round(p * 10000) / 100}%`;
}
