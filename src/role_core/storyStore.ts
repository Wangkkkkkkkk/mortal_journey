/**
 * @fileoverview 剧情/对话状态模块单例。
 *
 * 把原本散落在 `useOpeningStory`（开局）与 `StoryChatPanel`（每轮对话）的组件级 ref
 * 提升为模块级单例，对齐 `npcStore` / `worldMapStore` 模式，使存档系统可统一序列化：
 *
 *   存档 = Protagonist.toData() + npcStore.serializeNpcs()
 *        + worldMapStore.serializeWorldMap() + storyStore.serializeStory()
 *
 * `useOpeningStory` 写入本 store；`MainScreen` / `StoryChatPanel` 读取本 store。
 */

import { ref } from "vue";
import type { OpeningStoryPhase } from "../ai_core";
import type { ActionSuggestions } from "../ai_core";
import type { WorldLocation } from "./types/worldLocation";
import type { WorldTime } from "./worldTime";
import { cloneWorldTime, createDefaultWorldTime } from "./worldTime";

/** 单条聊天消息。story 消息可携带 AI 生成的快照（compact summary），用于后续上下文。
 *  summary 类型用于滚动大总结裁剪历史后，作为聊天栏顶部的「早期经历总纲」占位消息，
 *  替代已被物理删除的旧 story 消息。 */
export interface ChatMessage {
  type: "story" | "user" | "summary";
  content: string;
  snapshot?: string;
}

/** 可序列化的剧情快照（存档载荷的 story 分量）。 */
export interface StorySerialData {
  storyBody: string;
  /** 存档恢复后恒为 "ready"；保存时原样记录。 */
  phase: OpeningStoryPhase;
  worldTime: WorldTime;
  worldTimeBaseline: WorldTime;
  worldLocation: WorldLocation | null;
  initSnapshot: string;
  actionOptions: ActionSuggestions | null;
  chatMessages: ChatMessage[];
  /** 滚动大总结（约 1000 字剧情总纲），替代已被压缩的旧轮快照。空串表示无大总结。 */
  grandSummary: string;
  /** 大总结覆盖到的 chatMessages 索引（不含）；index < 此值的 story 已被吃进大总结。 */
  grandSummaryUpTo: number;
  /** 路线剧情大纲（约 1000 字散文蓝图，含近期回顾与 2-3 条多方向钩子）。空串表示无大纲。 */
  plotOutline: string;
  /** 自上次大纲生成以来的短期剧情回合数；达阈值则重生大纲。 */
  outlineTurnCounter: number;
  /** 上次生成大纲时主角所在地点（用于检测跨大区域/国家移动以触发重生）。 */
  outlineWorldLocation: WorldLocation | null;
  /** 是否启用剧情回忆检索（RAG）。缺省/老存档视为 true。 */
  recallEnabled?: boolean;
  /** 回忆检索最早触发的回合数阈值；缺省视为 10。 */
  recallMinRound?: number;
  /** 回忆检索语料中保留原文的最近条数 N；缺省视为 20。 */
  recallFullN?: number;
  /** 中期记忆：回忆档案批次压缩结果（每条约 300-500 字，覆盖约 30 回合）。 */
  midTermMemory?: string[];
  /** 长期记忆：中期记忆批次再压缩结果（每条约 800-1000 字，覆盖约 50 条中期）。 */
  longTermMemory?: string[];
  /** 回忆档案中已被压入中期记忆的回合数（不含）；未压缩区 = archive[compressedUpTo:]。 */
  archiveCompressedUpTo?: number;
}

