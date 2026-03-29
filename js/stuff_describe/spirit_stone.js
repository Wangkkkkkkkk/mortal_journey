/**
 * 灵石类货币/物品：按名称查找；具体数量可由出身 stuff 的 bonus 覆盖。
 * value 为灵石等价刻度（各品阶灵石之间为不同刻度）；与装备、功法、杂物等 describe.value 同一套数轴，用于交易比价，非「颗数」表述。
 */
(function (global) {
  "use strict";

  global.MjDescribeSpiritStones = {
    下品灵石: {
      desc: "修仙界最基础的流通货币，蕴含灵气量较少。用于日常交易与低阶修炼，最为常见。",
      grade: "下品",
      value: 10,
    },
    中品灵石: {
      desc: "灵气更为精纯，是布置中阶法阵、催动法器的常见消耗品。",
      grade: "中品",
      value: 100,
    },
    上品灵石: {
      desc: "颇为稀有，蕴含浓郁精纯的灵气。常用于大额交易，或布置大型法阵、炼制高阶法宝。",
      grade: "上品",
      value: 1000,
    },
    极品灵石: {
      desc: "极为稀有的灵石，蕴含极为精纯的灵气。是布置某些上古奇阵、突破大境界瓶颈的关键之物。",
      grade: "极品",
      value: 10000,
    },
    仙品灵石: {
        desc: "人界近乎传说的存在，灵气精纯至极。极少用于交易，是布置某些上古奇阵、突破大境界瓶颈的关键之物。",
        grade: "仙品",
        value: 100000,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
