import { FINALE_STORY_SYSTEM_PRESET } from "./finale_story_preset";
import { PRESET } from "./preset";
import {
  completeChatWithMessagesJson,
  type JsonChatRequestPayload,
  type ChatMessage,
} from "./openAiChatBridge";
import type { ProtagonistPlayInfo } from "../role_core/types/playInfo";
import type { StoryChatEntry } from "./story_generate";
import { matchWorldLore } from "./worldLore";
import { formatWorldLocationDash } from "../role_core/types/worldLocation";
import { originTagLines } from "../fate_choice/types";

export interface FinaleStoryInput {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  protagonist: ProtagonistPlayInfo;
  chatHistory: StoryChatEntry[];
  /** 死亡原因，如「战败身亡，魂归天地」「寿元耗尽，坐化于世」。 */
  deathReason: string;
  /** 死亡当下场景的补充描述（战败时为战斗结局摘要），供走马灯开头承接。 */
  sceneContext?: string;
  /** 一生中重要的羁绊 NPC 简表，供走马灯回忆人物。 */
  npcSnapshot?: string;
}

export interface FinaleStoryParsed {
  storyBody: string;
}

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 16384;

const MJ_FINALE_BODY_OPEN = "<mj_finale_body>";
const MJ_FINALE_BODY_CLOSE = "</mj_finale_body>";

function extractFinaleBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  let searchFrom = 0;
  const tOpen = s.indexOf("<thinking>");
  if (tOpen >= 0) {
    const tClose = s.indexOf("</thinking>", tOpen);
    if (tClose >= 0) {
      searchFrom = tClose + "</thinking>".length;
    }
  }
  const i = s.indexOf(MJ_FINALE_BODY_OPEN, searchFrom);
  if (i < 0) return s.trim();
  const from = i + MJ_FINALE_BODY_OPEN.length;
  const j = s.indexOf(MJ_FINALE_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

function narrationPersonLine(person: ProtagonistPlayInfo["narrationPerson"]): string {
  switch (person) {
    case "first":
      return "叙事人称：第一人称——以主角口吻，用「我」叙述（走马灯为主角濒死时的意识流）。";
    case "third":
      return "叙事人称：第三人称——以旁观视角写主角，用「他/她」或其姓名指代。";
    case "second":
    default:
      return "叙事人称：第二人称——面向主角，用「你」「您」书写。";
  }
}

function buildFinaleUserContent(input: FinaleStoryInput): string {
  const p = input.protagonist;
  const origin = p.originStory?.trim() || "—";
  const birthPlace = p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—";
  const linggenText = (p as { linggen?: string[] }).linggen?.join("") || "无";

  const sceneLine = input.sceneContext?.trim()
    ? `\n\n【死亡场景】\n${input.sceneContext.trim()}`
    : "";

  const npcSection = input.npcSnapshot?.trim()
    ? `\n\n【一生中的重要人物】\n${input.npcSnapshot.trim()}`
    : "";

  return [
    `【死亡原因】${input.deathReason}`,
    narrationPersonLine(p.narrationPerson),
    "",
    "【主角生平】",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    ...originTagLines(p.race ?? "", p.faction ?? ""),
    `境界：${p.realm.major}${p.realm.minor}${p.realmComplete ? "·圆满" : ""}`,
    `灵根：${linggenText}`,
    `享年：${p.age}岁（寿元上限${p.shouyuan}岁）`,
    "",
    "【出身背景】",
    `出身地点：${birthPlace}`,
    origin,
    sceneLine,
    npcSection,
    "",
    "请根据以上信息与【主角的一生轨迹】，以走马灯的形式回顾主角的一生——从凡人出身、踏入修仙、关键羁绊、巅峰转折，到最终的陨落与遗恨。这是结局叙事，主角已死，不要复活，不要留悬念。",
  ].join("\n");
}

export function buildFinaleStoryRequestPayload(input: FinaleStoryInput): JsonChatRequestPayload {
  const messages: ChatMessage[] = [];

  // 从 chatHistory 中提取所有 assistant 内容（一生轨迹的 snapshot），注入 system prompt。
  const storyParts: string[] = [];
  for (const entry of input.chatHistory) {
    if (entry.role === "assistant") {
      storyParts.push(entry.content);
    }
  }

  const systemParts = [PRESET, FINALE_STORY_SYSTEM_PRESET];
  if (storyParts.length > 0) {
    systemParts.push("【主角的一生轨迹】\n" + storyParts.join("\n\n---\n\n"));
  }
  // 世界设定按关键词命中注入；本轮焦点取死亡原因与死亡场景。
  const lore = matchWorldLore({
    chatHistory: input.chatHistory,
    playerInput: [input.deathReason, input.sceneContext].filter(Boolean).join("\n"),
    npcSnapshot: input.npcSnapshot,
  });
  if (lore) systemParts.push(lore);
  messages.push({ role: "system", content: systemParts.join("\n\n") });

  messages.push({
    role: "user",
    content: `[格式提醒：请严格将思考过程包裹在<thinking>...</thinking>标签内，正文包裹在 <mj_finale_body>...</mj_finale_body> 标签内。]\n\n${buildFinaleUserContent(input)}`,
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

export async function generateFinaleStory(input: FinaleStoryInput): Promise<FinaleStoryParsed> {
  const raw = await completeChatWithMessagesJson(buildFinaleStoryRequestPayload(input));
  return { storyBody: extractFinaleBody(raw) };
}
