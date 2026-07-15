/**
 * @fileoverview 文生图（Ark）配置的 Vue composable（localStorage 持久化）。
 *
 * 与 {@link ../ai/useApiConfig.ts} 结构一致：模块级共享 refs + localStorage 读写 + 校验 + 测试。
 * localStorage key 独立于聊天 API（`IMMORTAL_ST_BRIDGE_API_OVERRIDE_V1`），避免互相污染。
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import { safeJsonParse } from "../ai_core/shared/parseJson";
import { pingReachable } from "./volcImageBridge";
import type { ArkImageConfig } from "./types";

/** localStorage 键名（与聊天 API 配置 `IMMORTAL_ST_BRIDGE_API_OVERRIDE_V1` 区分）。 */
export const IMAGE_API_OVERRIDE_KEY = "IMMORTAL_ST_BRIDGE_IMAGE_API_OVERRIDE_V1";

const _baseUrl: Ref<string> = ref("");
const _apiKey: Ref<string> = ref("");
const _model: Ref<string> = ref("");
const _autoGenerate: Ref<boolean> = ref(false);
let _initialized = false;

/** 从 localStorage 读取配置填充共享 refs（仅初始化一次）。 */
function ensureInitialized(): void {
  if (_initialized) return;
  _initialized = true;
  loadFromStorage();
}

/** 从 localStorage 读取配置（可重复调用，用于设置弹层打开时刷新）。 */
function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(IMAGE_API_OVERRIDE_KEY);
    const data = raw ? safeJsonParse<unknown>(raw, null) : null;
    if (data && typeof data === "object") {
      const rec = data as Partial<ArkImageConfig>;
      _baseUrl.value = rec.baseUrl != null ? String(rec.baseUrl) : "";
      _apiKey.value = rec.apiKey != null ? String(rec.apiKey) : "";
      _model.value = rec.model != null ? String(rec.model) : "";
      _autoGenerate.value = rec.autoGenerate === true;
    } else {
      _baseUrl.value = "";
      _apiKey.value = "";
      _model.value = "";
      _autoGenerate.value = false;
    }
  } catch {
    /* ignore corrupt storage */
  }
}

/** 是否已配置（baseUrl + model 均非空）。 */
export function isImageApiConfigured(): boolean {
  ensureInitialized();
  return _baseUrl.value.trim().length > 0 && _model.value.trim().length > 0;
}

/** 是否开启「新 NPC 自动生成立绘」。 */
export function isAutoGenerateEnabled(): boolean {
  ensureInitialized();
  return _autoGenerate.value === true;
}

/** 当前配置快照（供非响应式调用方使用）。 */
export function getArkImageConfig(): ArkImageConfig {
  ensureInitialized();
  return {
    baseUrl: _baseUrl.value.trim(),
    apiKey: _apiKey.value.trim(),
    model: _model.value.trim(),
    autoGenerate: _autoGenerate.value,
  };
}

export interface UseImageApiConfigReturn {
  baseUrl: Ref<string>;
  apiKey: Ref<string>;
  model: Ref<string>;
  autoGenerate: Ref<boolean>;
  isConfigured: ComputedRef<boolean>;
  loadFromStorage: () => void;
  save: () => string;
  clear: () => void;
  test: () => Promise<string>;
  setAutoGenerate: (v: boolean) => void;
}

/** 文生图配置 composable；返回的 refs 为模块级共享单例。 */
export function useImageApiConfig(): UseImageApiConfigReturn {
  ensureInitialized();

  const isConfigured = computed(() => isImageApiConfigured());

  function save(): string {
    const u = _baseUrl.value.trim();
    const m = _model.value.trim();
    if (!u || !m) return "请填写文生图地址与模型。";
    try {
      localStorage.setItem(
        IMAGE_API_OVERRIDE_KEY,
        JSON.stringify({
          baseUrl: u,
          apiKey: _apiKey.value.trim(),
          model: m,
          autoGenerate: _autoGenerate.value,
        } satisfies ArkImageConfig),
      );
      return "已保存。";
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      return "保存失败：" + err;
    }
  }

  function clear(): void {
    try {
      localStorage.removeItem(IMAGE_API_OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
    _baseUrl.value = "";
    _apiKey.value = "";
    _model.value = "";
    _autoGenerate.value = false;
  }

  async function test(): Promise<string> {
    const u = _baseUrl.value.trim();
    const k = _apiKey.value.trim();
    if (!u) return "请先填写文生图地址，再测试。";
    return pingReachable(u, k);
  }

  /**
   * 翻转自动生成开关并立即持久化。
   *
   * 采用「读改写」storage：仅覆写 autoGenerate 字段，不动已持久化的 baseUrl/apiKey/model，
   * 避免把表单中尚未点「保存」的草稿值误存。
   */
  function setAutoGenerate(v: boolean): void {
    _autoGenerate.value = !!v;
    try {
      const raw = localStorage.getItem(IMAGE_API_OVERRIDE_KEY);
      const cur = raw ? safeJsonParse<Partial<ArkImageConfig>>(raw, {}) : {};
      cur.autoGenerate = _autoGenerate.value;
      localStorage.setItem(IMAGE_API_OVERRIDE_KEY, JSON.stringify(cur));
    } catch {
      /* ignore */
    }
  }

  return {
    baseUrl: _baseUrl,
    apiKey: _apiKey,
    model: _model,
    autoGenerate: _autoGenerate,
    isConfigured,
    loadFromStorage,
    save,
    clear,
    test,
    setAutoGenerate,
  };
}
