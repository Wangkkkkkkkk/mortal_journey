/**
 * 开局配置 AI：规则见 MortalJourneyInitStateRules；解析/应用复用 MortalJourneyStateGenerate 的储物袋与世界状态逻辑。
 * 依赖：state_generate.js、init_state_rules.js、bridge.js（TavernHelper）
 */
(function (global) {
  "use strict";

  var INIT_LOADOUT_TAG_OPEN = "<mj_init_loadout>";
  var INIT_LOADOUT_TAG_CLOSE = "</mj_init_loadout>";

  /**
   * 与 state_generate.js 保持一致的品阶与属性口径
   */
  var QUALITY_ATTR_BASELINE_MAP = {
    下品: { 血量: [10, 50], 法力: [5, 25], 物攻: [5, 10], 物防: [1, 5], 法攻: [5, 10], 法防: [1, 5], 脚力: [5, 10], 神识: [5, 10] },
    中品: { 血量: [50, 100], 法力: [25, 50], 物攻: [10, 20], 物防: [5, 10], 法攻: [10, 20], 法防: [5, 10], 脚力: [10, 20], 神识: [10, 25] },
    上品: { 血量: [100, 200], 法力: [50, 100], 物攻: [20, 30], 物防: [10, 15], 法攻: [20, 30], 法防: [10, 15], 脚力: [20, 30], 神识: [25, 50] },
    极品: { 血量: [200, 300], 法力: [100, 150], 物攻: [30, 40], 物防: [15, 20], 法攻: [30, 40], 法防: [15, 20], 脚力: [30, 40], 神识: [50, 75] },
    仙品: { 血量: [300, 500], 法力: [150, 200], 物攻: [40, 50], 物防: [20, 25], 法攻: [40, 50], 法防: [20, 25], 脚力: [40, 50], 神识: [75, 100] },
  };
  var ITEM_GRADE_VALUE_MAP = {
    下品: [10, 100],
    中品: [100, 1000],
    上品: [1000, 10000],
    极品: [10000, 100000],
    仙品: [100000, 1000000],
  };
  var ITEM_GRADE_DAMAGE_MULTIPLIER_MAP = {
    下品: [1.0, 1.1],
    中品: [1.1, 1.3],
    上品: [1.3, 1.6],
    极品: [1.6, 2.0],
    仙品: [2.0, 2.5],
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

  function panelRealm() {
    return global.MjMainScreenPanelRealm || {};
  }

  function equipCount() {
    var n = panelRealm().EQUIP_SLOT_COUNT;
    return typeof n === "number" && isFinite(n) ? Math.max(1, Math.floor(n)) : 4;
  }

  function gongfaCount() {
    var n = panelRealm().GONGFA_SLOT_COUNT;
    return typeof n === "number" && isFinite(n) ? Math.max(1, Math.floor(n)) : 8;
  }

  function stateGen() {
    return global.MortalJourneyStateGenerate;
  }

  function getInitRulesApi() {
    return global.MortalJourneyInitStateRules;
  }

  function extractLatestAssistantStoryText(G) {
    var hist = G && Array.isArray(G.chatHistory) ? G.chatHistory : [];
    for (var i = hist.length - 1; i >= 0; i--) {
      var row = hist[i];
      if (
        row &&
        row.role === "assistant" &&
        row.content != null &&
        String(row.content).trim() !== ""
      ) {
        return String(row.content).trim();
      }
    }
    return "";
  }

  function fillRuleTemplate(template, vars) {
    var out = String(template || "");
    if (!vars || typeof vars !== "object") return out;
    return out.replace(/\{\{([A-Z_]+)\}\}/g, function (m, key) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key]);
      return m;
    });
  }

  function buildInitRuleVars() {
    var SG = stateGen();
    return {
      OPS_TAG_OPEN: SG && SG.OPS_TAG_OPEN ? SG.OPS_TAG_OPEN : "<mj_inventory_ops>",
      OPS_TAG_CLOSE: SG && SG.OPS_TAG_CLOSE ? SG.OPS_TAG_CLOSE : "</mj_inventory_ops>",
      WORLD_STATE_TAG_OPEN:
        SG && SG.WORLD_STATE_TAG_OPEN ? SG.WORLD_STATE_TAG_OPEN : "<mj_world_state>",
      WORLD_STATE_TAG_CLOSE:
        SG && SG.WORLD_STATE_TAG_CLOSE ? SG.WORLD_STATE_TAG_CLOSE : "</mj_world_state>",
      INIT_LOADOUT_TAG_OPEN: INIT_LOADOUT_TAG_OPEN,
      INIT_LOADOUT_TAG_CLOSE: INIT_LOADOUT_TAG_CLOSE,
    };
  }

  function getInitRuleTemplate(name, fallbackText) {
    var IR = getInitRulesApi();
    var tpl = IR && IR.templates && IR.templates[name] != null ? String(IR.templates[name]) : "";
    var filled = fillRuleTemplate(tpl, buildInitRuleVars()).trim();
    if (filled) return filled;
    return String(fallbackText || "").trim();
  }

  function stripJsonFence(s) {
    var SG = stateGen();
    if (SG && typeof SG.stripJsonFence === "function") return SG.stripJsonFence(s);
    var t = String(s || "").trim();
    var m = /^```(?:json)?\s*([\s\S]*?)\s*```$/im.exec(t);
    return m ? m[1].trim() : t;
  }

  /**
   * @param {Object|null} fc
   * @param {Object} G
   */
  function buildFateChoiceBriefObject(fc, G) {
    var f = fc && typeof fc === "object" ? fc : {};
    var g = G && typeof G === "object" ? G : {};
    var o = {
      playerName:
        f.playerName != null && String(f.playerName).trim() !== ""
          ? String(f.playerName).trim()
          : "（未命名）",
      birth: f.birth != null ? String(f.birth) : "",
      difficulty: f.difficulty != null ? String(f.difficulty) : "",
      linggen: f.linggen != null ? String(f.linggen) : "",
      realm: f.realm && typeof f.realm === "object" ? f.realm : g.realm && typeof g.realm === "object" ? g.realm : {},
      traits: Array.isArray(f.traits) ? f.traits : [],
    };
    if (f.customBirth && typeof f.customBirth === "object") {
      o.customBirth = f.customBirth;
    }
    if (g.currentLocation != null && String(g.currentLocation).trim() !== "") {
      o.bootstrapCurrentLocation = String(g.currentLocation).trim();
    }
    if (g.worldTimeString != null && String(g.worldTimeString).trim() !== "") {
      o.bootstrapWorldTimeString = String(g.worldTimeString).trim();
    }
    return o;
  }

  function buildFateChoiceBriefJson(fc, G) {
    try {
      return JSON.stringify(buildFateChoiceBriefObject(fc, G));
    } catch (_e) {
      return "{}";
    }
  }

  /**
   * @param {Object} opts
   * @param {Object} [opts.game]
   * @param {Object} [opts.fateChoice]
   */
  function buildInitStateUserContent(opts) {
    var o = opts || {};
    var G = o.game != null ? o.game : global.MortalJourneyGame || {};
    var fc = o.fateChoice != null ? o.fateChoice : G.fateChoice;
    var SG = stateGen();
    var parts = [];
    var vars = buildInitRuleVars();
    var storyAssist =
      o.openingStoryAssistantText != null ? String(o.openingStoryAssistantText).trim() : "";
    if (storyAssist) {
      parts.push(
        "本局已生成第一段「开局剧情」（见下方 ### 开局剧情正文）。请**优先依据该正文**与命运抉择摘要，生成三对机器标签；正文未写明的器物可结合摘要与境界合理补全。",
      );
      parts.push("");
      parts.push("### 开局剧情正文（生成装备/功法/储物袋与世界状态的首要依据）");
      parts.push(storyAssist);
      parts.push("");
    } else {
      parts.push("本局开局：尚无任何剧情 user/assistant 对话。请按 system 与下列说明生成三对标签。");
      parts.push("");
    }
    parts.push("### 命运抉择摘要（JSON）");
    parts.push(buildFateChoiceBriefJson(fc, G));
    parts.push(
      "### 世界时间与当前地点（必须在 " + vars.WORLD_STATE_TAG_OPEN + " 中写回；worldTimeString 不得早于本条）",
    );
    parts.push(SG && typeof SG.buildWorldSnapshotJson === "function" ? SG.buildWorldSnapshotJson(G) : "{}");
    parts.push("### 主角当前佩戴快照（武器、法器、防具、载具；可用第三对标签整体覆盖为合理开局）");
    parts.push(
      SG && typeof SG.buildEquippedSnapshot === "function" ? SG.buildEquippedSnapshot(G) : "[]",
    );
    parts.push("### 主角功法栏快照（长度" + String(gongfaCount()) + "；第三对应给出完整数组）");
    parts.push(SG && typeof SG.buildGongfaSnapshot === "function" ? SG.buildGongfaSnapshot(G) : "[]");
    parts.push("### 储物袋快照");
    parts.push(
      SG && typeof SG.buildInventorySnapshot === "function" ? SG.buildInventorySnapshot(G) : "[]",
    );
    parts.push("### 境界合法取值");
    parts.push(
      SG && typeof SG.buildRealmLexiconLine === "function" ? SG.buildRealmLexiconLine() : "",
    );
    parts.push("### 可引用功法表");
    parts.push(
      SG && typeof SG.buildGongfaDescribeCatalogJson === "function"
        ? SG.buildGongfaDescribeCatalogJson()
        : "{}",
    );
    parts.push("### 可引用物品表");
    parts.push(
      SG && typeof SG.buildStuffDescribeCatalogJson === "function"
        ? SG.buildStuffDescribeCatalogJson()
        : "{}",
    );
    parts.push("### 输出格式（须严格包含三对标签）");
    parts.push(getInitRuleTemplate("outputRules", ""));
    var exTpl = getInitRuleTemplate("outputExample", "");
    if (exTpl) {
      parts.push("");
      parts.push(exTpl);
    }
    return parts.join("\n");
  }

  /**
   * @param {Object} opts
   * @returns {Array<{role:string,content:string}>}
   */
  function buildMessages(opts) {
    var o = opts || {};
    var SG = stateGen();
    var lsv =
      SG && typeof SG.lowerSpiritStoneValueUnit === "function" ? SG.lowerSpiritStoneValueUnit() : 10;
    var vars = buildInitRuleVars();
    var sys = getInitRuleTemplate("systemPrompt", "");
    sys +=
      "\n【铁律 · 续】折算下品灵石：刻度合计 ÷ " +
      lsv +
      " 四舍五入 = add 下品灵石的 count；禁止把合计刻度直接当颗数。";
    sys +=
      "\n【铁律 · 续】世界状态必须使用 " +
      vars.WORLD_STATE_TAG_OPEN +
      " 与 " +
      vars.WORLD_STATE_TAG_CLOSE +
      "；主角槽位必须使用 " +
      vars.INIT_LOADOUT_TAG_OPEN +
      " 与 " +
      vars.INIT_LOADOUT_TAG_CLOSE +
      "。";
    return [
      { role: "system", content: sys },
      { role: "user", content: buildInitStateUserContent(o) },
    ];
  }

  function parseInitLoadoutFromText(text) {
    var raw = String(text || "");
    var tagRe = /<mj_init_loadout\s*>\s*([\s\S]*?)\s*<\/mj_init_loadout\s*>/i;
    var tm = tagRe.exec(raw);
    if (!tm) {
      return { ok: false, patch: null, error: "未找到 " + INIT_LOADOUT_TAG_OPEN + " … " + INIT_LOADOUT_TAG_CLOSE };
    }
    var inner = stripJsonFence(tm[1].trim());
    try {
      var parsed = JSON.parse(inner);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, patch: null, error: "mj_init_loadout 内须为 JSON 对象" };
      }
      return { ok: true, patch: parsed, parseVia: "tag" };
    } catch (e) {
      return {
        ok: false,
        patch: null,
        error: "mj_init_loadout JSON：" + (e && e.message ? String(e.message) : "解析失败"),
        parseVia: "tag",
      };
    }
  }

  function mergeBonusObjects(override, base) {
    var a = override && typeof override === "object" ? override : null;
    var b = base && typeof base === "object" ? base : null;
    if (!a && !b) return null;
    var out = Object.assign({}, b || {}, a || {});
    return Object.keys(out).length ? out : null;
  }

  function copyMagnificationObject(m) {
    if (!m || typeof m !== "object") return null;
    var keys = Object.keys(m);
    if (!keys.length) return null;
    return Object.assign({}, m);
  }

  function pickPositiveNumber(v) {
    return typeof v === "number" && isFinite(v) && v > 0 ? v : null;
  }

  function toSubtypeText(v) {
    var t = v != null ? String(v).trim() : "";
    if (!t) return "";
    if (t === "攻击功法" || t === "攻击") return "攻击";
    if (t === "辅助功法" || t === "辅助") return "辅助";
    return t;
  }

  function isSpiritStoneName(name) {
    var nm = name != null ? String(name).trim() : "";
    if (!nm) return false;
    return /灵石$/.test(nm);
  }

  function buildInitDefaultDesc(cellLike) {
    if (!cellLike || typeof cellLike !== "object") return "";
    var name = cellLike.name != null ? String(cellLike.name).trim() : "";
    var grade = cellLike.grade != null ? String(cellLike.grade).trim() : "";
    var type = cellLike.type != null ? String(cellLike.type).trim() : "";
    var equipType = cellLike.equipType != null ? String(cellLike.equipType).trim() : "";
    var subtype = toSubtypeText(cellLike.subtype != null ? cellLike.subtype : cellLike.subType);

    if (isSpiritStoneName(name)) {
      var g = grade || name.replace(/灵石$/, "") || "下品";
      return g + "灵石，内蕴灵气，可用于修炼与交易流通。";
    }
    if (type === "功法" || subtype === "攻击" || subtype === "辅助") {
      var subText = subtype ? subtype + "类" : "";
      var g0 = grade || "常见";
      return g0 + subText + "功法，可供修士参悟修行。";
    }
    if (type === "丹药") {
      if (
        cellLike.effects &&
        typeof cellLike.effects === "object" &&
        Array.isArray(cellLike.effects.breakthrough) &&
        cellLike.effects.breakthrough.length > 0
      ) {
        var br = cellLike.effects.breakthrough[0] || {};
        var fromR = br.from != null ? String(br.from).trim() : "";
        var toR = br.to != null ? String(br.to).trim() : "";
        if (fromR && toR) return "用于" + fromR + "突破" + toR + "的丹药。";
      }
      return (grade || "常见") + "丹药，服用后可恢复气血与法力。";
    }
    if (equipType) {
      return (grade || "常见") + equipType + "，可用于提升战斗能力。";
    }
    if (type === "材料") {
      return "修行常用材料，可用于炼丹、炼器或交易。";
    }
    return "";
  }

  function ensureInitItemDesc(cellLike) {
    if (!cellLike || typeof cellLike !== "object") return;
    var hasDesc = cellLike.desc != null && String(cellLike.desc).trim() !== "";
    var hasIntro = cellLike.intro != null && String(cellLike.intro).trim() !== "";
    if (!hasDesc && hasIntro) cellLike.desc = String(cellLike.intro).trim();
    if (hasDesc || hasIntro) return;
    var fallback = buildInitDefaultDesc(cellLike);
    if (fallback) cellLike.desc = fallback;
  }

  function isPillItemLike(cell) {
    if (!cell || typeof cell !== "object") return false;
    var ty = cell.type != null ? String(cell.type).trim() : "";
    if (ty === "丹药") return true;
    var name = cell.name != null ? String(cell.name).trim() : cell.label != null ? String(cell.label).trim() : "";
    if (!name) return false;
    var C = global.MjCreationConfig;
    var st = C && typeof C.getStuffDescribe === "function" ? C.getStuffDescribe(name) : null;
    var stType = st && st.type != null ? String(st.type).trim() : "";
    return stType === "丹药";
  }
  function isBreakthroughPillLike(cell) {
    if (!cell || typeof cell !== "object") return false;
    var ty = cell.type != null ? String(cell.type).trim() : "";
    return ty === "突破丹药";
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
  function ensureInitBreakthroughPillEffects(cell) {
    if (!isBreakthroughPillLike(cell)) return;
    var grade = cell.grade != null ? String(cell.grade).trim() : "";
    var route = getBreakthroughRouteByGrade(grade);
    var range = getBreakthroughBonusRangeByGrade(grade);
    if (!route || !range) return;
    var bonusPercent = randomIntInRange(range[0], range[1]);
    var bonusRatio = bonusPercent / 100;
    var eff = cell.effects && typeof cell.effects === "object" ? Object.assign({}, cell.effects) : {};
    eff.breakthrough = [{ from: route.from, to: route.to, chanceBonus: bonusRatio }];
    cell.effects = eff;
    cell.breakthrough = eff.breakthrough;
    cell.type = "丹药";
    if (
      (cell.desc == null || String(cell.desc).trim() === "") &&
      (cell.intro == null || String(cell.intro).trim() === "")
    ) {
      cell.desc = "用于" + route.from + "突破" + route.to + "，可提升约" + bonusPercent + "%成功率。";
    }
  }

  function ensureInitPillRecoverEffects(cell) {
    if (!isPillItemLike(cell)) return;
    var hasBreakthrough =
      (Array.isArray(cell.breakthrough) && cell.breakthrough.length > 0) ||
      (cell.effects &&
        typeof cell.effects === "object" &&
        Array.isArray(cell.effects.breakthrough) &&
        cell.effects.breakthrough.length > 0);
    if (hasBreakthrough) return;
    var grade = cell.grade != null ? String(cell.grade).trim() : "";
    if (!grade) return;
    var hpRange = getAttrRangeByGrade(grade, "血量");
    var mpRange = getAttrRangeByGrade(grade, "法力");
    if (!hpRange && !mpRange) return;

    var effObj = cell.effects && typeof cell.effects === "object" ? Object.assign({}, cell.effects) : {};
    var recover = effObj.recover && typeof effObj.recover === "object" ? Object.assign({}, effObj.recover) : {};

    if (!(typeof recover.hp === "number" && isFinite(recover.hp) && recover.hp > 0) && hpRange) {
      recover.hp = randomIntInRange(hpRange[0], hpRange[1]);
    }
    if (!(typeof recover.mp === "number" && isFinite(recover.mp) && recover.mp > 0) && mpRange) {
      recover.mp = randomIntInRange(mpRange[0], mpRange[1]);
    }

    if (
      !((typeof recover.hp === "number" && isFinite(recover.hp) && recover.hp > 0) ||
        (typeof recover.mp === "number" && isFinite(recover.mp) && recover.mp > 0))
    ) {
      return;
    }
    effObj.recover = recover;
    cell.effects = effObj;
  }
  function normalizeInitInventoryAddOp(rawOp) {
    if (!rawOp || typeof rawOp !== "object") return null;
    var add = Object.assign({}, rawOp);
    add.op = "add";
    if (add.name == null && add.label != null) add.name = add.label;
    if (add.desc == null && add.intro != null) add.desc = add.intro;
    ensureInitBreakthroughPillEffects(add);
    ensureInitPillRecoverEffects(add);
    ensureInitItemDesc(add);
    return add;
  }

  function ensureInitGeneratedItemStats(o) {
    if (!o || typeof o !== "object") return o;
    var g = o.grade != null ? String(o.grade).trim() : "";
    if (!g) return o;
    if (typeof o.value !== "number" || !isFinite(o.value)) {
      var rv = fillRandomValueByGrade(g);
      if (typeof rv === "number" && isFinite(rv)) o.value = rv;
    }
    if (!o.bonus || typeof o.bonus !== "object") o.bonus = {};

    var et = o.equipType != null ? String(o.equipType).trim() : "";
    var subtype = toSubtypeText(o.subtype != null ? o.subtype : o.subType);

    if (et === "武器") {
      if (!(typeof o.bonus.物攻 === "number" && isFinite(o.bonus.物攻) && o.bonus.物攻 > 0)) {
        o.bonus.物攻 = getAttrRandomByGrade(g, "物攻") || 1;
      }
      if (!o.magnification || typeof o.magnification !== "object") o.magnification = {};
      if (!(typeof o.magnification.物攻 === "number" && isFinite(o.magnification.物攻) && o.magnification.物攻 > 0)) {
        o.magnification.物攻 = getDamageMultiplierByGrade(g) || 1.0;
      }
    } else if (et === "法器") {
      if (!(typeof o.bonus.法攻 === "number" && isFinite(o.bonus.法攻) && o.bonus.法攻 > 0)) {
        o.bonus.法攻 = getAttrRandomByGrade(g, "法攻") || 1;
      }
      if (!(typeof o.bonus.法力 === "number" && isFinite(o.bonus.法力) && o.bonus.法力 > 0)) {
        o.bonus.法力 = getAttrRandomByGrade(g, "法力") || 1;
      }
    } else if (et === "防具") {
      if (!(typeof o.bonus.物防 === "number" && isFinite(o.bonus.物防) && o.bonus.物防 > 0)) {
        o.bonus.物防 = getAttrRandomByGrade(g, "物防") || 1;
      }
      if (!(typeof o.bonus.法防 === "number" && isFinite(o.bonus.法防) && o.bonus.法防 > 0)) {
        o.bonus.法防 = getAttrRandomByGrade(g, "法防") || 1;
      }
    } else if (et === "载具") {
      if (!(typeof o.bonus.脚力 === "number" && isFinite(o.bonus.脚力) && o.bonus.脚力 > 0)) {
        o.bonus.脚力 = getAttrRandomByGrade(g, "脚力") || 1;
      }
    } else if (subtype === "攻击") {
      if (!(typeof o.bonus.法攻 === "number" && isFinite(o.bonus.法攻) && o.bonus.法攻 > 0)) {
        o.bonus.法攻 = getAttrRandomByGrade(g, "法攻") || 1;
      }
      if (!o.magnification || typeof o.magnification !== "object") o.magnification = {};
      if (!(typeof o.magnification.法攻 === "number" && isFinite(o.magnification.法攻) && o.magnification.法攻 > 0)) {
        o.magnification.法攻 = getDamageMultiplierByGrade(g) || 1.0;
      }
      var mpRangeAtk = getAttrRangeByGrade(g, "法力");
      if (mpRangeAtk) {
        if (!(typeof o.manacost === "number" && isFinite(o.manacost))) {
          o.manacost = randomIntInRange(mpRangeAtk[0], mpRangeAtk[1]);
        } else {
          o.manacost = Math.max(mpRangeAtk[0], Math.min(mpRangeAtk[1], Math.round(o.manacost)));
        }
      } else if (!(typeof o.manacost === "number" && isFinite(o.manacost))) {
        o.manacost = 1;
      }
    } else if (subtype === "辅助") {
      if (!(typeof o.bonus.法力 === "number" && isFinite(o.bonus.法力) && o.bonus.法力 > 0)) {
        o.bonus.法力 = getAttrRandomByGrade(g, "法力") || 1;
      }
      if (!(typeof o.bonus.神识 === "number" && isFinite(o.bonus.神识) && o.bonus.神识 > 0)) {
        o.bonus.神识 = getAttrRandomByGrade(g, "神识") || 1;
      }
      delete o.manacost;
    }

    if (o.bonus && typeof o.bonus === "object" && !Object.keys(o.bonus).length) delete o.bonus;
    return o;
  }

  /**
   * 与 state_generate 的硬约束保持一致：
   * - 武器仅允许物攻 bonus、仅允许物攻 magnification
   * - 攻击类功法仅允许法攻 bonus、仅允许法攻 magnification
   */
  function enforceInitCombatStatConstraints(o) {
    if (!o || typeof o !== "object") return o;
    var equipType = o.equipType != null ? String(o.equipType).trim() : "";
    var subtype = toSubtypeText(o.subtype != null ? o.subtype : o.subType);

    if (equipType === "武器") {
      var physicalAtk =
        pickPositiveNumber(o.bonus && o.bonus.物攻) ||
        pickPositiveNumber(o.bonus && o.bonus.法攻) ||
        1;
      o.bonus = { 物攻: Math.max(1, Math.round(physicalAtk)) };

      var physicalMag =
        pickPositiveNumber(o.magnification && o.magnification.物攻) ||
        pickPositiveNumber(o.magnification && o.magnification.法攻) ||
        1.0;
      o.magnification = { 物攻: physicalMag };
    } else if (subtype === "攻击") {
      var magicAtk =
        pickPositiveNumber(o.bonus && o.bonus.法攻) ||
        pickPositiveNumber(o.bonus && o.bonus.物攻) ||
        1;
      o.bonus = { 法攻: Math.max(1, Math.round(magicAtk)) };

      var magicMag =
        pickPositiveNumber(o.magnification && o.magnification.法攻) ||
        pickPositiveNumber(o.magnification && o.magnification.物攻) ||
        1.0;
      o.magnification = { 法攻: magicMag };
    }
    return o;
  }

  /**
   * @param {Object} cell
   * @param {number} [slotIndex] 0～3 对应 武器/法器/防具/载具，用于补全 equipType 与是否保留 magnification
   */
  function normalizeEquipFromAi(cell, slotIndex) {
    if (cell == null || typeof cell !== "object") return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc).trim();
    else if (cell.intro != null && String(cell.intro).trim() !== "") o.desc = String(cell.intro).trim();
    var C = global.MjCreationConfig;
    var em =
      C && typeof C.getEquipmentDescribe === "function" ? C.getEquipmentDescribe(name) : null;
    var PR = panelRealm();
    var kindLabels = PR && Array.isArray(PR.EQUIP_SLOT_KIND_LABELS) ? PR.EQUIP_SLOT_KIND_LABELS : null;
    var slotKind =
      typeof slotIndex === "number" &&
      slotIndex >= 0 &&
      slotIndex < 4 &&
      kindLabels &&
      kindLabels[slotIndex] != null
        ? String(kindLabels[slotIndex]).trim()
        : "";
    var ty =
      cell.equipType != null && String(cell.equipType).trim() !== ""
        ? String(cell.equipType).trim()
        : cell.type != null && String(cell.type).trim() !== ""
          ? String(cell.type).trim()
          : em && em.type != null
            ? String(em.type).trim()
            : "";
    if (ty) o.equipType = ty;
    else if (slotKind) o.equipType = slotKind;
    if ((!o.desc || o.desc === "") && em && em.desc) o.desc = String(em.desc);
    if (cell.grade != null && String(cell.grade).trim() !== "") o.grade = String(cell.grade).trim();
    else if (em && em.grade != null && String(em.grade).trim() !== "") o.grade = String(em.grade).trim();
    if (typeof cell.value === "number" && isFinite(cell.value)) {
      o.value = Math.max(0, Math.floor(cell.value));
    } else if (em && typeof em.value === "number" && isFinite(em.value)) {
      o.value = Math.max(0, Math.floor(em.value));
    }
    var bonusMerged = mergeBonusObjects(cell.bonus, em && em.bonus);
    if (bonusMerged) o.bonus = bonusMerged;
    var eqTy = o.equipType != null ? String(o.equipType).trim() : "";
    var isWeapon =
      eqTy === "武器" ||
      (cell.type != null && String(cell.type).trim() === "武器") ||
      slotKind === "武器";
    if (isWeapon) {
      var magCell = copyMagnificationObject(cell.magnification);
      var magEm = copyMagnificationObject(em && em.magnification);
      var magUse = magCell || magEm;
      if (magUse) o.magnification = magUse;
    }
    return enforceInitCombatStatConstraints(ensureInitGeneratedItemStats(o));
  }

  function normalizeGongfaFromAi(cell) {
    if (cell == null || typeof cell !== "object") return null;
    var name =
      cell.name != null
        ? String(cell.name).trim()
        : cell.label != null
          ? String(cell.label).trim()
          : "";
    if (!name) return null;
    var o = { name: name, type: "功法" };
    if (cell.desc != null && String(cell.desc).trim() !== "") o.desc = String(cell.desc).trim();
    else if (cell.intro != null && String(cell.intro).trim() !== "") o.desc = String(cell.intro).trim();
    var C = global.MjCreationConfig;
    var gi =
      C && typeof C.getGongfaDescribe === "function" ? C.getGongfaDescribe(name) : null;
    if (gi) {
      if ((!o.desc || o.desc === "") && gi.desc) o.desc = String(gi.desc);
    }
    var subtype =
      toSubtypeText(cell.subtype != null ? cell.subtype : cell.subType) ||
      toSubtypeText(cell.type) ||
      toSubtypeText(gi && (gi.subtype != null ? gi.subtype : gi.subType)) ||
      toSubtypeText(gi && gi.type);
    if (subtype) {
      o.subtype = subtype;
      o.subType = subtype;
    }
    if (cell.grade != null && String(cell.grade).trim() !== "") o.grade = String(cell.grade).trim();
    else if (gi && gi.grade != null && String(gi.grade).trim() !== "") o.grade = String(gi.grade).trim();
    if (typeof cell.value === "number" && isFinite(cell.value)) {
      o.value = Math.max(0, Math.floor(cell.value));
    } else if (gi && typeof gi.value === "number" && isFinite(gi.value)) {
      o.value = Math.max(0, Math.floor(gi.value));
    }
    var bonusGf = mergeBonusObjects(cell.bonus, gi && gi.bonus);
    if (bonusGf) o.bonus = bonusGf;
    var subKey = toSubtypeText(o.subtype != null ? o.subtype : o.subType);
    if (subKey === "攻击") {
      var mgf = copyMagnificationObject(cell.magnification) || copyMagnificationObject(gi && gi.magnification);
      if (mgf) o.magnification = mgf;
    } else if (subKey === "辅助") {
      delete o.magnification;
    }
    if (subKey !== "辅助") {
      var mc =
        typeof cell.manacost === "number" && isFinite(cell.manacost)
          ? cell.manacost
          : gi && typeof gi.manacost === "number" && isFinite(gi.manacost)
            ? gi.manacost
            : null;
      var mpRange = getAttrRangeByGrade(o.grade, "法力");
      if (mc != null) {
        var mcv = Math.round(mc);
        if (mpRange) mcv = Math.max(mpRange[0], Math.min(mpRange[1], mcv));
        o.manacost = Math.max(1, mcv);
      }
    } else {
      delete o.manacost;
    }
    ensureInitItemDesc(o);
    return enforceInitCombatStatConstraints(ensureInitGeneratedItemStats(o));
  }

  /**
   * @param {Object} G
   * @param {Object} patch
   * @returns {{ appliedEquip: number, appliedGongfa: number, appliedInventory: number }}
   */
  function applyInitLoadoutPatch(G, patch) {
    var out = { appliedEquip: 0, appliedGongfa: 0, appliedInventory: 0 };
    if (!G || !patch || typeof patch !== "object") return out;
    var Pn = global.MjMainScreenPanel;
    var SG = stateGen();
    var nEq = equipCount();
    var nGf = gongfaCount();
    if (Pn && typeof Pn.ensureEquippedSlots === "function") Pn.ensureEquippedSlots(G);
    if (Pn && typeof Pn.ensureGongfaSlots === "function") Pn.ensureGongfaSlots(G);

    var rawEq = Array.isArray(patch.equippedSlots) ? patch.equippedSlots : null;
    if (rawEq) {
      for (var i = 0; i < nEq; i++) {
        if (i >= rawEq.length) break;
        var raw = rawEq[i];
        if (raw === null) {
          G.equippedSlots[i] = null;
          continue;
        }
        var ec = normalizeEquipFromAi(raw, i);
        if (ec) {
          G.equippedSlots[i] = ec;
          out.appliedEquip++;
        }
      }
    }

    var rawGf = Array.isArray(patch.gongfaSlots) ? patch.gongfaSlots : null;
    if (rawGf) {
      for (var j = 0; j < nGf; j++) {
        if (j >= rawGf.length) break;
        var gr = rawGf[j];
        if (gr === null) {
          G.gongfaSlots[j] = null;
          continue;
        }
        var gc = normalizeGongfaFromAi(gr);
        if (gc) {
          G.gongfaSlots[j] = gc;
          out.appliedGongfa++;
        }
      }
    }

    var rawInv = Array.isArray(patch.inventorySlots) ? patch.inventorySlots : null;
    if (rawInv && SG && typeof SG.applyInventoryOps === "function") {
      var invOps = [];
      for (var k = 0; k < rawInv.length; k++) {
        var cell = rawInv[k];
        if (!cell || typeof cell !== "object") continue;
        var add = normalizeInitInventoryAddOp(cell);
        if (add) invOps.push(add);
      }
      if (invOps.length) {
        var invRes = SG.applyInventoryOps(G, invOps);
        out.appliedInventory = Array.isArray(invRes && invRes.placed) ? invRes.placed.length : 0;
      }
    }
    return out;
  }

  /**
   * 不触碰周围人物列表（避免误用状态 AI 的「省略第三对则清空可见 NPC」语义）。
   * @param {Object} G
   * @param {Object|null} fc
   * @param {string} assistantText
   */
  function applyInitStateFromAssistantText(G, fc, assistantText) {
    var SG = stateGen();
    var raw = String(assistantText || "");
    if (!G) return { inventory: null, world: null, loadout: null };

    if (SG && typeof SG.parseInventoryOpsFromText === "function" && typeof SG.applyInventoryOps === "function") {
      var pr = SG.parseInventoryOpsFromText(raw);
      if (pr.ok) {
        var initOps = [];
        for (var oi = 0; oi < pr.ops.length; oi++) {
          var opRaw = pr.ops[oi];
          if (!opRaw || typeof opRaw !== "object") continue;
          var opn = opRaw.op != null ? String(opRaw.op).trim().toLowerCase() : "";
          if (opn === "add") {
            var normalized = normalizeInitInventoryAddOp(opRaw);
            if (normalized) initOps.push(normalized);
          } else {
            initOps.push(opRaw);
          }
        }
        SG.applyInventoryOps(G, initOps);
      }
    }
    if (SG && typeof SG.parseWorldStateFromText === "function" && typeof SG.applyWorldStatePatch === "function") {
      var ws = SG.parseWorldStateFromText(raw);
      if (ws.ok && ws.patch) SG.applyWorldStatePatch(G, ws.patch);
    }

    var lo = parseInitLoadoutFromText(raw);
    var loadoutSummary = null;
    if (lo.ok && lo.patch) loadoutSummary = applyInitLoadoutPatch(G, lo.patch);

    var PRn = global.MjMainScreenPanelRealm;
    if (PRn && typeof PRn.ensureInventorySlots === "function") {
      try {
        PRn.ensureInventorySlots(G);
      } catch (_e0) {}
    }

    var PBR = global.PlayerBaseRuntime;
    var effFc = fc != null ? fc : G.fateChoice;
    if (PBR && typeof PBR.applyToGame === "function" && effFc) {
      try {
        PBR.applyToGame(G, effFc);
      } catch (_e1) {}
    }

    return {
      inventory: true,
      world: true,
      loadout: loadoutSummary,
      initLoadoutError: lo.ok ? null : lo.error || null,
    };
  }

  function sendTurn(opts) {
    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      return Promise.reject(
        new Error("TavernHelper 未加载：请确认 bridge.js 已在本文件之前引入。"),
      );
    }
    var o = opts || {};
    var messages =
      Array.isArray(o.messages) && o.messages.length > 0 ? o.messages : buildMessages(o);
    if (global.GameLog && typeof global.GameLog.info === "function") {
      try {
        global.GameLog.info(
          "[开局配置AI→发送] 最终 messages：\n" + JSON.stringify(messages, null, 2),
        );
      } catch (_eMsg) {
        global.GameLog.info("[开局配置AI→发送] 最终 messages（序列化失败）");
      }
    }
    return TH.generateFromMessages({
      messages: messages,
      should_stream: o.shouldStream !== false,
      onDelta: o.onDelta,
      signal: o.signal,
    });
  }

  /**
   * @param {Object} opts
   * @param {Object} [opts.game]
   * @param {Object} [opts.fateChoice]
   * @param {function():void} [opts.onDone]
   */
  function runInitStateAiIfNeeded(opts) {
    var o = opts || {};
    var G = o.game != null ? o.game : global.MortalJourneyGame;
    var fc = o.fateChoice != null ? o.fateChoice : G && G.fateChoice;
    var onDone = typeof o.onDone === "function" ? o.onDone : function () {};

    if (!G || !fc) {
      onDone();
      return Promise.resolve({ skipped: true, reason: "no game or fateChoice" });
    }

    if (G.mjInitStateAiApplied === true) {
      onDone();
      return Promise.resolve({ skipped: true, reason: "already applied" });
    }

    var afterOpeningStory = o.afterOpeningStory === true;
    if (!afterOpeningStory) {
      var hist = Array.isArray(G.chatHistory) ? G.chatHistory : [];
      for (var i = 0; i < hist.length; i++) {
        var r = hist[i] && hist[i].role;
        if (r === "user" || r === "assistant") {
          G.mjInitStateAiApplied = true;
          onDone();
          return Promise.resolve({ skipped: true, reason: "chat already has messages" });
        }
      }
    }

    var TH = global.TavernHelper;
    if (!TH || typeof TH.generateFromMessages !== "function") {
      try {
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[开局配置AI] 跳过：TavernHelper 未就绪");
        }
      } catch (_e2) {}
      onDone();
      return Promise.resolve({ skipped: true, reason: "no TavernHelper" });
    }

    var openingAssist = "";
    if (afterOpeningStory) {
      openingAssist = extractLatestAssistantStoryText(G);
    }

    return sendTurn({
      game: G,
      fateChoice: fc,
      openingStoryAssistantText: openingAssist,
      shouldStream: o.shouldStream !== false,
      onDelta: o.onDelta,
      signal: o.signal,
    })
      .then(function (fullText) {
        var text = fullText != null ? String(fullText) : "";
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[开局配置AI←返回] 最终 AI 返回：\n" + text);
        }
        applyInitStateFromAssistantText(G, fc, text);
        G.mjInitStateAiApplied = true;
        var Pn = global.MjMainScreenPanel;
        if (Pn && typeof Pn.persistBootstrapSnapshot === "function") {
          try {
            Pn.persistBootstrapSnapshot();
          } catch (_e3) {}
        }
        try {
          if (global.GameLog && typeof global.GameLog.info === "function") {
            global.GameLog.info("[开局配置AI] 已完成应用");
          }
        } catch (_e4) {}
        onDone();
        return { skipped: false, ok: true };
      })
      .catch(function (err) {
        try {
          console.warn("[开局配置AI] 请求或应用失败", err);
        } catch (_e5) {}
        if (global.GameLog && typeof global.GameLog.error === "function") {
          global.GameLog.error(
            "[开局配置AI] 请求或应用失败：",
            err && err.message ? String(err.message) : String(err),
          );
        }
        onDone();
        return { skipped: false, ok: false, error: err };
      });
  }

  global.MortalJourneyInitStateGenerate = {
    INIT_LOADOUT_TAG_OPEN: INIT_LOADOUT_TAG_OPEN,
    INIT_LOADOUT_TAG_CLOSE: INIT_LOADOUT_TAG_CLOSE,
    buildFateChoiceBriefJson: buildFateChoiceBriefJson,
    buildInitStateUserContent: buildInitStateUserContent,
    buildMessages: buildMessages,
    parseInitLoadoutFromText: parseInitLoadoutFromText,
    applyInitLoadoutPatch: applyInitLoadoutPatch,
    applyInitStateFromAssistantText: applyInitStateFromAssistantText,
    sendTurn: sendTurn,
    runInitStateAiIfNeeded: runInitStateAiIfNeeded,
  };
})(typeof window !== "undefined" ? window : globalThis);
