/**
 * 灵石炼化修为：与 `mortal_journey/js/ui/mainScreen_panel_realm.js` 中
 * `getSpiritStoneCultivationValue` / `getSpiritStoneEfficiencyFactorForRootCount` /
 * `computeSpiritStoneTotalGain` / `performAbsorbSpiritStonesFromBag` / `applyRealmBreakthroughs` 对齐。
 * 表列基准修为 = 灵石 `value`（下品 10、中品 100…）；灵根越多单颗折算越低。
 * 化神与其它大境界相同，含初期 / 中期 / 后期（见 `realm_state.CULTIVATION_TABLE`），不再按「化神无小境界」特例处理。
 * 单次炼化（修炼 / 尽数）最多推进一个小境界：本段至多补满；若触发突破，突破后修为为 0（余量不带入下一段），且不连跳多个小境界。
 * 本段剩余修为少于「整批灵石折算修为」时，仍消耗整颗灵石，但只将修为加到本段上限（折算溢出部分不计入下一段）。
 * 高品阶单颗折算远超本段缺口时，溢出修为点（与灵石 `value` 同刻度）按「大面额优先」换回灵石并入袋；不足 10 点无法凑成一颗下品时舍去。
 */

import { getBaseStats, getCultivationRequired, getShouyuanForRealm, REALM_ORDER, SUB_STAGES } from "../config/realm_state";
import { parseLinggenElements } from "../config/leegen";
import {
  mjDescribeSpiritStones,
  SPIRIT_STONE_INVENTORY_KIND,
  SPIRIT_STONE_TABLE_KEYS_ORDERED,
  type SpiritStoneName,
} from "../types/spiritStone";
import type { InventoryStackItem, ProtagonistPlayInfo } from "../types/playInfo";
import type { SpiritStoneInventoryStack } from "../types/spiritStone";
import { createSpiritStoneInventoryStack } from "../types/spiritStone";
import { PLAYER_STAT_BONUS_KEYS } from "../types/zhPlayerStats";
import { getProtagonistDerivedStats, linggenElementsToParseText } from "./protagonistDerivedStats";
import { DEFAULT_INVENTORY_SLOT_COUNT, INVENTORY_SLOT_EXPAND_STEP } from "./protagonistFromFateChoice";

const STONE_NAMES = new Set<string>(Object.keys(mjDescribeSpiritStones));

export function isSpiritStoneCultivationName(name: string): boolean {
  const nm = String(name || "").trim();
  return nm !== "" && STONE_NAMES.has(nm);
}

/** 单颗灵石表列基准修为（与 `mjDescribeSpiritStones[].value` 一致）。 */
export function getSpiritStoneBaseXiuwei(itemName: string): number {
  const nm = String(itemName || "").trim() as SpiritStoneName;
  if (!STONE_NAMES.has(nm)) return 0;
  return mjDescribeSpiritStones[nm].value;
}

/**
 * 灵根种数对应的单件效率（1→100%，2→50%，3→33%，四及以上→25%）。
 * 无灵根时调用方传入 effN=1，与单灵根同满额。
 */
export function getSpiritStoneEfficiencyFactorForRootCount(effN: number): number {
  const n = Number.isFinite(effN) ? Math.floor(effN) : 1;
  if (n <= 1) return 1;
  if (n === 2) return 0.8;
  if (n === 3) return 0.6;
  return 0.4;
}

/** 五行去重种数；0 时在修为公式中按 1 计（与 MJ 一致）。 */
export function effectiveLinggenRootCount(linggen: string[]): number {
  const n = parseLinggenElements(linggenElementsToParseText(linggen)).length;
  return n <= 0 ? 1 : n;
}

/** 单颗灵石折算修为（未取整）；表列基准 × 灵根系数。 */
export function getSpiritStoneRawPerPiece(itemName: string, linggen: string[]): number {
  const base = getSpiritStoneBaseXiuwei(itemName);
  if (base <= 0) return 0;
  const effN = effectiveLinggenRootCount(linggen);
  const f = getSpiritStoneEfficiencyFactorForRootCount(effN);
  return base * f;
}

