/**
 * Bridge 层：OpenAI 兼容非流式客户端。
 *
 * 仅传输 messages/temperature/max_tokens，不使用 function calling，
 * 以兼容推理/思维链模型（这类模型不支持 tool_choice）。
 */

import type { JsonChatRequestPayload } from "../shared/apiTypes";
import { safeJsonParse } from "../shared/parseJson";
import { gameLog } from "../../log/gameLog";

export const DEFAULT_NON_STREAM_TIMEOUT_MS = 300000;

/** 取本次调用的日志分类标签；缺省回退为「AI」。 */
function logTagOf(payload: JsonChatRequestPayload): string {
  return String(payload.logTag || "").trim() || "AI";
}

export function normalizeBaseUrl(url: string): string {
  let clean = String(url || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (!/\/v\d+$/i.test(clean)) clean += "/v1";
  return clean;
}

export function extractOpenAiNonStreamMessageText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as {
    choices?: Array<{
      message?: { content?: unknown };
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
  }
  const legacy = ch0.text;
  if (legacy != null && String(legacy) !== "") parts.push(String(legacy));
  return parts.join("");
}

export interface ChatCompletionResponse {
  content: string;
  raw: unknown;
}

function logAiOutbound(requestBody: Record<string, unknown>, tag: string): void {
  try {
    const snap = {
      model: requestBody.model,
      messages: requestBody.messages,
      temperature: requestBody.temperature,
      max_tokens: requestBody.max_tokens,
    };
    gameLog.ai(tag, "out", JSON.stringify(snap));
  } catch {
    gameLog.ai(tag, "out", "(无法序列化请求体)");
  }
}

function logAiInbound(text: string, tag: string): void {
  const body = text === "" ? "(空正文)" : text;
  gameLog.ai(tag, "in", body);
}

function logAiFailure(err: unknown, tag: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  gameLog.ai(tag, "error", msg);
}

/**
 * 从非流式 chat/completions 响应中抽取助手正文。
 */
export function extractResponse(data: unknown): ChatCompletionResponse {
  return { content: extractOpenAiNonStreamMessageText(data), raw: data };
}

/**
 * 向 chat/completions 发送非流式 POST，返回解析后的响应。
 */
export async function callChatCompletions(
  payload: JsonChatRequestPayload,
): Promise<ChatCompletionResponse> {
  const tag = logTagOf(payload);
  const apiUrl = String(payload.apiUrl || "").trim();
  const apiKey = payload.apiKey != null ? String(payload.apiKey).trim() : "";
  const model = String(payload.model || "").trim();
  if (!apiUrl || !model) {
    throw new Error("桥接预设未配置 API URL 或模型：请在「API设置」中填写 URL 与模型。");
  }

  const baseUrl = normalizeBaseUrl(apiUrl);
  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const requestBody: Record<string, unknown> = {
    model,
    messages: payload.messages,
    temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
    max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : 8,
  };

  const budgetMs =
    typeof payload.requestTimeoutMs === "number" && payload.requestTimeoutMs > 0
      ? payload.requestTimeoutMs
      : DEFAULT_NON_STREAM_TIMEOUT_MS;

  logAiOutbound(requestBody, tag);

  try {
    const res = await Promise.race([
      (async () => {
        const r = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...requestBody, stream: false }),
          signal: payload.signal,
        });
        if (!r.ok) {
          const lastError = await r.text();
          const hint =
            r.status === 401 || r.status === 403
              ? "\n\n提示：这通常是「API Key 无权限访问该模型 / Key 填错或为空」或「模型名与网关不匹配」导致。"
              : "";
          throw new Error(`上游模型请求失败 (${r.status}): ${lastError || "unknown error"}${hint}`);
        }
        const text = await r.text();
        return safeJsonParse(text, null);
      })(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`非流式在 ${Math.round(budgetMs / 1000)}s 内未完成。`)), budgetMs),
      ),
    ]);

    const result = extractResponse(res);
    logAiInbound(result.content, tag);
    return result;
  } catch (e) {
    logAiFailure(e, tag);
    throw e;
  }
}
