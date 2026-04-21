/**
 * @fileoverview 与 mortal_journey GameLog 行为接近的轻量日志：内存环形缓冲 + 控制台输出 + Vue 面板订阅。
 */

const MAX_LINES = 500;

export type GameLogLevel = "log" | "info" | "debug" | "warn" | "error";

export interface GameLogLine {
  level: string;
  time: string;
  text: string;
}

const _lines: GameLogLine[] = [];

const _listeners = new Set<() => void>();

function pad2(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

function nowTimeStr(): string {
  const d = new Date();
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

function formatArg(a: unknown): string {
  if (a === undefined) return "undefined";
  if (a === null) return "null";
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function formatArgs(args: readonly unknown[]): string {
  const parts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    parts.push(formatArg(args[i]));
  }
  return parts.join(" ");
}

function pushLine(level: string, message: string): void {
  const time = nowTimeStr();
  const safeLevel = String(level || "log").toLowerCase();
  const row: GameLogLine = { level: safeLevel, time, text: message };
  _lines.push(row);
  while (_lines.length > MAX_LINES) {
    _lines.shift();
  }
  _listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  });

  const c = typeof console !== "undefined" ? console : null;
  if (!c) return;
  const L = safeLevel;
  const fn =
    L === "error" && c.error
      ? c.error
      : L === "warn" && c.warn
        ? c.warn
        : L === "debug" && c.debug
          ? c.debug
          : L === "info" && c.info
            ? c.info
            : c.log;
  if (fn && typeof fn === "function") {
    fn.call(c, message);
  }
}

export const gameLog = {
  maxLines: MAX_LINES,

  /**
   * 是否显示左下角调试日志面板：只改这一处即可。true = 显示，false = 不显示（日志仍会进控制台与内存缓冲）。
   */
  showPanel: true,

  getLines(): GameLogLine[] {
    return _lines.slice();
  },

  subscribe(fn: () => void): () => void {
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
    };
  },

  clear(): void {
    _lines.length = 0;
    _listeners.forEach((f) => {
      try {
        f();
      } catch {
        /* ignore */
      }
    });
  },

  log(...args: unknown[]): void {
    pushLine("log", formatArgs(args));
  },
  info(...args: unknown[]): void {
    pushLine("info", formatArgs(args));
  },
  debug(...args: unknown[]): void {
    pushLine("debug", formatArgs(args));
  },
  warn(...args: unknown[]): void {
    pushLine("warn", formatArgs(args));
  },
  error(...args: unknown[]): void {
    pushLine("error", formatArgs(args));
  },
};

if (typeof window !== "undefined") {
  (window as Window & { GameLog?: typeof gameLog }).GameLog = gameLog;
}
