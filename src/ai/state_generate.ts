/**
 * 剧情状态更新：每次剧情生成后，根据主角当前状态与剧情正文，请求 AI 输出
 * 血量/法力变更、灵石增减、物品添加/移除，并解析为结构化结果供调用方应用。
 */

import { INIT_STORY_SYSTEM_PRESET } from "./state";
import {
  completeChatWithMessagesJson,
  type JsonChatRequestPayload,
  type ChatMessage,
} from "../lib/openAiChatBridge";
import { formatLinggenElements, formatRealmLine } from "../lib/protagonistPanelDisplay";
import type { ProtagonistPlayInfo, EquippedSlotsState, GongfaSlotsState, InventoryStackItem } from "../types/playInfo";
import type { NarrationPerson } from "../types/fateChoice";

export interface StateApiConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface StateGenerateInput extends StateApiConfig {
  protagonist: ProtagonistPlayInfo;
  /** 本轮生成的剧情正文 */
  storyBody: string;
}

const DEFAULT_STATE_TEMPERATURE = 0.55;
const DEFAULT_STATE_MAX_TOKENS = 16384;

const TAG_USER_STATE_OPEN = "<USER_STATE_TAG>";
const TAG_USER_STATE_CLOSE = "</USER_STATE_TAG>";
const TAG_SPIRIT_STONE_OPEN = "<SPIRIT_STONE_TAG>";
const TAG_SPIRIT_STONE_CLOSE = "</SPIRIT_STONE_TAG>";
const TAG_ITEM_ADD_OPEN = "<ITEM_ADD_TAG>";
const TAG_ITEM_ADD_CLOSE = "</ITEM_ADD_TAG>";
const TAG_ITEM_REMOVE_OPEN = "<ITEM_REMOVE_TAG>";
const TAG_ITEM_REMOVE_CLOSE = "</ITEM_REMOVE_TAG>";

export interface UserStateChange {
  currentHp: number;
  currentMp: number;
}

export interface SpiritStoneChange {
  op: "add" | "remove";
  name: string;
  count: number;
}

export interface ItemAddEntry {
  type: string;
  name: string;
  intro: string;
  grade: string;
  bonus?: string[] | Record<string, number>;
  count: number;
}

export interface ItemRemoveEntry {
  name: string;
  count: number;
}

const TAG_NPC_NEARBY_OPEN = "<NPC_NEARBY_TAG>";
const TAG_NPC_NEARBY_CLOSE = "</NPC_NEARBY_TAG>";

export interface NpcNearbyEntry {
  displayName: string;
  identity: string;
  isVisible: boolean;
  isDead: boolean;
  favorability: number;
  currentStageGoal: string;
  longTermGoal: string;
  hobby: string;
  fear: string;
  personality: string;
  gender: string;
  age: number;
  linggen: string[];
  realm: { major: string; minor: string };
  currentHp: number;
  currentMp: number;
  maxHp: number;
  maxMp: number;
  id: string;
  [key: string]: unknown;
}

export interface StateParsed {
  userState: UserStateChange | null;
  spiritStoneChanges: SpiritStoneChange[];
  itemAdds: ItemAddEntry[];
  itemRemoves: ItemRemoveEntry[];
  nearbyNpcs: NpcNearbyEntry[];
}

function extractTagContent(raw: string, openTag: string, closeTag: string): string {
  const i = raw.indexOf(openTag);
  if (i < 0) return "";
  const from = i + openTag.length;
  const j = raw.indexOf(closeTag, from);
  if (j < 0) return raw.slice(from).trim();
  return raw.slice(from, j).trim();
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryParseJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        const segment = trimmed.slice(start, end + 1);
        const parsed = JSON.parse(segment);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fallback
      }
    }
  }
  return [];
}

export function parseStateAiResponse(raw: string): StateParsed {
  const userStateText = extractTagContent(raw, TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE);
  const spiritStoneText = extractTagContent(raw, TAG_SPIRIT_STONE_OPEN, TAG_SPIRIT_STONE_CLOSE);
  const itemAddText = extractTagContent(raw, TAG_ITEM_ADD_OPEN, TAG_ITEM_ADD_CLOSE);
  const itemRemoveText = extractTagContent(raw, TAG_ITEM_REMOVE_OPEN, TAG_ITEM_REMOVE_CLOSE);

  let userState: UserStateChange | null = null;
  if (userStateText) {
    const obj = safeJsonParse(userStateText);
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      const hp = typeof o.currentHp === "number" ? Math.round(o.currentHp) : 0;
      const mp = typeof o.currentMp === "number" ? Math.round(o.currentMp) : 0;
      userState = { currentHp: hp, currentMp: mp };
    }
  }

  const stoneArr = tryParseJsonArray(spiritStoneText);
  const spiritStoneChanges: SpiritStoneChange[] = stoneArr
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const op = String(o.op || "").trim();
      if (op !== "add" && op !== "remove") return null;
      const name = String(o.name || "").trim();
      const count = typeof o.count === "number" ? Math.max(1, Math.floor(o.count)) : 1;
      if (!name) return null;
      return { op, name, count } as SpiritStoneChange;
    })
    .filter((c): c is SpiritStoneChange => c !== null);

  const addArr = tryParseJsonArray(itemAddText);
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
      const bonus = Array.isArray(o.bonus) || (typeof o.bonus === "object" && o.bonus !== null)
        ? o.bonus as string[] | Record<string, number>
        : undefined;
      return { type, name, intro, grade, bonus, count } as ItemAddEntry;
    })
    .filter((e): e is ItemAddEntry => e !== null);

  const removeArr = tryParseJsonArray(itemRemoveText);
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

  return { userState, spiritStoneChanges, itemAdds, itemRemoves, nearbyNpcs: parseNearbyNpcs(raw) };
}

