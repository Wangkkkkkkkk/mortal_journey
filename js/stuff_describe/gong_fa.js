/**
 * 功法条目：按名称供 getGongfaDescribe 查找。
 * 字段含 desc、type、grade、bonus、value（灵石等价刻度，与灵石/装备等同数轴，非块数）等。
 */
(function (global) {
  "use strict";

  global.MjDescribeGongfa = {
    长春功: {
      desc: "长春功是七玄门的入门功法，修炼后可以增加血量",
      type: "辅助",
      grade: "下品",
      value: 20,
      bonus: { 血量: 20 },
    },
    眨眼剑法: {
      desc: "眨眼剑法是七玄门的入门剑法",
      type: "攻击",
      grade: "下品",
      value: 20,
      bonus: { 法攻: 5 },
    },
    凝元功: {
      desc: "凝元功是黄枫谷的入门功法，辅助性功法，主要作用是巩固修为、凝聚法力",
      type: "辅助",
      grade: "下品",
      value: 20,
      bonus: { 法力: 10 },
    },
    青元剑诀: {
      desc: "攻防一体，后期可布强大剑阵，是人界顶级功法之一",
      type: "攻击",
      grade: "中品",
      value: 100,
      bonus: { 法攻: 5, 法防: 5 },
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
