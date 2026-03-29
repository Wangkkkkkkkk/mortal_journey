/**
 * Silly Tavern 桥接层配置：修改 API、超时、存储键等请改此文件。
 * 使用方式：在 HTML 中必须先于 bridge.js 引入本脚本。
 *   <script src="bridge-config.js"></script>
 *   <script src="bridge.js"></script>
 */
(function (global) {
  "use strict";

  global.SillyTavernBridgeConfig = {
    /** localStorage 键名 */
    storageKeys: {
      presets: "IMMORTAL_ST_BRIDGE_PRESETS_V1",
      worldbooks: "IMMORTAL_ST_BRIDGE_WORLDBOOKS_V1",
    },

    /**
     * 全局默认超时（可被单个 preset 上的 requestTimeoutMs / streamIdleTimeoutMs / streamMaxTotalMs 覆盖）
     */
    timeouts: {
      /** 非流式：从发起到收齐整段回复的上限（毫秒） */
      nonStreamMs: 900000,
      /** 流式：两次收到数据之间的最大间隔（毫秒） */
      streamChunkIdleMs: 900000,
      /** 流式：从开始到结束的总时长上限（毫秒） */
      streamMaxTotalMs: 3600000,
    },

    /**
     * true：始终使用下方 fixedPreset，不读写 localStorage 预设。
     * false：使用 localStorage 多预设；空列表时用 defaultPresetTemplate。
     */
    useFixedPreset: true,

    /** useFixedPreset 为 true 时使用的唯一预设 */
    fixedPreset: {
      id: "default",
      name: "默认直连",
      apiUrl: "https://api.gemai.cc/v1",
      apiKey: "sk-dGgtjVkFkojAGTh1G7lIgtOU94AlmWUDwvvJbWZqMJqd6VXD",
      model: "[CodeA]gemini-3.1-pro-preview",
      systemPrompt: "",
      temperature: 0.7,
    },

    /** useFixedPreset 为 false 且预设列表为空时的默认条目 */
    defaultPresetTemplate: {
      id: "default",
      name: "默认直连",
      apiUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
      systemPrompt: "",
      temperature: 0.7,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
