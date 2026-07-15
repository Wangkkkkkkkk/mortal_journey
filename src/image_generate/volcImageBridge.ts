/**
 * @fileoverview 火山引擎方舟 Ark 文生图 HTTP 客户端（OpenAI 兼容）。
 *
 * 同步接口：一次 `POST ${baseUrl}/images/generations` 直接返回 base64 图片。
 * 与 {@link ../ai/openAiChatBridge.ts} 的 fetch + Promise.race 超时模式一致。
 *
 * 注意：与聊天桥接不同，这里**不**自动补 `/v1`——Ark 自带 `/api/v3`，
 * 且用户可能填代理根路径，故只在末尾追加 `/images/generations`。
 */

import { gameLog } from "../log/gameLog";
import { safeJsonParse } from "../ai_core/shared/parseJson";
import { IMAGE_GEN_TIMEOUT_MS } from "./types";

/**
 * 规范化 base URL：去尾部斜杠与多余 query/fragment，**不**补 `/v1`。
 *
 * 若用户误填了完整端点（末尾含 `/images/generations`），也剥离掉，避免路径重复。
 *
 * @param url 用户配置的中转或 Ark 根地址（可为 base 或完整端点）。
 */
function normalizeBase(url: string): string {
  let clean = String(url || "")
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  // 容错：用户可能误填完整端点，剥离末尾的 /images/generations（及中间多余斜杠）。
  clean = clean.replace(/\/images\/generations$/i, "");
  return clean;
}

/**
 * 把用户配置的 base URL 解析为最终请求 URL（含 `/images/generations`）。
 *
 * **dev 模式下**：若 base 指向 Ark 官方域名，自动改走 Vite dev proxy（`/ark-api`），
 * 规避浏览器 CORS（Ark 不发 CORS 头，浏览器直连必被拦）。Vite dev server 转发到 Ark。
 *
 * **生产模式**：base 原样使用，用户需自行填一个加过 CORS 头的代理地址。
 *
 * @param baseUrl 用户配置的地址。
 * @return 完整端点 URL（含 `/images/generations`）。
 */
function resolveEndpoint(baseUrl: string): string {
  const base = normalizeBase(baseUrl);
  if (!base) return "";
  let effective = base;
  if (import.meta.env.DEV && /(^|\.)ark\.cn-beijing\.volces\.com(:\d+)?(\/|$)/i.test(base)) {
    // dev 下把 Ark 官方地址替换为 Vite dev proxy 路径，保留其后路径（如 /api/v3）。
    effective = base.replace(/^https?:\/\/[^/]+/i, "/ark-api");
  }
  return `${effective}/images/generations`;
}

/** 单次同步生成的请求参数。 */
export interface GenerateImageParams {
  /** 中转或 Ark 根地址（如 `https://ark.cn-beijing.volces.com/api/v3`）。 */
  baseUrl: string;
  /** Ark API Key（Bearer 鉴权）。 */
  apiKey: string;
  /** 模型 ID / Endpoint ID。 */
  model: string;
  /** 文生图提示词。 */
  prompt: string;
  /** 目标尺寸，如 `1664x2496`。 */
  size: string;
  /** 可选中断信号。 */
  signal?: AbortSignal;
}

/**
 * 同步生成一张图：POST `${baseUrl}/images/generations`，返回 `data:image/jpeg;base64,...` dataURL。
 *
 * 固定 `response_format:"b64_json"`（直拿 base64，规避 CDN URL 的 CORS 导致 canvas 被污染）、
 * `watermark:false`（不要「AI生成」水印）、`sequential_image_generation:"disabled"`（强制单图）。
 *
 * @throws {Error} 中转 HTTP 非 2xx、Ark 返回 `error`、或超时。
 */
export async function generateImageSync(params: GenerateImageParams): Promise<string> {
  const url = resolveEndpoint(params.baseUrl);
  if (!url) throw new Error("文生图地址未配置。");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tk = String(params.apiKey || "").trim();
  if (tk) headers.Authorization = `Bearer ${tk}`;
  else throw new Error("文生图 API Key 未配置。");

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    response_format: "b64_json",
    watermark: false,
    sequential_image_generation: "disabled",
  };

  gameLog.ai("图片生成", "out", `${params.model} size=${params.size} prompt: ${params.prompt}`);

  const data = await Promise.race([
    (async () => {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: params.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        gameLog.ai("图片生成", "error", `HTTP ${res.status} prompt: ${params.prompt}`);
        const hint =
          res.status === 401 || res.status === 403
            ? "\n\n提示：API Key 无权限或填错，请检查「API设置」中的文生图 API Key 与模型。"
            : "";
        throw new Error(`文生图请求失败 (${res.status}): ${text || "unknown error"}${hint}`);
      }
      const text = await res.text();
      return safeJsonParse<unknown>(text, null);
    })(),
    new Promise<never>((_, rej) =>
      setTimeout(
        () => rej(new Error(`文生图在 ${Math.round(IMAGE_GEN_TIMEOUT_MS / 1000)}s 内未完成。`)),
        IMAGE_GEN_TIMEOUT_MS,
      ),
    ),
  ]);

  if (!data || typeof data !== "object") {
    throw new Error("文生图响应格式异常。");
  }
  const d = data as {
    data?: unknown;
    error?: { code?: unknown; message?: unknown };
  };

  // 顶层 error（整请求失败）
  if (d.error && typeof d.error === "object") {
    const msg = d.error.message != null ? String(d.error.message) : "生成失败";
    const code = d.error.code != null ? String(d.error.code) : "?";
    gameLog.ai("图片生成", "error", `code=${code} msg=${msg} prompt: ${params.prompt}`);
    throw new Error(`${msg}（code=${code}）`);
  }

  // 取 data[0].b64_json
  if (!Array.isArray(d.data) || d.data.length === 0) {
    throw new Error("文生图未返回图片数据。");
  }
  const first = (d.data as Array<Record<string, unknown>>)[0];
  const b64 = first && typeof first.b64_json === "string" ? first.b64_json : "";
  if (!b64) {
    throw new Error("文生图未返回 base64 图片（可能 response_format 不被该模型支持）。");
  }

  const dataUrl = b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
  gameLog.ai("图片生成", "in", "done -> base64 dataURL");
  return dataUrl;
}

/**
 * 仅校验 `baseUrl` 可达（配置页「测试」按钮用），不消耗文生图配额。
 *
 * GET 探测 images 端点：任意 HTTP 响应（含 405/404）即视为「可达」，
 * 仅当网络/CORS 失败（fetch reject）才视为「不可达」。
 */
export async function pingReachable(baseUrl: string, apiKey: string): Promise<string> {
  const probeUrl = resolveEndpoint(baseUrl);
  if (!probeUrl) return "请先填写文生图地址。";
  const headers: Record<string, string> = {};
  const tk = String(apiKey || "").trim();
  if (tk) headers.Authorization = `Bearer ${tk}`;

  const started = Date.now();
  try {
    await Promise.race([
      fetch(probeUrl, { method: "GET", headers }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("15s 内未响应")), 15000),
      ),
    ]);
    const ms = Date.now() - started;
    return `测试成功（${(ms / 1000).toFixed(2)}s）：地址可达。`;
  } catch (err: unknown) {
    const ms = Date.now() - started;
    const msg = err instanceof Error ? err.message : "未知错误";
    return `测试失败（${(ms / 1000).toFixed(2)}s）：${msg.slice(0, 240)}`;
  }
}
