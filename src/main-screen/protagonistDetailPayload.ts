/**
 * @fileoverview 主角左栏详情弹窗内容，与 mortal_journey 中 `openItemDetailModal` /
 * `openTraitDetailModal` 的信息结构对齐。
 */

import type {
  CategorizedItemDefinition,
  ElixirItemDefinition,
  GongfaItemDefinition,
  InventoryStackItem,
  MaterialItemDefinition,
  MiscItemDefinition,
  SpiritStoneInventoryStack,
  TreasureItemDefinition,
} from "../role_core/types/items";
import type { CultivationRealm, EquipSlotKey, PrimaryStatKey, TraitEntry } from "../role_core/types/playInfo";
import { PRIMARY_STAT_KEY_TO_ZH } from "../role_core/types/playInfo";
import type { Effect, EffectBundle } from "../role_core/types/effects";
import { TREASURE_MODIFIER_NAMES, resolveEffectBundleDisplay, effectFamily, conversionEffectMeta } from "../role_core/types/effects";
import { gradeToTraitRarity, getGongfaMasteryProgress } from "./protagonistPanelDisplay";
import { GONGFA_MASTERY_COMBAT_MULT, GONGFA_MASTERY_ATTRI_MULT, getItemSellPrice } from "../role_core/types/gameConstants";
import type { ItemGrade } from "../role_core/types/items";
import { describeTraitEffect } from "../fate_choice/traitEffect";

export interface DerivedStatValues {
  physique: number;
  spirit: number;
  strength: number;
  perception: number;
  guard: number;
  resistance: number;
  agility: number;
  insight: number;
}

type ItemSpecialEffect = EffectBundle;

function pushSpecialEffectSection(
  out: ProtagonistDetailSection[],
  fn: ItemSpecialEffect | undefined,
  _grade: string,
  _primaryStatGetter?: () => number,
  _statNameGetter?: () => string,
  _system?: string,
  derivedStatsGetter?: () => DerivedStatValues,
  mastery?: number,
  cooldownReduce?: number,
): void {
  if (!fn) return;
  out.push({
    label: "特殊效果",
    get text() {
      const ds = derivedStatsGetter ? derivedStatsGetter() : undefined;
      const getStat = (key: PrimaryStatKey) => {
        if (!ds) return 0;
        return (ds as unknown as Record<string, number>)[key] ?? 0;
      };
      const masteryMult = mastery != null && mastery >= 1
        ? GONGFA_MASTERY_COMBAT_MULT[Math.min(mastery, GONGFA_MASTERY_COMBAT_MULT.length) - 1]
        : 1.0;
      return resolveEffectBundleDisplay(fn, getStat, masteryMult, mastery ?? 1, cooldownReduce ?? 0);
    },
  });
}

/**
 * 将单条法宝转换格式化为可读文案。
 */
function formatTreasureConversion(c: Extract<Effect, { type: "conversion" }>): string {
  if (c.target === "stat") {
    const from = c.from ? PRIMARY_STAT_KEY_TO_ZH[c.from] : "";
    const to = c.to ? PRIMARY_STAT_KEY_TO_ZH[c.to] : "";
    return c.mode === "transfer"
      ? `将${c.ratio}%${from}转为${to}`
      : `${to} +${c.ratio}%×${from}`;
  }
  if (c.target === "mpToHp") {
    return c.mode === "transfer"
      ? `将${c.ratio}%法力上限转为血量上限`
      : `血量上限 +${c.ratio}%×法力上限`;
  }
  return c.mode === "transfer"
    ? `将${c.ratio}%血量上限转为法力上限`
    : `法力上限 +${c.ratio}%×血量上限`;
}

/**
 * 追加法宝/丹药/功法的「效果」段落（统一渲染 EffectBundle）。
 */
function pushEffectSection(
  out: ProtagonistDetailSection[],
  bundle: EffectBundle | undefined,
  derivedStatsGetter?: () => DerivedStatValues,
  mastery?: number,
  cooldownReduce?: number,
): void {
  if (!bundle) return;
  pushSpecialEffectSection(out, bundle, "", undefined, undefined, undefined, derivedStatsGetter, mastery, cooldownReduce);
}

/**
 * 追加法宝「转换效果」段落（仙品/神品的 conversion 效果，若已含于 effect 中则单独列出）。
 */
