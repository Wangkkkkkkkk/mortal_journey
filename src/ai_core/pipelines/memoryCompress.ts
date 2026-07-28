/**
 * Pipeline: 记忆压缩（memoryCompress）
 *
 * 把一批较早的记忆条目压成一条更凝练的摘要。两档：
 *   - short2mid：一批单回合摘要 → 中期记忆（约 300-500 字）
 *   - mid2long：一批中期记忆 → 长期记忆（约 800-1000 字）
 *
 * 与 grandSummary 的区别：grandSummary 在 chatMessages 维度做单层滚动压缩；
 * 本 pipeline 在 memoryArchive 维度做多档分层压缩，产出 midTermMemory / longTermMemory，
 * 供 plotOutline 作为更丰富的长期背景。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import {
  buildMemoryCompressSystemPreset,
  type MemoryCompressPresetOptions,
} from "../presets/memoryCompressPreset";
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

export async function generateMemoryCompress(input: MemoryCompressInput): Promise<MemoryCompressParsed> {
  const oldPart = input.existingSummary.trim()
    ? `【既有摘要】\n${input.existingSummary.trim()}\n`
    : `【既有摘要】\n（无，本次为首次压缩该档位）\n`;

  const batch = input.batch.map((s) => (s || "").trim()).filter(Boolean);
  const batchPart = batch.length > 0
    ? "【待压缩材料（按时间顺序）】\n" + batch.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "【待压缩材料】\n（无）";

  const userContent = [
    oldPart,
    "",
    batchPart,
    "",
    "请把上述既有摘要与这批材料融合，重新压缩为一段连贯摘要，仅输出在 <mj_memory_compress> 标签内。",
  ].join("\n");

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.3,
    defaultMaxTokens: 4096,
    system: buildMemoryCompressSystemPreset({ tier: input.tier }),
    user: userContent,
    logTag: input.tier === "mid2long" ? "记忆压缩·中转长" : "记忆压缩·短转中",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    summary: extractTagContent(result.raw, MEMORY_COMPRESS_OPEN, MEMORY_COMPRESS_CLOSE),
  };
}
