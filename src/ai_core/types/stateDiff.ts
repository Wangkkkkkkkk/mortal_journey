/**
 * 状态更新类型定义。
 *
 * 状态更新为单次调用，统一产出 StateParsed。
 */

import type { WorldLocation } from "../../role_core/types/worldLocation";
import type { TimeDelta, WorldTime } from "../../role_core/worldTime";
import type { NpcNearbyEntry, BattleTriggerEntry, NpcLeftEvent } from "./npcEvents";
import type { NpcCoreChangeEvent } from "../../role_core/npcCoreChange";

export interface HpMpState {
  hpPercent: number;
  mpPercent: number;
}

export interface BreakthroughState {
  realmBreakthrough?: boolean;
  breakthroughQuestStart?: boolean;
  breakthroughFailed?: boolean;
}

export interface UserStateChange {
  xiuweiIncrease?: number;
  gongfaMasteryChanges?: Array<{
    gongfaName: string;
    masteryExpIncrease: number;
  }>;
}

export interface SpiritStoneChange {
  op: "add" | "remove";
  count: number;
}

export interface ItemAddEntry {
  type: string;
  name: string;
  intro: string;
  grade: string;
  count: number;
  bonus?: unknown;
  /** 统一效果列表 [{kind, ...参数}]，由状态 AI 从效果词汇表选择，可多条组合。 */
  effects?: unknown;
}

export interface ItemRemoveEntry {
  name: string;
  count: number;
}

export interface ActionSuggestions {
  aggressive: string;
  moderate: string;
  cautious: string;
  veryCautious: string;
}

export interface StateGenerateInput {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  storyBody: string;
  reasoningTrace?: string;
  worldTime?: WorldTime;
}

/**
 * 状态更新产出的统一类型（被 role_core/Protagonist.ts / StoryChatPanel.vue 使用）。
 * 一次状态更新调用直接产出 StateParsed，不再拆分为主角/NPC 两条路径。
 */

export interface NpcSnapshotEntry {
  npcId: string;
  snapshot: string;
}

/** 本轮某 NPC 与主角的关键互动记忆（追加到 npc.memories）。 */
export interface NpcMemoryEntry {
  npcId: string;
  text: string;
}

/** 本轮 NPC 好感度增量变化（显式事件驱动，替代旧的绝对值覆盖）。 */
export interface NpcFavorChangeEntry {
  npcId: string;
  /** 增量，正为涨负为跌；运行时会按上限裁剪。 */
  delta: number;
  /** 变化原因（一句话，须有正文依据）。 */
  reason: string;
  /** 是否重大事件（true 时单回合上限放宽到 ±25；否则 ±10）。 */
  major?: boolean;
}

export interface StateParsed {
  worldLocation: WorldLocation | null;
  hpMp: HpMpState | null;
  userState: UserStateChange | null;
  timeAdvance: TimeDelta | null;
  breakthrough: BreakthroughState | null;
  spiritStoneChanges: SpiritStoneChange[];
  itemAdds: ItemAddEntry[];
  itemRemoves: ItemRemoveEntry[];
  nearbyNpcs: NpcNearbyEntry[];
  npcCoreChanges: NpcCoreChangeEvent[];
  /** 本轮显式离场声明（<MJ_NPC_DEPART_TAG>）。无则空数组。 */
  npcLeftEvents: NpcLeftEvent[];
  battleTrigger: BattleTriggerEntry | null;
  storySnapshot: string;
  actionOptions: ActionSuggestions | null;
  /** 本轮有显著行为的 NPC 各一句话近况（追加到 npc.storySnapshot）。无则空数组。 */
  npcSnapshots: NpcSnapshotEntry[];
  /** 本轮 NPC 与主角的关键互动记忆（追加到 npc.memories）。无则空数组。 */
  npcMemories: NpcMemoryEntry[];
  /** 本轮 NPC 好感度增量变化（显式事件驱动）。无则空数组。 */
  npcFavorChanges: NpcFavorChangeEntry[];
}
