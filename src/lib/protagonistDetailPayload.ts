/**
 * @fileoverview 主角左栏详情弹窗内容，与 mortal_journey 中 `openItemDetailModal` /
 * `openTraitDetailModal` 的信息结构对齐。
 */

import type {
  ArmorItemDefinition,
  AttackGongfaDefinition,
  BreakthroughElixirDefinition,
  CategorizedItemDefinition,
  ElixirItemDefinition,
  FaqiItemDefinition,
  GongfaItemDefinition,
  InventoryStackItem,
  MaterialItemDefinition,
  MiscItemDefinition,
  SpiritStoneInventoryStack,
  WeaponItemDefinition,
} from "../types/itemInfo";
import type { CultivationRealm, TraitEntry } from "../types/playInfo";
import { getEquipBonusRealmRatio } from "../config/realm_state";
import { formatSpiritStonePointsForUi, getSpiritStoneRawPerPiece } from "./spiritStoneCultivation";
import { gradeToTraitRarity, type EquipSlotKey } from "./protagonistPanelDisplay";

/**
 * 详情弹窗底部按钮所触发的动作；由 `protagonistManager.applyProtagonistDetailAction` 执行。
 */
export type ProtagonistDetailAction =
  | { id: "unequipWear"; equipSlot: EquipSlotKey }
  | { id: "unequipGongfa"; gongfaIndex: number }
  | { id: "equipWearFromBag"; inventoryIndex: number }
  | { id: "equipGongfaFromBag"; inventoryIndex: number }
  | { id: "absorbSpiritStones"; bagIndex: number; count: number; consumeAll: boolean }
  | { id: "sellInventoryItem"; bagIndex: number; count: number }
  | { id: "useElixirFromBag"; bagIndex: number };

/**
 * 详情弹窗底部的一个操作按钮。
 */
export interface ProtagonistDetailActionButton {
  /** 按钮文案。 */
  label: string;
  /** 点击后执行的动作。 */
  action: ProtagonistDetailAction;
  /** 是否为主按钮样式。 */
  primary?: boolean;
}

/**
 * 详情弹窗中的一段键值说明。
 */
export interface ProtagonistDetailSection {
  /** 段落标题（如「简介」「品级」）。 */
  label: string;
  /** 段落正文。 */
  text: string;
}

/** 灵石详情：修炼数量输入与「尽数修炼」所需上下文（与 mortal_journey 灵石弹窗一致）。 */
export interface SpiritStoneCultivationUi {
  /** 储物袋格子下标。 */
  bagIndex: number;
  /** 当前堆叠最大颗数。 */
  maxCount: number;
}

/** 非灵石物品在储物袋中打开时：底部显示售卖按钮（`value` 刻度同灵石）。 */
export interface SellInventoryItemUi {
  bagIndex: number;
  /** 当前堆叠可售卖的件数上限。 */
  maxCount: number;
}

/** 储物袋中普通丹药（带恢复药效）显示「使用」按钮。 */
export interface UseElixirFromBagUi {
  bagIndex: number;
}

/**
 * 传给详情弹窗的完整展示数据。
 */
export interface ProtagonistDetailPayload {
  /** 标题（物品或天赋名）。 */
  title: string;
  /** 副标题（类型或品质摘要）。 */
  subtitle: string;
  /** 分段说明列表。 */
  sections: ProtagonistDetailSection[];
  /** 用于 UI 稀有度样式，通常由品级映射而来。 */
  dataRarity?: string;
  /** 可选底部操作按钮。 */
  actions?: ProtagonistDetailActionButton[];
  /** 灵石专用：显示修炼输入区与尽数修炼。 */
  spiritStoneCultivation?: SpiritStoneCultivationUi;
  /** 储物袋非灵石：底部售卖（折算为灵石）。 */
  sellInventoryItem?: SellInventoryItemUi;
  /** 储物袋普通丹药：在售卖上方显示使用（恢复生命/法力）。 */
  useElixirFromBag?: UseElixirFromBagUi;
}

/**
 * 装备类详情所对应的来源：当前已穿戴槽位，或储物袋中的格子索引。
 */
export type WearableDetailSource =
  | { type: "equipped"; equipSlot: EquipSlotKey }
  | { type: "bag"; inventoryIndex: number };

/**
 * 功法详情所对应的来源：功法栏下标，或储物袋中的格子索引。
 */
export type GongfaDetailSource = { type: "bar"; gongfaIndex: number } | { type: "bag"; inventoryIndex: number };

