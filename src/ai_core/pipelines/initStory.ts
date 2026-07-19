/**
 * Pipeline: initStory
 *
 * 开局剧情生成。从现有 ai/init_story_generate.ts 迁移，
 * 使用 ai_core 的 runPipeline + callChatCompletions。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo, NarrationPerson } from "../../role_core/types/playInfo";
import { formatWorldLocationDash } from "../../role_core/types/worldLocation";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { PRESET } from "../presets/globalPreset";
import { INIT_STORY_SYSTEM_PRESET } from "../presets/initStoryPreset";
import { buildStoryItemEffectHint } from "../shared/itemEffectVocabulary";
import { extractTaggedBody, hasCompleteTaggedBody, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE } from "../shared/tagSpec";

export interface InitStoryInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  userStoryHint?: string;
}

export interface InitStoryParsed {
  storyBody: string;
  reasoningTrace: string;
}

function narrationPersonLine(person: NarrationPerson): string {
  switch (person) {
    case "first":
      return "叙事人称：第一人称——以主角口吻，用「我」「我们」等叙述。";
    case "third":
      return "叙事人称：第三人称——以旁观视角写主角，用「他/她」或其姓名指代主角。";
    case "second":
    default:
      return "叙事人称：第二人称——面向玩家，将主角作为「你」「您」书写。";
  }
}

function buildInitStoryUserContent(p: ProtagonistPlayInfo, userStoryHint?: string): string {
  const place = p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—";
  const origin = p.originStory?.trim() || "—";
  const hint = userStoryHint && String(userStoryHint).trim()
    ? `\n【玩家对开局的补充说明】\n${String(userStoryHint).trim()}\n`
    : "";
  return [
    "【开局摘要 · 请据此撰写首段剧情】",
    "",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    narrationPersonLine(p.narrationPerson),
    `境界：${p.realm.major}${p.realm.minor}`,
    `灵根：${p.linggen.join("") || "无"}`,
    `灵根数量：${p.linggen.length}`,
    `寿元：${p.shouyuan}岁`,
    `出身地点：${place}`,
    "",
    "【出身情况】",
    origin,
    "",
    hint,
    "",
  ].join("\n");
}

export async function generateInitStory(input: InitStoryInput): Promise<InitStoryParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 65535,
    system: [PRESET, INIT_STORY_SYSTEM_PRESET, buildStoryItemEffectHint()].join("\n\n"),
    user: buildInitStoryUserContent(input.protagonist, input.userStoryHint),
    retryIf: (raw) => hasCompleteTaggedBody(raw, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE),
    logTag: "开局剧情",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    storyBody: extractTaggedBody(result.raw, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE, { skipThinking: true }),
    reasoningTrace: "",
  };
}
