/**
 * 灵根对基础属性的境界倍率（与 character_attribute.js / realm_state.js 键名一致）
 * 文件名为 leegen_state.js，全局导出 LinggenState（并别名 LeegenState）
 *
 * 规则：
 * - 金 → 物攻、法攻；木 → 神识；水 → 法力；火 → 血量；土 → 物防、法防
 * - 倍率按大境界：练气 1.05，筑基 1.10，结丹 1.20，元婴 1.5，化神 2.0（与初期/中期/后期无关）
 *
 * 用法（与 PlayerBaseRuntime 一致：须在境界表 + 全部平面加成合并之后再乘）：
 *   LinggenState.applyToBase(已含天赋装备等加成的面板, "练气", "真灵根 金, 木");
 */
(function (global) {
  "use strict";

  /** 五行字符（用于从灵根描述中解析） */
  var ELEMENT_CHARS = Object.freeze(["金", "木", "水", "火", "土"]);

  /**
   * 各灵根影响的属性键（与 CharacterAttribute base 一致）
   * @type {Readonly<Record<string, readonly string[]>>}
   */
  var ELEMENT_TO_STATS = Object.freeze({
    金: Object.freeze(["patk", "matk"]),
    木: Object.freeze(["sense"]),
    水: Object.freeze(["mp"]),
    火: Object.freeze(["hp"]),
    土: Object.freeze(["pdef", "mdef"]),
  });

  /**
   * 大境界 → 灵根倍率（练气含初/中/后期，均用同一倍率）
   * @type {Readonly<Record<string, number>>}
   */
  var REALM_LINGGEN_MULT = Object.freeze({
    练气: 1.05,
    筑基: 1.1,
    结丹: 1.2,
    元婴: 1.5,
    化神: 2.0,
  });

  var DEFAULT_MULT = 1.0;

  /**
   * 规范化大境界名（支持「练气期」、带空格等）
   * @param {string} realm
   * @returns {string}
   */
  function normalizeRealm(realm) {
    if (realm == null) return "";
    var s = String(realm).trim();
    if (s.endsWith("期")) s = s.slice(0, -1).trim();
    return s;
  }

  /**
   * 取当前大境界下，每个灵根提供的倍率（若境界未知则 1.0）
   * @param {string} realm 大境界，如「练气」或「练气期」
   * @returns {number}
   */
  function getRealmMultiplier(realm) {
    var key = normalizeRealm(realm);
    if (REALM_LINGGEN_MULT.hasOwnProperty(key)) return REALM_LINGGEN_MULT[key];
    return DEFAULT_MULT;
  }

  /**
   * 从灵根字符串中解析出现的五行（去重，按首次出现顺序）
   * 例："真灵根 金, 木" → ["金","木"]；"无灵根" → []
   * @param {string} linggenText
   * @returns {string[]}
   */
  function parseElements(linggenText) {
    if (linggenText == null || linggenText === "") return [];
    var text = String(linggenText);
    var set = {};
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ELEMENT_CHARS.indexOf(ch) === -1) continue;
      if (set[ch]) continue;
      set[ch] = true;
      out.push(ch);
    }
    return out;
  }

  /**
   * @param {string} element 金|木|水|火|土
   * @returns {readonly string[]}
   */
  function getAffectedStatKeys(element) {
    var keys = ELEMENT_TO_STATS[element];
    return keys ? keys : Object.freeze([]);
  }

  /**
   * 将灵根倍率应用到「已合并平面加成后」的属性（不修改入参，返回新对象）。
   * 多种灵根各乘各负责属性；同一属性被多条规则命中时会多次相乘（当前五行分工下通常不会重叠）。
   * 魅力/气运若存在于入参中会原样拷贝，本函数不修改这两项。
   * @param {Object} baseStats 已含境界底数 + 难度/出身/天赋/stuff/功法/装备等加成的 hp, mp, …
   * @param {string} realm 大境界
   * @param {string} linggenText 灵根完整描述
   * @returns {Object}
   */
  function applyToBase(baseStats, realm, linggenText) {
    var src = baseStats || {};
    var out = shallowCopyBase(src);
    var elements = parseElements(linggenText);
    if (elements.length === 0) return out;

    var mult = getRealmMultiplier(realm);
    if (mult === DEFAULT_MULT) return out;

    for (var e = 0; e < elements.length; e++) {
      var el = elements[e];
      var stats = ELEMENT_TO_STATS[el];
      if (!stats) continue;
      for (var s = 0; s < stats.length; s++) {
        var key = stats[s];
        if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
        var v = out[key];
        if (typeof v !== "number" || !isFinite(v)) continue;
        out[key] = v * mult;
      }
    }

    return out;
  }

  function shallowCopyBase(src) {
    var out = {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) {
        out[k] = src[k];
      }
    }
    return out;
  }

  var api = {
    ELEMENT_CHARS: ELEMENT_CHARS,
    ELEMENT_TO_STATS: ELEMENT_TO_STATS,
    REALM_LINGGEN_MULT: REALM_LINGGEN_MULT,
    normalizeRealm: normalizeRealm,
    getRealmMultiplier: getRealmMultiplier,
    parseElements: parseElements,
    getAffectedStatKeys: getAffectedStatKeys,
    applyToBase: applyToBase,
  };

  global.LinggenState = api;
  global.LeegenState = api;
})(typeof window !== "undefined" ? window : globalThis);
