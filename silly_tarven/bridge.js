/* eslint-disable no-console */
(function () {
  "use strict";

  const CFG =
    typeof window !== "undefined" && window.SillyTavernBridgeConfig
      ? window.SillyTavernBridgeConfig
      : null;
  if (!CFG) {
    throw new Error(
      "[ST Bridge] 未找到 SillyTavernBridgeConfig：请先加载 bridge-config.js，且顺序须在 bridge.js 之前。",
    );
  }

  const BRIDGE_PRESET_KEY = CFG.storageKeys.presets;
  const BRIDGE_WORLDBOOK_KEY = CFG.storageKeys.worldbooks;
  const NON_STREAM_TIMEOUT_MS = CFG.timeouts.nonStreamMs;
  const STREAM_CHUNK_IDLE_MS = CFG.timeouts.streamChunkIdleMs;
  const STREAM_MAX_TOTAL_MS = CFG.timeouts.streamMaxTotalMs;
  const USE_FIXED_PRESET = !!CFG.useFixedPreset;
  const FIXED_PRESET = CFG.fixedPreset;

  const listeners = new Map();
  let activeAbortController = null;

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return fallback;
    }
  }

  function deepClone(value) {
    return safeJsonParse(JSON.stringify(value), null);
  }

  function normalizeBaseUrl(url) {
    let clean = String(url || "").trim().replace(/\/+$/, "");
    if (!clean) return "";
    if (!/\/v\d+$/i.test(clean)) {
      clean += "/v1";
    }
    return clean;
  }

  function getPresetStore() {
    if (USE_FIXED_PRESET) {
      return {
        activePresetId: FIXED_PRESET.id,
        presets: [deepClone(FIXED_PRESET)],
      };
    }
    const raw = localStorage.getItem(BRIDGE_PRESET_KEY);
    const fallback = { activePresetId: "default", presets: [] };
    const store = safeJsonParse(raw, fallback);
    if (!store || typeof store !== "object") return fallback;
    if (!Array.isArray(store.presets)) store.presets = [];
    if (!store.activePresetId) store.activePresetId = "default";
    if (store.presets.length === 0) {
      store.presets.push(deepClone(CFG.defaultPresetTemplate));
    }
    return store;
  }

  function savePresetStore(store) {
    if (USE_FIXED_PRESET) return;
    localStorage.setItem(BRIDGE_PRESET_KEY, JSON.stringify(store));
  }

  function getActivePreset() {
    const store = getPresetStore();
    const active = store.presets.find(p => p.id === store.activePresetId);
    if (active) return active;
    store.activePresetId = store.presets[0].id;
    savePresetStore(store);
    return store.presets[0];
  }

  function getWorldbookStore() {
    const raw = localStorage.getItem(BRIDGE_WORLDBOOK_KEY);
    const fallback = { books: {} };
    const store = safeJsonParse(raw, fallback);
    if (!store || typeof store !== "object") return fallback;
    if (!store.books || typeof store.books !== "object") store.books = {};
    return store;
  }

  function saveWorldbookStore(store) {
    localStorage.setItem(BRIDGE_WORLDBOOK_KEY, JSON.stringify(store));
  }

  function on(eventName, handler) {
    if (!eventName || typeof handler !== "function") return;
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
  }

  function off(eventName, handler) {
    if (!listeners.has(eventName)) return;
    listeners.get(eventName).delete(handler);
  }

  async function emit(eventName, payload) {
    const eventListeners = listeners.get(eventName);
    if (!eventListeners || eventListeners.size === 0) return;
    const tasks = [];
    eventListeners.forEach(handler => {
      tasks.push(
        Promise.resolve()
          .then(() => handler(payload))
          .catch(err => console.error("[ST Bridge] event handler failed:", eventName, err)),
      );
    });
    await Promise.allSettled(tasks);
  }

  function timeoutFromPreset(preset, key, fallback) {
    const v = preset && preset[key];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  }

  /** 非流式 fetch：整段超时 + 用户中止 */
  function createFetchAbortSignal(userSignal, timeoutMs, timeoutMessage) {
    const ac = new AbortController();
    let tid = 0;
    const clear = () => {
      if (tid) clearTimeout(tid);
      tid = 0;
    };
    const onTimeout = () => {
      try {
        ac.abort(timeoutMessage || new Error("请求超时"));
      } catch (_e) {}
    };
    if (timeoutMs > 0) {
      tid = setTimeout(onTimeout, timeoutMs);
    }
    const onUserAbort = () => {
      clear();
      try {
        ac.abort(userSignal.reason);
      } catch (_e) {}
    };
    if (userSignal) {
      if (userSignal.aborted) {
        clear();
        onUserAbort();
        return { signal: ac.signal, clear };
      }
      userSignal.addEventListener("abort", onUserAbort, { once: true });
    }
    return { signal: ac.signal, clear };
  }

  /**
   * 流式 read：长时间无 TCP 数据则空闲超时；等待期间也可被 userSignal 中止。
   */
  async function readStreamChunkWithIdle(reader, idleMs, userSignal) {
    if (userSignal && userSignal.aborted) {
      try {
        await reader.cancel(String(userSignal.reason || "aborted"));
      } catch (_c) {}
      throw new DOMException(String(userSignal.reason || "aborted"), "AbortError");
    }

    let idleTimer = 0;
    const idlePromise =
      idleMs > 0
        ? new Promise((_, rej) => {
            idleTimer = setTimeout(
              () => rej(Object.assign(new Error("STREAM_CHUNK_IDLE"), { code: "STREAM_CHUNK_IDLE" })),
              idleMs,
            );
          })
        : null;

    const userAbortPromise = userSignal
      ? new Promise((_, rej) => {
          userSignal.addEventListener(
            "abort",
            () => rej(new DOMException(String(userSignal.reason || "aborted"), "AbortError")),
            { once: true },
          );
        })
      : null;

    const racers = [reader.read()];
    if (idlePromise) racers.push(idlePromise);
    if (userAbortPromise) racers.push(userAbortPromise);

    try {
      const result = await Promise.race(racers);
      if (idleTimer) clearTimeout(idleTimer);
      return result;
    } catch (e) {
      if (idleTimer) clearTimeout(idleTimer);
      if (e && e.code === "STREAM_CHUNK_IDLE") {
        try {
          await reader.cancel("idle_timeout");
        } catch (_c) {}
      } else if (e && e.name === "AbortError") {
        try {
          await reader.cancel(String(userSignal?.reason || "aborted"));
        } catch (_c) {}
      }
      throw e;
    }
  }

  async function callChatCompletion(messages, shouldStream, userSignal, onDelta) {
    const preset = getActivePreset();
    if (!preset.apiUrl || !preset.model) {
      throw new Error("桥接预设未配置 API URL 或模型，请在 bridge-config.js 的 fixedPreset（或 defaultPresetTemplate）中填写。");
    }

    const nonStreamMs = timeoutFromPreset(preset, "requestTimeoutMs", NON_STREAM_TIMEOUT_MS);
    const streamIdleMs = timeoutFromPreset(preset, "streamIdleTimeoutMs", STREAM_CHUNK_IDLE_MS);
    const streamMaxTotalMs = timeoutFromPreset(preset, "streamMaxTotalMs", STREAM_MAX_TOTAL_MS);

    const baseUrl = normalizeBaseUrl(preset.apiUrl);
    const url = `${baseUrl}/chat/completions`;
    const headers = { "Content-Type": "application/json" };
    if (preset.apiKey) headers.Authorization = `Bearer ${preset.apiKey}`;

    const body = {
      model: preset.model,
      messages,
      stream: !!shouldStream,
      temperature: typeof preset.temperature === "number" ? preset.temperature : 0.7,
    };

    let fetchAbort = { signal: userSignal || undefined, clear: () => {} };
    if (!shouldStream && nonStreamMs > 0) {
      fetchAbort = createFetchAbortSignal(
        userSignal,
        nonStreamMs,
        new Error(
          `请求超时（非流式超过 ${Math.round(nonStreamMs / 1000)}s）。可在预设中调大 requestTimeoutMs。`,
        ),
      );
    }

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: fetchAbort.signal,
      });
    } finally {
      fetchAbort.clear();
    }

    if (!response.ok) {
      const lastError = await response.text();
      throw new Error(`上游模型请求失败 (${response.status}): ${lastError || "unknown error"}`);
    }

    if (!shouldStream) {
      const data = await response.json();
      return String(data?.choices?.[0]?.message?.content || "");
    }

    if (!response.body) {
      throw new Error("上游未返回流式 body。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let full = "";
    let buffer = "";
    const streamStartedAt = Date.now();

    while (true) {
      if (userSignal && userSignal.aborted) {
        try {
          await reader.cancel(String(userSignal.reason || "aborted"));
        } catch (_c) {}
        throw new DOMException(String(userSignal.reason || "aborted"), "AbortError");
      }
      if (Date.now() - streamStartedAt > streamMaxTotalMs) {
        try {
          await reader.cancel("max_total");
        } catch (_c) {}
        throw new Error(
          `流式输出总时长超过 ${Math.round(streamMaxTotalMs / 1000)}s。可在预设中调大 streamMaxTotalMs。`,
        );
      }

      let readResult;
      try {
        readResult = await readStreamChunkWithIdle(reader, streamIdleMs, userSignal);
      } catch (e) {
        if (e && e.code === "STREAM_CHUNK_IDLE") {
          throw new Error(
            `${Math.round(streamIdleMs / 1000)} 秒内未收到新的流式数据，已断开。若上游较慢，请在预设中增大 streamIdleTimeoutMs（当前桥接默认 ${STREAM_CHUNK_IDLE_MS / 1000}s）。`,
          );
        }
        throw e;
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = safeJsonParse(payload, null);
        const token = String(parsed?.choices?.[0]?.delta?.content || "");
        if (!token) continue;
        full += token;
        if (typeof onDelta === "function") {
          try {
            await onDelta(token, full);
          } catch (_e) {}
        }
        await emit("js_stream_token_received_incrementally", token);
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          const parsed = safeJsonParse(payload, null);
          const token = String(parsed?.choices?.[0]?.delta?.content || "");
          if (token) {
            full += token;
            if (typeof onDelta === "function") {
              try {
                await onDelta(token, full);
              } catch (_e) {}
            }
            await emit("js_stream_token_received_incrementally", token);
          }
        }
      }
    }

    return full;
  }

  function createPromptMessages(userInput) {
    const preset = getActivePreset();
    const messages = [];
    if (preset.systemPrompt && String(preset.systemPrompt).trim()) {
      messages.push({ role: "system", content: String(preset.systemPrompt) });
    }
    messages.push({ role: "user", content: String(userInput || "") });
    return messages;
  }

  const TavernHelper = {
    async generate(params) {
      const userInput = String(params?.user_input || "");
      const shouldStream = !!params?.should_stream;
      const messages = createPromptMessages(userInput);

      if (activeAbortController) {
        activeAbortController.abort("replaced_by_new_generation");
      }

      const userController = new AbortController();
      const myRef = userController;
      activeAbortController = userController;

      try {
        return await callChatCompletion(messages, shouldStream, myRef.signal, null);
      } finally {
        if (activeAbortController === myRef) activeAbortController = null;
      }
    },
    /**
     * 与 legacy 主流程一致：发送完整 messages（含世界书/分段记忆/多轮对话），走同一套上游预设。
     * @param {{ messages: Array<{role:string,content:string}>, should_stream?: boolean, onDelta?: (delta: string, full: string) => void }} params
     */
    async generateFromMessages(params) {
      const messages = params && Array.isArray(params.messages) ? params.messages : [];
      const shouldStream = !!params?.should_stream;
      const onDelta = params && typeof params.onDelta === "function" ? params.onDelta : null;
      const externalSignal = params && params.signal;
      if (!messages.length) {
        throw new Error("generateFromMessages: messages 不能为空");
      }

      if (activeAbortController) {
        activeAbortController.abort("replaced_by_new_generation");
      }

      const userController = new AbortController();
      const myRef = userController;
      activeAbortController = userController;

      if (externalSignal) {
        if (externalSignal.aborted) {
          try {
            userController.abort(externalSignal.reason);
          } catch (_e) {}
        } else {
          externalSignal.addEventListener(
            "abort",
            () => {
              try {
                userController.abort(externalSignal.reason);
              } catch (_e) {}
            },
            { once: true },
          );
        }
      }

      try {
        return await callChatCompletion(messages, shouldStream, myRef.signal, onDelta);
      } finally {
        if (activeAbortController === myRef) activeAbortController = null;
      }
    },
    stopAllGeneration() {
      if (activeAbortController) {
        activeAbortController.abort("stopped_by_user");
        activeAbortController = null;
      }
    },
  };

  function getWorldbookNames() {
    return Object.keys(getWorldbookStore().books);
  }

  async function getWorldbook(name) {
    const store = getWorldbookStore();
    const rows = store.books[String(name)] || [];
    return deepClone(rows) || [];
  }

  async function replaceWorldbook(name, entries) {
    const store = getWorldbookStore();
    store.books[String(name)] = Array.isArray(entries) ? deepClone(entries) : [];
    saveWorldbookStore(store);
    return true;
  }

  async function handleGenerateImageRequest(payload) {
    const id = payload?.id || `img_${Date.now()}`;
    const msg = {
      id,
      success: false,
      error: "当前桥接层未实现图片生成后端，请先接入你自己的生图服务。",
    };
    await emit("generate-image-response", msg);
    await emit("generate_image_response", msg);
  }

  async function handleGetTavernCharInfo(payload) {
    const response = {
      id: payload?.id,
      success: false,
      error: "当前非酒馆环境，无法获取 Tavern 角色卡信息。",
    };
    await emit("get-tavern-char-info-response", response);
  }

  async function bridgeEventEmit(eventName, payload) {
    const name = String(eventName || "");
    if (name === "generate-image-request" || name === "generate_image_request") {
      await handleGenerateImageRequest(payload || {});
      return;
    }
    if (name === "get-tavern-char-info-request") {
      await handleGetTavernCharInfo(payload || {});
      return;
    }
    await emit(name, payload);
  }

  const api = {
    getPresets() {
      return deepClone(getPresetStore()) || { activePresetId: null, presets: [] };
    },
    savePresets(store) {
      savePresetStore(store);
    },
    setActivePreset(id) {
      const store = getPresetStore();
      const found = store.presets.find(p => p.id === id);
      if (!found) throw new Error(`preset not found: ${id}`);
      store.activePresetId = id;
      savePresetStore(store);
    },
    upsertPreset(preset) {
      const store = getPresetStore();
      const safeId = String(preset?.id || `preset_${Date.now()}`);
      const next = {
        id: safeId,
        name: String(preset?.name || safeId),
        apiUrl: String(preset?.apiUrl || ""),
        apiKey: String(preset?.apiKey || ""),
        model: String(preset?.model || ""),
        systemPrompt: String(preset?.systemPrompt || ""),
        temperature:
          typeof preset?.temperature === "number" && Number.isFinite(preset.temperature)
            ? preset.temperature
            : 0.7,
      };
      if (typeof preset?.requestTimeoutMs === "number" && Number.isFinite(preset.requestTimeoutMs)) {
        next.requestTimeoutMs = preset.requestTimeoutMs;
      }
      if (typeof preset?.streamIdleTimeoutMs === "number" && Number.isFinite(preset.streamIdleTimeoutMs)) {
        next.streamIdleTimeoutMs = preset.streamIdleTimeoutMs;
      }
      if (typeof preset?.streamMaxTotalMs === "number" && Number.isFinite(preset.streamMaxTotalMs)) {
        next.streamMaxTotalMs = preset.streamMaxTotalMs;
      }
      const idx = store.presets.findIndex(p => p.id === safeId);
      if (idx >= 0) store.presets[idx] = next;
      else store.presets.push(next);
      if (!store.activePresetId) store.activePresetId = safeId;
      savePresetStore(store);
      return next;
    },
    removePreset(id) {
      if (USE_FIXED_PRESET) return;
      const store = getPresetStore();
      store.presets = store.presets.filter(p => p.id !== id);
      if (store.presets.length === 0) {
        store.presets.push(deepClone(FIXED_PRESET));
      }
      if (!store.presets.some(p => p.id === store.activePresetId)) {
        store.activePresetId = store.presets[0].id;
      }
      savePresetStore(store);
    },
    getWorldbookNames,
    getWorldbook,
    replaceWorldbook,
    async fetchModels(apiUrl, apiKey) {
      const base = normalizeBaseUrl(apiUrl);
      const headers = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetch(`${base}/models`, { headers });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`获取模型失败 (${response.status}): ${text || "unknown error"}`);
      }
      const data = await response.json();
      return data?.data || [];
    },
  };

  window.eventOn = on;
  window.eventEmit = bridgeEventEmit;
  window.eventRemoveListener = off;
  window.TavernHelper = TavernHelper;
  window.SillyTavernBridge = api;
  window.getWorldbookNames = getWorldbookNames;
  window.getWorldbook = getWorldbook;
  window.replaceWorldbook = replaceWorldbook;

  console.info("[ST Bridge] loaded: Tavern compatibility shim active.");
})();