/**
 * 若文本非空则构造一个详情段落，否则返回 `null`。
 *
 * @param label - 段落标题。
 * @param text - 原始文本、数字或空值。
 * @returns 有效段落对象，或内容为空时返回 `null`。
 */
function sec(label: string, text: string | number | undefined | null): ProtagonistDetailSection | null {
  if (text == null) return null;
  const t = typeof text === "string" ? text.trim() : String(text);
  if (t === "") return null;
  return { label, text: t };
}

/**
 * 将非空段落追加到数组中（内部复用 `sec`）。
 *
 * @param out - 目标段落数组（会被原地修改）。
 * @param label - 段落标题。
 * @param text - 原始文本、数字或空值。
 */
function pushSec(out: ProtagonistDetailSection[], label: string, text: string | number | undefined | null): void {
  const s = sec(label, text);
  if (s) out.push(s);
}

function inventoryStackSellTotalValue(it: CategorizedItemDefinition): number {
  const v = typeof it.value === "number" && Number.isFinite(it.value) ? it.value : 0;
  const c = typeof it.count === "number" && Number.isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
  return Math.floor(v * c);
}

function inventoryStackMaxCount(it: CategorizedItemDefinition): number {
  return typeof it.count === "number" && Number.isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
}

function buildSellInventoryUi(
  bagIndex: number,
  totalValuePoints: number,
  maxCount: number,
): SellInventoryItemUi | undefined {
  if (totalValuePoints < 10 || maxCount < 1) return undefined;
  return { bagIndex, maxCount };
}

/**
 * 将属性加成对象格式化为中文分号分隔的展示字符串。
 *
 * @param b - 键为属性名、值为加成的记录；无效时返回 `undefined`。
 * @returns 格式化后的文案，无有效项时返回 `undefined`。
 */
function formatZhBonus(b: Record<string, number> | undefined): string | undefined {
  if (!b || typeof b !== "object") return undefined;
  const parts = Object.entries(b).map(([k, v]) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const sign = v >= 0 ? "+" : "";
    return `${k} ${sign}${v}`;
  }).filter(Boolean) as string[];
  return parts.length ? parts.join("；") : undefined;
}

/**
 * 已佩戴 / 已上阵槽位：展示「法攻 +3 (境界加成 +1)」；境界加成为 `Math.trunc(v * (ratio - 1))`（向零截断），与属性中 `Math.trunc(v * ratio)` 一致：`trunc(v) + trunc(v*(r-1))` 在常见正整数 v 下等于 `trunc(v*r)`。
 */
function formatZhBonusWithRealmEquip(
  b: Record<string, number> | undefined,
  realm: CultivationRealm,
): string | undefined {
  if (!b || typeof b !== "object") return undefined;
  const ratio = getEquipBonusRealmRatio(realm.major, realm.minor);
  const parts = Object.entries(b).map(([k, v]) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const sign = v >= 0 ? "+" : "";
    let line = `${k} ${sign}${v}`;
    if (ratio !== 1) {
      const extraInt = Math.trunc(v * (ratio - 1));
      const exSign = extraInt >= 0 ? "+" : "";
      line += ` (境界加成 ${exSign}${extraInt})`;
    }
    return line;
  }).filter(Boolean) as string[];
  return parts.length ? parts.join("；") : undefined;
}

/**
 * 将倍率对象格式化为「键 × 值」的中文分号分隔字符串。
 *
 * @param m - 键为维度名、值为倍率的记录；无效时返回 `undefined`。
 * @returns 格式化后的文案，无有效项时返回 `undefined`。
 */
function formatMagnification(m: Record<string, number> | undefined): string | undefined {
  if (!m || typeof m !== "object") return undefined;
  const parts = Object.entries(m).map(([k, v]) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return `${k} ×${v}`;
  }).filter(Boolean) as string[];
  return parts.length ? parts.join("；") : undefined;
}

/**
 * 根据天赋条目构建详情弹窗数据。
 *
 * @param t - 天赋条目；字符串视为仅名称的简项，对象则包含名称、稀有度与描述等。
 * @returns 弹窗载荷；`t` 为 `null`/`undefined` 时返回 `null`。
 */
