/**
 * @fileoverview 主角档案运行时单例：JSON 读档/导出、境界与资源修改、储物袋/功法/佩戴操作。
 * UI 仅订阅 `protagonist` ref；展示格式化见 `protagonistPanelDisplay.ts`。
 */

import { ref, type Ref } from "vue";
import type { FateChoiceResult } from "../fate_choice/types";
import type {
  ArmorItemDefinition,
  FaqiItemDefinition,
  GongfaItemDefinition,
  GongfaSlotsState,
  InventoryStackItem,
  PlayerBaseStats,
  ProtagonistPlayInfo,
  WeaponItemDefinition,
} from "../types/playInfo";
import { GONGFA_SLOT_COUNT } from "../types/playInfo";
import type { CategorizedItemDefinition, ElixirItemDefinition, WearableItemDefinition } from "../types/itemInfo";
import { PLAYER_STAT_BONUS_KEYS } from "../types/zhPlayerStats";
import {
  buildProtagonistPlayInfoFromFateChoice,
  DEFAULT_INVENTORY_SLOT_COUNT,
  INVENTORY_SLOT_EXPAND_STEP,
} from "./protagonistFromFateChoice";
import type { ProtagonistDetailAction } from "./protagonistDetailPayload";
import { gameLog } from "../log/gameLog";
import {
  applyRealmBreakthroughs,
  clampXiuweiToLateStageCapIfNeeded,
  grantSpiritStoneCountsToInventory,
  performAbsorbSpiritStonesFromBag,
  syncProtagonistRealmDerived,
  valueToSpiritStoneCounts,
} from "./spiritStoneCultivation";
import {
  computeMajorBreakModalTotalP,
  getMajorBreakthroughReadyContext,
  getPillBreakthroughBonusDelta,
  MAJOR_BREAK_FAIL_XIUWEI_FACTOR,
  type MajorBreakModalSlotSelection,
} from "./majorBreakthrough";
import { rollBreakthroughWithProbability } from "../config/realm_state";
import type { NarrationPerson } from "../types/playInfo";
import type { EquipSlotKey } from "./protagonistPanelDisplay";

/** 当前主角运行时状态；无主角时为 `null`。 */
export const protagonist: Ref<ProtagonistPlayInfo | null> = ref(null);

/**
 * 构造各项基础属性为 0 的 `PlayerBaseStats` 占位对象。
 *
 * @returns 已按 `PLAYER_STAT_BONUS_KEYS` 初始化的基础属性表。
 */
function emptyPlayerBase(): PlayerBaseStats {
  const o: Record<string, number> = {};
  for (const k of PLAYER_STAT_BONUS_KEYS) o[k] = 0;
  return o as PlayerBaseStats;
}

/**
 * 将存档中的功法栏数组规范为固定长度、逐项可为 `null` 的状态。
 *
 * @param raw - 从 JSON 读入的未知值。
 * @returns 长度等于 `GONGFA_SLOT_COUNT` 的功法栏数组。
 */
function normalizeGongfaSlots(raw: unknown): GongfaSlotsState {
  const base: GongfaSlotsState = [null, null, null, null, null, null, null, null];
  if (!Array.isArray(raw)) return base;
  for (let i = 0; i < GONGFA_SLOT_COUNT; i++) {
    base[i] = (raw[i] ?? null) as GongfaItemDefinition | null;
  }
  return base;
}

/**
 * 将存档中的储物袋数组规范为固定槽位数，不足则尾部补 `null`。
 *
 * @param raw - 从 JSON 读入的未知值。
 * @returns 长度至少为 `DEFAULT_INVENTORY_SLOT_COUNT` 的储物格数组。
 */
function normalizeInventorySlots(raw: unknown): Array<InventoryStackItem | null> {
  if (!Array.isArray(raw)) {
    return Array.from({ length: DEFAULT_INVENTORY_SLOT_COUNT }, () => null);
  }
  const out: Array<InventoryStackItem | null> = raw.map((x) =>
    x == null ? null : (x as InventoryStackItem),
  );
  while (out.length < DEFAULT_INVENTORY_SLOT_COUNT) out.push(null);
  compactInventorySlotsInPlace(out);
  return out;
}

/**
 * 将储物袋中非空堆叠前移；再按物品数量收缩/整理行数（每行 `INVENTORY_SLOT_EXPAND_STEP` 格，至少 `DEFAULT_INVENTORY_SLOT_COUNT` 格即 3 行）。
 *
 * @param slots - 原地修改的储物格数组。
 */
