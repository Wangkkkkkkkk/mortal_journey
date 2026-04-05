/**
 * 开局配置 AI：规则见 MortalJourneyInitStateRules；解析/应用复用 MortalJourneyStateGenerate 的储物袋与世界状态逻辑。
 * 依赖：state_generate.js、init_state_rules.js、bridge.js（TavernHelper）
 */
(function (global) {
  "use strict";

  var INIT_LOADOUT_TAG_OPEN = "<mj_init_loadout>";
  var INIT_LOADOUT_TAG_CLOSE = "</mj_init_loadout>";

  function panelRealm() {
    return global.MjMainScreenPanelRealm || {};
  }

  function equipCount() {
    var n = panelRealm().EQUIP_SLOT_COUNT;
    return typeof n === "number" && isFinite(n) ? Math.max(1, Math.floor(n)) : 4;
  }

  function gongfaCount() {
    var n = panelRealm().GONGFA_SLOT_COUNT;
    return typeof n === "number" && isFinite(n) ? Math.max(1, Math.floor(n)) : 8;
  }

  function stateGen() {
    return global.MortalJourneyStateGenerate;
  }

  function getInitRulesApi() {
    return global.MortalJourneyInitStateRules;
  }

  function extractLatestAssistantStoryText(G) {
    var hist = G && Array.isArray(G.chatHistory) ? G.chatHistory : [];
    for (var i = hist.length - 1; i >= 0; i--) {
      var row = hist[i];
      if (
        row &&
        row.role === "assistant" &&
        row.content != null &&
        String(row.content).trim() !== ""
      ) {
        return String(row.content).trim();
      }
    }
    return "";
  }

  function fillRuleTemplate(template, vars) {
    var out = String(template || "");
    if (!vars || typeof vars !== "object") return out;
    return out.replace(/\{\{([A-Z_]+)\}\}/g, function (m, key) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
      return m;
    });
  }

  function buildInitRuleVars() {
    var SG = stateGen();
    return {
      OPS_TAG_OPEN: SG && SG.OPS_TAG_OPEN ? SG.OPS_TAG_OPEN : "<mj_inventory_ops>",
      OPS_TAG_CLOSE: SG && SG.OPS_TAG_CLOSE ? SG.OPS_TAG_CLOSE : "</mj_inventory_ops>",
      WORLD_STATE_TAG_OPEN:
        SG && SG.WORLD_STATE_TAG_OPEN ? SG.WORLD_STATE_TAG_OPEN : "<mj_world_state>",
      WORLD_STATE_TAG_CLOSE:
        SG && SG.WORLD_STATE_TAG_CLOSE ? SG.WORLD_STATE_TAG_CLOSE : "</mj_world_state>",
      INIT_LOADOUT_TAG_OPEN: INIT_LOADOUT_TAG_OPEN,
      INIT_LOADOUT_TAG_CLOSE: INIT_LOADOUT_TAG_CLOSE,
    };
  }

  function getInitRuleTemplate(name, fallbackText) {
    var IR = getInitRulesApi();
    var tpl = IR && IR.templates && IR.templates[name] != null ? String(IR.templates[name]) : "";
    var filled = fillRuleTemplate(tpl, buildInitRuleVars()).trim();
    if (filled) return filled;
    return String(fallbackText || "").trim();
  }

  function stripJsonFence(s) {
    var SG = stateGen();
    if (SG && typeof SG.stripJsonFence === "function") return SG.stripJsonFence(s);
    var t = String(s || "").trim();
    var m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t);
    return m ? m[1].trim() : t;
  }

  /**
   * @param {Object|null} fc
   * @param {Object} G
   */
  function buildFateChoiceBriefObject(fc, G) {
    var f = fc && typeof fc === "object" ? fc : {};
    var g = G && typeof G === "object" ? G : {};
    var o = {
      playerName:
        f.playerName != null && String(f.playerName).trim() !== ""
          ? String(f.playerName).trim()
          : "（未命名）",
      birth: f.birth != null ? String(f.birth) : "",
      difficulty: f.difficulty != null ? String(f.difficulty) : "",
      linggen: f.linggen != null ? String(f.linggen) : "",
      realm: f.realm && typeof f.realm === "object" ? f.realm : g.realm && typeof g.realm === "object" ? g.realm : {},
      traits: Array.isArray(f.traits) ? f.traits : [],
    };
    if (f.customBirth && typeof f.customBirth === "object") {
      o.customBirth = f.customBirth;
    }
    if (g.currentLocation != null && String(g.currentLocation).trim() !== "") {
      o.bootstrapCurrentLocation = String(g.currentLocation).trim();
    }
    if (g.worldTimeString != null && String(g.worldTimeString).trim() !== "") {
      o.bootstrapWorldTimeString = String(g.worldTimeString).trim();
    }
    return o;
  }

  function buildFateChoiceBriefJson(fc, G) {
    try {
      return JSON.stringify(buildFateChoiceBriefObject(fc, G));
    } catch (_e) {
      return "{}";
    }
  }

  /**
   * @param {Object} opts
   * @param {Object} [opts.game]
   * @param {Object} [opts.fateChoice]
   */
  function buildInitStateUserContent(opts) {
    var o = opts || {};
    var G = o.game != null ? o.game : global.MortalJourneyGame || {};
    var fc = o.fateChoice != null ? o.fateChoice : G.fateChoice;
    var SG = stateGen();
    var parts = [];
    var vars = buildInitRuleVars();
    var storyAssist =
      o.openingStoryAssistantText != null ? String(o.openingStoryAssistantText).trim() : "";
    if (storyAssist) {
      parts.push(
        "本局已生成第一段「开局剧情」（见下方 ### 开局剧情正文）。请**优先依据该正文**与命运抉择摘要，生成三对机器标签；正文未写明的器物可结合摘要与境界合理补全。",
      );
      parts.push("");
      parts.push("### 开局剧情正文（生成装备/功法/储物袋与世界状态的首要依据）");
      parts.push(storyAssist);
      parts.push("");
    } else {
      parts.push("本局开局：尚无任何剧情 user/assistant 对话。请按 system 与下列说明生成三对标签。");
      parts.push("");
    }
    parts.push("### 命运抉择摘要（JSON）");
    parts.push(buildFateChoiceBriefJson(fc, G));
    parts.push(
      "### 世界时间与当前地点（必须在 " + vars.WORLD_STATE_TAG_OPEN + " 中写回；worldTimeString 不得早于本条）",
    );
    parts.push(SG && typeof SG.buildWorldSnapshotJson === "function" ? SG.buildWorldSnapshotJson(G) : "{}");
    parts.push("### 主角当前佩戴快照（武器、法器、防具、载具；可用第三对标签整体覆盖为合理开局）");
    parts.push(
      SG && typeof SG.buildEquippedSnapshot === "function" ? SG.buildEquippedSnapshot(G) : "[]",
    );
    parts.push("### 主角功法栏快照（长度" + String(gongfaCount()) + "；第三对应给出完整数组）");
    parts.push(SG && typeof SG.buildGongfaSnapshot === "function" ? SG.buildGongfaSnapshot(G) : "[]");
    parts.push("### 储物袋快照");
    parts.push(
      SG && typeof SG.buildInventorySnapshot === "function" ? SG.buildInventorySnapshot(G) : "[]",
    );
    parts.push("### 境界合法取值");
    parts.push(
      SG && typeof SG.buildRealmLexiconLine === "function" ? SG.buildRealmLexiconLine() : "",
    );
    parts.push("### 可引用功法表");
    parts.push(
      SG && typeof SG.buildGongfaDescribeCatalogJson === "function"
        ? SG.buildGongfaDescribeCatalogJson()
        : "{}",
    );
    parts.push("### 可引用物品表");
    parts.push(
      SG && typeof SG.buildStuffDescribeCatalogJson === "function"
        ? SG.buildStuffDescribeCatalogJson()
        : "{}",
    );
    parts.push("### 输出格式（须严格包含三对标签）");
    parts.push(getInitRuleTemplate("outputRules", ""));
    var exTpl = getInitRuleTemplate("outputExample", "");
    if (exTpl) {
      parts.push("");
      parts.push(exTpl);
    }
    return parts.join("\n");
  }

  /**
   * @param {Object} opts
   * @returns {Array<{role:string,content:string}>}
   */
  function buildMessages(opts) {
    var o = opts || {};
    var SG = stateGen();
    var lsv =
      SG && typeof SG.lowerSpiritStoneValueUnit === "function" ? SG.lowerSpiritStoneValueUnit() : 10;
    var vars = buildInitRuleVars();
    var sys = getInitRuleTemplate("systemPrompt", "");
    sys +=
      "\n【铁律 · 续】折算下品灵石：刻度合计 ÷ " +
      lsv +
      " 四舍五入 = add 下品灵石的 count；禁止把合计刻度直接当颗数。";
    sys +=
      "\n【铁律 · 续】世界状态必须使用 " +
      vars.WORLD_STATE_TAG_OPEN +
      " 与 " +
      vars.WORLD_STATE_TAG_CLOSE +
      "；主角槽位必须使用 " +
      vars.INIT_LOADOUT_TAG_OPEN +
      " 与 " +
      vars.INIT_LOADOUT_TAG_CLOSE +
      "。";
    return [
      { role: "system", content: sys },
      { role: "user", content: buildInitStateUserContent(o) },
    ];
  }

  function parseInitLoadoutFromText(text) {
    var raw = String(text || "");
    var tagRe = /<mj_init_loadout\s*>\s*([\s\S]*?)\s*<\/mj_init_loadout\s*>/i;
    var tm = tagRe.exec(raw);
    if (!tm) {
      return { ok: false, patch: null, error: "未找到 " + INIT_LOADOUT_TAG_OPEN + " … " + INIT_LOADOUT_TAG_CLOSE };
    }
    var inner = stripJsonFence(tm[1].trim());
    try {
      var parsed = JSON.parse(inner);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, patch: null, error: "mj_init_loadout 内须为 JSON 对象" };
      }
      return { ok: true, patch: parsed, parseVia: "tag" };
    } catch (e) {
      return {
        ok: false,
        patch: null,
        error: "mj_init_loadout JSON：" + (e && e.message ? String(e.message) : "解析失败"),
        parseVia: "tag",
      };
    }
  }

  function mergeBonusObjects(override, base) {
    var a = override && typeof override === "object" ? override : null;
    var b = base && typeof base === "object" ? base : null;
    if (!a && !b) return null;
    var out = Object.assign({}, b || {}, a || {});
    return Object.keys(out).length ? out : null;
  }

  function copyMagnificationObject(m) {
    if (!m || typeof m !== "object") return null;
    var keys = Object.keys(m);
    if (!keys.length) return null;
    return Object.assign({}, m);
  }

  /**
   * @param {Object} cell
   * @param {number} [slotIndex] 0～3 对应 武器/法器/防具/载具，用于补全 equipType 与是否保留 magnification
   */
  function normalizeEquipFromAi(cell, slotIndex) {
    if (cell == null || typeof cell !== "object") return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc).trim();
    var C = global.MjCreationConfig;
    var em =
      C && typeof C.getEquipmentDescribe === "function" ? C.getEquipmentDescribe(name) : null;
    var PR = panelRealm();
    var kindLabels = PR && Array.isArray(PR.EQUIP_SLOT_KIND_LABELS) ? PR.EQUIP_SLOT_KIND_LABELS : null;
    var slotKind =
      typeof slotIndex === "number" &&
      slotIndex >= 0 &&
      slotIndex < 4 &&
      kindLabels &&
      kindLabels[slotIndex] != null
        ? String(kindLabels[slotIndex]).trim()
        : "";
    var ty =
      cell.equipType != null && String(cell.equipType).trim() !== ""
        ? String(cell.equipType).trim()
        : cell.type != null && String(cell.type).trim() !== ""
          ? String(cell.type).trim()
          : em && em.type != null
            ? String(em.type).trim()
            : "";
    if (ty) o.equipType = ty;
    else if (slotKind) o.equipType = slotKind;
    if ((!o.desc || o.desc === "") && em && em.desc) o.desc = String(em.desc);
    if (cell.grade != null && String(cell.grade).trim() !== "") o.grade = String(cell.grade).trim();
    else if (em && em.grade != null && String(em.grade).trim() !== "") o.grade = String(em.grade).trim();
    if (typeof cell.value === "number" && isFinite(cell.value)) {
      o.value = Math.max(0, Math.floor(cell.value));
    } else if (em && typeof em.value === "number" && isFinite(em.value)) {
      o.value = Math.max(0, Math.floor(em.value));
    }
    var bonusMerged = mergeBonusObjects(cell.bonus, em && em.bonus);
    if (bonusMerged) o.bonus = bonusMerged;
    var eqTy = o.equipType != null ? String(o.equipType).trim() : "";
    var isWeapon =
      eqTy === "武器" ||
      (cell.type != null && String(cell.type).trim() === "武器") ||
      slotKind === "武器";
    if (isWeapon) {
      var magCell = copyMagnificationObject(cell.magnification);
      var magEm = copyMagnificationObject(em && em.magnification);
      var magUse = magCell || magEm;
      if (magUse) o.magnification = magUse;
    }
    return o;
  }

  function normalizeGongfaFromAi(cell) {
    if (cell == null || typeof cell !== "object") return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name, type: "功法" };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc).trim();
    var C = global.MjCreationConfig;
    var gi =
      C && typeof C.getGongfaDescribe === "function" ? C.getGongfaDescribe(name) : null;
    if (gi) {
      if ((!o.desc || o.desc === "") && gi.desc) o.desc = String(gi.desc);
    }
    if (cell.subtype != null && String(cell.subtype).trim() !== "") o.subtype = String(cell.subtype).trim();
    else if (cell.subType != null && String(cell.subType).trim() !== "") o.subType = String(cell.subType).trim();
    else if (gi) {
      if (gi.subtype != null && String(gi.subtype).trim() !== "") o.subtype = String(gi.subtype).trim();
      else if (gi.subType != null && String(gi.subType).trim() !== "") o.subType = String(gi.subType).trim();
      else if (gi.type === "攻击" || gi.type === "辅助") o.subtype = String(gi.type);
    }
    if (cell.grade != null && String(cell.grade).trim() !== "") o.grade = String(cell.grade).trim();
    else if (gi && gi.grade != null && String(gi.grade).trim() !== "") o.grade = String(gi.grade).trim();
    if (typeof cell.value === "number" && isFinite(cell.value)) {
      o.value = Math.max(0, Math.floor(cell.value));
    } else if (gi && typeof gi.value === "number" && isFinite(gi.value)) {
      o.value = Math.max(0, Math.floor(gi.value));
    }
    var bonusGf = mergeBonusObjects(cell.bonus, gi && gi.bonus);
    if (bonusGf) o.bonus = bonusGf;
    var subKey =
      o.subtype != null && String(o.subtype).trim() !== ""
        ? String(o.subtype).trim()
        : o.subType != null && String(o.subType).trim() !== ""
          ? String(o.subType).trim()
          : "";
    if (subKey === "攻击") {
      var mgf = copyMagnificationObject(cell.magnification) || copyMagnificationObject(gi && gi.magnification);
      if (mgf) o.magnification = mgf;
    } else if (subKey === "辅助") {
      delete o.magnification;
    }
    var mc =
      typeof cell.manacost === "number" && isFinite(cell.manacost)
        ? cell.manacost
        : gi && typeof gi.manacost === "number" && isFinite(gi.manacost)
          ? gi.manacost
          : null;
    if (mc != null) o.manacost = Math.max(0, Math.round(mc));
    return o;
  }

  /**
   * @param {Object} G
   * @param {Object} patch
   * @returns {{ appliedEquip: number, appliedGongfa: number }}
   */
  function applyInitLoadoutPatch(G, patch) {
    var out = { appliedEquip: 0, appliedGongfa: 0 };
    if (!G || !patch || typeof patch !== "object") return out;
    var Pn = global.MjMainScreenPanel;
    var nEq = equipCount();
    var nGf = gongfaCount();
    if (Pn && typeof Pn.ensureEquippedSlots === "function") Pn.ensureEquippedSlots(G);
    if (Pn && typeof Pn.ensureGongfaSlots === "function") Pn.ensureGongfaSlots(G);

    var rawEq = Array.isArray(patch.equippedSlots) ? patch.equippedSlots : null;
    if (rawEq) {
      for (var i = 0; i < nEq; i++) {
        if (i >= rawEq.length) break;
        var raw = rawEq[i];
        if (raw === null) {
          G.equippedSlots[i] = null;
          continue;
        }
        var ec = normalizeEquipFromAi(raw, i);
        if (ec) {
          G.equippedSlots[i] = ec;
          out.appliedEquip++;
        }
      }
    }

    var rawGf = Array.isArray(patch.gongfaSlots) ? patch.gongfaSlots : null;
    if (rawGf) {
      for (var j = 0; j < nGf; j++) {
        if (j >= rawGf.length) break;
        var gr = rawGf[j];
        if (gr === null) {
          G.gongfaSlots[j] = null;
          continue;
        }
        var gc = normalizeGongfaFromAi(gr);
        if (gc) {
          G.gongfaSlots[j] = gc;
          out.appliedGongfa++;
        }
      }
    }
    return out;
  }

  /**
   * 不触碰周围人物列表（避免误用状态 AI 的「省略第三对则清空可见 NPC」语义）。
   * @param {Object} G
   * @param {Object|null} fc
   * @param {string} assistantText
   */
  function applyInitStateFromAssistantText(G, fc, assistantText) {
    var SG = stateGen();
    var raw = String(assistantText || "");
    if (!G) return { inventory: null, world: null, loadout: null };

    if (SG && typeof SG.parseInventoryOpsFromText === "function" && typeof SG.applyInventoryOps === "function") {
      var pr = SG.parseInventoryOpsFromText(raw);
      if (pr.ok) SG.applyInventoryOps(G, pr.ops);
    }
    if (SG && typeof SG.parseWorldStateFromText === "function" && typeof SG.applyWorldStatePatch === "function") {
      var ws = SG.parseWorldStateFromText(raw);
      if (ws.ok && ws.patch) SG.applyWorldStatePatch(G, ws.patch);
    }

    var lo = parseInitLoadoutFromText(raw);
    var loadoutSummary = null;
    if (lo.ok && lo.patch) loadoutSummary = applyInitLoadoutPatch(G, lo.patch);

    var PRn = global.MjMainScreenPanelRealm;
    if (PRn && typeof PRn.ensureInventorySlots === "function") {
      try {
        PRn.ensureInventorySlots(G);
      } catch (_e0) {}
    }

    var PBR = global.PlayerBaseRuntime;
    var effFc = fc != null ? fc : G.fateChoice;
    if (PBR && typeof PBR.applyToGame === "function" && effFc) {
      try {
        PBR.applyToGame(G, effFc);
      } catch (_e1) {}
    }

    return {
      inventory: true,
      world: true,
      loadout: loadoutSummary,
      initLoadoutError: lo.ok ? null : lo.error || null,
    };
  }

  function sendTurn(opts) {
    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      return Promise.reject(
        new Error("TavernHelper 未加载：请确认 bridge.js 已在本文件之前引入。"),
      );
    }
    var o = opts || {};
    var messages =
      Array.isArray(o.messages) && o.messages.length > 0 ? o.messages : buildMessages(o);
    return TH.generateFromMessages({
      messages: messages,
      should_stream: o.shouldStream !== false,
      onDelta: o.onDelta,
      signal: o.signal,
    });
  }

  /**
   * @param {Object} opts
   * @param {Object} [opts.game]
   * @param {Object} [opts.fateChoice]
   * @param {function():void} [opts.onDone]
   */
  function runInitStateAiIfNeeded(opts) {
    var o = opts || {};
    var G = o.game != null ? o.game : global.MortalJourneyGame;
    var fc = o.fateChoice != null ? o.fateChoice : G && G.fateChoice;
    var onDone = typeof o.onDone === "function" ? o.onDone : function () {};

    if (!G || !fc) {
      onDone();
      return Promise.resolve({ skipped: true, reason: "no game or fateChoice" });
    }

    if (G.mjInitStateAiApplied === true) {
      onDone();
      return Promise.resolve({ skipped: true, reason: "already applied" });
    }

    var afterOpeningStory = o.afterOpeningStory === true;
    if (!afterOpeningStory) {
      var hist = Array.isArray(G.chatHistory) ? G.chatHistory : [];
      for (var i = 0; i < hist.length; i++) {
        var r = hist[i] && hist[i].role;
        if (r === "user" || r === "assistant") {
          G.mjInitStateAiApplied = true;
          onDone();
          return Promise.resolve({ skipped: true, reason: "chat already has messages" });
        }
      }
    }

    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      try {
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[开局配置AI] 跳过：TavernHelper 未就绪");
        }
      } catch (_e2) {}
      onDone();
      return Promise.resolve({ skipped: true, reason: "no TavernHelper" });
    }

    var openingAssist = "";
    if (afterOpeningStory) {
      openingAssist = extractLatestAssistantStoryText(G);
    }

    return sendTurn({
      game: G,
      fateChoice: fc,
      openingStoryAssistantText: openingAssist,
      shouldStream: o.shouldStream !== false,
      onDelta: o.onDelta,
      signal: o.signal,
    })
      .then(function (fullText) {
        var text = fullText != null ? String(fullText) : "";
        applyInitStateFromAssistantText(G, fc, text);
        G.mjInitStateAiApplied = true;
        var Pn = global.MjMainScreenPanel;
        if (Pn && typeof Pn.persistBootstrapSnapshot === "function") {
          try {
            Pn.persistBootstrapSnapshot();
          } catch (_e3) {}
        }
        try {
          if (global.GameLog && typeof global.GameLog.info === "function") {
            global.GameLog.info("[开局配置AI] 已完成应用");
          }
        } catch (_e4) {}
        onDone();
        return { skipped: false, ok: true };
      })
      .catch(function (err) {
        try {
          console.warn("[开局配置AI] 请求或应用失败", err);
        } catch (_e5) {}
        onDone();
        return { skipped: false, ok: false, error: err };
      });
  }

  global.MortalJourneyInitStateGenerate = {
    INIT_LOADOUT_TAG_OPEN: INIT_LOADOUT_TAG_OPEN,
    INIT_LOADOUT_TAG_CLOSE: INIT_LOADOUT_TAG_CLOSE,
    buildFateChoiceBriefJson: buildFateChoiceBriefJson,
    buildInitStateUserContent: buildInitStateUserContent,
    buildMessages: buildMessages,
    parseInitLoadoutFromText: parseInitLoadoutFromText,
    applyInitLoadoutPatch: applyInitLoadoutPatch,
    applyInitStateFromAssistantText: applyInitStateFromAssistantText,
    sendTurn: sendTurn,
    runInitStateAiIfNeeded: runInitStateAiIfNeeded,
  };
})(typeof window !== "undefined" ? window : globalThis);
