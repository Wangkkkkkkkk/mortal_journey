/**
 * 主界面（main.html）：加载顺序需为先 mainScreen_panel_realm.js、mainScreen_panel_inventory_ui.js，再 mainScreen_chat.js，最后本文件。
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
    P.renderInventorySlots();
    P.renderGongfaGrid();
    P.renderLeftPanel(fc, G);
    P.renderBootstrapOverview(fc);
    // 恢复存档剧情：开局总览后追加历史聊天
    try {
      if (Chat && typeof Chat.renderHistoryIntoChatLog === "function") {
        Chat.renderHistoryIntoChatLog(G && G.chatHistory);
      }
    } catch (_e0) {
      /* 忽略 */
    }

    if (global.MortalJourneyWorldBook && typeof global.MortalJourneyWorldBook.syncToBridgeStorage === "function") {
      try {
        global.MortalJourneyWorldBook.syncToBridgeStorage();
      } catch (syncErr) {
        console.warn("[主界面] 世界书同步到桥接存储失败", syncErr);
      }
    }

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
