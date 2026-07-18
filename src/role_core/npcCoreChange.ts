/**
 * NPC 核心层变更事件。
 *
 * 核心层（境界 / 法宝 / 功法 / 储物袋 / 生死）默认冻结，AI 不得在 nearbyNpcs 里
 * 直接修改。只有当 AI 显式声明这些事件时，前端才会精确应用——这就是「严格事件驱动」
 * 的数据漂移防治策略。
 *
 * 事件来源：
 *  - AI 状态更新（`<MJ_NPC_CORE_CHANGE_TAG>` 标签）
 *  - 战斗结算（战斗缴获 / 死亡 / HP·MP 结算）
 *
 * @see parseNpcCoreChanges  AI 返回解析
 * @see applyCoreChange      单事件应用
 * @see applyCoreChanges     批量应用
 */

import type { Npc } from "./Npc";
import { EQUIP_SLOT_COUNT, type GongfaSlotsState, type EquippedSlotsState } from "./types/playInfo";
import type { InventoryStackItem } from "./types/items";
import { parseEquipObject, parseGongfaObject, parseStorageObject } from "../ai_core/shared/parseItems";
import {
  DEFAULT_INVENTORY_SLOT_COUNT,
  compactInventorySlotsInPlace,
} from "./CharacterInventory";
import { applyLinggenElixirBoost } from "./types/items";
import { gameLog } from "../log/gameLog";

/** 境界突破（含小境界推进）。 */
export interface NpcRealmBreakthroughChange {
  kind: "realm_breakthrough";
  npcId: string;
  newRealm: { major: string; minor: string };
}

/** 获得 法宝/功法/储物 物品。 */
export interface NpcEquipmentAcquiredChange {
  kind: "equipment_acquired";
  npcId: string;
  /** 装备栏 / 功法栏 / 储物袋。 */
  slot: "equipped" | "gongfa" | "inventory";
  /** AI 给的原始物品对象（同 nearbyNpcs 里的物品结构）。 */
  data: unknown;
}

/** 失去 法宝/功法/储物 物品。 */
export interface NpcEquipmentLostChange {
  kind: "equipment_lost";
  npcId: string;
  slot: "equipped" | "gongfa" | "inventory";
  /** equipped/gongfa 按槽位下标；inventory 按物品名。 */
  slotIndex?: number;
  itemName?: string;
  count?: number;
}

/** 战斗伤害 / 治疗（增量）。 */
export interface NpcCombatDamageChange {
  kind: "combat_damage";
  npcId: string;
  hpDelta?: number;
  mpDelta?: number;
}

/** 死亡。 */
export interface NpcDeathChange {
  kind: "death";
  npcId: string;
}

export type NpcCoreChangeEvent =
  | NpcRealmBreakthroughChange
  | NpcEquipmentAcquiredChange
  | NpcEquipmentLostChange
  | NpcCombatDamageChange
  | NpcDeathChange;

/** 把一件法宝放入装备栏（找空槽；满则落入储物袋）。 */
function placeEquipInto(npc: Npc, raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const emptyIdx = npc.equippedSlots.findIndex(s => s === null);
  const treasure = parseEquipObject(raw, npc.realm.major, npc.realm.minor);
  if (emptyIdx >= 0) {
    const next: EquippedSlotsState = [...npc.equippedSlots];
    next[emptyIdx] = treasure;
    npc.equippedSlots = next;
  } else {
    npc.addToInventory(treasure);
  }
}

/** 把一门功法放入功法栏（找空槽；满则落入储物袋）。 */
function placeGongfaInto(npc: Npc, raw: unknown, linggen?: string[]): void {
  if (!raw || typeof raw !== "object") return;
  const emptyIdx = npc.gongfaSlots.findIndex(s => s === null);
  const gongfa = parseGongfaObject(raw, npc.realm.major, npc.realm.minor, linggen);
  if (emptyIdx >= 0) {
    const next = [...npc.gongfaSlots] as unknown as GongfaSlotsState;
    next[emptyIdx] = gongfa;
    npc.gongfaSlots = next;
  } else {
    npc.addToInventory(gongfa);
  }
}

/** 把一件物品放入储物袋。 */
function placeInventoryInto(npc: Npc, raw: unknown, linggen?: string[]): void {
  if (!raw || typeof raw !== "object") return;
  const item = parseStorageObject(raw, npc.realm.major, npc.realm.minor, linggen);
  if (item) npc.addToInventory(item);
}

