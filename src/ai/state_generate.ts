import { STATE_SYSTEM_PRESET } from "./state_preset";
import { extractTagContent, tryParseJsonArray } from "./parseAiItem";
import {
  completeChatWithMessagesJson,
  type JsonChatRequestPayload,
} from "./openAiChatBridge";
import {
  REALM_ORDER,
  SUB_STAGES,
  type ProtagonistPlayInfo,
  type EquippedSlotsState,
  type GongfaSlotsState,
  type InventoryStackItem,
  type WorldLocation,
  type NpcRace,
} from "../role_core/types/playInfo";
import { type WorldTime, type TimeDelta, formatWorldTimeZhDisplay } from "../role_core/worldTime";
import { describeNextBreakthrough } from "../role_core/realmUtils";
import { formatWorldLocationDash, parseWorldLocationFromDash } from "../role_core/types/worldLocation";
import type { NpcCoreChangeEvent } from "../role_core/npcCoreChange";

export interface StateGenerateInput {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  storyBody: string;
  protagonist: ProtagonistPlayInfo;
  currentWorldLocation?: WorldLocation | null;
  currentWorldTime?: WorldTime;
  npcSnapshot?: string;
}

export interface HpMpState {
  hpPercent: number;
  mpPercent: number;
}

export interface BreakthroughState {
  realmBreakthrough?: boolean;
  breakthroughQuestStart?: boolean;
  breakthroughFailed?: boolean;
}

export interface UserStateChange {
  xiuweiIncrease?: number;
  gongfaMasteryChanges?: Array<{
    gongfaName: string;
    masteryExpIncrease: number;
  }>;
}

export interface SpiritStoneChange {
  op: "add" | "remove";
  count: number;
}

export interface ItemAddEntry {
  type: string;
  name: string;
  intro: string;
  grade: string;
  count: number;
  system?: unknown;
  role?: unknown;
  function?: unknown;
  bonus?: unknown;
  /** 材料分类（药材/毒物/食材/器材）。仅 type==="材料" 时由状态 AI 输出。 */
  category?: unknown;
}

export interface ItemRemoveEntry {
  name: string;
  count: number;
}

export interface NpcNearbyEntry {
  npcId?: string;
  displayName: string;
  identity: string;
  /** 与主角的关系（自由文本，如「同门」「师尊」「道侣」「仇敌」）。 */
  relation?: string;
  isDead: boolean;
  favorability: number;
  race: NpcRace;
  appearance: string;
  clothing: string;
  gender: string;
  age: number;
  linggen: string[];
  realm: { major: string; minor: string };
  hpPercent: number;
  mpPercent: number;
  /** 当前所在地点（状态 AI 显式输出；用于维护 NPC 位置，判定在场/迁移）。 */
  currentLocation?: WorldLocation;
  equippedSlots?: unknown[];
  gongfaSlots?: unknown[];
  inventorySlots?: unknown[];
  [key: string]: unknown;
}

export interface BattleCombatant {
  displayName: string;
  roleHint: string;
}

export interface BattleTriggerEntry {
  shouldEnterBattle: boolean;
  triggerKind: "active" | "passive";
  triggerReason: string;
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
  isTestBattle?: boolean;
}

/** 四个倾向的玩家行动建议（由状态 AI 顺便输出，供快捷选择）。 */
export interface ActionSuggestions {
  aggressive: string;
  moderate: string;
  cautious: string;
  veryCautious: string;
}

export interface StateParsed {
  worldLocation: WorldLocation | null;
  hpMp: HpMpState | null;
  userState: UserStateChange | null;
  timeAdvance: TimeDelta | null;
  breakthrough: BreakthroughState | null;
  spiritStoneChanges: SpiritStoneChange[];
  itemAdds: ItemAddEntry[];
  itemRemoves: ItemRemoveEntry[];
  nearbyNpcs: NpcNearbyEntry[];
  npcCoreChanges: NpcCoreChangeEvent[];
  battleTrigger: BattleTriggerEntry | null;
  storySnapshot: string;
  actionOptions: ActionSuggestions | null;
}

const DEFAULT_TEMPERATURE = 0.55;
const DEFAULT_MAX_TOKENS = 16384;

