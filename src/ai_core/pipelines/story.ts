/**
 * Pipeline: story（统一剧情生成）
 *
 * 每回合单次调用，取代旧的两级拆分（generatePlotOutline 路线大纲 + generateShortTermStory 短期剧情）。
 * 参考 MoRanJiangHu 主剧情：一次调用内完成规划承接与叙事，输出
 * <正文> / <短期记忆> / <变量规划> / <剧情规划> / <行动选项>。
 *
 * - <短期记忆>：本回合事实摘要（≤100字），作为消息 snapshot 与回忆档案条目。
 * - <变量规划>：自然语言状态变化说明稿，交给状态 AI（generateState）对齐落变量。
 * - <剧情规划>：软性下一回合承接摘要，由调用方持久化并在下一回合注入【上回合剧情规划】。
 * - <行动选项>：四档行动建议（激进/中庸/谨慎/最谨慎），供 UI 展示。
 *
 * user 消息构成见 buildStoryUserContent 的节注释。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import type { ActionSuggestions } from "../types/stateDiff";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { PRESET } from "../presets/globalPreset";
import { STORY_SYSTEM_PRESET } from "../presets/storyPreset";
import { buildStoryItemEffectHint } from "../shared/itemEffectVocabulary";
import { buildProtagonistBrief } from "../shared/protagonistBrief";
import { block, rawBlock } from "../shared/promptBlock";
import {
  extractTagContent,
  extractTaggedBody,
  extractThinking,
  hasCompleteTaggedBody,
  MJ_NARRATIVE_BODY_OPEN,
  MJ_NARRATIVE_BODY_CLOSE,
  MJ_SHORT_TERM_MEMORY_OPEN,
  MJ_SHORT_TERM_MEMORY_CLOSE,
  MJ_VAR_PLAN_OPEN,
  MJ_VAR_PLAN_CLOSE,
  MJ_PLOT_PLAN_OPEN,
  MJ_PLOT_PLAN_CLOSE,
  MJ_STORY_ACTION_OPTIONS_OPEN,
  MJ_STORY_ACTION_OPTIONS_CLOSE,
} from "../shared/tagSpec";

export interface StoryChatEntry {
  role: "user" | "assistant";
  content: string;
}

export interface StoryInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  /** 滚动大总结（约 1000 字早期剧情总纲），作为长期背景。 */
  grandSummary?: string;
  /** 中期记忆（回忆档案批次压缩结果）。 */
  midTermMemory?: string[];
  /** 长期记忆（中期记忆批次再压缩结果）。 */
  longTermMemory?: string[];
  /** 剧情回忆检索结果（强回忆原文 + 弱回忆摘要），由 recallStory pipeline 产出。 */
  recallTag?: string;
  /** 上回合 <剧情规划> 摘要（软性承接）。 */
  plotPlan?: string;
  /** 当前章节状态摘要（当前章节/下一章预告/历史卷宗）。 */
  章节状态摘要?: string;
  /** 当前剧情规划树摘要（当前章目标/任务/待触发事件/镜头）。 */
  剧情规划摘要?: string;
  /** 后台世界动态摘要（活跃NPC行动/事件池/镜头）。 */
  世界动态摘要?: string;
  /** 近期若干轮交互（已由调用方截断，通常 1-2 轮）。 */
  recentHistory: StoryChatEntry[];
  currentWorldLocation?: WorldLocation | null;
  sceneNpcSnapshot?: string;
}

