/**
 * Pipeline: 规划分析（planningAnalysis）
 *
 * 每回合在主剧情 + 状态 + 世界演变之后调用：输入章节状态、规划树、世界动态摘要、本回合正文
 * 与剧情规划摘要，输出规划树最小补丁（task/event/camera/continuation 的 create/replace/delete）
 * 与可选的切章建议。切章建议必须由调用方通过「任务/事件清空门禁」校验后才应用。
 *
 * 移植自 MoRanJiangHu 的规划分析链路（仅原创模式）。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { PLANNING_ANALYSIS_SYSTEM_PRESET } from "../presets/planningAnalysisPreset";
import { extractTagContent, MJ_PLAN_ANALYSIS_OPEN, MJ_PLAN_ANALYSIS_CLOSE } from "../shared/tagSpec";
import { safeJsonParse } from "../shared/parseJson";
import { block } from "../shared/promptBlock";
import type { 章节系统状态, 剧情规划树 } from "../../role_core/types/storyPlan";
import type {
  规划分析输出,
  规划更新操作,
  切章建议,
} from "../types/planningAnalysis";

export interface PlanningAnalysisInput extends AiRequestConfig {
  章节状态: 章节系统状态;
  规划树: 剧情规划树;
  /** 世界动态摘要（活跃NPC行动 / 事件池 / 镜头）。 */
  世界动态摘要: string;
  /** 本回合正文。 */
  本回合正文: string;
  /** 本回合 `<剧情规划>` 摘要（story AI 的软性承接摘要）。 */
  本回合剧情规划: string;
  /** 玩家本轮输入。 */
  玩家输入: string;
  当前时间: string;
  /** 第0回合开局后的首次规划初始化模式：从开局正文初始化章节定位与规划树。 */
  initMode?: boolean;
}

// ── 分节 ──

function 格式化章节(章节: 章节系统状态): string {
  const c = 章节.当前章节;
  const p = 章节.下一章预告;
  const lines: string[] = [];
  lines.push(`当前章节：${c.标题 || "（未初始化）"}（${c.推进状态}）`);
  if (c.已完成摘要.length) lines.push(`已完成摘要：${c.已完成摘要.join("；")}`);
  if (c.当前待解问题.length) lines.push(`当前待解问题：${c.当前待解问题.join("；")}`);
  if (c.切章后沉淀要点.length) lines.push(`切章后沉淀要点：${c.切章后沉淀要点.join("；")}`);
  if (p.标题) {
    lines.push(`下一章预告：${p.标题}`);
    if (p.进入条件.length) lines.push(`下一章进入条件：${p.进入条件.join("；")}`);
  }
  if (章节.历史卷宗.length) {
    lines.push(`历史卷宗（${章节.历史卷宗.length} 章）：${章节.历史卷宗.map((h) => h.标题).join("、")}`);
  }
  return lines.join("\n");
}

function 格式化规划树(树: 剧情规划树): string {
  const lines: string[] = [];
  if (树.当前章目标.length) lines.push(`当前章目标：${树.当前章目标.join("；")}`);
  if (树.当前章任务.length) {
    lines.push(
      `当前章任务：${树.当前章任务
        .map((t) => `${t.标题}（${t.当前状态}${t.计划执行时间 ? `，${t.计划执行时间}` : ""}）`)
        .join("；")}`,
    );
  }
  if (树.待触发事件.length) {
    lines.push(
      `待触发事件：${树.待触发事件
        .map((e) => `${e.事件名}（${e.当前状态}，最早${e.最早触发时间 || "?"}，最晚${e.最晚触发时间 || "?"}）`)
        .join("；")}`,
    );
  }
  if (树.镜头规划.length) {
    lines.push(`镜头规划：${树.镜头规划.map((s) => `${s.镜头标题}（${s.当前状态}）`).join("；")}`);
  }
  if (树.跨章延续事项.length) {
    lines.push(`跨章延续事项：${树.跨章延续事项.map((l) => l.标题).join("；")}`);
  }
  const r = 树.换章规则;
  if (r.本章完成判定.length) lines.push(`本章完成判定：${r.本章完成判定.join("；")}`);
  if (lines.length === 0) return "（规划树为空）";
  return lines.join("\n");
}

