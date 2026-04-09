/**
 * 灵石类货币/物品：按名称查找；具体数量可由出身 stuff 的 bonus 覆盖。
 * value 为灵石等价刻度（各品阶灵石之间为不同刻度）；与装备、功法、杂物等 describe.value 同一套数轴，用于交易比价，非「颗数」表述。
 */
(function (global) {
    "use strict";
  
    global.MjDescribeSpiritStones = {
      下品灵石: {
        desc: "修仙界基础货币，灵气较少，用于日常交易。",
        grade: "下品",
        value: 10,
      },
      中品灵石: {
        desc: "灵气精纯，催动法器、布阵的常见消耗品。",
        grade: "中品",
        value: 100,
      },
      上品灵石: {
        desc: "颇为稀有，用于大额交易或炼制高阶法宝。",
        grade: "上品",
        value: 1000,
      },
      极品灵石: {
        desc: "极为稀有，是提升修为的关键之物。",
        grade: "极品",
        value: 10000,
      },
      仙品灵石: {
          desc: "人界传说，灵气精纯至极，现世必引争夺。",
          grade: "仙品",
          value: 100000,
      },
    };
  })(typeof window !== "undefined" ? window : globalThis);