function compactInventorySlotsInPlace(slots: Array<InventoryStackItem | null>): void {
  const len = slots.length;
  let w = 0;
  for (let r = 0; r < len; r++) {
    const cell = slots[r];
    if (cell != null) {
      if (w !== r) slots[w] = cell;
      w++;
    }
  }
  const itemCount = w;
  const targetLen = Math.max(
    DEFAULT_INVENTORY_SLOT_COUNT,
    Math.ceil(itemCount / INVENTORY_SLOT_EXPAND_STEP) * INVENTORY_SLOT_EXPAND_STEP,
  );
  for (let i = itemCount; i < targetLen; i++) slots[i] = null;
  slots.length = targetLen;
}

/**
 * 判断未知值是否为可穿戴装备（武器 / 法器 / 防具）定义。
 *
 * @param x - 任意值。
 * @returns 若 `x` 为带合法 `itemType` 与 `equipType` 的装备对象则为 `true`。
 */
function isWearableItem(x: unknown): x is WearableItemDefinition {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.itemType === "装备" && (o.equipType === "武器" || o.equipType === "法器" || o.equipType === "防具");
}

/**
 * 由装备子类型映射到主角面板的槽位键。
 *
 * @param item - 可穿戴装备定义。
 * @returns 对应槽位；无法归类时返回 `null`。
 */
function equipSlotForItem(item: WearableItemDefinition): EquipSlotKey | null {
  if (item.equipType === "武器") return "weapon";
  if (item.equipType === "法器") return "faqi";
  if (item.equipType === "防具") return "armor";
  return null;
}

/**
 * 将任意 JSON（字符串或已解析对象）规范为 `ProtagonistPlayInfo`；失败返回 `null`。
 * 缺省字段用安全占位填充，便于版本演进。
 *
 * @param input - JSON 字符串或已解析对象。
 * @returns 规范化后的主角信息；解析失败、`role` 非 `protagonist` 等情形返回 `null`。
 */
export function parseProtagonistJson(input: string | unknown): ProtagonistPlayInfo | null {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.role !== "protagonist") return null;

  const realmRaw = o.realm;
  const major =
    realmRaw && typeof realmRaw === "object" && typeof (realmRaw as { major?: unknown }).major === "string"
      ? String((realmRaw as { major: string }).major).trim() || "练气"
      : "练气";
  const minor =
    realmRaw && typeof realmRaw === "object" && typeof (realmRaw as { minor?: unknown }).minor === "string"
      ? String((realmRaw as { minor: string }).minor).trim() || "初期"
      : "初期";

  const pbRaw = o.playerBase;
  const pb = emptyPlayerBase();
  if (pbRaw && typeof pbRaw === "object") {
    const pbo = pbRaw as Record<string, number>;
    for (const k of PLAYER_STAT_BONUS_KEYS) {
      const v = pbo[k];
      if (typeof v === "number" && Number.isFinite(v)) pb[k] = v;
    }
  }

  const maxHp = typeof o.maxHp === "number" && Number.isFinite(o.maxHp) ? Math.max(1, Math.floor(o.maxHp)) : Math.max(1, pb.hp);
  const maxMp = typeof o.maxMp === "number" && Number.isFinite(o.maxMp) ? Math.max(1, Math.floor(o.maxMp)) : Math.max(1, pb.mp);
  const currentHp =
    typeof o.currentHp === "number" && Number.isFinite(o.currentHp)
      ? Math.max(0, Math.round(o.currentHp))
      : maxHp;
  const currentMp =
    typeof o.currentMp === "number" && Number.isFinite(o.currentMp)
      ? Math.max(0, Math.round(o.currentMp))
      : maxMp;

  const eq = o.equippedSlots;
  let equippedSlots: ProtagonistPlayInfo["equippedSlots"] = {
    weapon: null,
    faqi: null,
    armor: null,
  };
  if (eq && typeof eq === "object") {
    const e = eq as Record<string, unknown>;
    equippedSlots = {
      weapon: isWearableItem(e.weapon) && e.weapon.equipType === "武器" ? (e.weapon as WeaponItemDefinition) : null,
      faqi: isWearableItem(e.faqi) && e.faqi.equipType === "法器" ? (e.faqi as FaqiItemDefinition) : null,
      armor: isWearableItem(e.armor) && e.armor.equipType === "防具" ? (e.armor as ArmorItemDefinition) : null,
    };
  }

  const traits: ProtagonistPlayInfo["traits"] = Array.isArray(o.traits) ? (o.traits as ProtagonistPlayInfo["traits"]) : [];

  const npRaw = o.narrationPerson;
  const narrationPerson: NarrationPerson =
    npRaw === "first" || npRaw === "second" || npRaw === "third" ? npRaw : "second";

  const out: ProtagonistPlayInfo = {
    role: "protagonist",
    id: typeof o.id === "string" && o.id.trim() !== "" ? o.id.trim() : "protagonist",
    displayName: typeof o.displayName === "string" ? o.displayName : "未命名",
    narrationPerson,
    birthPlace: typeof o.birthPlace === "string" ? o.birthPlace : "",
    originStory: typeof o.originStory === "string" ? o.originStory : "",
    realm: { major, minor },
    playerBase: { ...pb },
    maxHp,
    maxMp,
    currentHp: Math.min(currentHp, maxHp),
    currentMp: Math.min(currentMp, maxMp),
    avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : "",
    gender: typeof o.gender === "string" ? o.gender : "",
    linggen: Array.isArray(o.linggen) ? o.linggen.map((x) => String(x)) : [],
    age: typeof o.age === "number" && Number.isFinite(o.age) ? Math.max(0, Math.floor(o.age)) : 16,
    shouyuan: typeof o.shouyuan === "number" && Number.isFinite(o.shouyuan) ? Math.max(0, Math.floor(o.shouyuan)) : 100,
    inventorySlots: normalizeInventorySlots(o.inventorySlots),
    gongfaSlots: normalizeGongfaSlots(o.gongfaSlots),
    equippedSlots,
    traits,
    xiuwei: typeof o.xiuwei === "number" && Number.isFinite(o.xiuwei) ? Math.max(0, o.xiuwei) : 0,
  };

  return out;
}