function 构建用户内容(input: PlanningAnalysisInput): string {
  const initBlock = input.initMode
    ? [
        "【初始化模式·第0回合开局规划初始化】",
        "- 这是第0回合开局完成后的首次规划初始化，不是普通回合后的维护。",
        "- 请基于【本回合正文】与当前状态，建立第1回合即可运行的章节定位与规划树：",
        "- 初始化当前章节（标题/已完成摘要/当前待解问题/切章后沉淀要点）与下一章预告（标题/大纲/进入条件/风险提示）。",
        "- 建立当前章目标、当前章任务、待触发事件、镜头规划与换章规则的最小完整结构；只建当前章近期承接，不空写远期大纲，没有证据就保持空。",
        "- 本回合禁止输出【切章】建议。",
      ].join("\n")
    : "";
  return [
    block("【当前章节状态】", 格式化章节(input.章节状态)),
    block("【当前剧情规划树】", 格式化规划树(input.规划树)),
    block("【当前世界动态摘要】", input.世界动态摘要),
    block("【当前游戏时间】", input.当前时间),
    block("【玩家本轮输入】", input.玩家输入),
    block("【本回合正文】", input.本回合正文),
    block("【本回合剧情规划摘要】", input.本回合剧情规划 || "无"),
    initBlock,
    "",
    input.initMode
      ? "任务：根据第0回合已落成的开局正文与当前状态，初始化章节定位与规划树，只输出最小补丁 JSON。禁止续写正文。"
      : "任务：基于上述事实统一分析章节状态与规划树是否需要修订、清理、迁移、补承接或切章，只输出最小补丁 JSON。",
  ].join("\n");
}

// ── 解析与净化 ──

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((x) => s(x)).filter(Boolean)
    : [];
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function 净化当前章节(v: unknown): NonNullable<规划分析输出["当前章节"]> {
  const o = obj(v);
  return {
    标题: s(o?.标题),
    推进状态: (["未开始", "推进中", "已完成"] as const).includes(s(o?.推进状态) as never)
      ? (s(o?.推进状态) as "未开始" | "推进中" | "已完成")
      : "推进中",
    已完成摘要: sArr(o?.已完成摘要),
    当前待解问题: sArr(o?.当前待解问题),
    切章后沉淀要点: sArr(o?.切章后沉淀要点),
  };
}

function 净化下一章预告(v: unknown): NonNullable<规划分析输出["下一章预告"]> {
  const o = obj(v);
  return {
    标题: s(o?.标题),
    大纲: sArr(o?.大纲),
    进入条件: sArr(o?.进入条件),
    风险提示: sArr(o?.风险提示),
  };
}

function 净化历史章节(v: unknown): NonNullable<规划分析输出["历史卷宗追加"]> {
  const o = obj(v);
  return {
    标题: s(o?.标题),
    章节总结: sArr(o?.章节总结),
    延续事项: sArr(o?.延续事项),
    关系变化: sArr(o?.关系变化),
    势力变化: sArr(o?.势力变化),
    地点变化: sArr(o?.地点变化),
    资源变化: sArr(o?.资源变化),
    记录时间: s(o?.记录时间),
  };
}

function 净化换章规则(v: unknown): NonNullable<切章建议>["新换章规则"] {
  const o = obj(v);
  return {
    本章完成判定: sArr(o?.本章完成判定),
    允许切章条件: sArr(o?.允许切章条件),
    禁止切章条件: sArr(o?.禁止切章条件),
    切章后需沉淀内容: sArr(o?.切章后需沉淀内容),
  };
}

function 净化切章建议(v: unknown): 切章建议 | null {
  const o = obj(v);
  if (!o) return null;
  const 新章节 = 净化当前章节(o.新章节);
  if (!新章节.标题) return null;
  return {
    新章节,
    新预告: 净化下一章预告(o.新预告),
    新换章规则: 净化换章规则(o.新换章规则),
    归档: 净化历史章节(o.归档),
    清空规划池: o.清空规划池 === true,
  };
}

function 净化任务条目(v: unknown): NonNullable<规划更新操作["条目"]> | null {
  const o = obj(v);
  if (!o) return null;
  return {
    id: s(o.id),
    标题: s(o.标题),
    任务说明: s(o.任务说明),
    计划执行时间: s(o.计划执行时间),
    前置条件: sArr(o.前置条件),
    触发条件: sArr(o.触发条件),
    阻断条件: sArr(o.阻断条件),
    执行动作: sArr(o.执行动作),
    完成判定: sArr(o.完成判定),
    失败后转移: sArr(o.失败后转移),
    完成后沉淀: sArr(o.完成后沉淀),
    关联人物: sArr(o.关联人物),
    关联地点: sArr(o.关联地点),
    当前状态: s(o.当前状态),
  };
}

