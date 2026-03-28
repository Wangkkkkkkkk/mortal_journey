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
  /** 佩戴栏固定 3 格：武器、法器（戒指/手环/飞行法等）、防具（不可超过 3 件） */
  var EQUIP_SLOT_COUNT = 3;
  var EQUIP_SLOT_EMPTY_TITLE = ["武器空位", "法器空位", "防具空位"];
  var EQUIP_SLOT_KIND_LABELS = ["武器", "法器", "防具"];

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

      var C = global.MjCreationConfig;
      var invOk =
        data.inventorySlots &&
        Array.isArray(data.inventorySlots) &&
        data.inventorySlots.length === INVENTORY_SLOT_COUNT;
      var gfOk =
        data.gongfaSlots &&
        Array.isArray(data.gongfaSlots) &&
        data.gongfaSlots.length === GONGFA_SLOT_COUNT;
      if (invOk) {
        global.MortalJourneyGame.inventorySlots = JSON.parse(JSON.stringify(data.inventorySlots));
      } else if (fc.birth && C && typeof C.buildStartingInventorySlots === "function") {
        global.MortalJourneyGame.inventorySlots = JSON.parse(
          JSON.stringify(C.buildStartingInventorySlots(fc.birth)),
        );
      }
      if (gfOk) {
        global.MortalJourneyGame.gongfaSlots = JSON.parse(JSON.stringify(data.gongfaSlots));
      } else if (fc.birth && C && typeof C.buildStartingGongfaSlots === "function") {
        global.MortalJourneyGame.gongfaSlots = JSON.parse(JSON.stringify(C.buildStartingGongfaSlots(fc.birth)));
      }

      var eqOk =
        data.equippedSlots &&
        Array.isArray(data.equippedSlots) &&
        data.equippedSlots.length === EQUIP_SLOT_COUNT;
      if (eqOk) {
        global.MortalJourneyGame.equippedSlots = JSON.parse(JSON.stringify(data.equippedSlots));
      } else if (fc.birth && C && typeof C.buildStartingEquippedSlots === "function") {
        global.MortalJourneyGame.equippedSlots = JSON.parse(
          JSON.stringify(C.buildStartingEquippedSlots(fc.birth)),
        );
      }

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
    if (entry.equipType != null && String(entry.equipType).trim() !== "") {
      o.equipType = String(entry.equipType).trim();
    }
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
        el.setAttribute("title", "灵石：" + c0 + "（点击查看详情）");
        el.setAttribute("aria-label", "灵石，数量 " + c0);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
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
        tip += "\n数量：" + cnt + "（点击查看详情）";
        el.setAttribute("title", tip);
        el.setAttribute("aria-label", item.name + "，数量 " + cnt);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
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
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
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
      var inner = document.createElement("span");
      inner.className = "mj-gongfa-slot-label";
      inner.setAttribute("aria-hidden", "true");
      slot.appendChild(inner);
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
      var inner = el.querySelector(".mj-gongfa-slot-label");
      var item = G.gongfaSlots[i];
      var label = item && (item.name != null ? item.name : item.label);
      if (label) {
        el.classList.add("mj-gongfa-slot--filled");
        if (inner) inner.textContent = String(label);
        var tip = String(label);
        if (item.desc) tip += "\n" + String(item.desc);
        tip += "\n（点击查看详情）";
        el.setAttribute("title", tip);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "查看功法：" + String(label));
      } else {
        el.classList.remove("mj-gongfa-slot--filled");
        if (inner) inner.textContent = "";
        el.setAttribute("title", "功法空位");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
      }
    }
  }

  function formatZhBonusObject(b) {
    if (!b || typeof b !== "object") return "";
    var keys = Object.keys(b);
    if (!keys.length) return "";
    return keys
      .map(function (k) {
        var v = b[k];
        if (typeof v === "number" && isFinite(v)) {
          return (v >= 0 ? k + " +" + v : k + " " + v);
        }
        return k + " " + String(v);
      })
      .join("；");
  }

  /** 配置里 stuff 条目的 bonus 展示用（灵石只体现在 0 格数量） */
  function formatStuffBonusForDisplay(b) {
    if (!b || typeof b !== "object") return "";
    var o = Object.assign({}, b);
    delete o.灵石;
    return formatZhBonusObject(o);
  }

  /** 按物品显示名匹配任意出身 stuff 元数据 { desc, bonus } */
  function lookupStuffMetaByItemName(itemName) {
    if (!itemName) return null;
    var C = global.MjCreationConfig;
    if (!C || !C.BIRTHS || typeof C.resolveStuffEntry !== "function") return null;
    var want = String(itemName).trim();
    for (var bk in C.BIRTHS) {
      if (!Object.prototype.hasOwnProperty.call(C.BIRTHS, bk)) continue;
      var bd = C.BIRTHS[bk];
      var stuff = bd && bd.stuff;
      if (!stuff || typeof stuff !== "object" || Array.isArray(stuff)) continue;
      for (var key in stuff) {
        if (!Object.prototype.hasOwnProperty.call(stuff, key)) continue;
        var meta = stuff[key];
        if (!meta || typeof meta !== "object") meta = {};
        var resolved = C.resolveStuffEntry(key, meta);
        if (resolved.type === "item" && resolved.name === want) return meta;
      }
    }
    return null;
  }

  /** 在所有出身的 gongfa 表里查找同名功法定义（含 desc / bonus） */
  function lookupGongfaConfigDef(gongfaName) {
    if (!gongfaName) return null;
    var C = global.MjCreationConfig;
    if (!C || !C.BIRTHS) return null;
    var births = C.BIRTHS;
    for (var bk in births) {
      if (!Object.prototype.hasOwnProperty.call(births, bk)) continue;
      var bd = births[bk];
      if (!bd || !bd.gongfa || typeof bd.gongfa !== "object") continue;
      if (bd.gongfa[gongfaName]) return bd.gongfa[gongfaName];
    }
    return null;
  }

  /** 按装备名匹配任意出身 equipment 元数据 { desc, type, bonus } */
  function lookupEquipmentMetaByItemName(itemName) {
    if (!itemName) return null;
    var C = global.MjCreationConfig;
    if (!C || !C.BIRTHS) return null;
    var want = String(itemName).trim();
    for (var bk in C.BIRTHS) {
      if (!Object.prototype.hasOwnProperty.call(C.BIRTHS, bk)) continue;
      var bd = C.BIRTHS[bk];
      var eq = bd && bd.equipment;
      if (!eq || typeof eq !== "object") continue;
      if (eq[want]) return eq[want];
    }
    return null;
  }

  function formatEquipTypeLabel(ty) {
    if (ty == null || String(ty).trim() === "") return "";
    var r = String(ty).trim();
    if (r === "副武器") return "法器";
    if (r === "主武器") return "武器";
    return r;
  }

  function findFirstEmptyBagSlot(G) {
    ensureInventorySlots(G);
    for (var i = 1; i < INVENTORY_SLOT_COUNT; i++) {
      if (!G.inventorySlots[i]) return i;
    }
    return -1;
  }

  /**
   * 将一件物品放入储物袋（1～11）：优先与同名堆叠，否则找空位。
   * @returns {boolean}
   */
  function tryPlaceItemInBag(G, payload) {
    if (!G || !payload || !payload.name) return false;
    ensureInventorySlots(G);
    var name = String(payload.name).trim();
    if (!name) return false;
    var cnt = typeof payload.count === "number" && isFinite(payload.count) ? Math.max(1, Math.floor(payload.count)) : 1;
    var desc = payload.desc != null ? String(payload.desc) : "";
    for (var i = 1; i < INVENTORY_SLOT_COUNT; i++) {
      var c = G.inventorySlots[i];
      if (c && c.name === name) {
        c.count = (typeof c.count === "number" && isFinite(c.count) ? c.count : 1) + cnt;
        return true;
      }
    }
    var j = findFirstEmptyBagSlot(G);
    if (j < 0) return false;
    G.inventorySlots[j] = normalizeBagItem({
      name: name,
      count: cnt,
      desc: desc || undefined,
      equipType: payload.equipType,
    });
    return true;
  }

  /** 背包格物品是否可穿戴：有佩戴部位（格子上 equipType 或配置 equipment.type）则返回栏位索引 0～2 */
  function resolveWearableSlotIndexForBagItem(it) {
    if (!it || !it.name) return null;
    var ty = it.equipType != null ? String(it.equipType).trim() : "";
    if (!ty) {
      var em = lookupEquipmentMetaByItemName(String(it.name).trim());
      if (!em || em.type == null || String(em.type).trim() === "") return null;
      ty = String(em.type).trim();
    }
    var C = global.MjCreationConfig;
    if (!C || typeof C.equipTypeToSlotIndex !== "function") return null;
    var si = C.equipTypeToSlotIndex(ty);
    return si == null ? null : si;
  }

  function notifyBagFull() {
    var msg = "储物袋已满，无法卸下或更换装备。";
    if (global.GameLog && typeof global.GameLog.warn === "function") global.GameLog.warn(msg);
    else window.alert(msg);
  }

  /**
   * 从佩戴栏卸下放入储物袋。
   * @param {number} equipIdx 0～2
   * @returns {boolean}
   */
  function performUnequipToBag(equipIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    ensureGameRuntimeDefaults(G);
    var ei = Number(equipIdx);
    if (!isFinite(ei) || ei < 0 || ei >= EQUIP_SLOT_COUNT) return false;
    var item = G.equippedSlots[ei];
    if (!item) return false;
    var nm = item.name != null ? String(item.name).trim() : "";
    if (!nm) return false;
    var payload = {
      name: nm,
      count: 1,
      desc: item.desc != null ? String(item.desc) : "",
      equipType: item.equipType,
    };
    if (!tryPlaceItemInBag(G, payload)) {
      notifyBagFull();
      return false;
    }
    G.equippedSlots[ei] = null;
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  /**
   * 从储物袋穿戴到对应部位；若该部位已有装备则先放入储物袋再穿戴。
   * @param {number} bagIdx 1～11
   * @returns {boolean}
   */
  function performEquipFromBag(bagIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 1 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var slotIdx = resolveWearableSlotIndexForBagItem(it);
    if (slotIdx == null) return false;

    var prev = G.equippedSlots[slotIdx];
    if (prev && prev.name) {
      if (
        !tryPlaceItemInBag(G, {
          name: String(prev.name).trim(),
          count: 1,
          desc: prev.desc != null ? String(prev.desc) : "",
          equipType: prev.equipType,
        })
      ) {
        notifyBagFull();
        return false;
      }
    }

    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
    if (cnt < 1) return false;

    var eqMeta = lookupEquipmentMetaByItemName(String(it.name).trim());
    var ty =
      it.equipType != null && String(it.equipType).trim() !== ""
        ? String(it.equipType).trim()
        : eqMeta && eqMeta.type != null
          ? String(eqMeta.type).trim()
          : "";
    var descStr = "";
    if (it.desc != null && String(it.desc).trim() !== "") descStr = String(it.desc).trim();
    else if (eqMeta && eqMeta.desc != null) descStr = String(eqMeta.desc).trim();

    var equipObj = {
      name: String(it.name).trim(),
      desc: descStr,
      equipType: ty,
    };

    if (cnt > 1) {
      G.inventorySlots[bi] = normalizeBagItem({
        name: it.name,
        count: cnt - 1,
        desc: it.desc,
        equipType: it.equipType,
      });
    } else {
      G.inventorySlots[bi] = null;
    }

    G.equippedSlots[slotIdx] = equipObj;
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  function appendItemDetailActionButtons(bodyEl, actionButtons) {
    if (!bodyEl || !Array.isArray(actionButtons) || !actionButtons.length) return;
    var wrap = document.createElement("div");
    wrap.className = "mj-item-detail-actions";
    for (var b = 0; b < actionButtons.length; b++) {
      var spec = actionButtons[b];
      if (!spec || !spec.label) continue;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mj-item-detail-action-btn" + (spec.primary ? " mj-item-detail-action-btn--primary" : "");
      btn.textContent = String(spec.label);
      (function (onClick) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (typeof onClick === "function") onClick();
        });
      })(spec.onClick);
      wrap.appendChild(btn);
    }
    if (wrap.childNodes.length) bodyEl.appendChild(wrap);
  }

  /**
   * @param {{ label: string, text: string }[]} sections
   * @param {{ label: string, primary?: boolean, onClick?: function(): void }[]} [actionButtons]
   */
  function openItemDetailModal(title, subtitle, sections, actionButtons) {
    var root = document.getElementById("mj-item-detail-root");
    var titleEl = document.getElementById("mj-item-detail-title");
    var subEl = document.getElementById("mj-item-detail-subtitle");
    var bodyEl = document.getElementById("mj-item-detail-body");
    if (!root || !titleEl || !subEl || !bodyEl) return;
    titleEl.textContent = title || "—";
    subEl.textContent = subtitle || "";
    bodyEl.textContent = "";
    if (Array.isArray(sections)) {
      for (var i = 0; i < sections.length; i++) {
        var s = sections[i];
        if (!s) continue;
        var lab = s.label != null ? String(s.label) : "说明";
        var txt = s.text != null ? String(s.text) : "";
        if (txt === "") continue;
        appendTraitModalSection(bodyEl, lab, txt);
      }
    }
    appendItemDetailActionButtons(bodyEl, actionButtons);
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = root.querySelector(".mj-trait-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeItemDetailModal() {
    var root = document.getElementById("mj-item-detail-root");
    if (!root) return;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    var traitRoot = document.getElementById("mj-trait-detail-root");
    if (!traitRoot || traitRoot.classList.contains("hidden")) {
      document.body.style.overflow = "";
    }
  }

  function tryOpenGongfaFromSlot(slotEl) {
    var grid = document.getElementById("mj-gongfa-grid");
    if (!slotEl || !grid || !grid.contains(slotEl)) return;
    if (!slotEl.classList.contains("mj-gongfa-slot--filled")) return;
    var idx = parseInt(slotEl.getAttribute("data-gongfa-slot"), 10);
    if (isNaN(idx)) return;
    var G = global.MortalJourneyGame;
    var item = G && G.gongfaSlots && G.gongfaSlots[idx];
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var cfgDef = lookupGongfaConfigDef(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = cfgDef && cfgDef.desc != null ? String(cfgDef.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var sections = [];
    if (desc) sections.push({ label: "简介", text: desc });
    var bonusLine = cfgDef && cfgDef.bonus ? formatZhBonusObject(cfgDef.bonus) : "";
    if (bonusLine) sections.push({ label: "修炼加成", text: bonusLine });
    if (!sections.length) sections.push({ label: "说明", text: "暂无详细描述。" });
    openItemDetailModal(name, "功法", sections);
  }

  function tryOpenBagSlotFromEl(slotEl) {
    var grid = document.getElementById("mj-inventory-grid");
    if (!slotEl || !grid || !grid.contains(slotEl)) return;
    var idx = parseInt(slotEl.getAttribute("data-slot"), 10);
    if (isNaN(idx)) return;
    var G = global.MortalJourneyGame;
    if (!G || !G.inventorySlots) return;
    if (idx === 0) {
      var z = G.inventorySlots[0];
      var cnt = z && typeof z.count === "number" ? z.count : 0;
      openItemDetailModal("灵石", "货币", [
        { label: "说明", text: "修士界流通的基础货币，可用于购买丹药、法器与材料等。" },
        { label: "持有数量", text: String(cnt) },
      ]);
      return;
    }
    if (!slotEl.classList.contains("mj-inventory-slot--filled")) return;
    var it = G.inventorySlots[idx];
    if (!it || !it.name) return;
    var cnt = typeof it.count === "number" ? it.count : 1;
    var stuffMeta = lookupStuffMetaByItemName(it.name);
    var eqMeta = lookupEquipmentMetaByItemName(it.name);
    var descRuntime = it.desc != null ? String(it.desc).trim() : "";
    var descCfg =
      (stuffMeta && stuffMeta.desc != null ? String(stuffMeta.desc).trim() : "") ||
      (eqMeta && eqMeta.desc != null ? String(eqMeta.desc).trim() : "");
    var desc = descRuntime || descCfg || "";
    var sections = [];
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    var wearSlot = resolveWearableSlotIndexForBagItem(it);
    if (wearSlot != null) {
      var tyShow = it.equipType
        ? formatEquipTypeLabel(it.equipType)
        : eqMeta && eqMeta.type
          ? formatEquipTypeLabel(eqMeta.type)
          : EQUIP_SLOT_KIND_LABELS[wearSlot] || "装备";
      sections.push({ label: "佩戴部位", text: tyShow });
    }
    var bonusStuff = stuffMeta && stuffMeta.bonus ? formatStuffBonusForDisplay(stuffMeta.bonus) : "";
    var bonusEq = eqMeta && eqMeta.bonus ? formatZhBonusObject(eqMeta.bonus) : "";
    if (bonusStuff) sections.push({ label: "效果", text: bonusStuff });
    if (bonusEq) sections.push({ label: "属性加成", text: bonusEq });
    sections.push({ label: "持有数量", text: String(cnt) });

    var actions = [];
    if (wearSlot != null) {
      actions.push({
        label: "穿戴",
        primary: true,
        onClick: function () {
          closeItemDetailModal();
          performEquipFromBag(idx);
        },
      });
    }
    openItemDetailModal(String(it.name), "物品", sections, actions);
  }

  function tryOpenEquipFromSlotEl(slotEl) {
    var row = document.getElementById("mj-equip-row");
    if (!slotEl || !row || !row.contains(slotEl)) return;
    if (!slotEl.classList.contains("mj-equip-slot--filled")) return;
    var idx = parseInt(slotEl.getAttribute("data-equip-slot"), 10);
    if (isNaN(idx) || idx < 0 || idx >= EQUIP_SLOT_COUNT) return;
    var G = global.MortalJourneyGame;
    var item = G && G.equippedSlots && G.equippedSlots[idx];
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var meta = lookupEquipmentMetaByItemName(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = meta && meta.desc != null ? String(meta.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyLabel = item.equipType
      ? formatEquipTypeLabel(item.equipType)
      : EQUIP_SLOT_KIND_LABELS[idx] || "装备";
    var sections = [];
    sections.push({ label: "佩戴部位", text: tyLabel });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    var bonusLine = meta && meta.bonus ? formatZhBonusObject(meta.bonus) : "";
    if (bonusLine) sections.push({ label: "属性加成", text: bonusLine });
    openItemDetailModal(name, "装备", sections, [
      {
        label: "卸下",
        onClick: function () {
          closeItemDetailModal();
          performUnequipToBag(idx);
        },
      },
    ]);
  }

  var _gongfaBagDetailUiBound = false;

  function bindGongfaBagDetailUi() {
    if (_gongfaBagDetailUiBound) return;
    _gongfaBagDetailUiBound = true;
    var itemRoot = document.getElementById("mj-item-detail-root");
    if (itemRoot) {
      itemRoot.querySelectorAll("[data-mj-item-detail-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          closeItemDetailModal();
        });
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var rItem = document.getElementById("mj-item-detail-root");
      if (rItem && !rItem.classList.contains("hidden")) {
        closeItemDetailModal();
        ev.preventDefault();
      }
    });
    var gf = document.getElementById("mj-gongfa-grid");
    if (gf) {
      gf.addEventListener("click", function (e) {
        tryOpenGongfaFromSlot(e.target.closest(".mj-inventory-slot"));
      });
      gf.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-inventory-slot");
        if (!slot || !gf.contains(slot)) return;
        if (!slot.classList.contains("mj-gongfa-slot--filled")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenGongfaFromSlot(slot);
      });
    }
    var bag = document.getElementById("mj-inventory-grid");
    if (bag) {
      bag.addEventListener("click", function (e) {
        tryOpenBagSlotFromEl(e.target.closest(".mj-inventory-slot"));
      });
      bag.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-inventory-slot");
        if (!slot || !bag.contains(slot)) return;
        if (slot.classList.contains("mj-inventory-slot--empty")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenBagSlotFromEl(slot);
      });
    }
    var equipRow = document.getElementById("mj-equip-row");
    if (equipRow) {
      equipRow.addEventListener("click", function (e) {
        tryOpenEquipFromSlotEl(e.target.closest(".mj-equip-slot"));
      });
      equipRow.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-equip-slot");
        if (!slot || !equipRow.contains(slot)) return;
        if (!slot.classList.contains("mj-equip-slot--filled")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenEquipFromSlotEl(slot);
      });
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
        var tip = "";
        if (item.equipType) {
          var tyRaw = String(item.equipType);
          var tyShow =
            tyRaw === "副武器" ? "法器" : tyRaw === "主武器" ? "武器" : tyRaw;
          tip += tyShow + "：";
        }
        tip += String(label);
        if (item.desc) tip += "\n" + String(item.desc);
        tip += "\n（点击查看详情）";
        el.setAttribute("title", tip);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "查看装备：" + String(label));
      } else {
        el.classList.add("mj-equip-slot--empty");
        el.classList.remove("mj-equip-slot--filled");
        if (nameEl) nameEl.textContent = "—";
        el.setAttribute("title", EQUIP_SLOT_EMPTY_TITLE[i] || "空位");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
      }
    }
  }

  function renderLeftPanel(fc, G) {
    if (
      G &&
      fc &&
      global.PlayerBaseRuntime &&
      typeof global.PlayerBaseRuntime.applyToGame === "function"
    ) {
      try {
        global.PlayerBaseRuntime.applyToGame(G, fc);
      } catch (pbrErr) {
        console.warn("[主界面] PlayerBaseRuntime.applyToGame 失败", pbrErr);
      }
    }

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
    bindGongfaBagDetailUi();
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
     * 设置佩戴槽 item 为 { name, desc?, equipType? } 或 null；index 0 武器 1 法器 2 防具
     * @returns {boolean}
     */
    setEquippedSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= EQUIP_SLOT_COUNT) return false;
      G.equippedSlots[i] = item == null ? null : item;
      renderLeftPanel(G.fateChoice, G);
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
      renderLeftPanel(G.fateChoice, G);
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
        var o = { name: x.name, count: x.count, desc: x.desc };
        if (x.equipType) o.equipType = x.equipType;
        return o;
      });
    },
    /** 从储物袋格（1～11）穿戴；满袋无法换下当前装备时返回 false */
    equipFromBagSlot: function (bagIndex) {
      return performEquipFromBag(bagIndex);
    },
    /** 卸下佩戴栏一格（0～2）到储物袋；袋满返回 false */
    unequipToBag: function (equipSlotIndex) {
      return performUnequipToBag(equipSlotIndex);
    },
    DEFAULT_WORLD_TIME: DEFAULT_WORLD_TIME,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
