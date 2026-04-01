/**
 * 主界面面板（二）：开局总览、格子渲染、物品/功法/装备弹窗、左栏 renderLeftPanel。
 * 依赖：先加载 mainScreen_panel_realm.js（MjMainScreenPanelRealm）；对外 API 仍为 MjMainScreenPanel。
 */
(function (global) {
  "use strict";
  var R = global.MjMainScreenPanelRealm;
  if (!R) {
    console.error("[主界面] 缺少 MjMainScreenPanelRealm，请确认 mainScreen_panel_realm.js 已先于本文件加载。");
    return;
  }
  var INVENTORY_SLOT_COUNT = R.INVENTORY_SLOT_COUNT;
  var GONGFA_SLOT_COUNT = R.GONGFA_SLOT_COUNT;
  var EQUIP_SLOT_COUNT = R.EQUIP_SLOT_COUNT;
  var EQUIP_SLOT_EMPTY_TITLE = R.EQUIP_SLOT_EMPTY_TITLE;
  var EQUIP_SLOT_KIND_LABELS = R.EQUIP_SLOT_KIND_LABELS;
  var DEFAULT_WORLD_TIME = R.DEFAULT_WORLD_TIME;
  function formatRealmLine(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm) || {};
    var major = r.major || "练气";
    var minor = r.minor || "初期";
    var line = "境界：" + major + minor;
    if (G && fc) {
      R.syncLateStageBreakSuffixState(G, fc);
      var cult = R.computeCultivationUi(G, fc);
      var atLateFull =
        minor === "后期" &&
        major !== "化神" &&
        cult.req != null &&
        cult.req > 0 &&
        cult.cur >= cult.req;
      if (atLateFull && G.lateStageBreakSuffix) {
        var fails = G.lateStageBreakSuffix.failCount;
        var fcNum = typeof fails === "number" && isFinite(fails) ? Math.max(0, Math.floor(fails)) : 0;
        line += fcNum <= 0 ? "*圆满" : "*巅峰";
      }
    }
    return line;
  }

  function numOrDash(v) {
    return typeof v === "number" && isFinite(v) ? String(Math.round(v)) : "—";
  }

  /** 左栏灵根：只显示五行字连续拼接（如「水木火土」），不显示真灵根/伪灵根等前缀，避免顿号导致换行难看 */
  function formatLinggenPanelText(linggenFull) {
    var raw = linggenFull == null ? "" : String(linggenFull).trim();
    if (raw === "" || raw === "无灵根") return "—";
    var LS = global.LinggenState;
    var els = LS && typeof LS.parseElements === "function" ? LS.parseElements(raw) : [];
    if (!els.length) return "—";
    return els.join("");
  }

  function appendOverviewSection(host, titleText) {
    var h = document.createElement("h4");
    h.className = "mj-chat-overview-h";
    h.textContent = titleText;
    host.appendChild(h);
  }

  /**
   * 剧情对话首条：开局总览（天赋、世界因子；档案与数值见左侧角色栏）
   */
  function renderBootstrapOverview(fc) {
    var log = document.getElementById("mj-chat-log");
    if (!log) return;
    log.innerHTML = "";

    if (!fc) {
      var ph = document.createElement("p");
      ph.className = "mj-chat-placeholder";
      ph.innerHTML =
        "尚未载入开局存档。<br />请从洪荒界面完成「命运抉择」后进入本页，此处将显示天赋与世界因子总览及剧情对话。";
      log.appendChild(ph);
      return;
    }

    var root = document.createElement("div");
    root.className = "mj-chat-msg mj-chat-msg--overview";
    root.setAttribute("aria-label", "开局信息总览");

    var titleEl = document.createElement("div");
    titleEl.className = "mj-chat-overview-title";
    titleEl.textContent = "【修仙之路】";
    root.appendChild(titleEl);

    var introWrap = document.createElement("div");
    introWrap.className = "mj-chat-overview-intro";

    var p1 = document.createElement("p");
    p1.textContent =
      "此界为修仙界，人人皆以求道为念。练气、筑基、结丹、元婴、化神……一重境界一重天，踏上这条路，便是逆流而上。";
    introWrap.appendChild(p1);

    var p2 = document.createElement("p");
    p2.textContent =
      "你亦不例外。想要精进修为，离不开灵石——它既是修炼所需的源泉，也是行走江湖的底气。灵石从不凭空而来：做生意、接差事、探秘境、夺机缘……路有千条，你尽可选自己喜欢的那一条。";
    introWrap.appendChild(p2);

    var p3 = document.createElement("p");
    p3.textContent =
      "但修真路上，人心难测。财不露白，强者为尊。要守住灵石与性命，便须让自己变得更强：寻更锋利的物器与法器，备更可靠的防具，亦可修习功法，步步夯实根基。前路如何，便看你自己的选择了。";
    introWrap.appendChild(p3);

    var p4 = document.createElement("p");
    p4.textContent = "可选行动：";
    introWrap.appendChild(p4);

    var ulActions = document.createElement("ul");
    ulActions.className = "mj-chat-overview-ul";
    var a1 = document.createElement("li");
    a1.className = "mj-chat-overview-li";
    a1.textContent = "找一个可以赚取灵石的法子";
    ulActions.appendChild(a1);
    var a2 = document.createElement("li");
    a2.className = "mj-chat-overview-li";
    a2.textContent = "在周围闲逛，看看有没有什么奇遇";
    ulActions.appendChild(a2);
    introWrap.appendChild(ulActions);

    root.appendChild(introWrap);

    log.appendChild(root);
  }
  function renderInventorySlots() {
    var grid = document.getElementById("mj-inventory-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className = "mj-inventory-slot mj-inventory-slot--empty";
      slot.setAttribute("data-slot", String(i));
      var lab = document.createElement("span");
      lab.className = "mj-inventory-slot-label";
      var qty = document.createElement("span");
      qty.className = "mj-inventory-slot-qty";
      qty.setAttribute("aria-label", "数量");
      slot.appendChild(lab);
      slot.appendChild(qty);
      grid.appendChild(slot);
    }
  }

  function renderBagSlots(G) {
    R.ensureInventorySlots(G);
    R.enrichInventoryGradesFromDescribe(G);
    var grid = document.getElementById("mj-inventory-grid");
    if (!grid || !G || !G.inventorySlots) return;
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var el = grid.querySelector('[data-slot="' + i + '"]');
      if (!el) continue;
      var labelEl = el.querySelector(".mj-inventory-slot-label");
      var qtyEl = el.querySelector(".mj-inventory-slot-qty");
      var item = G.inventorySlots[i];
      if (item && item.name) {
        el.classList.add("mj-inventory-slot--filled");
        el.classList.remove("mj-inventory-slot--empty");
        if (labelEl) labelEl.textContent = item.name;
        var cnt = typeof item.count === "number" ? item.count : 1;
        if (qtyEl) {
          qtyEl.textContent = String(cnt);
          qtyEl.classList.remove("hidden");
        }
        var tip = item.name;
        if (item.desc) tip += "\n" + item.desc;
        tip += "\n数量：" + cnt + "（点击查看详情）";
        el.setAttribute("title", tip);
        el.setAttribute("aria-label", item.name + "，数量 " + cnt);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        R.setSlotRarityDataAttr(el, R.resolveBagItemTraitRarity(item.name, item));
      } else {
        el.classList.add("mj-inventory-slot--empty");
        el.classList.remove("mj-inventory-slot--filled");
        if (labelEl) labelEl.textContent = "";
        if (qtyEl) {
          qtyEl.textContent = "";
          qtyEl.classList.add("hidden");
        }
        el.setAttribute("title", "空位");
        el.removeAttribute("aria-label");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        R.setSlotRarityDataAttr(el, null);
      }
    }
  }

  function renderGongfaGrid() {
    var grid = document.getElementById("mj-gongfa-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (var i = 0; i < GONGFA_SLOT_COUNT; i++) {
      var slot = document.createElement("div");
      slot.className = "mj-inventory-slot";
      slot.setAttribute("data-gongfa-slot", String(i));
      slot.setAttribute("title", "功法空位");
      var stack = document.createElement("div");
      stack.className = "mj-gongfa-slot-stack";
      var inner = document.createElement("span");
      inner.className = "mj-gongfa-slot-label";
      inner.setAttribute("aria-hidden", "true");
      var typeEl = document.createElement("span");
      typeEl.className = "mj-gongfa-slot-type";
      typeEl.setAttribute("aria-hidden", "true");
      stack.appendChild(inner);
      stack.appendChild(typeEl);
      slot.appendChild(stack);
      grid.appendChild(slot);
    }
  }

  function renderGongfaSlots(G) {
    R.ensureGongfaSlots(G);
    var grid = document.getElementById("mj-gongfa-grid");
    if (!grid || !G || !G.gongfaSlots) return;
    for (var i = 0; i < GONGFA_SLOT_COUNT; i++) {
      var el = grid.querySelector('[data-gongfa-slot="' + i + '"]');
      if (!el) continue;
      var stack = el.querySelector(".mj-gongfa-slot-stack");
      var inner = stack ? stack.querySelector(".mj-gongfa-slot-label") : el.querySelector(".mj-gongfa-slot-label");
      var typeSpan = stack ? stack.querySelector(".mj-gongfa-slot-type") : el.querySelector(".mj-gongfa-slot-type");
      var item = G.gongfaSlots[i];
      var label = item && (item.name != null ? item.name : item.label);
      if (label) {
        el.classList.add("mj-gongfa-slot--filled");
        if (inner) inner.textContent = String(label);
        var cfgGf = R.lookupGongfaConfigDef(String(label));
        var tyRaw = resolveGongfaSubtype(item, cfgGf);
        if (typeSpan) {
          typeSpan.textContent = tyRaw;
          typeSpan.className = "mj-gongfa-slot-type";
          if (tyRaw === "辅助") typeSpan.classList.add("mj-gongfa-slot-type--support");
          else if (tyRaw === "攻击") typeSpan.classList.add("mj-gongfa-slot-type--attack");
          else if (tyRaw) typeSpan.classList.add("mj-gongfa-slot-type--other");
        }
        var tip = String(label);
        if (tyRaw) tip += "\n类型：" + tyRaw;
        if (item.desc) tip += "\n" + String(item.desc);
        tip += "\n（点击查看详情）";
        el.setAttribute("title", tip);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "查看功法：" + String(label) + (tyRaw ? "，" + tyRaw : ""));
        R.setSlotRarityDataAttr(el, R.resolveGongfaTraitRarity(String(label), item, cfgGf));
      } else {
        el.classList.remove("mj-gongfa-slot--filled");
        if (inner) inner.textContent = "";
        if (typeSpan) {
          typeSpan.textContent = "";
          typeSpan.className = "mj-gongfa-slot-type";
        }
        el.setAttribute("title", "功法空位");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        R.setSlotRarityDataAttr(el, null);
      }
    }
  }
  function formatZhBonusObject(b) {
    if (!b || typeof b !== "object") return "";
    var keys = Object.keys(b);
    if (!keys.length) return "";
    return keys
      .map(function (k) {
        var v = b[k];
        if (typeof v === "number" && isFinite(v)) {
          return (v >= 0 ? k + " +" + v : k + " " + v);
        }
        return k + " " + String(v);
      })
      .join("；");
  }

  /** 配置里 stuff 条目的 bonus 展示用（灵石只体现在 0 格数量） */
  function formatStuffBonusForDisplay(b) {
    if (!b || typeof b !== "object") return "";
    var o = Object.assign({}, b);
    delete o.灵石;
    return formatZhBonusObject(o);
  }

  /**
   * describe.value 为全局统一的「灵石等价」刻度（与下品灵石、中品灵石等条目的 value 同一套数轴）；
   * 非「多少颗下品灵石」的颗数含义。
   */
  function formatReferenceValueFromNumber(n) {
    if (typeof n !== "number" || !isFinite(n)) return null;
    return Math.floor(n);
  }

  function formatReferenceValueLine(meta) {
    if (!meta || typeof meta.value !== "number" || !isFinite(meta.value)) return null;
    return R.formatReferenceValueFromNumber(meta.value);
  }

  /** 从多条 describe 元数据中取第一个有效的 value（灵石等价刻度，背包物品可能只命中其一） */
  function pickDescribeValueFromMetas() {
    for (var i = 0; i < arguments.length; i++) {
      var m = arguments[i];
      if (m && typeof m.value === "number" && isFinite(m.value)) return m.value;
    }
    return null;
  }

  /** 按物品显示名匹配 stuff_describe 元数据 { desc, bonus } */
  function lookupStuffMetaByItemName(itemName) {
    if (!itemName) return null;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getStuffDescribe !== "function") return null;
    return C.getStuffDescribe(String(itemName).trim());
  }

  /** 按名称查找功法定义（含 desc / type / bonus） */
  function lookupGongfaConfigDef(gongfaName) {
    if (!gongfaName) return null;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getGongfaDescribe !== "function") return null;
    return C.getGongfaDescribe(String(gongfaName).trim());
  }

  function resolveGongfaSubtype(rawItem, cfgGf) {
    var it = rawItem && typeof rawItem === "object" ? rawItem : {};
    var meta = cfgGf && typeof cfgGf === "object" ? cfgGf : null;
    var st =
      it.subtype != null && String(it.subtype).trim() !== ""
        ? String(it.subtype).trim()
        : it.subType != null && String(it.subType).trim() !== ""
          ? String(it.subType).trim()
          : meta && meta.subtype != null && String(meta.subtype).trim() !== ""
            ? String(meta.subtype).trim()
            : meta && meta.subType != null && String(meta.subType).trim() !== ""
              ? String(meta.subType).trim()
              : "";
    if (st) return st;
    var ty =
      it.type != null && String(it.type).trim() !== ""
        ? String(it.type).trim()
        : meta && meta.type != null
          ? String(meta.type).trim()
          : "";
    return ty === "攻击" || ty === "辅助" ? ty : "";
  }

  function isBagItemGongfaCandidate(it, cfgGf) {
    if (cfgGf) return true;
    var ty = it && it.type != null ? String(it.type).trim() : "";
    if (ty === "功法") return true;
    var st = resolveGongfaSubtype(it, cfgGf);
    return st === "攻击" || st === "辅助";
  }

  /** 按装备名匹配 equipment 元数据 { desc, type, bonus } */
  function lookupEquipmentMetaByItemName(itemName) {
    if (!itemName) return null;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getEquipmentDescribe !== "function") return null;
    return C.getEquipmentDescribe(String(itemName).trim());
  }

  /** stuff 品阶（下品…）→ 与逆天改命槽位 data-rarity 相同的键，供 CSS 复用 */
  var GRADE_TO_TRAIT_RARITY = {
    下品: "平庸",
    中品: "普通",
    上品: "稀有",
    极品: "史诗",
    仙品: "传说",
    神品: "神迹",
  };

  function gradeToTraitRarity(grade) {
    if (grade == null || String(grade).trim() === "") return null;
    var g = String(grade).trim();
    var r = GRADE_TO_TRAIT_RARITY[g];
    return r != null ? r : null;
  }

  function setSlotRarityDataAttr(el, traitRarity) {
    if (!el) return;
    if (traitRarity) el.setAttribute("data-rarity", traitRarity);
    else el.removeAttribute("data-rarity");
  }

  /** 背包：优先格子上已存的 grade（开局/补全），再查 stuff、装备表 */
  function resolveBagItemTraitRarity(itemName, item) {
    if (item && item.grade != null && String(item.grade).trim() !== "") {
      var fromCell = gradeToTraitRarity(item.grade);
      if (fromCell) return fromCell;
    }
    var nm = String(itemName || "").trim();
    if (!nm) return null;
    var stuff = R.lookupStuffMetaByItemName(nm);
    if (stuff && stuff.grade != null && String(stuff.grade).trim() !== "") {
      return gradeToTraitRarity(stuff.grade);
    }
    var eq = R.lookupEquipmentMetaByItemName(nm);
    if (eq && eq.grade != null && String(eq.grade).trim() !== "") {
      return gradeToTraitRarity(eq.grade);
    }
    return null;
  }

  function resolveEquipTraitRarity(itemName, item) {
    var gr = null;
    if (item && item.grade != null && String(item.grade).trim() !== "") {
      gr = String(item.grade).trim();
    }
    if (!gr) {
      var em = R.lookupEquipmentMetaByItemName(String(itemName || "").trim());
      if (em && em.grade != null && String(em.grade).trim() !== "") gr = String(em.grade).trim();
    }
    return gr ? gradeToTraitRarity(gr) : null;
  }

  function resolveGongfaTraitRarity(label, item, cfgGf) {
    var gr = null;
    if (item && item.grade != null && String(item.grade).trim() !== "") {
      gr = String(item.grade).trim();
    }
    if (!gr && cfgGf && cfgGf.grade != null && String(cfgGf.grade).trim() !== "") {
      gr = String(cfgGf.grade).trim();
    }
    return gr ? gradeToTraitRarity(gr) : null;
  }

  function formatEquipTypeLabel(ty) {
    if (ty == null || String(ty).trim() === "") return "";
    var r = String(ty).trim();
    if (r === "副武器") return "法器";
    if (r === "主武器") return "武器";
    return r;
  }

  function findFirstEmptyBagSlot(G) {
    R.ensureInventorySlots(G);
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      if (!G.inventorySlots[i]) return i;
    }
    return -1;
  }

  /**
   * 将一件物品放入储物袋（0～11）：优先与同名堆叠，否则找空位。
   * @returns {boolean}
   */
  function tryPlaceItemInBag(G, payload) {
    if (!G || !payload || !payload.name) return false;
    R.ensureInventorySlots(G);
    var name = String(payload.name).trim();
    if (!name) return false;
    var cnt = typeof payload.count === "number" && isFinite(payload.count) ? Math.max(1, Math.floor(payload.count)) : 1;
    var desc = payload.desc != null ? String(payload.desc) : "";
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var c = G.inventorySlots[i];
      if (c && c.name === name) {
        c.count = (typeof c.count === "number" && isFinite(c.count) ? c.count : 1) + cnt;
        return true;
      }
    }
    var j = findFirstEmptyBagSlot(G);
    if (j < 0) return false;
    G.inventorySlots[j] = R.normalizeBagItem({
      name: name,
      count: cnt,
      desc: desc || undefined,
      equipType: payload.equipType,
      grade: payload.grade,
      value: payload.value,
      type: payload.type,
      bonus: payload.bonus,
      effects: payload.effects,
    });
    return true;
  }

  function findFirstEmptyGongfaSlot(G) {
    R.ensureGongfaSlots(G);
    for (var g = 0; g < GONGFA_SLOT_COUNT; g++) {
      var s = G.gongfaSlots[g];
      var lab = s && (s.name != null ? s.name : s.label);
      if (!lab || String(lab).trim() === "") return g;
    }
    return -1;
  }

  function notifyGongfaBarFull() {
    var msg = "功法栏已满，无法装入更多功法。";
    if (global.GameLog && typeof global.GameLog.warn === "function") global.GameLog.warn(msg);
    else window.alert(msg);
  }

  /** 功法栏格子 → 入袋 payload（保留品级、类型、修炼加成、价值） */
  function gongfaSlotItemToBagPayload(item) {
    if (!item) return null;
    var nm =
      item.name != null
        ? String(item.name).trim()
        : item.label != null
          ? String(item.label).trim()
          : "";
    if (!nm) return null;
    var cfgGf = R.lookupGongfaConfigDef(nm);
    var descStr =
      item.desc != null && String(item.desc).trim() !== ""
        ? String(item.desc).trim()
        : cfgGf && cfgGf.desc != null
          ? String(cfgGf.desc).trim()
          : "";
    var o = { name: nm, count: 1, desc: descStr };
    var gr =
      item.grade != null && String(item.grade).trim() !== ""
        ? String(item.grade).trim()
        : cfgGf && cfgGf.grade != null
          ? String(cfgGf.grade).trim()
          : "";
    if (gr) o.grade = gr;
    o.type = "功法";
    var ty = resolveGongfaSubtype(item, cfgGf);
    if (ty) o.subtype = ty;
    if (item.bonus && typeof item.bonus === "object" && Object.keys(item.bonus).length > 0) {
      o.bonus = Object.assign({}, item.bonus);
    } else if (
      cfgGf &&
      cfgGf.bonus &&
      typeof cfgGf.bonus === "object" &&
      Object.keys(cfgGf.bonus).length > 0
    ) {
      o.bonus = Object.assign({}, cfgGf.bonus);
    }
    if (typeof item.value === "number" && isFinite(item.value)) {
      o.value = Math.max(0, Math.floor(item.value));
    } else if (cfgGf && typeof cfgGf.value === "number" && isFinite(cfgGf.value)) {
      o.value = Math.floor(cfgGf.value);
    }
    return o;
  }

  /** 储物袋功法书 → 功法栏对象（合并格子与功法表） */
  function bagItemToGongfaBarObject(it, cfgGf) {
    var nm = String(it.name).trim();
    var descStr = "";
    if (it.desc != null && String(it.desc).trim() !== "") descStr = String(it.desc).trim();
    else if (cfgGf && cfgGf.desc != null) descStr = String(cfgGf.desc).trim();
    var gfObj = { name: nm, desc: descStr };
    gfObj.type = "功法";
    var ty = resolveGongfaSubtype(it, cfgGf);
    if (ty) gfObj.subtype = ty;
    var gGr =
      it.grade != null && String(it.grade).trim() !== ""
        ? String(it.grade).trim()
        : cfgGf && cfgGf.grade != null
          ? String(cfgGf.grade).trim()
          : "";
    if (gGr) gfObj.grade = gGr;
    if (it.bonus && typeof it.bonus === "object" && Object.keys(it.bonus).length > 0) {
      gfObj.bonus = Object.assign({}, it.bonus);
    } else if (
      cfgGf &&
      cfgGf.bonus &&
      typeof cfgGf.bonus === "object" &&
      Object.keys(cfgGf.bonus).length > 0
    ) {
      gfObj.bonus = Object.assign({}, cfgGf.bonus);
    }
    if (typeof it.value === "number" && isFinite(it.value)) {
      gfObj.value = Math.max(0, Math.floor(it.value));
    } else if (cfgGf && typeof cfgGf.value === "number" && isFinite(cfgGf.value)) {
      gfObj.value = Math.floor(cfgGf.value);
    }
    return gfObj;
  }

  /**
   * 从功法栏卸下放入储物袋。
   * @param {number} gfIdx 0～11
   * @returns {boolean}
   */
  function performUnequipGongfaToBag(gfIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    R.ensureGameRuntimeDefaults(G);
    var gi = Number(gfIdx);
    if (!isFinite(gi) || gi < 0 || gi >= GONGFA_SLOT_COUNT) return false;
    var item = G.gongfaSlots[gi];
    var payload = gongfaSlotItemToBagPayload(item);
    if (!payload || !tryPlaceItemInBag(G, payload)) {
      notifyBagFull();
      return false;
    }
    G.gongfaSlots[gi] = null;
    R.persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  /**
   * 从储物袋装入功法栏首个空位（与装备类似，每次消耗 1 本）。
   * @param {number} bagIdx 0～11
   * @returns {boolean}
   */
  function performEquipGongfaFromBag(bagIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    R.ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var nm = String(it.name).trim();
    var cfgGf = R.lookupGongfaConfigDef(nm);
    if (!isBagItemGongfaCandidate(it, cfgGf)) return false;

    var j = findFirstEmptyGongfaSlot(G);
    if (j < 0) {
      notifyGongfaBarFull();
      return false;
    }

    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
    if (cnt < 1) return false;

    var gfObj = bagItemToGongfaBarObject(it, cfgGf);

    if (cnt > 1) {
      G.inventorySlots[bi] = R.normalizeBagItem(
        Object.assign({ name: it.name, count: cnt - 1 }, R.continuityFieldsFromBagItem(it)),
      );
    } else {
      G.inventorySlots[bi] = null;
    }

    G.gongfaSlots[j] = gfObj;
    R.persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  /** 背包格物品是否可穿戴：有佩戴部位（格子上 equipType 或配置 equipment.type）则返回栏位索引 0～2 */
  function resolveWearableSlotIndexForBagItem(it) {
    if (!it || !it.name) return null;
    var ty = it.equipType != null ? String(it.equipType).trim() : "";
    if (!ty) {
      var em = R.lookupEquipmentMetaByItemName(String(it.name).trim());
      if (!em || em.type == null || String(em.type).trim() === "") return null;
      ty = String(em.type).trim();
    }
    var C = global.MjCreationConfig;
    if (!C || typeof C.equipTypeToSlotIndex !== "function") return null;
    var si = C.equipTypeToSlotIndex(ty);
    return si == null ? null : si;
  }

  function notifyBagFull() {
    var msg = "储物袋已满，无法卸下或更换装备。";
    if (global.GameLog && typeof global.GameLog.warn === "function") global.GameLog.warn(msg);
    else window.alert(msg);
  }

  /** 佩戴栏对象 → 入袋 payload（保留 AI/表外 grade、bonus、value） */
  function equippedItemToBagPayload(item) {
    if (!item) return null;
    var nm = item.name != null ? String(item.name).trim() : "";
    if (!nm) return null;
    var o = {
      name: nm,
      count: 1,
      desc: item.desc != null ? String(item.desc) : "",
      equipType: item.equipType,
    };
    if (item.grade != null && String(item.grade).trim() !== "") o.grade = String(item.grade).trim();
    if (item.bonus && typeof item.bonus === "object" && Object.keys(item.bonus).length > 0) {
      o.bonus = Object.assign({}, item.bonus);
    }
    if (typeof item.value === "number" && isFinite(item.value)) {
      o.value = Math.max(0, Math.floor(item.value));
    }
    return o;
  }

  /** 背包格装备 → 佩戴栏对象（合并格子与装备表元数据） */
  function bagItemToEquippedObject(it, eqMeta) {
    var ty =
      it.equipType != null && String(it.equipType).trim() !== ""
        ? String(it.equipType).trim()
        : eqMeta && eqMeta.type != null
          ? String(eqMeta.type).trim()
          : "";
    var descStr = "";
    if (it.desc != null && String(it.desc).trim() !== "") descStr = String(it.desc).trim();
    else if (eqMeta && eqMeta.desc != null) descStr = String(eqMeta.desc).trim();

    var equipObj = {
      name: String(it.name).trim(),
      desc: descStr,
      equipType: ty,
    };
    if (it.grade != null && String(it.grade).trim() !== "") {
      equipObj.grade = String(it.grade).trim();
    } else if (eqMeta && eqMeta.grade != null && String(eqMeta.grade).trim() !== "") {
      equipObj.grade = String(eqMeta.grade).trim();
    }
    if (it.bonus && typeof it.bonus === "object" && Object.keys(it.bonus).length > 0) {
      equipObj.bonus = Object.assign({}, it.bonus);
    } else if (
      eqMeta &&
      eqMeta.bonus &&
      typeof eqMeta.bonus === "object" &&
      Object.keys(eqMeta.bonus).length > 0
    ) {
      equipObj.bonus = Object.assign({}, eqMeta.bonus);
    }
    if (typeof it.value === "number" && isFinite(it.value)) {
      equipObj.value = Math.max(0, Math.floor(it.value));
    } else if (eqMeta && typeof eqMeta.value === "number" && isFinite(eqMeta.value)) {
      equipObj.value = Math.floor(eqMeta.value);
    }
    return equipObj;
  }

  /**
   * 从佩戴栏卸下放入储物袋。
   * @param {number} equipIdx 0～2
   * @returns {boolean}
   */
  function performUnequipToBag(equipIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    R.ensureGameRuntimeDefaults(G);
    var ei = Number(equipIdx);
    if (!isFinite(ei) || ei < 0 || ei >= EQUIP_SLOT_COUNT) return false;
    var item = G.equippedSlots[ei];
    if (!item) return false;
    var payload = equippedItemToBagPayload(item);
    if (!payload) return false;
    if (!tryPlaceItemInBag(G, payload)) {
      notifyBagFull();
      return false;
    }
    G.equippedSlots[ei] = null;
    R.persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  /**
   * 从储物袋穿戴到对应部位；若该部位已有装备则先放入储物袋再穿戴。
   * @param {number} bagIdx 0～11
   * @returns {boolean}
   */
  function performEquipFromBag(bagIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    R.ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var slotIdx = resolveWearableSlotIndexForBagItem(it);
    if (slotIdx == null) return false;

    var prev = G.equippedSlots[slotIdx];
    if (prev && prev.name) {
      var prevPayload = equippedItemToBagPayload(prev);
      if (!prevPayload || !tryPlaceItemInBag(G, prevPayload)) {
        notifyBagFull();
        return false;
      }
    }

    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
    if (cnt < 1) return false;

    var eqMeta = R.lookupEquipmentMetaByItemName(String(it.name).trim());
    var equipObj = bagItemToEquippedObject(it, eqMeta);

    if (cnt > 1) {
      G.inventorySlots[bi] = R.normalizeBagItem(
        Object.assign({ name: it.name, count: cnt - 1 }, R.continuityFieldsFromBagItem(it)),
      );
    } else {
      G.inventorySlots[bi] = null;
    }

    G.equippedSlots[slotIdx] = equipObj;
    R.persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  function consumeOneBagItem(G, bagIdx) {
    if (!G || !Array.isArray(G.inventorySlots)) return false;
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
    if (cnt <= 1) G.inventorySlots[bi] = null;
    else {
      G.inventorySlots[bi] = R.normalizeBagItem(
        Object.assign({ name: it.name, count: cnt - 1 }, R.continuityFieldsFromBagItem(it)),
      );
    }
    return true;
  }

  function resolveRecoverFromEffects(effects) {
    if (!effects || typeof effects !== "object") return { hp: 0, mp: 0 };
    var rec = effects.recover && typeof effects.recover === "object" ? effects.recover : null;
    if (!rec) return { hp: 0, mp: 0 };
    var hpRaw =
      typeof rec.hp === "number" && isFinite(rec.hp)
        ? rec.hp
        : typeof rec.血量 === "number" && isFinite(rec.血量)
          ? rec.血量
          : 0;
    var mpRaw =
      typeof rec.mp === "number" && isFinite(rec.mp)
        ? rec.mp
        : typeof rec.法力 === "number" && isFinite(rec.法力)
          ? rec.法力
          : 0;
    return {
      hp: Math.max(0, Math.floor(hpRaw)),
      mp: Math.max(0, Math.floor(mpRaw)),
    };
  }

  function performUsePillFromBag(bagIdx) {
    var G = global.MortalJourneyGame;
    if (!G || !Array.isArray(G.inventorySlots)) return false;
    R.ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var meta = R.lookupStuffMetaByItemName(it.name);
    var fromMeta = resolveRecoverFromEffects(meta && meta.effects);
    var fromItem = resolveRecoverFromEffects(it.effects);
    var healHp = Math.max(fromMeta.hp, fromItem.hp);
    var healMp = Math.max(fromMeta.mp, fromItem.mp);
    if (healHp <= 0 && healMp <= 0) return false;

    var maxHp =
      typeof G.maxHp === "number" && isFinite(G.maxHp) && G.maxHp > 0
        ? Math.floor(G.maxHp)
        : G.playerBase && typeof G.playerBase.hp === "number" && isFinite(G.playerBase.hp)
          ? Math.max(1, Math.floor(G.playerBase.hp))
          : 1;
    var maxMp =
      typeof G.maxMp === "number" && isFinite(G.maxMp) && G.maxMp > 0
        ? Math.floor(G.maxMp)
        : G.playerBase && typeof G.playerBase.mp === "number" && isFinite(G.playerBase.mp)
          ? Math.max(1, Math.floor(G.playerBase.mp))
          : 1;
    var curHp =
      typeof G.currentHp === "number" && isFinite(G.currentHp)
        ? Math.max(0, Math.min(maxHp, Math.floor(G.currentHp)))
        : maxHp;
    var curMp =
      typeof G.currentMp === "number" && isFinite(G.currentMp)
        ? Math.max(0, Math.min(maxMp, Math.floor(G.currentMp)))
        : maxMp;
    var nextHp = Math.min(maxHp, curHp + healHp);
    var nextMp = Math.min(maxMp, curMp + healMp);
    if (nextHp === curHp && nextMp === curMp) return false;

    if (!consumeOneBagItem(G, bi)) return false;
    G.currentHp = nextHp;
    G.currentMp = nextMp;
    R.persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  function appendItemDetailActionButtons(bodyEl, actionButtons) {
    if (!bodyEl || !Array.isArray(actionButtons) || !actionButtons.length) return;
    var wrap = document.createElement("div");
    wrap.className = "mj-item-detail-actions";
    for (var b = 0; b < actionButtons.length; b++) {
      var spec = actionButtons[b];
      if (!spec || !spec.label) continue;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mj-item-detail-action-btn" + (spec.primary ? " mj-item-detail-action-btn--primary" : "");
      btn.textContent = String(spec.label);
      (function (onClick) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          if (typeof onClick === "function") onClick();
        });
      })(spec.onClick);
      wrap.appendChild(btn);
    }
    if (wrap.childNodes.length) bodyEl.appendChild(wrap);
  }

  /** 灵石修炼：数量输入 + 修炼按钮（在操作按钮区上方） */
  function appendSpiritStoneCultivateRow(bodyEl, bagIdx, maxCnt) {
    if (!bodyEl || maxCnt < 1) return;
    var row = document.createElement("div");
    row.className = "mj-item-detail-cultivate-row";
    var field = document.createElement("div");
    field.className = "mj-item-detail-cultivate-field";
    var lab = document.createElement("span");
    lab.className = "mj-item-detail-cultivate-label";
    lab.textContent = "修炼数量";
    var inp = document.createElement("input");
    inp.type = "number";
    inp.className = "mj-item-detail-cultivate-input";
    inp.min = "1";
    inp.max = String(maxCnt);
    inp.step = "any";
    inp.value = "";
    inp.placeholder = "1～" + String(maxCnt);
    inp.setAttribute("inputmode", "decimal");
    field.appendChild(lab);
    field.appendChild(inp);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mj-item-detail-action-btn mj-item-detail-action-btn--primary";
    btn.textContent = "修炼";
    btn.addEventListener("click", function () {
      var GG = global.MortalJourneyGame;
      if (!GG) return;
      var raw = parseFloat(String(inp.value).trim(), 10);
      var n = Math.round(raw);
      if (!isFinite(n) || n <= 0) return;
      if (!R.performAbsorbSpiritStonesFromBag(GG, bagIdx, false, n)) return;
      closeItemDetailModal();
    });
    row.appendChild(field);
    row.appendChild(btn);
    bodyEl.appendChild(row);
  }

  /**
   * @param {{ label: string, text: string }[]} sections
   * @param {{ label: string, primary?: boolean, onClick?: function(): void }[]} [actionButtons]
   * @param {string} [modalTraitRarity] 与天赋槽 data-rarity 一致，用于物品详情弹窗描边
   * @param {function(HTMLElement): void} [appendExtra] 在操作按钮之前追加内容（如灵石数量输入）
   */
  function openItemDetailModal(title, subtitle, sections, actionButtons, modalTraitRarity, appendExtra) {
    var root = document.getElementById("mj-item-detail-root");
    var titleEl = document.getElementById("mj-item-detail-title");
    var subEl = document.getElementById("mj-item-detail-subtitle");
    var bodyEl = document.getElementById("mj-item-detail-body");
    if (!root || !titleEl || !subEl || !bodyEl) return;
    titleEl.textContent = title || "—";
    subEl.textContent = subtitle || "";
    bodyEl.textContent = "";
    if (Array.isArray(sections)) {
      for (var i = 0; i < sections.length; i++) {
        var s = sections[i];
        if (!s) continue;
        var lab = s.label != null ? String(s.label) : "说明";
        var txt = s.text != null ? String(s.text) : "";
        if (txt === "") continue;
        appendTraitModalSection(bodyEl, lab, txt);
      }
    }
    if (typeof appendExtra === "function") appendExtra(bodyEl);
    appendItemDetailActionButtons(bodyEl, actionButtons);
    var itemPanel = root.querySelector(".mj-item-detail-panel");
    if (itemPanel) {
      itemPanel.removeAttribute("data-rarity");
      if (modalTraitRarity != null && String(modalTraitRarity).trim() !== "") {
        itemPanel.setAttribute("data-rarity", String(modalTraitRarity).trim());
      }
    }
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = root.querySelector(".mj-trait-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeItemDetailModal() {
    var root = document.getElementById("mj-item-detail-root");
    if (!root) return;
    var itemPanel = root.querySelector(".mj-item-detail-panel");
    if (itemPanel) itemPanel.removeAttribute("data-rarity");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    R.mjClearBodyOverflowIfNoModal();
  }

  function tryOpenGongfaFromSlot(slotEl) {
    var grid = document.getElementById("mj-gongfa-grid");
    if (!slotEl || !grid || !grid.contains(slotEl)) return;
    if (!slotEl.classList.contains("mj-gongfa-slot--filled")) return;
    var idx = parseInt(slotEl.getAttribute("data-gongfa-slot"), 10);
    if (isNaN(idx)) return;
    var G = global.MortalJourneyGame;
    var item = G && G.gongfaSlots && G.gongfaSlots[idx];
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var cfgDef = R.lookupGongfaConfigDef(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = cfgDef && cfgDef.desc != null ? String(cfgDef.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyShow = resolveGongfaSubtype(item, cfgDef);
    var sections = [];
    if (tyShow) sections.push({ label: "类型", text: tyShow });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    if (item.grade != null && String(item.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(item.grade).trim() });
    } else if (cfgDef && cfgDef.grade != null && String(cfgDef.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(cfgDef.grade).trim() });
    }
    var bonusLine = cfgDef && cfgDef.bonus ? formatZhBonusObject(cfgDef.bonus) : "";
    if (!bonusLine && item.bonus && typeof item.bonus === "object") {
      bonusLine = formatZhBonusObject(item.bonus);
    }
    if (bonusLine) sections.push({ label: "修炼加成", text: bonusLine });
    var gfMagLine = R.resolveGongfaMagnificationLine(name, item, cfgDef);
    if (gfMagLine) sections.push({ label: "伤害倍率", text: gfMagLine });
    var gfManaCost = R.resolveGongfaManacostLine(name, item, cfgDef);
    if (gfManaCost) sections.push({ label: "法力消耗", text: gfManaCost });
    var refNumGf =
      typeof item.value === "number" && isFinite(item.value)
        ? item.value
        : R.pickDescribeValueFromMetas(cfgDef);
    var refGf = R.formatReferenceValueFromNumber(refNumGf);
    if (refGf) sections.push({ label: "价值", text: refGf });
    openItemDetailModal(
      name,
      "功法",
      sections,
      [
        {
          label: "卸下",
          onClick: function () {
            closeItemDetailModal();
            performUnequipGongfaToBag(idx);
          },
        },
      ],
      R.resolveGongfaTraitRarity(name, item, cfgDef),
    );
  }

  function tryOpenBagSlotFromEl(slotEl) {
    var grid = document.getElementById("mj-inventory-grid");
    if (!slotEl || !grid || !grid.contains(slotEl)) return;
    var idx = parseInt(slotEl.getAttribute("data-slot"), 10);
    if (isNaN(idx)) return;
    var G = global.MortalJourneyGame;
    if (!G || !G.inventorySlots) return;
    if (!slotEl.classList.contains("mj-inventory-slot--filled")) return;
    var it = G.inventorySlots[idx];
    if (!it || !it.name) return;
    var cnt = typeof it.count === "number" ? it.count : 1;
    var stuffMeta = R.lookupStuffMetaByItemName(it.name);
    var eqMeta = R.lookupEquipmentMetaByItemName(it.name);
    var gfMeta = R.lookupGongfaConfigDef(String(it.name).trim());
    var descRuntime = it.desc != null ? String(it.desc).trim() : "";
    var descCfg =
      (stuffMeta && stuffMeta.desc != null ? String(stuffMeta.desc).trim() : "") ||
      (eqMeta && eqMeta.desc != null ? String(eqMeta.desc).trim() : "");
    var desc = descRuntime || descCfg || "";
    var sections = [];
    var isGongfaBagItem = isBagItemGongfaCandidate(it, gfMeta);
    var gongfaSubtypeText = isGongfaBagItem ? resolveGongfaSubtype(it, gfMeta) : "";
    if (isGongfaBagItem && gongfaSubtypeText) {
      sections.push({ label: "类型", text: gongfaSubtypeText });
    }
    var wearSlot = resolveWearableSlotIndexForBagItem(it);
    if (wearSlot != null) {
      var tyShow = it.equipType
        ? R.formatEquipTypeLabel(it.equipType)
        : eqMeta && eqMeta.type
          ? R.formatEquipTypeLabel(eqMeta.type)
          : EQUIP_SLOT_KIND_LABELS[wearSlot] || "装备";
      sections.push({ label: "佩戴部位", text: tyShow });
    }
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    if (stuffMeta && stuffMeta.grade != null && String(stuffMeta.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(stuffMeta.grade).trim() });
    } else if (it.grade != null && String(it.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(it.grade).trim() });
    } else if (gfMeta && gfMeta.grade != null && String(gfMeta.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(gfMeta.grade).trim() });
    }
    var bonusStuff = stuffMeta && stuffMeta.bonus ? formatStuffBonusForDisplay(stuffMeta.bonus) : "";
    if (!bonusStuff && wearSlot == null && !eqMeta && !isGongfaBagItem && it.bonus && typeof it.bonus === "object") {
      bonusStuff = formatStuffBonusForDisplay(it.bonus);
    }
    var bonusEq = eqMeta && eqMeta.bonus ? formatZhBonusObject(eqMeta.bonus) : "";
    if (!bonusEq && wearSlot != null && it.bonus && typeof it.bonus === "object") {
      bonusEq = formatZhBonusObject(it.bonus);
    }
    if (bonusStuff) sections.push({ label: "效果", text: bonusStuff });
    var pillFx =
      stuffMeta && stuffMeta.effects ? R.formatPillEffectsForUi(stuffMeta.effects) : "";
    if (!pillFx && it.effects && typeof it.effects === "object") {
      pillFx = R.formatPillEffectsForUi(it.effects);
    }
    if (pillFx) sections.push({ label: "药效", text: pillFx });
    if (bonusEq) sections.push({ label: "属性加成", text: bonusEq });
    if (isGongfaBagItem) {
      var gfBonusLine = gfMeta.bonus ? formatZhBonusObject(gfMeta.bonus) : "";
      if (!gfBonusLine && it.bonus && typeof it.bonus === "object") {
        gfBonusLine = formatZhBonusObject(it.bonus);
      }
      if (gfBonusLine) sections.push({ label: "修炼加成", text: gfBonusLine });
      var gfMagLine = R.resolveGongfaMagnificationLine(it.name, it, gfMeta);
      if (gfMagLine) sections.push({ label: "伤害倍率", text: gfMagLine });
      var gfManaCost = R.resolveGongfaManacostLine(it.name, it, gfMeta);
      if (gfManaCost) sections.push({ label: "法力消耗", text: gfManaCost });
    }
    var refNum =
      typeof it.value === "number" && isFinite(it.value)
        ? it.value
        : R.pickDescribeValueFromMetas(stuffMeta, eqMeta, gfMeta);
    var refBag = R.formatReferenceValueFromNumber(refNum);
    if (refBag) sections.push({ label: "价值", text: refBag });
    if (!isGongfaBagItem && wearSlot == null) {
      sections.push({ label: "持有数量", text: String(cnt) });
    }

    var spiritStonePerRaw = R.getSpiritStoneRawPerPiece(it.name, G.fateChoice);
    var hasSpiritStoneCult = spiritStonePerRaw > 0;
    if (hasSpiritStoneCult) {
      sections.push({
        label: "修炼",
        text: "每个灵石可提供 " + R.formatSpiritStonePointsForUi(spiritStonePerRaw) + " 点修为。",
      });
    }

    var actions = [];
    if (wearSlot != null) {
      actions.push({
        label: "穿戴",
        primary: !hasSpiritStoneCult,
        onClick: function () {
          closeItemDetailModal();
          performEquipFromBag(idx);
        },
      });
    }
    if (isGongfaBagItem) {
      actions.push({
        label: "装入功法栏",
        primary: !hasSpiritStoneCult && wearSlot == null,
        onClick: function () {
          closeItemDetailModal();
          performEquipGongfaFromBag(idx);
        },
      });
    }
    var recMeta = resolveRecoverFromEffects(stuffMeta && stuffMeta.effects);
    var recCell = resolveRecoverFromEffects(it.effects);
    var canUsePill = Math.max(recMeta.hp, recCell.hp) > 0 || Math.max(recMeta.mp, recCell.mp) > 0;
    if (canUsePill) {
      actions.push({
        label: "服用",
        primary: !hasSpiritStoneCult && wearSlot == null && !isGongfaBagItem,
        onClick: function () {
          if (!performUsePillFromBag(idx)) return;
          closeItemDetailModal();
        },
      });
    }
    if (hasSpiritStoneCult && cnt > 1) {
      actions.push({
        label: "尽数修炼",
        primary: true,
        onClick: function () {
          var GG = global.MortalJourneyGame;
          if (!GG) return;
          if (!R.performAbsorbSpiritStonesFromBag(GG, idx, true)) return;
          closeItemDetailModal();
        },
      });
    }
    var appendExtra = null;
    if (hasSpiritStoneCult) {
      var cntFloor = Math.max(1, Math.floor(typeof cnt === "number" && isFinite(cnt) ? cnt : 1));
      appendExtra = function (bodyEl) {
        appendSpiritStoneCultivateRow(bodyEl, idx, cntFloor);
      };
    }
    var kindLabel = "物品";
    if (isGongfaBagItem) kindLabel = "功法";
    else if (wearSlot != null) kindLabel = "装备";
    else if (stuffMeta && stuffMeta.type != null && String(stuffMeta.type).trim() !== "") {
      kindLabel = String(stuffMeta.type).trim();
    } else if (it.type != null && String(it.type).trim() !== "") {
      kindLabel = String(it.type).trim();
    }
    openItemDetailModal(
      String(it.name),
      kindLabel,
      sections,
      actions,
      R.resolveBagItemTraitRarity(it.name, it),
      appendExtra,
    );
  }

  function tryOpenEquipFromSlotEl(slotEl) {
    var row = document.getElementById("mj-equip-row");
    if (!slotEl || !row || !row.contains(slotEl)) return;
    if (!slotEl.classList.contains("mj-equip-slot--filled")) return;
    var idx = parseInt(slotEl.getAttribute("data-equip-slot"), 10);
    if (isNaN(idx) || idx < 0 || idx >= EQUIP_SLOT_COUNT) return;
    var G = global.MortalJourneyGame;
    var item = G && G.equippedSlots && G.equippedSlots[idx];
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var meta = R.lookupEquipmentMetaByItemName(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = meta && meta.desc != null ? String(meta.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyLabel = item.equipType
      ? R.formatEquipTypeLabel(item.equipType)
      : EQUIP_SLOT_KIND_LABELS[idx] || "装备";
    var sections = [];
    sections.push({ label: "佩戴部位", text: tyLabel });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    if (item.grade != null && String(item.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(item.grade).trim() });
    } else if (meta && meta.grade != null && String(meta.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(meta.grade).trim() });
    }
    var bonusLine = meta && meta.bonus ? formatZhBonusObject(meta.bonus) : "";
    if (!bonusLine && item.bonus && typeof item.bonus === "object") {
      bonusLine = formatZhBonusObject(item.bonus);
    }
    if (bonusLine) sections.push({ label: "属性加成", text: bonusLine });
    var magnificationLine = R.resolveEquipmentMagnificationLine(name, item, meta);
    if (magnificationLine) sections.push({ label: "伤害倍率", text: magnificationLine });
    var refNum =
      typeof item.value === "number" && isFinite(item.value)
        ? item.value
        : R.pickDescribeValueFromMetas(meta);
    var refEq = R.formatReferenceValueFromNumber(refNum);
    if (refEq) sections.push({ label: "价值", text: refEq });
    openItemDetailModal(name, "装备", sections, [
      {
        label: "卸下",
        onClick: function () {
          closeItemDetailModal();
          performUnequipToBag(idx);
        },
      },
    ], R.resolveEquipTraitRarity(name, item));
  }

  /** NPC 详情内：只读功法详情（无卸下等操作） */
  function openReadOnlyGongfaItemDetail(item) {
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var cfgDef = R.lookupGongfaConfigDef(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = cfgDef && cfgDef.desc != null ? String(cfgDef.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyShow = resolveGongfaSubtype(item, cfgDef);
    var sections = [];
    if (tyShow) sections.push({ label: "类型", text: tyShow });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    if (item.grade != null && String(item.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(item.grade).trim() });
    } else if (cfgDef && cfgDef.grade != null && String(cfgDef.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(cfgDef.grade).trim() });
    }
    var bonusLineRoGf = cfgDef && cfgDef.bonus ? formatZhBonusObject(cfgDef.bonus) : "";
    if (!bonusLineRoGf && item.bonus && typeof item.bonus === "object") {
      bonusLineRoGf = formatZhBonusObject(item.bonus);
    }
    if (bonusLineRoGf) sections.push({ label: "修炼加成", text: bonusLineRoGf });
    var gfMagLineRo = R.resolveGongfaMagnificationLine(name, item, cfgDef);
    if (gfMagLineRo) sections.push({ label: "伤害倍率", text: gfMagLineRo });
    var gfManaCostRo = R.resolveGongfaManacostLine(name, item, cfgDef);
    if (gfManaCostRo) sections.push({ label: "法力消耗", text: gfManaCostRo });
    var refNumRoGf =
      typeof item.value === "number" && isFinite(item.value)
        ? item.value
        : R.pickDescribeValueFromMetas(cfgDef);
    var refGfRo = R.formatReferenceValueFromNumber(refNumRoGf);
    if (refGfRo) sections.push({ label: "价值", text: refGfRo });
    openItemDetailModal(name, "功法", sections, [], R.resolveGongfaTraitRarity(name, item, cfgDef));
  }

  /** NPC 详情内：只读装备详情 */
  function openReadOnlyEquipItemDetail(item, slotIdx) {
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var meta = R.lookupEquipmentMetaByItemName(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = meta && meta.desc != null ? String(meta.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyLabel = item.equipType
      ? R.formatEquipTypeLabel(item.equipType)
      : EQUIP_SLOT_KIND_LABELS[slotIdx] || "装备";
    var sections = [];
    sections.push({ label: "佩戴部位", text: tyLabel });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    if (item.grade != null && String(item.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(item.grade).trim() });
    } else if (meta && meta.grade != null && String(meta.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(meta.grade).trim() });
    }
    var bonusLineRo = meta && meta.bonus ? formatZhBonusObject(meta.bonus) : "";
    if (!bonusLineRo && item.bonus && typeof item.bonus === "object") {
      bonusLineRo = formatZhBonusObject(item.bonus);
    }
    if (bonusLineRo) sections.push({ label: "属性加成", text: bonusLineRo });
    var magnificationLineRo = R.resolveEquipmentMagnificationLine(name, item, meta);
    if (magnificationLineRo) sections.push({ label: "伤害倍率", text: magnificationLineRo });
    var refNumRo =
      typeof item.value === "number" && isFinite(item.value)
        ? item.value
        : R.pickDescribeValueFromMetas(meta);
    var refEqRo = R.formatReferenceValueFromNumber(refNumRo);
    if (refEqRo) sections.push({ label: "价值", text: refEqRo });
    openItemDetailModal(name, "装备", sections, [], R.resolveEquipTraitRarity(name, item));
  }

  /**
   * NPC 详情内：只读物品详情（无穿戴/修炼）；fcForStoneEfficiency 传 { linggen } 用于灵石修为说明。
   */
  function openReadOnlyBagItemDetail(it, fcForStoneEfficiency) {
    if (!it || !it.name) return;
    var cnt = typeof it.count === "number" ? it.count : 1;
    var stuffMeta = R.lookupStuffMetaByItemName(it.name);
    var eqMeta = R.lookupEquipmentMetaByItemName(it.name);
    var gfMeta = R.lookupGongfaConfigDef(String(it.name).trim());
    var descRuntime = it.desc != null ? String(it.desc).trim() : "";
    var descCfg =
      (stuffMeta && stuffMeta.desc != null ? String(stuffMeta.desc).trim() : "") ||
      (eqMeta && eqMeta.desc != null ? String(eqMeta.desc).trim() : "");
    var desc = descRuntime || descCfg || "";
    var sections = [];
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    if (stuffMeta && stuffMeta.grade != null && String(stuffMeta.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(stuffMeta.grade).trim() });
    } else if (it.grade != null && String(it.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(it.grade).trim() });
    } else if (gfMeta && gfMeta.grade != null && String(gfMeta.grade).trim() !== "") {
      sections.push({ label: "品级", text: String(gfMeta.grade).trim() });
    }
    if (
      stuffMeta &&
      stuffMeta.type != null &&
      String(stuffMeta.type).trim() !== "" &&
      !eqMeta
    ) {
      sections.push({ label: "类型", text: String(stuffMeta.type).trim() });
    } else if (!eqMeta && it.type != null && String(it.type).trim() !== "") {
      sections.push({ label: "类型", text: String(it.type).trim() });
    }
    var wearSlot = resolveWearableSlotIndexForBagItem(it);
    if (wearSlot != null) {
      var tyShow = it.equipType
        ? R.formatEquipTypeLabel(it.equipType)
        : eqMeta && eqMeta.type
          ? R.formatEquipTypeLabel(eqMeta.type)
          : EQUIP_SLOT_KIND_LABELS[wearSlot] || "装备";
      sections.push({ label: "佩戴部位", text: tyShow });
    }
    var bonusStuff = stuffMeta && stuffMeta.bonus ? formatStuffBonusForDisplay(stuffMeta.bonus) : "";
    if (!bonusStuff && wearSlot == null && !eqMeta && it.bonus && typeof it.bonus === "object") {
      bonusStuff = formatStuffBonusForDisplay(it.bonus);
    }
    var bonusEq = eqMeta && eqMeta.bonus ? formatZhBonusObject(eqMeta.bonus) : "";
    if (!bonusEq && wearSlot != null && it.bonus && typeof it.bonus === "object") {
      bonusEq = formatZhBonusObject(it.bonus);
    }
    if (bonusStuff) sections.push({ label: "效果", text: bonusStuff });
    var pillFx =
      stuffMeta && stuffMeta.effects ? R.formatPillEffectsForUi(stuffMeta.effects) : "";
    if (!pillFx && it.effects && typeof it.effects === "object") {
      pillFx = R.formatPillEffectsForUi(it.effects);
    }
    if (pillFx) sections.push({ label: "药效", text: pillFx });
    if (bonusEq) sections.push({ label: "属性加成", text: bonusEq });
    if (wearSlot != null) {
      var magnificationBag = R.resolveEquipmentMagnificationLine(String(it.name), it, eqMeta);
      if (magnificationBag) sections.push({ label: "伤害倍率", text: magnificationBag });
    }
    if (gfMeta) {
      if (gfMeta.type != null && String(gfMeta.type).trim() !== "") {
        sections.push({ label: "功法类型", text: String(gfMeta.type).trim() });
      }
      var gfBonusLine = gfMeta.bonus ? formatZhBonusObject(gfMeta.bonus) : "";
      if (gfBonusLine) sections.push({ label: "修炼加成", text: gfBonusLine });
      var gfMagLineBag = R.resolveGongfaMagnificationLine(String(it.name), it, gfMeta);
      if (gfMagLineBag) sections.push({ label: "伤害倍率", text: gfMagLineBag });
      var gfManaCostBag = R.resolveGongfaManacostLine(String(it.name), it, gfMeta);
      if (gfManaCostBag) sections.push({ label: "法力消耗", text: gfManaCostBag });
    }
    var refNum =
      typeof it.value === "number" && isFinite(it.value)
        ? it.value
        : R.pickDescribeValueFromMetas(stuffMeta, eqMeta, gfMeta);
    var refBag = R.formatReferenceValueFromNumber(refNum);
    if (refBag) sections.push({ label: "价值", text: refBag });
    sections.push({ label: "持有数量", text: String(cnt) });

    var spiritStonePerRaw = R.getSpiritStoneRawPerPiece(it.name, fcForStoneEfficiency);
    if (spiritStonePerRaw > 0) {
      sections.push({
        label: "修炼",
        text:
          "每个灵石可提供约 " +
          R.formatSpiritStonePointsForUi(spiritStonePerRaw) +
          " 点修为（按该角色灵根折算，仅作说明）。",
      });
    }

    openItemDetailModal(
      String(it.name),
      "物品",
      sections,
      [],
      R.resolveBagItemTraitRarity(it.name, it),
      null,
    );
  }

  function tryOpenNpcDetailSubInspect(fromEl) {
    var root = document.getElementById("mj-npc-detail-root");
    var npc = root && root._mjNpcInspect;
    if (!npc || !fromEl) return;
    var body = document.getElementById("mj-npc-detail-body");
    if (!body || !body.contains(fromEl)) return;

    var tSlot = fromEl.closest(".mj-trait-slot--filled");
    if (tSlot && body.contains(tSlot) && tSlot.hasAttribute("data-trait-slot")) {
      var tIdx = parseInt(tSlot.getAttribute("data-trait-slot"), 10);
      if (!isNaN(tIdx) && npc.traits && npc.traits[tIdx] && npc.traits[tIdx].name) {
        openTraitDetailModal(npc.traits[tIdx]);
      }
      return;
    }

    var eqSlot = fromEl.closest(".mj-equip-slot--filled");
    if (eqSlot && body.contains(eqSlot) && eqSlot.hasAttribute("data-equip-slot")) {
      var eqIdx = parseInt(eqSlot.getAttribute("data-equip-slot"), 10);
      var eit = npc.equippedSlots && npc.equippedSlots[eqIdx];
      if (eit && (eit.name != null || eit.label)) {
        openReadOnlyEquipItemDetail(eit, eqIdx);
      }
      return;
    }

    var gfSlot = fromEl.closest(".mj-inventory-slot.mj-gongfa-slot--filled");
    if (gfSlot && body.contains(gfSlot) && gfSlot.hasAttribute("data-gongfa-slot")) {
      var gi = parseInt(gfSlot.getAttribute("data-gongfa-slot"), 10);
      var git = npc.gongfaSlots && npc.gongfaSlots[gi];
      if (git) openReadOnlyGongfaItemDetail(git);
      return;
    }

    var bagSlot = fromEl.closest(".mj-inventory-slot.mj-inventory-slot--filled");
    if (bagSlot && body.contains(bagSlot) && bagSlot.hasAttribute("data-slot")) {
      if (bagSlot.hasAttribute("data-gongfa-slot")) return;
      var bi = parseInt(bagSlot.getAttribute("data-slot"), 10);
      var bit = npc.inventorySlots && npc.inventorySlots[bi];
      if (bit && bit.name) {
        var fcLike =
          npc.linggen != null && String(npc.linggen).trim() !== ""
            ? { linggen: String(npc.linggen) }
            : null;
        openReadOnlyBagItemDetail(bit, fcLike);
      }
    }
  }

  var _gongfaBagDetailUiBound = false;

  function bindGongfaBagDetailUi() {
    if (_gongfaBagDetailUiBound) return;
    _gongfaBagDetailUiBound = true;
    var itemRoot = document.getElementById("mj-item-detail-root");
    if (itemRoot) {
      itemRoot.querySelectorAll("[data-mj-item-detail-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          closeItemDetailModal();
        });
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var rMajor = document.getElementById("mj-major-breakthrough-root");
      if (rMajor && !rMajor.classList.contains("hidden")) {
        R.closeMajorBreakthroughModal();
        ev.preventDefault();
        return;
      }
      var rItem = document.getElementById("mj-item-detail-root");
      if (rItem && !rItem.classList.contains("hidden")) {
        closeItemDetailModal();
        ev.preventDefault();
      }
    });
    var gf = document.getElementById("mj-gongfa-grid");
    if (gf) {
      gf.addEventListener("click", function (e) {
        tryOpenGongfaFromSlot(e.target.closest(".mj-inventory-slot"));
      });
      gf.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-inventory-slot");
        if (!slot || !gf.contains(slot)) return;
        if (!slot.classList.contains("mj-gongfa-slot--filled")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenGongfaFromSlot(slot);
      });
    }
    var bag = document.getElementById("mj-inventory-grid");
    if (bag) {
      bag.addEventListener("click", function (e) {
        tryOpenBagSlotFromEl(e.target.closest(".mj-inventory-slot"));
      });
      bag.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-inventory-slot");
        if (!slot || !bag.contains(slot)) return;
        if (slot.classList.contains("mj-inventory-slot--empty")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenBagSlotFromEl(slot);
      });
    }
    var equipRow = document.getElementById("mj-equip-row");
    if (equipRow) {
      equipRow.addEventListener("click", function (e) {
        tryOpenEquipFromSlotEl(e.target.closest(".mj-equip-slot"));
      });
      equipRow.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-equip-slot");
        if (!slot || !equipRow.contains(slot)) return;
        if (!slot.classList.contains("mj-equip-slot--filled")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenEquipFromSlotEl(slot);
      });
    }
  }

  function appendTraitModalSection(bodyEl, label, text) {
    if (text == null || String(text).trim() === "") return;
    var sec = document.createElement("div");
    sec.className = "mj-trait-modal-section";
    var k = document.createElement("span");
    k.className = "mj-trait-modal-k";
    k.textContent = label;
    var v = document.createElement("div");
    v.className = "mj-trait-modal-v";
    v.textContent = String(text);
    sec.appendChild(k);
    sec.appendChild(v);
    bodyEl.appendChild(sec);
  }

  function openTraitDetailModal(t) {
    var root = document.getElementById("mj-trait-detail-root");
    var titleEl = document.getElementById("mj-trait-modal-title");
    var rarityEl = document.getElementById("mj-trait-modal-rarity");
    var bodyEl = document.getElementById("mj-trait-modal-body");
    if (!root || !titleEl || !rarityEl || !bodyEl || !t || !t.name) return;
    titleEl.textContent = t.name;
    rarityEl.textContent = t.rarity ? "品质：" + t.rarity : "";
    bodyEl.textContent = "";
    appendTraitModalSection(bodyEl, "简述", t.desc);
    appendTraitModalSection(bodyEl, "效果", t.effects);
    if (t.item != null && String(t.item).trim() !== "" && String(t.item) !== "无") {
      appendTraitModalSection(bodyEl, "关联物品", t.item);
    }
    var modalPanel = root.querySelector(".mj-trait-modal");
    if (modalPanel) {
      modalPanel.removeAttribute("data-rarity");
      if (t.rarity) modalPanel.setAttribute("data-rarity", String(t.rarity));
    }
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = root.querySelector(".mj-trait-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeTraitDetailModal() {
    var root = document.getElementById("mj-trait-detail-root");
    if (!root) return;
    var modalPanel = root.querySelector(".mj-trait-modal");
    if (modalPanel) modalPanel.removeAttribute("data-rarity");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    R.mjClearBodyOverflowIfNoModal();
  }

  function tryOpenTraitFromSlotEl(slot) {
    var row = document.getElementById("mj-talent-row");
    if (!slot || !row || !row.contains(slot)) return;
    if (!slot.classList.contains("mj-trait-slot--filled")) return;
    var idx = parseInt(slot.getAttribute("data-trait-slot"), 10);
    if (isNaN(idx)) return;
    var G = global.MortalJourneyGame;
    var fc = G && G.fateChoice;
    var traits = fc && Array.isArray(fc.traits) ? fc.traits : [];
    var t = traits[idx];
    if (t && t.name) openTraitDetailModal(t);
  }

  var _traitModalUiBound = false;

  function bindTraitDetailModalUi() {
    if (_traitModalUiBound) return;
    _traitModalUiBound = true;
    var root = document.getElementById("mj-trait-detail-root");
    if (root) {
      root.querySelectorAll("[data-mj-trait-modal-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          closeTraitDetailModal();
        });
      });
    }
    document.addEventListener("keydown", function (ev) {
      var r = document.getElementById("mj-trait-detail-root");
      if (ev.key === "Escape" && r && !r.classList.contains("hidden")) closeTraitDetailModal();
    });
    var row = document.getElementById("mj-talent-row");
    if (row) {
      row.addEventListener("click", function (e) {
        var slot = e.target.closest(".mj-trait-slot");
        tryOpenTraitFromSlotEl(slot);
      });
      row.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var slot = e.target.closest(".mj-trait-slot");
        if (!slot || !row.contains(slot)) return;
        if (!slot.classList.contains("mj-trait-slot--filled")) return;
        if (e.key === " ") e.preventDefault();
        tryOpenTraitFromSlotEl(slot);
      });
    }
  }

  /** 年龄/寿元下方五个天赋槽，数据来自 fateChoice.traits（逆天改命） */
  function renderTalentSlots(fc) {
    var row = document.getElementById("mj-talent-row");
    if (!row) return;
    var nodes = row.querySelectorAll("[data-trait-slot]");
    var traits = fc && Array.isArray(fc.traits) ? fc.traits : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var inner = el.querySelector(".mj-trait-slot-inner");
      var t = traits[i];
      el.removeAttribute("data-rarity");
      if (t && t.name) {
        el.className = "mj-trait-slot mj-trait-slot--filled";
        if (t.rarity) el.setAttribute("data-rarity", String(t.rarity));
        if (inner) inner.textContent = String(t.name);
        el.setAttribute("title", R.buildTraitSlotTooltip(t));
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "查看天赋：" + String(t.name));
      } else {
        el.className = "mj-trait-slot mj-trait-slot--empty";
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        if (inner) inner.textContent = "—";
        el.setAttribute("title", "空槽");
      }
    }
  }

  function renderEquipSlots(G) {
    R.ensureEquippedSlots(G);
    var row = document.getElementById("mj-equip-row");
    if (!row || !G || !G.equippedSlots) return;
    for (var i = 0; i < EQUIP_SLOT_COUNT; i++) {
      var el = row.querySelector('[data-equip-slot="' + i + '"]');
      if (!el) continue;
      var nameEl = el.querySelector(".mj-equip-slot-name");
      var item = G.equippedSlots[i];
      var label = item && (item.name != null ? item.name : item.label);
      if (label) {
        el.classList.remove("mj-equip-slot--empty");
        el.classList.add("mj-equip-slot--filled");
        if (nameEl) nameEl.textContent = String(label);
        var tip = "";
        if (item.equipType) {
          var tyRaw = String(item.equipType);
          var tyShow =
            tyRaw === "副武器" ? "法器" : tyRaw === "主武器" ? "武器" : tyRaw;
          tip += tyShow + "：";
        }
        tip += String(label);
        if (item.desc) tip += "\n" + String(item.desc);
        tip += "\n（点击查看详情）";
        el.setAttribute("title", tip);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "查看装备：" + String(label));
        R.setSlotRarityDataAttr(el, R.resolveEquipTraitRarity(String(label), item));
      } else {
        el.classList.add("mj-equip-slot--empty");
        el.classList.remove("mj-equip-slot--filled");
        if (nameEl) nameEl.textContent = "—";
        el.setAttribute("title", EQUIP_SLOT_EMPTY_TITLE[i] || "空位");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        R.setSlotRarityDataAttr(el, null);
      }
    }
  }

  function renderLeftPanel(fc, G) {
    if (G) R.ensureGameRuntimeDefaults(G);
    if (
      G &&
      fc &&
      global.PlayerBaseRuntime &&
      typeof global.PlayerBaseRuntime.applyToGame === "function"
    ) {
      try {
        global.PlayerBaseRuntime.applyToGame(G, fc);
      } catch (pbrErr) {
        console.warn("[主界面] PlayerBaseRuntime.applyToGame 失败", pbrErr);
      }
    }

    var worldEl = document.getElementById("mj-world-time");
    if (worldEl) worldEl.textContent = (G && G.worldTimeString) || DEFAULT_WORLD_TIME;

    var locEl = document.getElementById("mj-current-location");
    if (locEl) {
      var locStr = "";
      if (G && G.currentLocation != null && String(G.currentLocation).trim() !== "") {
        locStr = String(G.currentLocation).trim();
      } else if (fc && fc.birthLocation != null && String(fc.birthLocation).trim() !== "") {
        locStr = String(fc.birthLocation).split("|")[0].trim();
      }
      locEl.textContent = locStr || "—";
    }

    var realmEl = document.getElementById("mj-realm-line");
    if (realmEl) realmEl.textContent = formatRealmLine(fc, G);
    var playerNameVerticalEl = document.getElementById("mj-player-name-vertical");
    if (playerNameVerticalEl) {
      var pname =
        fc && fc.playerName != null && String(fc.playerName).trim() !== ""
          ? String(fc.playerName).trim()
          : "韩立";
      playerNameVerticalEl.textContent = pname;
      playerNameVerticalEl.setAttribute("aria-label", "主角姓名：" + pname);
      playerNameVerticalEl.setAttribute("title", pname);
    }

    var cultFill = document.getElementById("mj-cultivation-bar-fill");
    var cultBar = document.getElementById("mj-cultivation-bar");
    var cultTxt = document.getElementById("mj-cultivation-pct-text");
    var cultCtx = R.computeCultivationUi(G, fc);
    if (G) G.cultivationProgress = cultCtx.pct;
    var cultLabel =
      cultCtx.req != null && cultCtx.req > 0
        ? Math.round(cultCtx.displayCur) + " / " + Math.round(cultCtx.req)
        : Math.round(cultCtx.cur) + " / —";
    R.setBarFill(cultFill, cultBar, cultCtx.pct, cultTxt, cultLabel);
    if (cultBar && cultCtx.req != null && cultCtx.req > 0 && cultCtx.cur > cultCtx.req) {
      cultBar.setAttribute(
        "title",
        "本阶段修为已足，当前累计 " + Math.round(cultCtx.cur) + "（可突破后计入下阶段）",
      );
    } else if (cultBar) cultBar.removeAttribute("title");

    var brBtn = document.getElementById("mj-major-breakthrough-btn");
    if (brBtn) {
      var mctx = R.getMajorBreakthroughReadyContext(G, fc);
      if (mctx) {
        brBtn.classList.remove("hidden");
        brBtn.setAttribute("aria-hidden", "false");
      } else {
        brBtn.classList.add("hidden");
        brBtn.setAttribute("aria-hidden", "true");
      }
    }

    var hpFill = document.getElementById("mj-hp-bar-fill");
    var hpBar = document.getElementById("mj-hp-bar");
    var hpTxt = document.getElementById("mj-hp-text");
    var mpFill = document.getElementById("mj-mp-bar-fill");
    var mpBar = document.getElementById("mj-mp-bar");
    var mpTxt = document.getElementById("mj-mp-text");

    if (G && G.playerBase && G.maxHp != null && G.maxMp != null) {
      var curH = typeof G.currentHp === "number" ? G.currentHp : G.maxHp;
      var curM = typeof G.currentMp === "number" ? G.currentMp : G.maxMp;
      var pctH = G.maxHp > 0 ? (curH / G.maxHp) * 100 : 0;
      var pctM = G.maxMp > 0 ? (curM / G.maxMp) * 100 : 0;
      R.setBarFill(hpFill, hpBar, pctH, hpTxt, Math.round(curH) + " / " + Math.round(G.maxHp));
      R.setBarFill(mpFill, mpBar, pctM, mpTxt, Math.round(curM) + " / " + Math.round(G.maxMp));
    } else {
      R.setBarFill(hpFill, hpBar, 0, hpTxt, "— / —");
      R.setBarFill(mpFill, mpBar, 0, mpTxt, "— / —");
    }

    var genderEl = document.getElementById("mj-stat-gender");
    var lingEl = document.getElementById("mj-stat-linggen");
    var ageEl = document.getElementById("mj-stat-age");
    var syEl = document.getElementById("mj-stat-shouyuan");
    if (genderEl) genderEl.textContent = (fc && fc.gender) || "—";
    if (lingEl) lingEl.textContent = R.formatLinggenPanelText(fc && fc.linggen);
    if (ageEl) ageEl.textContent = G && G.age != null ? String(G.age) : "—";
    if (syEl) {
      syEl.textContent =
        G && G.shouyuan != null && isFinite(G.shouyuan) ? String(Math.round(G.shouyuan)) : "—";
      var rSy = (fc && fc.realm) || (G && G.realm) || {};
      var majSy =
        rSy.major != null && String(rSy.major).trim() !== "" ? String(rSy.major).trim() : "练气";
      var minSy =
        rSy.minor != null && String(rSy.minor).trim() !== "" ? String(rSy.minor).trim() : "初期";
      var RSy = global.RealmState;
      var syRow = RSy && typeof RSy.getShouyuanRow === "function" ? RSy.getShouyuanRow(majSy, minSy) : null;
      if (syRow && syRow.note) {
        var stageBit = syRow.stage != null && String(syRow.stage) !== "" ? String(syRow.stage) : "";
        syEl.setAttribute(
          "title",
          majSy + stageBit + " 寿元参考 " + syRow.shouyuan + " 岁：" + syRow.note,
        );
      } else {
        syEl.removeAttribute("title");
      }
    }

    renderTalentSlots(fc);

    var pb = G && G.playerBase;
    var patkEl = document.getElementById("mj-stat-patk");
    var pdefEl = document.getElementById("mj-stat-pdef");
    var matkEl = document.getElementById("mj-stat-matk");
    var mdefEl = document.getElementById("mj-stat-mdef");
    var senseEl = document.getElementById("mj-stat-sense");
    var footEl = document.getElementById("mj-stat-foot");
    var charmEl = document.getElementById("mj-stat-charm");
    var luckEl = document.getElementById("mj-stat-luck");
    if (patkEl) patkEl.textContent = pb ? R.numOrDash(pb.patk) : "—";
    if (pdefEl) pdefEl.textContent = pb ? R.numOrDash(pb.pdef) : "—";
    if (matkEl) matkEl.textContent = pb ? R.numOrDash(pb.matk) : "—";
    if (mdefEl) mdefEl.textContent = pb ? R.numOrDash(pb.mdef) : "—";
    if (senseEl) senseEl.textContent = pb ? R.numOrDash(pb.sense) : "—";
    if (footEl) footEl.textContent = pb ? R.numOrDash(pb.foot) : "—";
    if (charmEl) {
      var ch = pb && typeof pb.charm === "number" ? pb.charm : G && G.charm;
      charmEl.textContent = R.numOrDash(ch);
    }
    if (luckEl) {
      var lk = pb && typeof pb.luck === "number" ? pb.luck : G && G.luck;
      luckEl.textContent = R.numOrDash(lk);
    }

    var img = document.getElementById("mj-player-avatar");
    var ph = document.getElementById("mj-player-avatar-placeholder");
    var url = G && G.avatarUrl;
    if (img && ph) {
      if (url) {
        img.src = url;
        img.classList.remove("hidden");
        ph.classList.add("hidden");
      } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        ph.classList.remove("hidden");
      }
    }

    renderEquipSlots(G);
    renderGongfaSlots(G);
    renderBagSlots(G);
    R.renderNearbyNpcsPanel(G);
  }
  global.MjMainScreenPanel = Object.assign({}, R, {
    bindTraitDetailModalUi: bindTraitDetailModalUi,
    bindGongfaBagDetailUi: bindGongfaBagDetailUi,
    tryOpenNpcDetailSubInspect: tryOpenNpcDetailSubInspect,
    renderInventorySlots: renderInventorySlots,
    renderGongfaGrid: renderGongfaGrid,
    renderLeftPanel: renderLeftPanel,
    renderBootstrapOverview: renderBootstrapOverview,
    renderBagSlots: renderBagSlots,
    performEquipGongfaFromBag: performEquipGongfaFromBag,
    performUnequipGongfaToBag: performUnequipGongfaToBag,
    performEquipFromBag: performEquipFromBag,
    performUnequipToBag: performUnequipToBag,
    findFirstEmptyBagSlot: findFirstEmptyBagSlot,
  });
})(typeof window !== "undefined" ? window : globalThis);
