import { INIT_STATE_SYSTEM_PRESET } from "./init_state_preset";
import { extractTagContent, tryParseJsonArray, parseEquipObject, parseGongfaObject, parseStorageObject } from "./parseAiItem";
import { completeChatWithMessagesJson, type JsonChatRequestPayload } from "./openAiChatBridge";
import {
  EQUIP_SLOT_COUNT,
  REALM_ORDER,
  SUB_STAGES,
  type ProtagonistPlayInfo,
  type EquippedSlotsState,
  type GongfaSlotsState,
  type InventoryStackItem,
  type TreasureItemDefinition,
  type GongfaItemDefinition,
  type WorldLocation,
} from "../role_core/types/playInfo";
import { formatWorldLocationDash, parseWorldLocationFromDash } from "../role_core/types/worldLocation";
import type { NpcNearbyEntry, ActionSuggestions } from "./state_generate";
import { parseActionOptions } from "./state_generate";
import { originTagLines } from "../fate_choice/types";

export interface InitStateApiConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface InitStateGenerateInput extends InitStateApiConfig {
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
  nearbyNpcs: NpcNearbyEntry[];
  storySnapshot: string;
  protagonistAge: number | null;
  actionOptions: ActionSuggestions | null;
}

const DEFAULT_INIT_STATE_TEMPERATURE = 0.55;
const DEFAULT_INIT_STATE_MAX_TOKENS = 16384;

const MJ_WORLD_BODY_OPEN = "<mj_world_body>";
const MJ_WORLD_BODY_CLOSE = "</mj_world_body>";
const MJ_EQUIP_BODY_OPEN = "<mj_equip_body>";
const MJ_EQUIP_BODY_CLOSE = "</mj_equip_body>";
const MJ_MAGIC_BODY_OPEN = "<mj_magic_body>";
const MJ_MAGIC_BODY_CLOSE = "</mj_magic_body>";
const MJ_STORAGE_BODY_OPEN = "<mj_storage_body>";
const MJ_STORAGE_BODY_CLOSE = "</mj_storage_body>";
const TAG_USER_STATE_OPEN = "<USER_STATE_TAG>";
const TAG_USER_STATE_CLOSE = "</USER_STATE_TAG>";
const TAG_NPC_NEARBY_OPEN = "<NPC_NEARBY_TAG>";
const TAG_NPC_NEARBY_CLOSE = "</NPC_NEARBY_TAG>";
const TAG_STORY_SNAPSHOT_OPEN = "<mj_story_snapshot>";
const TAG_STORY_SNAPSHOT_CLOSE = "</mj_story_snapshot>";
const TAG_AGE_OPEN = "<mj_protagonist_age>";
const TAG_AGE_CLOSE = "</mj_protagonist_age>";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const VALID_MAJOR_SET = new Set<string>(REALM_ORDER as readonly string[]);
const VALID_MINOR_SET = new Set<string>(SUB_STAGES as readonly string[]);

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

function parseInitNearbyNpcs(raw: string): NpcNearbyEntry[] {
  const text = extractTagContent(raw, TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  return arr
    .map((e: unknown): NpcNearbyEntry | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
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
        isDead: o.isDead === true,
        favorability: typeof o.favorability === "number" ? o.favorability : 0,
        race: (typeof o.race === "string" && ["修仙者", "人形妖兽", "妖兽"].includes(o.race)) ? o.race as "修仙者" | "人形妖兽" | "妖兽" : "修仙者",
        appearance: String(o.appearance || ""),
        clothing: String(o.clothing || ""),
        gender: String(o.gender || "男"),
        age: typeof o.age === "number" ? o.age : 0,
        linggen,
        realm,
        hpPercent: typeof o.hpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.hpPercent))) : 100,
        mpPercent: typeof o.mpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.mpPercent))) : 100,
        equippedSlots: Array.isArray(o.equippedSlots) ? o.equippedSlots : undefined,
        gongfaSlots: Array.isArray(o.gongfaSlots) ? o.gongfaSlots : undefined,
        inventorySlots: Array.isArray(o.inventorySlots) ? o.inventorySlots : undefined,
      } as NpcNearbyEntry;
    })
    .filter((e): e is NpcNearbyEntry => e !== null);
}

export function parseInitStateAiResponse(raw: string, realmMajor: string, realmMinor: string, playerLinggen?: readonly string[] | null): InitStateParsed {
  const worldLocation = (() => {
    const s = raw == null ? "" : String(raw);
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

  const equips: TreasureItemDefinition[] = equipArr.map((e: unknown) => parseEquipObject(e, realmMajor, realmMinor));
  const gongfas: GongfaItemDefinition[] = magicArr.map((e: unknown) => parseGongfaObject(e, realmMajor, realmMinor, playerLinggen));
  const storage: InventoryStackItem[] = storageArr
    .map((e: unknown) => parseStorageObject(e, realmMajor, realmMinor, playerLinggen))
    .filter((item): item is InventoryStackItem => item !== null);

  let hpPercent = 100;
  let mpPercent = 100;
  if (userStateText) {
    const obj = safeJsonParse(userStateText);
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      hpPercent = typeof o.hpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.hpPercent))) : 100;
      mpPercent = typeof o.mpPercent === "number" ? Math.max(0, Math.min(100, Math.round(o.mpPercent))) : 100;
    }
  }

  const nearbyNpcs = parseInitNearbyNpcs(raw);

  const storySnapshot = extractTagContent(raw, TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE);

  const ageText = extractTagContent(raw, TAG_AGE_OPEN, TAG_AGE_CLOSE);
  let protagonistAge: number | null = null;
  if (ageText) {
    const parsed = parseInt(ageText.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) protagonistAge = parsed;
  }

  const actionOptions = parseActionOptions(raw);

  return { equips, gongfas, storage, worldLocation, hpPercent, mpPercent, nearbyNpcs, storySnapshot, protagonistAge, actionOptions };
}

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

function buildInitStateUserContent(input: InitStateGenerateInput): string {
  const p = input.protagonist;
  return [
    "【开局剧情正文】",
    input.storyBody,
    "",
    "【主角初始状态】",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    ...originTagLines(p.race ?? "", p.faction ?? ""),
    `境界：${p.realm.major}${p.realm.minor}`,
    `灵根：${p.linggen.join("") || "无"}`,
    `出身地点：${p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—"}`,
    "",
  ].join("\n");
}

export async function generateInitState(input: InitStateGenerateInput): Promise<InitStateParsed> {
  const messages = [
    { role: "system" as const, content: INIT_STATE_SYSTEM_PRESET },
    { role: "user" as const, content: buildInitStateUserContent(input) },
  ];

  const payload: JsonChatRequestPayload = {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages,
    temperature: input.temperature ?? DEFAULT_INIT_STATE_TEMPERATURE,
    max_tokens: input.max_tokens ?? DEFAULT_INIT_STATE_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };

  const raw = await completeChatWithMessagesJson(payload);
  const r = input.protagonist.realm;
  return parseInitStateAiResponse(raw, r.major, r.minor, input.protagonist.linggen);
}