/**
 * 解析 JSON 并写入全局 `protagonist`。
 *
 * @param input - 与 `parseProtagonistJson` 相同。
 * @returns 解析成功且已赋值时为 `true`，否则为 `false`。
 */
export function loadFromJson(input: string | unknown): boolean {
  const p = parseProtagonistJson(input);
  if (!p) return false;
  protagonist.value = p;
  return true;
}

/**
 * 将当前主角序列化为 JSON 字符串。
 *
 * @param pretty - 为 `true` 时使用缩进格式化输出。
 * @returns JSON 字符串；当前无主角时返回 `null`。
 */
export function toJsonString(pretty?: boolean): string | null {
  const p = protagonist.value;
  if (!p) return null;
  return pretty ? JSON.stringify(p, null, 2) : JSON.stringify(p);
}

/**
 * 返回当前主角状态的深拷贝快照，修改快照不影响运行时 ref。
 *
 * @returns 克隆后的 `ProtagonistPlayInfo`；无主角时返回 `null`。
 */
export function getSnapshot(): ProtagonistPlayInfo | null {
  const p = protagonist.value;
  if (!p) return null;
  return JSON.parse(JSON.stringify(p)) as ProtagonistPlayInfo;
}

/**
 * 根据命运抉择结果生成并设置主角初始数据。
 *
 * @param fc - 命运抉择结果。
 */
export function loadFromFateChoice(fc: FateChoiceResult): void {
  const p = buildProtagonistPlayInfoFromFateChoice(fc);
  compactInventorySlotsInPlace(p.inventorySlots);
  protagonist.value = p;
}

/**
 * 清空当前主角，将 `protagonist` 置为 `null`。
 */
export function clearProtagonist(): void {
  protagonist.value = null;
}

/**
 * 用新对象替换当前主角；会先经 `parseProtagonistJson` 再规范化，解析失败则回退为传入对象。
 *
 * @param next - 待写入的主角信息。
 */
export function replaceProtagonist(next: ProtagonistPlayInfo): void {
  const parsed = parseProtagonistJson(JSON.stringify(next));
  const p = parsed ?? next;
  compactInventorySlotsInPlace(p.inventorySlots);
  protagonist.value = p;
}

/**
 * 设置境界大、小阶段（会 `trim`，空串时使用默认「练气」「初期」）。
 *
 * @param major - 大境界名称。
 * @param minor - 小阶段名称。
 */