const MJ_WORLD_BODY_OPEN = "<mj_world_body>";
const MJ_WORLD_BODY_CLOSE = "</mj_world_body>";
const TAG_USER_STATE_OPEN = "<USER_STATE_TAG>";
const TAG_USER_STATE_CLOSE = "</USER_STATE_TAG>";
const TAG_SPIRIT_STONE_OPEN = "<SPIRIT_STONE_TAG>";
const TAG_SPIRIT_STONE_CLOSE = "</SPIRIT_STONE_TAG>";
const TAG_ITEM_ADD_OPEN = "<ITEM_ADD_TAG>";
const TAG_ITEM_ADD_CLOSE = "</ITEM_ADD_TAG>";
const TAG_ITEM_REMOVE_OPEN = "<ITEM_REMOVE_TAG>";
const TAG_ITEM_REMOVE_CLOSE = "</ITEM_REMOVE_TAG>";
const TAG_NPC_NEARBY_OPEN = "<NPC_NEARBY_TAG>";
const TAG_NPC_NEARBY_CLOSE = "</NPC_NEARBY_TAG>";
const TAG_NPC_CORE_CHANGE_OPEN = "<MJ_NPC_CORE_CHANGE_TAG>";
const TAG_NPC_CORE_CHANGE_CLOSE = "</MJ_NPC_CORE_CHANGE_TAG>";
const TAG_BATTLE_TRIGGER_OPEN = "<BATTLE_TRIGGER_TAG>";
const TAG_BATTLE_TRIGGER_CLOSE = "</BATTLE_TRIGGER_TAG>";
const TAG_STORY_SNAPSHOT_OPEN = "<mj_story_snapshot>";
const TAG_STORY_SNAPSHOT_CLOSE = "</mj_story_snapshot>";
const TAG_ACTION_OPTIONS_OPEN = "<MJ_ACTION_OPTIONS_TAG>";
const TAG_ACTION_OPTIONS_CLOSE = "</MJ_ACTION_OPTIONS_TAG>";
const TAG_HP_MP_OPEN = "<MJ_HP_MP_TAG>";
const TAG_HP_MP_CLOSE = "</MJ_HP_MP_TAG>";
const TAG_TIME_OPEN = "<MJ_TIME_TAG>";
const TAG_TIME_CLOSE = "</MJ_TIME_TAG>";
const TAG_BREAKTHROUGH_OPEN = "<MJ_BREAKTHROUGH_TAG>";
const TAG_BREAKTHROUGH_CLOSE = "</MJ_BREAKTHROUGH_TAG>";

function extractWorldBody(raw: string): WorldLocation | null {
  const s = raw == null ? "" : String(raw);
  const i = s.indexOf(MJ_WORLD_BODY_OPEN);
  if (i < 0) return null;
  const from = i + MJ_WORLD_BODY_OPEN.length;
  const j = s.indexOf(MJ_WORLD_BODY_CLOSE, from);
  const text = j < 0 ? s.slice(from).trim() : s.slice(from, j).trim();
  return parseWorldLocationFromDash(text);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const VALID_MAJOR_SET = new Set<string>(REALM_ORDER as readonly string[]);
const VALID_MINOR_SET = new Set<string>(SUB_STAGES as readonly string[]);

const VALID_RACE_SET = new Set<string>(["修仙者", "人形妖兽", "妖兽"]);

function sanitizeRace(raw: unknown): NpcRace {
  if (typeof raw === "string" && VALID_RACE_SET.has(raw)) return raw as NpcRace;
  return "修仙者";
}

function sanitizeRealm(realm: unknown): { major: string; minor: string } {
  if (!realm || typeof realm !== "object") return { major: "练气", minor: "初期" };
  const r = realm as { major?: unknown; minor?: unknown };
  const major = typeof r.major === "string" ? r.major.trim() : "";
  const minor = typeof r.minor === "string" ? r.minor.trim() : "";
  return {
    major: VALID_MAJOR_SET.has(major) ? major : "练气",
    minor: VALID_MINOR_SET.has(minor) ? minor : "初期",
  };
}

/**
 * 解析 NPC 的 currentLocation 字段。兼容两种 AI 输出形式：
 * - 对象：{ region, country, area, detail }（推荐）
 * - 字符串：四级 dash（如 "天南-越国-黄枫谷-外门"）
 *
 * 解析失败返回 undefined，由上游用主角当前地点兜底。
 */
function sanitizeNpcCurrentLocation(raw: unknown): WorldLocation | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    return parseWorldLocationFromDash(trimmed) ?? undefined;
  }
  if (typeof raw === "object") {
    const cl = raw as { region?: unknown; country?: unknown; area?: unknown; detail?: unknown };
    const region = typeof cl.region === "string" ? cl.region.trim() : "";
    if (!region) return undefined;
    return {
      region,
      country: typeof cl.country === "string" ? cl.country.trim() : "",
      area: typeof cl.area === "string" ? cl.area.trim() : "",
      detail: typeof cl.detail === "string" ? cl.detail.trim() : "",
    };
  }
  return undefined;
}

