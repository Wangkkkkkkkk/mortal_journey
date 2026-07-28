/**
 * @fileoverview 回忆档案（全量回合索引）单例。
 *
 * 移植自 MoRanJiangHu 的「回忆档案」概念：每一回合的剧情都被完整索引，
 * 既保留原文（raw）也保留摘要（summary），供 RAG 剧情回忆检索按需召回。
 *
 * 与 storyStore 的关系：
 *   - storyStore.chatMessages 会在 grandSummary 压缩后物理删除旧消息；
 *   - memoryArchive 永不删除，是全量回合的可检索底座。
 *
 * 序列化随 story 分量一并写入存档（见 gameSave.ts），懒回填兼容老存档。
 */

import { ref } from "vue";
import type { WorldTime } from "./worldTime";
import { cloneWorldTime, createDefaultWorldTime } from "./worldTime";

/** 单条回忆档案条目。 */
export interface MemoryEntry {
  /** 回合序号，从 1 起。 */
  round: number;
  /** 规范化名称，如「【回忆001】」，由 round 格式化。 */
  name: string;
  /** 单回合摘要（对应 ChatMessage.snapshot，由 state AI 产出）。 */
  summary: string;
  /** 单回合原文（对应 story body）。 */
  raw: string;
  /** 该回合结束时的世界时间。 */
  worldTime: WorldTime;
}

/** 可序列化的回忆档案载荷（存档 story 分量的子字段）。 */
export interface MemoryArchiveSerialData {
  memoryArchive: MemoryEntry[];
}

/** 把回合序号格式化为规范化名称。 */
export function formatMemoryName(round: number): string {
  const n = Math.max(1, Math.floor(round));
  return `【回忆${String(n).padStart(3, "0")}】`;
}

const memoryArchive = ref<MemoryEntry[]>([]);

/** 重置回忆档案到初始值（开新档、读档前清场用）。 */
function clearArchive(): void {
  memoryArchive.value = [];
}

/** 追加一条回忆档案条目；自动用数组长度 +1 推导 round 与 name。 */
function pushMemoryEntry(entry: {
  summary?: string;
  raw?: string;
  worldTime?: WorldTime | null;
}): void {
  const summary = (entry.summary ?? "").trim();
  const raw = (entry.raw ?? "").trim();
  if (!summary && !raw) return;
  const round = memoryArchive.value.length + 1;
  memoryArchive.value.push({
    round,
    name: formatMemoryName(round),
    summary,
    raw,
    worldTime: entry.worldTime ? cloneWorldTime(entry.worldTime) : createDefaultWorldTime(),
  });
}

/** 序列化当前回忆档案为纯 JSON（深拷贝，断开响应式引用）。 */
function serializeArchive(): MemoryArchiveSerialData {
  return {
    memoryArchive: memoryArchive.value.map((m) => ({
      ...m,
      worldTime: cloneWorldTime(m.worldTime),
    })),
  };
}

/** 从存档数据恢复回忆档案。懒回填：缺失或非数组时置空，不报错。 */
function restoreArchive(data: MemoryArchiveSerialData | null | undefined): void {
  const arr = Array.isArray(data?.memoryArchive) ? data!.memoryArchive : [];
  memoryArchive.value = arr
    .map((m, idx): MemoryEntry => {
      const round = typeof m?.round === "number" && m.round > 0 ? Math.floor(m.round) : idx + 1;
      return {
        round,
        name: typeof m?.name === "string" && m.name.trim() ? m.name.trim() : formatMemoryName(round),
        summary: typeof m?.summary === "string" ? m.summary : "",
        raw: typeof m?.raw === "string" ? m.raw : "",
        worldTime: m?.worldTime ? cloneWorldTime(m.worldTime) : createDefaultWorldTime(),
      };
    })
    .sort((a, b) => a.round - b.round);
}

export const memoryArchiveStore = {
  memoryArchive,
  clearArchive,
  pushMemoryEntry,
  serializeArchive,
  restoreArchive,
};