export function buildTraitDetailPayload(t: TraitEntry): ProtagonistDetailPayload | null {
  if (t == null) return null;
  if (typeof t === "string") {
    return {
      title: t,
      subtitle: "天赋",
      sections: [{ label: "说明", text: t }],
    };
  }
  const sections: ProtagonistDetailSection[] = [];
  pushSec(sections, "简述", t.desc);
  const sub = t.rarity?.trim() ? `品质：${t.rarity.trim()}` : "天赋";
  return {
    title: t.name || "—",
    subtitle: sub,
    sections: sections.length ? sections : [{ label: "说明", text: "暂无描述。" }],
    dataRarity: t.rarity?.trim() || undefined,
  };
}

/**
 * 根据装备定义生成副标题（装备类型文案）。
 *
 * @param it - 武器、法器或防具定义。
 * @returns 与 `equipType` 一致的副标题字符串。
 */
function wearableSubtitle(it: WeaponItemDefinition | FaqiItemDefinition | ArmorItemDefinition): string {
  return `${it.equipType}`;
}

/**
 * 构建可穿戴装备（武器 / 法器 / 防具）的详情弹窗数据，并按来源附加「卸下」或「装备」操作。
 *
 * @param it - 装备物品定义。
 * @param source - 可选来源：已装备槽位或储物袋索引；省略则无底部操作。
 * @returns 完整的 `ProtagonistDetailPayload`。
 */
export function buildWearableDetailPayload(
  it: WeaponItemDefinition | FaqiItemDefinition | ArmorItemDefinition,
  source?: WearableDetailSource,
  realm?: CultivationRealm | null,
): ProtagonistDetailPayload {
  const sections: ProtagonistDetailSection[] = [];
  pushSec(sections, "简介", it.desc);
  pushSec(sections, "品级", it.grade);
  const bonus =
    source?.type === "equipped" && realm
      ? formatZhBonusWithRealmEquip(it.bonus as Record<string, number>, realm)
      : formatZhBonus(it.bonus as Record<string, number>);
  if (bonus) pushSec(sections, "属性加成", bonus);
  if (it.equipType === "武器") {
    const mag = formatMagnification((it as WeaponItemDefinition).magnification);
    if (mag) pushSec(sections, "伤害倍率", mag);
  }
  pushSec(sections, "价值", it.value);
  pushSec(sections, "数量", it.count);

  const actions: ProtagonistDetailActionButton[] = [];
  if (source?.type === "equipped") {
    actions.push({
      label: "卸下",
      primary: true,
      action: { id: "unequipWear", equipSlot: source.equipSlot },
    });
  } else if (source?.type === "bag") {
    actions.push({
      label: "装备",
      primary: true,
      action: { id: "equipWearFromBag", inventoryIndex: source.inventoryIndex },
    });
  }

  return {
    title: it.name,
    subtitle: wearableSubtitle(it),
    sections: sections.length ? sections : [{ label: "说明", text: "暂无信息。" }],
    dataRarity: gradeToTraitRarity(it.grade),
    actions: actions.length ? actions : undefined,
    sellInventoryItem:
      source?.type === "bag"
        ? buildSellInventoryUi(source.inventoryIndex, inventoryStackSellTotalValue(it), inventoryStackMaxCount(it))
        : undefined,
  };
}

/**
 * 功法详情副标题（固定为「功法」）。
 *
 * @param gf - 功法物品定义；与 `wearableSubtitle` 对称保留参数，便于日后按类型扩展文案。
 * @returns 副标题字符串。
 */
function gongfaSubtitle(gf: GongfaItemDefinition): string {
  return `功法`;
}

/**
 * 构建功法物品的详情弹窗数据，并按来源附加「卸下」或「装备」操作。
 *
 * @param gf - 功法定义；攻击类会额外展示法力消耗与伤害倍率。
 * @param source - 可选来源：功法栏下标或储物袋索引；省略则无底部操作。
 * @returns 完整的 `ProtagonistDetailPayload`。
 */
