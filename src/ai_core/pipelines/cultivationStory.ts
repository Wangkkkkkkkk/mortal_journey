/**
 * Pipeline: cultivationStory
 *
 * 功法修炼剧情生成。从现有 ai/cultivation_story_generate.ts 迁移。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { formatWorldLocationDash } from "../../role_core/types/worldLocation";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { PRESET } from "../presets/globalPreset";
import { CULTIVATION_STORY_SYSTEM_PRESET } from "../presets/cultivationStoryPreset";
import { extractTaggedBody, MJ_CULTIVATION_BODY_OPEN, MJ_CULTIVATION_BODY_CLOSE } from "../shared/tagSpec";
import { buildProtagonistBrief } from "../shared/protagonistBrief";

export interface CultivationStoryInput extends AiRequestConfig {
  gongfaName: string;
  gongfaGrade: string;
  gongfaSystem: string;
  currentMastery: number;
  currentMasteryExp: number;
  masteryThreshold: number;
  spiritStoneCount: number;
  estimatedMonths: number;
  protagonist: ProtagonistPlayInfo;
  currentWorldLocation?: WorldLocation | null;
  npcSnapshot?: string;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface CultivationStoryParsed {
  storyBody: string;
}

function buildTimePreview(months: number): string {
  if (months <= 0) return "无";
  const years = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}年`);
  if (m > 0) parts.push(`${m}个月`);
  return parts.join("");
}

export async function generateCultivationStory(input: CultivationStoryInput): Promise<CultivationStoryParsed> {
  const p = input.protagonist;
  const locationStr = input.currentWorldLocation
    ? formatWorldLocationDash(input.currentWorldLocation)
    : "未知";
  const timePreview = buildTimePreview(input.estimatedMonths);
  const masteryInfo = input.currentMastery >= 10
    ? "已圆满（第10层/10层）"
    : `第${input.currentMastery}层/10层，熟练度${input.currentMasteryExp}/${input.masteryThreshold}`;

  const brief = buildProtagonistBrief(p, {
    worldLocation: input.currentWorldLocation,
    npcSnapshot: input.npcSnapshot,
  }, { revealNumbers: true, highlightGongfa: input.gongfaName });

  const userContent = [
    "【修炼参数】",
    `修炼功法：${input.gongfaName}（${input.gongfaGrade}${input.gongfaSystem ? "，" + input.gongfaSystem : ""}）`,
    `功法熟练度：${masteryInfo}`,
    `消耗灵石：${input.spiritStoneCount}枚`,
    `预计修炼时间：${timePreview}`,
    "",
    "【主角状态】",
    brief,
    "",
    `当前地点：${locationStr}`,
    "",
    "请根据以上修炼参数和主角状态，生成一段沉浸式的修炼剧情。功法名称、体系特征、灵石消耗、时间流逝都必须准确体现。",
  ].join("\n");

  const storyParts = input.chatHistory
    .filter((e) => e.role === "assistant")
    .map((e) => e.content);
  const systemParts = [PRESET, CULTIVATION_STORY_SYSTEM_PRESET];
  if (storyParts.length > 0) {
    systemParts.push("【之前的剧情】\n" + storyParts.join("\n\n---\n\n"));
  }

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 65535,
    system: systemParts.join("\n\n"),
    user: `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_cultivation_body>...</mj_cultivation_body> 标签内。]\n\n${userContent}`,
    logTag: "修炼",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    storyBody: extractTaggedBody(result.raw, MJ_CULTIVATION_BODY_OPEN, MJ_CULTIVATION_BODY_CLOSE, { skipThinking: true }),
  };
}
