/**
 * 角色面板八维 + 魅力/气运：由境界表、难度/出身/天赋、出身 stuff、功法栏、佩戴栏
 * 等平面加成先合并，再按灵根五行对大境界倍率做乘法（魅力/气运不参与灵根乘）。
 * NPC / MjCharacterSheet：用 computePlayerBaseFromCharacterSheet 从 realm、linggen、traits、槽位构造与主角相同的 fc+overrides，再走同一套 computePlayerBase。
 * 后续若增加「百分比」类加成，建议先在平面阶段以加减形式累计，最后与本文件的灵根乘法一步统一处理。
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

  /** 灵根乘法之后：八维取整，魅力/气运再钳制（灵根不改这两项，沿用平面阶段结果） */
  function finalizeAfterLinggenMultiply(pb) {
    var eight = roundBaseStats(pb);
    eight.charm = clampSpecialAttr(pb && pb.charm, DEFAULT_CHARM);
    eight.luck = clampSpecialAttr(pb && pb.luck, DEFAULT_LUCK);
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
    if (!C || typeof C.getGongfaDescribe !== "function") return null;
    return C.getGongfaDescribe(String(name).trim());
  }

  function lookupEquipmentDefByName(name) {
    if (!name) return null;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getEquipmentDescribe !== "function") return null;
    return C.getEquipmentDescribe(String(name).trim());
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

    var merged = roundBaseStats(Object.assign({}, rawRealm));

    var bonusList = collectStaticBonuses(fc);

    var ovr = overrides || {};
    var gfSlots = ovr.gongfaSlots != null ? ovr.gongfaSlots : G && G.gongfaSlots;
    var eqSlots = ovr.equippedSlots != null ? ovr.equippedSlots : G && G.equippedSlots;

    var gb = collectGongfaSlotBonuses(gfSlots);
    for (var a = 0; a < gb.length; a++) bonusList.push(gb[a]);
    var eb = collectEquipmentSlotBonuses(eqSlots);
    for (var b = 0; b < eb.length; b++) bonusList.push(eb[b]);

    var afterFlat = mergeZhBonusesOntoPlayerBase(merged, bonusList);
    var afterLinggen =
      LS && typeof LS.applyToBase === "function"
        ? LS.applyToBase(afterFlat, major, linggen)
        : Object.assign({}, afterFlat);
    return finalizeAfterLinggenMultiply(afterLinggen);
  }

  /**
   * 与主角同一公式：境界表底数 +（可选）难度/出身/天赋/birth stuff + 功法/装备槽位平面加成 + 灵根倍率。
   * @param {Object} sheet 与 MjCharacterSheet 同构：realm、linggen、traits、gongfaSlots、equippedSlots；可选 difficulty、birth（与开局 fc 一致时参与静态加成）
   * @returns {Object|null}
   */
  function computePlayerBaseFromCharacterSheet(sheet) {
    if (!sheet || typeof sheet !== "object") return null;
    var r = sheet.realm && typeof sheet.realm === "object" ? sheet.realm : {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minor =
      major === "化神"
        ? null
        : r.minor != null && String(r.minor).trim() !== ""
          ? String(r.minor).trim()
          : "初期";
    var fc = {
      realm: major === "化神" ? { major: major, minor: null } : { major: major, minor: minor },
      linggen: sheet.linggen != null ? String(sheet.linggen) : "",
      traits: Array.isArray(sheet.traits) ? sheet.traits : [],
    };
    if (sheet.difficulty != null && String(sheet.difficulty).trim() !== "") {
      fc.difficulty = String(sheet.difficulty).trim();
    }
    if (sheet.birth != null && String(sheet.birth).trim() !== "") {
      fc.birth = String(sheet.birth).trim();
    }
    var overrides = {
      gongfaSlots: Array.isArray(sheet.gongfaSlots) ? sheet.gongfaSlots : [],
      equippedSlots: Array.isArray(sheet.equippedSlots) ? sheet.equippedSlots : [],
    };
    return computePlayerBase(null, fc, overrides);
  }

  /**
   * 将计算结果写回角色单（playerBase、maxHp/maxMp、current 按上限变化同步，与 applyToGame 一致）。
   * @param {Object} sheet
   * @returns {boolean} 是否成功写入
   */
  function applyComputedPlayerBaseToCharacterSheet(sheet) {
    if (!sheet || typeof sheet !== "object") return false;
    var pb = computePlayerBaseFromCharacterSheet(sheet);
    if (!pb) return false;
    var prevMaxH = sheet.maxHp;
    var prevMaxM = sheet.maxMp;
    var prevCurH = sheet.currentHp;
    var prevCurM = sheet.currentMp;
    sheet.playerBase = Object.assign({}, pb);
    sheet.maxHp = Math.max(1, pb.hp);
    sheet.maxMp = Math.max(1, pb.mp);
    sheet.currentHp = syncCurrentResource(prevMaxH, sheet.maxHp, prevCurH, pb.hp);
    sheet.currentMp = syncCurrentResource(prevMaxM, sheet.maxMp, prevCurM, pb.mp);
    return true;
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
    computePlayerBaseFromCharacterSheet: computePlayerBaseFromCharacterSheet,
    applyComputedPlayerBaseToCharacterSheet: applyComputedPlayerBaseToCharacterSheet,
    applyToGame: applyToGame,
    snapshotRawRealmBase: snapshotRawRealmBase,
    collectStaticBonuses: collectStaticBonuses,
    collectGongfaSlotBonuses: collectGongfaSlotBonuses,
    collectEquipmentSlotBonuses: collectEquipmentSlotBonuses,
  };
})(typeof window !== "undefined" ? window : globalThis);
