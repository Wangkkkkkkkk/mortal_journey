/**
 * 正式剧情生成：将 preset 中的 system 预设、历史对话（assistant/user 交替）与玩家新输入组装为 messages，
 * 调用桥接层获取 AI 回复，再解析 `<mj_story_body>` 与 `<mj_world_body>` 标签。
 */

import { INIT_STORY_SYSTEM_PRESET } from "./preset";
import {
  completeChatWithMessagesJson,
  type JsonChatRequestPayload,
  type ChatMessage,
} from "../lib/openAiChatBridge";
import { formatLinggenElements, formatRealmLine } from "../lib/protagonistPanelDisplay";
import type { NarrationPerson } from "../fate_choice/types";
import type { ProtagonistPlayInfo, EquippedSlotsState, GongfaSlotsState, InventoryStackItem } from "../types/playInfo";

export interface StoryApiConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface StoryChatEntry {
  role: "user" | "assistant";
  content: string;
}

export interface StoryGenerateInput extends StoryApiConfig {
  protagonist: ProtagonistPlayInfo;
  /** 完整聊天历史（user/assistant 交替，最早在前）；最后一条为玩家本次输入 */
  chatHistory: StoryChatEntry[];
  /** 当前世界地点（上一次生成结果），传入后 AI 可据此判断是否需要更换地点 */
  currentWorldLocation?: string;
}

const DEFAULT_STORY_TEMPERATURE = 0.55;
const DEFAULT_STORY_MAX_TOKENS = 16384;

const MJ_STORY_BODY_OPEN = "<mj_story_body>";
const MJ_STORY_BODY_CLOSE = "</mj_story_body>";
const MJ_WORLD_BODY_OPEN = "<mj_world_body>";
const MJ_WORLD_BODY_CLOSE = "</mj_world_body>";

export interface StoryParsed {
  storyBody: string;
  worldLocation: string;
}

export function extractMjWorldBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  const i = s.indexOf(MJ_WORLD_BODY_OPEN);
  if (i < 0) return "";
  const from = i + MJ_WORLD_BODY_OPEN.length;
  const j = s.indexOf(MJ_WORLD_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

export function extractMjStoryBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  const i = s.indexOf(MJ_STORY_BODY_OPEN);
  if (i < 0) return s.trim();
  const from = i + MJ_STORY_BODY_OPEN.length;
  const j = s.indexOf(MJ_STORY_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

export function parseStoryAiResponse(raw: string): StoryParsed {
  return {
    storyBody: extractMjStoryBody(raw),
    worldLocation: extractMjWorldBody(raw),
  };
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
  const bonusStr = slot.bonus && Object.keys(slot.bonus).length > 0
    ? "，加成：" + Object.entries(slot.bonus).map(([k, v]) => `${k}+${v}`).join("、")
    : "";
  return `${label}：${slot.name}（${slot.grade}）${slot.desc ? "—" + slot.desc : ""}${bonusStr}`;
}

function formatEquippedSlots(slots: EquippedSlotsState): string {
  return [
    formatEquipSlot("武器", slots.weapon),
    formatEquipSlot("法器", slots.faqi),
    formatEquipSlot("防具", slots.armor),
  ].join("\n");
}

function formatGongfaSlots(slots: GongfaSlotsState): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const g = slots[i];
    if (!g) continue;
    const bonusStr = g.bonus && Object.keys(g.bonus).length > 0
      ? "，加成：" + Object.entries(g.bonus).map(([k, v]) => `${k}+${v}`).join("、")
      : "";
    const sub = "subtype" in g ? g.subtype : "";
    const label = sub ? `${sub}功法` : "功法";
    lines.push(`${label}：${g.name}（${g.grade}）${g.desc ? "—" + g.desc : ""}${bonusStr}`);
  }
  return lines.length > 0 ? lines.join("\n") : "无";
}

function formatInventoryItem(item: InventoryStackItem): string {
  if ("type" in item && item.type === "灵石") {
    return `${item.name}×${item.count}`;
  }
  const d = item as { name?: string; grade?: string; count?: number; desc?: string };
  const grade = d.grade ? `（${d.grade}）` : "";
  const desc = d.desc ? `—${d.desc}` : "";
  return `${d.name || "未知物品"}${grade}×${d.count || 1}${desc}`;
}

function formatInventorySlots(slots: Array<InventoryStackItem | null>): string {
  const items = slots.filter((s): s is InventoryStackItem => s !== null);
  if (items.length === 0) return "无";
  return items.map(formatInventoryItem).join("、");
}

function buildStoryUserSummary(protagonist: ProtagonistPlayInfo, currentWorldLocation?: string): string {
  const p = protagonist;
  const locationHint = currentWorldLocation?.trim()
    ? `\n当前所在地点：${currentWorldLocation.trim()}`
    : "";

  return [
    "【主角摘要 · 请据此与历史剧情继续生成后续剧情】",
    "",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    narrationPersonLine(p.narrationPerson),
    `境界：${formatRealmLine(p.realm)}`,
    `灵根：${formatLinggenElements(p.linggen)}`,
    locationHint,
    "",
    "【装备】",
    formatEquippedSlots(p.equippedSlots),
    "",
    "【功法】",
    formatGongfaSlots(p.gongfaSlots),
    "",
    "【储物袋】",
    formatInventorySlots(p.inventorySlots),
    "",
  ].join("\n");
}

export function buildStoryRequestPayload(input: StoryGenerateInput): JsonChatRequestPayload {
  const messages: ChatMessage[] = [];

  messages.push({ role: "system", content: INIT_STORY_SYSTEM_PRESET });

  messages.push({
    role: "user",
    content: buildStoryUserSummary(input.protagonist, input.currentWorldLocation),
  });

  for (const entry of input.chatHistory) {
    messages.push({ role: entry.role, content: entry.content });
  }

  return {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages,
    temperature: input.temperature ?? DEFAULT_STORY_TEMPERATURE,
    max_tokens: input.max_tokens ?? DEFAULT_STORY_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };
}

export async function generateStory(input: StoryGenerateInput): Promise<StoryParsed> {
  const raw = await completeChatWithMessagesJson(buildStoryRequestPayload(input));
  return parseStoryAiResponse(raw);
}
