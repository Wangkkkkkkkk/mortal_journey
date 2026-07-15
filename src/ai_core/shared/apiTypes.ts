/**
 * 统一的 AI 请求配置（消灭 8 份重复的 ApiConfig 接口）。
 */

export interface AiRequestConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface JsonChatRequestPayload extends AiRequestConfig {
  messages: ChatMessage[];
  /** 用于在日志中标注本次调用的来源（如「剧情生成」「状态更新·主角」）。 */
  logTag?: string;
}
