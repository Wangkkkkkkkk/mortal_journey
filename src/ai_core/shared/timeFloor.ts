/**
 * 时间推进防冻结地板（纯函数）。
 *
 * 移植自 MoRanJiangHu 的"防时间冻结"思路：扫描正文关键词，当剧情明确跨越较长时段
 * 但 AI 输出的 delta 偏小时，强制抬升到合理下限。只升不降。
 *
 * 与 src 的 delta 架构配合：AI 仍输出增量，本函数在 apply 前做下限兜底。
 */

import type { TimeDelta } from "../../role_core/worldTime";

/** 关键词规则：正则 + 最小 delta 保证。命中即抬升（只升不降）。 */
interface FloorRule {
  /** 规则名（用于日志）。 */
  name: string;
  /** 匹配正则（全局，不区分大小写敏感由词性决定，均用中文故不加 i）。 */
  pattern: RegExp;
  /** 命中后强制满足的最小 delta。 */
  min: TimeDelta;
}

const FLOOR_RULES: FloorRule[] = [
  {
    name: "隔夜/次日",
    pattern: /隔夜|次日|翌日|第二日|第二天天|天亮|天明|清晨醒来|一觉醒来|次日清晨|次日天明|过了一夜|一夜过后/,
    min: { days: 1 },
  },
  {
    name: "数日",
    pattern: /数日|数天后|数日后|几日后|几天后|过了几天|三两天|三五日|七八日|十来日/,
    min: { days: 3 },
  },
  {
    name: "旬日/半月",
    pattern: /旬日|半月|十数日|半个月|十数天后|十来天/,
    min: { days: 10 },
  },
  {
    name: "月余",
    pattern: /月余|个把月|一月有余|月后|一月光景|月余之后/,
    min: { months: 1 },
  },
  {
    name: "数月/半年",
    pattern: /数月|半年|大半年|数月光景|两三月|三四月/,
    min: { months: 3 },
  },
  {
    name: "年余",
    pattern: /年余|一年有余|载余|一年光景|一年半载|两三年|数年之后/,
    min: { years: 1 },
  },
  {
    name: "闭关（月级下限）",
    pattern: /闭关|闭关修炼|闭关数日|闭关不出/,
    min: { months: 1 },
  },
];

/** 把 TimeDelta 折算为可比拟的"总小时数"（粗略，仅用于比较大小）。 */
function deltaToHours(d: TimeDelta): number {
  const years = d.years ?? 0;
  const months = d.months ?? 0;
  const days = d.days ?? 0;
  const hour = d.hour ?? 0;
  // 每年 360 天、每月 30 天（与 worldTime.ts 历法一致）。
  return years * 360 * 24 + months * 30 * 24 + days * 24 + hour;
}

/** 取两个 delta 中更大的那个（按总小时数比较）。 */
function maxDelta(a: TimeDelta, b: TimeDelta): TimeDelta {
  return deltaToHours(a) >= deltaToHours(b) ? a : b;
}

/**
 * 扫描正文，按关键词规则强制抬升 delta 下限。
 *
 * @param storyBody 本回合剧情正文。
 * @param delta AI 输出的原始增量。
 * @returns 修正后的 delta + 命中的规则名列表（用于日志告警）。
 */
export function enforceTimeFloor(
  storyBody: string,
  delta: TimeDelta,
): { delta: TimeDelta; floorHit: string[] } {
  const text = typeof storyBody === "string" ? storyBody : "";
  const floorHit: string[] = [];
  let result = delta;

  for (const rule of FLOOR_RULES) {
    if (rule.pattern.test(text)) {
      floorHit.push(rule.name);
      result = maxDelta(result, rule.min);
    }
  }

  return { delta: result, floorHit };
}
