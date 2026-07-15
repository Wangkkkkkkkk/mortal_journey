/**
 * @fileoverview 与 mortal_journey GameLog 行为接近的轻量日志：内存环形缓冲 + 控制台输出 + Vue 面板订阅。
 */

const MAX_LINES = 500;

export type GameLogLevel = "log" | "info" | "debug" | "warn" | "error";

/** AI 流量方向：out=请求, in=响应, tool=工具调用, error=失败 */
export type AiDirection = "out" | "in" | "tool" | "error";

/** 方向到中文文案的映射（供面板/复制使用）。 */
export const AI_DIRECTION_LABEL: Record<AiDirection, string> = {
  out: "请求",
  in: "响应",
  tool: "工具调用",
  error: "失败",
};

export interface GameLogLine {
  level: string;
  time: string;
  text: string;
  /** 结构化分类（如「剧情生成」「状态更新·主角」「图片生成」）。非 AI 行为 undefined。 */
  category?: string;
  /** AI 流量方向。非 AI 行为 undefined。 */
  direction?: AiDirection;
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

function pushLine(level: string, message: string, meta?: { category?: string; direction?: AiDirection }): void {
  const time = nowTimeStr();
  const safeLevel = String(level || "log").toLowerCase();
  const row: GameLogLine = { level: safeLevel, time, text: message };
  if (meta && meta.category != null) {
    row.category = meta.category;
    row.direction = meta.direction;
  }
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

/** 方向对应的箭头符号（用于控制台前缀可读性）。 */
const AI_DIRECTION_ARROW: Record<AiDirection, string> = {
  out: "→",
  in: "←",
  tool: "←",
  error: "!",
};

export const gameLog = {
  maxLines: MAX_LINES,

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
  /**
   * 记录一条 AI 流量日志（请求/响应/工具调用/失败）。
   * 控制台输出形如 `[剧情生成 →] …`，面板可据 category/direction 渲染彩色徽章。
   */
  ai(category: string, direction: AiDirection, message: string): void {
    const arrow = AI_DIRECTION_ARROW[direction] ?? "?";
    const prefix = `[${category} ${arrow}]`;
    pushLine("info", `${prefix} ${message}`, { category, direction });
  },
};

if (typeof window !== "undefined") {
  (window as Window & { GameLog?: typeof gameLog }).GameLog = gameLog;
}
