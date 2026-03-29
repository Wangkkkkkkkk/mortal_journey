/**
 * 角色属性：基础属性（战斗用）与特殊属性（非战斗/叙事等）。
 * - 基础属性：均为整数（int）。
 * - 特殊属性（魅力、气运）：均为整数，且取值范围 [SPECIAL_MIN, SPECIAL_MAX]（默认 0–100）。
 * 通过全局 CharacterAttribute 访问（非 ES module 环境）。
 */
(function (global) {
  "use strict";

  /** 特殊属性合法区间（闭区间） */
  const SPECIAL_MIN = 0;
  const SPECIAL_MAX = 100;

  // ---------------------------------------------------------------------------
  // 键定义（内部统一用英文键，便于战斗公式与存档；中文见 LABEL_ZH）
  // ---------------------------------------------------------------------------

  /** @type {readonly string[]} */
  const BASE_KEYS = Object.freeze([
    "hp", // 血量
    "mp", // 法力
    "patk", // 物攻
    "pdef", // 物防
    "matk", // 法攻
    "mdef", // 法防
    "foot", // 脚力
    "sense", // 神识
  ]);

  /** @type {readonly string[]} */
  const SPECIAL_KEYS = Object.freeze([
    "charm", // 魅力
    "luck", // 气运
  ]);

  /** @type {Readonly<Record<string, string>>} */
  const LABEL_ZH = Object.freeze({
    hp: "血量",
    mp: "法力",
    patk: "物攻",
    pdef: "物防",
    matk: "法攻",
    mdef: "法防",
    foot: "脚力",
    charm: "魅力",
    luck: "气运",
    sense: "神识",
  });

  const ALL_KEYS = Object.freeze([...BASE_KEYS, ...SPECIAL_KEYS]);

  const BASE_KEY_SET = new Set(BASE_KEYS);
  const SPECIAL_KEY_SET = new Set(SPECIAL_KEYS);

  // ---------------------------------------------------------------------------
  // 类型说明（JSDoc）
  // ---------------------------------------------------------------------------

  /**
   * @typedef {Object} BaseAttributes
   * @property {number} hp 整数
   * @property {number} mp 整数
   * @property {number} patk 整数
   * @property {number} pdef 整数
   * @property {number} matk 整数
   * @property {number} mdef 整数
   * @property {number} foot 整数
   * @property {number} sense 神识，整数，无区间限制（由战斗/养成等系统约束）
   */

  /**
   * @typedef {Object} SpecialAttributes
   * @property {number} charm 整数，[SPECIAL_MIN, SPECIAL_MAX]
   * @property {number} luck 整数，[SPECIAL_MIN, SPECIAL_MAX]
   */

  /**
   * @typedef {Object} CharacterAttributes
   * @property {BaseAttributes} base
   * @property {SpecialAttributes} special
   */

  // ---------------------------------------------------------------------------
  // 内部工具
  // ---------------------------------------------------------------------------

  function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  /** 规范为基础属性用整数（四舍五入；非法则 fallback） */
  function toInt(n, fallback) {
    if (isFiniteNumber(n)) return Math.round(n);
    const x = Number(n);
    return Number.isFinite(x) ? Math.round(x) : fallback;
  }

  /** 特殊属性：整数并限制在 [SPECIAL_MIN, SPECIAL_MAX] */
  function clampSpecialInt(n) {
    if (n < SPECIAL_MIN) return SPECIAL_MIN;
    if (n > SPECIAL_MAX) return SPECIAL_MAX;
    return n;
  }

  /**
   * @param {Record<string, number>} target
   * @param {readonly string[]} keys
   * @param {Record<string, unknown>} [source]
   * @param {'base' | 'special'} kind
   */
  function pickInto(target, keys, source, kind) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (source && Object.prototype.hasOwnProperty.call(source, k)) {
        const v = toInt(source[k], 0);
        target[k] = kind === "special" ? clampSpecialInt(v) : v;
      } else if (!Object.prototype.hasOwnProperty.call(target, k)) {
        target[k] = 0;
      }
    }
    return target;
  }

  // ---------------------------------------------------------------------------
  // 公开 API
  // ---------------------------------------------------------------------------

  const CharacterAttribute = {
    BASE_KEYS,
    SPECIAL_KEYS,
    ALL_KEYS,
    LABEL_ZH,
    SPECIAL_MIN,
    SPECIAL_MAX,

    /**
     * 将任意输入规范为特殊属性允许范围内的整数（用于 UI 滑条等）。
     * @param {unknown} n
     * @returns {number}
     */
    clampSpecialValue(n) {
      return clampSpecialInt(toInt(n, 0));
    },

    /** @param {string} key */
    isBaseKey(key) {
      return BASE_KEY_SET.has(String(key));
    },

    /** @param {string} key */
    isSpecialKey(key) {
      return SPECIAL_KEY_SET.has(String(key));
    },

    /** @returns {BaseAttributes} */
    createDefaultBase() {
      return /** @type {BaseAttributes} */ (pickInto({}, BASE_KEYS, null, "base"));
    },

    /** @returns {SpecialAttributes} */
    createDefaultSpecial() {
      return /** @type {SpecialAttributes} */ (pickInto({}, SPECIAL_KEYS, null, "special"));
    },

    /** @returns {CharacterAttributes} */
    createDefault() {
      return {
        base: this.createDefaultBase(),
        special: this.createDefaultSpecial(),
      };
    },

    /**
     * 仅规范化基础属性（供战斗前取数）。
     * @param {Partial<BaseAttributes>} [partial]
     * @returns {BaseAttributes}
     */
    normalizeBase(partial) {
      const out = this.createDefaultBase();
      if (partial && typeof partial === "object") pickInto(out, BASE_KEYS, partial, "base");
      return out;
    },

    /**
     * 特殊属性：整数且落在 [SPECIAL_MIN, SPECIAL_MAX]。
     * @param {Partial<SpecialAttributes>} [partial]
     * @returns {SpecialAttributes}
     */
    normalizeSpecial(partial) {
      const out = this.createDefaultSpecial();
      if (partial && typeof partial === "object") pickInto(out, SPECIAL_KEYS, partial, "special");
      return out;
    },

    /**
     * 完整角色属性：缺省字段补 0，未知键忽略。
     * @param {Partial<{ base: Partial<BaseAttributes>, special: Partial<SpecialAttributes> }>} [partial]
     * @returns {CharacterAttributes}
     */
    normalize(partial) {
      const base = partial && partial.base ? this.normalizeBase(partial.base) : this.createDefaultBase();
      const special =
        partial && partial.special ? this.normalizeSpecial(partial.special) : this.createDefaultSpecial();
      return { base, special };
    },

    /**
     * 深拷贝，避免引用共享。
     * @param {CharacterAttributes} attrs
     * @returns {CharacterAttributes}
     */
    clone(attrs) {
      const n = this.normalize(attrs);
      return {
        base: { ...n.base },
        special: { ...n.special },
      };
    },

    /**
     * 合并增量（用于装备、Buff、临时修正）。基础属性结果取整；特殊属性加算后再钳位到 [SPECIAL_MIN, SPECIAL_MAX]。
     * @param {CharacterAttributes} baseAttrs
     * @param {Partial<BaseAttributes>} [deltaBase]
     * @param {Partial<SpecialAttributes>} [deltaSpecial]
     * @returns {CharacterAttributes}
     */
    mergeDelta(baseAttrs, deltaBase, deltaSpecial) {
      const cur = this.normalize(baseAttrs);
      const out = this.clone(cur);
      if (deltaBase && typeof deltaBase === "object") {
        for (let i = 0; i < BASE_KEYS.length; i++) {
          const k = BASE_KEYS[i];
          if (Object.prototype.hasOwnProperty.call(deltaBase, k)) {
            out.base[k] = toInt(out.base[k], 0) + toInt(deltaBase[k], 0);
          }
        }
      }
      if (deltaSpecial && typeof deltaSpecial === "object") {
        for (let i = 0; i < SPECIAL_KEYS.length; i++) {
          const k = SPECIAL_KEYS[i];
          if (Object.prototype.hasOwnProperty.call(deltaSpecial, k)) {
            out.special[k] = clampSpecialInt(toInt(out.special[k], 0) + toInt(deltaSpecial[k], 0));
          }
        }
      }
      return out;
    },

    /**
     * 战斗层使用的扁平快照：全部基础属性（含神识）。
     * 后续战斗公式可直接解构此对象。
     * @param {CharacterAttributes} attrs
     * @returns {BaseAttributes}
     */
    toCombatSnapshot(attrs) {
      return this.normalizeBase(attrs && attrs.base);
    },

    /**
     * 校验结构是否完整：基础属性为有限整数；特殊属性为整数且在 [SPECIAL_MIN, SPECIAL_MAX]。
     * @param {unknown} attrs
     * @returns {{ ok: boolean, errors: string[] }}
     */
    validate(attrs) {
      const errors = [];
      if (!attrs || typeof attrs !== "object") {
        errors.push("attributes must be an object");
        return { ok: false, errors };
      }
      const a = /** @type {CharacterAttributes} */ (attrs);
      if (!a.base || typeof a.base !== "object") errors.push("missing base");
      if (!a.special || typeof a.special !== "object") errors.push("missing special");
      if (errors.length) return { ok: false, errors };

      for (let i = 0; i < BASE_KEYS.length; i++) {
        const k = BASE_KEYS[i];
        const v = a.base[k];
        if (!Number.isInteger(v)) errors.push(`base.${k} must be an integer`);
      }
      for (let i = 0; i < SPECIAL_KEYS.length; i++) {
        const k = SPECIAL_KEYS[i];
        const v = a.special[k];
        if (!Number.isInteger(v)) errors.push(`special.${k} must be an integer`);
        else if (v < SPECIAL_MIN || v > SPECIAL_MAX) {
          errors.push(`special.${k} must be between ${SPECIAL_MIN} and ${SPECIAL_MAX}`);
        }
      }
      return { ok: errors.length === 0, errors };
    },
  };

  global.CharacterAttribute = CharacterAttribute;
})(typeof window !== "undefined" ? window : globalThis);
