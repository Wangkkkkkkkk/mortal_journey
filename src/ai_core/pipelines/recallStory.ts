/**
 * Pipeline: 剧情回忆检索（recallStory）
 *
 * 每回合（达到阈值轮次后）调用。复用主剧情 API 配置。
 * 流程：本地预筛 → 构建 corpus（近N原文/更早摘要）→ LLM 强/弱分类 → 失败兜底 → 组装标签。
 *
 * 返回的 tagContent 注入统一剧情调用（generateStory）的【剧情回忆】段；
 * previewText 供调试/日志展示。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { MemoryEntry } from "../../role_core/memoryArchive";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { RECALL_STORY_SYSTEM_PRESET } from "../presets/recallStoryPreset";
import {
  preFilterCandidates,
  buildRecallCorpus,
  parseRecallOutput,
  fallbackFromCandidates,
  buildRecallTag,
  type ParsedRecall,
} from "../shared/recallLocal";
import { block } from "../shared/promptBlock";

export interface RecallStoryInput extends AiRequestConfig {
  /** 玩家本轮输入。 */
  playerInput: string;
  /** 全量回忆档案。 */
  archive: MemoryEntry[];
  /** corpus 中保留原文的最近条数 N。 */
  fullN: number;
}

export interface RecallStoryParsed {
  /** 注入主剧情的【剧情回忆】标签文本（强回忆取原文、弱回忆取摘要）。 */
  tagContent: string;
  /** 「强回忆:...｜弱回忆:...」单行预览，供日志/调试。 */
  previewText: string;
  /** 最终采用的分类（经 LLM 或本地兜底）。 */
  parsed: ParsedRecall;
}

// ─────────────────────────────────────────────────────────────────────────────
// 以下为 prompt 分节函数：每个函数产出一个块，供 buildRecallUserContent 拼接。
// ─────────────────────────────────────────────────────────────────────────────

/** 【玩家输入】分节：本次玩家输入（空输入时占位）。 */
function scenePlayerInput(playerInput: string): string {
  return block("【玩家输入】", playerInput || "（空输入）");
}

/** 【回忆库】分节：预筛后构建的回忆语料（近 N 条原文 + 更早摘要）。 */
function sceneRecallCorpus(corpus: string): string {
  return block("【回忆库】", corpus);
}

/**
 * 组装发送给 AI 的 user 消息。
 *
 * 构成（按顺序）：
 * 1. 玩家输入   —— scenePlayerInput()
 * 2. 回忆库     —— sceneRecallCorpus()
 */
function buildRecallUserContent(playerInput: string, corpus: string): string {
  let msg = "";

  // ── 1. 玩家输入：作为检索依据 ──
  msg += scenePlayerInput(playerInput);

  // ── 2. 回忆库：候选回忆语料 ──
  msg += sceneRecallCorpus(corpus);

  return msg;
}

export async function generateRecallStory(input: RecallStoryInput): Promise<RecallStoryParsed> {
  const playerInput = (input.playerInput || "").trim();
  const archive = Array.isArray(input.archive) ? input.archive : [];
  const fullN = Math.max(1, Math.floor(input.fullN || 20));

  // 阶段一：本地预筛（同时作为 LLM 失败时的兜底来源）。
  const candidates = preFilterCandidates(playerInput, archive, fullN);
  const localFallback = fallbackFromCandidates(candidates);

  // 阶段二：构建 corpus，预筛命中条目打标记。
  const corpus = buildRecallCorpus(archive, fullN, {
    candidateIds: candidates.map((item) => item.id),
  });

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.2,
    defaultMaxTokens: 256,
    system: RECALL_STORY_SYSTEM_PRESET,
    user: buildRecallUserContent(playerInput, corpus),
    logTag: "剧情回忆检索",
  };

  // 阶段三：LLM 调用，失败/空结果用本地兜底。
  let parsed: ParsedRecall = localFallback;
  try {
    const result = await runPipeline(input, opts, callChatCompletions);
    const modelParsed = parseRecallOutput(result.raw);
    if (modelParsed.strongIds.length > 0 || modelParsed.weakIds.length > 0) {
      parsed = modelParsed;
    }
  } catch {
    parsed = localFallback;
  }

  const tagContent = buildRecallTag(archive, parsed);

  return {
    tagContent,
    previewText: parsed.normalizedText,
    parsed,
  };
}
