/**
 * Pipeline: grandSummary
 *
 * 剧情总纲压缩。从现有 ai/grand_summary_generate.ts 迁移。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { GRAND_SUMMARY_SYSTEM_PRESET } from "../presets/grandSummaryPreset";
import { block, rawBlock, PLACEHOLDER_NONE } from "../shared/promptBlock";
import { extractTagContent } from "../shared/tagSpec";

const GRAND_SUMMARY_OPEN = "<mj_story_grand_summary>";
const GRAND_SUMMARY_CLOSE = "</mj_story_grand_summary>";

export interface GrandSummaryInput extends AiRequestConfig {
  oldGrandSummary: string;
  snapshots: string[];
}

export interface GrandSummaryParsed {
  grandSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 以下为 prompt 分节函数：每个函数产出一个块，供 buildGrandSummaryUserContent 拼接。
// ─────────────────────────────────────────────────────────────────────────────

/** 【既有剧情总纲】分节：上一版总纲（首次总结时用占位说明）。 */
function sceneExistingSummary(oldGrandSummary: string): string {
  return block("【既有剧情总纲】", oldGrandSummary.trim() || "（无，本次为首次总结）");
}

/** 【待总结的逐轮剧情快照】分节：按时间顺序编号的逐轮快照（无则占位）。 */
function sceneSnapshots(snapshots: string[]): string {
  const snaps = snapshots.filter((s) => s && s.trim());
  const content = snaps.length > 0
    ? snaps.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n")
    : PLACEHOLDER_NONE;
  return block("【待总结的逐轮剧情快照（按时间顺序）】", content);
}

/** 结尾指令：融合压缩为约 1000 字连贯总纲。 */
function sceneInstruction(): string {
  return rawBlock("请把上述既有总纲与这批快照融合，重新压缩为一段约 1000 字的连贯剧情总纲，仅输出在 <mj_story_grand_summary> 标签内。");
}

/**
 * 组装发送给 AI 的 user 消息。
 *
 * 构成（按顺序）：
 * 1. 既有剧情总纲       —— sceneExistingSummary()
 * 2. 待总结剧情快照     —— sceneSnapshots()
 * 3. 融合压缩指令       —— sceneInstruction()
 */
function buildGrandSummaryUserContent(input: GrandSummaryInput): string {
  let msg = "";

  // ── 1. 既有剧情总纲：上一版总纲作为基线 ──
  msg += sceneExistingSummary(input.oldGrandSummary);

  // ── 2. 待总结的逐轮剧情快照 ──
  msg += sceneSnapshots(input.snapshots);

  // ── 3. 融合压缩指令 ──
  msg += sceneInstruction();

  return msg;
}

export async function generateGrandSummary(input: GrandSummaryInput): Promise<GrandSummaryParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.3,
    defaultMaxTokens: 4096,
    system: GRAND_SUMMARY_SYSTEM_PRESET,
    user: buildGrandSummaryUserContent(input),
    logTag: "大总结",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    grandSummary: extractTagContent(result.raw, GRAND_SUMMARY_OPEN, GRAND_SUMMARY_CLOSE),
  };
}
