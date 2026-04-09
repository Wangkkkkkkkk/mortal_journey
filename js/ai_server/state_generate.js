/**
 * 状态 / 变量向 AI：储物袋 add/remove，以及世界时间、当前地点写回（见 mj_world_state）。
 * 依赖：MjCreationConfig、全局描述表 MjDescribe*、MortalJourneyGame（应用时）。
 */
(function (global) {
  "use strict";

  var INVENTORY_SLOT_COUNT = 12;
  var INVENTORY_GRID_COLS = 4;
  /** 与 mainScreen 一致：佩戴 4 格、功法 8 格 */
  var EQUIP_SLOT_COUNT = 4;
  var GONGFA_SLOT_COUNT = 8;
  var EQUIP_SLOT_LABELS = ["武器", "法器", "防具", "载具"];
  var OPS_TAG_OPEN = "<mj_inventory_ops>";
  var OPS_TAG_CLOSE = "</mj_inventory_ops>";
  var WORLD_STATE_TAG_OPEN = "<mj_world_state>";
  var WORLD_STATE_TAG_CLOSE = "</mj_world_state>";
  var USER_STATE_TAG_OPEN = "<mj_user_state>";
  var USER_STATE_TAG_CLOSE = "</mj_user_state>";
  /** 周围人物完整列表替换（可选标签；省略则不改 G.nearbyNpcs） */
  var NPC_NEARBY_TAG_OPEN = "<mj_nearby_npcs>";
  var NPC_NEARBY_TAG_CLOSE = "</mj_nearby_npcs>";
  var BATTLE_TRIGGER_TAG_OPEN = "<mj_battle_trigger>";
  var BATTLE_TRIGGER_TAG_CLOSE = "</mj_battle_trigger>";
  var SPIRIT_STONE_TAG_OPEN = "<mj_spirit_stone_ops>";
  var SPIRIT_STONE_TAG_CLOSE = "</mj_spirit_stone_ops>";
  var ITEM_ADD_TAG_OPEN = "<mj_item_add_ops>";
  var ITEM_ADD_TAG_CLOSE = "</mj_item_add_ops>";
  var ITEM_REMOVE_TAG_OPEN = "<mj_item_remove_ops>";
  var ITEM_REMOVE_TAG_CLOSE = "</mj_item_remove_ops>";
  /**
   * 9.1 品阶属性基准（表外装备/功法请贴近此量级）
   * 每项为 [最小值, 最大值]。
   */
  var QUALITY_ATTR_BASELINE_MAP = {
    下品: { 血量: [10, 50], 法力: [5, 25], 物攻: [5, 10], 物防: [1, 5], 法攻: [5, 10], 法防: [1, 5], 脚力: [5, 10], 神识: [5, 10] },
    中品: { 血量: [50, 100], 法力: [25, 50], 物攻: [10, 20], 物防: [5, 10], 法攻: [10, 20], 法防: [5, 10], 脚力: [10, 20], 神识: [10, 25] },
    上品: { 血量: [100, 200], 法力: [50, 100], 物攻: [20, 30], 物防: [10, 15], 法攻: [20, 30], 法防: [10, 15], 脚力: [20, 30], 神识: [25, 50] },
    极品: { 血量: [200, 300], 法力: [100, 150], 物攻: [30, 40], 物防: [15, 20], 法攻: [30, 40], 法防: [15, 20], 脚力: [30, 40], 神识: [50, 75] },
    仙品: { 血量: [300, 500], 法力: [150, 200], 物攻: [40, 50], 物防: [20, 25], 法攻: [40, 50], 法防: [20, 25], 脚力: [40, 50], 神识: [75, 100] },
  };
  /** 灵石价值映射（按品阶） */
  var SPIRIT_STONE_VALUE_MAP = {
    下品: 10,
    中品: 100,
    上品: 1000,
    极品: 10000,
    仙品: 100000,
  };
  /** 物品品阶价值映射（按品阶） */
  var ITEM_GRADE_VALUE_MAP = {
    下品: [10, 100],
    中品: [100, 1000],
    上品: [1000, 10000],
    极品: [10000, 100000],
    仙品: [100000, 1000000],
  };
  /** 伤害倍率品阶映射（按品阶） */
  var ITEM_GRADE_DAMAGE_MULTIPLIER_MAP = {
    下品: [1.0, 1.1],
    中品: [1.1, 1.3],
    上品: [1.3, 1.6],
    极品: [1.6, 2.0],
    仙品: [2.0, 2.5],
  };
  var SPIRIT_STONE_GRADE_ORDER = ["仙品", "极品", "上品", "中品", "下品"];
  var SPIRIT_STONE_NAME_TO_GRADE = {
    下品灵石: "下品",
    中品灵石: "中品",
    上品灵石: "上品",
    极品灵石: "极品",
    仙品灵石: "仙品",
  };
  /** 突破丹药按品阶提供的概率加成区间（单位：%） */
  var BREAKTHROUGH_PILL_GRADE_BONUS_RANGE_MAP = {
    中品: [10, 15],
    上品: [15, 20],
    极品: [20, 25],
    仙品: [25, 30],
  };
  /** 突破丹药按品阶对应的境界突破方向 */
  var BREAKTHROUGH_PILL_ROUTE_BY_GRADE = {
    中品: { from: "练气", to: "筑基" },
    上品: { from: "筑基", to: "结丹" },
    极品: { from: "结丹", to: "元婴" },
    仙品: { from: "元婴", to: "化神" },
  };
  function lowerSpiritStoneValueUnit() {
    return SPIRIT_STONE_VALUE_MAP.下品;
  }
  function randomIntInRange(min, max) {
    var a = Math.floor(Number(min));
    var b = Math.floor(Number(max));
    if (!isFinite(a) || !isFinite(b)) return 0;
    if (a > b) {
      var t = a;
      a = b;
      b = t;
    }
    return a + Math.floor(Math.random() * (b - a + 1));
  }
  function randomFloatInRange(min, max, digits) {
    var a = Number(min);
    var b = Number(max);
    if (!isFinite(a) || !isFinite(b)) return 0;
    if (a > b) {
      var t = a;
      a = b;
      b = t;
    }
    var n = a + Math.random() * (b - a);
    var d = typeof digits === "number" && isFinite(digits) ? Math.max(0, Math.floor(digits)) : 2;
    var p = Math.pow(10, d);
    return Math.round(n * p) / p;
  }
  function isSpiritStoneName(name) {
    var nm = name != null ? String(name).trim() : "";
    return Object.prototype.hasOwnProperty.call(SPIRIT_STONE_NAME_TO_GRADE, nm);
  }
  function spiritStoneUnitValueByName(name) {
    var nm = name != null ? String(name).trim() : "";
    var g = SPIRIT_STONE_NAME_TO_GRADE[nm];
    return g && typeof SPIRIT_STONE_VALUE_MAP[g] === "number" ? SPIRIT_STONE_VALUE_MAP[g] : 0;
  }
  function spiritStoneNameByGrade(grade) {
    var g = grade != null ? String(grade).trim() : "";
    return g ? g + "灵石" : "";
  }
  function calcSpiritStoneTotalValueInBag(G) {
    ensureInventoryShape(G);
    var total = 0;
    for (var i = 0; i < G.inventorySlots.length; i++) {
      var c = G.inventorySlots[i];
      if (!c || !isSpiritStoneName(c.name)) continue;
      var u = spiritStoneUnitValueByName(c.name);
      if (u <= 0) continue;
      var cnt = typeof c.count === "number" && isFinite(c.count) ? Math.max(1, Math.floor(c.count)) : 1;
      total += u * cnt;
    }
    return total;
  }
  function clearSpiritStoneFromBag(G) {
    ensureInventoryShape(G);
    for (var i = 0; i < G.inventorySlots.length; i++) {
      var c = G.inventorySlots[i];
      if (c && isSpiritStoneName(c.name)) G.inventorySlots[i] = null;
    }
  }
  function getSpiritStoneCountsByGrade(G) {
    ensureInventoryShape(G);
    var counts = { 下品: 0, 中品: 0, 上品: 0, 极品: 0, 仙品: 0 };
    for (var i = 0; i < G.inventorySlots.length; i++) {
      var c = G.inventorySlots[i];
      if (!c || !isSpiritStoneName(c.name)) continue;
      var g = SPIRIT_STONE_NAME_TO_GRADE[String(c.name).trim()];
      if (!g) continue;
      var cnt = typeof c.count === "number" && isFinite(c.count) ? Math.max(1, Math.floor(c.count)) : 1;
      counts[g] += cnt;
    }
    return counts;
  }
  function writeSpiritStoneCountsByGrade(G, counts) {
    clearSpiritStoneFromBag(G);
    for (var i = 0; i < SPIRIT_STONE_GRADE_ORDER.length; i++) {
      var grade = SPIRIT_STONE_GRADE_ORDER[i];
      var cnt = counts && typeof counts[grade] === "number" && isFinite(counts[grade]) ? Math.floor(counts[grade]) : 0;
      if (cnt <= 0) continue;
      tryPlaceItemInBag(G, {
        name: spiritStoneNameByGrade(grade),
        count: cnt,
        grade: grade,
        value: SPIRIT_STONE_VALUE_MAP[grade],
        type: "材料",
      });
    }
  }
  function spiritStoneGradeAsc() {
    return ["下品", "中品", "上品", "极品", "仙品"];
  }
  function findGradeIndexAsc(grade) {
    var arr = spiritStoneGradeAsc();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === grade) return i;
    }
    return -1;
  }
  function removeSpiritStoneWithChange(G, name, count) {
    var grade = SPIRIT_STONE_NAME_TO_GRADE[name];
    if (!grade) return { ok: false, reason: "灵石名称不合法" };
    var cnt = typeof count === "number" && isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
    var needValue = spiritStoneUnitValueByName(name) * cnt;
    if (needValue <= 0) return { ok: false, reason: "灵石单价无效" };
    var beforeTotal = calcSpiritStoneTotalValueInBag(G);
    if (beforeTotal <= 0) return { ok: true, removedValue: 0 };
    if (needValue >= beforeTotal) {
      clearSpiritStoneFromBag(G);
      return { ok: true, removedValue: beforeTotal };
    }
    var counts = getSpiritStoneCountsByGrade(G);
    var asc = spiritStoneGradeAsc();
    var denoms = [10, 100, 1000, 10000, 100000];
    var need = needValue;
    while (need > 0) {
      var progressed = false;
      for (var i = 0; i < asc.length; i++) {
        var g = asc[i];
        var d = denoms[i];
        if (d > need) break;
        var canUse = Math.min(counts[g], Math.floor(need / d));
        if (canUse > 0) {
          counts[g] -= canUse;
          need -= canUse * d;
          progressed = true;
        }
      }
      if (need <= 0) break;
      var broke = false;
      for (var j = 1; j < asc.length; j++) {
        if (counts[asc[j]] > 0) {
          counts[asc[j]] -= 1;
          counts[asc[j - 1]] += 10;
          broke = true;
          progressed = true;
          break;
        }
      }
      if (!broke || !progressed) break;
    }
    if (need > 0) {
      clearSpiritStoneFromBag(G);
      return { ok: true, removedValue: beforeTotal };
    }
    writeSpiritStoneCountsByGrade(G, counts);
    return { ok: true, removedValue: needValue };
  }
  function applySpiritStoneDeltaByValue(G, name, count, isAdd) {
    var nm = name != null ? String(name).trim() : "";
    var cnt = typeof count === "number" && isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
    if (!isSpiritStoneName(nm)) return { ok: false, reason: "灵石名称不合法" };
    if (isAdd) {
      if (
        tryPlaceItemInBag(G, {
          name: nm,
          count: cnt,
          grade: SPIRIT_STONE_NAME_TO_GRADE[nm],
          value: spiritStoneUnitValueByName(nm),
          type: "材料",
        })
      ) {
        return { ok: true };
      }
      return { ok: false, reason: "储物袋已满或无法放置灵石" };
    }
    return removeSpiritStoneWithChange(G, nm, cnt);
  }
  function fillRandomValueByGrade(grade) {
    var g = grade != null ? String(grade).trim() : "";
    var r = ITEM_GRADE_VALUE_MAP[g];
    if (!Array.isArray(r) || r.length < 2) return undefined;
    var base = Math.max(1, r[0]);
    var lo = Math.ceil(r[0] / base);
    var hi = Math.floor(r[1] / base);
    if (lo > hi) hi = lo;
    return randomIntInRange(lo, hi) * base;
  }
  function getAttrRandomByGrade(grade, key) {
    var g = grade != null ? String(grade).trim() : "";
    var row = QUALITY_ATTR_BASELINE_MAP[g];
    if (!row || !row[key] || !Array.isArray(row[key])) return undefined;
    return randomIntInRange(row[key][0], row[key][1]);
  }
  function getAttrRangeByGrade(grade, key) {
    var g = grade != null ? String(grade).trim() : "";
    var row = QUALITY_ATTR_BASELINE_MAP[g];
    if (!row || !row[key] || !Array.isArray(row[key]) || row[key].length < 2) return null;
    var a = Number(row[key][0]);
    var b = Number(row[key][1]);
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a > b) {
      var t = a;
      a = b;
      b = t;
    }
    return [Math.floor(a), Math.floor(b)];
  }
  function getDamageMultiplierByGrade(grade) {
    var g = grade != null ? String(grade).trim() : "";
    var r = ITEM_GRADE_DAMAGE_MULTIPLIER_MAP[g];
    if (!Array.isArray(r) || r.length < 2) return undefined;
    return randomFloatInRange(r[0], r[1], 2);
  }
  function inferGongfaSubtype(op) {
    var st = op && op.subtype != null ? String(op.subtype).trim() : "";
    if (!st && op && op.subType != null) st = String(op.subType).trim();
    var t = op && op.type != null ? String(op.type).trim() : "";
    if (!st && (t === "攻击功法" || t === "攻击")) st = "攻击";
    if (!st && (t === "辅助功法" || t === "辅助")) st = "辅助";
    return st;
  }
  function ensurePillRecoverEffectsByGrade(p, grade) {
    if (!p || typeof p !== "object") return;
    var hasBreakthrough =
      (Array.isArray(p.breakthrough) && p.breakthrough.length > 0) ||
      (p.effects &&
        typeof p.effects === "object" &&
        Array.isArray(p.effects.breakthrough) &&
        p.effects.breakthrough.length > 0);
    if (hasBreakthrough) return;
    var hpRange = getAttrRangeByGrade(grade, "血量");
    var mpRange = getAttrRangeByGrade(grade, "法力");
    if (!hpRange && !mpRange) return;
    var effects = p.effects && typeof p.effects === "object" ? Object.assign({}, p.effects) : {};
    var recover = effects.recover && typeof effects.recover === "object" ? Object.assign({}, effects.recover) : {};
    if (!(typeof recover.hp === "number" && isFinite(recover.hp) && recover.hp > 0) && hpRange) {
      recover.hp = randomIntInRange(hpRange[0], hpRange[1]);
    }
    if (!(typeof recover.mp === "number" && isFinite(recover.mp) && recover.mp > 0) && mpRange) {
      recover.mp = randomIntInRange(mpRange[0], mpRange[1]);
    }
    if (
      (typeof recover.hp === "number" && isFinite(recover.hp) && recover.hp > 0) ||
      (typeof recover.mp === "number" && isFinite(recover.mp) && recover.mp > 0)
    ) {
      effects.recover = recover;
      p.effects = effects;
    }
  }
  function getBreakthroughBonusRangeByGrade(grade) {
    var g = grade != null ? String(grade).trim() : "";
    var r = BREAKTHROUGH_PILL_GRADE_BONUS_RANGE_MAP[g];
    if (!Array.isArray(r) || r.length < 2) return null;
    return [Math.floor(r[0]), Math.floor(r[1])];
  }
  function getBreakthroughRouteByGrade(grade) {
    var g = grade != null ? String(grade).trim() : "";
    if (!g) return null;
    return BREAKTHROUGH_PILL_ROUTE_BY_GRADE[g] || null;
  }
  function ensureBreakthroughPillEffects(payload, raw) {
    if (!payload || typeof payload !== "object") return;
    var p = payload;
    var src = raw && typeof raw === "object" ? raw : {};
    var rawType = src.type != null ? String(src.type).trim() : "";
    var payloadType = p.type != null ? String(p.type).trim() : "";
    var hasExistingBreakthrough =
      (Array.isArray(src.breakthrough) && src.breakthrough.length > 0) ||
      (src.effects &&
        typeof src.effects === "object" &&
        Array.isArray(src.effects.breakthrough) &&
        src.effects.breakthrough.length > 0) ||
      (Array.isArray(p.breakthrough) && p.breakthrough.length > 0) ||
      (p.effects &&
        typeof p.effects === "object" &&
        Array.isArray(p.effects.breakthrough) &&
        p.effects.breakthrough.length > 0);
    var shouldTreatAsBreakthroughPill =
      rawType === "突破丹药" || payloadType === "突破丹药" || hasExistingBreakthrough;
    if (!shouldTreatAsBreakthroughPill) return;
    var g = p.grade != null ? String(p.grade).trim() : "";
    var route = getBreakthroughRouteByGrade(g);
    var range = getBreakthroughBonusRangeByGrade(g);
    if (!route || !range) return;
    var bonusPercent = randomIntInRange(range[0], range[1]);
    var bonusRatio = bonusPercent / 100;
    var eff = p.effects && typeof p.effects === "object" ? Object.assign({}, p.effects) : {};
    eff.breakthrough = [{ from: route.from, to: route.to, chanceBonus: bonusRatio }];
    p.effects = eff;
    p.breakthrough = eff.breakthrough;
    p.type = "丹药";
    if (!p.desc || String(p.desc).trim() === "") {
      p.desc = "用于" + route.from + "突破" + route.to + "，可提升约" + bonusPercent + "%成功率。";
    }
  }
  function ensureGeneratedItemStats(payload, raw) {
    if (!payload || typeof payload !== "object") return payload;
    var p = payload;
    var g = p.grade != null ? String(p.grade).trim() : "";
    if (!g) return p;
    if (typeof p.value !== "number" || !isFinite(p.value)) {
      var rv = fillRandomValueByGrade(g);
      if (typeof rv === "number" && isFinite(rv)) p.value = rv;
    }
    var et = p.equipType != null ? String(p.equipType).trim() : "";
    var bt = p.type != null ? String(p.type).trim() : "";
    var subtype = inferGongfaSubtype(raw || p);
    if (!p.bonus || typeof p.bonus !== "object") p.bonus = {};
    if (et === "武器" || bt === "武器") {
      var wb =
        typeof p.bonus.物攻 === "number" && isFinite(p.bonus.物攻) && p.bonus.物攻 > 0
          ? p.bonus.物攻
          : getAttrRandomByGrade(g, "物攻") || 1;
      p.bonus = { 物攻: wb };
      if (!p.magnification || typeof p.magnification !== "object") p.magnification = {};
      var wm = typeof p.magnification.物攻 === "number" && isFinite(p.magnification.物攻) ? p.magnification.物攻 : null;
      p.magnification = { 物攻: wm != null ? wm : getDamageMultiplierByGrade(g) || 1.0 };
    } else if (et === "法器" || bt === "法器") {
      if (!(typeof p.bonus.法攻 === "number" && isFinite(p.bonus.法攻) && p.bonus.法攻 > 0)) {
        p.bonus.法攻 = getAttrRandomByGrade(g, "法攻") || 1;
      }
      if (!(typeof p.bonus.法力 === "number" && isFinite(p.bonus.法力) && p.bonus.法力 > 0)) {
        p.bonus.法力 = getAttrRandomByGrade(g, "法力") || 1;
      }
    } else if (et === "防具" || bt === "防具") {
      if (!(typeof p.bonus.物防 === "number" && isFinite(p.bonus.物防) && p.bonus.物防 > 0)) {
        p.bonus.物防 = getAttrRandomByGrade(g, "物防") || 1;
      }
      if (!(typeof p.bonus.法防 === "number" && isFinite(p.bonus.法防) && p.bonus.法防 > 0)) {
        p.bonus.法防 = getAttrRandomByGrade(g, "法防") || 1;
      }
    } else if (bt === "载具") {
      if (!(typeof p.bonus.脚力 === "number" && isFinite(p.bonus.脚力) && p.bonus.脚力 > 0)) {
        p.bonus.脚力 = getAttrRandomByGrade(g, "脚力") || 1;
      }
    } else if (bt === "丹药") {
      // 先识别突破丹药并写入 effects.breakthrough，避免后续被当作普通恢复丹药补 recover。
      ensureBreakthroughPillEffects(p, raw || p);
      ensurePillRecoverEffectsByGrade(p, g);
    } else if (bt === "功法") {
      if (subtype === "攻击") {
        var gb =
          typeof p.bonus.法攻 === "number" && isFinite(p.bonus.法攻) && p.bonus.法攻 > 0
            ? p.bonus.法攻
            : getAttrRandomByGrade(g, "法攻") || 1;
        p.bonus = { 法攻: gb };
        if (!p.magnification || typeof p.magnification !== "object") p.magnification = {};
        var gm = typeof p.magnification.法攻 === "number" && isFinite(p.magnification.法攻) ? p.magnification.法攻 : null;
        p.magnification = { 法攻: gm != null ? gm : getDamageMultiplierByGrade(g) || 1.0 };
        var mpRangeAtk = getAttrRangeByGrade(g, "法力");
        if (mpRangeAtk) {
          if (!(typeof p.manacost === "number" && isFinite(p.manacost))) {
            p.manacost = randomIntInRange(mpRangeAtk[0], mpRangeAtk[1]);
          } else {
            p.manacost = Math.max(mpRangeAtk[0], Math.min(mpRangeAtk[1], Math.round(p.manacost)));
          }
        } else if (!(typeof p.manacost === "number" && isFinite(p.manacost))) {
          p.manacost = 1;
        }
      } else if (subtype === "辅助") {
        if (!(typeof p.bonus.法力 === "number" && isFinite(p.bonus.法力) && p.bonus.法力 > 0)) {
          p.bonus.法力 = getAttrRandomByGrade(g, "法力") || 1;
        }
        if (!(typeof p.bonus.神识 === "number" && isFinite(p.bonus.神识) && p.bonus.神识 > 0)) {
          p.bonus.神识 = getAttrRandomByGrade(g, "神识") || 1;
        }
      }
    }
    if (p.bonus && typeof p.bonus === "object" && !Object.keys(p.bonus).length) delete p.bonus;
    ensureBreakthroughPillEffects(p, raw || p);
    return p;
  }
  function getStateRulesApi() {
    return global.MortalJourneyStateRules;
  }

  function fillRuleTemplate(template, vars) {
    var out = String(template || "");
    if (!vars || typeof vars !== "object") return out;
    return out.replace(/\{\{([A-Z_]+)\}\}/g, function (m, key) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
      return m;
    });
  }

  function buildStateRuleVars() {
    return {
      OPS_TAG_OPEN: OPS_TAG_OPEN,
      OPS_TAG_CLOSE: OPS_TAG_CLOSE,
      WORLD_STATE_TAG_OPEN: WORLD_STATE_TAG_OPEN,
      WORLD_STATE_TAG_CLOSE: WORLD_STATE_TAG_CLOSE,
      USER_STATE_TAG_OPEN: USER_STATE_TAG_OPEN,
      USER_STATE_TAG_CLOSE: USER_STATE_TAG_CLOSE,
      NPC_NEARBY_TAG_OPEN: NPC_NEARBY_TAG_OPEN,
      NPC_NEARBY_TAG_CLOSE: NPC_NEARBY_TAG_CLOSE,
      NPC_STORY_HINTS_TAG_OPEN:
        global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_OPEN
          ? global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_OPEN
          : "<mj_npc_story_hints>",
      NPC_STORY_HINTS_TAG_CLOSE:
        global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_CLOSE
          ? global.MortalJourneyStoryChat.NPC_STORY_HINTS_TAG_CLOSE
          : "</mj_npc_story_hints>",
      BATTLE_TRIGGER_TAG_OPEN:
        global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_OPEN
          ? global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_OPEN
          : BATTLE_TRIGGER_TAG_OPEN,
      BATTLE_TRIGGER_TAG_CLOSE:
        global.MortalJourneyStoryChat && global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_CLOSE
          ? global.MortalJourneyStoryChat.BATTLE_TRIGGER_TAG_CLOSE
          : BATTLE_TRIGGER_TAG_CLOSE,
      SPIRIT_STONE_TAG_OPEN: SPIRIT_STONE_TAG_OPEN,
      SPIRIT_STONE_TAG_CLOSE: SPIRIT_STONE_TAG_CLOSE,
      ITEM_ADD_TAG_OPEN: ITEM_ADD_TAG_OPEN,
      ITEM_ADD_TAG_CLOSE: ITEM_ADD_TAG_CLOSE,
      ITEM_REMOVE_TAG_OPEN: ITEM_REMOVE_TAG_OPEN,
      ITEM_REMOVE_TAG_CLOSE: ITEM_REMOVE_TAG_CLOSE,
    };
  }

  function getStateRuleTemplate(name, fallbackText) {
    var SR = getStateRulesApi();
    var tpl = SR && SR.templates && SR.templates[name] != null ? String(SR.templates[name]) : "";
    var filled = fillRuleTemplate(tpl, buildStateRuleVars()).trim();
    if (filled) return filled;
    return String(fallbackText || "").trim();
  }


  /** 与 mainScreen / UI 一致：YYYY年 MM月 DD日 HH:MM（月日时辰分可 1～2 位，应用时会规范为零补位） */
  var WORLD_TIME_STRING_RE = /^\s*(\d+)年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})\s*$/;

  function pad2(n) {
    var x = Math.floor(Number(n));
    if (!isFinite(x)) return "00";
    var s = String(Math.abs(x));
    return s.length < 2 ? "0" + s : s;
  }

  function padYearMin4(y) {
    var x = Math.floor(Number(y));
    if (!isFinite(x) || x < 0) return "0000";
    var s = String(x);
    while (s.length < 4) s = "0" + s;
    return s;
  }

  /**
   * @param {string} s
   * @returns {{ y:number,m:number,d:number,h:number,min:number }|null}
   */
  function parseWorldTimeComparable(s) {
    var t = String(s || "").trim();
    var m = WORLD_TIME_STRING_RE.exec(t);
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    var h = parseInt(m[4], 10);
    var mi = parseInt(m[5], 10);
    if (!isFinite(y) || !isFinite(mo) || !isFinite(d) || !isFinite(h) || !isFinite(mi)) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
    return { y: y, m: mo, d: d, h: h, min: mi };
  }

  function formatWorldTimeComparable(c) {
    if (!c) return "";
    return (
      padYearMin4(c.y) + "年 " + pad2(c.m) + "月 " + pad2(c.d) + "日 " + pad2(c.h) + ":" + pad2(c.min)
    );
  }

  /**
   * @param {{y:number,m:number,d:number,h:number,min:number}|null} a
   * @param {{y:number,m:number,d:number,h:number,min:number}|null} b
   * @returns {number} -1 a<b；0 相等；1 a>b
   */
  function compareWorldTimeComparable(a, b) {
    if (!a || !b) return 0;
    if (a.y !== b.y) return a.y < b.y ? -1 : 1;
    if (a.m !== b.m) return a.m < b.m ? -1 : 1;
    if (a.d !== b.d) return a.d < b.d ? -1 : 1;
    if (a.h !== b.h) return a.h < b.h ? -1 : 1;
    if (a.min !== b.min) return a.min < b.min ? -1 : 1;
    return 0;
  }

  /**
   * 运行时世界时间与地点（供状态 AI 写回对照）。
   */
  function buildWorldSnapshotJson(G) {
    var g = G || global.MortalJourneyGame || {};
    var wt = g.worldTimeString != null ? String(g.worldTimeString).trim() : "";
    var loc = g.currentLocation != null ? String(g.currentLocation).trim() : "";
    var maxHp =
      typeof g.maxHp === "number" && isFinite(g.maxHp)
        ? Math.max(1, Math.floor(g.maxHp))
        : g.playerBase && typeof g.playerBase.hp === "number" && isFinite(g.playerBase.hp)
          ? Math.max(1, Math.floor(g.playerBase.hp))
          : 1;
    var maxMp =
      typeof g.maxMp === "number" && isFinite(g.maxMp)
        ? Math.max(1, Math.floor(g.maxMp))
        : g.playerBase && typeof g.playerBase.mp === "number" && isFinite(g.playerBase.mp)
          ? Math.max(1, Math.floor(g.playerBase.mp))
          : 1;
    var curHp =
      typeof g.currentHp === "number" && isFinite(g.currentHp)
        ? Math.max(0, Math.min(maxHp, Math.floor(g.currentHp)))
        : maxHp;
    var curMp =
      typeof g.currentMp === "number" && isFinite(g.currentMp)
        ? Math.max(0, Math.min(maxMp, Math.floor(g.currentMp)))
        : maxMp;
    var defAge = 16;
    var RAge = global.MjMainScreenPanelRealm;
    if (RAge && typeof RAge.DEFAULT_AGE === "number" && isFinite(RAge.DEFAULT_AGE)) {
      defAge = Math.max(0, Math.floor(RAge.DEFAULT_AGE));
    }
    var RSna = global.RealmState;
    var ageSnap =
      RSna && typeof RSna.getProtagonistNarrativeAge === "function"
        ? RSna.getProtagonistNarrativeAge(g, g.fateChoice)
        : typeof g.age === "number" && isFinite(g.age)
          ? Math.max(0, Math.floor(g.age))
          : defAge;
    return JSON.stringify({
      worldTimeString: wt,
      currentLocation: loc,
      currentHp: curHp,
      currentMp: curMp,
      maxHp: maxHp,
      maxMp: maxMp,
      age: ageSnap,
    });
  }

  function ensureInventoryShape(G) {
    if (!G) return;
    if (!Array.isArray(G.inventorySlots)) {
      G.inventorySlots = [];
    }
    while (G.inventorySlots.length < INVENTORY_SLOT_COUNT) {
      G.inventorySlots.push(null);
    }
  }

  /**
   * 须与 mainScreen_panel_realm.normalizeBagItem 一致，否则会吞掉战利品/配置里的 magnification、manacost、功法 type。
   * 优先委托 MjMainScreenPanelRealm（脚本加载顺序晚于本文件时用回退实现）。
   */
  function normalizeBagItem(entry) {
    var R0 = global.MjMainScreenPanelRealm;
    if (R0 && typeof R0.normalizeBagItem === "function") {
      return R0.normalizeBagItem(entry);
    }
    if (entry == null) return null;
    var name =
      entry.name != null && String(entry.name).trim() !== ""
        ? String(entry.name).trim()
        : entry.label != null && String(entry.label).trim() !== ""
          ? String(entry.label).trim()
          : entry.title != null && String(entry.title).trim() !== ""
            ? String(entry.title).trim()
            : "";
    if (!name) return null;
    var c = entry.count;
    var cnt = typeof c === "number" && isFinite(c) ? Math.max(0, Math.floor(c)) : 1;
    var o = { name: name, count: cnt };
    if (entry.desc != null && String(entry.desc).trim() !== "") o.desc = String(entry.desc);
    if (entry.equipType != null && String(entry.equipType).trim() !== "") {
      o.equipType = String(entry.equipType).trim();
    }
    if (entry.grade != null && String(entry.grade).trim() !== "") o.grade = String(entry.grade).trim();
    if (typeof entry.value === "number" && isFinite(entry.value)) {
      o.value = Math.max(0, Math.floor(entry.value));
    }
    if (entry.type != null && String(entry.type).trim() === "功法") {
      o.type = "功法";
      delete o.equipType;
    } else if (!o.equipType && entry.type != null && String(entry.type).trim() !== "") {
      o.type = String(entry.type).trim();
    }
    if (entry.subtype != null && String(entry.subtype).trim() !== "") o.subtype = String(entry.subtype).trim();
    else if (entry.subType != null && String(entry.subType).trim() !== "") o.subType = String(entry.subType).trim();
    if (entry.bonus && typeof entry.bonus === "object" && Object.keys(entry.bonus).length > 0) {
      o.bonus = entry.bonus;
    }
    if (entry.effects && typeof entry.effects === "object" && Object.keys(entry.effects).length > 0) {
      o.effects = entry.effects;
    }
    if (typeof entry.manacost === "number" && isFinite(entry.manacost)) {
      o.manacost = Math.max(0, Math.round(entry.manacost));
    }
    if (entry.magnification && typeof entry.magnification === "object") {
      var mkeys = Object.keys(entry.magnification);
      if (mkeys.length > 0) o.magnification = Object.assign({}, entry.magnification);
    }
    return o;
  }

  function findFirstEmptyBagSlot(G) {
    ensureInventoryShape(G);
    var slots = G.inventorySlots;
    for (var i = 0; i < slots.length; i++) {
      if (!slots[i]) return i;
    }
    for (var k = 0; k < INVENTORY_GRID_COLS; k++) {
      slots.push(null);
    }
    return slots.length - INVENTORY_GRID_COLS;
  }

  /**
   * 与主界面 MjMainScreenPanel.tryPlaceItemInBag 一致（同名堆叠会 mergeLootPayloadIntoBagCell；妖兽内丹等见 MjMainScreenPanelRealm.bagItemSkipsSameNameStack，不合并、按件占格）。
   * @returns {boolean}
   */
  function tryPlaceItemInBag(G, payload) {
    var PP = global.MjMainScreenPanel;
    if (PP && typeof PP.tryPlaceItemInBag === "function") {
      return PP.tryPlaceItemInBag(G, payload);
    }
    if (!G || !payload || !payload.name) return false;
    ensureInventoryShape(G);
    var name = String(payload.name).trim();
    if (!name) return false;
    var cnt =
      typeof payload.count === "number" && isFinite(payload.count) ? Math.max(1, Math.floor(payload.count)) : 1;
    var desc = payload.desc != null ? String(payload.desc) : "";
    var RSkip = global.MjMainScreenPanelRealm;
    if (RSkip && typeof RSkip.bagItemSkipsSameNameStack === "function" && RSkip.bagItemSkipsSameNameStack(name)) {
      while (true) {
        var empty0 = 0;
        for (var e0 = 0; e0 < G.inventorySlots.length; e0++) {
          if (!G.inventorySlots[e0]) empty0++;
        }
        if (empty0 >= cnt) break;
        for (var r0 = 0; r0 < INVENTORY_GRID_COLS; r0++) {
          G.inventorySlots.push(null);
        }
      }
      for (var k0 = 0; k0 < cnt; k0++) {
        var j0 = findFirstEmptyBagSlot(G);
        if (j0 < 0) return false;
        G.inventorySlots[j0] = normalizeBagItem({
          name: name,
          count: 1,
          desc: desc || undefined,
          equipType: payload.equipType,
          grade: payload.grade,
          value: payload.value,
          type: payload.type,
          subtype: payload.subtype,
          subType: payload.subType,
          bonus: payload.bonus,
          effects: payload.effects,
          manacost: payload.manacost,
          magnification: payload.magnification,
        });
      }
      return true;
    }
    for (var i = 0; i < G.inventorySlots.length; i++) {
      var c = G.inventorySlots[i];
      if (c && c.name === name) {
        c.count = (typeof c.count === "number" && isFinite(c.count) ? c.count : 1) + cnt;
        return true;
      }
    }
    var j = findFirstEmptyBagSlot(G);
    if (j < 0) return false;
    G.inventorySlots[j] = normalizeBagItem({
      name: name,
      count: cnt,
      desc: desc || undefined,
      equipType: payload.equipType,
      grade: payload.grade,
      value: payload.value,
      type: payload.type,
      subtype: payload.subtype,
      subType: payload.subType,
      bonus: payload.bonus,
      effects: payload.effects,
      manacost: payload.manacost,
      magnification: payload.magnification,
    });
    return true;
  }

  function bagCellContinuityForNormalize(c) {
    if (!c) return {};
    var o = {};
    if (c.desc != null) o.desc = c.desc;
    if (c.equipType != null) o.equipType = c.equipType;
    if (c.grade != null) o.grade = c.grade;
    if (typeof c.value === "number" && isFinite(c.value)) o.value = c.value;
    if (c.type != null) o.type = c.type;
    if (c.subtype != null) o.subtype = c.subtype;
    if (c.subType != null) o.subType = c.subType;
    if (c.bonus && typeof c.bonus === "object") o.bonus = c.bonus;
    if (c.effects && typeof c.effects === "object") o.effects = c.effects;
    if (typeof c.manacost === "number" && isFinite(c.manacost)) o.manacost = c.manacost;
    if (c.magnification && typeof c.magnification === "object") {
      o.magnification = Object.assign({}, c.magnification);
    }
    return o;
  }

  /**
   * 从储物袋扣减同名堆叠（先统计总量，再按槽位顺序扣；多格同名会合并扣除）。
   * 若请求 count 大于袋内现存总量，则扣尽该名堆叠（扣到 0），仍视为成功。
   * @returns {{ ok: boolean, reason?: string, actualRemoved?: number }}
   */
  function removeStackedItemsFromBag(G, name, count) {
    ensureInventoryShape(G);
    var nm = name != null ? String(name).trim() : "";
    if (!nm) return { ok: false, reason: "缺少有效 name" };
    var n = typeof count === "number" && isFinite(count) ? Math.max(1, Math.floor(count)) : 1;
    var total = 0;
    for (var t = 0; t < G.inventorySlots.length; t++) {
      var ct = G.inventorySlots[t];
      if (ct && String(ct.name).trim() === nm) {
        var cc = typeof ct.count === "number" && isFinite(ct.count) ? Math.max(1, Math.floor(ct.count)) : 1;
        total += cc;
      }
    }
    var toRemove = total > 0 ? Math.min(n, total) : 0;
    var remaining = toRemove;
    for (var i = 0; i < G.inventorySlots.length && remaining > 0; i++) {
      var c = G.inventorySlots[i];
      if (!c || String(c.name).trim() !== nm) continue;
      var cur = typeof c.count === "number" && isFinite(c.count) ? Math.max(1, Math.floor(c.count)) : 1;
      var take = Math.min(cur, remaining);
      var next = cur - take;
      remaining -= take;
      if (next <= 0) G.inventorySlots[i] = null;
      else {
        G.inventorySlots[i] = normalizeBagItem(
          Object.assign({ name: nm, count: next }, bagCellContinuityForNormalize(c)),
        );
      }
    }
    return { ok: true, actualRemoved: toRemove };
  }

  function sampleDescribeFields(src) {
    if (!src || typeof src !== "object") return null;
    var o = {};
    if (src.desc != null && String(src.desc).trim() !== "") o.desc = String(src.desc).trim();
    if (src.grade != null && String(src.grade).trim() !== "") o.grade = String(src.grade).trim();
    if (src.type != null && String(src.type).trim() !== "") o.type = String(src.type).trim();
    if (typeof src.value === "number" && isFinite(src.value)) o.value = src.value;
    if (src.bonus && typeof src.bonus === "object" && Object.keys(src.bonus).length) {
      o.bonus = src.bonus;
    }
    if (src.effects && typeof src.effects === "object") o.effects = src.effects;
    return Object.keys(o).length ? o : null;
  }

  /**
   * 汇总 stuff_describe（灵石 / 丹药 / 杂物）及装备表，供模型对齐字段与合法名称。
   */
  function buildStuffDescribeCatalog() {
    var out = {
      spirit_stones: {},
      pills: {},
      stuff: {},
      equipment: {},
    };
    var SS = global.MjDescribeSpiritStones;
    if (SS && typeof SS === "object") {
      for (var ks in SS) {
        if (Object.prototype.hasOwnProperty.call(SS, ks)) {
          var s = sampleDescribeFields(SS[ks]);
          if (s) out.spirit_stones[ks] = s;
        }
      }
    }
    var P = global.MjDescribePills;
    if (P && typeof P === "object") {
      for (var kp in P) {
        if (Object.prototype.hasOwnProperty.call(P, kp)) {
          var p = sampleDescribeFields(P[kp]);
          if (p) out.pills[kp] = p;
        }
      }
    }
    var ST = global.MjDescribeStuff;
    if (ST && typeof ST === "object") {
      for (var kt in ST) {
        if (Object.prototype.hasOwnProperty.call(ST, kt)) {
          var t = sampleDescribeFields(ST[kt]);
          if (t) out.stuff[kt] = t;
        }
      }
    }
    var E = global.MjDescribeEquipment;
    if (E && typeof E === "object") {
      for (var ke in E) {
        if (Object.prototype.hasOwnProperty.call(E, ke)) {
          var e = sampleDescribeFields(E[ke]);
          if (e) out.equipment[ke] = e;
        }
      }
    }
    return out;
  }

  function buildStuffDescribeCatalogJson() {
    return JSON.stringify(buildStuffDescribeCatalog());
  }

  /**
   * 功法表摘要（名称 → desc/type/grade/value…），供状态 AI 将剧情 intro 对齐为合法功法名。
   */
  function buildGongfaDescribeCatalog() {
    var out = {};
    var Gf = global.MjDescribeGongfa;
    if (Gf && typeof Gf === "object") {
      for (var k in Gf) {
        if (Object.prototype.hasOwnProperty.call(Gf, k)) {
          var s = sampleDescribeFields(Gf[k]);
          if (s) out[k] = s;
        }
      }
    }
    return out;
  }

  function buildGongfaDescribeCatalogJson() {
    return JSON.stringify(buildGongfaDescribeCatalog());
  }

  /** 境界合法取值（与 RealmState 一致） */
  function buildRealmLexiconLine() {
    var RS = global.RealmState;
    var majors = RS && RS.REALM_ORDER ? RS.REALM_ORDER.join("、") : "练气、筑基、结丹、元婴、化神";
    var subs = RS && RS.SUB_STAGES ? RS.SUB_STAGES.join("、") : "初期、中期、后期";
    return "大境界：" + majors + "；小境界：" + subs + "（化神无小境界，realm.minor 用 null 或省略由程序规范）。";
  }

  /**
   * 周围人物精简快照（状态 AI 须在变更时输出完整列表，可参考此处 id/displayName）
   */
  function buildNearbyNpcsSnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    var list = Array.isArray(g.nearbyNpcs) ? g.nearbyNpcs : [];
    var compact = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n || typeof n !== "object") continue;
      var row = {
        id: n.id != null ? String(n.id) : "",
        displayName: n.displayName != null ? String(n.displayName) : "",
        realm: n.realm && typeof n.realm === "object" ? n.realm : {},
        gender: n.gender != null ? String(n.gender) : "",
        linggen: n.linggen != null ? String(n.linggen) : "",
        age: typeof n.age === "number" && isFinite(n.age) ? Math.floor(n.age) : null,
        isVisible:
          typeof n.isVisible === "boolean"
            ? n.isVisible
            : n.isTemporarilyAway
              ? false
              : true,
        favorability:
          typeof n.favorability === "number" && isFinite(n.favorability)
            ? Math.max(-99, Math.min(99, Math.round(n.favorability)))
            : null,
        identity: n.identity != null ? String(n.identity) : "",
        currentStageGoal: n.currentStageGoal != null ? String(n.currentStageGoal) : "",
        longTermGoal: n.longTermGoal != null ? String(n.longTermGoal) : "",
        hobby: n.hobby != null ? String(n.hobby) : "",
        fear: n.fear != null ? String(n.fear) : "",
        personality: n.personality != null ? String(n.personality) : "",
        maxHp: typeof n.maxHp === "number" && isFinite(n.maxHp) ? Math.max(1, Math.floor(n.maxHp)) : null,
        maxMp: typeof n.maxMp === "number" && isFinite(n.maxMp) ? Math.max(1, Math.floor(n.maxMp)) : null,
        currentHp: typeof n.currentHp === "number" && isFinite(n.currentHp) ? Math.max(0, Math.floor(n.currentHp)) : null,
        currentMp: typeof n.currentMp === "number" && isFinite(n.currentMp) ? Math.max(0, Math.floor(n.currentMp)) : null,
      };
      if (n.isDead === true) {
        row.isDead = true;
        row.currentHp = 0;
      }
      compact.push(row);
    }
    return JSON.stringify(compact);
  }

  /**
   * 当前储物袋快照（与运行时一致：name、count，及可选 desc、grade、value、equipType、type、bonus、effects）；格数可多于 12
   */
  function buildInventorySnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    ensureInventoryShape(g);
    var slots = [];
    for (var i = 0; i < g.inventorySlots.length; i++) {
      var cell = g.inventorySlots[i];
      slots.push(cell ? normalizeBagItem(cell) : null);
    }
    return JSON.stringify(slots);
  }

  function normalizeEquipSlotCell(cell) {
    if (cell == null) return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc);
    if (cell.equipType != null && String(cell.equipType).trim() !== "") o.equipType = String(cell.equipType);
    return o;
  }

  function normalizeGongfaSlotCell(cell) {
    if (cell == null) return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc);
    if (cell.type != null && String(cell.type).trim() !== "") o.type = String(cell.type);
    if (cell.subtype != null && String(cell.subtype).trim() !== "") o.subtype = String(cell.subtype).trim();
    else if (cell.subType != null && String(cell.subType).trim() !== "") o.subType = String(cell.subType).trim();
    if (cell.grade != null && String(cell.grade).trim() !== "") o.grade = String(cell.grade);
    return o;
  }

  /**
   * 主角佩戴栏 3 格快照（只读，不写回 G）
   */
  function buildEquippedSnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    var raw =
      Array.isArray(g.equippedSlots) && g.equippedSlots.length === EQUIP_SLOT_COUNT
        ? g.equippedSlots
        : [null, null, null];
    var out = [];
    for (var i = 0; i < EQUIP_SLOT_COUNT; i++) {
      var item = normalizeEquipSlotCell(raw[i]);
      if (!item) {
        out.push(null);
        continue;
      }
      var row = { 槽位: EQUIP_SLOT_LABELS[i] || "装备", index: i, name: item.name };
      if (item.desc) row.desc = item.desc;
      if (item.equipType) row.equipType = item.equipType;
      out.push(row);
    }
    return JSON.stringify(out);
  }

  /**
   * 主角功法栏 12 格快照（只读）
   */
  function buildGongfaSnapshot(G) {
    var g = G || global.MortalJourneyGame || {};
    var raw =
      Array.isArray(g.gongfaSlots) && g.gongfaSlots.length === GONGFA_SLOT_COUNT
        ? g.gongfaSlots
        : [];
    var slots = [];
    for (var j = 0; j < GONGFA_SLOT_COUNT; j++) {
      slots.push(normalizeGongfaSlotCell(raw[j]) || null);
    }
    return JSON.stringify(slots);
  }

  function isWearSlotEquipType(t) {
    return t === "武器" || t === "法器" || t === "防具";
  }

  function shallowCloneEffects(eff) {
    if (!eff || typeof eff !== "object") return undefined;
    try {
      return JSON.parse(JSON.stringify(eff));
    } catch (e) {
      return eff;
    }
  }

  /**
   * 将 AI 操作与描述表合并为可放入格子的 payload（表内 desc/grade/value/type/bonus/effects 优先，op 可覆盖）。
   * 注意：装备佩戴部位仅用 equipType 或 type 为「武器|法器|防具」；丹药等用 type「丹药」等，不可把丹药 type 误写入 equipType。
   */
  function resolvePlacePayload(raw) {
    var op = raw && typeof raw === "object" ? raw : {};
    var name = op.name != null ? String(op.name).trim() : "";
    if (!name) return null;

    var C = global.MjCreationConfig;
    var st = C && typeof C.getStuffDescribe === "function" ? C.getStuffDescribe(name) : null;
    var eq = C && typeof C.getEquipmentDescribe === "function" ? C.getEquipmentDescribe(name) : null;
    var gfd = C && typeof C.getGongfaDescribe === "function" ? C.getGongfaDescribe(name) : null;
    var base = st || eq || null;

    var count =
      typeof op.count === "number" && isFinite(op.count) ? Math.max(1, Math.floor(op.count)) : 1;

    var desc = "";
    if (op.desc != null && String(op.desc).trim() !== "") desc = String(op.desc).trim();
    else if (op.intro != null && String(op.intro).trim() !== "") desc = String(op.intro).trim();
    else if (base && base.desc) desc = String(base.desc);

    var grade = "";
    if (op.grade != null && String(op.grade).trim() !== "") grade = String(op.grade).trim();
    else if (base && base.grade != null && String(base.grade).trim() !== "")
      grade = String(base.grade).trim();

    var equipType;
    var bagType;
    if (op.equipType != null && String(op.equipType).trim() !== "") {
      equipType = String(op.equipType).trim();
    } else if (eq && eq.type != null && String(eq.type).trim() !== "") {
      equipType = String(eq.type).trim();
    }
    if (op.type != null && String(op.type).trim() !== "") {
      var top = String(op.type).trim();
      if (isWearSlotEquipType(top)) {
        if (!equipType) equipType = top;
      } else if (top === "攻击功法" || top === "辅助功法") {
        bagType = "功法";
        if (!op.subtype && !op.subType) op.subtype = top === "攻击功法" ? "攻击" : "辅助";
      } else if (top === "突破丹药") {
        bagType = "丹药";
      } else {
        bagType = top;
      }
    }
    var gfSubtype = inferGongfaSubtype(op);
    if (!bagType && st && st.type != null && String(st.type).trim() !== "" && !eq) {
      bagType = String(st.type).trim();
    }
    if (equipType) {
      bagType = undefined;
    }

    var valueNum;
    if (typeof op.value === "number" && isFinite(op.value)) {
      valueNum = Math.max(0, Math.floor(op.value));
    } else if (base && typeof base.value === "number" && isFinite(base.value)) {
      valueNum = Math.floor(base.value);
    } else {
      var randomValue = fillRandomValueByGrade(grade);
      if (typeof randomValue === "number" && isFinite(randomValue)) valueNum = randomValue;
    }

    var mergedBonus = {};
    if (base && base.bonus && typeof base.bonus === "object") {
      Object.assign(mergedBonus, base.bonus);
    }
    if (op.bonus && typeof op.bonus === "object") {
      Object.assign(mergedBonus, op.bonus);
    }
    var bonusOut = Object.keys(mergedBonus).length ? mergedBonus : undefined;

    var effectsOut;
    if (op.effects != null && typeof op.effects === "object") {
      effectsOut = shallowCloneEffects(op.effects);
    } else if (st && st.effects != null && typeof st.effects === "object") {
      effectsOut = shallowCloneEffects(st.effects);
    }

    if (C && typeof C.resolveStuffEntry === "function") {
      var meta = {};
      if (desc) meta.desc = desc;
      if (grade) meta.grade = grade;
      meta.count = count;
      if (bonusOut) meta.bonus = bonusOut;
      var resolved = C.resolveStuffEntry(name, meta);
      if (resolved && resolved.type === "item" && resolved.name) {
        var c0 = typeof resolved.count === "number" && isFinite(resolved.count) ? resolved.count : count;
        var pay = {
          name: String(resolved.name).trim(),
          count: Math.max(1, c0),
          desc: resolved.desc,
          grade: resolved.grade,
          equipType: equipType,
        };
        if (typeof valueNum === "number") pay.value = valueNum;
        if (bagType) pay.type = bagType;
        if (bagType === "功法" && gfSubtype) pay.subtype = gfSubtype;
        if (bonusOut) pay.bonus = bonusOut;
        if (effectsOut) pay.effects = effectsOut;
        if (typeof op.manacost === "number" && isFinite(op.manacost)) {
          pay.manacost = Math.max(0, Math.round(op.manacost));
        } else if (gfd && typeof gfd.manacost === "number" && isFinite(gfd.manacost)) {
          pay.manacost = Math.max(0, Math.round(gfd.manacost));
        }
        var magPayOp =
          op.magnification && typeof op.magnification === "object" && Object.keys(op.magnification).length > 0
            ? op.magnification
            : null;
        var magPayEq =
          eq && eq.magnification && typeof eq.magnification === "object" && Object.keys(eq.magnification).length > 0
            ? eq.magnification
            : null;
        var magPayGf =
          gfd && gfd.magnification && typeof gfd.magnification === "object" && Object.keys(gfd.magnification).length > 0
            ? gfd.magnification
            : null;
        if (magPayOp) pay.magnification = Object.assign({}, magPayOp);
        else if (magPayEq) pay.magnification = Object.assign({}, magPayEq);
        else if (magPayGf) pay.magnification = Object.assign({}, magPayGf);
        return ensureGeneratedItemStats(pay, op);
      }
    }

    var out = {
      name: name,
      count: count,
      desc: desc || undefined,
      grade: grade || undefined,
      equipType: equipType,
    };
    if (typeof valueNum === "number") out.value = valueNum;
    if (bagType) out.type = bagType;
    if (bagType === "功法" && gfSubtype) out.subtype = gfSubtype;
    if (bonusOut) out.bonus = bonusOut;
    if (effectsOut) out.effects = effectsOut;
    if (typeof op.manacost === "number" && isFinite(op.manacost)) {
      out.manacost = Math.max(0, Math.round(op.manacost));
    } else if (gfd && typeof gfd.manacost === "number" && isFinite(gfd.manacost)) {
      out.manacost = Math.max(0, Math.round(gfd.manacost));
    }
    var magOutOp =
      op.magnification && typeof op.magnification === "object" && Object.keys(op.magnification).length > 0
        ? op.magnification
        : null;
    var magOutEq =
      eq && eq.magnification && typeof eq.magnification === "object" && Object.keys(eq.magnification).length > 0
        ? eq.magnification
        : null;
    var magOutGf =
      gfd && gfd.magnification && typeof gfd.magnification === "object" && Object.keys(gfd.magnification).length > 0
        ? gfd.magnification
        : null;
    if (magOutOp) out.magnification = Object.assign({}, magOutOp);
    else if (magOutEq) out.magnification = Object.assign({}, magOutEq);
    else if (magOutGf) out.magnification = Object.assign({}, magOutGf);
    return ensureGeneratedItemStats(out, op);
  }

  function buildDefaultStateSystemPrompt() {
    return getStateRuleTemplate("systemPrompt", "");
  }

  function buildDefaultOutputRules() {
    return getStateRuleTemplate("outputRules", "");
  }

  /**
   * 拼出与 stage_prompt 类似的单条 user 正文（状态快照 + 表 + 剧情 + 规则）。
   * @param {Object} opts
   * @param {string} [opts.storyText] 剧情或当前局面说明
   * @param {string} [opts.extraUserHint] 追加说明
   * @param {Object} [opts.game] 默认 MortalJourneyGame
   */
  function buildInventoryStateUserContent(opts) {
    var o = opts || {};
    var G = o.game != null ? o.game : global.MortalJourneyGame || {};
    var parts = [];
    parts.push("你");
    parts.push("");
    parts.push("### 世界时间与当前地点（本回合必须在 " + WORLD_STATE_TAG_OPEN + " 中写回；世界时间只可不变或变晚，禁止早于本条 JSON）");
    parts.push(buildWorldSnapshotJson(G));
    parts.push(
      "### 主角当前佩戴（3 格，顺序：武器、法器、防具；与储物袋分立，已穿在身上的不要因剧情「使用」而再 add 入袋）",
    );
    parts.push(buildEquippedSnapshot(G));
    parts.push("### 主角功法栏（12 格，null 为空位；已学已装载的功法不要当背包物品重复 add）");
    parts.push(buildGongfaSnapshot(G));
    parts.push("### 储物袋快照（JSON 数组，每项为 null 或物品对象；长度 ≥12，可超过 12，与游戏内可扩行储物袋一致）");
    parts.push(buildInventorySnapshot(G));
    parts.push("### 周围人物快照（仅 id/显示名/境界等摘要；若输出 " + NPC_NEARBY_TAG_OPEN + " 则须给出**完整**当期列表以替换）");
    parts.push(buildNearbyNpcsSnapshot(G));
    parts.push("### 境界合法取值");
    parts.push(buildRealmLexiconLine());
    parts.push("### 可引用功法表（名称须与之一致时可直用表内 bonus/type）");
    parts.push(buildGongfaDescribeCatalogJson());
    parts.push("### 可引用物品表（stuff_describe + 装备表，字段与游戏内描述一致）");
    parts.push(buildStuffDescribeCatalogJson());
    if (o.storyText != null && String(o.storyText).trim() !== "") {
      parts.push("### 剧情 / 局面");
      parts.push(String(o.storyText).trim());
    }
    if (o.extraUserHint != null && String(o.extraUserHint).trim() !== "") {
      parts.push("### 补充说明");
      parts.push(String(o.extraUserHint).trim());
    }
    // parts.push("### 变量操作（储物袋）");
    // parts.push(buildDefaultOutputRules());
    return parts.join("\n");
  }

  /**
   * @param {Object} opts
   * @param {string} [opts.systemPrompt]
   * @param {string} [opts.storyText]
   * @param {string} [opts.extraUserHint]
   * @param {Object} [opts.game]
   * @returns {Array<{role:string,content:string}>}
   */
  function buildMessages(opts) {
    var o = opts || {};
    var messages = [];
    var custom = o.systemPrompt != null && String(o.systemPrompt).trim() !== "" ? String(o.systemPrompt).trim() : "";
    var lsv = lowerSpiritStoneValueUnit();
    var baseSystemPrompt = buildDefaultStateSystemPrompt();
    var sys = custom ? custom + "\n\n---\n\n" + baseSystemPrompt : baseSystemPrompt;
    messages.push({ role: "system", content: sys });
    messages.push({ role: "user", content: buildInventoryStateUserContent(o) });
    return messages;
  }

  function stripJsonFence(s) {
    var t = String(s || "").trim();
    var m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t);
    return m ? m[1].trim() : t;
  }
  function readTaggedJsonArray(raw, tagOpen, tagClose) {
    var open = String(tagOpen || "").trim();
    var close = String(tagClose || "").trim();
    if (!open || !close) return { ok: false, found: false, arr: [], error: "标签配置缺失" };
    var esc = function (x) {
      return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    var re = new RegExp(esc(open) + "\\s*([\\s\\S]*?)\\s*" + esc(close), "i");
    var m = re.exec(String(raw || ""));
    if (!m) return { ok: false, found: false, arr: [], error: null };
    var inner = stripJsonFence(m[1].trim());
    try {
      var parsed = JSON.parse(inner);
      if (!Array.isArray(parsed)) {
        return { ok: false, found: true, arr: [], error: open + " 内须为 JSON 数组" };
      }
      return { ok: true, found: true, arr: parsed, error: null };
    } catch (e) {
      return {
        ok: false,
        found: true,
        arr: [],
        error: open + " JSON：" + (e && e.message ? String(e.message) : "解析失败"),
      };
    }
  }
  function parseInventoryOpsBySplitTags(text) {
    var raw = String(text || "");
    var ss = readTaggedJsonArray(raw, SPIRIT_STONE_TAG_OPEN, SPIRIT_STONE_TAG_CLOSE);
    var ia = readTaggedJsonArray(raw, ITEM_ADD_TAG_OPEN, ITEM_ADD_TAG_CLOSE);
    var ir = readTaggedJsonArray(raw, ITEM_REMOVE_TAG_OPEN, ITEM_REMOVE_TAG_CLOSE);
    var any = ss.found || ia.found || ir.found;
    if (!any) return { ok: false, ops: [], error: "未找到新规则标签", parseVia: null };
    var errs = [];
    if (ss.found && !ss.ok) errs.push(ss.error);
    if (ia.found && !ia.ok) errs.push(ia.error);
    if (ir.found && !ir.ok) errs.push(ir.error);
    if (errs.length) return { ok: false, ops: [], error: errs.join("；"), parseVia: "split_tags" };
    var ops = [];
    if (ss.ok) {
      for (var i = 0; i < ss.arr.length; i++) {
        var a = ss.arr[i];
        if (!a || typeof a !== "object") continue;
        ops.push({
          op: a.op != null ? String(a.op).trim().toLowerCase() : "add",
          name: a.name,
          count: a.count,
        });
      }
    }
    if (ia.ok) {
      for (var j = 0; j < ia.arr.length; j++) {
        var b = ia.arr[j];
        if (!b || typeof b !== "object") continue;
        var addOp = Object.assign({}, b);
        addOp.op = "add";
        ops.push(addOp);
      }
    }
    if (ir.ok) {
      for (var k = 0; k < ir.arr.length; k++) {
        var c = ir.arr[k];
        if (!c || typeof c !== "object") continue;
        var rmOp = Object.assign({}, c);
        rmOp.op = "remove";
        ops.push(rmOp);
      }
    }
    return { ok: true, ops: ops, error: null, parseVia: "split_tags" };
  }

  /**
   * 从全文提取 ``` / ```json 围栏内的块，尝试解析为 JSON 数组（兼容模型不写标签的坏习惯）。
   */
  function tryParseInventoryOpsFromMarkdownFences(raw) {
    var text = String(raw || "");
    var i = 0;
    var candidates = [];
    while (i < text.length) {
      var open = text.indexOf("```", i);
      if (open < 0) break;
      var afterOpen = open + 3;
      var nl = text.indexOf("\n", afterOpen);
      var bodyStart = afterOpen;
      if (nl > afterOpen && nl - afterOpen <= 12) {
        var head = text.slice(afterOpen, nl).trim().toLowerCase();
        if (head === "json" || head === "") bodyStart = nl + 1;
      }
      var close = text.indexOf("```", bodyStart);
      if (close < 0) break;
      var block = text.slice(bodyStart, close).trim();
      if (block.charAt(0) === "[") {
        try {
          var p = JSON.parse(block);
          if (Array.isArray(p)) candidates.push(p);
        } catch (e1) {
          /* 忽略 */
        }
      }
      i = close + 3;
    }
    if (!candidates.length) return null;
    for (var c = candidates.length - 1; c >= 0; c--) {
      var arr = candidates[c];
      if (!arr.length) continue;
      for (var j = 0; j < arr.length; j++) {
        if (arr[j] && typeof arr[j] === "object" && String(arr[j].op || "").trim() !== "") {
          return arr;
        }
      }
    }
    for (var c2 = candidates.length - 1; c2 >= 0; c2--) {
      if (!candidates[c2].length) return candidates[c2];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * @param {string} text
   * @returns {{ ok: boolean, ops: Array<Object>, error?: string, parseVia?: string }}
   */
  function parseInventoryOpsFromText(text) {
    var raw = String(text || "");
    var errBits = [];
    var split = parseInventoryOpsBySplitTags(raw);
    if (split.ok) return split;
    if (split.parseVia === "split_tags" && split.error) errBits.push(split.error);

    var tagRe = /<mj_inventory_ops\s*>\s*([\s\S]*?)\s*<\/mj_inventory_ops\s*>/i;
    var tm = tagRe.exec(raw);
    if (tm) {
      var inner = stripJsonFence(tm[1].trim());
      try {
        var parsed = JSON.parse(inner);
        if (!Array.isArray(parsed)) {
          errBits.push("标签内须为 JSON 数组");
        } else {
          return { ok: true, ops: parsed, parseVia: "tag" };
        }
      } catch (eTag) {
        errBits.push("标签内 JSON：" + (eTag && eTag.message ? String(eTag.message) : "解析失败"));
      }
    } else {
      errBits.push("未找到 " + OPS_TAG_OPEN + " … " + OPS_TAG_CLOSE);
    }

    var fromFence = tryParseInventoryOpsFromMarkdownFences(raw);
    if (fromFence) {
      return { ok: true, ops: fromFence, parseVia: "markdown_fence" };
    }

    var lines = raw.split(/\r?\n/);
    for (var li = lines.length - 1; li >= 0; li--) {
      var L = String(lines[li] || "").trim();
      if (L === "") continue;
      if (L === "[]") return { ok: true, ops: [], parseVia: "trailing_line" };
      if (L.charAt(0) === "[" && L.charAt(L.length - 1) === "]") {
        try {
          var pLine = JSON.parse(L);
          if (Array.isArray(pLine)) return { ok: true, ops: pLine, parseVia: "trailing_line" };
        } catch (eLine) {
          errBits.push("末行 JSON：" + (eLine && eLine.message ? String(eLine.message) : ""));
        }
      }
      break;
    }

    return { ok: false, ops: [], error: errBits.length ? errBits.join("；") : "无法解析储物袋指令" };
  }

  /**
   * @param {string} text
   * @returns {{ ok: boolean, patch: Object|null, error?: string, parseVia?: string }}
   */
  function parseWorldStateFromText(text) {
    var raw = String(text || "");
    var tagRe = /<mj_world_state\s*>\s*([\s\S]*?)\s*<\/mj_world_state\s*>/i;
    var tm = tagRe.exec(raw);
    if (!tm) {
      return {
        ok: false,
        patch: null,
        error: "未找到 " + WORLD_STATE_TAG_OPEN + " … " + WORLD_STATE_TAG_CLOSE,
        parseVia: null,
      };
    }
    var inner = stripJsonFence(tm[1].trim());
    try {
      var parsed = JSON.parse(inner);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, patch: null, error: "mj_world_state 内须为 JSON 对象", parseVia: "tag" };
      }
      return { ok: true, patch: parsed, parseVia: "tag" };
    } catch (e) {
      return {
        ok: false,
        patch: null,
        error: "mj_world_state JSON：" + (e && e.message ? String(e.message) : "解析失败"),
        parseVia: "tag",
      };
    }
  }

  /**
   * @param {string} text
   * @returns {{ ok: boolean, patch: Object|null, absent: boolean, error?: string, parseVia?: string }}
   */
  function parseUserStateFromText(text) {
    var raw = String(text || "");
    var tagRe = /<mj_user_state\s*>\s*([\s\S]*?)\s*<\/mj_user_state\s*>/i;
    var tm = tagRe.exec(raw);
    if (!tm) {
      return { ok: false, patch: null, absent: true, error: null, parseVia: null };
    }
    var inner = stripJsonFence(tm[1].trim());
    try {
      var parsed = JSON.parse(inner);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, patch: null, absent: false, error: "mj_user_state 内须为 JSON 对象", parseVia: "tag" };
      }
      return { ok: true, patch: parsed, absent: false, parseVia: "tag" };
    } catch (e) {
      return {
        ok: false,
        patch: null,
        absent: false,
        error: "mj_user_state JSON：" + (e && e.message ? String(e.message) : "解析失败"),
        parseVia: "tag",
      };
    }
  }

  /**
   * worldTimeString、currentLocation、可选血蓝与年龄；写回时校验世界时间单调。
   * @param {Object} G
   * @param {Object} patch
   * @returns {{ appliedWorldTime: boolean, appliedLocation: boolean, rejectedWorldTime: string|null, normalizedWorldTimeString: string|null }}
   */
  function applyWorldStatePatch(G, patch) {
    var out = {
      appliedWorldTime: false,
      appliedLocation: false,
      rejectedWorldTime: null,
      normalizedWorldTimeString: null,
    };
    if (!G || !patch || typeof patch !== "object") return out;

    if (patch.worldTimeString != null && String(patch.worldTimeString).trim() !== "") {
      var newStr = String(patch.worldTimeString).trim();
      var newC = parseWorldTimeComparable(newStr);
      var oldStr = G.worldTimeString != null ? String(G.worldTimeString).trim() : "";
      var oldC = oldStr ? parseWorldTimeComparable(oldStr) : null;

      if (!newC) {
        out.rejectedWorldTime = "世界时间格式无效（须为「0001年 01月 01日 08:00」样式）";
      } else {
        var normalized = formatWorldTimeComparable(newC);
        if (!oldC) {
          G.worldTimeString = normalized;
          out.appliedWorldTime = true;
          out.normalizedWorldTimeString = normalized;
        } else {
          var cmp = compareWorldTimeComparable(newC, oldC);
          if (cmp < 0) {
            out.rejectedWorldTime = "不得早于当前世界时间（禁止时间倒流）";
          } else {
            G.worldTimeString = normalized;
            out.appliedWorldTime = true;
            out.normalizedWorldTimeString = normalized;
          }
        }
      }
    }

    if (patch.currentLocation != null && String(patch.currentLocation).trim() !== "") {
      G.currentLocation = String(patch.currentLocation).trim();
      out.appliedLocation = true;
    }

    var maxHpNow =
      typeof G.maxHp === "number" && isFinite(G.maxHp)
        ? Math.max(1, Math.floor(G.maxHp))
        : G.playerBase && typeof G.playerBase.hp === "number" && isFinite(G.playerBase.hp)
          ? Math.max(1, Math.floor(G.playerBase.hp))
          : 1;
    var maxMpNow =
      typeof G.maxMp === "number" && isFinite(G.maxMp)
        ? Math.max(1, Math.floor(G.maxMp))
        : G.playerBase && typeof G.playerBase.mp === "number" && isFinite(G.playerBase.mp)
          ? Math.max(1, Math.floor(G.playerBase.mp))
          : 1;
    if (patch.currentHp != null && typeof patch.currentHp === "number" && isFinite(patch.currentHp)) {
      G.currentHp = Math.max(0, Math.min(maxHpNow, Math.floor(patch.currentHp)));
    }
    if (patch.currentMp != null && typeof patch.currentMp === "number" && isFinite(patch.currentMp)) {
      G.currentMp = Math.max(0, Math.min(maxMpNow, Math.floor(patch.currentMp)));
    }

    if (patch.age != null && typeof patch.age === "number" && isFinite(patch.age)) {
      G.age = Math.max(1, Math.min(999, Math.floor(patch.age)));
    }

    return out;
  }

  /**
   * 仅应用主角血量/法力状态（新规则：独立 user_state 标签）
   * @param {Object} G
   * @param {Object} patch
   * @returns {{ appliedHp:boolean, appliedMp:boolean }}
   */
  function applyUserStatePatch(G, patch) {
    var out = { appliedHp: false, appliedMp: false };
    if (!G || !patch || typeof patch !== "object") return out;
    var maxHpNow =
      typeof G.maxHp === "number" && isFinite(G.maxHp)
        ? Math.max(1, Math.floor(G.maxHp))
        : G.playerBase && typeof G.playerBase.hp === "number" && isFinite(G.playerBase.hp)
          ? Math.max(1, Math.floor(G.playerBase.hp))
          : 1;
    var maxMpNow =
      typeof G.maxMp === "number" && isFinite(G.maxMp)
        ? Math.max(1, Math.floor(G.maxMp))
        : G.playerBase && typeof G.playerBase.mp === "number" && isFinite(G.playerBase.mp)
          ? Math.max(1, Math.floor(G.playerBase.mp))
          : 1;
    if (patch.currentHp != null && typeof patch.currentHp === "number" && isFinite(patch.currentHp)) {
      G.currentHp = Math.max(0, Math.min(maxHpNow, Math.floor(patch.currentHp)));
      out.appliedHp = true;
    }
    if (patch.currentMp != null && typeof patch.currentMp === "number" && isFinite(patch.currentMp)) {
      G.currentMp = Math.max(0, Math.min(maxMpNow, Math.floor(patch.currentMp)));
      out.appliedMp = true;
    }
    return out;
  }

  function padSlotArrayToLen(arr, len) {
    var out = [];
    for (var i = 0; i < len; i++) {
      out.push(arr && arr[i] != null && typeof arr[i] === "object" ? arr[i] : null);
    }
    return out;
  }

  function npcPresenceKey(npc) {
    if (!npc || typeof npc !== "object") return "";
    var id = npc.id != null ? String(npc.id).trim() : "";
    if (id) return "id:" + id;
    var dn = npc.displayName != null ? String(npc.displayName).trim() : "";
    if (dn) return "name:" + dn;
    return "";
  }

  /**
   * 已有 NPC（与快照 id/displayName 匹配）：只采纳状态 AI 的 currentHp / currentMp，其余一律沿用快照，
   * 避免模型生成与旧卡不一致的装备、功法、境界等。新 NPC 仍走完整 normalize。
   */
  function applyExistingNpcHpMpOnly(prevNpc, incomingRaw) {
    var merged;
    try {
      merged = JSON.parse(JSON.stringify(prevNpc));
    } catch (_e0) {
      merged = Object.assign({}, prevNpc);
    }
    merged.__mjStateSyncHpMpOnly = true;
    if (!incomingRaw || typeof incomingRaw !== "object") return merged;

    var maxH = null;
    if (typeof merged.maxHp === "number" && isFinite(merged.maxHp)) {
      maxH = Math.max(1, Math.floor(merged.maxHp));
    } else if (merged.playerBase && typeof merged.playerBase.hp === "number" && isFinite(merged.playerBase.hp)) {
      maxH = Math.max(1, Math.floor(merged.playerBase.hp));
    }
    var maxM = null;
    if (typeof merged.maxMp === "number" && isFinite(merged.maxMp)) {
      maxM = Math.max(1, Math.floor(merged.maxMp));
    } else if (merged.playerBase && typeof merged.playerBase.mp === "number" && isFinite(merged.playerBase.mp)) {
      maxM = Math.max(1, Math.floor(merged.playerBase.mp));
    }

    if (typeof incomingRaw.currentHp === "number" && isFinite(incomingRaw.currentHp)) {
      var h = Math.max(0, Math.round(incomingRaw.currentHp));
      merged.currentHp = maxH != null ? Math.min(maxH, h) : h;
    }
    if (typeof incomingRaw.currentMp === "number" && isFinite(incomingRaw.currentMp)) {
      var m = Math.max(0, Math.round(incomingRaw.currentMp));
      merged.currentMp = maxM != null ? Math.min(maxM, m) : m;
    }
    if (merged.isDead === true) merged.currentHp = 0;
    else if (typeof merged.currentHp === "number" && isFinite(merged.currentHp) && merged.currentHp <= 0) {
      merged.currentHp = 0;
      merged.isDead = true;
    }
    return merged;
  }

  /** AI 可能只填前几格，补齐与主界面一致的长度后再 normalize */
  function ensureNpcSheetSlotLengths(n) {
    if (!n || typeof n !== "object") return n;
    n.equippedSlots = padSlotArrayToLen(n.equippedSlots, EQUIP_SLOT_COUNT);
    n.gongfaSlots = padSlotArrayToLen(n.gongfaSlots, GONGFA_SLOT_COUNT);
    n.inventorySlots = padSlotArrayToLen(n.inventorySlots, INVENTORY_SLOT_COUNT);
    return n;
  }

  function normalizeNpcEquipSlotFromStateRule(cell) {
    if (!cell || typeof cell !== "object") return null;
    var raw = Object.assign({}, cell);
    if (!raw.type && raw.equipType) raw.type = raw.equipType;
    var payload = resolvePlacePayload(raw);
    var src = payload || raw;
    var name = src.name != null ? String(src.name).trim() : "";
    if (!name) return null;
    var out = { name: name };
    var et = src.equipType != null ? String(src.equipType).trim() : "";
    var t = src.type != null ? String(src.type).trim() : "";
    var finalType = et || t;
    if (isWearSlotEquipType(finalType) || finalType === "载具") out.equipType = finalType;
    if (src.desc != null && String(src.desc).trim() !== "") out.desc = String(src.desc).trim();
    else if (src.intro != null && String(src.intro).trim() !== "") out.desc = String(src.intro).trim();
    if (src.grade != null && String(src.grade).trim() !== "") out.grade = String(src.grade).trim();
    if (typeof src.value === "number" && isFinite(src.value)) out.value = Math.max(0, Math.floor(src.value));
    if (src.bonus && typeof src.bonus === "object" && Object.keys(src.bonus).length > 0) out.bonus = src.bonus;
    if (src.effects && typeof src.effects === "object" && Object.keys(src.effects).length > 0) {
      out.effects = shallowCloneEffects(src.effects);
    }
    if (src.magnification && typeof src.magnification === "object" && Object.keys(src.magnification).length > 0) {
      out.magnification = Object.assign({}, src.magnification);
    }
    return out;
  }

  function normalizeNpcGongfaSlotFromStateRule(cell) {
    if (!cell || typeof cell !== "object") return null;
    var raw = Object.assign({}, cell);
    if (!raw.type && (raw.subtype || raw.subType)) raw.type = "功法";
    if (raw.type === "攻击" || raw.type === "辅助") raw.type = raw.type + "功法";
    var payload = resolvePlacePayload(raw);
    var src = payload || raw;
    var name = src.name != null ? String(src.name).trim() : "";
    if (!name) return null;
    var out = { name: name, type: "功法" };
    var t = src.type != null ? String(src.type).trim() : "";
    var st = src.subtype != null ? String(src.subtype).trim() : "";
    if (!st && src.subType != null) st = String(src.subType).trim();
    if (!st) st = inferGongfaSubtype(raw);
    if (!st && t === "攻击功法") st = "攻击";
    if (!st && t === "辅助功法") st = "辅助";
    if (st) {
      out.subtype = st;
      out.subType = st;
    }
    if (src.desc != null && String(src.desc).trim() !== "") out.desc = String(src.desc).trim();
    else if (src.intro != null && String(src.intro).trim() !== "") out.desc = String(src.intro).trim();
    if (src.grade != null && String(src.grade).trim() !== "") out.grade = String(src.grade).trim();
    if (typeof src.value === "number" && isFinite(src.value)) out.value = Math.max(0, Math.floor(src.value));
    if (src.bonus && typeof src.bonus === "object" && Object.keys(src.bonus).length > 0) out.bonus = src.bonus;
    if (src.effects && typeof src.effects === "object" && Object.keys(src.effects).length > 0) {
      out.effects = shallowCloneEffects(src.effects);
    }
    if (typeof src.manacost === "number" && isFinite(src.manacost)) out.manacost = Math.max(0, Math.round(src.manacost));
    if (src.magnification && typeof src.magnification === "object" && Object.keys(src.magnification).length > 0) {
      out.magnification = Object.assign({}, src.magnification);
    }
    return out;
  }

  function normalizeNpcInventorySlotFromStateRule(cell) {
    if (!cell || typeof cell !== "object") return null;
    var payload = resolvePlacePayload(cell);
    if (payload) return normalizeBagItem(payload);
    var name = cell.name != null ? String(cell.name).trim() : "";
    if (!name) return null;
    var fallback = {
      name: name,
      count: typeof cell.count === "number" && isFinite(cell.count) ? Math.max(1, Math.floor(cell.count)) : 1,
    };
    if (cell.desc != null && String(cell.desc).trim() !== "") fallback.desc = String(cell.desc).trim();
    else if (cell.intro != null && String(cell.intro).trim() !== "") fallback.desc = String(cell.intro).trim();
    if (cell.grade != null && String(cell.grade).trim() !== "") fallback.grade = String(cell.grade).trim();
    if (cell.type != null && String(cell.type).trim() !== "") fallback.type = String(cell.type).trim();
    if (typeof cell.value === "number" && isFinite(cell.value)) fallback.value = Math.max(0, Math.floor(cell.value));
    if (cell.bonus && typeof cell.bonus === "object" && Object.keys(cell.bonus).length > 0) fallback.bonus = cell.bonus;
    if (cell.effects && typeof cell.effects === "object" && Object.keys(cell.effects).length > 0) {
      fallback.effects = cell.effects;
    }
    return normalizeBagItem(fallback);
  }

  /**
   * 兼容 state_rules NPC 示例：equipped/gongfa/inventory 支持 intro、攻击功法/辅助功法等字段。
   * 仅用于“新建 NPC”分支，避免影响旧 NPC 的延续策略。
   */
  function normalizeNpcIncomingSlotsFromStateRules(npc) {
    if (!npc || typeof npc !== "object") return npc;
    var eqRaw = Array.isArray(npc.equippedSlots) ? npc.equippedSlots : [];
    var gfRaw = Array.isArray(npc.gongfaSlots) ? npc.gongfaSlots : [];
    var invRaw = Array.isArray(npc.inventorySlots) ? npc.inventorySlots : [];
    var eq = [];
    for (var ei = 0; ei < EQUIP_SLOT_COUNT; ei++) eq.push(null);
    for (var i = 0; i < eqRaw.length; i++) {
      var ec = normalizeNpcEquipSlotFromStateRule(eqRaw[i]);
      if (!ec) continue;
      var et = ec.equipType != null ? String(ec.equipType).trim() : "";
      var si =
        et === "武器" ? 0 : et === "法器" ? 1 : et === "防具" ? 2 : et === "载具" ? 3 : -1;
      if (si >= 0 && si < EQUIP_SLOT_COUNT) {
        eq[si] = ec;
        continue;
      }
      for (var fi = 0; fi < EQUIP_SLOT_COUNT; fi++) {
        if (!eq[fi]) {
          eq[fi] = ec;
          break;
        }
      }
    }
    var gf = [];
    for (var j = 0; j < GONGFA_SLOT_COUNT; j++) {
      gf.push(normalizeNpcGongfaSlotFromStateRule(gfRaw[j]) || null);
    }
    var inv = [];
    for (var k = 0; k < INVENTORY_SLOT_COUNT; k++) {
      inv.push(normalizeNpcInventorySlotFromStateRule(invRaw[k]) || null);
    }
    npc.equippedSlots = eq;
    npc.gongfaSlots = gf;
    npc.inventorySlots = inv;
    return npc;
  }

  /**
   * @param {Object} G
   * @param {Array} arr mj_nearby_npcs 解析结果
   * @returns {{ applied: boolean, count: number, error: string|null }}
   */
  function applyNearbyNpcsArrayToGame(G, arr) {
    var out = { applied: false, count: 0, error: null };
    if (!G) {
      out.error = "MortalJourneyGame 不存在";
      return out;
    }
    if (!Array.isArray(arr)) {
      out.error = "mj_nearby_npcs 须为 JSON 数组";
      return out;
    }
    var MCS = global.MjCharacterSheet;
    var PBR = global.PlayerBaseRuntime;
    var P = global.MjMainScreenPanel || global.MjMainScreenPanelRealm;
    var oldList = Array.isArray(G.nearbyNpcs) ? G.nearbyNpcs : [];
    var oldMap = {};
    for (var oi = 0; oi < oldList.length; oi++) {
      var ok = npcPresenceKey(oldList[oi]);
      if (!ok || oldMap[ok]) continue;
      oldMap[ok] = oldList[oi];
    }
    var list = [];
    for (var i = 0; i < arr.length; i++) {
      var raw = arr[i];
      if (!raw || typeof raw !== "object") continue;
      var copy;
      try {
        copy = JSON.parse(JSON.stringify(raw));
      } catch (e0) {
        continue;
      }
      var key = npcPresenceKey(copy);
      var n;
      if (key && oldMap[key]) {
        n = applyExistingNpcHpMpOnly(oldMap[key], copy);
        ensureNpcSheetSlotLengths(n);
      } else {
        normalizeNpcIncomingSlotsFromStateRules(copy);
        ensureNpcSheetSlotLengths(copy);
        n = MCS && typeof MCS.normalize === "function" ? MCS.normalize(copy) : copy;
        if (PBR && typeof PBR.applyComputedPlayerBaseToCharacterSheet === "function") {
          try {
            PBR.applyComputedPlayerBaseToCharacterSheet(n);
          } catch (ePbr) {
            console.warn("[状态 AI] applyComputedPlayerBaseToCharacterSheet", ePbr);
          }
        }
        if (P && typeof P.syncNpcShouyuanFromRealmState === "function") {
          try {
            P.syncNpcShouyuanFromRealmState(n);
          } catch (eSy) {
            console.warn("[状态 AI] syncNpcShouyuanFromRealmState", eSy);
          }
        }
      }
      list.push(n);
    }
    if (P && typeof P.mergeNearbyNpcListInPlace === "function") {
      P.mergeNearbyNpcListInPlace(G, list);
    } else {
      G.nearbyNpcs = list;
      if (P && typeof P.normalizeNearbyNpcListInPlace === "function") P.normalizeNearbyNpcListInPlace(G);
      if (P && typeof P.sortNearbyNpcsForDisplay === "function") P.sortNearbyNpcsForDisplay(G);
    }
    out.applied = true;
    out.count = Array.isArray(G.nearbyNpcs) ? G.nearbyNpcs.length : list.length;
    return out;
  }

  /**
   * @param {string} text
   * @returns {{ ok: boolean, list: Array|null, absent: boolean, error: string|null, parseVia: string|null }}
   */
  function parseNearbyNpcsFromText(text) {
    var raw = String(text || "");
    var tagRe = /<mj_nearby_npcs\s*>\s*([\s\S]*?)\s*<\/mj_nearby_npcs\s*>/i;
    var tm = tagRe.exec(raw);
    if (!tm) {
      return { ok: false, list: null, absent: true, error: null, parseVia: null };
    }
    var inner = stripJsonFence(tm[1].trim());
    try {
      var parsed = JSON.parse(inner);
      if (!Array.isArray(parsed)) {
        return {
          ok: false,
          list: null,
          absent: false,
          error: "mj_nearby_npcs 内须为 JSON 数组",
          parseVia: "tag",
        };
      }
      return { ok: true, list: parsed, absent: false, error: null, parseVia: "tag" };
    } catch (e) {
      return {
        ok: false,
        list: null,
        absent: false,
        error: "mj_nearby_npcs JSON：" + (e && e.message ? String(e.message) : "解析失败"),
        parseVia: "tag",
      };
    }
  }

  /**
   * 解析并应用储物袋 + 世界状态（世界解析失败不阻止储物袋已成功应用）。
   * @param {Object} G
   * @param {string} assistantText
   * @returns {{ ok: boolean, placed: Array, removed: Array, failed: Array, parseError: string|null, parseVia: string|null, world: Object, npc: Object }}
   */
  function applyStateTurnFromAssistantText(G, assistantText) {
    var raw = String(assistantText || "");
    var pr = parseInventoryOpsFromText(raw);
    var placed = [];
    var removed = [];
    var failed = [];
    var parseError = null;
    var parseVia = null;
    var invOk = pr.ok;
    if (pr.ok) {
      var r = applyInventoryOps(G, pr.ops);
      placed = r.placed;
      removed = r.removed;
      failed = r.failed;
      parseVia = pr.parseVia != null ? pr.parseVia : "tag";
      var PRn = global.MjMainScreenPanelRealm;
      if (PRn && typeof PRn.ensureInventorySlots === "function") {
        try {
          PRn.ensureInventorySlots(G);
        } catch (_eN) {
          /* 与主界面脚本同页时归一化储物袋长度并修剪末尾空行 */
        }
      }
    } else {
      parseError = pr.error || null;
    }

    var ws = parseWorldStateFromText(raw);
    var world = {
      ok: ws.ok,
      parseVia: ws.parseVia != null ? ws.parseVia : null,
      parseError: null,
      appliedWorldTime: false,
      appliedLocation: false,
      rejectedWorldTime: null,
      normalizedWorldTimeString: null,
    };
    if (ws.ok && ws.patch) {
      var wr = applyWorldStatePatch(G, ws.patch);
      world.appliedWorldTime = wr.appliedWorldTime;
      world.appliedLocation = wr.appliedLocation;
      world.rejectedWorldTime = wr.rejectedWorldTime;
      world.normalizedWorldTimeString = wr.normalizedWorldTimeString;
    } else if (!ws.ok && ws.error) {
      world.parseError = ws.error;
    }

    var us = parseUserStateFromText(raw);
    var userState = {
      ok: us.ok,
      parseVia: us.parseVia != null ? us.parseVia : null,
      parseError: null,
      appliedHp: false,
      appliedMp: false,
      absent: !!us.absent,
    };
    if (us.ok && us.patch) {
      var ur = applyUserStatePatch(G, us.patch);
      userState.appliedHp = ur.appliedHp;
      userState.appliedMp = ur.appliedMp;
    } else if (!us.ok && !us.absent && us.error) {
      userState.parseError = us.error;
    }

    var nr = parseNearbyNpcsFromText(raw);
    var npc = {
      skipped: false,
      applied: false,
      count: 0,
      parseError: null,
      parseVia: null,
    };
    if (nr.absent) {
      var naAbsent = applyNearbyNpcsArrayToGame(G, []);
      npc.skipped = false;
      npc.applied = naAbsent.applied;
      npc.count = naAbsent.count;
      npc.parseVia = "absent_empty_merge";
      if (naAbsent.error) npc.parseError = naAbsent.error;
    } else if (nr.ok && nr.list) {
      var na = applyNearbyNpcsArrayToGame(G, nr.list);
      npc.applied = na.applied;
      npc.count = na.count;
      npc.parseVia = nr.parseVia;
      if (na.error) npc.parseError = na.error;
    } else {
      npc.parseError = nr.error || "mj_nearby_npcs 解析失败";
      npc.parseVia = nr.parseVia;
    }

    return {
      ok: invOk,
      placed: placed,
      removed: removed,
      failed: failed,
      parseError: parseError,
      parseVia: parseVia,
      world: world,
      userState: userState,
      npc: npc,
    };
  }

  /**
   * @param {Object} G MortalJourneyGame
   * @param {Array<Object>} ops
   * @returns {{ placed: Array<Object>, removed: Array<Object>, failed: Array<{op:Object,reason:string}> }}
   */
  function applyInventoryOps(G, ops) {
    var placed = [];
    var removed = [];
    var failed = [];
    if (!G) {
      failed.push({ op: null, reason: "MortalJourneyGame 不存在" });
      return { placed: placed, removed: removed, failed: failed };
    }
    if (!Array.isArray(ops)) return { placed: placed, removed: removed, failed: failed };

    for (var i = 0; i < ops.length; i++) {
      var raw = ops[i];
      if (!raw || typeof raw !== "object") continue;
      var opn = raw.op != null ? String(raw.op).trim().toLowerCase() : "";
      if (opn === "remove") {
        var rnm = raw.name != null ? String(raw.name).trim() : "";
        var rcnt =
          typeof raw.count === "number" && isFinite(raw.count) ? Math.max(1, Math.floor(raw.count)) : 1;
        if (!rnm) {
          failed.push({ op: raw, reason: "remove 缺少有效 name" });
          continue;
        }
        if (isSpiritStoneName(rnm)) {
          var srm = applySpiritStoneDeltaByValue(G, rnm, rcnt, false);
          if (srm.ok) removed.push({ name: rnm, count: rcnt, byValue: true });
          else failed.push({ op: raw, reason: srm.reason || "灵石扣减失败" });
          continue;
        }
        var rm = removeStackedItemsFromBag(G, rnm, rcnt);
        if (rm.ok) {
          var act =
            typeof rm.actualRemoved === "number" && isFinite(rm.actualRemoved)
              ? Math.max(0, Math.floor(rm.actualRemoved))
              : rcnt;
          removed.push({ name: rnm, count: act, requestedCount: rcnt });
        } else failed.push({ op: raw, reason: rm.reason || "扣除失败" });
        continue;
      }
      if (opn !== "add") {
        failed.push({ op: raw, reason: "不支持的 op（仅支持 add、remove）" });
        continue;
      }
      var addName = raw.name != null ? String(raw.name).trim() : "";
      var addCnt = typeof raw.count === "number" && isFinite(raw.count) ? Math.max(1, Math.floor(raw.count)) : 1;
      if (isSpiritStoneName(addName)) {
        var sAdd = applySpiritStoneDeltaByValue(G, addName, addCnt, true);
        if (sAdd.ok) placed.push({ name: addName, count: addCnt, byValue: true });
        else failed.push({ op: raw, reason: sAdd.reason || "灵石增加失败" });
        continue;
      }
      var payload = resolvePlacePayload(raw);
      if (!payload) {
        failed.push({ op: raw, reason: "缺少有效 name" });
        continue;
      }
      if (tryPlaceItemInBag(G, payload)) placed.push(payload);
      else failed.push({ op: raw, reason: "储物袋已满或无法放置" });
    }
    return { placed: placed, removed: removed, failed: failed };
  }

  function applyInventoryOpsFromAssistantText(G, assistantText) {
    var pr = parseInventoryOpsFromText(assistantText);
    if (!pr.ok) {
      return { ok: false, placed: [], removed: [], failed: [], parseError: pr.error, parseVia: null };
    }
    var r = applyInventoryOps(G, pr.ops);
    return {
      ok: true,
      placed: r.placed,
      removed: r.removed,
      failed: r.failed,
      parseError: null,
      parseVia: pr.parseVia != null ? pr.parseVia : "tag",
    };
  }

  /**
   * @param {Object} opts
   * @param {Array<{role:string,content:string}>} [opts.messages]
   * @param {string} [opts.storyText] 未传 messages 时用于 buildMessages
   * @param {boolean} [opts.shouldStream=true]
   * @param {function(string,string):void} [opts.onDelta]
   * @param {AbortSignal} [opts.signal]
   */
  function sendTurn(opts) {
    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      return Promise.reject(
        new Error("TavernHelper 未加载：请在 main.html 中于本脚本之后引入 silly_tarven/bridge-config.js 与 bridge.js。"),
      );
    }
    var o = opts || {};
    var messages =
      Array.isArray(o.messages) && o.messages.length > 0 ? o.messages : buildMessages(o);
    return TH.generateFromMessages({
      messages: messages,
      should_stream: o.shouldStream !== false,
      onDelta: o.onDelta,
      signal: o.signal,
    });
  }

  global.MortalJourneyStateGenerate = {
    INVENTORY_SLOT_COUNT: INVENTORY_SLOT_COUNT,
    INVENTORY_GRID_COLS: INVENTORY_GRID_COLS,
    EQUIP_SLOT_COUNT: EQUIP_SLOT_COUNT,
    GONGFA_SLOT_COUNT: GONGFA_SLOT_COUNT,
    OPS_TAG_OPEN: OPS_TAG_OPEN,
    OPS_TAG_CLOSE: OPS_TAG_CLOSE,
    WORLD_STATE_TAG_OPEN: WORLD_STATE_TAG_OPEN,
    WORLD_STATE_TAG_CLOSE: WORLD_STATE_TAG_CLOSE,
    USER_STATE_TAG_OPEN: USER_STATE_TAG_OPEN,
    USER_STATE_TAG_CLOSE: USER_STATE_TAG_CLOSE,
    NPC_NEARBY_TAG_OPEN: NPC_NEARBY_TAG_OPEN,
    NPC_NEARBY_TAG_CLOSE: NPC_NEARBY_TAG_CLOSE,
    BATTLE_TRIGGER_TAG_OPEN: BATTLE_TRIGGER_TAG_OPEN,
    BATTLE_TRIGGER_TAG_CLOSE: BATTLE_TRIGGER_TAG_CLOSE,
    QUALITY_ATTR_BASELINE_MAP: QUALITY_ATTR_BASELINE_MAP,
    buildStuffDescribeCatalog: buildStuffDescribeCatalog,
    buildStuffDescribeCatalogJson: buildStuffDescribeCatalogJson,
    buildGongfaDescribeCatalog: buildGongfaDescribeCatalog,
    buildGongfaDescribeCatalogJson: buildGongfaDescribeCatalogJson,
    buildNearbyNpcsSnapshot: buildNearbyNpcsSnapshot,
    buildEquippedSnapshot: buildEquippedSnapshot,
    buildGongfaSnapshot: buildGongfaSnapshot,
    buildInventorySnapshot: buildInventorySnapshot,
    buildWorldSnapshotJson: buildWorldSnapshotJson,
    buildInventoryStateUserContent: buildInventoryStateUserContent,
    buildMessages: buildMessages,
    parseInventoryOpsFromText: parseInventoryOpsFromText,
    parseWorldStateFromText: parseWorldStateFromText,
    parseUserStateFromText: parseUserStateFromText,
    parseNearbyNpcsFromText: parseNearbyNpcsFromText,
    applyNearbyNpcsArrayToGame: applyNearbyNpcsArrayToGame,
    resolvePlacePayload: resolvePlacePayload,
    applyInventoryOps: applyInventoryOps,
    applyWorldStatePatch: applyWorldStatePatch,
    applyUserStatePatch: applyUserStatePatch,
    applyStateTurnFromAssistantText: applyStateTurnFromAssistantText,
    applyInventoryOpsFromAssistantText: applyInventoryOpsFromAssistantText,
    sendTurn: sendTurn,
  };
})(typeof window !== "undefined" ? window : globalThis);