function parseNearbyNpcs(raw: string): NpcNearbyEntry[] {
  const text = extractTagContent(raw, TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  return arr
    .map((e: unknown): NpcNearbyEntry | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const displayName = String(o.displayName || "").trim();
      if (!displayName) return null;
      const realm = sanitizeRealm(o.realm);
      const linggenRaw = o.linggen;
      const linggen = Array.isArray(linggenRaw)
        ? linggenRaw.map((x: unknown) => String(x).trim()).filter(Boolean)
        : typeof linggenRaw === "string"
          ? linggenRaw.split("").filter((c: string) => "金木水火土".includes(c))
          : [];
      const npcIdRaw = typeof o.npcId === "string" ? o.npcId.trim() : "";
      return {
        npcId: npcIdRaw || undefined,
        displayName,
        identity: String(o.identity || ""),
        relation: typeof o.relation === "string" ? o.relation.trim() : undefined,
        isDead: o.isDead === true,
        favorability: typeof o.favorability === "number" ? o.favorability : 0,
        race: sanitizeRace(o.race),
        appearance: String(o.appearance || ""),
        clothing: String(o.clothing || ""),
        gender: String(o.gender || "男"),
        age: typeof o.age === "number" ? o.age : 0,
        linggen,
        realm,
        hpPercent: typeof o.hpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.hpPercent))) : 100,
        mpPercent: typeof o.mpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.mpPercent))) : 100,
        currentLocation: sanitizeNpcCurrentLocation(o.currentLocation),
        equippedSlots: Array.isArray(o.equippedSlots) ? o.equippedSlots : undefined,
        gongfaSlots: Array.isArray(o.gongfaSlots) ? o.gongfaSlots : undefined,
        inventorySlots: Array.isArray(o.inventorySlots) ? o.inventorySlots : undefined,
      };
    })
    .filter((e): e is NpcNearbyEntry => e !== null);
}

const VALID_CORE_SLOTS = new Set<string>(["equipped", "gongfa", "inventory"]);

/**
 * 解析 `<MJ_NPC_CORE_CHANGE_TAG>` —— AI 声明的 NPC 核心层变更事件。
 *
 * 这是「严格事件驱动」策略的入口：核心字段（境界/法宝/功法/储物袋/生死）默认冻结，
 * 只有在此标签里显式声明的事件才会被精确应用。AI 不应在 nearbyNpcs 里直接修改
 * 这些字段。
 *
 * 支持的 event 类型：
 *  - realm_breakthrough  境界突破（含小境界推进）
 *  - equipment_acquired  获得法宝/功法/储物物品
 *  - equipment_lost      失去法宝/功法/储物物品
 *  - combat_damage       战斗伤害/治疗（增量）
 *  - death               死亡
 */
function parseNpcCoreChanges(raw: string): NpcCoreChangeEvent[] {
  const text = extractTagContent(raw, TAG_NPC_CORE_CHANGE_OPEN, TAG_NPC_CORE_CHANGE_CLOSE);
  const trimmed = text.trim();
  if (!trimmed) return [];
  const arr = tryParseJsonArray(text) ?? [];
  const out: NpcCoreChangeEvent[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    if (!npcId) continue;
    const event = typeof o.event === "string" ? o.event.trim() : "";
    switch (event) {
      case "realm_breakthrough": {
        const newRealm = sanitizeRealm(o.newRealm);
        out.push({ kind: "realm_breakthrough", npcId, newRealm });
        break;
      }
      case "equipment_acquired": {
        const slot = typeof o.slot === "string" && VALID_CORE_SLOTS.has(o.slot) ? o.slot as "equipped" | "gongfa" | "inventory" : "inventory";
        if (o.data != null) {
          out.push({ kind: "equipment_acquired", npcId, slot, data: o.data });
        }
        break;
      }
      case "equipment_lost": {
        const slot = typeof o.slot === "string" && VALID_CORE_SLOTS.has(o.slot) ? o.slot as "equipped" | "gongfa" | "inventory" : "inventory";
        const slotIndex = typeof o.slotIndex === "number" ? Math.floor(o.slotIndex) : undefined;
        const itemName = typeof o.itemName === "string" ? o.itemName.trim() : undefined;
        const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : undefined;
        out.push({ kind: "equipment_lost", npcId, slot, slotIndex, itemName, count });
        break;
      }
      case "combat_damage": {
        const hpDelta = typeof o.hpDelta === "number" ? Math.round(o.hpDelta) : undefined;
        const mpDelta = typeof o.mpDelta === "number" ? Math.round(o.mpDelta) : undefined;
        if (hpDelta !== undefined || mpDelta !== undefined) {
          out.push({ kind: "combat_damage", npcId, hpDelta, mpDelta });
        }
        break;
      }
      case "death": {
        out.push({ kind: "death", npcId });
        break;
      }
      default:
        // 未知事件类型忽略
        break;
    }
  }
  return out;
}

