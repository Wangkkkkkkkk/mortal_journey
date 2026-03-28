/**
 * 剧情对话：把 preset + 世界书 + 运行时存档拼成 OpenAI 格式 messages，交给 TavernHelper.generateFromMessages。
 */
(function (global) {
  "use strict";

  function getPresetApi() {
    return global.MortalJourneyAiPreset;
  }

  function getWorldBookApi() {
    return global.MortalJourneyWorldBook;
  }

  function formatRealmLine(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm) || {};
    var major = r.major || "练气";
    var minor = r.minor || "初期";
    return major + minor;
  }

  function linggenElementsText(linggenFull) {
    var raw = linggenFull == null ? "" : String(linggenFull).trim();
    if (raw === "" || raw === "无灵根") return "无";
    var LS = global.LinggenState;
    var els = LS && typeof LS.parseElements === "function" ? LS.parseElements(raw) : [];
    return els.length ? els.join("、") : raw;
  }

  /**
   * 供关键词扫描与 system 摘要
   */
  function buildRuntimeStateBlock(G, fc) {
    if (!G && !fc) return "";
    var lines = [];
    if (G && G.worldTimeString) lines.push("世界时间：" + G.worldTimeString);
    if (fc || G) lines.push("境界：" + formatRealmLine(fc, G));
    if (fc && fc.birthLocation) lines.push("出生地：" + String(fc.birthLocation));
    if (fc && fc.linggen) lines.push("灵根（五行）：" + linggenElementsText(fc.linggen));
    if (fc && Array.isArray(fc.worldFactors) && fc.worldFactors.length) {
      var names = fc.worldFactors
        .map(function (f) {
          return f && f.name;
        })
        .filter(Boolean);
      if (names.length) lines.push("世界因子：" + names.join("、"));
    }
    if (!lines.length) return "";
    return "【当前存档摘要】\n" + lines.join("\n");
  }

  function buildScanText(userText, priorHistory, stateBlock) {
    var parts = [];
    if (stateBlock) parts.push(stateBlock);
    if (priorHistory && priorHistory.length) {
      for (var i = 0; i < priorHistory.length; i++) {
        var m = priorHistory[i];
        if (m && m.content) parts.push(String(m.content));
      }
    }
    parts.push(String(userText || ""));
    return parts.join("\n");
  }

  /**
   * @param {Object} opts
   * @param {string} opts.userText
   * @param {Array<{role:string,content:string}>} [opts.priorHistory]
   * @returns {Array<{role:string,content:string}>}
   */
  function buildMessages(opts) {
    var userText = String((opts && opts.userText) || "").trim();
    var priorHistory = opts && Array.isArray(opts.priorHistory) ? opts.priorHistory : [];

    var P = getPresetApi();
    var WB = getWorldBookApi();
    var G = global.MortalJourneyGame || {};
    var fc = G.fateChoice || null;

    var systemParts = [];
    if (P && typeof P.getSystemPrompt === "function") {
      var sp = P.getSystemPrompt();
      if (sp) systemParts.push(sp);
    }

    var stateBlock = "";
    if (P && typeof P.shouldAppendRuntimeState === "function" && P.shouldAppendRuntimeState()) {
      stateBlock = buildRuntimeStateBlock(G, fc);
      if (stateBlock) systemParts.push(stateBlock);
    }

    var scanText = buildScanText(userText, priorHistory, stateBlock);
    if (WB && typeof WB.selectEntries === "function" && typeof WB.formatForSystem === "function") {
      var entries = WB.selectEntries(scanText, { maxEntries: 10 });
      var wbBlock = WB.formatForSystem(entries);
      if (wbBlock) systemParts.push(wbBlock);
    }

    var systemContent = systemParts.filter(Boolean).join("\n\n");

    var messages = [];
    if (systemContent) messages.push({ role: "system", content: systemContent });

    for (var h = 0; h < priorHistory.length; h++) {
      var msg = priorHistory[h];
      if (!msg || !msg.role || msg.content == null) continue;
      var role = msg.role === "assistant" ? "assistant" : "user";
      messages.push({ role: role, content: String(msg.content) });
    }

    var prefix = P && typeof P.getUserPrefix === "function" ? P.getUserPrefix() : "";
    var userBody = (prefix ? prefix + "\n" : "") + userText;
    messages.push({ role: "user", content: userBody });

    return messages;
  }

  /**
   * @param {Object} opts
   * @param {string} [opts.userText] 与 priorHistory 一起用于 buildMessages；若已传 messages 则可省略
   * @param {Array<{role:string,content:string}>} [opts.priorHistory]
   * @param {Array<{role:string,content:string}>} [opts.messages] 若已构建好则直接使用，不再调用 buildMessages
   * @param {boolean} [opts.shouldStream=true]
   * @param {function(string,string):void} [opts.onDelta]
   * @param {AbortSignal} [opts.signal]
   */
  function sendTurn(opts) {
    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      return Promise.reject(new Error("TavernHelper 未加载：请在 main.html 中于本脚本之后引入 silly_tarven/bridge-config.js 与 bridge.js。"));
    }
    var o = opts || {};
    var messages =
      Array.isArray(o.messages) && o.messages.length > 0 ? o.messages : buildMessages(o);
    return TH.generateFromMessages({
      messages: messages,
      should_stream: opts && opts.shouldStream !== false,
      onDelta: opts && opts.onDelta,
      signal: opts && opts.signal,
    });
  }

  global.MortalJourneyStoryChat = {
    buildMessages: buildMessages,
    buildRuntimeStateBlock: buildRuntimeStateBlock,
    sendTurn: sendTurn,
  };
})(typeof window !== "undefined" ? window : globalThis);
