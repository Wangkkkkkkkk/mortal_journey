/**
 * @fileoverview 剧情正文按「【旁白】/【角色名】」行解析，支撑头像+对话式渲染。
 *
 * 解析发生在渲染层：`chatMessages` 中的原始 `content` 保留不变（仍用于
 * `buildChatHistory()` 喂 AI），仅展示时拆段。思路对齐 MoRanJiangHu 的
 * `解析正文日志`（storyResponseParser.ts）：
 * - 【旁白】/无标签行 → 旁白叙述段（居中，无头像）；
 * - 【角色名】台词 → 对话段（头像 + 名牌 + 气泡）。
 */

import type { ChatMessage } from "../role_core/storyStore";
import type { Protagonist } from "../role_core/Protagonist";
import type { Npc } from "../role_core/Npc";

/** 单条剧情段。 */
export interface StorySegment {
  kind: "narration" | "dialogue";
  /** 说话者规范化名（已去【】）；旁白固定为 "旁白"。 */
  sender: string;
  text: string;
}

/** 对话段的头像展示信息。 */
export interface DialogAvatarInfo {
  /** 名牌显示名（主角显示其本名）。 */
  name: string;
  /** 头像 URL；空串表示暂无头像（用首字彩色圆底）。 */
  avatarUrl: string;
  /** 无头像兜底的稳定底色。 */
  color: string;
  /** 是否主角台词（决定右对齐）。 */
  isProtagonist: boolean;
}

const NARRATION_SENDERS = new Set(["", "旁白", "叙述"]);

const TAG_LINE_RE = /^【\s*([^】]+?)\s*】\s*(.*)$/;

/** 说话者名规范化：剥掉常见包裹符号，去空白。 */
export function normalizeSender(raw: string): string {
  return (raw || "")
    .replace(/^[【\[\(（「『]+/, "")
    .replace(/[】\]\)）」』]+$/, "")
    .trim();
}

/** 把剧情正文拆为分段。完全无【】标签的消息退化为单条旁白（旧观感兜底）。 */
export function parseStorySegments(content: string): StorySegment[] {
  const text = (content || "").replace(/\r\n/g, "\n");
  const segments: StorySegment[] = [];
  if (!text.trim()) return segments;

  let cur: StorySegment | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (cur) cur.text += "\n";
      continue;
    }

    const match = line.match(TAG_LINE_RE);
    if (match) {
      const senderRaw = (match[1] || "").trim();
      const sender = normalizeSender(senderRaw);
      const isNarration = !senderRaw || NARRATION_SENDERS.has(sender);
      cur = isNarration
        ? { kind: "narration", sender: "旁白", text: (match[2] || "").trim() }
        : { kind: "dialogue", sender, text: (match[2] || "").trim() };
      segments.push(cur);
      continue;
    }

    if (cur) {
      cur.text = `${cur.text}\n${rawLine.trimEnd()}`.trimEnd();
      continue;
    }

    cur = { kind: "narration", sender: "旁白", text: rawLine.trimEnd() };
    segments.push(cur);
  }

  return segments
    .map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text.length > 0);
}

/** 头像兜底色板：按说话者名哈希取色，名字不变则颜色稳定。 */
const AVATAR_COLORS = [
  "#8a6d3b",
  "#5f7d9e",
  "#6d8a5f",
  "#8a6b9e",
  "#a3653f",
  "#4f8a8a",
  "#9e5f72",
  "#6f6f8a",
];

function hashName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.charCodeAt(0) || 0)) >>> 0;
  return h;
}

function avatarColorFor(name: string): string {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

/** 判定说话者是否主角（"你"/"我"或主角本名）。 */
function isProtagonistSender(name: string, protagonist: Protagonist | null): boolean {
  if (!name) return false;
  if (name === "你" || name === "我") return true;
  if (protagonist && name === protagonist.displayName) return true;
  return false;
}

/**
 * 解析对话段的头像展示信息：
 * - 主角（你/我/主角名）→ 主角头像；其余 → npcStore 按名查头像；
 * - 无头像 → 首字彩色圆底兜底。
 *
 * @param protagonist  当前主角（可为 null）。
 * @param getNpc       NPC 查找函数（组件侧注入 npcStore.getNpc）。
 */
export function resolveDialogAvatar(
  sender: string,
  protagonist: Protagonist | null,
  getNpc: (name: string) => Npc | undefined,
): DialogAvatarInfo {
  const name = normalizeSender(sender);
  const isPlayer = isProtagonistSender(name, protagonist);
  const displayName = isPlayer && protagonist ? protagonist.displayName : name || "旁白";

  let avatarUrl = "";
  if (isPlayer) {
    avatarUrl = protagonist?.avatarUrl ?? "";
  } else {
    const npc = name ? getNpc(name) : undefined;
    avatarUrl = npc?.avatarUrl ?? "";
  }

  return {
    name: displayName,
    avatarUrl: avatarUrl || "",
    color: avatarColorFor(name || displayName),
    isProtagonist: isPlayer,
  };
}

/** 按消息对象身份缓存解析结果（内容不可变，避免每次渲染重复解析）。 */
const _segmentsCache = new WeakMap<ChatMessage, StorySegment[]>();

export function getStorySegments(msg: ChatMessage): StorySegment[] {
  const cached = _segmentsCache.get(msg);
  if (cached) return cached;
  const parsed = parseStorySegments(msg.content);
  _segmentsCache.set(msg, parsed);
  return parsed;
}
