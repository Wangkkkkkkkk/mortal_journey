/**
 * 命运抉择：对齐 ref_html 开辟鸿蒙单页框架（精简版，无 Dexie / 地图）
 */
(function (global) {
  "use strict";

  var cfg = function () {
    return global.MjCreationConfig;
  };

  /** 命运抉择内默认修为：练气初期（查 realm_state + leegen_state） */
  var START_REALM_MAJOR = "练气";
  var START_REALM_STAGE = "初期";

  var state = {
    selectedDifficulty: null,
    selectedBirth: null,
    customBirth: null,
    selectedGender: null,
    selectedRace: null,
    customRace: null,
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

  function resetState() {
    state.selectedDifficulty = null;
    state.selectedBirth = null;
    state.customBirth = null;
    state.selectedGender = null;
    state.selectedRace = null;
    state.customRace = null;
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

  /** 与 mainScreen 默认一致；魅力/气运由 PlayerBaseRuntime 合并 bonus 后限制在 [0,100] */
  var DEFAULT_CHARM = 0;
  var DEFAULT_LUCK = 0;

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
   * 与主界面一致：境界表 + 灵根 + 难度/出身/种族/天赋/出身 stuff + 当前出身对应的功法栏与佩戴栏快照。
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
      race: state.selectedRace,
      traits: state.selectedTraits,
      linggen: state.selectedLinggen,
      realm: { major: START_REALM_MAJOR, minor: START_REALM_STAGE },
      worldFactors: state.selectedWorldFactors,
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

  /** 灵根或折算结果变化时打印到控制台（及 GameLog），避免每次点选世界因子刷屏 */
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
      if (typeof G.playerBase.luck === "number") G.luck = G.playerBase.luck;
    } else {
      G.playerBase = null;
    }
  }

  function isMortalMode() {
    return state.selectedDifficulty === "凡人";
  }

  /** 凡人模式：锁定出身/种族并清空天赋；灵根每次进入该模式时随机测定（不可手动再刷） */
  function applyMortalModeLocks() {
    state.selectedBirth = "凡人";
    state.customBirth = null;
    var c = cfg();
    var fm = c && c.BIRTHS && c.BIRTHS.凡人;
    if (fm && fm.location != null && String(fm.location).trim() !== "") {
      state.birthLocation = String(fm.location).trim();
    }
    state.selectedRace = "人族";
    state.customRace = null;
    state.currentTraitOptions = [];
    state.selectedTraits = [];
    applyRandomLinggenRollToState();
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
    if (!state.selectedDifficulty) {
      window.alert("请先选择难度模式。");
      return;
    }
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
      return excludeNames.indexOf(t.name) === -1;
    });
    var out = [];
    for (var i = 0; i < count && bag.length; i++) {
      var idx = Math.floor(Math.random() * bag.length);
      var t = bag.splice(idx, 1)[0];
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
    if (!state.selectedDifficulty) {
      window.alert("请先选择难度模式。");
      return;
    }
    if (isMortalMode()) {
      return;
    }
    var locked = (state.currentTraitOptions || []).filter(function (t) {
      return t && t.locked;
    });
    if (locked.length >= 5) {
      window.alert("当前候选词条均已锁定，请先点击词条解锁后再逆天改命。");
      return;
    }
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

  function showTraitDetail(trait) {
    if (!trait) return;
    var msg = (trait.name || "") + "\n品质: " + (trait.rarity || "") + "\n" + (trait.desc || "") + "\n效果: " + (trait.effects || "");
    window.alert(msg);
  }

  function renderPage() {
    var contentEl = getEl("creation-content");
    var navEl = getEl("creation-nav");
    var indicatorEl = getEl("creation-step-indicator");
    var c = cfg();
    if (!c || !contentEl || !navEl) return;

    if (indicatorEl) indicatorEl.innerHTML = "";

    var birthLocationText = state.birthLocation ? String(state.birthLocation).split("|")[0] : "尚未选择";
    var selectedWorldFactors = state.selectedWorldFactors || [];
    var mortal = isMortalMode();
    var diffReady = !!state.selectedDifficulty;
    var modeHint = !diffReady
      ? "请先选择难度：简单（自由）或凡人（固定出身/种族；灵根每次选凡人时自动随机，不可手动再刷；天赋不可刷新）"
      : mortal
        ? "凡人模式：以真正的凡人开始游戏，有额外气运加成。"
        : "简单模式：可自由选择，灵根与天赋可无限次刷新。";
    var isReady =
      !!state.selectedDifficulty &&
      !!state.selectedBirth &&
      !!state.selectedGender &&
      !!state.selectedRace &&
      !!state.selectedLinggen &&
      !!state.birthLocation;

    var diffKeys = ["简单", "凡人"];
    var difficultyCardsHtml = diffKeys
      .filter(function (k) {
        return c.DIFFICULTIES && c.DIFFICULTIES[k];
      })
      .map(function (name) {
        var data = c.DIFFICULTIES[name];
        var selected = state.selectedDifficulty === name;
        return (
          '<div class="creation-card ' +
          (selected ? "selected" : "") +
          '" data-difficulty="' +
          name +
          '">' +
          "<h4><span>" +
          name +
          "</span></h4>" +
          (data.desc ? '<p style="opacity:0.9;">' + data.desc + "</p>" : "") +
          "</div>"
        );
      })
      .join("");

    var birthKeys = mortal ? ["凡人"] : Object.keys(c.BIRTHS || {});
    var raceKeys = mortal ? ["人族"] : Object.keys(c.RACES || {});

    var traitBtnDisabled = !diffReady || mortal;
    var linggenBtnDisabled = !diffReady || mortal;

    var traitEmptyHint = mortal
      ? "凡人模式不可刷新天赋。"
      : !diffReady
        ? "请先选择难度后再刷新候选词条。"
        : "尚未刷新候选词条，点击「逆天改命」开始。";

    var linggenEmptyHint = mortal
      ? ""
      : !diffReady
        ? "请先选择难度。"
        : "尚未测定灵根，请点击「随机灵根」。";

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
      '<div id="mode-hint-banner" class="mode-hint-banner">' +
      '<i class="fas fa-info-circle"></i>' +
      "<span>" +
      modeHint +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-mountain"></i> 选择难度</div>' +
      '<div class="creation-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">' +
      difficultyCardsHtml +
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
      '<div class="creation-section-title"><i class="fas fa-dna"></i> 选择种族</div>' +
      '<div class="creation-grid">' +
      raceKeys
        .map(function (name) {
          var data = c.RACES[name];
          if (!data) return "";
          var selected = state.selectedRace === name;
          if (name === "自定义") {
            return (
              '<div class="creation-card ' +
              (selected ? "selected" : "") +
              '" data-race="' +
              name +
              '">' +
              "<h4><span>自定义</span></h4>" +
              "<p>" +
              (state.selectedRace === "自定义" && state.customRace
                ? "已选: " + (state.customRace.tag || state.customRace.name || "自定义")
                : "点击填写自定义种族") +
              "</p>" +
              "</div>"
            );
          }
          return (
            '<div class="creation-card ' +
            (selected ? "selected" : "") +
            '" data-race="' +
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
      (traitBtnDisabled ? "disabled" : "") +
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
      "</div>" +
      '<div class="creation-section-title"><i class="fas fa-globe"></i> 世界因子（可多选）</div>' +
      '<div class="creation-grid" id="world-factor-grid">' +
      Object.entries(c.WORLD_FACTORS || {})
        .map(function (entry) {
          var name = entry[0];
          var data = entry[1];
          var selected = selectedWorldFactors.some(function (f) {
            return f.name === name && !f.isCustom;
          });
          return (
            '<div class="creation-card ' +
            (selected ? "selected" : "") +
            '" data-factor-name="' +
            name +
            '">' +
            "<h4>" +
            name +
            "</h4>" +
            "<p>" +
            (data.desc || "") +
            "</p>" +
            "</div>"
          );
        })
        .join("") +
      '<div class="creation-card" data-factor-name="__custom__">' +
      "<h4><span>自定义</span></h4>" +
      "<p>" +
      (selectedWorldFactors.filter(function (f) {
        return f.isCustom;
      }).length
        ? "已选 " +
          selectedWorldFactors.filter(function (f) {
            return f.isCustom;
          }).length +
          " 个自定义世界因子"
        : "点击填写自定义世界因子") +
      "</p>" +
      "</div>" +
      "</div>" +
      (selectedWorldFactors.filter(function (f) {
        return f.isCustom;
      }).length
        ? '<ul id="custom-world-factors-inline-list" style="padding-left:0; margin:12px 0 18px;">' +
          selectedWorldFactors
            .filter(function (f) {
              return f.isCustom;
            })
            .map(function (f) {
              return (
                '<li style="list-style:none; background: rgba(255,255,255,0.05); padding:8px 10px; border-radius:10px; margin-bottom:8px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
                '<strong style="color:#ffb74d;">' +
                f.name +
                '</strong><button class="major-action-button small-font-btn" type="button" data-remove-custom-factor="' +
                f.name +
                '" style="width:auto; padding:4px 10px;">移除</button>' +
                "</div>" +
                '<div style="color:#ccc; font-size:0.92em; margin-top:4px;">' +
                (f.desc || "") +
                "</div>" +
                '<div style="color:#aaa; font-size:0.88em; margin-top:3px;">效果：' +
                (f.effect || "") +
                "</div>" +
                "</li>"
              );
            })
            .join("") +
          "</ul>"
        : "") +
      '<div class="creation-section-title"><i class="fas fa-map-marked-alt"></i> 出生地</div>' +
      '<div class="panel-card" style="max-width: 820px;">' +
      '<p style="margin:0; color:#ddd;">出生地：<strong style="color:#ffd700;">' +
      birthLocationText +
      "</strong></p>" +
      '<div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">' +
      '<button id="select-birth-location-btn" class="major-action-button" type="button">' +
      '<i class="fas fa-map-signs"></i> 选择出生地' +
      "</button>" +
      "</div>" +
      "</div>" +
      '<div id="start-game-status" style="max-width:820px; margin: 10px auto 0; font-size: 13px; opacity: 0.95;"></div>';

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

    contentEl.querySelectorAll("[data-difficulty]").forEach(function (card) {
      card.addEventListener("click", function () {
        var name = card.getAttribute("data-difficulty");
        state.selectedDifficulty = name;
        if (name === "凡人") {
          applyMortalModeLocks();
        }
        renderPage();
      });
    });

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
          renderPage();
          return;
        }
        state.selectedBirth = birthName;
        state.customBirth = null;
        var bd = c.BIRTHS && c.BIRTHS[birthName];
        if (bd && bd.location != null && String(bd.location).trim() !== "") {
          state.birthLocation = String(bd.location).trim();
        }
        renderPage();
      });
    });

    contentEl.querySelectorAll("[data-gender]").forEach(function (card) {
      card.addEventListener("click", function () {
        state.selectedGender = card.getAttribute("data-gender");
        renderPage();
      });
    });

    contentEl.querySelectorAll("[data-race]").forEach(function (card) {
      card.addEventListener("click", function () {
        var raceName = card.getAttribute("data-race");
        if (raceName === "自定义") {
          var tag = window.prompt("自定义种族标识（必填，占位）:", "");
          if (tag === null) return;
          tag = String(tag).trim();
          if (!tag) {
            window.alert("未填写标识。");
            return;
          }
          state.selectedRace = "自定义";
          state.customRace = { tag: tag, name: tag };
          renderPage();
          return;
        }
        state.selectedRace = raceName;
        state.customRace = null;
        renderPage();
      });
    });

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

    contentEl.querySelectorAll("#world-factor-grid .creation-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var name = card.getAttribute("data-factor-name");
        if (name === "__custom__") {
          var n = window.prompt("自定义世界因子名称:", "");
          if (n === null || !String(n).trim()) return;
          var desc = window.prompt("背景描述（可空）:", "") || "";
          var effect = window.prompt("具体效果（可空）:", "") || "";
          state.selectedWorldFactors.push({
            name: String(n).trim(),
            desc: desc,
            effect: effect,
            isCustom: true,
          });
          renderPage();
          return;
        }
        var factorData = c.WORLD_FACTORS[name];
        var idx = state.selectedWorldFactors.findIndex(function (f) {
          return f.name === name && !f.isCustom;
        });
        if (idx > -1) state.selectedWorldFactors.splice(idx, 1);
        else
          state.selectedWorldFactors.push({
            name: name,
            desc: factorData.desc,
            effect: factorData.effect,
            isCustom: false,
          });
        renderPage();
      });
    });

    contentEl.querySelectorAll("[data-remove-custom-factor]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-remove-custom-factor");
        var idx = state.selectedWorldFactors.findIndex(function (f) {
          return f.isCustom && f.name === name;
        });
        if (idx > -1) {
          state.selectedWorldFactors.splice(idx, 1);
          renderPage();
        }
      });
    });

    var birthBtn = getEl("select-birth-location-btn");
    if (birthBtn) {
      birthBtn.addEventListener("click", function () {
        var def = "天南 · 青牛镇";
        var v = window.prompt("出生地（可填写地区名）:", state.birthLocation || def);
        if (v === null) return;
        v = String(v).trim();
        state.birthLocation = v || def;
        renderPage();
      });
    }

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
    if (state.selectedBirth && c && c.BIRTHS && c.BIRTHS[state.selectedBirth]) {
      var bl = c.BIRTHS[state.selectedBirth].location;
      if (
        (state.birthLocation == null || String(state.birthLocation).trim() === "") &&
        bl != null &&
        String(bl).trim() !== ""
      ) {
        state.birthLocation = String(bl).trim();
      }
    }
    var payload = {
      difficulty: state.selectedDifficulty,
      gender: state.selectedGender,
      birth: state.selectedBirth,
      customBirth: state.customBirth,
      race: state.selectedRace,
      customRace: state.customRace,
      traits: state.selectedTraits,
      linggen: state.selectedLinggen,
      worldFactors: state.selectedWorldFactors,
      birthLocation: state.birthLocation,
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
      if (G0.playerBase) payload.playerBase = Object.assign({}, G0.playerBase);
      if (G0.rawRealmBase) payload.rawRealmBase = Object.assign({}, G0.rawRealmBase);
    } else {
      G0.playerBase = payload.playerBase ? Object.assign({}, payload.playerBase) : null;
      G0.rawRealmBase = payload.rawRealmBase ? Object.assign({}, payload.rawRealmBase) : null;
    }

    try {
      sessionStorage.setItem(
        "mortal_journey_bootstrap_v1",
        JSON.stringify({
          fateChoice: payload,
          startedAt: global.MortalJourneyGame.startedAt,
          inventorySlots: invSlots,
          gongfaSlots: gongfaSlots0,
          equippedSlots: equippedSlots0,
        }),
      );
    } catch (err) {
      console.warn("[凡人修仙传] sessionStorage 写入失败，主界面可能无法还原开局数据", err);
    }

    window.location.href = "./main.html";
  }

  function showFateChoice() {
    if (!cfg()) {
      window.alert("MjCreationConfig 未加载。");
      return;
    }
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
})(typeof window !== "undefined" ? window : globalThis);
