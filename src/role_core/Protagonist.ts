/**
 * @fileoverview 主角玩家类：聚合所有角色数据（境界/属性/HPMP/装备/功法/储物袋），
 * 提供统一的读写方法与派生计算。全局单例通过 `Protagonist.current` 访问（Vue ref）。
 *
 * 继承自 `Character` 基类，主角特有字段：修为/叙事人称/出身/天赋。
 */

import { ref, triggerRef, type Ref } from "vue";import type { FateChoiceResult } from "../fate_choice/types";
import { resolveTraitEffect, type TraitEffect } from "../fate_choice/traitEffect";
import { CREATION_FACTIONS, CREATION_RACES } from "../fate_choice/types";
import type {
  CategorizedItemDefinition,
  GongfaItemDefinition,
  InventoryStackItem,
  TreasureItemDefinition,
} from "./types/itemInfo";
import type { TreasureSpecialEffect } from "./types/treasure";
import { rollTreasureFunction, rollTreasureSpecialEffect } from "./types/treasure";
import type { GongfaSpecialEffect, GongfaSystem } from "./types/gongfa";
import { rollGongfaFunction, normalizeGongfaSystem, normalizeGongfaRole } from "./types/gongfa";
import { GONGFA_GRADE_ATTRI_TABLE, rollGradeAttriValue, getItemSellPrice } from "./types/gameConstants";
import { parseStorageObject } from "../ai/parseAiItem";

type SpecialEffect = TreasureSpecialEffect | GongfaSpecialEffect;

function migrateSpecialEffect(fn: any): any {
  if (!fn || typeof fn !== "object") return fn;
  if ("battleEffects" in fn || "modifiers" in fn) return fn;
  return fn;
}
import type {
  EquippedSlotsState,
  GongfaSlotsState,
  NarrationPerson,
  ProtagonistPlayInfo,
  TraitEntry,
  BreakthroughStatus,
  WorldLocation,
  PrimaryStatKey,
} from "./types/playInfo";
import {
  EQUIP_SLOT_COUNT,
  GONGFA_SLOT_COUNT,
  PRIMARY_STAT_KEYS,
  REALM_ORDER,
  SUB_STAGES,
  TABLE,
  realmStageIndex,
} from "./types/playInfo";
import {
  type SpiritStoneName,
} from "./types/spiritStone";
import type { ElixirItemDefinition } from "./types/elixir";
import { elixirEffectToStatKey, applyLinggenElixirBoost } from "./types/elixir";
import { craftElixirDef } from "./alchemy";
import { craftTreasureDef } from "./forging";
import { craftFoodDef, type FoodItemDefinition } from "./cooking";
import { craftPoisonDef, buildCoatingEffect, type PoisonItemDefinition } from "./poison";
import {
  boostModifiers,
  addRandomModifier,
  removeModifierAt,
  rollRefineSuccess,
} from "./refine";
import {
  createTimedBuff,
  activeTimedBuffs,
  applyTimedBuffsToStats,
  normalizeTimedBuffs,
  purgeExpiredTimedBuffs,
  type TimedBuff,
} from "./timedBuff";
import { storyStore } from "./storyStore";
import {
  normalizeCraftSkills,
  craftProficiencyGain,
  parseMaterialCategory,
  type CraftSkillKey,
  type CraftSkillState,
  type MaterialCategory,
} from "./craft";
import type { MaterialItemDefinition, ItemGrade } from "./types/itemInfo";
import type { InitStateParsed } from "../ai/init_state_generate";
import type { StateParsed } from "../ai/state_generate";
import {
  buildEquippedSlotsFromParsed,
  buildGongfaSlotsFromParsed,
  buildInventoryFromParsed,
} from "../ai/init_state_generate";
import { Character, normalizeElixirBonuses } from "./Character";
import {
  DEFAULT_INVENTORY_SLOT_COUNT,
  INVENTORY_SLOT_EXPAND_STEP,
  compactInventorySlotsInPlace,
} from "./CharacterInventory";
import { isTreasureItem } from "./CharacterEquip";
import {
  getRealmPrimaryStats,
  getProtagonistNarrativeAge,
  getShouyuanForRealm,
  getMinNarrativeAgeForMajor,
  getMaxNarrativeAgeForMajor,
  parseWorldLocationFromDash,
  formatWorldLocationDash,
  isEmptyWorldLocation,
} from "./types/playInfo";
import { getCultivationRequired, addGongfaMasteryExp } from "./realmUtils";

const VALID_ITEM_TYPES: ReadonlySet<string> = new Set([
  "法宝", "功法", "丹药", "餐食", "毒药", "材料", "杂物",
]);

/** 精炼目标位置：已装备的法宝槽，或储物袋中的一格。 */
export interface RefineTarget {
  where: "equipped" | "inventory";
  index: number;
}

/** 精炼操作：提升数值 / 增添词条 / 剔除词条。 */
export type RefineOp = "boost" | "add" | "remove";

/** 精炼结果。`success` 为 false 时材料已消耗但法宝未变。 */
export interface RefineResult {
  success: boolean;
  treasure: TreasureItemDefinition;
}

/** 主角玩家类：继承 Character，增加修为、叙事人称、出身、天赋等主角特有状态。 */
export class Protagonist extends Character {

  /**
   * 当前主角的全局单例（Vue ref）。
   * 在命运抉择确认时通过 `loadFromFateChoice` 写入，应用关闭时通过 `clear` 清空。
   */
  static current: Ref<Protagonist | null> = ref(null);

  static notifyChanged(): void {
    triggerRef(Protagonist.current);
  }

  /** 开局储物袋默认格数。 */
  static readonly DEFAULT_INVENTORY_SLOT_COUNT = DEFAULT_INVENTORY_SLOT_COUNT;

  /** 储物袋满时每次扩容的空位数。 */
  static readonly INVENTORY_SLOT_EXPAND_STEP = INVENTORY_SLOT_EXPAND_STEP;

  /** 功法栏固定格数。 */
  static readonly GONGFA_SLOT_COUNT = GONGFA_SLOT_COUNT;

  // ===================================================================
  // 数据字段（主角特有）
  // ===================================================================

  readonly role = "protagonist" as const;
  /** 叙事人称（第一/第二/第三人称）。 */
  narrationPerson: NarrationPerson;
  /** 种族（命运抉择所选，`CREATION_RACES` 的键）。 */
  race: string;
  /** 阵营（命运抉择所选，`CREATION_FACTIONS` 的键）。 */
  faction: string;
  /** 出生地点。 */
  birthPlace: WorldLocation;
  /** 出身故事。 */
  originStory: string;
  /** 天赋/词条列表。 */
  traits: TraitEntry[];
  /** 当前修为值。 */
  xiuwei: number;
  /** 当前小境界修为是否已圆满。 */
  realmComplete: boolean;
  /** 突破任务状态：idle=正常修炼, ready=修为圆满可尝试突破, in_quest=突破任务进行中。 */
  breakthroughStatus: BreakthroughStatus;
  /** 立绘候选池（dataURL）：所有生成/上传过的立绘，玩家可在弹窗中切换/删除。 */
  avatarCandidates: string[];
  /** 四门技艺（医术/毒术/烹饪/锻造）的累计熟练度，随制作产物增长。 */
  craftSkills: CraftSkillState;
  /** 限时增益（餐食等）：按世界时间到期的主属性百分比增减。 */
  timedBuffs: TimedBuff[];

