/**
 * @fileoverview 主角左栏 UI 纯函数：与 `PlayerInfoPanel.vue` 模板解耦，便于单测与后续复杂展示逻辑。
 */

import { getCultivationRequired } from "../config/realm_state";
import type { WearableItemDefinition } from "../types/itemInfo";
import type {
  GongfaItemDefinition,
  InventoryStackItem,
  PlayerBaseStats,
  ProtagonistPlayInfo,
  TraitEntry,
} from "../types/playInfo";

/** 储物袋展示用网格列数（与 `mainScreenPlayerPanel.css`、`protagonistFromFateChoice.INVENTORY_SLOT_EXPAND_STEP` 一致） */
export const INVENTORY_BAG_GRID_COLUMNS = 4;

/** 储物袋最少展示格数：不足时在末尾补空位；超过则全部展示并由外层滚动 */
export const INVENTORY_BAG_MIN_VISIBLE_SLOTS = 12;

/**
 * 物品品级 → 天赋稀有度文案映射，与 `main.css` 中 `GRADE_TO_TRAIT_RARITY` 一致，供 `data-rarity` / 槽位描边使用。
 */
export const GRADE_TO_TRAIT_RARITY: Readonly<Record<string, string>> = {
  下品: "平庸",
  中品: "普通",
  上品: "稀有",
  极品: "史诗",
  仙品: "传说",
  神品: "神迹",
};

/**
 * 将物品品级转换为 UI 用的稀有度键（用于样式与 `data-rarity`）。
 *
 * @param grade - 品级字符串；空串或未定义时无映射。
 * @returns 对应稀有度文案；无表项或输入为空时返回 `undefined`。
 */
export function gradeToTraitRarity(grade: string | undefined): string | undefined {
  if (grade == null || String(grade).trim() === "") return undefined;
  return GRADE_TO_TRAIT_RARITY[String(grade).trim()];
}

/**
 * 将数值限制在 `[0, 100]`；非有限数视为 0。
 *
 * @param n - 原始百分比或中间计算值。
 * @returns 裁剪后的 0–100。
 */
export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * 左栏属性数值展示为整数（四舍五入），避免灵根倍率等浮点尾差。
 *
 * @param value - 原始数值。
 * @returns 四舍五入后的整数；非有限数时为 `0`。
 */
