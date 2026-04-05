/**
 * 主界面面板（一）：境界、灵石与大境界突破、存档、NPC 列表与详情、背包规范化。
 * 全局：MjMainScreenPanelRealm；MjMainScreenPanel 由 mainScreen_panel_inventory_ui.js 组装。
 */
(function (global) {
  "use strict";

  function callPanelRenderLeftIfReady(fc, G) {
    var P = global.MjMainScreenPanel;
    if (P && typeof P.renderLeftPanel === "function") P.renderLeftPanel(fc, G);
  }
  function callPanelRenderBagIfReady(G) {
    var P = global.MjMainScreenPanel;
    if (P && typeof P.renderBagSlots === "function") P.renderBagSlots(G);
  }

  var STORAGE_KEY = "mortal_journey_bootstrap_v1";
  var SAVE_INDEX_KEY = "MJ_SAVES_INDEX_V1";
  var SAVE_PREFIX = "MJ_SAVE_V1:";
  var ACTIVE_SAVE_ID_KEY = "MJ_ACTIVE_SAVE_ID_V1";
  var DEFAULT_WORLD_TIME = "0001年 01月 01日 08:00";
  var DEFAULT_AGE = 16;
  var DEFAULT_SHOUYUAN = 100;
  var DEFAULT_CHARM = 10;
  var DEFAULT_LUCK = 10;
  var INVENTORY_SLOT_COUNT = 12;
  /** 主角储物袋每行 4 格；满且需入货时整行扩容，可滚动浏览 */
  var INVENTORY_GRID_COLS = 4;
  /**
   * 储物袋中禁止与同名格合并堆叠的物品（每件独立占格，如每颗妖兽内丹来源不同）。
   * tryPlaceItemInBag 须跳过同名累加；ensureInventorySlots 会将旧存档中的堆叠拆格。
   */
  var BAG_UNIQUE_STACK_ITEM_NAMES = { 妖兽内丹: true };
  function bagItemSkipsSameNameStack(itemName) {
    var nm = itemName != null ? String(itemName).trim() : "";
    return nm !== "" && BAG_UNIQUE_STACK_ITEM_NAMES[nm] === true;
  }
  /** 功法栏固定 2×4，共 8 格（不需要滚动框） */
  var GONGFA_SLOT_COUNT = 8;
  /** 佩戴栏固定 4 格：武器、法器、防具、载具 */
  var EQUIP_SLOT_COUNT = 4;
  var EQUIP_SLOT_EMPTY_TITLE = ["武器空位", "法器空位", "防具空位", "载具空位"];
  var EQUIP_SLOT_KIND_LABELS = ["武器", "法器", "防具", "载具"];

  function clampPct(n) {
    if (typeof n !== "number" || !isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function mjClearBodyOverflowIfNoModal() {
    var traitRoot = document.getElementById("mj-trait-detail-root");
    var itemRoot = document.getElementById("mj-item-detail-root");
    var npcRoot = document.getElementById("mj-npc-detail-root");
    var majorRoot = document.getElementById("mj-major-breakthrough-root");
    var bagSellRoot = document.getElementById("mj-bag-sell-root");
    if (
      (!traitRoot || traitRoot.classList.contains("hidden")) &&
      (!itemRoot || itemRoot.classList.contains("hidden")) &&
      (!npcRoot || npcRoot.classList.contains("hidden")) &&
      (!majorRoot || majorRoot.classList.contains("hidden")) &&
      (!bagSellRoot || bagSellRoot.classList.contains("hidden"))
    ) {
      document.body.style.overflow = "";
    }
  }

  /**
   * 是否可用灵石炼化修为：仅 stuff_describe 中 MjDescribeSpiritStones 表内物品（及旧名「灵石」）。
   * 令牌、丹药等也有 describe.value（灵石等价比价），不可炼化。
   */
  function isSpiritStoneCultivationItemName(itemName) {
    var nm = String(itemName || "").trim();
    if (!nm) return false;
    if (nm === "灵石") return true;
    var SS = global.MjDescribeSpiritStones;
    return !!(SS && typeof SS === "object" && SS[nm]);
  }

  /** 灵石类 describe.value → 表列「单灵根」基准修为（原样返回；炼化写入修为时用 computeSpiritStoneTotalGain 四舍五入） */
  function getSpiritStoneCultivationValue(itemName) {
    var nm = String(itemName || "").trim();
    if (!nm) return 0;
    if (!isSpiritStoneCultivationItemName(nm)) return 0;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getStuffDescribe !== "function") return 0;
    var d = C.getStuffDescribe(nm);
    if (d && typeof d.value === "number" && isFinite(d.value) && d.value > 0) return d.value;
    if (nm === "灵石") {
      var d2 = C.getStuffDescribe("下品灵石");
      if (d2 && typeof d2.value === "number" && isFinite(d2.value) && d2.value > 0) return d2.value;
    }
    return 0;
  }

  /**
   * 命运抉择灵根串中的五行种数（金木水火土去重）；「无灵根」等为 0。
   */
  function getLinggenRawElementCount(fc) {
    var lg = fc && fc.linggen != null ? String(fc.linggen) : "";
    var LS = global.LinggenState;
    if (!LS || typeof LS.parseElements !== "function") return 0;
    return LS.parseElements(lg).length;
  }

  /**
   * 灵石单件修为相对表列基准的比例（以表列 10 为参照：单/无 100%，双 85%，三 65%，四及以上 50%）。
   * @param {number} effN 参与折算的种数（无灵根时调用方应传入 1，与单灵根同满额）
   */
  function getSpiritStoneEfficiencyFactorForRootCount(effN) {
    var n = typeof effN === "number" && isFinite(effN) ? Math.floor(effN) : 1;
    if (n <= 1) return 1;
    if (n === 2) return 0.5;
    if (n === 3) return 0.33;
    return 0.25;
  }

  /** 表列基准 × 灵根系数（未四舍五入）；写入修为见 computeSpiritStoneTotalGain。 */
  function getSpiritStoneRawPerPiece(itemName, fc) {
    var base = getSpiritStoneCultivationValue(itemName);
    if (base <= 0) return 0;
    var rawN = getLinggenRawElementCount(fc);
    var effN = rawN <= 0 ? 1 : rawN;
    var f = getSpiritStoneEfficiencyFactorForRootCount(effN);
    return base * f;
  }

  /** 修为点数展示：整数不显示小数，否则最多两位并去尾零（如 2.5、3.3）。 */
  function formatSpiritStonePointsForUi(x) {
    if (typeof x !== "number" || !isFinite(x) || x <= 0) return "";
    var t = Math.round(x * 100) / 100;
    if (Math.abs(t - Math.round(t)) < 1e-9) return String(Math.round(t));
    var s = t.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  /** 本批灵石炼化总修为：round(表列基准 × 灵根系数 × 件数)；写入 G.xiuwei 前仅此函数对修为增量四舍五入。 */
  function computeSpiritStoneTotalGain(base, linggenFactor, pieceCount) {
    var b = typeof base === "number" && isFinite(base) ? base : 0;
    var f = typeof linggenFactor === "number" && isFinite(linggenFactor) ? linggenFactor : 0;
    var n = typeof pieceCount === "number" && isFinite(pieceCount) ? Math.max(0, Math.floor(pieceCount)) : 0;
    if (b <= 0 || f <= 0 || n <= 0) return 0;
    return Math.round(b * f * n);
  }

  /** 当前修为、本阶段需求、进度条百分比（0～100，已满封顶）；displayCur 用于「当前/需求」文案，不超过本阶段需求 */
  function computeCultivationUi(G, fc) {
    var r = (G && G.realm) || (fc && fc.realm) || {};
    var major = r.major || "";
    var minor = r.minor;
    var RS = global.RealmState;
    var req =
      RS && typeof RS.getCultivationRequired === "function"
        ? RS.getCultivationRequired(major, minor)
        : null;
    var cur = G && typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.max(0, Math.floor(G.xiuwei)) : 0;
    var pct = 0;
    if (req != null && req > 0) pct = (cur / req) * 100;
    var displayCur = req != null && req > 0 ? Math.min(cur, req) : cur;
    return { cur: cur, req: req, pct: clampPct(pct), displayCur: displayCur };
  }

  function getNextMinorStage(minor) {
    var SS = global.RealmState && global.RealmState.SUB_STAGES;
    if (!SS || !SS.length) return null;
    var m = String(minor == null ? "" : minor).trim();
    for (var i = 0; i < SS.length - 1; i++) {
      if (SS[i] === m) return SS[i + 1];
    }
    return null;
  }

  function getNextMajorRealm(major) {
    var RO = global.RealmState && global.RealmState.REALM_ORDER;
    if (!RO || !RO.length) return null;
    var maj = String(major == null ? "" : major).trim();
    for (var j = 0; j < RO.length - 1; j++) {
      if (RO[j] === maj) return RO[j + 1];
    }
    return null;
  }

  /**
   * 按境界寿元表抬升 G.shouyuan：max(当前值, 表列该阶段寿元)。剧情可先提高寿元，突破不会压低；表来自 RealmState。
   */
  function syncShouyuanFromRealmState(G, fc) {
    if (!G) return;
    var RS = global.RealmState;
    if (!RS || typeof RS.getShouyuanForRealm !== "function") {
      if (G.shouyuan == null || typeof G.shouyuan !== "number" || !isFinite(G.shouyuan)) {
        G.shouyuan = DEFAULT_SHOUYUAN;
      }
      return;
    }
    var r = (G.realm) || (fc && fc.realm) || {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minor = r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    var cap = RS.getShouyuanForRealm(major, minor);
    if (cap == null || !isFinite(cap)) {
      if (G.shouyuan == null || typeof G.shouyuan !== "number" || !isFinite(G.shouyuan)) {
        G.shouyuan = DEFAULT_SHOUYUAN;
      }
      return;
    }
    cap = Math.max(0, Math.floor(cap));
    var cur = typeof G.shouyuan === "number" && isFinite(G.shouyuan) ? Math.floor(G.shouyuan) : 0;
    G.shouyuan = Math.max(cur, cap);
  }

  /** 周围 NPC：与主角相同规则，寿元不低于境界表参考（剧情可更高，不会压低） */
  function syncNpcShouyuanFromRealmState(npc) {
    if (!npc || typeof npc !== "object") return;
    var RS = global.RealmState;
    if (!RS || typeof RS.getShouyuanForRealm !== "function") return;
    var r = npc.realm && typeof npc.realm === "object" ? npc.realm : {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minorRaw =
      r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    var cap =
      major === "化神"
        ? RS.getShouyuanForRealm(major)
        : RS.getShouyuanForRealm(major, minorRaw);
    if (cap == null || !isFinite(cap)) return;
    cap = Math.max(0, Math.floor(cap));
    var cur = typeof npc.shouyuan === "number" && isFinite(npc.shouyuan) ? Math.floor(npc.shouyuan) : 0;
    npc.shouyuan = Math.max(cur, cap);
  }

  /**
   * 大境界前「后期」修为不得超过本阶段需求（否则会出现 1100/1000）；突破成功前不能靠灵石继续堆。
   * @returns {number|null} 上限修为，非此情形返回 null
   */
  function getLateStageMajorBottleneckXiuweiCap(G, fc) {
    if (!G) return null;
    var RS = global.RealmState;
    if (!RS || typeof RS.getCultivationRequired !== "function") return null;
    var r = (G && G.realm) || (fc && fc.realm) || {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minor = r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    if (major === "化神") return null;
    if (minor !== "后期") return null;
    var req = RS.getCultivationRequired(major, minor);
    if (req == null || req <= 0) return null;
    return req;
  }

  function clampXiuweiToLateStageCapIfNeeded(G, fc) {
    var cap = getLateStageMajorBottleneckXiuweiCap(G, fc != null ? fc : G && G.fateChoice);
    if (cap == null) return;
    var X = typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.floor(G.xiuwei) : 0;
    if (X > cap) G.xiuwei = cap;
  }

  /**
   * 模拟修为经小境界连环突破后的结果（不写回 G；遇大境界卡点同 applyRealmBreakthroughs）。
   * @returns {{ xiuwei: number, major: string, minor: string }}
   */
  function simulateSmallBreakthroughsFromState(fc, xiuwei, major, minor) {
    var RS = global.RealmState;
    var maj =
      major != null && String(major).trim() !== "" ? String(major).trim() : "练气";
    var min =
      minor != null && String(minor).trim() !== "" ? String(minor).trim() : "初期";
    var X = typeof xiuwei === "number" && isFinite(xiuwei) ? Math.floor(xiuwei) : 0;
    if (!RS || typeof RS.getCultivationRequired !== "function") {
      return { xiuwei: Math.max(0, X), major: maj, minor: min };
    }
    var guard = 0;
    while (guard++ < 48) {
      if (maj === "化神") break;
      var req = RS.getCultivationRequired(maj, min);
      if (req == null || req <= 0) break;
      if (X < req) break;
      var nextMinor = getNextMinorStage(min);
      if (nextMinor != null) {
        X = X - req;
        min = nextMinor;
        continue;
      }
      if (min !== "后期") break;
      if (getNextMajorRealm(maj) == null) break;
      break;
    }
    return { xiuwei: Math.max(0, Math.floor(X)), major: maj, minor: min };
  }

  /** 灵石炼化后、经小境界突破并卡在后期时，修为是否未超过本阶段上限（增量 = round(base×系数×件数)） */
  function spiritStoneGainWithinLateStageCap(fc, curXiuwei, major, minor, stoneBase, linggenFactor, stoneCount) {
    if (stoneCount <= 0) return true;
    var add = computeSpiritStoneTotalGain(stoneBase, linggenFactor, stoneCount);
    if (add <= 0) return false;
    var sim = simulateSmallBreakthroughsFromState(fc, curXiuwei + add, major, minor);
    if (sim.major === "化神") return true;
    if (sim.minor !== "后期") return true;
    var RS = global.RealmState;
    if (!RS || typeof RS.getCultivationRequired !== "function") return true;
    var req = RS.getCultivationRequired(sim.major, sim.minor);
    if (req == null || req <= 0) return true;
    return sim.xiuwei <= req;
  }

  /**
   * 尽数修炼等：先按小境界连环突破模拟终点，再限制「后期」不得超过本阶段 req（含从中期一吸顶满的情况）。
   * @returns {number} 实际可消耗件数
   */
  function clampSpiritStoneUseNForLateStageCap(G, fc, stoneBase, linggenFactor, useN) {
    if (!G || stoneBase <= 0 || linggenFactor <= 0 || useN <= 0) return 0;
    var r = (G && G.realm) || (fc && fc.realm) || {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minor = r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    var cur = typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.floor(G.xiuwei) : 0;
    if (!spiritStoneGainWithinLateStageCap(fc, cur, major, minor, stoneBase, linggenFactor, useN)) {
      var lo = 0;
      var hi = useN;
      var best = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (spiritStoneGainWithinLateStageCap(fc, cur, major, minor, stoneBase, linggenFactor, mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    }
    return useN;
  }
  function syncLateStageBreakSuffixState(G, fc) {
    if (!G) return;
    if (!G.lateStageBreakSuffix || typeof G.lateStageBreakSuffix !== "object") {
      G.lateStageBreakSuffix = { realmKey: "", failCount: 0 };
    }
    var r = (G && G.realm) || (fc && fc.realm) || {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minor = r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    var currentKey = "";
    if (major !== "化神" && minor === "后期") {
      currentKey = major + "|" + minor;
    }
    if (G.lateStageBreakSuffix.realmKey !== currentKey) {
      G.lateStageBreakSuffix.realmKey = currentKey;
      G.lateStageBreakSuffix.failCount = 0;
    }
  }

  function bumpLateStageBreakFailCount(G, fc) {
    if (!G) return;
    syncLateStageBreakSuffixState(G, fc);
    if (!G.lateStageBreakSuffix || !G.lateStageBreakSuffix.realmKey) return;
    var n = G.lateStageBreakSuffix.failCount;
    G.lateStageBreakSuffix.failCount =
      (typeof n === "number" && isFinite(n) ? Math.max(0, Math.floor(n)) : 0) + 1;
  }
  /** 大境界失败时剩余修为 = 当前 × 该系数（即损失 30%） */
  var MAJOR_BREAK_FAIL_XIUWEI_FACTOR = 0.7;
  var majorBreakModalSlots = [null, null, null];

  function majorBreakPropertyKey(fromRealm, toRealm) {
    return String(fromRealm || "").trim() + "-" + String(toRealm || "").trim() + "概率";
  }

  function getPillBreakthroughBonusDelta(itemName, fromRealm, toRealm) {
    var nm = String(itemName || "").trim();
    if (!nm) return 0;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getStuffDescribe !== "function") return 0;
    var d = C.getStuffDescribe(nm);
    if (!d) return 0;
    var fromS = String(fromRealm || "").trim();
    var toS = String(toRealm || "").trim();
    if (d.effects && Array.isArray(d.effects.breakthrough)) {
      for (var i = 0; i < d.effects.breakthrough.length; i++) {
        var b = d.effects.breakthrough[i];
        if (!b) continue;
        if (String(b.from || "").trim() === fromS && String(b.to || "").trim() === toS) {
          var c = b.chanceBonus;
          return typeof c === "number" && isFinite(c) ? Math.max(0, c) : 0;
        }
      }
      return 0;
    }
    if (d.property && typeof d.property === "object") {
      var k = majorBreakPropertyKey(fromRealm, toRealm);
      var v = d.property[k];
      return typeof v === "number" && isFinite(v) ? Math.max(0, v) : 0;
    }
    return 0;
  }

  /** 背包详情：丹药 effects → 可读文本 */
  function formatPillEffectsForUi(eff) {
    if (!eff || typeof eff !== "object") return "";
    var lines = [];
    if (eff.recover && typeof eff.recover === "object") {
      var parts = [];
      if (typeof eff.recover.hp === "number" && eff.recover.hp > 0) {
        parts.push("生命 +" + Math.floor(eff.recover.hp));
      }
      if (typeof eff.recover.mp === "number" && eff.recover.mp > 0) {
        parts.push("法力 +" + Math.floor(eff.recover.mp));
      }
      if (parts.length) lines.push(parts.join("，"));
    }
    if (Array.isArray(eff.breakthrough)) {
      for (var j = 0; j < eff.breakthrough.length; j++) {
        var br = eff.breakthrough[j];
        if (!br) continue;
        var add = typeof br.chanceBonus === "number" && isFinite(br.chanceBonus) ? br.chanceBonus : 0;
        if (add <= 0) continue;
        var pct = (Math.round(add * 10000) / 100).toString();
        lines.push(
          "大境界「" + String(br.from || "") + "→" + String(br.to || "") + "」突破成功率 +" + pct + "%",
        );
      }
    }
    return lines.join("\n");
  }

  /**
   * 当前是否处于「后期修为已满、可尝试下一跳大境界」
   * @returns {{ major: string, minor: string, nextMaj: string, req: number, baseP: number } | null}
   */
  function getMajorBreakthroughReadyContext(G, fc) {
    if (!G) return null;
    var RS = global.RealmState;
    if (!RS || typeof RS.getCultivationRequired !== "function") return null;
    var r = (G && G.realm) || (fc && fc.realm) || {};
    var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
    var minor = r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";
    if (major === "化神") return null;
    if (minor !== "后期") return null;
    var req = RS.getCultivationRequired(major, minor);
    if (req == null || req <= 0) return null;
    var X = typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.floor(G.xiuwei) : 0;
    if (X < req) return null;
    var nextMaj = getNextMajorRealm(major);
    if (nextMaj == null) return null;
    var baseP =
      typeof RS.getMajorBreakthroughChance === "function" ? RS.getMajorBreakthroughChance(major, nextMaj) : null;
    if (baseP == null || baseP <= 0) return null;
    return { major: major, minor: minor, nextMaj: nextMaj, req: req, baseP: baseP };
  }

  function consumeOneFromInventorySlot(G, bagIdx) {
    if (!G || !G.inventorySlots) return false;
    ensureInventorySlots(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= G.inventorySlots.length) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
    if (cnt <= 1) G.inventorySlots[bi] = null;
    else {
      G.inventorySlots[bi] = normalizeBagItem(
        Object.assign({ name: it.name, count: cnt - 1 }, continuityFieldsFromBagItem(it)),
      );
    }
    return true;
  }

  function writeRealmToGameAndFate(G, fc, major, minor) {
    if (!G) return;
    if (!G.realm || typeof G.realm !== "object") G.realm = {};
    G.realm.major = major;
    G.realm.minor = minor;
    if (fc && typeof fc === "object") {
      if (!fc.realm || typeof fc.realm !== "object") fc.realm = {};
      fc.realm.major = major;
      fc.realm.minor = minor;
    }
  }

  /**
   * 小境界：修为 ≥ 本阶段需求则直接进阶并扣除需求。
   * 大境界：须在左栏「突破」弹窗内手动掷骰；此处遇「后期」且修为已满则不再自动处理（避免偷跑）。
   * 应在修为变化后或读档后调用；勿在每次 renderLeftPanel 调用。
   * @returns {{ changed: boolean, messages: string[] }}
   */
  function applyRealmBreakthroughs(G) {
    var msgs = [];
    if (!G) return { changed: false, messages: msgs };
    var RS = global.RealmState;
    if (!RS || typeof RS.getCultivationRequired !== "function") return { changed: false, messages: msgs };
    var fc = G.fateChoice;
    if (!fc) return { changed: false, messages: msgs };

    var changed = false;
    var guard = 0;
    while (guard++ < 48) {
      var r = (G && G.realm) || (fc && fc.realm) || {};
      var major = r.major != null && String(r.major).trim() !== "" ? String(r.major).trim() : "练气";
      var minor = r.minor != null && String(r.minor).trim() !== "" ? String(r.minor).trim() : "初期";

      if (major === "化神") break;

      var req = RS.getCultivationRequired(major, minor);
      if (req == null || req <= 0) break;

      var X = typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.floor(G.xiuwei) : 0;
      if (X < req) break;

      var nextMinor = getNextMinorStage(minor);
      if (nextMinor != null) {
        G.xiuwei = X - req;
        writeRealmToGameAndFate(G, fc, major, nextMinor);
        changed = true;
        msgs.push("突破成功：已达「" + major + nextMinor + "」");
        continue;
      }

      if (minor !== "后期") break;

      var nextMaj = getNextMajorRealm(major);
      if (nextMaj == null) break;

      break;
    }

    G.xiuwei = Math.max(0, Math.floor(G.xiuwei));
    return { changed: changed, messages: msgs };
  }

  function logBreakthroughMessages(msgs) {
    if (!msgs || !msgs.length) return;
    var line = msgs.join("；");
    if (global.GameLog && typeof global.GameLog.info === "function") {
      global.GameLog.info("[境界突破] " + line);
    } else {
      console.info("[境界突破]", line);
    }
  }

  function computeMajorBreakModalTotalP(ctx) {
    if (!ctx) return 0;
    var add = 0;
    for (var i = 0; i < majorBreakModalSlots.length; i++) {
      var s = majorBreakModalSlots[i];
      if (!s || s.name == null) continue;
      add += getPillBreakthroughBonusDelta(s.name, ctx.major, ctx.nextMaj);
    }
    return Math.min(1, ctx.baseP + add);
  }

  function syncMajorBreakthroughModalUI(ctx) {
    var G = global.MortalJourneyGame;
    var fc = G && G.fateChoice;
    var c = ctx || getMajorBreakthroughReadyContext(G, fc);
    var chanceEl = document.getElementById("mj-major-break-chance");
    if (chanceEl && c) {
      var p = computeMajorBreakModalTotalP(c);
      chanceEl.textContent = "突破概率：" + (Math.round(p * 10000) / 100).toString() + "%";
    }
    for (var si = 0; si < 3; si++) {
      var el = document.getElementById("mj-major-break-slot-" + si);
      if (!el) continue;
      var s = majorBreakModalSlots[si];
      var nameEl = el.querySelector(".mj-major-break-slot-name");
      if (nameEl) nameEl.textContent = s && s.name ? String(s.name) : "空";
      el.classList.toggle("mj-major-break-slot--filled", !!(s && s.name));
    }
  }

  function closeMajorBreakthroughModal() {
    var root = document.getElementById("mj-major-breakthrough-root");
    if (!root) return;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    var pick = document.getElementById("mj-major-break-pick");
    if (pick) {
      pick.classList.add("hidden");
      pick.innerHTML = "";
    }
    mjClearBodyOverflowIfNoModal();
  }

  function openMajorBreakthroughModal() {
    var G = global.MortalJourneyGame;
    var fc = G && G.fateChoice;
    var ctx = getMajorBreakthroughReadyContext(G, fc);
    if (!ctx) return;
    majorBreakModalSlots = [null, null, null];
    var root = document.getElementById("mj-major-breakthrough-root");
    var subEl = document.getElementById("mj-major-break-subtitle");
    var pick = document.getElementById("mj-major-break-pick");
    if (!root) return;
    if (subEl) subEl.textContent = "「" + ctx.major + "」→「" + ctx.nextMaj + "」";
    if (pick) {
      pick.classList.add("hidden");
      pick.innerHTML = "";
    }
    syncMajorBreakthroughModalUI(ctx);
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  /** 突破弹窗里，除 excludeSlotIndex 外已占用同一背包格的次数（防止 2 颗却占 3 格） */
  function countMajorBreakModalUsesOfBagIdx(excludeSlotIndex, bagIdx) {
    var bi = Number(bagIdx);
    if (!isFinite(bi)) return 0;
    var n = 0;
    for (var j = 0; j < majorBreakModalSlots.length; j++) {
      if (j === excludeSlotIndex) continue;
      var s = majorBreakModalSlots[j];
      if (s && Number(s.bagIdx) === bi) n++;
    }
    return n;
  }

  function showMajorBreakPillPickList(slotIndex) {
    var G = global.MortalJourneyGame;
    var fc = G && G.fateChoice;
    var ctx = getMajorBreakthroughReadyContext(G, fc);
    var pick = document.getElementById("mj-major-break-pick");
    if (!pick || !ctx) return;
    pick.innerHTML = "";
    pick.classList.remove("hidden");
    var hint = document.createElement("div");
    hint.className = "mj-major-break-pick-hint";
    hint.textContent = "选择放入本格的丹药（须对「" + ctx.major + "→" + ctx.nextMaj + "」有效）：";
    pick.appendChild(hint);
    var found = 0;
    ensureInventorySlots(G);
    for (var b = 0; b < G.inventorySlots.length; b++) {
      var it = G.inventorySlots[b];
      if (!it || !it.name) continue;
      var bonus = getPillBreakthroughBonusDelta(it.name, ctx.major, ctx.nextMaj);
      if (bonus <= 0) continue;
      var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
      var reserved = countMajorBreakModalUsesOfBagIdx(slotIndex, b);
      var avail = cnt - reserved;
      if (avail <= 0) continue;
      found++;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mj-major-break-pick-btn";
      var pctAdd = (Math.round(bonus * 10000) / 100).toString();
      btn.textContent =
        it.name +
        " 可用 ×" +
        avail +
        (reserved > 0 ? "（本窗已占 " + reserved + "，格 " + (b + 1) + "）" : "（格 " + (b + 1) + "）") +
        "，+" +
        pctAdd +
        "%";
      (function (bagIdx, pillName, si) {
        btn.addEventListener("click", function () {
          var itClick = G.inventorySlots[bagIdx];
          var cap =
            itClick && typeof itClick.count === "number" && isFinite(itClick.count)
              ? Math.max(1, Math.floor(itClick.count))
              : 1;
          if (countMajorBreakModalUsesOfBagIdx(si, bagIdx) >= cap) return;
          majorBreakModalSlots[si] = { bagIdx: bagIdx, name: pillName };
          pick.classList.add("hidden");
          pick.innerHTML = "";
          syncMajorBreakthroughModalUI(null);
        });
      })(b, String(it.name).trim(), slotIndex);
      pick.appendChild(btn);
    }
    if (!found) {
      var empty = document.createElement("div");
      empty.className = "mj-major-break-pick-empty";
      empty.textContent =
        "没有可放入本格的丹药（储物袋无对应丹药，或其余两格已占满该格堆叠）。";
      pick.appendChild(empty);
    }
  }

  function performMajorBreakthroughRollFromModal() {
    var G = global.MortalJourneyGame;
    var fc = G && G.fateChoice;
    if (!G || !fc) return;
    var ctx = getMajorBreakthroughReadyContext(G, fc);
    if (!ctx) {
      closeMajorBreakthroughModal();
      return;
    }
    ensureGameRuntimeDefaults(G);
    var needByBag = {};
    for (var i = 0; i < majorBreakModalSlots.length; i++) {
      var s = majorBreakModalSlots[i];
      if (!s) continue;
      var bi = Number(s.bagIdx);
      if (!isFinite(bi) || bi < 0 || bi >= G.inventorySlots.length) {
        logBreakthroughMessages(["大境界突破取消：丹药格配置无效。"]);
        return;
      }
      var it = G.inventorySlots[bi];
      if (!it || String(it.name).trim() !== String(s.name).trim()) {
        logBreakthroughMessages(["大境界突破取消：储物袋与所选丹药不一致。"]);
        return;
      }
      var bonus = getPillBreakthroughBonusDelta(it.name, ctx.major, ctx.nextMaj);
      if (bonus <= 0) {
        logBreakthroughMessages(["大境界突破取消：「" + it.name + "」对当前进阶无效。"]);
        return;
      }
      needByBag[bi] = (needByBag[bi] || 0) + 1;
    }
    for (var k in needByBag) {
      var idx = Number(k);
      var it2 = G.inventorySlots[idx];
      var c2 = it2 && typeof it2.count === "number" && isFinite(it2.count) ? Math.max(1, Math.floor(it2.count)) : 1;
      if (!it2 || c2 < needByBag[k]) {
        logBreakthroughMessages(["大境界突破取消：丹药数量不足。"]);
        return;
      }
    }
    var pRoll = computeMajorBreakModalTotalP(ctx);
    var RS = global.RealmState;
    if (!RS || typeof RS.rollBreakthroughWithProbability !== "function") {
      closeMajorBreakthroughModal();
      return;
    }

    var pillPlaced = false;
    for (var pi = 0; pi < majorBreakModalSlots.length; pi++) {
      if (majorBreakModalSlots[pi]) {
        pillPlaced = true;
        break;
      }
    }
    if (pillPlaced) {
      var invBeforeRoll = JSON.parse(JSON.stringify(G.inventorySlots));
      var consumePillsOk = true;
      for (var j = 0; j < majorBreakModalSlots.length; j++) {
        var sj = majorBreakModalSlots[j];
        if (!sj) continue;
        if (!consumeOneFromInventorySlot(G, sj.bagIdx)) {
          consumePillsOk = false;
          break;
        }
      }
      if (!consumePillsOk) {
        G.inventorySlots = invBeforeRoll;
        logBreakthroughMessages(["大境界突破异常：扣除丹药失败，已回滚背包。"]);
        closeMajorBreakthroughModal();
        persistBootstrapSnapshot();
        callPanelRenderLeftIfReady(fc, G);
        callPanelRenderBagIfReady(G);
        return;
      }
    }

    var ok = RS.rollBreakthroughWithProbability(pRoll);
    var X2 = typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.floor(G.xiuwei) : 0;
    if (ok) {
      G.xiuwei = Math.max(0, X2 - ctx.req);
      writeRealmToGameAndFate(G, fc, ctx.nextMaj, "初期");
      var br = applyRealmBreakthroughs(G);
      var msgOk = ["大境界突破成功：已进入「" + ctx.nextMaj + "初期」"];
      if (br.messages && br.messages.length) msgOk = msgOk.concat(br.messages);
      logBreakthroughMessages(msgOk);
    } else {
      G.xiuwei = Math.max(0, Math.floor(X2 * MAJOR_BREAK_FAIL_XIUWEI_FACTOR));
      var pctStr = (Math.round(pRoll * 10000) / 100).toString();
      var failParts = [
        "大境界突破失败：「" + ctx.major + "」→「" + ctx.nextMaj + "」（成功率 " + pctStr + "%）",
        "修为受挫，修炼进度损失约三成",
      ];
      if (pillPlaced) failParts.push("所选丹药已在突破中消耗");
      logBreakthroughMessages([failParts.join("；") + "。"]);
      bumpLateStageBreakFailCount(G, fc);
    }
    closeMajorBreakthroughModal();
    var ui = computeCultivationUi(G, fc);
    G.cultivationProgress = ui.pct;
    persistBootstrapSnapshot();
    callPanelRenderLeftIfReady(fc, G);
    callPanelRenderBagIfReady(G);
  }

  var majorBreakUiBound = false;
  function bindMajorBreakthroughUi() {
    if (majorBreakUiBound) return;
    majorBreakUiBound = true;
    var brBtn = document.getElementById("mj-major-breakthrough-btn");
    if (brBtn) {
      brBtn.addEventListener("click", function () {
        openMajorBreakthroughModal();
      });
    }
    var root = document.getElementById("mj-major-breakthrough-root");
    if (root) {
      root.querySelectorAll("[data-mj-major-break-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          closeMajorBreakthroughModal();
        });
      });
    }
    var confirmBtn = document.getElementById("mj-major-break-confirm");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        performMajorBreakthroughRollFromModal();
      });
    }
    for (var s = 0; s < 3; s++) {
      var slot = document.getElementById("mj-major-break-slot-" + s);
      if (!slot) continue;
      (function (idx) {
        slot.addEventListener("click", function () {
          var GG = global.MortalJourneyGame;
          if (!getMajorBreakthroughReadyContext(GG, GG && GG.fateChoice)) return;
          var cur = majorBreakModalSlots[idx];
          if (cur && cur.name) {
            majorBreakModalSlots[idx] = null;
            var pick = document.getElementById("mj-major-break-pick");
            if (pick) {
              pick.classList.add("hidden");
              pick.innerHTML = "";
            }
            syncMajorBreakthroughModalUI(null);
            return;
          }
          showMajorBreakPillPickList(idx);
        });
      })(s);
    }
  }

  function persistBootstrapSnapshot() {
    try {
      var G = global.MortalJourneyGame;
      if (!G || !G.fateChoice) return;
      ensureGameRuntimeDefaults(G);
      var ls = G.lateStageBreakSuffix;
      var lbSnap = null;
      if (G.lastBattleResult && typeof G.lastBattleResult === "object") {
        try {
          lbSnap = JSON.parse(JSON.stringify(G.lastBattleResult));
        } catch (_lbE) {
          lbSnap = null;
        }
      }
      var data = {
        fateChoice: G.fateChoice,
        startedAt: G.startedAt || 0,
        xiuwei: typeof G.xiuwei === "number" ? G.xiuwei : 0,
        shouyuan: typeof G.shouyuan === "number" && isFinite(G.shouyuan) ? Math.floor(G.shouyuan) : 0,
        age: typeof G.age === "number" && isFinite(G.age) ? Math.floor(G.age) : DEFAULT_AGE,
        worldTimeString:
          typeof G.worldTimeString === "string" && G.worldTimeString.trim() !== ""
            ? String(G.worldTimeString)
            : null,
        currentLocation:
          G.currentLocation != null && String(G.currentLocation).trim() !== ""
            ? String(G.currentLocation)
            : null,
        maxHp: typeof G.maxHp === "number" && isFinite(G.maxHp) ? G.maxHp : null,
        maxMp: typeof G.maxMp === "number" && isFinite(G.maxMp) ? G.maxMp : null,
        currentHp: typeof G.currentHp === "number" && isFinite(G.currentHp) ? G.currentHp : null,
        currentMp: typeof G.currentMp === "number" && isFinite(G.currentMp) ? G.currentMp : null,
        cultivationProgress:
          typeof G.cultivationProgress === "number" && isFinite(G.cultivationProgress)
            ? G.cultivationProgress
            : null,
        storyBattleContextConsumed:
          typeof G.storyBattleContextConsumed === "boolean" ? G.storyBattleContextConsumed : null,
        lastBattleResult: lbSnap,
        inventorySlots: JSON.parse(JSON.stringify(G.inventorySlots)),
        gongfaSlots: JSON.parse(JSON.stringify(G.gongfaSlots || [])),
        equippedSlots: JSON.parse(JSON.stringify(G.equippedSlots || [])),
        chatHistory: JSON.parse(JSON.stringify(Array.isArray(G.chatHistory) ? G.chatHistory : [])),
        chatPlotSnapshot:
          G.chatPlotSnapshot != null && String(G.chatPlotSnapshot).trim() !== ""
            ? String(G.chatPlotSnapshot).trim()
            : null,
        chatPlotSnapshotLog: Array.isArray(G.chatPlotSnapshotLog)
          ? JSON.parse(JSON.stringify(G.chatPlotSnapshotLog))
          : null,
        lateStageBreakSuffix:
          ls && typeof ls === "object"
            ? {
                realmKey: String(ls.realmKey != null ? ls.realmKey : ""),
                failCount: Math.max(0, Math.floor(Number(ls.failCount) || 0)),
              }
            : { realmKey: "", failCount: 0 },
        nearbyNpcs: JSON.parse(JSON.stringify(Array.isArray(G.nearbyNpcs) ? G.nearbyNpcs : [])),
        chatActionSuggestions: (function () {
          var cas = G.chatActionSuggestions;
          if (!cas || typeof cas !== "object") return null;
          var a = cas.aggressive != null ? String(cas.aggressive).trim() : "";
          var n = cas.neutral != null ? String(cas.neutral).trim() : "";
          var c = cas.cautious != null ? String(cas.cautious).trim() : "";
          var v = cas.veryCautious != null ? String(cas.veryCautious).trim() : "";
          if (!a && !n && !c && !v) return null;
          return { aggressive: a, neutral: n, cautious: c, veryCautious: v };
        })(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));

      // 同步到本地存档（若存在激活存档ID）
      var saveId = "";
      try {
        saveId = sessionStorage.getItem(ACTIVE_SAVE_ID_KEY) || localStorage.getItem(ACTIVE_SAVE_ID_KEY) || "";
      } catch (_e0) {
        saveId = "";
      }
      if (saveId) {
        try {
          localStorage.setItem(ACTIVE_SAVE_ID_KEY, String(saveId));
          localStorage.setItem(
            SAVE_PREFIX + String(saveId),
            JSON.stringify(Object.assign({ saveId: String(saveId), updatedAt: Date.now() }, data)),
          );
          // 更新索引时间
          var rawIdx = localStorage.getItem(SAVE_INDEX_KEY);
          var idx = rawIdx ? JSON.parse(rawIdx) : [];
          if (!Array.isArray(idx)) idx = [];
          var found = false;
          for (var i = 0; i < idx.length; i++) {
            if (idx[i] && String(idx[i].id || "") === String(saveId)) {
              idx[i].updatedAt = Date.now();
              if (!idx[i].createdAt) idx[i].createdAt = idx[i].updatedAt;
              found = true;
              break;
            }
          }
          if (!found) {
            idx.unshift({ id: String(saveId), name: String(saveId), createdAt: Date.now(), updatedAt: Date.now() });
          }
          localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(idx));
        } catch (_e1) {
          /* 忽略 */
        }
      }
    } catch (e) {
      console.warn("[主界面] 存档缓存写入失败", e);
    }
  }

  /**
   * 消耗背包格中的灵石类物品增加修为：总修为 = round(表列基准 × 灵根系数 × 件数)；无灵根同单灵根满额系数。
   * @param {boolean} consumeAll 是否消耗该格全部堆叠（与 customCount 二选一）
   * @param {number} [customCount] 指定件数：四舍五入，与当前堆叠取较小值；≤0 不执行
   * @returns {boolean}
   */
  function performAbsorbSpiritStonesFromBag(G, bagIdx, consumeAll, customCount) {
    if (!G || !G.inventorySlots) return false;
    ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= G.inventorySlots.length) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var stoneBase = getSpiritStoneCultivationValue(it.name);
    if (stoneBase <= 0) return false;
    var rawN = getLinggenRawElementCount(G.fateChoice);
    var effN = rawN <= 0 ? 1 : rawN;
    var lingF = getSpiritStoneEfficiencyFactorForRootCount(effN);
    if (lingF <= 0) return false;
    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
    var useN;
    if (typeof customCount === "number" && isFinite(customCount)) {
      useN = Math.round(customCount);
      if (useN <= 0) return false;
      useN = Math.min(cnt, useN);
    } else {
      useN = consumeAll ? cnt : 1;
    }
    useN = clampSpiritStoneUseNForLateStageCap(G, G.fateChoice, stoneBase, lingF, useN);
    if (useN <= 0) return false;
    var gain = computeSpiritStoneTotalGain(stoneBase, lingF, useN);
    if (gain <= 0) return false;
    G.xiuwei = (typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? G.xiuwei : 0) + gain;
    var left = cnt - useN;
    if (left <= 0) G.inventorySlots[bi] = null;
    else {
      G.inventorySlots[bi] = normalizeBagItem(
        Object.assign({ name: it.name, count: left }, continuityFieldsFromBagItem(it)),
      );
    }
    var br = applyRealmBreakthroughs(G);
    clampXiuweiToLateStageCapIfNeeded(G, G.fateChoice);
    logBreakthroughMessages(br.messages);
    var ui = computeCultivationUi(G, G.fateChoice);
    G.cultivationProgress = ui.pct;
    persistBootstrapSnapshot();
    callPanelRenderLeftIfReady(G.fateChoice, G);
    return true;
  }
  function restoreBootstrap() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      // 若 sessionStorage 缺失（刷新/重新打开），尝试从最后激活存档恢复
      if (!raw) {
        try {
          var sid = localStorage.getItem(ACTIVE_SAVE_ID_KEY) || "";
          if (sid) {
            var sraw = localStorage.getItem(SAVE_PREFIX + String(sid));
            if (sraw) {
              raw = sraw;
              sessionStorage.setItem(STORAGE_KEY, String(raw));
              sessionStorage.setItem(ACTIVE_SAVE_ID_KEY, String(sid));
            }
          }
        } catch (_e2) {
          /* 忽略 */
        }
      }
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.fateChoice) return null;

      global.MortalJourneyGame = global.MortalJourneyGame || {};
      var fc = data.fateChoice;
      global.MortalJourneyGame.fateChoice = fc;
      global.MortalJourneyGame.startedAt = data.startedAt || 0;
      global.MortalJourneyGame.playerBase = fc.playerBase ? Object.assign({}, fc.playerBase) : null;
      global.MortalJourneyGame.rawRealmBase = fc.rawRealmBase ? Object.assign({}, fc.rawRealmBase) : null;
      global.MortalJourneyGame.realm = fc.realm ? Object.assign({}, fc.realm) : null;

      var C = global.MjCreationConfig;
      var invOk =
        data.inventorySlots &&
        Array.isArray(data.inventorySlots) &&
        data.inventorySlots.length >= INVENTORY_SLOT_COUNT;
      var gfOk = data.gongfaSlots && Array.isArray(data.gongfaSlots) && data.gongfaSlots.length >= GONGFA_SLOT_COUNT;
      if (invOk) {
        global.MortalJourneyGame.inventorySlots = JSON.parse(JSON.stringify(data.inventorySlots));
      } else if (fc.birth && C && typeof C.buildStartingInventorySlots === "function") {
        global.MortalJourneyGame.inventorySlots = JSON.parse(
          JSON.stringify(C.buildStartingInventorySlots(fc.birth)),
        );
      }
      if (gfOk) {
        global.MortalJourneyGame.gongfaSlots = JSON.parse(JSON.stringify(data.gongfaSlots.slice(0, GONGFA_SLOT_COUNT)));
      } else if (fc.birth && C && typeof C.buildStartingGongfaSlots === "function") {
        global.MortalJourneyGame.gongfaSlots = JSON.parse(JSON.stringify(C.buildStartingGongfaSlots(fc.birth)));
      }

      var eqOk =
        data.equippedSlots &&
        Array.isArray(data.equippedSlots) &&
        data.equippedSlots.length >= EQUIP_SLOT_COUNT;
      if (eqOk) {
        global.MortalJourneyGame.equippedSlots = JSON.parse(
          JSON.stringify(data.equippedSlots.slice(0, EQUIP_SLOT_COUNT)),
        );
      } else if (fc.birth && C && typeof C.buildStartingEquippedSlots === "function") {
        global.MortalJourneyGame.equippedSlots = JSON.parse(
          JSON.stringify(C.buildStartingEquippedSlots(fc.birth)),
        );
      }

      if (typeof data.xiuwei === "number" && isFinite(data.xiuwei)) {
        global.MortalJourneyGame.xiuwei = Math.max(0, Math.floor(data.xiuwei));
      }

      if (typeof data.shouyuan === "number" && isFinite(data.shouyuan)) {
        global.MortalJourneyGame.shouyuan = Math.max(0, Math.floor(data.shouyuan));
      }
      if (typeof data.age === "number" && isFinite(data.age)) {
        global.MortalJourneyGame.age = Math.max(0, Math.floor(data.age));
      }

      if (typeof data.worldTimeString === "string" && data.worldTimeString.trim() !== "") {
        global.MortalJourneyGame.worldTimeString = String(data.worldTimeString);
      }
      if (data.currentLocation != null && String(data.currentLocation).trim() !== "") {
        global.MortalJourneyGame.currentLocation = String(data.currentLocation);
      }
      if (typeof data.maxHp === "number" && isFinite(data.maxHp) && data.maxHp > 0) {
        global.MortalJourneyGame.maxHp = Math.floor(data.maxHp);
      }
      if (typeof data.maxMp === "number" && isFinite(data.maxMp) && data.maxMp > 0) {
        global.MortalJourneyGame.maxMp = Math.floor(data.maxMp);
      }
      if (typeof data.currentHp === "number" && isFinite(data.currentHp)) {
        global.MortalJourneyGame.currentHp = data.currentHp;
      }
      if (typeof data.currentMp === "number" && isFinite(data.currentMp)) {
        global.MortalJourneyGame.currentMp = data.currentMp;
      }
      if (typeof data.cultivationProgress === "number" && isFinite(data.cultivationProgress)) {
        global.MortalJourneyGame.cultivationProgress = Math.max(
          0,
          Math.min(1, data.cultivationProgress),
        );
      }
      if (typeof data.storyBattleContextConsumed === "boolean") {
        global.MortalJourneyGame.storyBattleContextConsumed = data.storyBattleContextConsumed;
      }
      if (data.lastBattleResult != null && typeof data.lastBattleResult === "object") {
        try {
          global.MortalJourneyGame.lastBattleResult = JSON.parse(JSON.stringify(data.lastBattleResult));
        } catch (_lbR) {
          global.MortalJourneyGame.lastBattleResult = null;
        }
      }

      if (data.lateStageBreakSuffix && typeof data.lateStageBreakSuffix === "object") {
        global.MortalJourneyGame.lateStageBreakSuffix = {
          realmKey: String(data.lateStageBreakSuffix.realmKey != null ? data.lateStageBreakSuffix.realmKey : ""),
          failCount: Math.max(0, Math.floor(Number(data.lateStageBreakSuffix.failCount) || 0)),
        };
      }

      if (Array.isArray(data.nearbyNpcs)) {
        global.MortalJourneyGame.nearbyNpcs = JSON.parse(JSON.stringify(data.nearbyNpcs));
      }

      if (Array.isArray(data.chatHistory)) {
        global.MortalJourneyGame.chatHistory = JSON.parse(JSON.stringify(data.chatHistory));
      }

      if (data.chatPlotSnapshot != null && String(data.chatPlotSnapshot).trim() !== "") {
        global.MortalJourneyGame.chatPlotSnapshot = String(data.chatPlotSnapshot).trim();
      } else {
        global.MortalJourneyGame.chatPlotSnapshot = "";
      }

      if (Array.isArray(data.chatPlotSnapshotLog) && data.chatPlotSnapshotLog.length) {
        global.MortalJourneyGame.chatPlotSnapshotLog = data.chatPlotSnapshotLog
          .map(function (x) {
            return x != null ? String(x).trim() : "";
          })
          .filter(function (s) {
            return s !== "";
          });
      } else if (
        global.MortalJourneyGame.chatPlotSnapshot != null &&
        String(global.MortalJourneyGame.chatPlotSnapshot).trim() !== ""
      ) {
        global.MortalJourneyGame.chatPlotSnapshotLog = [String(global.MortalJourneyGame.chatPlotSnapshot).trim()];
      } else {
        global.MortalJourneyGame.chatPlotSnapshotLog = [];
      }

      if (data.chatActionSuggestions && typeof data.chatActionSuggestions === "object") {
        var dca = data.chatActionSuggestions.aggressive != null ? String(data.chatActionSuggestions.aggressive).trim() : "";
        var dcn = data.chatActionSuggestions.neutral != null ? String(data.chatActionSuggestions.neutral).trim() : "";
        var dcc = data.chatActionSuggestions.cautious != null ? String(data.chatActionSuggestions.cautious).trim() : "";
        var dcv = data.chatActionSuggestions.veryCautious != null ? String(data.chatActionSuggestions.veryCautious).trim() : "";
        if (dca || dcn || dcc || dcv) {
          global.MortalJourneyGame.chatActionSuggestions = {
            aggressive: dca,
            neutral: dcn,
            cautious: dcc,
            veryCautious: dcv,
          };
        }
      }

      return fc;
    } catch (e) {
      console.warn("[主界面] 无法读取开局存档", e);
      return null;
    }
  }

  /**
   * 运行时字段（世界时间、进度、血蓝当前值、年龄寿元等），后续剧情可改此对象并重新 renderLeftPanel
   */
  function ensureGameRuntimeDefaults(G) {
    if (!G) return;
    if (G.worldTimeString == null || G.worldTimeString === "") {
      G.worldTimeString = DEFAULT_WORLD_TIME;
    }
    if (G.xiuwei == null || typeof G.xiuwei !== "number" || !isFinite(G.xiuwei)) {
      G.xiuwei = 0;
    }
    G.xiuwei = Math.max(0, Math.floor(G.xiuwei));
    clampXiuweiToLateStageCapIfNeeded(G, G.fateChoice);
    if (G.cultivationProgress == null || typeof G.cultivationProgress !== "number") {
      G.cultivationProgress = 0;
    }
    if (G.age == null) G.age = DEFAULT_AGE;
    if (G.shouyuan == null || typeof G.shouyuan !== "number" || !isFinite(G.shouyuan)) G.shouyuan = 0;
    syncShouyuanFromRealmState(G, G.fateChoice);
    if (G.charm == null || typeof G.charm !== "number") G.charm = DEFAULT_CHARM;
    if (G.luck == null || typeof G.luck !== "number") G.luck = DEFAULT_LUCK;

    var pb = G.playerBase;
    if (pb && typeof pb.hp === "number" && typeof pb.mp === "number") {
      if (G.maxHp == null) G.maxHp = Math.max(1, pb.hp);
      if (G.currentHp == null) G.currentHp = pb.hp;
      if (G.maxMp == null) G.maxMp = Math.max(1, pb.mp);
      if (G.currentMp == null) G.currentMp = pb.mp;
    }
    if (typeof G.maxHp === "number" && isFinite(G.maxHp) && G.maxHp > 0 && typeof G.currentHp === "number" && isFinite(G.currentHp)) {
      G.currentHp = Math.min(G.maxHp, Math.max(0, G.currentHp));
    }
    if (typeof G.maxMp === "number" && isFinite(G.maxMp) && G.maxMp > 0 && typeof G.currentMp === "number" && isFinite(G.currentMp)) {
      G.currentMp = Math.min(G.maxMp, Math.max(0, G.currentMp));
    }
    if (!Array.isArray(G.chatHistory)) G.chatHistory = [];
    if (G.chatPlotSnapshot == null) G.chatPlotSnapshot = "";
    if (!Array.isArray(G.chatPlotSnapshotLog)) {
      if (G.chatPlotSnapshot != null && String(G.chatPlotSnapshot).trim() !== "") {
        G.chatPlotSnapshotLog = [String(G.chatPlotSnapshot).trim()];
      } else {
        G.chatPlotSnapshotLog = [];
      }
    }
    if (G.currentLocation == null || String(G.currentLocation).trim() === "") {
      var fc0 = G.fateChoice;
      if (fc0 && fc0.birthLocation != null && String(fc0.birthLocation).trim() !== "") {
        G.currentLocation = String(fc0.birthLocation).split("|")[0].trim();
      }
    }
    ensureEquippedSlots(G);
    ensureGongfaSlots(G);
    ensureInventorySlots(G);
    syncLateStageBreakSuffixState(G, G.fateChoice);
    ensureNearbyNpcsArray(G);
    normalizeNearbyNpcListInPlace(G);
  }

  function ensureNearbyNpcsArray(G) {
    if (!G) return;
    if (!Array.isArray(G.nearbyNpcs)) G.nearbyNpcs = [];
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
   * 周围人物展示顺序：① 可见且非阵亡（其中：本次对话出现过其姓名的优先）；② 不可见且非阵亡；③ 阵亡（固定置底）。
   */
  function sortNearbyNpcsForDisplay(G) {
    if (!G || !Array.isArray(G.nearbyNpcs) || G.nearbyNpcs.length < 2) return;
    var hist = Array.isArray(G.chatHistory) ? G.chatHistory : [];
    var tail = hist.slice(Math.max(0, hist.length - 16));
    var blob = [];
    for (var h = 0; h < tail.length; h++) {
      if (tail[h] && tail[h].content != null) blob.push(String(tail[h].content));
    }
    var blobText = blob.join("\n");
    var involved = {};
    for (var u = 0; u < G.nearbyNpcs.length; u++) {
      var nx = G.nearbyNpcs[u];
      if (!nx) continue;
      var dn = nx.displayName != null ? String(nx.displayName).trim() : "";
      if (dn.length < 2) continue;
      if (blobText.indexOf(dn) < 0) continue;
      var ik = nx.id != null ? String(nx.id).trim() : "";
      if (ik) involved[ik] = true;
    }
    var base = G.nearbyNpcs.slice();
    for (var s = 0; s < base.length; s++) {
      if (base[s]) base[s].__mjSortIdx = s;
    }
    function tier(n) {
      if (!n) return 9;
      if (n.isDead === true) return 3;
      // 强制：可见人物永远在不可见人物之上（即使不可见人物在近期对话中被提到）
      var invisible = n.isVisible === false ? 1 : 0;
      var idk = n.id != null ? String(n.id).trim() : "";
      var mentionedBoost = invisible === 0 && idk && involved[idk] ? 0 : 1;
      // 分组：0x = 可见；1x = 不可见；3 = 阵亡（置底）
      // 可见组内：被提到的在前；其余保持原顺序
      return invisible === 0 ? mentionedBoost : 2;
    }
    base.sort(function (a, b) {
      var ta = tier(a);
      var tb = tier(b);
      if (ta !== tb) return ta - tb;
      return (a && a.__mjSortIdx) - (b && b.__mjSortIdx);
    });
    for (var r = 0; r < base.length; r++) {
      if (base[r] && base[r].__mjSortIdx != null) delete base[r].__mjSortIdx;
    }
    G.nearbyNpcs = base;
  }

  function buildNearbyNpcMergedList(prevList, incomingList) {
    var prev = Array.isArray(prevList) ? prevList : [];
    var incoming = Array.isArray(incomingList) ? incomingList : [];
    var PRESERVE_TEXT_FIELDS = [
      "identity",
      "currentStageGoal",
      "longTermGoal",
      "hobby",
      "fear",
      "personality",
    ];
    var prevMap = {};
    var i;
    for (i = 0; i < prev.length; i++) {
      var p = prev[i];
      var pk = npcPresenceKey(p);
      if (!pk || prevMap[pk]) continue;
      prevMap[pk] = p;
    }

    var seen = {};
    var merged = [];
    for (i = 0; i < incoming.length; i++) {
      var cur = incoming[i];
      if (!cur || typeof cur !== "object") continue;
      var k = npcPresenceKey(cur);
      if (k && seen[k]) continue;
      var old = k ? prevMap[k] : null;
      if (old && old.isDead === true) {
        var deadKeep;
        try {
          deadKeep = JSON.parse(JSON.stringify(old));
        } catch (_eDead) {
          deadKeep = Object.assign({}, old);
        }
        deadKeep.isTemporarilyAway = false;
        deadKeep.currentHp = 0;
        deadKeep.isDead = true;
        merged.push(deadKeep);
        if (k) seen[k] = true;
        continue;
      }
      if (old && (cur.avatarUrl == null || String(cur.avatarUrl).trim() === "") && old.avatarUrl) {
        cur.avatarUrl = old.avatarUrl;
      }
      if (old) {
        for (var pf = 0; pf < PRESERVE_TEXT_FIELDS.length; pf++) {
          var key = PRESERVE_TEXT_FIELDS[pf];
          var hasNew = cur[key] != null && String(cur[key]).trim() !== "";
          var hasOld = old[key] != null && String(old[key]).trim() !== "";
          if (!hasNew && hasOld) cur[key] = old[key];
        }
        var hasNewFav = typeof cur.favorability === "number" && isFinite(cur.favorability);
        var hasOldFav = typeof old.favorability === "number" && isFinite(old.favorability);
        if (!hasNewFav && hasOldFav) cur.favorability = old.favorability;
        var hasNewVisible = typeof cur.isVisible === "boolean";
        var hasOldVisible = typeof old.isVisible === "boolean";
        if (!hasNewVisible && hasOldVisible) cur.isVisible = old.isVisible;
      }
      if (typeof cur.isVisible !== "boolean") cur.isVisible = true;
      cur.isTemporarilyAway = false;
      merged.push(cur);
      if (k) seen[k] = true;
    }

    for (i = 0; i < prev.length; i++) {
      var oldNpc = prev[i];
      var oldKey = npcPresenceKey(oldNpc);
      if (!oldKey || seen[oldKey]) continue;
      if (oldNpc && oldNpc.isDead === true) {
        var deadRest;
        try {
          deadRest = JSON.parse(JSON.stringify(oldNpc));
        } catch (_eR) {
          deadRest = oldNpc;
        }
        deadRest.isTemporarilyAway = false;
        deadRest.currentHp = 0;
        deadRest.isDead = true;
        merged.push(deadRest);
        continue;
      }
      var awayCopy;
      try {
        awayCopy = JSON.parse(JSON.stringify(oldNpc));
      } catch (_e) {
        awayCopy = oldNpc;
      }
      awayCopy.isTemporarilyAway = true;
      awayCopy.isVisible = false;
      merged.push(awayCopy);
    }
    return merged;
  }

  function mergeNearbyNpcListInPlace(G, incomingList) {
    if (!G) return;
    ensureNearbyNpcsArray(G);
    G.nearbyNpcs = buildNearbyNpcMergedList(G.nearbyNpcs, incomingList);
    normalizeNearbyNpcListInPlace(G);
    sortNearbyNpcsForDisplay(G);
  }

  function normalizeNearbyNpcListInPlace(G) {
    if (!G || !Array.isArray(G.nearbyNpcs)) return;
    var MCS = global.MjCharacterSheet;
    var PBR = global.PlayerBaseRuntime;
    if (!MCS || typeof MCS.normalize !== "function") return;
    var next = [];
    for (var i = 0; i < G.nearbyNpcs.length; i++) {
      try {
        var rawCell = G.nearbyNpcs[i];
        if (rawCell && rawCell.__mjStateSyncHpMpOnly) {
          delete rawCell.__mjStateSyncHpMpOnly;
          var wasAwayHp = !!rawCell.isTemporarilyAway;
          if (!Array.isArray(rawCell.equippedSlots)) rawCell.equippedSlots = [];
          rawCell.equippedSlots = rawCell.equippedSlots.slice(0, EQUIP_SLOT_COUNT);
          while (rawCell.equippedSlots.length < EQUIP_SLOT_COUNT) rawCell.equippedSlots.push(null);
          if (!Array.isArray(rawCell.gongfaSlots)) rawCell.gongfaSlots = [];
          rawCell.gongfaSlots = rawCell.gongfaSlots.slice(0, GONGFA_SLOT_COUNT);
          while (rawCell.gongfaSlots.length < GONGFA_SLOT_COUNT) rawCell.gongfaSlots.push(null);
          if (!Array.isArray(rawCell.inventorySlots)) rawCell.inventorySlots = [];
          if (rawCell.inventorySlots.length !== INVENTORY_SLOT_COUNT) {
            var invFix = rawCell.inventorySlots.slice(0, INVENTORY_SLOT_COUNT);
            while (invFix.length < INVENTORY_SLOT_COUNT) invFix.push(null);
            rawCell.inventorySlots = invFix;
          }
          if (
            rawCell.isDead === true ||
            (typeof rawCell.currentHp === "number" && isFinite(rawCell.currentHp) && rawCell.currentHp <= 0)
          ) {
            rawCell.currentHp = 0;
            rawCell.isDead = true;
            rawCell.isTemporarilyAway = false;
          } else {
            rawCell.isTemporarilyAway = wasAwayHp;
          }
          next.push(rawCell);
          continue;
        }
        var wasAway = !!(G.nearbyNpcs[i] && G.nearbyNpcs[i].isTemporarilyAway);
        var n = MCS.normalize(G.nearbyNpcs[i]);
        n.isTemporarilyAway = wasAway;
        if (n.isDead === true) {
          n.currentHp = 0;
          n.isTemporarilyAway = false;
        } else if (PBR && typeof PBR.applyComputedPlayerBaseToCharacterSheet === "function") {
          PBR.applyComputedPlayerBaseToCharacterSheet(n);
        }
        syncNpcShouyuanFromRealmState(n);
        if (n.isDead === true) n.currentHp = 0;
        else if (typeof n.currentHp === "number" && isFinite(n.currentHp) && n.currentHp <= 0) {
          n.isDead = true;
          n.currentHp = 0;
          n.isTemporarilyAway = false;
        }
        next.push(n);
      } catch (err) {
        console.warn("[主界面] 周围人物条目已跳过", err);
      }
    }
    G.nearbyNpcs = next;
  }

  /**
   * 示例 NPC：功法 / 装备名称均来自 MjDescribeGongfa、MjDescribeEquipment（可被 PlayerBaseRuntime 查表加成）。
   * 天赋词条与 trait_samples 一致（中文 bonus 键）。
   * 期望面板（与 Node 拉取 PlayerBaseRuntime.computePlayerBaseFromCharacterSheet 一致）：hp320 mp190 patk50 pdef20 matk83 mdef15 foot25 sense50；金灵根仅对物攻/法攻乘 1.1；天赋「避魔之体」的 法防 计入法防而非物防。
   */
  function buildDemoNearbyNpcSheet() {
    var MCS = global.MjCharacterSheet;
    if (MCS && typeof MCS.normalize === "function") {
      var demoGongfa = [];
      for (var dg = 0; dg < 12; dg++) demoGongfa.push(null);
      demoGongfa[0] = { name: "长春功" };
      demoGongfa[1] = { name: "眨眼剑法" };
      demoGongfa[2] = { name: "凝元功" };
      var demoInv = [];
      for (var di = 0; di < 12; di++) demoInv.push(null);
      demoInv[0] = { name: "回气丹", count: 3 };
      demoInv[1] = { name: "下品灵石", count: 12 };
      return MCS.normalize({
        id: "demo_npc_passerby",
        displayName: "路人甲（演算）",
        realm: { major: "筑基", minor: "初期" },
        gender: "男",
        linggen: "金",
        age: 32,
        shouyuan: 200,
        xiuwei: 4200,
        traits: [
          { name: "势大力沉", rarity: "平庸", desc: "天生力量惊人，攻击力强大。", bonus: { 物攻: 10 } },
          { name: "龟甲之躯", rarity: "平庸", desc: "如灵龟附体，防御惊人。", bonus: { 物防: 5 } },
          { name: "法力源泉", rarity: "平庸", desc: "法力深厚，如泉涌不息。", bonus: { 法力: 30 } },
          { name: "破法之瞳", rarity: "平庸", desc: "看破弱点，法术伤害提升。", bonus: { 法攻: 10 } },
          { name: "避魔之体", rarity: "平庸", desc: "天生对法术有抗性。", bonus: { 法防: 5 } },
        ],
        equippedSlots: [{ name: "铁剑" }, { name: "青叶" }, { name: "布衣" }],
        gongfaSlots: demoGongfa,
        inventorySlots: demoInv,
      });
    }
    var gfa = [];
    for (var g = 0; g < 12; g++) {
      gfa.push(g === 0 ? { name: "长春功" } : g === 1 ? { name: "眨眼剑法" } : g === 2 ? { name: "凝元功" } : null);
    }
    var inv = [];
    for (var v = 0; v < 12; v++) inv.push(v === 0 ? { name: "回气丹", count: 3 } : v === 1 ? { name: "下品灵石", count: 12 } : null);
    return {
      id: "demo_npc_passerby",
      displayName: "路人甲（演算）",
      realm: { major: "筑基", minor: "初期" },
      gender: "男",
      linggen: "金",
      age: 32,
      shouyuan: 200,
      xiuwei: 4200,
      traits: [
        { name: "势大力沉", rarity: "平庸", bonus: { 物攻: 10 } },
        { name: "龟甲之躯", rarity: "平庸", bonus: { 物防: 5 } },
        { name: "法力源泉", rarity: "平庸", bonus: { 法力: 30 } },
        { name: "破法之瞳", rarity: "平庸", bonus: { 法攻: 10 } },
        { name: "避魔之体", rarity: "平庸", bonus: { 法防: 5 } },
      ],
      equippedSlots: [{ name: "铁剑" }, { name: "青叶" }, { name: "布衣" }],
      gongfaSlots: gfa,
      inventorySlots: inv,
    };
  }

  function renderNearbyNpcsPanel(G) {
    var host = document.getElementById("mj-npc-list");
    if (!host) return;
    host.innerHTML = "";
    ensureNearbyNpcsArray(G);
    sortNearbyNpcsForDisplay(G);
    if (!G || !G.nearbyNpcs.length) {
      var empty = document.createElement("p");
      empty.className = "mj-npc-list-empty";
      empty.style.cssText = "text-align:center;font-size:0.82rem;opacity:0.72;margin:14px 10px;color:var(--mj-muted, #999);";
      empty.textContent = "近处暂无其他人。";
      host.appendChild(empty);
      return;
    }
    var MCS = global.MjCharacterSheet;
    var cards = G.nearbyNpcs.slice();
    for (var i = 0; i < cards.length; i++) {
      var rawNpc = cards[i];
      var npc =
        MCS && typeof MCS.normalize === "function"
          ? MCS.normalize(rawNpc)
          : rawNpc;
      if (!npc || !npc.id) continue;
      var isDead = !!(rawNpc && rawNpc.isDead === true);
      var isAway = !isDead && !!(rawNpc && (rawNpc.isTemporarilyAway || rawNpc.isVisible === false));

      var card = document.createElement("button");
      card.type = "button";
      card.className = "mj-npc-card mj-npc-card--sheet";
      card.setAttribute("data-npc-id", String(npc.id));
      if (isDead) {
        card.classList.add("mj-npc-card--dead");
      }
      if (isAway) {
        card.classList.add("mj-npc-card--away");
        card.style.opacity = "0.45";
      }

      var realmLine =
        MCS && typeof MCS.formatRealmLine === "function"
          ? MCS.formatRealmLine(npc.realm)
          : "—";

      var av = document.createElement("div");
      av.className = "mj-npc-card-avatar";
      if (npc.avatarUrl) {
        var im = document.createElement("img");
        im.src = npc.avatarUrl;
        im.alt = (npc.displayName || "NPC") + " " + realmLine;
        av.appendChild(im);
      } else {
        av.textContent = "头像";
        av.setAttribute("aria-hidden", "true");
      }

      var realmBelow = document.createElement("div");
      realmBelow.className = "mj-npc-card-realm-below";
      realmBelow.textContent = realmLine;
      var favRaw = typeof npc.favorability === "number" && isFinite(npc.favorability) ? npc.favorability : 0;
      var favVal = Math.max(-100, Math.min(100, Math.round(favRaw)));
      var favBelow = document.createElement("div");
      favBelow.className = "mj-npc-card-realm-below";
      favBelow.textContent = "好感度 " + String(favVal);
      favBelow.style.opacity = "0.72";

      var lead = document.createElement("div");
      lead.className = "mj-npc-card-lead";
      lead.appendChild(av);
      lead.appendChild(realmBelow);
      lead.appendChild(favBelow);

      var main = document.createElement("div");
      main.className = "mj-npc-card-main";

      var title = document.createElement("div");
      title.className = "mj-npc-card-title";
      var nameSp = document.createElement("span");
      nameSp.className = "mj-npc-name";
      nameSp.textContent = npc.displayName || "—";
      title.appendChild(nameSp);
      if (isDead) {
        var deadTag = document.createElement("span");
        deadTag.className = "mj-npc-card-dead-tag";
        deadTag.textContent = "阵亡";
        title.appendChild(deadTag);
      }

      card.setAttribute(
        "aria-label",
        (npc.displayName || "NPC") +
          "，" +
          realmLine +
          "，好感度 " +
          String(favVal) +
          (isDead ? "，已阵亡" : isAway ? "，临时离场" : "") +
          "，点击查看详情",
      );

      var maxH = typeof npc.maxHp === "number" && isFinite(npc.maxHp) ? Math.max(1, npc.maxHp) : 1;
      var maxM = typeof npc.maxMp === "number" && isFinite(npc.maxMp) ? Math.max(1, npc.maxMp) : 1;
      var curH = isDead
        ? 0
        : typeof npc.currentHp === "number" && isFinite(npc.currentHp)
          ? npc.currentHp
          : maxH;
      var curM = typeof npc.currentMp === "number" && isFinite(npc.currentMp) ? npc.currentMp : maxM;
      curH = Math.max(0, Math.min(maxH, Math.round(curH)));
      curM = Math.max(0, Math.min(maxM, Math.round(curM)));
      var hpPct = maxH > 0 ? (curH / maxH) * 100 : 0;
      var mpPct = maxM > 0 ? (curM / maxM) * 100 : 0;

      var barsCol = document.createElement("div");
      barsCol.className = "mj-npc-bars-h";

      function appendHBar(kind, labelZh, pct, cur, max) {
        var row = document.createElement("div");
        row.className = "mj-npc-resource-row";
        var head = document.createElement("div");
        head.className = "mj-npc-resource-label";
        var spLabel = document.createElement("span");
        spLabel.textContent = labelZh;
        var spNums = document.createElement("span");
        spNums.className = "mj-npc-resource-nums";
        spNums.textContent = cur + "/" + max;
        head.appendChild(spLabel);
        head.appendChild(spNums);
        var bar = document.createElement("div");
        bar.className = "mj-bar";
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(Math.round(clampPct(pct))));
        var fill = document.createElement("div");
        fill.className = "mj-bar-fill mj-bar-fill--" + kind;
        fill.style.width = clampPct(pct) + "%";
        bar.appendChild(fill);
        row.appendChild(head);
        row.appendChild(bar);
        barsCol.appendChild(row);
      }

      appendHBar("hp", "血量", hpPct, curH, maxH);
      appendHBar("mp", "法力", mpPct, curM, maxM);

      main.appendChild(title);
      main.appendChild(barsCol);
      card.appendChild(lead);
      card.appendChild(main);
      (function (npcData) {
        card.addEventListener("click", function () {
          openNpcDetailModal(npcData);
        });
      })(rawNpc);
      host.appendChild(card);
    }
  }

  function ensureNpcDetailSlotsClone(npcRaw) {
    var MCS = global.MjCharacterSheet;
    var n = MCS && typeof MCS.normalize === "function" ? MCS.normalize(npcRaw) : Object.assign({}, npcRaw);
    if (!n) return null;
    if (!Array.isArray(n.equippedSlots)) n.equippedSlots = [];
    // 兼容旧数据（3 格）→ 补齐到 4 格
    n.equippedSlots = JSON.parse(JSON.stringify(n.equippedSlots.slice(0, EQUIP_SLOT_COUNT)));
    while (n.equippedSlots.length < EQUIP_SLOT_COUNT) n.equippedSlots.push(null);
    if (!Array.isArray(n.gongfaSlots)) {
      n.gongfaSlots = [];
    }
    // 兼容旧数据（12 格）→ 保留前 8 格
    n.gongfaSlots = JSON.parse(JSON.stringify(n.gongfaSlots.slice(0, GONGFA_SLOT_COUNT)));
    while (n.gongfaSlots.length < GONGFA_SLOT_COUNT) n.gongfaSlots.push(null);
    if (!Array.isArray(n.inventorySlots) || n.inventorySlots.length !== INVENTORY_SLOT_COUNT) {
      var inv = [];
      for (var iv = 0; iv < INVENTORY_SLOT_COUNT; iv++) inv.push(null);
      n.inventorySlots = inv;
    } else {
      n.inventorySlots = JSON.parse(JSON.stringify(n.inventorySlots));
    }
    if (!Array.isArray(n.traits)) n.traits = [];
    else n.traits = n.traits.slice();
    return n;
  }

  function appendNpcDetailSectionTitle(parent, text, useFirstStyle) {
    var h = document.createElement("h3");
    h.className = "mj-attr-section-title" + (useFirstStyle ? " mj-attr-section-title--first" : "");
    h.textContent = text;
    parent.appendChild(h);
  }
  function setBarFill(fillEl, barHost, pct, textEl, textStr) {
    if (fillEl) fillEl.style.width = clampPct(pct) + "%";
    if (barHost) barHost.setAttribute("aria-valuenow", String(Math.round(clampPct(pct))));
    if (textEl && textStr != null) textEl.textContent = textStr;
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
  function formatReferenceValueFromNumber(n) {
    if (typeof n !== "number" || !isFinite(n)) return null;
    return Math.floor(n);
  }

  function formatReferenceValueLine(meta) {
    if (!meta || typeof meta.value !== "number" || !isFinite(meta.value)) return null;
    return formatReferenceValueFromNumber(meta.value);
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

  function resolveGongfaSubtype(rawItem, gongfaMeta) {
    var it = rawItem && typeof rawItem === "object" ? rawItem : {};
    var meta = gongfaMeta && typeof gongfaMeta === "object" ? gongfaMeta : null;
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

  /** 按装备名匹配 equipment 元数据 { desc, type, bonus } */
  function lookupEquipmentMetaByItemName(itemName) {
    if (!itemName) return null;
    var C = global.MjCreationConfig;
    if (!C || typeof C.getEquipmentDescribe !== "function") return null;
    return C.getEquipmentDescribe(String(itemName).trim());
  }

  function toFiniteNumberOrNull(v) {
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  /** 法器（及旧名副武器）不参与装备伤害倍率展示与入袋 magnification，与规则 9.3 一致 */
  function equipmentIsFaqiForMagnificationRule(item, equipMeta) {
    var ty =
      (item && item.equipType != null && String(item.equipType).trim() !== ""
        ? String(item.equipType).trim()
        : "") ||
      (equipMeta && equipMeta.type != null && String(equipMeta.type).trim() !== ""
        ? String(equipMeta.type).trim()
        : "");
    return ty === "法器" || ty === "副武器";
  }

  function resolveEquipmentMagnificationLine(itemName, item, equipMeta) {
    var meta = equipMeta || lookupEquipmentMetaByItemName(itemName);
    if (equipmentIsFaqiForMagnificationRule(item, meta)) return "";
    var m0 = item && item.magnification && typeof item.magnification === "object" ? item.magnification : null;
    var m1 = meta && meta.magnification && typeof meta.magnification === "object" ? meta.magnification : null;
    var patkMag = toFiniteNumberOrNull(m0 && m0.物攻);
    if (patkMag == null) patkMag = toFiniteNumberOrNull(m1 && m1.物攻);
    var matkMag = toFiniteNumberOrNull(m0 && m0.法攻);
    if (matkMag == null) matkMag = toFiniteNumberOrNull(m1 && m1.法攻);
    /** 表外或残缺格子的武器仍给展示默认倍率；法器见 equipmentIsFaqiForMagnificationRule */
    if (patkMag == null && matkMag == null) {
      var tyInf =
        (item && item.equipType != null && String(item.equipType).trim() !== ""
          ? String(item.equipType).trim()
          : "") ||
        (meta && meta.type != null && String(meta.type).trim() !== "" ? String(meta.type).trim() : "");
      if (tyInf === "武器" || tyInf === "主武器") {
        patkMag = 1;
        matkMag = 0;
      } else {
        return "";
      }
    }
    if (patkMag == null) patkMag = 0;
    if (matkMag == null) matkMag = 0;
    return (
      "物攻倍率=" +
      String(Math.round(patkMag * 100) / 100) +
      ", 法攻倍率=" +
      String(Math.round(matkMag * 100) / 100)
    );
  }

  function resolveGongfaMagnificationLine(gongfaName, item, gongfaMeta) {
    var meta = gongfaMeta || lookupGongfaConfigDef(gongfaName);
    /** 辅助类功法不参与攻伐倍率展示；loot 上若误带 magnification 也不出「伤害倍率」行 */
    if (resolveGongfaSubtype(item, meta) === "辅助") return "";
    var m0 = item && item.magnification && typeof item.magnification === "object" ? item.magnification : null;
    var m1 = meta && meta.magnification && typeof meta.magnification === "object" ? meta.magnification : null;
    var patkMag = toFiniteNumberOrNull(m0 && m0.物攻);
    if (patkMag == null) patkMag = toFiniteNumberOrNull(m1 && m1.物攻);
    var matkMag = toFiniteNumberOrNull(m0 && m0.法攻);
    if (matkMag == null) matkMag = toFiniteNumberOrNull(m1 && m1.法攻);
    /** 表外攻击功法可能无 magnification；给展示默认(1,0)。辅助类在表内可无倍率且战斗用 0,0 跳过输出，此处不臆造倍率以免与结算口径矛盾 */
    if (patkMag == null && matkMag == null) {
      var st = resolveGongfaSubtype(item, meta);
      if (st === "攻击") {
        patkMag = 1;
        matkMag = 0;
      } else {
        return "";
      }
    }
    if (patkMag == null) patkMag = 0;
    if (matkMag == null) matkMag = 0;
    return (
      "物攻倍率=" +
      String(Math.round(patkMag * 100) / 100) +
      ", 法攻倍率=" +
      String(Math.round(matkMag * 100) / 100)
    );
  }

  function resolveGongfaManacostLine(gongfaName, item, gongfaMeta) {
    var meta = gongfaMeta || lookupGongfaConfigDef(gongfaName);
    var c0 = toFiniteNumberOrNull(item && item.manacost);
    var c1 = toFiniteNumberOrNull(meta && meta.manacost);
    var cost = c0 != null ? c0 : c1;
    if (cost == null) return "";
    return String(Math.max(0, Math.round(cost)));
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
    var stuff = lookupStuffMetaByItemName(nm);
    if (stuff && stuff.grade != null && String(stuff.grade).trim() !== "") {
      return gradeToTraitRarity(stuff.grade);
    }
    var eq = lookupEquipmentMetaByItemName(nm);
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
      var em = lookupEquipmentMetaByItemName(String(itemName || "").trim());
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

  /** NPC 详情天赋槽 tooltip（与主界面槽位逻辑一致，须留在 realm 供 buildNpcDetailModalBody 使用） */
  function buildTraitSlotTooltip(t) {
    if (!t || !t.name) return "空槽";
    var s = t.name + (t.rarity ? "（" + t.rarity + "）" : "");
    if (t.desc) s += "\n" + t.desc;
    if (t.effects != null && String(t.effects) !== "") s += "\n效果：" + t.effects;
    return s;
  }

  function buildNpcDetailModalBody(bodyEl, npc) {
    var MCS = global.MjCharacterSheet;
    var RS = global.RealmState;
    var realmLine = MCS && MCS.formatRealmLine ? MCS.formatRealmLine(npc.realm) : "—";
    var major =
      npc.realm && npc.realm.major != null && String(npc.realm.major).trim() !== ""
        ? String(npc.realm.major).trim()
        : "练气";
    var minor =
      npc.realm && npc.realm.minor != null && String(npc.realm.minor).trim() !== ""
        ? String(npc.realm.minor).trim()
        : "初期";
    var minorForReq = major === "化神" ? undefined : minor;

    function makeStatCell(k, v) {
      var cell = document.createElement("div");
      cell.className = "mj-stat-cell";
      var kEl = document.createElement("span");
      kEl.className = "mj-stat-k";
      kEl.textContent = k;
      var vEl = document.createElement("span");
      vEl.className = "mj-stat-v";
      vEl.textContent = v;
      cell.appendChild(kEl);
      cell.appendChild(vEl);
      return cell;
    }

    var head = document.createElement("div");
    head.className = "mj-npc-detail-head";
    var avWrap = document.createElement("div");
    avWrap.className = "mj-npc-detail-avatar-wrap";

    function npcAvatarStorageKey(npcId) {
      return "MJ_NPC_AVATAR_V1:" + String(npcId || "");
    }

    function readNpcAvatarFromStorage(npcId) {
      try {
        if (!npcId) return "";
        var raw = localStorage.getItem(npcAvatarStorageKey(npcId));
        return raw ? String(raw) : "";
      } catch (_e) {
        return "";
      }
    }

    function writeNpcAvatarToStorage(npcId, dataUrl) {
      try {
        if (!npcId) return;
        if (!dataUrl) {
          localStorage.removeItem(npcAvatarStorageKey(npcId));
          return;
        }
        localStorage.setItem(npcAvatarStorageKey(npcId), String(dataUrl));
      } catch (_e) {
        /* 忽略 */
      }
    }

    var resolvedAvatarUrl = npc && npc.avatarUrl ? String(npc.avatarUrl) : "";
    if (!resolvedAvatarUrl) resolvedAvatarUrl = readNpcAvatarFromStorage(npc && npc.id);

    if (resolvedAvatarUrl) {
      var img = document.createElement("img");
      img.className = "mj-npc-detail-avatar-img";
      img.src = resolvedAvatarUrl;
      img.alt = npc.displayName || "";
      avWrap.appendChild(img);
    } else {
      var ph = document.createElement("div");
      ph.className = "mj-npc-detail-avatar-ph";
      ph.textContent = "立绘";
      avWrap.appendChild(ph);
    }

    // 点击头像上传（本地存储持久化）
    (function bindAvatarUploadOnce() {
      if (avWrap._mjAvatarUploadBound) return;
      avWrap._mjAvatarUploadBound = true;
      avWrap.setAttribute("role", "button");
      avWrap.setAttribute("tabindex", "0");
      avWrap.setAttribute("aria-label", "上传 NPC 头像");
      avWrap.setAttribute("title", "点击上传头像");
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      // 不用 display:none，避免部分浏览器对 input.click() 触发文件选择器失效
      input.style.position = "absolute";
      input.style.left = "-9999px";
      input.style.top = "0";
      input.style.width = "1px";
      input.style.height = "1px";
      input.style.opacity = "0";
      input.style.clip = "rect(0 0 0 0)";
      input.style.pointerEvents = "none";
      avWrap.appendChild(input);

      function openPicker() {
        try {
          input.value = "";
          input.disabled = false;
          input.focus();
        } catch (_e) {}
        input.click();
      }

      function applyAvatar(dataUrl) {
        if (!dataUrl) return;
        writeNpcAvatarToStorage(npc && npc.id, dataUrl);
        npc.avatarUrl = dataUrl;
        avWrap.innerHTML = "";
        var img2 = document.createElement("img");
        img2.className = "mj-npc-detail-avatar-img";
        img2.src = dataUrl;
        img2.alt = npc.displayName || "";
        avWrap.appendChild(img2);
        avWrap.appendChild(input);
      }

      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        if (!f) return;
        if (!/^image\//i.test(String(f.type || ""))) return;
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = reader.result != null ? String(reader.result) : "";
          if (!dataUrl) return;
          applyAvatar(dataUrl);
        };
        reader.readAsDataURL(f);
      });

      avWrap.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPicker();
      });
      avWrap.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        openPicker();
      });
    })();
    var headText = document.createElement("div");
    headText.className = "mj-npc-detail-head-text";
    var realmBig = document.createElement("div");
    realmBig.className = "mj-npc-detail-realm-big";
    realmBig.style.display = "flex";
    realmBig.style.justifyContent = "space-between";
    realmBig.style.gap = "12px";
    var realmSpan = document.createElement("span");
    realmSpan.textContent = "境界：" + realmLine;
    var favRaw = typeof npc.favorability === "number" && isFinite(npc.favorability) ? npc.favorability : 0;
    var favVal = Math.max(-100, Math.min(100, Math.round(favRaw)));
    var favSpan = document.createElement("span");
    favSpan.textContent = "好感度：" + String(favVal);
    realmBig.appendChild(realmSpan);
    realmBig.appendChild(favSpan);
    headText.appendChild(realmBig);
    head.appendChild(avWrap);
    head.appendChild(headText);
    if (npc.isDead === true) {
      var deadBan = document.createElement("div");
      deadBan.className = "mj-npc-detail-dead-banner";
      deadBan.textContent = "已阵亡";
      bodyEl.appendChild(deadBan);
    }
    bodyEl.appendChild(head);

    var tabWrap = document.createElement("div");
    tabWrap.className = "mj-npc-detail-tabs";
    tabWrap.style.display = "flex";
    tabWrap.style.gap = "8px";
    tabWrap.style.margin = "8px 0 10px";
    var tabAttrBtn = document.createElement("button");
    tabAttrBtn.type = "button";
    tabAttrBtn.className = "mj-item-detail-action-btn mj-item-detail-action-btn--primary";
    tabAttrBtn.textContent = "属性";
    var tabBaseBtn = document.createElement("button");
    tabBaseBtn.type = "button";
    tabBaseBtn.className = "mj-item-detail-action-btn";
    tabBaseBtn.textContent = "基础信息";
    tabWrap.appendChild(tabAttrBtn);
    tabWrap.appendChild(tabBaseBtn);
    bodyEl.appendChild(tabWrap);

    var attrPanel = document.createElement("div");
    attrPanel.className = "mj-npc-detail-panel-attr";
    var basePanel = document.createElement("div");
    basePanel.className = "mj-npc-detail-panel-basic";
    basePanel.style.display = "none";
    // 两个页签统一可视高度，避免切换时弹窗高度跳变；内容超出则内部滚动
    attrPanel.style.maxHeight = "56vh";
    attrPanel.style.minHeight = "56vh";
    attrPanel.style.overflowY = "auto";
    basePanel.style.maxHeight = "56vh";
    basePanel.style.minHeight = "56vh";
    basePanel.style.overflowY = "auto";
    bodyEl.appendChild(attrPanel);
    bodyEl.appendChild(basePanel);

    var idBlock = document.createElement("div");
    idBlock.className = "mj-player-identity mj-npc-detail-identity";
    var rowA = document.createElement("div");
    rowA.className = "mj-stat-pair-row";
    rowA.appendChild(makeStatCell("性别", npc.gender != null ? String(npc.gender) : "—"));
    rowA.appendChild(makeStatCell("灵根", formatLinggenPanelText(npc.linggen)));
    var rowB = document.createElement("div");
    rowB.className = "mj-stat-pair-row";
    var syStr = "—";
    if (typeof npc.shouyuan === "number" && isFinite(npc.shouyuan)) {
      syStr = String(Math.round(npc.shouyuan));
    } else if (RS && typeof RS.getShouyuanForRealm === "function") {
      var syCap0 = RS.getShouyuanForRealm(major, minorForReq);
      if (syCap0 != null) syStr = String(Math.round(syCap0));
    }
    var syCell = makeStatCell("寿元", syStr);
    if (RS && typeof RS.getShouyuanRow === "function") {
      var syRow = RS.getShouyuanRow(major, minorForReq);
      if (syRow && syRow.note) {
        var stg = syRow.stage != null && String(syRow.stage) !== "" ? String(syRow.stage) : "";
        var syVEl = syCell.querySelector(".mj-stat-v");
        if (syVEl) {
          syVEl.setAttribute(
            "title",
            major + stg + " 寿元参考 " + syRow.shouyuan + " 岁：" + syRow.note,
          );
        }
      }
    }
    rowB.appendChild(makeStatCell("年龄", npc.age != null ? String(npc.age) : "—"));
    rowB.appendChild(syCell);
    idBlock.appendChild(rowA);
    idBlock.appendChild(rowB);
    attrPanel.appendChild(idBlock);

    var pb = npc.playerBase || {};
    appendNpcDetailSectionTitle(attrPanel, "属性", true);

    var maxH = typeof npc.maxHp === "number" && isFinite(npc.maxHp) ? Math.max(1, npc.maxHp) : 1;
    var maxM = typeof npc.maxMp === "number" && isFinite(npc.maxMp) ? Math.max(1, npc.maxMp) : 1;
    var curH =
      npc.isDead === true
        ? 0
        : typeof npc.currentHp === "number" && isFinite(npc.currentHp)
          ? npc.currentHp
          : maxH;
    var curM = typeof npc.currentMp === "number" && isFinite(npc.currentMp) ? npc.currentMp : maxM;
    curH = Math.max(0, Math.min(maxH, Math.round(curH)));
    curM = Math.max(0, Math.min(maxM, Math.round(curM)));
    var pctH = maxH > 0 ? (curH / maxH) * 100 : 0;
    var pctM = maxM > 0 ? (curM / maxM) * 100 : 0;

    function appendHpMpRow(kind, label, pct, cur, maxV) {
      var row = document.createElement("div");
      row.className = "mj-resource-row";
      var hd = document.createElement("div");
      hd.className = "mj-resource-label";
      var l = document.createElement("span");
      l.textContent = label;
      var nums = document.createElement("span");
      nums.className = "mj-resource-nums";
      nums.textContent = cur + " / " + maxV;
      hd.appendChild(l);
      hd.appendChild(nums);
      var bar = document.createElement("div");
      bar.className = "mj-bar";
      bar.setAttribute("role", "progressbar");
      var fl = document.createElement("div");
      fl.className = "mj-bar-fill mj-bar-fill--" + kind;
      bar.appendChild(fl);
      row.appendChild(hd);
      row.appendChild(bar);
      attrPanel.appendChild(row);
      setBarFill(fl, bar, pct, nums, cur + " / " + maxV);
    }
    appendHpMpRow("hp", "血量", pctH, curH, maxH);
    appendHpMpRow("mp", "法力", pctM, curM, maxM);

    var combat = document.createElement("div");
    combat.className = "mj-combat-stats";
    var r1 = document.createElement("div");
    r1.className = "mj-stat-pair-row";
    r1.appendChild(makeStatCell("物攻", numOrDash(pb.patk)));
    r1.appendChild(makeStatCell("物防", numOrDash(pb.pdef)));
    var r2 = document.createElement("div");
    r2.className = "mj-stat-pair-row";
    r2.appendChild(makeStatCell("法攻", numOrDash(pb.matk)));
    r2.appendChild(makeStatCell("法防", numOrDash(pb.mdef)));
    var r3 = document.createElement("div");
    r3.className = "mj-stat-pair-row";
    r3.appendChild(makeStatCell("神识", numOrDash(pb.sense)));
    r3.appendChild(makeStatCell("脚力", numOrDash(pb.foot)));
    var r4 = document.createElement("div");
    r4.className = "mj-stat-pair-row";
    var ch = pb.charm != null ? pb.charm : null;
    var lk = pb.luck != null ? pb.luck : null;
    r4.appendChild(makeStatCell("魅力", numOrDash(ch)));
    r4.appendChild(makeStatCell("气运", numOrDash(lk)));
    combat.appendChild(r1);
    combat.appendChild(r2);
    combat.appendChild(r3);
    combat.appendChild(r4);
    attrPanel.appendChild(combat);

    var eqWrap = document.createElement("div");
    eqWrap.className = "mj-equip-block";
    var eqH = document.createElement("h3");
    eqH.className = "mj-attr-section-title";
    eqH.textContent = "装备佩戴";
    var eqRow = document.createElement("div");
    eqRow.className = "mj-equip-row";
    eqRow.setAttribute("role", "group");
    for (var ei = 0; ei < EQUIP_SLOT_COUNT; ei++) {
      var eqSlot = document.createElement("div");
      eqSlot.setAttribute("data-equip-slot", String(ei));
      var eit = npc.equippedSlots[ei];
      var eLabel = EQUIP_SLOT_KIND_LABELS[ei] || "装备";
      if (eit && (eit.name != null ? eit.name : eit.label)) {
        var en = String(eit.name != null ? eit.name : eit.label);
        eqSlot.className = "mj-equip-slot mj-equip-slot--filled";
        var ek = document.createElement("span");
        ek.className = "mj-equip-slot-k";
        ek.textContent = eLabel;
        var enm = document.createElement("span");
        enm.className = "mj-equip-slot-name";
        enm.textContent = en;
        eqSlot.appendChild(ek);
        eqSlot.appendChild(enm);
        eqSlot.setAttribute("title", en + "（点击查看详情）");
        eqSlot.setAttribute("role", "button");
        eqSlot.setAttribute("tabindex", "0");
        eqSlot.setAttribute("aria-label", "查看装备：" + en);
        setSlotRarityDataAttr(eqSlot, resolveEquipTraitRarity(en, eit));
      } else {
        eqSlot.className = "mj-equip-slot mj-equip-slot--empty";
        var ek2 = document.createElement("span");
        ek2.className = "mj-equip-slot-k";
        ek2.textContent = eLabel;
        var en2 = document.createElement("span");
        en2.className = "mj-equip-slot-name";
        en2.textContent = "—";
        eqSlot.appendChild(ek2);
        eqSlot.appendChild(en2);
        eqSlot.setAttribute("title", EQUIP_SLOT_EMPTY_TITLE[ei] || "空位");
      }
      eqRow.appendChild(eqSlot);
    }
    eqWrap.appendChild(eqH);
    eqWrap.appendChild(eqRow);
    attrPanel.appendChild(eqWrap);

    var bagStack = document.createElement("div");
    bagStack.className = "mj-player-bag-stack";
    var gfH = document.createElement("h3");
    gfH.className = "mj-attr-section-title";
    gfH.textContent = "功法";
    var gfScroll = document.createElement("div");
    gfScroll.className = "mj-bag-grid-scroll mj-bag-grid-scroll--gongfa";
    gfScroll.setAttribute("aria-label", "功法格子");
    var gfGrid = document.createElement("div");
    gfGrid.className = "mj-inventory-grid mj-gongfa-grid";
    gfGrid.id = "mj-npc-detail-gongfa-grid";
    gfGrid.setAttribute("aria-label", "NPC 功法栏");
    for (var gi = 0; gi < GONGFA_SLOT_COUNT; gi++) {
      var gSlot = document.createElement("div");
      gSlot.className = "mj-inventory-slot";
      gSlot.setAttribute("data-gongfa-slot", String(gi));
      gSlot.setAttribute("title", "功法空位");
      var gStack = document.createElement("div");
      gStack.className = "mj-gongfa-slot-stack";
      var gInner = document.createElement("span");
      gInner.className = "mj-gongfa-slot-label";
      gInner.setAttribute("aria-hidden", "true");
      var gType = document.createElement("span");
      gType.className = "mj-gongfa-slot-type";
      gType.setAttribute("aria-hidden", "true");
      gStack.appendChild(gInner);
      gStack.appendChild(gType);
      gSlot.appendChild(gStack);
      var gs = npc.gongfaSlots[gi];
      var glab = gs && (gs.name != null ? gs.name : gs.label) ? String(gs.name != null ? gs.name : gs.label) : "";
      if (glab) {
        gSlot.classList.add("mj-gongfa-slot--filled");
        gInner.textContent = glab;
        var cfgGf = lookupGongfaConfigDef(String(glab));
        var tyRaw = resolveGongfaSubtype(gs, cfgGf);
        if (tyRaw) {
          gType.textContent = tyRaw;
          gType.className = "mj-gongfa-slot-type";
          if (tyRaw === "辅助") gType.classList.add("mj-gongfa-slot-type--support");
          else if (tyRaw === "攻击") gType.classList.add("mj-gongfa-slot-type--attack");
          else gType.classList.add("mj-gongfa-slot-type--other");
        }
        var gTip = String(glab);
        if (tyRaw) gTip += "\n类型：" + tyRaw;
        if (gs.desc) gTip += "\n" + String(gs.desc);
        gTip += "\n（点击查看详情）";
        gSlot.setAttribute("title", gTip);
        gSlot.setAttribute("role", "button");
        gSlot.setAttribute("tabindex", "0");
        gSlot.setAttribute("aria-label", "查看功法：" + String(glab) + (tyRaw ? "，" + tyRaw : ""));
        setSlotRarityDataAttr(gSlot, resolveGongfaTraitRarity(String(glab), gs, cfgGf));
      } else {
        gSlot.classList.remove("mj-gongfa-slot--filled");
        gInner.textContent = "";
        gType.textContent = "";
        gType.className = "mj-gongfa-slot-type";
        gSlot.removeAttribute("role");
        gSlot.removeAttribute("tabindex");
        gSlot.removeAttribute("aria-label");
        setSlotRarityDataAttr(gSlot, null);
      }
      gfGrid.appendChild(gSlot);
    }
    gfScroll.appendChild(gfGrid);
    bagStack.appendChild(gfH);
    bagStack.appendChild(gfScroll);
    attrPanel.appendChild(bagStack);

    appendNpcDetailSectionTitle(basePanel, "基础信息", true);
    function appendBasicInfoBlock(label, value) {
      var wrap = document.createElement("div");
      wrap.className = "mj-trait-modal-section";
      var kEl = document.createElement("span");
      kEl.className = "mj-trait-modal-k";
      kEl.textContent = label;
      var vEl = document.createElement("div");
      vEl.className = "mj-trait-modal-v";
      var txt = value != null && String(value).trim() !== "" ? String(value) : "—";
      vEl.textContent = txt;
      wrap.appendChild(kEl);
      wrap.appendChild(vEl);
      basePanel.appendChild(wrap);
    }
    appendBasicInfoBlock("身份", npc.identity);
    appendBasicInfoBlock("当前阶段目标", npc.currentStageGoal);
    appendBasicInfoBlock("长期目标", npc.longTermGoal);
    appendBasicInfoBlock("爱好", npc.hobby);
    appendBasicInfoBlock("害怕的事", npc.fear);
    appendBasicInfoBlock("性格特征", npc.personality);

    function setNpcDetailTab(showBasic) {
      if (showBasic) {
        attrPanel.style.display = "none";
        basePanel.style.display = "";
        tabAttrBtn.classList.remove("mj-item-detail-action-btn--primary");
        tabBaseBtn.classList.add("mj-item-detail-action-btn--primary");
      } else {
        attrPanel.style.display = "";
        basePanel.style.display = "none";
        tabBaseBtn.classList.remove("mj-item-detail-action-btn--primary");
        tabAttrBtn.classList.add("mj-item-detail-action-btn--primary");
      }
    }
    tabAttrBtn.addEventListener("click", function () {
      setNpcDetailTab(false);
    });
    tabBaseBtn.addEventListener("click", function () {
      setNpcDetailTab(true);
    });
  }

  function openNpcDetailModal(npcRaw) {
    var root = document.getElementById("mj-npc-detail-root");
    var titleEl = document.getElementById("mj-npc-detail-title");
    var subEl = document.getElementById("mj-npc-detail-subtitle");
    var bodyEl = document.getElementById("mj-npc-detail-body");
    if (!root || !titleEl || !subEl || !bodyEl) return;
    var npc = ensureNpcDetailSlotsClone(npcRaw);
    if (!npc) return;
    titleEl.textContent = npc.displayName || "—";
    var MCS = global.MjCharacterSheet;
    // 顶部副标题的境界行移除（正文已展示境界）
    subEl.textContent = "";
    subEl.classList.add("hidden");
    bodyEl.textContent = "";
    buildNpcDetailModalBody(bodyEl, npc);
    root._mjNpcInspect = npc;
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var closeBtn = root.querySelector("[data-mj-npc-detail-close].mj-trait-modal-close");
    if (!closeBtn) closeBtn = root.querySelector(".mj-trait-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeNpcDetailModal() {
    var root = document.getElementById("mj-npc-detail-root");
    if (!root) return;
    root._mjNpcInspect = null;
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    mjClearBodyOverflowIfNoModal();
  }

  var _npcDetailModalUiBound = false;

  function bindNpcDetailModalUi() {
    if (_npcDetailModalUiBound) return;
    _npcDetailModalUiBound = true;
    var root = document.getElementById("mj-npc-detail-root");
    if (root) {
      root.querySelectorAll("[data-mj-npc-detail-close]").forEach(function (el) {
        el.addEventListener("click", function () {
          closeNpcDetailModal();
        });
      });
      root.addEventListener("click", function (e) {
        if (root.classList.contains("hidden")) return;
        var body = document.getElementById("mj-npc-detail-body");
        if (!body || !body.contains(e.target)) return;
        var P2 = global.MjMainScreenPanel;
        if (P2 && typeof P2.tryOpenNpcDetailSubInspect === "function") P2.tryOpenNpcDetailSubInspect(e.target);
      });
      root.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (root.classList.contains("hidden")) return;
        var body = document.getElementById("mj-npc-detail-body");
        if (!body || !body.contains(e.target)) return;
        if (e.key === " ") e.preventDefault();
        var P3 = global.MjMainScreenPanel;
        if (P3 && typeof P3.tryOpenNpcDetailSubInspect === "function") P3.tryOpenNpcDetailSubInspect(e.target);
      });
    }
    document.addEventListener(
      "keydown",
      function (ev) {
        if (ev.key !== "Escape") return;
        var rMajor = document.getElementById("mj-major-breakthrough-root");
        if (rMajor && !rMajor.classList.contains("hidden")) return;
        var rItem = document.getElementById("mj-item-detail-root");
        if (rItem && !rItem.classList.contains("hidden")) return;
        var rTrait = document.getElementById("mj-trait-detail-root");
        if (rTrait && !rTrait.classList.contains("hidden")) return;
        var r = document.getElementById("mj-npc-detail-root");
        if (r && !r.classList.contains("hidden")) {
          closeNpcDetailModal();
          ev.preventDefault();
        }
      },
      true,
    );
  }

  function ensureEquippedSlots(G) {
    if (!G) return;
    if (!Array.isArray(G.equippedSlots)) G.equippedSlots = [];
    G.equippedSlots = G.equippedSlots.slice(0, EQUIP_SLOT_COUNT);
    while (G.equippedSlots.length < EQUIP_SLOT_COUNT) G.equippedSlots.push(null);
    return;
  }

  function ensureGongfaSlots(G) {
    if (!G) return;
    if (!Array.isArray(G.gongfaSlots)) G.gongfaSlots = [];
    G.gongfaSlots = G.gongfaSlots.slice(0, GONGFA_SLOT_COUNT);
    while (G.gongfaSlots.length < GONGFA_SLOT_COUNT) G.gongfaSlots.push(null);
  }

  function normalizeBagItem(entry) {
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
    var cnt =
      typeof c === "number" && isFinite(c) ? Math.max(0, Math.floor(c)) : 1;
    var o = { name: name, count: cnt };
    if (entry.desc != null && String(entry.desc).trim() !== "") o.desc = String(entry.desc);
    if (entry.equipType != null && String(entry.equipType).trim() !== "") {
      o.equipType = String(entry.equipType).trim();
    }
    if (entry.grade != null && String(entry.grade).trim() !== "") o.grade = String(entry.grade).trim();
    if (typeof entry.value === "number" && isFinite(entry.value)) {
      o.value = Math.max(0, Math.floor(entry.value));
    }
    /** 储物袋功法书必须保留 type=功法 且不得带 equipType，否则会被判成装备、无法打开功法详情与装入功法栏 */
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
      var mk = Object.keys(entry.magnification);
      if (mk.length > 0) o.magnification = Object.assign({}, entry.magnification);
    }
    return o;
  }

  /** 拆堆叠、消耗后写回格子时保留 describe 表外字段 */
  function continuityFieldsFromBagItem(it) {
    if (!it) return {};
    var o = {};
    if (it.desc != null) o.desc = it.desc;
    if (it.equipType != null) o.equipType = it.equipType;
    if (it.grade != null) o.grade = it.grade;
    if (typeof it.value === "number" && isFinite(it.value)) o.value = it.value;
    if (it.type != null) o.type = it.type;
    if (it.bonus && typeof it.bonus === "object") o.bonus = it.bonus;
    if (it.effects && typeof it.effects === "object") o.effects = it.effects;
    if (typeof it.manacost === "number" && isFinite(it.manacost)) o.manacost = it.manacost;
    if (it.magnification && typeof it.magnification === "object") o.magnification = Object.assign({}, it.magnification);
    return o;
  }

  /** 旧存档格子上无 grade/value 时，按描述表补全（刷新后即可上色 / 显示价值） */
  function enrichInventoryGradesFromDescribe(G) {
    if (!G || !G.inventorySlots) return;
    var C = global.MjCreationConfig;
    if (!C) return;
    for (var i = 0; i < G.inventorySlots.length; i++) {
      var it = G.inventorySlots[i];
      if (!it || !it.name) continue;
      var nm = String(it.name).trim();
      if (!nm) continue;
      if (it.grade == null || String(it.grade).trim() === "") {
        if (typeof C.getStuffDescribe === "function") {
          var st = C.getStuffDescribe(nm);
          if (st && st.grade != null && String(st.grade).trim() !== "") {
            it.grade = String(st.grade).trim();
          }
        }
        if ((it.grade == null || String(it.grade).trim() === "") && typeof C.getEquipmentDescribe === "function") {
          var em = C.getEquipmentDescribe(nm);
          if (em && em.grade != null && String(em.grade).trim() !== "") it.grade = String(em.grade).trim();
        }
      }
      if (typeof it.value !== "number" || !isFinite(it.value)) {
        if (typeof C.getStuffDescribe === "function") {
          var st2 = C.getStuffDescribe(nm);
          if (st2 && typeof st2.value === "number" && isFinite(st2.value)) {
            it.value = Math.max(0, Math.floor(st2.value));
          }
        }
        if ((typeof it.value !== "number" || !isFinite(it.value)) && typeof C.getEquipmentDescribe === "function") {
          var em2 = C.getEquipmentDescribe(nm);
          if (em2 && typeof em2.value === "number" && isFinite(em2.value)) {
            it.value = Math.max(0, Math.floor(em2.value));
          }
        }
      }
    }
  }

  function expandPlayerInventoryOneRow(G) {
    if (!G || !Array.isArray(G.inventorySlots)) return;
    for (var c = 0; c < INVENTORY_GRID_COLS; c++) {
      G.inventorySlots.push(null);
    }
  }

  function trimTrailingEmptyPlayerBagRows(G) {
    if (!G || !Array.isArray(G.inventorySlots)) return;
    while (G.inventorySlots.length > INVENTORY_SLOT_COUNT) {
      var L = G.inventorySlots.length;
      if (L < INVENTORY_GRID_COLS) break;
      var start = L - INVENTORY_GRID_COLS;
      var emptyRow = true;
      for (var c = 0; c < INVENTORY_GRID_COLS; c++) {
        if (G.inventorySlots[start + c]) {
          emptyRow = false;
          break;
        }
      }
      if (!emptyRow) break;
      G.inventorySlots.length = start;
    }
  }

  function findFirstEmptyInventorySlot(G) {
    if (!G || !Array.isArray(G.inventorySlots)) return -1;
    for (var i = 0; i < G.inventorySlots.length; i++) {
      if (!G.inventorySlots[i]) return i;
    }
    return -1;
  }

  /** 将禁止堆叠合并的物品（如妖兽内丹）从旧存档大单格拆成每格 1 件；空位不足时扩行 */
  function splitUniqueStackItemCellsInPlace(G) {
    if (!G || !Array.isArray(G.inventorySlots)) return;
    function countEmptyBagSlots() {
      var e = 0;
      for (var x = 0; x < G.inventorySlots.length; x++) {
        if (!G.inventorySlots[x]) e++;
      }
      return e;
    }
    for (var i = 0; i < G.inventorySlots.length; i++) {
      var cell = G.inventorySlots[i];
      if (!cell || !cell.name) continue;
      var nm = String(cell.name).trim();
      if (!nm || !bagItemSkipsSameNameStack(nm)) continue;
      var qc = typeof cell.count === "number" && isFinite(cell.count) ? Math.max(1, Math.floor(cell.count)) : 1;
      if (qc <= 1) continue;
      var needExtra = qc - 1;
      while (countEmptyBagSlots() < needExtra) {
        expandPlayerInventoryOneRow(G);
      }
      var moveOut = needExtra;
      var cont = continuityFieldsFromBagItem(cell);
      var restOnFirst = qc - moveOut;
      G.inventorySlots[i] = normalizeBagItem(Object.assign({ name: nm, count: restOnFirst }, cont));
      for (var m = 0; m < moveOut; m++) {
        var j = findFirstEmptyInventorySlot(G);
        if (j < 0) break;
        G.inventorySlots[j] = normalizeBagItem(Object.assign({ name: nm, count: 1 }, cont));
      }
    }
  }

  /** 储物袋至少 12 格，可向下扩行（4 列网格）；兼容旧存档 kind:lingshi → 下品灵石 */
  function ensureInventorySlots(G) {
    if (!G) return;
    var C = global.MjCreationConfig;
    var stoneName =
      C && C.LINGSHI_STACK_ITEM_NAME ? String(C.LINGSHI_STACK_ITEM_NAME) : "下品灵石";
    if (!Array.isArray(G.inventorySlots)) {
      G.inventorySlots = [];
    }
    while (G.inventorySlots.length < INVENTORY_SLOT_COUNT) {
      G.inventorySlots.push(null);
    }
    for (var k = 0; k < G.inventorySlots.length; k++) {
      var cell = G.inventorySlots[k];
      if (cell && cell.kind === "lingshi") {
        var prev = typeof cell.count === "number" && isFinite(cell.count) ? Math.max(0, Math.floor(cell.count)) : 0;
        G.inventorySlots[k] = prev > 0 ? normalizeBagItem({ name: stoneName, count: prev }) : null;
      } else {
        G.inventorySlots[k] = normalizeBagItem(cell);
      }
    }
    enrichInventoryGradesFromDescribe(G);
    splitUniqueStackItemCellsInPlace(G);
    trimTrailingEmptyPlayerBagRows(G);
  }
  global.MjMainScreenPanelRealm = {
    STORAGE_KEY: STORAGE_KEY, DEFAULT_WORLD_TIME: DEFAULT_WORLD_TIME, DEFAULT_AGE: DEFAULT_AGE, DEFAULT_SHOUYUAN: DEFAULT_SHOUYUAN,
    DEFAULT_CHARM: DEFAULT_CHARM, DEFAULT_LUCK: DEFAULT_LUCK,
    INVENTORY_SLOT_COUNT: INVENTORY_SLOT_COUNT, INVENTORY_GRID_COLS: INVENTORY_GRID_COLS, GONGFA_SLOT_COUNT: GONGFA_SLOT_COUNT,
    EQUIP_SLOT_COUNT: EQUIP_SLOT_COUNT, EQUIP_SLOT_EMPTY_TITLE: EQUIP_SLOT_EMPTY_TITLE, EQUIP_SLOT_KIND_LABELS: EQUIP_SLOT_KIND_LABELS,
    bindMajorBreakthroughUi: bindMajorBreakthroughUi, bindNpcDetailModalUi: bindNpcDetailModalUi, restoreBootstrap: restoreBootstrap, ensureGameRuntimeDefaults: ensureGameRuntimeDefaults,
    ensureNearbyNpcsArray: ensureNearbyNpcsArray, normalizeNearbyNpcListInPlace: normalizeNearbyNpcListInPlace, buildDemoNearbyNpcSheet: buildDemoNearbyNpcSheet,
    mergeNearbyNpcListInPlace: mergeNearbyNpcListInPlace,
    sortNearbyNpcsForDisplay: sortNearbyNpcsForDisplay,
    applyRealmBreakthroughs: applyRealmBreakthroughs, logBreakthroughMessages: logBreakthroughMessages, computeCultivationUi: computeCultivationUi,
    persistBootstrapSnapshot: persistBootstrapSnapshot, syncNpcShouyuanFromRealmState: syncNpcShouyuanFromRealmState, ensureEquippedSlots: ensureEquippedSlots,
    ensureGongfaSlots: ensureGongfaSlots, ensureInventorySlots: ensureInventorySlots,
    bagItemSkipsSameNameStack: bagItemSkipsSameNameStack, enrichInventoryGradesFromDescribe: enrichInventoryGradesFromDescribe,
    continuityFieldsFromBagItem: continuityFieldsFromBagItem, renderNearbyNpcsPanel: renderNearbyNpcsPanel, performAbsorbSpiritStonesFromBag: performAbsorbSpiritStonesFromBag,
    clampXiuweiToLateStageCapIfNeeded: clampXiuweiToLateStageCapIfNeeded, normalizeBagItem: normalizeBagItem, pickDescribeValueFromMetas: pickDescribeValueFromMetas,
    lookupStuffMetaByItemName: lookupStuffMetaByItemName, lookupEquipmentMetaByItemName: lookupEquipmentMetaByItemName, lookupGongfaConfigDef: lookupGongfaConfigDef,
    resolveEquipmentMagnificationLine: resolveEquipmentMagnificationLine,
    equipmentIsFaqiForMagnificationRule: equipmentIsFaqiForMagnificationRule,
    resolveGongfaMagnificationLine: resolveGongfaMagnificationLine, resolveGongfaManacostLine: resolveGongfaManacostLine,
    formatReferenceValueFromNumber: formatReferenceValueFromNumber, formatPillEffectsForUi: formatPillEffectsForUi, getSpiritStoneRawPerPiece: getSpiritStoneRawPerPiece,
    formatSpiritStonePointsForUi: formatSpiritStonePointsForUi, getMajorBreakthroughReadyContext: getMajorBreakthroughReadyContext, closeMajorBreakthroughModal: closeMajorBreakthroughModal,
    syncLateStageBreakSuffixState: syncLateStageBreakSuffixState, bumpLateStageBreakFailCount: bumpLateStageBreakFailCount, setBarFill: setBarFill, numOrDash: numOrDash,
    formatLinggenPanelText: formatLinggenPanelText, buildTraitSlotTooltip: buildTraitSlotTooltip, clampPct: clampPct, setSlotRarityDataAttr: setSlotRarityDataAttr, resolveBagItemTraitRarity: resolveBagItemTraitRarity,
    resolveEquipTraitRarity: resolveEquipTraitRarity, resolveGongfaTraitRarity: resolveGongfaTraitRarity, formatEquipTypeLabel: formatEquipTypeLabel, mjClearBodyOverflowIfNoModal: mjClearBodyOverflowIfNoModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
