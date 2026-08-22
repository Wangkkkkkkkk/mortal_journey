/**
 * 剧情规划树单例：承载「未来执行项」——当前章目标 / 当前章任务 / 跨章延续事项 /
 * 待触发事件 / 镜头规划 / 换章规则。对应 MoRanJiangHu 的 `剧情规划.*`。
 *
 * 章节状态（当前章节 / 下一章预告 / 历史卷宗）在 storyStore 中维护；
 * 本 store 只负责规划池，规划分析链路的补丁操作经 {@link 应用规划补丁} 落库。
 * 序列化随存档一并写入（见 gameSave.ts）。
 */

import { ref } from "vue";
import {
  创建空剧情规划树,
  type 剧情规划树,
  type 剧情任务结构,
  type 剧情待触发事件结构,
  type 剧情镜头结构,
  type 剧情延续事项结构,
} from "./types/storyPlan";
import type { 规划更新操作, 规划目标类型 } from "../ai_core/types/planningAnalysis";
import { gameLog } from "../log/gameLog";

/** 可序列化的规划树载荷（存档分量）。 */
export interface PlotPlanSerialData {
  规划树: 剧情规划树;
}

const 规划树 = ref<剧情规划树>(创建空剧情规划树());

type 规划条目联合 = 剧情任务结构 | 剧情待触发事件结构 | 剧情镜头结构 | 剧情延续事项结构;

function 取列表(kind: 规划目标类型): Array<规划条目联合> {
  const t = 规划树.value;
  switch (kind) {
    case "task":
      return t.当前章任务;
    case "event":
      return t.待触发事件;
    case "camera":
      return t.镜头规划;
    case "continuation":
      return t.跨章延续事项;
    default:
      return [];
  }
}

export function usePlotPlanStore() {
  /** 应用规划分析输出中的补丁操作（create/replace/delete）。 */
  function 应用规划补丁(ops: 规划更新操作[]): void {
    for (const op of ops) {
      const list = 取列表(op.目标);
      const id = String(op.id || ((op.条目 as 规划条目联合 | undefined)?.id) || "").trim();
      if (op.操作 === "delete") {
        if (!id) continue;
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list.splice(i, 1);
        continue;
      }
      const item = op.条目;
      if (!item || typeof item !== "object") continue;
      const itemId = String((item as 规划条目联合).id || "").trim();
      const key = itemId || id;
      if (key) {
        const i = list.findIndex((x) => x.id === key);
        if (i >= 0) {
          list[i] = item as 规划条目联合;
        } else {
          list.push(item as 规划条目联合);
        }
      } else if (op.操作 === "create") {
        list.push(item as 规划条目联合);
      }
    }
  }

  /** 整体替换当前章目标。 */
  function 设置当前章目标(目标: string[]): void {
    规划树.value.当前章目标 = (Array.isArray(目标) ? 目标 : []).map((s) => String(s || "").trim()).filter(Boolean);
  }

  /** 整体替换换章规则。 */
  function 设置换章规则(规则: 剧情规划树["换章规则"] | undefined): void {
    if (规则 && typeof 规则 === "object") {
      规划树.value.换章规则 = 规则;
    }
  }

  /** 切章后清空当前章专属规划池（任务/事件/镜头；跨章延续事项默认保留）。 */
  function 清空当前章规划池(): void {
    const t = 规划树.value;
    t.当前章任务 = [];
    t.待触发事件 = [];
    t.镜头规划 = [];
    t.当前章目标 = [];
    gameLog.info("[规划] 已清空当前章规划池（任务/事件/镜头/目标）。");
  }

  /** 当前章是否存在未进入终态的任务或事件（切章门禁之一）。 */
  function 存在未终态任务或事件(): boolean {
    const 终态 = new Set(["已完成", "已结算", "已失效", "已过期", "已取消", "已迁移"]);
    const t = 规划树.value;
    const 未终态 = (列表: Array<{ 当前状态?: string }>): boolean =>
      列表.some((x) => !终态.has(String(x.当前状态 || "").trim()));
    return 未终态(t.当前章任务) || 未终态(t.待触发事件);
  }

  function serialize(): PlotPlanSerialData {
    return {
      规划树: JSON.parse(JSON.stringify(规划树.value)),
    };
  }

  function restore(data: PlotPlanSerialData | null | undefined): void {
    规划树.value = data?.规划树
      ? JSON.parse(JSON.stringify(data.规划树))
      : 创建空剧情规划树();
  }

  function clear(): void {
    规划树.value = 创建空剧情规划树();
  }

  return {
    规划树,
    应用规划补丁,
    设置当前章目标,
    设置换章规则,
    清空当前章规划池,
    存在未终态任务或事件,
    serialize,
    restore,
    clear,
  };
}

export const plotPlanStore = usePlotPlanStore();
