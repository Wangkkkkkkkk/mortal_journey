/**
 * 主界面（main.html）：恢复开局数据、渲染左侧角色信息栏
 * 全局：MortalJourneyGame（sessionStorage 恢复 + 运行时字段）
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "mortal_journey_bootstrap_v1";
  var DEFAULT_WORLD_TIME = "0001年 01月 01日 08:00";
  var DEFAULT_AGE = 16;
  var DEFAULT_SHOUYUAN = 100;
  var DEFAULT_CHARM = 0;
  var DEFAULT_LUCK = 0;
  var INVENTORY_SLOT_COUNT = 12;
  /** 功法栏：与储物袋相同 3×4，共 12 格 */
  var GONGFA_SLOT_COUNT = 12;
  /** 佩戴栏固定 3 格：主武器、副武器、防具（不可超过 3 件） */
  var EQUIP_SLOT_COUNT = 3;
  var EQUIP_SLOT_EMPTY_TITLE = ["主武器空位", "副武器空位", "防具空位"];

  function clampPct(n) {
    if (typeof n !== "number" || !isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function restoreBootstrap() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.fateChoice) return null;

      global.MortalJourneyGame = global.MortalJourneyGame || {};
      var fc = data.fateChoice;
      global.MortalJourneyGame.fateChoice = fc;
      global.MortalJourneyGame.startedAt = data.startedAt || 0;
      global.MortalJourneyGame.playerBase = fc.playerBase ? Object.assign({}, fc.playerBase) : null;
      global.MortalJourneyGame.rawRealmBase = fc.rawRealmBase ? Object.assign({}, fc.rawRealmBase) : null;
      global.MortalJourneyGame.realm = fc.realm ? Object.assign({}, fc.realm) : null;
      return fc;
    } catch (e) {
      console.warn("[主界面] 无法读取开局存档", e);
      return null;
    }
  }

  /**
   * 运行时字段（世界时间、进度、血蓝当前值、年龄寿元等），后续剧情可改此对象并重新 renderLeftPanel
   */
  function ensureGameRuntimeDefaults(G) {
    if (!G) return;
    if (G.worldTimeString == null || G.worldTimeString === "") {
      G.worldTimeString = DEFAULT_WORLD_TIME;
    }
    if (G.cultivationProgress == null || typeof G.cultivationProgress !== "number") {
      G.cultivationProgress = 0;
    }
    G.cultivationProgress = clampPct(G.cultivationProgress);
    if (G.age == null) G.age = DEFAULT_AGE;
    if (G.shouyuan == null) G.shouyuan = DEFAULT_SHOUYUAN;
    if (G.charm == null || typeof G.charm !== "number") G.charm = DEFAULT_CHARM;
    if (G.luck == null || typeof G.luck !== "number") G.luck = DEFAULT_LUCK;

    var pb = G.playerBase;
    if (pb && typeof pb.hp === "number" && typeof pb.mp === "number") {
      if (G.maxHp == null) G.maxHp = Math.max(1, pb.hp);
      if (G.currentHp == null) G.currentHp = pb.hp;
      if (G.maxMp == null) G.maxMp = Math.max(1, pb.mp);
      if (G.currentMp == null) G.currentMp = pb.mp;
    }
    if (!Array.isArray(G.chatHistory)) G.chatHistory = [];
    ensureEquippedSlots(G);
    ensureGongfaSlots(G);
    ensureInventorySlots(G);
  }

  function ensureEquippedSlots(G) {
    if (!G) return;
    if (!Array.isArray(G.equippedSlots) || G.equippedSlots.length !== EQUIP_SLOT_COUNT) {
      G.equippedSlots = [null, null, null];
      return;
    }
  }

  function ensureGongfaSlots(G) {
    if (!G) return;
    if (!Array.isArray(G.gongfaSlots) || G.gongfaSlots.length !== GONGFA_SLOT_COUNT) {
      var a = [];
      for (var j = 0; j < GONGFA_SLOT_COUNT; j++) a.push(null);
      G.gongfaSlots = a;
    }
  }

  function normalizeBagItem(entry) {
    if (entry == null) return null;
    var name =
      entry.name != null
        ? String(entry.name).trim()
        : entry.label != null
          ? String(entry.label).trim()
          : "";
    if (!name) return null;
    var c = entry.count;
    var cnt =
      typeof c === "number" && isFinite(c) ? Math.max(0, Math.floor(c)) : 1;
    var o = { name: name, count: cnt };
    if (entry.desc != null && String(entry.desc).trim() !== "") o.desc = String(entry.desc);
    return o;
  }

  /** 储物袋 12 格：第 0 格固定为灵石；其余为普通物品 { name, count, desc? } */
  function ensureInventorySlots(G) {
    if (!G) return;
    if (!Array.isArray(G.inventorySlots) || G.inventorySlots.length !== INVENTORY_SLOT_COUNT) {
      var a = [];
      a[0] = { kind: "lingshi", count: 0 };
      for (var j = 1; j < INVENTORY_SLOT_COUNT; j++) a.push(null);
      G.inventorySlots = a;
      return;
    }
    var z = G.inventorySlots[0];
    if (!z || z.kind !== "lingshi") {
      var prev = z && typeof z.count === "number" && isFinite(z.count) ? z.count : 0;
      G.inventorySlots[0] = { kind: "lingshi", count: Math.max(0, Math.floor(prev)) };
    } else {
      var cz = z.count;
      z.count = Math.max(0, Math.floor(typeof cz === "number" && isFinite(cz) ? cz : 0));
    }
    for (var k = 1; k < INVENTORY_SLOT_COUNT; k++) {
      G.inventorySlots[k] = normalizeBagItem(G.inventorySlots[k]);
    }
  }

  function getChatLogEl() {
    return document.getElementById("mj-chat-log");
  }

  function clearChatPlaceholders() {
    var log = getChatLogEl();
    if (!log) return;
    var nodes = log.querySelectorAll(".mj-chat-placeholder");
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  function scrollChatLog() {
    var log = getChatLogEl();
    if (log) log.scrollTop = log.scrollHeight;
  }

  var _chatFeedbackGen = 0;
  var _chatStatusTick = null;
  var _chatStatusStart = 0;
  var _chatStatusStream = false;

  function getChatStatusEl() {
    return document.getElementById("mj-chat-status");
  }

  function clearChatStatusTick() {
    if (_chatStatusTick != null) {
      clearInterval(_chatStatusTick);
      _chatStatusTick = null;
    }
  }

  function setChatStatusUi(phase, text) {
    var el = getChatStatusEl();
    if (!el) return;
    el.className = "mj-chat-status mj-chat-status--" + phase;
    el.textContent = text != null ? String(text) : "";
  }

  function formatElapsedSec(fromMs) {
    var s = (Date.now() - fromMs) / 1000;
    return (Math.round(s * 10) / 10).toFixed(1);
  }

  /**
   * @param {HTMLTextAreaElement|null} textarea
   * @param {boolean} streamingStarted
   */
  function startAiReplyFeedback(textarea, streamingStarted) {
    var gen = ++_chatFeedbackGen;
    clearChatStatusTick();
    _chatStatusStart = Date.now();
    _chatStatusStream = !!streamingStarted;
    if (textarea) textarea.disabled = true;

    function tickText() {
      var sec = formatElapsedSec(_chatStatusStart);
      if (_chatStatusStream) return "正在接收 AI 回复… 已 " + sec + " 秒";
      return "等待 AI 回复中… 已等待 " + sec + " 秒";
    }

    setChatStatusUi("waiting", tickText());
    _chatStatusTick = setInterval(function () {
      if (gen !== _chatFeedbackGen) return;
      var el = getChatStatusEl();
      if (!el) return;
      el.textContent = tickText();
      if (_chatStatusStream) el.className = "mj-chat-status mj-chat-status--streaming";
      else el.className = "mj-chat-status mj-chat-status--waiting";
    }, 250);

    return gen;
  }

  function markAiStreamStarted() {
    _chatStatusStream = true;
  }

  /**
   * @param {number} gen
   * @param {HTMLTextAreaElement|null} textarea
   * @param {"done"|"error"} outcome
   * @param {string} [errDetail]
   */
  function finishAiReplyFeedback(gen, textarea, outcome, errDetail) {
    if (gen !== _chatFeedbackGen) return;
    clearChatStatusTick();
    var total = formatElapsedSec(_chatStatusStart);

    if (outcome === "done") {
      setChatStatusUi("done", "回复完成，总用时 " + total + " 秒。");
      window.setTimeout(function () {
        if (gen !== _chatFeedbackGen) return;
        setChatStatusUi("idle", "");
      }, 4500);
      return;
    }

    var errShort =
      errDetail && String(errDetail).trim()
        ? String(errDetail).trim().slice(0, 160)
        : "未知错误";
    setChatStatusUi("error", "回复失败（约 " + total + " 秒）：" + errShort);
    window.setTimeout(function () {
      if (gen !== _chatFeedbackGen) return;
      setChatStatusUi("idle", "");
    }, 10000);
  }

  function flashChatStatusError(message) {
    _chatFeedbackGen++;
    clearChatStatusTick();
    var gen = _chatFeedbackGen;
    setChatStatusUi("error", String(message || ""));
    window.setTimeout(function () {
      if (gen !== _chatFeedbackGen) return;
      setChatStatusUi("idle", "");
    }, 8000);
  }

  /**
   * @param {"user"|"assistant"|"error"} role
   * @returns {{ root: HTMLElement, body: HTMLElement }|null}
   */
  function appendChatBubble(role, text) {
    var log = getChatLogEl();
    if (!log) return null;
    clearChatPlaceholders();
    var wrap = document.createElement("div");
    wrap.className = "mj-chat-msg--role mj-chat-msg--" + role;
    var label = document.createElement("span");
    label.className = "mj-chat-role-label";
    if (role === "user") label.textContent = "你";
    else if (role === "assistant") label.textContent = "剧情";
    else label.textContent = "提示";
    var body = document.createElement("div");
    body.textContent = text != null ? String(text) : "";
    wrap.appendChild(label);
    wrap.appendChild(body);
    log.appendChild(wrap);
    scrollChatLog();
    return { root: wrap, body: body };
  }

  function handleChatSend(textarea, sendBtn) {
    var text = String(textarea.value || "").trim();
    if (!text) return;

    var G = global.MortalJourneyGame;
    if (!G) return;
    ensureGameRuntimeDefaults(G);

    var prior = (G.chatHistory || []).slice();

    var SC = global.MortalJourneyStoryChat;
    if (!SC || typeof SC.sendTurn !== "function") {
      flashChatStatusError("剧情模块未加载，无法请求 AI。");
      appendChatBubble("error", "剧情模块未加载（缺少 story_generate.js）。");
      return;
    }

    G.chatHistory.push({ role: "user", content: text });
    textarea.value = "";
    appendChatBubble("user", text);

    var feedbackGen = startAiReplyFeedback(textarea, false);
    var streamNotified = false;

    var messages =
      typeof SC.buildMessages === "function"
        ? SC.buildMessages({ userText: text, priorHistory: prior })
        : null;
    if (messages && global.GameLog && typeof global.GameLog.info === "function") {
      try {
        global.GameLog.info(
          "[剧情→AI] 本次发送的 messages（含 system / 历史 / 用户）：\n" + JSON.stringify(messages, null, 2),
        );
      } catch (logErr) {
        global.GameLog.info("[剧情→AI] 用户输入（messages 无法序列化）：" + text.slice(0, 800));
      }
    }

    var asstUi = appendChatBubble("assistant", "");
    var assistantBody = asstUi ? asstUi.body : null;
    var assistantRoot = asstUi ? asstUi.root : null;
    sendBtn.disabled = true;

    SC.sendTurn({
      messages: messages,
      userText: text,
      priorHistory: prior,
      shouldStream: true,
      onDelta: function (_delta, full) {
        if (!streamNotified) {
          streamNotified = true;
          markAiStreamStarted();
        }
        if (assistantBody) assistantBody.textContent = full || "";
        scrollChatLog();
      },
    })
      .then(function (full) {
        var reply = full != null ? String(full) : "";
        G.chatHistory.push({ role: "assistant", content: reply });
        if (assistantBody) assistantBody.textContent = reply;
        scrollChatLog();
        finishAiReplyFeedback(feedbackGen, textarea, "done");
      })
      .catch(function (err) {
        if (
          assistantBody &&
          !String(assistantBody.textContent || "").trim() &&
          assistantRoot &&
          assistantRoot.parentNode
        ) {
          assistantRoot.parentNode.removeChild(assistantRoot);
        }
        var msg =
          err && err.message
            ? String(err.message)
            : "请求失败。若未配置 API，请检查 silly_tarven/bridge-config.js 中的 fixedPreset。";
        finishAiReplyFeedback(feedbackGen, textarea, "error", msg);
        appendChatBubble("error", msg);
        console.warn("[主界面] 剧情请求失败", err);
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[主界面] 剧情请求失败：" + msg.slice(0, 300));
        }
      })
      .then(function () {
        sendBtn.disabled = false;
        if (textarea) textarea.disabled = false;
      });
  }

  function formatRealmLine(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm) || {};
    var major = r.major || "练气";
    var minor = r.minor || "初期";
    return "境界：" + major + minor;
  }

  function numOrDash(v) {
    return typeof v === "number" && isFinite(v) ? String(Math.round(v)) : "—";
  }

  /** 左栏灵根：只显示五行字，不显示真灵根/伪灵根等前缀 */
  function formatLinggenPanelText(linggenFull) {
    var raw = linggenFull == null ? "" : String(linggenFull).trim();
    if (raw === "" || raw === "无灵根") return "—";
    var LS = global.LinggenState;
    var els = LS && typeof LS.parseElements === "function" ? LS.parseElements(raw) : [];
    if (!els.length) return "—";
    return els.join("、");
  }

  function appendOverviewSection(host, titleText) {
    var h = document.createElement("h4");
    h.className = "mj-chat-overview-h";
    h.textContent = titleText;
    host.appendChild(h);
  }

  /**
   * 剧情对话首条：开局总览（天赋、世界因子；档案与数值见左侧角色栏）
   */
  function renderBootstrapOverview(fc) {
    var log = document.getElementById("mj-chat-log");
    if (!log) return;
    log.innerHTML = "";

    if (!fc) {
      var ph = document.createElement("p");
      ph.className = "mj-chat-placeholder";
      ph.innerHTML =
        "尚未载入开局存档。<br />请从洪荒界面完成「命运抉择」后进入本页，此处将显示天赋与世界因子总览及剧情对话。";
      log.appendChild(ph);
      return;
    }

    var root = document.createElement("div");
    root.className = "mj-chat-msg mj-chat-msg--overview";
    root.setAttribute("aria-label", "开局信息总览");

    var titleEl = document.createElement("div");
    titleEl.className = "mj-chat-overview-title";
    titleEl.textContent = "【开局总览】";
    root.appendChild(titleEl);

    var intro = document.createElement("p");
    intro.className = "mj-chat-overview-intro";
    intro.textContent = "出身、境界、灵根与战斗属性已在左侧「角色信息」中展示；此处仅汇总天赋与世界因子。";
    root.appendChild(intro);

    appendOverviewSection(root, "天赋词条");
    var traits = Array.isArray(fc.traits) ? fc.traits : [];
    if (!traits.length) {
      var noTrait = document.createElement("p");
      noTrait.className = "mj-chat-overview-muted";
      noTrait.textContent = "未携带天赋词条（凡人模式或未锁定词条）。";
      root.appendChild(noTrait);
    } else {
      var ulTrait = document.createElement("ul");
      ulTrait.className = "mj-chat-overview-ul";
      for (var ti = 0; ti < traits.length; ti++) {
        var t = traits[ti];
        if (!t) continue;
        var li = document.createElement("li");
        li.className = "mj-chat-overview-li";
        var strong = document.createElement("strong");
        strong.textContent = (t.name || "（无名）") + (t.rarity ? " · " + t.rarity : "");
        li.appendChild(strong);
        if (t.desc) {
          li.appendChild(document.createElement("br"));
          var sd = document.createElement("span");
          sd.className = "mj-chat-overview-sub";
          sd.textContent = t.desc;
          li.appendChild(sd);
        }
        if (t.effects) {
          li.appendChild(document.createElement("br"));
          var se = document.createElement("span");
          se.className = "mj-chat-overview-effect";
          se.textContent = "效果：" + t.effects;
          li.appendChild(se);
        }
        ulTrait.appendChild(li);
      }
      root.appendChild(ulTrait);
    }

    appendOverviewSection(root, "世界因子");
    var factors = Array.isArray(fc.worldFactors) ? fc.worldFactors : [];
    if (!factors.length) {
      var noWf = document.createElement("p");
      noWf.className = "mj-chat-overview-muted";
      noWf.textContent = "未勾选预设世界因子；剧情将按默认凡人界设定展开。";
      root.appendChild(noWf);
    } else {
      var ulWf = document.createElement("ul");
      ulWf.className = "mj-chat-overview-ul";
      for (var wi = 0; wi < factors.length; wi++) {
        var f = factors[wi];
        if (!f) continue;
        var liw = document.createElement("li");
        liw.className = "mj-chat-overview-li";
        var sw = document.createElement("strong");
        sw.textContent = (f.name || "—") + (f.isCustom ? "（自定义）" : "");
        liw.appendChild(sw);
        if (f.desc) {
          liw.appendChild(document.createElement("br"));
          var sfd = document.createElement("span");
          sfd.className = "mj-chat-overview-sub";
          sfd.textContent = f.desc;
          liw.appendChild(sfd);
        }
        if (f.effect) {
          liw.appendChild(document.createElement("br"));
          var sfe = document.createElement("span");
          sfe.className = "mj-chat-overview-effect";
          sfe.textContent = "效果：" + f.effect;
          liw.appendChild(sfe);
        }
        ulWf.appendChild(liw);
      }
      root.appendChild(ulWf);
    }

    log.appendChild(root);
  }

  function setBarFill(fillEl, barHost, pct, textEl, textStr) {
    if (fillEl) fillEl.style.width = clampPct(pct) + "%";
    if (barHost) barHost.setAttribute("aria-valuenow", String(Math.round(clampPct(pct))));
    if (textEl && textStr != null) textEl.textContent = textStr;
  }

  function renderInventorySlots() {
    var grid = document.getElementById("mj-inventory-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className =
        "mj-inventory-slot" +
        (i === 0 ? " mj-inventory-slot--lingshi" : " mj-inventory-slot--empty");
      slot.setAttribute("data-slot", String(i));
      var lab = document.createElement("span");
      lab.className = "mj-inventory-slot-label";
      var qty = document.createElement("span");
      qty.className = "mj-inventory-slot-qty";
      qty.setAttribute("aria-label", "数量");
      slot.appendChild(lab);
      slot.appendChild(qty);
      grid.appendChild(slot);
    }
  }

  function renderBagSlots(G) {
    ensureInventorySlots(G);
    var grid = document.getElementById("mj-inventory-grid");
    if (!grid || !G || !G.inventorySlots) return;
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var el = grid.querySelector('[data-slot="' + i + '"]');
      if (!el) continue;
      var labelEl = el.querySelector(".mj-inventory-slot-label");
      var qtyEl = el.querySelector(".mj-inventory-slot-qty");
      if (i === 0) {
        el.classList.add("mj-inventory-slot--lingshi");
        el.classList.remove("mj-inventory-slot--empty", "mj-inventory-slot--filled");
        if (labelEl) labelEl.textContent = "灵石";
        var c0 = G.inventorySlots[0] && typeof G.inventorySlots[0].count === "number" ? G.inventorySlots[0].count : 0;
        if (qtyEl) {
          qtyEl.textContent = String(c0);
          qtyEl.classList.remove("hidden");
        }
        el.setAttribute("title", "灵石：" + c0);
        el.setAttribute("aria-label", "灵石，数量 " + c0);
        continue;
      }
      var item = G.inventorySlots[i];
      if (item && item.name) {
        el.classList.add("mj-inventory-slot--filled");
        el.classList.remove("mj-inventory-slot--empty");
        if (labelEl) labelEl.textContent = item.name;
        var cnt = typeof item.count === "number" ? item.count : 1;
        if (qtyEl) {
          qtyEl.textContent = String(cnt);
          qtyEl.classList.remove("hidden");
        }
        var tip = item.name;
        if (item.desc) tip += "\n" + item.desc;
        tip += "\n数量：" + cnt;
        el.setAttribute("title", tip);
        el.setAttribute("aria-label", item.name + "，数量 " + cnt);
      } else {
        el.classList.add("mj-inventory-slot--empty");
        el.classList.remove("mj-inventory-slot--filled");
        if (labelEl) labelEl.textContent = "";
        if (qtyEl) {
          qtyEl.textContent = "";
          qtyEl.classList.add("hidden");
        }
        el.setAttribute("title", "空位");
        el.removeAttribute("aria-label");
      }
    }
  }

  function renderGongfaGrid() {
    var grid = document.getElementById("mj-gongfa-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (var i = 0; i < GONGFA_SLOT_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className = "mj-inventory-slot";
      slot.setAttribute("data-gongfa-slot", String(i));
      slot.setAttribute("title", "功法空位");
      grid.appendChild(slot);
    }
  }

  function renderGongfaSlots(G) {
    ensureGongfaSlots(G);
    var grid = document.getElementById("mj-gongfa-grid");
    if (!grid || !G || !G.gongfaSlots) return;
    for (var i = 0; i < GONGFA_SLOT_COUNT; i++) {
      var el = grid.querySelector('[data-gongfa-slot="' + i + '"]');
      if (!el) continue;
      var item = G.gongfaSlots[i];
      var label = item && (item.name != null ? item.name : item.label);
      if (label) {
        el.classList.add("mj-gongfa-slot--filled");
        el.textContent = String(label);
        el.setAttribute("title", item.desc ? String(item.desc) : String(label));
      } else {
        el.classList.remove("mj-gongfa-slot--filled");
        el.textContent = "";
        el.setAttribute("title", "功法空位");
      }
    }
  }

  function buildTraitSlotTooltip(t) {
    if (!t || !t.name) return "空槽";
    var s = t.name + (t.rarity ? "（" + t.rarity + "）" : "");
    if (t.desc) s += "\n" + t.desc;
    if (t.effects != null && String(t.effects) !== "") s += "\n效果：" + t.effects;
    return s;
  }

  function formatTraitBonusLine(b) {
    if (!b || typeof b !== "object") return "";
    var keys = Object.keys(b);
    if (!keys.length) return "";
    return keys
      .map(function (k) {
        return k + " " + b[k];
      })
      .join("；");
  }

  function appendTraitModalSection(bodyEl, label, text) {
    if (text == null || String(text).trim() === "") return;
    var sec = document.createElement("div");
    sec.className = "mj-trait-modal-section";
    var k = document.createElement("span");
    k.className = "mj-trait-modal-k";
    k.textContent = label;
    var v = document.createElement("div");
    v.className = "mj-trait-modal-v";
    v.textContent = String(text);
    sec.appendChild(k);
    sec.appendChild(v);
    bodyEl.appendChild(sec);
  }

  function openTraitDetailModal(t) {
    var root = document.getElementById("mj-trait-detail-root");
    var titleEl = document.getElementById("mj-trait-modal-title");
    var rarityEl = document.getElementById("mj-trait-modal-rarity");
    var bodyEl = document.getElementById("mj-trait-modal-body");
    if (!root || !titleEl || !rarityEl || !bodyEl || !t || !t.name) return;
    titleEl.textContent = t.name;
    rarityEl.textContent = t.rarity ? "品质：" + t.rarity : "";
    bodyEl.textContent = "";
    appendTraitModalSection(bodyEl, "简述", t.desc);
    appendTraitModalSection(bodyEl, "效果", t.effects);
    var bonusLine = formatTraitBonusLine(t.bonus);
    if (bonusLine) appendTraitModalSection(bodyEl, "属性加成", bonusLine);
    if (t.item != null && String(t.item).trim() !== "" && String(t.item) !== "无") {
      appendTraitModalSection(bodyEl, "关联物品", t.item);
    }
    var modalPanel = root.querySelector(".mj-trait-modal");
    if (modalPanel) {
      modalPanel.removeAttribute("data-rarity");
      if (t.rarity) modalPanel.setAttribute("data-rarity", String(t.rarity));
    }
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = root.querySelector(".mj-trait-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeTraitDetailModal() {
    var root = document.getElementById("mj-trait-detail-root");
    if (!root) return;
    var modalPanel = root.querySelector(".mj-trait-modal");
    if (modalPanel) modalPanel.removeAttribute("data-rarity");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function tryOpenTraitFromSlotEl(slot) {
    var row = document.getElementById("mj-talent-row");
    if (!slot || !row || !row.contains(slot)) return;
    if (!slot.classList.contains("mj-trait-slot--filled")) return;
    var idx = parseInt(slot.getAttribute("data-trait-slot"), 10);
    if (isNaN(idx)) return;
    var G = global.MortalJourneyGame;
    var fc = G && G.fateChoice;
    var traits = fc && Array.isArray(fc.traits) ? fc.traits : [];
    var t = traits[idx];
    if (t && t.name) openTraitDetailModal(t);
  }

  var _traitModalUiBound = false;

  function bindTraitDetailModalUi() {
    if (_traitModalUiBound) return;
    _traitModalUiBound = true;
    var root = document.getElementById("mj-trait-detail-root");
    if (root) {
      root.querySelectorAll("[data-mj-trait-modal-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          closeTraitDetailModal();
        });
      });
    }
    document.addEventListener("keydown", function (ev) {
      var r = document.getElementById("mj-trait-detail-root");
      if (ev.key === "Escape" && r && !r.classList.contains("hidden")) closeTraitDetailModal();
    });
    var row = document.getElementById("mj-talent-row");
    if (row) {
      row.addEventListener("click", function (e) {
        var slot = e.target.closest(".mj-trait-slot");
        tryOpenTraitFromSlotEl(slot);
      });
      row.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-trait-slot");
        if (!slot || !row.contains(slot)) return;
        if (!slot.classList.contains("mj-trait-slot--filled")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenTraitFromSlotEl(slot);
      });
    }
  }

  /** 年龄/寿元下方五个天赋槽，数据来自 fateChoice.traits（逆天改命） */
  function renderTalentSlots(fc) {
    var row = document.getElementById("mj-talent-row");
    if (!row) return;
    var nodes = row.querySelectorAll("[data-trait-slot]");
    var traits = fc && Array.isArray(fc.traits) ? fc.traits : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var inner = el.querySelector(".mj-trait-slot-inner");
      var t = traits[i];
      el.removeAttribute("data-rarity");
      if (t && t.name) {
        el.className = "mj-trait-slot mj-trait-slot--filled";
        if (t.rarity) el.setAttribute("data-rarity", String(t.rarity));
        if (inner) inner.textContent = String(t.name);
        el.setAttribute("title", buildTraitSlotTooltip(t));
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "查看天赋：" + String(t.name));
      } else {
        el.className = "mj-trait-slot mj-trait-slot--empty";
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        if (inner) inner.textContent = "—";
        el.setAttribute("title", "空槽");
      }
    }
  }

  function renderEquipSlots(G) {
    ensureEquippedSlots(G);
    var row = document.getElementById("mj-equip-row");
    if (!row || !G || !G.equippedSlots) return;
    for (var i = 0; i < EQUIP_SLOT_COUNT; i++) {
      var el = row.querySelector('[data-equip-slot="' + i + '"]');
      if (!el) continue;
      var nameEl = el.querySelector(".mj-equip-slot-name");
      var item = G.equippedSlots[i];
      var label = item && (item.name != null ? item.name : item.label);
      if (label) {
        el.classList.remove("mj-equip-slot--empty");
        el.classList.add("mj-equip-slot--filled");
        if (nameEl) nameEl.textContent = String(label);
        var tip = String(label);
        if (item.desc) tip += "\n" + String(item.desc);
        el.setAttribute("title", tip);
      } else {
        el.classList.add("mj-equip-slot--empty");
        el.classList.remove("mj-equip-slot--filled");
        if (nameEl) nameEl.textContent = "—";
        el.setAttribute("title", EQUIP_SLOT_EMPTY_TITLE[i] || "空位");
      }
    }
  }

  function renderLeftPanel(fc, G) {
    var worldEl = document.getElementById("mj-world-time");
    if (worldEl) worldEl.textContent = (G && G.worldTimeString) || DEFAULT_WORLD_TIME;

    var realmEl = document.getElementById("mj-realm-line");
    if (realmEl) realmEl.textContent = formatRealmLine(fc, G);

    var cultFill = document.getElementById("mj-cultivation-bar-fill");
    var cultBar = document.getElementById("mj-cultivation-bar");
    var cultTxt = document.getElementById("mj-cultivation-pct-text");
    var cp = G && typeof G.cultivationProgress === "number" ? G.cultivationProgress : 0;
    setBarFill(cultFill, cultBar, cp, cultTxt, Math.round(clampPct(cp)) + "%");

    var hpFill = document.getElementById("mj-hp-bar-fill");
    var hpBar = document.getElementById("mj-hp-bar");
    var hpTxt = document.getElementById("mj-hp-text");
    var mpFill = document.getElementById("mj-mp-bar-fill");
    var mpBar = document.getElementById("mj-mp-bar");
    var mpTxt = document.getElementById("mj-mp-text");

    if (G && G.playerBase && G.maxHp != null && G.maxMp != null) {
      var curH = typeof G.currentHp === "number" ? G.currentHp : G.maxHp;
      var curM = typeof G.currentMp === "number" ? G.currentMp : G.maxMp;
      var pctH = G.maxHp > 0 ? (curH / G.maxHp) * 100 : 0;
      var pctM = G.maxMp > 0 ? (curM / G.maxMp) * 100 : 0;
      setBarFill(hpFill, hpBar, pctH, hpTxt, Math.round(curH) + " / " + Math.round(G.maxHp));
      setBarFill(mpFill, mpBar, pctM, mpTxt, Math.round(curM) + " / " + Math.round(G.maxMp));
    } else {
      setBarFill(hpFill, hpBar, 0, hpTxt, "— / —");
      setBarFill(mpFill, mpBar, 0, mpTxt, "— / —");
    }

    var genderEl = document.getElementById("mj-stat-gender");
    var lingEl = document.getElementById("mj-stat-linggen");
    var ageEl = document.getElementById("mj-stat-age");
    var syEl = document.getElementById("mj-stat-shouyuan");
    if (genderEl) genderEl.textContent = (fc && fc.gender) || "—";
    if (lingEl) lingEl.textContent = formatLinggenPanelText(fc && fc.linggen);
    if (ageEl) ageEl.textContent = G && G.age != null ? String(G.age) : "—";
    if (syEl) syEl.textContent = G && G.shouyuan != null ? String(G.shouyuan) : "—";

    renderTalentSlots(fc);

    var pb = G && G.playerBase;
    var patkEl = document.getElementById("mj-stat-patk");
    var pdefEl = document.getElementById("mj-stat-pdef");
    var matkEl = document.getElementById("mj-stat-matk");
    var mdefEl = document.getElementById("mj-stat-mdef");
    var senseEl = document.getElementById("mj-stat-sense");
    var footEl = document.getElementById("mj-stat-foot");
    var charmEl = document.getElementById("mj-stat-charm");
    var luckEl = document.getElementById("mj-stat-luck");
    if (patkEl) patkEl.textContent = pb ? numOrDash(pb.patk) : "—";
    if (pdefEl) pdefEl.textContent = pb ? numOrDash(pb.pdef) : "—";
    if (matkEl) matkEl.textContent = pb ? numOrDash(pb.matk) : "—";
    if (mdefEl) mdefEl.textContent = pb ? numOrDash(pb.mdef) : "—";
    if (senseEl) senseEl.textContent = pb ? numOrDash(pb.sense) : "—";
    if (footEl) footEl.textContent = pb ? numOrDash(pb.foot) : "—";
    if (charmEl) {
      var ch = pb && typeof pb.charm === "number" ? pb.charm : G && G.charm;
      charmEl.textContent = numOrDash(ch);
    }
    if (luckEl) {
      var lk = pb && typeof pb.luck === "number" ? pb.luck : G && G.luck;
      luckEl.textContent = numOrDash(lk);
    }

    var img = document.getElementById("mj-player-avatar");
    var ph = document.getElementById("mj-player-avatar-placeholder");
    var url = G && G.avatarUrl;
    if (img && ph) {
      if (url) {
        img.src = url;
        img.classList.remove("hidden");
        ph.classList.add("hidden");
      } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        ph.classList.remove("hidden");
      }
    }

    renderEquipSlots(G);
    renderGongfaSlots(G);
    renderBagSlots(G);
  }

  function init() {
    bindTraitDetailModalUi();
    var fc = restoreBootstrap();
    var G = global.MortalJourneyGame;
    if (!G) {
      G = {};
      global.MortalJourneyGame = G;
    }
    ensureGameRuntimeDefaults(G);
    renderInventorySlots();
    renderGongfaGrid();
    renderLeftPanel(fc, G);
    renderBootstrapOverview(fc);

    if (global.MortalJourneyWorldBook && typeof global.MortalJourneyWorldBook.syncToBridgeStorage === "function") {
      try {
        global.MortalJourneyWorldBook.syncToBridgeStorage();
      } catch (syncErr) {
        console.warn("[主界面] 世界书同步到桥接存储失败", syncErr);
      }
    }

    var sendBtn = document.getElementById("mj-chat-send");
    var textarea = document.getElementById("mj-chat-input");
    if (sendBtn && textarea) {
      sendBtn.addEventListener("click", function () {
        handleChatSend(textarea, sendBtn);
      });
      textarea.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" || ev.shiftKey) return;
        ev.preventDefault();
        handleChatSend(textarea, sendBtn);
      });
    }

    console.info("[主界面] 骨架已加载", G);
    if (global.GameLog && typeof global.GameLog.info === "function") {
      global.GameLog.info("[主界面] 已加载；左下角可展开调试日志面板。");
    }
  }

  global.MainScreen = {
    /** 重新从 DOM 刷新左栏（在修改 MortalJourneyGame 后调用） */
    refreshLeftPanel: function () {
      var fc = global.MortalJourneyGame && global.MortalJourneyGame.fateChoice;
      ensureGameRuntimeDefaults(global.MortalJourneyGame);
      renderLeftPanel(fc, global.MortalJourneyGame);
    },
    /** 佩戴栏槽位数（固定 3） */
    EQUIP_SLOT_COUNT: EQUIP_SLOT_COUNT,
    /**
     * 设置佩戴槽 item 为 { name, desc? } 或 null；index 0 主武器 1 副武器 2 防具
     * @returns {boolean}
     */
    setEquippedSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= EQUIP_SLOT_COUNT) return false;
      G.equippedSlots[i] = item == null ? null : item;
      renderEquipSlots(G);
      return true;
    },
    /** @returns {Array} 三槽快照（元素为 null 或 { name, desc? }） */
    getEquippedSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) return [null, null, null];
      ensureEquippedSlots(G);
      return G.equippedSlots.slice();
    },
    /** 功法栏格数（3×4，固定 12） */
    GONGFA_SLOT_COUNT: GONGFA_SLOT_COUNT,
    /**
     * 设置功法格 item 为 { name, desc? } 或 null；index 0～11
     * @returns {boolean}
     */
    setGongfaSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= GONGFA_SLOT_COUNT) return false;
      G.gongfaSlots[i] = item == null ? null : item;
      renderGongfaSlots(G);
      return true;
    },
    /** @returns {Array} 12 格快照（元素为 null 或 { name, desc? }） */
    getGongfaSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) {
        var empty = [];
        for (var e = 0; e < GONGFA_SLOT_COUNT; e++) empty.push(null);
        return empty;
      }
      ensureGongfaSlots(G);
      return G.gongfaSlots.slice();
    },
    /** 储物袋格数（含第 0 格灵石） */
    INVENTORY_SLOT_COUNT: INVENTORY_SLOT_COUNT,
    /**
     * 设置灵石数量（第 0 格）
     * @returns {boolean}
     */
    setLingShiCount: function (n) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var c = Math.max(0, Math.floor(Number(n) || 0));
      G.inventorySlots[0].count = c;
      renderBagSlots(G);
      return true;
    },
    /** @returns {number} */
    getLingShiCount: function () {
      var G = global.MortalJourneyGame;
      if (!G) return 0;
      ensureInventorySlots(G);
      var z = G.inventorySlots[0];
      return z && typeof z.count === "number" ? z.count : 0;
    },
    /**
     * 储物袋物品格：index 1～11，item 为 { name, count?, desc? } 或 null；index 0 请用 setLingShiCount
     * @returns {boolean}
     */
    setBagSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 1 || i >= INVENTORY_SLOT_COUNT) return false;
      G.inventorySlots[i] = item == null ? null : normalizeBagItem(item);
      renderBagSlots(G);
      return true;
    },
    /** @returns {Array} 12 格：{ kind:'lingshi', count } 或 { name, count, desc? } 或 null */
    getBagSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) {
        var emp = [ { kind: "lingshi", count: 0 } ];
        for (var b = 1; b < INVENTORY_SLOT_COUNT; b++) emp.push(null);
        return emp;
      }
      ensureInventorySlots(G);
      return G.inventorySlots.map(function (x) {
        if (!x) return null;
        if (x.kind === "lingshi") return { kind: "lingshi", count: x.count };
        return { name: x.name, count: x.count, desc: x.desc };
      });
    },
    DEFAULT_WORLD_TIME: DEFAULT_WORLD_TIME,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
