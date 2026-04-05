/**
 * 主界面（main.html）：加载顺序需为先 mainScreen_panel_realm.js、mainScreen_panel_inventory_ui.js，再 mainScreen_chat.js，最后本文件。
 * 新档门闩：开局剧情 → 开局配置（主角）→ MjMainScreenChat.runStateInventoryAiTurn（NPC 等）。
 * 全局：MortalJourneyGame、MainScreen（对外 API）。
 */
(function (global) {
  "use strict";

  var P = global.MjMainScreenPanel;
  var Chat = global.MjMainScreenChat;
  var CHAT_SUGGESTION_FALLBACK = {
    aggressive: "激进",
    neutral: "中立",
    cautious: "保守",
    veryCautious: "最保守",
  };

  function setChatSuggestions(next) {
    var obj = next && typeof next === "object" ? next : null;
    var levels = ["aggressive", "neutral", "cautious", "very-cautious"];
    for (var i = 0; i < levels.length; i++) {
      var lv = levels[i];
      var el = document.querySelector('[data-mj-chat-suggestion-level="' + lv + '"]');
      if (!el) continue;
      var key = lv === "very-cautious" ? "veryCautious" : lv;
      var txt = obj && obj[key] != null ? String(obj[key]).trim() : "";
      if (!txt) txt = CHAT_SUGGESTION_FALLBACK[key] || "";
      el.textContent = txt;
      el.title = txt;
    }
  }

  function chatHistoryHasUserAssistant(G0) {
    var h = G0 && Array.isArray(G0.chatHistory) ? G0.chatHistory : [];
    for (var hi = 0; hi < h.length; hi++) {
      var rr = h[hi] && h[hi].role;
      if (rr === "user" || rr === "assistant") return true;
    }
    return false;
  }

  function shouldRunBootstrapAiGate(G0) {
    if (!G0) return false;
    if (chatHistoryHasUserAssistant(G0)) return false;
    if (G0.mjInitStateAiApplied === true) return false;
    return true;
  }

  function formatBootstrapGateTime(d) {
    if (!(d instanceof Date) || !isFinite(d.getTime())) return "—";
    function p(n) {
      n = Math.floor(n);
      return n < 10 ? "0" + n : String(n);
    }
    return (
      p(d.getHours()) +
      ":" +
      p(d.getMinutes()) +
      ":" +
      p(d.getSeconds()) +
      "." +
      ("00" + d.getMilliseconds()).slice(-3)
    );
  }

  function showBootstrapGateUi() {
    var root = document.getElementById("mj-bootstrap-ai-gate");
    if (!root) return;
    document.body.classList.add("mj-main-body--bootstrap-gate");
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
  }

  function hideBootstrapGateUi() {
    var root = document.getElementById("mj-bootstrap-ai-gate");
    if (!root) return;
    document.body.classList.remove("mj-main-body--bootstrap-gate");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
  }

  function resetBootstrapGateUi() {
    var root = document.getElementById("mj-bootstrap-ai-gate");
    if (!root) return;
    var rows = root.querySelectorAll("[data-mj-bootstrap-phase]");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var sEl = row.querySelector("[data-mj-bootstrap-start]");
      var eEl = row.querySelector("[data-mj-bootstrap-end]");
      if (sEl) sEl.textContent = "—";
      if (eEl) eEl.textContent = "—";
      var st = row.querySelector("[data-mj-bootstrap-status]");
      if (st) st.textContent = "等待中";
    }
    var er = root.querySelector("[data-mj-bootstrap-error]");
    if (er) {
      er.textContent = "";
      er.hidden = true;
    }
    var rb = root.querySelector("[data-mj-bootstrap-retry]");
    var bb = root.querySelector("[data-mj-bootstrap-back]");
    if (rb) rb.hidden = true;
    if (bb) bb.hidden = true;
  }

  function updateBootstrapGateRow(phaseKey, patch) {
    var root = document.getElementById("mj-bootstrap-ai-gate");
    if (!root || !patch) return;
    var row = root.querySelector('[data-mj-bootstrap-phase="' + phaseKey + '"]');
    if (!row) return;
    if (patch.start != null) {
      var s0 = row.querySelector("[data-mj-bootstrap-start]");
      if (s0) s0.textContent = formatBootstrapGateTime(patch.start);
    }
    if (patch.end != null) {
      var e0 = row.querySelector("[data-mj-bootstrap-end]");
      if (e0) e0.textContent = formatBootstrapGateTime(patch.end);
    }
    if (patch.status != null) {
      var st0 = row.querySelector("[data-mj-bootstrap-status]");
      if (st0) st0.textContent = String(patch.status);
    }
  }

  function showBootstrapGateError(msg) {
    var root = document.getElementById("mj-bootstrap-ai-gate");
    if (!root) return;
    var er = root.querySelector("[data-mj-bootstrap-error]");
    var rb = root.querySelector("[data-mj-bootstrap-retry]");
    var bb = root.querySelector("[data-mj-bootstrap-back]");
    if (er) {
      er.textContent = String(msg || "未知错误");
      er.hidden = false;
    }
    if (rb) rb.hidden = false;
    if (bb) bb.hidden = false;
  }

  /**
   * 读档 / 已开局：先画界面，再走「开局配置 AI →（延时）开局剧情」非阻塞管线。
   */
  function runNormalFirstEnterPipeline(fc0, G0) {
    P.renderInventorySlots();
    P.renderGongfaGrid();
    P.renderLeftPanel(fc0, G0);
    P.renderBootstrapOverview(fc0);

    function afterInitStateAiPipeline() {
      try {
        P.renderInventorySlots();
        P.renderGongfaGrid();
        P.renderLeftPanel(fc0, G0);
        P.renderBootstrapOverview(fc0);
      } catch (_ePaint) {
        try {
          console.warn("[主界面] 开局配置后刷新面板失败", _ePaint);
        } catch (_eW) {}
      }
      try {
        if (
          global.MortalJourneyWorldGenerate &&
          typeof global.MortalJourneyWorldGenerate.scheduleOpeningStoryIfNeeded === "function"
        ) {
          global.MortalJourneyWorldGenerate.scheduleOpeningStoryIfNeeded();
        }
      } catch (_eOpen) {
        try {
          console.warn("[主界面] 开局剧情调度失败", _eOpen);
        } catch (_eW2) {}
      }
      if (
        global.MortalJourneyWorldBook &&
        typeof global.MortalJourneyWorldBook.syncToBridgeStorage === "function"
      ) {
        try {
          global.MortalJourneyWorldBook.syncToBridgeStorage();
        } catch (syncErr) {
          console.warn("[主界面] 世界书同步到桥接存储失败", syncErr);
        }
      }
      try {
        if (Chat && typeof Chat.renderHistoryIntoChatLog === "function") {
          Chat.renderHistoryIntoChatLog(G0 && G0.chatHistory);
        }
      } catch (_eChatRe) {}
    }

    try {
      if (Chat && typeof Chat.renderHistoryIntoChatLog === "function") {
        Chat.renderHistoryIntoChatLog(G0 && G0.chatHistory);
      }
    } catch (_e0) {}

    var InitGenN = global.MortalJourneyInitStateGenerate;
    if (InitGenN && typeof InitGenN.runInitStateAiIfNeeded === "function") {
      InitGenN.runInitStateAiIfNeeded({
        game: G0,
        fateChoice: fc0,
        onDone: afterInitStateAiPipeline,
      });
    } else {
      afterInitStateAiPipeline();
    }
  }

  /**
   * 新档首次：全屏门闱，依次 strict 执行「开局剧情 AI → 开局配置 AI（主角）→ 状态 AI（周围人物等）」。
   * 首段剧情不跑状态 AI；配置写主角面板后，再用状态 AI 对齐剧情中的 NPC 与可选世界/储物袋微调。
   */
  function runBootstrapAiGateOrSkip(fc0, G0) {
    if (!shouldRunBootstrapAiGate(G0) || !document.getElementById("mj-bootstrap-ai-gate")) {
      runNormalFirstEnterPipeline(fc0, G0);
      return;
    }

    var root = document.getElementById("mj-bootstrap-ai-gate");
    var WGen = global.MortalJourneyWorldGenerate;
    var InitGen = global.MortalJourneyInitStateGenerate;

    function failGate(msg) {
      showBootstrapGateError(msg);
    }

    function runInitPhase() {
      var t0 = new Date();
      updateBootstrapGateRow("initState", { status: "执行中…", start: t0 });
      if (!InitGen || typeof InitGen.runInitStateAiIfNeeded !== "function") {
        var tBad = new Date();
        updateBootstrapGateRow("initState", { status: "失败", end: tBad });
        failGate("开局配置模块未加载");
        return Promise.resolve({ ok: false });
      }
      return InitGen.runInitStateAiIfNeeded({
        game: G0,
        fateChoice: fc0,
        afterOpeningStory: true,
        onDone: function () {},
      }).then(function (res) {
        var t1 = new Date();
        updateBootstrapGateRow("initState", { end: t1 });
        if (!res) {
          updateBootstrapGateRow("initState", { status: "失败" });
          failGate("开局配置 AI 无返回");
          return { ok: false };
        }
        if (res.skipped) {
          if (res.reason === "no TavernHelper") {
            updateBootstrapGateRow("initState", { status: "失败" });
            failGate("TavernHelper 未就绪，请配置 API 后重试");
            return { ok: false };
          }
          if (res.reason === "no game or fateChoice") {
            updateBootstrapGateRow("initState", { status: "失败" });
            failGate("缺少存档或命运抉择数据");
            return { ok: false };
          }
          updateBootstrapGateRow("initState", { status: "已跳过（无需重复）" });
          return { ok: true };
        }
        if (res.ok === false) {
          updateBootstrapGateRow("initState", { status: "失败" });
          var em = res.error && res.error.message ? String(res.error.message) : "开局配置 AI 请求失败";
          failGate(em);
          return { ok: false };
        }
        updateBootstrapGateRow("initState", { status: "成功" });
        return { ok: true };
      });
    }

    function extractLastAssistantOpeningStory(Gg) {
      var hist = Gg && Array.isArray(Gg.chatHistory) ? Gg.chatHistory : [];
      for (var i = hist.length - 1; i >= 0; i--) {
        if (hist[i] && hist[i].role === "assistant" && hist[i].content) {
          return String(hist[i].content).trim();
        }
      }
      return "";
    }

    function runStateSyncPhase() {
      var t0 = new Date();
      updateBootstrapGateRow("stateSync", { status: "执行中…", start: t0 });
      if (!Chat || typeof Chat.runStateInventoryAiTurn !== "function") {
        var tBad0 = new Date();
        updateBootstrapGateRow("stateSync", { status: "失败", end: tBad0 });
        failGate("聊天模块未就绪，无法执行状态同步");
        return Promise.resolve({ ok: false });
      }
      var ST = global.MortalJourneyStateGenerate;
      if (
        !ST ||
        typeof ST.sendTurn !== "function" ||
        typeof ST.applyStateTurnFromAssistantText !== "function"
      ) {
        var tBad1 = new Date();
        updateBootstrapGateRow("stateSync", { status: "失败", end: tBad1 });
        failGate("状态 AI 模块未加载");
        return Promise.resolve({ ok: false });
      }
      var storyRaw = extractLastAssistantOpeningStory(G0);
      if (!storyRaw) {
        var tEmpty = new Date();
        updateBootstrapGateRow("stateSync", { status: "失败", end: tEmpty });
        failGate("未找到开局剧情正文，无法同步周围人物");
        return Promise.resolve({ ok: false });
      }
      var npTag = ST.NPC_NEARBY_TAG_OPEN || "<mj_nearby_npcs>";
      return Chat.runStateInventoryAiTurn(G0, null, storyRaw, {
        extraUserHintAppend:
          "【开局门闩】开局配置 AI 已写回主角佩戴、功法与储物袋。本回合请以周围人物为主：剧情中出现的 NPC 须在 " +
          npTag +
          " 给出完整当期列表（无 NPC 则可省略该标签）；储物袋仅在剧情明确交代得失时 add/remove，避免与开局配置重复发放。",
      }).then(function (res) {
        var t1 = new Date();
        updateBootstrapGateRow("stateSync", { end: t1 });
        if (!res || res.ok !== true) {
          updateBootstrapGateRow("stateSync", { status: "失败" });
          var em =
            res && res.error && res.error.message
              ? String(res.error.message)
              : "状态同步 AI 未成功";
          failGate(em);
          return { ok: false };
        }
        updateBootstrapGateRow("stateSync", { status: "成功" });
        return { ok: true };
      });
    }

    function runStoryPhase(skipStateAfterStory) {
      var t0 = new Date();
      updateBootstrapGateRow("openingStory", { status: "执行中…", start: t0 });
      if (!WGen || typeof WGen.runOpeningStoryStrictPromise !== "function") {
        var tBad = new Date();
        updateBootstrapGateRow("openingStory", { status: "失败", end: tBad });
        failGate("开局剧情模块缺少 runOpeningStoryStrictPromise");
        return Promise.resolve({ ok: false });
      }
      return WGen.runOpeningStoryStrictPromise(
        skipStateAfterStory ? { skipStateInventoryAfterStory: true } : {},
      )
        .then(function (sub) {
          var t1 = new Date();
          updateBootstrapGateRow("openingStory", { end: t1 });
          if (sub && sub.skipped) {
            updateBootstrapGateRow("openingStory", { status: "已跳过" });
            return { ok: true };
          }
          updateBootstrapGateRow("openingStory", { status: "成功" });
          return { ok: true };
        })
        .catch(function (err) {
          var t1 = new Date();
          updateBootstrapGateRow("openingStory", { end: t1, status: "失败" });
          failGate(err && err.message ? String(err.message) : "开局剧情或状态同步失败");
          return { ok: false };
        });
    }

    function finishBootstrapGateSuccess() {
      hideBootstrapGateUi();
      try {
        P.renderInventorySlots();
        P.renderGongfaGrid();
        P.renderLeftPanel(fc0, G0);
        P.renderBootstrapOverview(fc0);
      } catch (_p) {}
      try {
        var logEl = document.getElementById("mj-chat-log");
        if (logEl) logEl.innerHTML = "";
        if (Chat && typeof Chat.renderHistoryIntoChatLog === "function") {
          Chat.renderHistoryIntoChatLog(G0 && G0.chatHistory);
        }
      } catch (_h) {}
      try {
        if (typeof P.persistBootstrapSnapshot === "function") {
          P.persistBootstrapSnapshot();
        }
      } catch (_ps) {
        try {
          console.warn("[主界面] 门闩结束持久化失败", _ps);
        } catch (_eW) {}
      }
      try {
        if (
          global.MortalJourneyWorldBook &&
          typeof global.MortalJourneyWorldBook.syncToBridgeStorage === "function"
        ) {
          global.MortalJourneyWorldBook.syncToBridgeStorage();
        }
      } catch (_wb) {}
    }

    function execStoryOnlyPipeline() {
      var rowInit = root.querySelector('[data-mj-bootstrap-phase="initState"]');
      if (rowInit) {
        var stKeep = rowInit.querySelector("[data-mj-bootstrap-status]");
        if (stKeep) stKeep.textContent = "已成功（保留）";
      }
      var rowSt = root.querySelector('[data-mj-bootstrap-phase="stateSync"]');
      if (rowSt) {
        var sSt = rowSt.querySelector("[data-mj-bootstrap-start]");
        var eSt = rowSt.querySelector("[data-mj-bootstrap-end]");
        if (sSt) sSt.textContent = "—";
        if (eSt) eSt.textContent = "—";
        var stSt = rowSt.querySelector("[data-mj-bootstrap-status]");
        if (stSt) stSt.textContent = "等待中（剧情后内置状态 AI）";
      }
      var rowOp = root.querySelector('[data-mj-bootstrap-phase="openingStory"]');
      if (rowOp) {
        var sOp = rowOp.querySelector("[data-mj-bootstrap-start]");
        var eOp = rowOp.querySelector("[data-mj-bootstrap-end]");
        if (sOp) sOp.textContent = "—";
        if (eOp) eOp.textContent = "—";
        var stOp = rowOp.querySelector("[data-mj-bootstrap-status]");
        if (stOp) stOp.textContent = "等待中";
      }
      var erCl = root.querySelector("[data-mj-bootstrap-error]");
      if (erCl) {
        erCl.hidden = true;
        erCl.textContent = "";
      }
      var rbCl = root.querySelector("[data-mj-bootstrap-retry]");
      var bbCl = root.querySelector("[data-mj-bootstrap-back]");
      if (rbCl) rbCl.hidden = true;
      if (bbCl) bbCl.hidden = true;
      runStoryPhase(false).then(function (r2) {
        if (r2 && r2.ok) {
          if (rowSt) {
            var stFin = rowSt.querySelector("[data-mj-bootstrap-status]");
            if (stFin) stFin.textContent = "成功（剧情后内置）";
          }
          finishBootstrapGateSuccess();
        }
      });
    }

    function execFullPipeline() {
      resetBootstrapGateUi();
      runStoryPhase(true)
        .then(function (r1) {
          if (!r1 || !r1.ok) return Promise.resolve(null);
          return runInitPhase();
        })
        .then(function (r2) {
          if (!r2 || !r2.ok) return Promise.resolve(null);
          return runStateSyncPhase();
        })
        .then(function (r3) {
          if (!r3 || !r3.ok) return;
          finishBootstrapGateSuccess();
        });
    }

    showBootstrapGateUi();
    resetBootstrapGateUi();

    if (!root.dataset.mjBootstrapGateBound) {
      root.dataset.mjBootstrapGateBound = "1";
      var backEl = root.querySelector("[data-mj-bootstrap-back]");
      var retryEl = root.querySelector("[data-mj-bootstrap-retry]");
      if (backEl) {
        backEl.addEventListener("click", function () {
          window.location.href = "./index.html";
        });
      }
      if (retryEl) {
        retryEl.addEventListener("click", function () {
          var GG = global.MortalJourneyGame;
          if (!GG) return;
          if (GG.mjInitStateAiApplied === true && !chatHistoryHasUserAssistant(GG)) {
            execStoryOnlyPipeline();
          } else {
            execFullPipeline();
          }
        });
      }
    }

    execFullPipeline();
  }

  function init() {
    P.bindTraitDetailModalUi();
    P.bindGongfaBagDetailUi();
    P.bindMajorBreakthroughUi();
    P.bindNpcDetailModalUi();
    var fc = P.restoreBootstrap();
    var G = global.MortalJourneyGame;
    if (!G) {
      G = {};
      global.MortalJourneyGame = G;
    }
    P.ensureGameRuntimeDefaults(G);
    P.ensureNearbyNpcsArray(G);
    P.normalizeNearbyNpcListInPlace(G);
    var brInit = P.applyRealmBreakthroughs(G);
    P.logBreakthroughMessages(brInit.messages);
    if (brInit.changed) {
      var uiInit = P.computeCultivationUi(G, fc);
      G.cultivationProgress = uiInit.pct;
      P.persistBootstrapSnapshot();
    }

    runBootstrapAiGateOrSkip(fc, G);

    var sendBtn = document.getElementById("mj-chat-send");
    var textarea = document.getElementById("mj-chat-input");
    if (sendBtn && textarea && Chat && typeof Chat.handleChatSend === "function") {
      sendBtn.addEventListener("click", function () {
        Chat.handleChatSend(textarea, sendBtn);
      });
      textarea.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" || ev.shiftKey) return;
        ev.preventDefault();
        Chat.handleChatSend(textarea, sendBtn);
      });
    }
    var suggestionBtns = document.querySelectorAll("[data-mj-chat-suggestion-level]");
    var suggestionWrap = document.getElementById("mj-chat-suggestion-wrap");
    var suggestionToggleBtn = document.getElementById("mj-chat-suggestion-toggle");
    var suggestionToggleIcon = document.getElementById("mj-chat-suggestion-toggle-icon");
    if (suggestionWrap && suggestionToggleBtn) {
      suggestionToggleBtn.addEventListener("click", function () {
        var willExpand = suggestionWrap.hasAttribute("hidden");
        if (willExpand) {
          suggestionWrap.removeAttribute("hidden");
          suggestionToggleBtn.setAttribute("aria-expanded", "true");
          suggestionToggleBtn.setAttribute("aria-label", "收起提示选项");
          if (suggestionToggleIcon) suggestionToggleIcon.textContent = "⌄";
        } else {
          suggestionWrap.setAttribute("hidden", "");
          suggestionToggleBtn.setAttribute("aria-expanded", "false");
          suggestionToggleBtn.setAttribute("aria-label", "展开提示选项");
          if (suggestionToggleIcon) suggestionToggleIcon.textContent = "⌃";
        }
      });
    }
    if (textarea && suggestionBtns && suggestionBtns.length) {
      for (var si = 0; si < suggestionBtns.length; si++) {
        (function (btn) {
          btn.addEventListener("click", function () {
            var text = String(btn.textContent || "").replace(/\s+/g, " ").trim();
            if (!text) return;
            var current = String(textarea.value || "").trim();
            textarea.value = current ? current + "\n" + text : text;
            textarea.focus();
            try {
              textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            } catch (_esel) {}
          });
        })(suggestionBtns[si]);
      }
    }
    setChatSuggestions(G && G.chatActionSuggestions ? G.chatActionSuggestions : null);

    console.info("[主界面] 骨架已加载", G);
    if (global.GameLog && typeof global.GameLog.info === "function") {
      global.GameLog.info(
        global.GameLog.panelUiEnabled
          ? "[主界面] 已加载；左下角可展开调试日志面板。"
          : "[主界面] 已加载。",
      );
    }

    var backBtn = document.getElementById("mj-back-to-splash-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        try {
          // 离开前先持久化一次（本地存档）
          if (P && typeof P.persistBootstrapSnapshot === "function") P.persistBootstrapSnapshot();
          // 清理主界面缓存开局存档，返回后即可重新开始人生（localStorage 存档仍保留，可“读取人生”）
          if (P && P.STORAGE_KEY) sessionStorage.removeItem(P.STORAGE_KEY);
        } catch (e) {
          /* 忽略 */
        }
        window.location.href = "./index.html";
      });
    }

    // 手机端：侧栏（人物信息 / 周围人物）切换
    try {
      var openPlayerBtn = document.getElementById("mj-mobile-open-player-btn");
      var openNpcBtn = document.getElementById("mj-mobile-open-npc-btn");
      var playerPane = document.querySelector(".mj-pane--player");
      var npcPane = document.querySelector(".mj-pane--npc");
      var closePlayerBtn = document.querySelector('[data-mj-mobile-close="player"]');
      var closeNpcBtn = document.querySelector('[data-mj-mobile-close="npc"]');

      function setMobilePanel(which) {
        if (!playerPane || !npcPane) return;
        if (which === "player") {
          playerPane.classList.add("mj-mobile-open");
          npcPane.classList.remove("mj-mobile-open");
          playerPane.setAttribute("aria-hidden", "false");
          npcPane.setAttribute("aria-hidden", "true");
        } else if (which === "npc") {
          npcPane.classList.add("mj-mobile-open");
          playerPane.classList.remove("mj-mobile-open");
          npcPane.setAttribute("aria-hidden", "false");
          playerPane.setAttribute("aria-hidden", "true");
        } else {
          playerPane.classList.remove("mj-mobile-open");
          npcPane.classList.remove("mj-mobile-open");
          playerPane.setAttribute("aria-hidden", "true");
          npcPane.setAttribute("aria-hidden", "true");
        }
      }

      if (openPlayerBtn) {
        openPlayerBtn.addEventListener("click", function () {
          setMobilePanel("player");
        });
      }
      if (openNpcBtn) {
        openNpcBtn.addEventListener("click", function () {
          setMobilePanel("npc");
        });
      }
      if (closePlayerBtn) {
        closePlayerBtn.addEventListener("click", function () {
          setMobilePanel(null);
        });
      }
      if (closeNpcBtn) {
        closeNpcBtn.addEventListener("click", function () {
          setMobilePanel(null);
        });
      }

      window.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        setMobilePanel(null);
      });
    } catch (_e) {
      /* 忽略 */
    }

    // 自动保存：定时 + 刷新/关闭兜底
    try {
      if (!global.__mjAutoSaveTimer && P && typeof P.persistBootstrapSnapshot === "function") {
        global.__mjAutoSaveTimer = window.setInterval(function () {
          try {
            P.persistBootstrapSnapshot();
          } catch (_e2) {}
        }, 4000);
      }
      if (!global.__mjAutoSaveUnloadBound) {
        global.__mjAutoSaveUnloadBound = true;
        window.addEventListener("beforeunload", function () {
          try {
            if (P && typeof P.persistBootstrapSnapshot === "function") P.persistBootstrapSnapshot();
          } catch (_e3) {}
        });
      }
    } catch (_e4) {
      /* 忽略 */
    }
  }

  global.MainScreen = {
    setChatSuggestions: setChatSuggestions,
    /** 重新从 DOM 刷新左栏（在修改 MortalJourneyGame 后调用） */
    refreshLeftPanel: function () {
      var fc = global.MortalJourneyGame && global.MortalJourneyGame.fateChoice;
      P.ensureGameRuntimeDefaults(global.MortalJourneyGame);
      P.renderLeftPanel(fc, global.MortalJourneyGame);
    },
    /**
     * 周围人物列表（与 MjCharacterSheet 同构）；写入后持久化并刷新右栏
     * @param {Object[]} list
     * @returns {boolean}
     */
    setNearbyNpcs: function (list) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      if (!Array.isArray(list)) return false;
      P.ensureGameRuntimeDefaults(G);
      var MCS = global.MjCharacterSheet;
      var PBR = global.PlayerBaseRuntime;
      var out = [];
      if (MCS && typeof MCS.normalize === "function") {
        for (var si = 0; si < list.length; si++) {
          var nn = MCS.normalize(list[si]);
          if (PBR && typeof PBR.applyComputedPlayerBaseToCharacterSheet === "function") {
            PBR.applyComputedPlayerBaseToCharacterSheet(nn);
          }
          P.syncNpcShouyuanFromRealmState(nn);
          out.push(nn);
        }
      } else {
        out = list.slice();
      }
      if (P && typeof P.mergeNearbyNpcListInPlace === "function") {
        P.mergeNearbyNpcListInPlace(G, out);
      } else {
        G.nearbyNpcs = out;
        if (P && typeof P.sortNearbyNpcsForDisplay === "function") P.sortNearbyNpcsForDisplay(G);
      }
      P.persistBootstrapSnapshot();
      P.renderNearbyNpcsPanel(G);
      return true;
    },
    /** @returns {Object[]} 深拷贝 */
    getNearbyNpcs: function () {
      var G = global.MortalJourneyGame;
      if (!G) return [];
      P.ensureGameRuntimeDefaults(G);
      try {
        return JSON.parse(JSON.stringify(G.nearbyNpcs || []));
      } catch (e) {
        return [];
      }
    },
    /** 仅重绘右栏「周围人物」（不改数据） */
    refreshNearbyNpcsPanel: function () {
      var G = global.MortalJourneyGame;
      if (!G) return;
      P.ensureGameRuntimeDefaults(G);
      P.renderNearbyNpcsPanel(G);
    },
    /**
     * 右栏顶条「当前地点」；开局默认来自命运抉择 birthLocation，剧情可改写。
     * @param {string|null|undefined} label 传空字符串则回退显示 fateChoice.birthLocation
     * @returns {boolean}
     */
    setCurrentLocation: function (label) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      P.ensureGameRuntimeDefaults(G);
      if (label == null || String(label).trim() === "") {
        G.currentLocation = "";
      } else {
        G.currentLocation = String(label).trim();
      }
      P.renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /** 佩戴栏槽位数（固定 3） */
    EQUIP_SLOT_COUNT: P.EQUIP_SLOT_COUNT,
    /**
     * 设置佩戴槽 item 为 { name, desc?, equipType? } 或 null；index 0 武器 1 法器 2 防具
     * @returns {boolean}
     */
    setEquippedSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      P.ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= P.EQUIP_SLOT_COUNT) return false;
      G.equippedSlots[i] = item == null ? null : item;
      P.renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /** @returns {Array} 三槽快照（元素为 null 或 { name, desc? }） */
    getEquippedSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) return [null, null, null];
      P.ensureEquippedSlots(G);
      return G.equippedSlots.slice();
    },
    /** 功法栏格数（3×4，固定 12） */
    GONGFA_SLOT_COUNT: P.GONGFA_SLOT_COUNT,
    /**
     * 设置功法格 item 为 { name, desc?, type? } 或 null；index 0～11
     * @returns {boolean}
     */
    setGongfaSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      P.ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= P.GONGFA_SLOT_COUNT) return false;
      G.gongfaSlots[i] = item == null ? null : item;
      P.renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /** @returns {Array} 12 格快照（元素为 null 或 { name, desc?, type? }） */
    getGongfaSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) {
        var empty = [];
        for (var e = 0; e < P.GONGFA_SLOT_COUNT; e++) empty.push(null);
        return empty;
      }
      P.ensureGongfaSlots(G);
      return G.gongfaSlots.slice();
    },
    /**
     * 储物袋一格装入功法栏（首个空位，消耗 1 本）；栏满或物品不在功法配置表中则 false
     * @returns {boolean}
     */
    equipGongfaFromBag: function (bagIndex) {
      return P.performEquipGongfaFromBag(bagIndex);
    },
    /** 功法栏一格（0～11）卸下至储物袋；袋满 false */
    unequipGongfaToBag: function (gongfaSlotIndex) {
      return P.performUnequipGongfaToBag(gongfaSlotIndex);
    },
    /** 储物袋最少 12 格，可扩行；每行 INVENTORY_GRID_COLS 格 */
    INVENTORY_SLOT_COUNT: P.INVENTORY_SLOT_COUNT,
    INVENTORY_GRID_COLS: P.INVENTORY_GRID_COLS,
    /**
     * 将背包内所有「下品灵石」「灵石」堆叠清空后，在首个空位放入指定数量下品灵石（与 LINGSHI_STACK_ITEM_NAME 一致）。
     * @returns {boolean}
     */
    setLingShiCount: function (n) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      P.ensureGameRuntimeDefaults(G);
      var c = Math.max(0, Math.floor(Number(n) || 0));
      var C = global.MjCreationConfig;
      var stoneName =
        C && C.LINGSHI_STACK_ITEM_NAME ? String(C.LINGSHI_STACK_ITEM_NAME) : "下品灵石";
      P.ensureInventorySlots(G);
      for (var r = 0; r < G.inventorySlots.length; r++) {
        var it = G.inventorySlots[r];
        if (it && (it.name === stoneName || it.name === "灵石")) G.inventorySlots[r] = null;
      }
      if (c === 0) {
        P.persistBootstrapSnapshot();
        P.renderBagSlots(G);
        return true;
      }
      var j = P.findFirstEmptyBagSlot(G);
      if (j < 0) return false;
      G.inventorySlots[j] = P.normalizeBagItem({ name: stoneName, count: c });
      P.persistBootstrapSnapshot();
      P.renderBagSlots(G);
      return true;
    },
    /** 背包中「下品灵石」与旧名「灵石」的数量合计 */
    getLingShiCount: function () {
      var G = global.MortalJourneyGame;
      if (!G) return 0;
      P.ensureInventorySlots(G);
      var C = global.MjCreationConfig;
      var stoneName =
        C && C.LINGSHI_STACK_ITEM_NAME ? String(C.LINGSHI_STACK_ITEM_NAME) : "下品灵石";
      var sum = 0;
      for (var i = 0; i < G.inventorySlots.length; i++) {
        var it = G.inventorySlots[i];
        if (!it || !it.name) continue;
        if (it.name === stoneName || it.name === "灵石") {
          sum += typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
        }
      }
      return sum;
    },
    /**
     * 储物袋物品格：index 从 0 起，不足时会自动扩行；item 为 { name, count?, desc? } 或 null
     * @returns {boolean}
     */
    setBagSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      P.ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0) return false;
      var cols = P.INVENTORY_GRID_COLS || 4;
      while (G.inventorySlots.length <= i) {
        for (var z = 0; z < cols; z++) {
          G.inventorySlots.push(null);
        }
      }
      G.inventorySlots[i] = item == null ? null : P.normalizeBagItem(item);
      P.persistBootstrapSnapshot();
      P.renderBagSlots(G);
      return true;
    },
    /** 当前累计修为（灵石修炼累加） */
    getXiuwei: function () {
      var G = global.MortalJourneyGame;
      if (!G) return 0;
      P.ensureGameRuntimeDefaults(G);
      return typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.max(0, Math.floor(G.xiuwei)) : 0;
    },
    /**
     * 直接设置修为（剧情用）；会刷新左栏并写入 sessionStorage 快照
     * @returns {boolean}
     */
    setXiuwei: function (n) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      P.ensureGameRuntimeDefaults(G);
      G.xiuwei = Math.max(0, Math.floor(Number(n) || 0));
      var br = P.applyRealmBreakthroughs(G);
      P.clampXiuweiToLateStageCapIfNeeded(G, G.fateChoice);
      P.logBreakthroughMessages(br.messages);
      var ui = P.computeCultivationUi(G, G.fateChoice);
      G.cultivationProgress = ui.pct;
      P.persistBootstrapSnapshot();
      P.renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /**
     * 在修为已满条时再次尝试突破：仅处理小境界自动晋升；大境界须点左栏「突破」在弹窗内掷骰。
     * @returns {{ changed: boolean, messages: string[] }}
     */
    applyRealmBreakthroughsNow: function () {
      var G = global.MortalJourneyGame;
      if (!G) return { changed: false, messages: [] };
      P.ensureGameRuntimeDefaults(G);
      var out = P.applyRealmBreakthroughs(G);
      P.logBreakthroughMessages(out.messages);
      if (out.changed) {
        var ui = P.computeCultivationUi(G, G.fateChoice);
        G.cultivationProgress = ui.pct;
        P.persistBootstrapSnapshot();
        P.renderLeftPanel(G.fateChoice, G);
      }
      return out;
    },
    /**
     * 消耗背包一格灵石类物品增加修为：总修为 = round(表列 value × 灵根系数 × 件数)，非「round(单件)×件数」
     * @param {number} bagIndex 储物袋格索引
     * @param {boolean} [consumeAll] 与 pieceCount 二选一：true 为整堆
     * @param {number} [pieceCount] 指定件数：四舍五入，超过堆叠则按堆叠上限；≤0 不执行
     * @returns {boolean}
     */
    absorbSpiritStonesFromBag: function (bagIndex, consumeAll, pieceCount) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      if (typeof pieceCount === "number" && isFinite(pieceCount)) {
        return P.performAbsorbSpiritStonesFromBag(G, bagIndex, false, pieceCount);
      }
      return P.performAbsorbSpiritStonesFromBag(G, bagIndex, !!consumeAll);
    },
    /** @returns {Array} 储物袋全部格：{ name, count, desc? } 或 null（至少 12） */
    getBagSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) {
        var emp = [];
        for (var b = 0; b < P.INVENTORY_SLOT_COUNT; b++) emp.push(null);
        return emp;
      }
      P.ensureInventorySlots(G);
      return G.inventorySlots.map(function (x) {
        if (!x) return null;
        var o = { name: x.name, count: x.count, desc: x.desc };
        if (x.equipType) o.equipType = x.equipType;
        if (x.grade) o.grade = x.grade;
        if (typeof x.value === "number" && isFinite(x.value)) o.value = x.value;
        if (x.type) o.type = x.type;
        if (x.bonus && typeof x.bonus === "object") o.bonus = Object.assign({}, x.bonus);
        return o;
      });
    },
    /** 从储物袋指定格穿戴；满袋无法换下当前装备时返回 false */
    equipFromBagSlot: function (bagIndex) {
      return P.performEquipFromBag(bagIndex);
    },
    /** 卸下佩戴栏一格（0～2）到储物袋；袋满返回 false */
    unequipToBag: function (equipSlotIndex) {
      return P.performUnequipToBag(equipSlotIndex);
    },
    /**
     * 查描述表中的灵石等价数值（describe.value，与灵石/装备/功法等同刻度，非「下品灵石颗数」）
     * @param {string} itemName
     * @returns {number|null}
     */
    getDescribeReferenceValue: function (itemName) {
      var nm = String(itemName || "").trim();
      if (!nm) return null;
      var n = P.pickDescribeValueFromMetas(
        P.lookupStuffMetaByItemName(nm),
        P.lookupEquipmentMetaByItemName(nm),
        P.lookupGongfaConfigDef(nm),
      );
      return n == null ? null : Math.floor(n);
    },
    /**
     * 与详情弹窗「灵石等价价值」同格式；无效数值返回 null
     */
    formatReferenceValueUi: function (amount) {
      var x = typeof amount === "number" ? amount : Number(amount);
      return P.formatReferenceValueFromNumber(x);
    },
    DEFAULT_WORLD_TIME: P.DEFAULT_WORLD_TIME,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