function 净化事件条目(v: unknown): NonNullable<规划更新操作["条目"]> | null {
  const o = obj(v);
  if (!o) return null;
  return {
    id: s(o.id),
    事件名: s(o.事件名),
    事件说明: s(o.事件说明),
    计划触发时间: s(o.计划触发时间),
    最早触发时间: s(o.最早触发时间),
    最晚触发时间: s(o.最晚触发时间),
    前置条件: sArr(o.前置条件),
    触发条件: sArr(o.触发条件),
    阻断条件: sArr(o.阻断条件),
    成功结果: sArr(o.成功结果),
    失败结果: sArr(o.失败结果),
    当前状态: s(o.当前状态),
  };
}

function 净化镜头条目(v: unknown): NonNullable<规划更新操作["条目"]> | null {
  const o = obj(v);
  if (!o) return null;
  return {
    id: s(o.id),
    镜头标题: s(o.镜头标题),
    镜头内容: s(o.镜头内容),
    触发时间: s(o.触发时间),
    前置条件: sArr(o.前置条件),
    触发条件: sArr(o.触发条件),
    阻断条件: sArr(o.阻断条件),
    关联人物: sArr(o.关联人物),
    关联地点: sArr(o.关联地点),
    沉淀内容: sArr(o.沉淀内容),
    当前状态: s(o.当前状态),
  };
}

function 净化延续条目(v: unknown): NonNullable<规划更新操作["条目"]> | null {
  const o = obj(v);
  if (!o) return null;
  return {
    id: s(o.id),
    标题: s(o.标题),
    延续原因: sArr(o.延续原因),
    当前状态: sArr(o.当前状态),
    延续到何时: s(o.延续到何时),
    后续接续条件: sArr(o.后续接续条件),
    终止条件: sArr(o.终止条件),
  };
}

function 净化规划更新(arr: unknown): 规划更新操作[] {
  const out: 规划更新操作[] = [];
  for (const e of Array.isArray(arr) ? arr : []) {
    const o = obj(e);
    if (!o) continue;
    const 目标 = s(o.目标);
    if (!["task", "event", "camera", "continuation"].includes(目标)) continue;
    const 操作 = s(o.操作);
    if (!["create", "replace", "delete"].includes(操作)) continue;
    const 条目 = o.条目 == null
      ? null
      : 目标 === "task"
        ? 净化任务条目(o.条目)
        : 目标 === "event"
          ? 净化事件条目(o.条目)
          : 目标 === "camera"
            ? 净化镜头条目(o.条目)
            : 净化延续条目(o.条目);
    if (操作 !== "delete" && !条目) continue;
    out.push({
      目标: 目标 as 规划更新操作["目标"],
      操作: 操作 as 规划更新操作["操作"],
      id: s(o.id) || (条目 as { id?: string } | null)?.id || undefined,
      条目: 条目 ?? undefined,
    });
  }
  return out;
}

export function parsePlanningAnalysis(raw: string): 规划分析输出 {
  const text = extractTagContent(raw, MJ_PLAN_ANALYSIS_OPEN, MJ_PLAN_ANALYSIS_CLOSE);
  const data = safeJsonParse<unknown>(text, null);
  const o = obj(data) ?? {};
  return {
    thinking: extractTagContent(raw, "<thinking>", "</thinking>"),
    当前章节: o.当前章节 == null ? null : 净化当前章节(o.当前章节),
    下一章预告: o.下一章预告 == null ? null : 净化下一章预告(o.下一章预告),
    历史卷宗追加: o.历史卷宗追加 == null ? null : 净化历史章节(o.历史卷宗追加),
    切章: o.切章 == null ? null : 净化切章建议(o.切章),
    当前章目标: Array.isArray(o.当前章目标) ? sArr(o.当前章目标) : null,
    规划更新: 净化规划更新(o.规划更新),
  };
}

export async function generatePlanningAnalysis(input: PlanningAnalysisInput): Promise<规划分析输出> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.3,
    defaultMaxTokens: 4096,
    system: PLANNING_ANALYSIS_SYSTEM_PRESET,
    user: 构建用户内容(input),
    logTag: "规划分析",
  };
  const result = await runPipeline(input, opts, callChatCompletions);
  return parsePlanningAnalysis(result.raw);
}
