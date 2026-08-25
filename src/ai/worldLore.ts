/**
 * @fileoverview 世界设定条目（World Lore）—— 关键词触发式提示词注入。
 *
 * 参考 SillyTavern 的 World Info：预先写好的设定片段平时不进提示词，只有当
 * 「扫描区」文本里出现该条目的关键词时，才把内容注入到剧情侧 AI 的 system 消息末尾。
 * 这样既能保有大量世界观设定，又不会每轮都把它们全量塞进上下文。
 *
 * 设计约束（有意保持简单，不做 ST 的进阶特性）：
 * - 纯子串匹配，无分词、无词边界判定（中文场景下子串匹配即可）。
 * - 无递归触发、无概率触发、无粘滞（sticky）。
 * - 无前端开关/编辑界面，条目全部在 {@link WORLD_LORE_ENTRIES} 里静态维护。
 *
 * 扫描区 = 玩家本轮输入 + 最近 {@link SCAN_RECENT_STORY_COUNT} 条剧情正文
 *          + 当前地点 + 在场 NPC 快照。
 * 注入点 = 剧情侧管线（story / cultivation / finale）的 system 消息末尾。
 * 状态管线（state_generate）不注入——它只负责记账，塞世界观既无用又费 token。
 */

import { gameLog } from "../log/gameLog";

/** 单条世界设定。 */
export interface WorldLoreEntry {
  /** 条目名，仅用于调试日志识别，不进提示词。 */
  name: string;
  /** 触发关键词：任一命中即注入（大小写不敏感，纯子串匹配）。 */
  keywords: readonly string[];
  /** 命中后注入的正文内容。 */
  content: string;
  /**
   * 排序权重，越小越靠前；同时决定超预算时的取舍优先级（先塞小的）。
   * 缺省 100。
   */
  order?: number;
}

// ---------------------------------------------------------------------------
// 设定条目表 —— 在此处填写内容
// ---------------------------------------------------------------------------

/**
 * 全部世界设定条目。
 *
 * 填写建议：
 * - `keywords` 放该设定的专有名词与常见别称（如宗门全名 + 简称）。
 *   过于泛化的词（"修士""灵气"）会导致条目几乎每轮都触发，失去按需注入的意义。
 * - `content` 直接写给模型看的设定文本，简洁陈述即可，不需要额外包裹标签。
 * - `order` 用于让核心设定优先于细枝末节，在触发密集的回合里先保住重要的。
 */
export const WORLD_LORE_ENTRIES: readonly WorldLoreEntry[] = [
  // 示例条目（可直接删除或替换为真实设定）：
  // {
  //   name: "黄枫谷",
  //   keywords: ["黄枫谷", "黄枫"],
  //   content: "黄枫谷：越国七大修仙门派之一，位于越国境内，以炼丹与符箓传承见长……",
  //   order: 10,
  // },
];

// ---------------------------------------------------------------------------
// 扫描与预算参数
// ---------------------------------------------------------------------------

/** 扫描区纳入的最近剧情正文条数。 */
const SCAN_RECENT_STORY_COUNT = 3;

/** 单轮注入的 token 预算上限。 */
const LORE_TOKEN_BUDGET = 7000;

/** 注入块的标题行。 */
const LORE_BLOCK_HEADER = "【世界设定参考】";

/**
 * 粗略估算文本 token 数。
 *
 * CJK 字符按 1 token 计，其余字符按 1/4 token 计——这只是量级估算，
 * 用于卡住注入体积上限，不追求与具体模型分词器精确一致。
 */
function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 中日韩统一表意文字 + 扩展 A + 中文标点。
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x3000 && code <= 0x303f)) {
      cjk++;
    }
  }
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}

/** 构建扫描区所需的各路上下文片段。 */
export interface WorldLoreScanInput {
  /** 完整对话历史；只取其中最近若干条 assistant（剧情正文）。 */
  chatHistory?: readonly { role: "user" | "assistant"; content: string }[];
  /** 玩家本轮输入。 */
  playerInput?: string;
  /** 当前地点（已格式化的文本）。 */
  worldLocation?: string;
  /** 在场 NPC 快照文本。 */
  npcSnapshot?: string;
}

/**
 * 拼装扫描区文本：玩家输入 + 最近 N 条剧情正文 + 地点 + NPC 快照。
 *
 * 只取最近 N 条剧情，避免早期提过一次的词永久触发某条设定。
 */
export function buildLoreScanText(input: WorldLoreScanInput): string {
  const parts: string[] = [];

  if (input.playerInput?.trim()) parts.push(input.playerInput.trim());

  const history = input.chatHistory ?? [];
  const recentStories: string[] = [];
  for (let i = history.length - 1; i >= 0 && recentStories.length < SCAN_RECENT_STORY_COUNT; i--) {
    if (history[i].role === "assistant" && history[i].content.trim()) {
      recentStories.push(history[i].content.trim());
    }
  }
  parts.push(...recentStories);

  if (input.worldLocation?.trim()) parts.push(input.worldLocation.trim());
  if (input.npcSnapshot?.trim()) parts.push(input.npcSnapshot.trim());

  return parts.join("\n");
}

/**
 * 按扫描区匹配设定条目，返回可直接追加进 system 消息的注入块。
 *
 * 命中条目按 `order` 升序拼接；累计超出 {@link LORE_TOKEN_BUDGET} 时，
 * 跳过放不下的整条（不截半条——残缺的设定比不注入更容易误导模型），
 * 并继续尝试后续更小的条目。
 *
 * @return 注入块文本；无命中或无条目时返回空串。
 */
export function matchWorldLore(input: WorldLoreScanInput): string {
  if (WORLD_LORE_ENTRIES.length === 0) return "";

  const scanText = buildLoreScanText(input).toLowerCase();
  if (!scanText) return "";

  const hits = WORLD_LORE_ENTRIES.filter((entry) =>
    entry.keywords.some((kw) => {
      const k = kw.trim().toLowerCase();
      return k.length > 0 && scanText.includes(k);
    }),
  );
  if (hits.length === 0) return "";

  const sorted = [...hits].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

  const picked: string[] = [];
  const skipped: string[] = [];
  let used = estimateTokens(LORE_BLOCK_HEADER);
  for (const entry of sorted) {
    const text = entry.content.trim();
    if (!text) continue;
    const cost = estimateTokens(text) + 1; // +1 约计条目间换行
    if (used + cost > LORE_TOKEN_BUDGET) {
      skipped.push(entry.name);
      continue;
    }
    picked.push(text);
    used += cost;
  }

  if (picked.length === 0) return "";

  const hitNames = sorted.map((e) => e.name).join("、");
  gameLog.info(
    `[WorldLore] 命中 ${hits.length} 条（${hitNames}），注入 ${picked.length} 条，约 ${used} tokens` +
      (skipped.length > 0 ? `；超预算跳过：${skipped.join("、")}` : ""),
  );

  return [LORE_BLOCK_HEADER, ...picked].join("\n");
}
