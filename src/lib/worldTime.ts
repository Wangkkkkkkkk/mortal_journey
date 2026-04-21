/**
 * 修仙界「世界时间」：以结构化字段为唯一数据源，界面文案仅由格式化函数派生。
 */

export interface WorldTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function createDefaultWorldTime(): WorldTime {
  return { year: 1, month: 1, day: 1, hour: 9, minute: 0 };
}

export function cloneWorldTime(t: WorldTime): WorldTime {
  return {
    year: t.year,
    month: t.month,
    day: t.day,
    hour: t.hour,
    minute: t.minute,
  };
}

function pad2(n: number): string {
  return Math.max(0, Math.floor(n)).toString().padStart(2, "0");
}

function pad4(n: number): string {
  return Math.max(0, Math.floor(n)).toString().padStart(4, "0");
}

/** 例：`0001年01月01号 09:00`（仅展示用，不参与业务计算） */
export function formatWorldTimeZhDisplay(t: WorldTime): string {
  return `${pad4(t.year)}年${pad2(t.month)}月${pad2(t.day)}号 ${pad2(t.hour)}:${pad2(t.minute)}`;
}

/**
 * 自 `from` 到 `to` 经过的整年数（仅比较年分量；后续若需精确到月日可在此扩展）。
 * 用于：显示年龄 = 开局档案年龄 + 经过年数。
 */
export function calendarYearsElapsed(from: WorldTime, to: WorldTime): number {
  const d = to.year - from.year;
  return d > 0 ? d : 0;
}
