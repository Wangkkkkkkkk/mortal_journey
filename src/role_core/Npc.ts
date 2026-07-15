import { Character, normalizeElixirBonuses } from "./Character";
import type {
  NpcPlayInfo,
  PowerTier,
  NpcRace,
  TraitEntry,
  EquippedSlotsState,
  GongfaSlotsState,
  NpcPresence,
} from "./types/playInfo";
import {
  EQUIP_SLOT_COUNT,
  GONGFA_SLOT_COUNT,
} from "./types/playInfo";
import { DEFAULT_INVENTORY_SLOT_COUNT, compactInventorySlotsInPlace } from "./CharacterInventory";
import { getRealmPrimaryStats, getShouyuanForRealm, applyNpcGongfaMasteryByRealm } from "./realmUtils";
import type { InventoryStackItem, TreasureItemDefinition, GongfaItemDefinition } from "./types/itemInfo";
import type { NpcNearbyEntry } from "../ai_core";
import { parseEquipObject, parseGongfaObject, parseStorageObject } from "../ai_core/shared/parseItems";
import { resolveNpcId } from "./npcId";
import type { WorldLocation } from "./types/worldLocation";
import type { WorldTime } from "./worldTime";
import { createDefaultWorldTime, cloneWorldTime, ensureWorldTime } from "./worldTime";
import { gameLog } from "../log/gameLog";

const VALID_POWER_TIERS = new Set<string>(["小怪", "精英怪", "小boss", "大boss", "普通NPC"]);

function parsePowerTier(raw: unknown): PowerTier {
  if (typeof raw === "string" && VALID_POWER_TIERS.has(raw)) return raw as PowerTier;
  return "普通NPC";
}

const VALID_RACES = new Set<string>(["修仙者", "人形妖兽", "妖兽"]);

function parseRace(raw: unknown): NpcRace {
  if (typeof raw === "string" && VALID_RACES.has(raw)) return raw as NpcRace;
  return "修仙者";
}

const NPC_SNAPSHOT_SEP = "；";
const NPC_SNAPSHOT_MAX_LEN = 200;

/**
 * 追加一句近况到 NPC 快照；超限时保留尾部（最近优先），保证有界。
 * 纯字符串工具，供状态更新/应用层使用。
 */
export function appendNpcSnapshot(prev: string, addition: string): string {
  const a = (prev ?? "").trim();
  const b = (addition ?? "").trim();
  if (!b) return a;
  const merged = a ? `${a}${NPC_SNAPSHOT_SEP}${b}` : b;
  if (merged.length <= NPC_SNAPSHOT_MAX_LEN) return merged;
  return merged.slice(merged.length - NPC_SNAPSHOT_MAX_LEN);
}

export class Npc extends Character {

  readonly role = "npc" as const;
  identity: string;
  favorability: number;
  isDead: boolean;
  powerTier: PowerTier;
  /** 种族：决定外貌/服装的文生图要素清单。 */
  race: NpcRace;
  /** 外貌特征（自由文本，按种族含发型/脸型/身材/毛色/兽角等要素），用于文生图。 */
  appearance: string;
  /** 服装特征（自由文本；兽形"妖兽"可为空），用于文生图。 */
  clothing: string;
  traits: TraitEntry[];
  xiuwei: number;
  /** 当前所在地点（权威位置字段，由状态 AI 维护）。 */
  currentLocation: WorldLocation | null;
  /** 在场状态机：active/dormant/departed/dead。 */
  presence: NpcPresence;
  /** 上次被主角见到的世界时间。 */
  lastSeenWorldTime: WorldTime;
  /** 累计相遇次数。 */
  encounterCount: number;
  /** 立绘候选池（dataURL）：所有生成过的立绘，玩家可在弹窗中切换/删除。 */
  avatarCandidates: string[];
  /** 剧情近况快照（追加+限长）：跨轮 NPC 记忆，供状态/剧情 AI 延续上下文。 */
  storySnapshot: string;

