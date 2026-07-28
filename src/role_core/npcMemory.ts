/**
 * NPC 互动记忆工具。
 *
 * 移植自 MoRanJiangHu 的「社交[i].记忆[]」概念：为每个 NPC 维护一条按时间顺序的
 * 互动日志（带世界时间戳），区别于 storySnapshot（单段覆盖式近况）。
 * memories 是 append-only 且有上限，溢出丢弃最旧。
 */

import type { WorldTime } from "./worldTime";
import { cloneWorldTime, createDefaultWorldTime, formatWorldTimeZhDisplay } from "./worldTime";

/** 单条 NPC 互动记忆。 */
export interface NpcMemory {
  /** 该互动发生/记录时的世界时间。 */
  worldTime: WorldTime;
  /** 互动内容（一句话简述，如「在坊市因丹药议价起过争执」）。 */
  text: string;
}

/** appendNpcMemory 的输入条目（worldTime 可缺省，函数内部回退默认时间）。 */
export type NpcMemoryInput = { worldTime?: WorldTime | null; text: string };

/** NPC memories 数组的条数上限；溢出时丢弃最旧。 */
export const NPC_MEMORIES_LIMIT = 30;

/**
 * 向 memories 数组追加一条；超限时保留尾部（最近优先），保证有界。
 * 纯函数，返回新数组（不就地变更，便于触发 Vue 响应式）。
 */
export function appendNpcMemory(
  prev: NpcMemory[] | null | undefined,
  addition: NpcMemoryInput | null | undefined,
  limit: number = NPC_MEMORIES_LIMIT,
): NpcMemory[] {
  const text = (addition?.text ?? "").trim();
  if (!text) return Array.isArray(prev) ? [...prev] : [];
  const entry: NpcMemory = {
    worldTime: addition?.worldTime ? cloneWorldTime(addition.worldTime) : createDefaultWorldTime(),
    text,
  };
  const base = Array.isArray(prev) ? [...prev] : [];
  const next = [...base, entry];
  const cap = Math.max(1, Math.floor(limit));
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

/** 规范化 memories 数组（容错读档）：过滤无效项，超出上限则截尾。 */
export function normalizeNpcMemories(raw: unknown): NpcMemory[] {
  if (!Array.isArray(raw)) return [];
  const arr = raw
    .map((m): NpcMemory | null => {
      if (!m || typeof m !== "object") return null;
      const o = m as Record<string, unknown>;
      const text = typeof o.text === "string" ? o.text.trim() : "";
      if (!text) return null;
      return {
        worldTime: o.worldTime ? cloneWorldTime(o.worldTime as WorldTime) : createDefaultWorldTime(),
        text,
      };
    })
    .filter((m): m is NpcMemory => m !== null);
  if (arr.length > NPC_MEMORIES_LIMIT) return arr.slice(arr.length - NPC_MEMORIES_LIMIT);
  return arr;
}

/** 把 memories 最近若干条格式化为注入剧情的文本（带时间戳）。 */
export function formatNpcMemories(memories: NpcMemory[] | null | undefined, take: number = 5): string {
  if (!Array.isArray(memories) || memories.length === 0) return "";
  const tail = memories.slice(-Math.max(1, Math.floor(take)));
  return tail
    .map((m) => `[${formatWorldTimeZhDisplay(m.worldTime)}] ${m.text}`)
    .join("；");
}
