/**
 * 功法条目：按名称供 getGongfaDescribe 查找。
 * 字段含 desc、type、grade、bonus、value（灵石等价刻度，与灵石/装备等同数轴，非块数）等。
 */
(function (global) {
  "use strict";

  global.MjDescribeGongfa = {
    基础剑诀: {
      desc: "最基础的入门剑诀",
      type: "功法",
      subType: "攻击",
      grade: "下品",
      value: 10,
      bonus: { 法攻: 3 },
      magnification: { 物攻: 0.0, 法攻: 1.02 },
      manacost: 10,
    },
    眨眼剑法: {
      desc: "眨眼剑法是七玄门的入门剑法",
      type: "功法",
      subType: "攻击",
      grade: "下品",
      value: 20,
      bonus: { 法攻: 5 },
      magnification: { 物攻: 0.0, 法攻: 1.05 },
      manacost: 20,
    },
    青元剑诀: {
      desc: "攻防一体，是优秀的剑术功法",
      type: "功法",
      subType: "攻击",
      grade: "中品",
      value: 100,
      bonus: { 法攻: 10, 法防: 10 },
      magnification: { 物攻: 0.0, 法攻: 1.2 },
      manacost: 20,
    },
    长春功: {
      desc: "长春功是七玄门的入门功法，修炼后可以增加血量",
      type: "功法",
      subType: "辅助",
      grade: "下品",
      value: 20,
      bonus: { 血量: 20 },
    },

    凝元功: {
      desc: "凝元功是黄枫谷的入门功法，辅助性功法，主要作用是巩固修为、凝聚法力",
      type: "功法",
      subType: "辅助",
      grade: "下品",
      value: 20,
      bonus: { 法力: 10 },
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
