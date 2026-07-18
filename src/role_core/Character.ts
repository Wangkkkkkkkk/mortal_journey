import type { InventoryStackItem } from "./types/items";
import type {
  CultivationRealm,
  EquippedSlotsState,
  GongfaSlotsState,
  EquipSlotKey,
  ProtagonistDetailAction,
  PrimaryStatKey,
  CharacterPlayInfoCommon,
} from "./types/playInfo";
import {
  PRIMARY_STAT_KEYS,
  PRIMARY_STAT_KEY_TO_ZH,
  EQUIP_SLOT_COUNT,
  GONGFA_SLOT_COUNT,
  TABLE,
  GONGFA_MASTERY_ATTRI_MULT,
} from "./types/playInfo";
import {
  getRealmPrimaryStats,
} from "./realmUtils";
import type { SpiritStoneName } from "./types/spiritStone";
import {
  DEFAULT_INVENTORY_SLOT_COUNT,
  INVENTORY_SLOT_EXPAND_STEP,
  setInventorySlot as invSetSlot,
  addToInventory as invAdd,
  addSpiritStone as invAddStone,
  removeSpiritStone as invRemoveStone,
} from "./CharacterInventory";
import {
  isTreasureItem,
  setGongfaSlot as eqSetGongfa,
  unequipGongfaToInventory as eqUnequipGf,
  equipGongfaFromInventory as eqEquipGf,
  setEquippedSlot as eqSetEquip,
  equipFromInventory as eqEquip,
  unequipToInventory as eqUnequip,
  applyDetailAction as eqApply,
} from "./CharacterEquip";
import { applyLinggenElixirBoost } from "./types/items";
import { applyStatConversions, applyResourceConversions } from "./types/effects";
import type { Effect } from "./types/effects";

const HP_PER_PHYSIQUE = 10;
const MP_PER_SPIRIT = 10;

/**
 * 规范化丹药/天赋加成映射：仅保留有限且非零的数值项。
 *
 * 用于反序列化（`Protagonist.fromJson` / `Npc.fromJson`）时恢复 `elixirBonuses`，
 * 避免存档中该字段被丢弃导致属性加成在刷新/读档后消失。
 */
export function normalizeElixirBonuses(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v !== 0) out[k] = v;
  }
  return out;
}

export class Character {

  id: string;
  displayName: string;
  realm: CultivationRealm;
  primaryStats: Record<PrimaryStatKey, number>;
  maxHp: number;
  maxMp: number;
  currentHp: number;
  currentMp: number;
  avatarUrl: string;
  gender: string;
  linggen: string[];
  age: number;
  ageConfirmed: boolean;
  shouyuan: number;
  equippedSlots: EquippedSlotsState;
  gongfaSlots: GongfaSlotsState;
  inventorySlots: Array<InventoryStackItem | null>;
  elixirBonuses: Record<string, number>;

  constructor(data: CharacterPlayInfoCommon) {
    this.id = data.id;
    this.displayName = data.displayName;
    this.realm = data.realm;
    this.primaryStats = { ...data.primaryStats };
    this.maxHp = data.maxHp;
    this.maxMp = data.maxMp;
    this.currentHp = data.currentHp;
    this.currentMp = data.currentMp;
    this.avatarUrl = data.avatarUrl;
    this.gender = data.gender;
    this.linggen = data.linggen;
    this.age = data.age;
    this.ageConfirmed = data.ageConfirmed;
    this.shouyuan = data.shouyuan;
    this.equippedSlots = data.equippedSlots;
    this.gongfaSlots = data.gongfaSlots;
    this.inventorySlots = data.inventorySlots;
    this.elixirBonuses = data.elixirBonuses ? { ...data.elixirBonuses } : {};
  }

  // ===================================================================
  // 静态格式化
  // ===================================================================

  static formatLinggenElements(elements: string[]): string {
    const els = elements.map((e) => String(e).trim()).filter(Boolean);
    return els.length ? els.join("") : "—";
  }

  static formatRealm(realm: CultivationRealm): string {
    const major = realm.major?.trim() || "—";
    const minor = realm.minor?.trim() || "";
    return minor ? `${major}${minor}` : major;
  }

  // ===================================================================
  // 主属性计算
  // ===================================================================

  protected static readonly ZH_BONUS_TO_PRIMARY_KEY: Readonly<Record<string, PrimaryStatKey>> = (() => {
    const o: Record<string, PrimaryStatKey> = {};
    for (const en of Object.keys(PRIMARY_STAT_KEY_TO_ZH) as PrimaryStatKey[]) {
      o[PRIMARY_STAT_KEY_TO_ZH[en]] = en;
    }
    return o;
  })();

