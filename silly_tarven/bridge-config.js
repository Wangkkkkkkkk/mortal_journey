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
      /**
       * 非流式：从发起到读完整段 JSON 正文的总上限（毫秒）。
       * 界面在收到完整 body 前不会显示一个字，大 prompt + 慢模型等几分钟属正常；超时才会报错。
       * 也可在 fixedPreset 上单独设 requestTimeoutMs 覆盖本值。
       */
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

    /**
     * 主界面「剧情 / 状态」对话是否走 SSE 流式。
     * false：整段生成完成后一次性显示（部分中转/模型更稳定，推荐）。
     * true：逐字流式输出。
     */
    useStreamingChat: false,

    /** useFixedPreset 为 true 时使用的唯一预设 */
    fixedPreset: {
      id: "default",
      name: "默认直连",
      apiUrl: "https://api.gemai.cc/v1",
      apiKey: "sk-dGgtjVkFkojAGTh1G7lIgtOU94AlmWUDwvvJbWZqMJqd6VXD",
      model: "[CodeA]gemini-3.1-pro-preview",
      /** 可选：非流式总超时（毫秒），不设则用 timeouts.nonStreamMs */
      // requestTimeoutMs: 480000,
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