  /**
   * 从 `ProtagonistPlayInfo` 数据对象构造实例。
   *
   * @param data 符合 `playInfo` 规范的主角数据快照。
   */
  constructor(data: ProtagonistPlayInfo) {
    super(data);
    this.narrationPerson = data.narrationPerson;
    this.race = data.race ?? "";
    this.faction = data.faction ?? "";
    this.birthPlace = data.birthPlace;
    this.originStory = data.originStory;
    this.traits = data.traits;
    this.xiuwei = data.xiuwei;
    this.realmComplete = data.realmComplete;
    this.breakthroughStatus = data.breakthroughStatus ?? (data.realmComplete ? "ready" : "idle");
    const rawCandidates = Array.isArray(data.avatarCandidates)
      ? data.avatarCandidates.filter((u): u is string => typeof u === "string")
      : [];
    this.avatarCandidates = rawCandidates.filter((u, i) => rawCandidates.indexOf(u) === i);
    if (this.avatarUrl && this.avatarCandidates.length === 0) {
      this.avatarCandidates = [this.avatarUrl];
    }
    this.craftSkills = normalizeCraftSkills(data.craftSkills);
    this.timedBuffs = normalizeTimedBuffs(data.timedBuffs);
  }

  // ── 立绘候选池管理 ─────────────────────────────────────────────────────

  /** 追加一张新立绘到候选池，并自动选为当前立绘。 */
  addPortraitCandidate(url: string): void {
    const u = url != null ? String(url) : "";
    if (!u) return;
    if (this.avatarCandidates.includes(u)) {
      this.avatarUrl = u;
      return;
    }
    this.avatarCandidates = [...this.avatarCandidates, u];
    this.avatarUrl = u;
  }

  /** 从候选池切换当前立绘（url 必须在池中）。 */
  selectPortrait(url: string): void {
    if (this.avatarCandidates.includes(url)) {
      this.avatarUrl = url;
    }
  }

  /** 从候选池删除一张立绘；若删的正是当前选中，则回退到池首或清空。 */
  removePortraitCandidate(url: string): void {
    this.avatarCandidates = this.avatarCandidates.filter((u) => u !== url);
    if (this.avatarUrl === url) {
      this.avatarUrl = this.avatarCandidates[0] ?? "";
    }
  }

  // ===================================================================
  // 修为
  // ===================================================================

  /**
   * 设置修为值；非有限数或负数时归零。
   *
   * @param n 修为值。
   */
  setXiuwei(n: number): void {
    this.xiuwei = typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
    Protagonist.notifyChanged();
  }

  addXiuwei(amount: number): void {
    if (this.realmComplete) return;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return;
    const cap = getCultivationRequired(this.realm.major, this.realm.minor);
    if (cap == null) {
      this.xiuwei += amount;
      Protagonist.notifyChanged();
      return;
    }
    this.xiuwei = Math.min(this.xiuwei + amount, cap);
    if (this.xiuwei >= cap) {
      this.xiuwei = cap;
      this.realmComplete = true;
      this.breakthroughStatus = "ready";
    }
    Protagonist.notifyChanged();
  }

  breakthrough(): boolean {
    if (!this.realmComplete) return false;
    const majorIdx = REALM_ORDER.indexOf(this.realm.major as typeof REALM_ORDER[number]);
    if (majorIdx < 0) return false;
    const minorIdx = SUB_STAGES.indexOf(this.realm.minor as typeof SUB_STAGES[number]);
    if (minorIdx < 0) return false;

    let nextMajor = this.realm.major;
    let nextMinor = this.realm.minor;

    if (minorIdx < SUB_STAGES.length - 1) {
      nextMinor = SUB_STAGES[minorIdx + 1];
    } else if (majorIdx < REALM_ORDER.length - 1) {
      nextMajor = REALM_ORDER[majorIdx + 1];
      nextMinor = SUB_STAGES[0];
    } else {
      return false;
    }

    this.realm = { major: nextMajor, minor: nextMinor };
    this.xiuwei = 0;
    this.realmComplete = false;
    this.breakthroughStatus = "idle";

    const newBase = getRealmPrimaryStats(nextMajor, nextMinor) ?? getRealmPrimaryStats("练气", "初期") ?? Character.emptyPrimaryStats();
    for (const k of PRIMARY_STAT_KEYS) {
      this.primaryStats[k] = newBase[k] ?? 0;
    }

    const { maxHp: capH, maxMp: capM } = this.computeMaxHpMp();
    this.maxHp = capH;
    this.maxMp = capM;
    this.currentHp = capH;
    this.currentMp = capM;

    const sy = getShouyuanForRealm(nextMajor, nextMinor);
    if (sy != null) this.shouyuan = sy;

    Protagonist.notifyChanged();
    return true;
  }

  // ===================================================================
  // Character mutator overrides — trigger reactivity after change
  // ===================================================================

  override setCurrentHpMp(currentHp: number, currentMp: number): void {
    super.setCurrentHpMp(currentHp, currentMp);
    Protagonist.notifyChanged();
  }

  override setMaxHpMp(maxHp: number, maxMp: number): void {
    super.setMaxHpMp(maxHp, maxMp);
    Protagonist.notifyChanged();
  }

  override setRealm(major: string, minor: string): void {
    super.setRealm(major, minor);
    Protagonist.notifyChanged();
  }

  override setAge(age: number): void {
    super.setAge(age);
    Protagonist.notifyChanged();
  }

  override setShouyuan(n: number): void {
    super.setShouyuan(n);
    Protagonist.notifyChanged();
  }

  override setDisplayName(name: string): void {
    super.setDisplayName(name);
    Protagonist.notifyChanged();
  }

  override setAvatarUrl(url: string): void {
    super.setAvatarUrl(url);
    Protagonist.notifyChanged();
  }

  override patchPrimaryStats(partial: Partial<Record<PrimaryStatKey, number>>): void {
    super.patchPrimaryStats(partial);
    Protagonist.notifyChanged();
  }

  override setInventorySlot(index: number, item: InventoryStackItem | null): boolean {
    const result = super.setInventorySlot(index, item);
    Protagonist.notifyChanged();
    return result;
  }

  override addToInventory(item: InventoryStackItem): number {
    const result = super.addToInventory(item);
    Protagonist.notifyChanged();
    return result;
  }

  override addSpiritStone(name: import("./types/spiritStone").SpiritStoneName, count: number): void {
    super.addSpiritStone(name, count);
    Protagonist.notifyChanged();
  }

  override removeSpiritStone(name: import("./types/spiritStone").SpiritStoneName, count: number): void {
    super.removeSpiritStone(name, count);
    Protagonist.notifyChanged();
  }

  override setGongfaSlot(index: number, item: import("./types/itemInfo").GongfaItemDefinition | null): boolean {
    const result = super.setGongfaSlot(index, item);
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
    return result;
  }

  override unequipGongfaToInventory(gongfaSlotIndex: number): boolean {
    const result = super.unequipGongfaToInventory(gongfaSlotIndex);
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
    return result;
  }

  override equipGongfaFromInventory(inventoryIndex: number): boolean {
    const result = super.equipGongfaFromInventory(inventoryIndex);
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
    return result;
  }

