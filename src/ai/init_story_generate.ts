import { INIT_STORY_SYSTEM_PRESET } from "./init_story_preset";
import { PRESET } from "./preset";
import { completeChatWithMessagesJson, type JsonChatRequestPayload } from "./openAiChatBridge";
import { Protagonist } from "../role_core/Protagonist";
import type { ProtagonistPlayInfo, NarrationPerson, TraitEntry } from "../role_core/types/playInfo";
import { formatWorldLocationDash } from "../role_core/types/worldLocation";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { originTagLines } from "../fate_choice/types";

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
  userStoryHint?: string;
}

export interface InitStoryParsed {
  storyBody: string;
}

const DEFAULT_INIT_STORY_TEMPERATURE = 0.55;
const DEFAULT_INIT_STORY_MAX_TOKENS = 65535;

const MJ_STORY_BODY_OPEN = "<mj_story_body>";
const MJ_STORY_BODY_CLOSE = "</mj_story_body>";

export function extractInitStoryBody(raw: string): string {
  const s = raw == null ? "" : String(raw);
  let searchFrom = 0;
  const tOpen = s.indexOf("<thinking>");
  if (tOpen >= 0) {
    const tClose = s.indexOf("</thinking>", tOpen);
    if (tClose >= 0) {
      searchFrom = tClose + "</thinking>".length;
    }
  }
  const i = s.indexOf(MJ_STORY_BODY_OPEN, searchFrom);
  if (i < 0) return s.trim();
  const from = i + MJ_STORY_BODY_OPEN.length;
  const j = s.indexOf(MJ_STORY_BODY_CLOSE, from);
  if (j < 0) return s.slice(from).trim();
  return s.slice(from, j).trim();
}

function hasCompleteStoryBody(raw: string): boolean {
  const s = raw == null ? "" : String(raw);
  let searchFrom = 0;
  const tOpen = s.indexOf("<thinking>");
  if (tOpen >= 0) {
    const tClose = s.indexOf("</thinking>", tOpen);
    if (tClose >= 0) {
      searchFrom = tClose + "</thinking>".length;
    }
  }
  const i = s.indexOf(MJ_STORY_BODY_OPEN, searchFrom);
  if (i < 0) return false;
  return s.indexOf(MJ_STORY_BODY_CLOSE, i + MJ_STORY_BODY_OPEN.length) >= 0;
}

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

export function buildInitStoryUserContent(protagonist: ProtagonistPlayInfo, userStoryHint?: string): string {
  const p = protagonist;
  const place = p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—";
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
    ...originTagLines(p.race ?? "", p.faction ?? ""),
    narrationPersonLine(p.narrationPerson),
    `境界：${Protagonist.formatRealm(p.realm)}`,
    `灵根：${Protagonist.formatLinggenElements(p.linggen)}`,
    `灵根数量：${p.linggen.length}`,
    `寿元：${p.shouyuan}岁`,
    `出身地点：${place}`,
    "",
    "【出身情况】",
    origin,
    "",
    hint,
    "",
  ].join("\n");
}

export function buildInitStoryRequestPayload(input: InitStoryGenerateInput): JsonChatRequestPayload {
  const userContent = buildInitStoryUserContent(input.protagonist, input.userStoryHint);
  return {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: [
      { role: "system", content: [PRESET, INIT_STORY_SYSTEM_PRESET].join("\n\n") },
      { role: "user", content: userContent },
    ],
    temperature: DEFAULT_INIT_STORY_TEMPERATURE,
    max_tokens: DEFAULT_INIT_STORY_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };
}

export async function generateInitStory(input: InitStoryGenerateInput): Promise<InitStoryParsed> {
  const payload = buildInitStoryRequestPayload(input);
  let raw = await completeChatWithMessagesJson(payload);
  if (!hasCompleteStoryBody(raw)) {
    raw = await completeChatWithMessagesJson(payload);
  }
  return { storyBody: extractInitStoryBody(raw) };
}