/** 修为点数展示：整数不显示小数，否则最多两位并去尾零。 */
export function formatSpiritStonePointsForUi(x: number): string {
  if (typeof x !== "number" || !Number.isFinite(x) || x <= 0) return "";
  const t = Math.round(x * 100) / 100;
  if (Math.abs(t - Math.round(t)) < 1e-9) return String(Math.round(t));
  return t
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

/** 本批炼化总修为：`round(基准 × 灵根系数 × 件数)`。 */
export function computeSpiritStoneTotalGain(base: number, linggenFactor: number, pieceCount: number): number {
  const b = typeof base === "number" && Number.isFinite(base) ? base : 0;
  const f = typeof linggenFactor === "number" && Number.isFinite(linggenFactor) ? linggenFactor : 0;
  const n = typeof pieceCount === "number" && Number.isFinite(pieceCount) ? Math.max(0, Math.floor(pieceCount)) : 0;
  if (b <= 0 || f <= 0 || n <= 0) return 0;
  return Math.round(b * f * n);
}

function getNextMinorStage(minor: string): string | null {
  const m = String(minor || "").trim();
  const i = (SUB_STAGES as readonly string[]).indexOf(m);
  if (i < 0 || i >= SUB_STAGES.length - 1) return null;
  return SUB_STAGES[i + 1]!;
}

function getNextMajorRealm(major: string): string | null {
  const maj = String(major || "").trim();
  const j = REALM_ORDER.indexOf(maj as (typeof REALM_ORDER)[number]);
  if (j < 0 || j >= REALM_ORDER.length - 1) return null;
  return REALM_ORDER[j + 1]!;
}

/** 模拟修为经小境界连环突破（不写回）；遇大境界后期卡点同 MJ。 */
export function simulateSmallBreakthroughsFromState(
  xiuwei: number,
  major: string,
  minor: string,
): { xiuwei: number; major: string; minor: string } {
  let maj = String(major || "").trim() || "练气";
  let min = String(minor || "").trim() || "初期";
  let X = typeof xiuwei === "number" && Number.isFinite(xiuwei) ? Math.floor(xiuwei) : 0;
  let guard = 0;
  while (guard++ < 48) {
    const req = getCultivationRequired(maj, min);
    if (req == null || req <= 0) break;
    if (X < req) break;
    const nextMinor = getNextMinorStage(min);
    if (nextMinor != null) {
      X -= req;
      min = nextMinor;
      continue;
    }
    if (min !== "后期") break;
    if (getNextMajorRealm(maj) == null) break;
    break;
  }
  return { xiuwei: Math.max(0, Math.floor(X)), major: maj, minor: min };
}

/** 修为增量为 `actualAdd`（已含「本段上限」截断）时，是否满足大境界后期瓶颈规则。 */
function spiritStoneGainWithinLateStageCapWithAdd(
  curXiuwei: number,
  major: string,
  minor: string,
  actualAdd: number,
): boolean {
  if (actualAdd <= 0) return false;
  const sim = simulateSmallBreakthroughsFromState(curXiuwei + actualAdd, major, minor);
  if (sim.minor !== "后期") return true;
  const req = getCultivationRequired(sim.major, sim.minor);
  if (req == null || req <= 0) return true;
  return sim.xiuwei <= req;
}

function spiritStoneGainWithinLateStageCap(
  curXiuwei: number,
  major: string,
  minor: string,
  stoneBase: number,
  linggenFactor: number,
  stoneCount: number,
): boolean {
  if (stoneCount <= 0) return true;
  const add = computeSpiritStoneTotalGain(stoneBase, linggenFactor, stoneCount);
  if (add <= 0) return false;
  return spiritStoneGainWithinLateStageCapWithAdd(curXiuwei, major, minor, add);
}

/**
 * 单次炼化允许增加的最大修为：至多达到当前阶段需求（`req0 - cur`）。
 * 若本段尚有下一个小境界，则不会超过「刚好突破」所需——突破后修为为 0，不把溢出算进下一段（例如初期 0 尽数修炼后应为中期 0，而非中期带余量）。
 * 已为「后期」时同式，仅补满本段、不跨大境界。
 */
export function maxSpiritStoneGainForOneMinorStep(p: ProtagonistPlayInfo): number {
  const major = String(p.realm.major || "").trim() || "练气";
  const minor = String(p.realm.minor || "").trim() || "初期";
  const cur = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;
  const req0 = getCultivationRequired(major, minor);
  if (req0 == null || req0 <= 0) return Number.MAX_SAFE_INTEGER;
  if (cur >= req0) return 0;
  return Math.max(0, req0 - cur);
}

/**
 * 在「单次一小境界」上限与后期瓶颈下，从至多 `nAvail` 颗灵石中选颗数，使实际修为增量最大；同增量时优先更少颗（更少浪费）。
 * 实际增量 = `min(阶段上限, round(基准×系数×颗数))`，解决「单颗折算 6、本段只差 4」时原二分无法选任何颗的问题。
 */
function pickStoneCountAndGainForSpiritStoneCultivation(
  p: ProtagonistPlayInfo,
  stoneBase: number,
  linggenFactor: number,
  nAvail: number,
): { useN: number; gain: number } {
  if (stoneBase <= 0 || linggenFactor <= 0 || nAvail <= 0) return { useN: 0, gain: 0 };
  const capGain = maxSpiritStoneGainForOneMinorStep(p);
  if (capGain <= 0) return { useN: 0, gain: 0 };
  const major = String(p.realm.major || "").trim() || "练气";
  const minor = String(p.realm.minor || "").trim() || "初期";
  const cur = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;
  let bestGain = 0;
  let bestN = 0;
  for (let n = 1; n <= nAvail; n++) {
    const raw = computeSpiritStoneTotalGain(stoneBase, linggenFactor, n);
    const g = Math.min(capGain, raw);
    if (g <= 0) continue;
    if (!spiritStoneGainWithinLateStageCapWithAdd(cur, major, minor, g)) continue;
    if (g > bestGain || (g === bestGain && (bestN === 0 || n < bestN))) {
      bestGain = g;
      bestN = n;
    }
  }
  return { useN: bestN, gain: bestGain };
}

/** 品阶从高到低，用于将溢出修为点贪心拆回灵石（与 `mjDescribeSpiritStones[].value` 一致）。 */
const SPIRIT_STONE_NAMES_VALUE_DESC: readonly SpiritStoneName[] = [...SPIRIT_STONE_TABLE_KEYS_ORDERED].reverse();

/**
 * 将等价刻度点数（与灵石 `value`、物品 `value` 同轴）拆成各档灵石颗数；不足 10 点无法凑成一颗下品时整段不产出。
 * 售卖、炼化溢出回袋等均复用此逻辑。
 */
export function valueToSpiritStoneCounts(valuePoints: number): Array<{ name: SpiritStoneName; count: number }> {
  let x = typeof valuePoints === "number" && Number.isFinite(valuePoints) ? Math.floor(valuePoints) : 0;
  if (x < 10) return [];
  const out: Array<{ name: SpiritStoneName; count: number }> = [];
  for (const name of SPIRIT_STONE_NAMES_VALUE_DESC) {
    const v = mjDescribeSpiritStones[name].value;
    if (v <= 0) continue;
    const c = Math.floor(x / v);
    if (c > 0) {
      out.push({ name, count: c });
      x -= c * v;
    }
  }
  return out;
}

/** 炼化溢出修为点 → 灵石档次数组（同 {@link valueToSpiritStoneCounts}）。 */
export function spiritStoneExcessXiuweiToStoneCounts(excess: number): Array<{ name: SpiritStoneName; count: number }> {
  return valueToSpiritStoneCounts(excess);
}

/** 将灵石档次数组格式化为「9个上品灵石、8个中品灵石、3个下品灵石」式文案。 */
export function formatSpiritStoneCountsForUi(chunks: ReadonlyArray<{ name: SpiritStoneName; count: number }>): string {
  return chunks.map((c) => `${c.count}个${c.name}`).join("、");
}

/** 与 `protagonistManager.compactInventorySlotsInPlace` 一致，避免循环依赖。 */
function compactInventorySlotsInPlace(slots: Array<InventoryStackItem | null>): void {
  const len = slots.length;
  let w = 0;
  for (let r = 0; r < len; r++) {
    const cell = slots[r];
    if (cell != null) {
      if (w !== r) slots[w] = cell;
      w++;
    }
  }
  const itemCount = w;
  const targetLen = Math.max(
    DEFAULT_INVENTORY_SLOT_COUNT,
    Math.ceil(itemCount / INVENTORY_SLOT_EXPAND_STEP) * INVENTORY_SLOT_EXPAND_STEP,
  );
  for (let i = itemCount; i < targetLen; i++) slots[i] = null;
  slots.length = targetLen;
}

function findFirstEmptyInventorySlot(p: ProtagonistPlayInfo): number {
  for (let i = 0; i < p.inventorySlots.length; i++) {
    if (p.inventorySlots[i] == null) return i;
  }
  return -1;
}

function ensureInventoryHasEmptySlot(p: ProtagonistPlayInfo): void {
  if (findFirstEmptyInventorySlot(p) >= 0) return;
  for (let c = 0; c < INVENTORY_SLOT_EXPAND_STEP; c++) p.inventorySlots.push(null);
}

function tryMergeSpiritStoneIntoBag(p: ProtagonistPlayInfo, name: SpiritStoneName, addCount: number): boolean {
  if (addCount <= 0) return false;
  for (let i = 0; i < p.inventorySlots.length; i++) {
    const cell = p.inventorySlots[i];
    if (!cell || "itemType" in cell) continue;
    const st = cell as SpiritStoneInventoryStack;
    if (st.type === SPIRIT_STONE_INVENTORY_KIND && st.name === name) {
      const prev = typeof st.count === "number" && Number.isFinite(st.count) ? Math.max(1, Math.floor(st.count)) : 1;
      p.inventorySlots[i] = createSpiritStoneInventoryStack(name, prev + addCount);
      return true;
    }
  }
  return false;
}

function placeSpiritStoneRefundInBag(p: ProtagonistPlayInfo, name: SpiritStoneName, count: number): void {
  if (count <= 0) return;
  if (tryMergeSpiritStoneIntoBag(p, name, count)) return;
  let guard = 0;
  while (guard++ < 64) {
    ensureInventoryHasEmptySlot(p);
    const idx = findFirstEmptyInventorySlot(p);
    if (idx >= 0) {
      p.inventorySlots[idx] = createSpiritStoneInventoryStack(name, count);
      return;
    }
  }
}

/** 将已拆好的各档灵石颗数放入储物袋（合并同名堆叠并整理格子）。 */
export function grantSpiritStoneCountsToInventory(
  p: ProtagonistPlayInfo,
  chunks: ReadonlyArray<{ name: SpiritStoneName; count: number }>,
): void {
  for (const ch of chunks) {
    placeSpiritStoneRefundInBag(p, ch.name, ch.count);
  }
  compactInventorySlotsInPlace(p.inventorySlots);
}

function applySpiritStoneExcessRefundToBag(p: ProtagonistPlayInfo, excessXiuweiPoints: number): void {
  grantSpiritStoneCountsToInventory(p, valueToSpiritStoneCounts(excessXiuweiPoints));
}

/** 每一大境界的「后期」在跨下一跳大境界前，修为不得超过本阶段需求（含化神后期，已是终段则无下一境界）。 */
export function getLateStageMajorBottleneckXiuweiCap(p: ProtagonistPlayInfo): number | null {
  const major = String(p.realm.major || "").trim() || "练气";
  const minor = String(p.realm.minor || "").trim() || "初期";
  if (minor !== "后期") return null;
  const req = getCultivationRequired(major, minor);
  if (req == null || req <= 0) return null;
  return req;
}

export function clampXiuweiToLateStageCapIfNeeded(p: ProtagonistPlayInfo): void {
  const cap = getLateStageMajorBottleneckXiuweiCap(p);
  if (cap == null) return;
  const X = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;
  if (X > cap) p.xiuwei = cap;
}

function syncPlayerBaseFromRealmTable(p: ProtagonistPlayInfo): void {
  const tb = getBaseStats(p.realm.major, p.realm.minor);
  if (!tb) return;
  for (const k of PLAYER_STAT_BONUS_KEYS) {
    p.playerBase[k] = tb[k];
  }
  const sy = getShouyuanForRealm(p.realm.major, p.realm.minor);
  if (sy != null) p.shouyuan = Math.max(typeof p.shouyuan === "number" && Number.isFinite(p.shouyuan) ? Math.floor(p.shouyuan) : 0, sy);
}

/**
 * 按当前 `realm` 查表写回 `playerBase`、寿元与派生血蓝上限（大境界手动改境界后调用，与自动小境界突破内同步一致）。
 */
export function syncProtagonistRealmDerived(p: ProtagonistPlayInfo): void {
  syncPlayerBaseFromRealmTable(p);
  syncHpMpFromDerived(p);
}

function syncHpMpFromDerived(p: ProtagonistPlayInfo): void {
  const d = getProtagonistDerivedStats(p);
  if (!d) return;
  const hp = Math.max(1, Math.round(d.hp));
  const mp = Math.max(1, Math.round(d.mp));
  p.maxHp = hp;
  p.maxMp = mp;
  p.currentHp = hp;
  p.currentMp = mp;
}

/**
 * 修为达到阶段需求时自动小境界突破（扣需求、升阶段）；大境界后期不自动跳大境界。
 *
 * @returns 用于日志的提示文案。
 */
export function applyRealmBreakthroughs(p: ProtagonistPlayInfo): string[] {
  const msgs: string[] = [];
  let guard = 0;
  while (guard++ < 48) {
    const major = String(p.realm.major || "").trim() || "练气";
    const minor = String(p.realm.minor || "").trim() || "初期";
    const req = getCultivationRequired(major, minor);
    if (req == null || req <= 0) break;
    const X = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;
    if (X < req) break;
    const nextMinor = getNextMinorStage(minor);
    if (nextMinor != null) {
      p.xiuwei = X - req;
      p.realm = { major, minor: nextMinor };
      syncPlayerBaseFromRealmTable(p);
      syncHpMpFromDerived(p);
      msgs.push(`突破成功：已达「${major}${nextMinor}」`);
      continue;
    }
    break;
  }
  p.xiuwei = Math.max(0, Math.floor(p.xiuwei));
  return msgs;
}

/**
 * 消耗储物袋一格灵石堆叠，增加修为并尝试小境界突破。
 *
 * @param consumeAll - 为 `true` 时炼化该格全部在「单次一小境界」与后期瓶颈下允许的最大颗数。
 * @param customCount - 与 `consumeAll` 互斥时指定颗数（正整数，与堆叠取小）。
 */
export function performAbsorbSpiritStonesFromBag(
  p: ProtagonistPlayInfo,
  bagIndex: number,
  consumeAll: boolean,
  customCount?: number,
): boolean {
  if (bagIndex < 0 || bagIndex >= p.inventorySlots.length) return false;
  const cell = p.inventorySlots[bagIndex] as InventoryStackItem | null;
  if (!cell || "itemType" in cell) return false;
  const st = cell as SpiritStoneInventoryStack;
  const stoneBase = getSpiritStoneBaseXiuwei(st.name);
  if (stoneBase <= 0) return false;
  const effN = effectiveLinggenRootCount(p.linggen);
  const lingF = getSpiritStoneEfficiencyFactorForRootCount(effN);
  if (lingF <= 0) return false;
  const cnt = typeof st.count === "number" && Number.isFinite(st.count) ? Math.max(1, Math.floor(st.count)) : 1;
  let useN: number;
  if (consumeAll) {
    useN = cnt;
  } else if (typeof customCount === "number" && Number.isFinite(customCount)) {
    useN = Math.round(customCount);
    if (useN <= 0) return false;
    useN = Math.min(cnt, useN);
  } else {
    useN = 1;
  }
  const picked = pickStoneCountAndGainForSpiritStoneCultivation(p, stoneBase, lingF, useN);
  const useNFinal = picked.useN;
  const gain = picked.gain;
  if (useNFinal <= 0 || gain <= 0) return false;
  const cur = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;
  p.xiuwei = cur + gain;
  const rawTotal = computeSpiritStoneTotalGain(stoneBase, lingF, useNFinal);
  const excessXiuwei = rawTotal - gain;
  const left = cnt - useNFinal;
  if (left <= 0) {
    p.inventorySlots[bagIndex] = null;
  } else {
    p.inventorySlots[bagIndex] = createSpiritStoneInventoryStack(st.name, left);
  }
  if (excessXiuwei >= 10) {
    applySpiritStoneExcessRefundToBag(p, excessXiuwei);
  }
  applyRealmBreakthroughs(p);
  clampXiuweiToLateStageCapIfNeeded(p);
  return true;
}