export function buildGongfaDetailPayload(
  gf: GongfaItemDefinition,
  source?: GongfaDetailSource,
  realm?: CultivationRealm | null,
): ProtagonistDetailPayload {
  const sections: ProtagonistDetailSection[] = [];
  pushSec(sections, "简介", gf.desc);
  pushSec(sections, "类型", gf.subtype);
  pushSec(sections, "品级", gf.grade);
  const bonus =
    source?.type === "bar" && realm
      ? formatZhBonusWithRealmEquip(gf.bonus as Record<string, number>, realm)
      : formatZhBonus(gf.bonus as Record<string, number>);
  if (bonus) pushSec(sections, "修炼加成", bonus);
  if (gf.subtype === "攻击") {
    const atk = gf as AttackGongfaDefinition;
    pushSec(sections, "法力消耗", atk.manacost);
    const mag = formatMagnification(atk.magnification);
    if (mag) pushSec(sections, "伤害倍率", mag);
  }
  pushSec(sections, "价值", gf.value);
  pushSec(sections, "数量", gf.count);

  const actions: ProtagonistDetailActionButton[] = [];
  if (source?.type === "bar") {
    actions.push({
      label: "卸下",
      primary: true,
      action: { id: "unequipGongfa", gongfaIndex: source.gongfaIndex },
    });
  } else if (source?.type === "bag") {
    actions.push({
      label: "装备",
      primary: true,
      action: { id: "equipGongfaFromBag", inventoryIndex: source.inventoryIndex },
    });
  }

  return {
    title: gf.name,
    subtitle: gongfaSubtitle(gf),
    sections: sections.length ? sections : [{ label: "说明", text: "暂无信息。" }],
    dataRarity: gradeToTraitRarity(gf.grade),
    actions: actions.length ? actions : undefined,
    sellInventoryItem:
      source?.type === "bag"
        ? buildSellInventoryUi(source.inventoryIndex, inventoryStackSellTotalValue(gf), inventoryStackMaxCount(gf))
        : undefined,
  };
}

/**
 * 将丹药的恢复类效果格式化为简短中文（生命 / 法力）。
 *
 * @param el - 丹药定义，读取 `effects.recover`。
 * @returns 可读药效字符串；无有效恢复效果时返回 `undefined`。
 */
function formatRecover(el: ElixirItemDefinition): string | undefined {
  const r = el.effects?.recover;
  if (!r) return undefined;
  const hp = typeof r.hp === "number" && r.hp > 0 ? `生命 +${r.hp}` : "";
  const mp = typeof r.mp === "number" && r.mp > 0 ? `法力 +${r.mp}` : "";
  const parts = [hp, mp].filter(Boolean);
  return parts.length ? parts.join("，") : undefined;
}

function elixirHasRecoverEffectToUse(el: ElixirItemDefinition): boolean {
  const r = el.effects?.recover;
  if (!r) return false;
  const hp = typeof r.hp === "number" && Number.isFinite(r.hp) && r.hp > 0;
  const mp = typeof r.mp === "number" && Number.isFinite(r.mp) && r.mp > 0;
  return hp || mp;
}

/**
 * 将突破丹药的境界突破效果格式化为多行中文说明。
 *
 * @param bt - 突破丹药定义，读取 `effects.breakthrough` 数组。
 * @returns 每行一段「from → to（成功率 +x%）」；无数据时返回 `undefined`。
 */
function formatBreakthrough(bt: BreakthroughElixirDefinition): string | undefined {
  const arr = bt.effects?.breakthrough;
  if (!Array.isArray(arr) || !arr.length) return undefined;
  return arr
    .map((e) => {
      const pct = typeof e.chanceBonus === "number" ? Math.round(e.chanceBonus * 100) : 0;
      return `${e.from} → ${e.to}（成功率 +${pct}%）`;
    })
    .join("\n");
}

/**
 * 根据储物袋单格堆叠数据构建详情弹窗：灵石、装备、功法、丹药、材料、杂物或兜底未知物品。
 *
 * @param cell - 灵石堆叠或带 `itemType` 的物品堆叠。
 * @param bagIndex - 储物袋中的格子索引；传入时装备 / 功法会带上「装备」动作，省略则仅展示信息。
 * @param linggen - 主角灵根数组；灵石修炼提示与折算依赖灵根种数。
 * @returns 对应类型的 `ProtagonistDetailPayload`。
 */
