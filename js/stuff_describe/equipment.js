/**
 * 装备条目：按名称供 getEquipmentDescribe 查找。
 * 字段含 desc、type、grade、bonus、value（灵石等价刻度，与灵石类 value 同一数轴，非下品灵石块数）等。
 */
(function (global) {
  "use strict";

  global.MjDescribeEquipment = {
    木剑: {
      desc: "一把普通的木剑，可以用来战斗",
      grade: "下品",
      type: "武器",
      value: 10,
      bonus: { 物攻: 3 },
      magnification: { 物攻: 1.05, 法攻: 0.0 },
    },
    铁剑: {
      desc: "一把普通的铁剑，可以用来战斗",
      grade: "下品",
      type: "武器",
      value: 20,
      bonus: { 物攻: 5 },
      magnification: { 物攻: 1.1, 法攻: 0.0 },
    },
    七玄戒: {
      desc: "七玄门的弟子戒指，可以增加法力",
      grade: "下品",
      type: "法器",
      value: 20,
      bonus: { 法力: 5 },
    },
    布衣: {
      desc: "一件普通的布衣，可以用来保暖",
      grade: "下品",
      type: "防具",
      value: 10,
      bonus: { 物防: 5 },
    },
    青叶: {
      desc: "外形酷似黄叶，可载人飞行，是弟子最主要的赶路工具",
      grade: "下品",
      type: "载具",
      value: 30,
      bonus: { 脚力: 5 },
    },
    掌天瓶: {
        desc: "一个神秘的小绿瓶，似乎能催熟一切灵植。",
        grade: "神品",
        type: "法器",
        value: 10000000,
        bonus: { 气运: 10, 法力: 10 },
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
