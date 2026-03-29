/**
 * 世界书条目 · 仅数据（在此增删改条目）
 * 加载顺序：须先于 world_book.js
 * 暴露：window.MortalJourneyWorldBookEntries
 *
 * 字段说明：
 * - id：唯一标识
 * - name：注入时的标题
 * - constant：true 时每次请求都带上；false 时按 keys 在对话/摘要中命中才带上
 * - keys：触发关键词数组（任一词出现即命中）
 * - content：注入正文
 * - priority：数字越大越靠前（constant 与非 constant 各自排序后合并）
 */
(function (global) {
  "use strict";

  global.MortalJourneyWorldBookEntries = [
    {
      id: "base_xianxia",
      name: "修仙叙事基底",
      constant: true,
      keys: [],
      priority: 100,
      content: [
        "天南、越国、元武国等为常见地域称谓；低阶修士多处于练气、筑基阶段，灵石、丹药、法器为硬通货。",
        "宗门内外门、散修、坊市、拍卖会是常见场景；神识探查、敛息、遁术等能力随境界与功法变化。",
      ].join("\n"),
    },
    {
      id: "huangfenggu",
      name: "黄枫谷与越国七派",
      constant: false,
      keys: ["黄枫谷", "越国七派", "升仙大会", "令狐老祖"],
      priority: 30,
      content:
        "黄枫谷为越国七派之一，谷内炼气、筑基弟子众多，宗门任务与贡献点驱动日常修行；高层为结丹、元婴修士，行事以宗门利益为先。",
    },
    {
      id: "tainan",
      name: "太南小会",
      constant: false,
      keys: ["太南小会", "坊市", "散修"],
      priority: 20,
      content:
        "太南小会一类坊市集市是低阶修士交换符箓、低阶法器与灵草之所，龙蛇混杂，需防黑吃黑与假货。",
    },
    {
      id: "linggen",
      name: "灵根与五行",
      constant: false,
      keys: ["灵根", "天灵根", "伪灵根", "真灵根", "五行", "金丹"],
      priority: 15,
      content:
        "灵根决定修炼速度与功法契合度；五行相生相克影响法术与法宝发挥。单灵根天资最佳，多灵根往往进展较慢但手段可更多样。",
    },
    {
      id: "liandan",
      name: "丹药与突破",
      constant: false,
      keys: ["筑基丹", "丹药", "闭关", "突破", "瓶颈"],
      priority: 15,
      content:
        "大境界突破常需丹药、灵石与机缘配合；失败可能跌落境界或损伤经脉，同门与散修对筑基丹等战略资源极为敏感。",
    },
  ];
})(typeof window !== "undefined" ? window : globalThis);