  /**
   * 按当前境界 + 主属性 + 已装备法宝特殊效果重算血量/法力上限，并夹取当前值。
   *
   * 法宝转换效果、功法主属性加成（bonus × 熟练度倍率）均会影响上限，
   * 故穿脱仙品/神品法宝、穿脱功法、功法熟练度提升后需调用以即时反映。
   */
  private recomputeMaxHpMpAndClamp(): void {
    const { maxHp, maxMp } = this.computeMaxHpMp();
    this.maxHp = maxHp;
    this.maxMp = maxMp;
    if (this.currentHp > maxHp) this.currentHp = maxHp;
    if (this.currentMp > maxMp) this.currentMp = maxMp;
  }

  override setEquippedSlot(slot: import("./types/playInfo").EquipSlotKey, item: import("./types/itemInfo").TreasureItemDefinition | null): boolean {
    const result = super.setEquippedSlot(slot, item);
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
    return result;
  }

  override equipFromInventory(inventoryIndex: number): boolean {
    const result = super.equipFromInventory(inventoryIndex);
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
    return result;
  }

  override unequipToInventory(slot: import("./types/playInfo").EquipSlotKey): boolean {
    const result = super.unequipToInventory(slot);
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
    return result;
  }

  override applyDetailAction(a: import("./types/playInfo").ProtagonistDetailAction): boolean {
    let result: boolean;
    if (a.id === "consumeElixir") {
      result = this.consumeElixir(a.inventoryIndex);
    } else if (a.id === "consumeFood") {
      result = this.consumeFood(a.inventoryIndex);
    } else if (a.id === "sellFromBag") {
      result = this.sellFromBag(a.inventoryIndex, a.count) > 0;
    } else {
      result = super.applyDetailAction(a);
    }
    // super.applyDetailAction 经 CharacterEquip 模块函数直接改槽位（gongfaSlots/equippedSlots），
    // 绕过了本类的 equipGongfaFromInventory / unequipGongfaToInventory / equipFromInventory /
    // unequipToInventory 等方法覆写，故那些覆写里的 recomputeMaxHpMpAndClamp 不会触发。
    // 这里是 UI 穿脱/服丹的真实入口，必须在此对影响主属性的动作统一重算 HP/MP。
    if (a.id === "equipGongfaFromBag" || a.id === "unequipGongfa"
        || a.id === "equipWearFromBag" || a.id === "unequipWear"
        || a.id === "consumeElixir" || a.id === "consumeFood") {
      this.recomputeMaxHpMpAndClamp();
    }
    Protagonist.notifyChanged();
    return result;
  }

  // ===================================================================
  // 丹药服用
  // ===================================================================

  consumeElixir(cellIndex: number): boolean {
    const cell = this.inventorySlots[cellIndex];
    if (!cell || !("itemType" in cell) || cell.itemType !== "丹药") return false;
    const pill = cell as ElixirItemDefinition;
    const { effectType, effects } = pill;
    const { value, isPercent } = effects;

    const statKey = elixirEffectToStatKey(effectType);
    if (statKey) {
      this.elixirBonuses[statKey] = (this.elixirBonuses[statKey] ?? 0) + value;
    } else if (effectType === "恢复血量") {
      const amount = isPercent ? Math.round(this.maxHp * value / 100) : value;
      this.currentHp = Math.min(this.currentHp + amount, this.maxHp);
    } else if (effectType === "恢复法力") {
      const amount = isPercent ? Math.round(this.maxMp * value / 100) : value;
      this.currentMp = Math.min(this.currentMp + amount, this.maxMp);
    } else if (effectType === "提升修为") {
      this.addXiuwei(isPercent ? Math.round(this.maxHp * value / 100) : value);
    } else if (effectType === "提升寿元") {
      this.shouyuan += value;
    } else {
      return false;
    }

    pill.count -= 1;
    if (pill.count <= 0) {
      this.inventorySlots[cellIndex] = null;
    }
    Protagonist.notifyChanged();
    return true;
  }

  // ===================================================================
  // 售卖储物袋物品
  // ===================================================================

  /**
   * 售卖储物袋物品：按当前境界×品阶定价（领域层重算，不信任 UI 传值），
   * 灵石入账后扣减/清空该格。灵石堆叠与空格不可售卖。
   * @returns 实际获得的灵石数；失败返回 0。
   */
  sellFromBag(cellIndex: number, count: number): number {
    const cell = this.inventorySlots[cellIndex];
    if (!cell || !("itemType" in cell)) return 0;
    const safeCount = Math.max(1, Math.min(Math.floor(count) || 1, cell.count));
    if (safeCount <= 0) return 0;
    const unitPrice = getItemSellPrice(this.realm.major, cell.grade);
    const gain = unitPrice * safeCount;
    this.addSpiritStone("灵石", gain);
    cell.count -= safeCount;
    if (cell.count <= 0) {
      this.inventorySlots[cellIndex] = null;
    }
    Protagonist.notifyChanged();
    return gain;
  }

  // ===================================================================
  // 炼丹
  // ===================================================================

  /**
   * 炼丹：消耗 3 份材料产出 1 颗丹药并放入储物袋。
   *
   * 规则：
   *   - 必须提供 3 个材料格下标（允许同一格重复，即从同一堆取多份）。
   *   - 每份材料 count - 1；按被使用次数扣减，不足则整体失败。
   *   - 材料必须均为「药材」类，否则整体失败。
   *   - 100% 出丹，无失败。产出丹药品阶按材料品阶加权随机，并按【医术】熟练度掷品阶跃迁。
   *   - 木灵根契合会在产出时烘焙（与剧情/AI 给丹一致）。
   *   - 产出后按最终品阶回馈【医术】熟练度。
   *
   * @param slotIndices 三个材料格下标（可重复）。
   * @returns 产出的丹药定义；参数非法（数量不对/越界/非材料/不足）时返回 null。
   */
  /**
   * 用三份「食材」烹饪餐食并写入储物袋。
   *
   * 规则同锻造，但膳食类型按权重随机（「点心」纯增益无代价，故权重更低）。
   * 产出后按最终品阶回馈【烹饪】熟练度。
   *
   * @param slotIndices 三个食材格下标（可重复）。
   * @returns 产出的餐食定义；参数非法或命名表为空时返回 null。
   */
  craftFoodFromMaterials(slotIndices: number[]): FoodItemDefinition | null {
    const collected = this.collectCraftMaterials(slotIndices, "食材");
    if (!collected) return null;
    const { picks, usage } = collected;

    const food = craftFoodDef(picks.map((m) => ({ grade: m.grade })), this.craftSkills.cooking);
    if (!food) return null;
    this.gainCraftProficiency("cooking", food.grade);

    this.consumeCraftMaterials(usage);
    this.addToInventory(food as InventoryStackItem);
    Protagonist.notifyChanged();
    return food;
  }

  /**
   * 用三份「毒物」制毒并写入储物袋。
   *
   * 产出后按最终品阶回馈【毒术】熟练度。
   *
   * @param slotIndices 三个毒物格下标（可重复）。
   * @returns 产出的毒药定义；参数非法或命名表为空时返回 null。
   */
  craftPoisonFromMaterials(slotIndices: number[]): PoisonItemDefinition | null {
    const collected = this.collectCraftMaterials(slotIndices, "毒物");
    if (!collected) return null;
    const { picks, usage } = collected;

    const poison = craftPoisonDef(picks.map((m) => ({ grade: m.grade })), this.craftSkills.poison);
    if (!poison) return null;
    this.gainCraftProficiency("poison", poison.grade);

    this.consumeCraftMaterials(usage);
    this.addToInventory(poison as InventoryStackItem);
    Protagonist.notifyChanged();
    return poison;
  }