export function setRealm(major: string, minor: string): void {
  const p = protagonist.value;
  if (!p) return;
  p.realm = {
    major: major.trim() || "练气",
    minor: minor.trim() || "初期",
  };
}

/**
 * 设置修为数值（非有限数或负数时归为 0）。
 *
 * @param n - 修为值。
 */
export function setXiuwei(n: number): void {
  const p = protagonist.value;
  if (!p) return;
  p.xiuwei = typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * 按键合并更新 `playerBase` 中出现在 `PLAYER_STAT_BONUS_KEYS` 内的数值字段。
 *
 * @param partial - 仅包含需要覆盖的键的部分对象。
 */
export function patchPlayerBase(partial: Partial<PlayerBaseStats>): void {
  const p = protagonist.value;
  if (!p) return;
  for (const k of PLAYER_STAT_BONUS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(partial, k)) {
      const v = partial[k];
      if (typeof v === "number" && Number.isFinite(v)) p.playerBase[k] = v;
    }
  }
}

/**
 * 设置当前生命与法力，并分别裁剪到 `[0, max]`。
 *
 * @param currentHp - 当前生命。
 * @param currentMp - 当前法力。
 */
export function setCurrentHpMp(currentHp: number, currentMp: number): void {
  const p = protagonist.value;
  if (!p) return;
  const maxH = Math.max(1, p.maxHp);
  const maxM = Math.max(1, p.maxMp);
  p.currentHp = Math.max(1, Math.min(maxH, Math.round(currentHp)));
  p.currentMp = Math.max(1, Math.min(maxM, Math.round(currentMp)));
}

/**
 * 设置生命与法力上限（至少为 1），并将当前值裁剪到不超过新上限。
 *
 * @param maxHp - 最大生命。
 * @param maxMp - 最大法力。
 */
export function setMaxHpMp(maxHp: number, maxMp: number): void {
  const p = protagonist.value;
  if (!p) return;
  p.maxHp = Math.max(1, Math.floor(maxHp));
  p.maxMp = Math.max(1, Math.floor(maxMp));
  p.currentHp = Math.min(p.currentHp, p.maxHp);
  p.currentMp = Math.min(p.currentMp, p.maxMp);
}

/**
 * 设置年龄（非有限数时保持原值）。
 *
 * @param age - 年龄。
 */
export function setAge(age: number): void {
  const p = protagonist.value;
  if (!p) return;
  p.age = typeof age === "number" && Number.isFinite(age) ? Math.max(0, Math.floor(age)) : p.age;
}

/**
 * 设置寿元（非有限数时保持原值）。
 *
 * @param n - 寿元。
 */
export function setShouyuan(n: number): void {
  const p = protagonist.value;
  if (!p) return;
  p.shouyuan = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : p.shouyuan;
}

/**
 * 设置显示名称；纯空白时改为「未命名」。
 *
 * @param name - 显示名。
 */
export function setDisplayName(name: string): void {
  const p = protagonist.value;
  if (!p) return;
  p.displayName = String(name).trim() || "未命名";
}

/**
 * 设置头像 URL。
 *
 * @param url - 地址字符串；`null`/`undefined` 时存为空串。
 */
export function setAvatarUrl(url: string): void {
  const p = protagonist.value;
  if (!p) return;
  p.avatarUrl = url != null ? String(url) : "";
}

/**
 * 查找储物袋中第一个空格子索引。
 *
 * @returns 下标；无主角或袋满时返回 `-1`。
 */
export function findFirstEmptyInventorySlot(): number {
  const p = protagonist.value;
  if (!p) return -1;
  for (let i = 0; i < p.inventorySlots.length; i++) {
    if (p.inventorySlots[i] == null) return i;
  }
  return -1;
}

/**
 * 在储物袋末尾追加若干空格（扩容）。
 *
 * @param p - 主角。
 * @param count - 追加的 `null` 格数；非正或非有限时不操作。
 */
function expandInventorySlots(p: ProtagonistPlayInfo, count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  const n = Math.floor(count);
  for (let c = 0; c < n; c++) p.inventorySlots.push(null);
}

/**
 * 第一个空储物格下标；当前长度内无空位时按 `INVENTORY_SLOT_EXPAND_STEP` 追加一行后再查。
 *
 * @returns 下标；无主角或扩容后仍无空位时为 `-1`。
 */
