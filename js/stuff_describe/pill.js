/**
 * 丹药条目：按名称供 MjCreationConfig.getStuffDescribe、背包弹窗等查找。
 * 字段与 shallowDescribeClone 一致：desc、bonus、type、value、grade、effects 等。
 * - value（可选）：炼化修为数额（灵石等价刻度）；非「下品灵石块数」。
 *
 * effects（推荐，替代旧版散乱的 property 字符串键）：
 * {
 *   recover?: { hp?: number, mp?: number }
 *     使用丹药时恢复的当前生命、法力（绝对数值；具体「服用」逻辑由玩法调用方读取并应用）。
 *   breakthrough?: Array<{ from: string, to: string, chanceBonus: number }>
 *     大境界突破时成功率加算；chanceBonus ∈ [0,1]，与 RealmState 表内概率同刻度，多件丹药可叠加（UI 侧封顶）。
 * }
 * 若仍保留旧字段 property: { "练气-筑基概率": 0.5 }，getPillBreakthroughBonusDelta 会作为后备读取。
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
      effects: {
        recover: { hp: 0, mp: 0 },
        breakthrough: [{ from: "练气", to: "筑基", chanceBonus: 0.3 }],
      },
    },
    降尘丹: {
      desc: "降尘丹，筑基期突破结丹期的珍贵丹药，可降低结丹门槛、增加结丹几率。",
      grade: "上品",
      type: "丹药",
      value: 10000,
      effects: {
        recover: { hp: 0, mp: 0 },
        breakthrough: [{ from: "筑基", to: "结丹", chanceBonus: 0.2 }],
      },
    },
    九曲灵参丹: {
      desc: "以天地灵药九曲灵参为主材炼制。此丹可大幅提升凝结元婴的几率。",
      grade: "极品",
      type: "丹药",
      value: 100000,
      effects: {
        recover: { hp: 0, mp: 0 },
        breakthrough: [{ from: "结丹", to: "元婴", chanceBonus: 0.15 }],
      },
    },
    化阴丹: {
      desc:
        "辅助结婴的丹药，用于“碎丹化婴”阶段，可帮助修士化丹成婴，是突破元婴期的关键辅助丹药之一。",
      grade: "极品",
      type: "丹药",
      value: 100000,
      effects: {
        recover: { hp: 0, mp: 0 },
        breakthrough: [{ from: "结丹", to: "元婴", chanceBonus: 0.15 }],
      },
    },
    魔炼天元丹: {
      desc: "魔道修士用于突破化神期瓶颈的珍贵丹药，对化神境界的进阶有极大助益。",
      grade: "仙品",
      type: "丹药",
      value: 1000000,
      effects: {
        recover: { hp: 0, mp: 0 },
        breakthrough: [{ from: "元婴", to: "化神", chanceBonus: 0.1 }],
      },
    },

    止血丹: {
        desc: "止血丹，用于治疗外伤，是修士常用的丹药之一。",
        grade: "下品",
        type: "丹药",
        value: 10,
        effects: {
            recover: { hp: 20 },
        },
    },
    养灵丹: {
        desc: "养灵丹，用于恢复法力，是修士常用的丹药之一。",
        grade: "下品",
        type: "丹药",
        value: 10,
        effects: {
            recover: { mp: 10 },
        },
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
