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

  function numOrEmpty(n) {
    return typeof n === "number" && isFinite(n) ? String(Math.round(n)) : "";
  }

  /**
   * 左侧面板同源：战斗八维 + 魅力/气运；血蓝优先当前值/上限（与 UI 一致）
   */
  function appendPlayerBaseLines(lines, G, fc) {
    var pb = (G && G.playerBase) || (fc && fc.playerBase);
    if (!pb || typeof pb !== "object") return;
    lines.push("【面板属性】");
    var hpMax = typeof pb.hp === "number" && isFinite(pb.hp) ? pb.hp : null;
    var mpMax = typeof pb.mp === "number" && isFinite(pb.mp) ? pb.mp : null;
    var curH = G && typeof G.currentHp === "number" && isFinite(G.currentHp) ? G.currentHp : hpMax;
    var curM = G && typeof G.currentMp === "number" && isFinite(G.currentMp) ? G.currentMp : mpMax;
    if (hpMax != null) {
      lines.push(
        "血量：" +
          (curH != null && hpMax != null ? Math.round(curH) + " / " + Math.round(hpMax) : Math.round(hpMax)),
      );
    }
    if (mpMax != null) {
      lines.push(
        "法力：" +
          (curM != null && mpMax != null ? Math.round(curM) + " / " + Math.round(mpMax) : Math.round(mpMax)),
      );
    }
    var pairs = [
      ["物攻", pb.patk],
      ["物防", pb.pdef],
      ["法攻", pb.matk],
      ["法防", pb.mdef],
      ["神识", pb.sense],
      ["脚力", pb.foot],
      ["魅力", pb.charm],
      ["气运", pb.luck],
    ];
    for (var i = 0; i < pairs.length; i++) {
      var s = numOrEmpty(pairs[i][1]);
      if (s !== "") lines.push(pairs[i][0] + "：" + s);
    }
  }

  function appendWorldFactorLines(lines, fc) {
    if (!fc || !Array.isArray(fc.worldFactors) || !fc.worldFactors.length) return;
    lines.push("【世界因子】");
    for (var i = 0; i < fc.worldFactors.length; i++) {
      var f = fc.worldFactors[i];
      if (!f || !f.name) continue;
      var head = "· " + f.name + (f.isCustom ? "（自定义）" : "");
      lines.push(head);
      if (f.desc) lines.push("  背景：" + String(f.desc));
      if (f.effect) lines.push("  效果：" + String(f.effect));
    }
  }

  function appendTraitsLines(lines, fc) {
    if (!fc || !Array.isArray(fc.traits) || !fc.traits.length) {
      if (fc && fc.difficulty === "凡人") lines.push("【逆天改命】凡人模式：无天赋词条。");
      else if (fc && fc.difficulty === "简单") lines.push("【逆天改命】未选择任何词条。");
      return;
    }
    lines.push("【逆天改命】");
    for (var i = 0; i < fc.traits.length; i++) {
      var t = fc.traits[i];
      if (!t || !t.name) continue;
      var bits = [t.name];
      if (t.rarity) bits.push("（" + t.rarity + "）");
      lines.push("· " + bits.join(""));
      if (t.desc) lines.push("  简述：" + String(t.desc));
      if (t.effects != null && String(t.effects) !== "") lines.push("  效果：" + String(t.effects));
    }
  }

  /**
   * 供关键词扫描与 system 摘要
   */
  function buildRuntimeStateBlock(G, fc) {
    if (!G && !fc) return "";
    var lines = [];
    if (G && G.worldTimeString) lines.push("世界时间：" + G.worldTimeString);
    if (fc || G) lines.push("境界：" + formatRealmLine(fc, G));
    if (fc && fc.gender) lines.push("性别：" + String(fc.gender));
    if (G && G.age != null) lines.push("年龄：" + String(G.age));
    if (G && G.shouyuan != null) lines.push("寿元：" + String(G.shouyuan));
    if (fc && fc.birthLocation) lines.push("出生地：" + String(fc.birthLocation));
    if (fc && fc.linggen) {
      var lgRaw = String(fc.linggen).trim();
      lines.push("灵根：" + lgRaw + "（五行：" + linggenElementsText(fc.linggen) + "）");
    }
    if (fc && fc.difficulty) lines.push("难度模式：" + String(fc.difficulty));
    if (fc && fc.birth) {
      var b = "出身：" + fc.birth;
      if (fc.birth === "自定义" && fc.customBirth) {
        b += "（" + String(fc.customBirth.name || fc.customBirth.tag || "").trim() + "）";
      }
      lines.push(b);
    }
    if (fc && fc.race) {
      var r = "种族：" + fc.race;
      if (fc.race === "自定义" && fc.customRace) {
        r += "（" + String(fc.customRace.name || fc.customRace.tag || "").trim() + "）";
      }
      lines.push(r);
    }

    appendPlayerBaseLines(lines, G, fc);
    appendWorldFactorLines(lines, fc);
    appendTraitsLines(lines, fc);

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