function findFirstEmptyInventorySlotOrExpand(): number {
  const p = protagonist.value;
  if (!p) return -1;
  let i = findFirstEmptyInventorySlot();
  if (i < 0) {
    expandInventorySlots(p, INVENTORY_SLOT_EXPAND_STEP);
    i = findFirstEmptyInventorySlot();
  }
  return i;
}

/**
 * 写入储物袋指定格。
 *
 * @param index - 格子下标。
 * @param item - 堆叠物品或 `null` 表示清空。
 * @returns 下标合法且已写入时为 `true`。
 */
export function setInventorySlot(index: number, item: InventoryStackItem | null): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (index < 0 || index >= p.inventorySlots.length) return false;
  p.inventorySlots[index] = item;
  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}

/**
 * 将物品放入第一个空格；若当前长度内无空位，则按 `INVENTORY_SLOT_EXPAND_STEP` 追加一行空位后再放。
 *
 * @param item - 储物堆叠。
 * @returns 放入的格子下标；无主角或扩容后仍失败时为 `-1`。
 */
export function addToInventory(item: InventoryStackItem): number {
  const p = protagonist.value;
  if (!p) return -1;
  const i = findFirstEmptyInventorySlotOrExpand();
  if (i < 0) return -1;
  setInventorySlot(i, item);
  return i;
}

/**
 * 写入功法栏指定格。
 *
 * @param index - 功法栏下标，范围为 `[0, GONGFA_SLOT_COUNT)`。
 * @param item - 功法定义或 `null`。
 * @returns 下标合法且已写入时为 `true`。
 */
export function setGongfaSlot(index: number, item: GongfaItemDefinition | null): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (index < 0 || index >= GONGFA_SLOT_COUNT) return false;
  p.gongfaSlots[index] = item;
  return true;
}

/**
 * 查找功法栏第一个空位下标。
 *
 * @returns 下标；无主角或栏满时返回 `-1`。
 */
export function findFirstEmptyGongfaSlot(): number {
  const p = protagonist.value;
  if (!p) return -1;
  for (let i = 0; i < GONGFA_SLOT_COUNT; i++) {
    if (p.gongfaSlots[i] == null) return i;
  }
  return -1;
}

/**
 * 将功法栏指定格中的功法移入储物袋第一个空格；袋满时与 `addToInventory` 相同自动扩容。
 *
 * @param gongfaSlotIndex - 功法栏下标。
 * @returns 成功移入、或该格本就为空时为 `true`；下标非法或扩容后仍无空位时为 `false`。
 */
export function unequipGongfaToInventory(gongfaSlotIndex: number): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (gongfaSlotIndex < 0 || gongfaSlotIndex >= GONGFA_SLOT_COUNT) return false;
  const cell = p.gongfaSlots[gongfaSlotIndex];
  if (!cell) return true;
  const empty = findFirstEmptyInventorySlotOrExpand();
  if (empty < 0) return false;
  p.gongfaSlots[gongfaSlotIndex] = null;
  p.inventorySlots[empty] = cell;
  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}

/**
 * 从储物袋指定格取出功法装备到第一个空功法格。
 *
 * @param inventoryIndex - 储物袋下标。
 * @returns 成功时为 `true`；栏满、下标非法、该格非功法等情况为 `false`。
 */
export function equipGongfaFromInventory(inventoryIndex: number): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (inventoryIndex < 0 || inventoryIndex >= p.inventorySlots.length) return false;
  const cell = p.inventorySlots[inventoryIndex];
  if (!cell || !("itemType" in cell) || cell.itemType !== "功法") return false;
  const gi = findFirstEmptyGongfaSlot();
  if (gi < 0) return false;
  p.gongfaSlots[gi] = cell as GongfaItemDefinition;
  p.inventorySlots[inventoryIndex] = null;
  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}

/**
 * 执行主角详情弹窗底部按钮对应的卸下 / 装备逻辑（穿戴与功法）。
 *
 * @param a - 详情弹窗动作联合类型。
 * @returns 操作成功为 `true`。
 */
/**
 * 炼化储物袋一格灵石堆叠为修为（小境界满足时自动进阶），逻辑见 `spiritStoneCultivation.ts`。
 */