function pushTreasureConversionSection(
  out: ProtagonistDetailSection[],
  bundle: EffectBundle | undefined,
): void {
  if (!bundle) return;
  const convs = bundle.effects.filter((e): e is Extract<Effect, { type: "conversion" }> => e.type === "conversion");
  if (convs.length === 0) return;
  const meta = conversionEffectMeta(convs[0]);
  const lines = convs.map(formatTreasureConversion);
  out.push({ label: "命名法宝", text: `${meta.name}\n${meta.intro}\n${lines.join("\n")}` });
}

/**
 * 详情弹窗底部按钮所触发的动作；由 `protagonistManager.applyProtagonistDetailAction` 执行。
 */
export type ProtagonistDetailAction =
  | { id: "unequipWear"; equipSlot: EquipSlotKey }
  | { id: "unequipGongfa"; gongfaIndex: number }
  | { id: "equipWearFromBag"; inventoryIndex: number }
  | { id: "equipGongfaFromBag"; inventoryIndex: number }
  | { id: "consumeElixir"; inventoryIndex: number }
  | { id: "cultivateGongfa"; gongfaIndex: number }
  | { id: "sellFromBag"; inventoryIndex: number; count: number };

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
  /** 可选进度条数据（如功法熟练度进度）。 */
  progress?: { current: number; max: number; percent: number; isMax: boolean };
  /** 功法熟练度：层数文本（左对齐）。 */
  masteryLayer?: string;
  /** 功法熟练度：进度文本（右对齐）。 */
  masteryProgress?: string;
}

/**
 * 传给详情弹窗的完整展示数据。
 */
