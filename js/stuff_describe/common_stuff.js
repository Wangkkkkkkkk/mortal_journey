/**
 * 通用杂物（令牌等）：按名称供 getStuffDescribe 查找。
 * 字段与 shallowDescribeClone 一致：desc、bonus、type、value（灵石等价刻度）、grade（品阶，用于格子/弹窗配色）等。
 */
(function (global) {
  "use strict";

  global.MjDescribeStuff = {
    七玄门令牌: {
      desc: "七玄门的令牌，可以证明你是七玄门的弟子",
      grade: "下品",
      value: 10,
      bonus: {},
    },
    黄枫谷令牌: {
      desc: "黄枫谷的令牌，可以证明你是黄枫谷的弟子",
      grade: "下品",
      value: 10,
      bonus: {},
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