  /**
   * 淬毒：消耗 3 份「毒物」为指定法宝附加毒性涂层，命中时对目标叠加 DoT。
   *
   * 涂层强度取毒物加权品阶经【毒术】熟练度跃迁后的结果；
   * 重复淬毒会覆盖旧涂层（不叠加），毒性名取自制毒命名表的「持续伤害」一系。
   *
   * @param target 目标法宝位置（装备槽或储物袋格）。
   * @param materialSlots 三个毒物格下标（可重复）。
   * @returns 附毒后的法宝；参数非法或该法宝无词条组时返回 null。
   */
  coatTreasureWithPoison(
    target: RefineTarget,
    materialSlots: number[],
  ): TreasureItemDefinition | null {
    const tr = this.resolveRefineTarget(target);
    if (!tr || !tr.function) return null;

    const collected = this.collectCraftMaterials(materialSlots, "毒物");
    if (!collected) return null;
    const { picks, usage } = collected;

    const sample = craftPoisonDef(picks.map((m) => ({ grade: m.grade })), this.craftSkills.poison);
    if (!sample) return null;
    // 涂层固定走 DoT 口径并按命中叠层，故用远低于毒药的单层数值。
    const coat = buildCoatingEffect(sample.grade);

    this.consumeCraftMaterials(usage);
    tr.function = {
      ...tr.function,
      coating: { name: `${sample.grade}毒`, tickPercent: coat.tickPercent, duration: coat.duration },
    };
    this.gainCraftProficiency("poison", sample.grade);
    Protagonist.notifyChanged();
    return tr;
  }

  // ===================================================================
  // 精炼
  // ===================================================================

  /**
   * 定位一件可精炼的法宝：`target` 为装备槽下标或储物袋格下标。
   *
   * @param target 精炼目标位置。
   * @returns 法宝定义；位置无法宝时返回 null。
   */
  private resolveRefineTarget(target: RefineTarget): TreasureItemDefinition | null {
    const cell = target.where === "equipped"
      ? this.equippedSlots[target.index]
      : this.inventorySlots[target.index];
    if (!cell || !("itemType" in cell) || cell.itemType !== "法宝") return null;
    return cell as TreasureItemDefinition;
  }

  /**
   * 精炼一件法宝。
   *
   * 消耗规则：提升/增添吃 3 份「器材」，剔除只吃 1 份。
   * 成败规则：提升/增添按现有词条数掷失败率，失败时材料照扣、法宝不变；
   * 剔除必定成功。
   *
   * @param target 目标法宝位置（装备槽或储物袋格）。
   * @param op 精炼操作。
   * @param materialSlots 器材格下标（可重复），数量须与操作要求一致。
   * @param modifierIndex 仅 `op === "remove"` 时使用：要剔除的词条下标。
   * @returns 精炼结果；参数非法时返回 null。
   */
  refineTreasure(
    target: RefineTarget,
    op: RefineOp,
    materialSlots: number[],
    modifierIndex?: number,
  ): RefineResult | null {
    const tr = this.resolveRefineTarget(target);
    if (!tr) return null;

    const needed = op === "remove" ? 1 : 3;
    if (!Array.isArray(materialSlots) || materialSlots.length !== needed) return null;
    const collected = this.collectCraftMaterials(materialSlots, "器材", needed);
    if (!collected) return null;

    // 先算出「若成功」的结果，无效操作（已满词条/已达上限/下标越界）直接拒绝，不消耗材料。
    let nextFunction;
    if (op === "boost") {
      nextFunction = boostModifiers(tr);
    } else if (op === "add") {
      nextFunction = addRandomModifier(tr);
    } else {
      nextFunction = removeModifierAt(tr, modifierIndex ?? -1);
    }
    if (!nextFunction) return null;

    this.consumeCraftMaterials(collected.usage);

    // 剔除必定成功；提升/增添按现有词条数掷失败率。
    const modifierCount = tr.function?.modifiers.length ?? 0;
    const success = op === "remove" || rollRefineSuccess(modifierCount, this.craftSkills.forging);
    if (success) {
      tr.function = nextFunction;
      this.recomputeMaxHpMpAndClamp();
    }

    Protagonist.notifyChanged();
    return { success, treasure: tr };
  }

  /**
   * 食用餐食：转为一条限时增益，并从储物袋扣除一份。
   *
   * 同名餐食可叠加（各自独立计时），百分比在结算时求和。
   *
   * @param cellIndex 储物袋格下标。
   * @returns 是否成功食用。
   */
  consumeFood(cellIndex: number): boolean {
    const cell = this.inventorySlots[cellIndex];
    if (!cell || !("itemType" in cell) || cell.itemType !== "餐食") return false;
    const food = cell as FoodItemDefinition;
    if (food.count < 1) return false;

    this.addTimedBuff(createTimedBuff(
      food.name,
      food.desc,
      food.statPercents,
      storyStore.worldTime.value,
      food.durationDays,
    ));

    food.count -= 1;
    if (food.count <= 0) this.inventorySlots[cellIndex] = null;
    return true;
  }

  // ===================================================================
  // 限时增益
  // ===================================================================

  /**
   * 当前生效中的限时增益（按世界时间惰性过滤）。
   *
   * 世界时间取自 `storyStore.worldTime`——它是全局唯一的世界时钟，
   * 读取它使属性计算随时间推进自动失效重算，无需在每处推进点手动通知。
   */
  getActiveTimedBuffs(): TimedBuff[] {
    return activeTimedBuffs(this.timedBuffs, storyStore.worldTime.value);
  }

  /**
   * 追加一条限时增益。
   *
   * @param buff 由 `createTimedBuff` 构造的增益。
   */
  addTimedBuff(buff: TimedBuff): void {
    this.timedBuffs = [...this.timedBuffs, buff];
    Protagonist.notifyChanged();
  }

  /** 清除已到期的限时增益（时间推进后调用，避免存档中堆积失效项）。 */
  purgeExpiredBuffs(): void {
    const next = purgeExpiredTimedBuffs(this.timedBuffs, storyStore.worldTime.value);
    if (next.length === this.timedBuffs.length) return;
    this.timedBuffs = next;
    Protagonist.notifyChanged();
  }

  /**
   * 在基类聚合结果之上叠加生效中的限时增益（百分比）。
   *
   * 施加顺序位于法宝转换之后，因此增益作用于「最终主属性」，语义直观。
   */
  protected override collectPrimaryBonuses(): Record<string, number> {
    const stats = super.collectPrimaryBonuses();
    applyTimedBuffsToStats(stats, this.getActiveTimedBuffs());
    return stats;
  }

  /**
   * 按产出品阶回馈技艺熟练度（下品→神品依次 +1/2/4/8/16/32）。
   *
   * @param skill 技艺键。
   * @param grade 本次产物的最终品阶。
   */
  gainCraftProficiency(skill: CraftSkillKey, grade: ItemGrade): void {
    this.craftSkills[skill] += craftProficiencyGain(grade);
  }

