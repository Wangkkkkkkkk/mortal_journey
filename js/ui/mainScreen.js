/**
 * 主界面（main.html）骨架：恢复开局数据、填充左栏属性占位
 * 全局可读：MortalJourneyGame（由 sessionStorage 或他页注入）
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "mortal_journey_bootstrap_v1";

  var STAT_ORDER = [
    { key: "hp", label: "血量" },
    { key: "mp", label: "法力" },
    { key: "patk", label: "物攻" },
    { key: "pdef", label: "物防" },
    { key: "matk", label: "法攻" },
    { key: "mdef", label: "法防" },
    { key: "foot", label: "脚力" },
    { key: "sense", label: "神识" },
  ];

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

  function fillPlayerPanel(fc) {
    var list = document.getElementById("mj-player-attr-list");
    var hint = document.getElementById("mj-player-attr-hint");
    if (!list) return;

    list.innerHTML = "";
    var base = global.MortalJourneyGame && global.MortalJourneyGame.playerBase;

    if (!base) {
      if (hint) {
        hint.textContent = "未找到开局属性（请从「开始新人生」进入，或直接打开本页仅供预览布局）。";
      }
      return;
    }

    if (hint) {
      var realm = (fc && fc.realm) || global.MortalJourneyGame.realm || {};
      var major = realm.major || "—";
      var minor = realm.minor || "—";
      var ling = (fc && fc.linggen) || "—";
      hint.textContent = "修为：" + major + " · " + minor + "　灵根：" + ling;
    }

    for (var i = 0; i < STAT_ORDER.length; i++) {
      var row = STAT_ORDER[i];
      var v = base[row.key];
      var li = document.createElement("li");
      var s1 = document.createElement("span");
      s1.textContent = row.label;
      var s2 = document.createElement("span");
      s2.textContent = typeof v === "number" && isFinite(v) ? String(v) : "—";
      li.appendChild(s1);
      li.appendChild(s2);
      list.appendChild(li);
    }
  }

  function init() {
    var fc = restoreBootstrap();
    fillPlayerPanel(fc);

    var sendBtn = document.getElementById("mj-chat-send");
    var textarea = document.getElementById("mj-chat-input");
    if (sendBtn && textarea) {
      sendBtn.addEventListener("click", function () {
        console.info("[主界面] 发送（占位）", textarea.value);
      });
    }

    console.info("[主界面] 骨架已加载", global.MortalJourneyGame || null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