export interface StoryParsed {
  /** <正文> 剧情正文。 */
  storyBody: string;
  /** <短期记忆> 本回合事实摘要（≤100字上帝视角）。 */
  shortTermMemory: string;
  /** <变量规划> 自然语言状态变化说明稿。 */
  variablePlan: string;
  /** <剧情规划> 软性下一回合承接摘要。 */
  plotPlan: string;
  /** <行动选项> 四档行动建议；不完整时返回 null。 */
  actionOptions: ActionSuggestions | null;
  reasoningTrace: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 以下为 prompt 分节函数：每个函数产出一个块，供 buildStoryUserContent 拼接。
// ─────────────────────────────────────────────────────────────────────────────

/** 格式提醒：强制模型输出结构化标签（放在 user 消息最前）。 */
const FORMAT_REMINDER =
  "[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <正文>...</正文> 标签内。]";

/**
 * 【主角摘要】分节：角色卡（姓名/境界/装备/功法/物品/伤势 + 在场 NPC 场景快照），
 * 让 AI 了解本回合承接的现实起点。
 */
function sceneProtagonist(input: StoryInput): string {
  const brief = buildProtagonistBrief(
    input.protagonist,
    { npcSnapshot: input.sceneNpcSnapshot },
    { revealNumbers: true, includeOrigin: false },
  );
  return block("【主角摘要】", brief);
}

/** 【当前所在地点】分节：四级地点字符串（大区域-国家-区域-具体地点）。 */
function sceneLocation(loc?: WorldLocation | null): string {
  if (!loc) return "";
  const dash = [loc.region, loc.country, loc.area, loc.detail].filter(Boolean).join("-");
  return block("【当前所在地点】", dash);
}

/** 【剧情总纲·截至早期】分节：滚动大总结，作为早期长期背景。 */
function sceneGrandSummary(grandSummary?: string): string {
  return block("【剧情总纲·截至早期】", grandSummary);
}

/** 【长期记忆】分节：中期记忆批次再压缩结果（覆盖更久远的往事）。 */
function sceneLongTermMemory(longTermMemory?: string[]): string {
  const parts = (longTermMemory ?? []).map((s) => s?.trim()).filter(Boolean);
  return block("【长期记忆】", parts.length > 0 ? parts.join("\n\n") : "");
}

/** 【中期记忆】分节：回忆档案批次压缩结果（中程背景）。 */
function sceneMidTermMemory(midTermMemory?: string[]): string {
  const parts = (midTermMemory ?? []).map((s) => s?.trim()).filter(Boolean);
  return block("【中期记忆】", parts.length > 0 ? parts.join("\n\n") : "");
}

/** 【剧情回忆】分节：RAG 按需召回的前情（强回忆原文 + 弱回忆摘要），承接旧账/恩怨/约定。 */
function sceneRecall(recallTag?: string): string {
  return block("【剧情回忆·据此承接前情】", recallTag);
}

/** 【当前章节状态】分节：当前章节/下一章预告/历史卷宗摘要，剧情承接的章节锚点。 */
function sceneChapterState(章节状态摘要?: string): string {
  return block("【当前章节状态】", 章节状态摘要);
}

/** 【当前剧情规划】分节：当前章目标/任务/待触发事件/镜头规划摘要，推进的硬承接依据。 */
function scenePlotPlanTree(剧情规划摘要?: string): string {
  return block("【当前剧情规划·本回合推进应优先承接】", 剧情规划摘要);
}

/** 【后台世界动态】分节：镜头外 NPC 行动与后台事件，可作氛围/旁线素材，不作为主线强制项。 */
function sceneWorldDynamic(世界动态摘要?: string): string {
  return block("【后台世界动态】", 世界动态摘要);
}

/** 【上回合剧情规划】分节：上一回合 <剧情规划> 软性交接摘要，本回合必须优先接住。 */
function scenePlotPlan(plotPlan?: string): string {
  return block("【上回合剧情规划·据此承接】", plotPlan);
}

/** 【上一幕剧情】分节：最近 1-2 段正文，保证场景衔接。 */
function sceneRecentStory(recentStory: string): string {
  return block("【上一幕剧情】", recentStory);
}

/** 【玩家本轮行动】分节：本次输入内容。 */
function scenePlayerAction(lastUserContent?: string): string {
  return block("【玩家本轮行动】", lastUserContent);
}

/** 从 recentHistory 抽取：最近的玩家输入 + 最近 1-2 段 assistant 正文。 */
function extractHistory(recentHistory: StoryChatEntry[]): {
  lastUserContent?: string;
  recentStory: string;
} {
  let lastUserContent: string | undefined;
  const histParts: string[] = [];
  for (const entry of recentHistory) {
    if (entry.role === "user") {
      lastUserContent = entry.content;
    } else {
      histParts.push(entry.content);
    }
  }
  return { lastUserContent, recentStory: histParts.slice(-2).join("\n\n---\n\n") };
}

/** 组装 system prompt：全局规则 + 统一剧情规则 + 物品效果词汇表。 */
function buildStorySystemPrompt(): string {
  return [PRESET, STORY_SYSTEM_PRESET, buildStoryItemEffectHint()].join("\n\n");
}

/**
 * 组装发送给 AI 的 user 消息。
 *
 * 构成（按顺序）：
 * 1. 格式提醒         —— 强制结构化标签
 * 2. 主角摘要         —— sceneProtagonist()
 * 3. 当前所在地点     —— sceneLocation()
 * 4. 剧情总纲·截至早期 —— sceneGrandSummary()
 * 5. 当前章节状态     —— sceneChapterState()
 * 6. 当前剧情规划     —— scenePlotPlanTree()
 * 7. 后台世界动态     —— sceneWorldDynamic()
 * 8. 长期记忆         —— sceneLongTermMemory()
 * 9. 中期记忆         —— sceneMidTermMemory()
 * 10. 剧情回忆        —— sceneRecall()
 * 11. 上回合剧情规划  —— scenePlotPlan()
 * 12. 上一幕剧情      —— sceneRecentStory()
 * 13. 玩家本轮行动    —— scenePlayerAction()
 */
function buildStoryUserContent(input: StoryInput): string {
  const { lastUserContent, recentStory } = extractHistory(input.recentHistory);

  let msg = "";

  // ── 1. 格式提醒：引导模型输出带标签的结构 ──
  msg += rawBlock(FORMAT_REMINDER);

  // ── 2. 主角摘要：角色卡（姓名/境界/装备/功法/物品/伤势）──
  msg += sceneProtagonist(input);

  // ── 3. 当前所在地点：四级地点字符串 ──
  msg += sceneLocation(input.currentWorldLocation);

  // ── 4. 剧情总纲·截至早期：早期剧情滚动总结（长期背景）──
  msg += sceneGrandSummary(input.grandSummary);

  // ── 5. 当前章节状态：章节锚点 ──
  msg += sceneChapterState(input.章节状态摘要);

  // ── 6. 当前剧情规划：硬承接依据 ──
  msg += scenePlotPlanTree(input.剧情规划摘要);

  // ── 7. 后台世界动态：旁线素材 ──
  msg += sceneWorldDynamic(input.世界动态摘要);

  // ── 8. 长期记忆：中期记忆再压缩结果 ──
  msg += sceneLongTermMemory(input.longTermMemory);

  // ── 9. 中期记忆：回忆档案批次压缩结果 ──
  msg += sceneMidTermMemory(input.midTermMemory);

  // ── 10. 剧情回忆：RAG 按需召回的前情（强回忆优先）──
  msg += sceneRecall(input.recallTag);

  // ── 11. 上回合剧情规划：软性承接摘要，本回合必须优先接住 ──
  msg += scenePlotPlan(input.plotPlan);

  // ── 12. 上一幕剧情：最近 1-2 段正文，保证衔接 ──
  msg += sceneRecentStory(recentStory);

  // ── 13. 玩家本轮行动：本次输入 ──
  msg += scenePlayerAction(lastUserContent);

  return msg;
}

/** 解析 <行动选项>：四行【激进】/【中庸】/【谨慎】/【最谨慎】。四档齐备才返回。 */
function parseStoryActionOptions(raw: string): ActionSuggestions | null {
  const text = extractTagContent(raw, MJ_STORY_ACTION_OPTIONS_OPEN, MJ_STORY_ACTION_OPTIONS_CLOSE);
  if (!text.trim()) return null;

  const values: Partial<Record<keyof ActionSuggestions, string>> = {};
  const labelRe = /【\s*(激进|中庸|谨慎|最谨慎)\s*】\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(text)) !== null) {
    const keyMap: Record<string, keyof ActionSuggestions> = {
      激进: "aggressive",
      中庸: "moderate",
      谨慎: "cautious",
      最谨慎: "veryCautious",
    };
    const key = keyMap[m[1]];
    if (key) values[key] = m[2].trim();
  }

  const aggressive = values.aggressive ?? "";
  const moderate = values.moderate ?? "";
  const cautious = values.cautious ?? "";
  const veryCautious = values.veryCautious ?? "";
  if (!aggressive || !moderate || !cautious || !veryCautious) return null;
  return { aggressive, moderate, cautious, veryCautious };
}

