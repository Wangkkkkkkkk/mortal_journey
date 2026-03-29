/**
 * 主界面（main.html）：恢复开局数据、渲染左侧角色信息栏
 * 全局：MortalJourneyGame（sessionStorage 恢复 + 运行时字段）
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "mortal_journey_bootstrap_v1";
  var DEFAULT_WORLD_TIME = "0001年 01月 01日 08:00";
  var DEFAULT_AGE = 16;
  var DEFAULT_SHOUYUAN = 100;
  var DEFAULT_CHARM = 0;
  var DEFAULT_LUCK = 0;
  var INVENTORY_SLOT_COUNT = 12;
  /** 功法栏：与储物袋相同 3×4，共 12 格 */
  var GONGFA_SLOT_COUNT = 12;
  /** 佩戴栏固定 3 格：武器、法器（戒指/手环/飞行法等）、防具（不可超过 3 件） */
  var EQUIP_SLOT_COUNT = 3;
  var EQUIP_SLOT_EMPTY_TITLE = ["武器空位", "法器空位", "防具空位"];
  var EQUIP_SLOT_KIND_LABELS = ["武器", "法器", "防具"];

  function clampPct(n) {
    if (typeof n !== "number" || !isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function mjClearBodyOverflowIfNoModal() {
    var traitRoot = document.getElementById("mj-trait-detail-root");
    var itemRoot = document.getElementById("mj-item-detail-root");
    var npcRoot = document.getElementById("mj-npc-detail-root");
    var majorRoot = document.getElementById("mj-major-breakthrough-root");
    if (
      (!traitRoot || traitRoot.classList.contains("hidden")) &&
      (!itemRoot || itemRoot.classList.contains("hidden")) &&
      (!npcRoot || npcRoot.classList.contains("hidden")) &&
      (!majorRoot || majorRoot.classList.contains("hidden"))
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
      if (parts.length) lines.push("服用回复：" + parts.join("，"));
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
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(1, Math.floor(it.count)) : 1;
    if (cnt <= 1) G.inventorySlots[bi] = null;
    else {
      G.inventorySlots[bi] = normalizeBagItem({
        name: it.name,
        count: cnt - 1,
        desc: it.desc,
        equipType: it.equipType,
        grade: it.grade,
      });
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
    for (var b = 0; b < INVENTORY_SLOT_COUNT; b++) {
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
      if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) {
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
        renderLeftPanel(fc, G);
        renderBagSlots(G);
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
    renderLeftPanel(fc, G);
    renderBagSlots(G);
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
      var data = {
        fateChoice: G.fateChoice,
        startedAt: G.startedAt || 0,
        xiuwei: typeof G.xiuwei === "number" ? G.xiuwei : 0,
        shouyuan: typeof G.shouyuan === "number" && isFinite(G.shouyuan) ? Math.floor(G.shouyuan) : 0,
        age: typeof G.age === "number" && isFinite(G.age) ? Math.floor(G.age) : DEFAULT_AGE,
        inventorySlots: JSON.parse(JSON.stringify(G.inventorySlots)),
        gongfaSlots: JSON.parse(JSON.stringify(G.gongfaSlots || [])),
        equippedSlots: JSON.parse(JSON.stringify(G.equippedSlots || [])),
        lateStageBreakSuffix:
          ls && typeof ls === "object"
            ? {
                realmKey: String(ls.realmKey != null ? ls.realmKey : ""),
                failCount: Math.max(0, Math.floor(Number(ls.failCount) || 0)),
              }
            : { realmKey: "", failCount: 0 },
        nearbyNpcs: JSON.parse(JSON.stringify(Array.isArray(G.nearbyNpcs) ? G.nearbyNpcs : [])),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
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
      G.inventorySlots[bi] = normalizeBagItem({
        name: it.name,
        count: left,
        desc: it.desc,
        equipType: it.equipType,
        grade: it.grade,
      });
    }
    var br = applyRealmBreakthroughs(G);
    clampXiuweiToLateStageCapIfNeeded(G, G.fateChoice);
    logBreakthroughMessages(br.messages);
    var ui = computeCultivationUi(G, G.fateChoice);
    G.cultivationProgress = ui.pct;
    persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  function restoreBootstrap() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
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
        data.inventorySlots.length === INVENTORY_SLOT_COUNT;
      var gfOk =
        data.gongfaSlots &&
        Array.isArray(data.gongfaSlots) &&
        data.gongfaSlots.length === GONGFA_SLOT_COUNT;
      if (invOk) {
        global.MortalJourneyGame.inventorySlots = JSON.parse(JSON.stringify(data.inventorySlots));
      } else if (fc.birth && C && typeof C.buildStartingInventorySlots === "function") {
        global.MortalJourneyGame.inventorySlots = JSON.parse(
          JSON.stringify(C.buildStartingInventorySlots(fc.birth)),
        );
      }
      if (gfOk) {
        global.MortalJourneyGame.gongfaSlots = JSON.parse(JSON.stringify(data.gongfaSlots));
      } else if (fc.birth && C && typeof C.buildStartingGongfaSlots === "function") {
        global.MortalJourneyGame.gongfaSlots = JSON.parse(JSON.stringify(C.buildStartingGongfaSlots(fc.birth)));
      }

      var eqOk =
        data.equippedSlots &&
        Array.isArray(data.equippedSlots) &&
        data.equippedSlots.length === EQUIP_SLOT_COUNT;
      if (eqOk) {
        global.MortalJourneyGame.equippedSlots = JSON.parse(JSON.stringify(data.equippedSlots));
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

      if (data.lateStageBreakSuffix && typeof data.lateStageBreakSuffix === "object") {
        global.MortalJourneyGame.lateStageBreakSuffix = {
          realmKey: String(data.lateStageBreakSuffix.realmKey != null ? data.lateStageBreakSuffix.realmKey : ""),
          failCount: Math.max(0, Math.floor(Number(data.lateStageBreakSuffix.failCount) || 0)),
        };
      }

      if (Array.isArray(data.nearbyNpcs)) {
        global.MortalJourneyGame.nearbyNpcs = JSON.parse(JSON.stringify(data.nearbyNpcs));
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
    if (!Array.isArray(G.chatHistory)) G.chatHistory = [];
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

  function normalizeNearbyNpcListInPlace(G) {
    if (!G || !Array.isArray(G.nearbyNpcs)) return;
    var MCS = global.MjCharacterSheet;
    var PBR = global.PlayerBaseRuntime;
    if (!MCS || typeof MCS.normalize !== "function") return;
    var next = [];
    for (var i = 0; i < G.nearbyNpcs.length; i++) {
      try {
        var n = MCS.normalize(G.nearbyNpcs[i]);
        if (PBR && typeof PBR.applyComputedPlayerBaseToCharacterSheet === "function") {
          PBR.applyComputedPlayerBaseToCharacterSheet(n);
        }
        syncNpcShouyuanFromRealmState(n);
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
    if (!G || !G.nearbyNpcs.length) {
      var empty = document.createElement("p");
      empty.className = "mj-npc-list-empty";
      empty.style.cssText = "text-align:center;font-size:0.82rem;opacity:0.72;margin:14px 10px;color:var(--mj-muted, #999);";
      empty.textContent = "近处暂无其他人。";
      host.appendChild(empty);
      return;
    }
    var MCS = global.MjCharacterSheet;
    for (var i = 0; i < G.nearbyNpcs.length; i++) {
      var rawNpc = G.nearbyNpcs[i];
      var npc =
        MCS && typeof MCS.normalize === "function"
          ? MCS.normalize(rawNpc)
          : rawNpc;
      if (!npc || !npc.id) continue;

      var card = document.createElement("button");
      card.type = "button";
      card.className = "mj-npc-card mj-npc-card--sheet";
      card.setAttribute("data-npc-id", String(npc.id));

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

      var lead = document.createElement("div");
      lead.className = "mj-npc-card-lead";
      lead.appendChild(av);
      lead.appendChild(realmBelow);

      var main = document.createElement("div");
      main.className = "mj-npc-card-main";

      var title = document.createElement("div");
      title.className = "mj-npc-card-title";
      var nameSp = document.createElement("span");
      nameSp.className = "mj-npc-name";
      nameSp.textContent = npc.displayName || "—";
      title.appendChild(nameSp);

      card.setAttribute(
        "aria-label",
        (npc.displayName || "NPC") + "，" + realmLine + "，点击查看详情",
      );

      var maxH = typeof npc.maxHp === "number" && isFinite(npc.maxHp) ? Math.max(1, npc.maxHp) : 1;
      var maxM = typeof npc.maxMp === "number" && isFinite(npc.maxMp) ? Math.max(1, npc.maxMp) : 1;
      var curH = typeof npc.currentHp === "number" && isFinite(npc.currentHp) ? npc.currentHp : maxH;
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
    if (!Array.isArray(n.equippedSlots) || n.equippedSlots.length !== EQUIP_SLOT_COUNT) {
      n.equippedSlots = [null, null, null];
    } else {
      n.equippedSlots = JSON.parse(JSON.stringify(n.equippedSlots));
    }
    if (!Array.isArray(n.gongfaSlots) || n.gongfaSlots.length !== GONGFA_SLOT_COUNT) {
      var gfa = [];
      for (var g = 0; g < GONGFA_SLOT_COUNT; g++) gfa.push(null);
      n.gongfaSlots = gfa;
    } else {
      n.gongfaSlots = JSON.parse(JSON.stringify(n.gongfaSlots));
    }
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
    if (npc.avatarUrl) {
      var img = document.createElement("img");
      img.className = "mj-npc-detail-avatar-img";
      img.src = npc.avatarUrl;
      img.alt = npc.displayName || "";
      avWrap.appendChild(img);
    } else {
      var ph = document.createElement("div");
      ph.className = "mj-npc-detail-avatar-ph";
      ph.textContent = "立绘";
      avWrap.appendChild(ph);
    }
    var headText = document.createElement("div");
    headText.className = "mj-npc-detail-head-text";
    var realmBig = document.createElement("div");
    realmBig.className = "mj-npc-detail-realm-big";
    realmBig.textContent = "境界：" + realmLine;
    var idHint = document.createElement("div");
    idHint.className = "mj-npc-detail-id-line";
    idHint.textContent = "标识：" + (npc.id || "—");
    headText.appendChild(realmBig);
    headText.appendChild(idHint);
    head.appendChild(avWrap);
    head.appendChild(headText);
    bodyEl.appendChild(head);

    var req =
      RS && typeof RS.getCultivationRequired === "function"
        ? RS.getCultivationRequired(major, minorForReq)
        : null;
    var curX =
      typeof npc.xiuwei === "number" && isFinite(npc.xiuwei) ? Math.max(0, Math.floor(npc.xiuwei)) : 0;
    var displayX = req != null && req > 0 ? Math.min(curX, req) : curX;
    var cultPct = req != null && req > 0 ? clampPct((curX / req) * 100) : 0;
    var cultLabel =
      req != null && req > 0 ? Math.round(displayX) + " / " + Math.round(req) : Math.round(curX) + " / —";
    var cultRow = document.createElement("div");
    cultRow.className = "mj-resource-row";
    var cultHead = document.createElement("div");
    cultHead.className = "mj-resource-label";
    var cLab = document.createElement("span");
    cLab.textContent = "修炼进度";
    var cNums = document.createElement("span");
    cNums.className = "mj-resource-nums";
    cNums.textContent = cultLabel;
    cultHead.appendChild(cLab);
    cultHead.appendChild(cNums);
    var cultBar = document.createElement("div");
    cultBar.className = "mj-bar";
    cultBar.setAttribute("role", "progressbar");
    cultBar.setAttribute("aria-valuenow", String(Math.round(clampPct(cultPct))));
    var cultFill = document.createElement("div");
    cultFill.className = "mj-bar-fill mj-bar-fill--cultivation";
    cultBar.appendChild(cultFill);
    cultRow.appendChild(cultHead);
    cultRow.appendChild(cultBar);
    bodyEl.appendChild(cultRow);
    setBarFill(cultFill, cultBar, cultPct, cNums, cultLabel);
    if (req != null && req > 0 && curX > req) {
      cultBar.setAttribute(
        "title",
        "本阶段修为已足，当前累计 " + Math.round(curX) + "（可突破后计入下阶段）",
      );
    }

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
    bodyEl.appendChild(idBlock);

    var tb = document.createElement("div");
    tb.className = "mj-talent-block";
    var th = document.createElement("div");
    th.className = "mj-talent-heading";
    th.textContent = "天赋";
    var tr = document.createElement("div");
    tr.className = "mj-talent-row";
    tr.setAttribute("role", "group");
    var traits = npc.traits || [];
    for (var ti = 0; ti < 5; ti++) {
      var tslot = document.createElement("div");
      tslot.setAttribute("data-trait-slot", String(ti));
      var trt = traits[ti];
      if (trt && trt.name) {
        tslot.className = "mj-trait-slot mj-trait-slot--filled";
        if (trt.rarity) tslot.setAttribute("data-rarity", String(trt.rarity));
        var tin = document.createElement("span");
        tin.className = "mj-trait-slot-inner";
        tin.textContent = String(trt.name);
        tslot.appendChild(tin);
        tslot.setAttribute("title", buildTraitSlotTooltip(trt));
        tslot.setAttribute("role", "button");
        tslot.setAttribute("tabindex", "0");
        tslot.setAttribute("aria-label", "查看天赋：" + String(trt.name));
      } else {
        tslot.className = "mj-trait-slot mj-trait-slot--empty";
        var tin2 = document.createElement("span");
        tin2.className = "mj-trait-slot-inner";
        tin2.textContent = "—";
        tslot.appendChild(tin2);
      }
      tr.appendChild(tslot);
    }
    tb.appendChild(th);
    tb.appendChild(tr);
    bodyEl.appendChild(tb);

    var pb = npc.playerBase || {};
    appendNpcDetailSectionTitle(bodyEl, "属性", true);

    var maxH = typeof npc.maxHp === "number" && isFinite(npc.maxHp) ? Math.max(1, npc.maxHp) : 1;
    var maxM = typeof npc.maxMp === "number" && isFinite(npc.maxMp) ? Math.max(1, npc.maxMp) : 1;
    var curH = typeof npc.currentHp === "number" && isFinite(npc.currentHp) ? npc.currentHp : maxH;
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
      bodyEl.appendChild(row);
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
    bodyEl.appendChild(combat);

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
    bodyEl.appendChild(eqWrap);

    var bagStack = document.createElement("div");
    bagStack.className = "mj-player-bag-stack";
    var gfH = document.createElement("h3");
    gfH.className = "mj-attr-section-title";
    gfH.textContent = "功法";
    var gfScroll = document.createElement("div");
    gfScroll.className = "mj-bag-grid-scroll";
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
        var tyRaw =
          gs && gs.type != null && String(gs.type).trim() !== ""
            ? String(gs.type).trim()
            : cfgGf && cfgGf.type != null
              ? String(cfgGf.type).trim()
              : "";
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

    var bagH = document.createElement("h3");
    bagH.className = "mj-attr-section-title";
    bagH.textContent = "储物袋";
    var bagScroll = document.createElement("div");
    bagScroll.className = "mj-bag-grid-scroll";
    bagScroll.setAttribute("aria-label", "储物袋格子");
    var bagGrid = document.createElement("div");
    bagGrid.className = "mj-inventory-grid";
    bagGrid.id = "mj-npc-detail-bag-grid";
    bagGrid.setAttribute("aria-label", "NPC 储物袋");
    for (var bi = 0; bi < INVENTORY_SLOT_COUNT; bi++) {
      var bSlot = document.createElement("div");
      bSlot.className = "mj-inventory-slot mj-inventory-slot--empty";
      bSlot.setAttribute("data-slot", String(bi));
      var bLab = document.createElement("span");
      bLab.className = "mj-inventory-slot-label";
      var bQty = document.createElement("span");
      bQty.className = "mj-inventory-slot-qty";
      bQty.setAttribute("aria-label", "数量");
      bSlot.appendChild(bLab);
      bSlot.appendChild(bQty);
      var bit = npc.inventorySlots[bi];
      if (bit && bit.name) {
        bSlot.classList.add("mj-inventory-slot--filled");
        bSlot.classList.remove("mj-inventory-slot--empty");
        bLab.textContent = bit.name;
        var bcnt = typeof bit.count === "number" && isFinite(bit.count) ? bit.count : 1;
        bQty.textContent = String(bcnt);
        bQty.classList.remove("hidden");
        var bTip = bit.name;
        if (bit.desc) bTip += "\n" + bit.desc;
        bTip += "\n数量：" + bcnt + "（点击查看详情）";
        bSlot.setAttribute("title", bTip);
        bSlot.setAttribute("aria-label", bit.name + "，数量 " + bcnt);
        bSlot.setAttribute("role", "button");
        bSlot.setAttribute("tabindex", "0");
        setSlotRarityDataAttr(bSlot, resolveBagItemTraitRarity(bit.name, bit));
      } else {
        bSlot.setAttribute("title", "空位");
        bQty.classList.add("hidden");
        setSlotRarityDataAttr(bSlot, null);
      }
      bagGrid.appendChild(bSlot);
    }
    bagScroll.appendChild(bagGrid);
    bagStack.appendChild(bagH);
    bagStack.appendChild(bagScroll);
    bodyEl.appendChild(bagStack);
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
    subEl.textContent =
      MCS && MCS.formatRealmLine ? "境界：" + MCS.formatRealmLine(npc.realm) : "境界：—";
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
        tryOpenNpcDetailSubInspect(e.target);
      });
      root.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (root.classList.contains("hidden")) return;
        var body = document.getElementById("mj-npc-detail-body");
        if (!body || !body.contains(e.target)) return;
        if (e.key === " ") e.preventDefault();
        tryOpenNpcDetailSubInspect(e.target);
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
    if (!Array.isArray(G.equippedSlots) || G.equippedSlots.length !== EQUIP_SLOT_COUNT) {
      G.equippedSlots = [null, null, null];
      return;
    }
  }

  function ensureGongfaSlots(G) {
    if (!G) return;
    if (!Array.isArray(G.gongfaSlots) || G.gongfaSlots.length !== GONGFA_SLOT_COUNT) {
      var a = [];
      for (var j = 0; j < GONGFA_SLOT_COUNT; j++) a.push(null);
      G.gongfaSlots = a;
    }
  }

  function normalizeBagItem(entry) {
    if (entry == null) return null;
    var name =
      entry.name != null
        ? String(entry.name).trim()
        : entry.label != null
          ? String(entry.label).trim()
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
    return o;
  }

  /** 旧存档格子上无 grade 时，按描述表补全（刷新后即可上色） */
  function enrichInventoryGradesFromDescribe(G) {
    if (!G || !G.inventorySlots) return;
    var C = global.MjCreationConfig;
    if (!C) return;
    for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      var it = G.inventorySlots[i];
      if (!it || !it.name) continue;
      if (it.grade != null && String(it.grade).trim() !== "") continue;
      var nm = String(it.name).trim();
      if (!nm) continue;
      if (typeof C.getStuffDescribe === "function") {
        var st = C.getStuffDescribe(nm);
        if (st && st.grade != null && String(st.grade).trim() !== "") {
          it.grade = String(st.grade).trim();
          continue;
        }
      }
      if (typeof C.getEquipmentDescribe === "function") {
        var em = C.getEquipmentDescribe(nm);
        if (em && em.grade != null && String(em.grade).trim() !== "") it.grade = String(em.grade).trim();
      }
    }
  }

  /** 储物袋 12 格均为物品 { name, count, desc? }；兼容旧存档第 0 格 kind:lingshi → 下品灵石 */
  function ensureInventorySlots(G) {
    if (!G) return;
    var C = global.MjCreationConfig;
    var stoneName =
      C && C.LINGSHI_STACK_ITEM_NAME ? String(C.LINGSHI_STACK_ITEM_NAME) : "下品灵石";
    if (!Array.isArray(G.inventorySlots) || G.inventorySlots.length !== INVENTORY_SLOT_COUNT) {
      var a = [];
      for (var j = 0; j < INVENTORY_SLOT_COUNT; j++) a.push(null);
      G.inventorySlots = a;
      return;
    }
    for (var k = 0; k < INVENTORY_SLOT_COUNT; k++) {
      var cell = G.inventorySlots[k];
      if (cell && cell.kind === "lingshi") {
        var prev = typeof cell.count === "number" && isFinite(cell.count) ? Math.max(0, Math.floor(cell.count)) : 0;
        G.inventorySlots[k] = prev > 0 ? normalizeBagItem({ name: stoneName, count: prev }) : null;
      } else {
        G.inventorySlots[k] = normalizeBagItem(cell);
      }
    }
    enrichInventoryGradesFromDescribe(G);
  }

  function getChatLogEl() {
    return document.getElementById("mj-chat-log");
  }

  function clearChatPlaceholders() {
    var log = getChatLogEl();
    if (!log) return;
    var nodes = log.querySelectorAll(".mj-chat-placeholder");
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  function scrollChatLog() {
    var log = getChatLogEl();
    if (log) log.scrollTop = log.scrollHeight;
  }

  var _chatFeedbackGen = 0;
  var _chatStatusTick = null;
  var _chatStatusStart = 0;
  var _chatStatusStream = false;

  function getChatStatusEl() {
    return document.getElementById("mj-chat-status");
  }

  function clearChatStatusTick() {
    if (_chatStatusTick != null) {
      clearInterval(_chatStatusTick);
      _chatStatusTick = null;
    }
  }

  function setChatStatusUi(phase, text) {
    var el = getChatStatusEl();
    if (!el) return;
    el.className = "mj-chat-status mj-chat-status--" + phase;
    el.textContent = text != null ? String(text) : "";
  }

  function formatElapsedSec(fromMs) {
    var s = (Date.now() - fromMs) / 1000;
    return (Math.round(s * 10) / 10).toFixed(1);
  }

  /**
   * @param {HTMLTextAreaElement|null} textarea
   * @param {boolean} streamingStarted
   */
  function startAiReplyFeedback(textarea, streamingStarted) {
    var gen = ++_chatFeedbackGen;
    clearChatStatusTick();
    _chatStatusStart = Date.now();
    _chatStatusStream = !!streamingStarted;
    if (textarea) textarea.disabled = true;

    function tickText() {
      var sec = formatElapsedSec(_chatStatusStart);
      if (_chatStatusStream) return "正在接收 AI 回复… 已 " + sec + " 秒";
      return "等待 AI 回复中… 已等待 " + sec + " 秒";
    }

    setChatStatusUi("waiting", tickText());
    _chatStatusTick = setInterval(function () {
      if (gen !== _chatFeedbackGen) return;
      var el = getChatStatusEl();
      if (!el) return;
      el.textContent = tickText();
      if (_chatStatusStream) el.className = "mj-chat-status mj-chat-status--streaming";
      else el.className = "mj-chat-status mj-chat-status--waiting";
    }, 250);

    return gen;
  }

  function markAiStreamStarted() {
    _chatStatusStream = true;
  }

  /**
   * @param {number} gen
   * @param {HTMLTextAreaElement|null} textarea
   * @param {"done"|"error"} outcome
   * @param {string} [errDetail]
   */
  function finishAiReplyFeedback(gen, textarea, outcome, errDetail) {
    if (gen !== _chatFeedbackGen) return;
    clearChatStatusTick();
    var total = formatElapsedSec(_chatStatusStart);

    if (outcome === "done") {
      setChatStatusUi("done", "回复完成，总用时 " + total + " 秒。");
      window.setTimeout(function () {
        if (gen !== _chatFeedbackGen) return;
        setChatStatusUi("idle", "");
      }, 4500);
      return;
    }

    var errShort =
      errDetail && String(errDetail).trim()
        ? String(errDetail).trim().slice(0, 160)
        : "未知错误";
    setChatStatusUi("error", "回复失败（约 " + total + " 秒）：" + errShort);
    window.setTimeout(function () {
      if (gen !== _chatFeedbackGen) return;
      setChatStatusUi("idle", "");
    }, 10000);
  }

  function flashChatStatusError(message) {
    _chatFeedbackGen++;
    clearChatStatusTick();
    var gen = _chatFeedbackGen;
    setChatStatusUi("error", String(message || ""));
    window.setTimeout(function () {
      if (gen !== _chatFeedbackGen) return;
      setChatStatusUi("idle", "");
    }, 8000);
  }

  /**
   * @param {"user"|"assistant"|"error"} role
   * @returns {{ root: HTMLElement, body: HTMLElement }|null}
   */
  function appendChatBubble(role, text) {
    var log = getChatLogEl();
    if (!log) return null;
    clearChatPlaceholders();
    var wrap = document.createElement("div");
    wrap.className = "mj-chat-msg--role mj-chat-msg--" + role;
    var label = document.createElement("span");
    label.className = "mj-chat-role-label";
    if (role === "user") label.textContent = "你";
    else if (role === "assistant") label.textContent = "剧情";
    else label.textContent = "提示";
    var body = document.createElement("div");
    body.textContent = text != null ? String(text) : "";
    wrap.appendChild(label);
    wrap.appendChild(body);
    log.appendChild(wrap);
    scrollChatLog();
    return { root: wrap, body: body };
  }

  function handleChatSend(textarea, sendBtn) {
    var text = String(textarea.value || "").trim();
    if (!text) return;

    var G = global.MortalJourneyGame;
    if (!G) return;
    ensureGameRuntimeDefaults(G);

    var prior = (G.chatHistory || []).slice();

    var SC = global.MortalJourneyStoryChat;
    if (!SC || typeof SC.sendTurn !== "function") {
      flashChatStatusError("剧情模块未加载，无法请求 AI。");
      appendChatBubble("error", "剧情模块未加载（缺少 story_generate.js）。");
      return;
    }

    G.chatHistory.push({ role: "user", content: text });
    textarea.value = "";
    appendChatBubble("user", text);

    var feedbackGen = startAiReplyFeedback(textarea, false);
    var streamNotified = false;

    var messages =
      typeof SC.buildMessages === "function"
        ? SC.buildMessages({ userText: text, priorHistory: prior })
        : null;
    if (messages && global.GameLog && typeof global.GameLog.info === "function") {
      try {
        var human =
          typeof SC.formatMessagesForHumanLog === "function"
            ? SC.formatMessagesForHumanLog(messages)
            : "";
        var jsonStr = JSON.stringify(messages, null, 2);
        global.GameLog.info(
          "[剧情→AI] 本次请求\n\n—— 易读排版 ——\n" +
            (human || jsonStr) +
            "\n\n—— 原始 JSON（可复制） ——\n" +
            jsonStr,
        );
      } catch (logErr) {
        global.GameLog.info("[剧情→AI] 用户输入（messages 无法序列化）：" + text.slice(0, 800));
      }
    }

    var asstUi = appendChatBubble("assistant", "");
    var assistantBody = asstUi ? asstUi.body : null;
    var assistantRoot = asstUi ? asstUi.root : null;
    sendBtn.disabled = true;

    SC.sendTurn({
      messages: messages,
      userText: text,
      priorHistory: prior,
      shouldStream: true,
      onDelta: function (_delta, full) {
        if (!streamNotified) {
          streamNotified = true;
          markAiStreamStarted();
        }
        if (assistantBody) assistantBody.textContent = full || "";
        scrollChatLog();
      },
    })
      .then(function (full) {
        var reply = full != null ? String(full) : "";
        G.chatHistory.push({ role: "assistant", content: reply });
        if (assistantBody) assistantBody.textContent = reply;
        scrollChatLog();
        finishAiReplyFeedback(feedbackGen, textarea, "done");
      })
      .catch(function (err) {
        if (
          assistantBody &&
          !String(assistantBody.textContent || "").trim() &&
          assistantRoot &&
          assistantRoot.parentNode
        ) {
          assistantRoot.parentNode.removeChild(assistantRoot);
        }
        var msg =
          err && err.message
            ? String(err.message)
            : "请求失败。若未配置 API，请检查 silly_tarven/bridge-config.js 中的 fixedPreset。";
        finishAiReplyFeedback(feedbackGen, textarea, "error", msg);
        appendChatBubble("error", msg);
        console.warn("[主界面] 剧情请求失败", err);
        if (global.GameLog && typeof global.GameLog.info === "function") {
          global.GameLog.info("[主界面] 剧情请求失败：" + msg.slice(0, 300));
        }
      })
      .then(function () {
        sendBtn.disabled = false;
        if (textarea) textarea.disabled = false;
      });
  }

  /**
   * 大境界前「后期」：切换境界段时重置；同一段内记录突破失败次数（影响圆满/巅峰显示）。
   */
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

  function formatRealmLine(fc, G) {
    var r = (fc && fc.realm) || (G && G.realm) || {};
    var major = r.major || "练气";
    var minor = r.minor || "初期";
    var line = "境界：" + major + minor;
    if (G && fc) {
      syncLateStageBreakSuffixState(G, fc);
      var cult = computeCultivationUi(G, fc);
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
    titleEl.textContent = "【开局总览】";
    root.appendChild(titleEl);

    var intro = document.createElement("p");
    intro.className = "mj-chat-overview-intro";
    intro.textContent = "出身、境界、灵根与战斗属性已在左侧「角色信息」中展示；此处仅汇总天赋与世界因子。";
    root.appendChild(intro);

    appendOverviewSection(root, "天赋词条");
    var traits = Array.isArray(fc.traits) ? fc.traits : [];
    if (!traits.length) {
      var noTrait = document.createElement("p");
      noTrait.className = "mj-chat-overview-muted";
      noTrait.textContent = "未携带天赋词条（凡人模式或未锁定词条）。";
      root.appendChild(noTrait);
    } else {
      var ulTrait = document.createElement("ul");
      ulTrait.className = "mj-chat-overview-ul";
      for (var ti = 0; ti < traits.length; ti++) {
        var t = traits[ti];
        if (!t) continue;
        var li = document.createElement("li");
        li.className = "mj-chat-overview-li";
        var strong = document.createElement("strong");
        strong.textContent = (t.name || "（无名）") + (t.rarity ? " · " + t.rarity : "");
        li.appendChild(strong);
        if (t.desc) {
          li.appendChild(document.createElement("br"));
          var sd = document.createElement("span");
          sd.className = "mj-chat-overview-sub";
          sd.textContent = t.desc;
          li.appendChild(sd);
        }
        if (t.effects) {
          li.appendChild(document.createElement("br"));
          var se = document.createElement("span");
          se.className = "mj-chat-overview-effect";
          se.textContent = "效果：" + t.effects;
          li.appendChild(se);
        }
        ulTrait.appendChild(li);
      }
      root.appendChild(ulTrait);
    }

    appendOverviewSection(root, "世界因子");
    var factors = Array.isArray(fc.worldFactors) ? fc.worldFactors : [];
    if (!factors.length) {
      var noWf = document.createElement("p");
      noWf.className = "mj-chat-overview-muted";
      noWf.textContent = "未勾选预设世界因子；剧情将按默认凡人界设定展开。";
      root.appendChild(noWf);
    } else {
      var ulWf = document.createElement("ul");
      ulWf.className = "mj-chat-overview-ul";
      for (var wi = 0; wi < factors.length; wi++) {
        var f = factors[wi];
        if (!f) continue;
        var liw = document.createElement("li");
        liw.className = "mj-chat-overview-li";
        var sw = document.createElement("strong");
        sw.textContent = (f.name || "—") + (f.isCustom ? "（自定义）" : "");
        liw.appendChild(sw);
        if (f.desc) {
          liw.appendChild(document.createElement("br"));
          var sfd = document.createElement("span");
          sfd.className = "mj-chat-overview-sub";
          sfd.textContent = f.desc;
          liw.appendChild(sfd);
        }
        if (f.effect) {
          liw.appendChild(document.createElement("br"));
          var sfe = document.createElement("span");
          sfe.className = "mj-chat-overview-effect";
          sfe.textContent = "效果：" + f.effect;
          liw.appendChild(sfe);
        }
        ulWf.appendChild(liw);
      }
      root.appendChild(ulWf);
    }

    log.appendChild(root);
  }

  function setBarFill(fillEl, barHost, pct, textEl, textStr) {
    if (fillEl) fillEl.style.width = clampPct(pct) + "%";
    if (barHost) barHost.setAttribute("aria-valuenow", String(Math.round(clampPct(pct))));
    if (textEl && textStr != null) textEl.textContent = textStr;
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
    ensureInventorySlots(G);
    enrichInventoryGradesFromDescribe(G);
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
        setSlotRarityDataAttr(el, resolveBagItemTraitRarity(item.name, item));
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
        setSlotRarityDataAttr(el, null);
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
    ensureGongfaSlots(G);
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
        var cfgGf = lookupGongfaConfigDef(String(label));
        var tyRaw =
          item && item.type != null && String(item.type).trim() !== ""
            ? String(item.type).trim()
            : cfgGf && cfgGf.type != null
              ? String(cfgGf.type).trim()
              : "";
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
        setSlotRarityDataAttr(el, resolveGongfaTraitRarity(String(label), item, cfgGf));
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
        setSlotRarityDataAttr(el, null);
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

  function findFirstEmptyBagSlot(G) {
    ensureInventorySlots(G);
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
    ensureInventorySlots(G);
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
    G.inventorySlots[j] = normalizeBagItem({
      name: name,
      count: cnt,
      desc: desc || undefined,
      equipType: payload.equipType,
      grade: payload.grade,
    });
    return true;
  }

  function findFirstEmptyGongfaSlot(G) {
    ensureGongfaSlots(G);
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

  /**
   * 从功法栏卸下放入储物袋。
   * @param {number} gfIdx 0～11
   * @returns {boolean}
   */
  function performUnequipGongfaToBag(gfIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    ensureGameRuntimeDefaults(G);
    var gi = Number(gfIdx);
    if (!isFinite(gi) || gi < 0 || gi >= GONGFA_SLOT_COUNT) return false;
    var item = G.gongfaSlots[gi];
    var nm =
      item && item.name != null
        ? String(item.name).trim()
        : item && item.label != null
          ? String(item.label).trim()
          : "";
    if (!nm) return false;
    var cfgGf = lookupGongfaConfigDef(nm);
    var descStr =
      item.desc != null && String(item.desc).trim() !== ""
        ? String(item.desc).trim()
        : cfgGf && cfgGf.desc != null
          ? String(cfgGf.desc).trim()
          : "";
    var payload = { name: nm, count: 1, desc: descStr };
    var gr =
      item && item.grade != null && String(item.grade).trim() !== ""
        ? String(item.grade).trim()
        : cfgGf && cfgGf.grade != null
          ? String(cfgGf.grade).trim()
          : "";
    if (gr) payload.grade = gr;
    if (!tryPlaceItemInBag(G, payload)) {
      notifyBagFull();
      return false;
    }
    G.gongfaSlots[gi] = null;
    persistBootstrapSnapshot();
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
    ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var nm = String(it.name).trim();
    var cfgGf = lookupGongfaConfigDef(nm);
    if (!cfgGf) return false;

    var j = findFirstEmptyGongfaSlot(G);
    if (j < 0) {
      notifyGongfaBarFull();
      return false;
    }

    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
    if (cnt < 1) return false;

    var ty =
      it.type != null && String(it.type).trim() !== ""
        ? String(it.type).trim()
        : cfgGf.type != null
          ? String(cfgGf.type).trim()
          : "";
    var descStr = "";
    if (it.desc != null && String(it.desc).trim() !== "") descStr = String(it.desc).trim();
    else if (cfgGf.desc != null) descStr = String(cfgGf.desc).trim();

    var gfObj = { name: nm, desc: descStr };
    if (ty) gfObj.type = ty;
    var gGr =
      it.grade != null && String(it.grade).trim() !== ""
        ? String(it.grade).trim()
        : cfgGf.grade != null
          ? String(cfgGf.grade).trim()
          : "";
    if (gGr) gfObj.grade = gGr;

    if (cnt > 1) {
      G.inventorySlots[bi] = normalizeBagItem({
        name: it.name,
        count: cnt - 1,
        desc: it.desc,
        equipType: it.equipType,
        grade: it.grade,
      });
    } else {
      G.inventorySlots[bi] = null;
    }

    G.gongfaSlots[j] = gfObj;
    persistBootstrapSnapshot();
    renderLeftPanel(G.fateChoice, G);
    return true;
  }

  /** 背包格物品是否可穿戴：有佩戴部位（格子上 equipType 或配置 equipment.type）则返回栏位索引 0～2 */
  function resolveWearableSlotIndexForBagItem(it) {
    if (!it || !it.name) return null;
    var ty = it.equipType != null ? String(it.equipType).trim() : "";
    if (!ty) {
      var em = lookupEquipmentMetaByItemName(String(it.name).trim());
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

  /**
   * 从佩戴栏卸下放入储物袋。
   * @param {number} equipIdx 0～2
   * @returns {boolean}
   */
  function performUnequipToBag(equipIdx) {
    var G = global.MortalJourneyGame;
    if (!G) return false;
    ensureGameRuntimeDefaults(G);
    var ei = Number(equipIdx);
    if (!isFinite(ei) || ei < 0 || ei >= EQUIP_SLOT_COUNT) return false;
    var item = G.equippedSlots[ei];
    if (!item) return false;
    var nm = item.name != null ? String(item.name).trim() : "";
    if (!nm) return false;
    var payload = {
      name: nm,
      count: 1,
      desc: item.desc != null ? String(item.desc) : "",
      equipType: item.equipType,
    };
    if (!tryPlaceItemInBag(G, payload)) {
      notifyBagFull();
      return false;
    }
    G.equippedSlots[ei] = null;
    persistBootstrapSnapshot();
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
    ensureGameRuntimeDefaults(G);
    var bi = Number(bagIdx);
    if (!isFinite(bi) || bi < 0 || bi >= INVENTORY_SLOT_COUNT) return false;
    var it = G.inventorySlots[bi];
    if (!it || !it.name) return false;
    var slotIdx = resolveWearableSlotIndexForBagItem(it);
    if (slotIdx == null) return false;

    var prev = G.equippedSlots[slotIdx];
    if (prev && prev.name) {
      if (
        !tryPlaceItemInBag(G, {
          name: String(prev.name).trim(),
          count: 1,
          desc: prev.desc != null ? String(prev.desc) : "",
          equipType: prev.equipType,
        })
      ) {
        notifyBagFull();
        return false;
      }
    }

    var cnt = typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
    if (cnt < 1) return false;

    var eqMeta = lookupEquipmentMetaByItemName(String(it.name).trim());
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

    if (cnt > 1) {
      G.inventorySlots[bi] = normalizeBagItem({
        name: it.name,
        count: cnt - 1,
        desc: it.desc,
        equipType: it.equipType,
      });
    } else {
      G.inventorySlots[bi] = null;
    }

    G.equippedSlots[slotIdx] = equipObj;
    persistBootstrapSnapshot();
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
      if (!performAbsorbSpiritStonesFromBag(GG, bagIdx, false, n)) return;
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
    mjClearBodyOverflowIfNoModal();
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
    var cfgDef = lookupGongfaConfigDef(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = cfgDef && cfgDef.desc != null ? String(cfgDef.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyShow =
      item.type != null && String(item.type).trim() !== ""
        ? String(item.type).trim()
        : cfgDef && cfgDef.type != null
          ? String(cfgDef.type).trim()
          : "";
    var sections = [];
    if (tyShow) sections.push({ label: "类型", text: tyShow });
    if (desc) sections.push({ label: "简介", text: desc });
    var bonusLine = cfgDef && cfgDef.bonus ? formatZhBonusObject(cfgDef.bonus) : "";
    if (bonusLine) sections.push({ label: "修炼加成", text: bonusLine });
    var refGf = formatReferenceValueLine(cfgDef);
    if (refGf) sections.push({ label: "价值", text: refGf });
    if (!sections.length) sections.push({ label: "说明", text: "暂无详细描述。" });
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
      resolveGongfaTraitRarity(name, item, cfgDef),
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
    var stuffMeta = lookupStuffMetaByItemName(it.name);
    var eqMeta = lookupEquipmentMetaByItemName(it.name);
    var gfMeta = lookupGongfaConfigDef(String(it.name).trim());
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
    }
    var wearSlot = resolveWearableSlotIndexForBagItem(it);
    if (wearSlot != null) {
      var tyShow = it.equipType
        ? formatEquipTypeLabel(it.equipType)
        : eqMeta && eqMeta.type
          ? formatEquipTypeLabel(eqMeta.type)
          : EQUIP_SLOT_KIND_LABELS[wearSlot] || "装备";
      sections.push({ label: "佩戴部位", text: tyShow });
    }
    var bonusStuff = stuffMeta && stuffMeta.bonus ? formatStuffBonusForDisplay(stuffMeta.bonus) : "";
    var bonusEq = eqMeta && eqMeta.bonus ? formatZhBonusObject(eqMeta.bonus) : "";
    if (bonusStuff) sections.push({ label: "效果", text: bonusStuff });
    var pillFx =
      stuffMeta && stuffMeta.effects ? formatPillEffectsForUi(stuffMeta.effects) : "";
    if (pillFx) sections.push({ label: "药效", text: pillFx });
    if (bonusEq) sections.push({ label: "属性加成", text: bonusEq });
    if (gfMeta) {
      if (gfMeta.type != null && String(gfMeta.type).trim() !== "") {
        sections.push({ label: "功法类型", text: String(gfMeta.type).trim() });
      }
      var gfBonusLine = gfMeta.bonus ? formatZhBonusObject(gfMeta.bonus) : "";
      if (gfBonusLine) sections.push({ label: "修炼加成", text: gfBonusLine });
    }
    var refNum = pickDescribeValueFromMetas(stuffMeta, eqMeta, gfMeta);
    var refBag = formatReferenceValueFromNumber(refNum);
    if (refBag) sections.push({ label: "价值", text: refBag });
    sections.push({ label: "持有数量", text: String(cnt) });

    var spiritStonePerRaw = getSpiritStoneRawPerPiece(it.name, G.fateChoice);
    var hasSpiritStoneCult = spiritStonePerRaw > 0;
    if (hasSpiritStoneCult) {
      sections.push({
        label: "修炼",
        text: "每个灵石可提供 " + formatSpiritStonePointsForUi(spiritStonePerRaw) + " 点修为。",
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
    if (gfMeta) {
      actions.push({
        label: "装入功法栏",
        primary: !hasSpiritStoneCult && wearSlot == null,
        onClick: function () {
          closeItemDetailModal();
          performEquipGongfaFromBag(idx);
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
          if (!performAbsorbSpiritStonesFromBag(GG, idx, true)) return;
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
    openItemDetailModal(
      String(it.name),
      "物品",
      sections,
      actions,
      resolveBagItemTraitRarity(it.name, it),
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
    var meta = lookupEquipmentMetaByItemName(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = meta && meta.desc != null ? String(meta.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyLabel = item.equipType
      ? formatEquipTypeLabel(item.equipType)
      : EQUIP_SLOT_KIND_LABELS[idx] || "装备";
    var sections = [];
    sections.push({ label: "佩戴部位", text: tyLabel });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    var bonusLine = meta && meta.bonus ? formatZhBonusObject(meta.bonus) : "";
    if (bonusLine) sections.push({ label: "属性加成", text: bonusLine });
    var refEq = formatReferenceValueLine(meta);
    if (refEq) sections.push({ label: "价值", text: refEq });
    openItemDetailModal(name, "装备", sections, [
      {
        label: "卸下",
        onClick: function () {
          closeItemDetailModal();
          performUnequipToBag(idx);
        },
      },
    ], resolveEquipTraitRarity(name, item));
  }

  /** NPC 详情内：只读功法详情（无卸下等操作） */
  function openReadOnlyGongfaItemDetail(item) {
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var cfgDef = lookupGongfaConfigDef(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = cfgDef && cfgDef.desc != null ? String(cfgDef.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyShow =
      item.type != null && String(item.type).trim() !== ""
        ? String(item.type).trim()
        : cfgDef && cfgDef.type != null
          ? String(cfgDef.type).trim()
          : "";
    var sections = [];
    if (tyShow) sections.push({ label: "类型", text: tyShow });
    if (desc) sections.push({ label: "简介", text: desc });
    var bonusLine = cfgDef && cfgDef.bonus ? formatZhBonusObject(cfgDef.bonus) : "";
    if (bonusLine) sections.push({ label: "修炼加成", text: bonusLine });
    var refGf = formatReferenceValueLine(cfgDef);
    if (refGf) sections.push({ label: "价值", text: refGf });
    if (!sections.length) sections.push({ label: "说明", text: "暂无详细描述。" });
    openItemDetailModal(name, "功法", sections, [], resolveGongfaTraitRarity(name, item, cfgDef));
  }

  /** NPC 详情内：只读装备详情 */
  function openReadOnlyEquipItemDetail(item, slotIdx) {
    if (!item || !(item.name != null ? item.name : item.label)) return;
    var name = String(item.name != null ? item.name : item.label);
    var meta = lookupEquipmentMetaByItemName(name);
    var descRuntime = item.desc != null ? String(item.desc).trim() : "";
    var descCfg = meta && meta.desc != null ? String(meta.desc).trim() : "";
    var desc = descRuntime || descCfg || "";
    var tyLabel = item.equipType
      ? formatEquipTypeLabel(item.equipType)
      : EQUIP_SLOT_KIND_LABELS[slotIdx] || "装备";
    var sections = [];
    sections.push({ label: "佩戴部位", text: tyLabel });
    if (desc) sections.push({ label: "简介", text: desc });
    else sections.push({ label: "简介", text: "暂无详细描述。" });
    var bonusLine = meta && meta.bonus ? formatZhBonusObject(meta.bonus) : "";
    if (bonusLine) sections.push({ label: "属性加成", text: bonusLine });
    var refEq = formatReferenceValueLine(meta);
    if (refEq) sections.push({ label: "价值", text: refEq });
    openItemDetailModal(name, "装备", sections, [], resolveEquipTraitRarity(name, item));
  }

  /**
   * NPC 详情内：只读物品详情（无穿戴/修炼）；fcForStoneEfficiency 传 { linggen } 用于灵石修为说明。
   */
  function openReadOnlyBagItemDetail(it, fcForStoneEfficiency) {
    if (!it || !it.name) return;
    var cnt = typeof it.count === "number" ? it.count : 1;
    var stuffMeta = lookupStuffMetaByItemName(it.name);
    var eqMeta = lookupEquipmentMetaByItemName(it.name);
    var gfMeta = lookupGongfaConfigDef(String(it.name).trim());
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
    }
    var wearSlot = resolveWearableSlotIndexForBagItem(it);
    if (wearSlot != null) {
      var tyShow = it.equipType
        ? formatEquipTypeLabel(it.equipType)
        : eqMeta && eqMeta.type
          ? formatEquipTypeLabel(eqMeta.type)
          : EQUIP_SLOT_KIND_LABELS[wearSlot] || "装备";
      sections.push({ label: "佩戴部位", text: tyShow });
    }
    var bonusStuff = stuffMeta && stuffMeta.bonus ? formatStuffBonusForDisplay(stuffMeta.bonus) : "";
    var bonusEq = eqMeta && eqMeta.bonus ? formatZhBonusObject(eqMeta.bonus) : "";
    if (bonusStuff) sections.push({ label: "效果", text: bonusStuff });
    var pillFx =
      stuffMeta && stuffMeta.effects ? formatPillEffectsForUi(stuffMeta.effects) : "";
    if (pillFx) sections.push({ label: "药效", text: pillFx });
    if (bonusEq) sections.push({ label: "属性加成", text: bonusEq });
    if (gfMeta) {
      if (gfMeta.type != null && String(gfMeta.type).trim() !== "") {
        sections.push({ label: "功法类型", text: String(gfMeta.type).trim() });
      }
      var gfBonusLine = gfMeta.bonus ? formatZhBonusObject(gfMeta.bonus) : "";
      if (gfBonusLine) sections.push({ label: "修炼加成", text: gfBonusLine });
    }
    var refNum = pickDescribeValueFromMetas(stuffMeta, eqMeta, gfMeta);
    var refBag = formatReferenceValueFromNumber(refNum);
    if (refBag) sections.push({ label: "价值", text: refBag });
    sections.push({ label: "持有数量", text: String(cnt) });

    var spiritStonePerRaw = getSpiritStoneRawPerPiece(it.name, fcForStoneEfficiency);
    if (spiritStonePerRaw > 0) {
      sections.push({
        label: "修炼",
        text:
          "每个灵石可提供约 " +
          formatSpiritStonePointsForUi(spiritStonePerRaw) +
          " 点修为（按该角色灵根折算，仅作说明）。",
      });
    }

    openItemDetailModal(
      String(it.name),
      "物品",
      sections,
      [],
      resolveBagItemTraitRarity(it.name, it),
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
        closeMajorBreakthroughModal();
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

  function buildTraitSlotTooltip(t) {
    if (!t || !t.name) return "空槽";
    var s = t.name + (t.rarity ? "（" + t.rarity + "）" : "");
    if (t.desc) s += "\n" + t.desc;
    if (t.effects != null && String(t.effects) !== "") s += "\n效果：" + t.effects;
    return s;
  }

  function formatTraitBonusLine(b) {
    if (!b || typeof b !== "object") return "";
    var keys = Object.keys(b);
    if (!keys.length) return "";
    return keys
      .map(function (k) {
        return k + " " + b[k];
      })
      .join("；");
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
    var bonusLine = formatTraitBonusLine(t.bonus);
    if (bonusLine) appendTraitModalSection(bodyEl, "属性加成", bonusLine);
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
    mjClearBodyOverflowIfNoModal();
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
        el.setAttribute("title", buildTraitSlotTooltip(t));
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
    ensureEquippedSlots(G);
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
        setSlotRarityDataAttr(el, resolveEquipTraitRarity(String(label), item));
      } else {
        el.classList.add("mj-equip-slot--empty");
        el.classList.remove("mj-equip-slot--filled");
        if (nameEl) nameEl.textContent = "—";
        el.setAttribute("title", EQUIP_SLOT_EMPTY_TITLE[i] || "空位");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        setSlotRarityDataAttr(el, null);
      }
    }
  }

  function renderLeftPanel(fc, G) {
    if (G) ensureGameRuntimeDefaults(G);
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

    var cultFill = document.getElementById("mj-cultivation-bar-fill");
    var cultBar = document.getElementById("mj-cultivation-bar");
    var cultTxt = document.getElementById("mj-cultivation-pct-text");
    var cultCtx = computeCultivationUi(G, fc);
    if (G) G.cultivationProgress = cultCtx.pct;
    var cultLabel =
      cultCtx.req != null && cultCtx.req > 0
        ? Math.round(cultCtx.displayCur) + " / " + Math.round(cultCtx.req)
        : Math.round(cultCtx.cur) + " / —";
    setBarFill(cultFill, cultBar, cultCtx.pct, cultTxt, cultLabel);
    if (cultBar && cultCtx.req != null && cultCtx.req > 0 && cultCtx.cur > cultCtx.req) {
      cultBar.setAttribute(
        "title",
        "本阶段修为已足，当前累计 " + Math.round(cultCtx.cur) + "（可突破后计入下阶段）",
      );
    } else if (cultBar) cultBar.removeAttribute("title");

    var brBtn = document.getElementById("mj-major-breakthrough-btn");
    if (brBtn) {
      var mctx = getMajorBreakthroughReadyContext(G, fc);
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
      setBarFill(hpFill, hpBar, pctH, hpTxt, Math.round(curH) + " / " + Math.round(G.maxHp));
      setBarFill(mpFill, mpBar, pctM, mpTxt, Math.round(curM) + " / " + Math.round(G.maxMp));
    } else {
      setBarFill(hpFill, hpBar, 0, hpTxt, "— / —");
      setBarFill(mpFill, mpBar, 0, mpTxt, "— / —");
    }

    var genderEl = document.getElementById("mj-stat-gender");
    var lingEl = document.getElementById("mj-stat-linggen");
    var ageEl = document.getElementById("mj-stat-age");
    var syEl = document.getElementById("mj-stat-shouyuan");
    if (genderEl) genderEl.textContent = (fc && fc.gender) || "—";
    if (lingEl) lingEl.textContent = formatLinggenPanelText(fc && fc.linggen);
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
    if (patkEl) patkEl.textContent = pb ? numOrDash(pb.patk) : "—";
    if (pdefEl) pdefEl.textContent = pb ? numOrDash(pb.pdef) : "—";
    if (matkEl) matkEl.textContent = pb ? numOrDash(pb.matk) : "—";
    if (mdefEl) mdefEl.textContent = pb ? numOrDash(pb.mdef) : "—";
    if (senseEl) senseEl.textContent = pb ? numOrDash(pb.sense) : "—";
    if (footEl) footEl.textContent = pb ? numOrDash(pb.foot) : "—";
    if (charmEl) {
      var ch = pb && typeof pb.charm === "number" ? pb.charm : G && G.charm;
      charmEl.textContent = numOrDash(ch);
    }
    if (luckEl) {
      var lk = pb && typeof pb.luck === "number" ? pb.luck : G && G.luck;
      luckEl.textContent = numOrDash(lk);
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
    renderNearbyNpcsPanel(G);
  }

  function init() {
    bindTraitDetailModalUi();
    bindGongfaBagDetailUi();
    bindMajorBreakthroughUi();
    bindNpcDetailModalUi();
    var fc = restoreBootstrap();
    var G = global.MortalJourneyGame;
    if (!G) {
      G = {};
      global.MortalJourneyGame = G;
    }
    ensureGameRuntimeDefaults(G);
    var shouldSeedDemoNpc = true;
    try {
      var rawSnap = sessionStorage.getItem(STORAGE_KEY);
      if (rawSnap) {
        var snap = JSON.parse(rawSnap);
        if (
          snap &&
          Object.prototype.hasOwnProperty.call(snap, "nearbyNpcs") &&
          Array.isArray(snap.nearbyNpcs)
        ) {
          shouldSeedDemoNpc = false;
        }
      }
    } catch (seedErr) {
      /* 忽略 */
    }
    ensureNearbyNpcsArray(G);
    normalizeNearbyNpcListInPlace(G);
    if (shouldSeedDemoNpc && (!G.nearbyNpcs || !G.nearbyNpcs.length)) {
      G.nearbyNpcs = [buildDemoNearbyNpcSheet()];
      normalizeNearbyNpcListInPlace(G);
      persistBootstrapSnapshot();
    }
    var brInit = applyRealmBreakthroughs(G);
    logBreakthroughMessages(brInit.messages);
    if (brInit.changed) {
      var uiInit = computeCultivationUi(G, fc);
      G.cultivationProgress = uiInit.pct;
      persistBootstrapSnapshot();
    }
    renderInventorySlots();
    renderGongfaGrid();
    renderLeftPanel(fc, G);
    renderBootstrapOverview(fc);

    if (global.MortalJourneyWorldBook && typeof global.MortalJourneyWorldBook.syncToBridgeStorage === "function") {
      try {
        global.MortalJourneyWorldBook.syncToBridgeStorage();
      } catch (syncErr) {
        console.warn("[主界面] 世界书同步到桥接存储失败", syncErr);
      }
    }

    var sendBtn = document.getElementById("mj-chat-send");
    var textarea = document.getElementById("mj-chat-input");
    if (sendBtn && textarea) {
      sendBtn.addEventListener("click", function () {
        handleChatSend(textarea, sendBtn);
      });
      textarea.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" || ev.shiftKey) return;
        ev.preventDefault();
        handleChatSend(textarea, sendBtn);
      });
    }

    console.info("[主界面] 骨架已加载", G);
    if (global.GameLog && typeof global.GameLog.info === "function") {
      global.GameLog.info("[主界面] 已加载；左下角可展开调试日志面板。");
    }
  }

  global.MainScreen = {
    /** 重新从 DOM 刷新左栏（在修改 MortalJourneyGame 后调用） */
    refreshLeftPanel: function () {
      var fc = global.MortalJourneyGame && global.MortalJourneyGame.fateChoice;
      ensureGameRuntimeDefaults(global.MortalJourneyGame);
      renderLeftPanel(fc, global.MortalJourneyGame);
    },
    /**
     * 周围人物列表（与 MjCharacterSheet 同构）；写入后持久化并刷新右栏
     * @param {Object[]} list
     * @returns {boolean}
     */
    setNearbyNpcs: function (list) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      if (!Array.isArray(list)) return false;
      ensureGameRuntimeDefaults(G);
      var MCS = global.MjCharacterSheet;
      var PBR = global.PlayerBaseRuntime;
      var out = [];
      if (MCS && typeof MCS.normalize === "function") {
        for (var si = 0; si < list.length; si++) {
          var nn = MCS.normalize(list[si]);
          if (PBR && typeof PBR.applyComputedPlayerBaseToCharacterSheet === "function") {
            PBR.applyComputedPlayerBaseToCharacterSheet(nn);
          }
          syncNpcShouyuanFromRealmState(nn);
          out.push(nn);
        }
      } else {
        out = list.slice();
      }
      G.nearbyNpcs = out;
      persistBootstrapSnapshot();
      renderNearbyNpcsPanel(G);
      return true;
    },
    /** @returns {Object[]} 深拷贝 */
    getNearbyNpcs: function () {
      var G = global.MortalJourneyGame;
      if (!G) return [];
      ensureGameRuntimeDefaults(G);
      try {
        return JSON.parse(JSON.stringify(G.nearbyNpcs || []));
      } catch (e) {
        return [];
      }
    },
    /** 仅重绘右栏「周围人物」（不改数据） */
    refreshNearbyNpcsPanel: function () {
      var G = global.MortalJourneyGame;
      if (!G) return;
      ensureGameRuntimeDefaults(G);
      renderNearbyNpcsPanel(G);
    },
    /**
     * 右栏顶条「当前地点」；开局默认来自命运抉择 birthLocation，剧情可改写。
     * @param {string|null|undefined} label 传空字符串则回退显示 fateChoice.birthLocation
     * @returns {boolean}
     */
    setCurrentLocation: function (label) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      if (label == null || String(label).trim() === "") {
        G.currentLocation = "";
      } else {
        G.currentLocation = String(label).trim();
      }
      renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /** 佩戴栏槽位数（固定 3） */
    EQUIP_SLOT_COUNT: EQUIP_SLOT_COUNT,
    /**
     * 设置佩戴槽 item 为 { name, desc?, equipType? } 或 null；index 0 武器 1 法器 2 防具
     * @returns {boolean}
     */
    setEquippedSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= EQUIP_SLOT_COUNT) return false;
      G.equippedSlots[i] = item == null ? null : item;
      renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /** @returns {Array} 三槽快照（元素为 null 或 { name, desc? }） */
    getEquippedSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) return [null, null, null];
      ensureEquippedSlots(G);
      return G.equippedSlots.slice();
    },
    /** 功法栏格数（3×4，固定 12） */
    GONGFA_SLOT_COUNT: GONGFA_SLOT_COUNT,
    /**
     * 设置功法格 item 为 { name, desc?, type? } 或 null；index 0～11
     * @returns {boolean}
     */
    setGongfaSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= GONGFA_SLOT_COUNT) return false;
      G.gongfaSlots[i] = item == null ? null : item;
      renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /** @returns {Array} 12 格快照（元素为 null 或 { name, desc?, type? }） */
    getGongfaSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) {
        var empty = [];
        for (var e = 0; e < GONGFA_SLOT_COUNT; e++) empty.push(null);
        return empty;
      }
      ensureGongfaSlots(G);
      return G.gongfaSlots.slice();
    },
    /**
     * 储物袋一格装入功法栏（首个空位，消耗 1 本）；栏满或物品不在功法配置表中则 false
     * @returns {boolean}
     */
    equipGongfaFromBag: function (bagIndex) {
      return performEquipGongfaFromBag(bagIndex);
    },
    /** 功法栏一格（0～11）卸下至储物袋；袋满 false */
    unequipGongfaToBag: function (gongfaSlotIndex) {
      return performUnequipGongfaToBag(gongfaSlotIndex);
    },
    /** 储物袋格数（12 格均为物品） */
    INVENTORY_SLOT_COUNT: INVENTORY_SLOT_COUNT,
    /**
     * 将背包内所有「下品灵石」「灵石」堆叠清空后，在首个空位放入指定数量下品灵石（与 LINGSHI_STACK_ITEM_NAME 一致）。
     * @returns {boolean}
     */
    setLingShiCount: function (n) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var c = Math.max(0, Math.floor(Number(n) || 0));
      var C = global.MjCreationConfig;
      var stoneName =
        C && C.LINGSHI_STACK_ITEM_NAME ? String(C.LINGSHI_STACK_ITEM_NAME) : "下品灵石";
      for (var r = 0; r < INVENTORY_SLOT_COUNT; r++) {
        var it = G.inventorySlots[r];
        if (it && (it.name === stoneName || it.name === "灵石")) G.inventorySlots[r] = null;
      }
      if (c === 0) {
        persistBootstrapSnapshot();
        renderBagSlots(G);
        return true;
      }
      var j = findFirstEmptyBagSlot(G);
      if (j < 0) return false;
      G.inventorySlots[j] = normalizeBagItem({ name: stoneName, count: c });
      persistBootstrapSnapshot();
      renderBagSlots(G);
      return true;
    },
    /** 背包中「下品灵石」与旧名「灵石」的数量合计 */
    getLingShiCount: function () {
      var G = global.MortalJourneyGame;
      if (!G) return 0;
      ensureInventorySlots(G);
      var C = global.MjCreationConfig;
      var stoneName =
        C && C.LINGSHI_STACK_ITEM_NAME ? String(C.LINGSHI_STACK_ITEM_NAME) : "下品灵石";
      var sum = 0;
      for (var i = 0; i < INVENTORY_SLOT_COUNT; i++) {
        var it = G.inventorySlots[i];
        if (!it || !it.name) continue;
        if (it.name === stoneName || it.name === "灵石") {
          sum += typeof it.count === "number" && isFinite(it.count) ? Math.max(0, Math.floor(it.count)) : 1;
        }
      }
      return sum;
    },
    /**
     * 储物袋物品格：index 0～11，item 为 { name, count?, desc? } 或 null
     * @returns {boolean}
     */
    setBagSlot: function (index, item) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      var i = Number(index);
      if (!isFinite(i) || i < 0 || i >= INVENTORY_SLOT_COUNT) return false;
      G.inventorySlots[i] = item == null ? null : normalizeBagItem(item);
      persistBootstrapSnapshot();
      renderBagSlots(G);
      return true;
    },
    /** 当前累计修为（灵石修炼累加） */
    getXiuwei: function () {
      var G = global.MortalJourneyGame;
      if (!G) return 0;
      ensureGameRuntimeDefaults(G);
      return typeof G.xiuwei === "number" && isFinite(G.xiuwei) ? Math.max(0, Math.floor(G.xiuwei)) : 0;
    },
    /**
     * 直接设置修为（剧情用）；会刷新左栏并写入 sessionStorage 快照
     * @returns {boolean}
     */
    setXiuwei: function (n) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      ensureGameRuntimeDefaults(G);
      G.xiuwei = Math.max(0, Math.floor(Number(n) || 0));
      var br = applyRealmBreakthroughs(G);
      clampXiuweiToLateStageCapIfNeeded(G, G.fateChoice);
      logBreakthroughMessages(br.messages);
      var ui = computeCultivationUi(G, G.fateChoice);
      G.cultivationProgress = ui.pct;
      persistBootstrapSnapshot();
      renderLeftPanel(G.fateChoice, G);
      return true;
    },
    /**
     * 在修为已满条时再次尝试突破：仅处理小境界自动晋升；大境界须点左栏「突破」在弹窗内掷骰。
     * @returns {{ changed: boolean, messages: string[] }}
     */
    applyRealmBreakthroughsNow: function () {
      var G = global.MortalJourneyGame;
      if (!G) return { changed: false, messages: [] };
      ensureGameRuntimeDefaults(G);
      var out = applyRealmBreakthroughs(G);
      logBreakthroughMessages(out.messages);
      if (out.changed) {
        var ui = computeCultivationUi(G, G.fateChoice);
        G.cultivationProgress = ui.pct;
        persistBootstrapSnapshot();
        renderLeftPanel(G.fateChoice, G);
      }
      return out;
    },
    /**
     * 消耗背包一格灵石类物品增加修为：总修为 = round(表列 value × 灵根系数 × 件数)，非「round(单件)×件数」
     * @param {number} bagIndex 0～11
     * @param {boolean} [consumeAll] 与 pieceCount 二选一：true 为整堆
     * @param {number} [pieceCount] 指定件数：四舍五入，超过堆叠则按堆叠上限；≤0 不执行
     * @returns {boolean}
     */
    absorbSpiritStonesFromBag: function (bagIndex, consumeAll, pieceCount) {
      var G = global.MortalJourneyGame;
      if (!G) return false;
      if (typeof pieceCount === "number" && isFinite(pieceCount)) {
        return performAbsorbSpiritStonesFromBag(G, bagIndex, false, pieceCount);
      }
      return performAbsorbSpiritStonesFromBag(G, bagIndex, !!consumeAll);
    },
    /** @returns {Array} 12 格：{ name, count, desc? } 或 null */
    getBagSlots: function () {
      var G = global.MortalJourneyGame;
      if (!G) {
        var emp = [];
        for (var b = 0; b < INVENTORY_SLOT_COUNT; b++) emp.push(null);
        return emp;
      }
      ensureInventorySlots(G);
      return G.inventorySlots.map(function (x) {
        if (!x) return null;
        var o = { name: x.name, count: x.count, desc: x.desc };
        if (x.equipType) o.equipType = x.equipType;
        if (x.grade) o.grade = x.grade;
        return o;
      });
    },
    /** 从储物袋格（0～11）穿戴；满袋无法换下当前装备时返回 false */
    equipFromBagSlot: function (bagIndex) {
      return performEquipFromBag(bagIndex);
    },
    /** 卸下佩戴栏一格（0～2）到储物袋；袋满返回 false */
    unequipToBag: function (equipSlotIndex) {
      return performUnequipToBag(equipSlotIndex);
    },
    /**
     * 查描述表中的灵石等价数值（describe.value，与灵石/装备/功法等同刻度，非「下品灵石颗数」）
     * @param {string} itemName
     * @returns {number|null}
     */
    getDescribeReferenceValue: function (itemName) {
      var nm = String(itemName || "").trim();
      if (!nm) return null;
      var n = pickDescribeValueFromMetas(
        lookupStuffMetaByItemName(nm),
        lookupEquipmentMetaByItemName(nm),
        lookupGongfaConfigDef(nm),
      );
      return n == null ? null : Math.floor(n);
    },
    /**
     * 与详情弹窗「灵石等价价值」同格式；无效数值返回 null
     */
    formatReferenceValueUi: function (amount) {
      var x = typeof amount === "number" ? amount : Number(amount);
      return formatReferenceValueFromNumber(x);
    },
    DEFAULT_WORLD_TIME: DEFAULT_WORLD_TIME,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