export function absorbSpiritStonesFromBag(bagIndex: number, count: number, consumeAll: boolean): boolean {
  const p = protagonist.value;
  if (!p) return false;
  const ok = performAbsorbSpiritStonesFromBag(
    p,
    bagIndex,
    consumeAll,
    consumeAll ? undefined : count,
  );
  if (ok) compactInventorySlotsInPlace(p.inventorySlots);
  return ok;
}

/**
 * 将储物袋一格非灵石物品按 `value×数量` 折算为灵石（与 `valueToSpiritStoneCounts` 同规则）并入袋。
 * `sellCount` 为售出件数（≤ 堆叠数）；部分售出时剩余数量写回该格。
 */
export function sellInventoryItemFromBag(bagIndex: number, sellCount: number): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (bagIndex < 0 || bagIndex >= p.inventorySlots.length) return false;
  const cell = p.inventorySlots[bagIndex];
  if (!cell || !("itemType" in cell)) return false;
  const it = cell as CategorizedItemDefinition;
  const v = typeof it.value === "number" && Number.isFinite(it.value) ? it.value : 0;
  const stackCnt = typeof it.count === "number" && Number.isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
  const n = typeof sellCount === "number" && Number.isFinite(sellCount) ? Math.floor(sellCount) : 0;
  if (v <= 0 || n < 1 || n > stackCnt) return false;
  const total = Math.floor(v * n);
  if (total < 10) return false;
  const chunks = valueToSpiritStoneCounts(total);
  if (!chunks.length) return false;
  const left = stackCnt - n;
  if (left <= 0) {
    p.inventorySlots[bagIndex] = null;
  } else {
    p.inventorySlots[bagIndex] = { ...it, count: left } as CategorizedItemDefinition;
  }
  grantSpiritStoneCountsToInventory(p, chunks);
  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}

/**
 * 使用储物袋一格普通丹药（`effects.recover`）：恢复当前生命/法力（不超过上限），消耗 1 颗。
 */
export function useElixirFromBag(bagIndex: number): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (bagIndex < 0 || bagIndex >= p.inventorySlots.length) return false;
  const cell = p.inventorySlots[bagIndex];
  if (!cell || !("itemType" in cell)) return false;
  if (cell.itemType !== "丹药") return false;
  const pill = cell as ElixirItemDefinition;
  const r = pill.effects?.recover;
  if (!r) return false;
  const hpAdd = typeof r.hp === "number" && Number.isFinite(r.hp) && r.hp > 0 ? Math.floor(r.hp) : 0;
  const mpAdd = typeof r.mp === "number" && Number.isFinite(r.mp) && r.mp > 0 ? Math.floor(r.mp) : 0;
  if (hpAdd <= 0 && mpAdd <= 0) return false;
  const stackCnt = typeof pill.count === "number" && Number.isFinite(pill.count) ? Math.max(1, Math.floor(pill.count)) : 1;
  if (stackCnt < 1) return false;

  const maxHp = typeof p.maxHp === "number" && Number.isFinite(p.maxHp) ? Math.max(1, Math.round(p.maxHp)) : 1;
  const maxMp = typeof p.maxMp === "number" && Number.isFinite(p.maxMp) ? Math.max(1, Math.round(p.maxMp)) : 1;
  const curHp = typeof p.currentHp === "number" && Number.isFinite(p.currentHp) ? Math.round(p.currentHp) : maxHp;
  const curMp = typeof p.currentMp === "number" && Number.isFinite(p.currentMp) ? Math.round(p.currentMp) : maxMp;

  p.currentHp = Math.min(maxHp, Math.max(0, curHp + hpAdd));
  p.currentMp = Math.min(maxMp, Math.max(0, curMp + mpAdd));

  const left = stackCnt - 1;
  if (left <= 0) {
    p.inventorySlots[bagIndex] = null;
  } else {
    p.inventorySlots[bagIndex] = { ...pill, count: left } as ElixirItemDefinition;
  }
  compactInventorySlotsInPlace(p.inventorySlots);
  const parts: string[] = [];
  if (hpAdd > 0) parts.push(`生命 +${hpAdd}`);
  if (mpAdd > 0) parts.push(`法力 +${mpAdd}`);
  gameLog.info(`已使用「${pill.name}」：${parts.join("，")}`);
  return true;
}

