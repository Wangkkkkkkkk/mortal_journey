/**
 * 角色属性单（主角 / NPC 同一套字段，便于剧情与 UI 共用）
 * 与 PlayerBaseRuntime 八维、MortalJourneyGame 运行时血蓝等对齐。
 * 周围人物：normalize 后主界面会调用 PlayerBaseRuntime.applyComputedPlayerBaseToCharacterSheet，
 * 用境界/灵根/天赋/功法与装备槽按主角同款公式覆盖 playerBase 与血蓝上限（当前血蓝随上限差同步）。
 * 全局：MjCharacterSheet
 */
(function (global) {
  "use strict";

  /** 与 player_base_runtime 八维一致（魅力/气运在 playerBase 上可选） */
  var BASE_KEYS = Object.freeze(["hp", "mp", "patk", "pdef", "matk", "mdef", "foot", "sense"]);

  function numOrZero(v) {
    return typeof v === "number" && isFinite(v) ? v : 0;
  }

  function clampInt(n, lo, hi) {
    var x = typeof n === "number" && isFinite(n) ? Math.round(n) : lo;
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
  }

  function clampFavorability(v) {
    if (typeof v !== "number" || !isFinite(v)) return 0;
    return clampInt(v, -99, 99);
  }

  /**
   * @param {Object|null|undefined} pb
   * @returns {{ hp:number, mp:number, patk:number, pdef:number, matk:number, mdef:number, foot:number, sense:number, charm?: number, luck?: number }}
   */
  function normalizePlayerBase(pb) {
    var o = {};
    for (var i = 0; i < BASE_KEYS.length; i++) {
      var k = BASE_KEYS[i];
      o[k] = Math.max(0, Math.round(numOrZero(pb && pb[k])));
    }
    if (pb && typeof pb.charm === "number" && isFinite(pb.charm)) o.charm = Math.round(pb.charm);
    if (pb && typeof pb.luck === "number" && isFinite(pb.luck)) o.luck = Math.round(pb.luck);
    return o;
  }

  /**
   * 将任意残缺对象规范为完整 CharacterSheet（NPC / 剧情生成用）
   * @param {Object} input
   * @returns {Object}
   */
  function normalizeCharacterSheet(input) {
    var src = input && typeof input === "object" ? input : {};
    var id =
      src.id != null && String(src.id).trim() !== ""
        ? String(src.id).trim()
        : "npc_" + (typeof Date.now === "function" ? Date.now() : Math.floor(Math.random() * 1e9));
    var displayName =
      src.displayName != null && String(src.displayName).trim() !== ""
        ? String(src.displayName).trim()
        : "未命名";
    var realmIn = src.realm && typeof src.realm === "object" ? src.realm : {};
    var major =
      realmIn.major != null && String(realmIn.major).trim() !== ""
        ? String(realmIn.major).trim()
        : "练气";
    var minor =
      major === "化神"
        ? null
        : realmIn.minor != null && String(realmIn.minor).trim() !== ""
          ? String(realmIn.minor).trim()
          : "初期";
    var playerBase = normalizePlayerBase(src.playerBase);
    var maxHp =
      typeof src.maxHp === "number" && isFinite(src.maxHp)
        ? Math.max(1, Math.round(src.maxHp))
        : Math.max(1, playerBase.hp);
    var maxMp =
      typeof src.maxMp === "number" && isFinite(src.maxMp)
        ? Math.max(1, Math.round(src.maxMp))
        : Math.max(1, playerBase.mp);
    var currentHp =
      typeof src.currentHp === "number" && isFinite(src.currentHp)
        ? clampInt(src.currentHp, 0, maxHp)
        : maxHp;
    var currentMp =
      typeof src.currentMp === "number" && isFinite(src.currentMp)
        ? clampInt(src.currentMp, 0, maxMp)
        : maxMp;

    var out = {
      id: id,
      displayName: displayName,
      realm: major === "化神" ? { major: major, minor: null } : { major: major, minor: minor },
      playerBase: playerBase,
      maxHp: maxHp,
      maxMp: maxMp,
      currentHp: currentHp,
      currentMp: currentMp,
      isVisible: src && src.isVisible === false ? false : true,
    };
    if (src && src.isDead === true) {
      out.isDead = true;
    }
    /** 血量归零视为阵亡（状态 AI 改 HP 时未必写 isDead；与战斗结算口径一致） */
    if (out.isDead === true || out.currentHp === 0) {
      out.isDead = true;
      out.currentHp = 0;
    }
    if (typeof src.favorability === "number" && isFinite(src.favorability)) {
      out.favorability = clampFavorability(src.favorability);
    }
    if (src.avatarUrl != null && String(src.avatarUrl).trim() !== "") {
      out.avatarUrl = String(src.avatarUrl).trim();
    }
    if (src.gender != null && String(src.gender).trim() !== "") out.gender = String(src.gender).trim();
    if (src.linggen != null && String(src.linggen).trim() !== "") out.linggen = String(src.linggen).trim();
    if (typeof src.age === "number" && isFinite(src.age)) out.age = Math.max(0, Math.floor(src.age));
    if (typeof src.shouyuan === "number" && isFinite(src.shouyuan)) {
      out.shouyuan = Math.max(0, Math.floor(src.shouyuan));
    }
    if (src.identity != null && String(src.identity).trim() !== "") {
      out.identity = String(src.identity).trim();
    }
    if (src.currentStageGoal != null && String(src.currentStageGoal).trim() !== "") {
      out.currentStageGoal = String(src.currentStageGoal).trim();
    }
    if (src.longTermGoal != null && String(src.longTermGoal).trim() !== "") {
      out.longTermGoal = String(src.longTermGoal).trim();
    }
    if (src.hobby != null && String(src.hobby).trim() !== "") {
      out.hobby = String(src.hobby).trim();
    }
    if (src.fear != null && String(src.fear).trim() !== "") {
      out.fear = String(src.fear).trim();
    }
    if (src.personality != null && String(src.personality).trim() !== "") {
      out.personality = String(src.personality).trim();
    }
    if (Array.isArray(src.traits)) out.traits = src.traits.slice();
    if (Array.isArray(src.inventorySlots)) out.inventorySlots = JSON.parse(JSON.stringify(src.inventorySlots));
    if (Array.isArray(src.gongfaSlots)) out.gongfaSlots = JSON.parse(JSON.stringify(src.gongfaSlots));
    if (Array.isArray(src.equippedSlots)) out.equippedSlots = JSON.parse(JSON.stringify(src.equippedSlots));
    if (typeof src.xiuwei === "number" && isFinite(src.xiuwei)) {
      out.xiuwei = Math.max(0, Math.floor(src.xiuwei));
    }
    return out;
  }

  function formatRealmLine(realm) {
    if (!realm || typeof realm !== "object") return "练气初期";
    var major = realm.major != null && String(realm.major).trim() !== "" ? String(realm.major).trim() : "练气";
    if (major === "化神") return major;
    var minor =
      realm.minor != null && String(realm.minor).trim() !== "" ? String(realm.minor).trim() : "初期";
    return major + minor;
  }

  /** 左栏同款：五行字连续拼接；无灵根 → — */
  function formatLinggenShort(linggenFull) {
    var raw = linggenFull == null ? "" : String(linggenFull).trim();
    if (raw === "" || raw === "无灵根") return "—";
    var LS = global.LinggenState;
    var els = LS && typeof LS.parseElements === "function" ? LS.parseElements(raw) : [];
    if (!els.length) return "—";
    return els.join("");
  }

  global.MjCharacterSheet = {
    BASE_KEYS: BASE_KEYS,
    normalize: normalizeCharacterSheet,
    normalizePlayerBase: normalizePlayerBase,
    formatRealmLine: formatRealmLine,
    formatLinggenShort: formatLinggenShort,
  };
})(typeof window !== "undefined" ? window : globalThis);