function parseNearbyNpcs(raw: string): NpcNearbyEntry[] {
  const text = extractTagContent(raw, TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE);
  const arr = tryParseJsonArray(text);
  return arr
    .map((e: unknown): NpcNearbyEntry | null => {
      if (!e || typeof e !== "object") return null;
      const o = e as Record<string, unknown>;
      const displayName = String(o.displayName || "").trim();
      if (!displayName) return null;
      const realm = o.realm && typeof o.realm === "object" ? o.realm as { major: string; minor: string } : { major: "练气", minor: "初期" };
      const linggenRaw = o.linggen;
      const linggen = Array.isArray(linggenRaw)
        ? linggenRaw.map((x: unknown) => String(x).trim()).filter(Boolean)
        : typeof linggenRaw === "string"
          ? linggenRaw.split("").filter((c: string) => "金木水火土".includes(c))
          : [];
      const parsed: NpcNearbyEntry = {
        displayName,
        identity: String(o.identity || ""),
        isVisible: o.isVisible !== false,
        isDead: o.isDead === true,
        favorability: typeof o.favorability === "number" ? o.favorability : 0,
        currentStageGoal: String(o.currentStageGoal || ""),
        longTermGoal: String(o.longTermGoal || ""),
        hobby: String(o.hobby || ""),
        fear: String(o.fear || ""),
        personality: String(o.personality || ""),
        gender: String(o.gender || "男"),
        age: typeof o.age === "number" ? o.age : 0,
        linggen,
        realm,
        currentHp: typeof o.currentHp === "number" ? o.currentHp : 100,
        currentMp: typeof o.currentMp === "number" ? o.currentMp : 50,
        maxHp: typeof o.maxHp === "number" ? o.maxHp : 100,
        maxMp: typeof o.maxMp === "number" ? o.maxMp : 50,
        id: String(o.id || `npc_${displayName}`),
      };
      return parsed;
    })
    .filter((e): e is NpcNearbyEntry => e !== null);
}

function narrationPersonLine(person: NarrationPerson): string {
  switch (person) {
    case "first":
      return "叙事人称：第一人称——以主角口吻，用「我」「我们」等叙述。";
    case "third":
      return "叙事人称：第三人称——以旁观视角写主角，用「他/她」或其姓名指代主角。";
    case "second":
    default:
      return "叙事人称：第二人称——面向玩家，将主角作为「你」「您」书写。";
  }
}

function formatEquipSlot(label: string, slot: EquippedSlotsState[keyof EquippedSlotsState]): string {
  if (!slot) return `${label}：无`;
  return `${label}：${slot.name}（${slot.grade}）`;
}

function formatGongfaSlots(slots: GongfaSlotsState): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const g = slots[i];
    if (!g) continue;
    const sub = "subtype" in g ? g.subtype : "";
    const label = sub ? `${sub}功法` : "功法";
    lines.push(`${label}：${g.name}（${g.grade}）`);
  }
  return lines.length > 0 ? lines.join("\n") : "无";
}

function formatInventoryItems(slots: Array<InventoryStackItem | null>): string {
  const items = slots.filter((s): s is InventoryStackItem => s !== null);
  if (items.length === 0) return "无";
  return items.map((item) => {
    if ("type" in item && item.type === "灵石") return `${item.name}×${item.count}`;
    const d = item as { name?: string; grade?: string; count?: number };
    return `${d.name || "未知物品"}（${d.grade || "下品"}）×${d.count || 1}`;
  }).join("、");
}

function buildStateUserContent(protagonist: ProtagonistPlayInfo, storyBody: string): string {
  const p = protagonist;
  return [
    "【状态更新请求 · 请根据以下剧情更新主角状态】",
    "",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    narrationPersonLine(p.narrationPerson),
    `境界：${formatRealmLine(p.realm)}`,
    `灵根：${formatLinggenElements(p.linggen)}`,
    `当前血量：${p.currentHp}/${p.maxHp}`,
    `当前法力：${p.currentMp}/${p.maxMp}`,
    "",
    "【当前装备】",
    formatEquipSlot("武器", p.equippedSlots.weapon),
    formatEquipSlot("法器", p.equippedSlots.faqi),
    formatEquipSlot("防具", p.equippedSlots.armor),
    "",
    "【当前功法】",
    formatGongfaSlots(p.gongfaSlots),
    "",
    "【当前储物袋】",
    formatInventoryItems(p.inventorySlots),
    "",
    "【本次剧情】",
    storyBody,
    "",
  ].join("\n");
}

export function buildStateRequestPayload(input: StateGenerateInput): JsonChatRequestPayload {
  const userContent = buildStateUserContent(input.protagonist, input.storyBody);
  return {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: [
      { role: "system", content: INIT_STORY_SYSTEM_PRESET },
      { role: "user", content: userContent },
    ],
    temperature: input.temperature ?? DEFAULT_STATE_TEMPERATURE,
    max_tokens: input.max_tokens ?? DEFAULT_STATE_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };
}

export async function generateState(input: StateGenerateInput): Promise<StateParsed> {
  const raw = await completeChatWithMessagesJson(buildStateRequestPayload(input));
  return parseStateAiResponse(raw);
}