export function buildInventoryStackDetailPayload(
  cell: InventoryStackItem,
  bagIndex?: number,
  linggen?: string[],
): ProtagonistDetailPayload {
  if (!("itemType" in cell)) {
    const st = cell as SpiritStoneInventoryStack;
    const sections: ProtagonistDetailSection[] = [];
    pushSec(sections, "简介", st.desc);
    pushSec(sections, "品级", st.grade);
    pushSec(sections, "价值", st.value);
    pushSec(sections, "持有数量", st.count);
    const raw = linggen != null ? getSpiritStoneRawPerPiece(st.name, linggen) : 0;
    if (raw > 0) {
      pushSec(sections, "修炼", `每个灵石可提供 ${formatSpiritStonePointsForUi(raw)} 点修为。`);
    }
    const cnt = typeof st.count === "number" && Number.isFinite(st.count) ? Math.max(1, Math.floor(st.count)) : 1;
    const payload: ProtagonistDetailPayload = {
      title: st.name,
      subtitle: `灵石`,
      sections: sections.length ? sections : [{ label: "说明", text: "—" }],
      dataRarity: gradeToTraitRarity(st.grade),
    };
    if (bagIndex != null && linggen != null && raw > 0) {
      payload.spiritStoneCultivation = { bagIndex, maxCount: cnt };
    }
    return payload;
  }

  const it = cell;
  switch (it.itemType) {
    case "装备":
      return buildWearableDetailPayload(
        it,
        bagIndex != null ? { type: "bag", inventoryIndex: bagIndex } : undefined,
      );
    case "功法":
      return buildGongfaDetailPayload(
        it,
        bagIndex != null ? { type: "bag", inventoryIndex: bagIndex } : undefined,
      );
    case "丹药": {
      const pill = it as ElixirItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", pill.desc);
      pushSec(sections, "品级", pill.grade);
      const fx = formatRecover(pill);
      if (fx) pushSec(sections, "药效", fx);
      pushSec(sections, "价值", pill.value);
      pushSec(sections, "数量", pill.count);
      return {
        title: pill.name,
        subtitle: `丹药`,
        sections,
        dataRarity: gradeToTraitRarity(pill.grade),
        useElixirFromBag:
          bagIndex != null && elixirHasRecoverEffectToUse(pill) ? { bagIndex } : undefined,
        sellInventoryItem:
          bagIndex != null
            ? buildSellInventoryUi(bagIndex, inventoryStackSellTotalValue(pill), inventoryStackMaxCount(pill))
            : undefined,
      };
    }
    case "突破丹药": {
      const bt = it as BreakthroughElixirDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", bt.desc);
      pushSec(sections, "品级", bt.grade);
      const fx = formatBreakthrough(bt);
      if (fx) pushSec(sections, "突破效果", fx);
      pushSec(sections, "价值", bt.value);
      pushSec(sections, "数量", bt.count);
      return {
        title: bt.name,
        subtitle: `突破丹药`,
        sections,
        dataRarity: gradeToTraitRarity(bt.grade),
        sellInventoryItem:
          bagIndex != null
            ? buildSellInventoryUi(bagIndex, inventoryStackSellTotalValue(bt), inventoryStackMaxCount(bt))
            : undefined,
      };
    }
    case "材料": {
      const m = it as MaterialItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", m.desc);
      pushSec(sections, "品级", m.grade);
      pushSec(sections, "价值", m.value);
      pushSec(sections, "数量", m.count);
      return {
        title: m.name,
        subtitle: `材料`,
        sections,
        dataRarity: gradeToTraitRarity(m.grade),
        sellInventoryItem:
          bagIndex != null ? buildSellInventoryUi(bagIndex, inventoryStackSellTotalValue(m), inventoryStackMaxCount(m)) : undefined,
      };
    }
    case "杂物": {
      const misc = it as MiscItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", misc.desc);
      pushSec(sections, "品级", misc.grade);
      pushSec(sections, "价值", misc.value);
      pushSec(sections, "数量", misc.count);
      return {
        title: misc.name,
        subtitle: `杂物`,
        sections,
        dataRarity: gradeToTraitRarity(misc.grade),
        sellInventoryItem:
          bagIndex != null
            ? buildSellInventoryUi(bagIndex, inventoryStackSellTotalValue(misc), inventoryStackMaxCount(misc))
            : undefined,
      };
    }
    default: {
      const u = it as { name?: string; desc?: string; grade?: string; value?: number; count?: number };
      const cnt =
        typeof u.count === "number" && Number.isFinite(u.count) ? Math.max(1, Math.floor(u.count)) : 1;
      const tv =
        typeof u.value === "number" && Number.isFinite(u.value) ? Math.floor(u.value * cnt) : 0;
      return {
        title: u.name ?? "—",
        subtitle: "物品",
        sections: [{ label: "说明", text: u.desc ?? "—" }],
        dataRarity: u.grade ? gradeToTraitRarity(u.grade) : undefined,
        sellInventoryItem: bagIndex != null ? buildSellInventoryUi(bagIndex, tv, cnt) : undefined,
      };
    }
  }
}