function consumeOneFromInventorySlot(p: ProtagonistPlayInfo, bagIdx: number): boolean {
  if (bagIdx < 0 || bagIdx >= p.inventorySlots.length) return false;
  const it = p.inventorySlots[bagIdx];
  if (!it || !("name" in it) || !(it as { name?: string }).name) return false;
  const cnt =
    typeof (it as { count?: number }).count === "number" && Number.isFinite((it as { count: number }).count)
      ? Math.max(1, Math.floor((it as { count: number }).count))
      : 1;
  if (cnt <= 1) {
    p.inventorySlots[bagIdx] = null;
  } else {
    p.inventorySlots[bagIdx] = { ...(it as object), count: cnt - 1 } as InventoryStackItem;
  }
  return true;
}

/**
 * 左栏「突破」弹窗：大境界掷骰。可选最多三格突破丹药（掷骰前消耗）；失败时修为×{@link MAJOR_BREAK_FAIL_XIUWEI_FACTOR}。
 *
 * @param slots - 长度 3，每格为所选储物袋索引与丹药名，或 `null`。
 * @returns 上下文合法且完成掷骰（含取消类失败）为 `true`；无主角或不可突破时为 `false`。
 */
export function performMajorBreakthroughRoll(slots: MajorBreakModalSlotSelection[]): boolean {
  const p = protagonist.value;
  if (!p) return false;
  const ctx = getMajorBreakthroughReadyContext(p);
  if (!ctx) return false;

  const slotArr: MajorBreakModalSlotSelection[] =
    slots.length >= 3 ? slots.slice(0, 3) : [...slots, ...Array(3 - slots.length).fill(null)];

  const needByBag: Record<number, number> = {};
  for (let i = 0; i < slotArr.length; i++) {
    const s = slotArr[i];
    if (!s) continue;
    const bi = s.bagIdx;
    if (!Number.isFinite(bi) || bi < 0 || bi >= p.inventorySlots.length) {
      gameLog.info("[境界突破] 大境界突破取消：丹药格配置无效。");
      return false;
    }
    const it = p.inventorySlots[bi];
    if (!it || String((it as { name?: string }).name || "").trim() !== String(s.name).trim()) {
      gameLog.info("[境界突破] 大境界突破取消：储物袋与所选丹药不一致。");
      return false;
    }
    const bonus = getPillBreakthroughBonusDelta(it, ctx.major, ctx.nextMaj);
    if (bonus <= 0) {
      gameLog.info(`[境界突破] 大境界突破取消：「${(it as { name?: string }).name}」对当前进阶无效。`);
      return false;
    }
    needByBag[bi] = (needByBag[bi] || 0) + 1;
  }
  for (const k of Object.keys(needByBag)) {
    const idx = Number(k);
    const it2 = p.inventorySlots[idx];
    const c2 =
      it2 && typeof (it2 as { count?: number }).count === "number" && Number.isFinite((it2 as { count: number }).count)
        ? Math.max(1, Math.floor((it2 as { count: number }).count))
        : 1;
    if (!it2 || c2 < (needByBag[idx] ?? 0)) {
      gameLog.info("[境界突破] 大境界突破取消：丹药数量不足。");
      return false;
    }
  }

  const pRoll = computeMajorBreakModalTotalP(ctx.baseP, ctx.major, ctx.nextMaj, slotArr, (idx) =>
    p.inventorySlots[idx] ?? null,
  );
  const pillPlaced = slotArr.some((s) => s != null);

  if (pillPlaced) {
    const invBeforeRoll = JSON.parse(JSON.stringify(p.inventorySlots)) as Array<InventoryStackItem | null>;
    let consumeOk = true;
    for (let j = 0; j < slotArr.length; j++) {
      const sj = slotArr[j];
      if (!sj) continue;
      if (!consumeOneFromInventorySlot(p, sj.bagIdx)) {
        consumeOk = false;
        break;
      }
    }
    if (!consumeOk) {
      p.inventorySlots = invBeforeRoll;
      gameLog.info("[境界突破] 大境界突破异常：扣除丹药失败，已回滚背包。");
      compactInventorySlotsInPlace(p.inventorySlots);
      return false;
    }
  }

  const ok = rollBreakthroughWithProbability(pRoll);
  const X2 = typeof p.xiuwei === "number" && Number.isFinite(p.xiuwei) ? Math.floor(p.xiuwei) : 0;

  if (ok) {
    p.xiuwei = Math.max(0, X2 - ctx.req);
    p.realm = { major: ctx.nextMaj, minor: "初期" };
    syncProtagonistRealmDerived(p);
    const chainMsgs = applyRealmBreakthroughs(p);
    clampXiuweiToLateStageCapIfNeeded(p);
    const msgOk = [`大境界突破成功：已进入「${ctx.nextMaj}初期」`];
    if (chainMsgs.length) msgOk.push(...chainMsgs);
    gameLog.info("[境界突破] " + msgOk.join("；") + "。");
  } else {
    p.xiuwei = Math.max(0, Math.floor(X2 * MAJOR_BREAK_FAIL_XIUWEI_FACTOR));
    const pctStr = (Math.round(pRoll * 10000) / 100).toString();
    const failParts = [
      `大境界突破失败：「${ctx.major}」→「${ctx.nextMaj}」（成功率 ${pctStr}%）`,
      "修为受挫，修炼进度损失约三成",
    ];
    if (pillPlaced) failParts.push("所选丹药已在突破中消耗");
    gameLog.info("[境界突破] " + failParts.join("；") + "。");
  }

  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}

