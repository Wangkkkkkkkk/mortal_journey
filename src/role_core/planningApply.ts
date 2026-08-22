/**
 * 规划分析输出的应用与剧情上下文摘要工具（StoryChatPanel 与开局多链共用）。
 *
 * {@link 应用规划分析输出} 把一次规划分析输出落库：章节状态更新 → 规划池补丁 →
 * 切章（须通过「任务/事件清空门禁」）。
 */

import { storyStore } from "./storyStore";
import { plotPlanStore } from "./plotPlanStore";
import { worldEvolutionStore } from "./worldEvolutionStore";
import type { 规划分析输出 } from "../ai_core/types/planningAnalysis";
import { gameLog } from "../log/gameLog";

/** 应用一次规划分析输出（章节状态 / 规划池 / 切章门禁）。 */
export function 应用规划分析输出(result: 规划分析输出): void {
  if (result.当前章目标) plotPlanStore.设置当前章目标(result.当前章目标);
  if (result.规划更新.length > 0) plotPlanStore.应用规划补丁(result.规划更新);

  const 建议 = result.切章;
  if (建议) {
    if (plotPlanStore.存在未终态任务或事件()) {
      gameLog.warn("[规划分析] 切章门禁未通过：当前章仍存在未终态任务或事件，保持当前章。");
      if (result.当前章节) storyStore.设置当前章节(result.当前章节);
      if (result.下一章预告) storyStore.设置下一章预告(result.下一章预告);
      return;
    }
    if (建议.归档 && 建议.归档.标题) storyStore.追加历史卷宗(建议.归档);
    if (建议.清空规划池) plotPlanStore.清空当前章规划池();
    plotPlanStore.设置换章规则(建议.新换章规则);
    storyStore.切换章节(建议.新章节, 建议.新预告);
    gameLog.info(`[规划分析] 已切章 -> ${建议.新章节.标题 || "（未命名）"}`);
    return;
  }

  if (result.当前章节) storyStore.设置当前章节(result.当前章节);
  if (result.下一章预告) storyStore.设置下一章预告(result.下一章预告);
  if (result.历史卷宗追加 && result.历史卷宗追加.标题) storyStore.追加历史卷宗(result.历史卷宗追加);
}

/** 构建后台世界动态摘要（供规划分析 / 剧情 AI 参考）。 */
export function buildWorldDynamicSummary(): string {
  const ws = worldEvolutionStore.状态.value;
  return [
    ws.活跃NPC列表.length
      ? `活跃NPC：${ws.活跃NPC列表.map((n) => `${n.姓名}（${n.当前行动}）`).join("；")}`
      : "",
    ws.进行中事件.length
      ? `进行中事件：${ws.进行中事件.map((e) => `${e.事件名}（${e.当前进展 || "..."}）`).join("；")}`
      : "",
    ws.待执行事件.length ? `待执行事件：${ws.待执行事件.map((e) => e.事件名).join("、")}` : "",
    ws.世界镜头规划.length ? `世界镜头：${ws.世界镜头规划.map((c) => c.镜头标题).join("、")}` : "",
    ws.江湖史册.length ? `江湖史册：${ws.江湖史册.map((g) => g.标题).join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 构建当前章节状态摘要（供剧情 AI 承接）。 */
export function buildChapterSummary(): string {
  const 章节 = storyStore.章节状态.value;
  const c = 章节.当前章节;
  const p = 章节.下一章预告;
  const lines: string[] = [];
  lines.push(`当前章节：${c.标题 || "（未初始化）"}（${c.推进状态}）`);
  if (c.已完成摘要.length) lines.push(`已完成：${c.已完成摘要.join("；")}`);
  if (c.当前待解问题.length) lines.push(`待解问题：${c.当前待解问题.join("；")}`);
  if (p.标题) lines.push(`下一章预告：${p.标题}`);
  return lines.join("\n");
}

/** 构建当前剧情规划摘要（供剧情 AI 承接）。 */
export function buildPlotPlanSummary(): string {
  const 树 = plotPlanStore.规划树.value;
  const lines: string[] = [];
  if (树.当前章目标.length) lines.push(`当前章目标：${树.当前章目标.join("；")}`);
  if (树.当前章任务.length) {
    lines.push(`当前章任务：${树.当前章任务.map((t) => `${t.标题}（${t.当前状态}）`).join("；")}`);
  }
  if (树.待触发事件.length) {
    lines.push(`待触发事件：${树.待触发事件.map((e) => `${e.事件名}（${e.当前状态}）`).join("；")}`);
  }
  if (树.镜头规划.length) {
    lines.push(`镜头规划：${树.镜头规划.map((s) => `${s.镜头标题}（${s.当前状态}）`).join("；")}`);
  }
  return lines.join("\n");
}