export interface ProtagonistDetailPayload {
  title: string;
  subtitle: string;
  sections: ProtagonistDetailSection[];
  dataRarity?: string;
  actions?: ProtagonistDetailActionButton[];
  /** 以两列网格布局展示 sections */
  gridSections?: boolean;
  /** 售卖信息：存在时弹窗显示「售卖」按钮（仅储物袋非灵石物品）。 */
  sell?: {
    inventoryIndex: number;
    /** 单件售卖价（灵石），仅用于展示；实际入账由领域层重算。 */
    unitPrice: number;
    /** 该格可售卖的最大数量。 */
    maxCount: number;
    itemName: string;
  };
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

/**
 * 将属性加成对象格式化为中文分号分隔的展示字符串。
 *
 * @param b - 键为属性名、值为加成的记录；无效时返回 `undefined`。
 * @returns 格式化后的文案，无有效项时返回 `undefined`。
 */
function formatZhBonusWithMastery(
  b: Record<string, number> | undefined,
  mastery: number,
): string | undefined {
  if (!b || typeof b !== "object") return undefined;
  const masteryMult = GONGFA_MASTERY_ATTRI_MULT[Math.min(mastery, GONGFA_MASTERY_ATTRI_MULT.length) - 1];
  const parts = Object.entries(b).map(([k, v]) => {
    if (typeof v === "number" && !Number.isFinite(v)) return null;
    const raw = typeof v === "number" ? v : 0;
    const val = Math.trunc(raw * masteryMult);
    const sign = val >= 0 ? "+" : "";
    let line = `${k} ${sign}${val}`;
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
 * 将物品的 `function`（SpecialEffect）格式化为多行中文展示文本。
 *
 * 输出示例（无灵根契合）：
 * ```
 * 触发条件：主动行为触发
 * 效果：恢复血量 +200（恢复）
 * 持续回合：3
 * 消耗：消耗法力 20
 * ```
 *
 * 输出示例（灵根契合）：
 * ```
 * 触发条件：主动行为触发
 * 效果：恢复血量 +200（恢复）(灵根加成 +60)
 * 持续回合：3
 * 消耗：消耗法力 20
 * ```
 */
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
  const effectDesc = describeTraitEffect(t.effect);
  if (effectDesc) pushSec(sections, "效果", effectDesc);
  const sub = t.rarity?.trim() ? `品质：${t.rarity.trim()}` : "天赋";
  return {
    title: t.name || "—",
    subtitle: sub,
    sections: sections.length ? sections : [{ label: "说明", text: "暂无描述。" }],
    dataRarity: t.rarity?.trim() || undefined,
  };
}

/**
 * 根据法宝定义生成副标题。
 *
 * @param it 法宝定义。
 * @returns 固定返回「法宝」。
 */
function wearableSubtitle(it: TreasureItemDefinition): string {
  return "法宝";
}

/**
 * 构建法宝的详情弹窗数据，并按来源附加「卸下」或「装备」操作。
 *
 * @param it 法宝物品定义。
 * @param source 可选来源：已装备槽位或储物袋索引；省略则无底部操作。
 * @param realm 可选境界（用于计算境界加成显示）。
 * @returns 完整的 `ProtagonistDetailPayload`。
 */
export function buildWearableDetailPayload(
  it: TreasureItemDefinition,
  source?: WearableDetailSource,
  realm?: CultivationRealm | null,
): ProtagonistDetailPayload {
  const sections: ProtagonistDetailSection[] = [];
  pushSec(sections, "简介", it.desc);
  pushSec(sections, "品级", it.grade);
  pushEffectSection(sections, it.effect);
  pushTreasureConversionSection(sections, it.effect);

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
  _playerLinggen?: readonly string[] | null,
  primaryStatGetter?: () => number,
  statNameGetter?: () => string,
  derivedStatsGetter?: () => DerivedStatValues,
  cooldownReduce: number = 0,
): ProtagonistDetailPayload {
  const sections: ProtagonistDetailSection[] = [];
  pushSec(sections, "简介", gf.desc);
  pushSec(sections, "品级", gf.grade);
  {
    const mp = getGongfaMasteryProgress(gf);
    const masteryText = mp.isMax ? "第10/10层（已满）" : `第${mp.mastery}/10层`;
    const section: ProtagonistDetailSection = { label: "熟练等级", text: masteryText };
    if (mp.isMax) {
      section.text = "第10/10层（已满）";
    } else {
      section.masteryLayer = `第${mp.mastery}/10层`;
      section.masteryProgress = `${mp.exp}/${mp.threshold}`;
      section.progress = { current: mp.exp, max: mp.threshold, percent: mp.percent, isMax: false };
    }
    sections.push(section);
  }
  const mastery = gf.mastery ?? 1;
  const bonus = formatZhBonusWithMastery(gf.bonus as Record<string, number>, mastery);
  if (bonus) pushSec(sections, "修炼加成", bonus);
  pushSpecialEffectSection(sections, gf.effect, gf.grade, primaryStatGetter, statNameGetter, undefined, derivedStatsGetter, mastery, cooldownReduce);

  const actions: ProtagonistDetailActionButton[] = [];
  if (source?.type === "bar") {
    if (mastery < 10) {
      actions.push({
        label: "修炼",
        primary: true,
        action: { id: "cultivateGongfa", gongfaIndex: source.gongfaIndex },
      });
    }
    actions.push({
      label: "卸下",
      primary: mastery >= 10,
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
  };
}

/**
 * 将丹药的恢复类效果格式化为简短中文（生命 / 法力）。
 *
 * @param el - 丹药定义，读取 `effects.recover`。
 * @returns 可读药效字符串；无有效恢复效果时返回 `undefined`。
 */
function formatElixirEffect(el: ElixirItemDefinition): string {
  if (!el.effect) return "";
  return el.effect.effects
    .map(e => {
      if (e.type === "healHp" || e.type === "healMp" || e.type === "xiuweiBoost" || e.type === "shouyuanBoost" || e.type === "statBoost") {
        const v = typeof e.value === "number" ? e.value : e.value[0];
        const suffix = ("isPercent" in e && e.isPercent) ? "%" : "";
        const statLabel = e.type === "statBoost" ? PRIMARY_STAT_KEY_TO_ZH[e.statKey] : "";
        if (e.type === "healHp") return `恢复血量 ${v}${suffix}`;
        if (e.type === "healMp") return `恢复法力 ${v}${suffix}`;
        if (e.type === "xiuweiBoost") return `提升修为 ${v}${suffix}`;
        if (e.type === "shouyuanBoost") return `提升寿元 ${v}年`;
        return `永久提升${statLabel} +${v}`;
      }
      return "";
    })
    .filter(Boolean)
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
  primaryStatGetterForGongfa?: (gf: GongfaItemDefinition) => number,
  statNameGetterForGongfa?: (gf: GongfaItemDefinition) => string,
  derivedStatsGetterForGongfa?: (gf: GongfaItemDefinition) => DerivedStatValues,
  cooldownReduce: number = 0,
  realmMajor?: string,
): ProtagonistDetailPayload {
  if (!("itemType" in cell)) {
    const st = cell as SpiritStoneInventoryStack;
    const sections: ProtagonistDetailSection[] = [];
    pushSec(sections, "简介", st.desc);
    pushSec(sections, "持有数量", st.count);
    return {
      title: st.name,
      subtitle: `灵石`,
      sections: sections.length ? sections : [{ label: "说明", text: "—" }],
    };
  }

  const it = cell;
  let payload: ProtagonistDetailPayload;
  switch (it.itemType) {
    case "法宝":
      payload = buildWearableDetailPayload(
        it,
        bagIndex != null ? { type: "bag", inventoryIndex: bagIndex } : undefined,
      );
      break;
    case "功法": {
      const gf = it as GongfaItemDefinition;
      const gfg = primaryStatGetterForGongfa
        ? () => primaryStatGetterForGongfa(gf)
        : undefined;
      const sng = statNameGetterForGongfa
        ? () => statNameGetterForGongfa(gf)
        : undefined;
      const dsg = derivedStatsGetterForGongfa
        ? () => derivedStatsGetterForGongfa(gf)
        : undefined;
      payload = buildGongfaDetailPayload(
        it,
        bagIndex != null ? { type: "bag", inventoryIndex: bagIndex } : undefined,
        linggen,
        gfg,
        sng,
        dsg,
        cooldownReduce,
      );
      break;
    }
    case "丹药": {
      const pill = it as ElixirItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", pill.desc);
      pushSec(sections, "品级", pill.grade);
      pushSec(sections, "药效", formatElixirEffect(pill));
      pushSec(sections, "数量", pill.count);
      const actions: ProtagonistDetailActionButton[] = [];
      if (bagIndex != null && pill.count > 0) {
        actions.push({ label: "服用", action: { id: "consumeElixir", inventoryIndex: bagIndex }, primary: true });
      }
      payload = {
        title: pill.name,
        subtitle: `丹药`,
        sections,
        dataRarity: gradeToTraitRarity(pill.grade),
        actions: actions.length > 0 ? actions : undefined,
      };
      break;
    }
    case "符箓":
    case "阵法": {
      const pill = it as unknown as ElixirItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", pill.desc);
      pushSec(sections, "品级", pill.grade);
      pushSec(sections, "效果", formatElixirEffect(pill));
      pushSec(sections, "数量", pill.count);
      const actions: ProtagonistDetailActionButton[] = [];
      if (bagIndex != null && pill.count > 0) {
        actions.push({ label: "使用", action: { id: "consumeElixir", inventoryIndex: bagIndex }, primary: true });
      }
      payload = {
        title: pill.name,
        subtitle: it.itemType,
        sections,
        dataRarity: gradeToTraitRarity(pill.grade),
        actions: actions.length > 0 ? actions : undefined,
      };
      break;
    }
    case "炼丹材料":
    case "炼器材料": {
      const m = it as MaterialItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", m.desc);
      pushSec(sections, "品级", m.grade);
      pushSec(sections, "数量", m.count);
      payload = {
        title: m.name,
        subtitle: m.itemType,
        sections,
        dataRarity: gradeToTraitRarity(m.grade),
      };
      break;
    }
    case "杂物": {
      const misc = it as MiscItemDefinition;
      const sections: ProtagonistDetailSection[] = [];
      pushSec(sections, "简介", misc.desc);
      pushSec(sections, "品级", misc.grade);
      pushSec(sections, "数量", misc.count);
      payload = {
        title: misc.name,
        subtitle: `杂物`,
        sections,
        dataRarity: gradeToTraitRarity(misc.grade),
      };
      break;
    }
    default: {
      const u = it as { name?: string; desc?: string; grade?: string; count?: number };
      payload = {
        title: u.name ?? "—",
        subtitle: "物品",
        sections: [{ label: "说明", text: u.desc ?? "—" }],
        dataRarity: u.grade ? gradeToTraitRarity(u.grade) : undefined,
      };
    }
  }

  // 储物袋内任意带品阶的非灵石物品均可售卖（UI 展示用单价；实际入账由领域层重算）
  if (bagIndex != null && realmMajor != null && it.grade && it.count > 0) {
    payload.sell = {
      inventoryIndex: bagIndex,
      unitPrice: getItemSellPrice(realmMajor, it.grade),
      maxCount: it.count,
      itemName: it.name,
    };
  }
  return payload;
}


