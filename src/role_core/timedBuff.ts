/**
 * @fileoverview 限时增益：按世界时间到期的主属性百分比增减。
 *
 * 与 `Character.elixirBonuses`（永久、固定值）的区别：
 * - 限时：携带绝对到期世界时间 `expiresAt`，世界时间越过后自动失效。
 * - 百分比：主属性跨境界有 20 倍以上量级差（练气身法 2 → 化神身法 46），
 *   固定值在低境界会失衡，故一律按百分比结算。
 * - 可为负：用于「攻防互换」类增益的代价项（如酒：法攻↑法防↓）。
 *
 * 到期判定是惰性的——`activeTimedBuffs` 每次按当前世界时间过滤，
 * 因此即便某次时间推进没有触发清理，过期增益也不会生效；
 * `purgeExpiredTimedBuffs` 只负责把失效项从列表里物理移除，避免存档无限膨胀。
 */

import type { PrimaryStatKey } from "./types/playInfo";
import { PRIMARY_STAT_KEYS } from "./types/playInfo";
import type { WorldTime } from "./worldTime";
import { advanceWorldTime, cloneWorldTime, ensureWorldTime, worldTimeToDays } from "./worldTime";

/** 一条限时增益。 */
export interface TimedBuff {
  /** 唯一标识，用于移除/去重。 */
  id: string;
  /** 来源物品名（如「青心绿茶」），面板展示用。 */
  name: string;
  /** 效果描述，面板展示用。 */
  desc: string;
  /**
   * 主属性百分比增减：`+15` 表示 +15%，`-10` 表示 -10%。
   * 未列出的属性不受影响。
   */
  statPercents: Partial<Record<PrimaryStatKey, number>>;
  /** 生效起始世界时间（展示「已持续/共 N 天」用）。 */
  startedAt: WorldTime;
  /** 到期世界时间（绝对）。当前世界时间 ≥ 此值即失效。 */
  expiresAt: WorldTime;
}

let seq = 0;

/**
 * 构造一条从 `now` 起、持续 `days` 天的限时增益。
 *
 * @param name 来源物品名。
 * @param desc 效果描述。
 * @param statPercents 主属性百分比增减。
 * @param now 当前世界时间。
 * @param days 持续天数。
 * @return 新的 {@link TimedBuff}。
 */
export function createTimedBuff(
  name: string,
  desc: string,
  statPercents: Partial<Record<PrimaryStatKey, number>>,
  now: WorldTime,
  days: number,
): TimedBuff {
  const start = ensureWorldTime(cloneWorldTime(now));
  return {
    id: `buff_${Date.now().toString(36)}_${(seq++).toString(36)}`,
    name,
    desc,
    statPercents: { ...statPercents },
    startedAt: start,
    expiresAt: advanceWorldTime(start, { days: Math.max(1, Math.floor(days)) }),
  };
}

/** 该增益在当前世界时间下是否仍然有效。 */
export function isTimedBuffActive(buff: TimedBuff, now: WorldTime): boolean {
  return worldTimeToDays(ensureWorldTime(now)) < worldTimeToDays(ensureWorldTime(buff.expiresAt));
}

/** 按当前世界时间过滤出仍然生效的增益。 */
export function activeTimedBuffs(buffs: readonly TimedBuff[], now: WorldTime): TimedBuff[] {
  return buffs.filter((b) => isTimedBuffActive(b, now));
}

/** 剩余天数（向上取整，最少 0）。用于面板展示。 */
export function timedBuffDaysLeft(buff: TimedBuff, now: WorldTime): number {
  const left = worldTimeToDays(ensureWorldTime(buff.expiresAt)) - worldTimeToDays(ensureWorldTime(now));
  return left <= 0 ? 0 : Math.ceil(left);
}

/**
 * 把生效中的增益按百分比施加到已聚合的主属性上。
 *
 * 同属性多条增益的百分比**先求和再施加**（而非逐条连乘），
 * 使「+20% 与 -20%」互相抵消，避免连乘导致的净负偏差。
 * 结果向下取整，且不低于 0。
 *
 * @param stats 已聚合的主属性（会被就地修改）。
 * @param buffs 生效中的增益列表。
 */
export function applyTimedBuffsToStats(
  stats: Record<string, number>,
  buffs: readonly TimedBuff[],
): void {
  if (buffs.length === 0) return;
  const totals: Partial<Record<PrimaryStatKey, number>> = {};
  for (const b of buffs) {
    for (const [k, v] of Object.entries(b.statPercents)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v === 0) continue;
      const key = k as PrimaryStatKey;
      totals[key] = (totals[key] ?? 0) + v;
    }
  }
  for (const key of PRIMARY_STAT_KEYS) {
    const pct = totals[key];
    if (pct == null || pct === 0) continue;
    const base = stats[key] ?? 0;
    stats[key] = Math.max(0, Math.trunc(base * (1 + pct / 100)));
  }
}

/** 移除已失效的增益，返回新列表（不修改入参）。 */
export function purgeExpiredTimedBuffs(buffs: readonly TimedBuff[], now: WorldTime): TimedBuff[] {
  return activeTimedBuffs(buffs, now);
}

/** 归一化限时增益列表（用于反序列化）：丢弃结构不合法的条目。 */
export function normalizeTimedBuffs(raw: unknown): TimedBuff[] {
  if (!Array.isArray(raw)) return [];
  const out: TimedBuff[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const expiresAt = o.expiresAt as WorldTime | undefined;
    if (!id || !expiresAt || typeof expiresAt !== "object") continue;
    const percents: Partial<Record<PrimaryStatKey, number>> = {};
    if (o.statPercents && typeof o.statPercents === "object") {
      for (const [k, v] of Object.entries(o.statPercents as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v !== 0
          && (PRIMARY_STAT_KEYS as readonly string[]).includes(k)) {
          percents[k as PrimaryStatKey] = v;
        }
      }
    }
    out.push({
      id,
      name: typeof o.name === "string" ? o.name : "",
      desc: typeof o.desc === "string" ? o.desc : "",
      statPercents: percents,
      startedAt: ensureWorldTime((o.startedAt as WorldTime) ?? expiresAt),
      expiresAt: ensureWorldTime(expiresAt),
    });
  }
  return out;
}
