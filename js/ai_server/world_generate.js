/**
 * 开局剧情：合并预设 + 世界书 + 命运抉择（含自定义出身）由剧情 AI 生成第一段叙事。
 * 全屏门闩流程中本段**先于**开局配置 AI；`skipStateInventoryAfterStory` 时可不跑状态 AI（主角由开局配置写面板，随后在门闩内由第三步状态 AI 同步 NPC）。
 * 实际 messages 由 MortalJourneyStoryChat.buildMessages 构建。
 */
(function (global) {
  "use strict";

  var _openingScheduled = false;

  function storyBodyTags() {
    var SC = global.MortalJourneyStoryChat;
    var open = SC && SC.STORY_BODY_TAG_OPEN ? String(SC.STORY_BODY_TAG_OPEN) : "<mj_story_body>";
    var close = SC && SC.STORY_BODY_TAG_CLOSE ? String(SC.STORY_BODY_TAG_CLOSE) : "</mj_story_body>";
    return { open: open, close: close };
  }

  /** 与 story_generate / 开局摘要一致的境界一行（化神无小阶） */
  function formatOpeningRealmLine(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm) || {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    if (major === "化神") return "化神";
    var minor =
      r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    return major + minor;
  }

  function openingRealmMajorOnly(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm) || {};
    return r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
  }

  function openingProtagonistAgeSnap(G, fc) {
    var RS = global.RealmState;
    if (RS && typeof RS.getProtagonistNarrativeAge === "function") {
      return RS.getProtagonistNarrativeAge(G, fc != null ? fc : G && G.fateChoice);
    }
    var g = G && typeof G === "object" ? G : {};
    var defAge = 16;
    var RAge = global.MjMainScreenPanelRealm;
    if (RAge && typeof RAge.DEFAULT_AGE === "number" && isFinite(RAge.DEFAULT_AGE)) {
      defAge = Math.max(0, Math.floor(RAge.DEFAULT_AGE));
    }
    return typeof g.age === "number" && isFinite(g.age) ? Math.max(0, Math.floor(g.age)) : defAge;
  }

  /**
   * @param {Object|null} fc fateChoice
   * @param {Object|null} G MortalJourneyGame（全屏门闩下：配置 AI 尚未执行，快照多为空；读档且已配置后可为实数据）
   * @returns {string}
   */
  function buildOpeningUserPrompt(fc, G) {
    var g = G && typeof G === "object" ? G : global.MortalJourneyGame || {};
    var tags = storyBodyTags();
    var SG = global.MortalJourneyStateGenerate;
    var postInit = g.mjInitStateAiApplied === true;
    var lines = [];
    if (postInit) {
      lines.push(
        "【开局请求】开局配置已写入存档。请依据系统预设、世界书、system 摘要与**下方 JSON**（出身、境界、年龄、佩戴、功法、储物袋）写第一段剧情，叙事与面板一致。",
      );
    } else {
      lines.push(
        "【开局请求】本局将**先**写第一段开局剧情，再由「开局配置 AI」根据你的正文落实装备、功法与储物袋。请依据命运抉择与世界书写出处境与氛围；可在文中**具体写出**兵刃、法器、衣物、代步、功法名与袋中灵石丹药等，便于后续配置对齐（未写细则处由配置 AI 结合摘要补全）。",
      );
    }
    if (!postInit) {
      lines.push(
        "【系统真值】随后 JSON 里的 **realm**、**age**、灵根与 `customBirth` 为当前局硬约束；**不要**套用他书常见的「少年天骄结丹/元婴」套路去覆盖——叙事中的**真实修为层级**只能在此范围内展开。",
      );
    }
    lines.push("");
    lines.push("写作要求：");
    var realmLbl = formatOpeningRealmLine(fc, g);
    var maj = openingRealmMajorOnly(fc, g);
    var age0 = openingProtagonistAgeSnap(g, fc);
    lines.push(
      "· 【铁律 · 优先级最高】本局主角在摘要中的境界为 **" +
        realmLbl +
        "**（大境界：" +
        maj +
        "），世界快照年龄 **" +
        String(age0) +
        "** 岁。**正文描写的主角修为不得超过该大境界**（例如大境界为练气时，禁止写体内金丹、浑圆金丹、结丹法力、已踏入结丹等；筑基时禁止写结丹/元婴层次的功体实相）。比喻、夸张或他人误判若会误导读者，亦须避免。",
    );
    lines.push(
      "· 【禁止「正文现编例外」】**不得**在叙事里**临时编造**「皇室灌頂、秘药洗髓、长老合力拔境、真龙化境丹」等情节，来解释与 JSON 不符的低龄高境或越级功体——除非 **下方命运抉择 JSON** 的 `customBirth.background`（或已给出的等价长文本）**事先写清**了灌顶/催熟/夺舍/透支等字样。若 JSON 中无此类事前说明，则年龄还须落在下表常规区间，**不得**用模型幻觉自圆其说。",
    );
    lines.push(
      "· 从主角当前处境直接写起，时间、地点、境界与灵根须与摘要一致，叙事人称遵守「叙事人称偏好」。",
    );
    lines.push(
      "· **年龄与摘要大境界（常规区间）**：若 JSON 未包含上条所述事前例外，则叙事年龄须落在——**练气**：约 16–100 岁；**筑基**：约 100–200 岁；**结丹**：约 200–500 岁；**元婴**：约 500–1000 岁；**化神**：约 1000 岁以上。小境界（初/中/后期）不得用来把年龄压到更低一档大境界。",
    );
    if (postInit) {
      lines.push(
        "· **须与开局配置一致**：下列 JSON 已落库。正文中的年龄、背景与所持物须与世界状态中 **age**、佩戴/功法/储物袋一致，名称与档位不得冲突。",
      );
    } else {
      lines.push(
        "· **创作自由度**：下列「佩戴/功法/储物袋」快照可能仍为空或仅占位；正文可与摘要一起**敲定**具体器物与资源，勿与命运抉择矛盾。",
      );
    }
    if (fc && fc.customBirth && typeof fc.customBirth === "object") {
      lines.push(
        "· 摘要中 `customBirth` 含地点、境界与出身背景（预设凡人/黄枫谷与自选出身均如此）：剧情须落实这些内容（可文学润色），并与 `birth` 条目气质一致，不得矛盾。",
      );
    } else {
      lines.push("· 本局出身为配置条目「" + String((fc && fc.birth) || "（未名）") + "」：氛围与默认处境须与之协调。");
    }
    lines.push(
      "· 格式：玩家可见正文写在 " +
        tags.open +
        " 与 " +
        tags.close +
        " 之间；文末按需输出 NPC 提示、行动建议、剧情快照等机器标签（规则见 system 中的运行时说明）。",
    );
    lines.push("· 不要逐条复述本提示或照抄 JSON，用叙事落笔。");
    lines.push("");
    lines.push("### 命运抉择与角色背景（叙事须落实）");
    var fateLine = "{}";
    var Init = global.MortalJourneyInitStateGenerate;
    if (Init && typeof Init.buildFateChoiceBriefJson === "function") {
      try {
        fateLine = Init.buildFateChoiceBriefJson(fc, g);
      } catch (_eF) {
        fateLine = "{}";
      }
    }
    lines.push(fateLine);
    lines.push("### 世界状态与年龄（须一致）");
    if (SG && typeof SG.buildWorldSnapshotJson === "function") {
      try {
        lines.push(SG.buildWorldSnapshotJson(g));
      } catch (_eW) {
        lines.push("{}");
      }
    } else {
      lines.push("{}");
    }
    try {
      var sup = {};
      if (typeof g.shouyuan === "number" && isFinite(g.shouyuan)) sup.shouyuan = Math.floor(g.shouyuan);
      if (g.gender != null && String(g.gender).trim() !== "") sup.gender = String(g.gender).trim();
      if (Object.keys(sup).length > 0) {
        lines.push("### 寿元与性别（若有则与叙事一致）");
        lines.push(JSON.stringify(sup));
      }
    } catch (_eS) {}
    lines.push("### 主角当前佩戴（武器 / 法器 / 防具 / 载具）");
    if (SG && typeof SG.buildEquippedSnapshot === "function") {
      try {
        lines.push(SG.buildEquippedSnapshot(g));
      } catch (_eE) {
        lines.push("[]");
      }
    } else {
      lines.push("[]");
    }
    lines.push("### 主角功法栏");
    if (SG && typeof SG.buildGongfaSnapshot === "function") {
      try {
        lines.push(SG.buildGongfaSnapshot(g));
      } catch (_eGf) {
        lines.push("[]");
      }
    } else {
      lines.push("[]");
    }
    lines.push("### 储物袋（灵石与杂物）");
    if (SG && typeof SG.buildInventorySnapshot === "function") {
      try {
        lines.push(SG.buildInventorySnapshot(g));
      } catch (_eB) {
        lines.push("[]");
      }
    } else {
      lines.push("[]");
    }
    return lines.join("\n");
  }

  /**
   * 在聊天区尚无 user/assistant 回合、且 TavernHelper 可用时，自动请求开局剧情（与手动发送共用同一管线）。
   */
  function scheduleOpeningStoryIfNeeded() {
    if (_openingScheduled) return;
    var G = global.MortalJourneyGame;
    var Chat = global.MjMainScreenChat;
    if (!G || !Chat || typeof Chat.runScriptedStoryTurn !== "function") return;

    var hist = Array.isArray(G.chatHistory) ? G.chatHistory : [];
    var hasUa = false;
    for (var i = 0; i < hist.length; i++) {
      var r = hist[i] && hist[i].role;
      if (r === "user" || r === "assistant") {
        hasUa = true;
        break;
      }
    }
    if (hasUa) return;

    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      try {
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[开局剧情] 已跳过：TavernHelper 未就绪，请配置 API（index 或 bridge）后刷新。");
        }
      } catch (_e) {}
      return;
    }

    if (!G.fateChoice || typeof G.fateChoice !== "object") {
      try {
        if (global.GameLog && typeof global.GameLog.warn === "function") {
          global.GameLog.warn("[开局剧情] 已跳过：无 fateChoice。");
        }
      } catch (_e2) {}
      return;
    }

    _openingScheduled = true;
    var fc = G.fateChoice;
    var prompt = buildOpeningUserPrompt(fc, G);

    try {
      if (global.GameLog && typeof global.GameLog.info === "function") {
        global.GameLog.info("[开局剧情] 已调度：将请求第一段剧情（预设+世界书+存档摘要）。");
      }
    } catch (_e3) {}

    window.setTimeout(function () {
      Chat.runScriptedStoryTurn({
        userText: prompt,
        skipIfChatNonEmpty: true,
        forceBattleIntent: false,
        suppressUserInChatLog: true,
      });
    }, 320);
  }

  /**
   * 开局剧情 + 紧随的状态 AI（可跳过状态回合，供门闩「先剧情后配置」）。
   * @param {Object} [opts]
   * @param {boolean} [opts.skipStateInventoryAfterStory] 为 true 时不调用状态 AI（由随后开局配置 AI 统一写面板）；
   * @returns {Promise<{ skipped?: boolean }>}
   */
  function runOpeningStoryStrictPromise(opts) {
    var o = opts || {};
    var G = global.MortalJourneyGame;
    var Chat = global.MjMainScreenChat;
    if (!G || !Chat || typeof Chat.runScriptedStoryTurn !== "function") {
      return Promise.reject(new Error("聊天模块未就绪"));
    }
    var hist = Array.isArray(G.chatHistory) ? G.chatHistory : [];
    for (var i = 0; i < hist.length; i++) {
      var r = hist[i] && hist[i].role;
      if (r === "user" || r === "assistant") {
        return Promise.resolve({ skipped: true });
      }
    }
    if (!G.fateChoice || typeof G.fateChoice !== "object") {
      return Promise.reject(new Error("无 fateChoice"));
    }
    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      return Promise.reject(new Error("TavernHelper 未就绪"));
    }
    var fc = G.fateChoice;
    var prompt = buildOpeningUserPrompt(fc, G);
    return Chat.runScriptedStoryTurn({
      userText: prompt,
      skipIfChatNonEmpty: true,
      forceBattleIntent: false,
      strictPipelineOutcome: true,
      skipStateInventoryAfterStory: o.skipStateInventoryAfterStory === true,
      suppressUserInChatLog: true,
    }).then(function (ok) {
      if (!ok) return Promise.reject(new Error("开局剧情未发起或已跳过"));
      return { skipped: false };
    });
  }

  global.MortalJourneyWorldGenerate = {
    scheduleOpeningStoryIfNeeded: scheduleOpeningStoryIfNeeded,
    buildOpeningUserPrompt: buildOpeningUserPrompt,
    runOpeningStoryStrictPromise: runOpeningStoryStrictPromise,
  };
})(typeof window !== "undefined" ? window : globalThis);
