/**
 * Pipeline: plotOutline（路线剧情大纲）
 *
 * 仅在关键节点触发（开局 / 跨大区域移动 / 大境界突破 / 回合耗尽）。
 * 产出约 1000 字散文蓝图，供 shortTermStory 逐回合消费。
 *
 * 重生阈值常量 OUTLINE_REFRESH_TURNS 由本模块导出，供 StoryChatPanel 判定回合耗尽触发。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { PLOT_OUTLINE_SYSTEM_PRESET } from "../presets/plotOutlinePreset";
import { buildProtagonistBrief } from "../shared/protagonistBrief";
import {
  extractTaggedBody,
  extractThinking,
  hasCompleteTaggedBody,
  MJ_PLOT_OUTLINE_OPEN,
  MJ_PLOT_OUTLINE_CLOSE,
} from "../shared/tagSpec";

/** 自上次大纲生成后，经过多少个短期剧情回合即视为"耗尽"，触发重生。 */
export const OUTLINE_REFRESH_TURNS = 20;

export interface PlotOutlineInput extends AiRequestConfig {
  protagonist: ProtagonistPlayInfo;
  /** 滚动大总结（早期剧情总纲），作为长期背景。 */
  grandSummary?: string;
  /** 长期记忆（中期记忆批次再压缩结果）；非空时优先于 grandSummary 作为长期背景。 */
  longTermMemory?: string[];
  /** 中期记忆（回忆档案批次压缩结果），作为中长期背景补充。 */
  midTermMemory?: string[];
  /** 近期若干条剧情快照，供大纲撰写"近期经历回顾"段。 */
  recentSnapshots?: string[];
  currentWorldLocation?: WorldLocation | null;
  sceneNpcSnapshot?: string;
}

export interface PlotOutlineParsed {
  outline: string;
  reasoningTrace: string;
}

export async function generatePlotOutline(input: PlotOutlineInput): Promise<PlotOutlineParsed> {
  const p = input.protagonist;

  const brief = buildProtagonistBrief(
    p,
    { npcSnapshot: input.sceneNpcSnapshot },
    { revealNumbers: true, includeOrigin: false },
  );

  const locationLine = input.currentWorldLocation
    ? `\n当前所在地点：${[input.currentWorldLocation.region, input.currentWorldLocation.country, input.currentWorldLocation.area, input.currentWorldLocation.detail].filter(Boolean).join("-")}`
    : "";

  const parts: string[] = ["【主角摘要】", "", brief, locationLine];

  // 长期背景：优先用多层压缩的 longTermMemory，回退到旧版 grandSummary。
  const longTermParts = (input.longTermMemory ?? [])
    .map((s) => s?.trim())
    .filter(Boolean);
  const grand = input.grandSummary?.trim();
  if (longTermParts.length > 0) {
    parts.push("", "【剧情总纲·早期背景】", longTermParts.join("\n\n"));
  } else if (grand) {
    parts.push("", "【剧情总纲·早期背景】", grand);
  }

  const midParts = (input.midTermMemory ?? [])
    .map((s) => s?.trim())
    .filter(Boolean);
  if (midParts.length > 0) {
    parts.push("", "【中期剧情摘要】", midParts.join("\n\n"));
  }

  const snaps = (input.recentSnapshots ?? []).filter((s) => s && s.trim());
  if (snaps.length > 0) {
    parts.push("", "【近期剧情快照】", snaps.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n"));
  }

  const userContent = parts.join("\n");

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.6,
    defaultMaxTokens: 6144,
    system: PLOT_OUTLINE_SYSTEM_PRESET,
    user: userContent,
    retryIf: (raw) => hasCompleteTaggedBody(raw, MJ_PLOT_OUTLINE_OPEN, MJ_PLOT_OUTLINE_CLOSE),
    logTag: "路线大纲",
  };

  const result = await runPipeline(input, opts, callChatCompletions);

  const outline = extractTaggedBody(result.raw, MJ_PLOT_OUTLINE_OPEN, MJ_PLOT_OUTLINE_CLOSE, { skipThinking: true });
  const reasoningTrace = extractThinking(result.raw);

  return { outline, reasoningTrace };
}
