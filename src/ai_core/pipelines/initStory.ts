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
import { block } from "../shared/promptBlock";
import { extractTaggedBody, hasCompleteTaggedBody, MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE } from "../shared/tagSpec";

export interface InitStoryInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  userStoryHint?: string;
}

export interface InitStoryParsed {
  storyBody: string;
  reasoningTrace: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 以下为 prompt 分节函数：每个函数产出一个块，供 buildInitStoryUserContent 拼接。
// ─────────────────────────────────────────────────────────────────────────────

/** 叙事人称行：把 NarrationPerson 转成一句中文说明。 */
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

/**
 * 【开局摘要】分节：主角身份卡（姓名/性别/叙事人称/境界/灵根/灵根数量/寿元/出身地点），
 * 供 AI 据此撰写首段剧情。
 */
function sceneHeading(p: ProtagonistPlayInfo): string {
  const place = p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—";
  const lines = [
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    narrationPersonLine(p.narrationPerson),
    `境界：${p.realm.major}${p.realm.minor}`,
    `灵根：${p.linggen.join("") || "无"}`,
    `灵根数量：${p.linggen.length}`,
    `寿元：${p.shouyuan}岁`,
    `出身地点：${place}`,
  ];
  return block("【开局摘要 · 请据此撰写首段剧情】", lines.join("\n"));
}

/** 【出身情况】分节：主角出身/前世经历描述。 */
function sceneOrigin(p: ProtagonistPlayInfo): string {
  return block("【出身情况】", p.originStory?.trim() || "—");
}

/** 【玩家对开局的补充说明】分节：玩家自定义的开局要求（可选）。 */
function sceneUserHint(userStoryHint?: string): string {
  return block("【玩家对开局的补充说明】", userStoryHint);
}

/** 组装 system prompt：全局规则 + 开局剧情规则 + 物品效果词汇表。 */
function buildInitStorySystemPrompt(): string {
  return [PRESET, INIT_STORY_SYSTEM_PRESET, buildStoryItemEffectHint()].join("\n\n");
}

/**
 * 组装发送给 AI 的 user 消息。
 *
 * 构成（按顺序）：
 * 1. 开局摘要       —— sceneHeading()
 * 2. 出身情况       —— sceneOrigin()
 * 3. 玩家补充说明   —— sceneUserHint()
 */
function buildInitStoryUserContent(p: ProtagonistPlayInfo, userStoryHint?: string): string {
  let msg = "";

  // ── 1. 开局摘要：主角身份卡 ──
  msg += sceneHeading(p);

  // ── 2. 出身情况：出身/前世经历 ──
  msg += sceneOrigin(p);

  // ── 3. 玩家补充说明（可选）──
  msg += sceneUserHint(userStoryHint);

  return msg;
}

export async function generateInitStory(input: InitStoryInput): Promise<InitStoryParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 65535,
    system: buildInitStorySystemPrompt(),
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