function parseCombatantList(arr: unknown[]): BattleCombatant[] {
  return arr
    .map((e: unknown): BattleCombatant | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const displayName = String(o.displayName || "").trim();
      if (!displayName) return null;
      return { displayName, roleHint: String(o.roleHint || "") };
    })
    .filter((e): e is BattleCombatant => e !== null);
}

function parseBattleTrigger(raw: string): BattleTriggerEntry | null {  const text = extractTagContent(raw, TAG_BATTLE_TRIGGER_OPEN, TAG_BATTLE_TRIGGER_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse(text);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.shouldEnterBattle !== true) return null;
  const triggerKind = o.triggerKind === "active" ? "active" as const : "passive" as const;
  const triggerReason = String(o.triggerReason || "").trim();
  const allies = Array.isArray(o.allies) ? parseCombatantList(o.allies) : [];
  const enemies = Array.isArray(o.enemies) ? parseCombatantList(o.enemies) : [];
  if (allies.length === 0 || enemies.length === 0) return null;
  return { shouldEnterBattle: true, triggerKind, triggerReason, allies, enemies };
}

/**
 * 解析 `<MJ_ACTION_OPTIONS_TAG>` —— 状态 AI 顺便输出的四个倾向行动建议。
 *
 * 容错策略：标签缺失 / 解析失败 / 任一字段缺失或为空 → 返回 null（前端隐藏按钮区）。
 * 此标签为可选输出，缺失不影响其他状态字段。
 */
