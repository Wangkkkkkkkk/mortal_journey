/**
 * 与 ref_html/js/data/creationConfig.js 对齐的开局数据（凡人修仙传独立页用）
 * 装备 / 杂物 / 功法详情见 js/stuff_describe/*.js，此处按名称引用。
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
        equipment: [],
        stuff: {},
        gongfa: [],
        desc: "出生在凡人家庭，不曾接触过修仙界，但你的未来充满了无限可能。",
      },
      七玄门弟子: {
        bonus: { 神识: 3, 魅力: 2 },
        location: {
          "七玄门": {
            desc: "七玄门，越国镜州三流势力，雄踞彩霞山。门内设外四堂、内四堂，弟子数千。",
          },
        },
        equipment: ["木剑", "七玄戒", "布衣"],
        stuff: {
          七玄门令牌: 1,
          下品灵石: 100,
        },
        gongfa: ["长春功", "眨眼剑法"],
        desc: "你是凡人武林门派中的一名弟子，跟随一位医术高明但性情古怪的师父学习。",
      },
      黄枫谷弟子: {
        bonus: { 法力: 10, 神识: 5 },
        location: {
          "黄枫谷外门": {
            desc: "黄枫谷，越国七大宗门之一，位于太岳山脉。以剑修传承闻名，门规严谨。",
          },
        },
        equipment: ["铁剑", "青叶", "布衣"],
        stuff: {
          黄枫谷令牌: 1,
          下品灵石: 200,
          筑基丹: 2,
        },
        gongfa: ["凝元功", "青元剑诀"],
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

  function cloneDescribeEffects(eff) {
    if (!eff || typeof eff !== "object") return null;
    var out = {};
    if (eff.recover && typeof eff.recover === "object") {
      var rc = {};
      if (typeof eff.recover.hp === "number" && isFinite(eff.recover.hp) && eff.recover.hp > 0) {
        rc.hp = Math.floor(eff.recover.hp);
      }
      if (typeof eff.recover.mp === "number" && isFinite(eff.recover.mp) && eff.recover.mp > 0) {
        rc.mp = Math.floor(eff.recover.mp);
      }
      if (rc.hp != null || rc.mp != null) out.recover = rc;
    }
    if (Array.isArray(eff.breakthrough)) {
      var arr = [];
      for (var i = 0; i < eff.breakthrough.length; i++) {
        var b = eff.breakthrough[i];
        if (!b || typeof b !== "object") continue;
        var cb = b.chanceBonus;
        if (typeof cb !== "number" || !isFinite(cb) || cb <= 0) continue;
        arr.push({
          from: b.from != null ? String(b.from).trim() : "",
          to: b.to != null ? String(b.to).trim() : "",
          chanceBonus: cb,
        });
      }
      if (arr.length) out.breakthrough = arr;
    }
    return Object.keys(out).length ? out : null;
  }

  function shallowDescribeClone(src) {
    if (!src || typeof src !== "object") return null;
    var out = {
      desc: src.desc != null ? String(src.desc) : "",
      bonus: src.bonus && typeof src.bonus === "object" ? Object.assign({}, src.bonus) : {},
    };
    if (src.type != null && String(src.type).trim() !== "") out.type = String(src.type).trim();
    if (typeof src.value === "number" && isFinite(src.value)) out.value = src.value;
    if (src.grade != null && String(src.grade).trim() !== "") out.grade = String(src.grade).trim();
    var eff = cloneDescribeEffects(src.effects);
    if (eff) out.effects = eff;
    if (src.property && typeof src.property === "object") {
      out.property = Object.assign({}, src.property);
    }
    return out;
  }

  /** @returns {{ desc: string, bonus: Object, type?: string } | null} */
  cfg.getEquipmentDescribe = function getEquipmentDescribe(name) {
    var w = name == null ? "" : String(name).trim();
    if (!w) return null;
    var t = global.MjDescribeEquipment;
    return shallowDescribeClone(t && t[w]);
  };

  /** @returns {{ desc: string, bonus: Object, type?: string } | null} */
  cfg.getGongfaDescribe = function getGongfaDescribe(name) {
    var w = name == null ? "" : String(name).trim();
    if (!w) return null;
    var t = global.MjDescribeGongfa;
    return shallowDescribeClone(t && t[w]);
  };

  /** @returns {{ desc: string, bonus: Object, type?: string } | null} */
  cfg.getStuffDescribe = function getStuffDescribe(name) {
    var w = name == null ? "" : String(name).trim();
    if (!w) return null;
    var raw =
      (global.MjDescribeSpiritStones && global.MjDescribeSpiritStones[w]) ||
      (global.MjDescribePills && global.MjDescribePills[w]) ||
      (global.MjDescribeStuff && global.MjDescribeStuff[w]);
    return shallowDescribeClone(raw);
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

  /** 旧版「灵石」额度与背包堆叠统一为此名（见 stuff_describe） */
  cfg.LINGSHI_STACK_ITEM_NAME = "下品灵石";
  var LINGSHI_ITEM_NAME = cfg.LINGSHI_STACK_ITEM_NAME;

  /**
   * 从单条 stuff 元数据解析：旧版灵石额度变为「下品灵石」堆叠；其余为普通物品。
   * @param {string} keyStr 配置键（可与显示名不同，如「灵石*10」）
   * @param {{ desc?: string, bonus?: Object }} meta
   * @returns {{ type: 'item', name: string, count: number, desc?: string }}
   */
  cfg.resolveStuffEntry = function resolveStuffEntry(keyStr, meta) {
    var bonus = meta && meta.bonus && typeof meta.bonus === "object" ? meta.bonus : {};
    /** 出身 stuff 可写 bonus: { 灵石: n }（旧）或 bonus: { 下品灵石: n }（与 LINGSHI_STACK_ITEM_NAME 同名） */
    var lingFromBonus = 0;
    if (typeof bonus.灵石 === "number" && isFinite(bonus.灵石)) {
      lingFromBonus = Math.max(0, Math.floor(bonus.灵石));
    } else if (typeof bonus[LINGSHI_ITEM_NAME] === "number" && isFinite(bonus[LINGSHI_ITEM_NAME])) {
      lingFromBonus = Math.max(0, Math.floor(bonus[LINGSHI_ITEM_NAME]));
    }
    var parsed = cfg.parseStuffLine(keyStr);
    var lingFromKey =
      parsed && parsed.kind === "lingshi" ? Math.max(0, parsed.amount || 0) : 0;
    var lingAmount = lingFromBonus > 0 ? lingFromBonus : lingFromKey;
    if (lingAmount > 0) {
      var st = cfg.getStuffDescribe(LINGSHI_ITEM_NAME);
      var d0 =
        meta && meta.desc != null && String(meta.desc).trim() !== ""
          ? String(meta.desc).trim()
          : st && st.desc
            ? String(st.desc)
            : "";
      var gStone =
        meta && meta.grade != null && String(meta.grade).trim() !== ""
          ? String(meta.grade).trim()
          : st && st.grade != null && String(st.grade).trim() !== ""
            ? String(st.grade).trim()
            : "";
      return {
        type: "item",
        name: LINGSHI_ITEM_NAME,
        count: lingAmount,
        desc: d0 || undefined,
        grade: gStone || undefined,
      };
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
    var gItem =
      meta && meta.grade != null && String(meta.grade).trim() !== "" ? String(meta.grade).trim() : "";
    if (meta && typeof meta.count === "number" && isFinite(meta.count)) {
      var oc = Math.max(0, Math.floor(meta.count));
      if (oc > 0) count = oc;
    }
    return {
      type: "item",
      name: name,
      count: count,
      desc: desc || undefined,
      grade: gItem || undefined,
    };
  };

  function mergeStuffEntryMeta(keyStr, birthPatch) {
    var p = cfg.parseStuffLine(keyStr);
    var baseName;
    if (p && p.kind === "item") baseName = String(p.name || "").trim();
    else if (p && p.kind === "lingshi") baseName = LINGSHI_ITEM_NAME;
    else baseName = String(keyStr).trim();
    var base = baseName ? cfg.getStuffDescribe(baseName) : null;
    if (!base) base = { desc: "", bonus: {} };
    var patch = birthPatch == null || birthPatch === true ? {} : birthPatch;
    if (typeof patch !== "object") patch = {};
    var bonus = Object.assign(
      {},
      base.bonus && typeof base.bonus === "object" ? base.bonus : {},
      patch.bonus && typeof patch.bonus === "object" ? patch.bonus : {},
    );
    var desc =
      patch.desc != null && String(patch.desc).trim() !== ""
        ? String(patch.desc).trim()
        : base.desc || "";
    var out = { desc: desc, bonus: bonus };
    var gPatch =
      patch.grade != null && String(patch.grade).trim() !== "" ? String(patch.grade).trim() : "";
    var gBase =
      base && base.grade != null && String(base.grade).trim() !== "" ? String(base.grade).trim() : "";
    if (gPatch) out.grade = gPatch;
    else if (gBase) out.grade = gBase;
    if (patch.count != null && typeof patch.count === "number" && isFinite(patch.count)) {
      out.count = Math.max(0, Math.floor(patch.count));
    }
    return out;
  }

  /**
   * 出身 BIRTHS.stuff 对象：键为物品名，值可为
   * - 数字：该物品数量（「下品灵石」/ LINGSHI_STACK_ITEM_NAME /「灵石」→ 灵石堆叠数；其余 → 普通物品堆叠）；
   * - true / null：等价 {}；
   * - 对象：{ desc, bonus, grade, count } 等与 mergeStuffEntryMeta 兼容的覆盖。
   */
  function normalizeBirthStuffPatch(key, raw) {
    if (typeof raw === "number" && isFinite(raw)) {
      var n = Math.max(0, Math.floor(raw));
      var kt = String(key == null ? "" : key).trim();
      if (kt === LINGSHI_ITEM_NAME) {
        var oStone = { bonus: {} };
        oStone.bonus[LINGSHI_ITEM_NAME] = n;
        return oStone;
      }
      if (kt === "灵石") {
        return { bonus: { 灵石: n } };
      }
      return { count: n };
    }
    if (raw == null || raw === true) return {};
    if (typeof raw !== "object") return {};
    return raw;
  }

  function mergeGongfaMeta(title, birthGi) {
    var base = cfg.getGongfaDescribe(title) || { desc: "", bonus: {} };
    var patch = birthGi && typeof birthGi === "object" ? birthGi : {};
    var bonus = Object.assign(
      {},
      base.bonus && typeof base.bonus === "object" ? base.bonus : {},
      patch.bonus && typeof patch.bonus === "object" ? patch.bonus : {},
    );
    var desc =
      patch.desc != null && String(patch.desc).trim() !== ""
        ? String(patch.desc).trim()
        : base.desc || "";
    var ty =
      patch.type != null && String(patch.type).trim() !== ""
        ? String(patch.type).trim()
        : base.type && String(base.type).trim() !== ""
          ? String(base.type).trim()
          : "";
    return { desc: desc, bonus: bonus, type: ty };
  }

  /** 按出身生成储物袋 12 格；stuff 为字符串数组，或对象 { 物品名: 数量 | 覆盖对象 } */
  cfg.buildStartingInventorySlots = function buildStartingInventorySlots(birthKey) {
    var slots = [];
    for (var s = 0; s < START_BAG_SLOTS; s++) slots.push(null);
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.stuff == null) return slots;
    var items = [];

    if (Array.isArray(birth.stuff)) {
      for (var j = 0; j < birth.stuff.length; j++) {
        var mergedA = mergeStuffEntryMeta(birth.stuff[j], {});
        var resolvedA = cfg.resolveStuffEntry(birth.stuff[j], mergedA);
        if (resolvedA.type === "item" && resolvedA.name) {
          var ca =
            typeof resolvedA.count === "number" && isFinite(resolvedA.count) ? resolvedA.count : 1;
          if (ca < 1) continue;
          items.push({
            name: resolvedA.name,
            count: ca,
            desc: resolvedA.desc,
            grade: resolvedA.grade,
          });
        }
      }
    } else if (typeof birth.stuff === "object") {
      for (var key in birth.stuff) {
        if (!Object.prototype.hasOwnProperty.call(birth.stuff, key)) continue;
        var rawMeta = birth.stuff[key];
        var patch = normalizeBirthStuffPatch(key, rawMeta);
        var merged = mergeStuffEntryMeta(key, patch);
        var resolved = cfg.resolveStuffEntry(key, merged);
        if (resolved.type === "item" && resolved.name) {
          var c0 = typeof resolved.count === "number" && isFinite(resolved.count) ? resolved.count : 1;
          if (c0 < 1) continue;
          items.push({
            name: resolved.name,
            count: c0,
            desc: resolved.desc,
            grade: resolved.grade,
          });
        }
      }
    }

    var idx = 0;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var cell = { name: it.name, count: it.count };
      if (it.desc) cell.desc = it.desc;
      if (it.grade) cell.grade = it.grade;
      var placed = false;
      for (var t = 0; t < START_BAG_SLOTS; t++) {
        var ex = slots[t];
        if (ex && ex.name === cell.name) {
          ex.count = (typeof ex.count === "number" && isFinite(ex.count) ? ex.count : 1) + cell.count;
          if (!ex.desc && cell.desc) ex.desc = cell.desc;
          if (!ex.grade && cell.grade) ex.grade = cell.grade;
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (idx >= START_BAG_SLOTS) continue;
        slots[idx++] = cell;
      }
    }
    return slots;
  };

  /** 出身物品的 bonus（去掉「灵石」键）合并进面板 */
  cfg.collectBirthStuffBonusObjects = function collectBirthStuffBonusObjects(birthKey) {
    var list = [];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.stuff == null) return list;
    function pushMergedBonus(merged) {
      var b = Object.assign({}, merged.bonus && typeof merged.bonus === "object" ? merged.bonus : {});
      delete b.灵石;
      delete b[LINGSHI_ITEM_NAME];
      if (Object.keys(b).length) list.push(b);
    }
    if (Array.isArray(birth.stuff)) {
      for (var j = 0; j < birth.stuff.length; j++) {
        pushMergedBonus(mergeStuffEntryMeta(birth.stuff[j], {}));
      }
      return list;
    }
    if (typeof birth.stuff !== "object") return list;
    for (var key in birth.stuff) {
      if (!Object.prototype.hasOwnProperty.call(birth.stuff, key)) continue;
      var raw = birth.stuff[key];
      var patch = normalizeBirthStuffPatch(key, raw);
      pushMergedBonus(mergeStuffEntryMeta(key, patch));
    }
    return list;
  };

  /** 按出身生成功法栏 12 格；gongfa 为名称数组，或旧版 { 名: 覆盖 } 对象 */
  cfg.buildStartingGongfaSlots = function buildStartingGongfaSlots(birthKey) {
    var arr = [];
    for (var g = 0; g < START_GONGFA_SLOTS; g++) arr.push(null);
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.gongfa == null) return arr;
    var idx = 0;
    if (Array.isArray(birth.gongfa)) {
      for (var i = 0; i < birth.gongfa.length && idx < START_GONGFA_SLOTS; i++) {
        var title = String(birth.gongfa[i]).trim();
        if (!title) continue;
        var gi = cfg.getGongfaDescribe(title);
        if (!gi) {
          arr[idx++] = { name: title, desc: "" };
          continue;
        }
        var cell = { name: title, desc: gi.desc || "" };
        if (gi.type) cell.type = gi.type;
        arr[idx++] = cell;
      }
      return arr;
    }
    if (typeof birth.gongfa === "object") {
      for (var t2 in birth.gongfa) {
        if (!Object.prototype.hasOwnProperty.call(birth.gongfa, t2)) continue;
        if (idx >= START_GONGFA_SLOTS) break;
        var merged = mergeGongfaMeta(t2, birth.gongfa[t2]);
        var cell2 = { name: t2, desc: merged.desc };
        if (merged.type) cell2.type = merged.type;
        arr[idx++] = cell2;
      }
    }
    return arr;
  };

  /** 出身自带功法的 bonus 对象列表（供命运抉择合并到 playerBase） */
  cfg.collectBirthGongfaBonusObjects = function collectBirthGongfaBonusObjects(birthKey) {
    var list = [];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.gongfa == null) return list;
    if (Array.isArray(birth.gongfa)) {
      for (var i = 0; i < birth.gongfa.length; i++) {
        var title = String(birth.gongfa[i]).trim();
        if (!title) continue;
        var gi = cfg.getGongfaDescribe(title);
        if (gi && gi.bonus && typeof gi.bonus === "object" && Object.keys(gi.bonus).length) list.push(gi.bonus);
      }
      return list;
    }
    if (typeof birth.gongfa === "object") {
      for (var t2 in birth.gongfa) {
        if (!Object.prototype.hasOwnProperty.call(birth.gongfa, t2)) continue;
        var merged = mergeGongfaMeta(t2, birth.gongfa[t2]);
        if (merged.bonus && typeof merged.bonus === "object" && Object.keys(merged.bonus).length) list.push(merged.bonus);
      }
    }
    return list;
  };

  /**
   * 按出身生成佩戴栏三格：[武器, 法器, 防具]
   * equipment 为名称数组，或旧版 { 装备名: { desc, type, bonus } }（可与 stuff_describe 合并）
   */
  cfg.buildStartingEquippedSlots = function buildStartingEquippedSlots(birthKey) {
    var out = [null, null, null];
    var birth = birthKey && cfg.BIRTHS && cfg.BIRTHS[birthKey];
    if (!birth || birth.equipment == null) return out;
    function placeEquipped(itemName, metaMerged) {
      if (!itemName || !metaMerged) return;
      var ty = metaMerged.type != null ? String(metaMerged.type).trim() : "";
      var si = EQUIP_TYPE_TO_INDEX[ty];
      if (si == null) return;
      out[si] = {
        name: String(itemName).trim(),
        desc: metaMerged.desc != null ? String(metaMerged.desc) : "",
        equipType: ty,
      };
    }
    if (Array.isArray(birth.equipment)) {
      for (var e = 0; e < birth.equipment.length; e++) {
        var nm = String(birth.equipment[e]).trim();
        if (!nm) continue;
        var em = cfg.getEquipmentDescribe(nm);
        if (em) placeEquipped(nm, em);
      }
      return out;
    }
    if (typeof birth.equipment === "object") {
      for (var itemName in birth.equipment) {
        if (!Object.prototype.hasOwnProperty.call(birth.equipment, itemName)) continue;
        var raw = birth.equipment[itemName];
        var patch = raw == null || raw === true ? {} : typeof raw === "object" ? raw : {};
        var base = cfg.getEquipmentDescribe(itemName) || { desc: "", bonus: {} };
        var em2 = {
          desc:
            patch.desc != null && String(patch.desc).trim() !== ""
              ? String(patch.desc)
              : base.desc || "",
          type:
            patch.type != null && String(patch.type).trim() !== ""
              ? String(patch.type).trim()
              : base.type || "",
          bonus: Object.assign(
            {},
            base.bonus && typeof base.bonus === "object" ? base.bonus : {},
            patch.bonus && typeof patch.bonus === "object" ? patch.bonus : {},
          ),
        };
        placeEquipped(itemName, em2);
      }
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
    if (!birth || birth.equipment == null) return list;
    if (Array.isArray(birth.equipment)) {
      for (var i = 0; i < birth.equipment.length; i++) {
        var nm = String(birth.equipment[i]).trim();
        if (!nm) continue;
        var em = cfg.getEquipmentDescribe(nm);
        if (em && em.bonus && typeof em.bonus === "object" && Object.keys(em.bonus).length) list.push(em.bonus);
      }
      return list;
    }
    if (typeof birth.equipment === "object") {
      for (var k in birth.equipment) {
        if (!Object.prototype.hasOwnProperty.call(birth.equipment, k)) continue;
        var raw = birth.equipment[k];
        var patch = raw == null || raw === true ? {} : typeof raw === "object" ? raw : {};
        var base = cfg.getEquipmentDescribe(k) || {};
        var b = Object.assign(
          {},
          base.bonus && typeof base.bonus === "object" ? base.bonus : {},
          patch.bonus && typeof patch.bonus === "object" ? patch.bonus : {},
        );
        if (Object.keys(b).length) list.push(b);
      }
    }
    return list;
  };

  global.MjCreationConfig = cfg;
})(typeof window !== "undefined" ? window : globalThis);
