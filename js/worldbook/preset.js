/**
 * 酒馆 / OpenAI 兼容 · 剧情向系统预设（逻辑层）
 * 数据与同目录 preset_content.js（须先于本文件加载）
 */
(function (global) {
  "use strict";

  /**
   * @typedef {Object} MortalJourneyPresetRow
   * @property {string} id
   * @property {string} name
   * @property {string} systemPrompt
   * @property {string} [userPrefix]
   */

  /**
   * @typedef {Object} MortalJourneyPresetConfig
   * @property {string} systemPrompt
   * @property {string} userPrefix
   * @property {boolean} appendRuntimeState
   * @property {string} activePresetId
   * @property {string} activePresetName
   */

  function getContentRoot() {
    var c = global.MortalJourneyPresetContent;
    return c && typeof c === "object" ? c : null;
  }

  function normalizePresetRow(row) {
    if (!row || typeof row !== "object") return null;
    var id = String(row.id || "").trim();
    if (!id) return null;
    return {
      id: id,
      name: String(row.name || id).trim() || id,
      systemPrompt: row.systemPrompt != null ? String(row.systemPrompt) : "",
      userPrefix: row.userPrefix != null ? String(row.userPrefix) : "",
    };
  }

  function getPresetListFromContent(content) {
    var raw = content && Array.isArray(content.presets) ? content.presets : [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var p = normalizePresetRow(raw[i]);
      if (p) out.push(p);
    }
    return out;
  }

  function findPresetById(list, id) {
    var sid = String(id || "").trim();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === sid) return list[i];
    }
    return null;
  }

  function resolveActiveRow(content, list) {
    var want = content && content.activePresetId != null ? String(content.activePresetId).trim() : "";
    var row = want ? findPresetById(list, want) : null;
    if (row) return row;
    if (list.length) return list[0];
    return null;
  }

  function buildConfigFromContent(content) {
    var list = getPresetListFromContent(content);
    var row = resolveActiveRow(content, list);
    var globalPrefix = content && content.userPrefix != null ? String(content.userPrefix) : "";
    var appendRt = !(content && content.appendRuntimeState === false);

    var systemPrompt = row ? row.systemPrompt : "";
    var userPrefix = row && String(row.userPrefix || "").trim() !== "" ? String(row.userPrefix) : globalPrefix;

    return {
      systemPrompt: systemPrompt,
      userPrefix: userPrefix,
      appendRuntimeState: appendRt,
      activePresetId: row ? row.id : "",
      activePresetName: row ? row.name : "",
      _presetList: list,
    };
  }

  function readContentFromGlobal() {
    var content = getContentRoot();
    if (!content) return null;
    return buildConfigFromContent(content);
  }

  /** @type {MortalJourneyPresetConfig & { _presetList?: MortalJourneyPresetRow[] }} */
  var CONFIG = readContentFromGlobal() || {
    systemPrompt: "",
    userPrefix: "",
    appendRuntimeState: true,
    activePresetId: "",
    activePresetName: "",
    _presetList: [],
  };

  function applyConfigBundle(bundle) {
    if (!bundle) return;
    CONFIG.systemPrompt = bundle.systemPrompt;
    CONFIG.userPrefix = bundle.userPrefix;
    CONFIG.appendRuntimeState = bundle.appendRuntimeState;
    CONFIG.activePresetId = bundle.activePresetId;
    CONFIG.activePresetName = bundle.activePresetName;
    CONFIG._presetList = bundle._presetList || [];
  }

  function getRaw() {
    return {
      systemPrompt: CONFIG.systemPrompt,
      userPrefix: CONFIG.userPrefix,
      appendRuntimeState: CONFIG.appendRuntimeState,
      activePresetId: CONFIG.activePresetId,
      activePresetName: CONFIG.activePresetName,
    };
  }

  function getSystemPrompt() {
    return String(CONFIG.systemPrompt || "").trim();
  }

  function getUserPrefix() {
    return String(CONFIG.userPrefix || "").trim();
  }

  function shouldAppendRuntimeState() {
    return !!CONFIG.appendRuntimeState;
  }

  function getPresetSummaries() {
    var list = CONFIG._presetList || [];
    return list.map(function (p) {
      return { id: p.id, name: p.name };
    });
  }

  function getActivePresetId() {
    return String(CONFIG.activePresetId || "");
  }

  /**
   * 切换当前预设（会同步改 content 根上的 activePresetId，便于与文件意图一致；再重算 CONFIG）
   */
  function setActivePreset(presetId) {
    var content = getContentRoot();
    var list = content ? getPresetListFromContent(content) : CONFIG._presetList || [];
    var row = findPresetById(list, presetId);
    if (!row) throw new Error("预设不存在: " + presetId);
    if (content) content.activePresetId = row.id;
    var src =
      content ||
      {
        presets: list,
        activePresetId: row.id,
        userPrefix: CONFIG.userPrefix,
        appendRuntimeState: CONFIG.appendRuntimeState,
      };
    applyConfigBundle(buildConfigFromContent(src));
    return getRaw();
  }

  global.MortalJourneyAiPreset = {
    reloadFromContentFile: function () {
      var bundle = readContentFromGlobal();
      if (bundle) applyConfigBundle(bundle);
    },

    replaceConfig: function (next) {
      if (!next || typeof next !== "object") return;
      if (typeof next.systemPrompt === "string") CONFIG.systemPrompt = next.systemPrompt;
      if (typeof next.userPrefix === "string") CONFIG.userPrefix = next.userPrefix;
      if (typeof next.appendRuntimeState === "boolean") CONFIG.appendRuntimeState = next.appendRuntimeState;
    },

    getRaw: getRaw,
    getSystemPrompt: getSystemPrompt,
    getUserPrefix: getUserPrefix,
    shouldAppendRuntimeState: shouldAppendRuntimeState,

    getPresetSummaries: getPresetSummaries,
    getActivePresetId: getActivePresetId,
    setActivePreset: setActivePreset,
  };
})(typeof window !== "undefined" ? window : globalThis);
