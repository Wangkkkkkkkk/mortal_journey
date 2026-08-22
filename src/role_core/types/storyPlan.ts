/**
 * 剧情推进领域类型：章节状态（对应 MoRanJiangHu 的 `剧情.*`）+ 剧情规划树（对应 `剧情规划.*`）。
 * 移植自 MoRanJiangHu 的 models/story.ts + models/storyPlan.ts（不含同人模式 / 女主规划部分）。
 */

export type 章节推进状态 = "未开始" | "推进中" | "已完成";

export interface 当前章节结构 {
  标题: string;
  推进状态: 章节推进状态;
  /** 本章已经完成并坐实的事项。 */
  已完成摘要: string[];
  /** 本章仍需解答的问题（未收束项）。 */
  当前待解问题: string[];
  /** 切章后需要沉淀的要点。 */
  切章后沉淀要点: string[];
}

export interface 下一章预告结构 {
  标题: string;
  大纲: string[];
  进入条件: string[];
  风险提示: string[];
}

export interface 历史章节结构 {
  标题: string;
  章节总结: string[];
  延续事项: string[];
  关系变化: string[];
  势力变化: string[];
  地点变化: string[];
  资源变化: string[];
  记录时间: string;
}

export interface 章节系统状态 {
  当前章节: 当前章节结构;
  下一章预告: 下一章预告结构;
  历史卷宗: 历史章节结构[];
}

export function 创建空章节系统状态(): 章节系统状态 {
  return {
    当前章节: { 标题: "", 推进状态: "未开始", 已完成摘要: [], 当前待解问题: [], 切章后沉淀要点: [] },
    下一章预告: { 标题: "", 大纲: [], 进入条件: [], 风险提示: [] },
    历史卷宗: [],
  };
}

// ── 剧情规划树（未来执行项池）───────────────────────────────────────────────

export interface 剧情任务结构 {
  /** 稳定标识，如 `T001`。规划分析链路按此 create/replace/delete。 */
  id: string;
  标题: string;
  任务说明: string;
  计划执行时间: string;
  前置条件: string[];
  触发条件: string[];
  阻断条件: string[];
  执行动作: string[];
  完成判定: string[];
  失败后转移: string[];
  完成后沉淀: string[];
  关联人物: string[];
  关联地点: string[];
  /** 终态：已完成 / 已结算 / 已失效 / 已过期 / 已取消 / 已迁移；未终态：未触发 / 推进中 / 待结算 等。 */
  当前状态: string;
}

export interface 剧情延续事项结构 {
  id: string;
  标题: string;
  延续原因: string[];
  当前状态: string[];
  延续到何时: string;
  后续接续条件: string[];
  终止条件: string[];
}

export interface 剧情待触发事件结构 {
  id: string;
  事件名: string;
  /** 事件说明（同人模式强制，原创也建议补齐）。 */
  事件说明: string;
  计划触发时间: string;
  最早触发时间: string;
  最晚触发时间: string;
  前置条件: string[];
  触发条件: string[];
  阻断条件: string[];
  成功结果: string[];
  失败结果: string[];
  当前状态: string;
}

export interface 剧情镜头结构 {
  id: string;
  镜头标题: string;
  镜头内容: string;
  触发时间: string;
  前置条件: string[];
  触发条件: string[];
  阻断条件: string[];
  关联人物: string[];
  关联地点: string[];
  沉淀内容: string[];
  当前状态: string;
}

export interface 剧情换章规则结构 {
  本章完成判定: string[];
  允许切章条件: string[];
  禁止切章条件: string[];
  切章后需沉淀内容: string[];
}

export interface 剧情规划树 {
  当前章目标: string[];
  当前章任务: 剧情任务结构[];
  跨章延续事项: 剧情延续事项结构[];
  待触发事件: 剧情待触发事件结构[];
  镜头规划: 剧情镜头结构[];
  换章规则: 剧情换章规则结构;
}

export function 创建空剧情规划树(): 剧情规划树 {
  return {
    当前章目标: [],
    当前章任务: [],
    跨章延续事项: [],
    待触发事件: [],
    镜头规划: [],
    换章规则: { 本章完成判定: [], 允许切章条件: [], 禁止切章条件: [], 切章后需沉淀内容: [] },
  };
}
