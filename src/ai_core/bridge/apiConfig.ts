/**
 * Bridge 层：API 配置 composable。
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import { safeJsonParse } from "../shared/parseJson";

export const API_OVERRIDE_KEY = "IMMORTAL_ST_BRIDGE_API_OVERRIDE_V1";

export interface ApiOverrideStored {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface UseApiConfigReturn {
  apiUrl: Ref<string>;
  apiKey: Ref<string>;
  apiModel: Ref<string>;
  isConfigured: ComputedRef<boolean>;
  loadFromStorage: () => void;
  save: () => string;
  clear: () => void;
  test: () => Promise<string>;
}

const _apiUrl: Ref<string> = ref("");
const _apiKey: Ref<string> = ref("");
const _apiModel: Ref<string> = ref("");
let _initialized = false;

function ensureInitialized(): void {
  if (_initialized) return;
  _initialized = true;
  try {
    const raw = localStorage.getItem(API_OVERRIDE_KEY);
    const data = raw ? safeJsonParse<unknown>(raw, null) : null;
    if (data && typeof data === "object") {
      const rec = data as ApiOverrideStored;
      _apiUrl.value = rec.apiUrl ?? "";
      _apiKey.value = rec.apiKey ?? "";
      _apiModel.value = rec.model ?? "";
    }
  } catch {
    /* ignore */
  }
}

export function useApiConfig(): UseApiConfigReturn {
  ensureInitialized();
  const isConfigured = computed(() => {
    const url = _apiUrl.value.trim();
    const model = _apiModel.value.trim();
    if (!url || !model) return false;
    if (/example\.com/i.test(url)) return false;
    return true;
  });

  function loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(API_OVERRIDE_KEY);
      const data = raw ? safeJsonParse<unknown>(raw, null) : null;
      if (data && typeof data === "object") {
        const rec = data as ApiOverrideStored;
        _apiUrl.value = rec.apiUrl ?? "";
        _apiKey.value = rec.apiKey ?? "";
        _apiModel.value = rec.model ?? "";
      }
    } catch {
      /* ignore */
    }
  }

  function save(): string {
    const u = _apiUrl.value.trim();
    const k = _apiKey.value.trim();
    const m = _apiModel.value.trim();
    if (!u || !m) return "请填写 API URL 与模型。";
    try {
      localStorage.setItem(API_OVERRIDE_KEY, JSON.stringify({
        apiUrl: u, apiKey: k, model: m,
      }));
      return "已保存。";
    } catch (e) {
      return "保存失败：" + (e instanceof Error ? e.message : String(e));
    }
  }

  function clear(): void {
    try { localStorage.removeItem(API_OVERRIDE_KEY); } catch { /* ignore */ }
    _apiUrl.value = "";
    _apiKey.value = "";
    _apiModel.value = "";
  }

  async function test(): Promise<string> {
    const u = _apiUrl.value.trim();
    const k = _apiKey.value.trim();
    const m = _apiModel.value.trim();
    if (!u || !m) return "请先填写 API URL 与模型，再测试。";
    const started = Date.now();
    try {
      const { callChatCompletions } = await import("./openAiBridge");
      const result = await callChatCompletions({
        apiUrl: u,
        apiKey: k || undefined,
        model: m,
        messages: [{ role: "user", content: "ping" }],
        temperature: 0,
        max_tokens: 8,
        logTag: "API测试",
      });
      const ms = Date.now() - started;
      return "测试成功（" + (ms / 1000).toFixed(2) + "s）：" + (result.content || "已收到响应");
    } catch (err: unknown) {
      const ms = Date.now() - started;
      const msg = err instanceof Error ? err.message : "未知错误";
      return "测试失败（" + (ms / 1000).toFixed(2) + "s）： " + msg.slice(0, 480);
    }
  }

  return {
    apiUrl: _apiUrl,
    apiKey: _apiKey,
    apiModel: _apiModel,
    isConfigured,
    loadFromStorage,
    save,
    clear,
    test,
  };
}

export function isApiConfigured(): boolean {
  ensureInitialized();
  const apiUrl = _apiUrl.value.trim();
  const model = _apiModel.value.trim();
  const apiKey = _apiKey.value.trim();
  if (!apiUrl || !model) return false;
  if (/example\.com/i.test(apiUrl)) return false;
  const isLocal =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(apiUrl) ||
    /^https?:\/\/0\.0\.0\.0(:\d+)?(\/|$)/i.test(apiUrl);
  if (!isLocal && !apiKey) return false;
  return true;
}
