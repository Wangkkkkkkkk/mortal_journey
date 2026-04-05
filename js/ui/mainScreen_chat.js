/**
 * 主界面剧情区：聊天 UI、剧情/状态 AI 请求与状态栏反馈（依赖 MjMainScreenPanel）。
 */
(function (global) {
  "use strict";

  function mjPanel() {
    return global.MjMainScreenPanel;
  }

  function hasExplicitBattleIntent(text) {
    var s = String(text || "").trim();
    if (!s) return false;
    return /(战斗|对战|交手|开打|动手|击杀|斩杀|诛杀|袭击|讨伐|杀了|杀死|迎战|死战|先下手|除恶|拼了|杀了他|除此)/.test(s);
  }

  function triggerCombatFromBattleResult(G, battleResult, source) {
    var payload = {
      source: source != null && String(source).trim() !== "" ? String(source).trim() : "state_ai",
      triggerKind: battleResult && battleResult.triggerKind ? String(battleResult.triggerKind) : "passive",
      triggerReason: battleResult && battleResult.triggerReason ? String(battleResult.triggerReason) : "",
      allies: battleResult && Array.isArray(battleResult.allies) ? battleResult.allies : [],
      enemies: battleResult && Array.isArray(battleResult.enemies) ? battleResult.enemies : [],
      worldTimeString: G && G.worldTimeString != null ? String(G.worldTimeString) : "",
      currentLocation: G && G.currentLocation != null ? String(G.currentLocation) : "",
    };
    if (G) G.pendingBattle = payload;
    try {
      global.dispatchEvent(new CustomEvent("mj:battle-triggered", { detail: payload }));
    } catch (_e) {}
    if (global.MortalJourneyBattle && typeof global.MortalJourneyBattle.startBattle === "function") {
      try {
        global.MortalJourneyBattle.startBattle(payload);
      } catch (eStart) {
        console.warn("[主界面] 战斗触发后调用 startBattle 失败", eStart);
      }
    }
    return payload;
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

  /** 状态栏与处理记录中的分类名称（与气泡「剧情」无关） */
  var AI_KIND_STORY_LABEL = "剧情生成";
  var AI_KIND_STATE_LABEL = "状态更新";

  /** 剧情请求失败时重试用（同一条用户发言 + 当时 prior） */
  var _mjStoryRetryContext = null;
  /** 状态请求失败时重试用（上一段已成功落盘的剧情原文，含标签） */
  var _mjStateRetryStoryRaw = null;

  /**
   * 战斗结算后是否自动再走一轮「剧情 AI → 状态 AI」（无需玩家手动发话）。
   * 关闭后保持旧体验：结算只显示在聊天区，须玩家自行输入以接续。
   */
  var MJ_AUTO_STORY_AFTER_BATTLE = true;

  /** 自动接续时拼在用户消息尾部（同条消息上方已为程序给出的本场战斗结算全文） */
  var MJ_POST_BATTLE_USER_PROMPT =
    "以上为程序给出的本场战斗结算与战时上下文（若有）。请据此直接写下衔接剧情：收束现场、伤势与气氛，勿改写胜负与伤害结论；文末照常输出 NPC 战设标签与四级行动建议。";

  /**
   * 与 story_generate.buildStoryPromptBattleSection 中 pendingBattle 元信息一致，供战后用户消息内嵌。
   * @param {object} G MortalJourneyGame
   * @returns {string} 无元信息时 ""，否则 "【战时上下文】\n" + 各行
   */
  function formatPendingBattleMetaLines(G) {
    var pb = G && G.pendingBattle;
    if (!pb || typeof pb !== "object") return "";
    var meta = [];
    if (pb.triggerKind != null && String(pb.triggerKind).trim() !== "")
      meta.push("触发类型：" + String(pb.triggerKind).trim());
    if (pb.triggerReason != null && String(pb.triggerReason).trim() !== "")
      meta.push("触发说明：" + String(pb.triggerReason).trim());
    if (!meta.length) return "";
    return "【战时上下文】\n" + meta.join("\n");
  }

  function getChatComposerRefs() {
    return {
      textarea: document.getElementById("mj-chat-input"),
      sendBtn: document.getElementById("mj-chat-send"),
    };
  }

  function isTimeoutError(err) {
    var msg = err && err.message ? String(err.message) : "";
    if (/timeout_300s/i.test(msg)) return true;
    if (/超时/i.test(msg)) return true;
    if (/timeout/i.test(msg)) return true;
    if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) return true;
    return false;
  }

  /**
   * 在「你」的气泡后插入空的「剧情」占位气泡（用于剧情失败重试时 DOM 已被移除的情况）
   */
  function insertAssistantBubbleAfterUser(userRoot) {
    var log = getChatLogEl();
    if (!log) return null;
    clearChatPlaceholders();
    var wrap = document.createElement("div");
    wrap.className = "mj-chat-msg--role mj-chat-msg--assistant";
    var label = document.createElement("span");
    label.className = "mj-chat-role-label";
    label.textContent = "剧情";
    var body = document.createElement("div");
    body.textContent = "";
    wrap.appendChild(label);
    wrap.appendChild(body);
    if (userRoot && userRoot.parentNode) {
      try {
        if (log.contains(userRoot)) {
          if (userRoot.nextSibling) log.insertBefore(wrap, userRoot.nextSibling);
          else log.appendChild(wrap);
          scrollChatLog();
          return { root: wrap, body: body };
        }
      } catch (_eIns) {}
    }
    log.appendChild(wrap);
    scrollChatLog();
    return { root: wrap, body: body };
  }

  /**
   * @param {string} fullMessage
   * @param {"story"|"state"} retryKind
   */
  function appendChatErrorWithRetry(fullMessage, retryKind) {
    var log = getChatLogEl();
    if (!log) return;
    clearChatPlaceholders();
    var wrap = document.createElement("div");
    wrap.className = "mj-chat-msg--role mj-chat-msg--error mj-chat-msg--error-retryable";
    var label = document.createElement("span");
    label.className = "mj-chat-role-label";
    label.textContent = "提示";
    var body = document.createElement("div");
    body.className = "mj-chat-msg-error-body";
    body.textContent = fullMessage != null ? String(fullMessage) : "";
    var row = document.createElement("div");
    row.className = "mj-chat-msg-retry-row";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mj-chat-retry-btn";
    btn.textContent = retryKind === "state" ? "重试状态更新 AI" : "重试剧情生成 AI";
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      } catch (_erm) {}
      var refs = getChatComposerRefs();
      if (retryKind === "state") {
        retryLastStateAi(refs.textarea, refs.sendBtn, btn);
      } else {
        retryLastStoryAi(refs.textarea, refs.sendBtn, btn);
      }
    });
    row.appendChild(btn);
    wrap.appendChild(label);
    wrap.appendChild(body);
    wrap.appendChild(row);
    log.appendChild(wrap);
    scrollChatLog();
  }

  /**
   * @param {Object} opts
   */
  function runStoryAiTurn(opts) {
    var G = opts.G;
    var SC = opts.SC;
    var textarea = opts.textarea;
    var sendBtn = opts.sendBtn;
    var userText = opts.userText;
    var priorHistory = opts.priorHistory;
    var forceBattleIntent = opts.forceBattleIntent;
    var assistantBody = opts.assistantBody;
    var assistantRoot = opts.assistantRoot;
    var userHistIndex = opts.userHistIndex;
    var isRetry = !!opts.isRetry;
    var allowRollbackOnTimeout = !!opts.allowRollbackOnTimeout;
    var rollbackFn = opts.rollbackFn;
    var retryBtnEl = opts.retryButtonEl || null;
    var strictPipelineOutcome = !!opts.strictPipelineOutcome;
    var skipStateInventoryAfterStory = !!opts.skipStateInventoryAfterStory;
    var suppressUserInChatLog = !!opts.suppressUserInChatLog;

    _mjStateRetryStoryRaw = null;
    _mjStoryRetryContext = {
      priorHistory: priorHistory.slice(),
      userText: userText,
      userRoot: opts.userRoot || null,
      assistantRoot: assistantRoot,
      assistantBody: assistantBody,
      userHistIndex: userHistIndex,
      forceBattleIntent: forceBattleIntent,
      skipStateInventoryAfterStory: skipStateInventoryAfterStory,
      suppressUserInChatLog: suppressUserInChatLog,
    };

    var useStreamChat = getBridgeUseStreamingChat();
    var feedbackGenStory = startAiReplyFeedback(textarea, false, {
      kind: AI_KIND_STORY_LABEL,
      wholeResponseWait: !useStreamChat,
    });
    var streamNotified = false;

    var messages =
      typeof SC.buildMessages === "function"
        ? SC.buildMessages({
            userText: userText,
            priorHistory: priorHistory,
            forceBattleIntent: forceBattleIntent,
          })
        : null;
    if (messages && global.GameLog && typeof global.GameLog.info === "function") {
      try {
        var human =
          typeof SC.formatMessagesForHumanLog === "function"
            ? SC.formatMessagesForHumanLog(messages)
            : "";
        var jsonStr = JSON.stringify(messages, null, 2);
        global.GameLog.info(
          "[剧情→AI] " +
            (isRetry ? "（重试）" : "") +
            "本次请求\n\n—— 易读排版 ——\n" +
            (human || jsonStr) +
            "\n\n—— 原始 JSON（可复制） ——\n" +
            jsonStr,
        );
      } catch (logErr) {
        global.GameLog.info("[剧情→AI] 用户输入（messages 无法序列化）：" + String(userText).slice(0, 800));
      }
    }

    var timeoutMs = 300000;
    var ac = null;
    try {
      ac = new AbortController();
    } catch (_eac) {
      ac = null;
    }
    var tid = null;
    if (ac) {
      tid = setTimeout(function () {
        try {
          ac.abort("timeout_300s");
        } catch (_eab) {}
      }, timeoutMs);
    }
    function clearTimeoutIfAny() {
      if (tid != null) {
        clearTimeout(tid);
        tid = null;
      }
    }

    return SC.sendTurn({
      messages: messages,
      userText: userText,
      priorHistory: priorHistory,
      shouldStream: useStreamChat,
      signal: ac ? ac.signal : undefined,
      onDelta: useStreamChat
        ? function (_delta, full) {
            if (!streamNotified) {
              streamNotified = true;
              markAiStreamStarted();
            }
            if (assistantBody) {
              var vis = full || "";
              var openTag = SC && SC.STORY_BODY_TAG_OPEN ? String(SC.STORY_BODY_TAG_OPEN) : "<mj_story_body>";
              if (vis.indexOf(openTag) >= 0) {
                if (SC && typeof SC.visibleNarrativeForStreamingChunk === "function") {
                  vis = SC.visibleNarrativeForStreamingChunk(vis);
                }
              } else {
                // 未出现正文信封前不展示（多为思考模型前置推理）；无信封的旧模型在整段完成后由 then 分支回填
                vis = "";
              }
              assistantBody.textContent = vis;
            }
            scrollChatLog();
          }
        : undefined,
    })
      .then(function (full) {
        clearTimeoutIfAny();
        var replyRaw = full != null ? String(full) : "";
        var resolved =
          SC && typeof SC.resolveStoryReplyForPipeline === "function"
            ? SC.resolveStoryReplyForPipeline(replyRaw)
            : null;
        var sansLeak = resolved && typeof resolved.sansLeak === "string" ? resolved.sansLeak : replyRaw;
        if (!resolved) {
          sansLeak =
            SC && typeof SC.stripStoryAiMetaLeakFromNarrative === "function"
              ? SC.stripStoryAiMetaLeakFromNarrative(replyRaw)
              : replyRaw;
        }
        var plotSnapFromSans =
          SC && typeof SC.extractStorySnapshotFromNarrative === "function"
            ? SC.extractStorySnapshotFromNarrative(sansLeak)
            : "";
        var plotSnapFromRaw =
          SC && typeof SC.extractStorySnapshotFromNarrative === "function"
            ? SC.extractStorySnapshotFromNarrative(replyRaw)
            : "";
        var sansForPipeline =
          SC && typeof SC.stripStorySnapshotFromNarrative === "function"
            ? SC.stripStorySnapshotFromNarrative(sansLeak)
            : sansLeak;
        if (global.GameLog && typeof global.GameLog.info === "function") {
          try {
            global.GameLog.info(
              "[剧情←AI] 返回成功" +
                (resolved && resolved.usedBodyEnvelope ? "（命中 mj_story_body 信封）" : "") +
                "\n\n—— 原始返回（raw） ——\n" +
                replyRaw.slice(0, 8000) +
                "\n\n—— 解析后正文（sansLeak） ——\n" +
                sansLeak.slice(0, 8000),
            );
          } catch (_logStoryResp) {}
        }
        var actionSuggestions =
          SC && typeof SC.extractActionSuggestionsFromNarrative === "function"
            ? SC.extractActionSuggestionsFromNarrative(sansForPipeline)
            : null;
        var hasParsedSugg =
          actionSuggestions &&
          typeof actionSuggestions === "object" &&
          ((actionSuggestions.aggressive && String(actionSuggestions.aggressive).trim()) ||
            (actionSuggestions.neutral && String(actionSuggestions.neutral).trim()) ||
            (actionSuggestions.cautious && String(actionSuggestions.cautious).trim()) ||
            (actionSuggestions.veryCautious && String(actionSuggestions.veryCautious).trim()));
        if (hasParsedSugg && G) {
          G.chatActionSuggestions = {
            aggressive: actionSuggestions.aggressive != null ? String(actionSuggestions.aggressive).trim() : "",
            neutral: actionSuggestions.neutral != null ? String(actionSuggestions.neutral).trim() : "",
            cautious: actionSuggestions.cautious != null ? String(actionSuggestions.cautious).trim() : "",
            veryCautious:
              actionSuggestions.veryCautious != null ? String(actionSuggestions.veryCautious).trim() : "",
          };
          try {
            var PChat = mjPanel();
            if (PChat && typeof PChat.persistBootstrapSnapshot === "function") PChat.persistBootstrapSnapshot();
          } catch (_pChat) {}
        }
        if (global.MainScreen && typeof global.MainScreen.setChatSuggestions === "function") {
          try {
            if (hasParsedSugg) {
              global.MainScreen.setChatSuggestions(actionSuggestions);
            } else if (G && G.chatActionSuggestions) {
              global.MainScreen.setChatSuggestions(G.chatActionSuggestions);
            } else {
              global.MainScreen.setChatSuggestions(null);
            }
          } catch (_esugg) {}
        }
        var sansSuggestionTags =
          SC && typeof SC.stripActionSuggestionsFromNarrative === "function"
            ? SC.stripActionSuggestionsFromNarrative(sansForPipeline)
            : sansForPipeline;
        var replyForChat =
          SC && typeof SC.stripNpcStoryHintsFromNarrative === "function"
            ? SC.stripNpcStoryHintsFromNarrative(sansSuggestionTags)
            : sansSuggestionTags;
        var trimmed = replyForChat.replace(/^\uFEFF/, "").trim();
        if (trimmed === "") {
          var hadStream = streamNotified;
          var emptyMsg =
            "【剧情 AI 回复为空】\n\n" +
            (!useStreamChat
              ? "当前为「非流式」整段请求，但解析后正文仍为空。可能原因：\n" +
                "· 上游 JSON 里 choices[0].message 无 content / reasoning_content\n" +
                "· 网关返回体被截断或非正常 JSON\n\n"
              : hadStream
                ? "流式连接已结束，但拼接后的正文长度为 0。可能原因：\n" +
                  "· 上游把可见文本写在非标准字段（桥接已尝试多种 delta 字段）\n" +
                  "· 内容被服务商安全策略拦截或未下发\n" +
                  "· 模型异常结束、仅返回空白 token\n\n"
                : "未收到任何文本块（可能未进入流式输出或首包即结束）。可能原因：\n" +
                  "· 代理/网关截断或返回体异常\n" +
                  "· 流式包里没有可用正文字段\n\n") +
            "建议：展开左下角日志查看「剧情→AI」请求；检查 silly_tarven/bridge-config.js 的 API、模型；可将 useStreamingChat 设为 false 使用整段模式；在浏览器控制台查看 [ST Bridge] 提示。";
          G.chatHistory.push({ role: "assistant", content: emptyMsg });
          if (assistantBody) assistantBody.textContent = emptyMsg;
          if (assistantRoot) {
            assistantRoot.classList.add("mj-chat-msg--assistant-empty");
            var rlab = assistantRoot.querySelector(".mj-chat-role-label");
            if (rlab) rlab.textContent = "剧情（无内容）";
          }
          scrollChatLog();
          finishAiReplyFeedback(
            feedbackGenStory,
            textarea,
            "error",
            "剧情 AI 返回空正文",
            { kind: AI_KIND_STORY_LABEL },
          );
          if (global.GameLog && typeof global.GameLog.info === "function") {
            global.GameLog.info(
              "[剧情←AI] 空回复：hadStream=" +
                String(hadStream) +
                "，raw 字符串长度=" +
                String(replyForChat.length) +
                "。",
            );
          }
          appendChatErrorWithRetry(
            "剧情 AI 返回空正文。无需重写输入框，点击下方按钮可用同一条发言再次请求剧情生成。",
            "story",
          );
          if (retryBtnEl) retryBtnEl.disabled = false;
          if (strictPipelineOutcome) {
            return Promise.reject(new Error("剧情 AI 返回空正文"));
          }
          return Promise.resolve();
        }
        if (assistantRoot) assistantRoot.classList.remove("mj-chat-msg--assistant-empty");
        if (isRetry && Array.isArray(G.chatHistory)) {
          var keepHistLen = suppressUserInChatLog ? userHistIndex : userHistIndex + 1;
          while (G.chatHistory.length > keepHistLen) {
            var rm = G.chatHistory.pop();
            if (
              rm &&
              rm.role === "assistant" &&
              Array.isArray(G.chatPlotSnapshotLog) &&
              G.chatPlotSnapshotLog.length
            ) {
              G.chatPlotSnapshotLog.pop();
            }
          }
          if (Array.isArray(G.chatPlotSnapshotLog) && G.chatPlotSnapshotLog.length) {
            G.chatPlotSnapshot = G.chatPlotSnapshotLog[G.chatPlotSnapshotLog.length - 1];
          } else {
            G.chatPlotSnapshot = "";
          }
        }
        G.chatHistory.push({ role: "assistant", content: replyForChat });
        if (assistantBody) assistantBody.textContent = replyForChat;
        scrollChatLog();
        var snapFinal =
          (plotSnapFromSans && String(plotSnapFromSans).trim()) ||
          (plotSnapFromRaw && String(plotSnapFromRaw).trim()) ||
          "";
        if (!snapFinal && SC && typeof SC.synthesizePlotSnapshotFromVisibleNarrative === "function") {
          snapFinal = SC.synthesizePlotSnapshotFromVisibleNarrative(replyForChat) || "";
        }
        if (snapFinal && G) {
          G.chatPlotSnapshot = snapFinal;
          if (!Array.isArray(G.chatPlotSnapshotLog)) G.chatPlotSnapshotLog = [];
          var snapOne = String(snapFinal).trim();
          if (
            snapOne &&
            (!G.chatPlotSnapshotLog.length || G.chatPlotSnapshotLog[G.chatPlotSnapshotLog.length - 1] !== snapOne)
          ) {
            G.chatPlotSnapshotLog.push(snapOne);
            while (G.chatPlotSnapshotLog.length > 24) {
              G.chatPlotSnapshotLog.shift();
            }
          }
          try {
            var PFin = mjPanel();
            if (PFin && typeof PFin.persistBootstrapSnapshot === "function") PFin.persistBootstrapSnapshot();
          } catch (_pFin) {}
        }
        try {
          G.storyBattleContextConsumed = true;
        } catch (_consume) {}
        _mjStoryRetryContext = null;
        finishAiReplyFeedback(feedbackGenStory, textarea, "done", undefined, { kind: AI_KIND_STORY_LABEL });
        if (retryBtnEl) retryBtnEl.disabled = false;
        if (skipStateInventoryAfterStory) {
          return Promise.resolve();
        }
        return runStateInventoryAiTurn(G, textarea, sansForPipeline).then(function (stateRes) {
          if (!stateRes || stateRes.ok !== true) {
            var er = new Error(
              stateRes && stateRes.error && stateRes.error.message
                ? String(stateRes.error.message)
                : "状态 AI 未成功同步",
            );
            er.__mjFromStateAi = true;
            return Promise.reject(er);
          }
        });
      })
      .catch(function (err) {
        clearTimeoutIfAny();
        if (err && err.__mjFromStateAi) {
          if (retryBtnEl) retryBtnEl.disabled = false;
          return Promise.reject(err);
        }
        if (isTimeoutError(err)) {
          if (allowRollbackOnTimeout && typeof rollbackFn === "function") {
            finishAiReplyFeedback(feedbackGenStory, textarea, "error", "请求超时（300 秒）", {
              kind: AI_KIND_STORY_LABEL,
            });
            rollbackFn();
            _mjStoryRetryContext = null;
            if (strictPipelineOutcome) {
              return Promise.reject(err || new Error("剧情 AI 请求超时"));
            }
          } else {
            finishAiReplyFeedback(feedbackGenStory, textarea, "error", "请求超时（300 秒）", {
              kind: AI_KIND_STORY_LABEL,
            });
            appendChatErrorWithRetry("剧情 AI：请求超时（300 秒）。可点击下方按钮重试，无需重新打字。", "story");
            if (strictPipelineOutcome) {
              return Promise.reject(err || new Error("剧情 AI 请求超时"));
            }
          }
          if (retryBtnEl) retryBtnEl.disabled = false;
          return undefined;
        }
        if (
          assistantBody &&
          !String(assistantBody.textContent || "").trim() &&
          assistantRoot &&
          assistantRoot.parentNode
        ) {
          assistantRoot.parentNode.removeChild(assistantRoot);
          _mjStoryRetryContext.assistantRoot = null;
          _mjStoryRetryContext.assistantBody = null;
        }
        var msg =
          err && err.message
            ? String(err.message)
            : "请求失败。若未配置 API，请检查 silly_tarven/bridge-config.js 中的 fixedPreset。";
        finishAiReplyFeedback(feedbackGenStory, textarea, "error", msg, { kind: AI_KIND_STORY_LABEL });
        appendChatErrorWithRetry("剧情 AI：" + msg, "story");
        console.warn("[主界面] 剧情请求失败", err);
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[主界面] 剧情请求失败：" + msg.slice(0, 300));
        }
        if (retryBtnEl) retryBtnEl.disabled = false;
        if (strictPipelineOutcome) {
          return Promise.reject(err || new Error("剧情 AI 请求失败"));
        }
      })
      .then(
        function () {
          clearTimeoutIfAny();
          if (sendBtn) sendBtn.disabled = false;
          if (textarea) textarea.disabled = false;
        },
        function () {
          clearTimeoutIfAny();
          if (sendBtn) sendBtn.disabled = false;
          if (textarea) textarea.disabled = false;
        },
      );
  }

  function retryLastStoryAi(textarea, sendBtn, clickedBtn) {
    var ctx = _mjStoryRetryContext;
    var G = global.MortalJourneyGame;
    var SC = global.MortalJourneyStoryChat;
    if (!ctx || !G || !SC || typeof SC.sendTurn !== "function") {
      if (clickedBtn) clickedBtn.disabled = false;
      flashChatStatusError("没有可重试的剧情请求，请直接在输入框发送一条新消息。");
      return;
    }
    textarea = textarea || getChatComposerRefs().textarea;
    sendBtn = sendBtn || getChatComposerRefs().sendBtn;
    if (sendBtn) sendBtn.disabled = true;
    if (textarea) textarea.disabled = true;
    var assistantRoot = ctx.assistantRoot;
    var assistantBody = ctx.assistantBody;
    if (!assistantRoot || !assistantRoot.parentNode || !assistantBody) {
      var ins = insertAssistantBubbleAfterUser(ctx.userRoot);
      if (ins) {
        assistantRoot = ins.root;
        assistantBody = ins.body;
        ctx.assistantRoot = assistantRoot;
        ctx.assistantBody = assistantBody;
      }
    }
    if (assistantBody) assistantBody.textContent = "";
    if (assistantRoot) assistantRoot.classList.remove("mj-chat-msg--assistant-empty");
    var rlab2 = assistantRoot && assistantRoot.querySelector(".mj-chat-role-label");
    if (rlab2) rlab2.textContent = "剧情";

    runStoryAiTurn({
      G: G,
      SC: SC,
      textarea: textarea,
      sendBtn: sendBtn,
      userText: ctx.userText,
      priorHistory: ctx.priorHistory,
      forceBattleIntent: ctx.forceBattleIntent,
      assistantBody: ctx.assistantBody,
      assistantRoot: ctx.assistantRoot,
      userRoot: ctx.userRoot,
      userHistIndex: ctx.userHistIndex,
      isRetry: true,
      allowRollbackOnTimeout: false,
      rollbackFn: null,
      retryButtonEl: clickedBtn || null,
      skipStateInventoryAfterStory: !!ctx.skipStateInventoryAfterStory,
      suppressUserInChatLog: !!ctx.suppressUserInChatLog,
    });
  }

  function retryLastStateAi(textarea, sendBtn, clickedBtn) {
    var raw = _mjStateRetryStoryRaw;
    var G = global.MortalJourneyGame;
    if (raw == null || raw === "" || !G) {
      if (clickedBtn) clickedBtn.disabled = false;
      flashChatStatusError("没有可重试的状态更新：需要已成功生成剧情但状态 AI 未同步成功。");
      return;
    }
    textarea = textarea || getChatComposerRefs().textarea;
    sendBtn = sendBtn || getChatComposerRefs().sendBtn;
    if (sendBtn) sendBtn.disabled = true;
    if (textarea) textarea.disabled = true;
    var p = runStateInventoryAiTurn(G, textarea, raw);
    if (p && typeof p.finally === "function") {
      p.finally(function () {
        if (clickedBtn) clickedBtn.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        if (textarea) textarea.disabled = false;
      });
    } else {
      if (clickedBtn) clickedBtn.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      if (textarea) textarea.disabled = false;
    }
  }

  function padAiLog2(n) {
    var x = Math.floor(Number(n));
    if (!isFinite(x)) return "00";
    return x < 10 ? "0" + x : String(x);
  }

  function formatAiProcessLogTimestamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      "/" +
      padAiLog2(d.getMonth() + 1) +
      "/" +
      padAiLog2(d.getDate()) +
      " " +
      padAiLog2(d.getHours()) +
      ":" +
      padAiLog2(d.getMinutes()) +
      ":" +
      padAiLog2(d.getSeconds())
    );
  }

  /**
   * 仅保留两槽：最新「剧情生成」、最新「状态更新」。
   * @param {"story"|"state"} slot
   * @param {string} displayKind 展示用「剧情生成」或「状态更新」
   * @param {"done"|"error"} outcome
   * @param {string} totalSecStr
   * @param {string} [errShort]
   */
  function updateAiProcessLogRow(slot, displayKind, outcome, totalSecStr, errShort) {
    var id = slot === "story" ? "mj-ai-process-log-story" : "mj-ai-process-log-state";
    var line = document.getElementById(id);
    if (!line) return;
    var dk = displayKind != null && String(displayKind).trim() !== "" ? String(displayKind).trim() : "AI";
    var parts = ["[" + formatAiProcessLogTimestamp() + "]", "「" + dk + "」"];
    if (outcome === "done") {
      parts.push("完成");
      parts.push(totalSecStr + " 秒");
    } else {
      parts.push("失败");
      parts.push(totalSecStr + " 秒");
      if (errShort && String(errShort).trim()) parts.push(String(errShort).trim());
    }
    line.textContent = parts.join(" · ");
    line.title = line.textContent;
    line.className =
      "mj-ai-process-log__line mj-ai-process-log__line--" + (outcome === "done" ? "done" : "error");
    line.removeAttribute("hidden");
  }

  function syncAiProcessLogFromFeedback(kind, outcome, total, errShort) {
    if (kind === AI_KIND_STORY_LABEL) {
      updateAiProcessLogRow("story", AI_KIND_STORY_LABEL, outcome, total, errShort);
    } else if (kind === AI_KIND_STATE_LABEL) {
      updateAiProcessLogRow("state", AI_KIND_STATE_LABEL, outcome, total, errShort);
    }
  }

  /** 与 silly_tarven/bridge-config.js 中 useStreamingChat 一致；未定义时默认 false（非流式一次性显示） */
  function getBridgeUseStreamingChat() {
    var C = global.SillyTavernBridgeConfig;
    if (C && typeof C.useStreamingChat === "boolean") return C.useStreamingChat;
    return false;
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
   * @param {{ kind?: string, wholeResponseWait?: boolean }} [feedbackOpts] wholeResponseWait：非流式时提示「整段生成」
   */
  function startAiReplyFeedback(textarea, streamingStarted, feedbackOpts) {
    var fo = feedbackOpts || {};
    var kind = fo.kind != null && String(fo.kind).trim() !== "" ? String(fo.kind).trim() : "AI";
    var gen = ++_chatFeedbackGen;
    clearChatStatusTick();
    _chatStatusStart = Date.now();
    _chatStatusStream = !!streamingStarted;
    if (textarea) textarea.disabled = true;

    function tickText() {
      var sec = formatElapsedSec(_chatStatusStart);
      if (_chatStatusStream) return "正在接收「" + kind + "」回复… 已 " + sec + " 秒";
      if (fo.wholeResponseWait) {
        return "等待「" + kind + "」 已 " + sec + " 秒";
      }
      return "等待「" + kind + "」回复中… 已等待 " + sec + " 秒";
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
   * @param {{ kind?: string }} [feedbackOpts]
   */
  function finishAiReplyFeedback(gen, textarea, outcome, errDetail, feedbackOpts) {
    if (gen !== _chatFeedbackGen) return;
    clearChatStatusTick();
    var total = formatElapsedSec(_chatStatusStart);
    var fo = feedbackOpts || {};
    var kind = fo.kind != null && String(fo.kind).trim() !== "" ? String(fo.kind).trim() : "AI";

    if (outcome === "done") {
      syncAiProcessLogFromFeedback(kind, "done", total, null);
      setChatStatusUi("idle", "");
      return;
    }

    var errShort =
      errDetail && String(errDetail).trim()
        ? String(errDetail).trim().slice(0, 160)
        : "未知错误";
    syncAiProcessLogFromFeedback(kind, "error", total, errShort);
    setChatStatusUi("idle", "");
  }

  function flashChatStatusError(message) {
    _chatFeedbackGen++;
    clearChatStatusTick();
    var gen = _chatFeedbackGen;
    var msg = String(message || "");
    setChatStatusUi("error", msg);
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

  /**
   * @param {{ victor?: string, rounds?: number, allies?: Array, enemies?: Array }} settlement
   */
  function formatBattleSettlementText(settlement) {
    if (!settlement || typeof settlement !== "object") return "";
    var vic =
      settlement.victor === "ally"
        ? "主角方胜利"
        : settlement.victor === "enemy"
          ? "主角方撤退（未胜）"
          : settlement.victor != null && String(settlement.victor).trim() !== ""
            ? String(settlement.victor)
            : "结束";
    var rounds = typeof settlement.rounds === "number" && isFinite(settlement.rounds) ? Math.max(0, Math.floor(settlement.rounds)) : 0;
    var lines = [];
    lines.push("【战斗结算】" + vic + " · 共 " + rounds + " 轮");
    lines.push("");
    var allies = Array.isArray(settlement.allies) ? settlement.allies : [];
    var enemies = Array.isArray(settlement.enemies) ? settlement.enemies : [];
    if (allies.length) {
      lines.push("— 我方 —");
      for (var i = 0; i < allies.length; i++) {
        var a = allies[i];
        if (!a) continue;
        var who =
          (a.displayName != null ? String(a.displayName) : "未命名") +
          "（" +
          (a.isProtagonist ? "主角" : "队友") +
          "）";
        lines.push(who);
        lines.push(
          "  造成：法攻伤害 " +
            (a.dealtFa | 0) +
            "　物攻伤害 " +
            (a.dealtWu | 0),
        );
        lines.push(
          "  承受：法攻伤害 " +
            (a.takenFa | 0) +
            "　物攻伤害 " +
            (a.takenWu | 0),
        );
      }
      lines.push("");
    }
    if (enemies.length) {
      lines.push("— 敌方 —");
      for (var j = 0; j < enemies.length; j++) {
        var e = enemies[j];
        if (!e) continue;
        var enName = e.displayName != null ? String(e.displayName) : "未命名";
        lines.push(enName);
        lines.push(
          "  造成：法攻伤害 " +
            (e.dealtFa | 0) +
            "　物攻伤害 " +
            (e.dealtWu | 0),
        );
        lines.push(
          "  承受：法攻伤害 " +
            (e.takenFa | 0) +
            "　物攻伤害 " +
            (e.takenWu | 0),
        );
      }
    }
    return lines.join("\n").trim();
  }

  function formatEquipTypeLabelForLoot(ty) {
    var raw = ty != null ? String(ty).trim() : "";
    if (!raw) return "";
    var P = mjPanel();
    if (P && typeof P.formatEquipTypeLabel === "function") return String(P.formatEquipTypeLabel(raw)).trim() || raw;
    return raw === "副武器" ? "法器" : raw;
  }

  /**
   * @param {{ equipment?: Array<{ name: string, equipType?: string }>, gongfa?: Array<{ name: string }> }} battleLoot
   */
  function formatBattleLootText(battleLoot) {
    if (!battleLoot || typeof battleLoot !== "object") return "";
    var eqRaw = Array.isArray(battleLoot.equipment) ? battleLoot.equipment : [];
    var gfRaw = Array.isArray(battleLoot.gongfa) ? battleLoot.gongfa : [];
    if (!eqRaw.length && !gfRaw.length) return "";
    var eqAgg = {};
    var i;
    for (i = 0; i < eqRaw.length; i++) {
      var e = eqRaw[i];
      if (!e || !e.name) continue;
      var enm = String(e.name).trim();
      if (!enm) continue;
      var ety = e.equipType != null ? String(e.equipType).trim() : "";
      var k = enm + "\0" + ety;
      eqAgg[k] = (eqAgg[k] || 0) + 1;
    }
    var gfAgg = {};
    for (i = 0; i < gfRaw.length; i++) {
      var g = gfRaw[i];
      if (!g || !g.name) continue;
      var gn = String(g.name).trim();
      if (!gn) continue;
      gfAgg[gn] = (gfAgg[gn] || 0) + 1;
    }
    var lines = [];
    lines.push("【战利品】已入储物袋");
    lines.push("");
    var ek = Object.keys(eqAgg);
    if (ek.length) {
      lines.push("— 装备（武器 / 法器 / 防具 / 载具）—");
      ek.sort();
      for (i = 0; i < ek.length; i++) {
        var parts = ek[i].split("\0");
        var nm = parts[0];
        var et = parts[1] || "";
        var cnt = eqAgg[ek[i]];
        var slotLab = formatEquipTypeLabelForLoot(et);
        var line = "· " + nm + (slotLab ? "（" + slotLab + "）" : "");
        if (cnt > 1) line += " ×" + cnt;
        lines.push(line);
      }
      lines.push("");
    }
    var gk = Object.keys(gfAgg);
    if (gk.length) {
      lines.push("— 功法 —");
      gk.sort();
      for (i = 0; i < gk.length; i++) {
        var gnm = gk[i];
        var gc = gfAgg[gnm];
        lines.push("· " + gnm + (gc > 1 ? " ×" + gc : ""));
      }
    }
    return lines.join("\n").trim();
  }

  function persistChatHistoryAfterBattleChunk() {
    var G = global.MortalJourneyGame;
    var P = mjPanel();
    if (G && P && typeof P.persistBootstrapSnapshot === "function") {
      try {
        P.persistBootstrapSnapshot();
      } catch (_eP) {}
    }
  }

  /** 仅渲染战利品 DOM（读档回放与战后事件共用） */
  function appendBattleLootDom(text) {
    var t = text != null ? String(text).trim() : "";
    if (!t) return;
    var log = getChatLogEl();
    if (!log) return;
    clearChatPlaceholders();
    var wrap = document.createElement("div");
    wrap.className = "mj-chat-msg--role mj-chat-msg--battle-loot";
    var label = document.createElement("span");
    label.className = "mj-chat-role-label";
    label.textContent = "战利品";
    var body = document.createElement("div");
    body.textContent = t;
    wrap.appendChild(label);
    wrap.appendChild(body);
    log.appendChild(wrap);
    scrollChatLog();
  }

  /** 仅渲染战斗结算 DOM（不写 chatHistory；读档回放与战后事件共用） */
  function appendBattleSettlementDom(text) {
    var t = text != null ? String(text).trim() : "";
    if (!t) return;
    var log = getChatLogEl();
    if (!log) return;
    clearChatPlaceholders();
    var wrap = document.createElement("div");
    wrap.className = "mj-chat-msg--role mj-chat-msg--battle-settlement";
    var label = document.createElement("span");
    label.className = "mj-chat-role-label";
    label.textContent = "战斗结算";
    var body = document.createElement("div");
    body.textContent = t;
    wrap.appendChild(label);
    wrap.appendChild(body);
    log.appendChild(wrap);
    scrollChatLog();
  }

  /** 战斗结束后在聊天区插入结算框（监听 mj:battle-finished） */
  function appendBattleSettlementFromDetail(detail) {
    var s = detail && detail.settlement;
    if (!s || typeof s !== "object") return;
    var text = formatBattleSettlementText(s);
    if (!text) return;
    var G = global.MortalJourneyGame;
    if (G && Array.isArray(G.chatHistory)) {
      G.chatHistory.push({ role: "battle_settlement", content: text });
      try {
        G.storyBattleContextConsumed = true;
      } catch (_c0) {}
      persistChatHistoryAfterBattleChunk();
    }
    appendBattleSettlementDom(text);
    if (detail && detail.victor === "ally") {
      var lootText = formatBattleLootText(detail.battleLoot);
      if (lootText && G && Array.isArray(G.chatHistory)) {
        G.chatHistory.push({ role: "battle_loot", content: lootText });
        persistChatHistoryAfterBattleChunk();
      }
      if (lootText) appendBattleLootDom(lootText);
    }
  }

  /**
   * 剧情 AI 成功后：请求状态 AI（储物袋等），状态栏计时与剧情一致。
   * @param {Object} [opts]
   * @param {string} [opts.extraUserHintAppend] 追加到默认 extraUserHint（如开局门闩第三步）
   * @returns {Promise<{ok:boolean, error?: Error}>}
   */
  function runStateInventoryAiTurn(G, textarea, storyReply, opts) {
    var opt = opts && typeof opts === "object" ? opts : {};
    var hintAppend =
      opt.extraUserHintAppend != null && String(opt.extraUserHintAppend).trim() !== ""
        ? String(opt.extraUserHintAppend).trim()
        : "";
    var ST = global.MortalJourneyStateGenerate;
    if (
      !ST ||
      typeof ST.sendTurn !== "function" ||
      typeof ST.buildMessages !== "function" ||
      typeof ST.applyStateTurnFromAssistantText !== "function"
    ) {
      if (global.GameLog && typeof global.GameLog.warn === "function") {
        global.GameLog.warn("[主界面] MortalJourneyStateGenerate 未加载或不完整，跳过状态同步。");
      }
      return Promise.resolve({ ok: false, error: new Error("MortalJourneyStateGenerate 未加载或不完整") });
    }
    var reply = storyReply != null ? String(storyReply) : "";
    _mjStateRetryStoryRaw = reply;
    var useStreamState = getBridgeUseStreamingChat();
    var feedbackGenState = startAiReplyFeedback(textarea, false, {
      kind: AI_KIND_STATE_LABEL,
      wholeResponseWait: !useStreamState,
    });
    var streamStateNotified = false;
    var baseExtraHint =
      "以上正文为刚生成的剧情段落（含文末机器标签时请一并阅读）。请根据剧情：①同步储物袋（add/remove；无变化则 []）②在 " +
      (ST.WORLD_STATE_TAG_OPEN || "<mj_world_state>") +
      " 中写回 worldTimeString 与 currentLocation（时间只可不变或往后，禁止早于快照）③若有新出场人物或周围人物列表变化，输出 " +
      (ST.NPC_NEARBY_TAG_OPEN || "<mj_nearby_npcs>") +
      " 完整 JSON 数组（无变更则省略该标签）；功法/装备名尽量与 user 可引用表一致；每条 NPC 的 displayName 须为明确姓名/称呼且与 " +
      (global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_OPEN
        ? global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_OPEN
        : "<mj_npc_story_hints>") +
      " 中一致，禁止留空。④若剧情已明确进入即时战斗：在全文末（上述标签之后亦可）输出 " +
      (global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_OPEN
        ? global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_OPEN
        : "<mj_battle_trigger>") +
      "…" +
      (global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_CLOSE
        ? global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_CLOSE
        : "</mj_battle_trigger>") +
      "，JSON 内 allies/enemies 的 displayName 必须与 user 快照中主角名及周边人物完全一致。**首接敌/对峙延续**：妖兽或敌修冲阵在途、双方**尚未碰招受击**，或正文末**无**合法战备段，或 user **未**明示开战——须 **shouldEnterBattle=false** 或省略第四对，先让玩家从第三对见敌方强弱。**仅当**叙事已写双方**已交手**落实，或（剧情末战备段 +（user 本回合已明确开战**或**叙事已写碰招/受击））等满足状态 system 第 13.1 条时，才 shouldEnterBattle=true。详见第 13 条。" +
      (hintAppend ? "\n\n" + hintAppend : "");
    var stateMsgs = ST.buildMessages({
      storyText: reply,
      extraUserHint: baseExtraHint,
      game: G,
    });
    if (stateMsgs && global.GameLog && typeof global.GameLog.info === "function") {
      try {
        global.GameLog.info(
          "[状态→AI] 本次请求\n\n—— 原始 JSON ——\n" + JSON.stringify(stateMsgs, null, 2),
        );
      } catch (logSt0) {
        global.GameLog.info("[状态→AI] 请求已发起（messages 无法序列化）");
      }
    }
    var timeoutMs = 300000;
    var ac = null;
    try {
      ac = new AbortController();
    } catch (_eac) {
      ac = null;
    }
    var tid = null;
    if (ac) {
      tid = setTimeout(function () {
        try {
          ac.abort("timeout_300s");
        } catch (_eab) {}
      }, timeoutMs);
    }
    function clearTimeoutIfAny() {
      if (tid != null) {
        clearTimeout(tid);
        tid = null;
      }
    }

    return ST.sendTurn({
      messages: stateMsgs,
      shouldStream: useStreamState,
      signal: ac ? ac.signal : undefined,
      onDelta: useStreamState
        ? function () {
            if (!streamStateNotified) {
              streamStateNotified = true;
              markAiStreamStarted();
            }
          }
        : undefined,
    })
      .then(function (stateFull) {
        clearTimeoutIfAny();
        _mjStateRetryStoryRaw = null;
        var raw = stateFull != null ? String(stateFull) : "";
        var app = ST.applyStateTurnFromAssistantText(G, raw);
        var P = mjPanel();
        P.ensureGameRuntimeDefaults(G);
        P.persistBootstrapSnapshot();
        P.renderLeftPanel(G.fateChoice, G);
        finishAiReplyFeedback(feedbackGenState, textarea, "done", undefined, { kind: AI_KIND_STATE_LABEL });
        if (global.GameLog && typeof global.GameLog.info === "function") {
          var parts = ["[状态←AI] 完成"];
          if (app.parseError) parts.push("储物袋解析：" + app.parseError);
          else {
            if (app.parseVia) parts.push("储物袋途径：" + app.parseVia);
            var pn = (app.placed && app.placed.length) || 0;
            var rn = (app.removed && app.removed.length) || 0;
            parts.push("已应用 放入 " + pn + " 条、扣除 " + rn + " 条");
            if (app.failed && app.failed.length) parts.push("失败 " + app.failed.length + " 条");
          }
          var W = app.world;
          if (W) {
            if (W.parseError) parts.push("世界状态解析：" + W.parseError);
            else {
              if (W.rejectedWorldTime) parts.push("世界时间未采纳：" + W.rejectedWorldTime);
              else if (W.appliedWorldTime && W.normalizedWorldTimeString) {
                parts.push("世界时间→" + W.normalizedWorldTimeString);
              }
              if (W.appliedLocation) parts.push("地点已更新");
            }
          }
          var Npc = app.npc;
          if (Npc) {
            if (Npc.skipped) parts.push("周围人物：未提交标签，保持快照");
            else if (Npc.parseError) parts.push("周围人物解析：" + Npc.parseError);
            else if (Npc.applied) {
              if (Npc.parseVia === "absent_empty_merge") {
                parts.push("周围人物：无标签，未列出者已不可见（快照 " + Npc.count + " 人）");
              } else parts.push("周围人物已更新（" + Npc.count + " 人）");
            }
          }
          global.GameLog.info(parts.join("；") + "\n" + raw.slice(0, 2000));
        }
        var SCBattle = global.MortalJourneyStoryChat;
        var battleFromState =
          SCBattle && typeof SCBattle.extractBattleTriggerFromNarrative === "function"
            ? SCBattle.extractBattleTriggerFromNarrative(raw, G)
            : { shouldEnterBattle: false };
        if (battleFromState && battleFromState.shouldEnterBattle) {
          var pb = triggerCombatFromBattleResult(G, battleFromState, "state_ai");
          if (global.GameLog && typeof global.GameLog.info === "function") {
            global.GameLog.info(
              "[状态→战斗] 已触发；类型=" +
                String(pb.triggerKind || "") +
                "；我方=" +
                ((pb.allies && pb.allies.length) || 0) +
                "；敌方=" +
                ((pb.enemies && pb.enemies.length) || 0),
            );
          }
        }
        return { ok: true };
      })
      .catch(function (err) {
        clearTimeoutIfAny();
        var msg =
          err && err.message
            ? String(err.message)
            : "状态请求失败。若未配置 API，请检查 silly_tarven/bridge-config.js。";
        finishAiReplyFeedback(feedbackGenState, textarea, "error", msg, { kind: AI_KIND_STATE_LABEL });
        appendChatErrorWithRetry(
          "状态 AI：" +
            msg +
            "\n\n仍可重试：上方剧情已生成成功，点击下方按钮会再次请求状态同步（不会重跑剧情）。",
          "state",
        );
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[状态←AI] 失败：" + msg.slice(0, 300));
        }
        return { ok: false, error: err };
      });
  }

  /**
   * 非玩家输入触发的剧情请求（如开局自动生成）：行为与发送按钮一致，走同一套 buildMessages / 状态回合。
   * @param {{ userText: string, skipIfChatNonEmpty?: boolean, forceBattleIntent?: boolean, suppressUserInChatLog?: boolean }} opts
   * @param {boolean} [opts.suppressUserInChatLog] 为 true 时不写入 chatHistory、不显示「你」气泡（开局长提示仅走 API，界面从「剧情」起）
   * @returns {Promise<boolean>} 已发起请求则为 true；因跳过或未加载则为 false
   */
  function runScriptedStoryTurn(opts) {
    var o = opts || {};
    var userText = String(o.userText || "").trim();
    if (!userText) return Promise.resolve(false);

    var G = global.MortalJourneyGame;
    if (!G) return Promise.resolve(false);
    mjPanel().ensureGameRuntimeDefaults(G);

    var suppressUserInChatLog = o.suppressUserInChatLog === true;

    var skipIf = o.skipIfChatNonEmpty !== false;
    if (skipIf) {
      var hist0 = Array.isArray(G.chatHistory) ? G.chatHistory : [];
      var hasUa = false;
      for (var hi = 0; hi < hist0.length; hi++) {
        var role0 = hist0[hi] && hist0[hi].role;
        if (role0 === "user" || role0 === "assistant") {
          hasUa = true;
          break;
        }
      }
      if (hasUa) return Promise.resolve(false);
    }

    var SC = global.MortalJourneyStoryChat;
    if (!SC || typeof SC.sendTurn !== "function") {
      flashChatStatusError("剧情模块未加载，无法请求 AI。");
      return Promise.resolve(false);
    }

    var prior = (G.chatHistory || []).slice();
    var userHistIndex = Array.isArray(G.chatHistory) ? G.chatHistory.length : 0;
    var userRoot = null;
    if (!suppressUserInChatLog) {
      G.chatHistory.push({ role: "user", content: userText });
      var userUi = appendChatBubble("user", userText);
      userRoot = userUi ? userUi.root : null;
    }

    var asstUi = appendChatBubble("assistant", "");
    var assistantBody = asstUi ? asstUi.body : null;
    var assistantRoot = asstUi ? asstUi.root : null;

    var refs = getChatComposerRefs();
    var textarea = refs.textarea;
    var sendBtn = refs.sendBtn;
    if (sendBtn) sendBtn.disabled = true;

    return runStoryAiTurn({
      G: G,
      SC: SC,
      textarea: textarea,
      sendBtn: sendBtn,
      userText: userText,
      priorHistory: prior,
      forceBattleIntent: !!o.forceBattleIntent,
      strictPipelineOutcome: !!o.strictPipelineOutcome,
      skipStateInventoryAfterStory: !!o.skipStateInventoryAfterStory,
      assistantBody: assistantBody,
      assistantRoot: assistantRoot,
      userRoot: userRoot,
      userHistIndex: userHistIndex,
      isRetry: false,
      allowRollbackOnTimeout: false,
      rollbackFn: null,
      retryButtonEl: null,
      suppressUserInChatLog: suppressUserInChatLog,
    }).then(function () {
      return true;
    });
  }

  function handleChatSend(textarea, sendBtn) {
    var text = String(textarea.value || "").trim();
    if (!text) return;

    var G = global.MortalJourneyGame;
    if (!G) return;
    mjPanel().ensureGameRuntimeDefaults(G);

    var prior = (G.chatHistory || []).slice();

    var SC = global.MortalJourneyStoryChat;
    if (!SC || typeof SC.sendTurn !== "function") {
      flashChatStatusError("剧情模块未加载，无法请求 AI。");
      appendChatBubble("error", "剧情模块未加载（缺少 story_generate.js）。");
      return;
    }

    var userHistIndex = Array.isArray(G.chatHistory) ? G.chatHistory.length : 0;
    G.chatHistory.push({ role: "user", content: text });
    textarea.value = "";
    var userUi = appendChatBubble("user", text);
    var userRoot = userUi ? userUi.root : null;

    var asstUi = appendChatBubble("assistant", "");
    var assistantBody = asstUi ? asstUi.body : null;
    var assistantRoot = asstUi ? asstUi.root : null;
    sendBtn.disabled = true;

    function rollbackSendUiAndHistory() {
      try {
        if (textarea) {
          textarea.value = text;
          textarea.focus();
        }
      } catch (_e) {}
      try {
        if (assistantRoot && assistantRoot.parentNode) assistantRoot.parentNode.removeChild(assistantRoot);
      } catch (_e2) {}
      try {
        if (userRoot && userRoot.parentNode) userRoot.parentNode.removeChild(userRoot);
      } catch (_e3) {}
      try {
        if (Array.isArray(G.chatHistory) && G.chatHistory.length > userHistIndex) {
          G.chatHistory.splice(userHistIndex);
        }
      } catch (_e4) {}
    }

    runStoryAiTurn({
      G: G,
      SC: SC,
      textarea: textarea,
      sendBtn: sendBtn,
      userText: text,
      priorHistory: prior,
      forceBattleIntent: hasExplicitBattleIntent(text),
      assistantBody: assistantBody,
      assistantRoot: assistantRoot,
      userRoot: userRoot,
      userHistIndex: userHistIndex,
      isRetry: false,
      allowRollbackOnTimeout: true,
      rollbackFn: rollbackSendUiAndHistory,
      retryButtonEl: null,
    });
  }

  /**
   * 战斗结束后自动请求剧情：结算全文 + 战时上下文 + 接续说明写入同一条 user 消息并送入剧情 AI（不设蓝色结算气泡）。
   */
  function runPostBattleStoryContinuation(detail) {
    if (!MJ_AUTO_STORY_AFTER_BATTLE) return;
    if (!detail || !detail.settlement || typeof detail.settlement !== "object") return;
    if (!getChatLogEl()) return;

    var G = global.MortalJourneyGame;
    var SC = global.MortalJourneyStoryChat;
    if (!G || !SC || typeof SC.sendTurn !== "function") return;

    var refs = getChatComposerRefs();
    var textarea = refs.textarea;
    var sendBtn = refs.sendBtn;
    if (sendBtn && sendBtn.disabled) {
      appendBattleSettlementFromDetail(detail);
      if (global.GameLog && typeof global.GameLog.info === "function") {
        global.GameLog.info(
          "[主界面] 战后自动剧情跳过：仍有请求进行中，已保留战斗结算气泡；请稍后再试或手动发消息接续。",
        );
      }
      return;
    }

    mjPanel().ensureGameRuntimeDefaults(G);

    var settlementBlock = formatBattleSettlementText(detail.settlement);
    if (!settlementBlock) return;

    var metaBlock = formatPendingBattleMetaLines(G);
    try {
      G.storyBattleContextConsumed = true;
    } catch (_sbc) {}

    var prior = (G.chatHistory || []).slice();
    var userText = [settlementBlock, metaBlock].filter(Boolean).join("\n\n");
    var userHistIndex = Array.isArray(G.chatHistory) ? G.chatHistory.length : 0;
    G.chatHistory.push({ role: "user", content: userText });
    var lootTextAuto =
      detail.victor === "ally" ? formatBattleLootText(detail.battleLoot) : "";
    if (lootTextAuto) {
      G.chatHistory.push({ role: "battle_loot", content: lootTextAuto });
    }
    persistChatHistoryAfterBattleChunk();

    var userUi = appendChatBubble("user", userText);
    var userRoot = userUi ? userUi.root : null;
    if (lootTextAuto) appendBattleLootDom(lootTextAuto);
    var asstUi = appendChatBubble("assistant", "");
    var assistantBody = asstUi ? asstUi.body : null;
    var assistantRoot = asstUi ? asstUi.root : null;

    if (sendBtn) sendBtn.disabled = true;
    if (textarea) textarea.disabled = true;

    runStoryAiTurn({
      G: G,
      SC: SC,
      textarea: textarea,
      sendBtn: sendBtn,
      userText: userText,
      priorHistory: prior,
      forceBattleIntent: false,
      assistantBody: assistantBody,
      assistantRoot: assistantRoot,
      userRoot: userRoot,
      userHistIndex: userHistIndex,
      isRetry: false,
      allowRollbackOnTimeout: false,
      rollbackFn: null,
      retryButtonEl: null,
    });
  }

  global.MjMainScreenChat = {
    handleChatSend: handleChatSend,
    runScriptedStoryTurn: runScriptedStoryTurn,
    /** 剧情后状态 AI（储物袋 / 世界状态 / 周围人物）；textarea 可为 null（全屏门闩等场景） */
    runStateInventoryAiTurn: runStateInventoryAiTurn,
    /** 读档后把历史剧情渲染回聊天区（不会清除开局总览，只会追加） */
    renderHistoryIntoChatLog: function (history) {
      var arr = Array.isArray(history) ? history : [];
      if (!arr.length) return;
      var log = getChatLogEl();
      if (!log) return;
      log.innerHTML = "";
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (!it || !it.role) continue;
        var role = String(it.role);
        if (role === "battle_settlement") {
          appendBattleSettlementDom(it.content != null ? String(it.content) : "");
          continue;
        }
        if (role === "battle_loot") {
          appendBattleLootDom(it.content != null ? String(it.content) : "");
          continue;
        }
        if (role !== "user" && role !== "assistant" && role !== "error") continue;
        appendChatBubble(role, it.content != null ? String(it.content) : "");
      }
    },
    appendBattleSettlementFromDetail: appendBattleSettlementFromDetail,
    formatBattleSettlementText: formatBattleSettlementText,
    formatBattleLootText: formatBattleLootText,
  };

  try {
    global.addEventListener("mj:battle-finished", function (ev) {
      var d = ev && ev.detail;
      try {
        if (global.MortalJourneyGame) global.MortalJourneyGame.storyBattleContextConsumed = false;
      } catch (_sbc0) {}
      if (MJ_AUTO_STORY_AFTER_BATTLE) {
        setTimeout(function () {
          runPostBattleStoryContinuation(d);
        }, 0);
      } else {
        appendBattleSettlementFromDetail(d);
      }
    });
  } catch (_battleEv) {}
})(typeof window !== "undefined" ? window : globalThis);
