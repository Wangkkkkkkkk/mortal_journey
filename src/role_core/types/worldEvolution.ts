/**
 * 世界演变领域类型：后台世界（镜头外）的持续运转状态。
 * 对应 MoRanJiangHu 的 `世界.*`（活跃NPC / 待执行事件 / 进行中事件 / 已结算事件 /
 * 世界镜头规划 / 江湖史册），不含同人相关字段。
 */

export interface 后台NPC条目 {
  姓名: string;
  所属势力: string;
  /** 四级地点字符串（region-country-area-detail）。 */
  当前位置: string;
  /** 后台状态；在场打断语义写 `[打断]当前在场`。 */
  当前状态: string;
  /** 单条可执行动作（不得留空）。 */
  当前行动: string;
  行动开始时间: string;
  行动结束时间: string;
}

export interface 世界事件条目 {
  /** 稳定标识，如 `WE001`。 */
  id: string;
  事件名: string;
  事件说明: string;
  计划触发时间: string;
  最早触发时间: string;
  最晚触发时间: string;
  前置条件: string[];
  /** 进行中事件：单条当前摘要（不累积历史日志）。 */
  当前进展: string;
   /** 已结算事件：事件结果。 */
  事件结果: string;
  /** 已结算事件：长期影响（决定是否进入江湖史册）。 */
  长期影响: string;
  当前状态: string;
}

export interface 世界镜头条目 {
  镜头标题: string;
  镜头内容: string;
  触发时间: string;
  触发条件: string[];
  关联人物: string[];
  关联地点: string[];
  沉淀内容: string[];
  当前状态: string;
}

export interface 江湖史册条目 {
  标题: string;
  内容: string;
  记录时间: string;
}

export interface 世界演变状态 {
  活跃NPC列表: 后台NPC条目[];
  待执行事件: 世界事件条目[];
  进行中事件: 世界事件条目[];
  已结算事件: 世界事件条目[];
  世界镜头规划: 世界镜头条目[];
  江湖史册: 江湖史册条目[];
}

export function 创建空世界演变状态(): 世界演变状态 {
  return {
    活跃NPC列表: [],
    待执行事件: [],
    进行中事件: [],
    已结算事件: [],
    世界镜头规划: [],
    江湖史册: [],
  };
}

/** 世界演变条数维护常量（对齐 MoRanJiangHu 世界演变引擎的常态/峰值）。 */
export const 活跃NPC常态条数 = 7;
export const 活跃NPC峰值条数 = 9;
export const 进行中事件常态条数 = 5;
export const 进行中事件峰值条数 = 7;
export const 已结算事件常态条数 = 4;
export const 已结算事件峰值条数 = 6;
