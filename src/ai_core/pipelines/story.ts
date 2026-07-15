/**
 * Pipeline: story
 *
 * 剧情 AI pipeline。从现有 ai/story_generate.ts 迁移，
 * 使用 ai_core 的 runPipeline + callChatCompletions + buildProtagonistBrief。
 *
 * G1: 使用共享主角 brief
 * G2: 返回 reasoningTrace
 * G6: 支持世界书注入
 * G9: 支持叙事方向注入
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { getStoryPreset } from "../presets/storyPreset";
import { buildProtagonistBrief, type BriefContext, type BriefOptions } from "../shared/protagonistBrief";
import { extractTaggedBody, extractThinking, hasCompleteTaggedBody, parseActionTag, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE } from "../shared/tagSpec";

export interface StoryChatEntry {
  role: "user" | "assistant";
  content: string;
}

export interface StoryInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  chatHistory: StoryChatEntry[];
  sceneNpcSnapshot?: string;
  currentWorldLocation?: string;
  worldBookContext?: string;
  narrativeDirection?: string;
}

export interface StoryParsed {
  storyBody: string;
  reasoningTrace: string;
  actionTag: string | null;
}

export async function generateStory(input: StoryInput): Promise<StoryParsed> {
  const p = input.protagonist;

  const brief = buildProtagonistBrief(p, {
    npcSnapshot: input.sceneNpcSnapshot,
  }, { revealNumbers: true, includeOrigin: true } as BriefOptions);

  const locationLine = input.currentWorldLocation
    ? `\n当前所在地点：${input.currentWorldLocation}`
    : "";

  let lastUserContent: string | undefined;
  const storyParts: string[] = [];
  for (const entry of input.chatHistory) {
    if (entry.role === "assistant") {
      storyParts.push(entry.content);
    } else {
      lastUserContent = entry.content;
    }
  }

  const previousStory = storyParts.length > 0
    ? storyParts.join("\n\n---\n\n")
    : undefined;

  const system = getStoryPreset(
    input.worldBookContext,
    input.narrativeDirection,
    previousStory,
  );

  const userContent = [
    "【主角摘要 · 请据此与历史剧情继续生成后续剧情】",
    "",
    brief,
    locationLine,
  ].join("\n");

  const fullUserContent = lastUserContent != null
    ? `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_story_body>...</mj_story_body> 标签内。]\n\n${userContent}\n\n${lastUserContent}`
    : userContent;

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 65535,
    system,
    user: fullUserContent,
    retryIf: (raw) => hasCompleteTaggedBody(raw, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE),
    logTag: "剧情生成",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  const storyBody = extractTaggedBody(result.raw, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE, { skipThinking: true });
  const reasoningTrace = extractThinking(result.raw);
  const actionTag = parseActionTag(storyBody);

  return { storyBody, reasoningTrace, actionTag };
}
