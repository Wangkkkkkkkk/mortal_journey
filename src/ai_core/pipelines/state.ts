/**
 * 状态更新 pipeline（单次调用，统一解析）。
 *
 * 一次 LLM 调用同时产出全部 13 段标签（使用单体 STATE_SYSTEM_PRESET），
 * 再由本文件统一的 parseStateFromXml 从同一份响应里一次性抽取所有标签，
 * 直接组装为 StateParsed。不再区分「主角状态 / NPC 状态」两条解析路径。
 *
 * NPC 标签（nearbyNpcs + npcCoreChanges）先转成 NpcEvent[] 事件流，
 * 再由 npcEventsToLegacyFormat 落回 nearbyNpcs + npcCoreChanges 旧字段。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type {
  StateParsed,
  NpcSnapshotEntry,
  NpcMemoryEntry,
  NpcFavorChangeEntry,
  HpMpState,
  UserStateChange,
  BreakthroughState,
  SpiritStoneChange,
  ItemAddEntry,
  ItemRemoveEntry,
  ActionSuggestions,
} from "../types/stateDiff";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import type { TimeDelta } from "../../role_core/worldTime";
import type { WorldTime } from "../../role_core/worldTime";
import type { NpcCoreChangeEvent } from "../../role_core/npcCoreChange";
import type {
  NpcEvent,
  NpcAppearedEvent,
  NpcPresentEvent,
  NpcBreakthroughEvent,
  NpcEquipmentAcquiredEvent,
  NpcEquipmentLostEvent,
  NpcDamagedEvent,
  NpcDiedEvent,
  NpcLeftEvent,
  NpcFullCard,
  NpcNearbyEntry,
  BattleTriggerEntry,
  BattleCombatant,
} from "../types/npcEvents";
import { parseWorldLocationFromDash, formatWorldLocationDash } from "../../role_core/types/worldLocation";
import { formatWorldTimeZhDisplay } from "../../role_core/worldTime";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { STATE_SYSTEM_PRESET } from "../presets/statePreset";
import { buildItemEffectVocabularyPrompt } from "../shared/itemEffectVocabulary";

/** 状态更新 system prompt：基础规则 + 物品效果词汇表（仅计算一次）。 */
const STATE_SYSTEM_FULL = `${STATE_SYSTEM_PRESET}\n\n${buildItemEffectVocabularyPrompt()}`;
import {
  extractTagContent,
  MJ_WORLD_BODY_OPEN, MJ_WORLD_BODY_CLOSE,
  TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE,
  TAG_HP_MP_OPEN, TAG_HP_MP_CLOSE,
  TAG_TIME_OPEN, TAG_TIME_CLOSE,
  TAG_BREAKTHROUGH_OPEN, TAG_BREAKTHROUGH_CLOSE,
  TAG_SPIRIT_STONE_OPEN, TAG_SPIRIT_STONE_CLOSE,
  TAG_ITEM_ADD_OPEN, TAG_ITEM_ADD_CLOSE,
  TAG_ITEM_REMOVE_OPEN, TAG_ITEM_REMOVE_CLOSE,
  TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE,
  TAG_ACTION_OPTIONS_OPEN, TAG_ACTION_OPTIONS_CLOSE,
  TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE,
  TAG_NPC_CORE_CHANGE_OPEN, TAG_NPC_CORE_CHANGE_CLOSE,
  TAG_BATTLE_TRIGGER_OPEN, TAG_BATTLE_TRIGGER_CLOSE,
  TAG_NPC_SNAPSHOTS_OPEN, TAG_NPC_SNAPSHOTS_CLOSE,
  TAG_NPC_MEMORIES_OPEN, TAG_NPC_MEMORIES_CLOSE,
  TAG_NPC_FAVOR_CHANGES_OPEN, TAG_NPC_FAVOR_CHANGES_CLOSE,
} from "../shared/tagSpec";
import { tryParseJsonArray, safeJsonParse } from "../shared/parseJson";
import {
  sanitizeRace, sanitizePowerTier, sanitizeRealm, sanitizeLinggen, sanitizePercent, sanitizeSlot, sanitizeNpcCurrentLocation,
} from "../shared/sanitizeDomain";

export interface StateGenerateInput extends AiRequestConfig {
  storyBody: string;
  reasoningTrace?: string;
  protagonist?: ProtagonistPlayInfo;
  currentWorldLocation?: WorldLocation | null;
  currentWorldTime?: WorldTime;
  npcSnapshot?: string;
  /** 路线大纲（含 2-3 条多方向钩子），用于使行动建议与剧情分支对齐。 */
  plotOutline?: string;
  /** 已注册地点扁平列表（region-country-area-detail），注入上下文供 AI 逐字复用。 */
  registeredLocations?: string[];
}