  /**
   * 校验并收集制作材料。
   *
   * @param slotIndices 材料格下标（允许重复，即从同一堆取多份）。
   * @param category 该技艺要求的材料分类。
   * @param requiredCount 需要的份数，默认 3（精炼的剔除操作只需 1 份）。
   * @returns 校验通过时返回材料列表与各格使用次数；任一条件不满足返回 null。
   */
  private collectCraftMaterials(
    slotIndices: number[],
    category: MaterialCategory,
    requiredCount = 3,
  ): { picks: MaterialItemDefinition[]; usage: Map<number, number> } | null {
    if (!Array.isArray(slotIndices) || slotIndices.length !== requiredCount) return null;

    const usage = new Map<number, number>();
    const picks: MaterialItemDefinition[] = [];
    for (const raw of slotIndices) {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      const i = Math.floor(raw);
      if (i < 0 || i >= this.inventorySlots.length) return null;
      const cell = this.inventorySlots[i];
      if (!cell || !("itemType" in cell) || cell.itemType !== "材料") return null;
      const mat = cell as MaterialItemDefinition;
      if (mat.category !== category) return null;
      if (typeof mat.count !== "number" || mat.count < 1) return null;
      usage.set(i, (usage.get(i) ?? 0) + 1);
      picks.push(mat);
    }
    // 校验每格存量足够（同一格被取多份时）
    for (const [i, n] of usage) {
      const mat = this.inventorySlots[i] as MaterialItemDefinition | null;
      if (!mat || mat.count < n) return null;
    }
    return { picks, usage };
  }

  /** 按使用次数扣减材料，归零的格子置空。 */
  private consumeCraftMaterials(usage: Map<number, number>): void {
    for (const [i, n] of usage) {
      const mat = this.inventorySlots[i] as MaterialItemDefinition | null;
      if (!mat) continue;
      mat.count -= n;
      if (mat.count <= 0) this.inventorySlots[i] = null;
    }
  }

  craftElixirFromMaterials(slotIndices: number[]): ElixirItemDefinition | null {
    const collected = this.collectCraftMaterials(slotIndices, "药材");
    if (!collected) return null;
    const { picks, usage } = collected;

    const elixir = craftElixirDef(picks.map((m) => ({ grade: m.grade })), this.craftSkills.medicine);
    applyLinggenElixirBoost(elixir as InventoryStackItem, this.linggen, this.realm.major);
    this.gainCraftProficiency("medicine", elixir.grade);

    this.consumeCraftMaterials(usage);
    this.addToInventory(elixir as InventoryStackItem);
    Protagonist.notifyChanged();
    return elixir;
  }

  /**
   * 用三份「器材」锻造法宝并写入储物袋。
   *
   * 规则：
   *   - 材料必须均为「器材」类，否则整体失败。
   *   - 100% 出器，无失败。品阶按材料加权随机，并按【锻造】熟练度掷品阶跃迁。
   *   - 器物类型均匀随机，只决定名称；词条由品阶随机（与 AI 掉落的法宝同源）。
   *   - 产出后按最终品阶回馈【锻造】熟练度。
   *
   * @param slotIndices 三个器材格下标（可重复）。
   * @returns 产出的法宝定义；参数非法或命名表为空时返回 null。
   */
  craftTreasureFromMaterials(slotIndices: number[]): TreasureItemDefinition | null {
    const collected = this.collectCraftMaterials(slotIndices, "器材");
    if (!collected) return null;
    const { picks, usage } = collected;

    const treasure = craftTreasureDef(picks.map((m) => ({ grade: m.grade })), this.craftSkills.forging);
    if (!treasure) return null;
    this.gainCraftProficiency("forging", treasure.grade);

    this.consumeCraftMaterials(usage);
    this.addToInventory(treasure as InventoryStackItem);
    Protagonist.notifyChanged();
    return treasure;
  }

  // ===================================================================
  // 突破任务状态
  // ===================================================================

  setBreakthroughStatus(status: BreakthroughStatus): void {
    this.breakthroughStatus = status;
    Protagonist.notifyChanged();
  }

  onBreakthroughFailed(): void {
    this.breakthroughStatus = "ready";
    Protagonist.notifyChanged();
  }

  isShouyuanExhausted(): boolean {
    return this.shouyuan <= 0;
  }

  applyGongfaMasteryExpChanges(changes: Array<{ gongfaName: string; masteryExpIncrease: number }>): void {
    for (const change of changes) {
      for (const slot of this.gongfaSlots) {
        if (slot && slot.name === change.gongfaName) {
          addGongfaMasteryExp(slot, change.masteryExpIncrease);
          break;
        }
      }
    }
    // 熟练度提升会改变功法 bonus × 熟练度倍率，进而影响主属性与 HP/MP 上限，需重算。
    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
  }

  // ===================================================================
  // AI 开局状态应用
  // ===================================================================

  /**
   * 将 AI 开局状态解析结果应用到主角：写入装备、功法、储物袋，并重新推导 HP/MP 上限与当前值。
   *
   * @param parsed AI 开局状态解析结果（`InitStateParsed`）。
   */
  applyInitState(parsed: InitStateParsed): void {
    this.equippedSlots = buildEquippedSlotsFromParsed(parsed);
    this.gongfaSlots = buildGongfaSlotsFromParsed(parsed);
    // 开局状态在已有（天赋授予的）储物袋基础上「追加」AI 生成的物品，而非整体覆盖，
    // 以保留 fromFateChoice 写入的天赋物品（法宝/功法/丹药/材料/灵石）。
    const initInventory = buildInventoryFromParsed(parsed, this.realm.major, DEFAULT_INVENTORY_SLOT_COUNT);
    for (const slot of initInventory) {
      if (!slot) continue;
      if ("itemType" in slot && slot.itemType === "丹药") {
        applyLinggenElixirBoost(slot, this.linggen, this.realm.major);
      }
      this.addToInventory(slot);
    }
    compactInventorySlotsInPlace(this);

    const { maxHp: capH, maxMp: capM } = this.computeMaxHpMp();
    this.maxHp = capH;
    this.maxMp = capM;
    this.currentHp = Math.max(0, Math.min(capH, Math.round(capH * parsed.hpPercent / 100)));
    this.currentMp = Math.max(0, Math.min(capM, Math.round(capM * parsed.mpPercent / 100)));

    // 玩家已在命运抉择中自填年龄（ageConfirmed 已为 true）时不被开局管线覆盖。
    if (this.ageConfirmed) {
      // 保持玩家填写的年龄。
    } else if (typeof parsed.protagonistAge === "number" && parsed.protagonistAge > 0) {
      const minAge = getMinNarrativeAgeForMajor(this.realm.major);
      const maxAge = Math.min(this.shouyuan - 1, getMaxNarrativeAgeForMajor(this.realm.major));
      const clampedAge = Math.max(minAge, Math.min(maxAge, parsed.protagonistAge));
      this.setAge(clampedAge);
      this.ageConfirmed = true;
    } else {
      const minAge = getMinNarrativeAgeForMajor(this.realm.major);
      this.setAge(minAge);
      this.ageConfirmed = true;
    }

    Protagonist.notifyChanged();
  }