export function parseActionOptions(raw: string): ActionSuggestions | null {
  const text = extractTagContent(raw, TAG_ACTION_OPTIONS_OPEN, TAG_ACTION_OPTIONS_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse(text);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const pickStr = (k: string): string => {
    const v = o[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const aggressive = pickStr("aggressive");
  const moderate = pickStr("moderate");
  const cautious = pickStr("cautious");
  const veryCautious = pickStr("veryCautious");
  // 任一字段为空即视为残缺，整体丢弃（避免显示不完整的选项组）。
  if (!aggressive || !moderate || !cautious || !veryCautious) return null;
  return { aggressive, moderate, cautious, veryCautious };
}

function parseHpMp(raw: string): HpMpState | null {
  const text = extractTagContent(raw, TAG_HP_MP_OPEN, TAG_HP_MP_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse(text);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const hasHp = typeof o.hpPercent === "number";
  const hasMp = typeof o.mpPercent === "number";
  if (!hasHp && !hasMp) return null;
  return {
    hpPercent: hasHp ? Math.max(0, Math.min(100, Math.round(o.hpPercent as number))) : 100,
    mpPercent: hasMp ? Math.max(0, Math.min(100, Math.round(o.mpPercent as number))) : 100,
  };
}

function parseTimeAdvance(raw: string): TimeDelta | null {
  const text = extractTagContent(raw, TAG_TIME_OPEN, TAG_TIME_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse(text);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const rawTime = o.timeAdvance ?? o;
  if (!rawTime || typeof rawTime !== "object") return null;
  const td = rawTime as Record<string, unknown>;
  const years = typeof td.years === "number" ? Math.max(0, Math.floor(td.years)) : undefined;
  const months = typeof td.months === "number" ? Math.max(0, Math.floor(td.months)) : undefined;
  const days = typeof td.days === "number" ? Math.max(0, Math.floor(td.days)) : undefined;
  const hour = typeof td.hour === "number" ? Math.max(0, Math.floor(td.hour)) : undefined;
  if (years || months || days || hour !== undefined) {
    return { years, months, days, hour };
  }
  return null;
}

function parseBreakthrough(raw: string): BreakthroughState | null {
  const text = extractTagContent(raw, TAG_BREAKTHROUGH_OPEN, TAG_BREAKTHROUGH_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse(text);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const realmBreakthrough = o.realmBreakthrough === true ? true : undefined;
  const breakthroughQuestStart = o.breakthroughQuestStart === true ? true : undefined;
  const breakthroughFailed = o.breakthroughFailed === true ? true : undefined;
  if (!realmBreakthrough && !breakthroughQuestStart && !breakthroughFailed) return null;
  return { realmBreakthrough, breakthroughQuestStart, breakthroughFailed };
}

function parseUserState(raw: string): UserStateChange | null {
  const userStateText = extractTagContent(raw, TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE);
  if (!userStateText.trim()) return null;
  const obj = safeJsonParse(userStateText);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const xiuweiIncrease = typeof o.xiuweiIncrease === "number" ? Math.max(0, Math.floor(o.xiuweiIncrease)) : undefined;
  const rawMastery = o.gongfaMasteryChanges;
  let gongfaMasteryChanges: Array<{ gongfaName: string; masteryExpIncrease: number }> | undefined;
  if (Array.isArray(rawMastery)) {
    const parsed = rawMastery
      .map((e: unknown) => {
        if (!e || typeof e !== "object") return null;
        const m = e as Record<string, unknown>;
        const gongfaName = String(m.gongfaName || "").trim();
        const val = typeof m.masteryExpIncrease === "number" ? m.masteryExpIncrease
          : typeof m.masteryIncrease === "number" ? m.masteryIncrease
          : 0;
        const masteryExpIncrease = Math.max(1, Math.floor(val));
        return gongfaName ? { gongfaName, masteryExpIncrease } : null;
      })
      .filter((e): e is { gongfaName: string; masteryExpIncrease: number } => e !== null);
    if (parsed.length > 0) gongfaMasteryChanges = parsed;
  }
  if (!xiuweiIncrease && !gongfaMasteryChanges) return null;
  const result: UserStateChange = {};
  if (xiuweiIncrease) result.xiuweiIncrease = xiuweiIncrease;
  if (gongfaMasteryChanges) result.gongfaMasteryChanges = gongfaMasteryChanges;
  return result;
}

export function parseStateAiResponse(raw: string): StateParsed {
  const worldLocation = extractWorldBody(raw);

  const hpMp = parseHpMp(raw);
  const userState = parseUserState(raw);
  const timeAdvance = parseTimeAdvance(raw);
  const breakthrough = parseBreakthrough(raw);

  const spiritStoneText = extractTagContent(raw, TAG_SPIRIT_STONE_OPEN, TAG_SPIRIT_STONE_CLOSE);
  const itemAddText = extractTagContent(raw, TAG_ITEM_ADD_OPEN, TAG_ITEM_ADD_CLOSE);
  const itemRemoveText = extractTagContent(raw, TAG_ITEM_REMOVE_OPEN, TAG_ITEM_REMOVE_CLOSE);

  const stoneArr = tryParseJsonArray(spiritStoneText) ?? [];
  const spiritStoneChanges: SpiritStoneChange[] = stoneArr
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const op = String(o.op || "").trim();
      if (op !== "add" && op !== "remove") return null;
      const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : 1;
      return { op, count } as SpiritStoneChange;
    })
    .filter((c): c is SpiritStoneChange => c !== null);

  const addArr = tryParseJsonArray(itemAddText) ?? [];
  const itemAdds: ItemAddEntry[] = addArr
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const type = String(o.type || "").trim();
      const name = String(o.name || "").trim();
      const intro = String(o.intro || "").trim();
      const grade = String(o.grade || "下品").trim();
      const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : 1;
      if (!name) return null;
      return {
        type, name, intro, grade, count,
        ...(o.system != null ? { system: o.system } : {}),
        ...(o.role != null ? { role: o.role } : {}),
        ...(o.function != null ? { function: o.function } : {}),
        ...(o.bonus != null ? { bonus: o.bonus } : {}),
        ...(o.category != null ? { category: o.category } : {}),
      } as ItemAddEntry;
    })
    .filter((e): e is ItemAddEntry => e !== null);

  const removeArr = tryParseJsonArray(itemRemoveText) ?? [];
  const itemRemoves: ItemRemoveEntry[] = removeArr
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const name = String(o.name || "").trim();
      const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : 1;
      if (!name) return null;
      return { name, count } as ItemRemoveEntry;
    })
    .filter((e): e is ItemRemoveEntry => e !== null);

  const nearbyNpcs = parseNearbyNpcs(raw);

  const npcCoreChanges = parseNpcCoreChanges(raw);

  const battleTrigger = parseBattleTrigger(raw);

  const storySnapshot = extractTagContent(raw, TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE);

  const actionOptions = parseActionOptions(raw);

  return {
    worldLocation,
    hpMp,
    userState,
    timeAdvance,
    breakthrough,
    spiritStoneChanges,
    itemAdds,
    itemRemoves,
    nearbyNpcs,
    npcCoreChanges,
    battleTrigger,
    storySnapshot,
    actionOptions,
  };
}

