/**
 * 主界面剧情区：聊天 UI、剧情/状态 AI 请求与状态栏反馈（依赖 MjMainScreenPanel）。
 */
(function (global) {
  "use strict";

  function mjPanel() {
    return global.MjMainScreenPanel;
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
        return "等待「" + kind + "」整段生成… 已 " + sec + " 秒";
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
   * 剧情 AI 成功后：请求状态 AI（储物袋等），状态栏计时与剧情一致。
   * @returns {Promise<void>}
   */
  function runStateInventoryAiTurn(G, textarea, storyReply) {
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
      return Promise.resolve();
    }
    var reply = storyReply != null ? String(storyReply) : "";
    var useStreamState = getBridgeUseStreamingChat();
    var feedbackGenState = startAiReplyFeedback(textarea, false, {
      kind: AI_KIND_STATE_LABEL,
      wholeResponseWait: !useStreamState,
    });
    var streamStateNotified = false;
    var stateMsgs = ST.buildMessages({
      storyText: reply,
      extraUserHint:
        "以上正文为刚生成的剧情段落（含文末机器标签时请一并阅读）。请根据剧情：①同步储物袋（add/remove；无变化则 []）②在 " +
        (ST.WORLD_STATE_TAG_OPEN || "<mj_world_state>") +
        " 中写回 worldTimeString 与 currentLocation（时间只可不变或往后，禁止早于快照）③若有新出场人物或周围人物列表变化，输出 " +
        (ST.NPC_NEARBY_TAG_OPEN || "<mj_nearby_npcs>") +
        " 完整 JSON 数组（无变更则省略该标签）；功法/装备名尽量与 user 可引用表一致；每条 NPC 的 displayName 须为明确姓名/称呼且与 " +
        (global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_OPEN
          ? global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_OPEN
          : "<mj_npc_story_hints>") +
        " 中一致，禁止留空。",
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
            else if (Npc.applied) parts.push("周围人物已更新（" + Npc.count + " 人）");
          }
          global.GameLog.info(parts.join("；") + "\n" + raw.slice(0, 2000));
        }
      })
      .catch(function (err) {
        clearTimeoutIfAny();
        var msg =
          err && err.message
            ? String(err.message)
            : "状态请求失败。若未配置 API，请检查 silly_tarven/bridge-config.js。";
        finishAiReplyFeedback(feedbackGenState, textarea, "error", msg, { kind: AI_KIND_STATE_LABEL });
        appendChatBubble("error", "状态 AI：" + msg);
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[状态←AI] 失败：" + msg.slice(0, 300));
        }
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

    var useStreamChat = getBridgeUseStreamingChat();
    var feedbackGenStory = startAiReplyFeedback(textarea, false, {
      kind: AI_KIND_STORY_LABEL,
      wholeResponseWait: !useStreamChat,
    });
    var streamNotified = false;

    var messages =
      typeof SC.buildMessages === "function"
        ? SC.buildMessages({ userText: text, priorHistory: prior })
        : null;
    if (messages && global.GameLog && typeof global.GameLog.info === "function") {
      try {
        var human =
          typeof SC.formatMessagesForHumanLog === "function"
            ? SC.formatMessagesForHumanLog(messages)
            : "";
        var jsonStr = JSON.stringify(messages, null, 2);
        global.GameLog.info(
          "[剧情→AI] 本次请求\n\n—— 易读排版 ——\n" +
            (human || jsonStr) +
            "\n\n—— 原始 JSON（可复制） ——\n" +
            jsonStr,
        );
      } catch (logErr) {
        global.GameLog.info("[剧情→AI] 用户输入（messages 无法序列化）：" + text.slice(0, 800));
      }
    }

    var asstUi = appendChatBubble("assistant", "");
    var assistantBody = asstUi ? asstUi.body : null;
    var assistantRoot = asstUi ? asstUi.root : null;
    sendBtn.disabled = true;

    // 300s 超时：超时后回退本次发送（撤销气泡与 chatHistory，并回填输入框）
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

    function isTimeoutError(err) {
      var msg = err && err.message ? String(err.message) : "";
      if (/timeout_300s/i.test(msg)) return true;
      if (/超时/i.test(msg)) return true;
      if (/timeout/i.test(msg)) return true;
      if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) return true;
      return false;
    }

    function rollbackSendUiAndHistory() {
      // 回填输入框（保留原内容）
      try {
        if (textarea) {
          textarea.value = text;
          textarea.focus();
        }
      } catch (_e) {}

      // 移除刚追加的气泡（你 + 空 assistant）
      try {
        if (assistantRoot && assistantRoot.parentNode) assistantRoot.parentNode.removeChild(assistantRoot);
      } catch (_e2) {}
      try {
        if (userRoot && userRoot.parentNode) userRoot.parentNode.removeChild(userRoot);
      } catch (_e3) {}

      // 回退 chatHistory：删掉本次 push 的 user（以及可能追加的空 assistant）
      try {
        if (Array.isArray(G.chatHistory) && G.chatHistory.length > userHistIndex) {
          // 仅删除从 userHistIndex 起新增的内容
          G.chatHistory.splice(userHistIndex);
        }
      } catch (_e4) {}
    }

    SC.sendTurn({
      messages: messages,
      userText: text,
      priorHistory: prior,
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
              if (SC && typeof SC.stripStoryAiMetaLeakFromNarrative === "function") {
                vis = SC.stripStoryAiMetaLeakFromNarrative(vis);
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
        var sansLeak =
          SC && typeof SC.stripStoryAiMetaLeakFromNarrative === "function"
            ? SC.stripStoryAiMetaLeakFromNarrative(replyRaw)
            : replyRaw;
        var replyForChat =
          SC && typeof SC.stripNpcStoryHintsFromNarrative === "function"
            ? SC.stripNpcStoryHintsFromNarrative(sansLeak)
            : sansLeak;
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
          return Promise.resolve();
        }
        if (assistantRoot) assistantRoot.classList.remove("mj-chat-msg--assistant-empty");
        G.chatHistory.push({ role: "assistant", content: replyForChat });
        if (assistantBody) assistantBody.textContent = replyForChat;
        scrollChatLog();
        finishAiReplyFeedback(feedbackGenStory, textarea, "done", undefined, { kind: AI_KIND_STORY_LABEL });
        return runStateInventoryAiTurn(G, textarea, sansLeak);
      })
      .catch(function (err) {
        clearTimeoutIfAny();
        if (isTimeoutError(err)) {
          // 超时：回退本次发送，不保留失败提示气泡
          finishAiReplyFeedback(feedbackGenStory, textarea, "error", "请求超时（300 秒）", { kind: AI_KIND_STORY_LABEL });
          rollbackSendUiAndHistory();
          return;
        }
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
        finishAiReplyFeedback(feedbackGenStory, textarea, "error", msg, { kind: AI_KIND_STORY_LABEL });
        appendChatBubble("error", msg);
        console.warn("[主界面] 剧情请求失败", err);
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[主界面] 剧情请求失败：" + msg.slice(0, 300));
        }
      })
      .then(function () {
        clearTimeoutIfAny();
        sendBtn.disabled = false;
        if (textarea) textarea.disabled = false;
      });
  }

  global.MjMainScreenChat = {
    handleChatSend: handleChatSend,
    /** 读档后把历史剧情渲染回聊天区（不会清除开局总览，只会追加） */
    renderHistoryIntoChatLog: function (history) {
      var arr = Array.isArray(history) ? history : [];
      if (!arr.length) return;
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (!it || !it.role) continue;
        var role = String(it.role);
        if (role !== "user" && role !== "assistant" && role !== "error") continue;
        appendChatBubble(role, it.content != null ? String(it.content) : "");
      }
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