const storyBody = ref("");
const phase = ref<OpeningStoryPhase>("idle");
const worldTime = ref<WorldTime>(createDefaultWorldTime());
const worldTimeBaseline = ref<WorldTime>(cloneWorldTime(worldTime.value));
const worldLocation = ref<WorldLocation | null>(null);
const initSnapshot = ref("");
const actionOptions = ref<ActionSuggestions | null>(null);
const chatMessages = ref<ChatMessage[]>([]);
/** 滚动大总结（约 1000 字剧情总纲）。空串表示尚无大总结。 */
const grandSummary = ref("");
/** 大总结覆盖到的 chatMessages 索引（不含）；index < 此值的 story 已被吃进大总结。 */
const grandSummaryUpTo = ref(0);
/** 路线剧情大纲（约 1000 字散文蓝图）。空串表示尚无大纲。 */
const plotOutline = ref("");
/** 自上次大纲生成以来的短期剧情回合数。 */
const outlineTurnCounter = ref(0);
/** 上次生成大纲时主角所在地点。 */
const outlineWorldLocation = ref<WorldLocation | null>(null);
/** 是否启用剧情回忆检索（RAG）。 */
const recallEnabled = ref(true);
/** 回忆检索最早触发的回合数阈值。 */
const recallMinRound = ref(10);
/** 回忆检索语料中保留原文的最近条数 N。 */
const recallFullN = ref(20);
/** 中期记忆：回忆档案批次压缩结果。 */
const midTermMemory = ref<string[]>([]);
/** 长期记忆：中期记忆批次再压缩结果。 */
const longTermMemory = ref<string[]>([]);
/** 回忆档案中已被压入中期记忆的回合数（不含）。 */
const archiveCompressedUpTo = ref(0);
/** 游戏结束原因（战败/寿尽），仅在 phase==="ended" 时展示用；不持久化，进入 ended 状态时实时写入。 */
const gameOverReason = ref("");

/**
 * 读档会话标志：true 表示当前 MainScreen 是从存档恢复挂载的，
 * `useOpeningStory` 据此跳过「清空主角/剧情」与「重跑开局 AI」。
 * 仅会话内有效，不持久化。
 */
const restored = ref(false);

/** 重置全部剧情/对话状态到初始值（开新档、读档前清场用）。 */
function clearStory(): void {
  storyBody.value = "";
  phase.value = "idle";
  const w = createDefaultWorldTime();
  worldTime.value = w;
  worldTimeBaseline.value = cloneWorldTime(w);
  worldLocation.value = null;
  initSnapshot.value = "";
    actionOptions.value = null;
    chatMessages.value = [];
    grandSummary.value = "";
    grandSummaryUpTo.value = 0;
    plotOutline.value = "";
    outlineTurnCounter.value = 0;
    outlineWorldLocation.value = null;
    recallEnabled.value = true;
    recallMinRound.value = 10;
    recallFullN.value = 20;
    midTermMemory.value = [];
    longTermMemory.value = [];
    archiveCompressedUpTo.value = 0;
    gameOverReason.value = "";
    restored.value = false;
}

/** 序列化当前剧情状态为纯 JSON（深拷贝，断开与响应式引用的联系）。 */
function serializeStory(): StorySerialData {
  return {
    storyBody: storyBody.value,
    phase: phase.value,
    worldTime: cloneWorldTime(worldTime.value),
    worldTimeBaseline: cloneWorldTime(worldTimeBaseline.value),
    worldLocation: worldLocation.value ? { ...worldLocation.value } : null,
    initSnapshot: initSnapshot.value,
    actionOptions: actionOptions.value,
    chatMessages: chatMessages.value.map((m) => ({ ...m })),
    grandSummary: grandSummary.value,
    grandSummaryUpTo: grandSummaryUpTo.value,
    plotOutline: plotOutline.value,
    outlineTurnCounter: outlineTurnCounter.value,
    outlineWorldLocation: outlineWorldLocation.value ? { ...outlineWorldLocation.value } : null,
    recallEnabled: recallEnabled.value,
    recallMinRound: recallMinRound.value,
    recallFullN: recallFullN.value,
    midTermMemory: [...midTermMemory.value],
    longTermMemory: [...longTermMemory.value],
    archiveCompressedUpTo: archiveCompressedUpTo.value,
  };
}