  /**
   * 结算天赋/种族/阵营的具体效果：在开局状态（AI 生成的装备/功法/储物袋）应用之后统一调用。
   *
   * 将命运抉择的天赋效果一次性结算到主角：
   *   - 法宝/功法/丹药/材料进储物袋（丹药做木灵根烘焙）；
   *   - 灵石进灵石格；
   *   - 主属性加成累加进 `elixirBonuses`（由 `collectPrimaryBonuses` 读取，
   *     同时影响 UI 显示属性与 HP/MP 上限，且突破后不会被重置）。
   * 末尾重算 HP/MP 上限。
   *
   * 仅在开局流程调用一次（`useOpeningStory` 在状态生成后调用）；存档加载走 `fromJson`，
   * 物品与 `elixirBonuses` 已在存档中，不会重复结算。
   */
  applyTraitEffects(): void {
    for (const t of this.traits) {
      if (typeof t === "string") continue;
      if (t.effect) this.settleOriginEffect(t.effect);
    }
    // 种族/阵营与天赋共用同一套效果结构，同批一次性结算（条目未写 effect 时跳过）。
    const raceEffect = CREATION_RACES[this.race]?.effect;
    if (raceEffect) this.settleOriginEffect(raceEffect);
    const factionEffect = CREATION_FACTIONS[this.faction]?.effect;
    if (factionEffect) this.settleOriginEffect(factionEffect);

    this.recomputeMaxHpMpAndClamp();
    Protagonist.notifyChanged();
  }

  /** 结算单条开局效果（天赋/种族/阵营通用）：物品进袋、灵石入格、主属性加成入 `elixirBonuses`。 */
  private settleOriginEffect(effect: TraitEffect): void {
    const r = resolveTraitEffect(effect);
    for (const item of r.items) {
      if ("itemType" in item && item.itemType === "丹药") {
        applyLinggenElixirBoost(item, this.linggen, this.realm.major);
      }
      this.addToInventory(item);
    }
    if (r.spiritStones > 0) this.addSpiritStone("灵石", r.spiritStones);
    for (const [k, v] of Object.entries(r.statBonus)) {
      if (typeof v === "number" && Number.isFinite(v) && v !== 0) {
        this.elixirBonuses[k] = (this.elixirBonuses[k] ?? 0) + v;
      }
    }
  }

  /**
   * 将 AI 剧情状态变更应用到主角：HP/MP 更新、灵石增减、物品添加/移除。
   *
   * @param state AI 状态生成解析结果（`StateParsed`）。
   */
  applyStateChanges(state: StateParsed): void {
    // 各标签独立容错：单个标签处理失败不影响其他标签。

    // HP/MP
    try {
      if (state.hpMp) {
        this.setCurrentHpMp(
          Math.round(this.maxHp * state.hpMp.hpPercent / 100),
          Math.round(this.maxMp * state.hpMp.mpPercent / 100),
        );
      }
    } catch (e) {
      console.error("[Protagonist] HP/MP 更新失败：" + (e instanceof Error ? e.message : String(e)));
    }

    // 修为 / 功法熟练度
    try {
      if (state.userState) {
        if (typeof state.userState.xiuweiIncrease === "number") {
          this.addXiuwei(state.userState.xiuweiIncrease);
        }
        if (state.userState.gongfaMasteryChanges
            && state.userState.gongfaMasteryChanges.length > 0) {
          this.applyGongfaMasteryExpChanges(state.userState.gongfaMasteryChanges);
          const totalMasteryExp = state.userState.gongfaMasteryChanges
            .reduce((sum, c) => sum + c.masteryExpIncrease, 0);
          this.addXiuwei(totalMasteryExp);
        }
      }
    } catch (e) {
      console.error("[Protagonist] 修为/功法熟练度更新失败：" + (e instanceof Error ? e.message : String(e)));
    }

    // 突破
    try {
      if (state.breakthrough) {
        if (state.breakthrough.breakthroughQuestStart === true
            && this.breakthroughStatus === "ready") {
          this.setBreakthroughStatus("in_quest");
        }
        if (state.breakthrough.breakthroughFailed === true
            && this.breakthroughStatus === "in_quest") {
          this.onBreakthroughFailed();
        }
        if (state.breakthrough.realmBreakthrough === true) {
          this.breakthrough();
        }
      }
    } catch (e) {
      console.error("[Protagonist] 突破状态更新失败：" + (e instanceof Error ? e.message : String(e)));
    }

    // 灵石
    try {
      for (const change of state.spiritStoneChanges) {
        if (change.op === "add") {
          this.addSpiritStone("灵石", change.count);
        } else if (change.op === "remove") {
          this.removeSpiritStone("灵石", change.count);
        }
      }
    } catch (e) {
      console.error("[Protagonist] 灵石更新失败：" + (e instanceof Error ? e.message : String(e)));
    }

    // 物品添加（每个物品独立容错）
    for (const item of state.itemAdds) {
      try {
        if (item.type === "灵石") continue;
        const itemType = VALID_ITEM_TYPES.has(item.type) ? item.type as CategorizedItemDefinition["itemType"] : "杂物";
        const grade = item.grade as import("./types/itemInfo").ItemGrade;
        if (itemType === "功法") {
          const itemRec = item as unknown as Record<string, unknown>;
          const system = normalizeGongfaSystem(itemRec.system);
          const role = normalizeGongfaRole(itemRec.role);
          const bonusName = typeof itemRec.bonus === "string" ? itemRec.bonus.trim() : "";
          const validBonus = new Set(Object.keys(GONGFA_GRADE_ATTRI_TABLE));
          const bonus = validBonus.has(bonusName)
            ? { [bonusName]: rollGradeAttriValue(bonusName, grade, GONGFA_GRADE_ATTRI_TABLE) }
            : {};
          this.addToInventory({
            name: item.name,
            desc: item.intro,
            grade,
            count: item.count,
            itemType,
            system,
            role,
            mastery: 1,
            bonus,
            function: rollGongfaFunction(system, grade, role),
          } as InventoryStackItem);
          continue;
        }
        if (itemType === "丹药") {
          const parsed = parseStorageObject(item, this.realm.major, this.realm.minor);
          if (parsed) this.addToInventory(parsed);
          continue;
        }
        let fn: SpecialEffect | undefined;
        let se: import("./types/treasure").TreasureConversionEffect | undefined;
        if (itemType === "法宝") {
          fn = rollTreasureFunction(grade);
          se = rollTreasureSpecialEffect(grade);
        }
        this.addToInventory({
          name: item.name,
          desc: item.intro,
          grade,
          count: item.count,
          itemType,
          // 材料必须带分类，否则四门技艺都取不到对应原料（非法值回退「药材」）。
          ...(itemType === "材料" ? { category: parseMaterialCategory(item.category) } : {}),
          ...(fn ? { function: fn } : {}),
          ...(se ? { specialEffect: se } : {}),
        } as InventoryStackItem);
      } catch (e) {
        console.error(`[Protagonist] 物品「${item.name}」入库失败：` + (e instanceof Error ? e.message : String(e)));
      }
    }

    // 物品移除（每个物品独立容错）
    for (const item of state.itemRemoves) {
      try {
        let remaining = item.count;
        for (let i = 0; i < this.inventorySlots.length && remaining > 0; i++) {
          const cell = this.inventorySlots[i];
          if (!cell || !("name" in cell) || cell.name !== item.name) continue;
          const take = Math.min(remaining, cell.count);
          cell.count -= take;
          remaining -= take;
          if (cell.count <= 0) this.setInventorySlot(i, null);
        }
      } catch (e) {
        console.error(`[Protagonist] 物品「${item.name}」移除失败：` + (e instanceof Error ? e.message : String(e)));
      }
    }

    Protagonist.notifyChanged();
  }
  // ===================================================================

