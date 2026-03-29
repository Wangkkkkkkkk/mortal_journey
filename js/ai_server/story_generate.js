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

  function lookupGongfaTypeFromConfig(name) {
    var C = global.MjCreationConfig;
    if (!C || typeof C.getGongfaDescribe !== "function" || name == null) return "";
    var g = C.getGongfaDescribe(String(name).trim());
    if (g && g.type != null && String(g.type).trim() !== "") return String(g.type).trim();
    return "";
  }

  function appendBagAndGongfaLines(lines, G) {
    if (!G) return;
    var gf = G.gongfaSlots;
    if (Array.isArray(gf) && gf.length) {
      var gn = [];
      for (var i = 0; i < gf.length; i++) {
        var cell = gf[i];
        if (cell && cell.name) {
          var nm = String(cell.name);
          var ty =
            cell.type != null && String(cell.type).trim() !== ""
              ? String(cell.type).trim()
              : lookupGongfaTypeFromConfig(nm);
          gn.push(ty ? nm + "（" + ty + "）" : nm);
        }
      }
      if (gn.length) lines.push("【已学功法】" + gn.join("、"));
    }
    var inv = G.inventorySlots;
    if (!Array.isArray(inv) || !inv.length) return;
    var bits = [];
    for (var j = 0; j < inv.length; j++) {
      var it = inv[j];
      if (!it || !it.name) continue;
      var cn =
        typeof it.count === "number" && isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
      bits.push(String(it.name) + "×" + cn);
    }
    if (bits.length) lines.push("【储物袋】" + bits.join("、"));
  }

  function appendEquippedLines(lines, G) {
    if (!G || !Array.isArray(G.equippedSlots)) return;
    var slotLabels = ["武器", "法器", "防具"];
    var parts = [];
    for (var i = 0; i < G.equippedSlots.length; i++) {
      var it = G.equippedSlots[i];
      if (it && (it.name != null ? it.name : it.label)) {
        parts.push(slotLabels[i] + "：" + String(it.name != null ? it.name : it.label));
      }
    }
    if (parts.length) lines.push("【装备佩戴】" + parts.join("；"));
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

  /** system 内各大块之间的分隔（便于模型与人类阅读日志） */
  var SYSTEM_BLOCK_SEPARATOR = "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  /**
   * 供关键词扫描与 system 摘要（分块排版：角色概要 / 面板 / 世界因子 / 天赋 / 装备行囊）
   */
  function buildRuntimeStateBlock(G, fc) {
    if (!G && !fc) return "";
    var profile = [];
    if (G && G.worldTimeString) profile.push("世界时间：" + G.worldTimeString);
    if (fc || G) profile.push("境界：" + formatRealmLine(fc, G));
    if (fc || G) {
      var RS = global.RealmState;
      var rr = (fc && fc.realm) || (G && G.realm) || {};
      var maj = rr.major || "";
      var mino = rr.minor;
      var req =
        RS && typeof RS.getCultivationRequired === "function"
          ? RS.getCultivationRequired(maj, mino)
          : null;
      var xw = G && typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.max(0, Math.floor(G.xiuwei)) : 0;
      if (req != null && req > 0) profile.push("修为：" + xw + " / " + req + "（本阶段需求）");
      else profile.push("修为：" + xw);
    }
    if (fc && fc.gender) profile.push("性别：" + String(fc.gender));
    if (G && G.age != null) profile.push("年龄：" + String(G.age));
    if (G && G.shouyuan != null) profile.push("寿元：" + String(G.shouyuan));
    if (fc && fc.birthLocation) profile.push("出生地：" + String(fc.birthLocation));
    var curLoc =
      G && G.currentLocation != null && String(G.currentLocation).trim() !== ""
        ? String(G.currentLocation).trim()
        : "";
    if (curLoc) profile.push("当前地点：" + curLoc);
    if (fc && fc.linggen) {
      var lgRaw = String(fc.linggen).trim();
      profile.push("灵根：" + lgRaw + "（五行：" + linggenElementsText(fc.linggen) + "）");
    }
    if (fc && fc.difficulty) profile.push("难度模式：" + String(fc.difficulty));
    if (fc && fc.birth) {
      var b = "出身：" + fc.birth;
      if (fc.birth === "自定义" && fc.customBirth) {
        b += "（" + String(fc.customBirth.name || fc.customBirth.tag || "").trim() + "）";
      }
      profile.push(b);
    }
    if (fc && fc.race) {
      var r = "种族：" + fc.race;
      if (fc.race === "自定义" && fc.customRace) {
        r += "（" + String(fc.customRace.name || fc.customRace.tag || "").trim() + "）";
      }
      profile.push(r);
    }

    var attr = [];
    appendPlayerBaseLines(attr, G, fc);

    var wf = [];
    appendWorldFactorLines(wf, fc);

    var traits = [];
    appendTraitsLines(traits, fc);

    var loadout = [];
    appendEquippedLines(loadout, G);
    appendBagAndGongfaLines(loadout, G);

    var sections = [];
    if (profile.length) sections.push("【角色概要】\n" + profile.join("\n"));
    if (attr.length) sections.push(attr.join("\n"));
    if (wf.length) sections.push(wf.join("\n"));
    if (traits.length) sections.push(traits.join("\n"));
    if (loadout.length) sections.push(loadout.join("\n"));

    if (!sections.length) return "";
    return "【当前存档摘要】\n\n" + sections.join("\n\n");
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

    var systemContent = systemParts.filter(Boolean).join(SYSTEM_BLOCK_SEPARATOR);

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
   * 将 messages 格式化为易读文本（调试用日志，非 API 载荷）
   */
  function formatMessagesForHumanLog(messages) {
    if (!Array.isArray(messages)) return String(messages);
    var out = [];
    out.push("[共 " + messages.length + " 条 message，按发送顺序]");
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (!m) continue;
      var role = m.role != null ? String(m.role) : "?";
      out.push("");
      out.push("┌── #" + (i + 1) + " · role: " + role + " ─────────────────────────────");
      out.push(String(m.content != null ? m.content : ""));
      out.push("└──────────────────────────────────────────────────────────");
    }
    return out.join("\n");
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
    formatMessagesForHumanLog: formatMessagesForHumanLog,
    sendTurn: sendTurn,
  };
})(typeof window !== "undefined" ? window : globalThis);
