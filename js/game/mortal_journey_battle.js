/**
 * 回合制战斗骨架：神识排序出手、功法/武器交替、伤害公式与战败逃跑回写。
 * 全局：MortalJourneyBattle.startBattle(payload)
 *
 * 结算后派发 `mj:battle-finished`；主界面 mainScreen_chat 可据此自动请求剧情/状态 AI（见 MJ_AUTO_STORY_AFTER_BATTLE）。
 */
(function (global) {
  "use strict";

  var MAX_ROUNDS = 500;

  function logBattle() {
    var GL = global.GameLog;
    if (GL && typeof GL.info === "function") {
      var args = Array.prototype.slice.call(arguments);
      args.unshift("[战斗]");
      GL.info.apply(GL, args);
    } else if (global.console && console.info) {
      console.info.apply(console, ["[战斗]"].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function normName(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  function toInt(n, fallback) {
    var x = typeof n === "number" && isFinite(n) ? Math.round(n) : fallback;
    return x == null ? fallback : x;
  }

  function mergeMagnification(cell, meta) {
    var m0 = cell && cell.magnification && typeof cell.magnification === "object" ? cell.magnification : null;
    var m1 = meta && meta.magnification && typeof meta.magnification === "object" ? meta.magnification : null;
    var wu = null;
    var fa = null;
    if (m0 && typeof m0.物攻 === "number" && isFinite(m0.物攻)) wu = m0.物攻;
    if (m0 && typeof m0.法攻 === "number" && isFinite(m0.法攻)) fa = m0.法攻;
    if (wu == null && m1 && typeof m1.物攻 === "number" && isFinite(m1.物攻)) wu = m1.物攻;
    if (fa == null && m1 && typeof m1.法攻 === "number" && isFinite(m1.法攻)) fa = m1.法攻;
    return { 物攻: wu != null ? wu : 0, 法攻: fa != null ? fa : 0 };
  }

  function mergeManacost(cell, meta) {
    var c0 =
      cell && typeof cell.manacost === "number" && isFinite(cell.manacost) ? Math.max(0, Math.round(cell.manacost)) : null;
    var c1 =
      meta && typeof meta.manacost === "number" && isFinite(meta.manacost) ? Math.max(0, Math.round(meta.manacost)) : null;
    if (c0 != null) return c0;
    if (c1 != null) return c1;
    return 0;
  }

  function getGongfaSubtype(cell, meta) {
    var st =
      cell && cell.subtype != null && String(cell.subtype).trim() !== ""
        ? String(cell.subtype).trim()
        : cell && cell.subType != null && String(cell.subType).trim() !== ""
          ? String(cell.subType).trim()
          : "";
    if (st) return st;
    if (meta && meta.subtype != null && String(meta.subtype).trim() !== "") return String(meta.subtype).trim();
    if (meta && meta.subType != null && String(meta.subType).trim() !== "") return String(meta.subType).trim();
    return "";
  }

  /** 法攻伤害=角色法攻×功法法攻倍率−敌方法防；物攻伤害=角色物攻×功法物攻倍率−敌方物防 */
  function computeDamageToTarget(attackerPb, mag, defenderPb) {
    var patk = toInt(attackerPb.patk, 0);
    var matk = toInt(attackerPb.matk, 0);
    var mWu = typeof mag.物攻 === "number" && isFinite(mag.物攻) ? mag.物攻 : 0;
    var mFa = typeof mag.法攻 === "number" && isFinite(mag.法攻) ? mag.法攻 : 0;
    var rawMatkLine = matk * mFa;
    var rawPatkLine = patk * mWu;
    var dMdef = Math.max(0, Math.round(rawMatkLine) - toInt(defenderPb.mdef, 0));
    var dPdef = Math.max(0, Math.round(rawPatkLine) - toInt(defenderPb.pdef, 0));
    return {
      total: dMdef + dPdef,
      rawMatkLine: rawMatkLine,
      rawPatkLine: rawPatkLine,
      afterMdef: dMdef,
      afterPdef: dPdef,
    };
  }

  function estimateSkillScore(attackerPb, mag) {
    var z = { patk: 0, pdef: 0, matk: 0, mdef: 0, hp: 0, mp: 0, foot: 0, sense: 0 };
    return computeDamageToTarget(attackerPb, mag, z).total;
  }

  function pickBestGongfa(unit) {
    var C = global.MjCreationConfig;
    var slots = Array.isArray(unit.gongfaSlots) ? unit.gongfaSlots : [];
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < slots.length; i++) {
      var cell = slots[i];
      if (!cell || !cell.name) continue;
      var nm = String(cell.name).trim();
      if (!nm) continue;
      var meta = C && typeof C.getGongfaDescribe === "function" ? C.getGongfaDescribe(nm) : null;
      var subt = getGongfaSubtype(cell, meta);
      if (subt === "辅助") {
        var magProbe = mergeMagnification(cell, meta);
        if (magProbe.物攻 <= 0 && magProbe.法攻 <= 0) continue;
      }
      var mag = mergeMagnification(cell, meta);
      if (mag.物攻 <= 0 && mag.法攻 <= 0) continue;
      var score = estimateSkillScore(unit.pb, mag);
      if (score > bestScore) {
        bestScore = score;
        best = {
          name: nm,
          cell: cell,
          meta: meta,
          mag: mag,
          manacost: mergeManacost(cell, meta),
        };
      }
    }
    return best;
  }

  function resolveWeaponMagnification(unit) {
    var slots = Array.isArray(unit.equippedSlots) ? unit.equippedSlots : [];
    var cell = slots[0];
    var C = global.MjCreationConfig;
    if (!cell || !cell.name) {
      return { label: "徒手", mag: { 物攻: 1, 法攻: 0 } };
    }
    var nm = String(cell.name).trim();
    var meta = C && typeof C.getEquipmentDescribe === "function" ? C.getEquipmentDescribe(nm) : null;
    var mag = mergeMagnification(cell, meta);
    if (mag.物攻 <= 0 && mag.法攻 <= 0) mag.物攻 = 1;
    return { label: nm, mag: mag };
  }

  function defaultStubSheet(displayName) {
    var MCS = global.MjCharacterSheet;
    var base = {
      id: "battle_stub_" + (typeof Date.now === "function" ? Date.now() : Math.floor(Math.random() * 1e9)),
      displayName: displayName || "未知角色",
      realm: { major: "练气", minor: "初期" },
      playerBase: { hp: 80, mp: 40, patk: 8, pdef: 4, matk: 8, mdef: 4, foot: 5, sense: 12 },
    };
    return MCS && typeof MCS.normalize === "function" ? MCS.normalize(base) : base;
  }

  function copyPbFromSheetSafe(sheet) {
    var MCS = global.MjCharacterSheet;
    var pbIn = sheet && sheet.playerBase ? sheet.playerBase : {};
    if (MCS && typeof MCS.normalizePlayerBase === "function") {
      return MCS.normalizePlayerBase(pbIn);
    }
    return {
      hp: toInt(pbIn.hp, 1),
      mp: toInt(pbIn.mp, 1),
      patk: toInt(pbIn.patk, 0),
      pdef: toInt(pbIn.pdef, 0),
      matk: toInt(pbIn.matk, 0),
      mdef: toInt(pbIn.mdef, 0),
      foot: toInt(pbIn.foot, 0),
      sense: toInt(pbIn.sense, 0),
    };
  }

  function findNearbyNpc(G, name) {
    var want = normName(name);
    if (!want || !G || !Array.isArray(G.nearbyNpcs)) return null;
    for (var i = 0; i < G.nearbyNpcs.length; i++) {
      var n = G.nearbyNpcs[i];
      if (!n) continue;
      if (normName(n.displayName) === want) return n;
    }
    return null;
  }

  /**
   * 从 G.nearbyNpcs 中解析本场战斗对应的 NPC 对象（同一 displayName 多体时：无 id 则按数组序与已占用集合依次取第一个未占用同名项；有 id 则优先 id+姓名，再兜底仅 id）。
   */
  function resolveNearbyNpcRef(G, entry, reservedRefs) {
    var wantName = normName(entry && entry.displayName);
    if (!wantName || !G || !Array.isArray(G.nearbyNpcs)) return null;
    var wantId = entry && entry.id != null ? String(entry.id).trim() : "";
    var r = Array.isArray(reservedRefs) ? reservedRefs : [];

    function notReserved(n) {
      return r.indexOf(n) < 0;
    }

    var i;
    if (wantId) {
      for (i = 0; i < G.nearbyNpcs.length; i++) {
        var nId = G.nearbyNpcs[i];
        if (!nId || !notReserved(nId)) continue;
        var nid = nId.id != null ? String(nId.id).trim() : "";
        if (nid !== wantId) continue;
        if (normName(nId.displayName) !== wantName) continue;
        return nId;
      }
      for (i = 0; i < G.nearbyNpcs.length; i++) {
        var nIdOnly = G.nearbyNpcs[i];
        if (!nIdOnly || !notReserved(nIdOnly)) continue;
        var nidO = nIdOnly.id != null ? String(nIdOnly.id).trim() : "";
        if (nidO === wantId) return nIdOnly;
      }
      return null;
    }

    for (i = 0; i < G.nearbyNpcs.length; i++) {
      var n = G.nearbyNpcs[i];
      if (!n || !notReserved(n)) continue;
      if (normName(n.displayName) !== wantName) continue;
      return n;
    }
    return null;
  }

  function cloneSlots(arr) {
    if (!Array.isArray(arr)) return [];
    try {
      return JSON.parse(JSON.stringify(arr));
    } catch (_e) {
      return arr.slice();
    }
  }

  function buildCombatantFromPayload(G, entry, isProtagonist, side, reservedNpcRefs) {
    var displayName = normName(entry && entry.displayName) || (side === "ally" ? "主角" : "敌人");
    if (isProtagonist && G) {
      var pb = copyPbFromSheetSafe({ playerBase: G.playerBase });
      var maxHp =
        typeof G.maxHp === "number" && isFinite(G.maxHp)
          ? Math.max(1, Math.floor(G.maxHp))
          : Math.max(1, pb.hp);
      var maxMp =
        typeof G.maxMp === "number" && isFinite(G.maxMp)
          ? Math.max(1, Math.floor(G.maxMp))
          : Math.max(1, pb.mp);
      var hp =
        typeof G.currentHp === "number" && isFinite(G.currentHp) ? Math.max(0, Math.floor(G.currentHp)) : maxHp;
      var mp =
        typeof G.currentMp === "number" && isFinite(G.currentMp) ? Math.max(0, Math.floor(G.currentMp)) : maxMp;
      return {
        displayName: normName((G.fateChoice && G.fateChoice.playerName) || displayName),
        side: side,
        isProtagonist: true,
        pb: pb,
        hp: Math.min(hp, maxHp),
        mp: Math.min(mp, maxMp),
        maxHp: maxHp,
        maxMp: maxMp,
        gongfaSlots: cloneSlots(G.gongfaSlots),
        equippedSlots: cloneSlots(G.equippedSlots),
        strikeCount: 0,
        forceWeaponOnly: false,
        nearbyNpcRef: null,
        battleStats: { dealtFa: 0, dealtWu: 0, takenFa: 0, takenWu: 0 },
      };
    }
    var npc = null;
    if (G) {
      if (Array.isArray(reservedNpcRefs)) {
        npc = resolveNearbyNpcRef(G, entry, reservedNpcRefs);
        if (npc) reservedNpcRefs.push(npc);
      } else {
        npc = findNearbyNpc(G, displayName);
      }
    }
    var sheet =
      npc && typeof npc === "object"
        ? global.MjCharacterSheet && typeof global.MjCharacterSheet.normalize === "function"
          ? global.MjCharacterSheet.normalize(npc)
          : npc
        : defaultStubSheet(displayName);
    var pb2 = copyPbFromSheetSafe(sheet);
    var maxHp2 =
      typeof sheet.maxHp === "number" && isFinite(sheet.maxHp)
        ? Math.max(1, Math.round(sheet.maxHp))
        : Math.max(1, pb2.hp);
    var maxMp2 =
      typeof sheet.maxMp === "number" && isFinite(sheet.maxMp)
        ? Math.max(1, Math.round(sheet.maxMp))
        : Math.max(1, pb2.mp);
    var hp2 =
      typeof sheet.currentHp === "number" && isFinite(sheet.currentHp) ? Math.max(0, Math.round(sheet.currentHp)) : maxHp2;
    var mp2 =
      typeof sheet.currentMp === "number" && isFinite(sheet.currentMp) ? Math.max(0, Math.round(sheet.currentMp)) : maxMp2;
    return {
      displayName: normName(sheet.displayName || displayName),
      side: side,
      isProtagonist: false,
      pb: pb2,
      hp: Math.min(hp2, maxHp2),
      mp: Math.min(mp2, maxMp2),
      maxHp: maxHp2,
      maxMp: maxMp2,
      gongfaSlots: cloneSlots(sheet.gongfaSlots),
      equippedSlots: cloneSlots(sheet.equippedSlots),
      strikeCount: 0,
      forceWeaponOnly: false,
      nearbyNpcRef: npc && typeof npc === "object" ? npc : null,
      battleStats: { dealtFa: 0, dealtWu: 0, takenFa: 0, takenWu: 0 },
    };
  }

  function buildSideFromPayload(G, arr, side, protagonistNameNorm, reservedNpcRefs) {
    var out = [];
    var list = Array.isArray(arr) ? arr : [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !normName(e.displayName)) continue;
      var nm = normName(e.displayName);
      var isPro =
        side === "ally" &&
        (normName(e.roleHint) === "主角" ||
          (protagonistNameNorm && nm === protagonistNameNorm) ||
          i === 0);
      out.push(buildCombatantFromPayload(G, e, !!isPro, side, reservedNpcRefs));
    }
    return out;
  }

  function aliveUnits(sideList) {
    var a = [];
    for (var i = 0; i < sideList.length; i++) {
      if (sideList[i] && sideList[i].hp > 0) a.push(sideList[i]);
    }
    return a;
  }

  function sortBySenseDesc(units) {
    return units.slice().sort(function (x, y) {
      var sx = toInt(x.pb.sense, 0);
      var sy = toInt(y.pb.sense, 0);
      if (sx !== sy) return sy - sx;
      return normName(x.displayName).localeCompare(normName(y.displayName));
    });
  }

  function pickRandomAlive(opponents) {
    var al = aliveUnits(opponents);
    if (!al.length) return null;
    return al[Math.floor(Math.random() * al.length)];
  }

  function allyAllDown(allies) {
    return aliveUnits(allies).length === 0;
  }

  function enemyAllDown(enemies) {
    return aliveUnits(enemies).length === 0;
  }

  /** 供 UI 展示：法攻段/物攻段累计（与日志「法攻伤害」「物攻伤害」实扣一致） */
  function buildBattleSettlement(allies, enemies, victor, rounds) {
    function row(u, side) {
      var bs = u && u.battleStats ? u.battleStats : {};
      return {
        side: side,
        displayName: u ? normName(u.displayName) : "",
        isProtagonist: !!(u && u.isProtagonist),
        dealtFa: Math.max(0, Math.round(toInt(bs.dealtFa, 0))),
        dealtWu: Math.max(0, Math.round(toInt(bs.dealtWu, 0))),
        takenFa: Math.max(0, Math.round(toInt(bs.takenFa, 0))),
        takenWu: Math.max(0, Math.round(toInt(bs.takenWu, 0))),
      };
    }
    var a = [];
    var e = [];
    var i;
    for (i = 0; i < (allies || []).length; i++) {
      if (allies[i]) a.push(row(allies[i], "ally"));
    }
    for (i = 0; i < (enemies || []).length; i++) {
      if (enemies[i]) e.push(row(enemies[i], "enemy"));
    }
    return {
      victor: victor,
      rounds: rounds,
      allies: a,
      enemies: e,
    };
  }

  function defaultBareFistMag() {
    return { label: "徒手", mag: { 物攻: 1, 法攻: 0 } };
  }

  function performStrike(roundIdx, striker, target) {
    var wantGongfa = !striker.forceWeaponOnly && striker.strikeCount % 2 === 0;
    var used = "";
    var mag = { 物攻: 0, 法攻: 0 };
    var manaCost = 0;
    var detailParts = [];

    if (wantGongfa) {
      var best = pickBestGongfa(striker);
      if (!best) {
        var fist = defaultBareFistMag();
        used = "功法（无可用攻击功法，徒手）";
        mag = fist.mag;
        manaCost = 0;
      } else {
        manaCost = best.manacost;
        if (striker.mp < manaCost) {
          striker.forceWeaponOnly = true;
          var w0 = resolveWeaponMagnification(striker);
          used = "武器（法力不足以施展「" + best.name + "」，此后仅用武器）「" + w0.label + "」";
          mag = w0.mag;
          manaCost = 0;
        } else {
          striker.mp -= manaCost;
          used = "功法「" + best.name + "」";
          mag = best.mag;
          detailParts.push("消耗法力 " + manaCost + "，剩余法力 " + striker.mp);
        }
      }
    } else {
      var w = resolveWeaponMagnification(striker);
      used = "武器「" + w.label + "」";
      mag = w.mag;
    }

    var D = computeDamageToTarget(striker.pb, mag, target.pb);
    var prevHp = target.hp;
    target.hp = Math.max(0, prevHp - D.total);

    if (!striker.battleStats) striker.battleStats = { dealtFa: 0, dealtWu: 0, takenFa: 0, takenWu: 0 };
    if (!target.battleStats) target.battleStats = { dealtFa: 0, dealtWu: 0, takenFa: 0, takenWu: 0 };
    striker.battleStats.dealtFa += D.afterMdef;
    striker.battleStats.dealtWu += D.afterPdef;
    target.battleStats.takenFa += D.afterMdef;
    target.battleStats.takenWu += D.afterPdef;

    logBattle(
      "第 " +
        roundIdx +
        " 轮 · " +
        striker.displayName +
        "（神识 " +
        toInt(striker.pb.sense, 0) +
        "）→ 随机目标 " +
        target.displayName +
        "：" +
        used,
    );
    logBattle(
      "  【法攻伤害】= 角色法攻 " +
        toInt(striker.pb.matk, 0) +
        " × 功法法攻倍率 " +
        (typeof mag.法攻 === "number" ? mag.法攻 : 0) +
        " → 原始 " +
        (Math.round(D.rawMatkLine * 100) / 100) +
        " → 减敌方法防 " +
        toInt(target.pb.mdef, 0) +
        " → 本段实扣 " +
        D.afterMdef,
    );
    logBattle(
      "  【物攻伤害】= 角色物攻 " +
        toInt(striker.pb.patk, 0) +
        " × 功法物攻倍率 " +
        (typeof mag.物攻 === "number" ? mag.物攻 : 0) +
        " → 原始 " +
        (Math.round(D.rawPatkLine * 100) / 100) +
        " → 减敌方物防 " +
        toInt(target.pb.pdef, 0) +
        " → 本段实扣 " +
        D.afterPdef,
    );
    logBattle(
      "  合计伤害 " +
        D.total +
        "，目标血量 " +
        prevHp +
        " → " +
        target.hp +
        (detailParts.length ? "；" + detailParts.join("；") : ""),
    );

    striker.strikeCount += 1;
  }

  function runCombat(payload, G) {
    var proNorm = "";
    if (G && G.fateChoice && G.fateChoice.playerName != null && normName(G.fateChoice.playerName)) {
      proNorm = normName(G.fateChoice.playerName);
    }
    var reservedAllyNpcs = [];
    var reservedEnemyNpcs = [];
    var allies = buildSideFromPayload(G, payload && payload.allies, "ally", proNorm, reservedAllyNpcs);
    var enemies = buildSideFromPayload(G, payload && payload.enemies, "enemy", proNorm, reservedEnemyNpcs);
    if (!allies.length && G) {
      var proEntry = {
        displayName: proNorm || (G.fateChoice && G.fateChoice.playerName) || "主角",
        roleHint: "主角",
      };
      allies.push(buildCombatantFromPayload(G, proEntry, true, "ally", null));
      logBattle("未解析到我方参战名单，默认仅主角参战。");
    }

    logBattle("开战；我方 " + allies.length + " 人，敌方 " + enemies.length + " 人。");
    logBattle(
      "伤害口径：【法攻伤害】= 角色法攻×功法法攻倍率，再减敌方法防；【物攻伤害】= 角色物攻×功法物攻倍率，再减敌方物防；合计=两段实扣之和。",
    );
    if (payload && payload.triggerReason) logBattle("触发说明：" + String(payload.triggerReason));

    var roundIdx = 1;
    var outcome = null;

    while (roundIdx <= MAX_ROUNDS) {
      logBattle("—— 第 " + roundIdx + " 轮开始（按神识降序各行动一次）——");
      var actors = sortBySenseDesc(aliveUnits(allies).concat(aliveUnits(enemies)));

      for (var i = 0; i < actors.length; i++) {
        var u = actors[i];
        if (!u || u.hp <= 0) continue;
        var opSide = u.side === "ally" ? enemies : allies;
        var tgt = pickRandomAlive(opSide);
        if (!tgt) {
          if (enemyAllDown(enemies)) {
            outcome = "ally";
            break;
          }
          if (allyAllDown(allies)) {
            outcome = "enemy";
            break;
          }
          continue;
        }
        performStrike(roundIdx, u, tgt);
        if (enemyAllDown(enemies)) {
          outcome = "ally";
          break;
        }
        if (allyAllDown(allies)) {
          outcome = "enemy";
          break;
        }
      }

      if (outcome) break;
      if (enemyAllDown(enemies)) {
        outcome = "ally";
        break;
      }
      if (allyAllDown(allies)) {
        outcome = "enemy";
        break;
      }
      roundIdx++;
    }

    if (!outcome) {
      logBattle("达到回合上限 " + MAX_ROUNDS + "，判定为僵持撤退（按败方逃跑处理）。");
      outcome = "enemy";
    }

    var settlement = buildBattleSettlement(allies, enemies, outcome, roundIdx);
    return { victor: outcome, rounds: roundIdx, allies: allies, enemies: enemies, settlement: settlement };
  }

  /**
   * 胜利后对已阵亡敌人搜刮：装备栏 + 功法栏逐件入储物袋（与 UI 卸下入袋同源）；成功则从 NPC 上清空该格。
   * 入袋对象的倍率 / 功法类型 / type=功法 等由 MjMainScreenPanel.equippedItemToBagPayload、gongfaSlotItemToBagPayload 保证（与战斗 mergeMagnification 口径一致）。
   */
  function lootDefeatedEnemyIntoBag(G, npcRef, combatant, enemyDisplayName) {
    var got = { equipment: [], gongfa: [] };
    var P = global.MjMainScreenPanel;
    if (!P) return got;
    var tryPlace = P.tryPlaceItemInBag;
    var toEq = P.equippedItemToBagPayload;
    var toGf = P.gongfaSlotItemToBagPayload;
    if (typeof tryPlace !== "function" || typeof toEq !== "function" || typeof toGf !== "function") {
      logBattle("战利品：界面未提供入袋接口，跳过搜刮。");
      return got;
    }
    /** 勿在此调用 ensureGameRuntimeDefaults：会 normalize 并替换 G.nearbyNpcs 条目，导致 en.nearbyNpcRef 指向脱链旧对象，结算血量写到旧对象而 UI 仍显示新对象上的旧 HP。 */
    var nameHint = normName(enemyDisplayName) || "敌人";
    var eqArr =
      npcRef && Array.isArray(npcRef.equippedSlots)
        ? npcRef.equippedSlots
        : combatant && Array.isArray(combatant.equippedSlots)
          ? combatant.equippedSlots
          : [];
    var gfArr =
      npcRef && Array.isArray(npcRef.gongfaSlots)
        ? npcRef.gongfaSlots
        : combatant && Array.isArray(combatant.gongfaSlots)
          ? combatant.gongfaSlots
          : [];
    var ei;
    for (ei = 0; ei < eqArr.length; ei++) {
      var cell = eqArr[ei];
      if (!cell) continue;
      var payload = toEq(cell, ei);
      if (!payload) continue;
      if (tryPlace(G, payload)) {
        got.equipment.push({
          name: String(payload.name).trim(),
          equipType: payload.equipType != null ? String(payload.equipType).trim() : "",
        });
        logBattle("战利品：自 " + nameHint + " 夺得装备「" + payload.name + "」已入储物袋。");
        if (npcRef && Array.isArray(npcRef.equippedSlots) && npcRef.equippedSlots === eqArr) npcRef.equippedSlots[ei] = null;
      } else {
        logBattle("储物袋已满，未能装入装备「" + payload.name + "」（" + nameHint + "）。");
      }
    }
    var gi;
    for (gi = 0; gi < gfArr.length; gi++) {
      var gc = gfArr[gi];
      if (!gc) continue;
      var gp = toGf(gc);
      if (!gp) continue;
      if (tryPlace(G, gp)) {
        got.gongfa.push({ name: String(gp.name).trim() });
        logBattle("战利品：自 " + nameHint + " 夺得功法「" + gp.name + "」已入储物袋。");
        if (npcRef && Array.isArray(npcRef.gongfaSlots) && npcRef.gongfaSlots === gfArr) npcRef.gongfaSlots[gi] = null;
      } else {
        logBattle("储物袋已满，未能装入功法「" + gp.name + "」（" + nameHint + "）。");
      }
    }
    return got;
  }

  function applyResultToGame(G, result) {
    if (!G || !result) return;
    var allies = result.allies || [];
    var enemies = result.enemies || [];

    if (result.victor === "enemy") {
      logBattle("战斗结束：主角方撤退。所有我方单位血量置为 1（未死亡）。");
      for (var i = 0; i < allies.length; i++) {
        var a = allies[i];
        if (!a) continue;
        a.hp = 1;
      }
    } else {
      logBattle("战斗结束：主角方胜利。");
    }

    for (var j = 0; j < allies.length; j++) {
      var al = allies[j];
      if (!al) continue;
      if (al.isProtagonist) {
        G.currentHp = Math.min(al.maxHp, Math.max(0, al.hp));
        G.currentMp = Math.min(al.maxMp, Math.max(0, al.mp));
      } else {
        var npc = al.nearbyNpcRef || findNearbyNpc(G, al.displayName);
        if (npc) {
          npc.currentHp = Math.min(typeof npc.maxHp === "number" ? npc.maxHp : al.maxHp, Math.max(0, al.hp));
          npc.currentMp = Math.min(typeof npc.maxMp === "number" ? npc.maxMp : al.maxMp, Math.max(0, al.mp));
        }
      }
    }

    var battleLoot = { equipment: [], gongfa: [] };
    for (var k = 0; k < enemies.length; k++) {
      var en = enemies[k];
      if (!en) continue;
      var npcE = en.nearbyNpcRef || findNearbyNpc(G, en.displayName);
      var maxHE = npcE && typeof npcE.maxHp === "number" ? npcE.maxHp : en.maxHp;
      var finHp = Math.min(maxHE, Math.max(0, en.hp));
      if (npcE) {
        var maxME = typeof npcE.maxMp === "number" ? npcE.maxMp : en.maxMp;
        npcE.currentHp = finHp;
        npcE.currentMp = Math.min(maxME, Math.max(0, en.mp));
        if (finHp <= 0) {
          npcE.isDead = true;
          npcE.currentHp = 0;
          npcE.isTemporarilyAway = false;
        }
      }
      if (result.victor === "ally" && finHp <= 0) {
        var chunk = lootDefeatedEnemyIntoBag(G, npcE && typeof npcE === "object" ? npcE : null, en, en.displayName);
        if (chunk && chunk.equipment && chunk.equipment.length) {
          battleLoot.equipment = battleLoot.equipment.concat(chunk.equipment);
        }
        if (chunk && chunk.gongfa && chunk.gongfa.length) {
          battleLoot.gongfa = battleLoot.gongfa.concat(chunk.gongfa);
        }
      }
    }

    var P = global.MjMainScreenPanel;
    if (P && typeof P.ensureGameRuntimeDefaults === "function") P.ensureGameRuntimeDefaults(G);
    if (P && typeof P.persistBootstrapSnapshot === "function") P.persistBootstrapSnapshot();
    if (P && G.fateChoice && typeof P.renderLeftPanel === "function") P.renderLeftPanel(G.fateChoice, G);
    if (P && typeof P.renderNearbyNpcsPanel === "function") P.renderNearbyNpcsPanel(G);

    try {
      global.dispatchEvent(
        new CustomEvent("mj:battle-finished", {
          detail: {
            victor: result.victor,
            rounds: result.rounds,
            payload: G.pendingBattle || null,
            settlement: result.settlement || null,
            battleLoot: result.victor === "ally" ? battleLoot : { equipment: [], gongfa: [] },
          },
        }),
      );
    } catch (_e) {}
  }

  function startBattle(payload) {
    var G = global.MortalJourneyGame;
    if (!G) {
      logBattle("MortalJourneyGame 未就绪，跳过战斗。");
      return { ok: false, error: "no_game" };
    }
    if (!payload || !Array.isArray(payload.enemies) || !payload.enemies.length) {
      logBattle("payload 缺少敌方，跳过战斗。");
      return { ok: false, error: "no_enemies" };
    }
    var result = runCombat(payload, G);
    G.lastBattleResult = {
      victor: result.victor,
      rounds: result.rounds,
      finishedAt: typeof Date.now === "function" ? Date.now() : 0,
      settlement: result.settlement || null,
    };
    G.storyBattleContextConsumed = false;
    applyResultToGame(G, result);
    return { ok: true, victor: result.victor, rounds: result.rounds };
  }

  global.MortalJourneyBattle = {
    startBattle: startBattle,
  };
})(typeof window !== "undefined" ? window : globalThis);