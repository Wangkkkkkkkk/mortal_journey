/**
 * @fileoverview OpenAI 兼容的非流式 Chat Completions 客户端，与 `mortal_journey/silly_tarven/bridge.js` 行为对齐。
 *
 * 供启动页「测试连接」与后续游戏逻辑复用。
 */

import { gameLog } from "../log/gameLog";

/**
 * 非流式请求的整段超时上限（毫秒），含连接与读取完整 JSON 正文；与 `bridge.js` 中 `DEFAULT_CFG.timeouts.nonStreamMs` 一致。
 */
export const DEFAULT_NON_STREAM_TIMEOUT_MS = 300000;

/** OpenAI 兼容的聊天消息条目（`role` + `content`）。 */
export interface ChatMessage {
  role: string;
  content: string;
}

/** 单条消息在请求体中的 UTF-16 字符统计（用于调试体量日志）。 */
interface MessageCharStat {
  role: string;
  chars: number;
}

/**
 * 统计 `messages` 数组中各条 `content` 的字符数（UTF-16 长度，与 `String#length` 一致）。
 *
 * @param messages 上游 `messages` 字段；非数组时视为空。
 * @return 总字符数与每条消息的 `{ role, chars }` 列表。
 */
function countMessagePayloadChars(messages: unknown): {
  totalChars: number;
  perMessage: MessageCharStat[];
} {
  const perMessage: MessageCharStat[] = [];
  let totalChars = 0;
  if (!Array.isArray(messages)) {
    return { totalChars: 0, perMessage };
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as { role?: unknown; content?: unknown } | null;
    const role = m && m.role != null ? String(m.role) : "";
    const content = m && m.content != null ? String(m.content) : "";
    const chars = content.length;
    totalChars += chars;
    perMessage.push({ role, chars });
  }
  return { totalChars, perMessage };
}

/**
 * 按「约 2 token / 字」粗估中文正文的 token 上限，便于对照上下文窗口（非官方分词，仅日志参考）。
 *
 * @param charCount UTF-16 字符数。
 * @return 向上取整后的粗估 token 上限。
 */
function estimateChineseTokensMaxByChars(charCount: number): number {
  return Math.ceil(Math.max(0, charCount) * 2);
}

/**
 * 将待发请求的关键字段写入 `gameLog`（不含 API Key），并输出体量粗估。
 *
 * @param requestBody 即将 `JSON.stringify` 的请求体对象。
 */
function logAiOutbound(requestBody: Record<string, unknown>): void {
  try {
    const snap = {
      model: requestBody.model,
      messages: requestBody.messages,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens,
    };
    gameLog.info("[AI →] " + JSON.stringify(snap));

    const { totalChars } = countMessagePayloadChars(requestBody.messages);
    const tokensMax = estimateChineseTokensMaxByChars(totalChars);
    gameLog.info("[AI → 体量] " + totalChars + " 字，粗估最多 " + tokensMax + " tokens");
  } catch {
    gameLog.info("[AI →] (无法序列化请求体)");
  }
}

/**
 * 将模型返回的正文写入 `gameLog`，空串时记为占位说明。
 *
 * @param text 解析得到的助手正文。
 */
function logAiInbound(text: string): void {
  const body = text === "" ? "(空正文)" : text;
  gameLog.info("[AI ←] " + body);
  if (text !== "") {
    const n = text.length;
    const tokensMax = estimateChineseTokensMaxByChars(n);
    gameLog.info("[AI ← 体量] " + n + " 字，粗估最多 " + tokensMax + " tokens");
  }
}

/**
 * 将请求失败信息写入 `gameLog`。
 *
 * @param err 任意抛错或拒绝原因。
 */
function logAiFailure(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  gameLog.error("[AI 失败] " + msg);
}

/**
 * 解析 JSON 字符串；解析失败时返回给定回退值，不抛异常。
 *
 * @template T 期望的解析结果类型（调用方负责与实际 JSON 一致）。
 * @param raw 原始 JSON 文本。
 * @param fallback 解析失败时返回的值。
 * @return `JSON.parse` 的结果，或 `fallback`。
 */
export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 规范化 OpenAI 兼容的 API 根 URL：去尾部斜杠，若无 `/vN` 后缀则补 `/v1`。
 *
 * @param url 用户配置的 API 根或完整路径前缀。
 * @return 规范化后的根 URL；空输入返回空字符串。
 */