export function displayStatInt(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * 将灵根元素名数组格式化为无分隔拼接展示串。
 *
 * @param elements - 元素名列表。
 * @returns 非空时拼接为连续字符串；否则为「—」。
 */
export function formatLinggenElements(elements: string[]): string {
  const els = elements.map((e) => String(e).trim()).filter(Boolean);
  return els.length ? els.join("") : "—";
}

/**
 * 将境界对象格式化为单行展示
 *
 * @param realm - 主角 `realm` 字段。
 * @returns 一行境界文案。
 */
export function formatRealmLine(realm: ProtagonistPlayInfo["realm"]): string {
  const major = realm.major?.trim() || "—";
  const minor = realm.minor?.trim() || "";
  return minor ? `${major}${minor}` : major;
}

/**
 * 修炼进度条 UI 所需数据（所需修为、百分比、展示用当前值）。
 */
export interface CultivationUiState {
  /** 当前阶段突破所需修为；无法查询时为 `null`。 */
  req: number | null;
  /** 进度百分比，已 `clampPct`。 */
  pct: number;
  /** 条上显示的当前修为（不超过 `req` 当 `req` 有效时）。 */
  displayCur: number;
}

/**
 * 根据主角数据计算修炼进度条状态。
 *
 * @param p - 主角信息；`null` 时返回零进度占位。
 * @returns `CultivationUiState`。
 */
export function getCultivationUiState(p: ProtagonistPlayInfo | null): CultivationUiState {
  if (!p) return { req: null, pct: 0, displayCur: 0 };
  const req = getCultivationRequired(p.realm.major, p.realm.minor);
  const cur = Math.max(0, Math.floor(p.xiuwei));
  let pct = 0;
  if (req != null && req > 0) pct = (cur / req) * 100;
  const displayCur = req != null && req > 0 ? Math.min(cur, req) : cur;
  return { req, pct: clampPct(pct), displayCur };
}

/**
 * 生命 / 法力条 UI 状态（百分比与当前、上限数值）。
 */
export interface HpMpBarState {
  /** 生命条宽度百分比 0–100。 */
  hpPct: number;
  /** 法力条宽度百分比 0–100。 */
  mpPct: number;
  /** 当前生命（已裁剪）。 */
  curH: number;
  /** 生命上限（至少为 1）。 */
  maxH: number;
  /** 当前法力（已裁剪）。 */
  curM: number;
  /** 法力上限（至少为 1）。 */
  maxM: number;
}

/**
 * 根据主角数据计算血蓝条展示状态。
 *
 * @param p - 主角信息。
 * @param derivedCaps - 可选：用推导后的 `hp`/`mp` 作为条上上限（与境界+装备+灵根一致）；不传则用存档 `maxHp`/`maxMp`。
 * @returns 条状态；`p` 为 `null` 时返回 `null`。
 */
export function getHpMpBarState(
  p: ProtagonistPlayInfo | null,
  derivedCaps?: Pick<PlayerBaseStats, "hp" | "mp"> | null,
): HpMpBarState | null {
  if (!p) return null;
  const maxH =
    derivedCaps != null && Number.isFinite(derivedCaps.hp)
      ? Math.max(1, Math.round(derivedCaps.hp))
      : Math.max(1, Math.round(p.maxHp));
  const maxM =
    derivedCaps != null && Number.isFinite(derivedCaps.mp)
      ? Math.max(1, Math.round(derivedCaps.mp))
      : Math.max(1, Math.round(p.maxMp));
  const curH = Math.max(0, Math.min(maxH, Math.round(p.currentHp)));
  const curM = Math.max(0, Math.min(maxM, Math.round(p.currentMp)));
  return {
    hpPct: maxH > 0 ? (curH / maxH) * 100 : 0,
    mpPct: maxM > 0 ? (curM / maxM) * 100 : 0,
    curH,
    maxH,
    curM,
    maxM,
  };
}

/**
 * 判断储物格堆叠是否为灵石（无 `itemType` 字段的堆叠）。
 *
 * @param cell - 储物堆叠项。
 * @returns 灵石堆叠为 `true`，否则为 `false`。
 */
export function isSpiritStoneStack(cell: InventoryStackItem): boolean {
  return !("itemType" in cell);
}

/**
 * 储物袋格子列表：长度至少 `INVENTORY_BAG_MIN_VISIBLE_SLOTS`（不足补 `null`）；若存档更长则原样返回，UI 网格多行增高展示。
 * 运行时 `inventorySlots` 在 `protagonistManager` 中每次变更后会前移整理，并按物品数收缩行数（至少 3 行 / 12 格）。
 *
 * @param slots - 主角 `inventorySlots`；`null`/`undefined`/空数组时视为全空并补满最小格数。
 * @returns 用于 `v-for` 的格数据（与存档下标一一对应，仅当因补位变长时尾部多出的格为 `null`且下标超出原数组长度）。
 */
export function getInventoryBagDisplaySlots(
  slots: ReadonlyArray<InventoryStackItem | null> | null | undefined,
): (InventoryStackItem | null)[] {
  if (slots == null || slots.length === 0) {
    return Array.from({ length: INVENTORY_BAG_MIN_VISIBLE_SLOTS }, () => null);
  }
  if (slots.length >= INVENTORY_BAG_MIN_VISIBLE_SLOTS) {
    return [...slots];
  }
  return [...slots, ...Array.from({ length: INVENTORY_BAG_MIN_VISIBLE_SLOTS - slots.length }, () => null)];
}

/**
 * 储物袋单格在 UI 上所需的展示片段。
 */
export interface InventorySlotParts {
  /** 物品名称或空串。 */
  label: string;
  /** 数量角标；单件时为 `null`。 */
  qty: string | null;
  /** 是否有物品占用该格。 */
  filled: boolean;
  /** 是否为灵石堆叠。 */
  lingshi: boolean;
  /** 由品级映射的稀有度，供样式使用。 */
  rarity: string | undefined;
}

/**
 * 将储物格内容解析为槽位展示用字段。
 *
 * @param cell - 某一格堆叠或 `null`（空格）。
 * @returns `InventorySlotParts`。
 */
export function inventorySlotParts(cell: InventoryStackItem | null): InventorySlotParts {
  if (!cell) {
    return { label: "", qty: null, filled: false, lingshi: false, rarity: undefined };
  }
  const lingshi = isSpiritStoneStack(cell);
  const cnt =
    typeof cell.count === "number" && Number.isFinite(cell.count) ? Math.max(1, Math.floor(cell.count)) : 1;
  const qty = cnt > 1 ? String(cnt) : null;
  const gr = "grade" in cell && cell.grade != null ? String(cell.grade).trim() : "";
  const rarity = gr ? gradeToTraitRarity(gr) : undefined;
  return { label: cell.name, qty, filled: true, lingshi, rarity };
}

/**
 * 从功法格数据提取名称与子类型，供格子展示。
 *
 * @param cell - 功法定义或空。
 * @returns `name` 与 `subtype`；空格时二者均为空串。
 */
export function gongfaCellParts(cell: GongfaItemDefinition | null): { name: string; subtype: string } {
  if (!cell) return { name: "", subtype: "" };
  return { name: cell.name, subtype: cell.subtype };
}

/**
 * 根据功法子类型返回用于角标样式的 CSS class 字符串。
 *
 * @param sub - `subtype` 文案（如「辅助」「攻击」）。
 * @returns 拼接好的 class 名。
 */
export function gongfaTypeClass(sub: string): string {
  if (sub === "辅助") return "mj-gongfa-slot-type mj-gongfa-slot-type--support";
  if (sub === "攻击") return "mj-gongfa-slot-type mj-gongfa-slot-type--attack";
  return "mj-gongfa-slot-type mj-gongfa-slot-type--other";
}

/** 穿戴槽在数据层与 UI 行中的键。 */
export type EquipSlotKey = "weapon" | "faqi" | "armor";

/**
 * 单条穿戴槽行：键、中文标签、当前装备。
 */
export interface EquipSlotRow {
  /** 槽位键。 */
  key: EquipSlotKey;
  /** 行标题（武器 / 法器 / 防具）。 */
  label: string;
  /** 该槽已装备物品或空。 */
  item: WearableItemDefinition | null;
}

/**
 * 构建三行穿戴槽列表，供左栏模板遍历。
 *
 * @param p - 主角信息；`null` 时返回空数组。
 * @returns `EquipSlotRow` 数组。
 */
export function getEquipSlotRows(p: ProtagonistPlayInfo | null): EquipSlotRow[] {
  if (!p) return [];
  return [
    { key: "weapon", label: "武器", item: p.equippedSlots.weapon },
    { key: "faqi", label: "法器", item: p.equippedSlots.faqi },
    { key: "armor", label: "防具", item: p.equippedSlots.armor },
  ];
}

/** 天赋展示固定槽位数。 */
const TRAIT_SLOT_COUNT = 5;

/**
 * 将主角 `traits` 截断/填充为固定长度槽位列表。
 *
 * @param p - 主角信息；`null` 时返回全 `null` 占位数组。
 * @returns 长度恒为 `TRAIT_SLOT_COUNT` 的数组。
 */
export function getTraitSlots(p: ProtagonistPlayInfo | null): (TraitEntry | null)[] {
  if (!p) return Array.from({ length: TRAIT_SLOT_COUNT }, () => null);
  const out: (TraitEntry | null)[] = [];
  for (let i = 0; i < TRAIT_SLOT_COUNT; i++) out.push(p.traits[i] ?? null);
  return out;
}

/**
 * 天赋槽 `title` 属性用文案：空槽、字符串天赋、或「名称（稀有度）」加可选换行描述。
 *
 * @param t - 天赋条目或 `null`。
 * @returns 悬浮提示完整字符串。
 */
export function traitSlotTitle(t: TraitEntry | null): string {
  if (!t) return "空槽";
  if (typeof t === "string") return t;
  let s = t.name + (t.rarity ? `（${t.rarity}）` : "");
  if (t.desc) s += "\n" + t.desc;
  return s;
}

/**
 * 天赋槽用于 `data-rarity` 等的稀有度字符串（字符串简项无稀有度）。
 *
 * @param t - 天赋条目或 `null`。
 * @returns 去首尾空白后的稀有度；无则 `undefined`。
 */
export function traitSlotRarity(t: TraitEntry | null): string | undefined {
  if (!t || typeof t === "string") return undefined;
  const r = t.rarity?.trim();
  return r || undefined;
}

/**
 * 天赋槽格内主文案：空槽为「空」，字符串天赋为全文，对象天赋为名称。
 *
 * @param t - 天赋条目或 `null`。
 * @returns 格内短文本。
 */
export function traitSlotInnerText(t: TraitEntry | null): string {
  if (!t) return "空";
  return typeof t === "string" ? t : t.name;
}
