/**
 * @fileoverview 通用储物袋操作：格子管理、物品/灵石增删。
 * 以模块函数形式提供，任何实现 InventoryCarrier 接口的对象均可使用。
 *
 * 不变量：slot 0 永远是 SpiritStoneInventoryStack（count 可为 0）。
 */

import type { InventoryStackItem } from "./types/items";
import { createSpiritStoneInventoryStack } from "./types/spiritStone";
import { gameLog } from "../log/gameLog";

export interface InventoryCarrier {
  inventorySlots: Array<InventoryStackItem | null>;
}

export const DEFAULT_INVENTORY_SLOT_COUNT = 12;
export const INVENTORY_SLOT_EXPAND_STEP = 4;

function isSpiritStone(cell: InventoryStackItem | null): boolean {
  return cell != null && "type" in cell && cell.type === "灵石";
}

export function expandInventorySlots(c: InventoryCarrier, count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  for (let i = 0; i < Math.floor(count); i++) c.inventorySlots.push(null);
}

export function findFirstEmptyInventorySlot(c: InventoryCarrier): number {
  for (let i = 0; i < c.inventorySlots.length; i++) {
    if (c.inventorySlots[i] == null) return i;
  }
  return -1;
}

export function findFirstEmptyInventorySlotOrExpand(c: InventoryCarrier): number {
  let i = findFirstEmptyInventorySlot(c);
  if (i < 0) {
    expandInventorySlots(c, INVENTORY_SLOT_EXPAND_STEP);
    i = findFirstEmptyInventorySlot(c);
  }
  return i;
}

export function ensureSpiritStoneSlot0(c: InventoryCarrier): void {
  const slots = c.inventorySlots;
  if (slots.length === 0) {
    slots.push(createSpiritStoneInventoryStack(0));
    return;
  }
  if (isSpiritStone(slots[0])) return;
  let stoneTotal = 0;
  let stoneIdx = -1;
  for (let i = 1; i < slots.length; i++) {
    if (isSpiritStone(slots[i])) {
      stoneTotal += (slots[i] as any).count;
      stoneIdx = i;
    }
  }
  if (stoneIdx >= 0) {
    for (let i = 1; i < slots.length; i++) {
      if (isSpiritStone(slots[i])) {
        slots[i] = null;
      }
    }
    const stone = createSpiritStoneInventoryStack(stoneTotal);
    slots.unshift(stone);
    slots.pop();
  } else {
    slots.unshift(createSpiritStoneInventoryStack(0));
    slots.pop();
  }
}

export function compactInventorySlotsInPlace(c: InventoryCarrier): void {
  const slots = c.inventorySlots;
  let stoneSlot: InventoryStackItem | null = null;
  const others: InventoryStackItem[] = [];
  for (const cell of slots) {
    if (isSpiritStone(cell)) {
      if (!stoneSlot) {
        stoneSlot = cell;
      } else {
        (stoneSlot as any).count += (cell as any).count;
      }
    } else if (cell != null) {
      others.push(cell);
    }
  }
  if (!stoneSlot) stoneSlot = createSpiritStoneInventoryStack(0);
  const totalItems = 1 + others.length;
  const targetLen = Math.max(
    DEFAULT_INVENTORY_SLOT_COUNT,
    Math.ceil(totalItems / INVENTORY_SLOT_EXPAND_STEP) * INVENTORY_SLOT_EXPAND_STEP,
  );
  slots.length = 0;
  slots.push(stoneSlot);
  for (const item of others) slots.push(item);
  for (let i = slots.length; i < targetLen; i++) slots.push(null);
  slots.length = targetLen;
}

export function setInventorySlot(c: InventoryCarrier, index: number, item: InventoryStackItem | null): boolean {
  if (index < 0 || index >= c.inventorySlots.length) return false;
  if (index === 0 && item != null && !isSpiritStone(item)) {
    const actual = findFirstEmptyInventorySlotOrExpand(c);
    if (actual < 0) return false;
    c.inventorySlots[actual] = item;
    compactInventorySlotsInPlace(c);
    return true;
  }
  c.inventorySlots[index] = item;
  compactInventorySlotsInPlace(c);
  return true;
}

export function addToInventory(c: InventoryCarrier, item: InventoryStackItem): number {
  if (isSpiritStone(item)) {
    addSpiritStone(c, (item as any).count);
    return 0;
  }
  const i = findFirstEmptyInventorySlotOrExpand(c);
  if (i < 0) return -1;
  c.inventorySlots[i] = item;
  compactInventorySlotsInPlace(c);
  return i;
}

export function getSpiritStoneCount(c: InventoryCarrier): number {
  const cell = c.inventorySlots[0];
  return isSpiritStone(cell) ? (cell as any).count : 0;
}

export function addSpiritStone(c: InventoryCarrier, count: number): void {
  ensureSpiritStoneSlot0(c);
  const cell = c.inventorySlots[0] as any;
  cell.count += count;
}

export function removeSpiritStone(c: InventoryCarrier, count: number): void {
  ensureSpiritStoneSlot0(c);
  const cell = c.inventorySlots[0] as any;
  const take = Math.min(count, cell.count);
  cell.count -= take;
  const remaining = count - take;
  if (remaining > 0) {
    gameLog.warn(`[Inventory] 灵石不足：还需 ${remaining} 颗灵石`);
  }
}