/**
 * 把 NpcEvent[] 转换为旧格式 nearbyNpcs + npcCoreChanges。
 * - npc_appeared → nearbyNpcs（新 NPC 完整角色卡）
 * - npc_present → nearbyNpcs（已有 NPC 的 dynamic 字段更新）
 * - npc_breakthrough → npcCoreChanges
 * - npc_equipment_acquired → npcCoreChanges
 * - npc_equipment_lost → npcCoreChanges
 * - npc_damaged → npcCoreChanges
 * - npc_died → npcCoreChanges
 */
export function npcEventsToLegacyFormat(events: NpcEvent[]): {
  nearbyNpcs: NpcNearbyEntry[];
  npcCoreChanges: NpcCoreChangeEvent[];
} {
  const nearbyNpcs: NpcNearbyEntry[] = [];
  const npcCoreChanges: NpcCoreChangeEvent[] = [];

  for (const event of events) {
    switch (event.kind) {
      case "npc_appeared": {
        const n = event.npc;
        nearbyNpcs.push({
          npcId: n.npcId,
          displayName: n.displayName,
          identity: n.identity,
          isDead: false,
          favorability: n.favorability,
          race: n.race,
          appearance: n.appearance,
          clothing: n.clothing,
          gender: n.gender,
          age: n.age,
          linggen: n.linggen,
          realm: n.realm,
          hpPercent: n.hpPercent,
          mpPercent: n.mpPercent,
          currentLocation: n.currentLocation ?? undefined,
          equippedSlots: n.equippedSlots,
          gongfaSlots: n.gongfaSlots,
          inventorySlots: n.inventorySlots,
        });
        break;
      }
      case "npc_present": {
        // 把 dynamic 字段包装为 nearbyNpcs 条目（npcStore 按 npcId 匹配后 mergeFromAi）
        // 注意：已存在 NPC 的 favorability 不在此处传递——好感度变化只走 npcFavorChanges 增量通道。
        nearbyNpcs.push({
          npcId: event.npcId,
          displayName: "", // npcStore 会按 npcId 查找，displayName 可为空
          identity: event.dynamic.identity ?? "",
          isDead: false,
          race: "修仙者",
          appearance: "",
          clothing: "",
          gender: "男",
          age: 0,
          linggen: [],
          realm: { major: "练气", minor: "初期" },
          hpPercent: event.dynamic.hpPercent ?? 100,
          mpPercent: event.dynamic.mpPercent ?? 100,
        });
        break;
      }
      case "npc_breakthrough":
        npcCoreChanges.push({ kind: "realm_breakthrough", npcId: event.npcId, newRealm: event.newRealm });
        break;
      case "npc_equipment_acquired":
        npcCoreChanges.push({ kind: "equipment_acquired", npcId: event.npcId, slot: event.slot, data: event.data });
        break;
      case "npc_equipment_lost":
        npcCoreChanges.push({ kind: "equipment_lost", npcId: event.npcId, slot: event.slot, slotIndex: event.slotIndex, itemName: event.itemName, count: event.count });
        break;
      case "npc_damaged":
        npcCoreChanges.push({ kind: "combat_damage", npcId: event.npcId, hpDelta: event.hpDelta, mpDelta: event.mpDelta });
        break;
      case "npc_died":
        npcCoreChanges.push({ kind: "death", npcId: event.npcId });
        break;
      case "npc_left":
        // npc_left 暂无对应旧格式，跳过
        break;
    }
  }

  return { nearbyNpcs, npcCoreChanges };
}

// ── 主角相关标签解析 ──

function extractWorldBody(raw: string): WorldLocation | null {
  const s = raw ?? "";
  const i = s.indexOf(MJ_WORLD_BODY_OPEN);
  if (i < 0) return null;
  const from = i + MJ_WORLD_BODY_OPEN.length;
  const j = s.indexOf(MJ_WORLD_BODY_CLOSE, from);
  const text = j < 0 ? s.slice(from).trim() : s.slice(from, j).trim();
  return parseWorldLocationFromDash(text);
}