/** 从存档数据恢复剧情状态，并置 restored=true（读档会话）。 */
function restoreStory(data: StorySerialData | null | undefined): void {
  const d = data ?? ({} as Partial<StorySerialData>);
  storyBody.value = d.storyBody || "";
  // 读档总是在「就绪」状态恢复——不存档生成中途。
  phase.value = "ready";
  worldTime.value = d.worldTime ? cloneWorldTime(d.worldTime) : createDefaultWorldTime();
  worldTimeBaseline.value = d.worldTimeBaseline
    ? cloneWorldTime(d.worldTimeBaseline)
    : createDefaultWorldTime();
  worldLocation.value = d.worldLocation ? { ...d.worldLocation } : null;
  initSnapshot.value = d.initSnapshot || "";
  actionOptions.value = d.actionOptions ?? null;
  chatMessages.value = (d.chatMessages ?? []).map((m) => ({ ...m }));
  grandSummary.value = d.grandSummary ?? "";
  grandSummaryUpTo.value = d.grandSummaryUpTo ?? 0;
  plotOutline.value = d.plotOutline ?? "";
  outlineTurnCounter.value = d.outlineTurnCounter ?? 0;
  outlineWorldLocation.value = d.outlineWorldLocation ? { ...d.outlineWorldLocation } : null;
  recallEnabled.value = d.recallEnabled ?? true;
  recallMinRound.value = d.recallMinRound ?? 10;
  recallFullN.value = d.recallFullN ?? 20;
  midTermMemory.value = Array.isArray(d.midTermMemory) ? [...d.midTermMemory] : [];
  // 老存档迁移：若无长期记忆但存在旧版 grandSummary，把它作为长期记忆的种子。
  longTermMemory.value = Array.isArray(d.longTermMemory)
    ? [...d.longTermMemory]
    : (d.grandSummary && d.grandSummary.trim() ? [d.grandSummary.trim()] : []);
  archiveCompressedUpTo.value = d.archiveCompressedUpTo ?? 0;
  restored.value = true;
}

/**
 * 从快照还原剧情状态，但不设置 `restored`、不强制 `phase`。
 *
 * 与 `restoreStory` 的区别：`restoreStory` 面向「读档」，会强制 `phase="ready"` 并置
 * `restored=true`（使 `useOpeningStory` 跳过开局逻辑）；本方法面向「重试回退」等
 * 局部还原场景，原样恢复快照内的全部字段（含 phase），不动 `restored` 标志。
 */
function applyStorySnapshot(data: StorySerialData | null | undefined): void {
  const d = data ?? ({} as Partial<StorySerialData>);
  storyBody.value = d.storyBody || "";
  phase.value = d.phase ?? "idle";
  worldTime.value = d.worldTime ? cloneWorldTime(d.worldTime) : createDefaultWorldTime();
  worldTimeBaseline.value = d.worldTimeBaseline
    ? cloneWorldTime(d.worldTimeBaseline)
    : createDefaultWorldTime();
  worldLocation.value = d.worldLocation ? { ...d.worldLocation } : null;
  initSnapshot.value = d.initSnapshot || "";
  actionOptions.value = d.actionOptions ?? null;
  chatMessages.value = (d.chatMessages ?? []).map((m) => ({ ...m }));
  grandSummary.value = d.grandSummary ?? "";
  grandSummaryUpTo.value = d.grandSummaryUpTo ?? 0;
  plotOutline.value = d.plotOutline ?? "";
  outlineTurnCounter.value = d.outlineTurnCounter ?? 0;
  outlineWorldLocation.value = d.outlineWorldLocation ? { ...d.outlineWorldLocation } : null;
  recallEnabled.value = d.recallEnabled ?? true;
  recallMinRound.value = d.recallMinRound ?? 10;
  recallFullN.value = d.recallFullN ?? 20;
  midTermMemory.value = Array.isArray(d.midTermMemory) ? [...d.midTermMemory] : [];
  longTermMemory.value = Array.isArray(d.longTermMemory)
    ? [...d.longTermMemory]
    : (d.grandSummary && d.grandSummary.trim() ? [d.grandSummary.trim()] : []);
  archiveCompressedUpTo.value = d.archiveCompressedUpTo ?? 0;
}

export const storyStore = {
  storyBody,
  phase,
  worldTime,
  worldTimeBaseline,
  worldLocation,
  initSnapshot,
  actionOptions,
  chatMessages,
  grandSummary,
  grandSummaryUpTo,
  plotOutline,
  outlineTurnCounter,
  outlineWorldLocation,
  recallEnabled,
  recallMinRound,
  recallFullN,
  midTermMemory,
  longTermMemory,
  archiveCompressedUpTo,
  gameOverReason,
  restored,
  clearStory,
  serializeStory,
  restoreStory,
  applyStorySnapshot,
};
