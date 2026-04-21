/**
 * 开局首段剧情：将 `init_preset` 的 system 与主角档案整理为 user，组装 `JsonChatRequestPayload` 并调用桥接层。
 */

import { INIT_STORY_SYSTEM_PRESET } from "./init_preset";
import { completeChatWithMessagesJson, type JsonChatRequestPayload } from "../lib/openAiChatBridge";
import { formatLinggenElements, formatRealmLine } from "../lib/protagonistPanelDisplay";
import type { NarrationPerson } from "../types/fateChoice";
import type { ProtagonistPlayInfo, TraitEntry } from "../types/playInfo";

/** 调用网关所需字段 + 生成参数；`messages` 由本模块拼装，不必传入。 */
export interface InitStoryApiConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface InitStoryGenerateInput extends InitStoryApiConfig {
  protagonist: ProtagonistPlayInfo;
  /** 可选：玩家对开局剧情的额外说明，置于 user 消息末尾 */
  userStoryHint?: string;
}

const DEFAULT_INIT_STORY_TEMPERATURE = 0.55;
const DEFAULT_INIT_STORY_MAX_TOKENS = 16384;

const MJ_STORY_BODY_OPEN = "<mj_story_body>";
const MJ_STORY_BODY_CLOSE = "</mj_story_body>";

const MJ_WORLD_BODY_OPEN = "<mj_world_body>";
const MJ_WORLD_BODY_CLOSE = "</mj_world_body>";

export interface InitStoryParsed {
  storyBody: string;
  worldLocation: string;
}

/**
 * 从模型原文中取出 `<mj_world_body>` … `</mj_world_body>` 之间的世界地点（首尾去空白）。
 * 规则见 `init_preset`「世界地点生成规则」。
 */
export function extractMjWorldBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  const i = s.indexOf(MJ_WORLD_BODY_OPEN);
  if (i < 0) return "";
  const from = i + MJ_WORLD_BODY_OPEN.length;
  const j = s.indexOf(MJ_WORLD_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

/**
 * 从模型原文中取出 `<mj_story_body>` … `</mj_story_body>` 之间的正文（首尾去空白）。
 * - 成对出现：仅返回内部；
 * - 仅有开标签：返回开标签之后全文；
 * - 无开标签：回退为整段 `trim`（兼容未打标签的输出）。
 */
export function extractMjStoryBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  const i = s.indexOf(MJ_STORY_BODY_OPEN);
  if (i < 0) return s.trim();
  const from = i + MJ_STORY_BODY_OPEN.length;
  const j = s.indexOf(MJ_STORY_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

export function parseInitStoryAiResponse(raw: string): InitStoryParsed {
  return {
    storyBody: extractMjStoryBody(raw),
    worldLocation: extractMjWorldBody(raw),
  };
}

function formatTraitLine(t: TraitEntry): string {
  if (typeof t === "string") return t.trim() || "（未命名天赋）";
  const name = t.name?.trim() || "—";
  const d = t.desc?.trim();
  return d ? `${name}：${d}` : name;
}

/** 叙事人称：写入 user 供模型严格遵守 */
function narrationPersonLine(person: NarrationPerson): string {
  switch (person) {
    case "first":
      return "叙事人称：第一人称——以主角口吻，用「我」「我们」等叙述，不得全程改用第二人称「你」。";
    case "third":
      return "叙事人称：第三人称——以旁观视角写主角，用「他/她」或其姓名指代主角，不要用「你」指玩家。";
    case "second":
    default:
      return "叙事人称：第二人称——面向玩家，将主角作为「你」「您」书写，不要用「我」代主角。";
  }
}

/**
 * 将主角开局档案整理为一条 user 消息（简体中文提纲，供模型写首段剧情）。
 * 开局阶段不含年龄、寿元、修为、佩戴、功法栏与储物袋；含命运抉择中的出身地点与出身叙述。
 */
export function buildInitStoryUserContent(protagonist: ProtagonistPlayInfo, userStoryHint?: string): string {
  const p = protagonist;

  const place = p.birthPlace?.trim() || "—";
  const origin = p.originStory?.trim() || "—";

  const hint =
    userStoryHint != null && String(userStoryHint).trim() !== ""
      ? `\n【玩家对开局的补充说明】\n${String(userStoryHint).trim()}\n`
      : "";

  return [
    "【开局摘要 · 请据此撰写首段剧情】",
    "",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    narrationPersonLine(p.narrationPerson),
    `境界：${formatRealmLine(p.realm)}`,
    `灵根：${formatLinggenElements(p.linggen)}`,
    `出身地点：${place}`,
    "",
    "【出身情况】",
    origin,
    "",
    hint,
    "",
  ].join("\n");
}

/**
 * 组装 `completeChatWithMessagesJson` 所需的请求对象（system + user）。
 */
export function buildInitStoryRequestPayload(input: InitStoryGenerateInput): JsonChatRequestPayload {
  const userContent = buildInitStoryUserContent(input.protagonist, input.userStoryHint);
  return {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: [
      { role: "system", content: INIT_STORY_SYSTEM_PRESET },
      { role: "user", content: userContent },
    ],
    temperature: DEFAULT_INIT_STORY_TEMPERATURE,
    max_tokens: DEFAULT_INIT_STORY_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };
}

/**
 * 请求 AI 生成开局首段剧情，并解析 `<mj_story_body>` 正文与 `<mj_world_body>` 世界地点（见 `parseInitStoryAiResponse`）。
 */
export async function generateInitStory(input: InitStoryGenerateInput): Promise<InitStoryParsed> {
  const raw = await completeChatWithMessagesJson(buildInitStoryRequestPayload(input));
  return parseInitStoryAiResponse(raw);
}