  protected realmTableBaseOrStored(): Record<PrimaryStatKey, number> {
    const fromTable = getRealmPrimaryStats(this.realm.major, this.realm.minor);
    return fromTable ? { ...fromTable } : { ...this.primaryStats };
  }

  private static addZhItemBonusInto(
    target: Record<string, number>,
    bonus: Record<string, number | undefined> | undefined,
    realmRatio = 1,
  ): void {
    if (!bonus || typeof bonus !== "object") return;
    const r = typeof realmRatio === "number" && Number.isFinite(realmRatio) && realmRatio > 0 ? realmRatio : 1;
    for (const [zh, v] of Object.entries(bonus)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const key = Character.ZH_BONUS_TO_PRIMARY_KEY[zh];
      if (!key) continue;
      target[key] = (target[key] ?? 0) + Math.trunc(v * r);
    }
  }

  protected collectPrimaryBonuses(): Record<string, number> {
    const base = this.realmTableBaseOrStored();
    const primaryStats: Record<string, number> = {};
    for (const k of PRIMARY_STAT_KEYS) {
      primaryStats[k] = base[k] ?? 0;
    }
    for (const gf of this.gongfaSlots) {
      if (!gf) continue;
      const mastery = gf.mastery ?? 1;
      const masteryMult = GONGFA_MASTERY_ATTRI_MULT[Math.min(mastery, GONGFA_MASTERY_ATTRI_MULT.length) - 1];
      const adjusted: Record<string, number> = {};
      for (const [k, v] of Object.entries(gf.bonus as Record<string, number>)) {
        if (typeof v === "number" && Number.isFinite(v)) {
          adjusted[k] = Math.trunc(v * masteryMult);
        }
      }
      Character.addZhItemBonusInto(primaryStats, adjusted);
    }
    for (const [k, v] of Object.entries(this.elixirBonuses)) {
      if (typeof v === "number" && v !== 0) primaryStats[k] = (primaryStats[k] ?? 0) + v;
    }
    // 法宝特殊效果：主属性转换（仅仙品/神品法宝生效）
    const statConversions = this.collectEquippedConversions().filter(c => c.type === "conversion" && c.target === "stat");
    if (statConversions.length > 0) {
      const converted = applyStatConversions(primaryStats as Record<PrimaryStatKey, number>, statConversions);
      for (const k of PRIMARY_STAT_KEYS) primaryStats[k] = converted[k];
    }
    return primaryStats;
  }

  /**
   * 汇总当前已装备法宝的特殊效果转换项。
   *
   * @returns 所有已装备法宝 effect 中 conversion 效果的扁平列表。
   */
  protected collectEquippedConversions(): Effect[] {
    const out: Effect[] = [];
    for (const tr of this.equippedSlots) {
      if (tr && tr.effect) {
        for (const e of tr.effect.effects) {
          if (e.type === "conversion") out.push(e);
        }
      }
    }
    return out;
  }

  getComputedPrimaryStats(): Readonly<Record<PrimaryStatKey, number>> {
    return this.collectPrimaryBonuses() as Readonly<Record<PrimaryStatKey, number>>;
  }

  getPrimaryStats(): Readonly<Record<PrimaryStatKey, number>> {
    return this.getComputedPrimaryStats();
  }

  computeMaxHpMp(): { maxHp: number; maxMp: number } {
    const stats = this.getComputedPrimaryStats();
    const realmRow = this.getRealmRow();
    const baseHp = realmRow?.hp ?? 200;
    const baseMp = realmRow?.mp ?? 100;
    let maxHp = Math.max(1, Math.round((baseHp + stats.physique * HP_PER_PHYSIQUE) * (1 + stats.physique / 1000)));
    let maxMp = Math.max(1, Math.round((baseMp + stats.spirit * MP_PER_SPIRIT) * (1 + stats.spirit / 1000)));
    // 法宝特殊效果：血量/法力上限转换（仅仙品/神品法宝生效）
    const resConversions = this.collectEquippedConversions().filter(c => c.type === "conversion" && (c.target === "mpToHp" || c.target === "hpToMp"));
    if (resConversions.length > 0) {
      const r = applyResourceConversions(maxHp, maxMp, resConversions);
      maxHp = r.maxHp;
      maxMp = r.maxMp;
    }
    return { maxHp, maxMp };
  }

  protected getRealmRow(): { hp: number; mp: number } | null {
    for (const row of TABLE) {
      if (row.realm === this.realm.major && row.stage === this.realm.minor) {
        return row;
      }
    }
    return null;
  }

  // ===================================================================
  // 生命 / 法力（HP / MP）
  // ===================================================================

  setCurrentHpMp(currentHp: number, currentMp: number): void {
    const maxH = Math.max(1, this.maxHp);
    const maxM = Math.max(1, this.maxMp);
    this.currentHp = Math.max(0, Math.min(maxH, Math.round(currentHp)));
    this.currentMp = Math.max(0, Math.min(maxM, Math.round(currentMp)));
  }

