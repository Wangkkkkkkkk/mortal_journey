/**
 * 丹药条目：按名称供 MjCreationConfig.getStuffDescribe、背包弹窗等查找。
 * 字段与 shallowDescribeClone 一致：desc、bonus、type、value、grade 等。
 * - value（可选）：炼化修为数额，且与全局灵石等价刻度一致，可作交易比价；非「下品灵石块数」。
 * - bonus（可选）：永久或展示用属性加成说明，同杂物。
 */
(function (global) {
  "use strict";

  global.MjDescribePills = {
    筑基丹: {
      desc:
        "练气期修士突破筑基的关键丹药，药性猛烈，需配合其他丹药服用。一丹难求，黑市价上千灵石，是凡人修士改变命运的希望。",
      grade: "中品",
      type: "丹药",
      value: 1000,
      property: {
        "练气-筑基概率": 0.5,
      },
    },
    降尘丹: {
        desc: "降尘丹，筑基期突破结丹期的珍贵丹药，可降低结丹门槛、增加结丹几率。",
        grade: "上品",
        type: "丹药",
        value: 10000,
        property: {
            "筑基-结丹概率": 0.3,
        },
    },
    九曲灵参丹: {
        desc: "以天地灵药九曲灵参为主材炼制。此丹可大幅提升凝结元婴的几率。",
        grade: "极品",
        type: "丹药",
        value: 100000,
        property: {
            "筑基-元婴概率": 0.2,
        },
    },
    化阴丹: {
        desc: "辅助结婴的丹药，用于“碎丹化婴”阶段，可帮助修士化丹成婴，是突破元婴期的关键辅助丹药之一。",
        grade: "极品",
        type: "丹药",
        value: 100000,
        property: {
            "结丹-元婴概率": 0.2,
        },
    },
    魔炼天元丹: {
        desc: "魔道修士用于突破化神期瓶颈的珍贵丹药，对化神境界的进阶有极大助益。",
        grade: "仙品",
        type: "丹药",
        value: 1000000,
        property: {
            "元婴-化神概率": 0.1,
        },
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
