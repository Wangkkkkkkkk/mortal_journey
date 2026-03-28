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
        bonus: { 魅力: 10, 气运: 10 },
      },
      凡人: {
        desc: "凡人模式：以真正的凡人开始游戏，有额外气运加成",
        bonus: { 魅力: 10, 气运: 30 },
      },
    },
    GENDERS: {
      男性: {},
      女性: {},
    },
    BIRTHS: {
      凡人: {
        bonus: { 气运: 5 },
        location: {
          "凡人家庭": {
            desc: "凡人家庭多务农为生，生活清苦。家中若有灵根子弟，则举族期望其踏入仙门，以求光宗耀祖、改变命运，但多数人一生皆与仙途无缘。",
          },
        },
        equipment: {},
        stuff: {},
        gongfa: {},
        desc: "出生在凡人家庭，不曾接触过修仙界，但你的未来充满了无限可能。",
      },
      七玄门弟子: {
        bonus: { 神识: 3, 魅力: 2 },
        location: {
          "七玄门": {
            desc: "七玄门，越国镜州三流势力，雄踞彩霞山。门内设外四堂、内四堂，弟子数千。",
          },
        },
        equipment: {
          "木剑": {
            desc: "一把普通的木剑，可以用来战斗",
            type: "武器",
            bonus: { 物攻: 3 },
          },
          "七玄戒": {
            desc: "七玄门的弟子戒指，可以增加法力",
            type: "法器",
            bonus: { 法力: 5 },
          },
          "布衣": {
            desc: "一件普通的布衣，可以用来保暖",
            type: "防具",
            bonus: { 物防: 5 },
          },
        },
        stuff: {
          "七玄门弟子令牌": {
            desc: "七玄门的弟子令牌，可以证明你是七玄门的弟子",
            bonus: {},
          },
          "灵石": {
            desc: "修士界流通的基础货币，可用于购买丹药、法器与材料等。",
            bonus: { 灵石: 10 },
          },
        },
        gongfa: {
          "长春功": {
            desc: "长春功是七玄门的入门功法，修炼后可以增加血量",
            bonus: { 血量: 20 },
          },
          "眨眼剑法": {
            desc: "眨眼剑法是七玄门的入门剑法",
            bonus: { 物攻: 5 },
          },
        },
        desc: "你是凡人武林门派中的一名弟子，跟随一位医术高明但性情古怪的师父学习。",
      },
      黄枫谷弟子: {
        bonus: { 法力: 10, 神识: 5 },
        location: {
          "黄枫谷外门": {
            desc: "黄枫谷，越国七大宗门之一，位于太岳山脉。以剑修传承闻名，门规严谨。",
          },
        },
        equipment: {
          "铁剑": {
            desc: "一把普通的铁剑，可以用来战斗",
            type: "武器",
            bonus: { 物攻: 5 },
          },
          "青叶": {
            desc: "外形酷似黄叶，可载人飞行，是弟子最主要的赶路工具",
            type: "法器",
            bonus: { 脚力: 5 },
          },
          "布衣": {
            desc: "一件普通的布衣，可以用来保暖",
            type: "防具",
            bonus: { 物防: 5 },
          },
        },
        stuff: {
          "黄枫谷弟子令牌": {
            desc: "黄枫谷的弟子令牌，可以证明你是黄枫谷的弟子",
            bonus: {},
          },
          "灵石": {
            desc: "修士界流通的基础货币，可用于购买丹药、法器与材料等。",
            bonus: { 灵石: 20 },
          },
        },
        gongfa: {
          "凝元功": {
            desc: "凝元功是黄枫谷的入门功法，辅助性功法，主要作用是巩固修为、凝聚法力",
            bonus: { 法力: 10 },
          },
          "青元剑诀": {
            desc: "攻防一体，后期可布强大剑阵，是人界顶级功法之一",
            bonus: { 物攻: 5, 物防: 5 },
          },
        },
        desc: "你通过了升仙大会，侥幸成为越国七派之一的黄枫谷入门弟子，一切都从头开始。",
      },
    },
    RACES: {
      人族: {
        desc: "万物之灵，悟性最高，天生道体，最适合修仙。",
        bonus: { 神识: 2, 气运: 1 },
      },
      妖族: {
        desc: "草木鸟兽，采天地灵气而开灵智。肉身强横，寿元和情欲绵长，但化形前心智稍逊。",
        bonus: { 物攻: 5, 物防: 5, 法力: -2, 神识: -3 },
      },
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
    /** 逆天改命随机词条池（数据见 mj_trait_samples.js，与 ref_html TRAITS 对齐，共 148 条） */
    TRAIT_SAMPLES: Array.isArray(global.MjTraitSamples) ? global.MjTraitSamples : [],

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

  var START_BAG_SLOTS = 12;
  var START_GONGFA_SLOTS = 12;
  /** 与 main.html 佩戴栏一致：0 武器 1 法器 2 防具；「主武器」同武器位；「副武器」同法器位（兼容旧数据） */
  var EQUIP_TYPE_TO_INDEX = {
    武器: 0,
    主武器: 0,
    法器: 1,
    副武器: 1,
    防具: 2,
  };

  /** 解析出身 stuff 键名：如「灵石*10」「令牌名」「丹药*3」 */
  cfg.parseStuffLine = function parseStuffLine(line) {
    var s = line == null ? "" : String(line).trim();
    if (!s) return null;
    var mStone = /^灵石\s*[×*xX]\s*(\d+)$/.exec(s);
    if (mStone) return { kind: "lingshi", amount: parseInt(mStone[1], 10) };
    var mItem = /^(.+?)\s*[×*xX]\s*(\d+)$/.exec(s);
    if (mItem) return { kind: "item", name: mItem[1].trim(), count: parseInt(mItem[2], 10) };
    return { kind: "item", name: s, count: 1 };
  };

  /**
   * 从单条 stuff 元数据解析：灵石进 0 格；物品带 desc 供弹窗。
   * @param {string} keyStr 配置键（可与显示名不同，如「灵石*10」）
   * @param {{ desc?: string, bonus?: Object }} meta
   * @returns {{ type: 'lingshi', amount: number } | { type: 'item', name: string, count: number, desc?: string }}
   */
  cfg.resolveStuffEntry = function resolveStuffEntry(keyStr, meta) {
    var bonus = meta && meta.bonus && typeof meta.bonus === "object" ? meta.bonus : {};
    var lingFromBonus =
      typeof bonus.灵石 === "number" && isFinite(bonus.灵石) ? Math.max(0, Math.floor(bonus.灵石)) : 0;
    var parsed = cfg.parseStuffLine(keyStr);
    var lingFromKey =
      parsed && parsed.kind === "lingshi" ? Math.max(0, parsed.amount || 0) : 0;
    var lingAmount = lingFromBonus > 0 ? lingFromBonus : lingFromKey;
    if (lingAmount > 0) {
      return { type: "lingshi", amount: lingAmount };
    }
    var name;
    var count;
    if (parsed && parsed.kind === "item") {
      name = parsed.name;
      count = Math.max(1, parsed.count || 1);
    } else {
      name = String(keyStr).trim();
      count = 1;
    }
    var desc = meta && meta.desc != null ? String(meta.desc).trim() : "";
    return {
      type: "item",
      name: name,
      count: count,
      desc: desc || undefined,
    };
  };

  /** 按出身生成储物袋 12 格（0 为灵石，1～11 为物品）；stuff 为对象 { 键: { desc, bonus } }，兼容旧版数组 */
  cfg.buildStartingInventorySlots = function buildStartingInventorySlots(birthKey) {
    var slots = [];
    slots[0] = { kind: "lingshi", count: 0 };
    for (var i = 1; i < START_BAG_SLOTS; i++) slots.push(null);
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.stuff == null) return slots;
    var lingAdd = 0;
    var items = [];

    if (Array.isArray(birth.stuff)) {
      for (var j = 0; j < birth.stuff.length; j++) {
        var p = cfg.parseStuffLine(birth.stuff[j]);
        if (!p) continue;
        if (p.kind === "lingshi") lingAdd += Math.max(0, p.amount || 0);
        else if (p.name) items.push({ name: p.name, count: Math.max(1, p.count || 1) });
      }
    } else if (typeof birth.stuff === "object") {
      for (var key in birth.stuff) {
        if (!Object.prototype.hasOwnProperty.call(birth.stuff, key)) continue;
        var meta = birth.stuff[key];
        if (!meta || typeof meta !== "object") meta = {};
        var resolved = cfg.resolveStuffEntry(key, meta);
        if (resolved.type === "lingshi") lingAdd += resolved.amount;
        else if (resolved.name)
          items.push({
            name: resolved.name,
            count: resolved.count,
            desc: resolved.desc,
          });
      }
    }

    slots[0].count = lingAdd;
    var idx = 1;
    for (var k = 0; k < items.length && idx < START_BAG_SLOTS; k++) {
      var it = items[k];
      var cell = { name: it.name, count: it.count };
      if (it.desc) cell.desc = it.desc;
      slots[idx++] = cell;
    }
    return slots;
  };

  /** 出身物品的 bonus（去掉「灵石」键）合并进面板；灵石数量只进背包 0 格 */
  cfg.collectBirthStuffBonusObjects = function collectBirthStuffBonusObjects(birthKey) {
    var list = [];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.stuff == null || Array.isArray(birth.stuff)) return list;
    if (typeof birth.stuff !== "object") return list;
    for (var key in birth.stuff) {
      if (!Object.prototype.hasOwnProperty.call(birth.stuff, key)) continue;
      var meta = birth.stuff[key];
      if (!meta || typeof meta !== "object" || !meta.bonus || typeof meta.bonus !== "object") continue;
      var b = Object.assign({}, meta.bonus);
      delete b.灵石;
      var keys = Object.keys(b);
      if (keys.length) list.push(b);
    }
    return list;
  };

  /** 按出身生成功法栏 12 格（顺序与配置中 gongfa 键顺序一致） */
  cfg.buildStartingGongfaSlots = function buildStartingGongfaSlots(birthKey) {
    var arr = [];
    for (var g = 0; g < START_GONGFA_SLOTS; g++) arr.push(null);
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || !birth.gongfa || typeof birth.gongfa !== "object") return arr;
    var idx = 0;
    for (var title in birth.gongfa) {
      if (!Object.prototype.hasOwnProperty.call(birth.gongfa, title)) continue;
      if (idx >= START_GONGFA_SLOTS) break;
      var gi = birth.gongfa[title];
      arr[idx++] = {
        name: title,
        desc: gi && gi.desc != null ? String(gi.desc) : "",
      };
    }
    return arr;
  };

  /** 出身自带功法的 bonus 对象列表（供命运抉择合并到 playerBase） */
  cfg.collectBirthGongfaBonusObjects = function collectBirthGongfaBonusObjects(birthKey) {
    var list = [];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || !birth.gongfa || typeof birth.gongfa !== "object") return list;
    for (var title in birth.gongfa) {
      if (!Object.prototype.hasOwnProperty.call(birth.gongfa, title)) continue;
      var gi = birth.gongfa[title];
      if (gi && gi.bonus && typeof gi.bonus === "object") list.push(gi.bonus);
    }
    return list;
  };

  /**
   * 按出身生成佩戴栏三格：[武器, 法器, 防具]
   * equipment 为 { 装备名: { desc, type: '武器'|'法器'|'防具', bonus } }（亦兼容 type「主武器」「副武器」）
   */
  cfg.buildStartingEquippedSlots = function buildStartingEquippedSlots(birthKey) {
    var out = [null, null, null];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || !birth.equipment || typeof birth.equipment !== "object") return out;
    for (var itemName in birth.equipment) {
      if (!Object.prototype.hasOwnProperty.call(birth.equipment, itemName)) continue;
      var meta = birth.equipment[itemName];
      if (!meta || typeof meta !== "object") continue;
      var ty = meta.type != null ? String(meta.type).trim() : "";
      var si = EQUIP_TYPE_TO_INDEX[ty];
      if (si == null) continue;
      var o = {
        name: itemName,
        desc: meta.desc != null ? String(meta.desc) : "",
        equipType: ty,
      };
      out[si] = o;
    }
    return out;
  };

  /** 佩戴部位 type 字符串 → 佩戴栏索引（0 武器 1 法器 2 防具）；无法识别返回 null */
  cfg.equipTypeToSlotIndex = function equipTypeToSlotIndex(typeStr) {
    var ty = typeStr != null ? String(typeStr).trim() : "";
    if (!ty) return null;
    var si = EQUIP_TYPE_TO_INDEX[ty];
    return si == null ? null : si;
  };

  /** 出身装备的 bonus 合并进 playerBase（与功法、背包效果一致） */
  cfg.collectBirthEquipmentBonusObjects = function collectBirthEquipmentBonusObjects(birthKey) {
    var list = [];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || !birth.equipment || typeof birth.equipment !== "object") return list;
    for (var k in birth.equipment) {
      if (!Object.prototype.hasOwnProperty.call(birth.equipment, k)) continue;
      var meta = birth.equipment[k];
      if (!meta || !meta.bonus || typeof meta.bonus !== "object") continue;
      if (!Object.keys(meta.bonus).length) continue;
      list.push(meta.bonus);
    }
    return list;
  };

  global.MjCreationConfig = cfg;
})(typeof window !== "undefined" ? window : globalThis);
