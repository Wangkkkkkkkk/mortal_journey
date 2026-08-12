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
import { block, rawBlock } from "../shared/promptBlock";
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

// ─────────────────────────────────────────────────────────────────────────────
// 以下为 prompt 分节函数：每个函数产出一个块，供 buildFinaleUserContent 拼接。
// ─────────────────────────────────────────────────────────────────────────────

/** 【死亡原因】分节：寿元耗尽/战败等原因。 */
function sceneDeathReason(deathReason: string): string {
  return block("【死亡原因】", deathReason);
}

/** 【主角生平】分节：主角角色卡（简要，不暴露数值）。 */
function sceneLifeBrief(input: FinaleStoryInput): string {
  const brief = buildProtagonistBrief(input.protagonist, {
    npcSnapshot: input.npcSnapshot,
  }, { revealNumbers: false, includeOrigin: true });
  return block("【主角生平】", brief);
}

/** 【死亡场景】分节：死亡瞬间的场景上下文（可选）。 */
function sceneDeathScene(sceneContext?: string): string {
  return block("【死亡场景】", sceneContext);
}

/** 【一生中的重要人物】分节：主要 NPC 快照（可选）。 */
function sceneImportantPeople(npcSnapshot?: string): string {
  return block("【一生中的重要人物】", npcSnapshot);
}

/** 结尾指令：走马灯叙事要求（主角已死，不复活）。 */
function sceneInstruction(): string {
  return rawBlock(
    "请根据以上信息与【主角的一生轨迹】，以走马灯的形式回顾主角的一生——从凡人出身、踏入修仙、关键羁绊、巅峰转折，到最终的陨落与遗恨。这是结局叙事，主角已死，不要复活，不要留悬念。",
  );
}

/**
 * 组装发送给 AI 的 user 消息。
 *
 * 构成（按顺序）：
 * 1. 死亡原因       —— sceneDeathReason()
 * 2. 主角生平       —— sceneLifeBrief()
 * 3. 死亡场景       —— sceneDeathScene()
 * 4. 一生中的重要人物 —— sceneImportantPeople()
 * 5. 走马灯指令     —— sceneInstruction()
 */
function buildFinaleUserContent(input: FinaleStoryInput): string {
  let msg = "";

  // ── 1. 死亡原因 ──
  msg += sceneDeathReason(input.deathReason);

  // ── 2. 主角生平：主角角色卡 ──
  msg += sceneLifeBrief(input);

  // ── 3. 死亡场景（可选）──
  msg += sceneDeathScene(input.sceneContext);

  // ── 4. 一生中的重要人物（可选）──
  msg += sceneImportantPeople(input.npcSnapshot);

  // ── 5. 走马灯叙事指令 ──
  msg += sceneInstruction();

  return msg;
}

/** 组装 system prompt：全局规则 + 结局叙事规则 + 主角一生轨迹（历史正文）。 */
function buildFinaleSystemPrompt(chatHistory: FinaleStoryInput["chatHistory"]): string {
  const parts = [PRESET, FINALE_STORY_SYSTEM_PRESET];
  const storyParts = chatHistory
    .filter((e) => e.role === "assistant")
    .map((e) => e.content);
  if (storyParts.length > 0) {
    parts.push("【主角的一生轨迹】\n" + storyParts.join("\n\n---\n\n"));
  }
  return parts.join("\n\n");
}

export async function generateFinaleStory(input: FinaleStoryInput): Promise<FinaleStoryParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.7,
    defaultMaxTokens: 16384,
    system: buildFinaleSystemPrompt(input.chatHistory),
    user: `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_finale_body>...</mj_finale_body> 标签内。]\n\n${buildFinaleUserContent(input)}`,
    logTag: "结局",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  return {
    storyBody: extractTaggedBody(result.raw, MJ_FINALE_BODY_OPEN, MJ_FINALE_BODY_CLOSE, { skipThinking: true }),
  };
}
