/**
 * Pipeline: initState
 *
 * 开局状态初始化。从现有 ai/init_state_generate.ts 迁移。
 * 拆为 protagonist + npc 两部分输出（当前阶段共用一次调用，后续可拆为并行）。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { EquippedSlotsState, GongfaSlotsState } from "../../role_core/types/playInfo";
import { EQUIP_SLOT_COUNT, GONGFA_SLOT_COUNT } from "../../role_core/types/playInfo";
import { DEFAULT_INVENTORY_SLOT_COUNT, compactInventorySlotsInPlace } from "../../role_core/CharacterInventory";
import type { ProtagonistPlayInfo } from "../../role_core/types/playInfo";
import type { InventoryStackItem } from "../../role_core/types/itemInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { formatWorldLocationDash, parseWorldLocationFromDash } from "../../role_core/types/worldLocation";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { INIT_STATE_SYSTEM_PRESET } from "../presets/initStatePreset";
import { extractTagContent } from "../shared/tagSpec";
import { tryParseJsonArray, safeJsonParse } from "../shared/parseJson";
import {
  MJ_WORLD_BODY_OPEN, MJ_WORLD_BODY_CLOSE,
  MJ_EQUIP_BODY_OPEN, MJ_EQUIP_BODY_CLOSE,
  MJ_MAGIC_BODY_OPEN, MJ_MAGIC_BODY_CLOSE,
  MJ_STORAGE_BODY_OPEN, MJ_STORAGE_BODY_CLOSE,
  TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE,
  TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE,
  TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE,
  TAG_AGE_OPEN, TAG_AGE_CLOSE,
  TAG_ACTION_OPTIONS_OPEN, TAG_ACTION_OPTIONS_CLOSE,
} from "../shared/tagSpec";
import { parseEquipObject, parseGongfaObject, parseStorageObject } from "../shared/parseItems";
import {
  sanitizeRace, sanitizePowerTier, sanitizeRealm, sanitizeLinggen, sanitizePercent,
} from "../shared/sanitizeDomain";
import type { TreasureItemDefinition, GongfaItemDefinition } from "../../role_core/types/itemInfo";
import type { ActionSuggestions } from "../types/stateDiff";
import type { NpcEvent, NpcFullCard } from "../types/npcEvents";

export interface InitStateInput extends AiRequestConfig {
  storyBody: string;
  protagonist: ProtagonistPlayInfo;
}

export interface InitStateParsed {
  equips: TreasureItemDefinition[];
  gongfas: GongfaItemDefinition[];
  storage: InventoryStackItem[];
  worldLocation: WorldLocation | null;
  hpPercent: number;
  mpPercent: number;
  npcEvents: NpcEvent[];
  storySnapshot: string;
  protagonistAge: number | null;
  actionOptions: ActionSuggestions | null;
}

function buildInitStateUserContent(input: InitStateInput): string {
  const p = input.protagonist;
  return [
    "【开局剧情正文】",
    input.storyBody,
    "",
    "【主角初始状态】",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    `境界：${p.realm.major}${p.realm.minor}`,
    `灵根：${p.linggen.join("") || "无"}`,
    `出身地点：${p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—"}`,
    "",
  ].join("\n");
}

function parseInitNpcEvents(raw: string): NpcEvent[] {
  const text = extractTagContent(raw, TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  const events: NpcEvent[] = [];

  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const displayName = String(o.displayName || "").trim();
    if (!displayName) continue;

    const realm = sanitizeRealm(o.realm);
    const linggen = sanitizeLinggen(o.linggen);
    const race = sanitizeRace(o.race);
    const powerTier = sanitizePowerTier(o.powerTier);

    const fullCard: NpcFullCard = {
      npcId: typeof o.npcId === "string" ? o.npcId.trim() : `npc_${displayName}`,
      displayName,
      identity: String(o.identity || ""),
      race,
      appearance: String(o.appearance || ""),
      clothing: String(o.clothing || ""),
      gender: String(o.gender || "男"),
      age: typeof o.age === "number" ? o.age : 0,
      favorability: typeof o.favorability === "number" ? o.favorability : 0,
      linggen,
      realm,
      hpPercent: sanitizePercent(o.hpPercent),
      mpPercent: sanitizePercent(o.mpPercent),
      powerTier,
      currentLocation: null,
      equippedSlots: Array.isArray(o.equippedSlots) ? o.equippedSlots : [],
      gongfaSlots: Array.isArray(o.gongfaSlots) ? o.gongfaSlots : [],
      inventorySlots: Array.isArray(o.inventorySlots) ? o.inventorySlots : [],
    };

    events.push({ kind: "npc_appeared", npc: fullCard });
  }

  return events;
}

export function parseInitStateAiResponse(
  raw: string,
  realmMajor: string,
  realmMinor: string,
  playerLinggen?: readonly string[] | null,
): InitStateParsed {
  const worldLocation = (() => {
    const s = raw ?? "";
    const i = s.indexOf(MJ_WORLD_BODY_OPEN);
    if (i < 0) return null;
    const from = i + MJ_WORLD_BODY_OPEN.length;
    const j = s.indexOf(MJ_WORLD_BODY_CLOSE, from);
    const text = j < 0 ? s.slice(from).trim() : s.slice(from, j).trim();
    return parseWorldLocationFromDash(text);
  })();

  const equipText = extractTagContent(raw, MJ_EQUIP_BODY_OPEN, MJ_EQUIP_BODY_CLOSE);
  const magicText = extractTagContent(raw, MJ_MAGIC_BODY_OPEN, MJ_MAGIC_BODY_CLOSE);
  const storageText = extractTagContent(raw, MJ_STORAGE_BODY_OPEN, MJ_STORAGE_BODY_CLOSE);
  const userStateText = extractTagContent(raw, TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE);

  const equipArr = tryParseJsonArray(equipText) ?? [];
  const magicArr = tryParseJsonArray(magicText) ?? [];
  const storageArr = tryParseJsonArray(storageText) ?? [];

  const equips = equipArr.map((e: unknown) => parseEquipObject(e, realmMajor, realmMinor));
  const gongfas = magicArr.map((e: unknown) => parseGongfaObject(e, realmMajor, realmMinor, playerLinggen));
  const storage = storageArr
    .map((e: unknown) => parseStorageObject(e, realmMajor, realmMinor, playerLinggen))
    .filter((item): item is InventoryStackItem => item !== null);

  let hpPercent = 100;
  let mpPercent = 100;
  if (userStateText) {
    const obj = safeJsonParse<unknown>(userStateText, null);
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      hpPercent = typeof o.hpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.hpPercent))) : 100;
      mpPercent = typeof o.mpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.mpPercent))) : 100;
    }
  }

  const npcEvents = parseInitNpcEvents(raw);
  const storySnapshot = extractTagContent(raw, TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE);

  const ageText = extractTagContent(raw, TAG_AGE_OPEN, TAG_AGE_CLOSE);
  let protagonistAge: number | null = null;
  if (ageText) {
    const parsed = parseInt(ageText.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) protagonistAge = parsed;
  }

  const actionText = extractTagContent(raw, TAG_ACTION_OPTIONS_OPEN, TAG_ACTION_OPTIONS_CLOSE);
  let actionOptions: ActionSuggestions | null = null;
  if (actionText) {
    const obj = safeJsonParse<unknown>(actionText, null);
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      const pick = (k: string) => typeof o[k] === "string" ? (o[k] as string).trim() : "";
      const aggressive = pick("aggressive");
      const moderate = pick("moderate");
      const cautious = pick("cautious");
      const veryCautious = pick("veryCautious");
      if (aggressive && moderate && cautious && veryCautious) {
        actionOptions = { aggressive, moderate, cautious, veryCautious };
      }
    }
  }

  return { equips, gongfas, storage, worldLocation, hpPercent, mpPercent, npcEvents, storySnapshot, protagonistAge, actionOptions };
}

export async function generateInitState(input: InitStateInput): Promise<InitStateParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.55,
    defaultMaxTokens: 16384,
    system: INIT_STATE_SYSTEM_PRESET,
    user: buildInitStateUserContent(input),
    logTag: "开局状态",
  };

  const result = await runPipeline(input, opts, callChatCompletions);
  const r = input.protagonist.realm;
  return parseInitStateAiResponse(result.raw, r.major, r.minor, input.protagonist.linggen);
}

// ── Slot builders（Protagonist.applyInitState 需要）──

export function buildEquippedSlotsFromParsed(parsed: InitStateParsed): EquippedSlotsState {
  const slots: EquippedSlotsState = Array.from({ length: EQUIP_SLOT_COUNT }, () => null);
  for (const item of parsed.equips) {
    const emptyIdx = slots.findIndex((s) => s === null);
    if (emptyIdx >= 0) slots[emptyIdx] = item;
  }
  return slots;
}

export function buildGongfaSlotsFromParsed(parsed: InitStateParsed): GongfaSlotsState {
  const slots: GongfaSlotsState = [null, null, null, null, null, null, null, null];
  for (const item of parsed.gongfas) {
    const emptyIdx = slots.findIndex((s) => s === null);
    if (emptyIdx >= 0) slots[emptyIdx] = item;
  }
  return slots;
}

export function buildInventoryFromParsed(parsed: InitStateParsed, _realmMajor: string, slotCount: number): Array<InventoryStackItem | null> {
  let stoneTotal = 0;
  const nonStoneItems: InventoryStackItem[] = [];
  for (const item of parsed.storage) {
    if (item && "type" in item && (item as any).type === "灵石") {
      stoneTotal += (item as any).count;
    } else {
      nonStoneItems.push(item);
    }
  }
  const stoneStack = { name: "灵石" as const, count: stoneTotal, desc: "修仙界通用货币，蕴含灵气，用于交易和修炼。" as const, type: "灵石" as const };
  const items: InventoryStackItem[] = [stoneStack, ...nonStoneItems];
  const rest = Math.max(0, slotCount - items.length);
  return [...items, ...Array.from({ length: rest }, () => null)];
}