  setMaxHpMp(maxHp: number, maxMp: number): void {
    this.maxHp = Math.max(1, Math.floor(maxHp));
    this.maxMp = Math.max(1, Math.floor(maxMp));
    this.currentHp = Math.min(this.currentHp, this.maxHp);
    this.currentMp = Math.min(this.currentMp, this.maxMp);
  }

  // ===================================================================
  // 境界 · 年龄 · 寿元 · 名称 · 头像 · 属性
  // ===================================================================

  setRealm(major: string, minor: string): void {
    this.realm = {
      major: major.trim() || "练气",
      minor: minor.trim() || "初期",
    };
  }

  setAge(age: number): void {
    this.age = typeof age === "number" && Number.isFinite(age) ? Math.max(0, Math.floor(age)) : this.age;
  }

  setShouyuan(n: number): void {
    this.shouyuan = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : this.shouyuan;
  }

  setDisplayName(name: string): void {
    this.displayName = String(name).trim() || "未命名";
  }

  setAvatarUrl(url: string): void {
    this.avatarUrl = url != null ? String(url) : "";
  }

  patchPrimaryStats(partial: Partial<Record<PrimaryStatKey, number>>): void {
    for (const k of PRIMARY_STAT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(partial, k)) {
        const v = partial[k];
        if (typeof v === "number" && Number.isFinite(v)) this.primaryStats[k] = v;
      }
    }
  }

  // ===================================================================
  // 储物袋（委托给 CharacterInventory）
  // ===================================================================

  setInventorySlot(index: number, item: InventoryStackItem | null): boolean {
    if (item) applyLinggenElixirBoost(item, this.linggen, this.realm.major);
    return invSetSlot(this, index, item);
  }

  addToInventory(item: InventoryStackItem): number {
    applyLinggenElixirBoost(item, this.linggen, this.realm.major);
    return invAdd(this, item);
  }

  // ===================================================================
  // 灵石（委托给 CharacterInventory）
  // ===================================================================

  addSpiritStone(name: SpiritStoneName, count: number): void {
    invAddStone(this, count);
  }

  removeSpiritStone(name: SpiritStoneName, count: number): void {
    invRemoveStone(this, count);
  }

  // ===================================================================
  // 功法（委托给 CharacterEquip）
  // ===================================================================

  setGongfaSlot(index: number, item: import("./types/items").GongfaItemDefinition | null): boolean {
    return eqSetGongfa(this, index, item);
  }

  unequipGongfaToInventory(gongfaSlotIndex: number): boolean {
    return eqUnequipGf(this, gongfaSlotIndex);
  }

  equipGongfaFromInventory(inventoryIndex: number): boolean {
    return eqEquipGf(this, inventoryIndex);
  }

  // ===================================================================
  // 穿戴（委托给 CharacterEquip）
  // ===================================================================

  setEquippedSlot(slot: EquipSlotKey, item: import("./types/items").TreasureItemDefinition | null): boolean {
    return eqSetEquip(this, slot, item);
  }

  equipFromInventory(inventoryIndex: number): boolean {
    return eqEquip(this, inventoryIndex);
  }

  unequipToInventory(slot: EquipSlotKey): boolean {
    return eqUnequip(this, slot);
  }

  // ===================================================================
  // 详情弹窗动作
  // ===================================================================

  applyDetailAction(a: ProtagonistDetailAction): boolean {
    return eqApply(this, a);
  }

  // ===================================================================
  // 序列化
  // ===================================================================

  toCommonData(): CharacterPlayInfoCommon {
    return {
      id: this.id,
      displayName: this.displayName,
      realm: this.realm,
      primaryStats: { ...this.primaryStats },
      maxHp: this.maxHp,
      maxMp: this.maxMp,
      currentHp: this.currentHp,
      currentMp: this.currentMp,
      avatarUrl: this.avatarUrl,
      gender: this.gender,
      linggen: this.linggen,
      age: this.age,
      ageConfirmed: this.ageConfirmed,
      shouyuan: this.shouyuan,
      equippedSlots: this.equippedSlots,
      gongfaSlots: this.gongfaSlots,
      inventorySlots: this.inventorySlots,
      elixirBonuses: this.elixirBonuses,
    };
  }

  // ===================================================================
  // 静态工具方法
  // ===================================================================

  protected static emptyPrimaryStats(): Record<PrimaryStatKey, number> {
    const o: Record<string, number> = {};
    for (const k of PRIMARY_STAT_KEYS) {
      o[k] = 0;
    }
    return o as Record<PrimaryStatKey, number>;
  }
}
