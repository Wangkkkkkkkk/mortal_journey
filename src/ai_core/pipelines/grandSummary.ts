/**
 * Pipeline: grandSummary
 *
 * 剧情总纲压缩。从现有 ai/grand_summary_generate.ts 迁移。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { GRAND_SUMMARY_SYSTEM_PRESET } from "../presets/grandSummaryPreset";
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

export async function generateGrandSummary(input: GrandSummaryInput): Promise<GrandSummaryParsed> {
  const oldPart = input.oldGrandSummary.trim()
    ? `【既有剧情总纲】\n${input.oldGrandSummary.trim()}\n`
    : "【既有剧情总纲】\n（无，本次为首次总结）\n";

  const snapshots = input.snapshots.filter((s) => s && s.trim());
  const snapPart = snapshots.length > 0
    ? "【待总结的逐轮剧情快照（按时间顺序）】\n" + snapshots.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n")
    : "【待总结的逐轮剧情快照】\n（无）";

  const userContent = [
    oldPart,
    "",
    snapPart,
    "",
    "请把上述既有总纲与这批快照融合，重新压缩为一段约 1000 字的连贯剧情总纲，仅输出在 <mj_story_grand_summary> 标签内。",
  ].join("\n");

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.3,
    defaultMaxTokens: 4096,
    system: GRAND_SUMMARY_SYSTEM_PRESET,
    user: userContent,
    logTag: "大总结",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    grandSummary: extractTagContent(result.raw, GRAND_SUMMARY_OPEN, GRAND_SUMMARY_CLOSE),
  };
}
