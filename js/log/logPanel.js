/**
 * 凡人修仙传 · 调试日志面板
 * - 页面常驻可折叠窗口，输出 log / 可选接管 console
 * - 全局：GameLog
 */
(function (global) {
  "use strict";

  /**
   * 是否挂载左下角「调试日志」面板（无界面开关）。
   * - false：不占屏幕，GameLog 仍写入浏览器控制台。
   * - true：研发调试；显示面板并可接管 console。
   *
   * GitHub Pages（hostname 以 .github.io 结尾）会强制视为 false，避免线上仍加载到浏览器缓存里的旧脚本把面板打开。
   * 若要在线上临时看面板：在页面 URL 后加参数 mjDebugLog=1（例如 .../mortal_journey/?mjDebugLog=1）。
   */
  var MJ_GAME_LOG_PANEL_UI_ENABLED = false;

  (function applyHostRuleForLogPanel() {
    try {
      var loc = global.location;
      if (!loc || !loc.hostname) return;
      var host = String(loc.hostname);
      var onGithubPages = /\.github\.io$/i.test(host);
      if (!onGithubPages) return;
      var forceDebug = /[?&]mjDebugLog=1(?:&|$)/.test(String(loc.search || ""));
      MJ_GAME_LOG_PANEL_UI_ENABLED = !!forceDebug;
    } catch (_eHost) {}
  })();

  var MAX_LINES = 500;
  var PANEL_ID = "mj-log-panel";

  var _lines = [];
  var _collapsed = false;
  var _bridgeInstalled = false;
  var _origConsole = {};

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function nowTimeStr() {
    var d = new Date();
    return (
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes()) +
      ":" +
      pad2(d.getSeconds()) +
      "." +
      String(d.getMilliseconds()).padStart(3, "0")
    );
  }

  function formatArgs(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === undefined) parts.push("undefined");
      else if (a === null) parts.push("null");
      else if (typeof a === "string") parts.push(a);
      else
        try {
          parts.push(JSON.stringify(a));
        } catch (_e) {
          parts.push(String(a));
        }
    }
    return parts.join(" ");
  }

  function ensurePanel() {
    if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return;
    if (document.getElementById(PANEL_ID)) return;

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "调试日志");

    panel.innerHTML =
      '<div id="mj-log-header" title="点击折叠/展开">' +
      '<span id="mj-log-header-title">调试日志</span>' +
      '<button type="button" id="mj-log-toggle" aria-expanded="true">▼</button>' +
      "</div>" +
      '<div id="mj-log-toolbar">' +
      '<button type="button" id="mj-log-clear">清空</button>' +
      '<button type="button" id="mj-log-copy">复制全部</button>' +
      '<label><input type="checkbox" id="mj-log-autoscroll" checked /> 自动滚动</label>' +
      "</div>" +
      '<div id="mj-log-body"></div>';

    (document.body || document.documentElement).appendChild(panel);

    var bodyEl = panel.querySelector("#mj-log-body");
    var autoScrollEl = panel.querySelector("#mj-log-autoscroll");
    GameLog._refs = { panel: panel, body: bodyEl, autoScroll: autoScrollEl };

    panel.querySelector("#mj-log-header").addEventListener("click", function (e) {
      if (e.target && e.target.id === "mj-log-toggle") return;
      GameLog.toggle();
    });
    panel.querySelector("#mj-log-toggle").addEventListener("click", function (e) {
      e.stopPropagation();
      GameLog.toggle();
    });
    panel.querySelector("#mj-log-clear").addEventListener("click", function () {
      GameLog.clear();
    });
    panel.querySelector("#mj-log-copy").addEventListener("click", function () {
      GameLog.copyAll();
    });

    GameLog._refs = { panel: panel, body: bodyEl, autoScroll: autoScrollEl };
  }

  function emitToNativeConsole(level, message) {
    var c = global.console;
    if (!c) return;
    var L = String(level || "log").toLowerCase();
    var fn =
      L === "error" && c.error
        ? c.error
        : L === "warn" && c.warn
          ? c.warn
          : L === "debug" && c.debug
            ? c.debug
            : L === "info" && c.info
              ? c.info
              : c.log;
    if (fn && typeof fn === "function") fn.call(c, message);
  }

  function renderLine(level, message) {
    if (!MJ_GAME_LOG_PANEL_UI_ENABLED) {
      emitToNativeConsole(level, message);
      return;
    }
    ensurePanel();
    var refs = GameLog._refs;
    if (!refs || !refs.body) return;

    var t = nowTimeStr();
    var line = document.createElement("div");
    line.className = "mj-log-line";
    var safeLevel = String(level || "log").toLowerCase();
    if (["log", "info", "warn", "error", "debug"].indexOf(safeLevel) < 0) safeLevel = "log";

    line.innerHTML =
      '<span class="mj-log-time">' +
      t +
      '</span><span class="mj-log-level mj-log-level--' +
      safeLevel +
      '">' +
      safeLevel.toUpperCase() +
      '</span><span class="mj-log-msg"></span>';
    line.querySelector(".mj-log-msg").textContent = message;

    refs.body.appendChild(line);
    _lines.push({ level: safeLevel, time: t, text: message });

    while (_lines.length > MAX_LINES) {
      _lines.shift();
      if (refs.body.firstChild) refs.body.removeChild(refs.body.firstChild);
    }

    if (refs.autoScroll && refs.autoScroll.checked) {
      refs.body.scrollTop = refs.body.scrollHeight;
    }
  }

  function applyCollapsedUI() {
    if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return;
    var refs = GameLog._refs;
    if (!refs || !refs.panel) return;
    var panel = refs.panel;
    var btn = panel.querySelector("#mj-log-toggle");
    if (_collapsed) {
      panel.classList.add("mj-log-panel--collapsed");
      if (btn) {
        btn.textContent = "▲";
        btn.setAttribute("aria-expanded", "false");
      }
    } else {
      panel.classList.remove("mj-log-panel--collapsed");
      if (btn) {
        btn.textContent = "▼";
        btn.setAttribute("aria-expanded", "true");
      }
    }
  }

  var GameLog = {
    _refs: null,

    /** 与 MJ_GAME_LOG_PANEL_UI_ENABLED 一致；供其他脚本判断是否展示过面板提示等 */
    panelUiEnabled: MJ_GAME_LOG_PANEL_UI_ENABLED,

    /** 最大保留条数 */
    maxLines: MAX_LINES,

    init: function (options) {
      if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return this;
      options = options || {};
      ensurePanel();
      if (options.collapsed === true) {
        _collapsed = true;
        applyCollapsedUI();
      }
      if (options.captureConsole !== false) {
        this.installConsoleBridge();
      }
      this.info("[GameLog] 面板已就绪");
      return this;
    },

    toggle: function () {
      if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return;
      _collapsed = !_collapsed;
      applyCollapsedUI();
    },

    setCollapsed: function (collapsed) {
      if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return;
      _collapsed = !!collapsed;
      applyCollapsedUI();
    },

    clear: function () {
      if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return;
      _lines = [];
      var refs = this._refs;
      if (refs && refs.body) refs.body.innerHTML = "";
    },

    copyAll: function () {
      if (!MJ_GAME_LOG_PANEL_UI_ENABLED) return;
      var text = _lines
        .map(function (row) {
          return row.time + " " + row.level.toUpperCase() + " " + row.text;
        })
        .join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {
          _fallbackCopy(text);
        });
      } else {
        _fallbackCopy(text);
      }
    },

    log: function () {
      renderLine("log", formatArgs(arguments));
    },
    info: function () {
      renderLine("info", formatArgs(arguments));
    },
    debug: function () {
      renderLine("debug", formatArgs(arguments));
    },
    warn: function () {
      renderLine("warn", formatArgs(arguments));
    },
    error: function () {
      renderLine("error", formatArgs(arguments));
    },

    installConsoleBridge: function () {
      if (!MJ_GAME_LOG_PANEL_UI_ENABLED || _bridgeInstalled) return;
      var c = console;
      _origConsole.log = c.log ? c.log.bind(c) : function () {};
      _origConsole.info = c.info ? c.info.bind(c) : _origConsole.log;
      _origConsole.warn = c.warn ? c.warn.bind(c) : _origConsole.log;
      _origConsole.error = c.error ? c.error.bind(c) : _origConsole.log;
      _origConsole.debug = c.debug ? c.debug.bind(c) : _origConsole.log;

      c.log = function () {
        _origConsole.log.apply(c, arguments);
        renderLine("log", formatArgs(arguments));
      };
      c.info = function () {
        _origConsole.info.apply(c, arguments);
        renderLine("info", formatArgs(arguments));
      };
      c.warn = function () {
        _origConsole.warn.apply(c, arguments);
        renderLine("warn", formatArgs(arguments));
      };
      c.error = function () {
        _origConsole.error.apply(c, arguments);
        renderLine("error", formatArgs(arguments));
      };
      c.debug = function () {
        _origConsole.debug.apply(c, arguments);
        renderLine("debug", formatArgs(arguments));
      };

      _bridgeInstalled = true;
    },

    uninstallConsoleBridge: function () {
      if (!_bridgeInstalled) return;
      var c = console;
      c.log = _origConsole.log;
      c.info = _origConsole.info;
      c.warn = _origConsole.warn;
      c.error = _origConsole.error;
      c.debug = _origConsole.debug;
      _bridgeInstalled = false;
    },
  };

  function _fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (_e) {}
    document.body.removeChild(ta);
  }

  function autoStart() {
    function run() {
      if (MJ_GAME_LOG_PANEL_UI_ENABLED) {
        GameLog.init({ captureConsole: true, collapsed: false });
      }
    }
    if (document.body) run();
    else document.addEventListener("DOMContentLoaded", run);
  }

  global.GameLog = GameLog;
  autoStart();
})(typeof window !== "undefined" ? window : globalThis);
