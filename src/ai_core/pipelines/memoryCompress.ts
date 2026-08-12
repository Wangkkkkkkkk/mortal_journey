/**
 * Pipeline: 记忆压缩（memoryCompress）
 *
 * 把一批较早的记忆条目压成一条更凝练的摘要。两档：
 *   - short2mid：一批单回合摘要 → 中期记忆（约 300-500 字）
 *   - mid2long：一批中期记忆 → 长期记忆（约 800-1000 字）
 *
 * 与 grandSummary 的区别：grandSummary 在 chatMessages 维度做单层滚动压缩；
 * 本 pipeline 在 memoryArchive 维度做多档分层压缩，产出 midTermMemory / longTermMemory，
 * 供统一剧情调用（generateStory）作为长期背景。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import {
  buildMemoryCompressSystemPreset,
  type MemoryCompressPresetOptions,
} from "../presets/memoryCompressPreset";
import { block, rawBlock, PLACEHOLDER_NONE } from "../shared/promptBlock";
import { extractTagContent } from "../shared/tagSpec";

const MEMORY_COMPRESS_OPEN = "<mj_memory_compress>";
const MEMORY_COMPRESS_CLOSE = "</mj_memory_compress>";

export interface MemoryCompressInput extends AiRequestConfig {
  /** 压缩档位。 */
  tier: MemoryCompressPresetOptions["tier"];
  /** 既有摘要（上一轮该档位的压缩结果，可能为空）。 */
  existingSummary: string;
  /** 待压缩的批次（按时间顺序）。 */
  batch: string[];
}

export interface MemoryCompressParsed {
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 以下为 prompt 分节函数：每个函数产出一个块，供 buildMemoryCompressUserContent 拼接。
// ─────────────────────────────────────────────────────────────────────────────

/** 【既有摘要】分节：上一轮该档位的压缩结果（首次压缩时用占位说明）。 */
function sceneExistingSummary(existingSummary: string): string {
  return block("【既有摘要】", existingSummary.trim() || "（无，本次为首次压缩该档位）");
}

/** 【待压缩材料】分节：按时间顺序编号的批次材料（无则占位）。 */
function sceneBatch(batch: string[]): string {
  const items = batch.map((s) => (s || "").trim()).filter(Boolean);
  const content = items.length > 0
    ? items.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : PLACEHOLDER_NONE;
  return block("【待压缩材料（按时间顺序）】", content);
}

/** 结尾指令：融合压缩为一段连贯摘要。 */
function sceneInstruction(): string {
  return rawBlock("请把上述既有摘要与这批材料融合，重新压缩为一段连贯摘要，仅输出在 <mj_memory_compress> 标签内。");
}

/**
 * 组装发送给 AI 的 user 消息。
 *
 * 构成（按顺序）：
 * 1. 既有摘要         —— sceneExistingSummary()
 * 2. 待压缩材料       —— sceneBatch()
 * 3. 融合压缩指令     —— sceneInstruction()
 */
function buildMemoryCompressUserContent(input: MemoryCompressInput): string {
  let msg = "";

  // ── 1. 既有摘要：上一轮该档位压缩结果作为基线 ──
  msg += sceneExistingSummary(input.existingSummary);

  // ── 2. 待压缩材料：本批次内容 ──
  msg += sceneBatch(input.batch);

  // ── 3. 融合压缩指令 ──
  msg += sceneInstruction();

  return msg;
}

export async function generateMemoryCompress(input: MemoryCompressInput): Promise<MemoryCompressParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.3,
    defaultMaxTokens: 4096,
    system: buildMemoryCompressSystemPreset({ tier: input.tier }),
    user: buildMemoryCompressUserContent(input),
    logTag: input.tier === "mid2long" ? "记忆压缩·中转长" : "记忆压缩·短转中",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    summary: extractTagContent(result.raw, MEMORY_COMPRESS_OPEN, MEMORY_COMPRESS_CLOSE),
  };
}
