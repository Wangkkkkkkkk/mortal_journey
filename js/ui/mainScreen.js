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
  var DEFAULT_CHARM = 50;
  var DEFAULT_LUCK = 50;
  var INVENTORY_SLOT_COUNT = 12;

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
      slot.className = "mj-inventory-slot";
      slot.setAttribute("data-slot", String(i));
      grid.appendChild(slot);
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
  }

  function init() {
    var fc = restoreBootstrap();
    var G = global.MortalJourneyGame;
    if (!G) {
      G = {};
      global.MortalJourneyGame = G;
    }
    ensureGameRuntimeDefaults(G);
    renderLeftPanel(fc, G);
    renderInventorySlots();
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
    DEFAULT_WORLD_TIME: DEFAULT_WORLD_TIME,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