  /**
   * 导出为纯数据对象（`ProtagonistPlayInfo`），供 JSON 序列化等。
   *
   * @returns 与 `playInfo` 规范一致的纯数据快照。
   */
  toData(): ProtagonistPlayInfo {
    const base = this.toCommonData();
    return {
      ...base,
      role: "protagonist",
      narrationPerson: this.narrationPerson,
      race: this.race,
      faction: this.faction,
      birthPlace: this.birthPlace,
      originStory: this.originStory,
      traits: this.traits,
      xiuwei: this.xiuwei,
      realmComplete: this.realmComplete,
      breakthroughStatus: this.breakthroughStatus,
      avatarCandidates: [...this.avatarCandidates],
      craftSkills: { ...this.craftSkills },
      timedBuffs: this.timedBuffs.map((b) => ({ ...b, statPercents: { ...b.statPercents } })),
    };
  }

  /**
   * 将当前主角序列化为 JSON 字符串。
   *
   * @param pretty 为 `true` 时使用 2 空格缩进；默认不格式化。
   * @returns JSON 字符串。
   */
  toJsonString(pretty?: boolean): string {
    return pretty ? JSON.stringify(this.toData(), null, 2) : JSON.stringify(this.toData());
  }

  /**
   * 返回当前主角状态的深拷贝快照；对快照的修改不影响原实例。
   *
   * @returns 克隆后的 `Protagonist` 实例。
   */
  getSnapshot(): Protagonist {
    return Protagonist.fromData(this.toData());
  }

  // ===================================================================
  // 静态工厂方法
  // ===================================================================

  /**
   * 从纯数据对象构造 `Protagonist` 实例。
   *
   * @param data 符合 `playInfo` 规范的对象。
   * @returns 新实例。
   */
  static fromData(data: ProtagonistPlayInfo): Protagonist {
    return new Protagonist(data);
  }

  /**
   * 从 JSON 字符串或已解析对象规范化构造 `Protagonist`；解析失败或 `role` 非 `"protagonist"` 时返回 `null`。
   *
   * @param input JSON 字符串或已解析对象。
   * @returns 规范化的 `Protagonist` 实例；失败时为 `null`。
   */
  static fromJson(input: string | unknown): Protagonist | null {
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

    const psRaw = o.primaryStats;
    const base = Protagonist.emptyPrimaryStats();
    if (psRaw && typeof psRaw === "object") {
      const pso = psRaw as Record<string, number>;
      for (const k of PRIMARY_STAT_KEYS) {
        const v = pso[k];
        if (typeof v === "number" && Number.isFinite(v)) base[k] = v;
      }
    }

    const maxHp = typeof o.maxHp === "number" && Number.isFinite(o.maxHp) ? Math.max(1, Math.floor(o.maxHp)) : 100;
    const maxMp = typeof o.maxMp === "number" && Number.isFinite(o.maxMp) ? Math.max(1, Math.floor(o.maxMp)) : 50;
    const currentHp = typeof o.currentHp === "number" && Number.isFinite(o.currentHp) ? Math.max(0, Math.round(o.currentHp)) : maxHp;
    const currentMp = typeof o.currentMp === "number" && Number.isFinite(o.currentMp) ? Math.max(0, Math.round(o.currentMp)) : maxMp;

    const eq = o.equippedSlots;
    let equippedSlots: EquippedSlotsState = Array.from({ length: EQUIP_SLOT_COUNT }, () => null);
    if (Array.isArray(eq)) {
      for (let i = 0; i < EQUIP_SLOT_COUNT; i++) {
        const raw = eq[i];
        if (raw && typeof raw === "object" && "function" in (raw as any)) {
          (raw as any).function = migrateSpecialEffect((raw as any).function);
        }
        equippedSlots[i] = isTreasureItem(raw) ? raw as TreasureItemDefinition : null;
      }
    } else if (eq && typeof eq === "object") {
      const e = eq as Record<string, unknown>;
      const legacy: unknown[] = [
        e.weapon,
        e.faqi,
        e.armor,
      ];
      for (let i = 0; i < Math.min(legacy.length, EQUIP_SLOT_COUNT); i++) {
        const raw = legacy[i];
        if (raw && typeof raw === "object" && "function" in (raw as any)) {
          (raw as any).function = migrateSpecialEffect((raw as any).function);
        }
        equippedSlots[i] = isTreasureItem(raw) ? raw as TreasureItemDefinition : null;
      }
    }

    const npRaw = o.narrationPerson;
    const narrationPerson: NarrationPerson =
      npRaw === "first" || npRaw === "second" || npRaw === "third" ? npRaw : "second";

    return new Protagonist({
      role: "protagonist",
      id: typeof o.id === "string" && o.id.trim() !== "" ? o.id.trim() : "protagonist",
      displayName: typeof o.displayName === "string" ? o.displayName : "未命名",
      narrationPerson,
      race: typeof o.race === "string" ? o.race : "",
      faction: typeof o.faction === "string" ? o.faction : "",
      birthPlace: typeof o.birthPlace === "string"
        ? (parseWorldLocationFromDash(o.birthPlace) ?? { region: "", country: "", area: "", detail: o.birthPlace })
        : (o.birthPlace && typeof o.birthPlace === "object" ? o.birthPlace as WorldLocation : { region: "", country: "", area: "", detail: "" }),
      originStory: typeof o.originStory === "string" ? o.originStory : "",
      realm: { major, minor },
      primaryStats: { ...base },
      maxHp,
      maxMp,
      currentHp: Math.min(currentHp, maxHp),
      currentMp: Math.min(currentMp, maxMp),
      avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : "",
      gender: typeof o.gender === "string" ? o.gender : "",
      linggen: Array.isArray(o.linggen) ? o.linggen.map((x) => String(x)) : [],
      age: typeof o.age === "number" && Number.isFinite(o.age) ? Math.max(0, Math.floor(o.age)) : 16,
      ageConfirmed: typeof o.ageConfirmed === "boolean" ? o.ageConfirmed : false,
      shouyuan: typeof o.shouyuan === "number" && Number.isFinite(o.shouyuan) ? Math.max(0, Math.floor(o.shouyuan)) : 100,
      inventorySlots: Protagonist.normalizeInventorySlots(o.inventorySlots),
      gongfaSlots: Protagonist.normalizeGongfaSlots(o.gongfaSlots),
      equippedSlots,
      traits: Array.isArray(o.traits) ? (o.traits as TraitEntry[]) : [],
      xiuwei: typeof o.xiuwei === "number" && Number.isFinite(o.xiuwei) ? Math.max(0, o.xiuwei) : 0,
      realmComplete: o.realmComplete === true,
      breakthroughStatus: Protagonist.normalizeBreakthroughStatus(o.breakthroughStatus, o.realmComplete === true),
      elixirBonuses: normalizeElixirBonuses(o.elixirBonuses),
    });
  }

