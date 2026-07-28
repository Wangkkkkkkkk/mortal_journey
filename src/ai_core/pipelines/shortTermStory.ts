/**
 * Pipeline: shortTermStory（短期剧情）
 *
 * 每回合调用。基于路线大纲 + 玩家输入 + 近期 1-2 轮交互，产出 150-250 字的单个场景段落。
 *
 * 与原 generateStory 的关键差异（提速 + 反强制推进）：
 * - system prompt 精简（SHORT_TERM_STORY_SYSTEM_PRESET）。
 * - 不灌入全量历史，仅取最近 N 轮交互。
 * - 注入路线大纲作为叙事方向（替代全量历史提供上下文）。
 * - maxTokens 大幅降低（2048），输出更短。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { SHORT_TERM_STORY_SYSTEM_PRESET } from "../presets/shortTermStoryPreset";
import { buildProtagonistBrief } from "../shared/protagonistBrief";
import {
  extractTaggedBody,
  extractThinking,
  hasCompleteTaggedBody,
  MJ_STORY_BODY_OPEN,
  MJ_STORY_BODY_CLOSE,
} from "../shared/tagSpec";

export interface ShortTermChatEntry {
  role: "user" | "assistant";
  content: string;
}

export interface ShortTermStoryInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  /** 路线大纲（约 1000 字蓝图）。 */
  plotOutline: string;
  /** 近期若干轮交互（已由调用方截断，通常 1-2 轮）。 */
  recentHistory: ShortTermChatEntry[];
  currentWorldLocation?: WorldLocation | null;
  sceneNpcSnapshot?: string;
  /** 剧情回忆检索结果（强回忆原文 + 弱回忆摘要），由 recallStory pipeline 产出。 */
  recallTag?: string;
}

export interface ShortTermStoryParsed {
  storyBody: string;
  reasoningTrace: string;
}

export async function generateShortTermStory(input: ShortTermStoryInput): Promise<ShortTermStoryParsed> {
  const p = input.protagonist;

  const brief = buildProtagonistBrief(
    p,
    { npcSnapshot: input.sceneNpcSnapshot },
    { revealNumbers: true, includeOrigin: false },
  );

  const locationLine = input.currentWorldLocation
    ? `\n当前所在地点：${[input.currentWorldLocation.region, input.currentWorldLocation.country, input.currentWorldLocation.area, input.currentWorldLocation.detail].filter(Boolean).join("-")}`
    : "";

  // 仅取最近的玩家输入（recentHistory 末尾的 user）。
  let lastUserContent: string | undefined;
  const histParts: string[] = [];
  for (const entry of input.recentHistory) {
    if (entry.role === "user") {
      lastUserContent = entry.content;
    } else {
      histParts.push(entry.content);
    }
  }
  // 近期剧情正文（assistant 侧），只保留最近 1-2 段。
  const recentStory = histParts.slice(-2).join("\n\n---\n\n");

  const parts: string[] = [
    "【主角摘要】",
    "",
    brief,
    locationLine,
  ];

  if (input.plotOutline.trim()) {
    parts.push("", "【路线大纲·据此展开当前场景】", input.plotOutline.trim());
  }

  const recallTag = input.recallTag?.trim();
  if (recallTag) {
    parts.push("", "【剧情回忆·据此承接前情】", recallTag);
  }

  if (recentStory.trim()) {
    parts.push("", "【上一幕剧情】", recentStory.trim());
  }

  const baseContent = parts.join("\n");

  const fullUserContent = lastUserContent != null
    ? `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_story_body>...</mj_story_body> 标签内。]\n\n${baseContent}\n\n【玩家本轮行动】\n${lastUserContent}`
    : `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_story_body>...</mj_story_body> 标签内。]\n\n${baseContent}`;

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 2048,
    system: SHORT_TERM_STORY_SYSTEM_PRESET,
    user: fullUserContent,
    retryIf: (raw) => hasCompleteTaggedBody(raw, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE),
    logTag: "短期剧情",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  const storyBody = extractTaggedBody(result.raw, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE, { skipThinking: true });
  const reasoningTrace = extractThinking(result.raw);

  return { storyBody, reasoningTrace };
}
