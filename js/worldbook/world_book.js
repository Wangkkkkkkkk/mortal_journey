/**
 * 酒馆风格「世界书」：按关键词从对话上下文中挑选条目，合并进 system。
 * 条目数据见同目录 world_book_entries.js（须先于本文件加载）；constant 为 true 的条目每次请求都会带上。
 */
(function (global) {
  "use strict";

  /** 同步到 SillyTavernBridge 时使用的世界书名称 */
  var BRIDGE_BOOK_NAME = "mortal_journey";

  /**
   * @typedef {Object} WorldBookEntry
   * @property {string} id
   * @property {string} name 展示用标题
   * @property {boolean} [constant=false] 为 true 时无视关键词，始终注入
   * @property {string[]} keys 触发关键词（任一词出现在扫描文本中即视为命中）
   * @property {string} content 注入的正文
   * @property {number} [priority=0] 越大越靠前；constant 条目也参与排序
   */

  function cloneEntry(e) {
    if (!e || typeof e !== "object") return null;
    var keys = e.keys;
    var keysCopy = Array.isArray(keys) ? keys.slice() : typeof keys === "string" && keys.trim() ? [keys.trim()] : [];
    return {
      id: String(e.id || ""),
      name: String(e.name || e.id || ""),
      constant: !!e.constant,
      keys: keysCopy,
      content: String(e.content || ""),
      priority: typeof e.priority === "number" && isFinite(e.priority) ? e.priority : 0,
    };
  }

  function loadEntriesFromGlobal() {
    var g = global.MortalJourneyWorldBookEntries;
    if (!Array.isArray(g)) return [];
    var out = [];
    for (var i = 0; i < g.length; i++) {
      var c = cloneEntry(g[i]);
      if (c && c.content) out.push(c);
    }
    return out;
  }

  /** @type {WorldBookEntry[]} */
  var WORLD_BOOK_ENTRIES = loadEntriesFromGlobal();

  function normalizeKeys(keys) {
    if (!keys) return [];
    if (typeof keys === "string") return keys.trim() ? [keys.trim()] : [];
    if (!Array.isArray(keys)) return [];
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i] || "").trim();
      if (k) out.push(k);
    }
    return out;
  }

  function entryScore(entry, scanLower) {
    if (!entry || entry.constant) return { hits: 0, matched: false };
    var keys = normalizeKeys(entry.keys);
    if (!keys.length) return { hits: 0, matched: false };
    var hits = 0;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!key) continue;
      var kl = key.toLowerCase();
      if (scanLower.indexOf(kl) !== -1) hits++;
    }
    return { hits: hits, matched: hits > 0 };
  }

  /**
   * @param {string} scanText 用户输入 + 近期对话 + 可选状态摘要
   * @param {{ maxEntries?: number }} [options]
   * @returns {WorldBookEntry[]}
   */
  function selectEntries(scanText, options) {
    var maxEntries = options && typeof options.maxEntries === "number" ? options.maxEntries : 8;
    var scan = String(scanText || "");
    var scanLower = scan.toLowerCase();

    var constant = [];
    var triggered = [];
    for (var i = 0; i < WORLD_BOOK_ENTRIES.length; i++) {
      var e = WORLD_BOOK_ENTRIES[i];
      if (!e || !e.content) continue;
      var pr = typeof e.priority === "number" && isFinite(e.priority) ? e.priority : 0;
      if (e.constant) {
        constant.push({ entry: e, priority: pr, hits: 999 });
        continue;
      }
      var sc = entryScore(e, scanLower);
      if (sc.matched) triggered.push({ entry: e, priority: pr, hits: sc.hits });
    }

    function sortFn(a, b) {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.hits !== a.hits) return b.hits - a.hits;
      return String(a.entry.id).localeCompare(String(b.entry.id));
    }

    constant.sort(sortFn);
    triggered.sort(sortFn);

    var out = [];
    var seen = {};
    for (var c = 0; c < constant.length; c++) {
      var idc = constant[c].entry.id;
      if (seen[idc]) continue;
      seen[idc] = true;
      out.push(constant[c].entry);
      if (out.length >= maxEntries) return out;
    }
    for (var t = 0; t < triggered.length; t++) {
      var idt = triggered[t].entry.id;
      if (seen[idt]) continue;
      seen[idt] = true;
      out.push(triggered[t].entry);
      if (out.length >= maxEntries) break;
    }
    return out;
  }

  /**
   * @param {WorldBookEntry[]} entries
   * @returns {string} 拼进 system 的片段；无条目时返回 ""
   */
  function formatForSystem(entries) {
    if (!entries || !entries.length) return "";
    var parts = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.content) continue;
      var title = e.name || e.id || "条目";
      parts.push("【" + title + "】\n" + String(e.content).trim());
    }
    if (!parts.length) return "";
    return "【世界书摘录】\n\n" + parts.join("\n\n· · · 条目分隔 · · ·\n\n");
  }

  function getAllEntries() {
    return WORLD_BOOK_ENTRIES.slice();
  }

  /**
   * 将当前条目写入桥接层 localStorage（与 silly_tarven/bridge.js 的 replaceWorldbook 对齐）
   */
  function syncToBridgeStorage() {
    var Bridge = global.SillyTavernBridge;
    if (!Bridge || typeof Bridge.replaceWorldbook !== "function") return false;
    var rows = [];
    for (var i = 0; i < WORLD_BOOK_ENTRIES.length; i++) {
      var e = WORLD_BOOK_ENTRIES[i];
      if (!e) continue;
      rows.push({
        id: e.id,
        comment: e.name || e.id,
        keys: normalizeKeys(e.keys),
        content: String(e.content || ""),
        constant: !!e.constant,
        priority: typeof e.priority === "number" ? e.priority : 0,
      });
    }
    Bridge.replaceWorldbook(BRIDGE_BOOK_NAME, rows);
    return true;
  }

  global.MortalJourneyWorldBook = {
    BRIDGE_BOOK_NAME: BRIDGE_BOOK_NAME,
    /** 从 world_book_entries.js 的全局数组重新克隆（会丢弃运行中 setEntries 的修改） */
    reloadFromEntriesFile: function () {
      WORLD_BOOK_ENTRIES = loadEntriesFromGlobal();
    },
    /** 供外部扩展：push 新条目或整体替换 */
    setEntries: function (list) {
      if (!Array.isArray(list)) return;
      WORLD_BOOK_ENTRIES = list;
    },
    getAllEntries: getAllEntries,
    selectEntries: selectEntries,
    formatForSystem: formatForSystem,
    syncToBridgeStorage: syncToBridgeStorage,
  };
})(typeof window !== "undefined" ? window : globalThis);
