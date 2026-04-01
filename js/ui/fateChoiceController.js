/**
 * 命运抉择：对齐 ref_html 开辟鸿蒙单页框架（精简版，无 Dexie / 地图）
 */
(function (global) {
  "use strict";

  var SAVE_INDEX_KEY = "MJ_SAVES_INDEX_V1";
  var SAVE_PREFIX = "MJ_SAVE_V1:";
  var ACTIVE_SAVE_ID_KEY = "MJ_ACTIVE_SAVE_ID_V1";
  var BOOTSTRAP_KEY = "mortal_journey_bootstrap_v1";

  var cfg = function () {
    return global.MjCreationConfig;
  };

  /** 命运抉择内默认修为：练气初期（查 realm_state + leegen_state） */
  var START_REALM_MAJOR = "练气";
  var START_REALM_STAGE = "初期";

  var state = {
    /** 难度选择已移除：统一按「简单」处理 */
    selectedDifficulty: "简单",
    selectedBirth: null,
    customBirth: null,
    selectedGender: null,
    narrationPerson: "second",
    playerName: "韩立",
    attributes: {},
    selectedTraits: [],
    currentTraitOptions: [],
    selectedLinggen: null,
    selectedWorldFactors: [],
    birthLocation: null,
    /** 境界表原始八维（未乘灵根） */
    rawRealmBase: null,
    /** 灵根折算后的八维，整数；随灵根变化重算，开局后由全局 MortalJourneyGame 继续维护 */
    playerBase: null,
  };

  /** 用于属性日志去重（灵根或八维变化才再打印） */
  var _lastAttrLogSignature = "";

  function getEl(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 出身 location：兼容旧版字符串，或新版 { "地名": { desc } }（取 Object 首键）。
   */
  function resolveBirthLocationNameFromDef(bd) {
    if (!bd || bd.location == null) return "";
    var loc = bd.location;
    if (typeof loc === "string") return String(loc).trim();
    if (typeof loc === "object" && !Array.isArray(loc)) {
      var keys = Object.keys(loc);
      return keys.length ? String(keys[0]).trim() : "";
    }
    return "";
  }

  function resolveBirthLocationDescFromDef(bd) {
    if (!bd || bd.location == null) return "";
    var loc = bd.location;
    if (typeof loc === "object" && !Array.isArray(loc)) {
      var keys = Object.keys(loc);
      if (!keys.length) return "";
      var entry = loc[keys[0]];
      if (entry && entry.desc != null) return String(entry.desc).trim();
      return "";
    }
    if (typeof loc === "string") {
      return bd.desc != null ? String(bd.desc).trim() : "";
    }
    return bd.desc != null ? String(bd.desc).trim() : "";
  }

  function resetState() {
    state.selectedDifficulty = "简单";
    state.selectedBirth = null;
    state.customBirth = null;
    state.selectedGender = null;
    state.narrationPerson = "second";
    state.playerName = "韩立";
    state.attributes = {};
    state.selectedTraits = [];
    state.currentTraitOptions = [];
    state.selectedLinggen = null;
    state.selectedWorldFactors = [];
    state.birthLocation = null;
    state.rawRealmBase = null;
    state.playerBase = null;
    _lastAttrLogSignature = "";
  }

  var BASE_STAT_KEYS = ["hp", "mp", "patk", "pdef", "matk", "mdef", "foot", "sense"];

  /** 与 mainScreen 默认一致；魅力/气运由 PlayerBaseRuntime 合并后限制在 [0,100] */
  var DEFAULT_CHARM = 10;
  var DEFAULT_LUCK = 10;

  var STAT_LABEL_ZH = {
    hp: "血量",
    mp: "法力",
    patk: "物攻",
    pdef: "物防",
    matk: "法攻",
    mdef: "法防",
    foot: "脚力",
    sense: "神识",
    charm: "魅力",
    luck: "气运",
  };

  /**
   * 逆天改命刷新时：先按权重抽品质，再在该品质未排除的词条中均匀抽一条。
   * 权重为相对比例（不必加总为 100）；可在运行时改 `FateChoiceController.TRAIT_RARITY_WEIGHTS` 各项 `weight`。
   * 品质名须与 trait_samples.js 中 `rarity` 一致（「普通」而非「正常」）。
   */
  var TRAIT_RARITY_WEIGHTS = [
    { rarity: "平庸", weight: 50 },
    { rarity: "普通", weight: 25 },
    { rarity: "稀有", weight: 15 },
    { rarity: "史诗", weight: 9 },
    { rarity: "传说", weight: 0.9 },
    { rarity: "神迹", weight: 0.1 },
  ];

  function rollTraitRarityFromWeights(rows) {
    if (!rows || !rows.length) return "平庸";
    var sum = 0;
    for (var i = 0; i < rows.length; i++) {
      var w = rows[i].weight;
      sum += typeof w === "number" && isFinite(w) && w > 0 ? w : 0;
    }
    if (sum <= 0) return rows[0].rarity || "平庸";
    var r = Math.random() * sum;
    var acc = 0;
    for (var j = 0; j < rows.length; j++) {
      var wj = rows[j].weight;
      var nw = typeof wj === "number" && isFinite(wj) && wj > 0 ? wj : 0;
      if (nw <= 0) continue;
      acc += nw;
      if (r < acc) return rows[j].rarity || "平庸";
    }
    return rows[rows.length - 1].rarity || "平庸";
  }

  /**
   * 与主界面一致：境界表 + 灵根 + 难度/出身/天赋/出身 stuff + 当前出身对应的功法栏与佩戴栏快照。
   */
  function recomputePlayerBase() {
    var RS = global.RealmState;
    var PBR = global.PlayerBaseRuntime;
    if (!RS || typeof RS.getBaseStats !== "function" || !PBR || typeof PBR.computePlayerBase !== "function") {
      state.rawRealmBase = null;
      state.playerBase = null;
      pushRuntimeSnapshot();
      logPlayerBaseIfChanged();
      return;
    }
    var raw = RS.getBaseStats(START_REALM_MAJOR, START_REALM_STAGE);
    if (!raw) {
      state.rawRealmBase = null;
      state.playerBase = null;
      pushRuntimeSnapshot();
      logPlayerBaseIfChanged();
      return;
    }
    var fakeFc = {
      difficulty: state.selectedDifficulty,
      birth: state.selectedBirth,
      traits: state.selectedTraits,
      linggen: state.selectedLinggen,
      realm: { major: START_REALM_MAJOR, minor: START_REALM_STAGE },
      worldFactors: [],
    };
    var c = cfg();
    var ovr = {};
    if (c && state.selectedBirth) {
      if (typeof c.buildStartingGongfaSlots === "function") {
        ovr.gongfaSlots = c.buildStartingGongfaSlots(state.selectedBirth);
      }
      if (typeof c.buildStartingEquippedSlots === "function") {
        ovr.equippedSlots = c.buildStartingEquippedSlots(state.selectedBirth);
      }
    }
    state.rawRealmBase = PBR.snapshotRawRealmBase(fakeFc, null);
    state.playerBase = PBR.computePlayerBase(null, fakeFc, ovr);
    pushRuntimeSnapshot();
    logPlayerBaseIfChanged();
  }

  /** 灵根或折算结果变化时打印到控制台（及 GameLog） */
  function logPlayerBaseIfChanged() {
    var sig =
      (state.selectedLinggen || "") +
      "|" +
      (state.playerBase ? JSON.stringify(state.playerBase) : "") +
      "|" +
      (state.rawRealmBase ? JSON.stringify(state.rawRealmBase) : "");
    if (sig === _lastAttrLogSignature) return;
    _lastAttrLogSignature = sig;

    if (!state.playerBase) {
      console.info(
        "[命运抉择] 角色属性（练气初期）未就绪，请检查 realm_state.js、leegen_state.js、player_base_runtime.js 是否已加载。",
      );
      return;
    }

    var zhRow = {};
    for (var i = 0; i < BASE_STAT_KEYS.length; i++) {
      var k = BASE_STAT_KEYS[i];
      var cur = state.playerBase[k];
      var raw = state.rawRealmBase && state.rawRealmBase[k];
      zhRow[STAT_LABEL_ZH[k]] = typeof raw === "number" && raw !== cur ? cur + "（表值 " + raw + "）" : String(cur);
    }
    zhRow[STAT_LABEL_ZH.charm] = String(state.playerBase.charm != null ? state.playerBase.charm : DEFAULT_CHARM);
    zhRow[STAT_LABEL_ZH.luck] = String(state.playerBase.luck != null ? state.playerBase.luck : DEFAULT_LUCK);

    console.info(
      "[命运抉择] 练气·初期 · 灵根:",
      state.selectedLinggen || "无",
      "· playerBase 已同步至 MortalJourneyGame.playerBase",
    );
    console.table(zhRow);

    if (typeof global.GameLog === "object" && global.GameLog && typeof global.GameLog.info === "function") {
      global.GameLog.info(
        "[练气初期] 灵根 " +
          (state.selectedLinggen || "无") +
          " → " +
          JSON.stringify(zhRow),
      );
    }
  }

  function pushRuntimeSnapshot() {
    global.MortalJourneyGame = global.MortalJourneyGame || {};
    var G = global.MortalJourneyGame;
    G.realm = { major: START_REALM_MAJOR, minor: START_REALM_STAGE };
    if (state.rawRealmBase) {
      G.rawRealmBase = Object.assign({}, state.rawRealmBase);
    } else {
      G.rawRealmBase = null;
    }
    if (state.playerBase) {
      G.playerBase = Object.assign({}, state.playerBase);
      if (typeof G.playerBase.charm === "number") G.charm = G.playerBase.charm;
      else {
        G.playerBase.charm = DEFAULT_CHARM;
        G.charm = DEFAULT_CHARM;
      }
      if (typeof G.playerBase.luck === "number") G.luck = G.playerBase.luck;
      else {
        G.playerBase.luck = DEFAULT_LUCK;
        G.luck = DEFAULT_LUCK;
      }
    } else {
      G.playerBase = null;
      G.charm = DEFAULT_CHARM;
      G.luck = DEFAULT_LUCK;
    }
  }

  function isMortalMode() {
    // 难度选择已移除：不再存在「凡人模式」
    return false;
  }

  /** 兼容旧逻辑：曾有「凡人模式」锁定出身与天赋；现难度已简化，不再启用 */
  function applyMortalModeLocks() {
    // 难度选择已移除：该逻辑不再启用（保留函数以兼容旧调用点）
    return;
  }

  function createLinggenOrb(name) {
    if (!name) {
      var d = document.createElement("div");
      return d;
    }
    var parts = name.split(" ");
    var type = parts[0];
    var elements = parts.slice(1).map(function (el) {
      return el.replace(",", "");
    });
    if (!type) {
      var e = document.createElement("div");
      return e;
    }
    var orb = document.createElement("div");
    orb.className = "linggen-orb orb-type-" + type;
    orb.innerHTML =
      '<div class="linggen-tag tag-type-' +
      type +
      '">' +
      type +
      "</div>" +
      '<div class="linggen-elements">' +
      elements.join(" ") +
      "</div>";

    return orb;
  }

  function applyRandomLinggenRollToState() {
    var c = cfg();
    if (c && typeof c.rollRandomLinggenName === "function") {
      state.selectedLinggen = c.rollRandomLinggenName();
    } else {
      state.selectedLinggen = "无灵根";
    }
  }

  function handleRandomizeLinggen() {
    if (isMortalMode()) {
      return;
    }
    applyRandomLinggenRollToState();
    renderPage();
  }

  function pickRandomTraits(excludeNames, count) {
    var c = cfg();
    var pool = (c && c.TRAIT_SAMPLES) || [];
    var bag = pool.filter(function (t) {
      return t && t.name && excludeNames.indexOf(t.name) === -1;
    });
    var out = [];
    var weights = TRAIT_RARITY_WEIGHTS;
    for (var i = 0; i < count && bag.length; i++) {
      var rarity = rollTraitRarityFromWeights(weights);
      var candidates = [];
      for (var j = 0; j < bag.length; j++) {
        if (bag[j].rarity === rarity) candidates.push(bag[j]);
      }
      var pickFrom = candidates.length ? candidates : bag;
      var idx = Math.floor(Math.random() * pickFrom.length);
      var t = pickFrom[idx];
      var pickedName = t && t.name;
      bag = bag.filter(function (x) {
        return !x || x.name !== pickedName;
      });
      var row = {};
      for (var k in t) {
        if (Object.prototype.hasOwnProperty.call(t, k) && k !== "locked") {
          row[k] = t[k];
        }
      }
      row.locked = false;
      out.push(row);
    }
    return out;
  }

  function handleRandomizeTraits() {
    if (isMortalMode()) {
      return;
    }
    var locked = (state.currentTraitOptions || []).filter(function (t) {
      return t && t.locked;
    });
    if (locked.length >= 5) return;
    var need = Math.max(0, 5 - locked.length);
    var exclude = locked.map(function (t) {
      return t.name;
    });
    var fresh = pickRandomTraits(exclude, need);
    state.currentTraitOptions = locked.concat(fresh);
    state.selectedTraits = state.currentTraitOptions.filter(function (t) {
      return t.locked;
    });
    renderPage();
  }

  function handleTraitSelect(traitName) {
    if (isMortalMode()) {
      return;
    }
    state.currentTraitOptions = state.currentTraitOptions || [];
    var idx = state.currentTraitOptions.findIndex(function (t) {
      return t.name === traitName;
    });
    if (idx > -1) {
      state.currentTraitOptions[idx].locked = !state.currentTraitOptions[idx].locked;
    }
    state.selectedTraits = state.currentTraitOptions.filter(function (t) {
      return t.locked;
    });
    renderPage();
  }

  function appendFateTraitModalSection(bodyEl, label, text, opts) {
    if (!bodyEl || text == null || String(text).trim() === "") return;
    var sec = document.createElement("div");
    sec.className = "mj-trait-modal-section";
    var k = document.createElement("span");
    k.className = "mj-trait-modal-k";
    k.textContent = label;
    var v = document.createElement("div");
    v.className = "mj-trait-modal-v";
    v.textContent = String(text);
    if (opts && opts.multiline) v.style.whiteSpace = "pre-line";
    sec.appendChild(k);
    sec.appendChild(v);
    bodyEl.appendChild(sec);
  }

  function closeFateTraitDetailModal() {
    var root = getEl("mj-trait-detail-root");
    if (!root) return;
    var modalPanel = root.querySelector(".mj-trait-modal");
    if (modalPanel) modalPanel.removeAttribute("data-rarity");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openFateTraitDetailModal(trait) {
    var root = getEl("mj-trait-detail-root");
    var titleEl = getEl("mj-trait-modal-title");
    var rarityEl = getEl("mj-trait-modal-rarity");
    var bodyEl = getEl("mj-trait-modal-body");
    if (!root || !titleEl || !rarityEl || !bodyEl || !trait || !trait.name) return;
    titleEl.textContent = trait.name;
    rarityEl.textContent = trait.rarity ? "品质：" + trait.rarity : "";
    bodyEl.textContent = "";
    appendFateTraitModalSection(bodyEl, "简述", trait.desc);
    if (trait.effects != null && String(trait.effects).trim() !== "") {
      appendFateTraitModalSection(bodyEl, "效果", trait.effects);
    }
    if (trait.item != null && String(trait.item).trim() !== "" && String(trait.item) !== "无") {
      appendFateTraitModalSection(bodyEl, "关联物品", trait.item);
    }
    var modalPanel = root.querySelector(".mj-trait-modal");
    if (modalPanel) {
      modalPanel.removeAttribute("data-rarity");
      if (trait.rarity) modalPanel.setAttribute("data-rarity", String(trait.rarity));
    }
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = root.querySelector(".mj-trait-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function showTraitDetail(trait) {
    openFateTraitDetailModal(trait);
  }

  var _fateTraitModalBound = false;

  function bindFateTraitDetailModal() {
    if (_fateTraitModalBound) return;
    var root = getEl("mj-trait-detail-root");
    if (!root) return;
    _fateTraitModalBound = true;
    root.querySelectorAll("[data-mj-trait-modal-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        closeFateTraitDetailModal();
      });
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var r = getEl("mj-trait-detail-root");
      if (r && !r.classList.contains("hidden")) {
        closeFateTraitDetailModal();
        ev.preventDefault();
      }
    });
  }

  function renderPage() {
    var contentEl = getEl("creation-content");
    var navEl = getEl("creation-nav");
    var indicatorEl = getEl("creation-step-indicator");
    var c = cfg();
    if (!c || !contentEl || !navEl) return;

    if (indicatorEl) indicatorEl.innerHTML = "";

    var bdSel = state.selectedBirth && c.BIRTHS && c.BIRTHS[state.selectedBirth];
    // 世界因子已移除：不再让开局选择/写入
    state.selectedWorldFactors = [];
    var selectedWorldFactors = [];
    var mortal = isMortalMode();
    // 难度选择已移除：diffReady 恒为 true
    var diffReady = true;
    var isReady = !!state.selectedBirth && !!state.selectedGender && !!state.selectedLinggen;

    var birthKeys = Object.keys(c.BIRTHS || {});

    var lockedTraitCount = (state.currentTraitOptions || []).filter(function (t) {
      return t && t.locked;
    }).length;
    var traitBtnDisabled = mortal || lockedTraitCount >= 5;
    var linggenBtnDisabled = mortal;
    var traitRandomTitle =
      traitBtnDisabled && !mortal && lockedTraitCount >= 5 ? "五格均已锁定，请先解锁至少一格后再刷新。" : "";

    var traitEmptyHint = mortal ? "当前模式不可刷新天赋。" : "尚未刷新候选词条，点击「逆天改命」开始。";

    var linggenEmptyHint = mortal ? "" : "尚未测定灵根，请点击「随机灵根」。";

    var traitMergedSummaryHtml = "";
    if (!mortal) {
      if ((state.currentTraitOptions || []).length > 0) {
        traitMergedSummaryHtml =
          '<div class="creation-trait-bonus-summary muted" style="text-align:center; font-size:12px; opacity:0.75; padding: 4px 8px 0;">点击词条可锁定；词条不影响属性，只影响命数。</div>';
      }
    }

    recomputePlayerBase();

    contentEl.innerHTML =
      '<div class="creation-step-header">' +
      "<div>" +
      '<div class="creation-step-title">' +
      '<i class="fas fa-scroll"></i>' +
      "<span>命运抉择</span>" +
      "</div>" +
      '<div class="creation-step-subtitle">按顺序完成配置后，直接开始人生</div>' +
      "</div>" +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-user"></i> 姓名</div>' +
      '<div style="max-width:620px;">' +
      '<input id="player-name-input" type="text" maxlength="24" placeholder="请输入姓名" value="' +
      escapeHtml(state.playerName || "韩立") +
      '" style="width:100%;height:48px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);background:rgba(0,0,0,0.28);color:#f3e8c8;padding:0 14px;font-size:16px;outline:none;" />' +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-pen-fancy"></i> 叙事人称</div>' +
      '<div class="creation-grid">' +
      [
        { key: "first", title: "第一人称", desc: "我" },
        { key: "second", title: "第二人称", desc: "你" },
        { key: "third", title: "第三人称", desc: String(state.playerName || "韩立") },
      ]
        .map(function (row) {
          var selected = state.narrationPerson === row.key;
          return (
            '<div class="creation-card ' +
            (selected ? "selected" : "") +
            '" data-narration-person="' +
            row.key +
            '">' +
            "<h4>" +
            row.title +
            "</h4>" +
            "<p>" +
            escapeHtml(row.desc) +
            "</p>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-venus-mars"></i> 性别</div>' +
      '<div class="creation-grid">' +
      Object.keys(c.GENDERS || {})
        .map(function (name) {
          var selected = state.selectedGender === name;
          return (
            '<div class="creation-card ' +
            (selected ? "selected" : "") +
            '" data-gender="' +
            name +
            '">' +
            "<h4>" +
            name +
            "</h4>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-baby"></i> 选择出身</div>' +
      '<div class="creation-grid">' +
      birthKeys
        .map(function (name) {
          var data = c.BIRTHS[name];
          if (!data) return "";
          var selected = state.selectedBirth === name;
          if (name === "自定义") {
            return (
              '<div class="creation-card ' +
              (selected ? "selected" : "") +
              '" data-birth="' +
              name +
              '">' +
              "<h4><span>自定义</span></h4>" +
              "<p>" +
              (state.selectedBirth === "自定义" && state.customBirth
                ? "已选: " + (state.customBirth.tag || state.customBirth.name || "自定义")
                : "点击填写自定义出身") +
              "</p>" +
              "</div>"
            );
          }
          return (
            '<div class="creation-card ' +
            (selected ? "selected" : "") +
            '" data-birth="' +
            name +
            '">' +
            "<h4><span>" +
            name +
            "</span></h4>" +
            "<p>" +
            (data.desc || "") +
            "</p>" +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-star"></i> 天赋词条</div>' +
      '<div style="display: flex; flex-direction: column; gap: 12px;">' +
      '<div class="action-buttons-grid" style="width: 100%; max-width: 620px; margin: 0 auto;">' +
      '<button id="trait-randomize-btn" class="major-action-button" type="button" ' +
      (traitBtnDisabled ? "disabled " : "") +
      (traitRandomTitle ? 'title="' + escapeHtml(traitRandomTitle) + '" ' : "") +
      ">" +
      '<i class="fas fa-dice"></i> 逆天改命' +
      "</button>" +
      "</div>" +
      '<div id="trait-options-container">' +
      ((state.currentTraitOptions || [])
        .map(function (trait) {
          var isSelected = !!trait.locked;
          return (
            '<div class="trait-card rarity-' +
            trait.rarity +
            " " +
            (isSelected ? "selected" : "") +
            '" data-trait-name="' +
            trait.name +
            '">' +
            '<div class="trait-rarity">' +
            trait.rarity +
            "</div>" +
            '<div class="trait-name">' +
            trait.name +
            "</div>" +
            '<button class="trait-detail-btn" type="button" title="查看详情">' +
            '<i class="fas fa-info-circle"></i>' +
            "</button>" +
            (isSelected ? '<div class="selected-indicator"><i class="fas fa-lock"></i></div>' : "") +
            "</div>"
          );
        })
        .join("") ||
        '<div class="muted" style="text-align:center; opacity:0.7;">' +
        traitEmptyHint +
        "</div>") +
      "</div>" +
      traitMergedSummaryHtml +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-bolt"></i> 灵根</div>' +
      '<div style="display:flex; flex-direction:column; align-items:center; gap:18px; padding: 8px 0 16px;">' +
      '<div id="linggen-result-display" style="transform: scale(1.08);">' +
      (state.selectedLinggen
        ? createLinggenOrb(state.selectedLinggen).outerHTML
        : '<div style="color:#aaa;">' + (linggenEmptyHint || "尚未选择灵根") + "</div>") +
      "</div>" +
      '<div class="action-buttons-grid" style="width:100%; max-width: 520px;">' +
      '<button id="randomize-linggen-btn" class="major-action-button" type="button" ' +
      (linggenBtnDisabled ? "disabled" : "") +
      ">" +
      '<i class="fas fa-dice-d20"></i> 随机灵根' +
      "</button>" +
      "</div>" +
      '<p class="muted creation-linggen-hint" style="text-align:center;font-size:12px;line-height:1.6;opacity:0.85;max-width:520px;margin:0;padding:6px 12px 0;">' +
      "金灵根提升物攻与法攻；木灵根提升神识；水灵根提升法力；火灵根提升血量；土灵根提升物防与法防。灵根越多，修炼越慢。" +
      "</p>" +
      "</div>" +
      '<div id="start-game-status" style="margin: 10px 0 0; font-size: 13px; opacity: 0.95;"></div>';

    navEl.innerHTML =
      '<div class="creation-nav-enhanced">' +
      '<button id="creation-back-to-splash-btn" class="major-action-button nav-btn nav-btn-back" type="button">' +
      '<i class="fas fa-home"></i>' +
      "<span>返回主界面</span>" +
      "</button>" +
      '<button id="start-game-btn" class="major-action-button nav-btn nav-btn-next" type="button" ' +
      (!isReady ? "disabled" : "") +
      ">" +
      "<span>开始人生</span>" +
      '<i class="fas fa-play"></i>' +
      "</button>" +
      "</div>";

    bindEvents(c);
  }

  function bindEvents(c) {
    var contentEl = getEl("creation-content");
    var navEl = getEl("creation-nav");
    if (!contentEl || !navEl) return;

    // 难度选择已移除：不再绑定 data-difficulty 事件（统一按「简单」处理）

    contentEl.querySelectorAll(".creation-card[data-birth]").forEach(function (card) {
      card.addEventListener("click", function () {
        var birthName = card.getAttribute("data-birth");
        if (birthName === "自定义") {
          var tag = window.prompt("自定义出身标识（必填，占位）:", "");
          if (tag === null) return;
          tag = String(tag).trim();
          if (!tag) {
            window.alert("未填写标识。");
            return;
          }
          state.selectedBirth = "自定义";
          state.customBirth = { tag: tag, name: tag };
          state.birthLocation = tag;
          renderPage();
          return;
        }
        state.selectedBirth = birthName;
        state.customBirth = null;
        var bd = c.BIRTHS && c.BIRTHS[birthName];
        var locName = bd ? resolveBirthLocationNameFromDef(bd) : "";
        if (locName) state.birthLocation = locName;
        else state.birthLocation = null;
        renderPage();
      });
    });

    contentEl.querySelectorAll("[data-gender]").forEach(function (card) {
      card.addEventListener("click", function () {
        state.selectedGender = card.getAttribute("data-gender");
        renderPage();
      });
    });
    contentEl.querySelectorAll("[data-narration-person]").forEach(function (card) {
      card.addEventListener("click", function () {
        var next = String(card.getAttribute("data-narration-person") || "").trim();
        if (!next) return;
        state.narrationPerson = next;
        renderPage();
      });
    });

    var playerNameInput = getEl("player-name-input");
    if (playerNameInput) {
      playerNameInput.addEventListener("input", function () {
        var nm = String(playerNameInput.value || "").trim().replace(/\s+/g, " ");
        state.playerName = nm || "韩立";
      });
      playerNameInput.addEventListener("blur", function () {
        var nm2 = String(playerNameInput.value || "").trim().replace(/\s+/g, " ");
        state.playerName = nm2 || "韩立";
        playerNameInput.value = state.playerName;
      });
    }

    var randomBtn = getEl("randomize-linggen-btn");
    if (randomBtn) randomBtn.addEventListener("click", handleRandomizeLinggen);

    var traitRandomBtn = getEl("trait-randomize-btn");
    if (traitRandomBtn) traitRandomBtn.addEventListener("click", handleRandomizeTraits);

    contentEl.querySelectorAll(".trait-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest(".trait-detail-btn")) return;
        handleTraitSelect(card.getAttribute("data-trait-name"));
      });
      var detailBtn = card.querySelector(".trait-detail-btn");
      if (detailBtn) {
        detailBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          var name = card.getAttribute("data-trait-name");
          var trait = (state.currentTraitOptions || []).find(function (t) {
            return t.name === name;
          });
          showTraitDetail(trait);
        });
      }
    });

    // 世界因子已移除：不再绑定 #world-factor-grid 事件

    var backBtn = navEl.querySelector("#creation-back-to-splash-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        hideFateChoice();
      });
    }

    var startBtn = navEl.querySelector("#start-game-btn");
    if (startBtn) {
      startBtn.addEventListener("click", function () {
        var statusEl = getEl("start-game-status");
        if (statusEl) {
          statusEl.style.color = "#b0b0b0";
          statusEl.textContent = "收到点击事件，准备开始...";
        }
        window.setTimeout(function () {
          handleStartGame();
        }, 0);
      });
    }
  }

  function handleStartGame() {
    var statusEl = getEl("start-game-status");
    var c = cfg();
    // 出生地 UI 已移除，但开局仍写入「出身默认地点」供主界面右侧地点条展示
    var birthLoc = "";
    if (state.birthLocation != null && String(state.birthLocation).trim() !== "") {
      birthLoc = String(state.birthLocation).trim();
    } else if (state.selectedBirth && c && c.BIRTHS && c.BIRTHS[state.selectedBirth]) {
      var bdStart = c.BIRTHS[state.selectedBirth];
      var defaultLocName = resolveBirthLocationNameFromDef(bdStart);
      if (defaultLocName) birthLoc = String(defaultLocName).trim();
    }
    function safeJsonParse(raw, fallback) {
      try {
        return JSON.parse(raw);
      } catch (_e) {
        return fallback;
      }
    }

    function readSaveIndex() {
      try {
        var raw = localStorage.getItem(SAVE_INDEX_KEY);
        var arr = raw ? safeJsonParse(raw, []) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_e) {
        return [];
      }
    }

    function writeSaveIndex(arr) {
      try {
        localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
      } catch (_e) {
        /* 忽略 */
      }
    }

    function normalizeSaveName(nm) {
      return String(nm || "").trim().replace(/\s+/g, " ");
    }

    function pickOrCreateSaveIdByName(name) {
      var idx = readSaveIndex();
      var lower = String(name).toLowerCase();
      for (var i = 0; i < idx.length; i++) {
        var it = idx[i];
        if (!it || !it.name) continue;
        if (String(it.name).toLowerCase() === lower) return String(it.id || "");
      }
      var now = typeof Date.now === "function" ? Date.now() : 0;
      var rid = String(now) + "_" + Math.random().toString(16).slice(2, 10);
      idx.unshift({ id: rid, name: name, createdAt: now, updatedAt: now });
      writeSaveIndex(idx);
      return rid;
    }

    function askSaveNameAsync() {
      var title = "开始人生";
      var msg = "请输入存档名称（必填）：";
      var defaultSaveName = String(state.playerName || "").trim() || "韩立";
      if (global.MjUiDialogs && typeof global.MjUiDialogs.prompt === "function") {
        return global.MjUiDialogs.prompt(title, msg, {
          okText: "开始",
          cancelText: "取消",
          placeholder: "例如：第一世",
          defaultValue: defaultSaveName,
          inputType: "text",
          validate: function (raw) {
            var nm = normalizeSaveName(raw);
            if (!nm) return { okEnabled: false, hint: "注意不要与已有存档同名。" };
            var idx = readSaveIndex();
            var lower = String(nm).toLowerCase();
            for (var i = 0; i < idx.length; i++) {
              var it = idx[i];
              if (!it || !it.name) continue;
              var n2 = String(it.name).trim();
              if (String(n2).toLowerCase() === lower) {
                return { okEnabled: false, hint: "已有同名存档：" + n2 };
              }
            }
            return { okEnabled: true, hint: "" };
          },
        });
      }
      return Promise.resolve(window.prompt(msg, defaultSaveName));
    }

    function continueStartWithSaveName(saveNameRaw) {
      // 开始人生前：必须填写存档名称（同名会继续写入同一存档）
      var saveName = normalizeSaveName(saveNameRaw);
      if (!saveName) {
        if (statusEl) {
          statusEl.style.color = "#e0b15a";
          statusEl.textContent = "未填写存档名称，已取消开始人生。";
        }
        return;
      }
      // 保险：即便 UI 校验漏网，也不允许同名覆盖
      try {
        var idx0 = readSaveIndex();
        var lower0 = String(saveName).toLowerCase();
        for (var k = 0; k < idx0.length; k++) {
          var it0 = idx0[k];
          if (!it0 || !it0.name) continue;
          if (String(it0.name).toLowerCase() === lower0) {
            if (statusEl) {
              statusEl.style.color = "#e57373";
              statusEl.textContent = "已有同名存档：「" + String(it0.name) + "」，请更换名称。";
            }
            return;
          }
        }
      } catch (_eDup) {}
      var saveId = pickOrCreateSaveIdByName(saveName);
      if (!saveId) {
        window.alert("创建存档失败（无法生成存档ID）。");
        return;
      }

      var payload = {
      difficulty: state.selectedDifficulty,
      playerName: String(state.playerName || "").trim() || "韩立",
      narrationPerson: state.narrationPerson === "first" || state.narrationPerson === "third" ? state.narrationPerson : "second",
      gender: state.selectedGender,
      birth: state.selectedBirth,
      customBirth: state.customBirth,
      traits: state.selectedTraits,
      linggen: state.selectedLinggen,
      worldFactors: [],
      birthLocation: birthLoc,
      realm: { major: START_REALM_MAJOR, minor: START_REALM_STAGE },
      rawRealmBase: state.rawRealmBase ? Object.assign({}, state.rawRealmBase) : null,
      playerBase: state.playerBase ? Object.assign({}, state.playerBase) : null,
      };
    console.info("[凡人修仙传] 命运抉择完成", payload);
    if (typeof global.GameLog === "object" && global.GameLog && typeof global.GameLog.info === "function") {
      global.GameLog.info("开局配置已确认（详见控制台）");
    }
    if (statusEl) {
      statusEl.style.color = "#81c784";
      statusEl.textContent = "配置已记录，后续可在此接入存档与主界面。";
    }
    global.MortalJourneyGame = global.MortalJourneyGame || {};
    var G0 = global.MortalJourneyGame;
    G0.fateChoice = payload;
    G0.startedAt = typeof Date.now === "function" ? Date.now() : 0;
    G0.realm = payload.realm ? Object.assign({}, payload.realm) : null;

    var invSlots = null;
    var gongfaSlots0 = null;
    var equippedSlots0 = null;
    if (c && typeof c.buildStartingInventorySlots === "function") {
      invSlots = c.buildStartingInventorySlots(state.selectedBirth);
      G0.inventorySlots = JSON.parse(JSON.stringify(invSlots));
    }
    if (c && typeof c.buildStartingGongfaSlots === "function") {
      gongfaSlots0 = c.buildStartingGongfaSlots(state.selectedBirth);
      G0.gongfaSlots = JSON.parse(JSON.stringify(gongfaSlots0));
    }
    if (c && typeof c.buildStartingEquippedSlots === "function") {
      equippedSlots0 = c.buildStartingEquippedSlots(state.selectedBirth);
      G0.equippedSlots = JSON.parse(JSON.stringify(equippedSlots0));
    }

    var PBR = global.PlayerBaseRuntime;
    if (PBR && typeof PBR.applyToGame === "function") {
      PBR.applyToGame(G0, payload);
      if (typeof G0.charm !== "number" || !isFinite(G0.charm)) G0.charm = DEFAULT_CHARM;
      if (typeof G0.luck !== "number" || !isFinite(G0.luck)) G0.luck = DEFAULT_LUCK;
      if (G0.playerBase) {
        if (typeof G0.playerBase.charm !== "number" || !isFinite(G0.playerBase.charm)) {
          G0.playerBase.charm = DEFAULT_CHARM;
        }
        if (typeof G0.playerBase.luck !== "number" || !isFinite(G0.playerBase.luck)) {
          G0.playerBase.luck = DEFAULT_LUCK;
        }
      }
      if (G0.playerBase) payload.playerBase = Object.assign({}, G0.playerBase);
      if (G0.rawRealmBase) payload.rawRealmBase = Object.assign({}, G0.rawRealmBase);
    } else {
      G0.playerBase = payload.playerBase ? Object.assign({}, payload.playerBase) : null;
      G0.rawRealmBase = payload.rawRealmBase ? Object.assign({}, payload.rawRealmBase) : null;
      G0.charm = DEFAULT_CHARM;
      G0.luck = DEFAULT_LUCK;
      if (G0.playerBase) {
        G0.playerBase.charm = typeof G0.playerBase.charm === "number" ? G0.playerBase.charm : DEFAULT_CHARM;
        G0.playerBase.luck = typeof G0.playerBase.luck === "number" ? G0.playerBase.luck : DEFAULT_LUCK;
      }
    }

    G0.xiuwei = 0;

    try {
      var bootstrapObj = {
          fateChoice: payload,
          startedAt: global.MortalJourneyGame.startedAt,
          xiuwei: G0.xiuwei,
          inventorySlots: invSlots,
          gongfaSlots: gongfaSlots0,
          equippedSlots: equippedSlots0,
        };
      sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(bootstrapObj));
      sessionStorage.setItem(ACTIVE_SAVE_ID_KEY, String(saveId));
      localStorage.setItem(ACTIVE_SAVE_ID_KEY, String(saveId));
      localStorage.setItem(
        SAVE_PREFIX + String(saveId),
        JSON.stringify(Object.assign({ saveId: saveId, name: saveName, updatedAt: Date.now() }, bootstrapObj)),
      );
      // 同步更新时间到索引
      try {
        var idx2 = readSaveIndex();
        for (var j = 0; j < idx2.length; j++) {
          if (idx2[j] && String(idx2[j].id || "") === String(saveId)) {
            idx2[j].updatedAt = Date.now();
            if (!idx2[j].createdAt) idx2[j].createdAt = idx2[j].updatedAt;
            if (!idx2[j].name) idx2[j].name = saveName;
            break;
          }
        }
        writeSaveIndex(idx2);
      } catch (_e2) {}
    } catch (err) {
      console.warn("[凡人修仙传] sessionStorage 写入失败，主界面可能无法还原开局数据", err);
    }

    window.location.href = "./main.html";
    }

    askSaveNameAsync().then(function (nameOrNull) {
      // prompt 取消时返回 null
      if (nameOrNull == null) {
        if (statusEl) {
          statusEl.style.color = "#e0b15a";
          statusEl.textContent = "已取消开始人生。";
        }
        return;
      }
      continueStartWithSaveName(nameOrNull);
    });
  }

  function showFateChoice() {
    if (!cfg()) {
      window.alert("MjCreationConfig 未加载。");
      return;
    }
    bindFateTraitDetailModal();
    resetState();
    var screen = getEl("character-creation-screen");
    var splash = getEl("splash-screen");
    if (screen) {
      screen.classList.remove("hidden");
      screen.setAttribute("aria-hidden", "false");
    }
    if (splash) splash.classList.add("hidden");
    renderPage();
  }

  function hideFateChoice() {
    closeFateTraitDetailModal();
    var screen = getEl("character-creation-screen");
    var splash = getEl("splash-screen");
    if (screen) {
      screen.classList.add("hidden");
      screen.setAttribute("aria-hidden", "true");
    }
    if (splash) splash.classList.remove("hidden");
  }

  global.FateChoiceController = {
    show: showFateChoice,
    hide: hideFateChoice,
    render: renderPage,
    /** 逆天改命品质权重表（可改各 `weight`，下次刷新即生效） */
    TRAIT_RARITY_WEIGHTS: TRAIT_RARITY_WEIGHTS,
    getState: function () {
      return state;
    },
    /** 当前折算后的八维（整数副本），与 MortalJourneyGame.playerBase 同步 */
    getPlayerBase: function () {
      return state.playerBase ? Object.assign({}, state.playerBase) : null;
    },
    getRawRealmBase: function () {
      return state.rawRealmBase ? Object.assign({}, state.rawRealmBase) : null;
    },
    getStartingRealm: function () {
      return { major: START_REALM_MAJOR, minor: START_REALM_STAGE };
    },
    recomputePlayerBase: recomputePlayerBase,
    /** 全局运行时：realm / rawRealmBase / playerBase / fateChoice */
    getRuntime: function () {
      return global.MortalJourneyGame;
    },
  };

  bindFateTraitDetailModal();
})(typeof window !== "undefined" ? window : globalThis);
