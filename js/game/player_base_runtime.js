/**
 * 角色面板八维 + 魅力/气运：由境界表、灵根、难度/出身/种族/天赋、出身 stuff 词条、
 * 当前功法栏、当前佩戴栏实时合并得到（供主界面与开局存档同步）。
 */
(function (global) {
  "use strict";

  var BASE_STAT_KEYS = ["hp", "mp", "patk", "pdef", "matk", "mdef", "foot", "sense"];
  var DEFAULT_CHARM = 0;
  var DEFAULT_LUCK = 0;
  var SPECIAL_MIN = 0;
  var SPECIAL_MAX = 100;

  var ZH_BONUS_TO_PLAYER_KEY = {
    血量: "hp",
    物攻: "patk",
    物防: "pdef",
    法攻: "matk",
    法防: "mdef",
    神识: "sense",
    脚力: "foot",
    法力: "mp",
    魅力: "charm",
    气运: "luck",
  };

  function clampSpecialAttr(n, fallback) {
    if (typeof n !== "number" || !isFinite(n)) return fallback;
    var x = Math.round(n);
    if (x < SPECIAL_MIN) return SPECIAL_MIN;
    if (x > SPECIAL_MAX) return SPECIAL_MAX;
    return x;
  }

  function roundBaseStats(obj) {
    var out = {};
    for (var i = 0; i < BASE_STAT_KEYS.length; i++) {
      var k = BASE_STAT_KEYS[i];
      var v = obj && obj[k];
      out[k] = typeof v === "number" && isFinite(v) ? Math.round(v) : 0;
    }
    return out;
  }

  function mergeZhBonusesOntoPlayerBase(playerBase, bonusList) {
    var out = Object.assign({}, playerBase);
    out.charm = DEFAULT_CHARM;
    out.luck = DEFAULT_LUCK;
    for (var i = 0; i < bonusList.length; i++) {
      var b = bonusList[i];
      if (!b || typeof b !== "object") continue;
      for (var zh in b) {
        if (!Object.prototype.hasOwnProperty.call(b, zh)) continue;
        var en = ZH_BONUS_TO_PLAYER_KEY[zh];
        if (!en) continue;
        var add = b[zh];
        if (typeof add !== "number" || !isFinite(add)) continue;
        var cur = out[en];
        if (typeof cur !== "number" || !isFinite(cur)) {
          cur = en === "charm" ? DEFAULT_CHARM : en === "luck" ? DEFAULT_LUCK : 0;
        }
        out[en] = cur + add;
      }
    }
    out.charm = clampSpecialAttr(out.charm, DEFAULT_CHARM);
    out.luck = clampSpecialAttr(out.luck, DEFAULT_LUCK);
    var eight = roundBaseStats(out);
    eight.charm = out.charm;
    eight.luck = out.luck;
    return eight;
  }

  function getRealmFromFcOrG(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm);
    if (!r || typeof r !== "object") return { major: "练气", minor: "初期" };
    return {
      major: r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气",
      minor: r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期",
    };
  }

  /** 境界表八维（未乘灵根、未加任何加成），与命运抉择里 rawRealmBase 一致 */
  function snapshotRawRealmBase(fc, G) {
    var RS = global.RealmState;
    if (!RS || typeof RS.getBaseStats !== "function") return null;
    var realm = getRealmFromFcOrG(fc, G);
    var rawRow = RS.getBaseStats(realm.major, realm.minor);
    if (!rawRow) return null;
    return roundBaseStats(rawRow);
  }

  function collectStaticBonuses(fc) {
    var list = [];
    var c = global.MjCreationConfig;
    if (!fc || !c) return list;
    if (fc.difficulty && c.DIFFICULTIES && c.DIFFICULTIES[fc.difficulty] && c.DIFFICULTIES[fc.difficulty].bonus) {
      list.push(c.DIFFICULTIES[fc.difficulty].bonus);
    }
    if (fc.birth && c.BIRTHS && c.BIRTHS[fc.birth] && c.BIRTHS[fc.birth].bonus) {
      list.push(c.BIRTHS[fc.birth].bonus);
    }
    if (fc.race && c.RACES && c.RACES[fc.race] && c.RACES[fc.race].bonus) {
      list.push(c.RACES[fc.race].bonus);
    }
    var traits = fc.traits || [];
    for (var t = 0; t < traits.length; t++) {
      var tr = traits[t];
      if (tr && tr.bonus && typeof tr.bonus === "object") list.push(tr.bonus);
    }
    if (fc.birth && typeof c.collectBirthStuffBonusObjects === "function") {
      var sb = c.collectBirthStuffBonusObjects(fc.birth);
      for (var s = 0; s < sb.length; s++) list.push(sb[s]);
    }
    return list;
  }

  function lookupGongfaDefByName(name) {
    if (!name) return null;
    var C = global.MjCreationConfig;
    if (!C || !C.BIRTHS) return null;
    var want = String(name).trim();
    for (var bk in C.BIRTHS) {
      if (!Object.prototype.hasOwnProperty.call(C.BIRTHS, bk)) continue;
      var bd = C.BIRTHS[bk];
      if (!bd || !bd.gongfa || typeof bd.gongfa !== "object") continue;
      if (bd.gongfa[want]) return bd.gongfa[want];
    }
    return null;
  }

  function lookupEquipmentDefByName(name) {
    if (!name) return null;
    var C = global.MjCreationConfig;
    if (!C || !C.BIRTHS) return null;
    var want = String(name).trim();
    for (var bk in C.BIRTHS) {
      if (!Object.prototype.hasOwnProperty.call(C.BIRTHS, bk)) continue;
      var bd = C.BIRTHS[bk];
      if (!bd || !bd.equipment || typeof bd.equipment !== "object") continue;
      if (bd.equipment[want]) return bd.equipment[want];
    }
    return null;
  }

  function collectGongfaSlotBonuses(gongfaSlots) {
    var list = [];
    if (!Array.isArray(gongfaSlots)) return list;
    for (var i = 0; i < gongfaSlots.length; i++) {
      var s = gongfaSlots[i];
      if (!s) continue;
      var n = s.name != null ? s.name : s.label;
      if (!n) continue;
      if (s.bonus && typeof s.bonus === "object" && Object.keys(s.bonus).length) {
        list.push(s.bonus);
        continue;
      }
      var def = lookupGongfaDefByName(String(n));
      if (def && def.bonus && typeof def.bonus === "object" && Object.keys(def.bonus).length) {
        list.push(def.bonus);
      }
    }
    return list;
  }

  function collectEquipmentSlotBonuses(equippedSlots) {
    var list = [];
    if (!Array.isArray(equippedSlots)) return list;
    for (var i = 0; i < equippedSlots.length; i++) {
      var s = equippedSlots[i];
      if (!s) continue;
      var n = s.name != null ? s.name : s.label;
      if (!n) continue;
      if (s.bonus && typeof s.bonus === "object" && Object.keys(s.bonus).length) {
        list.push(s.bonus);
        continue;
      }
      var def = lookupEquipmentDefByName(String(n));
      if (def && def.bonus && typeof def.bonus === "object" && Object.keys(def.bonus).length) {
        list.push(def.bonus);
      }
    }
    return list;
  }

  /**
   * @param {Object|null} G MortalJourneyGame
   * @param {Object|null} fc fateChoice
   * @param {{ gongfaSlots?: Array, equippedSlots?: Array }} [overrides] 命运抉择预览用（无 G 槽位时传入开局槽快照）
   */
  function computePlayerBase(G, fc, overrides) {
    var RS = global.RealmState;
    var LS = global.LinggenState;
    if (!RS || typeof RS.getBaseStats !== "function") return null;

    var rawRealm = snapshotRawRealmBase(fc, G);
    if (!rawRealm) return null;

    var realm = getRealmFromFcOrG(fc, G);
    var major = realm.major;
    var linggen = fc && fc.linggen != null ? String(fc.linggen) : "";

    var merged =
      LS && typeof LS.applyToBase === "function"
        ? LS.applyToBase(rawRealm, major, linggen)
        : Object.assign({}, rawRealm);
    merged = roundBaseStats(merged);

    var bonusList = collectStaticBonuses(fc);

    var ovr = overrides || {};
    var gfSlots = ovr.gongfaSlots != null ? ovr.gongfaSlots : G && G.gongfaSlots;
    var eqSlots = ovr.equippedSlots != null ? ovr.equippedSlots : G && G.equippedSlots;

    var gb = collectGongfaSlotBonuses(gfSlots);
    for (var a = 0; a < gb.length; a++) bonusList.push(gb[a]);
    var eb = collectEquipmentSlotBonuses(eqSlots);
    for (var b = 0; b < eb.length; b++) bonusList.push(eb[b]);

    return mergeZhBonusesOntoPlayerBase(merged, bonusList);
  }

  /**
   * 上限变化时同步当前值：增加多少上限就加多少当前值，减少多少就扣多少，再钳制到 [0, newMax]。
   * 无有效旧上限或当前值时，用 fullFill（一般为新上限）作为当前值。
   */
  function syncCurrentResource(prevMax, newMax, current, fullFill) {
    var nMax = typeof newMax === "number" && isFinite(newMax) ? Math.max(1, Math.round(newMax)) : 1;
    var fill =
      typeof fullFill === "number" && isFinite(fullFill) ? Math.max(1, Math.round(fullFill)) : nMax;
    if (current == null || typeof current !== "number" || !isFinite(current)) {
      return Math.min(fill, nMax);
    }
    if (prevMax == null || typeof prevMax !== "number" || !isFinite(prevMax)) {
      return Math.min(fill, nMax);
    }
    var prev = Math.max(1, Math.round(prevMax));
    var delta = nMax - prev;
    var next = Math.round(current) + delta;
    if (next < 0) return 0;
    if (next > nMax) return nMax;
    return next;
  }

  function applyToGame(G, fc, overrides) {
    if (!G) return null;
    var pb = computePlayerBase(G, fc, overrides);
    if (!pb) return null;

    var raw = snapshotRawRealmBase(fc, G);
    if (raw) G.rawRealmBase = Object.assign({}, raw);

    var prevMaxH = G.maxHp;
    var prevMaxM = G.maxMp;
    var prevCurH = G.currentHp;
    var prevCurM = G.currentMp;

    G.playerBase = Object.assign({}, pb);
    if (typeof G.playerBase.charm === "number") G.charm = G.playerBase.charm;
    if (typeof G.playerBase.luck === "number") G.luck = G.playerBase.luck;

    G.maxHp = Math.max(1, pb.hp);
    G.maxMp = Math.max(1, pb.mp);

    G.currentHp = syncCurrentResource(prevMaxH, G.maxHp, prevCurH, pb.hp);
    G.currentMp = syncCurrentResource(prevMaxM, G.maxMp, prevCurM, pb.mp);

    if (fc && typeof fc === "object") {
      fc.playerBase = Object.assign({}, pb);
    }

    return pb;
  }

  global.PlayerBaseRuntime = {
    computePlayerBase: computePlayerBase,
    applyToGame: applyToGame,
    snapshotRawRealmBase: snapshotRawRealmBase,
    collectStaticBonuses: collectStaticBonuses,
    collectGongfaSlotBonuses: collectGongfaSlotBonuses,
    collectEquipmentSlotBonuses: collectEquipmentSlotBonuses,
  };
})(typeof window !== "undefined" ? window : globalThis);
