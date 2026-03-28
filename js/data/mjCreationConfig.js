/**
 * 与 ref_html/js/data/creationConfig.js 对齐的开局数据（凡人修仙传独立页用）
 */
(function (global) {
  "use strict";

  var cfg = {
    /** 命运抉择仅两种模式（无点数） */
    DIFFICULTIES: {
      简单: {
        desc: "自由开局：出身、种族、灵根与天赋均可任意选择与刷新",
      },
      凡人: {
        desc: "真正凡人：出身「凡人」、种族「人族」；灵根与天赋不可刷新",
      },
    },
    GENDERS: {
      男性: { effects: ["阳属性功法修炼速度+10%", "体魄强度略高"] },
      女性: { effects: ["阴属性功法修炼速度+10%", "魅力略高"] },
    },
    BIRTHS: {
      凡人: {
        bonus: { 气运: 10 },
        desc: "出生在凡人家庭，不曾接触过修仙界，但你的未来充满了无限可能。",
      },
      七玄门弟子: {
        bonus: { 神识: 3, 魅力: 2 },
        desc: "你是凡人武林门派中的一名弟子，跟随一位医术高明但性情古怪的师父学习。",
      },
      太南小会参与者: {
        bonus: { 脚力: 5, 气运: 5 },
        desc: "你是一个籍籍无名的散修，听闻了太南小会的消息，怀着忐忑的心情前往，希望能淘到一些仙缘。",
      },
      黄枫谷外门: {
        bonus: { 法力: 10, 神识: 5 },
        desc: "你通过了升仙大会，侥幸成为越国七派之一的入门弟子，一切都从头开始。",
      },
    },
    RACES: {
      人族: { desc: "万物之灵，悟性最高，天生道体，最适合修仙。", bonus: { 神识: 2, 气运: 1 } },
      妖族: {
        desc: "草木鸟兽，采天地灵气而开灵智。肉身强横，寿元和情欲绵长，但化形前心智稍逊。",
        bonus: { 物攻: 5, 物防: 5, 法力: -2, 神识: -3 },
      },
      魔族: {
        desc: "来自异界的强大种族，崇尚力量，天生拥有强大的魔躯和诡异的神通。",
        bonus: { 法攻: 5, 物攻: 3, 魅力: -3, 气运: -2 },
      },
      灵族: {
        desc: "天地灵气偶然汇聚而成的生灵，天生亲和五行法术，但肉身孱弱。",
        bonus: { 法力: 8, 神识: 4, 物攻: -5, 物防: -5 },
      },
      剑修: { desc: "以剑为道，心念纯粹，攻击无匹，信奉一剑破万法。", bonus: { 物攻: 5, 物理穿透: 5 } },
    },
    LINGGEN: { 无灵根: { cost: 0 } },
    LINGGEN_ELEMENT_POOL: ["金", "木", "水", "火", "土"],
    WORLD_FACTORS: {
      全民修仙: {
        desc: "修仙法门普及，凡人皆有修为，但资源竞争白热化。",
        effect: "不再有纯粹的凡人，最低也是炼气一层。资源获取难度大幅提升，争斗极其频繁。",
      },
      灵气断绝: {
        desc: "末法时代，天地灵气枯竭。修炼极其艰难，丹药与灵石成为硬通货。",
        effect: "所有修炼速度-50%，灵石与丹药价值翻倍，恢复类物品极其稀缺。",
      },
      妖兽主宰: {
        desc: "人族衰微，妖族统治大地，人类只能在夹缝中求生。",
        effect: "野外遭遇妖兽几率大幅提升，妖族好感度极难获取。人族聚居地稀少。",
      },
      血月当空: {
        desc: "红月长存，魔道昌盛，人心浮躁，杀戮即是修行。",
        effect: "魔道功法修炼速度+30%，正道功法受压制。善恶值倾向于负面发展。",
      },
      诸神黄昏: {
        desc: "远古神魔陨落，神格破碎散落人间，神器有灵亦有诅咒。",
        effect: "有机会获得带有强大负面效果的神器碎片。获得神迹品质物品几率微弱提升。",
      },
    },
    /** 逆天改命随机用的小型词条池（完整库见 ref_html creationConfig） */
    TRAIT_SAMPLES: [
      { name: "手脚笨拙", rarity: "平庸", desc: "协调性略差。", effects: "无" },
      { name: "过目不忘", rarity: "稀有", desc: "记忆力超群。", effects: "学习类判定有利" },
      { name: "剑心通明", rarity: "史诗", desc: "与剑道极为契合。", effects: "剑类伤害+5%" },
      { name: "霉运缠身", rarity: "负面状态", desc: "诸事不顺。", effects: "气运相关判定不利" },
      { name: "天生神力", rarity: "普通", desc: "体魄异于常人。", effects: "物攻+3" },
      { name: "灵觉敏锐", rarity: "稀有", desc: "对灵气波动敏感。", effects: "神识+2" },
      { name: "道胎初成", rarity: "传说", desc: "罕见的先天资质。", effects: "修炼速度+10%" },
      { name: "五行均衡", rarity: "普通", desc: "五行亲和平均。", effects: "无显著偏科" },
      { name: "孤星照命", rarity: "史诗", desc: "亲缘淡薄，独走仙路。", effects: "独处时心境稳定" },
      { name: "红尘凡心", rarity: "平庸", desc: "难断俗缘。", effects: "社交剧情权重+1" },
    ],
  };

  cfg.rollRandomLinggenName = function rollRandomLinggenName() {
    var pool = cfg.LINGGEN_ELEMENT_POOL || ["金", "木", "水", "火", "土"];
    var r = Math.random() * 100;
    var count;
    var type;
    if (r < 5) {
      count = 1;
      type = "天灵根";
    } else if (r < 20) {
      count = 2;
      type = "真灵根";
    } else if (r < 50) {
      count = 3;
      type = "真灵根";
    } else {
      count = 4;
      type = "伪灵根";
    }
    var bag = pool.slice();
    var elements = [];
    for (var i = 0; i < count; i++) {
      var idx = Math.floor(Math.random() * bag.length);
      elements.push(bag.splice(idx, 1)[0]);
    }
    return type + " " + elements.join(", ");
  };

  cfg.getLinggenCost = function getLinggenCost(name) {
    if (!name) return 0;
    var tab = cfg.LINGGEN;
    if (tab && tab[name] && typeof tab[name].cost === "number") return tab[name].cost;
    var type = String(name).split(/\s+/)[0];
    if (type === "天灵根") return 50;
    if (type === "真灵根") return 20;
    if (type === "伪灵根") return 5;
    return 0;
  };

  global.MjCreationConfig = cfg;
})(typeof window !== "undefined" ? window : globalThis);
