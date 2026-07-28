/**
 * 剧情回忆检索的纯函数集（无副作用、无 LLM 调用）。
 *
 * 移植自 MoRanJiangHu 的 memoryRecall.ts，适配本项目的 MemoryEntry。
 * 三阶段：本地预筛打分 → 构建 corpus（近N原文/更早摘要）→ 解析/兜底/组装标签。
 */

import type { MemoryEntry } from "../../role_core/memoryArchive";
import { formatMemoryName } from "../../role_core/memoryArchive";

/** 预筛候选条目：带相关性打分的回忆。 */
export interface RecallCandidate {
  /** 对应 MemoryEntry.name，如「【回忆003】」。 */
  id: string;
  round: number;
  summary: string;
  raw: string;
  /** 是否在「近 N 条原文窗口」内。 */
  isFullText: boolean;
  /** 在归档中的原始下标（用于近度排序）。 */
  orderIndex: number;
  /** 本地打分（越高越相关）。 */
  score: number;
}

/** 解析后的强/弱回忆分类。 */
export interface ParsedRecall {
  strongIds: string[];
  weakIds: string[];
  /** 规范化文本（强/弱各一行）。 */
  normalizedText: string;
}

// ── 名称/序号解析 ──

const RECALL_NAME_REGEX = /【\s*回忆\s*(\d+)\s*】/g;

/** 从一行文本里提取所有「【回忆NNN】」序号，去重。 */
export function parseRecallIds(line: string): string[] {
  const set = new Set<string>();
  const matches: string[] = (line || "").match(RECALL_NAME_REGEX) || [];
  matches.forEach((item) => {
    const numMatch = String(item).match(/\d+/);
    if (numMatch) set.add(formatMemoryName(parseInt(numMatch[0], 10)));
  });
  return Array.from(set);
}

// ── 关键词提取与打分 ──

/** 从文本里提取检索词：英文 token（≥2）+ 中文 2-gram/3-gram。 */
function extractTerms(raw: string): string[] {
  const text = (raw || "").trim().toLowerCase();
  if (!text) return [];
  const terms = new Set<string>();
  (text.match(/[a-z0-9_]+/g) || []).forEach((item) => {
    if (item.length >= 2) terms.add(item);
  });
  const hanBlocks: string[] = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  hanBlocks.forEach((block) => {
    terms.add(block);
    if (block.length >= 3) {
      for (let i = 0; i < block.length - 1; i += 1) terms.add(block.slice(i, i + 2));
    }
    if (block.length >= 4) {
      for (let i = 0; i < block.length - 2; i += 1) terms.add(block.slice(i, i + 3));
    }
  });
  return Array.from(terms).filter((item) => item.length >= 2);
}

/** 计算单条回忆与玩家输入的相关度。 */
function scoreCandidate(
  query: string,
  queryTerms: string[],
  candidateText: string,
  index: number,
  total: number,
): number {
  const text = candidateText.toLowerCase();
  if (!text.trim()) return 0;
  let score = 0;
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery && text.includes(normalizedQuery)) score += 12;
  queryTerms.forEach((term) => {
    if (!term || !text.includes(term)) return;
    score += term.length >= 4 ? 5 : term.length === 3 ? 3 : 1.5;
  });
  // 近度加权：越近分越高。
  const recencyBoost = total > 0 ? ((index + 1) / total) * 3 : 0;
  return score + recencyBoost;
}

// ── 阶段一：本地预筛 ──

/**
 * 本地预筛：对全量回忆档案按关键词打分，取 top-K + 最近若干条。
 * 用于在调用 LLM 前缩小语料，并作为 LLM 失败时的兜底。
 */
export function preFilterCandidates(
  playerInput: string,
  archive: MemoryEntry[],
  fullCount: number,
  options?: { topK?: number; recentReserve?: number },
): RecallCandidate[] {
  if (!Array.isArray(archive) || archive.length === 0) return [];
  const sorted = [...archive].sort((a, b) => a.round - b.round);
  const fullN = Math.max(1, Math.floor(fullCount || 20));
  const fullStartIndex = Math.max(0, sorted.length - fullN);
  const queryTerms = extractTerms(playerInput);
  const topK = Math.max(4, Math.floor(options?.topK || 24));
  const recentReserve = Math.max(2, Math.floor(options?.recentReserve || 6));

  const scored: RecallCandidate[] = sorted.map((item, idx) => {
    const name = item.name || formatMemoryName(item.round || idx + 1);
    const summary = (item.summary || "").trim();
    const raw = (item.raw || "").trim();
    const searchable = [name, summary, raw].filter(Boolean).join("\n");
    return {
      id: name,
      round: item.round || idx + 1,
      summary,
      raw,
      isFullText: idx >= fullStartIndex,
      orderIndex: idx,
      score: scoreCandidate(playerInput, queryTerms, searchable, idx, sorted.length),
    };
  });

  const topScored = [...scored]
    .sort((a, b) => b.score - a.score || b.orderIndex - a.orderIndex)
    .slice(0, topK);
  const recentTail = scored.slice(-recentReserve);
  return Array.from(
    new Map(
      [...topScored, ...recentTail]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((item) => [item.id, item] as const),
    ).values(),
  );
}

// ── 阶段二：构建 corpus ──

