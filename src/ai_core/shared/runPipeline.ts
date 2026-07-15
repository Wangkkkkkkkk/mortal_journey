/**
 * 统一的 pipeline 调用：构造 payload → 调用 bridge → 返回原始响应。
 */

import type { AiRequestConfig, JsonChatRequestPayload, ChatMessage } from "./apiTypes";

export interface RunPipelineOptions {
  defaultTemperature: number;
  defaultMaxTokens: number;
  system: string | string[];
  user: string;
  retryIf?: (raw: string) => boolean;
  /** 日志分类标签（如「剧情生成」「状态更新·主角」），透传至 bridge 写入日志 meta。 */
  logTag?: string;
}

export interface RunPipelineResult {
  raw: string;
  retried: boolean;
}

/**
 * 执行一次 LLM 调用。实际 bridge 调用委托给传入的 caller 函数，
 * 这样 ai_core 不直接依赖现有 openAiChatBridge（可渐进迁移）。
 */
export async function runPipeline(
  config: AiRequestConfig,
  opts: RunPipelineOptions,
  caller: (payload: JsonChatRequestPayload) => Promise<{ content: string }>,
): Promise<RunPipelineResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: Array.isArray(opts.system) ? opts.system.join("\n\n") : opts.system },
    { role: "user", content: opts.user },
  ];

  const payload: JsonChatRequestPayload = {
    ...config,
    messages,
    temperature: config.temperature ?? opts.defaultTemperature,
    max_tokens: config.max_tokens ?? opts.defaultMaxTokens,
    logTag: opts.logTag,
  };

  let result = await caller(payload);
  let retried = false;

  if (opts.retryIf && !opts.retryIf(result.content)) {
    result = await caller(payload);
    retried = true;
  }

  return {
    raw: result.content,
    retried,
  };
}