  constructor(data: NpcPlayInfo) {
    super(data);
    this.identity = data.identity;
    this.favorability = data.favorability;
    this.isDead = data.isDead;
    this.powerTier = data.powerTier;
    this.race = data.race;
    this.appearance = data.appearance;
    this.clothing = data.clothing;
    this.traits = data.traits;
    this.xiuwei = data.xiuwei;
    this.currentLocation = data.currentLocation ?? null;
    this.presence = data.presence ?? (data.isDead ? "dead" : "dormant");
    this.lastSeenWorldTime = data.lastSeenWorldTime
      ? cloneWorldTime(data.lastSeenWorldTime)
      : createDefaultWorldTime();
    this.encounterCount = typeof data.encounterCount === "number" ? data.encounterCount : 0;
    const rawCandidates = Array.isArray(data.avatarCandidates)
      ? data.avatarCandidates.filter((u): u is string => typeof u === "string")
      : [];
    // 去重（保留首次出现、保持顺序），清理旧存档中可能存在的重复立绘。
    this.avatarCandidates = rawCandidates.filter((u, i) => rawCandidates.indexOf(u) === i);
    // 旧存档迁移：已有立绘但无候选池时，把现有立绘作为唯一候选保留。
    if (this.avatarUrl && this.avatarCandidates.length === 0) {
      this.avatarCandidates = [this.avatarUrl];
    }
    this.storySnapshot = typeof data.storySnapshot === "string" ? data.storySnapshot : "";
  }

  static fromAiData(
    entry: NpcNearbyEntry,
    protagonistLinggen?: string[],
    currentLocation?: WorldLocation | null,
    currentWorldTime?: WorldTime | null,
  ): Npc {
    const realmMajor = entry.realm?.major ?? "练气";
    const realmMinor = entry.realm?.minor ?? "初期";

    const equippedSlots: EquippedSlotsState = Array.from({ length: EQUIP_SLOT_COUNT }, () => null);
    if (Array.isArray(entry.equippedSlots)) {
      for (const raw of entry.equippedSlots) {
        if (!raw || typeof raw !== "object") continue;
        const emptyIdx = equippedSlots.findIndex(s => s === null);
        if (emptyIdx < 0) break;
        equippedSlots[emptyIdx] = parseEquipObject(raw, realmMajor, realmMinor);
      }
    }

    const gongfaSlots: GongfaSlotsState = [null, null, null, null, null, null, null, null];
    if (Array.isArray(entry.gongfaSlots)) {
      for (const raw of entry.gongfaSlots) {
        if (!raw || typeof raw !== "object") continue;
        const emptyIdx = gongfaSlots.findIndex(s => s === null);
        if (emptyIdx < 0) break;
        gongfaSlots[emptyIdx] = parseGongfaObject(raw, realmMajor, realmMinor, protagonistLinggen);
      }
    }
    // NPC 功法层数按境界修为总量均分推算，使其与境界匹配（而非一律 1 层）。
    applyNpcGongfaMasteryByRealm(gongfaSlots, realmMajor, realmMinor);

    const inventoryItems: InventoryStackItem[] = [];
    if (Array.isArray(entry.inventorySlots)) {
      for (const raw of entry.inventorySlots) {
        if (!raw || typeof raw !== "object") continue;
        const item = parseStorageObject(raw, realmMajor, realmMinor, protagonistLinggen);
        if (item) inventoryItems.push(item);
      }
    }
    const inventorySlots: Array<InventoryStackItem | null> = [
      ...inventoryItems,
      ...Array.from({ length: Math.max(0, DEFAULT_INVENTORY_SLOT_COUNT - inventoryItems.length) }, () => null),
    ];

    const baseStats = getRealmPrimaryStats(realmMajor, realmMinor) ?? Character.emptyPrimaryStats();
    const shouyuan = getShouyuanForRealm(realmMajor, realmMinor) ?? 100;

    const npcId = resolveNpcId(entry.npcId, entry.displayName, entry.identity ?? "", currentLocation);

    const npcData: NpcPlayInfo = {
      role: "npc",
      id: npcId,
      displayName: entry.displayName,
      realm: { major: realmMajor, minor: realmMinor },
      primaryStats: baseStats,
      maxHp: 100,
      maxMp: 50,
      currentHp: 100,
      currentMp: 50,
      avatarUrl: "",
      gender: entry.gender ?? "男",
      linggen: entry.linggen ?? [],
      age: entry.age ?? 0,
      ageConfirmed: true,
      shouyuan,
      inventorySlots,
      gongfaSlots,
      equippedSlots,
      identity: entry.identity ?? "",
      favorability: entry.favorability ?? 0,
      isDead: entry.isDead ?? false,
      powerTier: parsePowerTier(entry.powerTier),
      race: parseRace(entry.race),
      appearance: entry.appearance ?? "",
      clothing: entry.clothing ?? "",
      traits: [],
      xiuwei: 0,
      currentLocation: entry.currentLocation ? { ...entry.currentLocation } : (currentLocation ? { ...currentLocation } : null),
      presence: "active",
      lastSeenWorldTime: currentWorldTime ? cloneWorldTime(currentWorldTime) : createDefaultWorldTime(),
      encounterCount: 1,
    };

    const npc = new Npc(npcData);
    compactInventorySlotsInPlace(npc);

    const { maxHp: capH, maxMp: capM } = npc.computeMaxHpMp();
    npc.maxHp = capH;
    npc.maxMp = capM;
    const hpPct = typeof entry.hpPercent === "number" && entry.hpPercent >= 0 && entry.hpPercent <= 100 ? entry.hpPercent : 100;
    const mpPct = typeof entry.mpPercent === "number" && entry.mpPercent >= 0 && entry.mpPercent <= 100 ? entry.mpPercent : 100;
    npc.currentHp = Math.max(0, Math.min(capH, Math.round(capH * hpPct / 100)));
    npc.currentMp = Math.max(0, Math.min(capM, Math.round(capM * mpPct / 100)));

    return npc;
  }

