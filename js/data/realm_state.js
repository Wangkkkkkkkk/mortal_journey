/**
 * 境界 · 基础属性查表（与 character_attribute.js 的 BASE_KEYS 对齐）
 * 全局：RealmState
 *
 * 用法示例：
 *   RealmState.getBaseStats("练气", "初期");
 *   RealmState.getBaseStats("化神"); // 化神无小境界，不传 stage
 */
(function (global) {
  "use strict";

  /** @type {readonly string[]} 大境界顺序（由低到高） */
  var REALM_ORDER = Object.freeze(["练气", "筑基", "结丹", "元婴", "化神"]);

  /** @type {readonly string[]} 常规小境界（化神在表中为单行，无此分级） */
  var SUB_STAGES = Object.freeze(["初期", "中期", "后期"]);

  /**
   * 与 CharacterAttribute 基础属性键一致，便于直接合并/对比
   * @typedef {Object} RealmBaseStatsRow
   * @property {string} realm 境界
   * @property {string|null} stage 小境界；化神为 null
   * @property {number} hp 血量
   * @property {number} mp 法力
   * @property {number} patk 物攻
   * @property {number} pdef 物防
   * @property {number} matk 法攻
   * @property {number} mdef 法防
   * @property {number} foot 脚力
   * @property {number} sense 神识
   */

  /**
   * 完整表（按境界从低到高、小境界初→中→后排列；末行化神无小境界）
   * @type {readonly RealmBaseStatsRow[]}
   */
  var TABLE = Object.freeze([
    { realm: "练气", stage: "初期", hp: 100, mp: 50, patk: 10, pdef: 5, matk: 20, mdef: 5, foot: 5, sense: 10 },
    { realm: "练气", stage: "中期", hp: 150, mp: 75, patk: 15, pdef: 5, matk: 30, mdef: 5, foot: 5, sense: 20 },
    { realm: "练气", stage: "后期", hp: 200, mp: 100, patk: 20, pdef: 5, matk: 40, mdef: 5, foot: 5, sense: 30 },
    { realm: "筑基", stage: "初期", hp: 300, mp: 150, patk: 30, pdef: 10, matk: 60, mdef: 10, foot: 20, sense: 50 },
    { realm: "筑基", stage: "中期", hp: 350, mp: 175, patk: 35, pdef: 10, matk: 70, mdef: 10, foot: 20, sense: 70 },
    { realm: "筑基", stage: "后期", hp: 400, mp: 200, patk: 40, pdef: 10, matk: 80, mdef: 10, foot: 20, sense: 90 },
    { realm: "结丹", stage: "初期", hp: 500, mp: 250, patk: 50, pdef: 20, matk: 100, mdef: 20, foot: 50, sense: 120 },
    { realm: "结丹", stage: "中期", hp: 650, mp: 325, patk: 65, pdef: 20, matk: 130, mdef: 20, foot: 50, sense: 150 },
    { realm: "结丹", stage: "后期", hp: 800, mp: 400, patk: 80, pdef: 20, matk: 160, mdef: 20, foot: 50, sense: 180 },
    { realm: "元婴", stage: "初期", hp: 1000, mp: 500, patk: 100, pdef: 50, matk: 200, mdef: 50, foot: 100, sense: 230 },
    { realm: "元婴", stage: "中期", hp: 2000, mp: 1000, patk: 200, pdef: 50, matk: 400, mdef: 50, foot: 100, sense: 280 },
    { realm: "元婴", stage: "后期", hp: 3000, mp: 1500, patk: 300, pdef: 50, matk: 600, mdef: 50, foot: 100, sense: 330 },
    { realm: "化神", stage: null, hp: 5000, mp: 2500, patk: 500, pdef: 100, matk: 1000, mdef: 100, foot: 200, sense: 400 },
  ]);

  var SEP = "\u0001";

  /** @type {Readonly<Record<string, RealmBaseStatsRow>>} */
  var BY_KEY = {};
  for (var i = 0; i < TABLE.length; i++) {
    var row = TABLE[i];
    var key = row.stage == null || row.stage === "" ? row.realm : row.realm + SEP + row.stage;
    BY_KEY[key] = row;
  }
  Object.freeze(BY_KEY);

  var STAT_KEYS = Object.freeze(["hp", "mp", "patk", "pdef", "matk", "mdef", "foot", "sense"]);

  /** 中文列名（与表头一致，便于日志/UI） */
  var STAT_LABEL_ZH = Object.freeze({
    hp: "血量",
    mp: "法力",
    patk: "物攻",
    pdef: "物防",
    matk: "法攻",
    mdef: "法防",
    foot: "脚力",
    sense: "神识",
  });

  function cloneStatsFromRow(row) {
    return {
      hp: row.hp,
      mp: row.mp,
      patk: row.patk,
      pdef: row.pdef,
      matk: row.matk,
      mdef: row.mdef,
      foot: row.foot,
      sense: row.sense,
    };
  }

  /**
   * 按境界 + 小境界查基础属性（仅八维数值，可直接并入 CharacterAttribute.base）
   * @param {string} realm
   * @param {string} [stage] 化神可省略
   * @returns {{ hp:number, mp:number, patk:number, pdef:number, matk:number, mdef:number, foot:number, sense:number } | null}
   */
  function getBaseStats(realm, stage) {
    if (realm == null || realm === "") return null;
    if (realm === "化神") {
      var whole = BY_KEY["化神"];
      return whole ? cloneStatsFromRow(whole) : null;
    }
    if (stage == null || stage === "") return null;
    var row = BY_KEY[realm + SEP + stage];
    return row ? cloneStatsFromRow(row) : null;
  }

  /**
   * 取完整行（含 realm、stage），便于展示
   * @param {string} realm
   * @param {string} [stage]
   * @returns {RealmBaseStatsRow | null}
   */
  function getRow(realm, stage) {
    if (realm == null || realm === "") return null;
    if (realm === "化神") {
      var w = BY_KEY["化神"];
      return w ? { realm: w.realm, stage: w.stage, hp: w.hp, mp: w.mp, patk: w.patk, pdef: w.pdef, matk: w.matk, mdef: w.mdef, foot: w.foot, sense: w.sense } : null;
    }
    if (stage == null || stage === "") return null;
    var r = BY_KEY[realm + SEP + stage];
    return r
      ? { realm: r.realm, stage: r.stage, hp: r.hp, mp: r.mp, patk: r.patk, pdef: r.pdef, matk: r.matk, mdef: r.mdef, foot: r.foot, sense: r.sense }
      : null;
  }

  function hasRow(realm, stage) {
    return getRow(realm, stage) != null;
  }

  /** @returns {readonly RealmBaseStatsRow[]} */
  function getTable() {
    return TABLE;
  }

  global.RealmState = {
    TABLE: TABLE,
    REALM_ORDER: REALM_ORDER,
    SUB_STAGES: SUB_STAGES,
    STAT_KEYS: STAT_KEYS,
    STAT_LABEL_ZH: STAT_LABEL_ZH,
    getBaseStats: getBaseStats,
    getRow: getRow,
    hasRow: hasRow,
    getTable: getTable,
  };
})(typeof window !== "undefined" ? window : globalThis);
