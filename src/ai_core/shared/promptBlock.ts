/**
 * Prompt 块组装工具。
 *
 * 供各 pipeline 组装发送给 AI 的 user 消息，统一为「分节函数 + 主组装函数」的构成方式：
 *
 * ```ts
 * function buildXxxUserContent(input): string {
 *   let msg = "";
 *   msg += sceneA(input);   // 第 1 节：xxx
 *   msg += sceneB(input);   // 第 2 节：xxx
 *   return msg;
 * }
 * ```
 *
 * 每个分节函数返回一个"块"（标题行 + 内容 + 结尾空行），内容为空时返回空串，
 * 主组装函数用 `msg +=` 顺序拼接，直观呈现 prompt 的构成顺序。
 */

/** 空内容也强制输出的占位文案。 */
export const PLACEHOLDER_NONE = "（无）";

/**
 * 组装一个标题块。统一格式：
 *
 *   【标题】
 *   内容
 *   （结尾空行）
 *
 * content 为空（trim 后）时返回 ""，便于 `msg +=` 按需跳过该节。
 * 若需要在内容为空时仍保留标题占位，请传入 PLACEHOLDER_NONE 等非空占位。
 */
export function block(title: string, content?: string | null): string {
  const c = (content ?? "").trim();
  if (!c) return "";
  return `${title}\n${c}\n\n`;
}

/**
 * 拼接多条原始行/段落（用于主组装函数末尾追加指令、格式提醒等非标题内容）。
 * 每条非空，末尾补一个空行。
 */
export function rawBlock(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return `${t}\n\n`;
}

/**
 * 把若干块拼成最终消息（自动丢弃空块；块自带结尾空行，故直接连接）。
 */
export function composeBlocks(...blocks: Array<string | null | undefined>): string {
  return blocks.filter((b) => b && b.trim()).join("");
}
