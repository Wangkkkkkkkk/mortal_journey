/**
 * @fileoverview 通用法宝栏 & 功法栏操作：法宝装备/卸下、功法装备/卸下、详情弹窗动作。
 * 以模块函数形式提供，由 `EquipCarrier` 接口的实现方委托调用。
 */

import type {
  TreasureItemDefinition,
  GongfaItemDefinition,
  InventoryStackItem,
} from "./types/items";
import {
  EQUIP_SLOT_COUNT,
  GONGFA_SLOT_COUNT,
  type EquipSlotKey,
  type ProtagonistDetailAction,
  type EquippedSlotsState,
  type GongfaSlotsState,
} from "./types/playInfo";
import { compactInventorySlotsInPlace, findFirstEmptyInventorySlotOrExpand } from "./CharacterInventory";

export interface EquipCarrier {
  equippedSlots: EquippedSlotsState;
  gongfaSlots: GongfaSlotsState;
  inventorySlots: Array<InventoryStackItem | null>;
}

export function isTreasureItem(x: unknown): x is TreasureItemDefinition {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.itemType === "法宝";
}

export function findFirstEmptyEquipSlot(c: EquipCarrier): number {
  for (let i = 0; i < EQUIP_SLOT_COUNT; i++) {
    if (c.equippedSlots[i] == null) return i;
  }
  return -1;
}

export function setGongfaSlot(c: EquipCarrier, index: number, item: GongfaItemDefinition | null): boolean {
  if (index < 0 || index >= GONGFA_SLOT_COUNT) return false;
  c.gongfaSlots[index] = item;
  return true;
}

export function findFirstEmptyGongfaSlot(c: EquipCarrier): number {
  for (let i = 0; i < GONGFA_SLOT_COUNT; i++) {
    if (c.gongfaSlots[i] == null) return i;
  }
  return -1;
}

export function unequipGongfaToInventory(c: EquipCarrier, gongfaSlotIndex: number): boolean {
  if (gongfaSlotIndex < 0 || gongfaSlotIndex >= GONGFA_SLOT_COUNT) return false;
  const cell = c.gongfaSlots[gongfaSlotIndex];
  if (!cell) return true;
  const empty = findFirstEmptyInventorySlotOrExpand(c);
  if (empty < 0) return false;
  c.gongfaSlots[gongfaSlotIndex] = null;
  c.inventorySlots[empty] = cell;
  compactInventorySlotsInPlace(c);
  return true;
}

export function equipGongfaFromInventory(c: EquipCarrier, inventoryIndex: number): boolean {
  if (inventoryIndex < 0 || inventoryIndex >= c.inventorySlots.length) return false;
  const cell = c.inventorySlots[inventoryIndex];
  if (!cell || !("itemType" in cell) || cell.itemType !== "功法") return false;
  const gi = findFirstEmptyGongfaSlot(c);
  if (gi < 0) return false;
  c.gongfaSlots[gi] = cell as GongfaItemDefinition;
  c.inventorySlots[inventoryIndex] = null;
  compactInventorySlotsInPlace(c);
  return true;
}

export function setEquippedSlot(c: EquipCarrier, slot: EquipSlotKey, item: TreasureItemDefinition | null): boolean {
  if (slot < 0 || slot >= EQUIP_SLOT_COUNT) return false;
  c.equippedSlots[slot] = item;
  return true;
}

export function equipFromInventory(c: EquipCarrier, inventoryIndex: number): boolean {
  if (inventoryIndex < 0 || inventoryIndex >= c.inventorySlots.length) return false;
  const cell = c.inventorySlots[inventoryIndex];
  if (!cell || !isTreasureItem(cell)) return false;
  const slot = findFirstEmptyEquipSlot(c);
  if (slot < 0) return false;
  const prev = c.equippedSlots[slot];
  c.equippedSlots[slot] = cell;
  c.inventorySlots[inventoryIndex] = prev;
  compactInventorySlotsInPlace(c);
  return true;
}

export function unequipToInventory(c: EquipCarrier, slot: EquipSlotKey): boolean {
  if (slot < 0 || slot >= EQUIP_SLOT_COUNT) return false;
  const cur = c.equippedSlots[slot];
  if (!cur) return true;
  const empty = findFirstEmptyInventorySlotOrExpand(c);
  if (empty < 0) return false;
  c.equippedSlots[slot] = null;
  c.inventorySlots[empty] = cur;
  compactInventorySlotsInPlace(c);
  return true;
}

export function applyDetailAction(c: EquipCarrier, a: ProtagonistDetailAction): boolean {
  switch (a.id) {
    case "unequipWear":
      return unequipToInventory(c, a.equipSlot);
    case "unequipGongfa":
      return unequipGongfaToInventory(c, a.gongfaIndex);
    case "equipWearFromBag":
      return equipFromInventory(c, a.inventoryIndex);
    case "equipGongfaFromBag":
      return equipGongfaFromInventory(c, a.inventoryIndex);
    default:
      return false;
  }
}
