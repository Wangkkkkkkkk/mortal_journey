/**
 * G4 NPC 事件流类型定义。
 *
 * 取代 nearbyNpcs + npcCoreChange 补丁模式。所有 NPC 变更都通过事件流表达，
 * 除 npc_appeared 外都用 npcId 定位，消除 displayName 错配。
 *
 * 核心字段稳定是数据模型的天然属性——event kind 决定了能改什么字段，
 * 不再靠 prompt 嘱咐"核心字段冻结"。
 */

import type { WorldLocation } from "../../role_core/types/worldLocation";
import type { NpcRace, PowerTier } from "../../role_core/types/playInfo";

export type NpcEvent =
  | NpcAppearedEvent
  | NpcPresentEvent
  | NpcLeftEvent
  | NpcBreakthroughEvent
  | NpcEquipmentAcquiredEvent
  | NpcEquipmentLostEvent
  | NpcDamagedEvent
  | NpcDiedEvent;

export interface NpcFullCard {
  npcId: string;
  displayName: string;
  identity: string;
  race: NpcRace;
  appearance: string;
  clothing: string;
  gender: string;
  age: number;
  favorability: number;
  linggen: string[];
  realm: { major: string; minor: string };
  hpPercent: number;
  mpPercent: number;
  powerTier: PowerTier;
  currentLocation: WorldLocation | null;
  equippedSlots: unknown[];
  gongfaSlots: unknown[];
  inventorySlots: unknown[];
}

export interface NpcAppearedEvent {
  kind: "npc_appeared";
  npc: NpcFullCard;
}

export interface NpcPresentEvent {
  kind: "npc_present";
  npcId: string;
  dynamic: {
    identity?: string;
    favorability?: number;
    hpPercent?: number;
    mpPercent?: number;
  };
}

export interface NpcLeftEvent {
  kind: "npc_left";
  npcId: string;
  toLocation?: WorldLocation;
}

export interface NpcBreakthroughEvent {
  kind: "npc_breakthrough";
  npcId: string;
  newRealm: { major: string; minor: string };
}

export interface NpcEquipmentAcquiredEvent {
  kind: "npc_equipment_acquired";
  npcId: string;
  slot: "equipped" | "gongfa" | "inventory";
  data: unknown;
}

export interface NpcEquipmentLostEvent {
  kind: "npc_equipment_lost";
  npcId: string;
  slot: "equipped" | "gongfa" | "inventory";
  slotIndex?: number;
  itemName?: string;
  count?: number;
}

export interface NpcDamagedEvent {
  kind: "npc_damaged";
  npcId: string;
  hpDelta?: number;
  mpDelta?: number;
}

export interface NpcDiedEvent {
  kind: "npc_died";
  npcId: string;
}

export interface BattleCombatant {
  npcId?: string;
  displayName: string;
  roleHint: string;
}

export interface BattleTriggerEntry {
  shouldEnterBattle: boolean;
  triggerKind: "active" | "passive";
  triggerReason: string;
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
  isTestBattle?: boolean;
}

/**
 * 向后兼容：旧 NpcNearbyEntry 类型（被 role_core/Npc.ts / npcStore.ts 使用）。
 * 新代码应使用 NpcFullCard + NpcEvent 事件流。
 */
export interface NpcNearbyEntry {
  npcId?: string;
  displayName: string;
  identity: string;
  isDead: boolean;
  /** 仅新 NPC 首次建档时填初始值；已存在 NPC 的好感度变化走 npcFavorChanges 增量通道。 */
  favorability?: number;
  race: import("../../role_core/types/playInfo").NpcRace;
  appearance: string;
  clothing: string;
  gender: string;
  age: number;
  linggen: string[];
  realm: { major: string; minor: string };
  hpPercent: number;
  mpPercent: number;
  currentLocation?: import("../../role_core/types/worldLocation").WorldLocation;
  equippedSlots?: unknown[];
  gongfaSlots?: unknown[];
  inventorySlots?: unknown[];
  [key: string]: unknown;
}