export function applyProtagonistDetailAction(a: ProtagonistDetailAction): boolean {
  switch (a.id) {
    case "unequipWear":
      return unequipToInventory(a.equipSlot);
    case "unequipGongfa":
      return unequipGongfaToInventory(a.gongfaIndex);
    case "equipWearFromBag":
      return equipFromInventory(a.inventoryIndex);
    case "equipGongfaFromBag":
      return equipGongfaFromInventory(a.inventoryIndex);
    case "absorbSpiritStones":
      return absorbSpiritStonesFromBag(a.bagIndex, a.count, a.consumeAll);
    case "sellInventoryItem":
      return sellInventoryItemFromBag(a.bagIndex, a.count);
    case "useElixirFromBag":
      return useElixirFromBag(a.bagIndex);
    default:
      return false;
  }
}

/**
 * 直接设置某一穿戴槽的物品；非 `null` 时物品类型必须与槽位匹配。
 *
 * @param slot - `weapon` / `faqi` / `armor`。
 * @param item - 装备实例或卸下时的 `null`。
 * @returns 类型与槽位一致且已写入时为 `true`。
 */
export function setEquippedSlot(slot: EquipSlotKey, item: WearableItemDefinition | null): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (item != null) {
    const sk = equipSlotForItem(item);
    if (sk !== slot) return false;
  }
  if (slot === "weapon") p.equippedSlots.weapon = item as WeaponItemDefinition | null;
  else if (slot === "faqi") p.equippedSlots.faqi = item as FaqiItemDefinition | null;
  else p.equippedSlots.armor = item as ArmorItemDefinition | null;
  return true;
}

/**
 * 从储物袋指定格装备可穿戴物品到对应槽位；若该槽已有装备，则与袋中该格交换。
 *
 * @param inventoryIndex - 储物袋下标。
 * @returns 成功时为 `true`。
 */
export function equipFromInventory(inventoryIndex: number): boolean {
  const p = protagonist.value;
  if (!p) return false;
  if (inventoryIndex < 0 || inventoryIndex >= p.inventorySlots.length) return false;
  const cell = p.inventorySlots[inventoryIndex];
  if (!cell || !isWearableItem(cell)) return false;
  const slot = equipSlotForItem(cell);
  if (!slot) return false;
  const prev = p.equippedSlots[slot];
  if (slot === "weapon") p.equippedSlots.weapon = cell as WeaponItemDefinition;
  else if (slot === "faqi") p.equippedSlots.faqi = cell as FaqiItemDefinition;
  else p.equippedSlots.armor = cell as ArmorItemDefinition;
  p.inventorySlots[inventoryIndex] = prev;
  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}

/**
 * 将指定穿戴槽的物品卸下放入储物袋第一个空格；袋满时与 `addToInventory` 相同自动扩容。
 *
 * @param slot - 要卸下的槽位。
 * @returns 槽为空（视为成功）、或成功放入空格时为 `true`；扩容后仍无空位时为 `false`。
 */
export function unequipToInventory(slot: EquipSlotKey): boolean {
  const p = protagonist.value;
  if (!p) return false;
  const cur = p.equippedSlots[slot];
  if (!cur) return true;
  const empty = findFirstEmptyInventorySlotOrExpand();
  if (empty < 0) return false;
  p.equippedSlots[slot] = null;
  p.inventorySlots[empty] = cur;
  compactInventorySlotsInPlace(p.inventorySlots);
  return true;
}
