import { CULTIVATION_STORY_SYSTEM_PRESET } from "./cultivation_story_preset";
import { PRESET } from "./preset";
import {
  completeChatWithMessagesJson,
  type JsonChatRequestPayload,
  type ChatMessage,
} from "./openAiChatBridge";
import type { ProtagonistPlayInfo, EquippedSlotsState, GongfaSlotsState, InventoryStackItem } from "../role_core/types/playInfo";
import type { StoryChatEntry } from "./story_generate";
import { matchWorldLore } from "./worldLore";
import { formatWorldLocationDash } from "../role_core/types/worldLocation";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { originTagLines } from "../fate_choice/types";

export interface CultivationStoryInput {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  gongfaName: string;
  gongfaGrade: string;
  gongfaSystem: string;
  currentMastery: number;
  currentMasteryExp: number;
  masteryThreshold: number;
  spiritStoneCount: number;
  estimatedMonths: number;
  protagonist: ProtagonistPlayInfo;
  currentWorldLocation?: WorldLocation | null;
  npcSnapshot?: string;
  chatHistory: StoryChatEntry[];
}

export interface CultivationStoryParsed {
  storyBody: string;
}

const DEFAULT_TEMPERATURE = 0.55;
const DEFAULT_MAX_TOKENS = 65535;

const MJ_CULTIVATION_BODY_OPEN = "<mj_cultivation_body>";
const MJ_CULTIVATION_BODY_CLOSE = "</mj_cultivation_body>";

function extractCultivationBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  let searchFrom = 0;
  const tOpen = s.indexOf("<thinking>");
  if (tOpen >= 0) {
    const tClose = s.indexOf("</thinking>", tOpen);
    if (tClose >= 0) {
      searchFrom = tClose + "</thinking>".length;
    }
  }
  const i = s.indexOf(MJ_CULTIVATION_BODY_OPEN, searchFrom);
  if (i < 0) return s.trim();
  const from = i + MJ_CULTIVATION_BODY_OPEN.length;
  const j = s.indexOf(MJ_CULTIVATION_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

function formatEquipSlots(slots: EquippedSlotsState): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    lines.push(`法宝${i + 1}：${s.name}（${s.grade}）`);
  }
  return lines.length > 0 ? lines.join("\n") : "无";
}

function formatGongfaSlots(slots: GongfaSlotsState, highlightName?: string): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const g = slots[i];
    if (!g) continue;
    const mastery = g.mastery ?? 1;
    const marker = g.name === highlightName ? " ← 当前修炼" : "";
    lines.push(`功法：${g.name}（${g.grade}，第${mastery}层/10层）${marker}`);
  }
  return lines.length > 0 ? lines.join("\n") : "无";
}

function formatInventory(slots: Array<InventoryStackItem | null>): string {
  const items = slots.filter((s): s is InventoryStackItem => s !== null);
  if (items.length === 0) return "无";
  return items.map(item => {
    if ("type" in item && item.type === "灵石") return `${item.name}×${item.count}`;
    const d = item as { name?: string; grade?: string; count?: number };
    return `${d.name || "未知物品"}${d.grade ? `（${d.grade}）` : ""}×${d.count || 1}`;
  }).join("、");
}

function buildTimePreview(months: number): string {
  if (months <= 0) return "无";
  const years = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}年`);
  if (m > 0) parts.push(`${m}个月`);
  return parts.join("");
}

function buildCultivationUserContent(input: CultivationStoryInput): string {
  const p = input.protagonist;
  const locationStr = input.currentWorldLocation
    ? formatWorldLocationDash(input.currentWorldLocation)
    : "未知";
  const timePreview = buildTimePreview(input.estimatedMonths);
  const masteryInfo = input.currentMastery >= 10
    ? "已圆满（第10层/10层）"
    : `第${input.currentMastery}层/10层，熟练度${input.currentMasteryExp}/${input.masteryThreshold}`;

  const npcSection = input.npcSnapshot?.trim()
    ? `\n【周围人物】\n${input.npcSnapshot.trim()}\n`
    : "";

  return [
    "【修炼参数】",
    `修炼功法：${input.gongfaName}（${input.gongfaGrade}，${input.gongfaSystem}）`,
    `功法熟练度：${masteryInfo}`,
    `消耗灵石：${input.spiritStoneCount}枚`,
    `预计修炼时间：${timePreview}`,
    "",
    "【主角状态】",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    ...originTagLines(p.race ?? "", p.faction ?? ""),
    `境界：${p.realm.major}${p.realm.minor}${p.realmComplete ? "·圆满" : ""}`,
    `修为状态：${p.realmComplete ? "修为已圆满" : "修为未圆满"}`,
    `灵根：${(p as { linggen?: string[] }).linggen?.join("") || "无"}`,
    `当前血量：${p.currentHp}/${p.maxHp}`,
    `当前法力：${p.currentMp}/${p.maxMp}`,
    "",
    "【装备】",
    formatEquipSlots(p.equippedSlots),
    "",
    "【功法】",
    formatGongfaSlots(p.gongfaSlots, input.gongfaName),
    "",
    "【储物袋】",
    formatInventory(p.inventorySlots),
    "",
    `当前地点：${locationStr}`,
    npcSection,
    "",
    "请根据以上修炼参数和主角状态，生成一段沉浸式的修炼剧情。功法名称、体系特征、灵石消耗、时间流逝都必须准确体现。",
  ].join("\n");
}

export function buildCultivationStoryRequestPayload(input: CultivationStoryInput): JsonChatRequestPayload {
  const messages: ChatMessage[] = [];

  const storyParts: string[] = [];
  for (const entry of input.chatHistory) {
    if (entry.role === "assistant") {
      storyParts.push(entry.content);
    }
  }

  const systemParts = [PRESET, CULTIVATION_STORY_SYSTEM_PRESET];
  if (storyParts.length > 0) {
    systemParts.push("【之前的剧情】\n" + storyParts.join("\n\n---\n\n"));
  }
  // 世界设定按关键词命中注入；本轮焦点取所修功法名（可命中该功法/体系的设定）。
  const lore = matchWorldLore({
    chatHistory: input.chatHistory,
    playerInput: input.gongfaName,
    worldLocation: input.currentWorldLocation ? formatWorldLocationDash(input.currentWorldLocation) : undefined,
    npcSnapshot: input.npcSnapshot,
  });
  if (lore) systemParts.push(lore);
  messages.push({ role: "system", content: systemParts.join("\n\n") });

  messages.push({
    role: "user",
    content: `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_cultivation_body>...</mj_cultivation_body> 标签内。]\n\n${buildCultivationUserContent(input)}`,
  });

  return {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages,
    temperature: input.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: input.max_tokens ?? DEFAULT_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };
}

export async function generateCultivationStory(input: CultivationStoryInput): Promise<CultivationStoryParsed> {
  const raw = await completeChatWithMessagesJson(buildCultivationStoryRequestPayload(input));
  return { storyBody: extractCultivationBody(raw) };
}