  /**
   * 合并 AI 返回的 nearbyNpcs 条目到已有 NPC。
   *
   * 【白名单策略 · 严格事件驱动】
   * - dynamic 层（identity/favorability/hp/mp/isDead）：
   *   AI 可自由更新，非空即覆盖。
   * - 核心层（realm/equippedSlots/gongfaSlots/inventorySlots/race/appearance/clothing）：
   *   **默认完全忽略**，即便 AI 返回了也不动。核心层变化必须走显式的
   *   `<MJ_NPC_CORE_CHANGE_TAG>` 事件通道（由 npcStore.applyNpcUpdates 统一应用），
   *   以此杜绝「数据漂移」。
   *   race/appearance/clothing 属核心层（文生图一致性要求长相稳定）。检测到 AI 违规
   *   返回核心字段时会告警，便于定位 prompt 问题。
   * - 不重算 maxHp/maxMp：核心层未变 ⇒ 主属性未变 ⇒ 上限稳定。
   */
  mergeFromAi(entry: NpcNearbyEntry, _protagonistLinggen?: string[]): void {
    if (this.isDead) return;

    if (entry.identity) this.identity = entry.identity;
    if (typeof entry.favorability === "number") this.favorability = Math.max(-99, Math.min(99, entry.favorability));
    if (entry.isDead === true) {
      this.isDead = true;
      this.currentHp = 0;
      return;
    }
    // 位置字段：每次合并更新（信任 AI 的 currentLocation 输出；未给则保留旧值）。
    if (entry.currentLocation) this.currentLocation = { ...entry.currentLocation };
    if (typeof entry.hpPercent === "number") {
      this.currentHp = Math.max(0, Math.min(this.maxHp, Math.round(this.maxHp * entry.hpPercent / 100)));
    }
    if (typeof entry.mpPercent === "number") {
      this.currentMp = Math.max(0, Math.min(this.maxMp, Math.round(this.maxMp * entry.mpPercent / 100)));
    }

    // 核心层：默认忽略。AI 若返回了核心字段，告警提示其改用 <MJ_NPC_CORE_CHANGE_TAG>。
    const realmChanged = entry.realm && (entry.realm.major || entry.realm.minor)
      && (entry.realm.major !== this.realm.major || entry.realm.minor !== this.realm.minor);
    if (realmChanged) {
      gameLog.warn(
        `[Npc.mergeFromAi] 忽略 ${this.displayName} 的境界变更（${this.realm.major}${this.realm.minor}→${entry.realm?.major}${entry.realm.minor}）。突破须走 <MJ_NPC_CORE_CHANGE_TAG> 事件。`,
      );
    }
    if (entry.race && entry.race !== this.race) {
      gameLog.warn(`[Npc.mergeFromAi] 忽略 ${this.displayName} 的 race 变更（须走核心变更事件）。`);
    }
    if (entry.appearance) {
      gameLog.warn(`[Npc.mergeFromAi] 忽略 ${this.displayName} 的 appearance 变更（须走核心变更事件）。`);
    }
    if (entry.clothing) {
      gameLog.warn(`[Npc.mergeFromAi] 忽略 ${this.displayName} 的 clothing 变更（须走核心变更事件）。`);
    }
    if (Array.isArray(entry.equippedSlots) && entry.equippedSlots.length > 0) {
      gameLog.warn(`[Npc.mergeFromAi] 忽略 ${this.displayName} 的 equippedSlots 变更（须走核心变更事件）。`);
    }
    if (Array.isArray(entry.gongfaSlots) && entry.gongfaSlots.length > 0) {
      gameLog.warn(`[Npc.mergeFromAi] 忽略 ${this.displayName} 的 gongfaSlots 变更（须走核心变更事件）。`);
    }
    if (Array.isArray(entry.inventorySlots) && entry.inventorySlots.length > 0) {
      gameLog.warn(`[Npc.mergeFromAi] 忽略 ${this.displayName} 的 inventorySlots 变更（须走核心变更事件）。`);
    }
  }