function parseHpMp(raw: string): HpMpState | null {
  const text = extractTagContent(raw, TAG_HP_MP_OPEN, TAG_HP_MP_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse<unknown>(text, null);
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

function parseUserState(raw: string): UserStateChange | null {
  const text = extractTagContent(raw, TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse<unknown>(text, null);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const xiuweiIncrease = typeof o.xiuweiIncrease === "number" ? Math.max(0, Math.floor(o.xiuweiIncrease)) : undefined;
  const rawMastery = o.gongfaMasteryChanges;
  let gongfaMasteryChanges: UserStateChange["gongfaMasteryChanges"];
  if (Array.isArray(rawMastery)) {
    const parsed = rawMastery
      .map((e: unknown) => {
        if (!e || typeof e !== "object") return null;
        const m = e as Record<string, unknown>;
        const gongfaName = String(m.gongfaName || "").trim();
        const val = typeof m.masteryExpIncrease === "number" ? m.masteryExpIncrease
          : typeof m.masteryIncrease === "number" ? m.masteryIncrease : 0;
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

function parseTimeAdvance(raw: string): TimeDelta {
  const text = extractTagContent(raw, TAG_TIME_OPEN, TAG_TIME_CLOSE);
  if (!text.trim()) return { hour: 1, days: 0, months: 0, years: 0 };
  const obj = safeJsonParse<unknown>(text, null);
  if (!obj || typeof obj !== "object") return { hour: 1, days: 0, months: 0, years: 0 };
  const o = obj as Record<string, unknown>;
  const rawTime = o.timeAdvance ?? o;
  if (!rawTime || typeof rawTime !== "object") return { hour: 1, days: 0, months: 0, years: 0 };
  const td = rawTime as Record<string, unknown>;
  const years = typeof td.years === "number" ? Math.max(0, Math.floor(td.years)) : 0;
  const months = typeof td.months === "number" ? Math.max(0, Math.floor(td.months)) : 0;
  const days = typeof td.days === "number" ? Math.max(0, Math.floor(td.days)) : 0;
  const hour = typeof td.hour === "number" ? Math.max(0, Math.floor(td.hour)) : 1;
  return { years, months, days, hour };
}

function parseBreakthrough(raw: string): BreakthroughState | null {
  const text = extractTagContent(raw, TAG_BREAKTHROUGH_OPEN, TAG_BREAKTHROUGH_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse<unknown>(text, null);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const realmBreakthrough = o.realmBreakthrough === true ? true : undefined;
  const breakthroughQuestStart = o.breakthroughQuestStart === true ? true : undefined;
  const breakthroughFailed = o.breakthroughFailed === true ? true : undefined;
  if (!realmBreakthrough && !breakthroughQuestStart && !breakthroughFailed) return null;
  return { realmBreakthrough, breakthroughQuestStart, breakthroughFailed };
}

function parseSpiritStoneChanges(raw: string): SpiritStoneChange[] {
  const text = extractTagContent(raw, TAG_SPIRIT_STONE_OPEN, TAG_SPIRIT_STONE_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  return arr
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const op = String(o.op || "").trim();
      if (op !== "add" && op !== "remove") return null;
      const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : 1;
      return { op, count } as SpiritStoneChange;
    })
    .filter((c): c is SpiritStoneChange => c !== null);
}

function parseItemAdds(raw: string): ItemAddEntry[] {
  const text = extractTagContent(raw, TAG_ITEM_ADD_OPEN, TAG_ITEM_ADD_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  return arr
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
        ...(o.bonus != null ? { bonus: o.bonus } : {}),
        ...(o.effects != null ? { effects: o.effects } : {}),
      } as ItemAddEntry;
    })
    .filter((e): e is ItemAddEntry => e !== null);
}

function parseItemRemoves(raw: string): ItemRemoveEntry[] {
  const text = extractTagContent(raw, TAG_ITEM_REMOVE_OPEN, TAG_ITEM_REMOVE_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  return arr
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const name = String(o.name || "").trim();
      const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : 1;
      if (!name) return null;
      return { name, count } as ItemRemoveEntry;
    })
    .filter((e): e is ItemRemoveEntry => e !== null);
}

function parseActionOptions(raw: string): ActionSuggestions | null {
  const text = extractTagContent(raw, TAG_ACTION_OPTIONS_OPEN, TAG_ACTION_OPTIONS_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse<unknown>(text, null);
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
  if (!aggressive || !moderate || !cautious || !veryCautious) return null;
  return { aggressive, moderate, cautious, veryCautious };
}

// ── NPC 相关标签解析 ──

function parseNearbyNpcsToEvents(raw: string): NpcEvent[] {
  const text = extractTagContent(raw, TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  const events: NpcEvent[] = [];

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const displayName = String(o.displayName || "").trim();
    if (!displayName) continue;

    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    const realm = sanitizeRealm(o.realm);
    const linggen = sanitizeLinggen(o.linggen);

    const fullCard: NpcFullCard = {
      npcId: npcId || `npc_${displayName}`,
      displayName,
      identity: String(o.identity || ""),
      race: sanitizeRace(o.race),
      appearance: String(o.appearance || ""),
      clothing: String(o.clothing || ""),
      gender: String(o.gender || "男"),
      age: typeof o.age === "number" ? o.age : 0,
      favorability: typeof o.favorability === "number" ? o.favorability : 0,
      linggen,
      realm,
      hpPercent: sanitizePercent(o.hpPercent),
      mpPercent: sanitizePercent(o.mpPercent),
      powerTier: sanitizePowerTier(o.powerTier),
      currentLocation: sanitizeNpcCurrentLocation(o.currentLocation),
      equippedSlots: Array.isArray(o.equippedSlots) ? o.equippedSlots : [],
      gongfaSlots: Array.isArray(o.gongfaSlots) ? o.gongfaSlots : [],
      inventorySlots: Array.isArray(o.inventorySlots) ? o.inventorySlots : [],
    };

    const isExisting = npcId && !o.race && !o.appearance;
    if (isExisting) {
      const presentEvent: NpcPresentEvent = {
        kind: "npc_present",
        npcId: fullCard.npcId,
        dynamic: {
          identity: fullCard.identity || undefined,
          favorability: typeof o.favorability === "number" ? fullCard.favorability : undefined,
          hpPercent: typeof o.hpPercent === "number" ? fullCard.hpPercent : undefined,
          mpPercent: typeof o.mpPercent === "number" ? fullCard.mpPercent : undefined,
        },
      };
      events.push(presentEvent);
    } else {
      events.push({ kind: "npc_appeared", npc: fullCard } as NpcAppearedEvent);
    }
  }

  return events;
}

function parseNpcCoreChangesToEvents(raw: string): NpcEvent[] {
  const text = extractTagContent(raw, TAG_NPC_CORE_CHANGE_OPEN, TAG_NPC_CORE_CHANGE_CLOSE);
  if (!text.trim()) return [];
  const arr = tryParseJsonArray(text) ?? [];
  const events: NpcEvent[] = [];

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    if (!npcId) continue;
    const event = typeof o.event === "string" ? o.event.trim() : "";

    switch (event) {
      case "realm_breakthrough":
        events.push({
          kind: "npc_breakthrough",
          npcId,
          newRealm: sanitizeRealm(o.newRealm),
        } as NpcBreakthroughEvent);
        break;
      case "equipment_acquired": {
        const slot = sanitizeSlot(o.slot);
        if (o.data != null) {
          events.push({
            kind: "npc_equipment_acquired",
            npcId, slot, data: o.data,
          } as NpcEquipmentAcquiredEvent);
        }
        break;
      }
      case "equipment_lost": {
        const slot = sanitizeSlot(o.slot);
        const slotIndex = typeof o.slotIndex === "number" ? Math.floor(o.slotIndex) : undefined;
        const itemName = typeof o.itemName === "string" ? o.itemName.trim() : undefined;
        const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : undefined;
        events.push({
          kind: "npc_equipment_lost",
          npcId, slot, slotIndex, itemName, count,
        } as NpcEquipmentLostEvent);
        break;
      }
      case "combat_damage": {
        const hpDelta = typeof o.hpDelta === "number" ? Math.round(o.hpDelta) : undefined;
        const mpDelta = typeof o.mpDelta === "number" ? Math.round(o.mpDelta) : undefined;
        if (hpDelta !== undefined || mpDelta !== undefined) {
          events.push({ kind: "npc_damaged", npcId, hpDelta, mpDelta } as NpcDamagedEvent);
        }
        break;
      }
      case "death":
        events.push({ kind: "npc_died", npcId } as NpcDiedEvent);
        break;
    }
  }

  return events;
}

function parseCombatantList(arr: unknown[]): BattleCombatant[] {
  return arr
    .map((e: unknown): BattleCombatant | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const displayName = String(o.displayName || "").trim();
      if (!displayName) return null;
      return {
        npcId: typeof o.npcId === "string" ? o.npcId.trim() : undefined,
        displayName,
        roleHint: String(o.roleHint || ""),
      };
    })
    .filter((e): e is BattleCombatant => e !== null);
}

function parseBattleTrigger(raw: string): BattleTriggerEntry | null {
  const text = extractTagContent(raw, TAG_BATTLE_TRIGGER_OPEN, TAG_BATTLE_TRIGGER_CLOSE);
  if (!text.trim()) return null;
  const obj = safeJsonParse<unknown>(text, null);
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

// ── 统一解析：从单次响应一次性抽取全部 13 段标签 ──

function parseNpcSnapshots(raw: string): NpcSnapshotEntry[] {
  const text = extractTagContent(raw, TAG_NPC_SNAPSHOTS_OPEN, TAG_NPC_SNAPSHOTS_CLOSE);
  if (!text.trim()) return [];
  const arr = tryParseJsonArray(text) ?? [];
  const out: NpcSnapshotEntry[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    const snapshot = typeof o.snapshot === "string" ? o.snapshot.trim() : "";
    if (npcId && snapshot) out.push({ npcId, snapshot });
  }
  return out;
}

function parseNpcMemories(raw: string): NpcMemoryEntry[] {
  const text = extractTagContent(raw, TAG_NPC_MEMORIES_OPEN, TAG_NPC_MEMORIES_CLOSE);
  if (!text.trim()) return [];
  const arr = tryParseJsonArray(text) ?? [];
  const out: NpcMemoryEntry[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    const textVal = typeof o.text === "string" ? o.text.trim() : "";
    if (npcId && textVal) out.push({ npcId, text: textVal });
  }
  return out;
}

function parseNpcFavorChanges(raw: string): NpcFavorChangeEntry[] {
  const text = extractTagContent(raw, TAG_NPC_FAVOR_CHANGES_OPEN, TAG_NPC_FAVOR_CHANGES_CLOSE);
  if (!text.trim()) return [];
  const arr = tryParseJsonArray(text) ?? [];
  const out: NpcFavorChangeEntry[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    const delta = Number(o.delta);
    const reason = typeof o.reason === "string" ? o.reason.trim() : "";
    if (!npcId || !Number.isFinite(delta) || delta === 0 || !reason) continue;
    out.push({
      npcId,
      delta: Math.trunc(delta),
      reason,
      major: o.major === true,
    });
  }
  return out;
}

function parseStateFromXml(raw: string): StateParsed {
  const worldLocation = extractWorldBody(raw);
  const hpMp = parseHpMp(raw);
  const userState = parseUserState(raw);
  const timeAdvance = parseTimeAdvance(raw);
  const breakthrough = parseBreakthrough(raw);
  const spiritStoneChanges = parseSpiritStoneChanges(raw);
  const itemAdds = parseItemAdds(raw);
  const itemRemoves = parseItemRemoves(raw);
  const storySnapshot = extractTagContent(raw, TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE);
  const actionOptions = parseActionOptions(raw);

  const npcEvents = [...parseNearbyNpcsToEvents(raw), ...parseNpcCoreChangesToEvents(raw)];
  const battleTrigger = parseBattleTrigger(raw);
  const { nearbyNpcs, npcCoreChanges } = npcEventsToLegacyFormat(npcEvents);
  const npcSnapshots = parseNpcSnapshots(raw);
  const npcMemories = parseNpcMemories(raw);
  const npcFavorChanges = parseNpcFavorChanges(raw);

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
    npcSnapshots,
    npcMemories,
    npcFavorChanges,
  };
}

export async function generateState(input: StateGenerateInput): Promise<StateParsed> {
  const npcCtx = input.npcSnapshot?.trim();
  const outlineCtx = input.plotOutline?.trim();

  const sections: string[] = [];
  // 注入当前世界时间，让 AI 产出自洽的 timeAdvance（对照"当前 + delta = 终时刻"）。
  if (input.currentWorldTime) {
    const t = input.currentWorldTime;
    sections.push(`【当前世界时间】${formatWorldTimeZhDisplay(t)} ${String(t.hour).padStart(2, "0")}时`);
  }
  // 注入当前所在地点 + 已注册地点树，让 AI 复用规范字符串，避免重复分支。
  if (input.currentWorldLocation) {
    sections.push(`【当前所在地点】${formatWorldLocationDash(input.currentWorldLocation)}`);
  }
  const registered = (input.registeredLocations ?? []).filter((s) => s && s.trim());
  if (registered.length > 0) {
    sections.push(`【已注册地点·返回时须逐字沿用既有字符串】\n${registered.join("\n")}`);
  }
  if (outlineCtx) {
    sections.push(`【路线大纲·据此对齐行动建议与剧情分支】\n${outlineCtx}`);
  }
  sections.push(input.storyBody);
  if (npcCtx) {
    sections.push(`[当前在场 NPC 现状（含储物/装备/功法物品名与近况，据此准确输出其核心变更）]\n${npcCtx}`);
  }
  const userContent = sections.join("\n\n");

  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 32768,
    system: STATE_SYSTEM_FULL,
    user: userContent,
    logTag: "状态更新",
  };

  const result = await runPipeline(input, opts, callChatCompletions);
  return parseStateFromXml(result.raw);
}