/** 从储物袋按名移除指定数量。 */
function removeFromInventoryByName(npc: Npc, name: string, count: number): void {
  let remaining = Math.max(1, Math.floor(count));
  for (let i = 0; i < npc.inventorySlots.length && remaining > 0; i++) {
    const slot = npc.inventorySlots[i];
    if (!slot || !("name" in slot) || slot.name !== name) continue;
    const take = Math.min(remaining, slot.count);
    slot.count -= take;
    remaining -= take;
    if (slot.count <= 0) npc.setInventorySlot(i, null);
  }
  compactInventorySlotsInPlace(npc);
}

/**
 * 把单个核心变更事件精确应用到 NPC。
 *
 * 设计要点：每个事件只改它声明的字段，绝不波及其它核心字段。例如突破只改境界与
 * 由此派生的 maxHp/maxMp，不会重摇装备属性；缴获只增不减。
 */
export function applyCoreChange(npc: Npc, event: NpcCoreChangeEvent, linggen?: string[]): void {
  switch (event.kind) {
    case "realm_breakthrough": {
      npc.setRealm(event.newRealm.major, event.newRealm.minor);
      const { maxHp, maxMp } = npc.computeMaxHpMp();
      npc.setMaxHpMp(maxHp, maxMp);
      break;
    }
    case "equipment_acquired": {
      if (event.slot === "equipped") placeEquipInto(npc, event.data);
      else if (event.slot === "gongfa") placeGongfaInto(npc, event.data, linggen);
      else placeInventoryInto(npc, event.data, linggen);
      // 装备变化可能影响 maxHp/maxMp（法宝特殊效果）—— 重新计算并保留比例。
      const { maxHp, maxMp } = npc.computeMaxHpMp();
      npc.setMaxHpMp(maxHp, maxMp);
      break;
    }
    case "equipment_lost": {
      if (event.slot === "equipped") {
        const idx = typeof event.slotIndex === "number" ? event.slotIndex : npc.equippedSlots.findIndex(s => s !== null);
        if (idx >= 0 && idx < EQUIP_SLOT_COUNT && npc.equippedSlots[idx]) {
          npc.equippedSlots = npc.equippedSlots.map((s, i) => (i === idx ? null : s)) as EquippedSlotsState;
        }
      } else if (event.slot === "gongfa") {
        const idx = typeof event.slotIndex === "number" ? event.slotIndex : npc.gongfaSlots.findIndex(s => s !== null);
        if (idx >= 0 && idx < npc.gongfaSlots.length && npc.gongfaSlots[idx]) {
          const next = [...npc.gongfaSlots] as unknown as GongfaSlotsState;
          next[idx] = null;
          npc.gongfaSlots = next;
        }
      } else {
        const name = String(event.itemName || "").trim();
        if (name) removeFromInventoryByName(npc, name, event.count ?? 1);
      }
      const { maxHp, maxMp } = npc.computeMaxHpMp();
      npc.setMaxHpMp(maxHp, maxMp);
      break;
    }
    case "combat_damage": {
      if (typeof event.hpDelta === "number") {
        npc.currentHp = Math.max(0, Math.min(npc.maxHp, npc.currentHp + event.hpDelta));
      }
      if (typeof event.mpDelta === "number") {
        npc.currentMp = Math.max(0, Math.min(npc.maxMp, npc.currentMp + event.mpDelta));
      }
      break;
    }
    case "death": {
      npc.isDead = true;
      npc.currentHp = 0;
      break;
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
    }
  }
}

/**
 * 批量应用核心变更事件。找不到对应 NPC 的事件会被跳过并告警。
 */
export function applyCoreChanges(
  lookup: (npcId: string) => Npc | undefined,
  events: NpcCoreChangeEvent[],
  linggen?: string[],
): void {
  for (const event of events) {
    const npc = lookup(event.npcId);
    if (!npc) {
      gameLog.warn(`[NpcCoreChange] 找不到 npcId=${event.npcId} 的事件被跳过 (kind=${event.kind})`);
      continue;
    }
    applyCoreChange(npc, event, linggen);
  }
}

/** 给一个储物袋物品应用灵根丹药加成（供外部解析路径复用）。 */
export function applyElixirBoostFor(item: InventoryStackItem, linggen: string[], realmMajor: string): void {
  applyLinggenElixirBoost(item, linggen, realmMajor);
}
