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
    if (!g || typeof g !== "object") return "";
    var st =
      g.subtype != null && String(g.subtype).trim() !== ""
        ? String(g.subtype).trim()
        : g.subType != null && String(g.subType).trim() !== ""
          ? String(g.subType).trim()
          : "";
    if (st) return st;
    if (g.type != null && String(g.type).trim() !== "") {
      var ty = String(g.type).trim();
      if (ty !== "功法") return ty;
    }
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

  function appendNearbyNpcsLines(lines, G) {
    if (!G || !Array.isArray(G.nearbyNpcs) || !G.nearbyNpcs.length) return;
    var pushed = 0;
    lines.push("【当前可见人物】");
    for (var i = 0; i < G.nearbyNpcs.length; i++) {
      var n = G.nearbyNpcs[i];
      if (!n || typeof n !== "object") continue;
      if (n.isVisible === false) continue;
      var name = n.displayName != null && String(n.displayName).trim() !== "" ? String(n.displayName).trim() : "未命名";
      var realm = formatRealmLine(n, n);
      var fav =
        typeof n.favorability === "number" && isFinite(n.favorability)
          ? Math.max(-99, Math.min(99, Math.round(n.favorability)))
          : 0;
      var iden = n.identity != null && String(n.identity).trim() !== "" ? String(n.identity).trim() : "";
      var brief = "· " + name + "（" + realm + "）";
      if (iden) brief += "｜身份：" + iden;
      brief += "｜好感度：" + fav;
      if (n.isDead === true) brief += "｜阵亡（血量 0）";
      lines.push(brief);
      pushed++;
    }
    // 兜底：避免该块只有标题，显式告知当前无可见 NPC。
    if (!pushed) {
      lines.push("· 当前无可见 NPC");
    }
  }

  /** 剧情文末：新出场人物一句话战设简介，供状态 AI 映射到功法/装备表（与 state_generate 解析成对） */
  var NPC_STORY_HINTS_TAG_OPEN = "<mj_npc_story_hints>";
  var NPC_STORY_HINTS_TAG_CLOSE = "</mj_npc_story_hints>";
  var ACTION_SUGGESTIONS_TAG_OPEN = "<mj_action_suggestions>";
  var ACTION_SUGGESTIONS_TAG_CLOSE = "</mj_action_suggestions>";
  var BATTLE_TRIGGER_TAG_OPEN = "<mj_battle_trigger>";
  var BATTLE_TRIGGER_TAG_CLOSE = "</mj_battle_trigger>";
  /** 玩家可见叙事信封（与思考过程分离；区分大小写，须原样输出） */
  var STORY_BODY_TAG_OPEN = "<mj_story_body>";
  var STORY_BODY_TAG_CLOSE = "</mj_story_body>";
  /** 剧情回合末：百字内摘要，供下轮 API 替代冗长 assistant 历史（不向玩家展示） */
  var STORY_SNAPSHOT_TAG_OPEN = "<mj_story_snapshot>";
  var STORY_SNAPSHOT_TAG_CLOSE = "</mj_story_snapshot>";

  /** system 内各大块之间的分隔（便于模型与人类阅读日志） */
  var SYSTEM_BLOCK_SEPARATOR = "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  /**
   * 从叙事正文中移除剧情 AI 文末的机器标签（写入 chatHistory / 气泡前调用，避免玩家看到 JSON；状态回合仍应使用未剥离的全文）。
   */
  function stripNpcStoryHintsFromNarrative(text) {
    var raw = String(text || "");
    // 与 NPC_STORY_HINTS_TAG_OPEN/CLOSE 同名；用字面量避免 RegExp 拼接遗漏转义
    var re = /<mj_npc_story_hints\s*>\s*[\s\S]*?<\/mj_npc_story_hints\s*>/gi;
    return raw.replace(re, "").trim();
  }

  function stripActionSuggestionsFromNarrative(text) {
    var raw = String(text || "");
    var re = /<mj_action_suggestions\s*>\s*[\s\S]*?<\/mj_action_suggestions\s*>/gi;
    return raw.replace(re, "").trim();
  }

  function stripBattleTriggerFromNarrative(text) {
    var raw = String(text || "");
    var re = /<mj_battle_trigger\s*>\s*[\s\S]*?<\/mj_battle_trigger\s*>/gi;
    return raw.replace(re, "").trim();
  }

  function clampPlotSnapshotText(inner) {
    var t = String(inner || "")
      .replace(/\r+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return "";
    try {
      var arr = Array.from(t);
      if (arr.length <= 100) return arr.join("");
      return arr.slice(0, 100).join("") + "…";
    } catch (_e) {
      return t.length <= 100 ? t : t.slice(0, 100) + "…";
    }
  }

  /**
   * 从整段回复中提取 <mj_story_snapshot> 内文本（已截断至约百字）。
   */
  function extractStorySnapshotFromNarrative(text) {
    var raw = String(text || "");
    var re = /<mj_story_snapshot\s*>([\s\S]*?)<\/mj_story_snapshot\s*>/i;
    var m = re.exec(raw);
    if (!m || !m[1]) return "";
    return clampPlotSnapshotText(m[1]);
  }

  /**
   * 移除剧情快照标签（写入聊天 / 交状态回合前调用）。
   */
  function stripStorySnapshotFromNarrative(text) {
    var raw = String(text || "");
    var re = /<mj_story_snapshot\s*>\s*[\s\S]*?<\/mj_story_snapshot\s*>/gi;
    return raw.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  function isAssistantMessageUnusableForPlotFallback(content) {
    var s = String(content || "").trim();
    if (!s) return true;
    if (/^【剧情\s*AI\s*回复为空】/.test(s)) return true;
    if (/^【剧情(?:\s*AI)?\s*[（(]?无内容[)）]?】/.test(s)) return true;
    return false;
  }

  /**
   * 无快照字段的旧档：用最近一条 assistant 可见正文兜底，避免下轮完全失上下文。
   */
  function fallbackPlotSummaryFromPriorAssistants(priorHistory) {
    if (!priorHistory || !priorHistory.length) return "";
    for (var i = priorHistory.length - 1; i >= 0; i--) {
      var msg = priorHistory[i];
      if (!msg || msg.role !== "assistant" || msg.content == null) continue;
      if (isAssistantMessageUnusableForPlotFallback(msg.content)) continue;
      var snapFromTags = extractStorySnapshotFromNarrative(String(msg.content || ""));
      if (snapFromTags && String(snapFromTags).trim()) return String(snapFromTags).trim();
      var synthesized = synthesizePlotSnapshotFromVisibleNarrative(String(msg.content || ""));
      if (synthesized && String(synthesized).trim()) return String(synthesized).trim();
      var rough = String(msg.content)
        .replace(/\r+/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!rough) continue;
      try {
        var arr = Array.from(rough);
        if (arr.length <= 240) return arr.join("");
        return arr.slice(0, 240).join("") + "…";
      } catch (_e2) {
        return rough.length <= 240 ? rough : rough.slice(0, 240) + "…";
      }
    }
    return "";
  }

  function resolvePlotSnapshotForApi(G, priorHistory) {
    var s = G && G.chatPlotSnapshot != null ? String(G.chatPlotSnapshot).trim() : "";
    if (s) return s;
    return fallbackPlotSummaryFromPriorAssistants(priorHistory);
  }

  /**
   * 模型未输出 <mj_story_snapshot> 时：从正文信封内取玩家可见叙事再压成百字摘要。
   * （旧实现直接截断整段 raw，易吃到信封外的思考英文或 <mj_story_body> 标签名，导致快照失真或看似「未更新」。）
   */
  function synthesizePlotSnapshotFromVisibleNarrative(text) {
    var raw = String(text || "").replace(/\uFEFF/g, "");
    var resolved = resolveStoryReplyForPipeline(raw);
    var base =
      resolved && resolved.sansLeak && String(resolved.sansLeak).trim()
        ? String(resolved.sansLeak)
        : stripStoryAiMetaLeakFromNarrative(raw);
    var noMachine = stripNpcStoryHintsFromNarrative(base);
    noMachine = stripActionSuggestionsFromNarrative(noMachine);
    noMachine = stripBattleTriggerFromNarrative(noMachine);
    noMachine = stripStorySnapshotFromNarrative(noMachine);
    return clampPlotSnapshotText(String(noMachine || "").trim());
  }

  function extractActionSuggestionsFromNarrative(text) {
    var raw = String(text || "");
    var out = {
      aggressive: "",
      neutral: "",
      cautious: "",
      veryCautious: "",
    };
    var m = /<mj_action_suggestions\s*>([\s\S]*?)<\/mj_action_suggestions\s*>/i.exec(raw);
    if (!m || !m[1]) return out;
    var body = String(m[1]).trim();
    if (!body) return out;
    try {
      var obj = JSON.parse(body);
      if (!obj || typeof obj !== "object") return out;
      if (obj.aggressive != null) out.aggressive = String(obj.aggressive).trim();
      if (obj.neutral != null) out.neutral = String(obj.neutral).trim();
      if (obj.cautious != null) out.cautious = String(obj.cautious).trim();
      if (obj.veryCautious != null) out.veryCautious = String(obj.veryCautious).trim();
      return out;
    } catch (_e) {
      return out;
    }
  }

  function normalizeBattleSide(rawList, fallbackName) {
    var out = [];
    var list = Array.isArray(rawList) ? rawList : [];
    for (var i = 0; i < list.length && out.length < 3; i++) {
      var u = list[i];
      if (!u || typeof u !== "object") continue;
      var nm = u.displayName != null ? String(u.displayName).trim() : "";
      if (!nm) continue;
      var idRaw = u.id != null ? String(u.id).trim() : "";
      var row = {
        displayName: nm,
        roleHint: u.roleHint != null ? String(u.roleHint).trim() : "",
      };
      if (idRaw) row.id = idRaw;
      out.push(row);
    }
    if (!out.length && fallbackName) {
      out.push({ displayName: String(fallbackName), roleHint: "主角" });
    }
    if (out.length > 3) out = out.slice(0, 3);
    return out;
  }

  function extractBattleTriggerFromNarrative(text, game) {
    var raw = String(text || "");
    var G = game || global.MortalJourneyGame || {};
    var fallbackPlayerName =
      G &&
      G.fateChoice &&
      G.fateChoice.playerName != null &&
      String(G.fateChoice.playerName).trim() !== ""
        ? String(G.fateChoice.playerName).trim()
        : "主角";
    var empty = {
      shouldEnterBattle: false,
      triggerKind: "",
      triggerReason: "",
      allies: normalizeBattleSide([], fallbackPlayerName),
      enemies: [],
    };
    var m = /<mj_battle_trigger\s*>([\s\S]*?)<\/mj_battle_trigger\s*>/i.exec(raw);
    if (!m || !m[1]) return empty;
    var body = String(m[1]).trim();
    if (!body) return empty;
    try {
      var obj = JSON.parse(body);
      if (!obj || typeof obj !== "object") return empty;
      var should = !!obj.shouldEnterBattle;
      var kind = obj.triggerKind != null ? String(obj.triggerKind).trim() : "";
      var reason = obj.triggerReason != null ? String(obj.triggerReason).trim() : "";
      var allies = normalizeBattleSide(obj.allies, fallbackPlayerName);
      var enemies = normalizeBattleSide(obj.enemies, "");
      if (allies.length > 3) allies = allies.slice(0, 3);
      if (enemies.length > 3) enemies = enemies.slice(0, 3);
      if (!should) {
        return {
          shouldEnterBattle: false,
          triggerKind: kind,
          triggerReason: reason,
          allies: allies,
          enemies: enemies,
        };
      }
      if (!allies.length) allies = normalizeBattleSide([], fallbackPlayerName);
      if (!enemies.length) {
        return empty;
      }
      return {
        shouldEnterBattle: true,
        triggerKind: kind || "passive",
        triggerReason: reason,
        allies: allies,
        enemies: enemies,
      };
    } catch (_e) {
      return empty;
    }
  }

  /**
   * 去除部分模型泄露的英文/元叙述（Analyzing、My Current Circumstances、Okay, so here's… 等），避免污染玩家与状态回合。
   * 若元叙述插在中文正文与 <mj_…> 标签之间，只删中间段，保留标签块（extract 与状态回合仍可用）。
   * 在保留 mj_npc_story_hints 之前调用（该标签内为 JSON，一般不会误触发）。
   */
  function stripStoryAiMetaLeakFromNarrative(text) {
    var s = String(text || "");
    var p = "(?:^|\\n+)\\s*";
    var markerSources = [
      p + "\\*{0,2}\\s*Analyzing\\b",
      p + "\\*{0,2}\\s*Reflection\\b",
      p + "\\*{0,2}\\s*Planning\\b",
      p + "\\*{0,2}\\s*Thought\\s*process\\b",
      p + "\\*{0,2}\\s*Final\\s+answer\\b",
      p + "<redacted_thinking>\\b",
      p + "\\*{0,2}\\s*Note\\s+to\\s*self\\b",
      p + "\\*{0,2}\\s*My\\s+Current\\s+Circumstances\\b",
      p + "\\*{0,2}\\s*Course\\s+of\\s+Action\\b",
      p + "\\*{0,2}\\s*Scene\\s*analysis\\b",
      p + "Okay,?\\s+so\\s+here'?s\\b",
      p + "Thinking\\s+about\\s+my\\b",
      p + "This\\s+gives\\s+me\\s+the\\s+following\\b",
      p + "Given\\s+my\\s+circumstances\\b",
      p + "I\\s+now\\s+need\\s+to\\b",
      p + "I\\s+decide\\s+I\\s+need\\s+to\\b",
      p + "As\\s+I\\s+make\\s+my\\s+way\\b",
      p + "I've\\s+just\\s+finished\\b",
      p + "I've\\s+been\\s+",
      p + "I\\s+need\\s+to\\b",
      p + "My\\s+focus\\s+",
      p + "My\\s+goal\\??\\b",
      p + "The\\s+user\\s+wants\\b",
      p + "Let\\s+me\\s+(?:analyze|think|start|begin)\\b",
      p + "Now\\s+I\\s+will\\b",
      p + "Initially,?\\s+I\\s+",
      p + "I'?m\\s+Han\\s+Li\\b",
      p + "I\\s+am\\s+Han\\s+Li\\b",
      p + "I'?m\\s+\\d+\\s+years\\s+old\\b",
      p + "\\*\\s+\\*{0,2}\\s*Setting\\s*:",
      p + "\\*\\s+\\*{0,2}\\s*The\\s+Incident\\s*:",
      p + "\\*\\s+\\*{0,2}\\s*My\\s+Skills\\s*:",
      p + "\\*\\s+\\*{0,2}\\s*Interaction\\s*:",
    ];
    var cut = -1;
    for (var mi = 0; mi < markerSources.length; mi++) {
      var re = new RegExp(markerSources[mi], "im");
      var m = re.exec(s);
      if (m && typeof m.index === "number") {
        if (cut < 0 || m.index < cut) cut = m.index;
      }
    }
    if (cut < 0) return s;
    var tagPos = s.indexOf("<mj_", cut);
    var head = s.slice(0, cut).replace(/\s+$/, "");
    if (tagPos >= 0) {
      var tail = s.slice(tagPos).replace(/^\s+/, "");
      if (tail) return head ? head + "\n\n" + tail : tail;
    }
    return head;
  }

  /**
   * `</mj_story_body>` 之后往往还有合法机器标签，但模型也会在最后一个 `</mj_action_suggestions>` 后再追加英文思考。
   * 只抽取已知闭合标签块，按其在原文中的出现顺序拼接，丢弃其余尾部。
   */
  function extractPostBodyMachineTagBlocks(rest) {
    var r = String(rest || "");
    function one(re) {
      var m = re.exec(r);
      if (m && m[0]) return { idx: m.index, text: m[0].replace(/^\s+|\s+$/g, "") };
      return null;
    }
    var candidates = [
      one(/<mj_npc_story_hints\s*>[\s\S]*?<\/mj_npc_story_hints\s*>/i),
      one(/<mj_action_suggestions\s*>[\s\S]*?<\/mj_action_suggestions\s*>/i),
      one(/<mj_battle_trigger\s*>[\s\S]*?<\/mj_battle_trigger\s*>/i),
      one(/<mj_story_snapshot\s*>[\s\S]*?<\/mj_story_snapshot\s*>/i),
    ];
    var blocks = [];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i]) blocks.push(candidates[i]);
    }
    blocks.sort(function (a, b) {
      return a.idx - b.idx;
    });
    var parts = [];
    for (var j = 0; j < blocks.length; j++) {
      if (blocks[j].text) parts.push(blocks[j].text);
    }
    return parts.join("\n\n");
  }

  /**
   * 若存在 STORY_BODY 信封：仅标签内为玩家叙事（可含战备段）；标签外前后文本（含思考、英文提纲）一律忽略。
   * 返回的 sansLeak = 标签内正文 + 其后的机器标签（hints / action 等），供 extract 与状态回合使用。
   * 无闭合信封时回退为整段 stripStoryAiMetaLeakFromNarrative（兼容旧模型）。
   * @returns {{ sansLeak: string, usedBodyEnvelope: boolean }}
   */
  function resolveStoryReplyForPipeline(text) {
    var raw = String(text || "");
    var i0 = raw.indexOf(STORY_BODY_TAG_OPEN);
    var i1 = i0 >= 0 ? raw.indexOf(STORY_BODY_TAG_CLOSE, i0 + STORY_BODY_TAG_OPEN.length) : -1;
    if (i0 >= 0 && i1 > i0 + STORY_BODY_TAG_OPEN.length) {
      var inner = raw.slice(i0 + STORY_BODY_TAG_OPEN.length, i1).trim();
      inner = stripStoryAiMetaLeakFromNarrative(inner);
      var afterClose = raw.slice(i1 + STORY_BODY_TAG_CLOSE.length).replace(/^\s+/, "");
      var machineTail = extractPostBodyMachineTagBlocks(afterClose);
      var sansLeak = machineTail ? inner + "\n\n" + machineTail : inner;
      return { sansLeak: sansLeak, usedBodyEnvelope: true };
    }
    return {
      sansLeak: stripStoryAiMetaLeakFromNarrative(raw),
      usedBodyEnvelope: false,
    };
  }

  /**
   * 流式输出预览：已出现正文信封起始标签则只展示标签内未完成片段，避免把前置思考流式显示到聊天气泡。
   * 未出现信封前返回空串；若直到结束都无信封则回退为 stripStoryAiMetaLeakFromNarrative(全文)（旧模型）。
   */
  function visibleNarrativeForStreamingChunk(full) {
    var s = String(full || "");
    var i0 = s.indexOf(STORY_BODY_TAG_OPEN);
    if (i0 < 0) return "";
    var start = i0 + STORY_BODY_TAG_OPEN.length;
    var i1 = s.indexOf(STORY_BODY_TAG_CLOSE, start);
    var chunk = i1 >= 0 ? s.slice(start, i1) : s.slice(start);
    return stripStoryAiMetaLeakFromNarrative(chunk);
  }

  /**
   * 流式结束时若从未出现信封，用全文回退显示（与 resolveStoryReplyForPipeline 的无信封分支一致）。
   */
  function visibleNarrativeStreamFallback(full) {
    return stripStoryAiMetaLeakFromNarrative(String(full || ""));
  }

  /**
   * 与状态回合一致：「下品灵石」单颗在灵石等价刻度轴上的 value（各物 value 同轴）。
   */
  function lowerSpiritStoneValueUnit() {
    var s = global.MjDescribeSpiritStones && global.MjDescribeSpiritStones["下品灵石"];
    if (s && typeof s.value === "number" && isFinite(s.value) && s.value > 0) {
      return Math.max(1, Math.floor(s.value));
    }
    return 10;
  }

  function getActiveRuntimeRuleBlocks(vars) {
    var P = getPresetApi();
    if (P && typeof P.getRuntimeRuleBlocks === "function") {
      var blocks = P.getRuntimeRuleBlocks(vars);
      if (Array.isArray(blocks) && blocks.length) return blocks;
    }
    return [];
  }

  function buildRuntimeRuleBlock(lsv) {
    var ruleVars = {
      NPC_TAG_OPEN: NPC_STORY_HINTS_TAG_OPEN,
      NPC_TAG_CLOSE: NPC_STORY_HINTS_TAG_CLOSE,
      ACTION_SUGGESTIONS_TAG_OPEN: ACTION_SUGGESTIONS_TAG_OPEN,
      ACTION_SUGGESTIONS_TAG_CLOSE: ACTION_SUGGESTIONS_TAG_CLOSE,
      LSV: lsv,
    };
    var runtimeRuleBlocks = getActiveRuntimeRuleBlocks(ruleVars);
    var bits = [];
    for (var i = 0; i < runtimeRuleBlocks.length; i++) {
      var block = runtimeRuleBlocks[i] != null ? String(runtimeRuleBlocks[i]).trim() : "";
      if (block) bits.push(block);
    }
    return bits.join("\n\n");
  }

  /**
   * 上一场程序结算的战斗摘要：在结算未能写入聊天区（或兼容旧档）时注入剧情 system；
   * 正常流程下 appendBattleSettlementFromDetail 已把结算写入对话并置 storyBattleContextConsumed，此处为空。
   */
  function buildStoryPromptBattleSection(G) {
    if (!G || G.storyBattleContextConsumed) return "";
    var lb = G.lastBattleResult;
    if (!lb || typeof lb !== "object" || !lb.settlement || typeof lb.settlement !== "object") return "";
    var MC = global.MjMainScreenChat;
    var body =
      MC && typeof MC.formatBattleSettlementText === "function"
        ? MC.formatBattleSettlementText(lb.settlement)
        : "";
    if (!body) {
      var vic0 =
        lb.victor === "ally"
          ? "主角方胜利"
          : lb.victor === "enemy"
            ? "主角方撤退（未胜）"
            : String(lb.victor || "");
      var r0 = typeof lb.rounds === "number" && isFinite(lb.rounds) ? Math.max(0, Math.floor(lb.rounds)) : 0;
      body = "【战斗结算】" + vic0 + " · 共 " + r0 + " 轮（详情略）";
    }
    var head =
      "【上一场战斗（程序已回合制结算）】\n" +
      "以下为真实结算结果。你写下一段剧情时必须与此一致承接：可作文学描写，但不得改写胜负、各方大致伤势与法力消耗；若需再次动手，应推进为新的交战情境而非否认本场结果。\n";
    var meta = [];
    var pb = G.pendingBattle;
    if (pb && typeof pb === "object") {
      if (pb.triggerKind != null && String(pb.triggerKind).trim() !== "")
        meta.push("触发类型：" + String(pb.triggerKind).trim());
      if (pb.triggerReason != null && String(pb.triggerReason).trim() !== "")
        meta.push("触发说明：" + String(pb.triggerReason).trim());
      if (pb.worldTimeString != null && String(pb.worldTimeString).trim() !== "")
        meta.push("战时世界时间：" + String(pb.worldTimeString).trim());
      if (pb.currentLocation != null && String(pb.currentLocation).trim() !== "")
        meta.push("战时地点：" + String(pb.currentLocation).trim());
    }
    var metaStr = meta.length ? meta.join("\n") + "\n" : "";
    return head + metaStr + "\n" + body;
  }

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
    var playerName =
      fc && fc.playerName != null && String(fc.playerName).trim() !== ""
        ? String(fc.playerName).trim()
        : "主角姓名";
    profile.push("主角姓名：" + playerName);
    var npRaw =
      fc && fc.narrationPerson != null && String(fc.narrationPerson).trim() !== ""
        ? String(fc.narrationPerson).trim()
        : "second";
    var narrationLabel = "第二人称（你）";
    if (npRaw === "first") narrationLabel = "第一人称（我）";
    else if (npRaw === "third") narrationLabel = "第三人称（" + playerName + "）";
    profile.push("叙事人称偏好：" + narrationLabel);
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
    var nearby = [];
    appendNearbyNpcsLines(nearby, G);

    var attr = [];
    appendPlayerBaseLines(attr, G, fc);

    var wf = [];
    appendWorldFactorLines(wf, fc);

    var traits = [];
    appendTraitsLines(traits, fc);

    var loadout = [];
    appendEquippedLines(loadout, G);
    appendBagAndGongfaLines(loadout, G);

    var battleStory = buildStoryPromptBattleSection(G);

    var sections = [];
    if (profile.length) sections.push("【角色概要】\n" + profile.join("\n"));
    if (nearby.length) sections.push(nearby.join("\n"));
    if (attr.length) sections.push(attr.join("\n"));
    if (wf.length) sections.push(wf.join("\n"));
    if (traits.length) sections.push(traits.join("\n"));
    if (loadout.length) sections.push(loadout.join("\n"));
    if (battleStory) sections.push(battleStory);

    if (!sections.length) return "";
    return "【当前存档摘要】\n\n" + sections.join("\n\n");
  }

  function buildScanText(userText, priorHistory, stateBlock) {
    var parts = [];
    if (stateBlock) parts.push(stateBlock);
    if (priorHistory && priorHistory.length) {
      for (var i = 0; i < priorHistory.length; i++) {
        var m = priorHistory[i];
        if (!m || m.content == null) continue;
        if (m.role === "assistant") continue;
        if (m.role === "battle_settlement") {
          parts.push(String(m.content));
          continue;
        }
        parts.push(String(m.content));
      }
    }
    var snapScan = resolvePlotSnapshotForApi(global.MortalJourneyGame || {}, priorHistory);
    if (snapScan) parts.push("【剧情快照】\n" + snapScan);
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
    var forceBattleIntent = !!(opts && opts.forceBattleIntent);

    var P = getPresetApi();
    var WB = getWorldBookApi();
    var G = global.MortalJourneyGame || {};
    var fc = G.fateChoice || null;

    var systemParts = [];
    if (P && typeof P.getSystemPrompt === "function") {
      var sp = P.getSystemPrompt();
      if (sp) systemParts.push(sp);
    }

    var lsv = lowerSpiritStoneValueUnit();
    var runtimeRuleBlock = buildRuntimeRuleBlock(lsv);
    if (runtimeRuleBlock) systemParts.push(runtimeRuleBlock);

    var stateBlock = "";
    if (P && typeof P.shouldAppendRuntimeState === "function" && P.shouldAppendRuntimeState()) {
      stateBlock = buildRuntimeStateBlock(G, fc);
    }

    var scanText = buildScanText(userText, priorHistory, stateBlock);
    if (WB && typeof WB.selectEntries === "function" && typeof WB.formatForSystem === "function") {
      var entries = WB.selectEntries(scanText, { maxEntries: 10 });
      var wbBlock = WB.formatForSystem(entries);
      if (wbBlock) systemParts.push(wbBlock);
    }
    // 实时状态块始终置于 system 最后，确保模型将其视为最新口径
    if (stateBlock) systemParts.push(stateBlock);

    var systemContent = systemParts.filter(Boolean).join(SYSTEM_BLOCK_SEPARATOR);

    var messages = [];
    if (systemContent) messages.push({ role: "system", content: systemContent });

    for (var h = 0; h < priorHistory.length; h++) {
      var msg = priorHistory[h];
      if (!msg || !msg.role || msg.content == null) continue;
      if (msg.role === "assistant") continue;
      if (msg.role === "battle_settlement") {
        messages.push({ role: "user", content: String(msg.content) });
        continue;
      }
      messages.push({ role: "user", content: String(msg.content) });
    }

    var snapApi = resolvePlotSnapshotForApi(G, priorHistory);
    if (snapApi) {
      messages.push({ role: "assistant", content: "【剧情快照】\n" + snapApi });
    }

    var prefix = P && typeof P.getUserPrefix === "function" ? P.getUserPrefix() : "";
    var battleIntentHint = forceBattleIntent
      ? "\n[系统战斗意图提示] 玩家本轮明确表达了战斗/击杀/对战意图；若对象存在且可开战，本轮应触发战斗流程。"
      : "";
    var userBody = (prefix ? prefix + "\n" : "") + userText + battleIntentHint;
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
    buildStoryPromptBattleSection: buildStoryPromptBattleSection,
    formatMessagesForHumanLog: formatMessagesForHumanLog,
    sendTurn: sendTurn,
    NPC_STORY_HINTS_TAG_OPEN: NPC_STORY_HINTS_TAG_OPEN,
    NPC_STORY_HINTS_TAG_CLOSE: NPC_STORY_HINTS_TAG_CLOSE,
    ACTION_SUGGESTIONS_TAG_OPEN: ACTION_SUGGESTIONS_TAG_OPEN,
    ACTION_SUGGESTIONS_TAG_CLOSE: ACTION_SUGGESTIONS_TAG_CLOSE,
    BATTLE_TRIGGER_TAG_OPEN: BATTLE_TRIGGER_TAG_OPEN,
    BATTLE_TRIGGER_TAG_CLOSE: BATTLE_TRIGGER_TAG_CLOSE,
    STORY_BODY_TAG_OPEN: STORY_BODY_TAG_OPEN,
    STORY_BODY_TAG_CLOSE: STORY_BODY_TAG_CLOSE,
    STORY_SNAPSHOT_TAG_OPEN: STORY_SNAPSHOT_TAG_OPEN,
    STORY_SNAPSHOT_TAG_CLOSE: STORY_SNAPSHOT_TAG_CLOSE,
    extractStorySnapshotFromNarrative: extractStorySnapshotFromNarrative,
    stripStorySnapshotFromNarrative: stripStorySnapshotFromNarrative,
    synthesizePlotSnapshotFromVisibleNarrative: synthesizePlotSnapshotFromVisibleNarrative,
    resolveStoryReplyForPipeline: resolveStoryReplyForPipeline,
    visibleNarrativeForStreamingChunk: visibleNarrativeForStreamingChunk,
    visibleNarrativeStreamFallback: visibleNarrativeStreamFallback,
    stripNpcStoryHintsFromNarrative: stripNpcStoryHintsFromNarrative,
    stripActionSuggestionsFromNarrative: stripActionSuggestionsFromNarrative,
    stripBattleTriggerFromNarrative: stripBattleTriggerFromNarrative,
    extractActionSuggestionsFromNarrative: extractActionSuggestionsFromNarrative,
    extractBattleTriggerFromNarrative: extractBattleTriggerFromNarrative,
    stripStoryAiMetaLeakFromNarrative: stripStoryAiMetaLeakFromNarrative,
  };
})(typeof window !== "undefined" ? window : globalThis);