  /**
   * 根据命运抉择结果构造主角实例：境界、属性、年龄、寿元均从查表推导；槽位初始为空。
   * HP/MP 上限会再调用 `computeMaxHpMp` 对齐境界 + 主属性推导值。
   *
   * @param fc 命运抉择结果。
   * @returns 新 `Protagonist` 实例。
   */
  static fromFateChoice(fc: FateChoiceResult): Protagonist {
    const { basics } = fc;
    const major = basics.realmMajor.trim() || "练气";
    const minor = (basics.realmMinor != null && String(basics.realmMinor).trim() !== ""
      ? String(basics.realmMinor).trim()
      : "初期") as string;

    const pb = getRealmPrimaryStats(major, minor) ?? getRealmPrimaryStats("练气", "初期") ?? Character.emptyPrimaryStats();
    const sy = getShouyuanForRealm(major, minor) ?? getShouyuanForRealm("练气", "初期") ?? 100;

    // 命运抉择中用点数购买的主属性。走 `elixirBonuses` 与天赋的 statBonus 同一条通道：
    // `collectPrimaryBonuses` 的基准值恒取自境界表，写 `primaryStats` 不会生效。
    const purchasedStats: Record<string, number> = {};
    for (const key of PRIMARY_STAT_KEYS) {
      const bought = basics.statPurchase?.[key];
      if (typeof bought === "number" && Number.isFinite(bought) && bought > 0) {
        purchasedStats[key] = Math.floor(bought);
      }
    }

    const realmRow = (() => {
      for (const row of TABLE) {
        if (row.realm === major && row.stage === minor) return row;
      }
      return TABLE[0];
    })();
    const maxHp = Math.max(1, Math.round((realmRow.hp + pb.physique * 10) * (1 + pb.physique / 1000)));
    const maxMp = Math.max(1, Math.round((realmRow.mp + pb.spirit * 10) * (1 + pb.spirit / 1000)));

    // 玩家在命运抉择里自填了年龄就以其为准（并锁定，开局管线不再覆盖）；否则按境界推导。
    const chosenAge =
      typeof basics.age === "number" && Number.isFinite(basics.age) && basics.age > 0
        ? Math.floor(basics.age)
        : null;
    const age =
      chosenAge ??
      getProtagonistNarrativeAge(
        { realm: { major }, age: undefined },
        { realm: { major } },
        { defaultAge: 16 },
      );

    const traits = fc.traits.map((t) => ({
      name: t.name,
      desc: t.desc,
      rarity: t.rarity,
      effect: t.effect,
    }));

    const p = new Protagonist({
      role: "protagonist",
      id: "protagonist",
      displayName: basics.playerName.trim() || "未命名",
      narrationPerson: basics.narrationPerson,
      race: basics.race,
      faction: basics.faction,
      birthPlace: basics.birthPlace,
      originStory: basics.originStory.trim(),
      realm: { major, minor },
      primaryStats: { ...pb },
      maxHp,
      maxMp,
      currentHp: maxHp,
      currentMp: maxMp,
      avatarUrl: "",
      gender: basics.gender,
      linggen: basics.linggen.slice(),
      age,
      ageConfirmed: chosenAge != null,
      shouyuan: sy,
      inventorySlots: Array.from({ length: DEFAULT_INVENTORY_SLOT_COUNT }, () => null),
      gongfaSlots: [null, null, null, null, null, null, null, null],
      equippedSlots: Array.from({ length: EQUIP_SLOT_COUNT }, () => null),
      traits,
      xiuwei: 0,
      realmComplete: false,
      breakthroughStatus: "idle",
    });

    // 天赋效果（物品/灵石/属性）不在此处结算——推迟到 applyInitState 之后由
    // applyTraitEffects() 统一生成，避免异步开局状态生成期间玩家操作天赋物品后被覆盖。
    // 购点属性不涉及物品，无此顾虑，直接落盘。
    for (const [k, v] of Object.entries(purchasedStats)) {
      p.elixirBonuses[k] = (p.elixirBonuses[k] ?? 0) + v;
    }

    const { maxHp: capH, maxMp: capM } = p.computeMaxHpMp();
    p.maxHp = capH;
    p.maxMp = capM;
    p.currentHp = capH;
    p.currentMp = capM;

    return p;
  }

  // ===================================================================
  // 静态工具方法
  // ===================================================================

  private static normalizeBreakthroughStatus(raw: unknown, realmComplete: boolean): BreakthroughStatus {
    if (raw === "in_quest") return "in_quest";
    if (raw === "ready") return "ready";
    if (raw === "idle") return "idle";
    return realmComplete ? "ready" : "idle";
  }

  /**
   * 将存档中的功法栏数组规范为固定长度、逐项可为 `null`。
   *
   * @param raw 从 JSON 读入的未知值。
   * @returns 长度等于 `GONGFA_SLOT_COUNT` 的功法栏数组。
   */
  private static normalizeGongfaSlots(raw: unknown): GongfaSlotsState {
    const base: GongfaSlotsState = [null, null, null, null, null, null, null, null];
    if (!Array.isArray(raw)) return base;
    for (let i = 0; i < GONGFA_SLOT_COUNT; i++) {
      const item = raw[i] ?? null;
      if (item && typeof item === "object" && "function" in (item as any)) {
        const o = item as any;
        o.function = migrateSpecialEffect(o.function);
      }
      if (item && typeof item === "object" && (item as any).itemType === "功法" && typeof (item as any).mastery !== "number") {
        (item as any).mastery = 1;
      }
      base[i] = item as GongfaItemDefinition | null;
    }
    return base;
  }

  /**
   * 将存档中的储物袋数组规范为 `InventoryStackItem | null` 列表。
   *
   * @param raw 从 JSON 读入的未知值。
   * @returns 规范化的储物格数组；非法输入时返回空数组。
   */
  private static normalizeInventorySlots(raw: unknown): Array<InventoryStackItem | null> {
    if (!Array.isArray(raw)) {
      return Array.from({ length: DEFAULT_INVENTORY_SLOT_COUNT }, () => null);
    }
    const result = raw.map((x) => {
      if (x == null) return null;
      const item = x as any;
      if (item && typeof item === "object" && "function" in item) {
        item.function = migrateSpecialEffect(item.function);
      }
      if (item && typeof item === "object" && item.itemType === "功法" && typeof item.mastery !== "number") {
        item.mastery = 1;
      }
      return item as InventoryStackItem;
    });
    const carrier = { inventorySlots: result };
    compactInventorySlotsInPlace(carrier);
    return carrier.inventorySlots;
  }

  // ===================================================================
  // 全局单例操作
  // ===================================================================

  /**
   * 将当前实例设为全局单例；UI 通过 `Protagonist.current` / `protagonist` ref 订阅。
   */
  setAsCurrent(): void {
    Protagonist.current.value = this;
  }

  /**
   * 从 JSON 字符串或对象解析并设为全局单例。
   *
   * @param input 与 `fromJson` 相同的输入参数。
   * @returns 解析成功且已设置为 `true`；失败为 `false`。
   */
  static loadFromJson(input: string | unknown): boolean {
    const p = Protagonist.fromJson(input);
    if (!p) return false;
    p.setAsCurrent();
    return true;
  }

  /**
   * 根据命运抉择结果创建主角并设为全局单例。
   *
   * @param fc 命运抉择结果。
   */
  static loadFromFateChoice(fc: FateChoiceResult): void {
    const p = Protagonist.fromFateChoice(fc);
    p.setAsCurrent();
  }

  /**
   * 清空全局单例，将 `Protagonist.current` 置为 `null`。
   */
  static clear(): void {
    Protagonist.current.value = null;
  }
}

/** 当前主角全局单例（Vue ref）。等同于 `Protagonist.current`。 */
export const protagonist: Ref<Protagonist | null> = Protagonist.current;
