/**
 * Pipeline: finaleStory
 *
 * 死亡走马灯剧情生成。从现有 ai/finale_story_generate.ts 迁移。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import { formatWorldLocationDash } from "../../role_core/types/worldLocation";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { PRESET } from "../presets/globalPreset";
import { FINALE_STORY_SYSTEM_PRESET } from "../presets/finaleStoryPreset";
import { extractTaggedBody, MJ_FINALE_BODY_OPEN, MJ_FINALE_BODY_CLOSE } from "../shared/tagSpec";
import { buildProtagonistBrief } from "../shared/protagonistBrief";

export interface FinaleStoryInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>;
  deathReason: string;
  sceneContext?: string;
  npcSnapshot?: string;
}

export interface FinaleStoryParsed {
  storyBody: string;
}

export async function generateFinaleStory(input: FinaleStoryInput): Promise<FinaleStoryParsed> {
  const p = input.protagonist;

  const brief = buildProtagonistBrief(p, {
    npcSnapshot: input.npcSnapshot,
  }, { revealNumbers: false, includeOrigin: true });

  const sceneLine = input.sceneContext?.trim()
    ? `\n\n【死亡场景】\n${input.sceneContext.trim()}`
    : "";
  const npcSection = input.npcSnapshot?.trim()
    ? `\n\n【一生中的重要人物】\n${input.npcSnapshot.trim()}`
    : "";

  const userContent = [
    `【死亡原因】${input.deathReason}`,
    "",
    "【主角生平】",
    brief,
    sceneLine,
    npcSection,
    "",
    "请根据以上信息与【主角的一生轨迹】，以走马灯的形式回顾主角的一生——从凡人出身、踏入修仙、关键羁绊、巅峰转折，到最终的陨落与遗恨。这是结局叙事，主角已死，不要复活，不要留悬念。",
  ].join("\n");

  const storyParts = input.chatHistory
    .filter((e) => e.role === "assistant")
    .map((e) => e.content);
  const systemParts = [PRESET, FINALE_STORY_SYSTEM_PRESET];
  if (storyParts.length > 0) {
    systemParts.push("【主角的一生轨迹】\n" + storyParts.join("\n\n---\n\n"));
  }

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.7,
    defaultMaxTokens: 16384,
    system: systemParts.join("\n\n"),
    user: `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_finale_body>...</mj_finale_body> 标签内。]\n\n${userContent}`,
    logTag: "结局",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    storyBody: extractTaggedBody(result.raw, MJ_FINALE_BODY_OPEN, MJ_FINALE_BODY_CLOSE, { skipThinking: true }),
  };
}