export function normalizeBaseUrl(url: string): string {
  let clean = String(url || "")
    .trim()
    .replace(/\/+$/, "");
  if (!clean) return "";
  if (!/\/v\d+$/i.test(clean)) clean += "/v1";
  return clean;
}

/**
 * 从非流式 `chat/completions` 响应 JSON 中提取助手正文。
 *
 * 与 `bridge.js` 中 `extractOpenAiNonStreamMessageText` 的路径一致：`choices[0].message.content`、
 * `reasoning_content`、以及旧式 `choices[0].text`。
 *
 * @param data 解析后的响应体；非法或非对象时视为无正文。
 * @return 拼接后的助手文本；可能为空字符串。
 */
export function extractOpenAiNonStreamMessageText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
      text?: unknown;
    }>;
  };
  const ch0 = d.choices && d.choices[0];
  if (!ch0 || typeof ch0 !== "object") return "";
  const parts: string[] = [];
  const msg = ch0.message && typeof ch0.message === "object" ? ch0.message : null;
  if (msg) {
    const c = msg.content;
    if (c != null && String(c) !== "") parts.push(String(c));
    const rc = msg.reasoning_content;
    if (rc != null && String(rc) !== "") parts.push(String(rc));
  }
  const legacy = ch0.text;
  if (legacy != null && String(legacy) !== "") parts.push(String(legacy));
  return parts.join("");
}

/** `postChatCompletionsNonStream` 的可选行为：整段超时与用户 `AbortSignal`。 */
export interface PostChatCompletionsNonStreamOptions {
  /** 整段请求预算（毫秒）；未设或无效时使用 `DEFAULT_NON_STREAM_TIMEOUT_MS`。 */
  requestTimeoutMs?: number;
  /** 传递给 `fetch` 的中断信号。 */
  signal?: AbortSignal;
}

/**
 * 向给定 `chat/completions` URL 发送非流式 POST：负责 HTTP、整段超时、以及将响应正文解析为 JSON。
 *
 * 请求体中的 `stream` 会被强制为 `false`。超时与 HTTP 非 2xx 均会抛错，由调用方捕获。
 *
 * @param chatCompletionsUrl 完整 URL，例如 `https://api.example.com/v1/chat/completions`。
 * @param headers 请求头；会与 `Content-Type: application/json` 合并。
 * @param requestBody OpenAI 兼容 JSON对象；须含 `model` 与 `messages` 等上游所需字段。
 * @param options 可选超时与 `signal`。
 * @return 解析后的响应 JSON（结构取决于上游）；正文损坏时可能为 `null`。
 * @throws {Error} 当 URL 或 `requestBody` 无效、HTTP 错误、或整段超时未完成时。
 */
export async function postChatCompletionsNonStream(
  chatCompletionsUrl: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  options?: PostChatCompletionsNonStreamOptions,
): Promise<unknown> {
  const opt = options ?? {};
  if (!chatCompletionsUrl || typeof requestBody !== "object" || !requestBody) {
    throw new Error("postChatCompletionsNonStream: 需要有效的 chatCompletionsUrl 与 requestBody");
  }

  const body = Object.assign({}, requestBody, { stream: false });
  const mergedHeaders = Object.assign({ "Content-Type": "application/json" }, headers || {});

  const budgetMs =
    typeof opt.requestTimeoutMs === "number" && opt.requestTimeoutMs > 0
      ? opt.requestTimeoutMs
      : DEFAULT_NON_STREAM_TIMEOUT_MS;

  const timeoutErr = (): Error =>
    new Error(
      `非流式在 ${Math.round(budgetMs / 1000)}s 内未完成（含连接与整段 JSON）。常见于模型生成很慢、中转排队、或单次 messages 极大。`,
    );

  const userSignal = opt.signal;

  return Promise.race([
    (async () => {
      const res = await fetch(chatCompletionsUrl, {
        method: "POST",
        headers: mergedHeaders,
        body: JSON.stringify(body),
        signal: userSignal,
      });
      if (!res.ok) {
        const lastError = await res.text();
        const hint =
          res.status === 401 || res.status === 403
            ? "\n\n提示：这通常是「API Key 无权限访问该模型 / Key 填错或为空」或「模型名与网关不匹配」导致。请到「API设置」检查 API URL / Key / 模型名称是否与网关支持一致。"
            : "";
        throw new Error(`上游模型请求失败 (${res.status}): ${lastError || "unknown error"}${hint}`);
      }
      const text = await res.text();
      return safeJsonParse(text, null);
    })(),
    new Promise<never>((_, rej) => setTimeout(() => rej(timeoutErr()), budgetMs)),
  ]);
}