/**
 * 构建送给 LLM 的回忆语料：最近 N 条给原文，更早的只给摘要。
 * 预筛命中的条目额外打「本地预筛：可能相关」标记，引导模型注意。
 */
export function buildRecallCorpus(
  archive: MemoryEntry[],
  fullCount: number,
  options?: { candidateIds?: string[] },
): string {
  if (!Array.isArray(archive) || archive.length === 0) return "暂无可用回忆。";
  const sorted = [...archive].sort((a, b) => a.round - b.round);
  const fullN = Math.max(1, Math.floor(fullCount || 20));
  const fullStartIndex = Math.max(0, sorted.length - fullN);
  const candidateIdSet =
    options?.candidateIds && options.candidateIds.length > 0 ? new Set(options.candidateIds) : null;
  const candidateSummaryLine = candidateIdSet
    ? `【本地预筛可能相关】\n${Array.from(candidateIdSet).join(" | ")}`
    : "";

  const body = sorted
    .map((item, idx) => {
      const name = item.name || formatMemoryName(item.round || idx + 1);
      const candidateMarker = candidateIdSet?.has(name) ? "\n本地预筛：可能相关" : "";
      if (idx >= fullStartIndex) {
        return `${name}：${candidateMarker}\n原文：\n${(item.raw || "").trim() || "（无原文）"}`;
      }
      return `${name}：${candidateMarker}\n摘要：${(item.summary || "").trim() || "（无摘要）"}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return [candidateSummaryLine, body].filter(Boolean).join("\n\n");
}

// ── 阶段三：解析 LLM 输出 / 兜底 / 组装标签 ──

/** 解析 LLM 的两行输出（强回忆/弱回忆）。容错：缺失行视为「无」。 */
export function parseRecallOutput(raw: string): ParsedRecall {
  const text = (raw || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const strongLine = lines.find((line) => /(?:^|[^a-zA-Z0-9])强回忆\s*[:：]/.test(line)) || "强回忆:无";
  const weakLine = lines.find((line) => /(?:^|[^a-zA-Z0-9])弱回忆\s*[:：]/.test(line)) || "弱回忆:无";
  const strongIds = parseRecallIds(strongLine);
  const weakIds = parseRecallIds(weakLine).filter((id) => !strongIds.includes(id));
  const normalizedStrong = strongIds.length > 0 ? `强回忆:${strongIds.join("|")}` : "强回忆:无";
  const normalizedWeak = weakIds.length > 0 ? `弱回忆:${weakIds.join("|")}` : "弱回忆:无";

  return {
    strongIds,
    weakIds,
    normalizedText: `${normalizedStrong}\n${normalizedWeak}`,
  };
}

/**
 * 本地兜底：当 LLM 检索失败或返回空时，由预筛候选直接推导强/弱回忆。
 * 取分数最高且与 top 分数接近的若干条为强，次之为弱。
 */
export function fallbackFromCandidates(candidates: RecallCandidate[]): ParsedRecall {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || b.orderIndex - a.orderIndex);
  const topScore = sorted[0]?.score || 0;
  const strongCandidates = sorted.filter((item, idx) => {
    if (idx === 0) return true;
    if (item.score <= 0) return false;
    if (idx < 3 && item.score >= topScore * 0.6) return true;
    if (idx < 6 && item.score >= topScore * 0.72) return true;
    return item.score >= Math.max(8, topScore * 0.82);
  });
  const strongIds = strongCandidates.slice(0, 6).map((item) => item.id);
  const weakIds = sorted
    .filter((item) => !strongIds.includes(item.id))
    .slice(0, 6)
    .map((item) => item.id)
    .filter((id) => !strongIds.includes(id));
  return {
    strongIds,
    weakIds,
    normalizedText: [
      strongIds.length > 0 ? `强回忆:${strongIds.join("|")}` : "强回忆:无",
      weakIds.length > 0 ? `弱回忆:${weakIds.join("|")}` : "弱回忆:无",
    ].join("\n"),
  };
}

/**
 * 把强/弱回忆分类组装为注入主剧情的标签文本。
 * 强回忆取原文（保留细节），弱回忆取摘要（仅概括）。
 */
export function buildRecallTag(
  archive: MemoryEntry[],
  parsed: ParsedRecall,
): string {
  const mapByName = new Map<string, MemoryEntry>(archive.map((item) => [item.name, item]));
  const uniqueStrong = Array.from(new Set(parsed.strongIds));
  const uniqueWeak = Array.from(new Set(parsed.weakIds.filter((id) => !uniqueStrong.includes(id))));

  const strongBlocks = uniqueStrong.map((id) => {
    const matched = mapByName.get(id);
    const rawText = typeof matched?.raw === "string" ? matched.raw.trim() : "";
    return `${id}：\n${rawText || "（无原文）"}`;
  });
  const weakBlocks = uniqueWeak.map((id) => {
    const matched = mapByName.get(id);
    const summary = typeof matched?.summary === "string" ? matched.summary.trim() : "";
    return `${id}：\n${summary || "（无摘要）"}`;
  });

  return [
    "强回忆：",
    strongBlocks.length > 0 ? strongBlocks.join("\n\n") : "无",
    "",
    "弱回忆：",
    weakBlocks.length > 0 ? weakBlocks.join("\n\n") : "无",
  ]
    .join("\n")
    .trim();
}
