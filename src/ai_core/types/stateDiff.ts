/**
 * 状态更新类型定义。
 *
 * 状态更新为单次调用，统一产出 StateParsed。
 */

import type { WorldLocation } from "../../role_core/types/worldLocation";
import type { TimeDelta, WorldTime } from "../../role_core/worldTime";
import type { NpcNearbyEntry, BattleTriggerEntry } from "./npcEvents";
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
  system?: unknown;
  role?: unknown;
  function?: unknown;
  bonus?: unknown;
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
  battleTrigger: BattleTriggerEntry | null;
  storySnapshot: string;
  actionOptions: ActionSuggestions | null;
  /** 本轮有显著行为的 NPC 各一句话近况（追加到 npc.storySnapshot）。无则空数组。 */
  npcSnapshots: NpcSnapshotEntry[];
}