/**
 * 通过 JSON 对象或 JSON 字符串描述一次非流式对话请求，行为与 `JsonChatRequestPayload` 一致。
 *
 * `signal` 无法从纯 JSON 字符串反序列化，仅对象形式可传。
 */
export interface JsonChatRequestPayload {
  apiUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 解析 JSON 字符串或直接使用对象，发起非流式对话并返回助手正文（含 `gameLog` 中的 [AI →] / [AI ←]）。
 *
 * @param jsonMessages JSON 字符串或可解析为 `JsonChatRequestPayload` 的对象。
 * @return 助手回复正文，可能为空字符串。
 * @throws {Error} 当负载非法、`messages` 非数组、或底层请求失败时。
 */
export async function completeChatWithMessagesJson(
  jsonMessages: string | JsonChatRequestPayload,
): Promise<string> {
  const o =
    typeof jsonMessages === "string" ? safeJsonParse<JsonChatRequestPayload | null>(jsonMessages, null) : jsonMessages;
  if (!o || typeof o !== "object") {
    throw new Error("completeChatWithMessagesJson: 需要合法 JSON 字符串或对象");
  }
  if (!Array.isArray(o.messages)) {
    throw new Error("completeChatWithMessagesJson: messages 须为数组");
  }
  gameLog.debug("[completeChatWithMessagesJson] 解析完成，即将请求（详见 [AI →] / [AI ←]）");
  return callChatCompletionNonStream({
    apiUrl: o.apiUrl,
    apiKey: o.apiKey,
    model: o.model,
    messages: o.messages,
    temperature: o.temperature,
    max_tokens: o.max_tokens,
    requestTimeoutMs: o.requestTimeoutMs,
    signal: o.signal,
  });
}

/**
 * 调用非流式 `/chat/completions` 的参数：网关 URL、可选 Key、模型与消息列表等。
 *
 * 未指定时，`temperature` 默认 `0.7`，`max_tokens` 默认 `8`（与桥接层历史行为一致）。
 */
export interface CallChatCompletionNonStreamParams {
  apiUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 对 OpenAI 兼容网关执行一次非流式 `chat/completions` 调用，并返回助手正文。
 *
 * 自动规范化 `apiUrl`、附加 `Authorization`（有 Key 时）、写入往返调试日志；失败时记录并原样重新抛出。
 *
 * @param params URL、模型、消息与可选超时等。
 * @return 从响应中解析的助手文本，可能为空。
 * @throws {Error} 当缺少 URL/模型、HTTP 错误、超时、或解析失败时。
 */
export async function callChatCompletionNonStream(params: CallChatCompletionNonStreamParams): Promise<string> {
  const apiUrl = String(params.apiUrl || "").trim();
  const apiKey = params.apiKey != null ? String(params.apiKey).trim() : "";
  const model = String(params.model || "").trim();
  if (!apiUrl || !model) {
    throw new Error("桥接预设未配置 API URL 或模型：请在「API设置」中填写 URL 与模型。");
  }

  const baseUrl = normalizeBaseUrl(apiUrl);
  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const requestBody: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: typeof params.temperature === "number" ? params.temperature : 0.7,
    max_tokens: typeof params.max_tokens === "number" ? params.max_tokens : 8,
  };

  logAiOutbound(requestBody);
  try {
    const data = await postChatCompletionsNonStream(url, headers, requestBody, {
      requestTimeoutMs: params.requestTimeoutMs,
      signal: params.signal,
    });

    const out = extractOpenAiNonStreamMessageText(data);
    if (!out && data && typeof data === "object") {
      console.warn(
        "[OpenAI Bridge] 非流式响应中未解析到 choices[0].message.content / reasoning_content / text，请对照上游 JSON。",
      );
    }
    logAiInbound(out);
    return out;
  } catch (e) {
    logAiFailure(e);
    throw e;
  }
}