function formatEquipSlot(label: string, slot: EquippedSlotsState[number]): string {
  if (!slot) return `${label}：无`;
  return `${label}：${slot.name}（${slot.grade}）${slot.desc ? "—" + slot.desc : ""}`;
}

function formatEquippedSlots(slots: EquippedSlotsState): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    lines.push(formatEquipSlot(`法宝${i + 1}`, slots[i]));
  }
  return lines.join("\n");
}

function formatGongfaSlots(slots: GongfaSlotsState): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const g = slots[i];
    if (!g) continue;
    const mastery = g.mastery ?? 1;
    const exp = g.masteryExp ?? 0;
    const expStr = mastery < 10 ? `，熟练度${exp}` : "";
    lines.push(`功法：${g.name}（${g.grade}，第${mastery}层/10层${expStr}）${g.desc ? "—" + g.desc : ""}`);
  }
  return lines.length > 0 ? lines.join("\n") : "无";
}

function formatInventoryItem(item: InventoryStackItem): string {
  if ("type" in item && item.type === "灵石") {
    return `${item.name}×${item.count}`;
  }
  const d = item as { name?: string; grade?: string; count?: number; desc?: string };
  const grade = d.grade ? `（${d.grade}）` : "";
  return `${d.name || "未知物品"}${grade}×${d.count || 1}`;
}

function formatInventorySlots(slots: Array<InventoryStackItem | null>): string {
  const items = slots.filter((s): s is InventoryStackItem => s !== null);
  if (items.length === 0) return "无";
  return items.map(formatInventoryItem).join("、");
}

function buildStateUserContent(input: StateGenerateInput): string {
  const p = input.protagonist;

  const npcSection = input.npcSnapshot?.trim()
    ? `\n【当前场景NPC】\n${input.npcSnapshot.trim()}\n`
    : "";

  const locationHint = input.currentWorldLocation
    ? `\n主角当前所在地点（本轮剧情发生前·出发点）：${formatWorldLocationDash(input.currentWorldLocation)}`
    : "";

  const timeHint = input.currentWorldTime
    ? `\n当前世界时间：${formatWorldTimeZhDisplay(input.currentWorldTime)}`
    : "";

  return [
    "【剧情正文】",
    input.storyBody,
    "",
    "【主角当前状态】",
    `姓名：${p.displayName}`,
    `境界：${p.realm.major}${p.realm.minor}${p.realmComplete ? "·圆满" : ""}`,
    `修为状态：${p.realmComplete ? "修为已圆满" : "修为未圆满"}`,
    `突破状态：${p.realmComplete ? (p.breakthroughStatus === "in_quest" ? "突破任务进行中" : describeNextBreakthrough(p.realm.major, p.realm.minor)) : "修为未圆满"}`,
    `当前血量：${p.currentHp}/${p.maxHp}`,
    `当前法力：${p.currentMp}/${p.maxMp}`,
    `灵根：${(p as { linggen?: string[] }).linggen?.join("") || "无"}`,
    locationHint,
    timeHint,
    "",
    "【装备】",
    formatEquippedSlots(p.equippedSlots),
    "",
    "【功法】",
    formatGongfaSlots(p.gongfaSlots),
    "",
    "【储物袋】",
    formatInventorySlots(p.inventorySlots),
    npcSection,
  ].join("\n");
}

export async function generateState(input: StateGenerateInput): Promise<StateParsed> {
  const messages = [
    { role: "system" as const, content: STATE_SYSTEM_PRESET },
    { role: "user" as const, content: buildStateUserContent(input) },
  ];

  const payload: JsonChatRequestPayload = {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages,
    temperature: input.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: input.max_tokens ?? DEFAULT_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };

  const raw = await completeChatWithMessagesJson(payload);
  return parseStateAiResponse(raw);
}
