/**
 * 修仙界「世界时间」：以结构化字段为唯一数据源，界面文案仅由格式化函数派生。
 *
 * 历法规则（简化）：每月固定 30 天，每年 12 月 = 360 天。
 */

export interface WorldTime {
  year: number;
  month: number;
  day: number;
  hour: number;
}

/**
 * 世界时间增量。
 * - `years` / `months` / `days` / `hour` 均为**增量**（累加到当前时间）。
 * - `hour` 累加到 WorldTime.hour，溢出时自动进位到天。
 */
export interface TimeDelta {
  years?: number;
  months?: number;
  days?: number;
  hour?: number;
}

const DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

export function createDefaultWorldTime(): WorldTime {
  return { year: 1, month: 1, day: 1, hour: 8 };
}

export function cloneWorldTime(t: WorldTime): WorldTime {
  return {
    year: t.year,
    month: t.month,
    day: t.day,
    hour: t.hour,
  };
}

function pad2(n: number): string {
  return Math.max(0, Math.floor(n)).toString().padStart(2, "0");
}

function pad4(n: number): string {
  return Math.max(0, Math.floor(n)).toString().padStart(4, "0");
}

/** 例：`0001年01月01号`（仅展示用，不参与业务计算） */
export function formatWorldTimeZhDisplay(t: WorldTime): string {
  return `${pad4(t.year)}年${pad2(t.month)}月${pad2(t.day)}号`;
}

/**
 * 自 `from` 到 `to` 经过的整年数（仅比较年分量；后续若需精确到月日可在此扩展）。
 * 用于：显示年龄 = 开局档案年龄 + 经过年数。
 */
export function calendarYearsElapsed(from: WorldTime, to: WorldTime): number {
  const d = to.year - from.year;
  return d > 0 ? d : 0;
}

export function addYearsToTime(t: WorldTime, years: number): WorldTime {
  if (!Number.isFinite(years) || years <= 0) return cloneWorldTime(t);
  return normalizeWorldTime({
    year: t.year + Math.floor(years),
    month: t.month,
    day: t.day,
    hour: t.hour,
  });
}

/**
 * 将溢出的天/月/年进位规范化。
 * 规则：每月 30 天，每年 12 月。
 */
export function normalizeWorldTime(t: WorldTime): WorldTime {
  let { year, month, day, hour } = t;

  if (hour >= 24) {
    const extraDays = Math.floor(hour / 24);
    day += extraDays;
    hour = hour % 24;
  } else if (hour < 0) {
    hour = 0;
  }

  if (day > DAYS_PER_MONTH) {
    const extraMonths = Math.floor((day - 1) / DAYS_PER_MONTH);
    day = ((day - 1) % DAYS_PER_MONTH) + 1;
    month += extraMonths;
  } else if (day < 1) {
    day = 1;
  }

  if (month > MONTHS_PER_YEAR) {
    const extraYears = Math.floor((month - 1) / MONTHS_PER_YEAR);
    month = ((month - 1) % MONTHS_PER_YEAR) + 1;
    year += extraYears;
  } else if (month < 1) {
    month = 1;
  }

  year = Math.max(1, year);

  return { year, month, day, hour };
}

/**
 * 增量式推进世界时间。
 * - `delta.years/months/days/hour` 累加到当前时间。
 * - hour 累加到 WorldTime.hour，溢出时自动进位到天。
 * - 结果自动规范化（溢出进位）。
 */
export function advanceWorldTime(base: WorldTime, delta: TimeDelta): WorldTime {
  const years = (delta.years ?? 0);
  const months = (delta.months ?? 0);
  const days = (delta.days ?? 0);
  const hour = (delta.hour ?? 0);

  const raw: WorldTime = {
    year: base.year + years,
    month: base.month + months,
    day: base.day + days,
    hour: base.hour + hour,
  };

  return normalizeWorldTime(raw);
}

/**
 * 将 WorldTime 折算为总天数（含小数，用于精确比较两个时间点的间隔）。
 */
export function worldTimeToDays(t: WorldTime): number {
  return (t.year - 1) * DAYS_PER_YEAR + (t.month - 1) * DAYS_PER_MONTH + (t.day - 1) + t.hour / 24;
}

/**
 * 计算两个世界时间之间的年数间隔（小数，`to` 晚于 `from` 时为正）。
 * 用于判断 dormant NPC 是否需要触发核心层重评估。
 */
export function worldTimeYearsBetween(from: WorldTime, to: WorldTime): number {
  return (worldTimeToDays(to) - worldTimeToDays(from)) / DAYS_PER_YEAR;
}

/**
 * 确保 WorldTime 含 hour 字段（兼容旧存档：无 hour 时默认 8）。
 */
export function ensureWorldTime(t: WorldTime): WorldTime {
  if (t.hour == null || !Number.isFinite(t.hour)) {
    return { ...t, hour: 8 };
  }
  return t;
}