export async function generateStory(input: StoryInput): Promise<StoryParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.6,
    defaultMaxTokens: 8192,
    system: buildStorySystemPrompt(),
    user: buildStoryUserContent(input),
    retryIf: (raw) => hasCompleteTaggedBody(raw, MJ_NARRATIVE_BODY_OPEN, MJ_NARRATIVE_BODY_CLOSE),
    logTag: "统一剧情",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  const storyBody = extractTaggedBody(result.raw, MJ_NARRATIVE_BODY_OPEN, MJ_NARRATIVE_BODY_CLOSE, { skipThinking: true });
  const shortTermMemory = extractTagContent(result.raw, MJ_SHORT_TERM_MEMORY_OPEN, MJ_SHORT_TERM_MEMORY_CLOSE);
  const variablePlan = extractTagContent(result.raw, MJ_VAR_PLAN_OPEN, MJ_VAR_PLAN_CLOSE);
  const plotPlanOut = extractTagContent(result.raw, MJ_PLOT_PLAN_OPEN, MJ_PLOT_PLAN_CLOSE);
  const actionOptions = parseStoryActionOptions(result.raw);
  const reasoningTrace = extractThinking(result.raw);

  return { storyBody, shortTermMemory, variablePlan, plotPlan: plotPlanOut, actionOptions, reasoningTrace };
}