  /** 追加一张新立绘到候选池，并自动选为当前立绘。 */
  addPortraitCandidate(url: string): void {
    const u = url != null ? String(url) : "";
    if (!u) return;
    // 立绘去重：若候选池已有相同立绘，仅切换为当前立绘，不重复追加。
    if (this.avatarCandidates.includes(u)) {
      this.avatarUrl = u;
      return;
    }
    // 用「重新赋值」而非 push：属性级 set 必然触发响应式（与 avatarUrl 同款），
    // 避免嵌套数组就地变更在某些响应式链路下不触发重渲染。
    this.avatarCandidates = [...(Array.isArray(this.avatarCandidates) ? this.avatarCandidates : []), u];
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

  /** 追加一句本轮近况到 storySnapshot（自动限长保尾部）。 */
  appendStorySnapshot(addition: string): void {
    this.storySnapshot = appendNpcSnapshot(this.storySnapshot, addition);
  }

  toData(): NpcPlayInfo {
    const base = this.toCommonData();
    return {
      ...base,
      role: "npc",
      identity: this.identity,
      favorability: this.favorability,
      isDead: this.isDead,
      powerTier: this.powerTier,
      race: this.race,
      appearance: this.appearance,
      clothing: this.clothing,
      traits: this.traits,
      xiuwei: this.xiuwei,
      currentLocation: this.currentLocation ? { ...this.currentLocation } : null,
      presence: this.presence,
      lastSeenWorldTime: cloneWorldTime(this.lastSeenWorldTime),
      encounterCount: this.encounterCount,
      avatarCandidates: [...this.avatarCandidates],
      storySnapshot: this.storySnapshot,
    };
  }

  static fromData(data: NpcPlayInfo): Npc {
    return new Npc(data);
  }

  private static normalizeGongfaSlots(raw: unknown): GongfaSlotsState {
    const base: GongfaSlotsState = [null, null, null, null, null, null, null, null];
    if (!Array.isArray(raw)) return base;
    for (let i = 0; i < GONGFA_SLOT_COUNT; i++) {
      const item = (raw[i] ?? null) as GongfaItemDefinition | null;
      base[i] = item;
    }
    return base;
  }

  private static normalizeEquippedSlots(raw: unknown): EquippedSlotsState {
    const slots: EquippedSlotsState = Array.from({ length: EQUIP_SLOT_COUNT }, () => null);
    if (!Array.isArray(raw)) return slots;
    for (let i = 0; i < EQUIP_SLOT_COUNT; i++) {
      const item = raw[i];
      if (item && typeof item === "object" && (item as Record<string, unknown>).itemType === "法宝") {
        slots[i] = item as TreasureItemDefinition;
      }
    }
    return slots;
  }

  static fromJson(input: string | unknown): Npc | null {
    let data: unknown = input;
    if (typeof input === "string") {
      try { data = JSON.parse(input); } catch { return null; }
    }
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (o.role !== "npc") return null;

    const realmRaw = o.realm;
    const major = realmRaw && typeof realmRaw === "object" && typeof (realmRaw as Record<string, unknown>).major === "string"
      ? String((realmRaw as Record<string, unknown>).major).trim() || "练气" : "练气";
    const minor = realmRaw && typeof realmRaw === "object" && typeof (realmRaw as Record<string, unknown>).minor === "string"
      ? String((realmRaw as Record<string, unknown>).minor).trim() || "初期" : "初期";

    const baseStats = getRealmPrimaryStats(major, minor) ?? Character.emptyPrimaryStats();
    const shouyuan = getShouyuanForRealm(major, minor) ?? 100;

    const npcData: NpcPlayInfo = {
      role: "npc",
      id: typeof o.id === "string" ? o.id : `npc_${o.displayName ?? "unknown"}`,
      displayName: typeof o.displayName === "string" ? o.displayName : "未知NPC",
      realm: { major, minor },
      primaryStats: baseStats,
      maxHp: typeof o.maxHp === "number" ? o.maxHp : 100,
      maxMp: typeof o.maxMp === "number" ? o.maxMp : 50,
      currentHp: typeof o.currentHp === "number" ? o.currentHp : 100,
      currentMp: typeof o.currentMp === "number" ? o.currentMp : 50,
      avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : "",
      gender: typeof o.gender === "string" ? o.gender : "男",
      linggen: Array.isArray(o.linggen) ? o.linggen.map((x: unknown) => String(x)) : [],
      age: typeof o.age === "number" ? o.age : 0,
      ageConfirmed: typeof o.ageConfirmed === "boolean" ? o.ageConfirmed : true,
      shouyuan: typeof o.shouyuan === "number" ? o.shouyuan : shouyuan,
      inventorySlots: Array.isArray(o.inventorySlots) ? o.inventorySlots : Array.from({ length: DEFAULT_INVENTORY_SLOT_COUNT }, () => null),
      gongfaSlots: Npc.normalizeGongfaSlots(o.gongfaSlots),
      equippedSlots: Npc.normalizeEquippedSlots(o.equippedSlots),
      identity: typeof o.identity === "string" ? o.identity : "",
      favorability: typeof o.favorability === "number" ? o.favorability : 0,
      isDead: o.isDead === true,
      powerTier: parsePowerTier(o.powerTier),
      race: parseRace(o.race),
      appearance: typeof o.appearance === "string" ? o.appearance : "",
      clothing: typeof o.clothing === "string" ? o.clothing : "",
      traits: Array.isArray(o.traits) ? o.traits : [],
      xiuwei: typeof o.xiuwei === "number" ? o.xiuwei : 0,
      currentLocation: o.currentLocation && typeof o.currentLocation === "object"
        ? { ...(o.currentLocation as WorldLocation) }
        : null,
      presence: typeof o.presence === "string"
        ? (o.presence as NpcPresence)
        : (o.isDead === true ? "dead" : "dormant"),
      lastSeenWorldTime: o.lastSeenWorldTime && typeof o.lastSeenWorldTime === "object"
        ? ensureWorldTime(o.lastSeenWorldTime as WorldTime)
        : createDefaultWorldTime(),
      encounterCount: typeof o.encounterCount === "number" ? o.encounterCount : 0,
      avatarCandidates: Array.isArray(o.avatarCandidates)
        ? o.avatarCandidates.filter((u: unknown): u is string => typeof u === "string")
        : [],
      storySnapshot: typeof o.storySnapshot === "string" ? o.storySnapshot : "",
      elixirBonuses: normalizeElixirBonuses(o.elixirBonuses),
    };

    return new Npc(npcData);
  }
}
